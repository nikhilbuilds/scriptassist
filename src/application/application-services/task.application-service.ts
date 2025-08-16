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
  BulkUpdateTaskStatusCommand 
} from '../commands/task-commands';
import { 
  GetTaskByIdQuery, 
  GetTasksQuery, 
  GetTaskStatisticsQuery, 
  GetOverdueTasksQuery, 
  GetHighPriorityTasksQuery, 
  GetTasksByUserQuery 
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
    updates: { title?: string; description?: string; priority?: TaskPriorityEnum; dueDate?: Date }
  ): Promise<TaskAggregate> {
    this.logger.log(`Updating task: ${taskId}`);
    const command = new UpdateTaskCommand(taskId, updates.title, updates.description, updates.priority, updates.dueDate);
    return this.transactionService.executeWrite(async (entityManager) => {
      return this.commandBus.execute(command);
    });
  }

  async changeTaskStatus(taskId: string, newStatus: TaskStatusEnum, changedBy: string): Promise<TaskAggregate> {
    this.logger.log(`Changing task status: ${taskId} to ${newStatus}`);
    const command = new ChangeTaskStatusCommand(taskId, newStatus, changedBy);
    return this.transactionService.executeWrite(async (entityManager) => {
      return this.commandBus.execute(command);
    });
  }

  async changeTaskPriority(taskId: string, newPriority: TaskPriorityEnum, changedBy: string): Promise<TaskAggregate> {
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

  async bulkCreateTasks(tasks: Array<{
    title: string;
    description: string;
    userId: string;
    priority: TaskPriorityEnum;
    dueDate?: Date;
  }>): Promise<TaskAggregate[]> {
    this.logger.log(`Bulk creating ${tasks.length} tasks`);
    const command = new BulkCreateTasksCommand(tasks);
    return this.transactionService.executeWrite(async (entityManager) => {
      return this.commandBus.execute(command);
    });
  }

  async bulkUpdateTaskStatus(taskIds: string[], newStatus: TaskStatusEnum, changedBy: string): Promise<TaskAggregate[]> {
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
    this.logger.debug(`Getting tasks with filters: ${JSON.stringify(filters)}`);
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

  async getOverdueTasks(userId?: string): Promise<TaskAggregate[]> {
    this.logger.debug(`Getting overdue tasks for user: ${userId || 'all'}`);
    const query = new GetOverdueTasksQuery(userId);
    return this.transactionService.executeReadOnly(async (entityManager) => {
      return this.queryBus.execute(query);
    });
  }

  async getHighPriorityTasks(userId?: string): Promise<TaskAggregate[]> {
    this.logger.debug(`Getting high priority tasks for user: ${userId || 'all'}`);
    const query = new GetHighPriorityTasksQuery(userId);
    return this.transactionService.executeReadOnly(async (entityManager) => {
      return this.queryBus.execute(query);
    });
  }

  async getTasksByUser(userId: string, filters?: {
    limit?: number;
    cursor?: string;
  }): Promise<PaginationResult<TaskAggregate>> {
    this.logger.debug(`Getting tasks for user: ${userId}`);
    const query = new GetTasksByUserQuery(userId, filters?.limit, filters?.cursor);
    return this.transactionService.executeReadOnly(async (entityManager) => {
      return this.queryBus.execute(query);
    });
  }

  // Dashboard and analytics
  async getTaskDashboard(userId: string): Promise<any> {
    this.logger.debug(`Getting task dashboard for user: ${userId}`);
    
    const [tasks, statistics, overdueTasks, highPriorityTasks] = await Promise.all([
      this.getTasks({ userId, limit: 10 }),
      this.getTaskStatistics(userId),
      this.getOverdueTasks(userId),
      this.getHighPriorityTasks(userId),
    ]);

    return {
      recentTasks: tasks.data,
      statistics,
      overdueTasks: overdueTasks.slice(0, 5),
      highPriorityTasks: highPriorityTasks.slice(0, 5),
      lastUpdated: new Date(),
    };
  }

  async getTaskAnalytics(userId?: string): Promise<any> {
    this.logger.debug(`Getting task analytics for user: ${userId || 'all'}`);
    
    const [statistics, overdueTasks, highPriorityTasks] = await Promise.all([
      this.getTaskStatistics(userId),
      this.getOverdueTasks(userId),
      this.getHighPriorityTasks(userId),
    ]);

    return {
      statistics,
      overdueTasks,
      highPriorityTasks,
      generatedAt: new Date(),
    };
  }
}
