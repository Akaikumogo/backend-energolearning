import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationArchivedAt1747400000000
  implements MigrationInterface
{
  name = 'AddOrganizationArchivedAt1747400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
      ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_organizations_archived_at"
      ON "organizations" ("archived_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_organizations_archived_at"`,
    );
    await queryRunner.query(`
      ALTER TABLE "organizations"
      DROP COLUMN IF EXISTS "archived_at"
    `);
  }
}
