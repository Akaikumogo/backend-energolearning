import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationEnergoMirror1746110000000
  implements MigrationInterface
{
  name = 'AddOrganizationEnergoMirror1746110000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
      ADD COLUMN IF NOT EXISTS "energo_branch_id" uuid NULL,
      ADD COLUMN IF NOT EXISTS "energo_external_id" text NULL,
      ADD COLUMN IF NOT EXISTS "branch_code" text NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_organizations_energo_branch_id"
      ON "organizations"("energo_branch_id")
      WHERE "energo_branch_id" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_organizations_energo_external_id"
      ON "organizations"("energo_external_id")
      WHERE "energo_external_id" IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_organizations_energo_external_id";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_organizations_energo_branch_id";`,
    );
    await queryRunner.query(`
      ALTER TABLE "organizations"
      DROP COLUMN IF EXISTS "branch_code",
      DROP COLUMN IF EXISTS "energo_external_id",
      DROP COLUMN IF EXISTS "energo_branch_id";
    `);
  }
}
