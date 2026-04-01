import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModeratorPermissionsAndViolations1743600000000
  implements MigrationInterface
{
  name = 'AddModeratorPermissionsAndViolations1743600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moderator_permissions" (
        "id"                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "moderator_user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "permissions"       jsonb NOT NULL,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moderator_violations" (
        "id"                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "moderator_user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id"      uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "action_key"           text NOT NULL,
        "method"               text NOT NULL,
        "path"                 text NOT NULL,
        "request_body_preview" text,
        "ip"                   text,
        "user_agent"           text,
        "created_at"           timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_modperm_user" ON "moderator_permissions"("moderator_user_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_modvio_user" ON "moderator_violations"("moderator_user_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_modvio_created" ON "moderator_violations"("created_at");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "moderator_violations" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "moderator_permissions" CASCADE;`);
  }
}

