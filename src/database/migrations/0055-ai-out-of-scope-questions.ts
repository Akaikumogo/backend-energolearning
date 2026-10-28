import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiOutOfScopeQuestions1759700000000 implements MigrationInterface {
  name = 'AiOutOfScopeQuestions1759700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_out_of_scope_questions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "user_name" text NOT NULL,
        "user_role" text NOT NULL,
        "audience" text NOT NULL,
        "scope_label" text NOT NULL,
        "question" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_ai_out_of_scope_created"
      ON "ai_out_of_scope_questions" ("created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "ai_out_of_scope_questions"`,
    );
  }
}
