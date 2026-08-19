import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

const stripFormatting = (value: unknown): unknown =>
  typeof value === 'string' ? value.replace(/[\s()+-]/g, '') : value;

/**
 * Wire contract for calling services. Field names stay snake_case so the
 * payload can be forwarded as-is by upstream systems.
 */
export class SendSmsDto {
  @ApiProperty({ example: '255689737459' })
  @Transform(({ value }) => stripFormatting(value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{9,15}$/, {
    message:
      'phone_number must be 9-15 digits in international format, e.g. 255689737459',
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
