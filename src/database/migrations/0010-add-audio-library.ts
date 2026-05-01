import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAudioLibrary1746060000000 implements MigrationInterface {
  name = 'AddAudioLibrary1746060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audio_books" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" text NOT NULL,
        "cover_url" text NULL,
        "description" text NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audio_chapters" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" text NOT NULL,
        "order_index" int NOT NULL DEFAULT 0,
        "book_id" uuid NOT NULL REFERENCES "audio_books"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audio_chapters_book_id" ON "audio_chapters"("book_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audio_paragraphs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "text" text NOT NULL,
        "order_index" int NOT NULL DEFAULT 0,
        "audio_url" text NOT NULL,
        "chapter_id" uuid NOT NULL REFERENCES "audio_chapters"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audio_paragraphs_chapter_id" ON "audio_paragraphs"("chapter_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audio_paragraphs";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audio_chapters";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audio_books";`);
  }
}

