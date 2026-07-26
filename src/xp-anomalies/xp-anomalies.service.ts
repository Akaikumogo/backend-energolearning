import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { QuestionType } from '../common/enums/question-type.enum';
import { DAILY_GOAL_CORRECT } from '../branch-analytics/daily-plan.service';

export type XpAnomalyUserRow = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Hozirgi reyting XP (counts_for_xp) */
  storedXp: number;
  /** Plan bo‘yicha bo‘lishi kerak bo‘lgan XP */
  expectedXp: number;
  /** Plandan tashqari to‘g‘ri urinishlar (ball bermasligi kerak) */
  offPlanCorrect: number;
  /** Plan bo‘yicha hisoblangan to‘g‘ri (kunlik 10 gacha, kunlar yig‘indisi) */
  planCorrect: number;
  /** Hozir counts_for_xp=true bo‘lgan to‘g‘ri */
  storedPlanCorrect: number;
  /** Plandan tashqariga berilib ketgan ball (ayirilishi kerak) */
  offPlanXpInflated: number;
  mismatchCount: number;
};

export type XpAnomalySample = {
  attemptId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  questionId: string;
  prompt: string;
  questionType: string;
  selectedOptionId: string | null;
  storedCorrect: boolean;
  expectedCorrect: boolean | null;
  countsForXp: boolean;
  expectedCountsForXp: boolean;
  attemptSource: string | null;
  heartLost: boolean;
  reason: string;
  answeredAt: string;
};

export type XpAnomalyAudit = {
  scannedAttempts: number;
  gradeableAttempts: number;
  mismatchAttempts: number;
  heartLostOnlyMismatches: number;
  orphanAttempts: number;
  matchingSkipped: number;
  /** counts_for_xp noto‘g‘ri belgilangan urinishlar */
  planFlagMismatches: number;
  affectedUsers: number;
  totalStoredXp: number;
  totalExpectedXp: number;
  xpDelta: number;
  totalOffPlanCorrect: number;
  totalPlanCorrect: number;
  totalOffPlanXpInflated: number;
  dailyGoalCorrect: number;
  users: XpAnomalyUserRow[];
  samples: XpAnomalySample[];
};

export type XpAnomalyReconcileResult = {
  fixedGradeAttempts: number;
  fixedHeartLostAttempts: number;
  fixedPlanFlags: number;
  affectedUsers: number;
  beforeStoredXp: number;
  afterExpectedXp: number;
  xpDelta: number;
  offPlanXpRemoved: number;
  users: XpAnomalyUserRow[];
};

@Injectable()
export class XpAnomaliesService {
  constructor(
    @InjectRepository(UserQuestionAttempt)
    private readonly attemptRepo: Repository<UserQuestionAttempt>,
  ) {}

  /** Har user/kun: birinchi 10 ta noyob to‘g‘ri (LESSON emas) → plan XP. */
  private expectedPlanCte(goal = DAILY_GOAL_CORRECT) {
    return `
      first_correct AS (
        SELECT DISTINCT ON (
          a.user_id,
          ((a.answered_at AT TIME ZONE 'Asia/Tashkent')::date),
          a.question_id
        )
          a.id,
          a.user_id,
          ((a.answered_at AT TIME ZONE 'Asia/Tashkent')::date) AS day,
          a.answered_at
        FROM user_question_attempts a
        WHERE a.is_correct = true
          AND (a.attempt_source IS NULL OR a.attempt_source = 'DAILY_PLAN')
        ORDER BY
          a.user_id,
          ((a.answered_at AT TIME ZONE 'Asia/Tashkent')::date),
          a.question_id,
          a.answered_at ASC,
          a.id ASC
      ),
      expected_xp_ids AS (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY user_id, day
              ORDER BY answered_at ASC, id ASC
            ) AS rn
          FROM first_correct
        ) x
        WHERE rn <= ${goal}
      )
    `;
  }

