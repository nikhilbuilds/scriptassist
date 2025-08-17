import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';

/**
 * TasksModule - Manages task-related operations and data access
 *
 * This module provides:
 * - Task CRUD operations via TasksService
 * - Task entity repository for direct database access
 * - Task processing queue integration
 * - REST API endpoints via TasksController
 *
 * Architecture Notes:
 * - Exports both TasksService and Task repository for use in other modules
 * - Uses TypeORM for database operations with proper entity registration
 * - Integrates with BullMQ for background task processing
 */
@Module({
  imports: [
    // Register Task entity with TypeORM for database operations
    TypeOrmModule.forFeature([Task]),

    // Register task processing queue for background job handling
    BullModule.registerQueue({
      name: 'task-processing',
    }),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [
    // Export TasksService for business logic access
    TasksService,
    // Export Task repository for direct database access in other modules
    // This is needed by ScheduledTasksModule for overdue task processing
    TypeOrmModule,
  ],
})
export class TasksModule {}
