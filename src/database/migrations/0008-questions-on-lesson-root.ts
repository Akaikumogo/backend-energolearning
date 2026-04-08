import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuestionsOnLessonRoot1744200000000 implements MigrationInterface {
  name = 'QuestionsOnLessonRoot1744200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE questions q
      SET theory_id = t.parent_theory_id
      FROM theories t
      WHERE q.theory_id = t.id
        AND t.parent_theory_id IS NOT NULL
        AND t.title LIKE '% · Mashq';
    `);
    await queryRunner.query(`
      DELETE FROM theories t
      WHERE t.parent_theory_id IS NOT NULL
        AND t.title LIKE '% · Mashq';
    `);
  }

  public async down(): Promise<void> {
    // ma'lumotni qayta tiklash uchun zaxira yo'q
  }
}
