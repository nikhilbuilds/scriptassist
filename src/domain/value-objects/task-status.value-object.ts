export enum TaskStatusEnum {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class TaskStatus {
  private readonly value: TaskStatusEnum;

  constructor(status: TaskStatusEnum) {
    this.value = status;
  }

  getValue(): TaskStatusEnum {
    return this.value;
  }

  canTransitionTo(newStatus: TaskStatusEnum): boolean {
    const validTransitions: Record<TaskStatusEnum, TaskStatusEnum[]> = {
      [TaskStatusEnum.PENDING]: [TaskStatusEnum.IN_PROGRESS, TaskStatusEnum.CANCELLED],
      [TaskStatusEnum.IN_PROGRESS]: [TaskStatusEnum.COMPLETED, TaskStatusEnum.CANCELLED],
      [TaskStatusEnum.COMPLETED]: [],
      [TaskStatusEnum.CANCELLED]: [],
    };

    return validTransitions[this.value].includes(newStatus);
  }

  isCompleted(): boolean {
    return this.value === TaskStatusEnum.COMPLETED;
  }

  isCancelled(): boolean {
    return this.value === TaskStatusEnum.CANCELLED;
  }

  isActive(): boolean {
    return this.value === TaskStatusEnum.PENDING || this.value === TaskStatusEnum.IN_PROGRESS;
  }

  equals(other: TaskStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  static create(status: TaskStatusEnum): TaskStatus {
    return new TaskStatus(status);
  }

  static PENDING = new TaskStatus(TaskStatusEnum.PENDING);
  static IN_PROGRESS = new TaskStatus(TaskStatusEnum.IN_PROGRESS);
  static COMPLETED = new TaskStatus(TaskStatusEnum.COMPLETED);
  static CANCELLED = new TaskStatus(TaskStatusEnum.CANCELLED);
}
