import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private tasksService: TasksService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');
    
    try {
      // Get all tasks and filter for overdue ones
      const allTasks = await this.tasksService.findAll();
      const now = new Date();
      
      const overdueTasks = allTasks.filter(task => 
        task.dueDate && 
        new Date(task.dueDate) < now && 
        task.status === TaskStatus.PENDING
      );
      
      this.logger.log(`Found ${overdueTasks.length} overdue tasks`);
      
      // Add overdue tasks to the queue for processing
      for (const task of overdueTasks) {
        await this.taskQueue.add('overdue-tasks-notification', {
          taskId: task.id,
          dueDate: task.dueDate,
        });
      }
      
      this.logger.debug('Overdue tasks check completed');
    } catch (error) {
      this.logger.error('Error checking overdue tasks:', error);
    }
  }
} 