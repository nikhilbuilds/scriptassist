import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, IsEnum, IsDate, IsOptional } from 'class-validator';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

/**
 * User Response DTO - User information in task responses
 */
export class UserResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  id: string;

  @ApiProperty({
    description: 'User name',
    example: 'John Doe',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'User email',
    example: 'john.doe@example.com',
  })
  @IsString()
  email: string;
}

/**
 * Task Response DTO - Task information returned by API
 *
 * This DTO defines the structure of task responses including:
 * - Task details (id, title, description, status, priority)
 * - Timestamps (createdAt, updatedAt, dueDate)
 * - Associated user information
 *
 * Security Notes:
 * - Excludes sensitive user information (password, etc.)
 * - Provides only necessary fields for client consumption
 * - Maintains data consistency across API responses
 */
export class TaskResponseDto {
  @ApiProperty({
    description: 'Task ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  id: string;

  @ApiProperty({
    description: 'Task title',
    example: 'Complete project documentation',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Task description',
    example: 'Write comprehensive documentation for the new API features',
  })
  @IsString()
  description: string;

  @ApiProperty({
    description: 'Task status',
    enum: TaskStatus,
    example: TaskStatus.IN_PROGRESS,
  })
  @IsEnum(TaskStatus)
  status: TaskStatus;

  @ApiProperty({
    description: 'Task priority',
    enum: TaskPriority,
    example: TaskPriority.HIGH,
  })
  @IsEnum(TaskPriority)
  priority: TaskPriority;

  @ApiProperty({
    description: 'Task due date',
    example: '2024-12-31T23:59:59.000Z',
    required: false,
  })
  @IsOptional()
  @IsDate()
  dueDate?: Date;

  @ApiProperty({
    description: 'Task creation timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsDate()
  createdAt: Date;

  @ApiProperty({
    description: 'Task last update timestamp',
    example: '2024-01-01T12:00:00.000Z',
  })
  @IsDate()
  updatedAt: Date;

  @ApiProperty({
    description: 'Associated user information',
    type: UserResponseDto,
    required: false,
  })
  @IsOptional()
  user?: UserResponseDto;
}
