import { MigrationInterface, QueryRunner } from 'typeorm';

/** Soft-delete + arxiv + rad etuvchi audit maydonlari. */
export class SafetyRecordDeleteArchive1749000000000
  implements MigrationInterface
{
  name = 'SafetyRecordDeleteArchive1749000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_safety_records"
      ADD COLUMN IF NOT EXISTS "rejected_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "deleted_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_safety_records_deleted"
      ON "employee_safety_records" ("user_id", "deleted_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_safety_records_archived"
      ON "employee_safety_records" ("archived_at")
      WHERE "archived_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_safety_records_archived"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_safety_records_deleted"`,
    );
    await queryRunner.query(`
      ALTER TABLE "employee_safety_records"
      DROP COLUMN IF EXISTS "archived_at",
      DROP COLUMN IF EXISTS "deleted_by",
      DROP COLUMN IF EXISTS "deleted_at",
      DROP COLUMN IF EXISTS "rejected_at",
      DROP COLUMN IF EXISTS "rejected_by"
    `);
  }
}
