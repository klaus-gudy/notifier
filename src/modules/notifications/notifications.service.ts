import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { NotificationChannel } from './enums/notification-channel.enum';
import { NotificationStatus } from './enums/notification-status.enum';

export interface CreateNotificationInput {
  serviceName: string;
  channel: NotificationChannel;
  recipient: string;
  message: string;
}

export interface RecordAttemptInput {
  status: NotificationStatus;
  providerMessageId?: string | null;
  providerRequestPayload?: Record<string, unknown> | null;
  providerResponsePayload?: Record<string, unknown> | null;
  retryCount: number;
  errorMessage?: string | null;
}

/**
 * Owns the audit trail. Every notification that enters the system gets a row
 * here before anything is handed to a provider, so a failed dispatch is still
 * traceable.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  create(input: CreateNotificationInput): Promise<Notification> {
    return this.notifications.save(
      this.notifications.create({
        ...input,
        status: NotificationStatus.PENDING,
        retryCount: 0,
      }),
    );
  }

  async recordAttempt(
    id: string,
    input: RecordAttemptInput,
  ): Promise<Notification> {
    const notification = await this.notifications.findOneByOrFail({ id });

    notification.status = input.status;
    notification.providerMessageId = input.providerMessageId ?? null;
    notification.providerRequestPayload = input.providerRequestPayload ?? null;
    notification.providerResponsePayload =
      input.providerResponsePayload ?? null;
    notification.retryCount = input.retryCount;
    notification.errorMessage = input.errorMessage ?? null;

    return this.notifications.save(notification);
  }
}
