import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TaskStatus } from '../src/modules/tasks/enums/task-status.enum';
import { TaskPriority } from '../src/modules/tasks/enums/task-priority.enum';

jest.setTimeout(600000);

describe('TasksController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let adminToken: string;
  let createdTaskId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('should authenticate user and get token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        })
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body.user).toHaveProperty('email', 'user@example.com');
      expect(response.body.user).toHaveProperty('role', 'user');

      authToken = response.body.access_token;
    });

    it('should authenticate admin and get token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123',
        })
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body.user).toHaveProperty('email', 'admin@example.com');
      expect(response.body.user).toHaveProperty('role', 'admin');

      adminToken = response.body.access_token;
    });

    it('should reject invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'invalid@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should validate login input', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'invalid-email',
          password: '',
        })
        .expect(400);
    });
  });

  describe('Task CRUD Operations', () => {
    beforeEach(async () => {
      // Get auth token for tests
      const authResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      authToken = authResponse.body.access_token;
    });

    it('should create a task successfully', async () => {
      const taskData = {
        title: 'E2E Test Task',
        description: 'This is a test task for E2E testing',
        priority: TaskPriority.HIGH,
        dueDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      };

      const response = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(taskData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(taskData.title);
      expect(response.body.description).toBe(taskData.description);
      expect(response.body.priority).toBe(taskData.priority);
      expect(response.body.status).toBe(TaskStatus.PENDING);

      createdTaskId = response.body.id;
    });

    it('should reject task creation without authentication', async () => {
      const taskData = {
        title: 'Unauthorized Task',
        description: 'This should fail',
        priority: TaskPriority.MEDIUM,
      };

      await request(app.getHttpServer())
        .post('/tasks')
        .send(taskData)
        .expect(401);
    });

    it('should validate task creation input', async () => {
      const invalidTaskData = {
        title: '', // Empty title should fail
        description: 'Test description',
        priority: 'INVALID_PRIORITY',
      };

      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTaskData)
        .expect(400);
    });

    it('should get all tasks with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 10);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter tasks by status and priority', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks?status=PENDING&priority=HIGH')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should search tasks by title', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks?search=E2E Test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should get a specific task by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', createdTaskId);
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('description');
    });

    it('should return 404 for non-existent task', async () => {
      await request(app.getHttpServer())
        .get('/tasks/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should update a task successfully', async () => {
      const updateData = {
        title: 'Updated E2E Test Task',
        status: TaskStatus.IN_PROGRESS,
      };

      const response = await request(app.getHttpServer())
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.title).toBe(updateData.title);
      expect(response.body.status).toBe(updateData.status);
    });

    it('should reject update with invalid data', async () => {
      const invalidUpdateData = {
        title: '', // Empty title should fail
        status: 'INVALID_STATUS',
      };

      await request(app.getHttpServer())
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidUpdateData)
        .expect(400);
    });

    it('should delete a task successfully', async () => {
      await request(app.getHttpServer())
        .delete(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify task is deleted
      await request(app.getHttpServer())
        .get(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('Batch Operations', () => {
    let taskIds: string[];

    beforeEach(async () => {
      // Get auth token
      const authResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      authToken = authResponse.body.access_token;

      // Create multiple tasks for batch operations
      taskIds = [];
      for (let i = 0; i < 3; i++) {
        const taskData = {
          title: `Batch Test Task ${i + 1}`,
          description: `Batch test task ${i + 1}`,
          priority: TaskPriority.MEDIUM,
        };

        const response = await request(app.getHttpServer())
          .post('/tasks')
          .set('Authorization', `Bearer ${authToken}`)
          .send(taskData);

        taskIds.push(response.body.id);
      }
    });

    it('should complete multiple tasks in batch', async () => {
      const batchData = {
        tasks: taskIds,
        action: 'complete',
      };

      const response = await request(app.getHttpServer())
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send(batchData)
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(response.body.results).toHaveLength(taskIds.length);
      expect(response.body.results.every((r: any) => r.success)).toBe(true);
    });

    it('should handle partial failures in batch operations', async () => {
      const batchData = {
        tasks: [...taskIds, 'non-existent-id'],
        action: 'complete',
      };

      const response = await request(app.getHttpServer())
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send(batchData)
        .expect(200);

      expect(response.body.results).toHaveLength(taskIds.length + 1);
      expect(response.body.results.some((r: any) => !r.success)).toBe(true);
    });

    it('should reject invalid batch operations', async () => {
      const invalidBatchData = {
        tasks: taskIds,
        action: 'invalid_action',
      };

      await request(app.getHttpServer())
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidBatchData)
        .expect(400);
    });

    it('should handle empty task list in batch operations', async () => {
      const batchData = {
        tasks: [],
        action: 'complete',
      };

      const response = await request(app.getHttpServer())
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send(batchData)
        .expect(200);

      expect(response.body.results).toHaveLength(0);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      const authResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      authToken = authResponse.body.access_token;
    });

    it('should enforce rate limiting on task creation', async () => {
      const taskData = {
        title: 'Rate Limit Test Task',
        description: 'Testing rate limiting',
        priority: TaskPriority.LOW,
      };

      // Make multiple requests quickly
      const promises = Array.from({ length: 15 }, () =>
        request(app.getHttpServer())
          .post('/tasks')
          .set('Authorization', `Bearer ${authToken}`)
          .send(taskData),
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter((r) => r.status === 201).length;
      const rateLimitedCount = responses.filter((r) => r.status === 429).length;

      expect(successCount).toBeGreaterThan(0);
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should enforce rate limiting on authentication', async () => {
      const loginData = {
        email: 'user@example.com',
        password: 'user123',
      };

      // Make multiple login requests quickly
      const promises = Array.from({ length: 10 }, () =>
        request(app.getHttpServer()).post('/auth/login').send(loginData),
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter((r) => r.status === 201).length;
      const rateLimitedCount = responses.filter((r) => r.status === 429).length;

      expect(successCount).toBeGreaterThan(0);
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });

  describe('Authorization', () => {
    let userToken: string;
    let adminToken: string;
    let userTaskId: string;

    beforeEach(async () => {
      // Get both user and admin tokens
      const userResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      userToken = userResponse.body.access_token;

      const adminResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123',
        });
      adminToken = adminResponse.body.access_token;

      // Create a task as user
      const taskData = {
        title: 'Authorization Test Task',
        description: 'Testing authorization',
        priority: TaskPriority.MEDIUM,
      };

      const taskResponse = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${userToken}`)
        .send(taskData);

      userTaskId = taskResponse.body.id;
    });

    it('should allow users to access their own tasks', async () => {
      await request(app.getHttpServer())
        .get(`/tasks/${userTaskId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('should allow admins to access any task', async () => {
      await request(app.getHttpServer())
        .get(`/tasks/${userTaskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should prevent users from accessing other users tasks', async () => {
      // Create another user and try to access the first user's task
      const otherUserResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'otheruser@example.com',
          password: 'password123',
          role: 'user',
        });

      const otherUserToken = otherUserResponse.body.access_token;

      await request(app.getHttpServer())
        .get(`/tasks/${userTaskId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      const authResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      authToken = authResponse.body.access_token;
    });

    it('should handle malformed JSON requests', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"title": "malformed json"')
        .expect(400);
    });

    it('should handle very large request bodies', async () => {
      const largeDescription = 'A'.repeat(10000);
      const taskData = {
        title: 'Large Task',
        description: largeDescription,
        priority: TaskPriority.LOW,
      };

      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(taskData)
        .expect(400); // Should be rejected due to size limits
    });

    it('should handle concurrent task creation', async () => {
      const taskData = {
        title: 'Concurrent Task',
        description: 'Testing concurrent creation',
        priority: TaskPriority.MEDIUM,
      };

      const promises = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/tasks')
          .set('Authorization', `Bearer ${authToken}`)
          .send(taskData),
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter((r) => r.status === 201).length;

      expect(successCount).toBeGreaterThan(0);
    });

    it('should handle invalid UUID formats', async () => {
      await request(app.getHttpServer())
        .get('/tasks/invalid-uuid-format')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });
});

