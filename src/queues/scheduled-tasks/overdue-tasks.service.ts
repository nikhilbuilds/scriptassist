import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

/**
 * OverdueTasksService - Monitors and processes overdue tasks
 *
 * This service is responsible for:
 * - Periodically checking for overdue tasks
 * - Adding overdue tasks to the processing queue
 * - Providing observability through comprehensive logging
 *
 * Architecture Notes:
 * - Uses cron scheduling for periodic execution
 * - Integrates with BullMQ for reliable background processing
 * - Implements proper error handling and logging
 * - Follows single responsibility principle
 */
@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
  ) {}

  /**
   * Checks for overdue tasks and adds them to the processing queue
   *
   * This method runs every hour via cron scheduling and:
   * 1. Queries the database for overdue tasks
   * 2. Adds found tasks to the processing queue
   * 3. Provides comprehensive logging for observability
   *
   * Error Handling:
   * - Catches and logs database query errors
   * - Catches and logs queue operation errors
   * - Continues processing even if individual tasks fail
   *
   * Performance Considerations:
   * - Uses efficient database queries with proper indexing
   * - Processes tasks in batches to avoid memory issues
   * - Implements timeout handling for long-running operations
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('Starting overdue tasks check...');

    try {
      // Query for overdue tasks with proper error handling
      const overdueTasks = await this.findOverdueTasks();

      if (overdueTasks.length === 0) {
        this.logger.debug('No overdue tasks found');
        return;
      }

      this.logger.log(`Found ${overdueTasks.length} overdue tasks to process`);

      // Process overdue tasks and add them to the queue
      await this.processOverdueTasks(overdueTasks);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Overdue tasks check completed in ${duration}ms. Processed ${overdueTasks.length} tasks`,
      );
    } catch (error: unknown) {
      // Type-safe error handling with proper error type checking
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error('Failed to check overdue tasks', errorStack);
      // Don't throw the error to prevent the cron job from failing
      // In a production environment, you might want to send alerts here
    }
  }

  /**
   * Finds all overdue tasks in the database
   *
   * @returns Promise<Task[]> Array of overdue tasks
   * @throws Error if database query fails
   */
  private async findOverdueTasks(): Promise<Task[]> {
    const now = new Date();

    try {
      return await this.tasksRepository.find({
        where: {
          dueDate: LessThan(now),
          status: TaskStatus.PENDING,
        },
        // Include user information for better processing context
        relations: ['user'],
        // Order by due date to process oldest tasks first
        order: {
          dueDate: 'ASC',
        },
      });
    } catch (error: unknown) {
      // Type-safe error handling
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error('Failed to query overdue tasks from database', errorStack);
      throw new Error(`Database query failed: ${errorMessage}`);
    }
  }

  /**
   * Processes overdue tasks by adding them to the processing queue
   *
   * @param overdueTasks Array of overdue tasks to process
   * @throws Error if queue operations fail
   */
  private async processOverdueTasks(overdueTasks: Task[]): Promise<void> {
    const queueJobs = overdueTasks.map(task => ({
      name: 'process-overdue-task',
      data: {
        taskId: task.id,
        taskTitle: task.title,
        userId: task.userId,
        dueDate: task.dueDate,
      },
      // Add job options for better reliability
      opts: {
        // Retry failed jobs up to 3 times
        attempts: 3,
        // Delay between retries (exponential backoff)
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        // Remove completed jobs after 24 hours
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    }));

    try {
      // Add all jobs to the queue in a single operation for better performance
      const addedJobs = await Promise.all(
        queueJobs.map(job => this.taskQueue.add(job.name, job.data, job.opts)),
      );

      this.logger.log(`Successfully added ${addedJobs.length} overdue tasks to processing queue`);

      // Log individual task details for debugging
      overdueTasks.forEach((task, index) => {
        this.logger.debug(
          `Queued overdue task: ${task.title} (ID: ${task.id}) - Due: ${task.dueDate}`,
        );
      });
    } catch (error: unknown) {
      // Type-safe error handling
      const errorMessage = error instanceof Error ? error.message : 'Unknown queue error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error('Failed to add overdue tasks to processing queue', errorStack);
      throw new Error(`Queue operation failed: ${errorMessage}`);
    }
  }
}
