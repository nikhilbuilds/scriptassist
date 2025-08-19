import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { TaskBatchProcessAction } from '../enums/task-batck-process-action.enum';

export class TaskBatchProcessDTO {
  @ApiProperty({
    example: '["123e4567-e89b-12d3-a456-426614174000", "123e4567-e89b-12d3-a456-426614174000"]',
  })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsNotEmpty()
  tasks: string[];

  @ApiProperty({ example: 'complete or delete', required: false })
  @IsString()
  @IsEnum(TaskBatchProcessAction)
  action: TaskBatchProcessAction;
}
