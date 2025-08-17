import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { TaskAggregate } from '../../domain/entities/task.aggregate';
import { TaskStatusEnum } from '../../domain/value-objects/task-status.value-object';
import { TaskPriorityEnum } from '../../domain/value-objects/task-priority.value-object';
import {
  CreateTaskCommand,
  UpdateTaskCommand,
  ChangeTaskStatusCommand,
  ChangeTaskPriorityCommand,
  CompleteTaskCommand,
  DeleteTaskCommand,
  BulkCreateTasksCommand,
  BulkUpdateTaskStatusCommand,
} from '../commands/task-commands';
import {
  GetTaskByIdQuery,
  GetTasksQuery,
  GetTaskStatisticsQuery,
  GetOverdueTasksQuery,
  GetHighPriorityTasksQuery,
  GetTasksByUserQuery,
} from '../queries/task-queries';
import { PaginationResult } from '../../common/dto/pagination.dto';
import { TransactionService } from '../../common/services/transaction.service';

@Injectable()
export class TaskApplicationService {
  private readonly logger = new Logger(TaskApplicationService.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly transactionService: TransactionService,
  ) {}

  // Command operations
  async createTask(
    title: string,
    description: string,
    userId: string,
    priority: TaskPriorityEnum = TaskPriorityEnum.MEDIUM,
    dueDate?: Date
  ): Promise<TaskAggregate> {
    this.logger.log(`Creating task: ${title} for user: ${userId}`);

    const command = new CreateTaskCommand(title, description, userId, priority, dueDate);
    
    return this.transactionService.executeWrite(async (entityManager) => {
      return this.commandBus.execute(command);
    });
  }

  async updateTask(
    taskId: string,
    updates: {
      title?: string;
      description?: string;
      priority?: TaskPriorityEnum;
      dueDate?: Date;
    }
  ): Promise<TaskAggregate> {
    this.logger.log(`Updating task: ${taskId}`);

    const command = new UpdateTaskCommand(
      taskId,
      updates.title,
      updates.description,
      updates.priority,
      updates.dueDate
    );

    return this.transactionService.executeWrite(async (entityManager) => {
      return this.commandBus.execute(command);
    });
  }

  async changeTaskStatus(
    taskId: string,
    newStatus: TaskStatusEnum,
    changedBy: string
  ): Promise<TaskAggregate> {
    this.logger.log(`Changing task status: ${taskId} to ${newStatus}`);

    const command = new ChangeTaskStatusCommand(taskId, newStatus, changedBy);

    return this.transactionService.executeWrite(async (entityManager) => {
      return this.commandBus.execute(command);
    });
  }

  async changeTaskPriority(
    taskId: string,
    newPriority: TaskPriorityEnum,
    changedBy: string
  ): Promise<TaskAggregate> {
    this.logger.log(`Changing task priority: ${taskId} to ${newPriority}`);

    const command = new ChangeTaskPriorityCommand(taskId, newPriority, changedBy);

    return this.transactionService.executeWrite(async (entityManager) => {
      return this.commandBus.execute(command);
    });
  }

  async completeTask(taskId: string, completedBy: string): Promise<TaskAggregate> {
    this.logger.log(`Completing task: ${taskId} by ${completedBy}`);

    const command = new CompleteTaskCommand(taskId, completedBy);

    return this.transactionService.executeWrite(async (entityManager) => {
      return this.commandBus.execute(command);
    });
  }

  async deleteTask(taskId: string, deletedBy: string): Promise<void> {
    this.logger.log(`Deleting task: ${taskId} by ${deletedBy}`);

    const command = new DeleteTaskCommand(taskId, deletedBy);

    return this.transactionService.executeWrite(async (entityManager) => {
      return this.commandBus.execute(command);
    });
  }

  async bulkCreateTasks(
    tasks: Array<{
      title: string;
      description: string;
      userId: string;
      priority: TaskPriorityEnum;
      dueDate?: Date;
    }>
  ): Promise<TaskAggregate[]> {
    this.logger.log(`Bulk creating ${tasks.length} tasks`);

    const command = new BulkCreateTasksCommand(tasks);

    return this.transactionService.executeWrite(async (entityManager) => {
      return this.commandBus.execute(command);
    });
  }

  async bulkUpdateTaskStatus(
    taskIds: string[],
    newStatus: TaskStatusEnum,
    changedBy: string
  ): Promise<TaskAggregate[]> {
    this.logger.log(`Bulk updating status for ${taskIds.length} tasks to ${newStatus}`);

    const command = new BulkUpdateTaskStatusCommand(taskIds, newStatus, changedBy);

    return this.transactionService.executeWrite(async (entityManager) => {
      return this.commandBus.execute(command);
    });
  }

