import { MigrationInterface, QueryRunner } from 'typeorm';

export class TheoryRole1744300000000 implements MigrationInterface {
  name = 'TheoryRole1744300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "theories"
      ADD COLUMN IF NOT EXISTS "theory_role" text NULL;
    `);
    await queryRunner.query(`
      UPDATE "theories" SET "theory_role" = 'nazariya'
      WHERE "parent_theory_id" IS NOT NULL AND "title" LIKE '% · Nazariya';
    `);
    await queryRunner.query(`
      UPDATE "theories" SET "theory_role" = 'lesson'
      WHERE "parent_theory_id" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "theories" DROP COLUMN IF EXISTS "theory_role";
    `);
  }
}
