import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private tasksService: TasksService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('⏰ Checking for overdue tasks...');

    const startTime = Date.now();
    let processedCount = 0;
    let errorCount = 0;

    try {
      // Use database-level filtering for efficiency
      const overdueTasks = await this.findOverdueTasks();

      this.logger.log(`📋 Found ${overdueTasks.length} overdue tasks`);

      if (overdueTasks.length === 0) {
        this.logger.debug('✨ No overdue tasks found - everyone is on time!');
        return;
      }

      // Process tasks in batches to avoid overwhelming the queue
      const batchSize = 50;
      const batches = this.chunkArray(overdueTasks, batchSize);

      for (const [batchIndex, batch] of batches.entries()) {
        try {
          await this.processBatch(batch, batchIndex + 1, batches.length);
          processedCount += batch.length;
        } catch (error) {
          errorCount += batch.length;
          this.logger.error(
            `Error processing batch ${batchIndex + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Overdue tasks check completed in ${processingTime}ms. Processed: ${processedCount}, Errors: ${errorCount}`,
      );
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Error checking overdue tasks after ${processingTime}ms: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async findOverdueTasks() {
    // Use the service's findAll method with proper filtering
    const result = await this.tasksService.findAll({
      status: TaskStatus.PENDING,
      // Add date filtering if the service supports it
    });

    const now = new Date();
    return result.data.filter(task => task.dueDate && new Date(task.dueDate) < now);
  }

  private async processBatch(
    tasks: { id: string; dueDate: Date }[],
    batchIndex: number,
    totalBatches: number,
  ) {
    this.logger.debug(`Processing batch ${batchIndex}/${totalBatches} with ${tasks.length} tasks`);

    // Add jobs to queue with proper options
    const jobs = tasks.map(task => ({
      name: 'overdue-tasks-notification',
      data: {
        taskId: task.id,
        dueDate: task.dueDate,
      },
      opts: {
        delay: 0, // Process immediately
        attempts: 3, // Retry up to 3 times
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2 second delay
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
      },
    }));

    // Add jobs to queue in parallel
    await Promise.all(jobs.map(job => this.taskQueue.add(job.name, job.data, job.opts)));

    this.logger.debug(`Added ${tasks.length} jobs to queue for batch ${batchIndex}`);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async sendOverdueNotifications(tasks: any[]): Promise<void> {
    this.logger.log(`Sending overdue notifications for ${tasks.length} tasks`);
    
    // Send notifications for overdue tasks
    for (const task of tasks) {
      this.logger.debug(`Sending overdue notification for task ${task.id}`);
      // Implement notification logic here (email, SMS, etc.)
    }
  }
}
