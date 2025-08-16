export enum TaskPriorityEnum {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class TaskPriority {
  private readonly value: TaskPriorityEnum;

  constructor(priority: TaskPriorityEnum) {
    this.value = priority;
  }

  getValue(): TaskPriorityEnum {
    return this.value;
  }

  getWeight(): number {
    const weights: Record<TaskPriorityEnum, number> = {
      [TaskPriorityEnum.LOW]: 1,
      [TaskPriorityEnum.MEDIUM]: 2,
      [TaskPriorityEnum.HIGH]: 3,
      [TaskPriorityEnum.URGENT]: 4,
    };
    return weights[this.value];
  }

  isHigherThan(other: TaskPriority): boolean {
    return this.getWeight() > other.getWeight();
  }

  isUrgent(): boolean {
    return this.value === TaskPriorityEnum.URGENT;
  }

  isHigh(): boolean {
    return this.value === TaskPriorityEnum.HIGH || this.value === TaskPriorityEnum.URGENT;
  }

  equals(other: TaskPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  static create(priority: TaskPriorityEnum): TaskPriority {
    return new TaskPriority(priority);
  }

  static LOW = new TaskPriority(TaskPriorityEnum.LOW);
  static MEDIUM = new TaskPriority(TaskPriorityEnum.MEDIUM);
  static HIGH = new TaskPriority(TaskPriorityEnum.HIGH);
  static URGENT = new TaskPriority(TaskPriorityEnum.URGENT);
}
