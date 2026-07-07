import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLevelPositions1746800000000 implements MigrationInterface {
  name = 'AddLevelPositions1746800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "level_positions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "level_id" uuid NOT NULL REFERENCES "levels"("id") ON DELETE CASCADE,
        "position_id" uuid NOT NULL REFERENCES "positions"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_level_position" UNIQUE ("level_id", "position_id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_level_positions_position"
      ON "level_positions"("position_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_level_positions_level"
      ON "level_positions"("level_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_level_positions_level";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_level_positions_position";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "level_positions";`);
  }
}
