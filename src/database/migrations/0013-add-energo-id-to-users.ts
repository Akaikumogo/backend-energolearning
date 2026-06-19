import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnergoIdToUsers1746090000000 implements MigrationInterface {
  name = 'AddEnergoIdToUsers1746090000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "energo_id" uuid NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_energo_id"
      ON "users"("energo_id")
      WHERE "energo_id" IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_energo_id";`);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "energo_id";
    `);
  }
}
