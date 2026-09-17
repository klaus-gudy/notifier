import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ConsumeMessage } from 'amqplib';
import { AppConfig } from '../../config/configuration';
import { NotificationChannel } from '../notifications/enums/notification-channel.enum';
import { NotificationSendError } from '../notifications/notification-send.error';
import { NotificationsService } from '../notifications/notifications.service';
import { SendSmsDto } from './dto/send-sms.dto';
import { SmsConsumerService } from './sms-consumer.service';
import { SmsService } from './sms.service';

const rabbitmq: AppConfig['rabbitmq'] = {
  enabled: true,
  url: 'amqp://guest:guest@localhost:5672',
  emailQueue: 'NOTIFIER_EMAIL_QUEUE',
  smsQueue: 'NOTIFIER_SMS_QUEUE',
  prefetch: 10,
};

const valid = {
  phone_number: '255623470540',
  message: 'Hello from the queue',
  service_name: 'Jarvis',
};

/** The subset of the consumer's internals these tests drive directly, so the
 *  ack policy can be exercised without a broker. */
interface Internals {
  connection?: unknown;
  channel?: { ack: jest.Mock; nack: jest.Mock };
  handle(message: ConsumeMessage | null): Promise<void>;
}

const internals = (service: SmsConsumerService): Internals =>
  service as unknown as Internals;

const delivery = (body: unknown, redelivered = false): ConsumeMessage =>
  ({
    content: Buffer.from(
      typeof body === 'string' ? body : JSON.stringify(body),
    ),
    fields: { routingKey: 'sms.send', redelivered },
    properties: {},
  }) as ConsumeMessage;

describe('SmsConsumerService', () => {
  let service: SmsConsumerService;
  let send: jest.Mock;
  let retry: jest.Mock;
  let recordRejected: jest.Mock;
  let ack: jest.Mock;
  let nack: jest.Mock;

  /** The DTO handed to SmsService on the first (and only) dispatch. */
  const dispatched = (): SendSmsDto => (send.mock.calls[0] as [SendSmsDto])[0];

  beforeEach(async () => {
    // The consumer logs every rejection; keep the suite output readable.
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    send = jest.fn().mockResolvedValue({ id: 'notification-1' });
    retry = jest.fn().mockResolvedValue({ id: 'notification-1' });
    recordRejected = jest.fn().mockResolvedValue({ id: 'rejected-1' });
    ack = jest.fn();
    nack = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SmsConsumerService,
        { provide: SmsService, useValue: { send, retry } },
        { provide: NotificationsService, useValue: { recordRejected } },
        { provide: ConfigService, useValue: { getOrThrow: () => rabbitmq } },
      ],
    }).compile();

    service = moduleRef.get(SmsConsumerService);
    internals(service).channel = { ack, nack };
  });

  afterEach(() => jest.restoreAllMocks());

  it('stays offline when the queue consumers are disabled', () => {
    const moduleRef = {
      getOrThrow: () => ({ ...rabbitmq, enabled: false }),
    } as unknown as ConfigService;
    const disabled = new SmsConsumerService(
      { send } as unknown as SmsService,
      { recordRejected } as unknown as NotificationsService,
      moduleRef,
    );

    disabled.onModuleInit();

    expect(internals(disabled).connection).toBeUndefined();
  });

  it('sends a valid payload and acks it', async () => {
    await internals(service).handle(delivery(valid));

    expect(send).toHaveBeenCalledWith(expect.objectContaining(valid));
    expect(dispatched()).toBeInstanceOf(SendSmsDto);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(nack).not.toHaveBeenCalled();
  });

  it('normalises the phone number the way the HTTP endpoint does', async () => {
    await internals(service).handle(
      delivery({ ...valid, phone_number: '+255 623-470540' }),
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ phone_number: '255623470540' }),
    );
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('strips unknown properties instead of rejecting the message', async () => {
    await internals(service).handle(
      delivery({ ...valid, published_at: '2026-09-16T00:00:00Z' }),
    );

    expect(send).toHaveBeenCalledWith(expect.objectContaining(valid));
    expect(dispatched()).not.toHaveProperty('published_at');
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unparseable json', 'not json at all'],
    ['a malformed phone number', { ...valid, phone_number: '12' }],
    [
      'a missing message',
      { phone_number: valid.phone_number, service_name: 'Jarvis' },
    ],
  ])('audits and dead-letters %s without dispatching', async (_label, body) => {
    await internals(service).handle(delivery(body));

    expect(send).not.toHaveBeenCalled();
    const [audited] = recordRejected.mock.calls[0] as [
      { channel: NotificationChannel; errorMessage: string },
    ];
    expect(audited.channel).toBe(NotificationChannel.SMS);
    expect(audited.errorMessage).toContain('Rejected queue payload');
    expect(nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('keeps the surviving fields of a rejected payload', async () => {
    await internals(service).handle(delivery({ ...valid, phone_number: '12' }));

    expect(recordRejected).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'Jarvis',
        recipient: '12',
        message: valid.message,
      }),
    );
  });

  it('falls back to the raw body when the payload is not json', async () => {
    await internals(service).handle(delivery('not json at all'));

    expect(recordRejected).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'unknown',
        recipient: '',
        message: 'not json at all',
      }),
    );
  });

  it('still dead-letters a rejection it could not audit', async () => {
    recordRejected.mockRejectedValue(new Error('database unreachable'));

    await internals(service).handle(delivery('not json at all'));

    expect(nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  const sendError = (): NotificationSendError =>
    new NotificationSendError('notification-1', { error: 'provider down' });

  it('retries a send failure once into the same audit row, then acks', async () => {
    send.mockRejectedValue(sendError());

    await internals(service).handle(delivery(valid));

    expect(send).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith('notification-1');
    expect(ack).toHaveBeenCalledTimes(1);
    expect(nack).not.toHaveBeenCalled();
  });

  it('dead-letters without requeueing when the retry also fails', async () => {
    send.mockRejectedValue(sendError());
    retry.mockRejectedValue(sendError());

    await internals(service).handle(delivery(valid));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(ack).not.toHaveBeenCalled();
  });

  it('requeues once a failure that never reached the audit trail', async () => {
    send.mockRejectedValue(new Error('database unreachable'));

    await internals(service).handle(delivery(valid));

    expect(retry).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(expect.anything(), false, true);
  });

  it('dead-letters an unaudited failure that has already been redelivered', async () => {
    send.mockRejectedValue(new Error('database unreachable'));

    await internals(service).handle(delivery(valid, true));

    expect(nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(ack).not.toHaveBeenCalled();
  });

  it('ignores a broker-cancelled consumer', async () => {
    await internals(service).handle(null);

    expect(send).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(nack).not.toHaveBeenCalled();
  });
});
