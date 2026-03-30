import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentTables1743078000000 implements MigrationInterface {
  name = 'AddContentTables1743078000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "levels" (
        "id"          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "title"       text NOT NULL,
        "order_index" int NOT NULL DEFAULT 0,
        "is_active"   boolean NOT NULL DEFAULT true,
        "created_by"  uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "theories" (
        "id"          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "level_id"    uuid NOT NULL REFERENCES "levels"("id") ON DELETE CASCADE,
        "title"       text NOT NULL,
        "order_index" int NOT NULL DEFAULT 0,
        "content"     text NOT NULL DEFAULT '',
        "created_by"  uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "questions" (
        "id"          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "level_id"    uuid NOT NULL REFERENCES "levels"("id") ON DELETE CASCADE,
        "theory_id"   uuid NOT NULL REFERENCES "theories"("id") ON DELETE CASCADE,
        "prompt"      text NOT NULL,
        "order_index" int NOT NULL DEFAULT 0,
        "created_by"  uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "is_active"   boolean NOT NULL DEFAULT true,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "question_options" (
        "id"           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "question_id"  uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
        "option_text"  text NOT NULL,
        "order_index"  int NOT NULL DEFAULT 0,
        "is_correct"   boolean NOT NULL DEFAULT false,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "updated_at"   timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_progress" (
        "id"                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id"               uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id"       uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "current_level_id"      uuid REFERENCES "levels"("id") ON DELETE SET NULL,
        "hearts_count"          int NOT NULL DEFAULT 5,
        "last_heart_regen_at"   timestamptz,
        "completed_levels_count" int NOT NULL DEFAULT 0,
        "created_at"            timestamptz NOT NULL DEFAULT now(),
        "updated_at"            timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_level_completions" (
        "id"                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id"            uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id"    uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "level_id"           uuid NOT NULL REFERENCES "levels"("id") ON DELETE CASCADE,
        "completion_percent" int NOT NULL DEFAULT 0,
        "completed_at"       timestamptz
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_question_attempts" (
        "id"                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id"            uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id"    uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "question_id"        uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
        "selected_option_id" uuid REFERENCES "question_options"("id") ON DELETE SET NULL,
        "is_correct"         boolean NOT NULL DEFAULT false,
        "answered_at"        timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "certificates" (
        "id"              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id"         uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "level_id"        uuid REFERENCES "levels"("id") ON DELETE SET NULL,
        "file_url"        text,
        "issued_at"       timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_theories_level" ON "theories"("level_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_questions_level" ON "questions"("level_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_questions_theory" ON "questions"("theory_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_qoptions_question" ON "question_options"("question_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_uprog_user" ON "user_progress"("user_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_ulc_user" ON "user_level_completions"("user_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_uqa_user" ON "user_question_attempts"("user_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_cert_user" ON "certificates"("user_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "certificates" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_question_attempts" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_level_completions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_progress" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "question_options" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "questions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "theories" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "levels" CASCADE;`);
  }
}
