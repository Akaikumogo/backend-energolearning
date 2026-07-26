import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDepartmentsCatalog1746900000000 implements MigrationInterface {
  name = 'AddDepartmentsCatalog1746900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "departments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" text NOT NULL UNIQUE,
        "employee_count" int NOT NULL DEFAULT 0,
        "last_synced_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      ALTER TABLE "positions"
      ADD COLUMN IF NOT EXISTS "employee_count" int NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      ALTER TABLE "positions"
      ADD COLUMN IF NOT EXISTS "last_synced_at" timestamptz NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "positions"
      ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "positions" DROP COLUMN IF EXISTS "source";`,
    );
    await queryRunner.query(
      `ALTER TABLE "positions" DROP COLUMN IF EXISTS "last_synced_at";`,
    );
    await queryRunner.query(
      `ALTER TABLE "positions" DROP COLUMN IF EXISTS "employee_count";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "departments";`);
  }
}
