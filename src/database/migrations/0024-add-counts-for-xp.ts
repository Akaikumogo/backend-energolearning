import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * XP faqat kunlik majburiyat (plan) bo‘yicha:
 * har Toshkent kunida birinchi 10 ta noyob to‘g‘ri savol → counts_for_xp=true.
 * Dars/modul (LESSON) va plandan tashqari → false.
 */
export class AddCountsForXp1747000000000 implements MigrationInterface {
  name = 'AddCountsForXp1747000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_question_attempts"
      ADD COLUMN IF NOT EXISTS "counts_for_xp" boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      ALTER TABLE "user_question_attempts"
      ADD COLUMN IF NOT EXISTS "attempt_source" text NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_uqa_counts_for_xp"
      ON "user_question_attempts"("counts_for_xp")
      WHERE "counts_for_xp" = true;
    `);

    // Legacy backfill: har user/kun uchun birinchi 10 ta noyob to‘g‘ri savol.
    await queryRunner.query(`
      UPDATE "user_question_attempts" SET "counts_for_xp" = false;
    `);

    await queryRunner.query(`
      WITH first_correct AS (
        SELECT DISTINCT ON (
          a.user_id,
          ((a.answered_at AT TIME ZONE 'Asia/Tashkent')::date),
          a.question_id
        )
          a.id,
          a.user_id,
          ((a.answered_at AT TIME ZONE 'Asia/Tashkent')::date) AS day,
          a.answered_at
        FROM "user_question_attempts" a
        WHERE a.is_correct = true
          AND (a.attempt_source IS NULL OR a.attempt_source = 'DAILY_PLAN')
        ORDER BY
          a.user_id,
          ((a.answered_at AT TIME ZONE 'Asia/Tashkent')::date),
          a.question_id,
          a.answered_at ASC,
          a.id ASC
      ),
      numbered AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, day
            ORDER BY answered_at ASC, id ASC
          ) AS rn
        FROM first_correct
      )
      UPDATE "user_question_attempts" a
      SET "counts_for_xp" = true
      FROM numbered n
      WHERE a.id = n.id
        AND n.rn <= 10;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_uqa_counts_for_xp";`);
    await queryRunner.query(`
      ALTER TABLE "user_question_attempts"
      DROP COLUMN IF EXISTS "attempt_source";
    `);
    await queryRunner.query(`
      ALTER TABLE "user_question_attempts"
      DROP COLUMN IF EXISTS "counts_for_xp";
    `);
  }
}
