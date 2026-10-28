import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiChatManySessions1759800000000 implements MigrationInterface {
  name = 'AiChatManySessions1759800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_ai_chat_sessions_user_scope"`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_ai_chat_sessions_user_updated"
      ON "ai_chat_sessions" ("user_id", "updated_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_ai_chat_sessions_user_updated"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ix_ai_chat_sessions_user_scope"
      ON "ai_chat_sessions" ("user_id", "scope")
    `);
  }
}
