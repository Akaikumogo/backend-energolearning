import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeSyncAndTerminationArchive1746100000000 implements MigrationInterface {
  name = 'AddEmployeeSyncAndTerminationArchive1746100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_sync_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "source" text NOT NULL UNIQUE DEFAULT 'energo-id',
        "daily_sync_time" text NOT NULL DEFAULT '23:45',
        "timezone" text NOT NULL DEFAULT 'Asia/Tashkent',
        "last_run_date" date NULL,
        "last_run_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "terminated_employees" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "energo_id" uuid NULL,
        "personnel_number" text NULL,
        "login" text NOT NULL,
        "first_name" text NOT NULL DEFAULT '',
        "last_name" text NOT NULL DEFAULT '',
        "organization_name" text NULL,
        "division" text NOT NULL DEFAULT '',
        "post" text NOT NULL DEFAULT '',
        "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "terminated_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_terminated_employees_energo_id"
      ON "terminated_employees"("energo_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_sync_locks" (
        "name" text PRIMARY KEY,
        "locked_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "app_sync_locks";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "terminated_employees";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_sync_settings";`);
  }
}
