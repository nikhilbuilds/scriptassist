import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Task } from './entities/task.entity';
import { TaskStatus } from './enums/task-status.enum';
import {
  ITasksRepository,
  TaskFilterOptions,
  PaginationOptions,
  PaginatedResult,
  TaskStatistics,
} from './tasks.repository.interface';

@Injectable()
export class TasksRepository implements ITasksRepository {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
  ) {}

  async create(taskData: Partial<Task>): Promise<Task> {
    const task = this.tasksRepo.create(taskData);
    return this.tasksRepo.save(task);
  }

  async findAll(withRelations: boolean = false): Promise<Task[]> {
    const query = this.tasksRepo.createQueryBuilder('task').orderBy('task.createdAt', 'DESC');

    if (withRelations) {
      query.leftJoinAndSelect('task.user', 'user');
    }

    return query.getMany();
  }

  async findWithFilters(
    filters: TaskFilterOptions,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<Task>> {
    const query = this.tasksRepo.createQueryBuilder('task').leftJoin('task.user', 'user');

    if (filters.status) {
      query.andWhere('task.status = :status', { status: filters.status });
    }

    if (filters.priority) {
      query.andWhere('task.priority = :priority', { priority: filters.priority });
    }

    if (filters.userId) {
      query.andWhere('task.userId = :userId', { userId: filters.userId });
    }

    if (pagination) {
      const skip = (pagination.page - 1) * pagination.limit;
      query.skip(skip).take(pagination.limit);
    }

    query.orderBy('task.createdAt', 'DESC');

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page: pagination?.page || 1,
      limit: pagination?.limit || total,
      totalPages: pagination ? Math.ceil(total / pagination.limit) : 1,
    };
  }

  async findById(id: string, withRelations: boolean = false): Promise<Task | null> {
    const query = this.tasksRepo.createQueryBuilder('task').where('task.id = :id', { id });

    if (withRelations) {
      query
        .leftJoinAndSelect('task.user', 'user')
        .addSelect(['user.id', 'user.email', 'user.name', 'user.role']);
    }

    return query.getOne();
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return this.tasksRepo
      .createQueryBuilder('task')
      .where('task.status = :status', { status })
      .orderBy('task.createdAt', 'DESC')
      .getMany();
  }

  async findByUserId(userId: string): Promise<Task[]> {
    return this.tasksRepo
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId })
      .orderBy('task.createdAt', 'DESC')
      .getMany();
  }

  async findByUserIdAndStatus(userId: string, status: TaskStatus): Promise<Task[]> {
    return this.tasksRepo
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId })
      .andWhere('task.status = :status', { status })
      .orderBy('task.createdAt', 'DESC')
      .getMany();
  }

  async update(id: string, taskData: Partial<Task>): Promise<Task> {
    return this.tasksRepo.manager.transaction(async transactionalEntityManager => {
      await transactionalEntityManager.update(Task, id, taskData);

      const updatedTask = await transactionalEntityManager.findOne(Task, {
        where: { id } as any,
      });

      if (!updatedTask) {
        throw new Error(`Task with ID ${id} not found after update`);
      }

      return updatedTask;
    });
  }

  async delete(id: string): Promise<void> {
    await this.tasksRepo.delete(id);
  }

  async batchUpdateStatus(ids: string[], status: TaskStatus): Promise<number> {
    const result = await this.tasksRepo
      .createQueryBuilder()
      .update(Task)
      .set({ status })
      .where({ id: In(ids) })
      .execute();

    return result.affected || 0;
  }

  async findCompactByIds(ids: string[]): Promise<Pick<Task, 'id' | 'userId'>[]> {
    return this.tasksRepo
      .createQueryBuilder('task')
      .select(['task.id', 'task.userId'])
      .where({ id: In(ids) })
      .getMany();
  }

  async batchDelete(ids: string[]): Promise<number> {
    const result = await this.tasksRepo
      .createQueryBuilder()
      .delete()
      .from(Task)
      .where({ id: In(ids) })
      .execute();

    return result.affected || 0;
  }

  async getStatistics(): Promise<TaskStatistics> {
    const result = await this.tasksRepo
      .createQueryBuilder('task')
      .select([
        'COUNT(*) as total',
        `SUM(CASE WHEN task.status = '${TaskStatus.COMPLETED}' THEN 1 ELSE 0 END) as completed`,
        `SUM(CASE WHEN task.status = '${TaskStatus.IN_PROGRESS}' THEN 1 ELSE 0 END) as "inProgress"`,
        `SUM(CASE WHEN task.status = '${TaskStatus.PENDING}' THEN 1 ELSE 0 END) as pending`,
        `SUM(CASE WHEN task.priority = 'high' THEN 1 ELSE 0 END) as "highPriority"`,
      ])
      .getRawOne();

    return {
      total: parseInt(result.total) || 0,
      completed: parseInt(result.completed) || 0,
      inProgress: parseInt(result.inProgress) || 0,
      pending: parseInt(result.pending) || 0,
      highPriority: parseInt(result.highPriority) || 0,
    };
  }

  async batchCreate(tasksData: Partial<Task>[]): Promise<Task[]> {
    return this.tasksRepo.manager.transaction(async transactionalEntityManager => {
      const tasks = tasksData.map(taskData => transactionalEntityManager.create(Task, taskData));

      return transactionalEntityManager.save(Task, tasks);
    });
  }
}
