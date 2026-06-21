import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAudioBookAudioUrl1746400000000 implements MigrationInterface {
  name = 'AddAudioBookAudioUrl1746400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audio_books"
      ADD COLUMN IF NOT EXISTS "audio_url" text NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audio_books"
      DROP COLUMN IF EXISTS "audio_url";
    `);
  }
}
