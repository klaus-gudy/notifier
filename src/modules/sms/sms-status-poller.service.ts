import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { NotificationStatus } from '../notifications/enums/notification-status.enum';
import { mapProviderStatus } from '../notifications/notification-status.map';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsDispatchService } from './dispatch/sms-dispatch.service';

const JOB_NAME = 'sms-status-poll';

/**
 * Walks notifications the provider accepted but has not resolved yet and asks
 * for their delivery status. Registered dynamically rather than with @Cron so
 * the schedule can come from configuration.
 */
@Injectable()
export class SmsStatusPollerService implements OnModuleInit {
  private readonly logger = new Logger(SmsStatusPollerService.name);
  private running = false;

  constructor(
    private readonly notifications: NotificationsService,
    private readonly dispatcher: SmsDispatchService,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('notify.poll.enabled')) {
      this.logger.log('Delivery-status polling is disabled');
      return;
    }

    const cronTime = this.config.getOrThrow<string>('notify.poll.cron');
    const job = new CronJob(cronTime, () => {
      void this.poll();
    });

    this.scheduler.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(`Delivery-status polling scheduled (${cronTime})`);
  }

  /** One polling pass. Public so it can be triggered directly in tests. */
  async poll(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous poll still running, skipping this tick');
      return;
    }

    this.running = true;

    try {
      const batchSize = this.config.get<number>('notify.poll.batchSize') ?? 50;
      const maxAgeHours =
        this.config.get<number>('notify.poll.maxAgeHours') ?? 24;
      const pending = await this.notifications.findAwaitingDeliveryStatus(
        batchSize,
        maxAgeHours,
      );

      if (pending.length === 0) {
        return;
      }

      this.logger.log(
        `Polling delivery status for ${pending.length} notification(s)`,
      );

      for (const notification of pending) {
        await this.refresh(
          notification.id,
          notification.providerMessageId!,
          notification.status,
        );
      }
    } catch (error) {
      this.logger.error(
        `Delivery-status poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async refresh(
    id: string,
    providerMessageId: string,
    currentStatus: NotificationStatus,
  ): Promise<void> {
    const result = await this.dispatcher.checkStatus(providerMessageId);

    if (!result.success) {
      // A lookup failure says nothing about the message itself, so the record
      // keeps its current status and gets picked up again next tick.
      this.logger.warn(
        `Status lookup failed for ${id} (messageId=${providerMessageId}): ${result.errorMessage}`,
      );
      return;
    }

    const mapped = mapProviderStatus(result.providerStatus);

    if (mapped === null) {
      this.logger.warn(
        `Unrecognised provider status "${result.providerStatus}" for ${id}, leaving as ${currentStatus}`,
      );
      return;
    }

    if (mapped === currentStatus) {
      return;
    }

    const errorMessage =
      mapped === NotificationStatus.FAILED
        ? `Provider reported delivery status ${result.providerStatus}`
        : undefined;

    await this.notifications.applyDeliveryStatus(id, mapped, errorMessage);

    this.logger.log(
      `Notification ${id} (messageId=${providerMessageId}) ${currentStatus} -> ${mapped}` +
        (result.deliveredAt
          ? ` deliveredAt=${result.deliveredAt.toISOString()}`
          : ''),
    );
  }
}
