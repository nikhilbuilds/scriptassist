import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class UuidDTO {
  @ApiPropertyOptional({
    description: 'Unique id',
    type: 'string',
  })
  @IsUUID()
  @IsNotEmpty()
  id: string;
}
