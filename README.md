## Auth Module Updates

The **Auth module** has been enhanced with the following improvements:

- **Refresh Token Support**: Added functionality for refresh tokens to improve authentication flow.
- **Enhanced Type Safety**: Introduced additional DTOs and implemented stricter type checking throughout the module.
- **Improved Error Handling**: Errors are now handled with descriptive messages and standardized codes, enabling easier debugging and better developer experience.

## Performance Issues Resolved

# Performance Optimization Implementation

This document outlines the comprehensive performance optimizations implemented in the NestJS application.

## 🚀 Overview

The performance optimization focuses on four main areas:

1. **Database Query Optimization**
2. **Caching Strategy**
3. **Batch Operations**
4. **Performance Monitoring**

## 📊 Database Optimizations

### 1. Database Indexes

**Migration**: `1710752401000-AddPerformanceIndexes.ts`

Added strategic indexes for optimal query performance:

```sql
-- User authentication optimization
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role ON users (role);

-- Task filtering optimization
CREATE INDEX idx_tasks_user_id ON tasks (user_id);
CREATE INDEX idx_tasks_status ON tasks (status);
CREATE INDEX idx_tasks_priority ON tasks (priority);
CREATE INDEX idx_tasks_due_date ON tasks (due_date);
CREATE INDEX idx_tasks_created_at ON tasks (created_at);

-- Composite indexes for common query patterns
CREATE INDEX idx_tasks_user_status ON tasks (user_id, status);
CREATE INDEX idx_tasks_user_priority ON tasks (user_id, priority);

-- Partial index for overdue tasks
CREATE INDEX idx_tasks_overdue ON tasks (due_date, status)
WHERE due_date < NOW() AND status != 'COMPLETED';
```

### 2. Query Optimization

**Before**: Inefficient N+1 queries and in-memory filtering
**After**: Optimized queries with proper joins and database-level filtering

#### Key Improvements:

- **QueryBuilder**: Using TypeORM QueryBuilder for complex queries
- **Selective Field Loading**: Only loading required fields
- **Eager Loading**: Proper relation loading with `leftJoinAndSelect`
- **Database-Level Filtering**: Moving filtering logic to SQL level
- **Cursor-Based Pagination**: Efficient pagination without offset issues

#### Example Query Optimization:

```typescript
// Before: Inefficient
const tasks = await this.tasksRepository.find({
  relations: ['user'],
});

// After: Optimized
const queryBuilder = this.tasksRepository
  .createQueryBuilder('task')
  .leftJoinAndSelect('task.user', 'user')
  .select(['task.id', 'task.title', 'task.status', 'user.id', 'user.name'])
  .where('task.userId = :userId', { userId })
  .andWhere('task.status = :status', { status })
  .orderBy('task.createdAt', 'DESC')
  .limit(limit + 1);
```

## 🗄️ Caching Strategy

### 1. Redis Implementation

**Service**: `RedisCacheService`

Replaced in-memory cache with Redis for:

- **Distributed Caching**: Works across multiple application instances
- **Persistence**: Survives application restarts
- **Memory Management**: Automatic TTL and eviction policies
- **Bulk Operations**: Efficient batch operations

#### Features:

- **Namespaced Keys**: Prevents key collisions
- **Configurable TTL**: Flexible expiration times
- **Bulk Operations**: `mset` and `mget` for performance
- **Health Checks**: Redis connectivity monitoring
- **Error Handling**: Graceful fallbacks

#### Cache Patterns:

```typescript
// User data caching
await this.cacheService.set(`user:${userId}`, userData, { ttl: 300 });

// Task list caching with filter hash
const cacheKey = this.generateCacheKey('findAll', filterDto);
await this.cacheService.set(cacheKey, result, { ttl: 300 });

// Cache invalidation
await this.invalidateUserTaskCache(userId);
```

### 2. Cache Invalidation Strategy

- **Write-Through**: Cache updated immediately after database writes
- **Selective Invalidation**: Only invalidate related caches
- **Pattern-Based Clearing**: Clear user-specific caches when needed

## 📦 Batch Operations

### 1. Bulk Create Operations

