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
import { PaginationMetaData } from '../../types/pagination.interface';
import { TaskPriority } from './enums/task-priority.enum';

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

      if ((savedTask.user as unknown as string) === createTaskDto.userId) {
        this.taskQueue.add('task-status-update', {
          taskId: savedTask.id,
          status: savedTask.status,
        });
      }

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
    return (await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    })) as Task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<{ message: string }> {
    const updateResult = await this.tasksRepository.update(id, { ...updateTaskDto });
    if ((updateResult.affected ?? 0) > 0) {
      this.taskQueue.add('task-status-update', {
        taskId: id,
        status: updateTaskDto.status,
      });
      return { message: 'Task updated successfully' };
    } else {
      throw new NotFoundException(`Task not found`);
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleteResult = await this.tasksRepository.delete(id);

    if ((deleteResult.affected ?? 0) === 0) {
      throw new NotFoundException(`Task not found`);
    }

    return { message: 'Task deleted successfully' };
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Inefficient implementation: doesn't use proper repository patterns
    const query = 'SELECT * FROM tasks WHERE status = $1';
    return this.tasksRepository.query(query, [status]);
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    return this.tasksRepository.save({ id, status });
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
