export interface AppConfig {
  port: number;
  logRequestBody: boolean;
  database: {
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
}

const DEFAULT_NOTIFY_BASE_URL = 'https://api.notify.africa/api/v1';

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  // Off by default: request bodies carry phone numbers and message text.
  logRequestBody: process.env.LOG_REQUEST_BODY === 'true',
  database: {
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
});
