import { Notification } from '../../notifications/notification.entity';

/** What the calling service gets back once the notification is persisted. */
export class EmailResponseDto {
  notification_id: string;
  service_name: string;
  channel: string;
  recipient: string;
  subject: string;
  status: string;
  provider_message_id: string | null;
  created_at: Date;

  static fromEntity(
    notification: Notification,
    subject: string,
  ): EmailResponseDto {
    return {
      notification_id: notification.id,
      service_name: notification.serviceName,
      channel: notification.channel,
      recipient: notification.recipient,
      subject,
      status: notification.status,
      provider_message_id: notification.providerMessageId,
      created_at: notification.createdAt,
    };
  }
}
