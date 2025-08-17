import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'your-secret-key',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
  expiresIn: process.env.JWT_EXPIRATION || '1h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d',
})); 