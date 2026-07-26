import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bir user + bir savol + bir Toshkent kuni → faqat 1 ta urinish qoladi.
 * Live DB: LOCK TABLE — delete va unique index orasida yangi dublikat yozilmasin.
 */
export class DedupeQuestionAttemptsPerDay1747100000000
  implements MigrationInterface
{
  name = 'DedupeQuestionAttemptsPerDay1747100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Boshqa sessiyalar insert qilib unique indexni buzmasligi uchun
    await queryRunner.query(`
      LOCK TABLE "user_question_attempts" IN ACCESS EXCLUSIVE MODE;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_uqa_user_question_tashkent_day";
    `);

    // Dublikatlarni o‘chirish (birinchi mos qator qoladi)
    await queryRunner.query(`
      DELETE FROM "user_question_attempts" a
      USING (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY
              user_id,
              question_id,
              ((answered_at AT TIME ZONE 'Asia/Tashkent')::date)
            ORDER BY
              CASE WHEN is_correct THEN 0 ELSE 1 END,
              answered_at ASC,
              id ASC
          ) AS rn
        FROM "user_question_attempts"
      ) r
      WHERE a.id = r.id
        AND r.rn > 1;
    `);

    // Ikkinchi o‘tish — qolgan bo‘lsa (xavfsizlik)
    await queryRunner.query(`
      DELETE FROM "user_question_attempts" a
      USING (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY
              user_id,
              question_id,
              ((answered_at AT TIME ZONE 'Asia/Tashkent')::date)
            ORDER BY
              CASE WHEN is_correct THEN 0 ELSE 1 END,
              answered_at ASC,
              id ASC
          ) AS rn
        FROM "user_question_attempts"
      ) r
      WHERE a.id = r.id
        AND r.rn > 1;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_uqa_user_question_tashkent_day"
      ON "user_question_attempts" (
        "user_id",
        "question_id",
        ((("answered_at" AT TIME ZONE 'Asia/Tashkent')::date))
      );
    `);

    // counts_for_xp ni qayta hisoblash
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
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_uqa_user_question_tashkent_day";
    `);
  }
}
