import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NotificationChannel } from './enums/notification-channel.enum';
import { NotificationStatus } from './enums/notification-status.enum';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Calling service that requested the notification, e.g. "Jarvis". */
  @Index()
  @Column({ name: 'service_name', type: 'varchar', length: 100 })
  serviceName: string;

  @Column({
    name: 'channel',
    type: 'enum',
    enum: NotificationChannel,
    default: NotificationChannel.SMS,
  })
  channel: NotificationChannel;

  @Index()
  @Column({ name: 'recipient', type: 'varchar', length: 32 })
  recipient: string;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Index()
  @Column({
    name: 'status',
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  /** Provider-side identifier used to reconcile delivery reports. */
  @Index()
  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  providerMessageId: string | null;

  /** Body sent to the provider. Credentials are never stored here. */
  @Column({ name: 'provider_request_payload', type: 'jsonb', nullable: true })
  providerRequestPayload: Record<string, unknown> | null;

  @Column({ name: 'provider_response_payload', type: 'jsonb', nullable: true })
  providerResponsePayload: Record<string, unknown> | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
