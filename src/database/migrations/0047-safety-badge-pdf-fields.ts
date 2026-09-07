import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Beydj PDF (O‘zMETH 34-116 B-ilova) uchun yetishmagan maydonlar:
 * - commission_chair_name (imtihon komissiyasi raisi)
 * - medical_responsible_name (tibbiy ko‘rik javobgari)
 * - employee_safety_profiles.special_works / special_work_type
 */
export class SafetyBadgePdfFields1749600000000 implements MigrationInterface {
  name = 'SafetyBadgePdfFields1749600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_safety_records"
      ADD COLUMN IF NOT EXISTS "commission_chair_name" TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_safety_records"
      ADD COLUMN IF NOT EXISTS "medical_responsible_name" TEXT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_safety_profiles" (
        "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "special_works" TEXT NOT NULL DEFAULT 'Йўқ',
        "special_work_type" TEXT NOT NULL DEFAULT 'Йўқ',
        "updated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_safety_profiles"`);
    await queryRunner.query(`
      ALTER TABLE "employee_safety_records"
      DROP COLUMN IF EXISTS "medical_responsible_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_safety_records"
      DROP COLUMN IF EXISTS "commission_chair_name"
    `);
  }
}
