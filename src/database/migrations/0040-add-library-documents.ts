import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLibraryDocuments1748600000000 implements MigrationInterface {
  name = 'AddLibraryDocuments1748600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "library_documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" text NOT NULL,
        "description" text NULL,
        "file_kind" text NOT NULL,
        "file_url" text NOT NULL,
        "original_name" text NULL,
        "mime_type" text NULL,
        "file_size" bigint NULL,
        "order_index" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_library_documents_active_order"
      ON "library_documents" ("is_active", "order_index");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "library_documents";`);
  }
}
