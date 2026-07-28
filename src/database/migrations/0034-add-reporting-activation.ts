import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportingActivation1748000000000 implements MigrationInterface {
  name = 'AddReportingActivation1748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
      ADD COLUMN IF NOT EXISTS "report_active" BOOLEAN NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      UPDATE "organizations" SET "report_active" = true WHERE "report_active" IS DISTINCT FROM true
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "report_active" BOOLEAN NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      UPDATE "users" SET "report_active" = true WHERE "report_active" IS DISTINCT FROM true
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organization_division_settings" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" UUID NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "division_name" TEXT NOT NULL DEFAULT '',
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_org_division_settings"
          UNIQUE ("organization_id", "division_name")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_org_division_settings_org"
      ON "organization_division_settings" ("organization_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reporting_activation_history" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "scope_type" TEXT NOT NULL,
        "organization_id" UUID NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "division_name" TEXT NULL,
        "user_id" UUID NULL
          REFERENCES "users"("id") ON DELETE CASCADE,
        "is_active" BOOLEAN NOT NULL,
        "changed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "changed_by_user_id" UUID NULL
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_reporting_activation_scope"
          CHECK ("scope_type" IN ('organization', 'division', 'employee'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reporting_act_hist_org"
      ON "reporting_activation_history" ("scope_type", "organization_id", "changed_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reporting_act_hist_div"
      ON "reporting_activation_history" (
        "scope_type", "organization_id", "division_name", "changed_at" DESC
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reporting_act_hist_user"
      ON "reporting_activation_history" ("scope_type", "user_id", "changed_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_report_active"
      ON "users" ("report_active")
      WHERE "report_active" = false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_organizations_report_active"
      ON "organizations" ("report_active")
      WHERE "report_active" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_organizations_report_active"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_report_active"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_reporting_act_hist_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_reporting_act_hist_div"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_reporting_act_hist_org"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "reporting_activation_history"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_org_division_settings_org"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "organization_division_settings"`,
    );
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "report_active"
    `);
    await queryRunner.query(`
      ALTER TABLE "organizations" DROP COLUMN IF EXISTS "report_active"
    `);
  }
}
