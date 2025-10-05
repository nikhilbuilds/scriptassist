import { IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';

export class BatchCreateTasksDto {
  @ApiProperty({
    type: [CreateTaskDto],
    description: 'Array of tasks to create',
    example: [
      {
        title: 'Task 1',
        description: 'Description 1',
        status: 'PENDING',
        priority: 'HIGH',
        dueDate: '2024-12-31T23:59:59.000Z',
      },
      {
        title: 'Task 2',
        description: 'Description 2',
        status: 'PENDING',
        priority: 'MEDIUM',
        dueDate: '2024-12-31T23:59:59.000Z',
      },
    ],
  })
  @IsArray({ message: 'tasks must be an array' })
  @ArrayMinSize(1, { message: 'At least one task is required' })
  @ArrayMaxSize(100, { message: 'Cannot create more than 100 tasks at once' })
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  tasks: CreateTaskDto[];
}
