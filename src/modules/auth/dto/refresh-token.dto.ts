import { IsNotEmpty, IsString, IsJWT } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'JWT refresh token to exchange for new access token',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc1NTUxNTUyNCwiZXhwIjoxNzU4MTA3NTI0fQ.example',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  refreshToken: string;
}

export class RevokeTokenDto {
  @ApiProperty({
    description: 'JWT refresh token to revoke (Note: JWT tokens cannot be individually revoked)',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc1NTUxNTUyNCwiZXhwIjoxNzU4MTA3NTI0fQ.example',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  refreshToken: string;
}

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token for API authentication',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzU1NTE1NTI0LCJleHAiOjE3NTU2MDE5MjR9.example',
  })
  access_token: string;

  @ApiProperty({
    description: 'JWT refresh token for getting new access tokens',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc1NTUxNTUyNCwiZXhwIjoxNzU4MTA3NTI0fQ.example',
  })
  refresh_token: string;

  @ApiProperty({
    description: 'User information',
    example: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'admin@example.com',
      role: 'admin',
    },
  })
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export class RevokeResponseDto {
  @ApiProperty({
    description: 'Response message for token revocation',
    example: 'Token validation successful (Note: JWT tokens cannot be individually revoked)',
  })
  message: string;
}
