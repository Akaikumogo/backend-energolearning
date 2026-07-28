import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * counts_for_xp ni qayta hisoblash: faqat kunlik reja (DAILY_PLAN / NULL).
 * LESSON urinishlariga ball berilmaydi.
 */
async function recomputePlanXp(queryRunner: QueryRunner): Promise<void> {
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

/**
 * Avval ball berilmagan kunlik reja to‘g‘ri javoblari uchun counts_for_xp.
 * Faqat DAILY_PLAN / NULL — LESSON ga ball yo‘q.
 */
export class BackfillCountsForXp1747700000000 implements MigrationInterface {
  name = 'BackfillCountsForXp1747700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await recomputePlanXp(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "user_question_attempts" SET "counts_for_xp" = false;
    `);
  }
}
