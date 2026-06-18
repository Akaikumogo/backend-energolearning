import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivityAndDailyPlan1746080000000 implements MigrationInterface {
  name = 'AddActivityAndDailyPlan1746080000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "initial_password" text NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NULL REFERENCES "organizations"("id") ON DELETE SET NULL,
        "login_at" timestamptz NOT NULL DEFAULT now(),
        "logout_at" timestamptz NULL,
        "last_seen_at" timestamptz NOT NULL DEFAULT now(),
        "is_online" boolean NOT NULL DEFAULT true,
        "ip_address" text NULL,
        "user_agent" text NULL,
        "duration_seconds" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_sessions_user_online"
      ON "user_sessions"("user_id", "is_online");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_sessions_last_seen"
      ON "user_sessions"("last_seen_at");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_activity_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NULL REFERENCES "organizations"("id") ON DELETE SET NULL,
        "event_type" text NOT NULL,
        "entity_type" text NULL,
        "entity_id" uuid NULL,
        "metadata" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activity_user_created"
      ON "user_activity_events"("user_id", "created_at");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activity_org_created"
      ON "user_activity_events"("organization_id", "created_at");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activity_type_created"
      ON "user_activity_events"("event_type", "created_at");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "daily_plans" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "plan_date" date NOT NULL,
        "question_ids" uuid[] NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_daily_plan_org_date" UNIQUE ("organization_id", "plan_date")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_daily_plans_org_date"
      ON "daily_plans"("organization_id", "plan_date");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_plans" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_activity_events" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_sessions" CASCADE;`);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "initial_password";
    `);
  }
}
