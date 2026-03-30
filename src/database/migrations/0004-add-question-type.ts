import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuestionType1743080000000 implements MigrationInterface {
  name = 'AddQuestionType1743080000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'SINGLE_CHOICE';`,
    );
    await queryRunner.query(
      `ALTER TABLE "question_options" ADD COLUMN IF NOT EXISTS "match_text" text;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "question_options" DROP COLUMN IF EXISTS "match_text";`,
    );
    await queryRunner.query(
      `ALTER TABLE "questions" DROP COLUMN IF EXISTS "type";`,
    );
  }
}
