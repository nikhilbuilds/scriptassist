import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { 
  TaskCreatedEvent, 
  TaskStatusChangedEvent, 
  TaskPriorityChangedEvent, 
  TaskCompletedEvent,
  TaskOverdueEvent 
} from '../../domain/events/task-events';
import { TaskAggregate } from '../../domain/entities/task.aggregate';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
@EventsHandler(TaskCreatedEvent)
export class TaskCreatedHandler implements IEventHandler<TaskCreatedEvent> {
  private readonly logger = new Logger(TaskCreatedHandler.name);

  constructor(
    @InjectRepository(TaskAggregate)
    private taskRepository: Repository<TaskAggregate>,
    private cacheService: RedisCacheService,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async handle(event: TaskCreatedEvent): Promise<void> {
    this.logger.log(`Task created: ${event.aggregateId}`);
    
    // Invalidate related caches
    await this.invalidateUserTaskCache(event.userId);
    
    // Add to processing queue
    await this.taskQueue.add('task-created', {
      taskId: event.aggregateId,
      userId: event.userId,
      priority: event.priority,
      dueDate: event.dueDate,
    });

    // Send notifications for high priority tasks
    if (event.priority === 'HIGH' || event.priority === 'URGENT') {
      await this.taskQueue.add('high-priority-notification', {
        taskId: event.aggregateId,
        userId: event.userId,
        priority: event.priority,
      });
    }
  }

  private async invalidateUserTaskCache(userId: string): Promise<void> {
    try {
      await this.cacheService.delete(`user-tasks:${userId}`);
      await this.cacheService.delete(`user-tasks-count:${userId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate user task cache for ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

@Injectable()
@EventsHandler(TaskStatusChangedEvent)
export class TaskStatusChangedHandler implements IEventHandler<TaskStatusChangedEvent> {
  private readonly logger = new Logger(TaskStatusChangedHandler.name);

  constructor(
    @InjectRepository(TaskAggregate)
    private taskRepository: Repository<TaskAggregate>,
    private cacheService: RedisCacheService,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async handle(event: TaskStatusChangedEvent): Promise<void> {
    this.logger.log(`Task status changed: ${event.aggregateId} from ${event.oldStatus} to ${event.newStatus}`);
    
    // Invalidate related caches
    await this.invalidateTaskCache(event.aggregateId);
    
    // Add to processing queue for status-specific actions
    await this.taskQueue.add('task-status-updated', {
      taskId: event.aggregateId,
      oldStatus: event.oldStatus,
      newStatus: event.newStatus,
      changedBy: event.changedBy,
    });

    // Special handling for completed tasks
    if (event.newStatus === 'COMPLETED') {
      await this.taskQueue.add('task-completed-notification', {
        taskId: event.aggregateId,
        completedBy: event.changedBy,
      });
    }
  }

  private async invalidateTaskCache(taskId: string): Promise<void> {
    try {
      await this.cacheService.delete(`task:${taskId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate task cache for ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

@Injectable()
@EventsHandler(TaskPriorityChangedEvent)
export class TaskPriorityChangedHandler implements IEventHandler<TaskPriorityChangedEvent> {
  private readonly logger = new Logger(TaskPriorityChangedHandler.name);

  constructor(
    @InjectRepository(TaskAggregate)
    private taskRepository: Repository<TaskAggregate>,
    private cacheService: RedisCacheService,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async handle(event: TaskPriorityChangedEvent): Promise<void> {
    this.logger.log(`Task priority changed: ${event.aggregateId} from ${event.oldPriority} to ${event.newPriority}`);
    
    // Invalidate related caches
    await this.invalidateTaskCache(event.aggregateId);
    
    // Add to processing queue
    await this.taskQueue.add('task-priority-updated', {
      taskId: event.aggregateId,
      oldPriority: event.oldPriority,
      newPriority: event.newPriority,
      changedBy: event.changedBy,
    });

    // Send notifications for high priority tasks
    if (event.newPriority === 'HIGH' || event.newPriority === 'URGENT') {
      await this.taskQueue.add('high-priority-notification', {
        taskId: event.aggregateId,
        priority: event.newPriority,
      });
    }
  }

  private async invalidateTaskCache(taskId: string): Promise<void> {
    try {
      await this.cacheService.delete(`task:${taskId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate task cache for ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

@Injectable()
@EventsHandler(TaskCompletedEvent)
export class TaskCompletedHandler implements IEventHandler<TaskCompletedEvent> {
  private readonly logger = new Logger(TaskCompletedHandler.name);

  constructor(
    @InjectRepository(TaskAggregate)
    private taskRepository: Repository<TaskAggregate>,
    private cacheService: RedisCacheService,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async handle(event: TaskCompletedEvent): Promise<void> {
    this.logger.log(`Task completed: ${event.aggregateId} by ${event.completedBy}`);
    
    // Invalidate related caches
    await this.invalidateTaskCache(event.aggregateId);
    
    // Add to processing queue for completion actions
    await this.taskQueue.add('task-completed', {
      taskId: event.aggregateId,
      completedBy: event.completedBy,
      completedAt: event.occurredOn,
    });

    // Send completion notification
    await this.taskQueue.add('task-completion-notification', {
      taskId: event.aggregateId,
      completedBy: event.completedBy,
    });
  }

  private async invalidateTaskCache(taskId: string): Promise<void> {
    try {
      await this.cacheService.delete(`task:${taskId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate task cache for ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async invalidateUserTaskCache(userId: string): Promise<void> {
    try {
      await this.cacheService.delete(`user-tasks:${userId}`);
      await this.cacheService.delete(`user-tasks-count:${userId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate user task cache for ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

@Injectable()
@EventsHandler(TaskOverdueEvent)
export class TaskOverdueHandler implements IEventHandler<TaskOverdueEvent> {
  private readonly logger = new Logger(TaskOverdueHandler.name);

  constructor(
    @InjectRepository(TaskAggregate)
    private taskRepository: Repository<TaskAggregate>,
    private cacheService: RedisCacheService,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async handle(event: TaskOverdueEvent): Promise<void> {
    this.logger.log(`Task overdue: ${event.aggregateId}`);
    
    // Invalidate related caches
    await this.invalidateTaskCache(event.aggregateId);
    
    // Add to processing queue for overdue actions
    await this.taskQueue.add('task-overdue', {
      taskId: event.aggregateId,
      dueDate: event.dueDate,
      overdueDays: event.overdueDays,
    });

    // Send overdue notification
    await this.taskQueue.add('task-overdue-notification', {
      taskId: event.aggregateId,
      dueDate: event.dueDate,
      overdueDays: event.overdueDays,
    });
  }

  private async invalidateTaskCache(taskId: string): Promise<void> {
    try {
      await this.cacheService.delete(`task:${taskId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate task cache for ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
