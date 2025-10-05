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
  ValidationPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TaskFilterDto } from './dto/task-filter.dto';
import { BatchCreateTasksDto } from './dto/batch-create-tasks.dto';
import { BatchDeleteTasksDto } from './dto/batch-delete-tasks.dto';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  create(@Body() createTaskDto: CreateTaskDto, @CurrentUser() user: { id: string }) {
    return this.tasksService.create(createTaskDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Find all tasks for current user with optional filtering' })
  async findAll(
    @CurrentUser() user: { id: string },
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    )
    filterDto: TaskFilterDto,
  ) {
    const { status, priority, page = 1, limit = 10 } = filterDto;
    const filters = {
      ...(status && { status }),
      ...(priority && { priority }),
    };

    const hasFilters = status || priority;

    if (hasFilters || page > 1) {
      return this.tasksService.findWithFiltersForUser(user.id, filters, { page, limit });
    }

    const tasks = await this.tasksService.findAllForUser(user.id);
    return {
      data: tasks.slice(0, limit),
      total: tasks.length,
      page: 1,
      limit,
      totalPages: Math.ceil(tasks.length / limit),
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics for current user' })
  async getStats(@CurrentUser() user: { id: string }) {
    return this.tasksService.getStatisticsForUser(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID (only if it belongs to current user)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.tasksService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task (only if it belongs to current user)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.tasksService.update(id, updateTaskDto, user.id);
  }

  @Delete('batch')
  @ApiOperation({ summary: "Batch delete multiple tasks (only user's own tasks)" })
  async batchDelete(
    @Body() batchDeleteDto: BatchDeleteTasksDto,
    @CurrentUser() user: { id: string },
  ) {
    const deletedCount = await this.tasksService.batchDeleteForUser(
      batchDeleteDto.taskIds,
      user.id,
    );

    return {
      message: `${deletedCount} tasks deleted successfully`,
      deletedCount,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task (only if it belongs to current user)' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    await this.tasksService.remove(id, user.id);
    return { message: 'Task deleted successfully' };
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch create multiple tasks for current user' })
  async batchCreate(
    @Body() batchCreateDto: BatchCreateTasksDto,
    @CurrentUser() user: { id: string },
  ) {
    const result = await this.tasksService.batchCreate(batchCreateDto.tasks, user.id);

    return {
      message: `${result.createdCount} tasks created successfully`,
      createdCount: result.createdCount,
      tasks: result.tasks,
    };
  }
}
