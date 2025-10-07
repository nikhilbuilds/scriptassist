import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { UserRole } from '../src/modules/users/enum/user-role.enum';
import { TaskStatus } from '../src/modules/tasks/enums/task-status.enum';
import { TaskPriority } from '../src/modules/tasks/enums/task-priority.enum';

describe('Tasks E2E Tests (RBAC)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tokens: {
    superAdmin: string;
    admin: string;
    user1: string;
    user2: string;
  };
  let userIds: {
    superAdmin: string;
    admin: string;
    user1: string;
    user2: string;
  };
  let taskIds: {
    user1Task1: string;
    user1Task2: string;
    user2Task1: string;
    adminTask1: string;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  async function setupTestData() {
    tokens = { superAdmin: '', admin: '', user1: '', user2: '' };
    userIds = { superAdmin: '', admin: '', user1: '', user2: '' };

    // First, create a super-admin via register and manually update role in DB
    const superAdminData = {
      email: 'superadmin-tasks@teste2e.com',
      password: 'SuperAdmin123!',
      name: 'Super Admin Tasks',
    };

    await request(app.getHttpServer()).post('/auth/register').send(superAdminData).expect(201);

    // Update role in database
    await dataSource.query('UPDATE users SET role = $1 WHERE email = $2', [
      UserRole.SUPER_ADMIN,
      superAdminData.email,
    ]);

    // Login super-admin
    const superAdminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: superAdminData.email, password: superAdminData.password })
      .expect(201);

    tokens.superAdmin = superAdminLogin.body.access_token;
    userIds.superAdmin = superAdminLogin.body.user.id;

    // Now use super-admin to create admin user via POST /users
    const adminData = {
      email: 'admin-tasks@teste2e.com',
      password: 'Admin123!',
      name: 'Admin Tasks',
      role: UserRole.ADMIN,
    };

    const adminCreateRes = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${tokens.superAdmin}`)
      .send(adminData)
      .expect(201);

    userIds.admin = adminCreateRes.body.id;

    // Login admin
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminData.email, password: adminData.password })
      .expect(201);

    tokens.admin = adminLogin.body.access_token;

    // Register regular users via /auth/register
    const user1Data = {
      email: 'user1-tasks@teste2e.com',
      password: 'User123!',
      name: 'User One Tasks',
    };

    await request(app.getHttpServer()).post('/auth/register').send(user1Data).expect(201);

    const user1Login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user1Data.email, password: user1Data.password })
      .expect(201);

    tokens.user1 = user1Login.body.access_token;
    userIds.user1 = user1Login.body.user.id;

    const user2Data = {
      email: 'user2-tasks@teste2e.com',
      password: 'User123!',
      name: 'User Two Tasks',
    };

    await request(app.getHttpServer()).post('/auth/register').send(user2Data).expect(201);

    const user2Login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user2Data.email, password: user2Data.password })
      .expect(201);

    tokens.user2 = user2Login.body.access_token;
    userIds.user2 = user2Login.body.user.id;

    // Create test tasks
    taskIds = {
      user1Task1: '',
      user1Task2: '',
      user2Task1: '',
      adminTask1: '',
    };

    // User1 creates 2 tasks
    const user1Task1Res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${tokens.user1}`)
      .send({
        title: 'User1 Task 1',
        description: 'First task for user1',
        status: TaskStatus.PENDING,
        priority: TaskPriority.HIGH,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);
    taskIds.user1Task1 = user1Task1Res.body.id;

    const user1Task2Res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${tokens.user1}`)
      .send({
        title: 'User1 Task 2',
        description: 'Second task for user1',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);
    taskIds.user1Task2 = user1Task2Res.body.id;

    // User2 creates 1 task
    const user2Task1Res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${tokens.user2}`)
      .send({
        title: 'User2 Task 1',
        description: 'First task for user2',
        status: TaskStatus.PENDING,
        priority: TaskPriority.LOW,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);
    taskIds.user2Task1 = user2Task1Res.body.id;

    // Admin creates 1 task
    const adminTask1Res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        title: 'Admin Task 1',
        description: 'First task for admin',
        status: TaskStatus.COMPLETED,
        priority: TaskPriority.HIGH,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);
    taskIds.adminTask1 = adminTask1Res.body.id;
  }

  async function cleanupTestData() {
    if (!dataSource || !dataSource.isInitialized) {
      return;
    }

    try {
      await dataSource.query('DELETE FROM tasks WHERE 1=1');
      await dataSource.query("DELETE FROM users WHERE email LIKE '%@teste2e.com'");
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  describe('POST /tasks - Create Task', () => {
    it('should allow user to create their own task', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({
          title: 'New Task',
          description: 'Task description',
          status: TaskStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('New Task');
      expect(response.body.userId).toBe(userIds.user1);
    });

    it('should allow admin to create task', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          title: 'Admin New Task',
          description: 'Admin task description',
          status: TaskStatus.PENDING,
          priority: TaskPriority.HIGH,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.userId).toBe(userIds.admin);
    });

    it('should allow super-admin to create task', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokens.superAdmin}`)
        .send({
          title: 'Super Admin New Task',
          description: 'Super admin task description',
          status: TaskStatus.PENDING,
          priority: TaskPriority.LOW,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.userId).toBe(userIds.superAdmin);
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .send({
          title: 'Unauthorized Task',
          description: 'Should fail',
          status: TaskStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(401);
    });

    it('should fail with invalid data', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({
          title: '',
          description: 'Missing title',
          status: 'INVALID_STATUS',
          priority: TaskPriority.MEDIUM,
        })
        .expect(400);
    });
  });

  describe('GET /tasks - List Tasks', () => {
    it('should return only own tasks for regular user', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      response.body.data.forEach((task: any) => {
        expect(task.userId).toBe(userIds.user1);
      });
    });

    it('should return all tasks for admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.total).toBeGreaterThanOrEqual(4);
    });

    it('should return all tasks for super-admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${tokens.superAdmin}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.total).toBeGreaterThanOrEqual(4);
    });

    it('should filter tasks by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks?status=PENDING')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      response.body.data.forEach((task: any) => {
        expect(task.status).toBe(TaskStatus.PENDING);
        expect(task.userId).toBe(userIds.user1);
      });
    });

    it('should filter tasks by priority', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks?priority=HIGH')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      response.body.data.forEach((task: any) => {
        expect(task.priority).toBe(TaskPriority.HIGH);
      });
    });

    it('should handle combined filters with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks?status=PENDING&priority=HIGH&page=1&limit=2')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(2);
      response.body.data.forEach((task: any) => {
        expect(task.status).toBe('PENDING');
        expect(task.priority).toBe('HIGH');
      });
    });

    it('should handle pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks?page=1&limit=1')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 1);
      expect(response.body.data.length).toBeLessThanOrEqual(1);
    });

    it('should handle invalid pagination parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks?page=-1&limit=0')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toContain('page must be at least 1');
      expect(response.body.message).toContain('limit must be at least 1');
    });
  });

  describe('GET /tasks/:id - Get Single Task', () => {
    it('should allow user to view their own task', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskIds.user1Task1}`)
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(200);

      expect(response.body.id).toBe(taskIds.user1Task1);
      expect(response.body.userId).toBe(userIds.user1);
    });

    it("should prevent user from viewing another user's task", async () => {
      await request(app.getHttpServer())
        .get(`/tasks/${taskIds.user2Task1}`)
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(403);
    });

    it('should allow admin to view any task', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskIds.user1Task1}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      expect(response.body.id).toBe(taskIds.user1Task1);
    });

    it('should allow super-admin to view any task', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskIds.user2Task1}`)
        .set('Authorization', `Bearer ${tokens.superAdmin}`)
        .expect(200);

      expect(response.body.id).toBe(taskIds.user2Task1);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .get('/tasks/invalid-uuid')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(400);
    });

    it('should return 404 for non-existent task', async () => {
      await request(app.getHttpServer())
        .get('/tasks/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(404);
    });
  });

  describe('PATCH /tasks/:id - Update Task', () => {
    it('should allow user to update their own task', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskIds.user1Task1}`)
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({
          title: 'Updated Task Title',
          status: TaskStatus.IN_PROGRESS,
        })
        .expect(200);

      expect(response.body.title).toBe('Updated Task Title');
      expect(response.body.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it("should prevent user from updating another user's task", async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskIds.user2Task1}`)
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({ title: 'Unauthorized Update' })
        .expect(403);
    });

    it('should allow admin to update any task', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskIds.user1Task2}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ priority: TaskPriority.HIGH })
        .expect(200);

      expect(response.body.priority).toBe(TaskPriority.HIGH);
    });

    it('should allow super-admin to update any task', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskIds.user2Task1}`)
        .set('Authorization', `Bearer ${tokens.superAdmin}`)
        .send({ status: TaskStatus.COMPLETED })
        .expect(200);

      expect(response.body.status).toBe(TaskStatus.COMPLETED);
    });
  });

  describe('DELETE /tasks/:id - Delete Task', () => {
    it('should allow user to delete their own task', async () => {
      // Create a new task to delete
      const createRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({
          title: 'Task to Delete',
          description: 'Will be deleted',
          status: TaskStatus.PENDING,
          priority: TaskPriority.LOW,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(200);

      // Verify deletion
      await request(app.getHttpServer())
        .get(`/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(404);
    });

    it("should prevent user from deleting another user's task", async () => {
      await request(app.getHttpServer())
        .delete(`/tasks/${taskIds.user2Task1}`)
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(403);
    });

    it('should allow admin to delete any task', async () => {
      // Create a new task to delete
      const createRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokens.user2}`)
        .send({
          title: 'Task to Delete by Admin',
          description: 'Will be deleted by admin',
          status: TaskStatus.PENDING,
          priority: TaskPriority.LOW,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
    });

    it('should allow super-admin to delete any task', async () => {
      // Create a new task to delete
      const createRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokens.user2}`)
        .send({
          title: 'Task to Delete by Super Admin',
          description: 'Will be deleted by super admin',
          status: TaskStatus.PENDING,
          priority: TaskPriority.LOW,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${tokens.superAdmin}`)
        .expect(200);
    });
  });

  describe('POST /tasks/batch - Batch Create Tasks', () => {
    it('should allow user to batch create their own tasks', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({
          tasks: [
            {
              title: 'Batch Task 1',
              description: 'First batch task',
              status: TaskStatus.PENDING,
              priority: TaskPriority.HIGH,
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
            {
              title: 'Batch Task 2',
              description: 'Second batch task',
              status: TaskStatus.PENDING,
              priority: TaskPriority.MEDIUM,
              dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            },
          ],
        })
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('createdCount', 2);
      expect(response.body).toHaveProperty('tasks');
      expect(response.body.tasks.length).toBe(2);
      response.body.tasks.forEach((task: any) => {
        expect(task.userId).toBe(userIds.user1);
      });
    });

    it('should fail with invalid task data', async () => {
      await request(app.getHttpServer())
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({
          tasks: [
            {
              title: '',
              description: 'Invalid task',
              status: 'INVALID',
              priority: TaskPriority.HIGH,
            },
          ],
        })
        .expect(400);
    });
  });

  describe('DELETE /tasks/batch - Batch Delete Tasks', () => {
    it('should allow user to batch delete their own tasks', async () => {
      // Create tasks to delete
      const createRes = await request(app.getHttpServer())
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({
          tasks: [
            {
              title: 'Delete Task 1',
              description: 'To be deleted',
              status: TaskStatus.PENDING,
              priority: TaskPriority.LOW,
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
            {
              title: 'Delete Task 2',
              description: 'To be deleted',
              status: TaskStatus.PENDING,
              priority: TaskPriority.LOW,
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
          ],
        })
        .expect(201);

      const taskIdsToDelete = createRes.body.tasks.map((task: any) => task.id);

      const response = await request(app.getHttpServer())
        .delete('/tasks/batch')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({ taskIds: taskIdsToDelete })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('deletedCount', 2);
    });

    it("should prevent user from deleting another user's tasks", async () => {
      await request(app.getHttpServer())
        .delete('/tasks/batch')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({ taskIds: [taskIds.user2Task1] })
        .expect(403);
    });

    it('should allow admin to batch delete any tasks', async () => {
      // Create tasks to delete
      const createRes = await request(app.getHttpServer())
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${tokens.user2}`)
        .send({
          tasks: [
            {
              title: 'Admin Delete Task 1',
              description: 'To be deleted by admin',
              status: TaskStatus.PENDING,
              priority: TaskPriority.LOW,
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
          ],
        })
        .expect(201);

      const taskIdsToDelete = createRes.body.tasks.map((task: any) => task.id);

      await request(app.getHttpServer())
        .delete('/tasks/batch')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ taskIds: taskIdsToDelete })
        .expect(200);
    });
  });

  describe('POST /tasks/batch/async - Async Batch Create', () => {
    it('should queue tasks for async creation', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks/batch/async')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({
          tasks: [
            {
              title: 'Async Task 1',
              description: 'First async task',
              status: TaskStatus.PENDING,
              priority: TaskPriority.HIGH,
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
          ],
        })
        .expect(202);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('jobId');
    });
  });

  describe('DELETE /tasks/batch/async - Async Batch Delete', () => {
    it('should queue tasks for async deletion', async () => {
      const response = await request(app.getHttpServer())
        .delete('/tasks/batch/async')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .send({ taskIds: [taskIds.user1Task1] })
        .expect(202);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('jobId');
    });
  });

  describe('GET /tasks/stats - Task Statistics', () => {
    it('should return user-level stats for regular user', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks/stats')
        .set('Authorization', `Bearer ${tokens.user1}`)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('completed');
      expect(response.body).toHaveProperty('inProgress');
      expect(response.body).toHaveProperty('pending');
      expect(response.body).toHaveProperty('highPriority');
      expect(typeof response.body.total).toBe('number');
    });

    it('should return org-level stats for admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks/stats')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body.total).toBeGreaterThanOrEqual(4);
    });

    it('should return global stats for super-admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks/stats')
        .set('Authorization', `Bearer ${tokens.superAdmin}`)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body.total).toBeGreaterThanOrEqual(4);
    });
  });
});
