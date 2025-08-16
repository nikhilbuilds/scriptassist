import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ example: 'jwt token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
