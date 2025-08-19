import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeleteResult,
  FindManyOptions,
  In,
  LessThan,
  LessThanOrEqual,
  Like,
  MoreThanOrEqual,
  Repository,
  UpdateResult,
} from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskFilterDto } from './dto/task-filter.dto';
import { PaginationMetaData, PaginationOptions } from '../../types/pagination.interface';
import { TaskPriority } from './enums/task-priority.enum';
import { Transactional } from 'typeorm-transactional';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    try {
      const savedTask = await this.tasksRepository.save(this.tasksRepository.create(createTaskDto));

      this.taskQueue.add(
        'task-status-update',
        {
          taskId: savedTask.id,
          status: savedTask.status,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );

      return savedTask;
    } catch (error) {
      console.error('Error creating task:', error);
      throw new HttpException('Error creating task', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findAll(filter: TaskFilterDto): Promise<{
    tasks: Task[];
    metaData: PaginationMetaData;
  }> {
    const findOptions: FindManyOptions<Task> = {
      relations: ['user'],
      where: {},
    };

    if (filter.userId) {
      findOptions.where = { ...findOptions.where, userId: filter.userId };
    }

    if (filter.status) {
      findOptions.where = { ...findOptions.where, status: filter.status };
    }

    if (filter.priority) {
      findOptions.where = { ...findOptions.where, priority: filter.priority };
    }

    if (filter.search) {
      findOptions.where = {
        ...findOptions.where,
        ...{
          title: Like(`%${filter.search}%`),
          description: Like(`%${filter.search}%`),
        },
      };
    }

    if (filter.startDate) {
      findOptions.where = {
        ...findOptions.where,
        dueDate: MoreThanOrEqual(new Date(filter.startDate)),
      };
    }

    if (filter.endDate) {
      findOptions.where = {
        ...findOptions.where,
        dueDate: LessThanOrEqual(new Date(filter.endDate)),
      };
    }

    findOptions.skip = (filter.page - 1) * filter.limit;
    findOptions.take = filter.limit;

    if (filter.sortBy) {
      findOptions.order = { [filter.sortBy]: filter.sortOrder ?? 'ASC' };
    }

    const dbResponse = await this.tasksRepository.findAndCount(findOptions);

    return {
      tasks: dbResponse[0],
      metaData: {
        total: dbResponse[1],
        page: filter.page,
        limit: filter.limit,
        totalPages: Math.ceil(dbResponse[1] / filter.limit),
      },
    };
  }

  async findOne(id: string, taskOwnerId: string): Promise<Task> {
    return (await this.tasksRepository.findOne({
      where: { id, userId: taskOwnerId },
      relations: ['user'],
    })) as Task;
  }

  @Transactional() // This is only needed if there are updates to multiple tables. Only here as an example.
  async update(
    id: string,
    taskOwnerId: string,
    updateTaskDto: UpdateTaskDto,
  ): Promise<{ message: string }> {
    const updateResult = await this.tasksRepository.update(
      { id, userId: taskOwnerId },
      { ...updateTaskDto },
    );
    if ((updateResult.affected ?? 0) > 0) {
      if (updateTaskDto.status) {
        this.taskQueue.add(
          'task-status-update',
          {
            taskId: id,
            status: updateTaskDto.status,
          },
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        );
      }

      return { message: 'Task updated successfully' };
    } else {
      throw new NotFoundException(`Task not found`);
    }
  }

  async remove(id: string, taskOwnerId: string): Promise<{ message: string }> {
    const deleteResult = await this.tasksRepository.delete({ id, userId: taskOwnerId });

    if ((deleteResult.affected ?? 0) === 0) {
      throw new NotFoundException(`Task not found`);
    }

    return { message: 'Task deleted successfully' };
  }

  async findByStatus(
    status: TaskStatus,
    pagination: PaginationOptions,
  ): Promise<{ tasks: Task[]; metaData: PaginationMetaData }> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const dbResponse = await this.tasksRepository.findAndCount({
      where: { status },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      tasks: dbResponse[0],
      metaData: {
        total: dbResponse[1],
        page,
        limit,
        totalPages: Math.ceil(dbResponse[1] / limit),
      },
    };
  }

  async updateStatus(id: string, status: TaskStatus): Promise<{ message: string }> {
    const updateResult = await this.tasksRepository.update(id, { status });

    if (updateResult.affected === 0) {
      return { message: 'Task not found' };
    } else {
      return { message: 'Task status updated successfully' };
    }
  }

  async findOverdueTasks(
    pagination: PaginationOptions,
  ): Promise<{ tasks: Task[]; metaData: PaginationMetaData }> {
    const now = new Date();
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const dbResponse = await this.tasksRepository.findAndCount({
      where: {
        dueDate: LessThan(now),
        status: TaskStatus.PENDING,
      },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      tasks: dbResponse[0],
      metaData: {
        total: dbResponse[1],
        page,
        limit,
        totalPages: Math.ceil(dbResponse[1] / limit),
      },
    };
  }

  async batchProcess(operations: { taskIds: string[]; action: string }): Promise<number> {
    const { taskIds, action } = operations;
    let result: UpdateResult | DeleteResult;

    switch (action) {
      case 'complete':
        result = await this.tasksRepository.update(
          { id: In(taskIds) },
          { status: TaskStatus.COMPLETED },
        );
        break;
      case 'delete':
        result = await this.tasksRepository.delete({ id: In(taskIds) });
        break;
      default:
        throw new HttpException(`Unknown action: ${action}`, HttpStatus.BAD_REQUEST);
    }

    if (result.affected === 0) {
      throw new HttpException(
        `None of the task ids where found in the database`,
        HttpStatus.NOT_FOUND,
      );
    }

    return result.affected ?? 0;
  }

  async getStats(): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    highPriority: number;
  }> {
    const result = await this.tasksRepository
      .createQueryBuilder('task')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN task.status = :completedStatus THEN 1 ELSE 0 END)', 'completed')
      .addSelect('SUM(CASE WHEN task.status = :inProgressStatus THEN 1 ELSE 0 END)', 'inProgress')
      .addSelect('SUM(CASE WHEN task.status = :pendingStatus THEN 1 ELSE 0 END)', 'pending')
      .addSelect('SUM(CASE WHEN task.priority = :highPriority THEN 1 ELSE 0 END)', 'highPriority')
      .setParameters({
        completedStatus: TaskStatus.COMPLETED,
        inProgressStatus: TaskStatus.IN_PROGRESS,
        pendingStatus: TaskStatus.PENDING,
        highPriority: TaskPriority.HIGH,
      })
      .getRawOne();

    return {
      total: parseInt(result.total, 10),
      completed: parseInt(result.completed, 10),
      inProgress: parseInt(result.inProgress, 10),
      pending: parseInt(result.pending, 10),
      highPriority: parseInt(result.highPriority, 10),
    };
  }
}
