import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from '../../../src/modules/tasks/tasks.controller';
import { TasksService } from '../../../src/modules/tasks/tasks.service';
import { TaskStatus } from '../../../src/modules/tasks/enums/task-status.enum';
import { TaskPriority } from '../../../src/modules/tasks/enums/task-priority.enum';
import { BatchAction } from '../../../src/modules/tasks/dto/batch-task.dto';
import { CreateTaskDto } from '../../../src/modules/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../../../src/modules/tasks/dto/update-task.dto';
import { BatchTaskDto } from '../../../src/modules/tasks/dto/batch-task.dto';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Task } from '../../../src/modules/tasks/entities/task.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

  const mockTasksService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getStats: jest.fn(),
  };

  const mockUser = {
    id: '1',
    email: 'test@example.com',
    role: 'user',
  };

  const mockTask: Task = {
    id: '1',
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.PENDING,
    priority: TaskPriority.MEDIUM,
    dueDate: new Date(),
    userId: '1',
    user: mockUser as User,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a task successfully', async () => {
      const createTaskDto: CreateTaskDto = {
        title: 'New Task',
        description: 'New Description',
        priority: TaskPriority.HIGH,
        dueDate: new Date(),
      };

      const expectedCreateData = {
        ...createTaskDto,
        userId: mockUser.id,
      };

      mockTasksService.create.mockResolvedValue(mockTask);

      const result = await controller.create(createTaskDto, mockUser);

      expect(result).toEqual(mockTask);
      expect(service.create).toHaveBeenCalledWith(expectedCreateData);
    });

    it('should handle validation errors', async () => {
      const createTaskDto: CreateTaskDto = {
        title: '',
        description: 'New Description',
        priority: TaskPriority.HIGH,
      };

      mockTasksService.create.mockRejectedValue(new Error('Validation failed'));

      await expect(controller.create(createTaskDto, mockUser)).rejects.toThrow(
        'Validation failed',
      );
    });

    it('should handle service errors', async () => {
      const createTaskDto: CreateTaskDto = {
        title: 'New Task',
        description: 'New Description',
        priority: TaskPriority.HIGH,
      };

      mockTasksService.create.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(controller.create(createTaskDto, mockUser)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks with filtering', async () => {
      const mockResponse = {
        data: [mockTask],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      const expectedFilter = {
        status: 'PENDING',
        priority: 'HIGH',
        page: 1,
        limit: 10,
        userId: mockUser.id,
      };

      mockTasksService.findAll.mockResolvedValue(mockResponse);

      const result = await controller.findAll(
        'PENDING',
        'HIGH',
        '1',
        '10',
        mockUser,
      );

      expect(result).toEqual(mockResponse);
      expect(service.findAll).toHaveBeenCalledWith(expectedFilter);
    });

    it('should handle empty results', async () => {
      const mockResponse = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };

      mockTasksService.findAll.mockResolvedValue(mockResponse);

      const result = await controller.findAll(undefined, undefined, '1', '10', mockUser);

      expect(result).toEqual(mockResponse);
      expect(result.data).toHaveLength(0);
    });

    it('should handle invalid filter parameters', async () => {
      mockTasksService.findAll.mockRejectedValue(
        new Error('Invalid filter parameters'),
      );

      await expect(
        controller.findAll(undefined, undefined, '-1', '0', mockUser),
      ).rejects.toThrow('Invalid filter parameters');
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      mockTasksService.findOne.mockResolvedValue(mockTask);

      const result = await controller.findOne('1');

      expect(result).toEqual(mockTask);
      expect(service.findOne).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockTasksService.findOne.mockResolvedValue(null);

      await expect(controller.findOne('999')).rejects.toThrow('Couldn\'t find that task - maybe it was deleted?');
    });
  });

  describe('update', () => {
    it('should update a task successfully', async () => {
      const updateTaskDto: UpdateTaskDto = {
        title: 'Updated Task',
        status: TaskStatus.COMPLETED,
      };

      const updatedTask = { ...mockTask, ...updateTaskDto };

      mockTasksService.update.mockResolvedValue(updatedTask);

      const result = await controller.update('1', updateTaskDto);

      expect(result).toEqual(updatedTask);
      expect(service.update).toHaveBeenCalledWith('1', updateTaskDto);
    });

    it('should handle service errors', async () => {
      const updateTaskDto: UpdateTaskDto = {
        title: 'Updated Task',
      };

      mockTasksService.update.mockRejectedValue(
        new Error('Update failed'),
      );

      await expect(controller.update('1', updateTaskDto)).rejects.toThrow(
        'Update failed',
      );
    });
  });

  describe('remove', () => {
    it('should delete a task successfully', async () => {
      mockTasksService.remove.mockResolvedValue({ message: 'Task deleted' });

      const result = await controller.remove('1');

      expect(result).toEqual({ message: 'Task deleted' });
      expect(service.remove).toHaveBeenCalledWith('1');
    });

    it('should handle service errors', async () => {
      mockTasksService.remove.mockRejectedValue(
        new Error('Delete failed'),
      );

      await expect(controller.remove('1')).rejects.toThrow('Delete failed');
    });
  });

  describe('batchProcess', () => {
    it('should perform batch operations successfully', async () => {
      const batchDto: BatchTaskDto = {
        tasks: ['1', '2'],
        action: BatchAction.COMPLETE,
      };

      const mockTask1 = { ...mockTask, id: '1' };
      const mockTask2 = { ...mockTask, id: '2' };

      mockTasksService.findOne
        .mockResolvedValueOnce(mockTask1)
        .mockResolvedValueOnce(mockTask2);
      mockTasksService.update
        .mockResolvedValueOnce({ ...mockTask1, status: TaskStatus.COMPLETED })
        .mockResolvedValueOnce({ ...mockTask2, status: TaskStatus.COMPLETED });

      const result = await controller.batchProcess(batchDto, mockUser);

      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('action', 'complete');
      expect(result).toHaveProperty('userId', mockUser.id);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });

    it('should handle partial failures in batch operations', async () => {
      const batchDto: BatchTaskDto = {
        tasks: ['1', '999'],
        action: BatchAction.COMPLETE,
      };

      mockTasksService.findOne
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce(null);
      mockTasksService.update.mockResolvedValueOnce({ ...mockTask, status: 'COMPLETED' });

      const result = await controller.batchProcess(batchDto, mockUser);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Task not found');
    });

    it('should handle access denied for tasks not belonging to user', async () => {
      const batchDto: BatchTaskDto = {
        tasks: ['1'],
        action: BatchAction.COMPLETE,
      };

      const otherUserTask = { ...mockTask, userId: '2' };

      mockTasksService.findOne.mockResolvedValue(otherUserTask);

      const result = await controller.batchProcess(batchDto, mockUser);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('Access denied');
    });

    it('should handle invalid batch action', async () => {
      const batchDto: BatchTaskDto = {
        tasks: ['1'],
        action: 'invalid_action' as any,
      };

      mockTasksService.findOne.mockResolvedValue(mockTask);

      const result = await controller.batchProcess(batchDto, mockUser);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Unknown action: invalid_action');
    });

    it('should handle empty task list', async () => {
      const batchDto: BatchTaskDto = {
        tasks: [],
        action: BatchAction.COMPLETE,
      };

      const result = await controller.batchProcess(batchDto, mockUser);

      expect(result.results).toHaveLength(0);
      expect(result.message).toContain('Batch processed 0 tasks');
    });
  });

  describe('getStats', () => {
    it('should return task statistics', async () => {
      const mockStats = {
        total: 10,
        completed: 5,
        inProgress: 3,
        pending: 2,
        highPriority: 4,
      };

      mockTasksService.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats();

      expect(result).toEqual(mockStats);
      expect(service.getStats).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle malformed request data', async () => {
      const malformedDto = {
        title: 123, // Should be string
        priority: 'INVALID_PRIORITY',
      };

      mockTasksService.create.mockRejectedValue(
        new Error('Invalid data format'),
      );

      await expect(
        controller.create(malformedDto as any, mockUser),
      ).rejects.toThrow('Invalid data format');
    });

    it('should handle service timeout', async () => {
      const createTaskDto: CreateTaskDto = {
        title: 'Test Task',
        description: 'Test Description',
        priority: TaskPriority.HIGH,
      };

      mockTasksService.create.mockRejectedValue(
        new Error('Service timeout'),
      );

      await expect(controller.create(createTaskDto, mockUser)).rejects.toThrow(
        'Service timeout',
      );
    });

    it('should handle concurrent requests', async () => {
      const updateTaskDto: UpdateTaskDto = {
        title: 'Concurrent Update',
      };

      mockTasksService.update.mockRejectedValue(
        new Error('Concurrent modification detected'),
      );

      await expect(controller.update('1', updateTaskDto)).rejects.toThrow(
        'Concurrent modification detected',
      );
    });
  });
});
