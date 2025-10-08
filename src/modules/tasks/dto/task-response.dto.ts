import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

export class TaskResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Unique task identifier',
  })
  id: string;

  @ApiProperty({ example: 'Complete project documentation', description: 'Task title' })
  title: string;

  @ApiProperty({
    example: 'Write comprehensive API documentation with examples',
    description: 'Task description',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    enum: TaskStatus,
    example: TaskStatus.PENDING,
    description: 'Current status of the task',
  })
  status: TaskStatus;

  @ApiProperty({
    enum: TaskPriority,
    example: TaskPriority.HIGH,
    description: 'Priority level of the task',
  })
  priority: TaskPriority;

  @ApiProperty({
    example: '2025-12-31T23:59:59.000Z',
    description: 'Task due date',
    nullable: true,
  })
  dueDate: Date | null;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID of the user who owns this task',
  })
  userId: string;

  @ApiProperty({
    example: 1,
    description: 'Version number for optimistic locking',
  })
  version: number;

  @ApiProperty({
    example: '2025-10-01T10:30:00.000Z',
    description: 'Task creation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2025-10-05T14:20:00.000Z',
    description: 'Task last update timestamp',
  })
  updatedAt: Date;
}

export class PaginatedTaskResponseDto {
  @ApiProperty({
    type: [TaskResponseDto],
    description: 'Array of tasks for current page',
  })
  data: TaskResponseDto[];

  @ApiProperty({ example: 100, description: 'Total number of tasks' })
  total: number;

  @ApiProperty({ example: 1, description: 'Current page number' })
  page: number;

  @ApiProperty({ example: 10, description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ example: 10, description: 'Total number of pages' })
  totalPages: number;
}

export class BatchTaskResponseDto {
  @ApiProperty({
    type: [TaskResponseDto],
    description: 'Array of created tasks',
  })
  tasks: TaskResponseDto[];

  @ApiProperty({ example: 5, description: 'Number of tasks created' })
  createdCount: number;
}

export class BatchDeleteResponseDto {
  @ApiProperty({ example: 'Tasks deleted successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ example: 5, description: 'Number of tasks deleted' })
  deletedCount: number;
}

export class TaskStatsResponseDto {
  @ApiProperty({ example: 25, description: 'Total number of tasks' })
  total: number;

  @ApiProperty({ example: 10, description: 'Number of pending tasks' })
  pending: number;

  @ApiProperty({ example: 8, description: 'Number of in-progress tasks' })
  inProgress: number;

  @ApiProperty({ example: 7, description: 'Number of completed tasks' })
  completed: number;

  @ApiProperty({ example: 5, description: 'Number of high priority tasks' })
  highPriority: number;

  @ApiProperty({ example: 3, description: 'Number of overdue tasks' })
  overdue: number;
}
