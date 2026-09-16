import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsConsumerService } from './sms-consumer.service';
import { SmsStatusPollerService } from './sms-status-poller.service';
import { SmsDispatchService } from './dispatch/sms-dispatch.service';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';

@Module({
  imports: [HttpModule, NotificationsModule],
  controllers: [SmsController],
  providers: [
    SmsService,
    SmsDispatchService,
    SmsStatusPollerService,
    SmsConsumerService,
  ],
})
export class SmsModule {}
