import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TaskProcessorService } from '../../src/queues/task-processor/task-processor.service';
import { OverdueTasksService } from '../../src/queues/scheduled-tasks/overdue-tasks.service';
import { TasksService } from '../../src/modules/tasks/tasks.service';
import { Task } from '../../src/modules/tasks/entities/task.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { TaskStatus } from '../../src/modules/tasks/enums/task-status.enum';
import { TaskPriority } from '../../src/modules/tasks/enums/task-priority.enum';

describe('TaskProcessorService', () => {
  let service: TaskProcessorService;
  let overdueTasksService: OverdueTasksService;
  let tasksService: TasksService;
  let dataSource: DataSource;
  let taskRepository: Repository<Task>;

  const mockTaskRepository = {
    find: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockOverdueTasksService = {
    processOverdueTasks: jest.fn(),
    sendOverdueNotifications: jest.fn(),
  };

  const mockTasksService = {
    updateStatus: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    }),
  };

  const mockUser: User = {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    password: 'hashedPassword',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    tasks: [],
  };

  const mockTask: Task = {
    id: '1',
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.PENDING,
    priority: TaskPriority.MEDIUM,
    dueDate: new Date(),
    userId: '1',
    user: mockUser,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskProcessorService,
        {
          provide: getRepositoryToken(Task),
          useValue: mockTaskRepository,
        },
        {
          provide: OverdueTasksService,
          useValue: mockOverdueTasksService,
        },
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<TaskProcessorService>(TaskProcessorService);
    overdueTasksService = module.get<OverdueTasksService>(OverdueTasksService);
    tasksService = module.get<TasksService>(TasksService);
    dataSource = module.get<DataSource>(DataSource);
    taskRepository = module.get<Repository<Task>>(getRepositoryToken(Task));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processTask', () => {
    it('should process a task successfully', async () => {
      const jobData = {
        taskId: '1',
        action: 'complete',
      };

      mockTaskRepository.find.mockResolvedValue([mockTask]);
      mockTaskRepository.save.mockResolvedValue([
        { ...mockTask, status: TaskStatus.COMPLETED },
      ]);

      const result = await service.processTask(jobData);

      expect(result).toEqual({
        success: true,
        taskId: '1',
        action: 'complete',
        message: 'Task completed successfully',
      });
      expect(mockTaskRepository.find).toHaveBeenCalledWith({
        where: { id: '1' },
      });
      expect(mockTaskRepository.save).toHaveBeenCalled();
    });

    it('should handle task not found', async () => {
      const jobData = {
        taskId: '999',
        action: 'complete',
      };

      mockTaskRepository.find.mockResolvedValue([]);

      const result = await service.processTask(jobData);

      expect(result).toEqual({
        success: false,
        taskId: '999',
        action: 'complete',
        error: 'Task not found',
      });
    });

    it('should handle invalid action', async () => {
      const jobData = {
        taskId: '1',
        action: 'invalid_action',
      };

      mockTaskRepository.find.mockResolvedValue([mockTask]);

      const result = await service.processTask(jobData);

      expect(result).toEqual({
        success: false,
        taskId: '1',
        action: 'invalid_action',
        error: 'Invalid action',
      });
    });

    it('should handle database errors', async () => {
      const jobData = {
        taskId: '1',
        action: 'complete',
      };

      mockTaskRepository.find.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const result = await service.processTask(jobData);

      expect(result).toEqual({
        success: false,
        taskId: '1',
        action: 'complete',
        error: 'Database connection failed',
      });
    });

    it('should handle task already completed', async () => {
      const completedTask = { ...mockTask, status: TaskStatus.COMPLETED };
      const jobData = {
        taskId: '1',
        action: 'complete',
      };

      mockTaskRepository.find.mockResolvedValue([completedTask]);

      const result = await service.processTask(jobData);

      expect(result).toEqual({
        success: false,
        taskId: '1',
        action: 'complete',
        error: 'Task is already completed',
      });
    });

    it('should handle task already in progress', async () => {
      const inProgressTask = { ...mockTask, status: TaskStatus.IN_PROGRESS };
      const jobData = {
        taskId: '1',
        action: 'start',
      };

      mockTaskRepository.find.mockResolvedValue([inProgressTask]);

      const result = await service.processTask(jobData);

      expect(result).toEqual({
        success: false,
        taskId: '1',
        action: 'start',
        error: 'Task is already in progress',
      });
    });
  });

  describe('processBatchTasks', () => {
    it('should process multiple tasks successfully', async () => {
      const jobData = {
        taskIds: ['1', '2', '3'],
        action: 'complete',
      };

      const mockTasks = [
        { ...mockTask, id: '1' },
        { ...mockTask, id: '2' },
        { ...mockTask, id: '3' },
      ];

      mockTaskRepository.find.mockResolvedValue(mockTasks);
      mockTaskRepository.save.mockResolvedValue(
        mockTasks.map((task) => ({ ...task, status: TaskStatus.COMPLETED })),
      );

      const result = await service.processBatchTasks(jobData);

      expect(result).toEqual({
        success: true,
        processed: 3,
        failed: 0,
        results: [
          { taskId: '1', success: true },
          { taskId: '2', success: true },
          { taskId: '3', success: true },
        ],
      });
    });

    it('should handle partial failures in batch processing', async () => {
      const jobData = {
        taskIds: ['1', '999', '3'],
        action: 'complete',
      };

      const mockTasks = [
        { ...mockTask, id: '1' },
        { ...mockTask, id: '3' },
      ];

      mockTaskRepository.find.mockResolvedValue(mockTasks);
      mockTaskRepository.save.mockResolvedValue(
        mockTasks.map((task) => ({ ...task, status: TaskStatus.COMPLETED })),
      );

      const result = await service.processBatchTasks(jobData);

      expect(result).toEqual({
        success: true,
        processed: 2,
        failed: 1,
        results: [
          { taskId: '1', success: true },
          { taskId: '999', success: false, error: 'Task not found' },
          { taskId: '3', success: true },
        ],
      });
    });

    it('should handle empty task list', async () => {
      const jobData = {
        taskIds: [],
        action: 'complete',
      };

      const result = await service.processBatchTasks(jobData);

      expect(result).toEqual({
        success: true,
        processed: 0,
        failed: 0,
        results: [],
      });
    });

    it('should handle database errors in batch processing', async () => {
      const jobData = {
        taskIds: ['1', '2'],
        action: 'complete',
      };

      mockTaskRepository.find.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const result = await service.processBatchTasks(jobData);

      expect(result).toEqual({
        success: false,
        processed: 0,
        failed: 2,
        error: 'Database connection failed',
        results: [
          { taskId: '1', success: false, error: 'Database connection failed' },
          { taskId: '2', success: false, error: 'Database connection failed' },
        ],
      });
    });
  });

  describe('processOverdueTasks', () => {
    it('should process overdue tasks successfully', async () => {
      const overdueTask = {
        ...mockTask,
        dueDate: new Date(Date.now() - 86400000), // Yesterday
        status: TaskStatus.PENDING,
      };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([overdueTask]),
      };

      mockTaskRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockTaskRepository.save.mockResolvedValue([
        { ...overdueTask, status: TaskStatus.OVERDUE },
      ]);
      mockOverdueTasksService.sendOverdueNotifications.mockResolvedValue(true);

      const result = await service.processOverdueTasks();

      expect(result).toEqual({
        success: true,
        processed: 1,
        message: 'Overdue tasks processed successfully',
      });
      expect(mockOverdueTasksService.sendOverdueNotifications).toHaveBeenCalledWith([
        overdueTask,
      ]);
    });

    it('should handle no overdue tasks', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockTaskRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.processOverdueTasks();

      expect(result).toEqual({
        success: true,
        processed: 0,
        message: 'No overdue tasks found',
      });
    });

    it('should handle database errors in overdue processing', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockRejectedValue(
          new Error('Database connection failed'),
        ),
      };

      mockTaskRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.processOverdueTasks();

      expect(result).toEqual({
        success: false,
        processed: 0,
        error: 'Database connection failed',
      });
    });

    it('should handle notification service errors', async () => {
      const overdueTask = {
        ...mockTask,
        dueDate: new Date(Date.now() - 86400000),
        status: TaskStatus.PENDING,
      };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([overdueTask]),
      };

      mockTaskRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockTaskRepository.save.mockResolvedValue([
        { ...overdueTask, status: TaskStatus.OVERDUE },
      ]);
      mockOverdueTasksService.sendOverdueNotifications.mockRejectedValue(
        new Error('Notification service failed'),
      );

      const result = await service.processOverdueTasks();

      expect(result).toEqual({
        success: false,
        processed: 1,
        error: 'Notification service failed',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent task processing', async () => {
      const jobData = {
        taskId: '1',
        action: 'complete',
      };

      mockTaskRepository.find.mockResolvedValue([mockTask]);
      mockTaskRepository.save.mockRejectedValue(
        new Error('Concurrent modification detected'),
      );

      const result = await service.processTask(jobData);

      expect(result).toEqual({
        success: false,
        taskId: '1',
        action: 'complete',
        error: 'Task is already completed',
      });
    });

    it('should handle malformed job data', async () => {
      const jobData = {
        // Missing required fields
      };

      const result = await service.processTask(jobData as any);

      expect(result).toEqual({
        success: false,
        taskId: undefined,
        action: undefined,
        error: 'Invalid job data',
      });
    });

    it('should handle very large batch operations', async () => {
      const largeTaskIds = Array.from({ length: 1000 }, (_, i) => `task-${i}`);
      const jobData = {
        taskIds: largeTaskIds,
        action: 'complete',
      };

      const mockTasks = largeTaskIds.map((id) => ({ ...mockTask, id }));

      mockTaskRepository.find.mockResolvedValue(mockTasks);
      mockTaskRepository.save.mockResolvedValue(
        mockTasks.map((task) => ({ ...task, status: TaskStatus.COMPLETED })),
      );

      const result = await service.processBatchTasks(jobData);

      expect(result.processed).toBe(1000);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(1000);
    });

    it('should handle task with null due date', async () => {
      const taskWithoutDueDate = { ...mockTask, dueDate: null, status: TaskStatus.PENDING };
      const jobData = {
        taskId: '1',
        action: 'complete',
      };

      mockTaskRepository.find.mockResolvedValue([taskWithoutDueDate]);
      mockTaskRepository.save.mockResolvedValue([
        { ...taskWithoutDueDate, status: TaskStatus.COMPLETED },
      ]);

      const result = await service.processTask(jobData);

      expect(result.success).toBe(true);
      expect((result as any).message).toBe('Task completed successfully');
    });

    it('should handle task with invalid status transition', async () => {
      const inProgressTask = { ...mockTask, status: TaskStatus.IN_PROGRESS };
      const jobData = {
        taskId: '1',
        action: 'start',
      };

      mockTaskRepository.find.mockResolvedValue([inProgressTask]);

      const result = await service.processTask(jobData);

      expect(result.success).toBe(false);
      expect((result as any).error).toBe('Task is already in progress');
    });
  });
});
