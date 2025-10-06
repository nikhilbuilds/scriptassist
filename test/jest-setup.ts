import 'reflect-metadata';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USERNAME = 'postgres';
process.env.DB_PASSWORD = 'root';
process.env.DB_DATABASE = 'taskflow';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
