import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bir user + bir savol + bir Toshkent kuni → faqat 1 ta urinish qoladi.
 * Qoida: avvalo eng erta TO‘G‘RI javob; to‘g‘ri yo‘q bo‘lsa — eng erta urinish.
 * Misool: bir xil savolga 10 marta bosilgan → 1 qoladi, 9 o‘chadi.
 * Boshqa savollar / boshqa kunlar saqlanadi.
 */
export class DedupeQuestionAttemptsPerDay1747100000000
  implements MigrationInterface
{
  name = 'DedupeQuestionAttemptsPerDay1747100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Dublikatlarni o‘chirish (birinchi mos qator qoladi)
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          a.id,
          ROW_NUMBER() OVER (
            PARTITION BY
              a.user_id,
              a.question_id,
              ((a.answered_at AT TIME ZONE 'Asia/Tashkent')::date)
            ORDER BY
              CASE WHEN a.is_correct THEN 0 ELSE 1 END,
              a.answered_at ASC,
              a.id ASC
          ) AS rn
        FROM "user_question_attempts" a
      )
      DELETE FROM "user_question_attempts" a
      USING ranked r
      WHERE a.id = r.id
        AND r.rn > 1;
    `);

    // 2) counts_for_xp ni qayta hisoblash (o‘chirishdan keyin to‘g‘ri bo‘lsin)
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

    // 3) Kelajakda bir kunda bir savolga takror yozuvni DB darajasida bloklash
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_uqa_user_question_tashkent_day"
      ON "user_question_attempts" (
        "user_id",
        "question_id",
        ((("answered_at" AT TIME ZONE 'Asia/Tashkent')::date))
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_uqa_user_question_tashkent_day";
    `);
    // O‘chirilgan qatorlarni qaytarib bo‘lmaydi
  }
}
