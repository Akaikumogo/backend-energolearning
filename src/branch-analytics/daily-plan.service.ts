/**
 * Kunlik plan konstantalari.
 *
 * Eski model (org bo'yicha kuniga 10 ta belgilangan savol — daily_plans
 * jadvali + cron) olib tashlangan. Yangi model: savollar bittalab, xodim
 * lavozimiga mos pool'dan random beriladi (24 soat ichida takrorlanmaydi),
 * plan DAILY_GOAL_CORRECT ta to'g'ri javob bilan bajariladi.
 * `daily_plans` jadvali DB da qoladi, lekin ishlatilmaydi.
 */

/** Eski kontrakt uchun saqlangan (admin summary `dailyPlanTarget`). */
export const MIN_DAILY_PLAN_QUESTIONS = 10;

/** Kunlik plan maqsadi: shu kunda 10 ta TO'G'RI javob (qaysi savol bo'lishidan qat'i nazar). */
export const DAILY_GOAL_CORRECT = 10;
