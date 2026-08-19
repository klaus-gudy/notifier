import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { stripPhoneFormatting } from '../../../common/utils/phone';

/**
 * Wire contract for calling services. Field names stay snake_case so the
 * payload can be forwarded as-is by upstream systems.
 */
export class SendSmsDto {
  @ApiProperty({ example: '255623470540' })
  @Transform(({ value }) => stripPhoneFormatting(value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{9,15}$/, {
    message:
      'phone_number must be 9-15 digits in international format, e.g. 255623470540',
  })
  phone_number: string;

  @ApiProperty({ example: 'Hello from API Management endpoint!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1600)
  message: string;

  @ApiProperty({ example: 'Jarvis' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  service_name: string;
}
