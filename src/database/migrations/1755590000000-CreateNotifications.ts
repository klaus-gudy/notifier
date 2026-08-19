import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1755590000000 implements MigrationInterface {
  name = 'CreateNotifications1755590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "notifications_channel_enum" AS ENUM ('SMS')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notifications_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "service_name" character varying(100) NOT NULL,
        "channel" "notifications_channel_enum" NOT NULL DEFAULT 'SMS',
        "recipient" character varying(32) NOT NULL,
        "message" text NOT NULL,
        "status" "notifications_status_enum" NOT NULL DEFAULT 'PENDING',
        "provider_message_id" character varying(128),
        "provider_request_payload" jsonb,
        "provider_response_payload" jsonb,
        "retry_count" integer NOT NULL DEFAULT 0,
        "error_message" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_service_name" ON "notifications" ("service_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_recipient" ON "notifications" ("recipient")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_status" ON "notifications" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_provider_message_id" ON "notifications" ("provider_message_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_created_at" ON "notifications" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "notifications_status_enum"`);
    await queryRunner.query(`DROP TYPE "notifications_channel_enum"`);
  }
}
