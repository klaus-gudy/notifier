import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SendSmsDto } from './dto/send-sms.dto';
import { SmsResponseDto } from './dto/sms-response.dto';
import { SmsService } from './sms.service';

@ApiTags('SMS')
@Controller('sms')
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send an SMS and record it for audit' })
  @ApiResponse({
    status: 202,
    description: 'Provider accepted the message',
    schema: {
      example: {
        notification_id: '5e8154bf-80ed-45d9-b4b1-80fb57237c7b',
        service_name: 'Jarvis',
        channel: 'SMS',
        recipient: '255623470540',
        status: 'PROCESSING',
        provider_message_id: '156023',
        retry_count: 0,
        created_at: '2025-11-13T12:36:09.751Z',
      },
    },
  })
  @ApiResponse({
    status: 502,
    description:
      'Provider rejected the message or was unreachable. The attempt is still audited.',
  })
  async send(@Body() dto: SendSmsDto): Promise<SmsResponseDto> {
    return SmsResponseDto.fromEntity(await this.smsService.send(dto));
  }
}