  async audit(limitSamples = 50): Promise<XpAnomalyAudit> {
    const sampleLimit = Math.min(Math.max(limitSamples, 1), 200);
    const planCte = this.expectedPlanCte();

    const totals = await this.attemptRepo.query(
      `
      WITH ${planCte}
      SELECT
        COUNT(*)::int AS "scannedAttempts",
        COUNT(*) FILTER (WHERE q.type <> $1)::int AS "gradeableAttempts",
        COUNT(*) FILTER (WHERE q.type = $1)::int AS "matchingSkipped",
        COUNT(*) FILTER (
          WHERE q.type <> $1
            AND (
              a.selected_option_id IS NULL
              OR o.id IS NULL
              OR o.question_id IS DISTINCT FROM a.question_id
            )
        )::int AS "orphanAttempts",
        COUNT(*) FILTER (
          WHERE q.type <> $1
            AND o.id IS NOT NULL
            AND o.question_id = a.question_id
            AND a.is_correct IS DISTINCT FROM o.is_correct
        )::int AS "mismatchAttempts",
        COUNT(*) FILTER (
          WHERE a.heart_lost IS DISTINCT FROM (NOT a.is_correct)
        )::int AS "heartLostOnlyMismatches",
        COUNT(*) FILTER (
          WHERE a.counts_for_xp IS DISTINCT FROM (ex.id IS NOT NULL)
        )::int AS "planFlagMismatches",
        COALESCE(SUM(CASE WHEN a.counts_for_xp THEN 10 ELSE 0 END), 0)::int AS "totalStoredXp",
        (SELECT COUNT(*)::int * 10 FROM expected_xp_ids)::int AS "totalExpectedXp",
        COUNT(*) FILTER (
          WHERE a.is_correct = true AND ex.id IS NULL
        )::int AS "totalOffPlanCorrect",
        (SELECT COUNT(*)::int FROM expected_xp_ids)::int AS "totalPlanCorrect"
      FROM user_question_attempts a
      INNER JOIN questions q ON q.id = a.question_id
      LEFT JOIN question_options o ON o.id = a.selected_option_id
      LEFT JOIN expected_xp_ids ex ON ex.id = a.id
    `,
      [QuestionType.MATCHING],
    );

    const t = totals[0] ?? {};
    const totalStoredXp = Number(t.totalStoredXp) || 0;
    const totalExpectedXp = Number(t.totalExpectedXp) || 0;
    const totalOffPlanCorrect = Number(t.totalOffPlanCorrect) || 0;
    const totalPlanCorrect = Number(t.totalPlanCorrect) || 0;
    const totalOffPlanXpInflated = Math.max(0, totalStoredXp - totalExpectedXp);

    const users = await this.attemptRepo.query(
      `
      WITH ${planCte}
      SELECT
        u.id AS "userId",
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.email AS "email",
        COUNT(*) FILTER (WHERE a.counts_for_xp)::int AS "storedPlanCorrect",
        COUNT(*) FILTER (WHERE ex.id IS NOT NULL)::int AS "planCorrect",
        COUNT(*) FILTER (WHERE a.is_correct = true AND ex.id IS NULL)::int AS "offPlanCorrect",
        COUNT(*) FILTER (
          WHERE a.counts_for_xp IS DISTINCT FROM (ex.id IS NOT NULL)
            OR (
              q.type <> $1
              AND o.id IS NOT NULL
              AND o.question_id = a.question_id
              AND a.is_correct IS DISTINCT FROM o.is_correct
            )
            OR a.heart_lost IS DISTINCT FROM (NOT a.is_correct)
        )::int AS "mismatchCount"
      FROM user_question_attempts a
      INNER JOIN users u ON u.id = a.user_id
      INNER JOIN questions q ON q.id = a.question_id
      LEFT JOIN question_options o ON o.id = a.selected_option_id
      LEFT JOIN expected_xp_ids ex ON ex.id = a.id
      GROUP BY u.id, u.first_name, u.last_name, u.email
      HAVING
        COUNT(*) FILTER (WHERE a.counts_for_xp) IS DISTINCT FROM
        COUNT(*) FILTER (WHERE ex.id IS NOT NULL)
        OR COUNT(*) FILTER (
          WHERE a.counts_for_xp IS DISTINCT FROM (ex.id IS NOT NULL)
            OR (
              q.type <> $1
              AND o.id IS NOT NULL
              AND o.question_id = a.question_id
              AND a.is_correct IS DISTINCT FROM o.is_correct
            )
            OR a.heart_lost IS DISTINCT FROM (NOT a.is_correct)
        ) > 0
      ORDER BY
        ABS(
          COUNT(*) FILTER (WHERE a.counts_for_xp)
          - COUNT(*) FILTER (WHERE ex.id IS NOT NULL)
        ) DESC,
        u.last_name ASC
      LIMIT 500
    `,
      [QuestionType.MATCHING],
    );

    const userRows: XpAnomalyUserRow[] = (users as any[]).map((r) => {
      const storedPlanCorrect = Number(r.storedPlanCorrect) || 0;
      const planCorrect = Number(r.planCorrect) || 0;
      const offPlanCorrect = Number(r.offPlanCorrect) || 0;
      const storedXp = storedPlanCorrect * 10;
      const expectedXp = planCorrect * 10;
      return {
        userId: r.userId,
        firstName: r.firstName ?? '',
        lastName: r.lastName ?? '',
        email: r.email ?? '',
        storedXp,
        expectedXp,
        offPlanCorrect,
        planCorrect,
        storedPlanCorrect,
        offPlanXpInflated: Math.max(0, storedXp - expectedXp),
        mismatchCount: Number(r.mismatchCount) || 0,
      };
    });

    const samplesRaw = await this.attemptRepo.query(
      `
      WITH ${planCte}
      SELECT
        a.id AS "attemptId",
        u.id AS "userId",
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.email AS "email",
        q.id AS "questionId",
        q.prompt AS "prompt",
        q.type AS "questionType",
        a.selected_option_id AS "selectedOptionId",
        a.is_correct AS "storedCorrect",
        o.is_correct AS "expectedCorrect",
        a.counts_for_xp AS "countsForXp",
        (ex.id IS NOT NULL) AS "expectedCountsForXp",
        a.attempt_source AS "attemptSource",
        a.heart_lost AS "heartLost",
        CASE
          WHEN a.counts_for_xp IS DISTINCT FROM (ex.id IS NOT NULL)
            AND ex.id IS NULL AND a.counts_for_xp
            THEN 'off_plan_xp'
          WHEN a.counts_for_xp IS DISTINCT FROM (ex.id IS NOT NULL)
            AND ex.id IS NOT NULL AND NOT a.counts_for_xp
            THEN 'missing_plan_xp'
          WHEN a.selected_option_id IS NULL THEN 'selected_option_missing'
          WHEN o.id IS NULL THEN 'option_deleted'
          WHEN o.question_id IS DISTINCT FROM a.question_id THEN 'option_wrong_question'
          WHEN a.is_correct IS DISTINCT FROM o.is_correct THEN 'is_correct_mismatch'
          WHEN a.heart_lost IS DISTINCT FROM (NOT a.is_correct) THEN 'heart_lost_mismatch'
          ELSE 'ok'
        END AS "reason",
        a.answered_at AS "answeredAt"
      FROM user_question_attempts a
      INNER JOIN users u ON u.id = a.user_id
      INNER JOIN questions q ON q.id = a.question_id
      LEFT JOIN question_options o ON o.id = a.selected_option_id
      LEFT JOIN expected_xp_ids ex ON ex.id = a.id
      WHERE
        a.counts_for_xp IS DISTINCT FROM (ex.id IS NOT NULL)
        OR (
          q.type <> $1
          AND (
            a.selected_option_id IS NULL
            OR o.id IS NULL
            OR o.question_id IS DISTINCT FROM a.question_id
            OR a.is_correct IS DISTINCT FROM o.is_correct
            OR a.heart_lost IS DISTINCT FROM (NOT a.is_correct)
          )
        )
      ORDER BY
        CASE WHEN a.counts_for_xp AND ex.id IS NULL THEN 0 ELSE 1 END,
        a.answered_at DESC
      LIMIT $2
    `,
      [QuestionType.MATCHING, sampleLimit],
    );

    const samples: XpAnomalySample[] = (samplesRaw as any[]).map((r) => ({
      attemptId: r.attemptId,
      userId: r.userId,
      firstName: r.firstName ?? '',
      lastName: r.lastName ?? '',
      email: r.email ?? '',
      questionId: r.questionId,
      prompt: r.prompt ?? '',
      questionType: r.questionType ?? '',
      selectedOptionId: r.selectedOptionId ?? null,
      storedCorrect: Boolean(r.storedCorrect),
      expectedCorrect:
        r.expectedCorrect === null || r.expectedCorrect === undefined
          ? null
          : Boolean(r.expectedCorrect),
      countsForXp: Boolean(r.countsForXp),
      expectedCountsForXp: Boolean(r.expectedCountsForXp),
      attemptSource: r.attemptSource ?? null,
      heartLost: Boolean(r.heartLost),
      reason: r.reason ?? 'ok',
      answeredAt:
        r.answeredAt instanceof Date
          ? r.answeredAt.toISOString()
          : new Date(r.answeredAt).toISOString(),
    }));

    return {
      scannedAttempts: Number(t.scannedAttempts) || 0,
      gradeableAttempts: Number(t.gradeableAttempts) || 0,
      mismatchAttempts: Number(t.mismatchAttempts) || 0,
      heartLostOnlyMismatches: Number(t.heartLostOnlyMismatches) || 0,
      orphanAttempts: Number(t.orphanAttempts) || 0,
      matchingSkipped: Number(t.matchingSkipped) || 0,
      planFlagMismatches: Number(t.planFlagMismatches) || 0,
      affectedUsers: userRows.length,
      totalStoredXp,
      totalExpectedXp,
      xpDelta: totalExpectedXp - totalStoredXp,
      totalOffPlanCorrect,
      totalPlanCorrect,
      totalOffPlanXpInflated,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
      users: userRows,
      samples,
    };
  }

