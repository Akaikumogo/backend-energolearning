import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 0031 ba’zi muhitlarda LESSON ga ham ball bergan edi.
 * Bu migratsiya counts_for_xp ni qayta hisoblaydi:
 * faqat DAILY_PLAN / NULL, har user/kun birinchi 10 ta noyob to‘g‘ri.
 * LESSON → counts_for_xp = false.
 */
export class FixCountsForXpDailyPlanOnly1747800000000
  implements MigrationInterface
{
  name = 'FixCountsForXpDailyPlanOnly1747800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(): Promise<void> {
    // No-op: qayta hisoblashni orqaga qaytarish ma’nosiz
  }
}
