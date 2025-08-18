import {
  IsOptional,
  IsEnum,
  IsString,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

export class TaskFilterDto {
  @ApiPropertyOptional({
    description: 'Filter tasks by status',
    enum: TaskStatus,
    example: TaskStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    description: 'Filter tasks by priority',
    enum: TaskPriority,
    example: TaskPriority.HIGH,
  })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: 'Filter tasks by user ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Search query to filter tasks by title or description',
    example: 'urgent meeting',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Min(2)
  @Max(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks created after this date',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  createdAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks created before this date',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  createdBefore?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks due after this date',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dueAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks due before this date',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  dueBefore?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks that are overdue',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({
    description: 'Filter tasks that are completed',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional({
    description: 'Filter tasks that have a due date',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  hasDueDate?: boolean;

  @ApiPropertyOptional({
    description: 'Page number for pagination (starts from 1)',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    example: 'createdAt',
    enum: ['title', 'status', 'priority', 'dueDate', 'createdAt', 'updatedAt'],
  })
  @IsOptional()
  @IsString()
  sortBy?: 'title' | 'status' | 'priority' | 'dueDate' | 'createdAt' | 'updatedAt' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'DESC',
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({
    description: 'Include related user data in response',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeUser?: boolean = false;

  @ApiPropertyOptional({
    description: 'Include task statistics in response',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeStats?: boolean = false;

  @ApiPropertyOptional({
    description: 'Filter tasks by tags (comma-separated)',
    example: 'urgent,meeting,project',
  })
  @IsOptional()
  @IsString()
  @Max(500)
  tags?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks by assignee',
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsString()
  @Max(255)
  assignee?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks by project or category',
    example: 'backend-development',
  })
  @IsOptional()
  @IsString()
  @Max(100)
  project?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks updated after this date',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  updatedAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks updated before this date',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  updatedBefore?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks by completion date range',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  completedAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks by completion date range',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  completedBefore?: string;

  /**
   * Get the offset for database queries based on page and limit
   */
  getOffset(): number {
    const page = this.page || 1;
    const limit = this.limit || 10;
    return (page - 1) * limit;
  }

  /**
   * Get the limit for database queries
   */
  getLimit(): number {
    return this.limit || 10;
  }

  /**
   * Get the page number
   */
  getPage(): number {
    return this.page || 1;
  }

  /**
   * Get parsed tags as an array
   */
  getTagsArray(): string[] {
    if (!this.tags) return [];
    return this.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  }

  /**
   * Check if any date filters are applied
   */
  hasDateFilters(): boolean {
    return !!(
      this.createdAfter ||
      this.createdBefore ||
      this.dueAfter ||
      this.dueBefore ||
      this.updatedAfter ||
      this.updatedBefore ||
      this.completedAfter ||
      this.completedBefore
    );
  }

  /**
   * Check if any status filters are applied
   */
  hasStatusFilters(): boolean {
    return !!(this.status || this.overdue !== undefined || this.completed !== undefined);
  }

  /**
   * Check if search is applied
   */
  hasSearch(): boolean {
    return !!(this.search && this.search.trim().length > 0);
  }

  /**
   * Get a summary of applied filters for logging
   */
  getFilterSummary(): Record<string, any> {
    return {
      status: this.status,
      priority: this.priority,
      userId: this.userId,
      search: this.hasSearch() ? '[SEARCH_APPLIED]' : undefined,
      dateFilters: this.hasDateFilters() ? '[DATE_FILTERS_APPLIED]' : undefined,
      overdue: this.overdue,
      completed: this.completed,
      hasDueDate: this.hasDueDate,
      page: this.getPage(),
      limit: this.getLimit(),
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
      includeUser: this.includeUser,
      includeStats: this.includeStats,
      tags: this.getTagsArray(),
      assignee: this.assignee,
      project: this.project,
    };
  }
}
