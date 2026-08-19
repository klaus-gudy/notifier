export interface AppConfig {
  port: number;
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
  };
}

const DEFAULT_NOTIFY_BASE_URL = 'https://api.notify.africa/api/v1';

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
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
  },
});
