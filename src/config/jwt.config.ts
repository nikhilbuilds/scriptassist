import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'your-secret-key',
  expiresIn: process.env.JWT_EXPIRATION || '1d',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRATION || '30d',
}));

// JWT Constants
export const JWT_CONSTANTS = {
  ACCESS_TOKEN_EXPIRES_IN: '1d',
  REFRESH_TOKEN_EXPIRES_IN: '30d',
  REFRESH_TOKEN_TYPE: 'refresh',
  ACCESS_TOKEN_TYPE: 'access',
} as const; 