import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { User } from '../database/entities/user.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { Level } from '../database/entities/level.entity';

const BADGES = [
  { label: 'Yangi ishchi', bolts: 1 },
  { label: 'Elektrik yordamchi', bolts: 2 },
  { label: 'Elektrik mutaxassis', bolts: 3 },
  { label: 'Senior elektrik', bolts: 4 },
  { label: 'Magistral ekspert', bolts: 5 },
];

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserLevelCompletion) private readonly completionRepo: Repository<UserLevelCompletion>,
    @InjectRepository(UserQuestionAttempt) private readonly attemptRepo: Repository<UserQuestionAttempt>,
    @InjectRepository(Level) private readonly levelRepo: Repository<Level>,
  ) {}

  async findAll(
    requestingUser: { id: string; role: Role; organizationIds: string[] },
    filters: {
      orgId?: string;
      levelId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.organizations', 'uo')
      .leftJoinAndSelect('uo.organization', 'org')
      .where('u.role = :role', { role: Role.USER })
      .orderBy('u.createdAt', 'DESC');

    if (requestingUser.role === Role.MODERATOR) {
      if (requestingUser.organizationIds.length === 0) {
        return { data: [], total: 0, page, limit };
      }
      qb.andWhere('org.id IN (:...modOrgIds)', { modOrgIds: requestingUser.organizationIds });
    }

    if (filters.orgId) {
      qb.andWhere('org.id = :orgId', { orgId: filters.orgId });
    }

    if (filters.search) {
      qb.andWhere(
        '(LOWER(u.first_name) LIKE :q OR LOWER(u.last_name) LIKE :q OR LOWER(u.email) LIKE :q)',
        { q: `%${filters.search.toLowerCase()}%` },
      );
    }

    const total = await qb.getCount();
    const users = await qb.skip((page - 1) * limit).take(limit).getMany();

    const data = await Promise.all(
      users.map((u) => this.toStudentSummary(u, requestingUser)),
    );

    if (filters.levelId) {
      const filtered = data.filter((s) => s.currentLevelId === filters.levelId);
      return { data: filtered, total: filtered.length, page, limit };
    }

    return { data, total, page, limit };
  }

  async findOne(
    id: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
  ) {
    const user = await this.userRepo.findOne({
      where: { id, role: Role.USER },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) throw new NotFoundException('Talaba topilmadi');

    const levels = await this.levelRepo.find({ order: { orderIndex: 'ASC' } });
    const orgIds =
      requestingUser.role === Role.MODERATOR
        ? requestingUser.organizationIds
        : undefined;

    if (requestingUser.role === Role.MODERATOR) {
      const allowed = (user.organizations ?? []).some((uo) =>
        orgIds?.includes(uo.organization?.id ?? ''),
      );
      if (!allowed) throw new NotFoundException('Talaba topilmadi');
    }

    const completions = await this.completionRepo.find({
      where:
        requestingUser.role === Role.MODERATOR && orgIds?.length
          ? { userId: id, organizationId: In(orgIds) }
          : { userId: id },
    });

    // Agar student bir nechta organization'da bo'lsa (MODERATOR uchun ham) bu level
    // bo'yicha eng yuqori completionPercent'ni olamiz.
    const completionMap = new Map<
      string,
      { completionPercent: number; completedAt: Date | null }
    >();
    for (const c of completions) {
      const existing = completionMap.get(c.levelId);
      if (!existing || c.completionPercent > existing.completionPercent) {
        completionMap.set(c.levelId, {
          completionPercent: c.completionPercent,
          completedAt: c.completedAt,
        });
      }
    }

    const correctCount = await this.attemptRepo.count({
      where:
        requestingUser.role === Role.MODERATOR && orgIds?.length
          ? { userId: id, isCorrect: true, organizationId: In(orgIds) }
          : { userId: id, isCorrect: true },
    });
    const wrongCount = await this.attemptRepo.count({
      where:
        requestingUser.role === Role.MODERATOR && orgIds?.length
          ? { userId: id, isCorrect: false, organizationId: In(orgIds) }
          : { userId: id, isCorrect: false },
    });
    const totalXp = correctCount * 10;
    const completedLevels = Array.from(completionMap.values()).filter(
      (c) => c.completionPercent >= 100,
    ).length;
    const badgeIndex = Math.min(completedLevels, BADGES.length - 1);

    const levelProgress = levels.map((level) => {
      const c = completionMap.get(level.id);
      return {
        levelId: level.id,
        title: level.title,
        orderIndex: level.orderIndex,
        completionPercent: c?.completionPercent ?? 0,
        completedAt: c?.completedAt ?? null,
      };
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      organizations:
        requestingUser.role === Role.MODERATOR && orgIds?.length
          ? (user.organizations ?? [])
              .filter((uo) => orgIds.includes(uo.organization?.id ?? ''))
              .map((uo) => ({
                id: uo.organization?.id,
                name: uo.organization?.name,
              }))
          : (user.organizations ?? []).map((uo) => ({
              id: uo.organization?.id,
              name: uo.organization?.name,
            })),
      totalXp,
      completedLevels,
      totalErrors: wrongCount,
      badge: BADGES[badgeIndex],
      levelProgress,
      createdAt: user.createdAt,
    };
  }

  async getLostQuestions(
    studentId: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
  ) {
    const user = await this.userRepo.findOne({
      where: { id: studentId, role: Role.USER },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) throw new NotFoundException('Talaba topilmadi');

    const orgIds =
      requestingUser.role === Role.MODERATOR ? requestingUser.organizationIds : undefined;
    if (requestingUser.role === Role.MODERATOR && orgIds?.length) {
      const allowed = (user.organizations ?? []).some((uo) =>
        orgIds.includes(uo.organization?.id ?? ''),
      );
      // Admin list orqali kirilsa odatda allowed bo'ladi, lekin safety uchun bo'lmasa empty qaytaramiz.
      if (!allowed) return [];
    }

    const rows = await this.attemptRepo
      .createQueryBuilder('a')
      .innerJoin('a.question', 'q')
      .innerJoin('q.level', 'l')
      .innerJoin('q.theory', 't')
      .select('q.id', 'questionId')
      .addSelect('q.prompt', 'prompt')
      .addSelect('l.title', 'levelTitle')
      .addSelect('t.title', 'theoryTitle')
      .addSelect('COUNT(*)', 'totalAttempts')
      .addSelect('SUM(CASE WHEN a.is_correct = false THEN 1 ELSE 0 END)', 'wrongCount')
      .where('a.user_id = :userId', { userId: studentId })
      .andWhere(
        requestingUser.role === Role.MODERATOR && orgIds?.length
          ? 'a.organization_id IN (:...orgIds)'
          : '1=1',
        { orgIds: orgIds ?? [] },
      )
      .groupBy('q.id')
      .addGroupBy('q.prompt')
      .addGroupBy('l.title')
      .addGroupBy('t.title')
      .having('SUM(CASE WHEN a.is_correct = false THEN 1 ELSE 0 END) >= 2')
      .orderBy('"wrongCount"', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      questionId: r.questionId,
      prompt: r.prompt,
      levelTitle: r.levelTitle,
      theoryTitle: r.theoryTitle,
      wrongCount: parseInt(r.wrongCount, 10),
      totalAttempts: parseInt(r.totalAttempts, 10),
    }));
  }

  async getActivity(
    studentId: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
  ) {
    const user = await this.userRepo.findOne({
      where: { id: studentId, role: Role.USER },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) throw new NotFoundException('Talaba topilmadi');

    const since = new Date();
    since.setDate(since.getDate() - 27);
    since.setHours(0, 0, 0, 0);

    const orgIds =
      requestingUser.role === Role.MODERATOR ? requestingUser.organizationIds : undefined;

    // Moderator uchun allowance check: agar talaba ularning organization'lardan biriga tegishli bo'lmasa, empty heatmap qaytaramiz.
    if (requestingUser.role === Role.MODERATOR && orgIds?.length) {
      // attempts query ham org bilan kesiladi (quyida), lekin membership check uchun relations kerak bo'ladi.
      const allowed = (user.organizations ?? []).some((uo) =>
        orgIds.includes(uo.organization?.id ?? ''),
      );
      if (!allowed) {
        const result: { date: string; count: number }[] = [];
        for (let i = 0; i < 28; i++) {
          const d = new Date(since);
          d.setDate(since.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          result.push({ date: key, count: 0 });
        }
        return result;
      }
    }

    const rows = await this.attemptRepo
      .createQueryBuilder('a')
      .select("TO_CHAR(a.answered_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('a.user_id = :userId', { userId: studentId })
      .andWhere(
        requestingUser.role === Role.MODERATOR && orgIds?.length
          ? 'a.organization_id IN (:...orgIds)'
          : '1=1',
        { orgIds: orgIds ?? [] },
      )
      .andWhere('a.answered_at >= :since', { since })
      .groupBy("TO_CHAR(a.answered_at, 'YYYY-MM-DD')")
      .orderBy('"date"', 'ASC')
      .getRawMany();

    const result: { date: string; count: number }[] = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const found = rows.find((r) => r.date === key);
      result.push({ date: key, count: found ? parseInt(found.count, 10) : 0 });
    }

    return result;
  }

  private async toStudentSummary(
    user: User,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
  ) {
    const orgIds =
      requestingUser.role === Role.MODERATOR ? requestingUser.organizationIds : undefined;

    const completions = await this.completionRepo.find({
      where:
        requestingUser.role === Role.MODERATOR && orgIds?.length
          ? { userId: user.id, organizationId: In(orgIds) }
          : { userId: user.id },
    });

    const correctCount = await this.attemptRepo.count({
      where:
        requestingUser.role === Role.MODERATOR && orgIds?.length
          ? { userId: user.id, isCorrect: true, organizationId: In(orgIds) }
          : { userId: user.id, isCorrect: true },
    });
    const totalXp = correctCount * 10;
    const levels = await this.levelRepo.find({ order: { orderIndex: 'ASC' } });
    let currentLevelId: string | null = null;
    let currentLevelTitle: string | null = null;
    const completionMap = new Map<
      string,
      { completionPercent: number; completedAt: Date | null }
    >();
    for (const c of completions) {
      const existing = completionMap.get(c.levelId);
      if (!existing || c.completionPercent > existing.completionPercent) {
        completionMap.set(c.levelId, {
          completionPercent: c.completionPercent,
          completedAt: c.completedAt,
        });
      }
    }

    const completedLevels = Array.from(completionMap.values()).filter(
      (c) => c.completionPercent >= 100,
    ).length;
    const badgeIndex = Math.min(completedLevels, BADGES.length - 1);
    for (const level of levels) {
      const c = completionMap.get(level.id);
      if (!c || c.completionPercent < 100) {
        currentLevelId = level.id;
        currentLevelTitle = level.title;
        break;
      }
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      completedLevels,
      totalXp,
      currentLevelId,
      currentLevelTitle,
      badge: BADGES[badgeIndex],
      organizations:
        requestingUser.role === Role.MODERATOR && orgIds?.length
          ? (user.organizations ?? [])
              .filter((uo) => orgIds.includes(uo.organization?.id ?? ''))
              .map((uo) => ({
                id: uo.organization?.id,
                name: uo.organization?.name,
              }))
          : (user.organizations ?? []).map((uo) => ({
              id: uo.organization?.id,
              name: uo.organization?.name,
            })),
    };
  }
}
