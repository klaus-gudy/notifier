export interface AppConfig {
  port: number;
  logRequestBody: boolean;
  database: {
    /** Full connection string. Takes precedence over the discrete fields. */
    url: string;
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
  };
  notify: {
    baseUrl: string;
    apiKey: string;
    senderId: string;
    timeoutMs: number;
    maxAttempts: number;
    poll: {
      enabled: boolean;
      cron: string;
      batchSize: number;
      maxAgeHours: number;
    };
  };
  resend: {
    apiKey: string;
    senderEmail: string;
    senderName: string;
  };
  rabbitmq: {
    enabled: boolean;
    url: string;
    emailQueue: string;
    smsQueue: string;
    prefetch: number;
  };
}

const DEFAULT_NOTIFY_BASE_URL = 'https://api.notify.africa/api/v1';

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  // Off by default: request bodies carry phone numbers and message text.
  logRequestBody: process.env.LOG_REQUEST_BODY === 'true',
  database: {
    url: process.env.DATABASE_URL ?? '',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER ?? '',
    password: process.env.DATABASE_PASSWORD ?? '',
    name: process.env.DATABASE_NAME ?? 'notifier',
  },
  notify: {
    // Overridable so the provider can be pointed at a sandbox without a code change.
    baseUrl: process.env.NOTIFY_BASE_URL ?? DEFAULT_NOTIFY_BASE_URL,
    apiKey: process.env.NOTIFY_API_KEY ?? '',
    senderId: process.env.NOTIFY_SENDER_ID ?? '',
    timeoutMs: parseInt(process.env.NOTIFY_TIMEOUT_MS ?? '15000', 10),
    maxAttempts: parseInt(process.env.NOTIFY_MAX_ATTEMPTS ?? '3', 10),
    poll: {
      enabled: process.env.NOTIFY_POLL_ENABLED !== 'false',
      cron: process.env.NOTIFY_POLL_CRON ?? '*/1 * * * *',
      batchSize: parseInt(process.env.NOTIFY_POLL_BATCH_SIZE ?? '50', 10),
      // Stop chasing messages the provider never resolves.
      maxAgeHours: parseInt(process.env.NOTIFY_POLL_MAX_AGE_HOURS ?? '24', 10),
    },
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    senderEmail: process.env.RESEND_SENDER_EMAIL ?? '',
    senderName: process.env.RESEND_SENDER_NAME ?? '',
  },
  rabbitmq: {
    enabled: process.env.RABBITMQ_ENABLED !== 'false',
    url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
    /*
     * Producer-owned queue, dead-lettered to jarvis.emails.dlx. Jarvis asserts
     * and binds it; this service only checks it exists and consumes.
     *
     * Named for who consumes it, in caps, matching DOCUMENT_WORKER_QUEUE on the
     * events side — a queue is *who reads*, a routing key is *what happened*,
     * and the old `emails.outbound` was the same lowercase-dotted shape as a
     * key. The `_EMAIL_` qualifier is what gives the SMS side a queue of its
     * own, declared just below.
     *
     * It must match Jarvis's MAIL_QUEUE exactly: this service does not declare
     * the queue, so a mismatch is not a new queue, it is `checkQueue` failing
     * against one that does not exist.
     */
    emailQueue: process.env.RABBITMQ_EMAIL_QUEUE ?? 'NOTIFIER_EMAIL_QUEUE',
    /*
     * The SMS twin of the queue above, on the same contract: the producer
     * asserts, binds and dead-letters it, this service only checks it exists
     * and consumes. Messages carry the same body POST /sms/send takes.
     */
    smsQueue: process.env.RABBITMQ_SMS_QUEUE ?? 'NOTIFIER_SMS_QUEUE',
    // Caps how many messages are in flight before acks catch up.
    prefetch: parseInt(process.env.RABBITMQ_PREFETCH ?? '10', 10),
  },
});
