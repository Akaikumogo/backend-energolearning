import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { In, IsNull, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { ExamAssignmentStatus } from '../common/enums/exam-assignment-status.enum';
import { ExamQuestionDifficulty } from '../common/enums/exam-question-difficulty.enum';
import { ExamQuestionSection } from '../common/enums/exam-question-section.enum';
import { ExamSessionStatus } from '../common/enums/exam-session-status.enum';
import { ExamType } from '../common/enums/exam-type.enum';
import { OralResult } from '../common/enums/oral-result.enum';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
import { ExamAttempt } from '../database/entities/exam-attempt.entity';
import { ExamAttemptAnswer } from '../database/entities/exam-attempt-answer.entity';
import { ExamQuestion } from '../database/entities/exam-question.entity';
import { ExamQuestionOption } from '../database/entities/exam-question-option.entity';
import { ExamQuestionPosition } from '../database/entities/exam-question-position.entity';
import { ExamSession } from '../database/entities/exam-session.entity';
import { Exam } from '../database/entities/exam.entity';
import { UserPosition } from '../database/entities/user-position.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  EXAM_DIFFICULTY_COUNTS,
  EXAM_MAX_TAB_SWITCHES,
  EXAM_OTP_TTL_MS,
  EXAM_PASS_PERCENT,
  EXAM_POINTS_PER_QUESTION,
  EXAM_QUESTIONS_PER_SECTION,
} from './exam-live.constants';

const OTP_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePlainOtp(): string {
  let s = '';
  for (let i = 0; i < 10; i++) {
    s += OTP_CHARS[randomInt(OTP_CHARS.length)]!;
  }
  return s;
}

@Injectable()
export class ExamLiveService {
  constructor(
    private readonly organizationsService: OrganizationsService,
    @InjectRepository(ExamAssignment)
    private readonly assignmentRepo: Repository<ExamAssignment>,
    @InjectRepository(ExamSession)
    private readonly sessionRepo: Repository<ExamSession>,
    @InjectRepository(ExamAttempt)
    private readonly attemptRepo: Repository<ExamAttempt>,
    @InjectRepository(ExamAttemptAnswer)
    private readonly answerRepo: Repository<ExamAttemptAnswer>,
    @InjectRepository(ExamQuestion)
    private readonly questionRepo: Repository<ExamQuestion>,
    @InjectRepository(ExamQuestionOption)
    private readonly optionRepo: Repository<ExamQuestionOption>,
    @InjectRepository(ExamQuestionPosition)
    private readonly questionPositionRepo: Repository<ExamQuestionPosition>,
    @InjectRepository(UserPosition)
    private readonly userPositionRepo: Repository<UserPosition>,
    @InjectRepository(Exam)
    private readonly examRepo: Repository<Exam>,
  ) {}

  private assertAssignmentActive(a: ExamAssignment) {
    const now = new Date();
    if (a.qrExpiresAt && now > a.qrExpiresAt) {
      throw new BadRequestException('QR muddati tugagan');
    }
    if (a.status === ExamAssignmentStatus.CANCELLED) {
      throw new BadRequestException('Imtihon bekor qilingan');
    }
  }

  async validateQrAndEnsureSession(userId: string, qrToken: string) {
    const assignment = await this.assignmentRepo.findOne({
      where: { qrToken: qrToken.trim() },
      relations: ['exam', 'user', 'organization'],
    });
    if (!assignment) throw new NotFoundException('QR topilmadi');
    if (assignment.userId !== userId) {
      throw new ForbiddenException('Bu imtihon sizga tegishli emas');
    }
    this.assertAssignmentActive(assignment);

    let session = await this.sessionRepo.findOne({
      where: { assignmentId: assignment.id, userId },
      order: { createdAt: 'DESC' },
    });
    if (
      session &&
      session.status !== ExamSessionStatus.CANCELLED &&
      session.status !== ExamSessionStatus.COMPLETED
    ) {
      return { assignment, session, isNew: false };
    }

    session = await this.sessionRepo.save(
      this.sessionRepo.create({
        assignmentId: assignment.id,
        userId,
        status: ExamSessionStatus.WAITING_MODERATOR,
        otpHash: null,
        otpExpiresAt: null,
        tabSwitchCount: 0,
        rejectionReason: null,
        approvedByUserId: null,
        activeSection: null,
        ptCompleted: false,
        tbCompleted: false,
      }),
    );

    return { assignment, session, isNew: true };
  }