  async reconcile(): Promise<XpAnomalyReconcileResult> {
    const before = await this.audit(1);
    const planCte = this.expectedPlanCte();

    const gradeResult = await this.attemptRepo.query(
      `
      WITH updated AS (
        UPDATE user_question_attempts a
        SET
          is_correct = o.is_correct,
          heart_lost = NOT o.is_correct
        FROM question_options o, questions q
        WHERE a.selected_option_id = o.id
          AND a.question_id = q.id
          AND o.question_id = a.question_id
          AND q.type <> $1
          AND (
            a.is_correct IS DISTINCT FROM o.is_correct
            OR a.heart_lost IS DISTINCT FROM (NOT o.is_correct)
          )
        RETURNING a.id
      )
      SELECT COUNT(*)::int AS "cnt" FROM updated
    `,
      [QuestionType.MATCHING],
    );

    const heartResult = await this.attemptRepo.query(`
      WITH updated AS (
        UPDATE user_question_attempts a
        SET heart_lost = NOT a.is_correct
        WHERE a.heart_lost IS DISTINCT FROM (NOT a.is_correct)
        RETURNING a.id
      )
      SELECT COUNT(*)::int AS "cnt" FROM updated
    `);

    // Plandan tashqari ballarni ayirish: faqat plan qoidasidagi urinishlar counts_for_xp=true
    await this.attemptRepo.query(`
      UPDATE user_question_attempts SET counts_for_xp = false
    `);

    const planSet = await this.attemptRepo.query(`
      WITH ${planCte},
      updated AS (
        UPDATE user_question_attempts a
        SET counts_for_xp = true
        FROM expected_xp_ids ex
        WHERE a.id = ex.id
        RETURNING a.id
      )
      SELECT COUNT(*)::int AS "cnt" FROM updated
    `);

    const after = await this.audit(1);

    return {
      fixedGradeAttempts: Number(gradeResult?.[0]?.cnt) || 0,
      fixedHeartLostAttempts: Number(heartResult?.[0]?.cnt) || 0,
      fixedPlanFlags: Number(planSet?.[0]?.cnt) || 0,
      affectedUsers: before.affectedUsers,
      beforeStoredXp: before.totalStoredXp,
      afterExpectedXp: after.totalStoredXp,
      xpDelta: after.totalStoredXp - before.totalStoredXp,
      offPlanXpRemoved: Math.max(0, before.totalStoredXp - after.totalStoredXp),
      users: before.users,
    };
  }
}