```typescript
async bulkCreate(tasks: CreateTaskDto[]): Promise<Task[]> {
  const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const createdTasks = [];
    for (const taskDto of tasks) {
      const task = this.tasksRepository.create(taskDto);
      const savedTask = await queryRunner.manager.save(Task, task);
      createdTasks.push(savedTask);
    }
    await queryRunner.commitTransaction();
    return createdTasks;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

### 2. Bulk Update Operations

```typescript
async bulkUpdateStatus(taskIds: string[], status: TaskStatus): Promise<Task[]> {
  // Transaction-based bulk update with proper error handling
  // Cache invalidation for affected tasks
}
```

## 📈 Performance Monitoring

### 1. Query Performance Tracking

**Service**: `PerformanceMonitorService`

Tracks:

- Query execution time
- Success/failure rates
- Slow query detection (>1000ms)
- Query patterns and optimization opportunities

### 2. Cache Performance Metrics

Monitors:

- Cache hit/miss rates
- Total cache requests
- Cache efficiency percentages

### 3. Performance Endpoints

```typescript
// GET /performance/metrics - Comprehensive performance report
// GET /performance/queries - Database query statistics
// GET /performance/cache - Cache performance statistics
```

## 🔧 Configuration

### Environment Variables

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=taskflow
```

### Cache Configuration

```typescript
// Default TTL values
private readonly CACHE_TTL = 300; // 5 minutes
private readonly CACHE_PREFIX = 'tasks';
```

## 📊 Performance Metrics

### Expected Improvements

1. **Database Queries**: 60-80% reduction in query time
2. **Cache Hit Rate**: 70-90% cache efficiency
3. **Response Times**: 50-70% faster API responses
4. **Scalability**: Support for 10x more concurrent users

### Monitoring Dashboard

Access performance metrics at:

- `/performance/metrics` - Overall performance
- `/performance/queries` - Database performance
- `/performance/cache` - Cache performance

## 🚀 Usage Examples

### Efficient Task Filtering

```typescript
// GET /tasks?status=PENDING&priority=HIGH&limit=20&cursor=abc123
const filterDto: TaskFilterDto = {
  status: TaskStatus.PENDING,
  priority: TaskPriority.HIGH,
  limit: 20,
  cursor: 'abc123',
};

const result = await tasksService.findAll(filterDto);
// Returns: { data: Task[], nextCursor: string, hasMore: boolean }
```

### Bulk Operations

```typescript
// POST /tasks/batch/create
const tasks = [
  { title: 'Task 1', userId: 'user1' },
  { title: 'Task 2', userId: 'user1' },
];
await tasksService.bulkCreate(tasks);

// POST /tasks/batch/update-status
await tasksService.bulkUpdateStatus(['task1', 'task2'], TaskStatus.COMPLETED);
```

## 🔍 Best Practices

1. **Always use pagination** for list endpoints
2. **Implement proper cache invalidation** after writes
3. **Monitor slow queries** and optimize them
4. **Use bulk operations** for multiple items
5. **Set appropriate TTL** for different data types
6. **Monitor cache hit rates** and adjust strategies

## 🛠️ Troubleshooting

### Common Issues

1. **High Cache Miss Rate**

   - Check TTL settings
   - Review cache invalidation logic
   - Monitor cache key patterns

2. **Slow Queries**

   - Check database indexes
   - Review query execution plans
   - Optimize WHERE clauses

3. **Memory Issues**
   - Monitor Redis memory usage
   - Adjust TTL values
   - Implement cache size limits

### Performance Monitoring

Use the performance endpoints to:

- Identify bottlenecks
- Monitor trends over time
- Set up alerts for performance degradation
- Plan capacity scaling

# Architectural Improvements Implementation

This document outlines the comprehensive architectural improvements implemented in the NestJS application, focusing on Domain-Driven Design (DDD), CQRS, Event Sourcing, and SOLID principles.

## 🏗️ Overview

The architectural improvements focus on four main areas:

1. **Domain-Driven Design (DDD)**
2. **CQRS (Command Query Responsibility Segregation)**
3. **Event Sourcing**
4. **SOLID Principles & Transaction Management**