  async getSessionForUser(sessionId: string, userId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['assignment', 'assignment.exam', 'assignment.user', 'assignment.organization'],
    });
    if (!session) throw new NotFoundException('Sessiya topilmadi');
    if (session.userId !== userId) throw new ForbiddenException();
    return session;
  }

  async getSessionForModerator(sessionId: string, mod: { role: Role; organizationIds: string[] }) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['assignment', 'assignment.user', 'assignment.organization', 'assignment.exam'],
    });
    if (!session) throw new NotFoundException('Sessiya topilmadi');
    if (mod.role === Role.MODERATOR) {
      const orgId = session.assignment.organizationId;
      if (!mod.organizationIds?.includes(orgId)) {
        throw new ForbiddenException('Sizda ushbu sessiya uchun ruxsat yo‘q');
      }
    } else if (mod.role !== Role.SUPERADMIN) {
      throw new ForbiddenException();
    }
    return session;
  }

  async listPendingSessionsForModerator(mod: { role: Role; organizationIds: string[] }) {
    const scoped =
      mod.role === Role.SUPERADMIN
        ? undefined
        : mod.organizationIds?.length
          ? mod.organizationIds
          : [];
    if (mod.role === Role.MODERATOR && (!scoped || scoped.length === 0)) return [];

    const qb = this.sessionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.assignment', 'a')
      .leftJoinAndSelect('a.user', 'u')
      .leftJoinAndSelect('a.organization', 'o')
      .leftJoinAndSelect('a.exam', 'e')
      .where('s.status = :st', { st: ExamSessionStatus.WAITING_MODERATOR })
      .orderBy('s.created_at', 'ASC');

    if (scoped) {
      qb.andWhere('a.organization_id IN (:...orgs)', { orgs: scoped });
    }

    const rows = await qb.getMany();
    return rows.map((s) => this.mapSessionSummary(s));
  }

  async listAwaitingOralForModerator(mod: { role: Role; organizationIds: string[] }) {
    const scoped =
      mod.role === Role.SUPERADMIN
        ? undefined
        : mod.organizationIds?.length
          ? mod.organizationIds
          : [];
    if (mod.role === Role.MODERATOR && (!scoped || scoped.length === 0)) return [];

    const qb = this.sessionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.assignment', 'a')
      .leftJoinAndSelect('a.user', 'u')
      .leftJoinAndSelect('a.organization', 'o')
      .leftJoinAndSelect('a.exam', 'e')
      .where('s.status = :st', { st: ExamSessionStatus.AWAITING_ORAL })
      .orderBy('s.updated_at', 'DESC');

    if (scoped) {
      qb.andWhere('a.organization_id IN (:...orgs)', { orgs: scoped });
    }

    const rows = await qb.getMany();
    const out: Array<{
      sessionId: string;
      attemptId: string | null;
      user: { id: string; firstName: string; lastName: string; email: string } | null;
      organizationName: string | null;
      examTitle: string | null;
      scorePercent: number | null;
      ptScorePercent: number | null;
      tbScorePercent: number | null;
    }> = [];

    for (const s of rows) {
      const attempt = await this.attemptRepo.findOne({ where: { sessionId: s.id } });
      const a = s.assignment;
      out.push({
        sessionId: s.id,
        attemptId: attempt?.id ?? null,
        user: a.user
          ? {
              id: a.user.id,
              firstName: a.user.firstName,
              lastName: a.user.lastName,
              email: a.user.email,
            }
          : null,
        organizationName: a.organization?.name ?? null,
        examTitle: a.exam?.title ?? null,
        scorePercent: attempt?.scorePercent ?? null,
        ptScorePercent: attempt?.ptScorePercent ?? null,
        tbScorePercent: attempt?.tbScorePercent ?? null,
      });
    }
    return out;
  }

  private mapSessionSummary(s: ExamSession) {
    const a = s.assignment;
    return {
      sessionId: s.id,
      assignmentId: a.id,
      user: a.user
        ? {
            id: a.user.id,
            firstName: a.user.firstName,
            lastName: a.user.lastName,
            email: a.user.email,
          }
        : null,
      organizationName: a.organization?.name ?? null,
      examTitle: a.exam?.title ?? null,
      includesPt: a.includesPt,
      includesTb: a.includesTb,
      suggestedAt: a.suggestedAt,
      createdAt: s.createdAt,
    };
  }

  async moderatorApprove(sessionId: string, moderatorUserId: string, mod: { role: Role; organizationIds: string[] }) {
    const session = await this.getSessionForModerator(sessionId, mod);
    if (session.status !== ExamSessionStatus.WAITING_MODERATOR) {
      throw new BadRequestException('Sessiya tasdiqlash uchun tayyor emas');
    }
    const plain = generatePlainOtp();
    const otpHash = await bcrypt.hash(plain, 8);
    const otpExpiresAt = new Date(Date.now() + EXAM_OTP_TTL_MS);
    session.status = ExamSessionStatus.CODE_PENDING;
    session.otpHash = otpHash;
    session.otpExpiresAt = otpExpiresAt;
    session.approvedByUserId = moderatorUserId;
    await this.sessionRepo.save(session);
    return { plainOtp: plain, expiresAt: otpExpiresAt.toISOString() };
  }

  async moderatorReject(sessionId: string, moderatorUserId: string, reason: string, mod: { role: Role; organizationIds: string[] }) {
    const session = await this.getSessionForModerator(sessionId, mod);
    if (
      session.status !== ExamSessionStatus.WAITING_MODERATOR &&
      session.status !== ExamSessionStatus.CODE_PENDING
    ) {
      throw new BadRequestException('Sessiya rad etish uchun mos emas');
    }
    session.status = ExamSessionStatus.CANCELLED;
    session.rejectionReason = reason?.trim() || 'Rad etildi';
    session.approvedByUserId = moderatorUserId;
    await this.sessionRepo.save(session);
    const a = session.assignment;
    if (a.status !== ExamAssignmentStatus.CANCELLED) {
      a.status = ExamAssignmentStatus.CANCELLED;
      await this.assignmentRepo.save(a);
    }
    return { ok: true };
  }

  async verifyEmployeeCode(sessionId: string, userId: string, code: string) {
    const session = await this.getSessionForUser(sessionId, userId);
    if (session.status !== ExamSessionStatus.CODE_PENDING) {
      throw new BadRequestException('Kod kutilayotgan holat emas');
    }
    if (!session.otpHash || !session.otpExpiresAt || new Date() > session.otpExpiresAt) {
      throw new BadRequestException('Kod muddati tugagan');
    }
    const ok = await bcrypt.compare(code.trim().toUpperCase(), session.otpHash);
    if (!ok) throw new BadRequestException('Kod noto‘g‘ri');

    const attempt = await this.attemptRepo.save(
      this.attemptRepo.create({
        assignmentId: session.assignmentId,
        sessionId: session.id,
        startedAt: new Date(),
        submittedAt: null,
        scorePercent: null,
        ptScorePercent: null,
        tbScorePercent: null,
        ptStartedAt: null,
        ptSubmittedAt: null,
        tbStartedAt: null,
        tbSubmittedAt: null,
        oralResult: null,
        oralFeedback: null,
        oralReviewedById: null,
        oralReviewedAt: null,
        nextExamMonths: null,
        finalizedAt: null,
        payload: {},
      }),
    );

    session.status = ExamSessionStatus.IN_PROGRESS;
    session.otpHash = null;
    session.otpExpiresAt = null;
    await this.sessionRepo.save(session);

    return { attemptId: attempt.id, assignment: session.assignment };
  }

  private async getUserPositionIds(userId: string): Promise<string[]> {
    const links = await this.userPositionRepo.find({ where: { userId } });
    return links.map((l) => l.positionId);
  }

  private async pickQuestionsForSection(
    userId: string,
    section: ExamQuestionSection,
  ): Promise<ExamQuestion[]> {
    const positionIds = await this.getUserPositionIds(userId);
    if (!positionIds.length) {
      throw new BadRequestException('Lavozim biriktirilmagan. Administratorga murojaat qiling.');
    }

    const qpRows = await this.questionPositionRepo.find({
      where: { positionId: In(positionIds) },
      select: ['questionId'],
    });
    const qids = [...new Set(qpRows.map((r) => r.questionId))];
    if (!qids.length) {
      throw new BadRequestException('Ushbu lavozim uchun imtihon savollari yo‘q');
    }

    const questions = await this.questionRepo.find({
      where: {
        id: In(qids),
        section,
        isActive: true,
        deletedAt: IsNull(),
      },
      relations: ['options'],
    });

    const byDiff = {
      [ExamQuestionDifficulty.EASY]: questions.filter((q) => q.difficulty === ExamQuestionDifficulty.EASY),
      [ExamQuestionDifficulty.MEDIUM]: questions.filter((q) => q.difficulty === ExamQuestionDifficulty.MEDIUM),
      [ExamQuestionDifficulty.HARD]: questions.filter((q) => q.difficulty === ExamQuestionDifficulty.HARD),
    };

    const shuffle = <T>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a;
    };

    const picked: ExamQuestion[] = [];
    const take = (pool: ExamQuestion[], n: number) => {
      const sh = shuffle(pool);
      for (let i = 0; i < Math.min(n, sh.length); i++) picked.push(sh[i]!);
    };

    take(byDiff[ExamQuestionDifficulty.EASY], EXAM_DIFFICULTY_COUNTS.EASY);
    take(byDiff[ExamQuestionDifficulty.MEDIUM], EXAM_DIFFICULTY_COUNTS.MEDIUM);
    take(byDiff[ExamQuestionDifficulty.HARD], EXAM_DIFFICULTY_COUNTS.HARD);

    if (picked.length < EXAM_QUESTIONS_PER_SECTION) {
      const rest = shuffle(questions.filter((q) => !picked.includes(q)));
      for (const q of rest) {
        if (picked.length >= EXAM_QUESTIONS_PER_SECTION) break;
        picked.push(q);
      }
    }

    if (picked.length < EXAM_QUESTIONS_PER_SECTION) {
      throw new BadRequestException(
        `Yetarli savol yo‘q (kerak: ${EXAM_QUESTIONS_PER_SECTION}, bor: ${picked.length})`,
      );
    }

    return picked.slice(0, EXAM_QUESTIONS_PER_SECTION);
  }

  async startSection(sessionId: string, userId: string, section: ExamQuestionSection) {
    const session = await this.getSessionForUser(sessionId, userId);
    if (session.status !== ExamSessionStatus.IN_PROGRESS) {
      throw new BadRequestException('Imtihon faol emas');
    }
    const a = session.assignment;
    if (section === ExamQuestionSection.PT && !a.includesPt) throw new BadRequestException('PT yo‘q');
    if (section === ExamQuestionSection.TB && !a.includesTb) throw new BadRequestException('TB yo‘q');

    if (section === ExamQuestionSection.PT && session.ptCompleted) {
      throw new BadRequestException('PT allaqachon tugagan');
    }
    if (section === ExamQuestionSection.TB && session.tbCompleted) {
      throw new BadRequestException('TB allaqachon tugagan');
    }

    const attempt = await this.attemptRepo.findOne({ where: { sessionId: session.id } });
    if (!attempt) throw new NotFoundException('Attempt topilmadi');

    const picked = await this.pickQuestionsForSection(userId, section);
    const payload = { ...(attempt.payload ?? {}) };
    const key = section === ExamQuestionSection.PT ? 'ptQuestionIds' : 'tbQuestionIds';
    payload[key] = picked.map((q) => q.id);
    attempt.payload = payload;
    if (section === ExamQuestionSection.PT) {
      attempt.ptStartedAt = new Date();
    } else {
      attempt.tbStartedAt = new Date();
    }
    await this.attemptRepo.save(attempt);

    session.activeSection = section;
    await this.sessionRepo.save(session);

    await this.answerRepo.delete({
      attemptId: attempt.id,
      section,
    });

    return {
      section,
      questions: picked.map((q, idx) => ({
        orderIndex: idx,
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        options: (q.options ?? []).map((o) => ({
          id: o.id,
          optionText: o.optionText,
          orderIndex: o.orderIndex,
        })),
      })),
      durationMinutes: 30,
      pointsPerQuestion: EXAM_POINTS_PER_QUESTION,
    };
  }

  async saveAnswer(
    sessionId: string,
    userId: string,
    section: ExamQuestionSection,
    questionId: string,
    selectedOptionId: string,
  ) {
    const session = await this.getSessionForUser(sessionId, userId);
    if (session.status !== ExamSessionStatus.IN_PROGRESS) {
      throw new BadRequestException();
    }
    const attempt = await this.attemptRepo.findOne({ where: { sessionId: session.id } });
    if (!attempt) throw new NotFoundException();

    const question = await this.questionRepo.findOne({
      where: { id: questionId, deletedAt: IsNull() },
      relations: ['options'],
    });
    if (!question) throw new NotFoundException('Savol topilmadi');

    const opt = await this.optionRepo.findOne({ where: { id: selectedOptionId, questionId } });
    if (!opt) throw new BadRequestException('Variant topilmadi');

    const isCorrect = opt.isCorrect === true;
    const orderIndex =
      ((attempt.payload ?? {})[section === ExamQuestionSection.PT ? 'ptQuestionIds' : 'tbQuestionIds'] as
        | string[]
        | undefined)?.indexOf(questionId) ?? 0;

    await this.answerRepo.delete({ attemptId: attempt.id, questionId, section });
    await this.answerRepo.save(
      this.answerRepo.create({
        attemptId: attempt.id,
        questionId,
        section,
        selectedOptionId,
        isCorrect,
        orderIndex,
      }),
    );

    return { ok: true, isCorrect };
  }

  async submitSection(sessionId: string, userId: string, section: ExamQuestionSection) {
    const session = await this.getSessionForUser(sessionId, userId);
    if (session.status !== ExamSessionStatus.IN_PROGRESS) throw new BadRequestException();

    const attempt = await this.attemptRepo.findOne({ where: { sessionId: session.id } });
    if (!attempt) throw new NotFoundException();

    const answers = await this.answerRepo.find({
      where: { attemptId: attempt.id, section },
    });
    const correct = answers.filter((x) => x.isCorrect).length;
    const percent = Math.round((correct / EXAM_QUESTIONS_PER_SECTION) * 100);
    const score = correct * EXAM_POINTS_PER_QUESTION;
    const maxScore = EXAM_QUESTIONS_PER_SECTION * EXAM_POINTS_PER_QUESTION;
    const passed = percent >= EXAM_PASS_PERCENT;

    if (section === ExamQuestionSection.PT) {
      attempt.ptScorePercent = percent;
      attempt.ptSubmittedAt = new Date();
      session.ptCompleted = true;
    } else {
      attempt.tbScorePercent = percent;
      attempt.tbSubmittedAt = new Date();
      session.tbCompleted = true;
    }

    const bothDone =
      (!session.assignment.includesPt || session.ptCompleted) &&
      (!session.assignment.includesTb || session.tbCompleted);

    if (bothDone) {
      const pt = session.assignment.includesPt ? attempt.ptScorePercent ?? 0 : null;
      const tb = session.assignment.includesTb ? attempt.tbScorePercent ?? 0 : null;
      let combined: number | null = null;
      if (pt != null && tb != null) combined = Math.round((pt + tb) / 2);
      else if (pt != null) combined = pt;
      else if (tb != null) combined = tb;
      attempt.scorePercent = combined;
      attempt.submittedAt = new Date();
      session.status = ExamSessionStatus.AWAITING_ORAL;
      session.activeSection = null;
      const asn = session.assignment;
      asn.status = ExamAssignmentStatus.SUBMITTED;
      await this.assignmentRepo.save(asn);
    }

    await this.attemptRepo.save(attempt);
    await this.sessionRepo.save(session);

    return {
      section,
      correctCount: correct,
      totalQuestions: EXAM_QUESTIONS_PER_SECTION,
      score,
      maxScore,
      percent,
      passed,
      passThreshold: EXAM_PASS_PERCENT,
      awaitingOral: bothDone,
    };
  }

  async recordTabSwitch(sessionId: string, userId: string) {
    const session = await this.getSessionForUser(sessionId, userId);
    if (session.status !== ExamSessionStatus.IN_PROGRESS) return { tabSwitchCount: session.tabSwitchCount };
    session.tabSwitchCount += 1;
    await this.sessionRepo.save(session);
    if (session.tabSwitchCount >= EXAM_MAX_TAB_SWITCHES) {
      session.status = ExamSessionStatus.CANCELLED;
      await this.sessionRepo.save(session);
      const a = session.assignment;
      a.status = ExamAssignmentStatus.CANCELLED;
      await this.assignmentRepo.save(a);
      return { tabSwitchCount: session.tabSwitchCount, cancelled: true };
    }
    return { tabSwitchCount: session.tabSwitchCount, cancelled: false };
  }

  async finalizeOral(
    attemptId: string,
    moderatorUserId: string,
    dto: { oralResult: OralResult; oralFeedback: string; nextExamMonths: number },
    mod: { role: Role; organizationIds: string[] },
  ) {
    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId },
      relations: ['assignment', 'session'],
    });
    if (!attempt || !attempt.sessionId) throw new NotFoundException();
    await this.getSessionForModerator(attempt.sessionId, mod);

    const session = await this.sessionRepo.findOne({ where: { id: attempt.sessionId } });
    if (!session || session.status !== ExamSessionStatus.AWAITING_ORAL) {
      throw new BadRequestException('Og‘zaki bosqich kutilmayapti');
    }

    if (dto.nextExamMonths < 1 || dto.nextExamMonths > 6) {
      throw new BadRequestException('Keyingi imtihon 1–6 oy oralig‘ida bo‘lishi kerak');
    }

    attempt.oralResult = dto.oralResult;
    attempt.oralFeedback = dto.oralFeedback?.trim() ?? '';
    attempt.oralReviewedById = moderatorUserId;
    attempt.oralReviewedAt = new Date();
    attempt.nextExamMonths = dto.nextExamMonths;
    attempt.finalizedAt = new Date();
    await this.attemptRepo.save(attempt);

    session.status = ExamSessionStatus.COMPLETED;
    await this.sessionRepo.save(session);

    const asn = attempt.assignment;
    asn.status = ExamAssignmentStatus.SUBMITTED;

    const exam = await this.examRepo.findOne({ where: { id: asn.examId } });
    const suggestedAt = new Date();
    suggestedAt.setMonth(suggestedAt.getMonth() + dto.nextExamMonths);
    suggestedAt.setUTCHours(10, 0, 0, 0);
    const windowStart = new Date(suggestedAt);
    windowStart.setUTCDate(windowStart.getUTCDate() - 1);
    const windowEnd = new Date(suggestedAt);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
    windowEnd.setUTCHours(23, 59, 59, 999);
    const qrToken = `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 8)}`;

    await this.assignmentRepo.save(
      this.assignmentRepo.create({
        examId: asn.examId,
        userId: asn.userId,
        organizationId: asn.organizationId,
        suggestedAt,
        windowStart,
        windowEnd,
        scheduledAt: null,
        status: ExamAssignmentStatus.PENDING,
        includesPt: exam?.includesPt ?? asn.includesPt,
        includesTb: exam?.includesTb ?? asn.includesTb,
        qrToken,
        qrExpiresAt: windowEnd,
        extraReason: null,
      }),
    );

    return { ok: true, nextSuggestedAt: suggestedAt.toISOString() };
  }

  async createExtraAssignment(dto: {
    userId: string;
    organizationId: string;
    includesPt: boolean;
    includesTb: boolean;
    reason: string;
    moderator: { role: Role; organizationIds: string[] };
  }) {
    if (dto.moderator.role !== Role.SUPERADMIN && dto.moderator.role !== Role.MODERATOR) {
      throw new ForbiddenException();
    }
    if (dto.moderator.role === Role.MODERATOR) {
      const scoped = await this.organizationsService.resolveModeratorScope(dto.moderator.organizationIds);
      if (!(scoped ?? []).includes(dto.organizationId)) throw new ForbiddenException();
    }
    if (!dto.includesPt && !dto.includesTb) {
      throw new BadRequestException('Kamida bitta tur (PT yoki TB) tanlang');
    }

    const exam = await this.examRepo.findOne({
      where: { examType: ExamType.EXTRA, isActive: true, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (!exam) throw new BadRequestException('Navbatdan tashqari imtihon (EXTRA) topilmadi. Avval yarating.');

    const now = new Date();
    const suggestedAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    suggestedAt.setUTCHours(10, 0, 0, 0);
    const windowStart = new Date(now);
    const windowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const qrToken = `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 8)}`;

    const row = await this.assignmentRepo.save(
      this.assignmentRepo.create({
        examId: exam.id,
        userId: dto.userId,
        organizationId: dto.organizationId,
        suggestedAt,
        windowStart,
        windowEnd,
        scheduledAt: null,
        status: ExamAssignmentStatus.PENDING,
        includesPt: dto.includesPt,
        includesTb: dto.includesTb,
        qrToken,
        qrExpiresAt: windowEnd,
        extraReason: dto.reason.trim(),
      }),
    );
    return row;
  }

  async getEmployeeExamState(sessionId: string, userId: string) {
    const session = await this.getSessionForUser(sessionId, userId);
    const attempt = await this.attemptRepo.findOne({ where: { sessionId: session.id } });
    const a = session.assignment;
    return {
      status: session.status,
      includesPt: a.includesPt,
      includesTb: a.includesTb,
      ptCompleted: session.ptCompleted,
      tbCompleted: session.tbCompleted,
      activeSection: session.activeSection,
      rejectionReason: session.rejectionReason,
      attemptId: attempt?.id ?? null,
      ptScorePercent: attempt?.ptScorePercent ?? null,
      tbScorePercent: attempt?.tbScorePercent ?? null,
      oralPending: session.status === ExamSessionStatus.AWAITING_ORAL,
    };
  }

  async listHistoryForUser(userId: string) {
    const attempts = await this.attemptRepo
      .createQueryBuilder('at')
      .innerJoinAndSelect('at.assignment', 'a')
      .leftJoinAndSelect('a.exam', 'e')
      .where('a.user_id = :userId', { userId })
      .orderBy('at.created_at', 'DESC')
      .take(50)
      .getMany();
    return attempts.map((at) => ({
      id: at.id,
      createdAt: at.createdAt,
      examTitle: at.assignment?.exam?.title ?? null,
      examType: at.assignment?.exam?.examType ?? null,
      extraReason: at.assignment?.extraReason ?? null,
      includesPt: at.assignment?.includesPt,
      includesTb: at.assignment?.includesTb,
      ptScorePercent: at.ptScorePercent,
      tbScorePercent: at.tbScorePercent,
      scorePercent: at.scorePercent,
      oralResult: at.oralResult,
      oralFeedback: at.oralFeedback,
      finalizedAt: at.finalizedAt,
    }));
  }

  async getNextExamForUser(userId: string) {
    const now = new Date();
    const row = await this.assignmentRepo.findOne({
      where: {
        userId,
        status: In([ExamAssignmentStatus.PENDING, ExamAssignmentStatus.SCHEDULED]),
      },
      order: { suggestedAt: 'ASC' },
    });
    if (!row) return { next: null };
    const target = row.scheduledAt ?? row.suggestedAt;
    const ms = target.getTime() - now.getTime();
    return {
      next: {
        assignmentId: row.id,
        suggestedAt: row.suggestedAt.toISOString(),
        scheduledAt: row.scheduledAt?.toISOString() ?? null,
        daysLeft: Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000))),
      },
    };
  }

  async listRecentAttemptsForSuperadmin(limit: number) {
    const rows = await this.attemptRepo.find({
      relations: ['assignment', 'assignment.user', 'assignment.exam'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((at) => ({
      id: at.id,
      createdAt: at.createdAt,
      userName: at.assignment?.user
        ? `${at.assignment.user.firstName} ${at.assignment.user.lastName}`
        : null,
      examTitle: at.assignment?.exam?.title ?? null,
      ptScorePercent: at.ptScorePercent,
      tbScorePercent: at.tbScorePercent,
      finalizedAt: at.finalizedAt,
    }));
  }

  async getSuperadminAttemptDetail(attemptId: string) {
    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId },
      relations: ['assignment', 'assignment.user', 'answers', 'answers.question', 'answers.selectedOption'],
    });
    if (!attempt) throw new NotFoundException();
    return {
      attempt: {
        id: attempt.id,
        ptScorePercent: attempt.ptScorePercent,
        tbScorePercent: attempt.tbScorePercent,
        scorePercent: attempt.scorePercent,
        user: attempt.assignment?.user
          ? {
              id: attempt.assignment.user.id,
              name: `${attempt.assignment.user.firstName} ${attempt.assignment.user.lastName}`,
              email: attempt.assignment.user.email,
            }
          : null,
      },
      answers: (attempt.answers ?? []).map((an) => ({
        orderIndex: an.orderIndex,
        section: an.section,
        prompt: an.question?.prompt,
        selectedOptionId: an.selectedOptionId,
        selectedText: an.selectedOption?.optionText,
        isCorrect: an.isCorrect,
      })),
    };
  }
}
