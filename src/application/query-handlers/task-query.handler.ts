import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { TaskAggregate } from '../../domain/entities/task.aggregate';
import { TaskStatusEnum } from '../../domain/value-objects/task-status.value-object';
import { TaskPriorityEnum } from '../../domain/value-objects/task-priority.value-object';
import {
  GetTaskByIdQuery,
  GetTasksQuery,
  GetTaskStatisticsQuery,
  GetOverdueTasksQuery,
  GetHighPriorityTasksQuery,
  GetTasksByUserQuery,
} from '../queries/task-queries';
import { PaginationResult } from '../../common/dto/pagination.dto';
import { RedisCacheService } from '../../common/services/redis-cache.service';

@Injectable()
export class TaskQueryHandler {
  private readonly logger = new Logger(TaskQueryHandler.name);
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'task-queries';

  constructor(
    @InjectRepository(TaskAggregate)
    private taskRepository: Repository<TaskAggregate>,
    private cacheService: RedisCacheService,
  ) {}

  async handleGetTaskById(query: GetTaskByIdQuery): Promise<TaskAggregate> {
    const cacheKey = `task:${query.taskId}`;
    
    // Try to get from cache first
    const cached = await this.cacheService.get<TaskAggregate>(cacheKey, this.CACHE_PREFIX);
    if (cached) {
      this.logger.debug(`Returning cached task: ${query.taskId}`);
      return cached;
    }

    const task = await this.taskRepository.findOne({
      where: { id: query.taskId }
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${query.taskId} not found`);
    }

    // Cache the result
    await this.cacheService.set(cacheKey, task, { 
      ttl: this.CACHE_TTL, 
      prefix: this.CACHE_PREFIX 
    });

    return task;
  }

  async handleGetTasks(query: GetTasksQuery): Promise<PaginationResult<TaskAggregate>> {
    const cacheKey = this.generateCacheKey('getTasks', query);
    
    // Try to get from cache first
    const cached = await this.cacheService.get<PaginationResult<TaskAggregate>>(cacheKey, this.CACHE_PREFIX);
    if (cached) {
      this.logger.debug('Returning cached task list');
      return cached;
    }

    const queryBuilder = this.buildTaskQuery(query);
    const result = await this.executePaginatedQuery(queryBuilder, query);

    // Cache the result
    await this.cacheService.set(cacheKey, result, { 
      ttl: this.CACHE_TTL, 
      prefix: this.CACHE_PREFIX 
    });

    return result;
  }

  async handleGetTaskStatistics(query: GetTaskStatisticsQuery): Promise<any> {
    const cacheKey = `task-stats:${query.userId || 'global'}`;
    
    // Try to get from cache first
    const cached = await this.cacheService.get(cacheKey, this.CACHE_PREFIX);
    if (cached) {
      this.logger.debug('Returning cached task statistics');
      return cached;
    }

    // Build base query
    let baseQuery = this.taskRepository.createQueryBuilder('task');
    
    if (query.userId) {
      baseQuery = baseQuery.where('task.userId = :userId', { userId: query.userId });
    }

    // Execute aggregation queries
    const [
      totalCount,
      statusStats,
      priorityStats,
      overdueCount
    ] = await Promise.all([
      baseQuery.getCount(),
      baseQuery
        .select('task.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('task.status')
        .getRawMany(),
      baseQuery
        .select('task.priority', 'priority')
        .addSelect('COUNT(*)', 'count')
        .groupBy('task.priority')
        .getRawMany(),
      baseQuery
        .where('task.dueDate < NOW() AND task.status != :completedStatus', {
          completedStatus: TaskStatusEnum.COMPLETED
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
        ? Math.round((statusStats.find(s => s.status === TaskStatusEnum.COMPLETED)?.count || 0) / totalCount * 100)
        : 0
    };

    // Cache the result
    await this.cacheService.set(cacheKey, statistics, { 
      ttl: this.CACHE_TTL, 
      prefix: this.CACHE_PREFIX 
    });

    return statistics;
  }

  async handleGetOverdueTasks(query: GetOverdueTasksQuery): Promise<TaskAggregate[]> {
    const cacheKey = `overdue-tasks:${query.userId || 'all'}:${query.limit || 20}`;
    
    // Try to get from cache first
    const cached = await this.cacheService.get<TaskAggregate[]>(cacheKey, this.CACHE_PREFIX);
    if (cached) {
      this.logger.debug('Returning cached overdue tasks');
      return cached;
    }

    let queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .where('task.dueDate < NOW() AND task.status IN (:...activeStatuses)', {
        activeStatuses: [TaskStatusEnum.PENDING, TaskStatusEnum.IN_PROGRESS]
      })
      .orderBy('task.dueDate', 'ASC');

    if (query.userId) {
      queryBuilder = queryBuilder.andWhere('task.userId = :userId', { userId: query.userId });
    }

    if (query.limit) {
      queryBuilder = queryBuilder.limit(query.limit);
    }

    const overdueTasks = await queryBuilder.getMany();

    // Cache the result
    await this.cacheService.set(cacheKey, overdueTasks, { 
      ttl: this.CACHE_TTL, 
      prefix: this.CACHE_PREFIX 
    });

    return overdueTasks;
  }

  async handleGetHighPriorityTasks(query: GetHighPriorityTasksQuery): Promise<TaskAggregate[]> {
    const cacheKey = `high-priority-tasks:${query.userId || 'all'}:${query.limit || 20}`;
    
    // Try to get from cache first
    const cached = await this.cacheService.get<TaskAggregate[]>(cacheKey, this.CACHE_PREFIX);
    if (cached) {
      this.logger.debug('Returning cached high priority tasks');
      return cached;
    }

    let queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .where('task.priority IN (:...highPriorities)', {
        highPriorities: [TaskPriorityEnum.HIGH, TaskPriorityEnum.URGENT]
      })
      .andWhere('task.status IN (:...activeStatuses)', {
        activeStatuses: [TaskStatusEnum.PENDING, TaskStatusEnum.IN_PROGRESS]
      })
      .orderBy('task.priority', 'DESC')
      .addOrderBy('task.dueDate', 'ASC');

    if (query.userId) {
      queryBuilder = queryBuilder.andWhere('task.userId = :userId', { userId: query.userId });
    }

    if (query.limit) {
      queryBuilder = queryBuilder.limit(query.limit);
    }

    const highPriorityTasks = await queryBuilder.getMany();

    // Cache the result
    await this.cacheService.set(cacheKey, highPriorityTasks, { 
      ttl: this.CACHE_TTL, 
      prefix: this.CACHE_PREFIX 
    });

    return highPriorityTasks;
  }

  async handleGetTasksByUser(query: GetTasksByUserQuery): Promise<PaginationResult<TaskAggregate>> {
    const cacheKey = `user-tasks:${query.userId}:${query.limit || 20}:${query.cursor || 'start'}`;
    
    // Try to get from cache first
    const cached = await this.cacheService.get<PaginationResult<TaskAggregate>>(cacheKey, this.CACHE_PREFIX);
    if (cached) {
      this.logger.debug(`Returning cached tasks for user: ${query.userId}`);
      return cached;
    }

    let queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId: query.userId })
      .orderBy('task.createdAt', 'DESC');

    if (query.cursor) {
      const cursorValue = this.decodeCursor(query.cursor);
      queryBuilder = queryBuilder.andWhere('task.createdAt < :cursor', { cursor: cursorValue });
    }

    const limit = query.limit || 20;
    queryBuilder = queryBuilder.limit(limit + 1);

    const tasks = await queryBuilder.getMany();
    const hasMore = tasks.length > limit;
    
    if (hasMore) {
      tasks.pop(); // Remove the extra item
    }

    // Generate next cursor
    let nextCursor: string | undefined;
    if (hasMore && tasks.length > 0) {
      const lastTask = tasks[tasks.length - 1];
      nextCursor = this.encodeCursor(lastTask.createdAt);
    }

    const result = {
      data: tasks,
      nextCursor,
      hasMore,
    };

    // Cache the result
    await this.cacheService.set(cacheKey, result, { 
      ttl: this.CACHE_TTL, 
      prefix: this.CACHE_PREFIX 
    });

    return result;
  }

  // Helper methods
  private buildTaskQuery(query: GetTasksQuery): SelectQueryBuilder<TaskAggregate> {
    let queryBuilder = this.taskRepository.createQueryBuilder('task');

    if (query.userId) {
      queryBuilder = queryBuilder.andWhere('task.userId = :userId', { userId: query.userId });
    }

    if (query.status) {
      queryBuilder = queryBuilder.andWhere('task.status = :status', { status: query.status });
    }

    if (query.priority) {
      queryBuilder = queryBuilder.andWhere('task.priority = :priority', { priority: query.priority });
    }

    if (query.search) {
      queryBuilder = queryBuilder.andWhere(
        '(task.title ILIKE :search OR task.description ILIKE :search)',
        { search: `%${query.search}%` }
      );
    }

    if (query.dueDateFrom) {
      queryBuilder = queryBuilder.andWhere('task.dueDate >= :dueDateFrom', { 
        dueDateFrom: query.dueDateFrom 
      });
    }

    if (query.dueDateTo) {
      queryBuilder = queryBuilder.andWhere('task.dueDate <= :dueDateTo', { 
        dueDateTo: query.dueDateTo 
      });
    }

    if (query.createdFrom) {
      queryBuilder = queryBuilder.andWhere('task.createdAt >= :createdFrom', { 
        createdFrom: query.createdFrom 
      });
    }

    if (query.createdTo) {
      queryBuilder = queryBuilder.andWhere('task.createdAt <= :createdTo', { 
        createdTo: query.createdTo 
      });
    }

    if (query.overdue) {
      queryBuilder = queryBuilder.andWhere('task.dueDate < NOW() AND task.status != :completedStatus', {
        completedStatus: TaskStatusEnum.COMPLETED
      });
    }

    if (!query.includeCompleted) {
      queryBuilder = queryBuilder.andWhere('task.status != :completedStatus', {
        completedStatus: TaskStatusEnum.COMPLETED
      });
    }

    // Apply ordering
    const orderBy = query.orderBy || 'createdAt';
    const orderDirection = query.orderDirection || 'DESC';
    queryBuilder = queryBuilder.orderBy(`task.${orderBy}`, orderDirection);

    return queryBuilder;
  }

  private async executePaginatedQuery(
    queryBuilder: SelectQueryBuilder<TaskAggregate>,
    query: GetTasksQuery
  ): Promise<PaginationResult<TaskAggregate>> {
    const limit = query.limit || 20;
    
    // Add cursor-based pagination
    if (query.cursor) {
      const cursorValue = this.decodeCursor(query.cursor);
      const orderBy = query.orderBy || 'createdAt';
      const orderDirection = query.orderDirection || 'DESC';
      
      if (orderDirection === 'DESC') {
        queryBuilder = queryBuilder.andWhere(`task.${orderBy} < :cursor`, { cursor: cursorValue });
      } else {
        queryBuilder = queryBuilder.andWhere(`task.${orderBy} > :cursor`, { cursor: cursorValue });
      }
    }

    // Get one extra item to determine if there are more results
    queryBuilder = queryBuilder.limit(limit + 1);
    
    const tasks = await queryBuilder.getMany();
    const hasMore = tasks.length > limit;
    
    if (hasMore) {
      tasks.pop(); // Remove the extra item
    }

    // Generate next cursor
    let nextCursor: string | undefined;
    if (hasMore && tasks.length > 0) {
      const lastTask = tasks[tasks.length - 1];
      const orderBy = query.orderBy || 'createdAt';
      const cursorValue = lastTask[orderBy as keyof TaskAggregate];
      nextCursor = this.encodeCursor(cursorValue);
    }

    return {
      data: tasks,
      nextCursor,
      hasMore,
    };
  }

  private generateCacheKey(method: string, query: any): string {
    const queryHash = JSON.stringify(query);
    return `${method}:${Buffer.from(queryHash).toString('base64')}`;
  }

  private encodeCursor(value: any): string {
    return Buffer.from(JSON.stringify(value)).toString('base64');
  }

  private decodeCursor(cursor: string): any {
    return JSON.parse(Buffer.from(cursor, 'base64').toString());
  }
}