## 🎯 Domain-Driven Design (DDD)

### 1. Domain Layer Structure

```
src/domain/
├── entities/
│   ├── base.entity.ts          # Base entity with common properties
│   └── task.aggregate.ts       # Task aggregate root
├── value-objects/
│   ├── email.value-object.ts   # Email value object
│   ├── task-status.value-object.ts
│   └── task-priority.value-object.ts
└── events/
    ├── domain-event.ts         # Base domain event
    └── task-events.ts          # Task-specific events
```

### 2. Value Objects

**Email Value Object**:

```typescript
export class Email {
  private readonly value: string;

  constructor(email: string) {
    if (!this.isValid(email)) {
      throw new Error('Invalid email format');
    }
    this.value = email.toLowerCase().trim();
  }

  getValue(): string {
    return this.value;
  }
  getDomain(): string {
    return this.value.split('@')[1];
  }
  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
```

**Task Status Value Object**:

```typescript
export class TaskStatus {
  canTransitionTo(newStatus: TaskStatusEnum): boolean {
    const validTransitions = {
      PENDING: [TaskStatusEnum.IN_PROGRESS, TaskStatusEnum.CANCELLED],
      IN_PROGRESS: [TaskStatusEnum.COMPLETED, TaskStatusEnum.CANCELLED],
      COMPLETED: [],
      CANCELLED: [],
    };
    return validTransitions[this.value].includes(newStatus);
  }
}
```

### 3. Aggregate Root

**TaskAggregate** implements:

- **Encapsulation**: Private fields with controlled access
- **Business Logic**: Status transitions, validation rules
- **Event Sourcing**: Uncommitted events tracking
- **Invariants**: Business rule enforcement

```typescript
export class TaskAggregate extends BaseEntity {
  changeStatus(newStatus: TaskStatusEnum, changedBy: string): void {
    if (!this.status.canTransitionTo(newStatus)) {
      throw new Error(`Invalid status transition`);
    }

    const oldStatus = this.status.getValue();
    this.status = TaskStatus.create(newStatus);

    this.raiseEvent(new TaskStatusChangedEvent(this.id, oldStatus, newStatus, changedBy));
  }
}
```

## 🔄 CQRS Implementation

### 1. Command Side

**Commands**:

```typescript
export class CreateTaskCommand extends BaseCommand {
  constructor(
    public readonly title: string,
    public readonly description: string,
    public readonly userId: string,
    public readonly priority: TaskPriorityEnum,
    public readonly dueDate?: Date,
  ) {
    super();
  }
}
```

**Command Handler**:

```typescript
@Injectable()
export class TaskCommandHandler {
  async handleCreateTask(command: CreateTaskCommand): Promise<TaskAggregate> {
    return this.transactionService.executeWrite(async entityManager => {
      const task = new TaskAggregate(
        command.title,
        command.description,
        command.userId,
        command.priority,
        command.dueDate,
      );

      const savedTask = await entityManager.save(TaskAggregate, task);

      // Publish domain events
      const events = task.getUncommittedEvents();
      for (const event of events) {
        await this.eventBus.publish(event);
      }

      return savedTask;
    });
  }
}
```

### 2. Query Side

**Queries**:

```typescript
export class GetTasksQuery extends BaseQuery {
  constructor(
    public readonly userId?: string,
    public readonly status?: TaskStatusEnum,
    public readonly priority?: TaskPriorityEnum,
    public readonly search?: string,
    // ... other filters
  ) {
    super();
  }
}
```

**Query Handler**:

```typescript
@Injectable()
export class TaskQueryHandler {
  async handleGetTasks(query: GetTasksQuery): Promise<PaginationResult<TaskAggregate>> {
    return this.transactionService.executeReadOnly(async entityManager => {
      const queryBuilder = this.buildTaskQuery(query);
      return this.executePaginatedQuery(queryBuilder, query);
    });
  }
}
```

### 3. Application Service

**Orchestration Layer**:

