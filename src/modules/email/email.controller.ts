import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EmailResponseDto } from './dto/email-response.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { EmailService } from './email.service';

@ApiTags('Email')
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send an email and record it for audit' })
  @ApiResponse({
    status: 202,
    description: 'Provider accepted the email',
    schema: {
      example: {
        notification_id: '5e8154bf-80ed-45d9-b4b1-80fb57237c7b',
        service_name: 'Jarvis',
        channel: 'EMAIL',
        recipient: 'goodluckmadadi@gmail.com',
        subject: 'Hello World',
        status: 'SENT',
        provider_message_id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c',
        created_at: '2026-08-20T12:36:09.751Z',
      },
    },
  })
  @ApiResponse({
    status: 502,
    description:
      'Provider rejected the email or was unreachable. The attempt is still audited.',
  })
  async send(@Body() dto: SendEmailDto): Promise<EmailResponseDto> {
    return EmailResponseDto.fromEntity(
      await this.emailService.send(dto),
      dto.subject,
    );
  }
}
