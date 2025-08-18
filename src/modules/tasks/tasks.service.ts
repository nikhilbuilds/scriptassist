import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
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

    // Validate and convert dueDate if provided
    if (createTaskDto.dueDate) {
      const dueDate = new Date(createTaskDto.dueDate);
      if (isNaN(dueDate.getTime())) {
        throw new BadRequestException(
          'Invalid dueDate format. Please provide a valid date string.',
        );
      }
      // Convert to Date object for the entity
      createTaskDto.dueDate = dueDate as any;
    }

    // Create task with proper validation
    const task = this.tasksRepository.create(createTaskDto);
    const savedTask = await this.tasksRepository.save(task);

    // Add to queue for background processing
    this.taskQueue.add('task-status-update', {
      taskId: savedTask.id,
      status: savedTask.status,
    });

    return savedTask;
  }

  async findAll(filterDto?: any): Promise<{ data: Task[]; total: number; page: number; limit: number; totalPages: number; hasNext: boolean; hasPrev: boolean }> {
    const {
      status,
      priority,
      userId,
      search,
      page: rawPage = 1,
      limit: rawLimit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = filterDto || {};

    // Ensure page and limit are valid numbers
    const page = Math.max(1, parseInt(String(rawPage), 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(String(rawLimit), 10) || 10));

    // Build query builder for efficient database-level filtering
    const queryBuilder = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user');

    // Apply filters at database level
    if (status) {
      queryBuilder.andWhere('task.status = :status', { status });
    }

    if (priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority });
    }

    if (userId) {
      queryBuilder.andWhere('task.userId = :userId', { userId });
    }

    if (search) {
      queryBuilder.andWhere(
        '(task.title ILIKE :search OR task.description ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Apply sorting
    const validSortFields = ['title', 'status', 'priority', 'dueDate', 'createdAt', 'updatedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder.orderBy(`task.${sortField}`, sortOrder as 'ASC' | 'DESC');

    // Apply pagination
    const skip = Math.max(0, (page - 1) * limit);
    queryBuilder.skip(skip).take(limit);

    // Execute query with count
    const [data, total] = await queryBuilder.getManyAndCount();

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext,
      hasPrev
    };
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
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
    if (updateTaskDto.dueDate) {
      const dueDate = new Date(updateTaskDto.dueDate);
      if (isNaN(dueDate.getTime())) {
        throw new BadRequestException(
          'Invalid dueDate format. Please provide a valid date string.',
        );
      }
      task.dueDate = dueDate;
    }

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
    task.status = status as any;
    return this.tasksRepository.save(task);
  }

  async getStats() {
    // Efficient approach: Use TypeORM count for aggregation
    const total = await this.tasksRepository.count();
    const completed = await this.tasksRepository.count({ where: { status: TaskStatus.COMPLETED } });
    const inProgress = await this.tasksRepository.count({ where: { status: TaskStatus.IN_PROGRESS } });
    const pending = await this.tasksRepository.count({ where: { status: TaskStatus.PENDING } });
    const highPriority = await this.tasksRepository.count({ where: { priority: TaskPriority.HIGH } });
    
    return {
      total,
      completed,
      inProgress,
      pending,
      highPriority,
    };
  }
}
