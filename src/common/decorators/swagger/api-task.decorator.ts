import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiResponse,
} from '@nestjs/swagger';
import {
  ValidationErrorResponseDto,
  UnauthorizedErrorResponseDto,
  ForbiddenErrorResponseDto,
  NotFoundErrorResponseDto,
} from '../../dto/error-response.dto';

/**
 * Swagger decorator for Create Task endpoint
 */
export function ApiTaskCreate<T>(responseDto: Type<T>) {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new task',
      description:
        'Creates a new task for the authenticated user. Task is automatically assigned to the current user.',
    }),
    ApiCreatedResponse({
      description: 'Task created successfully',
      type: responseDto,
    }),
    ApiBadRequestResponse({
      description: 'Validation failed or invalid data',
      type: ValidationErrorResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Authentication required',
      type: UnauthorizedErrorResponseDto,
    }),
  );
}

/**
 * Swagger decorator for List Tasks endpoint
 */
export function ApiTaskList<T>(responseDto: Type<T>) {
  return applyDecorators(
    ApiOperation({
      summary: 'Find all tasks with optional filtering (scoped by role)',
      description:
        'Returns paginated list of tasks. Regular users see only their own tasks. Admins and super-admins see all tasks. Supports filtering by status and priority.',
    }),
    ApiOkResponse({
      description: 'Tasks retrieved successfully with pagination',
      type: responseDto,
    }),
    ApiBadRequestResponse({
      description: 'Invalid query parameters',
      type: ValidationErrorResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Authentication required',
      type: UnauthorizedErrorResponseDto,
    }),
  );
}

/**
 * Swagger decorator for Get Single Task endpoint
 */
export function ApiTaskGet<T>(responseDto: Type<T>) {
  return applyDecorators(
    ApiOperation({
      summary: 'Find a task by ID (ownership enforced for regular users)',
      description:
        'Retrieves a task by its ID. Regular users can only access their own tasks. Admins and super-admins can access any task.',
    }),
    ApiOkResponse({
      description: 'Task retrieved successfully',
      type: responseDto,
    }),
    ApiBadRequestResponse({
      description: 'Invalid UUID format',
      type: ValidationErrorResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Authentication required',
      type: UnauthorizedErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'Access denied - task belongs to another user',
      type: ForbiddenErrorResponseDto,
    }),
    ApiNotFoundResponse({
      description: 'Task not found',
      type: NotFoundErrorResponseDto,
    }),
  );
}

/**
 * Swagger decorator for Update Task endpoint
 */
export function ApiTaskUpdate<T>(responseDto: Type<T>) {
  return applyDecorators(
    ApiOperation({
      summary: 'Update a task (ownership enforced for regular users)',
      description:
        'Updates an existing task. Regular users can only update their own tasks. Admins and super-admins can update any task.',
    }),
    ApiOkResponse({
      description: 'Task updated successfully',
      type: responseDto,
    }),
    ApiBadRequestResponse({
      description: 'Invalid UUID format or validation failed',
      type: ValidationErrorResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Authentication required',
      type: UnauthorizedErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'Access denied - task belongs to another user',
      type: ForbiddenErrorResponseDto,
    }),
    ApiNotFoundResponse({
      description: 'Task not found',
      type: NotFoundErrorResponseDto,
    }),
  );
}

/**
 * Swagger decorator for Delete Task endpoint
 */
export function ApiTaskDelete() {
  return applyDecorators(
    ApiOperation({
      summary: 'Delete a task (ownership enforced for regular users)',
      description:
        'Deletes a task permanently. Regular users can only delete their own tasks. Admins and super-admins can delete any task.',
    }),
    ApiOkResponse({
      description: 'Task deleted successfully',
      schema: {
        properties: {
          message: { type: 'string', example: 'Task deleted successfully' },
        },
      },
    }),
    ApiBadRequestResponse({
      description: 'Invalid UUID format',
      type: ValidationErrorResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Authentication required',
      type: UnauthorizedErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'Access denied - task belongs to another user',
      type: ForbiddenErrorResponseDto,
    }),
    ApiNotFoundResponse({
      description: 'Task not found',
      type: NotFoundErrorResponseDto,
    }),
  );
}

