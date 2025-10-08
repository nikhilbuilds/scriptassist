import { ApiProperty } from '@nestjs/swagger';

export class JobQueuedResponseDto {
  @ApiProperty({
    example: 'Tasks queued for creation',
    description: 'Success message',
  })
  message: string;

  @ApiProperty({
    example: '1234',
    description: 'BullMQ job ID for tracking',
  })
  jobId: string;

  @ApiProperty({
    example: 10,
    description: 'Number of items queued',
  })
  taskCount: number;

  @ApiProperty({
    example: 'queued',
    description: 'Job status',
  })
  status: string;
}
