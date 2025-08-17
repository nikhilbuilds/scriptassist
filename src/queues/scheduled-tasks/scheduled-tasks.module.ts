import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { OverdueTasksService } from './overdue-tasks.service';
import { TasksModule } from '../../modules/tasks/tasks.module';

/**
 * ScheduledTasksModule - Handles scheduled background tasks and job processing
 *
 * This module provides:
 * - Scheduled task execution via @nestjs/schedule
 * - Background job processing via BullMQ
 * - Overdue task monitoring and processing
 *
 * Architecture Notes:
 * - Imports TasksModule to access Task repository and business logic
 * - Uses ScheduleModule for cron-based task scheduling
 * - Integrates with BullMQ for reliable background job processing
 * - Follows separation of concerns by keeping scheduled tasks separate from main business logic
 *
 * Dependencies:
 * - TasksModule: Provides Task repository and business logic
 * - ScheduleModule: Enables cron-based scheduling
 * - BullModule: Provides queue infrastructure for background processing
 */
@Module({
  imports: [
    // Enable cron-based task scheduling
    ScheduleModule.forRoot(),

    // Register task processing queue for background job handling
    BullModule.registerQueue({
      name: 'task-processing',
    }),

    // Import TasksModule to access Task repository and business logic
    // This provides the TaskRepository dependency needed by OverdueTasksService
    TasksModule,
  ],
  providers: [
    // Service responsible for monitoring and processing overdue tasks
    OverdueTasksService,
  ],
  exports: [
    // Export OverdueTasksService for potential use in other modules
    OverdueTasksService,
  ],
})
export class ScheduledTasksModule {}
