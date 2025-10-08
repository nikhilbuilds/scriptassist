import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository, Not, In } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  private isProcessing = false;

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    if (this.isProcessing) {
      this.logger.warn('Previous overdue check still running, skipping this execution');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      this.logger.log('🔍 Starting overdue tasks check...');

      const now = new Date();

      const overdueTasks = await this.tasksRepository.find({
        where: {
          dueDate: LessThan(now),
          status: Not(In([TaskStatus.COMPLETED])),
        },
        relations: ['user'],
      });

      if (overdueTasks.length === 0) {
        this.logger.log('✅ No overdue tasks found');
        return;
      }

      this.logger.log(`📋 Found ${overdueTasks.length} overdue tasks`);

      const tasksByStatus = overdueTasks.reduce(
        (acc, task) => {
          acc[task.status] = (acc[task.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      this.logger.log(`📊 Overdue tasks by status: ${JSON.stringify(tasksByStatus)}`);

      const batchSize = 50;
      const batches = this.chunkArray(overdueTasks, batchSize);

      let totalQueued = 0;
      let totalFailed = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const taskIds = batch.map(task => task.id);

        try {
          await this.taskQueue.add(
            'overdue-tasks-notification',
            {
              taskIds,
              batchNumber: i + 1,
              totalBatches: batches.length,
              timestamp: new Date().toISOString(),
            },
            {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 1000,
              },
              removeOnComplete: true,
              removeOnFail: { count: 50 },
            },
          );

          totalQueued += taskIds.length;
          this.logger.debug(`📤 Batch ${i + 1}/${batches.length}: Queued ${taskIds.length} tasks`);
        } catch (error) {
          totalFailed += batch.length;
          this.logger.error(
            `❌ Failed to queue batch ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ Overdue check completed in ${duration}ms | Total: ${overdueTasks.length} | Queued: ${totalQueued} | Failed: ${totalFailed}`,
      );

      // TODO: Update task status or add metadata
      // await this.markTasksAsNotified(overdueTasks.map(t => t.id));
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `❌ Overdue check failed after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      if (error instanceof Error && error.stack) {
        this.logger.debug(`Stack trace: ${error.stack}`);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async checkUpcomingTasks() {
    try {
      this.logger.log('🔔 Checking for upcoming task reminders...');

      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const upcomingTasks = await this.tasksRepository
        .createQueryBuilder('task')
        .where('task.dueDate > :now', { now })
        .andWhere('task.dueDate <= :tomorrow', { tomorrow })
        .andWhere('task.status NOT IN (:...excludeStatuses)', {
          excludeStatuses: [TaskStatus.COMPLETED],
        })
        .getMany();

      if (upcomingTasks.length === 0) {
        this.logger.log('✅ No upcoming tasks requiring reminders');
        return;
      }

      this.logger.log(`📋 Found ${upcomingTasks.length} upcoming tasks`);

      let queued = 0;
      for (const task of upcomingTasks) {
        try {
          await this.taskQueue.add(
            'task-reminder',
            {
              taskId: task.id,
              userId: task.userId,
              dueDate: task.dueDate,
              title: task.title,
            },
            {
              attempts: 2,
              backoff: {
                type: 'fixed',
                delay: 5000,
              },
            },
          );
          queued++;
        } catch (error) {
          this.logger.error(
            `Failed to queue reminder for task ${task.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      this.logger.log(`✅ Queued ${queued} reminder notifications`);
    } catch (error) {
      this.logger.error(
        `❌ Upcoming tasks check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async markTasksAsNotified(taskIds: string[]): Promise<void> {
    //TODO: add a 'lastNotifiedAt' field to track this

    this.logger.debug(`Marked ${taskIds.length} tasks as notified`);
  }
}
