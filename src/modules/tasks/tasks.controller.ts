import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, HttpException, HttpStatus, UseInterceptors, Req } from '@nestjs/common';
import { Request } from 'express';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { BatchTaskDto, BatchAction } from './dto/batch-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags, ApiResponse, ApiBody } from '@nestjs/swagger';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { SimpleRateLimitGuard } from '../../common/guards/simple-rate-limit.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, SimpleRateLimitGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
  ) {}

  @Post()
  @ApiOperation({ 
    summary: 'Create a new task',
    description: 'Create a new task for the authenticated user. User ID is automatically extracted from JWT token.'
  })
  @ApiBody({ type: CreateTaskDto })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  create(@Body() createTaskDto: CreateTaskDto, @CurrentUser() user: any) {
    // Automatically use the user ID from JWT token
    const taskWithUserId = {
      ...createTaskDto,
      userId: user.id // Add user ID from JWT token
    };
    

    
    return this.tasksService.create(taskWithUserId);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Get all tasks for current user',
    description: 'Retrieve all tasks for the authenticated user with optional filtering by status/priority and pagination support.'
  })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by task status' })
  @ApiQuery({ name: 'priority', required: false, description: 'Filter by task priority' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10, max: 100)' })
  @ApiResponse({ status: 200, description: 'Tasks retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async findAll(
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any,
  ) {
    return this.tasksService.findAll({
      status,
      priority,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      userId: user?.id // Filter by current user's tasks
    });
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Get task statistics',
    description: 'Retrieve aggregated statistics for all tasks including total, completed, in-progress, pending, and high-priority counts.'
  })
  @ApiResponse({ status: 200, description: 'Task statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async getStats() {
    return this.tasksService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Param('id') id: string) {
    const task = await this.tasksService.findOne(id);
    
    if (!task) {
      // Inefficient error handling: Revealing internal details
      throw new HttpException(`Task with ID ${id} not found in the database`, HttpStatus.NOT_FOUND);
    }
    
    return task;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    // No validation if task exists before update
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  remove(@Param('id') id: string) {
    // No validation if task exists before removal
    // No status code returned for success
    return this.tasksService.remove(id);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks for current user' })
  @ApiResponse({ status: 200, description: 'Batch operation completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async batchProcess(
    @Body() batchTaskDto: BatchTaskDto,
    @CurrentUser() user: any
  ) {
    const { tasks: taskIds, action } = batchTaskDto;
    const results = [];
    
    // Process tasks for current user only
    for (const taskId of taskIds) {
      try {
        // First verify the task belongs to the current user
        const task = await this.tasksService.findOne(taskId);
        
        if (!task) {
          results.push({ taskId, success: false, error: 'Task not found' });
          continue;
        }
        
        if (task.userId !== user.id) {
          results.push({ taskId, success: false, error: 'Access denied - task does not belong to current user' });
          continue;
        }
        
        let result;
        
        switch (action) {
          case BatchAction.COMPLETE:
            result = await this.tasksService.update(taskId, { status: TaskStatus.COMPLETED });
            break;
          case BatchAction.IN_PROGRESS:
            result = await this.tasksService.update(taskId, { status: TaskStatus.IN_PROGRESS });
            break;
          case BatchAction.DELETE:
            result = await this.tasksService.remove(taskId);
            break;
          default:
            throw new HttpException(`Unknown action: ${action}`, HttpStatus.BAD_REQUEST);
        }
        
        results.push({ taskId, success: true, result });
      } catch (error) {
        results.push({ 
          taskId, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return {
      message: `Batch processed ${taskIds.length} tasks`,
      action,
      userId: user.id,
      results
    };
  }
} 