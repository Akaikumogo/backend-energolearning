import { MigrationInterface, QueryRunner } from 'typeorm';

export class TheorySlidesJsonb1744108800000 implements MigrationInterface {
  name = 'TheorySlidesJsonb1744108800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "theories"
      ADD COLUMN IF NOT EXISTS "slides" jsonb NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "theories" DROP COLUMN IF EXISTS "slides";
    `);
  }
}
