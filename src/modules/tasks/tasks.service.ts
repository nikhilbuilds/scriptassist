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
import { PaginationDto } from '@common/dto/pagination.dto';
import { PaginationMetaData } from '../../types/pagination.interface';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // Inefficient implementation: creates the task but doesn't use a single transaction
    // for creating and adding to queue, potential for inconsistent state
    const task = this.tasksRepository.create(createTaskDto);
    const savedTask = await this.tasksRepository.save(task);

    // Add to queue without waiting for confirmation or handling errors
    this.taskQueue.add('task-status-update', {
      taskId: savedTask.id,
      status: savedTask.status,
    });

    return savedTask;
  }

  async findAll(filter: TaskFilterDto): Promise<{
    tasks: Task[];
    metaData: PaginationMetaData;
  }> {
    const findOptions: FindManyOptions<Task> = {
      relations: ['user'],
      where: {},
    };

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

  async findOne(id: string): Promise<Task> {
    // Inefficient implementation: two separate database calls
    const count = await this.tasksRepository.count({ where: { id } });

    if (count === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return (await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    })) as Task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    // Inefficient implementation: multiple database calls
    // and no transaction handling
    const task = await this.findOne(id);

    const originalStatus = task.status;

    // Directly update each field individually
    if (updateTaskDto.title) task.title = updateTaskDto.title;
    if (updateTaskDto.description) task.description = updateTaskDto.description;
    if (updateTaskDto.status) task.status = updateTaskDto.status;
    if (updateTaskDto.priority) task.priority = updateTaskDto.priority;
    if (updateTaskDto.dueDate) task.dueDate = updateTaskDto.dueDate;

    const updatedTask = await this.tasksRepository.save(task);

    // Add to queue if status changed, but without proper error handling
    if (originalStatus !== updatedTask.status) {
      this.taskQueue.add('task-status-update', {
        taskId: updatedTask.id,
        status: updatedTask.status,
      });
    }

    return updatedTask;
  }

  async remove(id: string): Promise<void> {
    // Inefficient implementation: two separate database calls
    const task = await this.findOne(id);
    await this.tasksRepository.remove(task);
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Inefficient implementation: doesn't use proper repository patterns
    const query = 'SELECT * FROM tasks WHERE status = $1';
    return this.tasksRepository.query(query, [status]);
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // This method will be called by the task processor
    const task = await this.findOne(id);
    task.status = status as TaskStatus;
    return this.tasksRepository.save(task);
  }

  async findOverdueTasks(): Promise<Task[]> {
    const now = new Date();

    return await this.tasksRepository.find({
      where: {
        dueDate: LessThan(now),
        status: TaskStatus.PENDING,
      },
    });
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
}
