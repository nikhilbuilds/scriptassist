import { IsArray, ArrayMinSize, ArrayMaxSize, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BatchDeleteTasksDto {
  @ApiProperty({
    type: [String],
    description: 'Array of task IDs to delete',
    example: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
  })
  @IsArray({ message: 'taskIds must be an array' })
  @ArrayMinSize(1, { message: 'At least one task ID is required' })
  @ArrayMaxSize(100, { message: 'Cannot delete more than 100 tasks at once' })
  @IsUUID('4', { each: true, message: 'Each task ID must be a valid UUID' })
  taskIds: string[];
}
