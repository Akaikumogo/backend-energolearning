import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHeartLostFlag1746500000000 implements MigrationInterface {
  name = 'AddHeartLostFlag1746500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_question_attempts"
      ADD COLUMN IF NOT EXISTS "heart_lost" boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_uqa_heart_lost_answered"
      ON "user_question_attempts"("heart_lost", "answered_at")
      WHERE "heart_lost" = true;
    `);

    // Mavjud noto'g'ri javoblarni (har biri 1 yurak) deb belgilaymiz — taxminiy backfill.
    await queryRunner.query(`
      UPDATE "user_question_attempts"
      SET "heart_lost" = true
      WHERE "is_correct" = false AND "heart_lost" = false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_uqa_heart_lost_answered";
    `);
    await queryRunner.query(`
      ALTER TABLE "user_question_attempts"
      DROP COLUMN IF EXISTS "heart_lost";
    `);
  }
}
