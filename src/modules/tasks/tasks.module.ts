import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { TasksRepository } from './tasks.repository';
import { TASKS_REPOSITORY } from './tasks.repository.interface';
import { CacheService } from '../../common/services/cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    BullModule.registerQueue({
      name: 'task-processing',
    }),
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    CacheService,
    {
      provide: TASKS_REPOSITORY,
      useClass: TasksRepository,
    },
  ],
  exports: [TasksService],
})
export class TasksModule {}
