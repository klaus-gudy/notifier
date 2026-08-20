import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { AppConfig } from '../../config/configuration';
import { NotificationChannel } from '../notifications/enums/notification-channel.enum';
import { NotificationStatus } from '../notifications/enums/notification-status.enum';
import { Notification } from '../notifications/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { SendEmailDto } from './dto/send-email.dto';

/** Keeps addresses out of the terminal in full, e.g. go***@gmail.com. */
const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');

  if (!domain) {
    return '***';
  }

  return `${local.slice(0, 2)}***@${domain}`;
};

/**
 * Sends transactional email through Resend. Mirrors the SMS flow: audit first,
 * dispatch second, record the outcome last, so nothing is lost if the dispatch
 * or the process dies mid-flight.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    const { apiKey, senderEmail, senderName } =
      config.getOrThrow<AppConfig['resend']>('resend');

    this.resend = new Resend(apiKey);
    // Display-name form, e.g. "Rentoo <info@rentoo.co.tz>". Falls back to the
    // bare address so an unset name never produces a malformed sender.
    this.from = senderName ? `${senderName} <${senderEmail}>` : senderEmail;
  }

  async send(dto: SendEmailDto): Promise<Notification> {
    const notification = await this.notifications.create({
      serviceName: dto.service_name,
      channel: NotificationChannel.EMAIL,
      recipient: dto.email,
      message: dto.content,
    });

    const target = `${dto.service_name} -> ${maskEmail(dto.email)}`;
    this.logger.log(`Queued ${notification.id} (${target})`);

    // The body is already persisted as the notification message, so it is not
    // duplicated into the stored payload. Credentials are never stored here.
    const requestPayload = {
      from: this.from,
      to: dto.email,
      subject: dto.subject,
    };

    let emailId: string | null = null;
    let failure: string | null = null;

    try {
      const { data, error } = await this.resend.emails.send({
        ...requestPayload,
        html: dto.content,
      });

      // Resend resolves with an `error` payload rather than rejecting, so an
      // unchecked call would record a refused send as a success.
      if (error) {
        failure = error.message;
      } else if (!data) {
        failure = 'Provider returned no email id';
      } else {
        emailId = data.id;
      }
    } catch (error) {
      // Network-level failure never reaches the provider, but the audit row
      // still has to reflect the outcome.
      failure = error instanceof Error ? error.message : String(error);
    }

    const recorded = await this.notifications.recordAttempt(notification.id, {
      // Resend accepting the email is not proof of delivery, so this stops at
      // SENT. Nothing polls it further — there is no email delivery webhook.
      status: failure ? NotificationStatus.FAILED : NotificationStatus.SENT,
      providerMessageId: emailId,
      providerRequestPayload: requestPayload,
      providerResponsePayload: emailId ? { id: emailId } : null,
      retryCount: 0,
      errorMessage: failure,
    });

    if (failure) {
      this.logger.error(`Failed ${recorded.id} (${target}): ${failure}`);

      throw new BadGatewayException({
        message: 'Failed to deliver the email to the provider',
        notification_id: recorded.id,
        status: recorded.status,
        error: failure,
      });
    }

    this.logger.log(
      `Sent ${recorded.id} (${target}) status=${recorded.status} ` +
        `providerMessageId=${recorded.providerMessageId}`,
    );

    return recorded;
  }
}
