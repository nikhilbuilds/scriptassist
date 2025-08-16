import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { CqrsModule } from '@nestjs/cqrs';
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './modules/auth/auth.module';
import { TaskProcessorModule } from './queues/task-processor/task-processor.module';
import { ScheduledTasksModule } from './queues/scheduled-tasks/scheduled-tasks.module';
import { RedisCacheService } from './common/services/redis-cache.service';
import { PerformanceMonitorService } from './common/services/performance-monitor.service';
import { PerformanceController } from './common/controllers/performance.controller';
import { TransactionService } from './common/services/transaction.service';
import { SecureValidationPipe } from './common/pipes/secure-validation.pipe';
import { SecureRateLimitGuard } from './common/guards/secure-rate-limit.guard';
import jwtConfig from './config/jwt.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [jwtConfig],
    }),
    
    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
      }),
    }),
    
    // Scheduling
    ScheduleModule.forRoot(),
    
    // CQRS
    CqrsModule,
    
    // Queue
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
        },
      }),
    }),
    
    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ([
        {
          ttl: 60,
          limit: 10,
        },
      ]),
    }),
    
    // Feature modules
    UsersModule,
    TasksModule,
    AuthModule,
    
    // Queue processing modules
    TaskProcessorModule,
    ScheduledTasksModule,
  ],
  controllers: [
    PerformanceController,
  ],
  providers: [
    // Redis-based cache service for better performance and scalability
    RedisCacheService,
    PerformanceMonitorService,
    TransactionService,
    // Security components
    SecureValidationPipe,
    SecureRateLimitGuard,
  ],
  exports: [
    // Exporting the Redis cache service for use across modules
    RedisCacheService,
    PerformanceMonitorService,
    TransactionService,
    // Export security components
    SecureValidationPipe,
    SecureRateLimitGuard,
  ]
})
export class AppModule {} 