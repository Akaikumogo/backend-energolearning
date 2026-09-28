import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kunlik plan kalendari:
 * - plan_calendar_days: hamma uchun kun sozlamasi (bayram / dam olish / maxsus norma);
 * - user_plan_day_overrides: xodimning aniq kun uchun normasi;
 * - users.daily_plan_goal: xodimning doimiy shaxsiy normasi;
 * - effective_daily_goal(user, day): hisobot SQL'lari uchun yagona qoida
 *   (TS'dagi resolveDailyGoal bilan bir xil bo'lishi shart).
 */
export class PlanCalendar1759000000000 implements MigrationInterface {
  name = 'PlanCalendar1759000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "daily_plan_goal" INT NULL
        CHECK ("daily_plan_goal" IS NULL OR ("daily_plan_goal" >= 0 AND "daily_plan_goal" <= 200))
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plan_calendar_days" (
        "day" DATE PRIMARY KEY,
        "goal" INT NULL CHECK ("goal" IS NULL OR ("goal" >= 0 AND "goal" <= 200)),
        "is_day_off" BOOLEAN NULL,
        "holiday_name" TEXT NULL,
        "source" VARCHAR(16) NOT NULL DEFAULT 'ADMIN',
        "note" TEXT NULL,
        "updated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_plan_day_overrides" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "day" DATE NOT NULL,
        "goal" INT NOT NULL CHECK ("goal" >= 0 AND "goal" <= 200),
        "note" TEXT NULL,
        "updated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_user_plan_day" UNIQUE ("user_id", "day")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_plan_day_overrides_day"
      ON "user_plan_day_overrides" ("day")
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION effective_daily_goal(p_user uuid, p_day date)
      RETURNS int
      LANGUAGE sql
      STABLE
      AS $$
        SELECT CASE
          WHEN p_day < DATE '2026-09-28' THEN 10
          ELSE COALESCE(
            (SELECT o.goal FROM user_plan_day_overrides o
              WHERE o.user_id = p_user AND o.day = p_day),
            (SELECT c.goal FROM plan_calendar_days c WHERE c.day = p_day),
            CASE WHEN COALESCE(
              (SELECT c.is_day_off FROM plan_calendar_days c WHERE c.day = p_day),
              EXTRACT(ISODOW FROM p_day) IN (6, 7)
            ) THEN 0 END,
            (SELECT u.daily_plan_goal FROM users u WHERE u.id = p_user),
            10
          )
        END
      $$
    `);

    // O'zbekiston: Mehnat kodeksi 208-modda + PF-257 (2026). 5 kunlik ish haftasi bo'yicha.
    const holidays: Array<[string, boolean, string]> = [
      ['2026-01-01', true, 'Yangi yil'],
      ['2026-01-02', true, 'Qo‘shimcha dam olish kuni (PF-257)'],
      ['2026-03-08', true, 'Xotin-qizlar kuni'],
      ['2026-03-09', true, '8-mart o‘rniga dam olish kuni'],
      ['2026-03-20', true, 'Ramazon hayiti'],
      ['2026-03-21', true, 'Navro‘z bayrami'],
      ['2026-03-23', true, 'Navro‘z o‘rniga dam olish kuni'],
      ['2026-05-09', true, 'Xotira va qadrlash kuni'],
      ['2026-05-11', true, '9-may o‘rniga dam olish kuni'],
      ['2026-05-27', true, 'Qurbon hayiti'],
      ['2026-05-28', true, 'Qo‘shimcha dam olish kuni (PF-257)'],
      ['2026-05-29', true, 'Qo‘shimcha dam olish kuni (PF-257)'],
      ['2026-08-31', true, 'Qo‘shimcha dam olish kuni (PF-257)'],
      ['2026-09-01', true, 'Mustaqillik kuni'],
      ['2026-10-01', true, 'O‘qituvchi va murabbiylar kuni'],
      ['2026-12-08', true, 'Konstitutsiya kuni'],
      ['2026-12-12', false, 'Ish kuni (dam olish 31-dekabrga ko‘chirilgan)'],
      ['2026-12-31', true, 'Dam olish kuni (12-dekabrdan ko‘chirilgan)'],
      ['2027-01-01', true, 'Yangi yil'],
      ['2027-03-08', true, 'Xotin-qizlar kuni'],
      ['2027-03-10', true, 'Ramazon hayiti (taxminiy sana)'],
      ['2027-03-21', true, 'Navro‘z bayrami'],
      ['2027-05-09', true, 'Xotira va qadrlash kuni'],
      ['2027-05-17', true, 'Qurbon hayiti (taxminiy sana)'],
      ['2027-09-01', true, 'Mustaqillik kuni'],
      ['2027-10-01', true, 'O‘qituvchi va murabbiylar kuni'],
      ['2027-12-08', true, 'Konstitutsiya kuni'],
    ];
    for (const [day, isDayOff, name] of holidays) {
      await queryRunner.query(
        `INSERT INTO "plan_calendar_days" ("day", "is_day_off", "holiday_name", "source")
         VALUES ($1, $2, $3, 'HOLIDAY')
         ON CONFLICT ("day") DO NOTHING`,
        [day, isDayOff, name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS effective_daily_goal(uuid, date)`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_plan_day_overrides"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_calendar_days"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "daily_plan_goal"`,
    );
  }
}
