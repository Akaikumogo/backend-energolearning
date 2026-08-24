import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandTelegramBotInbox1748900000000 implements MigrationInterface {
  name = 'ExpandTelegramBotInbox1748900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telegram_bot_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "source" text NOT NULL DEFAULT 'default',
        "bot_token" text NULL,
        "web_app_url" text NULL,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "updated_by" uuid NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_telegram_bot_settings_source" UNIQUE ("source")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "telegram_report_chats"
        ADD COLUMN IF NOT EXISTS "peer_user_id" bigint NULL,
        ADD COLUMN IF NOT EXISTS "peer_username" text NULL,
        ADD COLUMN IF NOT EXISTS "peer_first_name" text NULL,
        ADD COLUMN IF NOT EXISTS "peer_last_name" text NULL,
        ADD COLUMN IF NOT EXISTS "report_enabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "unread_count" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "last_message_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "last_message_preview" text NULL
    `);

    await queryRunner.query(`
      UPDATE "telegram_report_chats"
      SET "report_enabled" = COALESCE("is_active", true)
      WHERE "report_enabled" = false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telegram_chat_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "chat_row_id" uuid NOT NULL REFERENCES "telegram_report_chats"("id") ON DELETE CASCADE,
        "direction" text NOT NULL,
        "kind" text NOT NULL DEFAULT 'text',
        "telegram_message_id" bigint NULL,
        "from_user_id" bigint NULL,
        "from_username" text NULL,
        "from_name" text NULL,
        "text" text NULL,
        "caption" text NULL,
        "media_file_id" text NULL,
        "is_command" boolean NOT NULL DEFAULT false,
        "command_name" text NULL,
        "sent_by_admin_id" uuid NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_telegram_chat_messages_chat_row_id"
      ON "telegram_chat_messages" ("chat_row_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_telegram_chat_messages_created_at"
      ON "telegram_chat_messages" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_chat_messages"`);
    await queryRunner.query(`
      ALTER TABLE "telegram_report_chats"
        DROP COLUMN IF EXISTS "peer_user_id",
        DROP COLUMN IF EXISTS "peer_username",
        DROP COLUMN IF EXISTS "peer_first_name",
        DROP COLUMN IF EXISTS "peer_last_name",
        DROP COLUMN IF EXISTS "report_enabled",
        DROP COLUMN IF EXISTS "unread_count",
        DROP COLUMN IF EXISTS "last_message_at",
        DROP COLUMN IF EXISTS "last_message_preview"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_bot_settings"`);
  }
}
