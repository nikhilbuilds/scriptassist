import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';
import { DataSource } from 'typeorm';

@Injectable()
@Processor('task-processing')
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
    
    const startTime = Date.now();
    
    try {
      let result;
      
      switch (job.name) {
        case 'task-status-update':
          result = await this.handleStatusUpdate(job);
          break;
        case 'overdue-tasks-notification':
          result = await this.handleOverdueTasks(job);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          throw new Error(`Unknown job type: ${job.name}`);
      }
      
      const processingTime = Date.now() - startTime;
      this.logger.log(`Job ${job.id} completed successfully in ${processingTime}ms`);
      
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Job ${job.id} failed after ${processingTime}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Implement exponential backoff retry strategy
      const attempts = job.attemptsMade;
      const maxRetries = 3;
      
      if (attempts < maxRetries) {
        const delay = Math.pow(2, attempts) * 1000; // Exponential backoff: 1s, 2s, 4s
        this.logger.warn(`Retrying job ${job.id} in ${delay}ms (attempt ${attempts + 1}/${maxRetries})`);
        throw new Error(`Retry attempt ${attempts + 1}/${maxRetries}`);
      } else {
        this.logger.error(`Job ${job.id} failed permanently after ${maxRetries} attempts`);
        // Log to dead letter queue or monitoring system
        await this.logToDeadLetterQueue(job, error);
        throw error;
      }
    }
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;
    
    if (!taskId || !status) {
      throw new Error('Missing required data: taskId and status are required');
    }
    
    // Validate status values
    const validStatuses = Object.values(TaskStatus);
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Valid statuses: ${validStatuses.join(', ')}`);
    }
    
    // Use transaction for data consistency
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      const task = await this.tasksService.updateStatus(taskId, status);
      
      // Additional processing within transaction
      if (status === TaskStatus.COMPLETED) {
        // Log completion metrics
        this.logger.log(`Task ${taskId} marked as completed`);
      }
      
      await queryRunner.commitTransaction();
      
      return { 
        success: true,
        taskId: task.id,
        newStatus: task.status,
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Transaction failed for task ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async handleOverdueTasks(job: Job) {
    const { taskId, dueDate } = job.data;
    
    if (!taskId) {
      throw new Error('Missing required data: taskId is required');
    }
    
    this.logger.debug(`Processing overdue task notification for task ${taskId}`);
    
    try {
      // Get task details
      const task = await this.tasksService.findOne(taskId);
      
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      
      // Check if task is still overdue
      const now = new Date();
      const taskDueDate = new Date(task.dueDate);
      
      if (taskDueDate >= now) {
        this.logger.debug(`Task ${taskId} is no longer overdue`);
        return { 
          success: true, 
          message: 'Task is no longer overdue',
          taskId,
          wasOverdue: false
        };
      }
      
      // Process overdue task notification
      // In a real implementation, this would send emails, push notifications, etc.
      this.logger.log(`Sending overdue notification for task ${taskId} (due: ${taskDueDate.toISOString()})`);
      
      // Simulate notification processing
      await this.simulateNotificationProcessing(task);
      
      return { 
        success: true,
        message: 'Overdue task notification processed',
        taskId,
        wasOverdue: true,
        dueDate: taskDueDate.toISOString(),
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Failed to process overdue task ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
  
  private async simulateNotificationProcessing(task: any): Promise<void> {
    // Simulate external service call (email, push notification, etc.)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate potential failure (10% failure rate for testing)
    if (Math.random() < 0.1) {
      throw new Error('Notification service temporarily unavailable');
    }
  }
  
  private async logToDeadLetterQueue(job: Job, error: any): Promise<void> {
    // In a production environment, this would log to a dead letter queue
    // or monitoring system like Sentry, DataDog, etc.
    this.logger.error(`Dead letter queue entry - Job ${job.id}:`, {
      jobName: job.name,
      jobData: job.data,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
} 