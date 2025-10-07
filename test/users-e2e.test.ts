import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Users E2E Tests (RBAC)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let superAdminToken: string;
  let adminToken: string;
  let userToken: string;

  let superAdminId: string;
  let adminId: string;
  let userId: string;
  let otherUserId: string;
  beforeEach(async () => {
    await delay(1000);
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
      }),
    );

    await app.init();
    await delay(2000);

    dataSource = moduleFixture.get(DataSource);

    await setupTestUsers();
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.query("DELETE FROM users WHERE email LIKE '%@teste2e.com%'");
    }
    await app.close();
  });

  async function setupTestUsers() {
    const superAdminRes = await request(app.getHttpServer()).post('/auth/register').send({
      email: 'superadmin@teste2e.com',
      password: 'Password123!',
      name: 'Super Admin User',
    });

    if (superAdminRes.status !== 201) {
      throw new Error(
        `Registration failed with ${superAdminRes.status}: ${JSON.stringify(superAdminRes.body)}`,
      );
    }

    if (!superAdminRes.body.user) {
      throw new Error(`No user in response: ${JSON.stringify(superAdminRes.body)}`);
    }
    superAdminId = superAdminRes.body.user.id;

    await dataSource.query(`UPDATE users SET role = 'super-admin' WHERE id = $1`, [superAdminId]);

    const superAdminLogin = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'superadmin@teste2e.com',
      password: 'Password123!',
    });
    superAdminToken = superAdminLogin.body.access_token;

    const adminRes = await request(app.getHttpServer()).post('/auth/register').send({
      email: 'admin@teste2e.com',
      password: 'Password123!',
      name: 'Admin User',
    });
    adminId = adminRes.body.user.id;

    await dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [adminId]);

    const adminLogin = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'admin@teste2e.com',
      password: 'Password123!',
    });
    adminToken = adminLogin.body.access_token;

    const userRes = await request(app.getHttpServer()).post('/auth/register').send({
      email: 'user@teste2e.com',
      password: 'Password123!',
      name: 'Regular User',
    });
    userId = userRes.body.user.id;

    const userLogin = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'user@teste2e.com',
      password: 'Password123!',
    });
    userToken = userLogin.body.access_token;

    const otherUserRes = await request(app.getHttpServer()).post('/auth/register').send({
      email: 'otheruser@teste2e.com',
      password: 'Password123!',
      name: 'Other User',
    });
    otherUserId = otherUserRes.body.user.id;
  }

  describe('POST /users (Create User)', () => {
    it('should allow super-admin to create user', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: 'newuser1@teste2e.com',
          password: 'Password123!',
          name: 'New User 1',
          role: 'user',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe('newuser1@teste2e.com');
      expect(response.body.role).toBe('user');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should allow admin to create user', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser2@teste2e.com',
          password: 'Password123!',
          name: 'New User 2',
          role: 'user',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe('newuser2@teste2e.com');
    });

    it('should deny regular user from creating user', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          email: 'newuser3@teste2e.com',
          password: 'Password123!',
          name: 'New User 3',
        })
        .expect(403);
    });

    it('should deny unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({
          email: 'newuser4@teste2e.com',
          password: 'Password123!',
          name: 'New User 4',
        })
        .expect(401);
    });

    it('should validate email format', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: 'invalid-email',
          password: 'Password123!',
          name: 'Test User',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('email')]),
      );
    });
  });

  describe('GET /users (List Users)', () => {
    it('should allow super-admin to list all users', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).not.toHaveProperty('password');
    });

    it('should allow admin to list all users', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should deny regular user from listing users', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should deny unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });
  });

  describe('GET /users/:id (Get User by ID)', () => {
    it('should allow super-admin to view any user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.id).toBe(userId);
      expect(response.body.email).toBe('user@teste2e.com');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should allow admin to view any user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(userId);
    });

    it('should allow user to view their own profile', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.id).toBe(userId);
      expect(response.body.email).toBe('user@teste2e.com');
    });

    it('should deny user from viewing other users profile', async () => {
      await request(app.getHttpServer())
        .get(`/users/${otherUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .get(`/users/123e4567-e89b-12d3-a456-426614174999`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(404);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .get(`/users/invalid-uuid`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(400);
    });
  });

  describe('PATCH /users/:id (Update User)', () => {
    it('should allow super-admin to update any user', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Updated Name by Super Admin',
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Name by Super Admin');
    });

    it('should allow admin to update any user', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Name by Admin',
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Name by Admin');
    });

    it('should allow user to update their own profile', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Self Updated Name',
        })
        .expect(200);

      expect(response.body.name).toBe('Self Updated Name');
    });

    it('should deny user from updating other users profile', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${otherUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Trying to Update Other User',
        })
        .expect(403);
    });

    it('should deny user from changing their own role', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          role: 'admin',
        })
        .expect(403);
    });

    it('should allow super-admin to change user role', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: 'admin',
        })
        .expect(200);

      expect(response.body.role).toBe('admin');

      await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: 'user',
        });
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .patch(`/users/invalid-uuid`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Test',
        })
        .expect(400);
    });
  });

  describe('DELETE /users/:id (Delete User)', () => {
    it('should allow super-admin to delete any user', async () => {
      const newUser = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: 'todelete1@teste2e.com',
          password: 'Password123!',
          name: 'To Delete 1',
          role: 'user',
        });

      await request(app.getHttpServer())
        .delete(`/users/${newUser.body.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });

    it('should deny admin from deleting users (super-admin only)', async () => {
      const newUser = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: 'todelete2@teste2e.com',
          password: 'Password123!',
          name: 'To Delete 2',
          role: 'user',
        });

      await request(app.getHttpServer())
        .delete(`/users/${newUser.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('should deny regular user from deleting any user', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${otherUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should deny regular user from deleting themselves', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .delete(`/users/123e4567-e89b-12d3-a456-426614174999`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(404);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .delete(`/users/invalid-uuid`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(400);
    });
  });
});
