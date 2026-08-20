import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SendEmailDto } from './dto/send-email.dto';
import { EmailService } from './email.service';

@ApiTags('Email')
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send an email through Resend' })
  @ApiResponse({
    status: 202,
    description: 'Provider accepted the email',
    schema: {
      example: {
        email_id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c',
        recipient: 'goodluckmadadi@gmail.com',
        subject: 'Hello World',
      },
    },
  })
  @ApiResponse({
    status: 502,
    description: 'Provider rejected the email or was unreachable',
  })
  async send(@Body() dto: SendEmailDto) {
    return {
      email_id: await this.emailService.send(dto),
      recipient: dto.email,
      subject: dto.subject,
    };
  }
}
