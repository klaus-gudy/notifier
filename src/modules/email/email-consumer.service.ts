import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AmqpConnectionManager,
  ChannelWrapper,
  connect,
} from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { readStringFields } from '../../common/utils/queue-payload';
import { AppConfig } from '../../config/configuration';
import { NotificationChannel } from '../notifications/enums/notification-channel.enum';
import { NotificationSendError } from '../notifications/notification-send.error';
import { NotificationsService } from '../notifications/notifications.service';
import { SendEmailDto } from './dto/send-email.dto';
import { EmailService } from './email.service';

/**
 * Consumes email events published to the producer's queue and runs them
 * through the same path as the HTTP endpoint, so a queued email is audited
 * exactly like a posted one.
 *
 * Acknowledgement policy, given the queue dead-letters to jarvis.emails.dlx:
 *  - unparseable or invalid payload -> audited as FAILED, then dead-lettered
 *    immediately, since a retry can never make it valid;
 *  - send failure -> retried once in-process into the same audit row, then
 *    dead-lettered, so a transient provider blip recovers without a poison
 *    message looping forever. Retried here rather than requeued: a requeued
 *    message has no memory of its audit row, so the replay would open a
 *    second one.
 * Both paths leave an audit row, so nothing is lost to the DLQ.
 */
@Injectable()
export class EmailConsumerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(EmailConsumerService.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    private readonly emailService: EmailService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const { enabled, url, emailQueue, prefetch } =
      this.config.getOrThrow<AppConfig['rabbitmq']>('rabbitmq');

    if (!enabled) {
      this.logger.log('Email queue consumer is disabled');
      return;
    }

    this.connection = connect([url]);
    this.connection.on('connect', () =>
      this.logger.log(`Connected to RabbitMQ, consuming "${emailQueue}"`),
    );
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channel = this.connection.createChannel({
      json: false,
      setup: async (channel: ConfirmChannel) => {
        // Checked, not asserted: the queue belongs to the producer, and
        // re-declaring it with different arguments would kill the channel.
        await channel.checkQueue(emailQueue);
        await channel.prefetch(prefetch);
        await channel.consume(emailQueue, (message) => {
          void this.handle(message);
        });
      },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    // Stops the consumer before the connection drops, so in-flight messages
    // finish rather than being redelivered.
    await this.channel?.close();
    await this.connection?.close();
  }

  private async handle(message: ConsumeMessage | null): Promise<void> {
    // A null delivery means the consumer was cancelled by the broker.
    if (!message || !this.channel) {
      return;
    }

    const { routingKey } = message.fields;
    let dto: SendEmailDto;

    try {
      dto = await this.parse(message);
    } catch (error) {
      const reason = this.describe(error);

      this.logger.error(`Dead-lettering "${routingKey}": ${reason}`);
      await this.recordRejected(message, reason);
      this.channel.nack(message, false, false);
      return;
    }

    try {
      const notification = await this.emailService.send(dto);
      this.channel.ack(message);
      this.logger.log(
        `Handled "${routingKey}" -> notification ${notification.id}`,
      );
    } catch (error) {
      await this.retryOrDeadLetter(message, dto, error);
    }
  }

  private async retryOrDeadLetter(
    message: ConsumeMessage,
    dto: SendEmailDto,
    error: unknown,
  ): Promise<void> {
    const { routingKey } = message.fields;

    if (!(error instanceof NotificationSendError)) {
      // Failed before the outcome could be audited, e.g. the database is
      // unreachable. There is no failed row to retry into, so fall back to a
      // single requeue.
      const requeue = !message.fields.redelivered;

      this.logger.error(
        `Send failed for "${routingKey}" (${this.describe(error)}); ` +
          (requeue ? 'requeueing once' : 'dead-lettering'),
      );
      this.channel?.nack(message, false, requeue);
      return;
    }

    // EmailService has already audited this as FAILED and logged the id.
    this.logger.warn(
      `Send failed for "${routingKey}" (${this.describe(error)}); ` +
        `retrying notification ${error.notificationId} once`,
    );

    try {
      const notification = await this.emailService.retry(
        error.notificationId,
        dto,
      );
      this.channel?.ack(message);
      this.logger.log(
        `Handled "${routingKey}" -> notification ${notification.id} on retry`,
      );
    } catch (retryError) {
      this.logger.error(
        `Retry failed for "${routingKey}" (${this.describe(retryError)}); ` +
          `dead-lettering notification ${error.notificationId}`,
      );
      this.channel?.nack(message, false, false);
    }
  }

  /**
   * Audits a payload that never reached EmailService, keeping whatever fields
   * survived so the rejection can be traced back to its caller. A failed
   * insert is only logged: the message still reaches the DLQ.
   */
  private async recordRejected(
    message: ConsumeMessage,
    reason: string,
  ): Promise<void> {
    const body = message.content.toString('utf8');
    const fields = readStringFields(body);

    try {
      const notification = await this.notifications.recordRejected({
        serviceName: fields.service_name ?? 'unknown',
        channel: NotificationChannel.EMAIL,
        recipient: fields.email ?? '',
        // The raw payload stands in when there is no body to keep.
        message: fields.content ?? body,
        errorMessage: `Rejected queue payload: ${reason}`,
      });

      this.logger.warn(
        `Audited rejected "${message.fields.routingKey}" as notification ${notification.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Could not audit rejected "${message.fields.routingKey}": ${this.describe(error)}`,
      );
    }
  }

  /** Applies the same validation the HTTP endpoint uses. */
  private async parse(message: ConsumeMessage): Promise<SendEmailDto> {
    const raw: unknown = JSON.parse(message.content.toString('utf8'));
    const dto = plainToInstance(SendEmailDto, raw);

    // Unknown properties are stripped rather than rejected, so the producer
    // can add fields to the event without breaking this consumer.
    const errors = await validate(dto, { whitelist: true });

    if (errors.length > 0) {
      throw new Error(
        errors
          .map((e) => Object.values(e.constraints ?? {}).join(', '))
          .join('; '),
      );
    }

    return dto;
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
