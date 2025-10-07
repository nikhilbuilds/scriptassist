import { Injectable, NotFoundException, ForbiddenException, Inject, Logger } from '@nestjs/common';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import type { AuthUser } from '../../common/types';
import type { ITasksRepository } from './tasks.repository.interface';
import {
  TASKS_REPOSITORY,
  TaskFilterOptions,
  PaginationOptions,
} from './tasks.repository.interface';
import { CacheService } from '../../common/services/cache.service';
import {
  bumpCacheNamespace,
  buildListCacheKey,
  buildEntityCacheKey,
} from '../../common/utils/cache.util';
import { isAdminOrSuperAdmin } from '../users/utils/users.utils';

interface TaskQueryOptions {
  withRelations?: boolean;
}

interface TaskUpdateOptions {
  notifyOnStatusChange?: boolean;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly TASK_ENTITY_TTL = Number(process.env.CACHE_TASK_BY_ID_TTL_SECONDS ?? 180);
  private readonly TASK_LIST_TTL = Number(process.env.CACHE_TASK_LIST_TTL_SECONDS ?? 30);
  constructor(
    @Inject(TASKS_REPOSITORY)
    private readonly tasksRepository: ITasksRepository,
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
    private readonly cacheService: CacheService,
  ) {}

  async create(createTaskDto: CreateTaskDto, currentUser: AuthUser): Promise<Task> {
    const taskData = {
      ...createTaskDto,
      userId: currentUser.id,
      dueDate: createTaskDto.dueDate ? new Date(createTaskDto.dueDate) : undefined,
    };

    const task = await this.tasksRepository.create(taskData);

    //TODO: notification layer here
    await this.taskQueue.add('task-status-update', {
      taskId: task.id,
      status: task.status,
    });

    await bumpCacheNamespace(this.cacheService, `user:${currentUser.id}`);

    return task;
  }

  async findAllForUser(currentUser: AuthUser, options: TaskQueryOptions = {}): Promise<Task[]> {
    const { withRelations = true } = options;

    if (isAdminOrSuperAdmin(currentUser.role)) {
      return this.tasksRepository.findAll(withRelations);
    }

    return this.tasksRepository.findByUserId(currentUser.id);
  }

