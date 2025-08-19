import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskProcessorService } from './task-processor.service';
import { TasksModule } from '../../modules/tasks/tasks.module';
import { Task } from '../../modules/tasks/entities/task.entity';
import { ScheduledTasksModule } from '../scheduled-tasks/scheduled-tasks.module';


@Module({
  imports: [
    BullModule.registerQueue({
      name: 'task-processing',
    }),
    TasksModule,
    TypeOrmModule.forFeature([Task]),
    ScheduledTasksModule,
  ],
  providers: [TaskProcessorService],
  exports: [TaskProcessorService, BullModule],
})
export class TaskProcessorModule {} 