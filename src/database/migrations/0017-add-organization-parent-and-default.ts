import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationParentAndDefault1746300000000
  implements MigrationInterface
{
  name = 'AddOrganizationParentAndDefault1746300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
      ADD COLUMN IF NOT EXISTS "parent_organization_id" uuid NULL
        REFERENCES "organizations"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "is_default" boolean NOT NULL DEFAULT false;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_organizations_parent_id"
      ON "organizations"("parent_organization_id");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_organizations_parent_id";`,
    );
    await queryRunner.query(`
      ALTER TABLE "organizations"
      DROP COLUMN IF EXISTS "is_default",
      DROP COLUMN IF EXISTS "parent_organization_id";
    `);
  }
}