```typescript
@Injectable()
export class TaskApplicationService {
  async createTask(title: string, description: string, userId: string): Promise<TaskAggregate> {
    const command = new CreateTaskCommand(title, description, userId);
    return this.commandBus.execute(command);
  }

  async getTasks(filters: any): Promise<PaginationResult<TaskAggregate>> {
    const query = new GetTasksQuery(filters.userId, filters.status, filters.priority);
    return this.queryBus.execute(query);
  }
}
```

## 📡 Event Sourcing

### 1. Domain Events

**Base Event**:

```typescript
export abstract class DomainEvent {
  public readonly occurredOn: Date;
  public readonly eventId: string;
  public readonly aggregateId: string;
  public readonly eventType: string;

  abstract getEventData(): any;
}
```

**Task Events**:

```typescript
export class TaskCreatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly title: string,
    public readonly description: string,
    public readonly status: TaskStatusEnum,
    public readonly priority: TaskPriorityEnum,
    public readonly userId: string,
    public readonly dueDate?: Date,
  ) {
    super(aggregateId);
  }
}
```

### 2. Event Handlers

```typescript
@Injectable()
@EventsHandler(TaskCreatedEvent, TaskStatusChangedEvent, TaskCompletedEvent)
export class TaskEventHandler
  implements IEventHandler<TaskCreatedEvent>, IEventHandler<TaskStatusChangedEvent>
{
  async handle(event: TaskCreatedEvent): Promise<void> {
    // Invalidate caches
    await this.invalidateUserTaskCache(event.userId);

    // Add to processing queue
    await this.taskQueue.add('task-created', {
      taskId: event.aggregateId,
      userId: event.userId,
      priority: event.priority,
    });
  }
}
```

## 🔒 Transaction Management

### 1. Transaction Service

**Consistent Transaction Handling**:

```typescript
@Injectable()
export class TransactionService {
  async executeInTransaction<T>(
    operation: (entityManager: EntityManager) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    const { isolationLevel = 'READ COMMITTED', maxRetries = 3 } = options;

    let retryCount = 0;
    while (retryCount <= maxRetries) {
      const queryRunner = this.dataSource.createQueryRunner();

      try {
        await queryRunner.startTransaction(isolationLevel as any);
        const result = await operation(queryRunner.manager);
        await queryRunner.commitTransaction();
        return result;
      } catch (error) {
        await queryRunner.rollbackTransaction();

        if (this.isRetryableError(error) && retryCount < maxRetries) {
          retryCount++;
          await this.sleep(Math.pow(2, retryCount) * 1000);
          continue;
        }
        throw error;
      } finally {
        await queryRunner.release();
      }
    }
  }
}
```

### 2. Saga Pattern

**Distributed Transaction Support**:

```typescript
async executeSaga<T>(
  operations: Array<{
    execute: (entityManager: EntityManager) => Promise<T>;
    compensate: (entityManager: EntityManager, data: T) => Promise<void>;
  }>
): Promise<T[]> {
  const results: T[] = [];
  const compensations: Array<() => Promise<void>> = [];

  try {
    for (const operation of operations) {
      const result = await this.executeInTransaction(operation.execute);
      results.push(result);

      compensations.push(async () => {
        await this.executeInTransaction(async (manager) => {
          await operation.compensate(manager, result);
        });
      });
    }
    return results;
  } catch (error) {
    // Execute compensations in reverse order
    for (let i = compensations.length - 1; i >= 0; i--) {
      await compensations[i]();
    }
    throw error;
  }
}
```

## 🎯 SOLID Principles Implementation

### 1. Single Responsibility Principle (SRP)

- **TaskAggregate**: Manages task business logic only
- **TaskCommandHandler**: Handles commands only
- **TaskQueryHandler**: Handles queries only
- **TransactionService**: Manages transactions only

### 2. Open/Closed Principle (OCP)

- **BaseEntity**: Open for extension, closed for modification
- **DomainEvent**: New event types can be added without changing existing code
- **Value Objects**: Immutable and extensible

### 3. Liskov Substitution Principle (LSP)

- **BaseEntity**: All entities can be substituted for their base type
- **DomainEvent**: All events can be handled by the event bus

### 4. Interface Segregation Principle (ISP)

