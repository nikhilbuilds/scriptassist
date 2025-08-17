import { BaseQuery } from './base.query';
import { TaskStatusEnum } from '../../domain/value-objects/task-status.value-object';
import { TaskPriorityEnum } from '../../domain/value-objects/task-priority.value-object';

export class GetTaskByIdQuery extends BaseQuery {
  constructor(
    public readonly taskId: string
  ) {
    super();
  }

  getQueryType(): string {
    return 'GetTaskById';
  }
}

export class GetTasksQuery extends BaseQuery {
  constructor(
    public readonly userId?: string,
    public readonly status?: TaskStatusEnum,
    public readonly priority?: TaskPriorityEnum,
    public readonly search?: string,
    public readonly dueDateFrom?: Date,
    public readonly dueDateTo?: Date,
    public readonly createdFrom?: Date,
    public readonly createdTo?: Date,
    public readonly overdue?: boolean,
    public readonly includeCompleted?: boolean,
    public readonly limit?: number,
    public readonly cursor?: string,
    public readonly orderBy?: string,
    public readonly orderDirection?: 'ASC' | 'DESC'
  ) {
    super();
  }

  getQueryType(): string {
    return 'GetTasks';
  }
}

export class GetTaskStatisticsQuery extends BaseQuery {
  constructor(
    public readonly userId?: string
  ) {
    super();
  }

  getQueryType(): string {
    return 'GetTaskStatistics';
  }
}

export class GetOverdueTasksQuery extends BaseQuery {
  constructor(
    public readonly userId?: string,
    public readonly limit?: number
  ) {
    super();
  }

  getQueryType(): string {
    return 'GetOverdueTasks';
  }
}

export class GetHighPriorityTasksQuery extends BaseQuery {
  constructor(
    public readonly userId?: string,
    public readonly limit?: number
  ) {
    super();
  }

  getQueryType(): string {
    return 'GetHighPriorityTasks';
  }
}

export class GetTasksByUserQuery extends BaseQuery {
  constructor(
    public readonly userId: string,
    public readonly limit?: number,
    public readonly cursor?: string
  ) {
    super();
  }

  getQueryType(): string {
    return 'GetTasksByUser';
  }
}
