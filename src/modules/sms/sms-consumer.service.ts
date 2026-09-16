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
import { AppConfig } from '../../config/configuration';
import { SendSmsDto } from './dto/send-sms.dto';
import { SmsService } from './sms.service';

/**
 * Consumes SMS events published to the producer's queue and runs them through
 * the same path as POST /sms/send, so a queued SMS is dispatched and audited
 * exactly like a posted one — same DTO, same validation, same retry policy.
 *
 * Acknowledgement policy, given the queue is dead-lettered by its producer:
 *  - unparseable or invalid payload -> dead-letter immediately, since a retry
 *    can never make it valid;
 *  - send failure -> one requeue, then dead-letter, so a transient provider
 *    blip recovers without a poison message looping forever.
 * The audit row is written either way, so nothing is lost to the DLQ. Note a
 * requeue replays the whole send: SmsService has already burned its own
 * NOTIFY_MAX_ATTEMPTS by this point, and the replay opens a second audit row
 * rather than updating the first.
 *
 * Its own connection, separate from the email consumer's, so either channel
 * can be retuned or fail without disturbing the other.
 */
@Injectable()
export class SmsConsumerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SmsConsumerService.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    private readonly smsService: SmsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const { enabled, url, smsQueue, prefetch } =
      this.config.getOrThrow<AppConfig['rabbitmq']>('rabbitmq');

    if (!enabled) {
      this.logger.log('SMS queue consumer is disabled');
      return;
    }

    this.connection = connect([url]);
    this.connection.on('connect', () =>
      this.logger.log(`Connected to RabbitMQ, consuming "${smsQueue}"`),
    );
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channel = this.connection.createChannel({
      json: false,
      setup: async (channel: ConfirmChannel) => {
        // Checked, not asserted: the queue belongs to the producer, and
        // re-declaring it with different arguments would kill the channel.
        await channel.checkQueue(smsQueue);
        await channel.prefetch(prefetch);
        await channel.consume(smsQueue, (message) => {
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
    let dto: SendSmsDto;

    try {
      dto = await this.parse(message);
    } catch (error) {
      this.logger.error(
        `Dead-lettering "${routingKey}": ${this.describe(error)}`,
      );
      this.channel.nack(message, false, false);
      return;
    }

    try {
      const notification = await this.smsService.send(dto);
      this.channel.ack(message);
      this.logger.log(
        `Handled "${routingKey}" -> notification ${notification.id}`,
      );
    } catch (error) {
      // SmsService has already audited this as FAILED and logged the id.
      const requeue = !message.fields.redelivered;

      this.logger.error(
        `Send failed for "${routingKey}" (${this.describe(error)}); ` +
          (requeue ? 'requeueing once' : 'dead-lettering'),
      );

      this.channel.nack(message, false, requeue);
    }
  }

  /** Applies the same validation the HTTP endpoint uses, phone normalisation
   *  included — the DTO's @Transform runs during plainToInstance. */
  private async parse(message: ConsumeMessage): Promise<SendSmsDto> {
    const raw: unknown = JSON.parse(message.content.toString('utf8'));
    const dto = plainToInstance(SendSmsDto, raw);

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
