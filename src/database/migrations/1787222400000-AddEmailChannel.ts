import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailChannel1787222400000 implements MigrationInterface {
  name = 'AddEmailChannel1787222400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Phone numbers fit in 32; email addresses run to 254 by RFC 5321.
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "recipient" TYPE character varying(320)`,
    );

    // Swapping the type in rather than ALTER TYPE ... ADD VALUE: the added
    // value cannot be used later in the same transaction, and TypeORM wraps
    // each migration in one.
    await queryRunner.query(
      `ALTER TYPE "notifications_channel_enum" RENAME TO "notifications_channel_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "notifications_channel_enum" AS ENUM ('SMS', 'EMAIL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "channel" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "channel" TYPE "notifications_channel_enum" USING "channel"::text::"notifications_channel_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "channel" SET DEFAULT 'SMS'`,
    );
    await queryRunner.query(`DROP TYPE "notifications_channel_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // EMAIL rows cannot survive a schema that has no EMAIL channel, and their
    // recipients would not fit the narrowed column either.
    await queryRunner.query(
      `DELETE FROM "notifications" WHERE "channel" = 'EMAIL'`,
    );

    await queryRunner.query(
      `ALTER TYPE "notifications_channel_enum" RENAME TO "notifications_channel_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "notifications_channel_enum" AS ENUM ('SMS')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "channel" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "channel" TYPE "notifications_channel_enum" USING "channel"::text::"notifications_channel_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "channel" SET DEFAULT 'SMS'`,
    );
    await queryRunner.query(`DROP TYPE "notifications_channel_enum_old"`);

    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "recipient" TYPE character varying(32)`,
    );
  }
}
