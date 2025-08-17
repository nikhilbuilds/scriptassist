import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { CqrsModule } from '@nestjs/cqrs';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { TaskAggregate } from '../../domain/entities/task.aggregate';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import { TransactionService } from '../../common/services/transaction.service';
import { TaskCommandHandler } from '../../application/command-handlers/task-command.handler';
import { TaskQueryHandler } from '../../application/query-handlers/task-query.handler';
import { TaskCreatedHandler } from '../../application/event-handlers/task-event.handler';
import { TaskStatusChangedHandler } from '../../application/event-handlers/task-event.handler';
import { TaskPriorityChangedHandler } from '../../application/event-handlers/task-event.handler';
import { TaskCompletedHandler } from '../../application/event-handlers/task-event.handler';
import { TaskOverdueHandler } from '../../application/event-handlers/task-event.handler';
import { TaskApplicationService } from '../../application/application-services/task.application-service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskAggregate]),
    BullModule.registerQueue({
      name: 'task-processing',
    }),
    CqrsModule,
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    RedisCacheService,
    TransactionService,
    TaskCommandHandler,
    TaskQueryHandler,
    TaskCreatedHandler,
    TaskStatusChangedHandler,
    TaskPriorityChangedHandler,
    TaskCompletedHandler,
    TaskOverdueHandler,
    TaskApplicationService,
  ],
  exports: [TasksService, TaskApplicationService],
})
export class TasksModule {} 