import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Xodimning bilim sinovi guvohnomasi" uchun mavjud `certificates` jadvalini
 * kengaytiradi: takrorlanmas raqam, berilgan paytdagi F.I.Sh/lavozim/filial
 * nusxasi, imtihon urinishiga bog'lanish va amal muddati.
 *
 * Ism va lavozim nusxa qilib saqlanadi — xodim keyin boshqa lavozimga o'tsa,
 * ilgari berilgan guvohnomadagi yozuv o'zgarmasligi kerak.
 */
export class AddEmployeeCertificates1748200000000 implements MigrationInterface {
  name = 'AddEmployeeCertificates1748200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "certificate_number" TEXT NULL
    `);
    await queryRunner.query(`
      UPDATE "certificates"
      SET "certificate_number" = 'LEGACY-' || "id"::text
      WHERE "certificate_number" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ALTER COLUMN "certificate_number" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_certificates_number"
      ON "certificates" ("certificate_number")
    `);

    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "full_name" TEXT NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "last_name" TEXT NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "first_name" TEXT NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "middle_name" TEXT NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "position_title" TEXT NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "branch_name" TEXT NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "personnel_number" TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "exam_attempt_id" UUID NULL
        REFERENCES "exam_attempts"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "issued_by_user_id" UUID NULL
        REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "valid_until" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD COLUMN IF NOT EXISTS "revoke_reason" TEXT NULL
    `);

    // Bitta imtihon urinishi uchun faqat bitta guvohnoma.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_certificates_exam_attempt"
      ON "certificates" ("exam_attempt_id")
      WHERE "exam_attempt_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_certificates_user_issued"
      ON "certificates" ("user_id", "issued_at" DESC)
    `);

    /**
     * Raqam ketma-ketligi filial prefiksi bo'yicha alohida yuritiladi.
     * INSERT ... ON CONFLICT DO UPDATE atomar — bir vaqtda ikki moderator
     * guvohnoma bersa ham raqam takrorlanmaydi.
     */
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "certificate_number_counters" (
        "prefix" TEXT PRIMARY KEY,
        "last_number" INTEGER NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "certificate_number_counters"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_certificates_user_issued"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_certificates_exam_attempt"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_certificates_number"`);

    for (const column of [
      'revoke_reason',
      'revoked_at',
      'valid_until',
      'issued_by_user_id',
      'exam_attempt_id',
      'personnel_number',
      'branch_name',
      'position_title',
      'middle_name',
      'first_name',
      'last_name',
      'full_name',
      'certificate_number',
    ]) {
      await queryRunner.query(`
        ALTER TABLE "certificates" DROP COLUMN IF EXISTS "${column}"
      `);
    }
  }
}
