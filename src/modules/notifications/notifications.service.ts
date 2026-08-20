import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  IsNull,
  Repository,
} from 'typeorm';
import { Notification } from './notification.entity';
import { NotificationChannel } from './enums/notification-channel.enum';
import { NotificationStatus } from './enums/notification-status.enum';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { POLLABLE_STATUSES } from './notification-status.map';

export interface CreateNotificationInput {
  serviceName: string;
  channel: NotificationChannel;
  recipient: string;
  message: string;
}

export interface RecordAttemptInput {
  status: NotificationStatus;
  providerMessageId?: string | null;
  providerRequestPayload?: Record<string, unknown> | null;
  providerResponsePayload?: Record<string, unknown> | null;
  retryCount: number;
  errorMessage?: string | null;
}

/**
 * Owns the audit trail. Every notification that enters the system gets a row
 * here before anything is handed to a provider, so a failed dispatch is still
 * traceable.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  create(input: CreateNotificationInput): Promise<Notification> {
    return this.notifications.save(
      this.notifications.create({
        ...input,
        status: NotificationStatus.PENDING,
        retryCount: 0,
      }),
    );
  }

  /** Paginated audit search, newest first. */
  async findAll(query: QueryNotificationsDto): Promise<{
    items: Notification[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await this.notifications.findAndCount({
      where: this.buildWhere(query),
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      // The jsonb payloads are only served from the detail endpoint.
      select: {
        id: true,
        serviceName: true,
        channel: true,
        recipient: true,
        message: true,
        status: true,
        providerMessageId: true,
        retryCount: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<Notification> {
    const notification = await this.notifications.findOneBy({ id });

    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    return notification;
  }

  private buildWhere(
    query: QueryNotificationsDto,
  ): FindOptionsWhere<Notification> {
    const where: FindOptionsWhere<Notification> = {};

    if (query.service_name) {
      where.serviceName = query.service_name;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.recipient) {
      where.recipient = query.recipient;
    }

    if (query.from && query.to) {
      where.createdAt = Between(new Date(query.from), new Date(query.to));
    } else if (query.from) {
      where.createdAt = MoreThanOrEqual(new Date(query.from));
    } else if (query.to) {
      where.createdAt = LessThanOrEqual(new Date(query.to));
    }

    return where;
  }

  /**
   * Dispatched messages still awaiting a final delivery outcome. Oldest first
   * so nothing starves, and bounded by age so a message the provider never
   * resolves is eventually left alone instead of polled forever.
   *
   * Scoped by channel: provider message ids are only meaningful to the
   * provider that issued them, so an SMS poll must not pick up email rows.
   */
  findAwaitingDeliveryStatus(
    channel: NotificationChannel,
    limit: number,
    maxAgeHours: number,
  ): Promise<Notification[]> {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    return this.notifications.find({
      where: {
        channel,
        status: In(POLLABLE_STATUSES),
        providerMessageId: Not(IsNull()),
        createdAt: MoreThanOrEqual(cutoff),
      },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  /** Applies a delivery outcome from the poller. Provider payloads are left
   *  untouched so the original dispatch record stays intact. */
  async applyDeliveryStatus(
    id: string,
    status: NotificationStatus,
    errorMessage?: string | null,
  ): Promise<Notification> {
    const notification = await this.notifications.findOneByOrFail({ id });

    notification.status = status;
    if (errorMessage !== undefined) {
      notification.errorMessage = errorMessage;
    }

    return this.notifications.save(notification);
  }

  async recordAttempt(
    id: string,
    input: RecordAttemptInput,
  ): Promise<Notification> {
    const notification = await this.notifications.findOneByOrFail({ id });

    notification.status = input.status;
    notification.providerMessageId = input.providerMessageId ?? null;
    notification.providerRequestPayload = input.providerRequestPayload ?? null;
    notification.providerResponsePayload =
      input.providerResponsePayload ?? null;
    notification.retryCount = input.retryCount;
    notification.errorMessage = input.errorMessage ?? null;

    return this.notifications.save(notification);
  }
}
