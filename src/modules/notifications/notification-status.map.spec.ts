import { NotificationStatus } from './enums/notification-status.enum';
import { mapProviderStatus } from './notification-status.map';

describe('mapProviderStatus', () => {
  it.each([
    ['PROCESSING', NotificationStatus.PROCESSING],
    ['SENT', NotificationStatus.SENT],
    ['DELIVERED', NotificationStatus.DELIVERED],
    ['FAILED', NotificationStatus.FAILED],
  ])('maps the documented status %s', (provider, expected) => {
    expect(mapProviderStatus(provider)).toBe(expected);
  });

  it('maps the provider PENDING onto PROCESSING', () => {
    // Our own PENDING means "not yet dispatched", which this is not.
    expect(mapProviderStatus('PENDING')).toBe(NotificationStatus.PROCESSING);
  });

  it('is case insensitive', () => {
    expect(mapProviderStatus('delivered')).toBe(NotificationStatus.DELIVERED);
  });

  it('returns null for anything unrecognised so the record is left alone', () => {
    expect(mapProviderStatus('SOMETHING_NEW')).toBeNull();
    expect(mapProviderStatus(null)).toBeNull();
  });
});
