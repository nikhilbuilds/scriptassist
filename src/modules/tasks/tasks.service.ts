import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import {
  ITasksRepository,
  TASKS_REPOSITORY,
  TaskFilterOptions,
  PaginationOptions,
} from './tasks.repository.interface';

@Injectable()
export class TasksService {
  constructor(
    @Inject(TASKS_REPOSITORY)
    private readonly tasksRepository: ITasksRepository,
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
  ) {}

  async create(createTaskDto: CreateTaskDto, currentUserId: string): Promise<Task> {
    const taskData = {
      ...createTaskDto,
      userId: currentUserId,
    };

    const task = await this.tasksRepository.create(taskData);

    //TODO: notification layer here
    await this.taskQueue.add('task-status-update', {
      taskId: task.id,
      status: task.status,
    });

    return task;
  }

  async findAllForUser(currentUserId: string, withRelations: boolean = true): Promise<Task[]> {
    return this.tasksRepository.findByUserId(currentUserId);
  }

  async findWithFiltersForUser(
    currentUserId: string,
    filters: TaskFilterOptions,
    pagination?: PaginationOptions,
  ) {
    const userFilters = { ...filters, userId: currentUserId };
    return this.tasksRepository.findWithFilters(userFilters, pagination);
  }

  async findOne(id: string, currentUserId: string, withRelations: boolean = true): Promise<Task> {
    const task = await this.tasksRepository.findById(id, withRelations);

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    if (task.userId !== currentUserId) {
      throw new ForbiddenException('You do not have permission to access this task');
    }

    return task;
  }

  async findByStatusForUser(status: TaskStatus, currentUserId: string): Promise<Task[]> {
    const allUserTasks = await this.tasksRepository.findByUserId(currentUserId);
    return allUserTasks.filter(task => task.status === status);
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, currentUserId: string): Promise<Task> {
    const existingTask = await this.findOne(id, currentUserId, false);
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

  async remove(id: string, currentUserId: string): Promise<void> {
    await this.findOne(id, currentUserId, false);

    //TODO: Soft delete
    //TODO: Notification layer
    await this.tasksRepository.delete(id);
  }

  async batchCreate(
    createTasksDto: CreateTaskDto[],
    currentUserId: string,
  ): Promise<{ tasks: Task[]; createdCount: number }> {
    const tasksData = createTasksDto.map(dto => ({
      ...dto,
      userId: currentUserId,
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

  async batchDeleteForUser(taskIds: string[], currentUserId: string): Promise<number> {
    const tasks = await Promise.all(taskIds.map(id => this.tasksRepository.findById(id, false)));

    const notFoundIds = taskIds.filter((id, index) => !tasks[index]);
    if (notFoundIds.length > 0) {
      throw new NotFoundException(`Tasks not found: ${notFoundIds.join(', ')}`);
    }

    const unauthorizedTasks = tasks.filter(task => task && task.userId !== currentUserId);
    if (unauthorizedTasks.length > 0) {
      throw new ForbiddenException('You do not have permission to delete some of these tasks');
    }

    return this.tasksRepository.batchDelete(taskIds);
  }

  async getStatisticsForUser(currentUserId: string) {
    const userTasks = await this.tasksRepository.findByUserId(currentUserId);

    return {
      total: userTasks.length,
      completed: userTasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      inProgress: userTasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
      pending: userTasks.filter(t => t.status === TaskStatus.PENDING).length,
      highPriority: userTasks.filter(t => t.priority === TaskPriority.HIGH).length,
    };
  }
}
//TODO: RBAC
//TODO: Notification layer
//TODO: Add redis -> LRU cache
//TODO: Add Composite index based on UI
//Think about push/pull for notification layer based on scale (Fanout)
