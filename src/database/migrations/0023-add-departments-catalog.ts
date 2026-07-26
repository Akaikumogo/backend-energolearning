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
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "departments";`);
  }
}
