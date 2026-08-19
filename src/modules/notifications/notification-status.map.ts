import { NotificationStatus } from './enums/notification-status.enum';

/** Statuses the provider will not move away from — polling stops here. */
export const TERMINAL_STATUSES: NotificationStatus[] = [
  NotificationStatus.DELIVERED,
  NotificationStatus.FAILED,
];

/** Dispatched but not yet resolved — these are what the poller picks up. */
export const POLLABLE_STATUSES: NotificationStatus[] = [
  NotificationStatus.PROCESSING,
  NotificationStatus.SENT,
];

/**
 * Maps a provider status string onto our enum. The provider also returns
 * PENDING for accepted-but-unresolved messages; our own PENDING means
 * "not yet handed over", so that maps to PROCESSING instead. Anything
 * unrecognised returns null and the record is left untouched.
 */
export const mapProviderStatus = (
  providerStatus: string | null,
): NotificationStatus | null => {
  switch (providerStatus?.toUpperCase()) {
    case 'PENDING':
    case 'QUEUED':
    case 'PROCESSING':
      return NotificationStatus.PROCESSING;
    case 'SENT':
    case 'SUCCESS':
      return NotificationStatus.SENT;
    case 'DELIVERED':
      return NotificationStatus.DELIVERED;
    case 'FAILED':
    case 'REJECTED':
    case 'UNDELIVERED':
      return NotificationStatus.FAILED;
    default:
      return null;
  }
};
