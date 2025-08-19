import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ITaskFilter, ITaskStats } from '../../common/interfaces/task.interface';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  
  constructor(
    @InjectRepository(Task)
    private taskRepo: Repository<Task>, // Shorter name, more casual
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // Validate and convert dueDate if provided
    
    if (createTaskDto.dueDate) {
      const dueDate = new Date(createTaskDto.dueDate);
      if (isNaN(dueDate.getTime())) {
        throw new BadRequestException('That date looks wrong - can you check it?');
      }
      
      // Convert to Date object for the entity
      createTaskDto.dueDate = dueDate as Date;
    }

    // Create the task
    const newTask = this.taskRepo.create(createTaskDto);
    const savedTask = await this.taskRepo.save(newTask);

    // Add to background queue for processing
    // Add to background queue for processing
    try {
      await this.taskQueue.add('task-status-update', {
        taskId: savedTask.id,
        status: savedTask.status,
      });
    } catch (error) {
      this.logger.warn('⚠️  Queue failed, but task was created:', error instanceof Error ? error.message : 'Unknown error');
    }

    return savedTask;
  }

  async findAll(filterDto?: ITaskFilter): Promise<{
    data: Task[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  }> {
    const {
      status,
      priority,
      userId,
      search,
      page: rawPage = 1,
      limit: rawLimit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filterDto || {};

    // Ensure page and limit are valid numbers
    const page = Math.max(1, parseInt(String(rawPage), 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(String(rawLimit), 10) || 10));

    // Build query builder for efficient database-level filtering
    const taskQuery = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user');

    // Apply filters at database level
    if (status) {
      taskQuery.andWhere('task.status = :status', { status });
    }

    if (priority) {
      taskQuery.andWhere('task.priority = :priority', { priority });
    }

    if (userId) {
      taskQuery.andWhere('task.userId = :userId', { userId });
    }

    if (search) {
      taskQuery.andWhere('(task.title ILIKE :search OR task.description ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    // Apply sorting
    const validSortFields = ['title', 'status', 'priority', 'dueDate', 'createdAt', 'updatedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    taskQuery.orderBy(`task.${sortField}`, sortOrder as 'ASC' | 'DESC');

    // Apply pagination
    const skip = Math.max(0, (page - 1) * limit);
    taskQuery.skip(skip).take(limit);

    // Execute query with count
    const [data, total] = await taskQuery.getManyAndCount();

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
      hasPrev,
    };
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.taskRepo.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    // Efficient implementation: Single database call with proper validation
    const queryRunner = this.taskRepo.manager.connection.createQueryRunner();
    
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Get task with lock to prevent race conditions (without relations to avoid FOR UPDATE issues)
      const task = await queryRunner.manager.findOne(Task, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      const originalStatus = task.status;

      // Validate and update fields efficiently
      this.updateTaskFields(task, updateTaskDto);

      // Save with transaction
      const updatedTask = await queryRunner.manager.save(Task, task);
      
      await queryRunner.commitTransaction();

      // Add to queue if status changed with proper error handling
      if (originalStatus !== updatedTask.status) {
        try {
          await this.taskQueue.add('task-status-update', {
            taskId: updatedTask.id,
            status: updatedTask.status,
          });
        } catch (queueError) {
          this.logger.warn(`Failed to add task status update to queue: ${queueError instanceof Error ? queueError.message : 'Unknown error'}`);
        }
      }

      // Return the updated task with relations for consistency
      return this.findOne(updatedTask.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private updateTaskFields(task: Task, updateTaskDto: UpdateTaskDto): void {
    // Efficient field updates with validation
    if (updateTaskDto.title !== undefined) {
      task.title = updateTaskDto.title;
    }
    if (updateTaskDto.description !== undefined) {
      task.description = updateTaskDto.description;
    }
    if (updateTaskDto.status !== undefined) {
      task.status = updateTaskDto.status;
    }
    if (updateTaskDto.priority !== undefined) {
      task.priority = updateTaskDto.priority;
    }
    if (updateTaskDto.dueDate !== undefined) {
      const dueDate = new Date(updateTaskDto.dueDate);
      if (isNaN(dueDate.getTime())) {
        throw new BadRequestException('Invalid dueDate format. Please provide a valid date string.');
      }
      task.dueDate = dueDate;
    }
  }

  async remove(id: string): Promise<void> {
    // Efficient implementation: Single database call with proper error handling
    const result = await this.taskRepo.delete(id);
    
    if (result.affected === 0) {
      throw new NotFoundException('Task not found');
    }
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Efficient implementation: Using TypeORM repository patterns
    return this.taskRepo.find({
      where: { status },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // This method will be called by the task processor
    const task = await this.findOne(id);
    task.status = status as any;
    return this.taskRepo.save(task);
  }

  async getStats(): Promise<ITaskStats> {
    // Efficient approach: Use TypeORM count for aggregation
    const total = await this.taskRepo.count();
    const completed = await this.taskRepo.count({ where: { status: TaskStatus.COMPLETED } });
    const inProgress = await this.taskRepo.count({
      where: { status: TaskStatus.IN_PROGRESS },
    });
    const pending = await this.taskRepo.count({ where: { status: TaskStatus.PENDING } });
    const highPriority = await this.taskRepo.count({
      where: { priority: TaskPriority.HIGH },
    });

    return {
      total,
      completed,
      inProgress,
      pending,
      highPriority,
    };
  }
}
