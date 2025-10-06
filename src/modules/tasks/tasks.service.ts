import { Injectable, NotFoundException, ForbiddenException, Inject, Logger } from '@nestjs/common';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { UserRole } from '../users/enum/user-role.enum';
import type { AuthUser } from '../../common/types';
import type { ITasksRepository } from './tasks.repository.interface';
import {
  TASKS_REPOSITORY,
  TaskFilterOptions,
  PaginationOptions,
} from './tasks.repository.interface';

interface TaskQueryOptions {
  withRelations?: boolean;
}

interface TaskUpdateOptions {
  notifyOnStatusChange?: boolean;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  constructor(
    @Inject(TASKS_REPOSITORY)
    private readonly tasksRepository: ITasksRepository,
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
  ) {}

  private isAdminOrSuperAdmin(role: string): boolean {
    return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN;
  }

  async create(createTaskDto: CreateTaskDto, currentUser: AuthUser): Promise<Task> {
    const taskData = {
      ...createTaskDto,
      userId: currentUser.id,
    };

    const task = await this.tasksRepository.create(taskData);

    //TODO: notification layer here
    await this.taskQueue.add('task-status-update', {
      taskId: task.id,
      status: task.status,
    });

    return task;
  }

  async findAllForUser(currentUser: AuthUser, options: TaskQueryOptions = {}): Promise<Task[]> {
    const { withRelations = true } = options;

    // Super-admin and admin can see all tasks
    if (this.isAdminOrSuperAdmin(currentUser.role)) {
      return this.tasksRepository.findAll(withRelations);
    }
    // Regular users see only their own tasks
    return this.tasksRepository.findByUserId(currentUser.id);
  }

  async findWithFiltersForUser(
    currentUser: AuthUser,
    filters: TaskFilterOptions,
    options: { pagination?: PaginationOptions } = {},
  ) {
    const { pagination } = options;

    // Super-admin and admin can see all tasks with filters
    if (this.isAdminOrSuperAdmin(currentUser.role)) {
      return this.tasksRepository.findWithFilters(filters, pagination);
    }
    // Regular users see only their own tasks with filters
    const userFilters = { ...filters, userId: currentUser.id };
    return this.tasksRepository.findWithFilters(userFilters, pagination);
  }

  async findOne(id: string, currentUser: AuthUser, options: TaskQueryOptions = {}): Promise<Task> {
    const { withRelations = true } = options;

    const task = await this.tasksRepository.findById(id, withRelations);

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // Super-admin and admin can access any task, regular users only their own
    if (!this.isAdminOrSuperAdmin(currentUser.role) && task.userId !== currentUser.id) {
      throw new ForbiddenException('You do not have permission to access this task');
    }

    return task;
  }

  async findByStatusForUser(status: TaskStatus, currentUserId: string): Promise<Task[]> {
    const allUserTasks = await this.tasksRepository.findByUserId(currentUserId);
    return allUserTasks.filter(task => task.status === status);
  }

  async update(
    id: string,
    updateTaskDto: UpdateTaskDto,
    currentUser: AuthUser,
    options: TaskUpdateOptions = {},
  ): Promise<Task> {
    const existingTask = await this.findOne(id, currentUser, { withRelations: false });
    const originalStatus = existingTask.status;

    const { userId, ...updateData } = updateTaskDto;

    const updatedTask = await this.tasksRepository.update(id, updateData);

    if (updateTaskDto.status && originalStatus !== updateTaskDto.status) {
      await this.taskQueue.add('task-status-update', {
        taskId: updatedTask.id,
        status: updatedTask.status,
      });
    }

    return updatedTask;
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = await this.tasksRepository.findById(id, false);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return this.tasksRepository.update(id, { status });
  }

  async remove(id: string, currentUser: AuthUser): Promise<void> {
    await this.findOne(id, currentUser, { withRelations: false });

    //TODO: Soft delete
    //TODO: Notification layer
    await this.tasksRepository.delete(id);
  }

  async batchCreate(
    createTasksDto: CreateTaskDto[],
    currentUser: AuthUser,
  ): Promise<{ tasks: Task[]; createdCount: number }> {
    const tasksData = createTasksDto.map(dto => ({
      ...dto,
      userId: currentUser.id,
    }));

    const createdTasks = await this.tasksRepository.batchCreate(tasksData);

    const queuePromises = createdTasks.map(task =>
      this.taskQueue.add('task-status-update', {
        taskId: task.id,
        status: task.status,
      }),
    );

    await Promise.all(queuePromises);

    return {
      tasks: createdTasks,
      createdCount: createdTasks.length,
    };
  }

  async batchDeleteForUser(taskIds: string[], currentUser: AuthUser): Promise<number> {
    const tasks = await Promise.all(taskIds.map(id => this.tasksRepository.findById(id, false)));

    const notFoundIds = taskIds.filter((id, index) => !tasks[index]);
    if (notFoundIds.length > 0) {
      throw new NotFoundException(`Tasks not found: ${notFoundIds.join(', ')}`);
    }

    // Super-admin and admin can delete any tasks, regular users only their own
    if (!this.isAdminOrSuperAdmin(currentUser.role)) {
      const unauthorizedTasks = tasks.filter(task => task && task.userId !== currentUser.id);
      if (unauthorizedTasks.length > 0) {
        throw new ForbiddenException('You do not have permission to delete some of these tasks');
      }
    }

    return this.tasksRepository.batchDelete(taskIds);
  }

  async getStatisticsForUser(currentUser: AuthUser) {
    // Super-admin and admin get global statistics, regular users get their own
    let tasks: Task[];
    if (this.isAdminOrSuperAdmin(currentUser.role)) {
      tasks = await this.tasksRepository.findAll(false);
    } else {
      tasks = await this.tasksRepository.findByUserId(currentUser.id);
    }

    return {
      total: tasks.length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      inProgress: tasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
      pending: tasks.filter(t => t.status === TaskStatus.PENDING).length,
      highPriority: tasks.filter(t => t.priority === TaskPriority.HIGH).length,
    };
  }

  async queueBulkCreate(createTasksDto: CreateTaskDto[], currentUser: AuthUser) {
    this.logger.log(
      `Queueing bulk creation of ${createTasksDto.length} tasks for user ${currentUser.id}`,
    );

    return this.taskQueue.add(
      'tasks-bulk-create',
      {
        tasks: createTasksDto,
        userId: currentUser.id,
        queuedAt: new Date().toISOString(),
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  async queueBulkDelete(taskIds: string[], currentUser: AuthUser) {
    this.logger.log(`Queueing bulk deletion of ${taskIds.length} tasks for user ${currentUser.id}`);

    return this.taskQueue.add(
      'tasks-bulk-delete',
      {
        taskIds,
        userId: currentUser.id,
        queuedAt: new Date().toISOString(),
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
//TODO: RBAC
//TODO: Notification layer
//TODO: Add redis -> LRU cache
//TODO: Add Composite index based on UI
//Think about push/pull for notification layer based on scale (Fanout)
