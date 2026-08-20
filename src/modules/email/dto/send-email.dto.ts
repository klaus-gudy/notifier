import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Wire contract for calling services. */
export class SendEmailDto {
  @ApiProperty({ example: 'goodluckmadadi@gmail.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Hello World' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    example: '<p>Congrats on sending your <strong>first email</strong>!</p>',
    description: 'HTML body of the email.',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}
