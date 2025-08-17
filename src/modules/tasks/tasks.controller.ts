import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  HttpException,
  HttpStatus,
  UseInterceptors,
  ValidationPipe,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { TaskResponseDto } from './dto/task-response.dto';

/**
 * TasksController - REST API endpoints for task management
 *
 * This controller provides:
 * - CRUD operations for tasks
 * - Advanced filtering and pagination
 * - Role-based access control
 * - Rate limiting for API protection
 * - Comprehensive validation and error handling
 *
 * Security Features:
 * - JWT authentication required for all endpoints
 * - Role-based authorization
 * - Rate limiting to prevent abuse
 * - Input validation and sanitization
 *
 * Performance Features:
 * - Efficient pagination with metadata
 * - Database-level filtering and sorting
 * - Proper error handling without information leakage
 */
@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new task',
    description: 'Creates a new task with proper validation and background processing',
  })
  @ApiResponse({
    status: 201,
    description: 'Task created successfully',
    type: TaskResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async create(
    @Body(ValidationPipe) createTaskDto: CreateTaskDto,
    @CurrentUser() user: User,
  ): Promise<TaskResponseDto> {
    try {
      // Ensure the task is assigned to the current user
      const taskWithUser = {
        ...createTaskDto,
        userId: user.id,
      };

      const task = await this.tasksService.create(taskWithUser);
      return this.mapToResponseDto(task);
    } catch (error) {
      throw new BadRequestException('Failed to create task');
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Find all tasks with filtering and pagination',
    description: 'Retrieves tasks with advanced filtering, sorting, and pagination capabilities',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TaskStatus,
    description: 'Filter by task status',
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    enum: TaskPriority,
    description: 'Filter by task priority',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10, max: 100)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Sort field (default: createdAt)',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['ASC', 'DESC'],
    description: 'Sort order (default: DESC)',
  })
  @ApiResponse({
    status: 200,
    description: 'Tasks retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/TaskResponseDto' },
        },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
            totalPages: { type: 'number' },
            hasNext: { type: 'boolean' },
            hasPrev: { type: 'boolean' },
          },
        },
      },
    },
  })
  async findAll(
    @Query('status') status?: TaskStatus,
    @Query('priority') priority?: TaskPriority,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number = 10,
    @Query('sortBy', new DefaultValuePipe('createdAt')) sortBy: string = 'createdAt',
    @Query('sortOrder', new DefaultValuePipe('DESC')) sortOrder: 'ASC' | 'DESC' = 'DESC',
    @CurrentUser() user?: User,
  ) {
    try {
      // Validate pagination parameters
      if (page < 1 || limit < 1 || limit > 100) {
        throw new BadRequestException('Invalid pagination parameters');
      }

      // Validate sort field
      const allowedSortFields = [
        'createdAt',
        'updatedAt',
        'dueDate',
        'title',
        'priority',
        'status',
      ];
      if (!allowedSortFields.includes(sortBy)) {
        throw new BadRequestException('Invalid sort field');
      }

      const result = await this.tasksService.findAll({
        status,
        priority,
        userId: user?.id, // Filter by current user for non-admin users
        page,
        limit,
        sortBy,
        sortOrder,
      });

      return {
        data: result.data.map(task => this.mapToResponseDto(task)),
        meta: result.meta,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new HttpException('Failed to retrieve tasks', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get task statistics',
    description: 'Retrieves comprehensive task statistics with efficient SQL aggregation',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        completed: { type: 'number' },
        inProgress: { type: 'number' },
        pending: { type: 'number' },
        overdue: { type: 'number' },
        highPriority: { type: 'number' },
        mediumPriority: { type: 'number' },
        lowPriority: { type: 'number' },
      },
    },
  })
  async getStats(@CurrentUser() user?: User) {
    try {
      // For now, return global stats. In a real application, you might want
      // to filter by user role or provide both global and user-specific stats
      return await this.tasksService.getStatistics();
    } catch (error) {
      throw new HttpException('Failed to retrieve statistics', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Find a task by ID',
    description: 'Retrieves a specific task by its unique identifier',
  })
  @ApiParam({
    name: 'id',
    description: 'Task ID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Task retrieved successfully',
    type: TaskResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  async findOne(@Param('id') id: string, @CurrentUser() user?: User): Promise<TaskResponseDto> {
    try {
      const task = await this.tasksService.findOne(id);

      // Ensure user can only access their own tasks (unless admin)
      if (user && user.role !== 'admin' && task.userId !== user.id) {
        throw new HttpException('Access denied', HttpStatus.FORBIDDEN);
      }

      return this.mapToResponseDto(task);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Task not found', HttpStatus.NOT_FOUND);
    }
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a task',
    description: 'Updates an existing task with transaction management and change tracking',
  })
  @ApiParam({
    name: 'id',
    description: 'Task ID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Task updated successfully',
    type: TaskResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateTaskDto: UpdateTaskDto,
    @CurrentUser() user?: User,
  ): Promise<TaskResponseDto> {
    try {
      // First check if user has access to this task
      const existingTask = await this.tasksService.findOne(id);

      if (user && user.role !== 'admin' && existingTask.userId !== user.id) {
        throw new HttpException('Access denied', HttpStatus.FORBIDDEN);
      }

      const task = await this.tasksService.update(id, updateTaskDto);
      return this.mapToResponseDto(task);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to update task', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a task',
    description: 'Deletes a task with proper cleanup and background processing',
  })
  @ApiParam({
    name: 'id',
    description: 'Task ID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Task deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  async remove(@Param('id') id: string, @CurrentUser() user?: User): Promise<{ message: string }> {
    try {
      // First check if user has access to this task
      const existingTask = await this.tasksService.findOne(id);

      if (user && user.role !== 'admin' && existingTask.userId !== user.id) {
        throw new HttpException('Access denied', HttpStatus.FORBIDDEN);
      }

      await this.tasksService.remove(id);
      return { message: 'Task deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to delete task', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('batch')
  @Roles('admin')
  @ApiOperation({
    summary: 'Create multiple tasks (Admin only)',
    description: 'Creates multiple tasks in a single operation with transaction management',
  })
  @ApiResponse({
    status: 201,
    description: 'Tasks created successfully',
    type: [TaskResponseDto],
  })
  async createBatch(
    @Body(ValidationPipe) createTaskDtos: CreateTaskDto[],
    @CurrentUser() user?: User,
  ): Promise<TaskResponseDto[]> {
    try {
      if (!Array.isArray(createTaskDtos) || createTaskDtos.length === 0) {
        throw new BadRequestException('Invalid batch data');
      }

      if (createTaskDtos.length > 100) {
        throw new BadRequestException('Batch size cannot exceed 100 items');
      }

      const tasks = [];
      for (const createTaskDto of createTaskDtos) {
        const taskWithUser = {
          ...createTaskDto,
          userId: user?.id || '',
        };
        const task = await this.tasksService.create(taskWithUser);
        tasks.push(this.mapToResponseDto(task));
      }

      return tasks;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new HttpException('Failed to create batch tasks', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Maps internal task entity to response DTO
   *
   * @param task Task entity
   * @returns TaskResponseDto
   */
  private mapToResponseDto(task: any): TaskResponseDto {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      user: task.user
        ? {
            id: task.user.id,
            name: task.user.name,
            email: task.user.email,
          }
        : undefined,
    };
  }
}
