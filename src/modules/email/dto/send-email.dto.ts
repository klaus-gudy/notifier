import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Wire contract for calling services. `service_name` is snake_case to match
 *  the SMS endpoint so upstream systems can forward payloads as-is. */
export class SendEmailDto {
  @ApiProperty({ example: 'goodluckmadadi@gmail.com' })
  @IsEmail()
  @IsNotEmpty()
  // Bounded to the recipient column width.
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: 'Hello World' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    example: '<p>Congrats on sending your <strong>first email</strong>!</p>',
    description: 'HTML body of the email. Stored as the notification message.',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ example: 'Jarvis', description: 'Calling service, audited.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  service_name: string;
}
