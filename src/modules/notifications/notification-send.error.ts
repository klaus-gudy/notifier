import { BadGatewayException } from '@nestjs/common';

/**
 * A send the provider refused or never received. Still a 502 to HTTP callers,
 * but carries the audit row id so the queue consumers can retry into that same
 * row instead of opening a second one.
 */
export class NotificationSendError extends BadGatewayException {
  constructor(
    readonly notificationId: string,
    body: Record<string, unknown>,
  ) {
    super({ ...body, notification_id: notificationId });
  }
}
