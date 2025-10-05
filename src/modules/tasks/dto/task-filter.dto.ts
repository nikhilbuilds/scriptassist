import { IsEnum, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

export class TaskFilterDto {
  @ApiProperty({
    enum: TaskStatus,
    required: false,
    description: 'Filter tasks by status (case-insensitive)',
    example: 'PENDING',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    const upperValue = value.toString().toUpperCase();
    if (Object.values(TaskStatus).includes(upperValue as TaskStatus)) {
      return upperValue as TaskStatus;
    }
    return value;
  })
  @IsEnum(TaskStatus, {
    message: `status must be one of: ${Object.values(TaskStatus).join(', ')}`,
  })
  status?: TaskStatus;

  @ApiProperty({
    enum: TaskPriority,
    required: false,
    description: 'Filter tasks by priority (case-insensitive)',
    example: 'HIGH',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    const upperValue = value.toString().toUpperCase();
    if (Object.values(TaskPriority).includes(upperValue as TaskPriority)) {
      return upperValue as TaskPriority;
    }
    return value;
  })
  @IsEnum(TaskPriority, {
    message: `priority must be one of: ${Object.values(TaskPriority).join(', ')}`,
  })
  priority?: TaskPriority;

  @ApiProperty({
    required: false,
    type: Number,
    minimum: 1,
    default: 1,
    description: 'Page number for pagination',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page?: number = 1;

  @ApiProperty({
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 10,
    description: 'Number of items per page',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  limit?: number = 10;
}
