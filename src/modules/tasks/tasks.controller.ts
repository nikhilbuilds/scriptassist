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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/enum/user-role.enum';
import { TaskFilterDto } from './dto/task-filter.dto';
import { BatchCreateTasksDto } from './dto/batch-create-tasks.dto';
import { BatchDeleteTasksDto } from './dto/batch-delete-tasks.dto';
import type { AuthUser } from '../../common/types';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Create a new task' })
  create(@Body() createTaskDto: CreateTaskDto, @CurrentUser() user: AuthUser) {
    return this.tasksService.create(createTaskDto, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Find all tasks with optional filtering (scoped by role)' })
  async findAll(
    @CurrentUser() user: AuthUser,
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
      return this.tasksService.findWithFiltersForUser(user, filters, {
        pagination: { page, limit },
      });
    }

    const tasks = await this.tasksService.findAllForUser(user);
    return {
      data: tasks.slice(0, limit),
      total: tasks.length,
      page: 1,
      limit,
      totalPages: Math.ceil(tasks.length / limit),
    };
  }

  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Get task statistics (scoped by role)' })
  async getStats(@CurrentUser() user: AuthUser) {
    return this.tasksService.getStatisticsForUser(user);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Find a task by ID (ownership enforced for regular users)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.tasksService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Update a task (ownership enforced for regular users)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.update(id, updateTaskDto, user);
  }

  @Delete('batch')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Batch delete multiple tasks (scoped by role)' })
  async batchDelete(@Body() batchDeleteDto: BatchDeleteTasksDto, @CurrentUser() user: AuthUser) {
    const deletedCount = await this.tasksService.batchDeleteForUser(batchDeleteDto.taskIds, user);

    return {
      message: `${deletedCount} tasks deleted successfully`,
      deletedCount,
    };
  }

  @Delete('batch/async')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Batch delete multiple tasks asynchronously via queue' })
  async batchDeleteAsync(
    @Body() batchDeleteDto: BatchDeleteTasksDto,
    @CurrentUser() user: AuthUser,
  ) {
    const job = await this.tasksService.queueBulkDelete(batchDeleteDto.taskIds, user);

    return {
      message: 'Tasks queued for deletion',
      jobId: job.id,
      taskCount: batchDeleteDto.taskIds.length,
      status: 'queued',
    };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Delete a task (ownership enforced for regular users)' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.tasksService.remove(id, user);
    return { message: 'Task deleted successfully' };
  }

  @Post('batch')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Batch create multiple tasks (creatorId auto-set)' })
  async batchCreate(@Body() batchCreateDto: BatchCreateTasksDto, @CurrentUser() user: AuthUser) {
    const result = await this.tasksService.batchCreate(batchCreateDto.tasks, user);

    return {
      message: `${result.createdCount} tasks created successfully`,
      createdCount: result.createdCount,
      tasks: result.tasks,
    };
  }

  @Post('batch/async')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Batch create multiple tasks asynchronously via queue' })
  async batchCreateAsync(
    @Body() batchCreateDto: BatchCreateTasksDto,
    @CurrentUser() user: AuthUser,
  ) {
    const job = await this.tasksService.queueBulkCreate(batchCreateDto.tasks, user);

    return {
      message: 'Tasks queued for creation',
      jobId: job.id,
      taskCount: batchCreateDto.tasks.length,
      status: 'queued',
    };
  }
}
