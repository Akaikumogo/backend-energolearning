import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Loginida `@` bo‘lgan (SUPERADMIN dan tashqari) akkauntlarni bloklash:
 * - login_blocked = true
 * - password_hash = null
 * - refresh tokenlar o‘chiriladi
 */
export class BlockEmailLikeLogins1747200000000 implements MigrationInterface {
  name = 'BlockEmailLikeLogins1747200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "login_blocked" boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_login_blocked"
      ON "users" ("login_blocked")
      WHERE "login_blocked" = true;
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET
        "login_blocked" = true,
        "password_hash" = NULL,
        "initial_password" = NULL,
        "must_change_password" = false
      WHERE "role" <> 'SUPERADMIN'
        AND "email" LIKE '%@%';
    `);

    // Ba'zi DB larda camelCase "userId", ba'zilarida "user_id"
    const cols: Array<{ column_name: string }> = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'refresh_tokens'
        AND column_name IN ('user_id', 'userId');
    `);
    const userCol = cols.some((c) => c.column_name === 'user_id')
      ? 'user_id'
      : cols.some((c) => c.column_name === 'userId')
        ? '"userId"'
        : null;

    if (userCol) {
      await queryRunner.query(`
        DELETE FROM "refresh_tokens" rt
        USING "users" u
        WHERE rt.${userCol} = u.id
          AND u.login_blocked = true;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" SET "login_blocked" = false WHERE "login_blocked" = true;
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_login_blocked";`);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "login_blocked";
    `);
  }
}
