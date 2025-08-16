import { BaseCommand } from './base.command';
import { TaskPriorityEnum } from '../../domain/value-objects/task-priority.value-object';

export class CreateTaskCommand extends BaseCommand {
  constructor(
    public readonly title: string,
    public readonly description: string,
    public readonly userId: string,
    public readonly priority: TaskPriorityEnum,
    public readonly dueDate?: Date
  ) {
    super();
  }

  getCommandType(): string {
    return 'CreateTask';
  }
}

export class UpdateTaskCommand extends BaseCommand {
  constructor(
    public readonly taskId: string,
    public readonly title?: string,
    public readonly description?: string,
    public readonly priority?: TaskPriorityEnum,
    public readonly dueDate?: Date
  ) {
    super();
  }

  getCommandType(): string {
    return 'UpdateTask';
  }
}

export class ChangeTaskStatusCommand extends BaseCommand {
  constructor(
    public readonly taskId: string,
    public readonly newStatus: string,
    public readonly changedBy: string
  ) {
    super();
  }

  getCommandType(): string {
    return 'ChangeTaskStatus';
  }
}

export class ChangeTaskPriorityCommand extends BaseCommand {
  constructor(
    public readonly taskId: string,
    public readonly newPriority: TaskPriorityEnum,
    public readonly changedBy: string
  ) {
    super();
  }

  getCommandType(): string {
    return 'ChangeTaskPriority';
  }
}

export class CompleteTaskCommand extends BaseCommand {
  constructor(
    public readonly taskId: string,
    public readonly completedBy: string
  ) {
    super();
  }

  getCommandType(): string {
    return 'CompleteTask';
  }
}

export class DeleteTaskCommand extends BaseCommand {
  constructor(
    public readonly taskId: string,
    public readonly deletedBy: string
  ) {
    super();
  }

  getCommandType(): string {
    return 'DeleteTask';
  }
}

export class BulkCreateTasksCommand extends BaseCommand {
  constructor(
    public readonly tasks: Array<{
      title: string;
      description: string;
      userId: string;
      priority: TaskPriorityEnum;
      dueDate?: Date;
    }>
  ) {
    super();
  }

  getCommandType(): string {
    return 'BulkCreateTasks';
  }
}

export class BulkUpdateTaskStatusCommand extends BaseCommand {
  constructor(
    public readonly taskIds: string[],
    public readonly newStatus: string,
    public readonly changedBy: string
  ) {
    super();
  }

  getCommandType(): string {
    return 'BulkUpdateTaskStatus';
  }
}
