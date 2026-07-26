import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Brackets, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Role } from '../common/enums/role.enum';
import {
  listTashkentDays,
  parseTashkentRange,
  tashkentToday,
} from '../common/utils/tashkent-time.util';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { User } from '../database/entities/user.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { Level } from '../database/entities/level.entity';
import { EmployeeCertificate } from '../database/entities/employee-certificate.entity';
import { EmployeeCheck } from '../database/entities/employee-check.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { EmployeeCheckType } from '../common/enums/employee-check-type.enum';
import {
  splitSearchTokens,
  variantsForSearchToken,
} from '../common/utils/latinize-search.util';
import { extractPersonnelNumberFromLogin } from '../common/utils/personnel-number.util';

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
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserLevelCompletion)
    private readonly completionRepo: Repository<UserLevelCompletion>,
    @InjectRepository(UserQuestionAttempt)
    private readonly attemptRepo: Repository<UserQuestionAttempt>,
    @InjectRepository(Level) private readonly levelRepo: Repository<Level>,
    @InjectRepository(EmployeeCertificate)
    private readonly employeeCertRepo: Repository<EmployeeCertificate>,
    @InjectRepository(EmployeeCheck)
    private readonly employeeCheckRepo: Repository<EmployeeCheck>,
    @InjectRepository(NesEmployee)
    private readonly nesEmployeeRepo: Repository<NesEmployee>,
  ) {}

  async createStudent(
    requestingUser: { id: string; role: Role; organizationIds: string[] },
    dto: {
      email: string;
      firstName: string;
      lastName: string;
      password: string;
      organizationId?: string;
    },
  ) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new BadRequestException('Bu email allaqachon mavjud');

    if (requestingUser.role === Role.MODERATOR) {
      if (!dto.organizationId) {
        throw new ForbiddenException('Moderator uchun organizationId majburiy');
      }
      const scopedOrgIds =
        (await this.organizationsService.resolveModeratorScope(
          requestingUser.organizationIds,
        )) ?? null;

      if (scopedOrgIds && scopedOrgIds.length === 0) {
        throw new ForbiddenException('Ruxsat yo`q');
      }
      if (scopedOrgIds && !scopedOrgIds.includes(dto.organizationId)) {
        throw new ForbiddenException('Ruxsat yo`q');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      organizationId: dto.organizationId,
    });

    return this.findOne(user.id, requestingUser);
  }

  async deleteStudent(
    studentId: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
  ) {
    await this.findOne(studentId, requestingUser);
    await this.usersService.removeUser(studentId);
  }

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
      .andWhere('u.energo_id IS NOT NULL')
      .orderBy('u.createdAt', 'DESC');

    if (requestingUser.role === Role.MODERATOR) {
      const scopedOrgIds =
        (await this.organizationsService.resolveModeratorScope(
          requestingUser.organizationIds,
        )) ?? null;

      // default-org moderator => scopedOrgIds === null meaning no filter
      if (scopedOrgIds && scopedOrgIds.length === 0) {
        return { data: [], total: 0, page, limit };
      }
      if (scopedOrgIds) {
        qb.andWhere('org.id IN (:...modOrgIds)', { modOrgIds: scopedOrgIds });
      }
    }

    if (filters.orgId) {
      qb.andWhere('org.id = :orgId', { orgId: filters.orgId });
    }

    if (filters.search) {
      const rawTokens = splitSearchTokens(filters.search);
      rawTokens.forEach((rawToken, i) => {
        const variants = variantsForSearchToken(rawToken);
        qb.andWhere(
          new Brackets((outer) => {
            variants.forEach((token, j) => {
              const key = `searchTok${i}_${j}`;
              outer.orWhere(
                `(
                  LOWER(u.first_name) LIKE :${key}
                  OR LOWER(u.last_name) LIKE :${key}
                  OR LOWER(u.email) LIKE :${key}
                  OR LOWER(CONCAT(u.last_name, ' ', u.first_name)) LIKE :${key}
                  OR LOWER(CONCAT(u.first_name, ' ', u.last_name)) LIKE :${key}
                  OR LOWER(org.name) LIKE :${key}
                  OR EXISTS (
                    SELECT 1 FROM nes_employees nes
                    WHERE nes.user_id = u.id
                    AND (
                      LOWER(nes.login) LIKE :${key}
                      OR LOWER(nes.personnel_number) LIKE :${key}
                      OR LOWER(nes.full_name) LIKE :${key}
                    )
                  )
                )`,
                { [key]: `%${token}%` },
              );
            });
          }),
        );
      });
    }

    const total = await qb.getCount();
    const users = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

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
    if (!user || !user.energoId) {
      throw new NotFoundException('Xodim topilmadi');
    }

    const levels = await this.levelRepo.find({ order: { orderIndex: 'ASC' } });
    const orgIds =
      requestingUser.role === Role.MODERATOR
        ? await this.organizationsService.resolveModeratorScope(
            requestingUser.organizationIds,
          )
        : undefined;

    if (requestingUser.role === Role.MODERATOR) {
      const allowed = (user.organizations ?? []).some((uo) =>
        orgIds ? orgIds.includes(uo.organization?.id ?? '') : true,
      );
      if (!allowed) throw new NotFoundException('Xodim topilmadi');
    }

    const completions = await this.completionRepo.find({
      where:
        requestingUser.role === Role.MODERATOR && orgIds && orgIds.length
          ? { userId: id, organizationId: In(orgIds) }
          : { userId: id },
    });

    // Agar xodim bir nechta organization'da bo'lsa (MODERATOR uchun ham) bu level
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
        requestingUser.role === Role.MODERATOR && orgIds && orgIds.length
          ? { userId: id, isCorrect: true, organizationId: In(orgIds) }
          : { userId: id, isCorrect: true },
    });
    const wrongCount = await this.attemptRepo.count({
      where:
        requestingUser.role === Role.MODERATOR && orgIds && orgIds.length
          ? { userId: id, isCorrect: false, organizationId: In(orgIds) }
          : { userId: id, isCorrect: false },
    });

    const uniqueCorrectQb = this.attemptRepo
      .createQueryBuilder('a')
      .select('COUNT(DISTINCT a.question_id)', 'cnt')
      .where('a.user_id = :userId', { userId: id })
      .andWhere('a.is_correct = true');
    if (requestingUser.role === Role.MODERATOR && orgIds && orgIds.length) {
      uniqueCorrectQb.andWhere('a.organization_id IN (:...orgIds)', { orgIds });
    }
    const uniqueCorrectRow = await uniqueCorrectQb.getRawOne<{ cnt: string }>();
    const uniqueCorrectQuestions = Number(uniqueCorrectRow?.cnt ?? 0);

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
        requestingUser.role === Role.MODERATOR && orgIds && orgIds.length
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
      correctAnswers: correctCount,
      uniqueCorrectQuestions,
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
    if (!user || !user.energoId) {
      throw new NotFoundException('Xodim topilmadi');
    }

    const orgIds =
      requestingUser.role === Role.MODERATOR
        ? await this.organizationsService.resolveModeratorScope(
            requestingUser.organizationIds,
          )
        : undefined;
    if (requestingUser.role === Role.MODERATOR && orgIds && orgIds.length) {
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
      .addSelect(
        'SUM(CASE WHEN a.is_correct = false THEN 1 ELSE 0 END)',
        'wrongCount',
      )
      .where('a.user_id = :userId', { userId: studentId })
      .andWhere(
        requestingUser.role === Role.MODERATOR && orgIds && orgIds.length
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

  /**
   * XP tarixi: har bir to‘g‘ri javob = +10 XP (reyting bilan bir xil formula).
   * Shikoyatlar uchun: qachon, qaysi savol, necha ball.
   */
  async getXpHistory(
    studentId: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
    filters?: { page?: number; limit?: number; onlyCorrect?: boolean },
  ) {
    const user = await this.userRepo.findOne({
      where: { id: studentId, role: Role.USER },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user || !user.energoId) {
      throw new NotFoundException('Xodim topilmadi');
    }

    const orgIds =
      requestingUser.role === Role.MODERATOR
        ? await this.organizationsService.resolveModeratorScope(
            requestingUser.organizationIds,
          )
        : undefined;
    if (requestingUser.role === Role.MODERATOR && orgIds && orgIds.length) {
      const allowed = (user.organizations ?? []).some((uo) =>
        orgIds.includes(uo.organization?.id ?? ''),
      );
      if (!allowed) {
        return { data: [], total: 0, page: 1, limit: 20, totalXp: 0, correctAnswers: 0 };
      }
    }

    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters?.limit ?? 30));
    const onlyCorrect = filters?.onlyCorrect !== false;

    const qb = this.attemptRepo
      .createQueryBuilder('a')
      .innerJoin('a.question', 'q')
      .leftJoin('q.level', 'l')
      .leftJoin('q.theory', 't')
      .where('a.user_id = :userId', { userId: studentId });

    if (onlyCorrect) {
      qb.andWhere('a.is_correct = true');
    }
    if (requestingUser.role === Role.MODERATOR && orgIds && orgIds.length) {
      qb.andWhere('a.organization_id IN (:...orgIds)', { orgIds });
    }

    const total = await qb.clone().getCount();

    const rows = await qb
      .select([
        'a.id AS "id"',
        'a.is_correct AS "isCorrect"',
        'a.answered_at AS "answeredAt"',
        'q.id AS "questionId"',
        'q.prompt AS "prompt"',
        'l.title AS "levelTitle"',
        't.title AS "theoryTitle"',
      ])
      .orderBy('a.answered_at', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        id: string;
        isCorrect: boolean;
        answeredAt: Date | string;
        questionId: string;
        prompt: string;
        levelTitle: string | null;
        theoryTitle: string | null;
      }>();

    const data = rows.map((r) => {
      const isCorrect = Boolean(r.isCorrect);
      return {
        id: r.id,
        questionId: r.questionId,
        prompt: r.prompt ?? '',
        levelTitle: r.levelTitle ?? '—',
        theoryTitle: r.theoryTitle ?? '—',
        isCorrect,
        xpEarned: isCorrect ? 10 : 0,
        answeredAt:
          r.answeredAt instanceof Date
            ? r.answeredAt.toISOString()
            : new Date(r.answeredAt).toISOString(),
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalXp: total * (onlyCorrect ? 10 : 0),
      correctAnswers: onlyCorrect ? total : data.filter((d) => d.isCorrect).length,
    };
  }

  async getActivity(
    studentId: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
  ) {
    const user = await this.userRepo.findOne({
      where: { id: studentId, role: Role.USER },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user || !user.energoId) {
      throw new NotFoundException('Xodim topilmadi');
    }

    const { from: since, to: rangeTo, fromStr, toStr } = parseTashkentRange(
      undefined,
      tashkentToday(),
      28,
    );
    const dayKeys = listTashkentDays(fromStr, toStr);

    const orgIds =
      requestingUser.role === Role.MODERATOR
        ? await this.organizationsService.resolveModeratorScope(
            requestingUser.organizationIds,
          )
        : undefined;

    // Moderator uchun allowance check: agar xodim ularning organization'lardan biriga tegishli bo'lmasa, empty heatmap qaytaramiz.
    if (requestingUser.role === Role.MODERATOR && orgIds && orgIds.length) {
      // attempts query ham org bilan kesiladi (quyida), lekin membership check uchun relations kerak bo'ladi.
      const allowed = (user.organizations ?? []).some((uo) =>
        orgIds.includes(uo.organization?.id ?? ''),
      );
      if (!allowed) {
        return dayKeys.map((date) => ({ date, count: 0 }));
      }
    }

    const rows = await this.attemptRepo
      .createQueryBuilder('a')
      .select("TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('a.user_id = :userId', { userId: studentId })
      .andWhere(
        requestingUser.role === Role.MODERATOR && orgIds && orgIds.length
          ? 'a.organization_id IN (:...orgIds)'
          : '1=1',
        { orgIds: orgIds ?? [] },
      )
      .andWhere('a.answered_at >= :since AND a.answered_at < :rangeTo', { since, rangeTo })
      .groupBy("TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')")
      .orderBy('"date"', 'ASC')
      .getRawMany();

    const countByDate = new Map(rows.map((r) => [r.date, Number(r.count) || 0]));
    return dayKeys.map((date) => ({ date, count: countByDate.get(date) ?? 0 }));
  }

  async getEmployeeCertificate(
    studentId: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
  ) {
    await this.findOne(studentId, requestingUser);
    return this.employeeCertRepo.findOne({
      where: { userId: studentId },
      relations: ['organization', 'createdByUser'],
    });
  }

  async upsertEmployeeCertificate(
    studentId: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
    body: {
      organizationId: string;
      positionTitle: string;
      certificateNumber: string;
      presentedByFullName: string;
    },
  ) {
    await this.findOne(studentId, requestingUser);

    const existing = await this.employeeCertRepo.findOne({
      where: { userId: studentId },
    });

    const row = this.employeeCertRepo.create({
      ...(existing ?? {}),
      userId: studentId,
      organizationId: body.organizationId,
      positionTitle: body.positionTitle,
      certificateNumber: body.certificateNumber,
      presentedByFullName: body.presentedByFullName,
      createdByUserId: existing?.createdByUserId ?? requestingUser.id,
    });
    return this.employeeCertRepo.save(row);
  }

  async listEmployeeChecks(
    studentId: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
    type?: EmployeeCheckType,
  ) {
    await this.findOne(studentId, requestingUser);
    const where: any = { userId: studentId };
    if (type) where.type = type;
    return this.employeeCheckRepo.find({
      where,
      order: { checkDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async createEmployeeCheck(
    studentId: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
    dto: Partial<EmployeeCheck>,
  ) {
    await this.findOne(studentId, requestingUser);
    const row = this.employeeCheckRepo.create({
      ...dto,
      userId: studentId,
      createdByUserId: requestingUser.id,
    });
    return this.employeeCheckRepo.save(row);
  }

  async updateEmployeeCheck(
    studentId: string,
    checkId: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
    dto: Partial<EmployeeCheck>,
  ) {
    await this.findOne(studentId, requestingUser);
    const existing = await this.employeeCheckRepo.findOne({
      where: { id: checkId, userId: studentId },
    });
    if (!existing) throw new NotFoundException('Tekshiruv topilmadi');
    return this.employeeCheckRepo.save({ ...existing, ...dto });
  }

  async deleteEmployeeCheck(
    studentId: string,
    checkId: string,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
  ) {
    await this.findOne(studentId, requestingUser);
    const existing = await this.employeeCheckRepo.findOne({
      where: { id: checkId, userId: studentId },
    });
    if (!existing) return;
    await this.employeeCheckRepo.remove(existing);
  }

  private async toStudentSummary(
    user: User,
    requestingUser: { id: string; role: Role; organizationIds: string[] },
  ) {
    const orgIds =
      requestingUser.role === Role.MODERATOR
        ? await this.organizationsService.resolveModeratorScope(
            requestingUser.organizationIds,
          )
        : undefined;

    const completions = await this.completionRepo.find({
      where:
        requestingUser.role === Role.MODERATOR && orgIds && orgIds.length
          ? { userId: user.id, organizationId: In(orgIds) }
          : { userId: user.id },
    });

    const correctCount = await this.attemptRepo.count({
      where:
        requestingUser.role === Role.MODERATOR && orgIds && orgIds.length
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
    const nesEmployee = await this.nesEmployeeRepo.findOne({
      where: { userId: user.id },
      select: ['personnelNumber'],
    });
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
      personnelNumber:
        nesEmployee?.personnelNumber ??
        extractPersonnelNumberFromLogin(user.email) ??
        null,
      completedLevels,
      totalXp,
      currentLevelId,
      currentLevelTitle,
      badge: BADGES[badgeIndex],
      organizations:
        requestingUser.role === Role.MODERATOR && orgIds && orgIds.length
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
