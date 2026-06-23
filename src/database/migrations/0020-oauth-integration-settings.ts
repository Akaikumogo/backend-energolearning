import { MigrationInterface, QueryRunner } from 'typeorm';

export class OauthIntegrationSettings1746600000000 implements MigrationInterface {
  name = 'OauthIntegrationSettings1746600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "oauth_integration_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "source" text NOT NULL UNIQUE DEFAULT 'energo-id',
        "mobile_redirect_uri" text NOT NULL DEFAULT 'uz.elektroxavfsizlik.app://oauth/callback',
        "web_redirect_uri" text NOT NULL DEFAULT 'http://localhost:5173/oauth/callback',
        "callback_path" text NOT NULL DEFAULT '/oauth/callback',
        "oauth_scopes" text NOT NULL DEFAULT 'employee.auth profile.read',
        "updated_by" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      INSERT INTO "oauth_integration_settings" (
        "source",
        "mobile_redirect_uri",
        "web_redirect_uri",
        "callback_path",
        "oauth_scopes"
      )
      VALUES (
        'energo-id',
        'uz.elektroxavfsizlik.app://oauth/callback',
        'http://localhost:5173/oauth/callback',
        '/oauth/callback',
        'employee.auth profile.read'
      )
      ON CONFLICT ("source") DO NOTHING;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "oauth_integration_settings";`);
  }
}
