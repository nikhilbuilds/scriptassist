import { BaseEntity } from './base.entity';
import { TaskStatus, TaskStatusEnum } from '../value-objects/task-status.value-object';
import { TaskPriority, TaskPriorityEnum } from '../value-objects/task-priority.value-object';
import { DomainEvent } from '../events/domain-event';
import { 
  TaskCreatedEvent, 
  TaskStatusChangedEvent, 
  TaskPriorityChangedEvent, 
  TaskCompletedEvent,
  TaskOverdueEvent 
} from '../events/task-events';

export class TaskAggregate extends BaseEntity {
  private title: string;
  private description: string;
  private status: TaskStatus;
  private priority: TaskPriority;
  private userId: string;
  private dueDate?: Date;
  private version: number = 0;
  private uncommittedEvents: DomainEvent[] = [];

  constructor(
    title: string,
    description: string,
    userId: string,
    priority: TaskPriorityEnum = TaskPriorityEnum.MEDIUM,
    dueDate?: Date
  ) {
    super();
    this.title = title;
    this.description = description;
    this.userId = userId;
    this.status = TaskStatus.create(TaskStatusEnum.PENDING);
    this.priority = TaskPriority.create(priority);
    this.dueDate = dueDate;

    // Raise creation event
    this.raiseEvent(new TaskCreatedEvent(
      this.id,
      this.title,
      this.description,
      this.status.getValue(),
      this.priority.getValue(),
      this.userId,
      this.dueDate
    ));
  }

  // Domain methods
  changeStatus(newStatus: TaskStatusEnum, changedBy: string): void {
    if (!this.status.canTransitionTo(newStatus)) {
      throw new Error(`Invalid status transition from ${this.status.getValue()} to ${newStatus}`);
    }

    const oldStatus = this.status.getValue();
    this.status = TaskStatus.create(newStatus);

    this.raiseEvent(new TaskStatusChangedEvent(
      this.id,
      oldStatus,
      newStatus,
      changedBy
    ));

    // Special handling for completion
    if (newStatus === TaskStatusEnum.COMPLETED) {
      this.raiseEvent(new TaskCompletedEvent(
        this.id,
        changedBy,
        new Date()
      ));
    }
  }

  changePriority(newPriority: TaskPriorityEnum, changedBy: string): void {
    const oldPriority = this.priority.getValue();
    this.priority = TaskPriority.create(newPriority);

    this.raiseEvent(new TaskPriorityChangedEvent(
      this.id,
      oldPriority,
      newPriority,
      changedBy
    ));
  }

  updateDetails(title?: string, description?: string): void {
    if (title !== undefined) this.title = title;
    if (description !== undefined) this.description = description;
  }

  setDueDate(dueDate: Date): void {
    this.dueDate = dueDate;
  }

  markAsOverdue(): void {
    if (this.dueDate && this.dueDate < new Date() && this.status.isActive()) {
      const overdueDays = Math.floor((new Date().getTime() - this.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      this.raiseEvent(new TaskOverdueEvent(
        this.id,
        this.dueDate,
        overdueDays
      ));
    }
  }

  isOverdue(): boolean {
    return this.dueDate !== undefined && 
           this.dueDate < new Date() && 
           this.status.isActive();
  }

  canBeCompleted(): boolean {
    return this.status.getValue() === TaskStatusEnum.IN_PROGRESS;
  }

  isHighPriority(): boolean {
    return this.priority.isHigh();
  }

  // Event sourcing methods
  private raiseEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
    this.version++;
  }

  getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents];
  }

  markEventsAsCommitted(): void {
    this.uncommittedEvents = [];
  }

  getVersion(): number {
    return this.version;
  }

  // Validation
  validate(): boolean {
    return this.title.length > 0 && 
           this.title.length <= 255 &&
           this.userId.length > 0;
  }

  // DTO conversion
  toDTO(): any {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      status: this.status.getValue(),
      priority: this.priority.getValue(),
      userId: this.userId,
      dueDate: this.dueDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isOverdue: this.isOverdue(),
      canBeCompleted: this.canBeCompleted(),
      isHighPriority: this.isHighPriority(),
    };
  }

  // Getters
  getTitle(): string { return this.title; }
  getDescription(): string { return this.description; }
  getStatus(): TaskStatus { return this.status; }
  getPriority(): TaskPriority { return this.priority; }
  getUserId(): string { return this.userId; }
  getDueDate(): Date | undefined { return this.dueDate; }
}
