import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSafetyRecordsAndAuthMethod1748300000000
  implements MigrationInterface
{
  name = 'AddSafetyRecordsAndAuthMethod1748300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN IF NOT EXISTS "auth_method" TEXT NOT NULL DEFAULT 'PASSWORD'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "safety_record_types" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" TEXT NOT NULL UNIQUE,
        "title_uz" TEXT NOT NULL,
        "title_ru" TEXT NOT NULL DEFAULT '',
        "title_en" TEXT NOT NULL DEFAULT '',
        "section_slug" TEXT NOT NULL,
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO "safety_record_types"
        ("code", "title_uz", "title_ru", "title_en", "section_slug", "sort_order")
      VALUES
        ('TECHNICAL_OPERATION',
         'Elektr stansiyalari va tarmoqlarining texnik ekspluatatsiyasi',
         'Техническая эксплуатация электростанций и сетей',
         'Technical operation of power stations and networks',
         'technical-operation', 1),
        ('OCCUPATIONAL_SAFETY',
         'Mehnat muhofazasi / texnika xavfsizligi',
         'Охрана труда / техника безопасности',
         'Occupational safety / safety engineering',
         'occupational-safety', 2),
        ('FIRE_SAFETY',
         'Yong''in xavfsizligi',
         'Пожарная безопасность',
         'Fire safety',
         'fire-safety', 3),
        ('INDUSTRIAL_SAFETY',
         'Sanoat xavfsizligi / temir yo''l',
         'Промышленная безопасность / ЖД',
         'Industrial safety / railway',
         'industrial-safety', 4),
        ('MEDICAL_EXAM',
         'Tibbiy ko''rik',
         'Медицинский осмотр',
         'Medical examination',
         'medical-exam', 5)
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_safety_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
        "record_type_id" uuid NOT NULL REFERENCES "safety_record_types"("id") ON DELETE RESTRICT,
        "exam_date" DATE NULL,
        "exam_reason" TEXT NULL,
        "grade" TEXT NULL,
        "qualification_group" TEXT NULL,
        "next_exam_date" DATE NULL,
        "rule_name" TEXT NULL,
        "commission_decision" TEXT NULL,
        "protocol_number" TEXT NULL,
        "protocol_date" DATE NULL,
        "doctor_conclusion" TEXT NULL,
        "is_latest" BOOLEAN NOT NULL DEFAULT true,
        "approval_status" TEXT NOT NULL DEFAULT 'PENDING',
        "created_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "approved_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "approved_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_safety_records_user_type"
      ON "employee_safety_records" ("user_id", "record_type_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_safety_records_org"
      ON "employee_safety_records" ("organization_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_safety_records_latest"
      ON "employee_safety_records" ("user_id", "record_type_id", "is_latest")
      WHERE "is_latest" = true
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_safety_record_changes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "record_id" uuid NOT NULL REFERENCES "employee_safety_records"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
        "record_type_code" TEXT NOT NULL,
        "section_slug" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "old_data" jsonb NULL,
        "new_data" jsonb NULL,
        "changed_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "changed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "approval_status" TEXT NOT NULL DEFAULT 'PENDING',
        "reviewed_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "reviewed_at" TIMESTAMPTZ NULL,
        "review_note" TEXT NULL,
        "notification_id" uuid NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_safety_changes_pending_org"
      ON "employee_safety_record_changes" ("organization_id", "approval_status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_safety_changes_record"
      ON "employee_safety_record_changes" ("record_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_safety_record_changes"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_safety_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "safety_record_types"`);
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "auth_method"
    `);
  }
}
