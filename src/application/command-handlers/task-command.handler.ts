import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TaskAggregate } from '../../domain/entities/task.aggregate';
import { TaskStatusEnum } from '../../domain/value-objects/task-status.value-object';
import { TaskPriorityEnum } from '../../domain/value-objects/task-priority.value-object';
import {
  CreateTaskCommand,
  UpdateTaskCommand,
  ChangeTaskStatusCommand,
  ChangeTaskPriorityCommand,
  CompleteTaskCommand,
  DeleteTaskCommand,
  BulkCreateTasksCommand,
  BulkUpdateTaskStatusCommand,
} from '../commands/task-commands';
import { DomainEvent } from '../../domain/events/domain-event';
import { EventBus } from '@nestjs/cqrs';

@Injectable()
export class TaskCommandHandler {
  private readonly logger = new Logger(TaskCommandHandler.name);

  constructor(
    @InjectRepository(TaskAggregate)
    private taskRepository: Repository<TaskAggregate>,
    private dataSource: DataSource,
    private eventBus: EventBus,
  ) {}

  async handleCreateTask(command: CreateTaskCommand): Promise<TaskAggregate> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create task aggregate
      const task = new TaskAggregate(
        command.title,
        command.description,
        command.userId,
        command.priority,
        command.dueDate
      );

      // Validate the aggregate
      if (!task.validate()) {
        throw new BadRequestException('Invalid task data');
      }

      // Save to database
      const savedTask = await queryRunner.manager.save(TaskAggregate, task);

      // Publish domain events
      const events = task.getUncommittedEvents();
      for (const event of events) {
        await this.eventBus.publish(event);
      }

      await queryRunner.commitTransaction();
      
      this.logger.log(`Task created: ${savedTask.id}`);
      return savedTask;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handleUpdateTask(command: UpdateTaskCommand): Promise<TaskAggregate> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = await queryRunner.manager.findOne(TaskAggregate, {
        where: { id: command.taskId }
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${command.taskId} not found`);
      }

      // Update task details
      if (command.title !== undefined) {
        task.updateDetails(command.title, task.getDescription());
      }
      if (command.description !== undefined) {
        task.updateDetails(task.getTitle(), command.description);
      }
      if (command.priority !== undefined) {
        task.changePriority(command.priority, 'system'); // TODO: Get from context
      }
      if (command.dueDate !== undefined) {
        task.setDueDate(command.dueDate);
      }

      // Validate the aggregate
      if (!task.validate()) {
        throw new BadRequestException('Invalid task data');
      }

      // Save to database
      const updatedTask = await queryRunner.manager.save(TaskAggregate, task);

      // Publish domain events
      const events = task.getUncommittedEvents();
      for (const event of events) {
        await this.eventBus.publish(event);
      }

      await queryRunner.commitTransaction();
      
      this.logger.log(`Task updated: ${updatedTask.id}`);
      return updatedTask;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handleChangeTaskStatus(command: ChangeTaskStatusCommand): Promise<TaskAggregate> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = await queryRunner.manager.findOne(TaskAggregate, {
        where: { id: command.taskId }
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${command.taskId} not found`);
      }

      // Change status
      task.changeStatus(command.newStatus as TaskStatusEnum, command.changedBy);

      // Save to database
      const updatedTask = await queryRunner.manager.save(TaskAggregate, task);

      // Publish domain events
      const events = task.getUncommittedEvents();
      for (const event of events) {
        await this.eventBus.publish(event);
      }

      await queryRunner.commitTransaction();
      
      this.logger.log(`Task status changed: ${updatedTask.id} to ${command.newStatus}`);
      return updatedTask;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to change task status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handleChangeTaskPriority(command: ChangeTaskPriorityCommand): Promise<TaskAggregate> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = await queryRunner.manager.findOne(TaskAggregate, {
        where: { id: command.taskId }
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${command.taskId} not found`);
      }

      // Change priority
      task.changePriority(command.newPriority, command.changedBy);

      // Save to database
      const updatedTask = await queryRunner.manager.save(TaskAggregate, task);

      // Publish domain events
      const events = task.getUncommittedEvents();
      for (const event of events) {
        await this.eventBus.publish(event);
      }

      await queryRunner.commitTransaction();
      
      this.logger.log(`Task priority changed: ${updatedTask.id} to ${command.newPriority}`);
      return updatedTask;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to change task priority: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handleCompleteTask(command: CompleteTaskCommand): Promise<TaskAggregate> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = await queryRunner.manager.findOne(TaskAggregate, {
        where: { id: command.taskId }
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${command.taskId} not found`);
      }

      if (!task.canBeCompleted()) {
        throw new BadRequestException('Task cannot be completed in its current status');
      }

      // Complete task
      task.changeStatus(TaskStatusEnum.COMPLETED, command.completedBy);

      // Save to database
      const completedTask = await queryRunner.manager.save(TaskAggregate, task);

      // Publish domain events
      const events = task.getUncommittedEvents();
      for (const event of events) {
        await this.eventBus.publish(event);
      }

      await queryRunner.commitTransaction();
      
      this.logger.log(`Task completed: ${completedTask.id}`);
      return completedTask;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handleDeleteTask(command: DeleteTaskCommand): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = await queryRunner.manager.findOne(TaskAggregate, {
        where: { id: command.taskId }
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${command.taskId} not found`);
      }

      // Delete task
      await queryRunner.manager.remove(TaskAggregate, task);

      await queryRunner.commitTransaction();
      
      this.logger.log(`Task deleted: ${command.taskId}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handleBulkCreateTasks(command: BulkCreateTasksCommand): Promise<TaskAggregate[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const createdTasks: TaskAggregate[] = [];

      for (const taskData of command.tasks) {
        const task = new TaskAggregate(
          taskData.title,
          taskData.description,
          taskData.userId,
          taskData.priority,
          taskData.dueDate
        );

        if (!task.validate()) {
          throw new BadRequestException(`Invalid task data for: ${taskData.title}`);
        }

        const savedTask = await queryRunner.manager.save(TaskAggregate, task);
        createdTasks.push(savedTask);

        // Publish domain events
        const events = task.getUncommittedEvents();
        for (const event of events) {
          await this.eventBus.publish(event);
        }
      }

      await queryRunner.commitTransaction();
      
      this.logger.log(`Bulk created ${createdTasks.length} tasks`);
      return createdTasks;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to bulk create tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handleBulkUpdateTaskStatus(command: BulkUpdateTaskStatusCommand): Promise<TaskAggregate[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const updatedTasks: TaskAggregate[] = [];

      for (const taskId of command.taskIds) {
        const task = await queryRunner.manager.findOne(TaskAggregate, {
          where: { id: taskId }
        });

        if (!task) {
          throw new NotFoundException(`Task with ID ${taskId} not found`);
        }

        task.changeStatus(command.newStatus as TaskStatusEnum, command.changedBy);
        const updatedTask = await queryRunner.manager.save(TaskAggregate, task);
        updatedTasks.push(updatedTask);

        // Publish domain events
        const events = task.getUncommittedEvents();
        for (const event of events) {
          await this.eventBus.publish(event);
        }
      }

      await queryRunner.commitTransaction();
      
      this.logger.log(`Bulk updated status for ${updatedTasks.length} tasks`);
      return updatedTasks;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to bulk update task status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
