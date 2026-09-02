import { MigrationInterface, QueryRunner } from 'typeorm';

export class CatalogName1c1749500000000 implements MigrationInterface {
  name = 'CatalogName1c1749500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "departments"
      ADD COLUMN IF NOT EXISTS "name_1c" text
    `);
    await queryRunner.query(`
      UPDATE "departments"
      SET "name_1c" = "name"
      WHERE "name_1c" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "positions"
      ADD COLUMN IF NOT EXISTS "title_1c" text
    `);
    await queryRunner.query(`
      UPDATE "positions"
      SET "title_1c" = "title"
      WHERE "title_1c" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "departments" DROP COLUMN IF EXISTS "name_1c"
    `);
    await queryRunner.query(`
      ALTER TABLE "positions" DROP COLUMN IF EXISTS "title_1c"
    `);
  }
}
