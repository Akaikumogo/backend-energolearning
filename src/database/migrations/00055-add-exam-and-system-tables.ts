import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Oldin productionda ko'p jadvallar faqat TypeORM synchronize orqali yaratilgan edi.
 * Fresh DB + migration:run uchun exam va qolgan tizim jadvallari kerak (0006 dan oldin).
 */
export class AddExamAndSystemTables1743950000000 implements MigrationInterface {
  name = 'AddExamAndSystemTables1743950000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "must_change_password" boolean NOT NULL DEFAULT false;
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "avatar_has_face" boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "positions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" text NOT NULL UNIQUE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_positions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "position_id" uuid NOT NULL REFERENCES "positions"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_user_position" UNIQUE ("user_id", "position_id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exams" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" text NOT NULL,
        "description" text NULL,
        "exam_type" text NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "includes_pt" boolean NOT NULL DEFAULT true,
        "includes_tb" boolean NOT NULL DEFAULT true,
        "created_by_org_id" uuid NULL REFERENCES "organizations"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exam_questions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "prompt" text NOT NULL,
        "type" text NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "tags" text[] NULL,
        "section" text NOT NULL DEFAULT 'PT',
        "difficulty" text NOT NULL DEFAULT 'MEDIUM',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exam_question_options" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "question_id" uuid NOT NULL REFERENCES "exam_questions"("id") ON DELETE CASCADE,
        "option_text" text NOT NULL,
        "order_index" int NOT NULL DEFAULT 0,
        "is_correct" boolean NOT NULL DEFAULT false,
        "match_text" text NULL
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exam_question_positions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "question_id" uuid NOT NULL REFERENCES "exam_questions"("id") ON DELETE CASCADE,
        "position_id" uuid NOT NULL REFERENCES "positions"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_exam_question_position" UNIQUE ("question_id", "position_id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exam_assignments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "exam_id" uuid NOT NULL REFERENCES "exams"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "suggested_at" timestamptz NOT NULL,
        "window_start" timestamptz NOT NULL,
        "window_end" timestamptz NOT NULL,
        "scheduled_at" timestamptz NULL,
        "status" text NOT NULL DEFAULT 'PENDING',
        "includes_pt" boolean NOT NULL DEFAULT true,
        "includes_tb" boolean NOT NULL DEFAULT true,
        "qr_token" text NULL UNIQUE,
        "qr_expires_at" timestamptz NULL,
        "extra_reason" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exam_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignment_id" uuid NOT NULL REFERENCES "exam_assignments"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" text NOT NULL DEFAULT 'WAITING_MODERATOR',
        "otp_hash" text NULL,
        "otp_expires_at" timestamptz NULL,
        "tab_switch_count" int NOT NULL DEFAULT 0,
        "rejection_reason" text NULL,
        "approved_by_user_id" uuid NULL,
        "active_section" text NULL,
        "pt_completed" boolean NOT NULL DEFAULT false,
        "tb_completed" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exam_attempts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignment_id" uuid NOT NULL REFERENCES "exam_assignments"("id") ON DELETE CASCADE,
        "session_id" uuid NULL UNIQUE REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
        "started_at" timestamptz NULL,
        "submitted_at" timestamptz NULL,
        "score_percent" int NULL,
        "pt_score_percent" int NULL,
        "tb_score_percent" int NULL,
        "pt_started_at" timestamptz NULL,
        "pt_submitted_at" timestamptz NULL,
        "tb_started_at" timestamptz NULL,
        "tb_submitted_at" timestamptz NULL,
        "oral_result" text NULL,
        "oral_feedback" text NULL,
        "oral_reviewed_by_id" uuid NULL,
        "oral_reviewed_at" timestamptz NULL,
        "next_exam_months" int NULL,
        "finalized_at" timestamptz NULL,
        "payload" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exam_attempt_answers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "attempt_id" uuid NOT NULL REFERENCES "exam_attempts"("id") ON DELETE CASCADE,
        "question_id" uuid NOT NULL REFERENCES "exam_questions"("id") ON DELETE CASCADE,
        "section" text NOT NULL,
        "selected_option_id" uuid NULL REFERENCES "exam_question_options"("id") ON DELETE SET NULL,
        "is_correct" boolean NOT NULL,
        "order_index" int NOT NULL,
        "saved_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor_user_id" uuid NULL,
        "actor_role" text NULL,
        "actor_organization_ids" jsonb NULL,
        "method" text NOT NULL,
        "path" text NOT NULL,
        "status_code" int NOT NULL,
        "error_message" text NULL,
        "request_body_preview" text NULL,
        "ip" text NULL,
        "user_agent" text NULL,
        "duration_ms" int NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" text NOT NULL,
        "body" text NOT NULL,
        "data" jsonb NULL,
        "is_read" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_checks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" text NOT NULL,
        "check_date" date NOT NULL,
        "reason" text NULL,
        "grade" text NULL,
        "next_check_date" date NULL,
        "commission_leader_signature" text NULL,
        "qualification_group" text NULL,
        "rule_name" text NULL,
        "conclusion" text NULL,
        "doctor_conclusion" text NULL,
        "responsible_signature" text NULL,
        "created_by_user_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_certificates" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
        "position_title" text NOT NULL,
        "certificate_number" text NOT NULL,
        "presented_by_full_name" text NOT NULL,
        "created_by_user_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_employee_certificate_user" UNIQUE ("user_id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_chat_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "scope" text NOT NULL DEFAULT 'mobile',
        "title" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ix_ai_chat_sessions_user_scope"
        ON "ai_chat_sessions" ("user_id", "scope");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_chat_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "session_id" uuid NOT NULL REFERENCES "ai_chat_sessions"("id") ON DELETE CASCADE,
        "role" text NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_ai_chat_messages_session_created"
        ON "ai_chat_messages" ("session_id", "created_at");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_employee_checks_user"
        ON "employee_checks" ("user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_employee_checks_user_type"
        ON "employee_checks" ("user_id", "type");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_chat_messages" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_chat_sessions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_certificates" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_checks" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_audit_logs" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "exam_attempt_answers" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "exam_attempts" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "exam_sessions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "exam_assignments" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "exam_question_positions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "exam_question_options" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "exam_questions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "exams" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_positions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "positions" CASCADE;`);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_has_face";
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "must_change_password";
    `);
  }
}
