import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ball qoidasi (2026-07-28 dan):
 * - shu sanadan OLDINGI kunlar: birinchi 10 ta noyob to‘g‘ri (har qanday manba)
 *   → counts_for_xp=true; LESSON bo‘lsa attempt_source='DAILY_PLAN' (reja yopilgan edi)
 * - 2026-07-28 va keyin: faqat DAILY_PLAN / NULL
 *
 * Sabab: eski kunlarda reja dars orqali 10/10 ko‘rsatilgan, lekin XP=0 qolgan.
 */
const CUTOFF = '2026-07-28';

export class BackfillXpWithPlanCutoff1747900000000
  implements MigrationInterface
{
  name = 'BackfillXpWithPlanCutoff1747900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "user_question_attempts" SET "counts_for_xp" = false;
    `);

    // 1) Cutoff dan oldin — barcha manbalar
    await queryRunner.query(
      `
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
          AND ((a.answered_at AT TIME ZONE 'Asia/Tashkent')::date) < $1::date
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
      SET
        "counts_for_xp" = true,
        "attempt_source" = 'DAILY_PLAN'
      FROM numbered n
      WHERE a.id = n.id
        AND n.rn <= 10;
      `,
      [CUTOFF],
    );

    // 2) Cutoff va keyin — faqat kunlik reja
    await queryRunner.query(
      `
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
          AND ((a.answered_at AT TIME ZONE 'Asia/Tashkent')::date) >= $1::date
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
      `,
      [CUTOFF],
    );
  }

  public async down(): Promise<void> {
    // No-op
  }
}
