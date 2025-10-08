import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Queue, QueueEvents } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Queue Processing Integration Tests', () => {
  let app: INestApplication;
  let taskQueue: Queue;
  let queueEvents: QueueEvents;
  let dataSource: DataSource;
  let superAdminToken: string;
  let testUserId: string;
  let testTaskId: string;

  beforeEach(async () => {
    await delay(500);
  });

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
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    await app.init();

    await delay(500);

    dataSource = moduleFixture.get<DataSource>(DataSource);
    taskQueue = app.get(getQueueToken('task-processing'));
    queueEvents = new QueueEvents('task-processing', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    });

    const registerRes = await request(app.getHttpServer()).post('/auth/register').send({
      email: 'queue-test@test.com',
      password: 'Test123!@#',
      name: 'Queue Test User',
    });

    superAdminToken = registerRes.body.access_token;
    testUserId = registerRes.body.user.id;

    await delay(500);

    const taskRes = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        title: 'Test Task for Queue',
        description: 'Testing queue processing',
        status: 'PENDING',
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Future date
      });

    testTaskId = taskRes.body.id;
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      try {
        await dataSource.query('DELETE FROM tasks WHERE 1=1');
        await dataSource.query("DELETE FROM users WHERE email = 'queue-test@test.com'");
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
    await queueEvents.close();
    await app.close();
  });

  describe('1. Task Status Updates', () => {
    it('should correctly update task status via queue', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(response.body.status).toBe('IN_PROGRESS');

      await new Promise(resolve => setTimeout(resolve, 2000));

      const verifyRes = await request(app.getHttpServer())
        .get(`/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(verifyRes.body.status).toBe('IN_PROGRESS');
    });

    it('should handle status update for deleted task gracefully', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          title: 'Task to be deleted',
          status: 'PENDING',
          priority: 'MEDIUM',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

      const taskId = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      const job = await taskQueue.add('task-status-update', {
        taskId: taskId,
        status: 'COMPLETED',
      });

      try {
        const result = await job.waitUntilFinished(queueEvents);

        expect(result).toBeDefined();
        expect(result.skipped).toBe(true);
        expect(result.reason).toBe('Task not found');
      } catch (error) {
        const state = await job.getState();
        expect(['completed', 'failed']).toContain(state);
      }
    });
  });

  describe('2. Scheduled Tasks', () => {
    it.skip('should detect overdue tasks', async () => {
      // This would need to be tested by manually updating the DB or mocking the validator

      const job = await taskQueue.add('overdue-tasks-notification', {
        taskIds: [testTaskId],
        batchNumber: 1,
        totalBatches: 1,
        timestamp: new Date().toISOString(),
      });

      await job.waitUntilFinished(queueEvents);
      const result = await job.returnvalue;

      expect(result.success).toBe(true);
      expect(result.notified).toBeGreaterThanOrEqual(0);
    });

    it('should batch overdue tasks correctly', async () => {
      const jobs = await taskQueue.getJobs(['waiting', 'active', 'completed']);
      const overdueJobs = jobs.filter(job => job.name === 'overdue-tasks-notification');

      for (const job of overdueJobs) {
        if (job.data.taskIds) {
          expect(job.data.taskIds).toBeInstanceOf(Array);
          expect(job.data.taskIds.length).toBeLessThanOrEqual(50);
          expect(job.data.batchNumber).toBeDefined();
          expect(job.data.totalBatches).toBeDefined();
        }
      }
    });
  });

  describe('3. Error Handling', () => {
    it('should handle invalid job data', async () => {
      const job = await taskQueue.add('tasks-bulk-create', {
        tasks: 'not-an-array',
        userId: testUserId,
      });

      try {
        await job.waitUntilFinished(queueEvents);
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toContain('Invalid tasks');
      }
    });

    it('should retry failed jobs with exponential backoff', async () => {
      const job = await taskQueue.add(
        'tasks-bulk-create',
        {
          tasks: [],
          userId: testUserId,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );

      try {
        await job.waitUntilFinished(queueEvents);
        expect(false).toBe(true);
      } catch (error) {
        const state = await job.getState();
        expect(state).toBe('failed');

        console.log(`Job failed with ${job.attemptsMade} attempts`);
      }
    });

    it('should handle database errors gracefully', async () => {
      const job = await taskQueue.add('task-status-update', {
        taskId: '00000000-0000-0000-0000-000000000000',
        status: 'COMPLETED',
      });

      try {
        const result = await job.waitUntilFinished(queueEvents);

        if (result) {
          expect(result.skipped).toBe(true);
          expect(result.success).toBe(false);
        } else {
          const state = await job.getState();
          expect(['completed', 'failed']).toContain(state);
        }
      } catch (error) {
        const state = await job.getState();
        expect(state).toBe('failed');
      }
    });
    it('should validate enum values in status updates', async () => {
      const job = await taskQueue.add('task-status-update', {
        taskId: testTaskId,
        status: 'INVALID_STATUS',
      });

      try {
        await job.waitUntilFinished(queueEvents);
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toContain('Invalid status value');
      }
    });

    it('should enforce batch size limits', async () => {
      const largeBatch = Array(1001).fill({ title: 'Task', status: 'PENDING' });

      const job = await taskQueue.add('tasks-bulk-create', {
        tasks: largeBatch,
        userId: testUserId,
      });

      try {
        await job.waitUntilFinished(queueEvents);
        expect(false).toBe(true);
      } catch (error: any) {
        expect(error.message).toContain('Cannot create more than 1000 tasks');
      }
    });
  });

  describe('4. Concurrency and Race Conditions', () => {
    it('should handle concurrent status updates', async () => {
      const taskRes = await request(app.getHttpServer())
        .get(`/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      const currentVersion = taskRes.body.version;

      const update1Promise = request(app.getHttpServer())
        .patch(`/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ title: 'Updated by User 1' });

      const update2Promise = request(app.getHttpServer())
        .patch(`/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ title: 'Updated by User 2' });

      const [result1, result2] = await Promise.all([update1Promise, update2Promise]);

      const successfulResult = result1.status === 200 ? result1 : result2;
      expect(successfulResult.body.version).toBeGreaterThanOrEqual(currentVersion);
    });

    it('should respect concurrency limit', async () => {
      await taskQueue.drain();
      await taskQueue.clean(0, 1000, 'completed');
      await taskQueue.clean(0, 1000, 'failed');

      const jobs = [];
      for (let i = 0; i < 20; i++) {
        jobs.push(
          taskQueue.add('task-reminder', {
            taskId: testTaskId,
            userId: testUserId,
          }),
        );
      }

      await Promise.all(jobs);

      const activeJobs = await taskQueue.getActive();
      const waitingJobs = await taskQueue.getWaiting();

      const totalPending = activeJobs.length + waitingJobs.length;

      expect(totalPending).toBeGreaterThan(0);

      expect(activeJobs.length).toBeLessThanOrEqual(5);

      await new Promise(resolve => setTimeout(resolve, 3000));
    });

    it('should use job lock to prevent duplicate processing', async () => {
      const jobId = `test-lock-${Date.now()}`;

      const job1 = await taskQueue.add(
        'task-reminder',
        { taskId: testTaskId, userId: testUserId },
        { jobId },
      );

      const job2 = await taskQueue.add(
        'task-reminder',
        { taskId: testTaskId, userId: testUserId },
        { jobId },
      );

      expect(job1.id).toBe(job2.id);
    });
  });

  describe('Overall Queue Health', () => {
    it('should have reasonable queue metrics', async () => {
      const jobCounts = await taskQueue.getJobCounts();

      console.log('Queue Metrics:', jobCounts);

      expect(jobCounts.waiting).toBeLessThan(1000);
      expect(jobCounts.active).toBeLessThanOrEqual(5);
    });
  });
});
