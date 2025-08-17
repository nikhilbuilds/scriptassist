import { DomainEvent } from './domain-event';
import { TaskStatusEnum } from '../value-objects/task-status.value-object';
import { TaskPriorityEnum } from '../value-objects/task-priority.value-object';

export class TaskCreatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly title: string,
    public readonly description: string,
    public readonly status: TaskStatusEnum,
    public readonly priority: TaskPriorityEnum,
    public readonly userId: string,
    public readonly dueDate?: Date
  ) {
    super(aggregateId);
  }

  getEventData(): any {
    return {
      title: this.title,
      description: this.description,
      status: this.status,
      priority: this.priority,
      userId: this.userId,
      dueDate: this.dueDate,
    };
  }
}

export class TaskStatusChangedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly oldStatus: TaskStatusEnum,
    public readonly newStatus: TaskStatusEnum,
    public readonly changedBy: string
  ) {
    super(aggregateId);
  }

  getEventData(): any {
    return {
      oldStatus: this.oldStatus,
      newStatus: this.newStatus,
      changedBy: this.changedBy,
    };
  }
}

export class TaskPriorityChangedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly oldPriority: TaskPriorityEnum,
    public readonly newPriority: TaskPriorityEnum,
    public readonly changedBy: string
  ) {
    super(aggregateId);
  }

  getEventData(): any {
    return {
      oldPriority: this.oldPriority,
      newPriority: this.newPriority,
      changedBy: this.changedBy,
    };
  }
}

export class TaskCompletedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly completedBy: string,
    public readonly completedAt: Date
  ) {
    super(aggregateId);
  }

  getEventData(): any {
    return {
      completedBy: this.completedBy,
      completedAt: this.completedAt,
    };
  }
}

export class TaskOverdueEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly dueDate: Date,
    public readonly overdueDays: number
  ) {
    super(aggregateId);
  }

  getEventData(): any {
    return {
      dueDate: this.dueDate,
      overdueDays: this.overdueDays,
    };
  }
}
