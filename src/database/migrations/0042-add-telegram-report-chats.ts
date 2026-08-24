import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTelegramReportChats1748800000000 implements MigrationInterface {
  name = 'AddTelegramReportChats1748800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telegram_report_chats" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "chat_id" bigint NOT NULL,
        "chat_type" text NOT NULL,
        "chat_title" text NULL,
        "started_by_user_id" bigint NULL,
        "started_by_username" text NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_telegram_report_chats_chat_id"
      ON "telegram_report_chats" ("chat_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_telegram_report_chats_chat_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_report_chats"`);
  }
}
