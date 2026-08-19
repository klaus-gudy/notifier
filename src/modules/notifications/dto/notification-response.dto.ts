import { Notification } from '../notification.entity';

/** Row shape for the list endpoint — audit payload blobs are left out. */
export class NotificationSummaryDto {
  id: string;
  service_name: string;
  channel: string;
  recipient: string;
  message: string;
  status: string;
  provider_message_id: string | null;
  retry_count: number;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;

  static fromEntity(notification: Notification): NotificationSummaryDto {
    return {
      id: notification.id,
      service_name: notification.serviceName,
      channel: notification.channel,
      recipient: notification.recipient,
      message: notification.message,
      status: notification.status,
      provider_message_id: notification.providerMessageId,
      retry_count: notification.retryCount,
      error_message: notification.errorMessage,
      created_at: notification.createdAt,
      updated_at: notification.updatedAt,
    };
  }
}

/** Single-record shape — includes exactly what was exchanged with the provider. */
export class NotificationDetailDto extends NotificationSummaryDto {
  provider_request_payload: Record<string, unknown> | null;
  provider_response_payload: Record<string, unknown> | null;

  static fromEntity(notification: Notification): NotificationDetailDto {
    return {
      ...NotificationSummaryDto.fromEntity(notification),
      provider_request_payload: notification.providerRequestPayload,
      provider_response_payload: notification.providerResponsePayload,
    };
  }
}

export class PaginatedNotificationsDto {
  data: NotificationSummaryDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
