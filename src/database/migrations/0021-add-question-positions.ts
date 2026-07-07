import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * O'quv savollarini lavozimga bog'lash (kunlik plan uchun savol pool'i
 * xodim lavozimiga qarab filtrlanadi) + 24 soatlik "takrorlanmaslik"
 * tekshiruvini tezlashtiruvchi indeks.
 */
export class AddQuestionPositions1746700000000 implements MigrationInterface {
  name = 'AddQuestionPositions1746700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "question_positions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
        "position_id" uuid NOT NULL REFERENCES "positions"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_question_position" UNIQUE ("question_id", "position_id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_question_positions_position"
      ON "question_positions"("position_id");
    `);

    // Kunlik plan next-question: "shu user shu savolni oxirgi 24 soatda
    // ishlaganmi" NOT EXISTS tekshiruvi uchun.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_uqa_user_question_answered"
      ON "user_question_attempts"("user_id", "question_id", "answered_at");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_uqa_user_question_answered";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_question_positions_position";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "question_positions";`);
  }
}
