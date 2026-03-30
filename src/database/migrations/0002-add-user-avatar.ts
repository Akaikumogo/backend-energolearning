import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAvatar1743076000000 implements MigrationInterface {
  name = 'AddUserAvatar1743076000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_url text NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS avatar_url;
    `);
  }
}
