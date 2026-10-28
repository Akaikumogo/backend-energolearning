import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ball javob qatoridan sanaladi. Savol o‘chganda javob ham o‘chmasin.
 * question_id saqlanadi, savollar jadvaliga bog‘lovchi kalit olib tashlanadi.
 */
export class KeepAttemptXpWhenQuestionDeleted1759600000000
  implements MigrationInterface
{
  name = 'KeepAttemptXpWhenQuestionDeleted1759600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid
           AND a.attnum = ANY (c.conkey)
          WHERE c.conrelid = 'user_question_attempts'::regclass
            AND c.contype = 'f'
            AND a.attname = 'question_id'
        LOOP
          EXECUTE format(
            'ALTER TABLE "user_question_attempts" DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_question_attempts"
      ADD CONSTRAINT "user_question_attempts_question_id_fkey"
      FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;
    `);
  }
}
