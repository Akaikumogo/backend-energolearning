import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { QuestionType } from '../common/enums/question-type.enum';

export type XpAnomalyUserRow = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  storedCorrect: number;
  expectedCorrect: number;
  storedXp: number;
  expectedXp: number;
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
  heartLost: boolean;
  expectedHeartLost: boolean | null;
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
  affectedUsers: number;
  totalStoredXp: number;
  totalExpectedXp: number;
  xpDelta: number;
  users: XpAnomalyUserRow[];
  samples: XpAnomalySample[];
};

export type XpAnomalyReconcileResult = {
  fixedGradeAttempts: number;
  fixedHeartLostAttempts: number;
  affectedUsers: number;
  beforeStoredXp: number;
  afterExpectedXp: number;
  xpDelta: number;
  users: XpAnomalyUserRow[];
};

@Injectable()
export class XpAnomaliesService {
  constructor(
    @InjectRepository(UserQuestionAttempt)
    private readonly attemptRepo: Repository<UserQuestionAttempt>,
  ) {}

  async audit(limitSamples = 50): Promise<XpAnomalyAudit> {
    const sampleLimit = Math.min(Math.max(limitSamples, 1), 200);

    const totals = await this.attemptRepo.query(`
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
        COALESCE(SUM(CASE WHEN a.is_correct THEN 10 ELSE 0 END), 0)::int AS "totalStoredXp",
        COALESCE(SUM(
          CASE
            WHEN q.type <> $1
              AND o.id IS NOT NULL
              AND o.question_id = a.question_id
              AND o.is_correct
            THEN 10
            WHEN q.type = $1 AND a.is_correct THEN 10
            WHEN q.type <> $1
              AND (a.selected_option_id IS NULL OR o.id IS NULL OR o.question_id IS DISTINCT FROM a.question_id)
              AND a.is_correct
            THEN 10
            ELSE 0
          END
        ), 0)::int AS "totalExpectedXp"
      FROM user_question_attempts a
      INNER JOIN questions q ON q.id = a.question_id
      LEFT JOIN question_options o ON o.id = a.selected_option_id
    `, [QuestionType.MATCHING]);

    const t = totals[0] ?? {};
    const totalStoredXp = Number(t.totalStoredXp) || 0;
    const totalExpectedXp = Number(t.totalExpectedXp) || 0;

    const users = await this.attemptRepo.query(`
      SELECT
        u.id AS "userId",
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.email AS "email",
        COUNT(*) FILTER (WHERE a.is_correct)::int AS "storedCorrect",
        COUNT(*) FILTER (
          WHERE (
            q.type <> $1
            AND o.id IS NOT NULL
            AND o.question_id = a.question_id
            AND o.is_correct
          ) OR (
            q.type = $1 AND a.is_correct
          ) OR (
            q.type <> $1
            AND (a.selected_option_id IS NULL OR o.id IS NULL OR o.question_id IS DISTINCT FROM a.question_id)
            AND a.is_correct
          )
        )::int AS "expectedCorrect",
        COUNT(*) FILTER (
          WHERE (
            q.type <> $1
            AND o.id IS NOT NULL
            AND o.question_id = a.question_id
            AND a.is_correct IS DISTINCT FROM o.is_correct
          ) OR a.heart_lost IS DISTINCT FROM (NOT a.is_correct)
        )::int AS "mismatchCount"
      FROM user_question_attempts a
      INNER JOIN users u ON u.id = a.user_id
      INNER JOIN questions q ON q.id = a.question_id
      LEFT JOIN question_options o ON o.id = a.selected_option_id
      GROUP BY u.id, u.first_name, u.last_name, u.email
      HAVING
        COUNT(*) FILTER (
          WHERE (
            q.type <> $1
            AND o.id IS NOT NULL
            AND o.question_id = a.question_id
            AND a.is_correct IS DISTINCT FROM o.is_correct
          ) OR a.heart_lost IS DISTINCT FROM (NOT a.is_correct)
        ) > 0
        OR COUNT(*) FILTER (WHERE a.is_correct)
           IS DISTINCT FROM
           COUNT(*) FILTER (
             WHERE (
               q.type <> $1
               AND o.id IS NOT NULL
               AND o.question_id = a.question_id
               AND o.is_correct
             ) OR (
               q.type = $1 AND a.is_correct
             ) OR (
               q.type <> $1
               AND (a.selected_option_id IS NULL OR o.id IS NULL OR o.question_id IS DISTINCT FROM a.question_id)
               AND a.is_correct
             )
           )
      ORDER BY
        ABS(
          COUNT(*) FILTER (WHERE a.is_correct)
          - COUNT(*) FILTER (
              WHERE (
                q.type <> $1
                AND o.id IS NOT NULL
                AND o.question_id = a.question_id
                AND o.is_correct
              ) OR (
                q.type = $1 AND a.is_correct
              ) OR (
                q.type <> $1
                AND (a.selected_option_id IS NULL OR o.id IS NULL OR o.question_id IS DISTINCT FROM a.question_id)
                AND a.is_correct
              )
            )
        ) DESC,
        u.last_name ASC
      LIMIT 500
    `, [QuestionType.MATCHING]);

    const userRows: XpAnomalyUserRow[] = (users as any[]).map((r) => {
      const storedCorrect = Number(r.storedCorrect) || 0;
      const expectedCorrect = Number(r.expectedCorrect) || 0;
      return {
        userId: r.userId,
        firstName: r.firstName ?? '',
        lastName: r.lastName ?? '',
        email: r.email ?? '',
        storedCorrect,
        expectedCorrect,
        storedXp: storedCorrect * 10,
        expectedXp: expectedCorrect * 10,
        mismatchCount: Number(r.mismatchCount) || 0,
      };
    });

    const samplesRaw = await this.attemptRepo.query(`
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
        a.heart_lost AS "heartLost",
        CASE
          WHEN o.id IS NOT NULL AND o.question_id = a.question_id THEN NOT o.is_correct
          ELSE NOT a.is_correct
        END AS "expectedHeartLost",
        CASE
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
      WHERE q.type <> $1
        AND (
          a.selected_option_id IS NULL
          OR o.id IS NULL
          OR o.question_id IS DISTINCT FROM a.question_id
          OR a.is_correct IS DISTINCT FROM o.is_correct
          OR a.heart_lost IS DISTINCT FROM (NOT a.is_correct)
        )
      ORDER BY a.answered_at DESC
      LIMIT $2
    `, [QuestionType.MATCHING, sampleLimit]);

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
      heartLost: Boolean(r.heartLost),
      expectedHeartLost:
        r.expectedHeartLost === null || r.expectedHeartLost === undefined
          ? null
          : Boolean(r.expectedHeartLost),
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
      affectedUsers: userRows.length,
      totalStoredXp,
      totalExpectedXp,
      xpDelta: totalExpectedXp - totalStoredXp,
      users: userRows,
      samples,
    };
  }

  async reconcile(): Promise<XpAnomalyReconcileResult> {
    const before = await this.audit(1);

    const gradeResult = await this.attemptRepo.query(`
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
    `, [QuestionType.MATCHING]);

    const heartResult = await this.attemptRepo.query(`
      WITH updated AS (
        UPDATE user_question_attempts a
        SET heart_lost = NOT a.is_correct
        WHERE a.heart_lost IS DISTINCT FROM (NOT a.is_correct)
        RETURNING a.id
      )
      SELECT COUNT(*)::int AS "cnt" FROM updated
    `);

    const after = await this.audit(1);

    return {
      fixedGradeAttempts: Number(gradeResult?.[0]?.cnt) || 0,
      fixedHeartLostAttempts: Number(heartResult?.[0]?.cnt) || 0,
      affectedUsers: before.affectedUsers,
      beforeStoredXp: before.totalStoredXp,
      afterExpectedXp: after.totalStoredXp,
      xpDelta: after.totalStoredXp - before.totalStoredXp,
      users: before.users,
    };
  }
}
