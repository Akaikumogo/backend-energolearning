import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kalendar baza yaratilgan kundan (2026-06-21) qo'llanadi: o'tgan ish kunlari 10,
 * shanba/yakshanba va bayramlar 0. TS'dagi PLAN_CALENDAR_START bilan bir xil bo'lishi shart.
 */
export class PlanCalendarFromDbStart1759300000000 implements MigrationInterface {
  name = 'PlanCalendarFromDbStart1759300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(this.fn('2026-06-21'));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(this.fn('2026-09-28'));
  }

  private fn(start: string): string {
    return `
      CREATE OR REPLACE FUNCTION effective_daily_goal(p_user uuid, p_day date)
      RETURNS int
      LANGUAGE sql
      STABLE
      AS $$
        SELECT CASE
          WHEN p_day < DATE '${start}' THEN 10
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
    `;
  }
}
