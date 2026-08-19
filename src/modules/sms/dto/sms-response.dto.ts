import { Notification } from '../../notifications/notification.entity';

/** What the calling service gets back once the notification is persisted. */
export class SmsResponseDto {
  notification_id: string;
  service_name: string;
  channel: string;
  recipient: string;
  status: string;
  provider_message_id: string | null;
  retry_count: number;
  created_at: Date;

  static fromEntity(notification: Notification): SmsResponseDto {
    return {
      notification_id: notification.id,
      service_name: notification.serviceName,
      channel: notification.channel,
      recipient: notification.recipient,
      status: notification.status,
      provider_message_id: notification.providerMessageId,
      retry_count: notification.retryCount,
      created_at: notification.createdAt,
    };
  }
}
