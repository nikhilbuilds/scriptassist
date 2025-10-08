import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({
    example: 'Validation failed',
    description: 'Error message or array of messages',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiProperty({ example: 'Bad Request', description: 'Error type' })
  error: string;
}

export class ValidationErrorResponseDto extends ErrorResponseDto {
  @ApiProperty({
    example: ['email must be an email', 'password must be longer than 8 characters'],
    description: 'Array of validation error messages',
  })
  message: string[];

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: 400 })
  statusCode: number;
}

export class UnauthorizedErrorResponseDto extends ErrorResponseDto {
  @ApiProperty({ example: 'Invalid credentials' })
  message: string;

  @ApiProperty({ example: 'Unauthorized' })
  error: string;

  @ApiProperty({ example: 401 })
  statusCode: number;
}

export class ForbiddenErrorResponseDto extends ErrorResponseDto {
  @ApiProperty({ example: 'Forbidden resource' })
  message: string;

  @ApiProperty({ example: 'Forbidden' })
  error: string;

  @ApiProperty({ example: 403 })
  statusCode: number;
}

export class NotFoundErrorResponseDto extends ErrorResponseDto {
  @ApiProperty({ example: 'Task not found' })
  message: string;

  @ApiProperty({ example: 'Not Found' })
  error: string;

  @ApiProperty({ example: 404 })
  statusCode: number;
}

export class ConflictErrorResponseDto extends ErrorResponseDto {
  @ApiProperty({ example: 'Email already exists' })
  message: string;

  @ApiProperty({ example: 'Conflict' })
  error: string;

  @ApiProperty({ example: 409 })
  statusCode: number;
}
