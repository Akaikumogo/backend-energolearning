import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Telegram bot orqali yangiliklarni tarqatish.
 * - telegram_news_broadcasts: kim qachon test / hammaga yuborishni bosgani.
 * - telegram_news_deliveries: har bir chatga bitta yangilik faqat bir marta
 *   (news_key, chat_row_id) unique.
 */
export class TelegramNews1759200000000 implements MigrationInterface {
  name = 'TelegramNews1759200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telegram_news_broadcasts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "news_key" VARCHAR(64) NOT NULL,
        "mode" VARCHAR(8) NOT NULL,
        "status" VARCHAR(12) NOT NULL DEFAULT 'RUNNING',
        "test_chat_row_id" uuid NULL REFERENCES "telegram_report_chats"("id") ON DELETE SET NULL,
        "total" INT NOT NULL DEFAULT 0,
        "sent" INT NOT NULL DEFAULT 0,
        "failed" INT NOT NULL DEFAULT 0,
        "blocked" INT NOT NULL DEFAULT 0,
        "error" TEXT NULL,
        "started_by_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "finished_at" TIMESTAMPTZ NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_tg_news_broadcasts_key" ON "telegram_news_broadcasts" ("news_key", "started_at" DESC)`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telegram_news_deliveries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "news_key" VARCHAR(64) NOT NULL,
        "chat_row_id" uuid NOT NULL REFERENCES "telegram_report_chats"("id") ON DELETE CASCADE,
        "broadcast_id" uuid NULL REFERENCES "telegram_news_broadcasts"("id") ON DELETE SET NULL,
        "status" VARCHAR(8) NOT NULL,
        "error" TEXT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_tg_news_delivery" ON "telegram_news_deliveries" ("news_key", "chat_row_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_news_deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_news_broadcasts"`);
  }
}
