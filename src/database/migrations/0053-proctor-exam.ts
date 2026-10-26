import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProctorExam1759500000000 implements MigrationInterface {
  name = 'ProctorExam1759500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_questions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "prompt" text NOT NULL,
        "image_url" text NULL,
        "type" text NOT NULL,
        "subject" text NOT NULL,
        "category" text NOT NULL,
        "difficulty" text NOT NULL DEFAULT 'MEDIUM',
        "is_active" boolean NOT NULL DEFAULT true,
        "explanation" text NULL,
        "created_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_question_options" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "question_id" uuid NOT NULL REFERENCES "proctor_questions"("id") ON DELETE CASCADE,
        "text" text NOT NULL,
        "is_correct" boolean NOT NULL DEFAULT false,
        "sort_order" integer NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_standards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" text NOT NULL,
        "code" text NOT NULL UNIQUE,
        "description" text NOT NULL DEFAULT '',
        "subject" text NOT NULL DEFAULT '',
        "duration_ms" integer NOT NULL,
        "pass_percent" integer NOT NULL,
        "randomize_questions" boolean NOT NULL DEFAULT true,
        "randomize_options" boolean NOT NULL DEFAULT true,
        "max_recording_mb" integer NOT NULL DEFAULT 500,
        "total_questions" integer NOT NULL DEFAULT 1,
        "category_plan" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "next_exam_rule" jsonb NULL,
        "grade_thresholds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "retry_max_attempts" integer NOT NULL DEFAULT 1,
        "recording_required" boolean NOT NULL DEFAULT true,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_standard_questions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "standard_id" uuid NOT NULL REFERENCES "proctor_standards"("id") ON DELETE CASCADE,
        "question_id" uuid NOT NULL REFERENCES "proctor_questions"("id") ON DELETE CASCADE,
        UNIQUE ("standard_id", "question_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_policies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "record_type_code" text NOT NULL UNIQUE,
        "requires_exam_room" boolean NOT NULL DEFAULT true,
        "cutoff_date" date NOT NULL DEFAULT DATE '2026-12-01',
        "updated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO "proctor_policies" ("record_type_code", "requires_exam_room", "cutoff_date")
      SELECT code, code <> 'MEDICAL_EXAM', DATE '2026-12-01'
      FROM "safety_record_types"
      ON CONFLICT ("record_type_code") DO NOTHING
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_rooms" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
        "safety_record_id" uuid NOT NULL REFERENCES "employee_safety_records"("id") ON DELETE RESTRICT,
        "record_type_code" text NOT NULL,
        "standard_id" uuid NOT NULL REFERENCES "proctor_standards"("id") ON DELETE RESTRICT,
        "snapshot" jsonb NOT NULL,
        "scheduled_at" timestamptz NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "status" text NOT NULL DEFAULT 'DRAFT',
        "attempt_number" integer NOT NULL DEFAULT 0,
        "access_token" text NOT NULL UNIQUE,
        "access_method" text NOT NULL DEFAULT 'LINK',
        "recording_required" boolean NOT NULL DEFAULT true,
        "max_recording_mb" integer NOT NULL DEFAULT 500,
        "notification_id" uuid NULL,
        "notification_status" text NOT NULL DEFAULT 'PENDING',
        "created_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "last_seen_at" timestamptz NULL,
        "connection_status" text NOT NULL DEFAULT 'OFFLINE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_proctor_rooms_user_status"
      ON "proctor_rooms" ("user_id", "status")
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_room_moderators" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL REFERENCES "proctor_rooms"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        UNIQUE ("room_id", "user_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_attempts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL REFERENCES "proctor_rooms"("id") ON DELETE CASCADE,
        "attempt_number" integer NOT NULL,
        "status" text NOT NULL DEFAULT 'IN_PROGRESS',
        "remaining_ms" integer NOT NULL,
        "duration_ms" integer NOT NULL,
        "question_index" integer NOT NULL DEFAULT 0,
        "last_tick_at" timestamptz NULL,
        "started_at" timestamptz NULL,
        "submitted_at" timestamptz NULL,
        "interrupted_at" timestamptz NULL,
        "superseded_at" timestamptz NULL,
        "seed" text NOT NULL,
        "media_status" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_proctor_attempts_room" ON "proctor_attempts" ("room_id")
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_attempt_questions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "attempt_id" uuid NOT NULL REFERENCES "proctor_attempts"("id") ON DELETE CASCADE,
        "question_id" uuid NOT NULL REFERENCES "proctor_questions"("id") ON DELETE RESTRICT,
        "sort_order" integer NOT NULL,
        "type" text NOT NULL,
        "prompt_snapshot" text NOT NULL,
        "image_url" text NULL,
        "options_snapshot" jsonb NOT NULL,
        "option_order" jsonb NOT NULL,
        "explanation" text NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_answers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "attempt_id" uuid NOT NULL REFERENCES "proctor_attempts"("id") ON DELETE CASCADE,
        "attempt_question_id" uuid NOT NULL REFERENCES "proctor_attempt_questions"("id") ON DELETE CASCADE,
        "selected_option_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("attempt_id", "attempt_question_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "attempt_id" uuid NOT NULL REFERENCES "proctor_attempts"("id") ON DELETE CASCADE,
        "room_id" uuid NOT NULL REFERENCES "proctor_rooms"("id") ON DELETE CASCADE,
        "client_event_id" text NULL,
        "type" text NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "occurred_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_proctor_event_client"
      ON "proctor_events" ("attempt_id", "client_event_id")
      WHERE "client_event_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_proctor_events_attempt_time"
      ON "proctor_events" ("attempt_id", "occurred_at")
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_results" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "attempt_id" uuid NOT NULL UNIQUE REFERENCES "proctor_attempts"("id") ON DELETE CASCADE,
        "room_id" uuid NOT NULL REFERENCES "proctor_rooms"("id") ON DELETE CASCADE,
        "safety_record_id" uuid NOT NULL,
        "correct_count" integer NOT NULL,
        "question_count" integer NOT NULL,
        "score_percent" integer NOT NULL,
        "grade_label" text NOT NULL,
        "passed" boolean NOT NULL,
        "next_exam_date" date NULL,
        "requires_review" boolean NOT NULL DEFAULT false,
        "finalized_at" timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_recordings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "attempt_id" uuid NOT NULL REFERENCES "proctor_attempts"("id") ON DELETE CASCADE,
        "kind" text NOT NULL,
        "sequence" integer NOT NULL,
        "storage_path" text NOT NULL,
        "checksum" text NULL,
        "size_bytes" integer NOT NULL DEFAULT 0,
        "duration_ms" integer NOT NULL DEFAULT 0,
        "upload_state" text NOT NULL DEFAULT 'PENDING',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_upload_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "recording_id" uuid NOT NULL REFERENCES "proctor_recordings"("id") ON DELETE CASCADE,
        "attempt_id" uuid NOT NULL,
        "state" text NOT NULL DEFAULT 'PENDING',
        "retries" integer NOT NULL DEFAULT 0,
        "last_error" text NULL,
        "checkpoint_bytes" integer NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proctor_violations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL REFERENCES "proctor_rooms"("id") ON DELETE CASCADE,
        "attempt_id" uuid NULL,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "code" text NOT NULL,
        "process_name" text NOT NULL DEFAULT '',
        "window_title" text NULL,
        "occurred_at" timestamptz NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_proctor_violations_room"
      ON "proctor_violations" ("room_id", "occurred_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'proctor_violations',
      'proctor_upload_jobs',
      'proctor_recordings',
      'proctor_results',
      'proctor_events',
      'proctor_answers',
      'proctor_attempt_questions',
      'proctor_attempts',
      'proctor_room_moderators',
      'proctor_rooms',
      'proctor_policies',
      'proctor_standard_questions',
      'proctor_standards',
      'proctor_question_options',
      'proctor_questions',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
