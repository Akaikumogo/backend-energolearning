import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Between, In, IsNull, LessThan, Repository } from 'typeorm';
import {
  ActivityEventType,
  UserActivityEvent,
} from '../database/entities/user-activity-event.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { User } from '../database/entities/user.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { Question } from '../database/entities/question.entity';
import { Role } from '../common/enums/role.enum';
import { ActivityRange, UserGroup } from './dto/activity-query.dto';
import { tashkentDayBounds, tashkentToday } from '../common/utils/tashkent-time.util';

const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 daqiqa idle => offline

export interface OnlineUserDto {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  organizationId: string | null;
  organizationName: string | null;
  loginAt: Date;
  lastSeenAt: Date;
  durationSeconds: number;
}

export interface EmployeeOnlineSummary {
  userId: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
  todaySeconds: number;
  yesterdaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
}

@Injectable()
export class UserActivityService {
  private readonly logger = new Logger(UserActivityService.name);

  constructor(
    @InjectRepository(UserSession)
    private readonly sessionRepo: Repository<UserSession>,
    @InjectRepository(UserActivityEvent)
    private readonly eventRepo: Repository<UserActivityEvent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    @InjectRepository(UserQuestionAttempt)
    private readonly attemptRepo: Repository<UserQuestionAttempt>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
  ) {}

  // ---------- SESSION LIFECYCLE ----------

