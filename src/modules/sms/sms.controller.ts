import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SendSmsDto } from './dto/send-sms.dto';
import { SmsResponseDto } from './dto/sms-response.dto';
import { SmsService } from './sms.service';

@Controller('sms')
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  async send(@Body() dto: SendSmsDto): Promise<SmsResponseDto> {
    return SmsResponseDto.fromEntity(await this.smsService.send(dto));
  }
}
