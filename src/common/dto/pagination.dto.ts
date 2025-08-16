import { SortOrder } from '@common/enums/pagination-order.enum';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsOptional, IsNumber, IsString, IsEnum } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({
    description: 'The page number to retrieve.',
    type: 'number',
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Transform(({ value }) => parseInt(value, 10))
  page: number = 1;

  @ApiPropertyOptional({
    description: 'The number of items per page.',
    type: 'number',
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Transform(({ value }) => parseInt(value, 10))
  limit: number = 10;

  @ApiPropertyOptional({
    description: 'The field to sort the results by.',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: "The sort order, either 'ASC' or 'DESC'.",
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;
}
