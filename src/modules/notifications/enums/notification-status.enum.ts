export enum NotificationStatus {
  /** Persisted for audit, not yet handed to the provider. */
  PENDING = 'PENDING',
  /** Provider accepted the request and is still working on it. */
  PROCESSING = 'PROCESSING',
  /** Provider accepted and reported the message as sent. */
  SENT = 'SENT',
  /** Provider confirmed delivery to the handset. */
  DELIVERED = 'DELIVERED',
  /** Provider rejected the request, or it never reached the provider. */
  FAILED = 'FAILED',
}