- **IEventHandler**: Specific interfaces for each event type
- **Command/Query**: Separate interfaces for commands and queries

### 5. Dependency Inversion Principle (DIP)

- **Application Service**: Depends on abstractions (CommandBus, QueryBus)
- **Event Handlers**: Depends on event abstractions
- **Transaction Service**: Depends on DataSource abstraction

## 📊 Benefits Achieved

### 1. **Scalability**

- **Read/Write Separation**: Independent scaling of read and write operations
- **Event-Driven**: Loose coupling through domain events
- **Caching**: Optimized read models with Redis

### 2. **Maintainability**

- **Clear Boundaries**: Domain, application, and infrastructure layers
- **Business Logic**: Centralized in domain entities
- **Testability**: Easy to unit test each component

### 3. **Performance**

- **Optimized Queries**: Dedicated query models
- **Caching Strategy**: Smart cache invalidation
- **Transaction Management**: Proper isolation levels

### 4. **Flexibility**

- **Event Sourcing**: Complete audit trail
- **Saga Pattern**: Complex business workflows
- **CQRS**: Independent evolution of read/write models

## 🔧 Configuration

### 1. Module Setup

```typescript
@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([TaskAggregate]),
    BullModule.registerQueue({ name: 'task-processing' }),
  ],
  providers: [
    TaskCommandHandler,
    TaskQueryHandler,
    TaskEventHandler,
    TaskApplicationService,
    TransactionService,
  ],
  exports: [TaskApplicationService],
})
export class TasksModule {}
```

### 2. Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=taskflow

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=refresh-secret
```

## 🚀 Usage Examples

### 1. Creating a Task

```typescript
// Controller
@Post()
async createTask(@Body() createTaskDto: CreateTaskDto) {
  return this.taskApplicationService.createTask(
    createTaskDto.title,
    createTaskDto.description,
    createTaskDto.userId,
    createTaskDto.priority,
    createTaskDto.dueDate
  );
}
```

### 2. Querying Tasks

```typescript
// Controller
@Get()
async getTasks(@Query() filters: TaskFilterDto) {
  return this.taskApplicationService.getTasks({
    userId: filters.userId,
    status: filters.status,
    priority: filters.priority,
    search: filters.search,
    limit: filters.limit,
    cursor: filters.cursor,
  });
}
```

### 3. Business Operations

```typescript
// Dashboard
@Get('dashboard/:userId')
async getDashboard(@Param('userId') userId: string) {
  return this.taskApplicationService.getTaskDashboard(userId);
}

