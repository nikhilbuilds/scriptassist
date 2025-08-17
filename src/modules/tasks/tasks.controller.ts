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
  Req,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { TaskBatchProcessDTO } from './dto/task-batch-process.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { UuidDTO } from '@common/dto/uuid.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import { Request } from 'express';
import { User } from '@modules/users/entities/user.entity';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @UseGuards(RolesGuard)
  @Roles('user')
  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @ApiOperation({ summary: 'Find all tasks with optional filtering' })
  async findAll(@Req() request: Request, @Query() taskFilterDto: TaskFilterDto) {
    const { tasks, metaData } = await this.tasksService.findAll(taskFilterDto);
    return {
      data: tasks,
      meta: metaData,
    };
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics' })
  async getStats() {
    return this.tasksService.getStats();
  }

  @UseGuards(RolesGuard)
  @Roles('user')
  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Req() request: Request, @Param() uuidDto: UuidDTO) {
    const task = await this.tasksService.findOne(uuidDto.id, (request.user as User).id);
    if (!task) {
      throw new HttpException(`Task not found`, HttpStatus.NOT_FOUND);
    }
    return task;
  }

  @Roles('user')
  @UseGuards(RolesGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  update(@Req() request: Request, @Param() uuidDto: UuidDTO, @Body() updateTaskDto: UpdateTaskDto) {
    return this.tasksService.update(uuidDto.id, (request.user as User).id, updateTaskDto);
  }

  @UseGuards(RolesGuard)
  @Roles('user')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  remove(@Req() request: Request, @Param() uuidDto: UuidDTO) {
    return this.tasksService.remove(uuidDto.id, (request.user as User).id);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  async batchProcess(@Body() operations: TaskBatchProcessDTO) {
    const { tasks: taskIds, action } = operations;
    //TODO - This operation will need to be off-loaded to a queue if the taskIds length is greater than 50.
    const rowsAffected = await this.tasksService.batchProcess({ taskIds, action });
    return { tasksUpdated: rowsAffected };
  }
}
