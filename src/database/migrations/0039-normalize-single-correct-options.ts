import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SINGLE_CHOICE / YES_NO: har savolda faqat bitta to‘g‘ri variant.
 * - Bir nechta is_correct=true → eng past order_index qoladi
 * - Hech biri true emas → birinchi variant (order_index) true qilinadi
 * MATCHING ga tegilmaydi.
 */
export class NormalizeSingleCorrectOptions1748500000000
  implements MigrationInterface
{
  name = 'NormalizeSingleCorrectOptions1748500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          qo.id,
          ROW_NUMBER() OVER (
            PARTITION BY qo.question_id
            ORDER BY
              CASE WHEN qo.is_correct THEN 0 ELSE 1 END,
              qo.order_index ASC,
              qo.created_at ASC,
              qo.id ASC
          ) AS rn
        FROM question_options qo
        INNER JOIN questions q ON q.id = qo.question_id
        WHERE q.type IN ('SINGLE_CHOICE', 'YES_NO')
      )
      UPDATE question_options qo
      SET is_correct = (ranked.rn = 1)
      FROM ranked
      WHERE qo.id = ranked.id
    `);
  }

  public async down(): Promise<void> {
    // Ma'lumot tozalash — oldingi holatni qaytarib bo‘lmaydi.
  }
}
