import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const logger = new Logger('SchemaEnsure');

/**
 * Entity’lar kutayotgan, lekin migratsiya kechikishi mumkin bo‘lgan
 * ustun/jadvallarni idempotent tarzda ta’minlaydi.
 * Prod’da `npm run db:migrate` o‘tkazilmasa ham PM2 restart yetadi.
 */
export async function ensureCriticalSchema(ds: DataSource): Promise<void> {
  const statements = [
    `ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "name_1c" text`,
    `UPDATE "departments" SET "name_1c" = "name" WHERE "name_1c" IS NULL`,
    `ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "title_1c" text`,
    `UPDATE "positions" SET "title_1c" = "title" WHERE "title_1c" IS NULL`,
    `
      CREATE TABLE IF NOT EXISTS "level_positions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "level_id" uuid NOT NULL REFERENCES "levels"("id") ON DELETE CASCADE,
        "position_id" uuid NOT NULL REFERENCES "positions"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_level_position" UNIQUE ("level_id", "position_id")
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_level_positions_position" ON "level_positions"("position_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_level_positions_level" ON "level_positions"("level_id")`,
  ];

  for (const sql of statements) {
    try {
      await ds.query(sql);
    } catch (error) {
      logger.warn(
        `Schema ensure skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
