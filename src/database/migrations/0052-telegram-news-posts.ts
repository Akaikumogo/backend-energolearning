import { MigrationInterface, QueryRunner } from 'typeorm';

/** Superadmin o'zi yaratadigan Telegram newslari (rasm + matn). */
export class TelegramNewsPosts1759400000000 implements MigrationInterface {
  name = 'TelegramNewsPosts1759400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telegram_news_posts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" VARCHAR(200) NOT NULL,
        "body" TEXT NOT NULL DEFAULT '',
        "images" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "with_app_button" BOOLEAN NOT NULL DEFAULT true,
        "created_by_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_by_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_news_posts"`);
  }
}
