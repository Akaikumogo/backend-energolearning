import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Productionda analitika sahifalarining sekinligini bartaraf qilish uchun
 * indekslar qo'shadi. Hammasi `IF NOT EXISTS` bilan idempotent.
 *
 * CONCURRENTLY ishlatilmaydi chunki migrationlar transaction ichida yuradi —
 * jadval kichik bo'lguncha to'g'ridan-to'g'ri CREATE INDEX yetarli.
 */
export class AddAnalyticsIndexes1746200000000 implements MigrationInterface {
  name = 'AddAnalyticsIndexes1746200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // user_question_attempts: getHeartsLost va getQuestionErrors uchun
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_uqa_org_answered_correct"
        ON "user_question_attempts" ("organization_id", "answered_at", "is_correct")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_uqa_user_id"
        ON "user_question_attempts" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_uqa_question_id"
        ON "user_question_attempts" ("question_id")
    `);
    // getQuestionErrors va Hearts Lost dasturchasi uchun: faqat noto'g'ri
    // javoblar bo'yicha tez agregatsiya.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_uqa_wrong_answered_at"
        ON "user_question_attempts" ("answered_at")
        WHERE "is_correct" = false
    `);

    // user_level_completions: getLevelFunnel
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ulc_org_level"
        ON "user_level_completions" ("organization_id", "level_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ulc_level_completion"
        ON "user_level_completions" ("level_id", "completion_percent")
    `);

    // refresh_tokens: activeUsers7d
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_created_at"
        ON "refresh_tokens" ("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user_id"
        ON "refresh_tokens" ("user_id")
    `);

    // user_organizations: getSummary org filter
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_orgs_org_user"
        ON "user_organizations" ("organization_id", "user_id")
    `);

    // user_progress: hearts. UNIQUE — race-safe upsert (ON CONFLICT) uchun.
    // Avval mavjud duplikatlarni tozalaymiz (eng yangi rowni qoldiramiz).
    await queryRunner.query(`
      DELETE FROM "user_progress" up
      USING (
        SELECT id, user_id, organization_id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, organization_id
            ORDER BY updated_at DESC, created_at DESC, id DESC
          ) AS rn
        FROM "user_progress"
      ) ranked
      WHERE up.id = ranked.id AND ranked.rn > 1
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_progress_user_org"
        ON "user_progress" ("user_id", "organization_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_uqa_org_answered_correct"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_uqa_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_uqa_question_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_uqa_wrong_answered_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ulc_org_level"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ulc_level_completion"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_orgs_org_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_user_progress_user_org"`);
  }
}
