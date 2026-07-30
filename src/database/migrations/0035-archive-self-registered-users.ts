import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * O‘zi registratsiya qilgan (energo_id yo‘q) USER xodimlarni arxivlaydi:
 * - terminated_employees ga yozadi
 * - report_active = false (hisobot/KPI dan chiqaradi)
 * - login_blocked = true, password_hash = null
 */
export class ArchiveSelfRegisteredUsers1748100000000
  implements MigrationInterface
{
  name = 'ArchiveSelfRegisteredUsers1748100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "terminated_employees" (
        "user_id",
        "energo_id",
        "personnel_number",
        "login",
        "first_name",
        "last_name",
        "organization_name",
        "division",
        "post",
        "snapshot",
        "terminated_at"
      )
      SELECT
        u."id",
        NULL,
        ne."personnel_number",
        u."email",
        COALESCE(u."first_name", ''),
        COALESCE(u."last_name", ''),
        COALESCE(ne."organization_name", o."name"),
        COALESCE(ne."division", ''),
        COALESCE(ne."post", ''),
        jsonb_build_object(
          'reason', 'self-registered',
          'archivedBy', '0035-archive-self-registered-users',
          'user', jsonb_build_object(
            'id', u."id",
            'email', u."email",
            'role', u."role",
            'reportActive', u."report_active",
            'loginBlocked', u."login_blocked"
          )
        ),
        NOW()
      FROM "users" u
      LEFT JOIN LATERAL (
        SELECT e."personnel_number", e."organization_name", e."division", e."post"
        FROM "nes_employees" e
        WHERE e."user_id" = u."id"
        LIMIT 1
      ) ne ON true
      LEFT JOIN LATERAL (
        SELECT org."name"
        FROM "user_organizations" uo
        INNER JOIN "organizations" org ON org."id" = uo."organizationId"
        WHERE uo."userId" = u."id"
        ORDER BY org."name" ASC
        LIMIT 1
      ) o ON true
      WHERE u."role" = 'USER'
        AND u."energo_id" IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "terminated_employees" te
          WHERE te."user_id" = u."id"
            AND te."snapshot"->>'reason' = 'self-registered'
        )
    `);

    await queryRunner.query(`
      INSERT INTO "reporting_activation_history" (
        "scope_type",
        "user_id",
        "is_active",
        "changed_at"
      )
      SELECT
        'employee',
        u."id",
        false,
        NOW()
      FROM "users" u
      WHERE u."role" = 'USER'
        AND u."energo_id" IS NULL
        AND COALESCE(u."report_active", true) = true
    `);

    await queryRunner.query(`
      UPDATE "users" u
      SET
        "report_active" = false,
        "login_blocked" = true,
        "password_hash" = NULL,
        "updated_at" = NOW()
      WHERE u."role" = 'USER'
        AND u."energo_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" u
      SET
        "report_active" = true,
        "login_blocked" = false,
        "updated_at" = NOW()
      WHERE u."role" = 'USER'
        AND u."energo_id" IS NULL
        AND EXISTS (
          SELECT 1
          FROM "terminated_employees" te
          WHERE te."user_id" = u."id"
            AND te."snapshot"->>'reason' = 'self-registered'
            AND te."snapshot"->>'archivedBy' = '0035-archive-self-registered-users'
        )
    `);

    await queryRunner.query(`
      DELETE FROM "reporting_activation_history" h
      WHERE h."scope_type" = 'employee'
        AND h."is_active" = false
        AND h."user_id" IN (
          SELECT te."user_id"
          FROM "terminated_employees" te
          WHERE te."snapshot"->>'reason' = 'self-registered'
            AND te."snapshot"->>'archivedBy' = '0035-archive-self-registered-users'
        )
    `);

    await queryRunner.query(`
      DELETE FROM "terminated_employees" te
      WHERE te."snapshot"->>'reason' = 'self-registered'
        AND te."snapshot"->>'archivedBy' = '0035-archive-self-registered-users'
    `);
  }
}
