import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExamQuestionCatalogs1744000000000 implements MigrationInterface {
  name = 'ExamQuestionCatalogs1744000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exam_question_catalogs" (
        "id"         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "title"      text NOT NULL,
        "section"    text NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      ALTER TABLE "exam_questions"
      ADD COLUMN IF NOT EXISTS "catalog_id" uuid REFERENCES "exam_question_catalogs"("id") ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "exam_questions" DROP COLUMN IF EXISTS "catalog_id";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "exam_question_catalogs";`);
  }
}
