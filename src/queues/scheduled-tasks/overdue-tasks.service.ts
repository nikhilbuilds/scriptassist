import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TasksService } from '@modules/tasks/tasks.service';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  private BATCH_SIZE = 100;

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private tasksService: TasksService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');
    const { tasks: overdueTasks, metaData } = await this.tasksService.findOverdueTasks({
      limit: this.BATCH_SIZE,
      page: 1,
    });

    this.logger.log(`Found ${metaData.total} overdue tasks`);

    this.taskQueue.add('overdue-tasks-notification', {
      tasks: overdueTasks,
    });

    for (let page = 2; page <= metaData.totalPages; page++) {
      const { tasks } = await this.tasksService.findOverdueTasks({
        limit: this.BATCH_SIZE,
        page: page,
      });

      this.taskQueue.add(
        'overdue-tasks-notification',
        {
          tasks,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    }

    this.logger.debug('Overdue tasks check completed');
  }
}
