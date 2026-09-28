import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan o'zgarishlari tarixi: kim (markaziy apparat xodimi), kimning planini,
 * qaysi kun uchun, qanday o'zgartirgani. Superadmin "Custom plans" sahifasi uchun.
 */
export class PlanChangeLogs1759100000000 implements MigrationInterface {
  name = 'PlanChangeLogs1759100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plan_change_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "target_user_id" uuid NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "kind" VARCHAR(16) NOT NULL,
        "action" VARCHAR(8) NOT NULL,
        "day" DATE NULL,
        "old_goal" INT NULL,
        "new_goal" INT NULL,
        "old_value" JSONB NULL,
        "new_value" JSONB NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_plan_change_logs_created" ON "plan_change_logs" ("created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_plan_change_logs_target" ON "plan_change_logs" ("target_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_plan_change_logs_actor" ON "plan_change_logs" ("actor_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_change_logs"`);
  }
}
