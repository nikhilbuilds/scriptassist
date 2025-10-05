import { Task } from './entities/task.entity';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';

export interface TaskFilterOptions {
  status?: TaskStatus;
  priority?: TaskPriority;
  userId?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TaskStatistics {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  highPriority: number;
}

export interface ITasksRepository {
  create(taskData: Partial<Task>): Promise<Task>;

  findAll(withRelations?: boolean): Promise<Task[]>;

  findWithFilters(
    filters: TaskFilterOptions,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<Task>>;

  findById(id: string, withRelations?: boolean): Promise<Task | null>;

  findByStatus(status: TaskStatus): Promise<Task[]>;

  findByUserId(userId: string): Promise<Task[]>;

  update(id: string, taskData: Partial<Task>): Promise<Task>;

  delete(id: string): Promise<void>;

  batchUpdateStatus(ids: string[], status: TaskStatus): Promise<number>;

  batchDelete(ids: string[]): Promise<number>;

  getStatistics(): Promise<TaskStatistics>;

  batchCreate(tasksData: Partial<Task>[]): Promise<Task[]>;
}

export const TASKS_REPOSITORY = Symbol('TASKS_REPOSITORY');