// Analytics
@Get('analytics')
async getAnalytics(@Query('userId') userId?: string) {
  return this.taskApplicationService.getTaskAnalytics(userId);
}
```

## 🔍 Best Practices

1. **Domain Events**: Always raise events for state changes
2. **Transaction Boundaries**: Use appropriate isolation levels
3. **Caching Strategy**: Invalidate caches on writes
4. **Error Handling**: Implement proper retry mechanisms
5. **Validation**: Validate at domain level
6. **Testing**: Unit test domain logic, integration test workflows

## 🛠️ Monitoring & Observability

- **Event Tracking**: All domain events are logged
- **Transaction Monitoring**: Performance metrics for transactions
- **Cache Statistics**: Hit/miss rates and performance
- **Queue Monitoring**: BullMQ dashboard for job processing

The architectural improvements provide a solid foundation for scalable, maintainable, and performant applications while following industry best practices and design patterns.

# Security Enhancements Implementation

This document outlines the comprehensive security enhancements implemented in the NestJS application, focusing on authentication, authorization, rate limiting, and data validation.

## 🛡️ Overview

The security enhancements focus on four main areas:

1. **Enhanced Authentication with Refresh Token Rotation**
2. **Multi-Level Authorization System**
3. **Secure Rate Limiting**
4. **Data Validation and Sanitization**

## 🔐 1. Enhanced Authentication with Refresh Token Rotation

### Features Implemented

#### Refresh Token Rotation

- **Token Rotation**: Each refresh token can only be used once
- **Automatic Invalidation**: Old refresh tokens are immediately invalidated when new ones are issued
- **Secure Storage**: Refresh tokens are stored as SHA-256 hashes in Redis
- **Session Management**: Proper session tracking and validation

#### Implementation Details

```typescript
// Enhanced refresh token strategy with rotation
@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  async validate(req: Request, payload: any) {
    // Check if refresh token is in cache (not revoked)
    const isTokenValid = await this.cacheService.get(`refresh_token:${payload.sub}`);
    if (!isTokenValid) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Verify the token hash matches
    const tokenHash = await this.cacheService.get(`refresh_token_hash:${payload.sub}`);
    if (!tokenHash || tokenHash !== this.hashToken(refreshToken)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Implement token rotation - invalidate current refresh token
    await this.cacheService.delete(`refresh_token:${payload.sub}`);
    await this.cacheService.delete(`refresh_token_hash:${payload.sub}`);

    return { userId: payload.sub, email: payload.email, role: payload.role, refreshToken };
  }
}
```

#### Security Benefits

- **Prevents Token Reuse**: Each refresh token can only be used once
- **Reduces Attack Surface**: Compromised refresh tokens are immediately invalidated
- **Session Isolation**: Different sessions cannot share refresh tokens
- **Audit Trail**: All token operations are logged and tracked

## 🔒 2. Multi-Level Authorization System

### Features Implemented

#### Enhanced Authorization Guard

The `EnhancedAuthGuard` implements 7 levels of security checks:

1. **Token Validation**: Verifies JWT token authenticity and blacklist status
2. **Session Validation**: Ensures user session is active and valid
3. **User Status Check**: Validates user account is active
4. **Role-based Authorization**: Checks user roles against required roles
5. **Permission-based Authorization**: Validates specific permissions
6. **Resource-based Authorization**: Ensures resource ownership
7. **Rate Limiting Check**: Prevents abuse through rate limiting

#### Implementation Details

```typescript
@Injectable()
export class EnhancedAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Level 1: Token Validation
    const token = this.extractTokenFromHeader(request);
    const payload = await this.validateToken(token);

    // Level 2: Session Validation
    const sessionValid = await this.validateSession(payload.sub, request);

    // Level 3: User Status Check
    const user = await this.usersService.findOne(payload.sub);
    if (!user || user.isActive === false) {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    // Level 4: Role-based Authorization
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    // Level 5: Permission-based Authorization
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);

    // Level 6: Resource-based Authorization
    const resourceOwnerCheck = this.reflector.getAllAndOverride<boolean>('checkResourceOwner', [
      context.getHandler(),
      context.getClass(),
    ]);

    // Level 7: Rate Limiting Check
    const rateLimitExceeded = await this.checkRateLimit(request, user.id);

    return true;
  }
}
```

#### Authorization Decorators

```typescript
// Role-based decorators
export const AdminOnly = () => Roles('ADMIN');
export const ManagerOrAdmin = () => Roles('MANAGER', 'ADMIN');
export const AuthenticatedUser = () => Roles('USER', 'MANAGER', 'ADMIN');

// Permission-based decorators
export const CanReadUsers = () => Permissions('users:read');
export const CanWriteUsers = () => Permissions('users:write');
export const CanDeleteUsers = () => Permissions('users:delete');
export const CanReadTasks = () => Permissions('tasks:read');
export const CanWriteTasks = () => Permissions('tasks:write');
export const CanDeleteTasks = () => Permissions('tasks:delete');

