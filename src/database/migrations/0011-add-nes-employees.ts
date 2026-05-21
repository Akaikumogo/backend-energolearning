import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNesEmployees1746070000000 implements MigrationInterface {
  name = 'AddNesEmployees1746070000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "nes_employees" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "personnel_number" text NOT NULL UNIQUE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
        "organization_name" text NOT NULL,
        "division" text NOT NULL DEFAULT '',
        "post" text NOT NULL DEFAULT '',
        "full_name" text NOT NULL DEFAULT '',
        "last_name" text NOT NULL DEFAULT '',
        "first_name" text NOT NULL DEFAULT '',
        "middle_name" text NOT NULL DEFAULT '',
        "modified_at" timestamptz NULL,
        "hired_at" timestamptz NULL,
        "login" text NOT NULL,
        "initial_password" text NULL,
        "raw_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "last_synced_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_nes_employees_user_id" ON "nes_employees"("user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_nes_employees_organization_id" ON "nes_employees"("organization_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "nes_employee_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL REFERENCES "nes_employees"("id") ON DELETE CASCADE,
        "personnel_number" text NOT NULL,
        "event" text NOT NULL,
        "changes" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_nes_employee_history_employee_id" ON "nes_employee_history"("employee_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_nes_employee_history_personnel_number" ON "nes_employee_history"("personnel_number");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "nes_employee_position_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL REFERENCES "nes_employees"("id") ON DELETE CASCADE,
        "personnel_number" text NOT NULL,
        "organization_name" text NOT NULL,
        "division" text NOT NULL DEFAULT '',
        "post" text NOT NULL DEFAULT '',
        "effective_at" timestamptz NULL,
        "source_created_at" timestamptz NULL,
        "source_updated_at" timestamptz NULL,
        "raw_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_nes_employee_position_history_employee_id" ON "nes_employee_position_history"("employee_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_nes_employee_position_history_personnel_number" ON "nes_employee_position_history"("personnel_number");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "nes_employee_position_history";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nes_employee_history";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nes_employees";`);
  }
}
