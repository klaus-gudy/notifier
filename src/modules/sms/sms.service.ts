import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '../notifications/enums/notification-channel.enum';
import { NotificationStatus } from '../notifications/enums/notification-status.enum';
import { NotificationSendError } from '../notifications/notification-send.error';
import { Notification } from '../notifications/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsDispatchService } from './dispatch/sms-dispatch.service';
import { SmsDispatchResult } from './dispatch/dispatch.types';
import { SendSmsDto } from './dto/send-sms.dto';

const RETRY_BACKOFF_MS = 500;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Keeps recipients out of the terminal in full, e.g. 255******459. */
const maskRecipient = (recipient: string): string =>
  recipient.length <= 6
    ? recipient
    : `${recipient.slice(0, 3)}${'*'.repeat(recipient.length - 6)}${recipient.slice(-3)}`;

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

    this.logger.log(
      `Queued ${notification.id} (${dto.service_name} -> ${maskRecipient(notification.recipient)})`,
    );

    return this.deliver(notification, 0);
  }

  /**
   * Dispatches a failed notification again into its existing audit row, so a
   * retry shows up as a higher retry_count rather than as a second record.
   */
  async retry(id: string): Promise<Notification> {
    const notification = await this.notifications.findOne(id);

    return this.deliver(notification, notification.retryCount + 1);
  }

  private async deliver(
    notification: Notification,
    priorAttempts: number,
  ): Promise<Notification> {
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
      // Attempts beyond the first are retries, across every delivery pass.
      retryCount: priorAttempts + attempt - 1,
      errorMessage: result.errorMessage,
    });

    const target = `${recorded.serviceName} -> ${maskRecipient(recorded.recipient)}`;

    if (result.success) {
      this.logger.log(
        `Sent ${recorded.id} (${target}) status=${recorded.status} ` +
          `providerMessageId=${recorded.providerMessageId ?? 'n/a'} retries=${recorded.retryCount}`,
      );
    } else {
      this.logger.error(
        `Failed ${recorded.id} (${target}) after ${attempt} attempt(s): ${recorded.errorMessage}`,
      );
    }

    if (!result.success) {
      throw new NotificationSendError(recorded.id, {
        message: 'Failed to deliver the SMS to the provider',
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
