import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportSubmissionIntegrity0029 implements MigrationInterface {
  name = 'AddReportSubmissionIntegrity0029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "report_submissions"
      ADD COLUMN IF NOT EXISTS "content_hash" character varying(128) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "report_submissions"
      ADD COLUMN IF NOT EXISTS "integrity_status" character varying(32)
      NOT NULL DEFAULT 'unsigned'
    `);
    await queryRunner.query(`
      ALTER TABLE "report_submissions"
      ADD COLUMN IF NOT EXISTS "export_id" uuid NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "report_submissions" DROP COLUMN IF EXISTS "export_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_submissions" DROP COLUMN IF EXISTS "integrity_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_submissions" DROP COLUMN IF EXISTS "content_hash"
    `);
  }
}
