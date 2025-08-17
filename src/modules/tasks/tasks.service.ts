import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { PaginationResult } from '../../common/dto/pagination.dto';
import { RedisCacheService } from '../../common/services/redis-cache.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'tasks';

  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private readonly cacheService: RedisCacheService,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // Use query runner for transaction management
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = this.tasksRepository.create(createTaskDto);
      const savedTask = await queryRunner.manager.save(Task, task);

      // Add to queue with proper error handling
      await this.taskQueue.add('task-status-update', {
        taskId: savedTask.id,
        status: savedTask.status,
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      await queryRunner.commitTransaction();
      
      // Invalidate related caches
      await this.invalidateUserTaskCache(savedTask.userId);
      
      this.logger.log(`Task created successfully: ${savedTask.id}`);
      return savedTask;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(filterDto: TaskFilterDto): Promise<PaginationResult<Task>> {
    const cacheKey = this.generateCacheKey('findAll', filterDto);
    
    // Try to get from cache first
    const cached = await this.cacheService.get<PaginationResult<Task>>(cacheKey, this.CACHE_PREFIX);
    if (cached) {
      this.logger.debug('Returning cached task list');
      return cached;
    }

    const queryBuilder = this.buildTaskQuery(filterDto);
    const result = await this.executePaginatedQuery(queryBuilder, filterDto);

    // Cache the result
    await this.cacheService.set(cacheKey, result, { 
      ttl: this.CACHE_TTL, 
      prefix: this.CACHE_PREFIX 
    });

    return result;
  }

  async findOne(id: string): Promise<Task> {
    const cacheKey = `task:${id}`;
    
    // Try to get from cache first
    const cached = await this.cacheService.get<Task>(cacheKey, this.CACHE_PREFIX);
    if (cached) {
      this.logger.debug(`Returning cached task: ${id}`);
      return cached;
    }

    // Single efficient query with proper error handling
    const task = await this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .select([
        'task.id',
        'task.title',
        'task.description',
        'task.status',
        'task.priority',
        'task.dueDate',
        'task.userId',
        'task.createdAt',
        'task.updatedAt',
        'user.id',
        'user.email',
        'user.name',
        'user.role'
      ])
      .where('task.id = :id', { id })
      .getOne();

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // Cache the result
    await this.cacheService.set(cacheKey, task, { 
      ttl: this.CACHE_TTL, 
      prefix: this.CACHE_PREFIX 
    });

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    // Inefficient implementation: multiple database calls
    // and no transaction handling
    const task = await this.findOne(id);

    const originalStatus = task.status;

    // Directly update each field individually
    if (updateTaskDto.title) task.title = updateTaskDto.title;
    if (updateTaskDto.description) task.description = updateTaskDto.description;
    if (updateTaskDto.status) task.status = updateTaskDto.status;
    if (updateTaskDto.priority) task.priority = updateTaskDto.priority;
    if (updateTaskDto.dueDate) task.dueDate = updateTaskDto.dueDate;

    const updatedTask = await this.tasksRepository.save(task);

    // Add to queue if status changed, but without proper error handling
    if (originalStatus !== updatedTask.status) {
      this.taskQueue.add('task-status-update', {
        taskId: updatedTask.id,
        status: updatedTask.status,
      });
    }

    return updatedTask;
  }

  async remove(id: string): Promise<void> {
    // Inefficient implementation: two separate database calls
    const task = await this.findOne(id);
    await this.tasksRepository.remove(task);
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Inefficient implementation: doesn't use proper repository patterns
    const query = 'SELECT * FROM tasks WHERE status = $1';
    return this.tasksRepository.query(query, [status]);
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // This method will be called by the task processor
    const task = await this.findOne(id);
    task.status = status as any;
    const updatedTask = await this.tasksRepository.save(task);
    
    // Invalidate caches
    await this.invalidateTaskCache(id);
    await this.invalidateUserTaskCache(task.userId);
    
    return updatedTask;
  }

  // Helper methods for query building and pagination
  private buildTaskQuery(filterDto: TaskFilterDto): SelectQueryBuilder<Task> {
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
        'task.userId',
        'task.createdAt',
        'task.updatedAt',
        'user.id',
        'user.email',
        'user.name',
        'user.role'
      ]);

    // Apply filters
    if (filterDto.userId) {
      queryBuilder.andWhere('task.userId = :userId', { userId: filterDto.userId });
    }

    if (filterDto.status) {
      queryBuilder.andWhere('task.status = :status', { status: filterDto.status });
    }

    if (filterDto.priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority: filterDto.priority });
    }

    if (filterDto.search) {
      queryBuilder.andWhere(
        '(task.title ILIKE :search OR task.description ILIKE :search)',
        { search: `%${filterDto.search}%` }
      );
    }

    if (filterDto.dueDateFrom) {
      queryBuilder.andWhere('task.dueDate >= :dueDateFrom', { 
        dueDateFrom: new Date(filterDto.dueDateFrom) 
      });
    }

    if (filterDto.dueDateTo) {
      queryBuilder.andWhere('task.dueDate <= :dueDateTo', { 
        dueDateTo: new Date(filterDto.dueDateTo) 
      });
    }

    if (filterDto.createdFrom) {
      queryBuilder.andWhere('task.createdAt >= :createdFrom', { 
        createdFrom: new Date(filterDto.createdFrom) 
      });
    }

    if (filterDto.createdTo) {
      queryBuilder.andWhere('task.createdAt <= :createdTo', { 
        createdTo: new Date(filterDto.createdTo) 
      });
    }

    if (filterDto.overdue) {
      queryBuilder.andWhere('task.dueDate < NOW() AND task.status != :completedStatus', {
        completedStatus: TaskStatus.COMPLETED
      });
    }

    if (!filterDto.includeCompleted) {
      queryBuilder.andWhere('task.status != :completedStatus', {
        completedStatus: TaskStatus.COMPLETED
      });
    }

    // Apply ordering
    const orderBy = filterDto.orderBy || 'createdAt';
    const orderDirection = filterDto.orderDirection || 'DESC';
    queryBuilder.orderBy(`task.${orderBy}`, orderDirection);

    return queryBuilder;
  }

  private async executePaginatedQuery(
    queryBuilder: SelectQueryBuilder<Task>,
    filterDto: TaskFilterDto
  ): Promise<PaginationResult<Task>> {
    const limit = filterDto.limit || 20;
    
    // Add cursor-based pagination
    if (filterDto.cursor) {
      const cursorValue = this.decodeCursor(filterDto.cursor);
      const orderBy = filterDto.orderBy || 'createdAt';
      const orderDirection = filterDto.orderDirection || 'DESC';
      
      if (orderDirection === 'DESC') {
        queryBuilder.andWhere(`task.${orderBy} < :cursor`, { cursor: cursorValue });
      } else {
        queryBuilder.andWhere(`task.${orderBy} > :cursor`, { cursor: cursorValue });
      }
    }

    // Get one extra item to determine if there are more results
    queryBuilder.limit(limit + 1);
    
    const tasks = await queryBuilder.getMany();
    const hasMore = tasks.length > limit;
    
    if (hasMore) {
      tasks.pop(); // Remove the extra item
    }

    // Generate next cursor
    let nextCursor: string | undefined;
    if (hasMore && tasks.length > 0) {
      const lastTask = tasks[tasks.length - 1];
      const orderBy = filterDto.orderBy || 'createdAt';
      const cursorValue = lastTask[orderBy as keyof Task];
      nextCursor = this.encodeCursor(cursorValue);
    }

    return {
      data: tasks,
      nextCursor,
      hasMore,
    };
  }

  private generateCacheKey(method: string, filterDto: TaskFilterDto): string {
    const filterHash = JSON.stringify(filterDto);
    return `${method}:${Buffer.from(filterHash).toString('base64')}`;
  }

  private encodeCursor(value: any): string {
    return Buffer.from(JSON.stringify(value)).toString('base64');
  }

  private decodeCursor(cursor: string): any {
    return JSON.parse(Buffer.from(cursor, 'base64').toString());
  }

  private async invalidateTaskCache(taskId: string): Promise<void> {
    await this.cacheService.delete(`task:${taskId}`, this.CACHE_PREFIX);
  }

  private async invalidateUserTaskCache(userId: string): Promise<void> {
    // Invalidate all task-related caches for this user
    await this.cacheService.clear(`${this.CACHE_PREFIX}:user:${userId}`);
  }

  // Bulk operations for better performance
  async bulkCreate(tasks: CreateTaskDto[]): Promise<Task[]> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const createdTasks = [];
      
      for (const taskDto of tasks) {
        const task = this.tasksRepository.create(taskDto);
        const savedTask = await queryRunner.manager.save(Task, task);
        createdTasks.push(savedTask);
      }

      await queryRunner.commitTransaction();
      
      // Invalidate caches for all affected users
      const userIds = [...new Set(createdTasks.map(task => task.userId))];
      await Promise.all(userIds.map(userId => this.invalidateUserTaskCache(userId)));
      
      this.logger.log(`Bulk created ${createdTasks.length} tasks`);
      return createdTasks;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to bulk create tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async bulkUpdateStatus(taskIds: string[], status: TaskStatus): Promise<Task[]> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const updatedTasks = [];
      
      for (const taskId of taskIds) {
        const task = await queryRunner.manager.findOne(Task, { where: { id: taskId } });
        if (task) {
          task.status = status;
          const updatedTask = await queryRunner.manager.save(Task, task);
          updatedTasks.push(updatedTask);
        }
      }

      await queryRunner.commitTransaction();
      
      // Invalidate caches
      await Promise.all([
        ...taskIds.map(id => this.invalidateTaskCache(id)),
        ...updatedTasks.map(task => this.invalidateUserTaskCache(task.userId))
      ]);
      
      this.logger.log(`Bulk updated status for ${updatedTasks.length} tasks`);
      return updatedTasks;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to bulk update task status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getStatistics(): Promise<any> {
    const cacheKey = 'task-statistics';
    
    // Try to get from cache first
    const cached = await this.cacheService.get(cacheKey, this.CACHE_PREFIX);
    if (cached) {
      this.logger.debug('Returning cached task statistics');
      return cached;
    }

    // Efficient aggregation queries
    const [
      totalCount,
      statusStats,
      priorityStats,
      overdueCount
    ] = await Promise.all([
      this.tasksRepository.count(),
      this.tasksRepository
        .createQueryBuilder('task')
        .select('task.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('task.status')
        .getRawMany(),
      this.tasksRepository
        .createQueryBuilder('task')
        .select('task.priority', 'priority')
        .addSelect('COUNT(*)', 'count')
        .groupBy('task.priority')
        .getRawMany(),
      this.tasksRepository
        .createQueryBuilder('task')
        .where('task.dueDate < NOW() AND task.status != :completedStatus', {
          completedStatus: TaskStatus.COMPLETED
        })
        .getCount()
    ]);

    const statistics = {
      total: totalCount,
      overdue: overdueCount,
      byStatus: statusStats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.count);
        return acc;
      }, {}),
      byPriority: priorityStats.reduce((acc, stat) => {
        acc[stat.priority] = parseInt(stat.count);
        return acc;
      }, {}),
      completionRate: totalCount > 0 
        ? Math.round((statusStats.find(s => s.status === TaskStatus.COMPLETED)?.count || 0) / totalCount * 100)
        : 0
    };

    // Cache the result for 5 minutes
    await this.cacheService.set(cacheKey, statistics, { 
      ttl: this.CACHE_TTL, 
      prefix: this.CACHE_PREFIX 
    });

    return statistics;
  }
}