  async findWithFiltersForUser(
    currentUser: AuthUser,
    filters: TaskFilterOptions,
    options: { pagination?: PaginationOptions } = {},
  ) {
    const { pagination } = options;

    const effectiveFilters = isAdminOrSuperAdmin(currentUser.role)
      ? filters
      : { ...filters, userId: currentUser.id };

    const shouldCache = !isAdminOrSuperAdmin(currentUser.role);

    if (shouldCache) {
      const cacheKey = await buildListCacheKey(this.cacheService, {
        scope: `user:${currentUser.id}`,
        resource: 'tasks',
        filters: effectiveFilters,
        pagination,
      });

      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for task list: ${cacheKey}`);
        return cached;
      }

      this.logger.debug(`Cache miss for task list: ${cacheKey}`);
      const result = await this.tasksRepository.findWithFilters(effectiveFilters, pagination);

      await this.cacheService.set(cacheKey, result, this.TASK_LIST_TTL);

      return result;
    }

    this.logger.debug(
      `No caching for admin/super-admin role: ${currentUser.role} (global list query)`,
    );
    return this.tasksRepository.findWithFilters(effectiveFilters, pagination);
  }

  async findOne(id: string, currentUser: AuthUser, options: TaskQueryOptions = {}): Promise<Task> {
    const { withRelations = true } = options;

    const cacheKey = buildEntityCacheKey('task', id);
    const cachedTask = await this.cacheService.get<Task>(cacheKey);

    let task: Task | null;

    if (cachedTask) {
      this.logger.debug(`Cache hit for task ID: ${id}`);
      task = cachedTask;
    } else {
      this.logger.debug(`Cache miss for task ID: ${id}`);
      task = await this.tasksRepository.findById(id, withRelations);

      if (task) {
        await this.cacheService.set(cacheKey, task, this.TASK_ENTITY_TTL);
      }
    }

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    if (!isAdminOrSuperAdmin(currentUser.role) && task.userId !== currentUser.id) {
      throw new ForbiddenException('You do not have permission to access this task');
    }

    return task;
  }

  async findByStatusForUser(status: TaskStatus, currentUserId: string): Promise<Task[]> {
    return this.tasksRepository.findByUserIdAndStatus(currentUserId, status);
  }

  async update(
    id: string,
    updateTaskDto: UpdateTaskDto,
    currentUser: AuthUser,
    options: TaskUpdateOptions = {},
  ): Promise<Task> {
    const existingTask = await this.findOne(id, currentUser, { withRelations: false });
    const originalStatus = existingTask.status;

    const updateData = { ...updateTaskDto };
    delete (updateData as any).userId;

    const updatedTask = await this.tasksRepository.update(id, {
      ...updateData,
      dueDate: updateTaskDto.dueDate ? new Date(updateTaskDto.dueDate) : existingTask.dueDate,
    });

    if (updateTaskDto.status && originalStatus !== updateTaskDto.status) {
      await this.taskQueue.add(
        'task-status-update',
        {
          taskId: updatedTask.id,
          status: updatedTask.status,
        },
        {
          jobId: `task-status-${updatedTask.id}`,
        },
      );
    }

    await this.cacheService.delete(buildEntityCacheKey('task', id));

    await bumpCacheNamespace(this.cacheService, `user:${updatedTask.userId}`);

    return updatedTask;
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = await this.tasksRepository.findById(id, false);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const updatedTask = await this.tasksRepository.update(id, { status });

    await this.cacheService.delete(buildEntityCacheKey('task', id));

    await bumpCacheNamespace(this.cacheService, `user:${updatedTask.userId}`);

    return updatedTask;
  }

  async remove(id: string, currentUser: AuthUser): Promise<void> {
    const task = await this.findOne(id, currentUser, { withRelations: false });

    //TODO: Soft delete
    //TODO: Notification layer
    await this.tasksRepository.delete(id);

    await this.cacheService.delete(buildEntityCacheKey('task', id));

    await bumpCacheNamespace(this.cacheService, `user:${task.userId}`);
  }

  async batchCreate(
    createTasksDto: CreateTaskDto[],
    currentUser: AuthUser,
  ): Promise<{ tasks: Task[]; createdCount: number }> {
    const tasksData = createTasksDto.map(dto => ({
      ...dto,
      userId: currentUser.id,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    }));

    const createdTasks = await this.tasksRepository.batchCreate(tasksData);

    const queuePromises = createdTasks.map(task =>
      this.taskQueue.add('task-status-update', {
        taskId: task.id,
        status: task.status,
      }),
    );

    await Promise.all(queuePromises);

    await bumpCacheNamespace(this.cacheService, `user:${currentUser.id}`);

    return {
      tasks: createdTasks,
      createdCount: createdTasks.length,
    };
  }

  async batchDeleteForUser(taskIds: string[], currentUser: AuthUser): Promise<number> {
    const tasks = await this.tasksRepository.findCompactByIds(taskIds);

    const taskMap = new Map(tasks.map(t => [t.id, t]));

    const notFoundIds = taskIds.filter(id => !taskMap.has(id));
    if (notFoundIds.length > 0) {
      throw new NotFoundException(`Tasks not found: ${notFoundIds.join(', ')}`);
    }

    if (!isAdminOrSuperAdmin(currentUser.role)) {
      const unauthorizedTasks = tasks.filter(task => task.userId !== currentUser.id);
      if (unauthorizedTasks.length > 0) {
        throw new ForbiddenException('You do not have permission to delete some of these tasks');
      }
    }

    const deletedCount = await this.tasksRepository.batchDelete(taskIds);

    await this.cacheService.deleteMany(taskIds.map(id => buildEntityCacheKey('task', id)));

    const uniqueUserIds = [...new Set(tasks.map(t => t.userId))];
    await Promise.all(
      uniqueUserIds.map(userId => bumpCacheNamespace(this.cacheService, `user:${userId}`)),
    );

    return deletedCount;
  }

  async getStatisticsForUser(currentUser: AuthUser) {
    let tasks: Task[];
    if (isAdminOrSuperAdmin(currentUser.role)) {
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
        removeOnFail: { count: 50 }, //TODO: Keep in env
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
        removeOnFail: { count: 50 },
      },
    );
  }
}
//TODO: Notification layer
//TODO: Add Composite index based on UI
//Think about push/pull for notification layer based on scale (Fanout)
