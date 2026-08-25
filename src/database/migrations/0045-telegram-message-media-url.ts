import { MigrationInterface, QueryRunner } from 'typeorm';

export class TelegramMessageMediaUrl1749000000000 implements MigrationInterface {
  name = 'TelegramMessageMediaUrl1749000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "telegram_chat_messages"
        ADD COLUMN IF NOT EXISTS "media_url" text NULL,
        ADD COLUMN IF NOT EXISTS "media_file_name" text NULL,
        ADD COLUMN IF NOT EXISTS "media_mime" text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "telegram_chat_messages"
        DROP COLUMN IF EXISTS "media_url",
        DROP COLUMN IF EXISTS "media_file_name",
        DROP COLUMN IF EXISTS "media_mime"
    `);
  }
}
