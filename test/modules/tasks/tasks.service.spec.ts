import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getQueueToken } from '@nestjs/bull';
import { TasksService } from '../../../src/modules/tasks/tasks.service';
import { Task } from '../../../src/modules/tasks/entities/task.entity';
import { User } from '../../../src/modules/users/entities/user.entity';
import { TaskStatus } from '../../../src/modules/tasks/enums/task-status.enum';
import { TaskPriority } from '../../../src/modules/tasks/enums/task-priority.enum';
import { CreateTaskDto } from '../../../src/modules/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../../../src/modules/tasks/dto/update-task.dto';
import { TaskFilterDto } from '../../../src/modules/tasks/dto/task-filter.dto';
import { BatchTaskDto } from '../../../src/modules/tasks/dto/batch-task.dto';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;
  let taskRepository: Repository<Task>;
  let userRepository: Repository<User>;

  const mockTaskRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    manager: {
      connection: {
        createQueryRunner: jest.fn().mockReturnValue({
          connect: jest.fn(),
          startTransaction: jest.fn(),
          commitTransaction: jest.fn(),
          rollbackTransaction: jest.fn(),
          release: jest.fn(),
        }),
      },
    },
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
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
        TasksService,
        {
          provide: getRepositoryToken(Task),
          useValue: mockTaskRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getQueueToken('task-processing'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    taskRepository = module.get<Repository<Task>>(getRepositoryToken(Task));
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
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

      mockTaskRepository.create.mockReturnValue(mockTask);
      mockTaskRepository.save.mockResolvedValue(mockTask);
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      const result = await service.create(createTaskDto);

      expect(result).toEqual(mockTask);
      expect(mockTaskRepository.create).toHaveBeenCalledWith(createTaskDto);
      expect(mockTaskRepository.save).toHaveBeenCalledWith(mockTask);
    });

    it('should handle validation errors', async () => {
      const createTaskDto: CreateTaskDto = {
        title: '',
        description: 'New Description',
        priority: TaskPriority.HIGH,
      };

      // Mock the repository to throw an error when saving
      mockTaskRepository.create.mockReturnValue(createTaskDto);
      mockTaskRepository.save.mockRejectedValue(new Error('Validation failed'));

      await expect(service.create(createTaskDto)).rejects.toThrow('Validation failed');
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks with filtering', async () => {
      const filterDto: Partial<TaskFilterDto> = {
        page: 1,
        limit: 10,
        status: TaskStatus.PENDING,
        priority: TaskPriority.HIGH,
        search: 'test',
      };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockTask], 1]),
      };

      mockTaskRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll(filterDto);

      expect(result.data).toEqual([mockTask]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should handle empty results', async () => {
      const filterDto: Partial<TaskFilterDto> = {
        page: 1,
        limit: 10,
      };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockTaskRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll(filterDto);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      mockTaskRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne('1');

      expect(result).toEqual(mockTask);
      expect(mockTaskRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
        relations: ['user'],
      });
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockTaskRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a task successfully', async () => {
      const updateTaskDto: UpdateTaskDto = {
        title: 'Updated Task',
        status: TaskStatus.COMPLETED,
      };

      // Mock the queryRunner and its methods
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          findOne: jest.fn().mockResolvedValue(mockTask),
          save: jest.fn().mockResolvedValue({ ...mockTask, ...updateTaskDto }),
        },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockTaskRepository.manager.connection.createQueryRunner = jest.fn().mockReturnValue(mockQueryRunner);
      mockTaskRepository.findOne.mockResolvedValue({ ...mockTask, ...updateTaskDto });

      const result = await service.update('1', updateTaskDto);

      expect(result.title).toBe('Updated Task');
      expect(result.status).toBe(TaskStatus.COMPLETED);
    });

    it('should throw NotFoundException for non-existent task', async () => {
      // Mock the queryRunner and its methods
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockTaskRepository.manager.connection.createQueryRunner = jest.fn().mockReturnValue(mockQueryRunner);

      await expect(
        service.update('999', { title: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a task successfully', async () => {
      mockTaskRepository.findOne.mockResolvedValue(mockTask);
      mockTaskRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove('1');

      expect(mockTaskRepository.delete).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockTaskRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });



  describe('edge cases', () => {
    it('should handle database connection errors', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockRejectedValue(new Error('Database connection failed')),
      };

      mockTaskRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await expect(service.findAll({})).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle concurrent updates', async () => {
      const updateTaskDto: UpdateTaskDto = {
        title: 'Concurrent Update',
      };

      // Mock the queryRunner to throw an error during transaction
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          findOne: jest.fn().mockResolvedValue(mockTask),
          save: jest.fn().mockRejectedValue(new Error('Concurrent modification')),
        },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockTaskRepository.manager.connection.createQueryRunner = jest.fn().mockReturnValue(mockQueryRunner);

      await expect(
        service.update('1', updateTaskDto),
      ).rejects.toThrow('Concurrent modification');
    });

    it('should validate task priority enum values', async () => {
      const createTaskDto: CreateTaskDto = {
        title: 'Test Task',
        description: 'Test Description',
        priority: 'INVALID_PRIORITY' as TaskPriority,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.create(createTaskDto)).rejects.toThrow();
    });
  });
});
