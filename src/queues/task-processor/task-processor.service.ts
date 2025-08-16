import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '@modules/tasks/enums/task-status.enum';

@Injectable()
@Processor('task-processing', { concurrency: 3 })
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    try {
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);
        case 'overdue-tasks-notification':
          return await this.handleOverdueTasks(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error) {
      // Retires are handled by BullMQ
      this.logger.error(
        `Error processing job ${job.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;

    if (!taskId || !status) {
      return { success: false, error: 'Missing required data' };
    }

    if (!Object.values(TaskStatus).includes(status)) {
      return { success: false, error: 'Missing required data' };
    }

    const { message } = await this.tasksService.updateStatus(taskId, status);

    if (message === 'Task Not Found') {
      return {
        success: false,
        error: message,
      };
    }

    return {
      success: true,
      taskId,
      newStatus: status,
    };
  }

  private async handleOverdueTasks(job: Job) {
    this.logger.debug('Processing overdue tasks notification');
    const { tasks } = job.data;

    if (!tasks || tasks.length === 0) {
      return { success: false, error: 'No overdue tasks to process' };
    }

    // example function
    // await tasks.map(task => this.tasksService.sendNotification(task)) or await this.tasksService.bulkSendNotification(tasks)
    return { success: true, message: 'Overdue tasks processed' };
  }
}