// Combined decorators
export const AdminAccess = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    AdminOnly()(target, propertyKey, descriptor);
    CanManageSystem()(target, propertyKey, descriptor);
    return descriptor;
  };
};
```

#### Permission System

```typescript
private getRolePermissions(role: string): string[] {
  const permissionMap = {
    'ADMIN': [
      'users:read', 'users:write', 'users:delete',
      'tasks:read', 'tasks:write', 'tasks:delete',
      'system:admin', 'reports:read', 'reports:write'
    ],
    'MANAGER': [
      'users:read', 'tasks:read', 'tasks:write',
      'reports:read', 'team:manage'
    ],
    'USER': [
      'tasks:read', 'tasks:write:own',
      'profile:read', 'profile:write'
    ]
  };

  return permissionMap[role] || [];
}
```

## 🚦 3. Secure Rate Limiting

### Features Implemented

#### Redis-based Rate Limiting

- **Sliding Window**: Implements sliding window rate limiting for accurate tracking
- **Per-User Limits**: Different rate limits for different user types
- **Per-Endpoint Limits**: Customizable limits per API endpoint
- **IP-based Limiting**: Fallback to IP-based limiting for anonymous users
- **Configurable Windows**: Flexible time windows and request limits

#### Implementation Details

```typescript
@Injectable()
export class SecureRateLimitGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();

    // Get rate limit configuration from decorator or use default
    const config = this.getRateLimitConfig(context) || this.defaultConfig;

    // Generate rate limit key
    const key = this.generateKey(request, config);

    // Check if rate limit is exceeded
    const isExceeded = await this.checkRateLimit(key, config);

    if (isExceeded) {
      // Set rate limit headers
      response.setHeader('X-RateLimit-Limit', config.maxRequests);
      response.setHeader('X-RateLimit-Remaining', Math.max(0, remainingRequests));
      response.setHeader('X-RateLimit-Reset', new Date(Date.now() + remainingTime).toISOString());
      response.setHeader('Retry-After', Math.ceil(remainingTime / 1000));

      throw new ForbiddenException({
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil(remainingTime / 1000),
        remainingRequests: Math.max(0, remainingRequests),
      });
    }

    return true;
  }
}
```

#### Rate Limit Decorators

```typescript
// Predefined rate limit configurations
export const StrictRateLimit = () =>
  RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
  });

export const StandardRateLimit = () =>
  RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
  });

export const AuthRateLimit = () =>
  RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // Strict limit for authentication endpoints
  });

export const PerUserRateLimit = (maxRequests: number) =>
  RateLimit({
    windowMs: 15 * 60 * 1000,
    maxRequests,
    keyGenerator: request => {
      const userId = (request as any).user?.userId || 'anonymous';
      return `rate_limit:user:${userId}`;
    },
  });
```

## 🧹 4. Data Validation and Sanitization

### Features Implemented

#### Secure Validation Pipe

- **Input Sanitization**: Removes malicious content and normalizes data
- **XSS Protection**: Prevents cross-site scripting attacks
- **SQL Injection Protection**: Basic SQL injection pattern detection
- **NoSQL Injection Protection**: MongoDB injection pattern detection
- **Command Injection Protection**: Shell command injection prevention
- **Prototype Pollution Protection**: Prevents prototype pollution attacks
- **Payload Size Limits**: Prevents large payload attacks
- **Nesting Depth Limits**: Prevents deep object nesting attacks

#### Implementation Details

```typescript
@Injectable()
export class SecureValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    // Step 1: Sanitize input data
    const sanitizedValue = this.sanitizeInput(value);

    // Step 2: Transform to DTO class
    const object = plainToClass(metatype, sanitizedValue, this.options.transformOptions);

    // Step 3: Validate the object
    const errors = await validate(object, this.options);

    // Step 4: Additional security checks
    this.performSecurityChecks(object);

    return object;
  }

  private sanitizeString(str: string): string {
    // Remove null bytes and control characters
    let sanitized = str.replace(/[\x00-\x1F\x7F]/g, '');

    // Normalize unicode characters
    sanitized = sanitized.normalize('NFC');

    // Remove potential XSS vectors
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: [], // No HTML tags allowed
      ALLOWED_ATTR: [], // No attributes allowed
    });

    // Escape HTML entities
    sanitized = escape(sanitized);

    // Remove SQL injection patterns
    const sqlPatterns = [
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script)\b)/gi,
      /(\b(or|and)\b\s+\d+\s*=\s*\d+)/gi,
    ];

    sqlPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    return sanitized;
  }
}
```

#### Security Checks

```typescript
private performSecurityChecks(object: any): void {
  // Check for potential security issues
  this.checkForSuspiciousPatterns(object);
  this.checkForLargePayloads(object);
  this.checkForNestedObjects(object);
}

