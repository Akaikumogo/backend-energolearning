import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 0011 migration personnel_number ni global UNIQUE qilgan — bir xodim filial
 * o'zgarganda yoki sync qayta ishlaganda duplicate key berardi.
 * Entity: (personnel_number + organization_name) composite unique.
 */
export class FixNesEmployeeUnique1746310000000 implements MigrationInterface {
  name = 'FixNesEmployeeUnique1746310000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "nes_employees"
      DROP CONSTRAINT IF EXISTS "nes_employees_personnel_number_key";
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_nes_employee_number_org"
        ON "nes_employees" ("personnel_number", "organization_name");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_nes_employee_number_org";
    `);
    await queryRunner.query(`
      ALTER TABLE "nes_employees"
      ADD CONSTRAINT "nes_employees_personnel_number_key" UNIQUE ("personnel_number");
    `);
  }
}