  // Query operations
  async getTaskById(taskId: string): Promise<TaskAggregate> {
    this.logger.debug(`Getting task by ID: ${taskId}`);

    const query = new GetTaskByIdQuery(taskId);

    return this.transactionService.executeReadOnly(async (entityManager) => {
      return this.queryBus.execute(query);
    });
  }

  async getTasks(filters: {
    userId?: string;
    status?: TaskStatusEnum;
    priority?: TaskPriorityEnum;
    search?: string;
    dueDateFrom?: Date;
    dueDateTo?: Date;
    createdFrom?: Date;
    createdTo?: Date;
    overdue?: boolean;
    includeCompleted?: boolean;
    limit?: number;
    cursor?: string;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
  }): Promise<PaginationResult<TaskAggregate>> {
    this.logger.debug('Getting tasks with filters');

    const query = new GetTasksQuery(
      filters.userId,
      filters.status,
      filters.priority,
      filters.search,
      filters.dueDateFrom,
      filters.dueDateTo,
      filters.createdFrom,
      filters.createdTo,
      filters.overdue,
      filters.includeCompleted,
      filters.limit,
      filters.cursor,
      filters.orderBy,
      filters.orderDirection
    );

    return this.transactionService.executeReadOnly(async (entityManager) => {
      return this.queryBus.execute(query);
    });
  }

  async getTaskStatistics(userId?: string): Promise<any> {
    this.logger.debug(`Getting task statistics for user: ${userId || 'all'}`);

    const query = new GetTaskStatisticsQuery(userId);

    return this.transactionService.executeReadOnly(async (entityManager) => {
      return this.queryBus.execute(query);
    });
  }

  async getOverdueTasks(userId?: string, limit?: number): Promise<TaskAggregate[]> {
    this.logger.debug(`Getting overdue tasks for user: ${userId || 'all'}`);

    const query = new GetOverdueTasksQuery(userId, limit);

    return this.transactionService.executeReadOnly(async (entityManager) => {
      return this.queryBus.execute(query);
    });
  }

  async getHighPriorityTasks(userId?: string, limit?: number): Promise<TaskAggregate[]> {
    this.logger.debug(`Getting high priority tasks for user: ${userId || 'all'}`);

    const query = new GetHighPriorityTasksQuery(userId, limit);

    return this.transactionService.executeReadOnly(async (entityManager) => {
      return this.queryBus.execute(query);
    });
  }

  async getTasksByUser(
    userId: string,
    limit?: number,
    cursor?: string
  ): Promise<PaginationResult<TaskAggregate>> {
    this.logger.debug(`Getting tasks for user: ${userId}`);

    const query = new GetTasksByUserQuery(userId, limit, cursor);

    return this.transactionService.executeReadOnly(async (entityManager) => {
      return this.queryBus.execute(query);
    });
  }

  // Business logic operations
  async getTaskDashboard(userId: string): Promise<{
    statistics: any;
    overdueTasks: TaskAggregate[];
    highPriorityTasks: TaskAggregate[];
    recentTasks: PaginationResult<TaskAggregate>;
  }> {
    this.logger.log(`Getting dashboard for user: ${userId}`);

    const [statistics, overdueTasks, highPriorityTasks, recentTasks] = await Promise.all([
      this.getTaskStatistics(userId),
      this.getOverdueTasks(userId, 5),
      this.getHighPriorityTasks(userId, 5),
      this.getTasksByUser(userId, 10),
    ]);

    return {
      statistics,
      overdueTasks,
      highPriorityTasks,
      recentTasks,
    };
  }

  async getTaskAnalytics(userId?: string): Promise<{
    statistics: any;
    overdueTasks: TaskAggregate[];
    highPriorityTasks: TaskAggregate[];
    completionTrend: any;
  }> {
    this.logger.log(`Getting analytics for user: ${userId || 'all'}`);

    const [statistics, overdueTasks, highPriorityTasks] = await Promise.all([
      this.getTaskStatistics(userId),
      this.getOverdueTasks(userId, 20),
      this.getHighPriorityTasks(userId, 20),
    ]);

    // Calculate completion trend (simplified)
    const completionTrend = {
      daily: Math.round(statistics.completionRate / 30), // Simplified calculation
      weekly: Math.round(statistics.completionRate / 4),
      monthly: statistics.completionRate,
    };

    return {
      statistics,
      overdueTasks,
      highPriorityTasks,
      completionTrend,
    };
  }
}
