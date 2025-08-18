import { IsArray, IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum BatchAction {
  COMPLETE = 'complete',
  DELETE = 'delete',
  IN_PROGRESS = 'in-progress',
}

export class BatchTaskDto {
  @ApiProperty({
    description: 'Array of task IDs to process',
    example: ['123e4567-e89b-12d3-a456-426614174000', '987fcdeb-51a2-43d1-b789-123456789abc'],
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  tasks: string[];

  @ApiProperty({
    description: 'Action to perform on the tasks',
    enum: BatchAction,
    example: BatchAction.COMPLETE,
  })
  @IsEnum(BatchAction)
  @IsNotEmpty()
  action: BatchAction;
}
