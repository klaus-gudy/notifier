import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { stripPhoneFormatting } from '../../../common/utils/phone';
import { NotificationStatus } from '../enums/notification-status.enum';

export class QueryNotificationsDto {
  @ApiPropertyOptional({ example: 'Jarvis' })
  @IsOptional()
  @IsString()
  service_name?: string;

  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ example: '255689737459' })
  @IsOptional()
  @Transform(({ value }) => stripPhoneFormatting(value))
  @IsString()
  recipient?: string;

  @ApiPropertyOptional({
    description: 'Created at or after this ISO timestamp',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Created at or before this ISO timestamp',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
