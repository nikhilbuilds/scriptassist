import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

jest.setTimeout(600000);

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply the same pipes used in the main application
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

  describe('Health Check Endpoints', () => {
    it('/health (GET) - should return health status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });

    it('/health/detailed (GET) - should return detailed health status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('redis');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('/health/test-rate-limit (GET) - should test rate limiting', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/test-rate-limit')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Authentication Endpoints', () => {
    it('/auth/login (POST) - should authenticate user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        })
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'user@example.com');
    });

    it('/auth/register (POST) - should register new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'password123',
          role: 'user',
        })
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'newuser@example.com');
      expect(response.body.user).toHaveProperty('role', 'user');
    });

    it('/auth/refresh (POST) - should refresh token', async () => {
      // First login to get refresh token
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });

      const refreshResponse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refresh_token: loginResponse.body.refresh_token,
        })
        .expect(201);

      expect(refreshResponse.body).toHaveProperty('access_token');
    });
  });

  describe('Task Endpoints', () => {
    let authToken: string;
    let createdTaskId: string;

    beforeEach(async () => {
      // Get authentication token
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      authToken = loginResponse.body.access_token;
    });

    it('/tasks (GET) - should return tasks with pagination', async () => {
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

    it('/tasks (POST) - should create a task', async () => {
      const taskData = {
        title: 'E2E Test Task',
        description: 'This is a test task for E2E testing',
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 86400000).toISOString(),
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

      createdTaskId = response.body.id;
    });

    it('/tasks/:id (GET) - should get a specific task', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', createdTaskId);
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('description');
    });

    it('/tasks/:id (PATCH) - should update a task', async () => {
      const updateData = {
        title: 'Updated E2E Test Task',
        status: 'IN_PROGRESS',
      };

      const response = await request(app.getHttpServer())
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.title).toBe(updateData.title);
      expect(response.body.status).toBe(updateData.status);
    });

    it('/tasks/batch (POST) - should perform batch operations', async () => {
      const batchData = {
        tasks: [createdTaskId],
        action: 'complete',
      };

      const response = await request(app.getHttpServer())
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send(batchData)
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    it('/tasks/:id (DELETE) - should delete a task', async () => {
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

  describe('Rate Limiting', () => {
    it('should enforce rate limiting on authentication endpoints', async () => {
      const loginData = {
        email: 'user@example.com',
        password: 'user123',
      };

      // Make multiple requests quickly
      const promises = Array.from({ length: 15 }, () =>
        request(app.getHttpServer()).post('/auth/login').send(loginData),
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter((r) => r.status === 201).length;
      const rateLimitedCount = responses.filter((r) => r.status === 429).length;

      expect(successCount).toBeGreaterThan(0);
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should enforce rate limiting on task endpoints', async () => {
      // First get auth token
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      const authToken = loginResponse.body.access_token;

      const taskData = {
        title: 'Rate Limit Test Task',
        description: 'Testing rate limiting',
        priority: 'LOW',
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
  });

  describe('Error Handling', () => {
    it('should handle invalid authentication', async () => {
      await request(app.getHttpServer())
        .get('/tasks')
        .expect(401);
    });

    it('should handle invalid task ID', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      const authToken = loginResponse.body.access_token;

      await request(app.getHttpServer())
        .get('/tasks/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle validation errors', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      const authToken = loginResponse.body.access_token;

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

    it('should handle malformed JSON', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      const authToken = loginResponse.body.access_token;

      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"title": "malformed json"')
        .expect(400);
    });
  });

  describe('Authorization', () => {
    it('should enforce role-based access control', async () => {
      // Login as regular user
      const userResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      const userToken = userResponse.body.access_token;

      // Login as admin
      const adminResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123',
        });
      const adminToken = adminResponse.body.access_token;

      // Both should be able to access tasks
      await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent requests', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      const authToken = loginResponse.body.access_token;

      // Make concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .get('/tasks')
          .set('Authorization', `Bearer ${authToken}`),
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter((r) => r.status === 200).length;

      expect(successCount).toBeGreaterThan(0);
    });

    it('should handle large pagination requests', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });
      const authToken = loginResponse.body.access_token;

      const response = await request(app.getHttpServer())
        .get('/tasks?page=1&limit=100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(response.body.limit).toBe(100);
    });
  });
});