  async startSession(params: {
    userId: string;
    organizationId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<UserSession> {
    // Eski ochiq sessionlarni yopamiz (qayta login bo'lganda)
    await this.closeOpenSessions(params.userId, 'reopened');

    const orgId =
      params.organizationId ?? (await this.resolvePrimaryOrgId(params.userId));

    const session = this.sessionRepo.create({
      userId: params.userId,
      organizationId: orgId,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      isOnline: true,
      loginAt: new Date(),
      lastSeenAt: new Date(),
    });
    const saved = await this.sessionRepo.save(session);

    await this.recordEvent({
      userId: params.userId,
      organizationId: orgId,
      eventType: ActivityEventType.LOGIN,
    });

    return saved;
  }

  async heartbeat(userId: string): Promise<void> {
    const now = new Date();
    const session = await this.sessionRepo.findOne({
      where: { userId, isOnline: true },
      order: { loginAt: 'DESC' },
    });
    if (!session) {
      await this.startSession({ userId });
      return;
    }
    const lastSeen = session.lastSeenAt?.getTime() ?? session.loginAt.getTime();
    const gapSec = Math.max(0, Math.floor((now.getTime() - lastSeen) / 1000));
    // Agar gap juda katta bo'lsa (>3 daqiqa), uni online vaqtga qo'shmaymiz
    const addSec = gapSec > 180 ? 0 : gapSec;
    await this.sessionRepo.update(session.id, {
      lastSeenAt: now,
      durationSeconds: session.durationSeconds + addSec,
    });
  }

  async endSession(userId: string, reason: 'logout' | 'timeout' | 'reopened' = 'logout'): Promise<void> {
    await this.closeOpenSessions(userId, reason);
  }

  private async closeOpenSessions(
    userId: string,
    reason: 'logout' | 'timeout' | 'reopened',
  ): Promise<void> {
    const sessions = await this.sessionRepo.find({
      where: { userId, isOnline: true },
    });
    const now = new Date();
    for (const s of sessions) {
      const lastSeen = s.lastSeenAt?.getTime() ?? s.loginAt.getTime();
      const gapSec = Math.floor((now.getTime() - lastSeen) / 1000);
      const addSec = gapSec > 180 ? 0 : gapSec;
      await this.sessionRepo.update(s.id, {
        isOnline: false,
        logoutAt: now,
        durationSeconds: s.durationSeconds + addSec,
      });
    }
    if (sessions.length > 0 && reason === 'logout') {
      await this.recordEvent({
        userId,
        organizationId: sessions[0].organizationId,
        eventType: ActivityEventType.LOGOUT,
      });
    }
  }

  // ---------- AUTO OFFLINE (cron) ----------

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepStaleSessions(): Promise<void> {
    const threshold = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
    const stale = await this.sessionRepo.find({
      where: { isOnline: true, lastSeenAt: LessThan(threshold) },
    });
    for (const s of stale) {
      await this.sessionRepo.update(s.id, {
        isOnline: false,
        logoutAt: s.lastSeenAt,
      });
    }
    if (stale.length > 0) {
      this.logger.debug(`Auto-offline: ${stale.length} session yopildi`);
    }
  }

  // ---------- EVENT RECORDING ----------

  async recordEvent(params: {
    userId: string;
    organizationId?: string | null;
    eventType: ActivityEventType;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<UserActivityEvent> {
    const orgId =
      params.organizationId ?? (await this.resolvePrimaryOrgId(params.userId));
    const event = this.eventRepo.create({
      userId: params.userId,
      organizationId: orgId,
      eventType: params.eventType,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      metadata: params.metadata ?? null,
    });
    return this.eventRepo.save(event);
  }

  // ---------- QUERIES ----------

  async getOnlineUsers(filter: {
    group?: UserGroup;
    organizationId?: string | null;
  }): Promise<OnlineUserDto[]> {
    const qb = this.sessionRepo
      .createQueryBuilder('s')
      .innerJoin(User, 'u', 'u.id = s.user_id')
      .leftJoin(Organization, 'o', 'o.id = s.organization_id')
      .select([
        's.user_id AS "userId"',
        'u.first_name AS "firstName"',
        'u.last_name AS "lastName"',
        'u.email AS "email"',
        'u.role AS "role"',
        's.organization_id AS "organizationId"',
        'o.name AS "organizationName"',
        's.login_at AS "loginAt"',
        's.last_seen_at AS "lastSeenAt"',
        's.duration_seconds AS "durationSeconds"',
      ])
      .where('s.is_online = true');

    if (filter.group === UserGroup.EMPLOYEES) {
      qb.andWhere('u.role = :role', { role: Role.USER });
    } else if (filter.group === UserGroup.MODERATORS) {
      qb.andWhere('u.role = :role', { role: Role.MODERATOR });
    }
    if (filter.organizationId && filter.organizationId !== 'all') {
      qb.andWhere('s.organization_id = :orgId', {
        orgId: filter.organizationId,
      });
    }
    qb.orderBy('s.last_seen_at', 'DESC');
    return qb.getRawMany();
  }

  /**
   * Bitta filial xodimlari uchun online xulosa: hozir online holati, oxirgi
   * online vaqti va bugun / kecha / hafta / oy davomida jami online soniyalar.
   * Bitta grouped query bilan hisoblanadi. Sessiyasi yo'q xodimlar natijada
   * bo'lmaydi — frontend ularni default (offline / 0) sifatida ko'rsatadi.
   */
  async getEmployeesOnlineSummary(filter: {
    organizationId?: string | null;
  }): Promise<EmployeeOnlineSummary[]> {
    const orgId = filter.organizationId;
    if (!orgId || orgId === 'all') return [];

    const now = new Date();
    const todayFrom = new Date(now);
    todayFrom.setHours(0, 0, 0, 0);
    const yesterdayFrom = new Date(todayFrom);
    yesterdayFrom.setDate(yesterdayFrom.getDate() - 1);
    const weekFrom = new Date(now);
    weekFrom.setDate(weekFrom.getDate() - 7);
    const monthFrom = new Date(now);
    monthFrom.setMonth(monthFrom.getMonth() - 1);
    const onlineThreshold = new Date(now.getTime() - OFFLINE_THRESHOLD_MS);

    const rows = await this.sessionRepo
      .createQueryBuilder('s')
      .innerJoin(
        UserOrganization,
        'uo',
        'uo.userId = s.user_id AND uo.organizationId = :orgId',
      )
      .select('s.user_id', 'userId')
      .addSelect(
        'BOOL_OR(s.is_online AND s.last_seen_at >= :onlineThreshold)',
        'isOnline',
      )
      .addSelect('MAX(s.last_seen_at)', 'lastSeenAt')
      .addSelect(
        'COALESCE(SUM(CASE WHEN s.login_at >= :todayFrom THEN s.duration_seconds ELSE 0 END), 0)',
        'todaySeconds',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN s.login_at >= :yesterdayFrom AND s.login_at < :todayFrom THEN s.duration_seconds ELSE 0 END), 0)',
        'yesterdaySeconds',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN s.login_at >= :weekFrom THEN s.duration_seconds ELSE 0 END), 0)',
        'weekSeconds',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN s.login_at >= :monthFrom THEN s.duration_seconds ELSE 0 END), 0)',
        'monthSeconds',
      )
      .groupBy('s.user_id')
      .setParameters({
        orgId,
        onlineThreshold,
        todayFrom,
        yesterdayFrom,
        weekFrom,
        monthFrom,
      })
      .getRawMany<{
        userId: string;
        isOnline: boolean;
        lastSeenAt: Date | null;
        todaySeconds: string;
        yesterdaySeconds: string;
        weekSeconds: string;
        monthSeconds: string;
      }>();

    return rows.map((r) => ({
      userId: r.userId,
      isOnline: Boolean(r.isOnline),
      lastSeenAt: r.lastSeenAt ?? null,
      todaySeconds: Number(r.todaySeconds) || 0,
      yesterdaySeconds: Number(r.yesterdaySeconds) || 0,
      weekSeconds: Number(r.weekSeconds) || 0,
      monthSeconds: Number(r.monthSeconds) || 0,
    }));
  }

  async listUsersWithActivity(filter: {
    group?: UserGroup;
    organizationId?: string | null;
    range?: ActivityRange;
  }): Promise<
    Array<{
      userId: string;
      firstName: string;
      lastName: string;
      middleName: string | null;
      email: string;
      role: Role;
      organizationId: string | null;
      organizationName: string | null;
      isOnline: boolean;
      lastSeenAt: Date | null;
      loginAt: Date | null;
      todayOnlineSeconds: number;
      rangeOnlineSeconds: number;
      lastEventType: string | null;
      lastEventAt: Date | null;
    }>
  > {
    const { from, to } = this.resolveRange(filter.range ?? ActivityRange.DAY);
    const { from: todayFrom, to: todayTo } = this.resolveRange(ActivityRange.DAY);

    const userQb = this.userRepo
      .createQueryBuilder('u')
      .leftJoin(UserOrganization, 'uo', 'uo.userId = u.id')
      .leftJoin(Organization, 'o', 'o.id = uo.organizationId');

    if (filter.group === UserGroup.EMPLOYEES) {
      userQb.where('u.role = :role', { role: Role.USER });
    } else if (filter.group === UserGroup.MODERATORS) {
      userQb.where('u.role = :role', { role: Role.MODERATOR });
    }
    if (filter.organizationId && filter.organizationId !== 'all') {
      userQb.andWhere('uo.organizationId = :orgId', {
        orgId: filter.organizationId,
      });
    }
    userQb.select([
      'u.id AS "userId"',
      'u.first_name AS "firstName"',
      'u.last_name AS "lastName"',
      `(SELECT ne.middle_name FROM nes_employees ne WHERE ne.user_id = u.id LIMIT 1) AS "middleName"`,
      'u.email AS "email"',
      'u.role AS "role"',
      'uo.organizationId AS "organizationId"',
      'o.name AS "organizationName"',
    ]);

    const users = await userQb.getRawMany<{
      userId: string;
      firstName: string;
      lastName: string;
      middleName: string | null;
      email: string;
      role: Role;
      organizationId: string | null;
      organizationName: string | null;
    }>();

    if (users.length === 0) return [];

    const userIds = users.map((u) => u.userId);

    // Hozirgi online status (oxirgi session)
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.user_id IN (:...ids)', { ids: userIds })
      .orderBy('s.login_at', 'DESC')
      .getMany();

    const latestByUser = new Map<string, UserSession>();
    for (const s of sessions) {
      if (!latestByUser.has(s.userId)) latestByUser.set(s.userId, s);
    }

    // Bugungi online soniyalar
    const todayAgg = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.user_id', 'userId')
      .addSelect('SUM(s.duration_seconds)', 'total')
      .where('s.user_id IN (:...ids)', { ids: userIds })
      .andWhere('s.login_at BETWEEN :from AND :to', {
        from: todayFrom,
        to: todayTo,
      })
      .groupBy('s.user_id')
      .getRawMany<{ userId: string; total: string }>();
    const todayMap = new Map(todayAgg.map((r) => [r.userId, Number(r.total)]));

    // Tanlangan range bo'yicha online soniyalar
    const rangeAgg = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.user_id', 'userId')
      .addSelect('SUM(s.duration_seconds)', 'total')
      .where('s.user_id IN (:...ids)', { ids: userIds })
      .andWhere('s.login_at BETWEEN :from AND :to', { from, to })
      .groupBy('s.user_id')
      .getRawMany<{ userId: string; total: string }>();
    const rangeMap = new Map(rangeAgg.map((r) => [r.userId, Number(r.total)]));

    // Oxirgi event
    const lastEvents = await this.eventRepo
      .createQueryBuilder('e')
      .where('e.user_id IN (:...ids)', { ids: userIds })
      .orderBy('e.created_at', 'DESC')
      .getMany();
    const lastEventByUser = new Map<string, UserActivityEvent>();
    for (const ev of lastEvents) {
      if (!lastEventByUser.has(ev.userId)) lastEventByUser.set(ev.userId, ev);
    }

    return users.map((u) => {
      const s = latestByUser.get(u.userId);
      const ev = lastEventByUser.get(u.userId);
      return {
        ...u,
        isOnline: s?.isOnline ?? false,
        lastSeenAt: s?.lastSeenAt ?? null,
        loginAt: s?.loginAt ?? null,
        todayOnlineSeconds: todayMap.get(u.userId) ?? 0,
        rangeOnlineSeconds: rangeMap.get(u.userId) ?? 0,
        lastEventType: ev?.eventType ?? null,
        lastEventAt: ev?.createdAt ?? null,
      };
    });
  }

  async getUserTimeline(
    userId: string,
    limit = 50,
  ): Promise<UserActivityEvent[]> {
    return this.eventRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getUserSessions(
    userId: string,
    range?: ActivityRange,
  ): Promise<UserSession[]> {
    const { from, to } = this.resolveRange(range ?? ActivityRange.MONTH);
    return this.sessionRepo.find({
      where: { userId, loginAt: Between(from, to) },
      order: { loginAt: 'DESC' },
    });
  }

  async getActivityStats(filter: {
    group?: UserGroup;
    organizationId?: string | null;
    range?: ActivityRange;
  }): Promise<{
    onlineNow: number;
    loginsToday: number;
    avgOnlineMinutes: number;
    topBranch: { id: string; name: string; loginCount: number } | null;
    topUser: {
      userId: string;
      name: string;
      onlineSeconds: number;
    } | null;
    leastActiveUser: {
      userId: string;
      name: string;
      onlineSeconds: number;
    } | null;
  }> {
    const users = await this.listUsersWithActivity(filter);
    const onlineNow = users.filter((u) => u.isOnline).length;

    const { from: todayFrom, to: todayTo } = this.resolveRange(ActivityRange.DAY);
    const userIds = users.map((u) => u.userId);

    const loginsToday = userIds.length
      ? await this.eventRepo.count({
          where: {
            eventType: ActivityEventType.LOGIN,
            createdAt: Between(todayFrom, todayTo),
            userId: In(userIds),
          },
        })
      : 0;

    const totalSec = users.reduce((acc, u) => acc + u.rangeOnlineSeconds, 0);
    const avgOnlineMinutes = users.length
      ? Math.round(totalSec / users.length / 60)
      : 0;

    // top branch by today login count
    const branchAgg = new Map<
      string,
      { id: string; name: string; loginCount: number }
    >();
    for (const u of users) {
      if (!u.organizationId) continue;
      const cur = branchAgg.get(u.organizationId) ?? {
        id: u.organizationId,
        name: u.organizationName ?? '—',
        loginCount: 0,
      };
      if (
        u.loginAt &&
        u.loginAt.getTime() >= todayFrom.getTime() &&
        u.loginAt.getTime() <= todayTo.getTime()
      ) {
        cur.loginCount += 1;
      }
      branchAgg.set(u.organizationId, cur);
    }
    const topBranch =
      Array.from(branchAgg.values()).sort(
        (a, b) => b.loginCount - a.loginCount,
      )[0] ?? null;

    const sortedByOnline = [...users].sort(
      (a, b) => b.rangeOnlineSeconds - a.rangeOnlineSeconds,
    );
    const topUser = sortedByOnline[0]
      ? {
          userId: sortedByOnline[0].userId,
          name: `${sortedByOnline[0].firstName} ${sortedByOnline[0].lastName}`.trim(),
          onlineSeconds: sortedByOnline[0].rangeOnlineSeconds,
        }
      : null;
    const least = sortedByOnline[sortedByOnline.length - 1];
    const leastActiveUser =
      least && least.userId !== topUser?.userId
        ? {
            userId: least.userId,
            name: `${least.firstName} ${least.lastName}`.trim(),
            onlineSeconds: least.rangeOnlineSeconds,
          }
        : null;

    return {
      onlineNow,
      loginsToday,
      avgOnlineMinutes,
      topBranch,
      topUser,
      leastActiveUser,
    };
  }

  // ---------- QUESTION STATS (mavjud UserQuestionAttempt asosida) ----------

  async getQuestionStats(filter: {
    userId?: string;
    organizationId?: string | null;
    limit?: number;
  }): Promise<
    Array<{
      questionId: string;
      questionText: string;
      attempts: number;
      wrong: number;
      correct: number;
      wrongRate: number;
      lastAttemptAt: Date | null;
    }>
  > {
    const qb = this.attemptRepo
      .createQueryBuilder('a')
      .innerJoin(Question, 'q', 'q.id = a.question_id')
      .select('a.question_id', 'questionId')
      .addSelect('q.prompt', 'questionText')
      .addSelect('COUNT(*)::int', 'attempts')
      .addSelect(
        'SUM(CASE WHEN a.is_correct = false THEN 1 ELSE 0 END)::int',
        'wrong',
      )
      .addSelect(
        'SUM(CASE WHEN a.is_correct = true THEN 1 ELSE 0 END)::int',
        'correct',
      )
      .addSelect('MAX(a.answered_at)', 'lastAttemptAt')
      .groupBy('a.question_id')
      .addGroupBy('q.prompt')
      .orderBy('wrong', 'DESC')
      .limit(filter.limit ?? 50);

    if (filter.userId) {
      qb.where('a.user_id = :uid', { uid: filter.userId });
    }
    if (filter.organizationId && filter.organizationId !== 'all') {
      qb.andWhere('a.organization_id = :orgId', {
        orgId: filter.organizationId,
      });
    }

    const rows = await qb.getRawMany<{
      questionId: string;
      questionText: string;
      attempts: number;
      wrong: number;
      correct: number;
      lastAttemptAt: Date | null;
    }>();

    return rows.map((r) => ({
      ...r,
      wrongRate: r.attempts > 0 ? Math.round((r.wrong / r.attempts) * 100) : 0,
    }));
  }

  async getUserQuestionAttempts(
    userId: string,
    questionId: string,
  ): Promise<UserQuestionAttempt[]> {
    return this.attemptRepo.find({
      where: { userId, questionId },
      order: { answeredAt: 'DESC' },
    });
  }

  // ---------- HELPERS ----------

  private async resolvePrimaryOrgId(userId: string): Promise<string | null> {
    const uo = await this.userOrgRepo
      .createQueryBuilder('uo')
      .where('uo.userId = :uid', { uid: userId })
      .orderBy('uo.createdAt', 'ASC')
      .getOne();
    return uo?.organization?.id ?? null;
  }

  private resolveRange(range: ActivityRange): { from: Date; to: Date } {
    if (range === ActivityRange.DAY) {
      const { from, to } = tashkentDayBounds(tashkentToday());
      return { from, to: new Date(to.getTime() - 1) };
    }

    const to = new Date();
    const from = new Date(to);
    switch (range) {
      case ActivityRange.WEEK:
        from.setDate(from.getDate() - 7);
        break;
      case ActivityRange.MONTH:
        from.setMonth(from.getMonth() - 1);
        break;
      case ActivityRange.YEAR:
        from.setFullYear(from.getFullYear() - 1);
        break;
      default:
        break;
    }
    return { from, to };
  }
}
