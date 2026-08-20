import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailConsumerService } from './email-consumer.service';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';

@Module({
  imports: [NotificationsModule],
  controllers: [EmailController],
  providers: [EmailService, EmailConsumerService],
  exports: [EmailService],
})
export class EmailModule {}
