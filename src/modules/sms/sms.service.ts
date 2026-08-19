import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '../notifications/enums/notification-channel.enum';
import { NotificationStatus } from '../notifications/enums/notification-status.enum';
import { Notification } from '../notifications/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsDispatchService } from './dispatch/sms-dispatch.service';
import { SmsDispatchResult } from './dispatch/dispatch.types';
import { SendSmsDto } from './dto/send-sms.dto';

const RETRY_BACKOFF_MS = 500;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Orchestrates a send: audit first, dispatch second, record the outcome last.
 * The audit row exists before the provider is contacted so nothing is lost if
 * the dispatch or the process dies mid-flight.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly dispatcher: SmsDispatchService,
    private readonly config: ConfigService,
  ) {}

  async send(dto: SendSmsDto): Promise<Notification> {
    const notification = await this.notifications.create({
      serviceName: dto.service_name,
      channel: NotificationChannel.SMS,
      recipient: dto.phone_number,
      message: dto.message,
    });

    const maxAttempts = Math.max(
      1,
      this.config.get<number>('notify.maxAttempts') ?? 1,
    );
    let result: SmsDispatchResult;
    let attempt = 0;

    do {
      if (attempt > 0) {
        await sleep(RETRY_BACKOFF_MS * attempt);
        this.logger.warn(
          `Retrying notification ${notification.id} (attempt ${attempt + 1}/${maxAttempts})`,
        );
      }

      result = await this.dispatcher.dispatch({
        recipient: notification.recipient,
        message: notification.message,
      });

      attempt += 1;
    } while (!result.success && result.retryable && attempt < maxAttempts);

    const recorded = await this.notifications.recordAttempt(notification.id, {
      status: result.success
        ? this.mapProviderStatus(result.providerStatus)
        : NotificationStatus.FAILED,
      providerMessageId: result.providerMessageId,
      providerRequestPayload: result.requestPayload,
      providerResponsePayload: result.responsePayload,
      // Attempts beyond the first are retries.
      retryCount: attempt - 1,
      errorMessage: result.errorMessage,
    });

    if (!result.success) {
      throw new BadGatewayException({
        message: 'Failed to deliver the SMS to the provider',
        notification_id: recorded.id,
        status: recorded.status,
        retry_count: recorded.retryCount,
        error: recorded.errorMessage,
      });
    }

    return recorded;
  }

  private mapProviderStatus(providerStatus: string | null): NotificationStatus {
    switch (providerStatus?.toUpperCase()) {
      case 'PROCESSING':
      case 'QUEUED':
      case 'PENDING':
        return NotificationStatus.PROCESSING;
      case 'DELIVERED':
        return NotificationStatus.DELIVERED;
      default:
        // Provider accepted it without a recognisable status.
        return NotificationStatus.SENT;
    }
  }
}
