import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, SelectQueryBuilder } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';

/**
 * TasksService - Core business logic for task management
 *
 * This service implements:
 * - Efficient database operations with proper indexing
 * - Transaction management for data consistency
 * - Optimized query patterns to avoid N+1 problems
 * - Proper error handling and logging
 * - Background job integration for async operations
 *
 * Performance Optimizations:
 * - Uses QueryBuilder for complex queries
 * - Implements proper pagination with SQL LIMIT/OFFSET
 * - Avoids multiple database calls with efficient joins
 * - Uses transactions for multi-step operations
 *
 * Architecture Notes:
 * - Follows repository pattern with service layer abstraction
 * - Implements proper separation of concerns
 * - Uses dependency injection for testability
 * - Integrates with BullMQ for background processing
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates a new task with transaction management and background processing
   *
   * @param createTaskDto Task creation data
   * @returns Created task with user information
   * @throws BadRequestException if validation fails
   */
  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Create task within transaction
      const task = this.tasksRepository.create(createTaskDto);
      const savedTask = await queryRunner.manager.save(Task, task);

      // Commit transaction first
      await queryRunner.commitTransaction();

      // Add background job after successful commit
      await this.addTaskToQueue('task-status-update', {
        taskId: savedTask.id,
        status: savedTask.status,
        userId: savedTask.userId,
      });

      this.logger.log(`Task created successfully: ${savedTask.id}`);

      // Return task with user information
      return this.findOne(savedTask.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to create task: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to create task');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Retrieves tasks with efficient filtering, pagination, and sorting
   *
   * @param options Query options including filters, pagination, and sorting
   * @returns Paginated task results with metadata
   */
  async findAll(
    options: {
      status?: TaskStatus;
      priority?: TaskPriority;
      userId?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
    } = {},
  ): Promise<{
    data: Task[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const {
      status,
      priority,
      userId,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = options;

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      throw new BadRequestException('Invalid pagination parameters');
    }

    // Build efficient query with proper joins
    const queryBuilder = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .select([
        'task.id',
        'task.title',
        'task.description',
        'task.status',
        'task.priority',
        'task.dueDate',
        'task.createdAt',
        'task.updatedAt',
        'user.id',
        'user.name',
        'user.email',
      ]);

    // Apply filters efficiently
    if (status) {
      queryBuilder.andWhere('task.status = :status', { status });
    }

    if (priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority });
    }

    if (userId) {
      queryBuilder.andWhere('task.userId = :userId', { userId });
    }

    // Get total count for pagination metadata
    const total = await queryBuilder.getCount();

    // Apply sorting and pagination
    queryBuilder
      .orderBy(`task.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const data = await queryBuilder.getMany();

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  /**
   * Finds a single task by ID with efficient query
   *
   * @param id Task ID
   * @returns Task with user information
   * @throws NotFoundException if task not found
   */
  async findOne(id: string): Promise<Task> {
    const task = await this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .where('task.id = :id', { id })
      .select([
        'task.id',
        'task.title',
        'task.description',
        'task.status',
        'task.priority',
        'task.dueDate',
        'task.createdAt',
        'task.updatedAt',
        'user.id',
        'user.name',
        'user.email',
      ])
      .getOne();

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  /**
   * Updates a task with transaction management and change tracking
   *
   * @param id Task ID
   * @param updateTaskDto Update data
   * @returns Updated task
   * @throws NotFoundException if task not found
   */
  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Get current task state
      const currentTask = await queryRunner.manager.findOne(Task, {
        where: { id },
      });

      if (!currentTask) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const originalStatus = currentTask.status;

      // Update task fields
      Object.assign(currentTask, updateTaskDto);
      currentTask.updatedAt = new Date();

      const updatedTask = await queryRunner.manager.save(Task, currentTask);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Add background job if status changed
      if (originalStatus !== updatedTask.status) {
        await this.addTaskToQueue('task-status-update', {
          taskId: updatedTask.id,
          status: updatedTask.status,
          userId: updatedTask.userId,
          previousStatus: originalStatus,
        });
      }

      this.logger.log(`Task updated successfully: ${id}`);

      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to update task ${id}: ${errorMessage}`, errorStack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Deletes a task with proper cleanup
   *
   * @param id Task ID
   * @throws NotFoundException if task not found
   */
  async remove(id: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const task = await queryRunner.manager.findOne(Task, {
        where: { id },
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      await queryRunner.manager.remove(Task, task);
      await queryRunner.commitTransaction();

      // Add cleanup job to queue
      await this.addTaskToQueue('task-cleanup', {
        taskId: id,
        userId: task.userId,
      });

      this.logger.log(`Task deleted successfully: ${id}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to delete task ${id}: ${errorMessage}`, errorStack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Finds tasks by status with efficient query
   *
   * @param status Task status to filter by
   * @returns Array of tasks with given status
   */
  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .where('task.status = :status', { status })
      .orderBy('task.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Updates task status (called by background processor)
   *
   * @param id Task ID
   * @param status New status
   * @returns Updated task
   */
  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = await this.tasksRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    task.status = status;
    task.updatedAt = new Date();

    return this.tasksRepository.save(task);
  }

  /**
   * Gets task statistics with efficient SQL aggregation
   *
   * @returns Task statistics
   */
  async getStatistics(): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    overdue: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
  }> {
    const stats = await this.tasksRepository
      .createQueryBuilder('task')
      .select([
        'COUNT(*) as total',
        'SUM(CASE WHEN task.status = :completed THEN 1 ELSE 0 END) as completed',
        'SUM(CASE WHEN task.status = :inProgress THEN 1 ELSE 0 END) as inProgress',
        'SUM(CASE WHEN task.status = :pending THEN 1 ELSE 0 END) as pending',
        'SUM(CASE WHEN task.dueDate < :now AND task.status != :completed THEN 1 ELSE 0 END) as overdue',
        'SUM(CASE WHEN task.priority = :high THEN 1 ELSE 0 END) as highPriority',
        'SUM(CASE WHEN task.priority = :medium THEN 1 ELSE 0 END) as mediumPriority',
        'SUM(CASE WHEN task.priority = :low THEN 1 ELSE 0 END) as lowPriority',
      ])
      .setParameters({
        completed: TaskStatus.COMPLETED,
        inProgress: TaskStatus.IN_PROGRESS,
        pending: TaskStatus.PENDING,
        high: TaskPriority.HIGH,
        medium: TaskPriority.MEDIUM,
        low: TaskPriority.LOW,
        now: new Date(),
      })
      .getRawOne();

    return {
      total: parseInt(stats.total) || 0,
      completed: parseInt(stats.completed) || 0,
      inProgress: parseInt(stats.inProgress) || 0,
      pending: parseInt(stats.pending) || 0,
      overdue: parseInt(stats.overdue) || 0,
      highPriority: parseInt(stats.highPriority) || 0,
      mediumPriority: parseInt(stats.mediumPriority) || 0,
      lowPriority: parseInt(stats.lowPriority) || 0,
    };
  }

  /**
   * Adds a job to the background processing queue
   *
   * @param jobName Name of the job
   * @param data Job data
   */
  private async addTaskToQueue(jobName: string, data: any): Promise<void> {
    try {
      await this.taskQueue.add(jobName, data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to add job to queue: ${errorMessage}`, errorStack);
      // Don't throw error to prevent transaction rollback
      // Queue failures should not break the main operation
    }
  }
}