/**
 * Swagger decorator for Task Statistics endpoint
 */
export function ApiTaskStats<T>(responseDto: Type<T>) {
  return applyDecorators(
    ApiOperation({
      summary: 'Get task statistics (scoped by role)',
      description:
        'Returns task statistics scoped by user role. Regular users see their own stats, admins see organization-level stats, super-admins see global stats.',
    }),
    ApiOkResponse({
      description: 'Statistics retrieved successfully',
      type: responseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Authentication required',
      type: UnauthorizedErrorResponseDto,
    }),
  );
}

/**
 * Swagger decorator for Batch Create Tasks endpoint
 */
export function ApiTaskBatchCreate<T>(responseDto: Type<T>) {
  return applyDecorators(
    ApiOperation({
      summary: 'Batch create multiple tasks (creatorId auto-set)',
      description:
        'Creates multiple tasks in a single transaction. All tasks are assigned to the current user. Maximum 1000 tasks per batch.',
    }),
    ApiCreatedResponse({
      description: 'Tasks created successfully',
      type: responseDto,
    }),
    ApiBadRequestResponse({
      description: 'Validation failed or too many tasks (max 1000)',
      type: ValidationErrorResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Authentication required',
      type: UnauthorizedErrorResponseDto,
    }),
  );
}

/**
 * Swagger decorator for Async Batch Create Tasks endpoint
 */
export function ApiTaskBatchCreateAsync<T>(responseDto: Type<T>) {
  return applyDecorators(
    ApiOperation({
      summary: 'Batch create multiple tasks asynchronously via queue',
      description:
        'Queues multiple tasks for asynchronous creation using BullMQ. Returns immediately with job ID for tracking. Maximum 1000 tasks per batch.',
    }),
    ApiResponse({
      status: 202,
      description: 'Tasks queued successfully',
      type: responseDto,
    }),
    ApiBadRequestResponse({
      description: 'Validation failed or too many tasks (max 1000)',
      type: ValidationErrorResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Authentication required',
      type: UnauthorizedErrorResponseDto,
    }),
  );
}

/**
 * Swagger decorator for Batch Delete Tasks endpoint
 */
export function ApiTaskBatchDelete<T>(responseDto: Type<T>) {
  return applyDecorators(
    ApiOperation({
      summary: 'Batch delete multiple tasks (scoped by role)',
      description:
        'Deletes multiple tasks in a single operation. Regular users can only delete their own tasks. Admins and super-admins can delete any tasks.',
    }),
    ApiOkResponse({
      description: 'Tasks deleted successfully',
      type: responseDto,
    }),
    ApiBadRequestResponse({
      description: 'Validation failed',
      type: ValidationErrorResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Authentication required',
      type: UnauthorizedErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'Access denied - some tasks belong to other users',
      type: ForbiddenErrorResponseDto,
    }),
    ApiNotFoundResponse({
      description: 'One or more tasks not found',
      type: NotFoundErrorResponseDto,
    }),
  );
}

/**
 * Swagger decorator for Async Batch Delete Tasks endpoint
 */
export function ApiTaskBatchDeleteAsync<T>(responseDto: Type<T>) {
  return applyDecorators(
    ApiOperation({
      summary: 'Batch delete multiple tasks asynchronously via queue',
      description:
        'Queues multiple tasks for asynchronous deletion using BullMQ. Returns immediately with job ID for tracking.',
    }),
    ApiResponse({
      status: 202,
      description: 'Tasks queued for deletion',
      type: responseDto,
    }),
    ApiBadRequestResponse({
      description: 'Validation failed',
      type: ValidationErrorResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Authentication required',
      type: UnauthorizedErrorResponseDto,
    }),
  );
}
