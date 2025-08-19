import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

jest.setTimeout(600000);

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let refreshToken: string;

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

  describe('POST /auth/login', () => {
    it('should authenticate existing user successfully', async () => {
      const loginData = {
        email: 'user@example.com',
        password: 'user123',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'user@example.com');
      expect(response.body.user).toHaveProperty('role', 'user');
      expect(response.body.user).not.toHaveProperty('password');

      authToken = response.body.access_token;
      refreshToken = response.body.refresh_token;
    });

    it('should authenticate admin user successfully', async () => {
      const loginData = {
        email: 'admin@example.com',
        password: 'admin123',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'admin@example.com');
      expect(response.body.user).toHaveProperty('role', 'admin');
    });

    it('should reject invalid email', async () => {
      const loginData = {
        email: 'invalid-email',
        password: 'user123',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(400);
    });

    it('should reject empty password', async () => {
      const loginData = {
        email: 'user@example.com',
        password: '',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(400);
    });

    it('should reject non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'user123',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(401);
    });

    it('should reject wrong password', async () => {
      const loginData = {
        email: 'user@example.com',
        password: 'wrongpassword',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(401);
    });

    it('should reject malformed JSON', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": "user@example.com"')
        .expect(400);
    });

    it('should reject extra fields', async () => {
      const loginData = {
        email: 'user@example.com',
        password: 'user123',
        extraField: 'should be rejected',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(400);
    });
  });

  describe('POST /auth/register', () => {
    it('should register new user successfully', async () => {
      const registerData = {
        email: 'newuser@example.com',
        password: 'password123',
        role: 'user',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'newuser@example.com');
      expect(response.body.user).toHaveProperty('role', 'user');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should register new admin user successfully', async () => {
      const registerData = {
        email: 'newadmin@example.com',
        password: 'password123',
        role: 'admin',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'newadmin@example.com');
      expect(response.body.user).toHaveProperty('role', 'admin');
    });

    it('should reject duplicate email', async () => {
      const registerData = {
        email: 'user@example.com', // Already exists
        password: 'password123',
        role: 'user',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(409);
    });

    it('should reject invalid email format', async () => {
      const registerData = {
        email: 'invalid-email-format',
        password: 'password123',
        role: 'user',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(400);
    });

    it('should reject weak password', async () => {
      const registerData = {
        email: 'weakpassword@example.com',
        password: '123', // Too short
        role: 'user',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(400);
    });

    it('should reject invalid role', async () => {
      const registerData = {
        email: 'invalidrole@example.com',
        password: 'password123',
        role: 'invalid_role',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(400);
    });

    it('should reject missing required fields', async () => {
      const registerData = {
        email: 'missingfields@example.com',
        // Missing password and role
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(400);
    });

    it('should reject empty email', async () => {
      const registerData = {
        email: '',
        password: 'password123',
        role: 'user',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(400);
    });

    it('should reject empty password', async () => {
      const registerData = {
        email: 'emptypassword@example.com',
        password: '',
        role: 'user',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(400);
    });
  });

  describe('POST /auth/refresh', () => {
    beforeEach(async () => {
      // Get tokens for refresh tests
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });

      authToken = loginResponse.body.access_token;
      refreshToken = loginResponse.body.refresh_token;
    });

    it('should refresh access token successfully', async () => {
      const refreshData = {
        refresh_token: refreshToken,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send(refreshData)
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body.access_token).not.toBe(authToken); // Should be different
    });

    it('should reject invalid refresh token', async () => {
      const refreshData = {
        refresh_token: 'invalid-refresh-token',
      };

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send(refreshData)
        .expect(401);
    });

    it('should reject expired refresh token', async () => {
      // This would require a token that's actually expired
      // For now, we'll test with a malformed token
      const refreshData = {
        refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      };

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send(refreshData)
        .expect(401);
    });

    it('should reject missing refresh token', async () => {
      const refreshData = {};

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send(refreshData)
        .expect(400);
    });

    it('should reject empty refresh token', async () => {
      const refreshData = {
        refresh_token: '',
      };

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send(refreshData)
        .expect(400);
    });

    it('should reject malformed JSON', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Content-Type', 'application/json')
        .send('{"refresh_token": "')
        .expect(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limiting on login attempts', async () => {
      const loginData = {
        email: 'user@example.com',
        password: 'user123',
      };

      // Make multiple login requests quickly
      const promises = Array.from({ length: 15 }, () =>
        request(app.getHttpServer()).post('/auth/login').send(loginData),
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter((r) => r.status === 201).length;
      const rateLimitedCount = responses.filter((r) => r.status === 429).length;

      expect(successCount).toBeGreaterThan(0);
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should enforce rate limiting on registration attempts', async () => {
      const registerData = {
        email: 'ratelimit@example.com',
        password: 'password123',
        role: 'user',
      };

      // Make multiple registration requests quickly
      const promises = Array.from({ length: 10 }, () =>
        request(app.getHttpServer()).post('/auth/register').send(registerData),
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter((r) => r.status === 201).length;
      const rateLimitedCount = responses.filter((r) => r.status === 429).length;

      expect(successCount).toBeGreaterThan(0);
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should enforce rate limiting on refresh attempts', async () => {
      // First get a valid refresh token
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123',
        });

      const refreshToken = loginResponse.body.refresh_token;
      const refreshData = { refresh_token: refreshToken };

      // Make multiple refresh requests quickly
      const promises = Array.from({ length: 10 }, () =>
        request(app.getHttpServer()).post('/auth/refresh').send(refreshData),
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter((r) => r.status === 201).length;
      const rateLimitedCount = responses.filter((r) => r.status === 429).length;

      expect(successCount).toBeGreaterThan(0);
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });

  describe('Security Tests', () => {
    it('should not expose password in responses', async () => {
      const registerData = {
        email: 'security@example.com',
        password: 'password123',
        role: 'user',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(201);

      expect(response.body.user).not.toHaveProperty('password');
      expect(JSON.stringify(response.body)).not.toContain('password123');
    });

    it('should not expose password in login responses', async () => {
      const loginData = {
        email: 'user@example.com',
        password: 'user123',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(201);

      expect(response.body.user).not.toHaveProperty('password');
      expect(JSON.stringify(response.body)).not.toContain('user123');
    });

    it('should reject SQL injection attempts', async () => {
      const loginData = {
        email: "'; DROP TABLE users; --",
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(401); // Should not crash, just return unauthorized
    });

    it('should reject XSS attempts', async () => {
      const registerData = {
        email: '<script>alert("xss")</script>@example.com',
        password: 'password123',
        role: 'user',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(400); // Should reject invalid email format
    });

    it('should handle very long inputs', async () => {
      const longEmail = 'a'.repeat(1000) + '@example.com';
      const registerData = {
        email: longEmail,
        password: 'password123',
        role: 'user',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(400); // Should reject overly long email
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent registration attempts', async () => {
      const registerData = {
        email: 'concurrent@example.com',
        password: 'password123',
        role: 'user',
      };

      const promises = Array.from({ length: 5 }, () =>
        request(app.getHttpServer()).post('/auth/register').send(registerData),
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter((r) => r.status === 201).length;
      const conflictCount = responses.filter((r) => r.status === 409).length;

      expect(successCount).toBe(1); // Only one should succeed
      expect(conflictCount).toBeGreaterThan(0); // Others should get conflict
    });

    it('should handle concurrent login attempts', async () => {
      const loginData = {
        email: 'user@example.com',
        password: 'user123',
      };

      const promises = Array.from({ length: 10 }, () =>
        request(app.getHttpServer()).post('/auth/login').send(loginData),
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter((r) => r.status === 201).length;

      expect(successCount).toBeGreaterThan(0);
    });

    it('should handle malformed JWT tokens', async () => {
      const refreshData = {
        refresh_token: 'not.a.valid.jwt.token',
      };

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send(refreshData)
        .expect(401);
    });

    it('should handle missing Content-Type header', async () => {
      const loginData = {
        email: 'user@example.com',
        password: 'user123',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(201); // Should still work without explicit Content-Type
    });

    it('should handle different Content-Type headers', async () => {
      const loginData = {
        email: 'user@example.com',
        password: 'user123',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send(loginData)
        .expect(201);
    });
  });
});

