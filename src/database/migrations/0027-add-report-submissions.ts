import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportSubmissions1747300000000 implements MigrationInterface {
  name = 'AddReportSubmissions1747300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_submissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "month" character varying(7) NOT NULL,
        "org_name" text NOT NULL,
        "file_name" text NOT NULL,
        "uploaded_by_user_id" uuid NULL,
        "payload" jsonb NOT NULL,
        "employee_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_report_submissions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_report_submissions_org"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_report_submissions_uploader"
          FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_report_submissions_org_month"
      ON "report_submissions" ("organization_id", "month");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_report_submissions_uploaded_at"
      ON "report_submissions" ("created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_report_submissions_uploaded_at";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_report_submissions_org_month";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "report_submissions";`);
  }
}