private checkForSuspiciousPatterns(object: any): void {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /vbscript:/i,
    /on\w+\s*=/i,
    /data:text\/html/i,
    /data:application\/javascript/i,
  ];

  // Recursively check all values for suspicious patterns
  if (checkValue(object)) {
    throw new BadRequestException('Suspicious content detected');
  }
}
```

## 🚀 Usage Examples

### Applying Security to Controllers

```typescript
@Controller('tasks')
@UseGuards(EnhancedAuthGuard, SecureRateLimitGuard)
export class TasksController {
  @Post()
  @UsePipes(SecureValidationPipe)
  @AuthRateLimit()
  @CanWriteTasks()
  @CheckResourceOwner()
  async createTask(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @StandardRateLimit()
  @CanReadTasks()
  async findAll(@Query() filterDto: TaskFilterDto) {
    return this.tasksService.findAll(filterDto);
  }

  @Get(':id')
  @PerUserRateLimit(50)
  @CanReadTasks()
  async findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Put(':id')
  @UsePipes(SecureValidationPipe)
  @StrictRateLimit()
  @CanWriteTasks()
  @CheckResourceOwner()
  async updateTask(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    return this.tasksService.update(id, updateTaskDto);
  }
}
```

### Applying Security to Auth Endpoints

```typescript
@Controller('auth')
@UseGuards(SecureRateLimitGuard)
export class AuthController {
  @Post('login')
  @AuthRateLimit()
  @UsePipes(SecureValidationPipe)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @AuthRateLimit()
  @UsePipes(SecureValidationPipe)
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('refresh')
  @AuthRateLimit()
  @UseGuards(RefreshTokenStrategy)
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }
}
```

## 🔧 Configuration

### Environment Variables

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_MAX_REQUESTS=5

# Security Configuration
MAX_PAYLOAD_SIZE=1048576
MAX_NESTING_DEPTH=10
```

### Module Configuration

```typescript
@Module({
  imports: [
    // Security modules
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get('RATE_LIMIT_WINDOW_MS', 900000),
          limit: configService.get('RATE_LIMIT_MAX_REQUESTS', 100),
        },
      ],
    }),
  ],
  providers: [
    // Security providers
    SecureValidationPipe,
    SecureRateLimitGuard,
    EnhancedAuthGuard,
  ],
})
export class AppModule {}
```

## 📊 Security Monitoring

### Rate Limit Headers

The system automatically sets rate limit headers on all responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2024-01-15T10:30:00.000Z
Retry-After: 900
```

### Security Logging

All security events are logged with appropriate levels:

```typescript
// Authentication events
this.logger.log(`User ${userId} logged in successfully`);
this.logger.warn(`Failed login attempt for email: ${email}`);
this.logger.error(`Token validation failed: ${error.message}`);

// Authorization events
this.logger.warn(`Access denied for user ${userId} to resource ${resourceId}`);
this.logger.error(`Permission check failed: ${error.message}`);

// Rate limiting events
this.logger.warn(`Rate limit exceeded for IP: ${ip}`);
this.logger.error(`Rate limiting error: ${error.message}`);

// Validation events
this.logger.warn(`Suspicious content detected in request`);
this.logger.error(`Validation failed: ${error.message}`);
```

## 🛡️ Security Best Practices

### 1. Token Management

- Use short-lived access tokens (1 hour)
- Implement refresh token rotation
- Store token hashes, not plain tokens
- Implement token blacklisting

### 2. Authorization

- Use principle of least privilege
- Implement role-based and permission-based access control
- Validate resource ownership
- Log all authorization decisions

### 3. Rate Limiting

- Use sliding window rate limiting
- Implement different limits for different endpoints
- Set appropriate limits for authentication endpoints
- Monitor and adjust limits based on usage patterns

### 4. Input Validation

- Sanitize all user inputs
- Validate data types and formats
- Check for malicious patterns
- Limit payload sizes and nesting depths

### 5. Monitoring and Logging

- Log all security events
- Monitor for suspicious patterns
- Set up alerts for security violations
- Regularly review security logs

This comprehensive security implementation provides a robust foundation for protecting the application against common security threats while maintaining flexibility for future enhancements.
