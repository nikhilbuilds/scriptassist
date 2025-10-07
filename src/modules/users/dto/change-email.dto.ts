import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeEmailDto {
  @ApiProperty({ example: 'newemail@example.com' })
  @IsEmail()
  @IsNotEmpty()
  newEmail: string;

  @ApiProperty({ example: 'currentPassword123' })
  @IsNotEmpty()
  password: string;
}
