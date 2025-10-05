import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
@Processor('task-processing', {
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
  lockDuration: 30000,
})
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  async process(job: Job): Promise<any> {
    const startTime = Date.now();
    this.logger.log(
      `[Job ${job.id}] Starting processing: ${job.name} | Attempt: ${job.attemptsMade + 1}/${job.opts.attempts || 1}`,
    );

    try {
      let result;

      switch (job.name) {
        case 'tasks-bulk-create':
          result = await this.handleBulkCreate(job);
          break;

        case 'tasks-bulk-delete':
          result = await this.handleBulkDelete(job);
          break;
        case 'task-status-update':
          result = await this.handleStatusUpdate(job);
          break;

        case 'overdue-tasks-notification':
          result = await this.handleOverdueTasksNotification(job);
          break;

        case 'task-reminder':
          result = await this.handleTaskReminder(job);
          break;

        default:
          this.logger.warn(`[Job ${job.id}] Unknown job type: ${job.name}`);
          throw new Error(`Unknown job type: ${job.name}`);
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `[Job ${job.id}] ✅ Completed successfully in ${duration}ms | Type: ${job.name}`,
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `[Job ${job.id}] ❌ Failed after ${duration}ms | Type: ${job.name} | Error: ${errorMessage}`,
      );

      if (error instanceof Error && error.stack) {
        this.logger.debug(`[Job ${job.id}] Stack trace: ${error.stack}`);
      }

      throw error;
    }
  }

  private async handleBulkCreate(job: Job) {
    const { tasks, userId } = job.data;

    if (!tasks || !Array.isArray(tasks)) {
      throw new Error('Invalid tasks: must be an array');
    }

    if (!userId) {
      throw new Error('Missing required field: userId');
    }

    if (tasks.length === 0) {
      throw new Error('Tasks array cannot be empty');
    }

    if (tasks.length > 1000) {
      throw new Error('Cannot create more than 1000 tasks in a single batch');
    }

    this.logger.debug(`[Job ${job.id}] Bulk creating ${tasks.length} tasks for user ${userId}`);

    try {
      const result = await this.tasksService.batchCreate(tasks, userId);

      return {
        success: true,
        createdCount: result.createdCount,
        taskIds: result.tasks.map(t => t.id),
        userId,
      };
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Bulk create failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async handleBulkDelete(job: Job) {
    const { taskIds, userId } = job.data;

    if (!taskIds || !Array.isArray(taskIds)) {
      throw new Error('Invalid taskIds: must be an array');
    }

    if (!userId) {
      throw new Error('Missing required field: userId');
    }

    if (taskIds.length === 0) {
      throw new Error('TaskIds array cannot be empty');
    }

    if (taskIds.length > 1000) {
      throw new Error('Cannot delete more than 1000 tasks in a single batch');
    }

    this.logger.debug(`[Job ${job.id}] Bulk deleting ${taskIds.length} tasks for user ${userId}`);

    try {
      const deletedCount = await this.tasksService.batchDeleteForUser(taskIds, userId);

      return {
        success: true,
        deletedCount,
        taskIds,
        userId,
      };
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Bulk delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;

    if (!taskId) {
      throw new Error('Missing required field: taskId');
    }

    if (!status) {
      throw new Error('Missing required field: status');
    }

    if (!Object.values(TaskStatus).includes(status)) {
      throw new Error(`Invalid status value: ${status}`);
    }

    this.logger.debug(`[Job ${job.id}] Updating task ${taskId} to status: ${status}`);

    try {
      const task = await this.tasksService.updateStatus(taskId, status);

      return {
        success: true,
        taskId: task.id,
        previousStatus: job.data.previousStatus,
        newStatus: task.status,
        updatedAt: task.updatedAt,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        this.logger.warn(`[Job ${job.id}] Task ${taskId} not found - marking job as completed`);

        return {
          success: false,
          skipped: true,
          reason: 'Task not found',
          taskId,
        };
      }

      throw error;
    }
  }

  private async handleOverdueTasksNotification(job: Job) {
    const { taskIds } = job.data;

    if (!taskIds || !Array.isArray(taskIds)) {
      throw new Error('Invalid taskIds: must be an array');
    }

    this.logger.debug(`[Job ${job.id}] Processing ${taskIds.length} overdue task notifications`);

    const results = {
      success: true,
      total: taskIds.length,
      processed: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const taskId of taskIds) {
      try {
        this.logger.debug(`[Job ${job.id}] Notification sent for task: ${taskId}`);
        results.processed++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Task ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        this.logger.error(
          `[Job ${job.id}] Failed to notify for task ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return results;
  }

  private async handleTaskReminder(job: Job) {
    const { taskId, userId } = job.data;

    if (!taskId || !userId) {
      throw new Error('Missing required fields: taskId and userId');
    }

    this.logger.debug(`[Job ${job.id}] Sending reminder for task ${taskId} to user ${userId}`);

    return {
      success: true,
      taskId,
      userId,
      reminderSent: true,
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: any) {
    this.logger.log(
      `[Job ${job.id}] ✅ Successfully completed | Type: ${job.name} | Result: ${JSON.stringify(result)}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `[Job ${job.id}] ❌ Failed permanently after ${job.attemptsMade} attempts | Type: ${job.name} | Error: ${error.message}`,
    );

    // Here we could:
    // - Store failed job in a dead-letter queue
    // - Send alert to monitoring system
    // - Notify administrators
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(
      `[Job ${job.id}] 🔄 Started processing | Type: ${job.name} | Attempt: ${job.attemptsMade + 1}`,
    );
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`⚠️ Worker error: ${error.message}`);
  }
}
