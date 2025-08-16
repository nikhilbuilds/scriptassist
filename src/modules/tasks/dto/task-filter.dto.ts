import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TaskPriority } from '../enums/task-priority.enum';
import { TaskStatus } from '../enums/task-status.enum';
import { PaginationDto } from '@common/dto/pagination.dto';

export class TaskFilterDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: TaskStatus,
    description: 'Filter tasks by their status.',
  })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiPropertyOptional({
    enum: TaskPriority,
    description: 'Filter tasks by their priority.',
  })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: 'Search tasks by a keyword in their title or description.',
    example: 'review',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks created on or after this date.',
    example: '2025-08-16',
  })
  @IsDateString()
  @IsOptional()
  @Type(() => Date)
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter tasks created on or before this date.',
    example: '2025-08-18',
  })
  @IsDateString()
  @IsOptional()
  @Type(() => Date)
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  endDate?: Date;
}
