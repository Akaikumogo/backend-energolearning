import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Avval ball berilmagan to‘g‘ri javoblar uchun counts_for_xp ni qayta hisoblash.
 *
 * Sabab: ko‘p urinishlar default LESSON sifatida yozilgan (yoki dars orqali
 * reja “yopilgan”), shu bois counts_for_xp=false qolgan. Har user / Toshkent
 * kuni bo‘yicha birinchi 10 ta noyob to‘g‘ri savolga ball beriladi
 * (attempt_source dan qat’i nazar — bir martalik adolatli backfill).
 *
 * Keyingi yangi urinishlar: faqat DAILY_PLAN → XP (progress.service).
 */
export class BackfillCountsForXp1747700000000 implements MigrationInterface {
  name = 'BackfillCountsForXp1747700000000';

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
    // Oldingi qoida: faqat DAILY_PLAN / NULL
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
}
