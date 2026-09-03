import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Certificate } from '../database/entities/certificate.entity';
import { ExamAttempt } from '../database/entities/exam-attempt.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { Organization } from '../database/entities/organization.entity';
import { User } from '../database/entities/user.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { resolveStoredAvatarUrl } from '../common/avatar-url.util';
import { extractPersonnelNumberFromLogin } from '../common/utils/personnel-number.util';
import { OralResult } from '../common/enums/oral-result.enum';
import { REPORTING_ROLES, Role } from '../common/enums/role.enum';
import {
  buildVerifyUrl,
  formatCertificateNumber,
  resolveCertificatePrefix,
} from './certificate-number.util';

type Actor = { id: string; role: Role; organizationIds: string[] };

export type CertificateStatus = 'VALID' | 'EXPIRED' | 'REVOKED';

/** Guvohnomasi bo'lmasa ham xodim uchun qaytariladigan holat. */
export interface CertificateEligibility {
  eligible: boolean;
  reason: string | null;
  examAttemptId: string | null;
  finalizedAt: string | null;
}

const ORG_TITLE = '«O‘zbekiston milliy elektr tarmoqlari» AJ';
const DEFAULT_VALID_MONTHS = 12;
const ENERGO_PORTAL_ORIGIN =
  process.env.ENERGO_USER_PORTAL_URL?.trim() ||
  'https://cabinetid.uzbekistonmet.uz';

@Injectable()
export class CertificatesService {
  constructor(
    @InjectRepository(Certificate)
    private readonly certificateRepo: Repository<Certificate>,
    @InjectRepository(ExamAttempt)
    private readonly attemptRepo: Repository<ExamAttempt>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(NesEmployee)
    private readonly nesEmployeeRepo: Repository<NesEmployee>,
    @InjectRepository(Organization)
    private readonly organizationRepo: Repository<Organization>,
    private readonly organizationsService: OrganizationsService,
  ) {}

  // ---------------------------------------------------------------- queries

  async listForUser(userId: string, actor: Actor) {
    const user = await this.loadEmployeeInScope(userId, actor);
    return [await this.buildEnergoIdCard(user)];
  }

  /** Mobil: ENERGO ID kartasi — generatsiyasiz, har doim. */
  async listMine(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return [await this.buildEnergoIdCard(user)];
  }

  private async buildEnergoIdCard(user: User) {
    const nes = await this.nesEmployeeRepo.findOne({
      where: { userId: user.id },
    });

    const org = user.organizations?.[0]?.organization ?? null;

    const branchName =
      org?.name?.trim() || nes?.organizationName?.trim() || '';
    const lastName = user.lastName?.trim() ?? '';
    const firstName = user.firstName?.trim() ?? '';
    const middleName = nes?.middleName?.trim() || '';
    const personnelNumber =
      nes?.personnelNumber?.trim() ||
      extractPersonnelNumberFromLogin(user.email) ||
      null;
    const prefix = resolveCertificatePrefix(branchName);
    const digits = this.energoCardDigits(personnelNumber, user);
    const certificateNumber = `${prefix}${digits}`;
    const publicId = user.energoId?.trim() || user.id;
    const issuedAt =
      user.createdAt instanceof Date
        ? user.createdAt
        : user.createdAt
          ? new Date(user.createdAt)
          : new Date();
    const validUntil = new Date(
      Number.isNaN(issuedAt.getTime()) ? Date.now() : issuedAt.getTime(),
    );
    validUntil.setFullYear(validUntil.getFullYear() + 2);

    return {
      id: `energo-card-${user.id}`,
      certificateNumber,
      userId: user.id,
      organizationId: org?.id ?? '',
      organizationTitle: ORG_TITLE,
      branchName,
      fullName: [lastName, firstName, middleName].filter(Boolean).join(' '),
      lastName,
      firstName,
      middleName,
      positionTitle: nes?.post?.trim() || '',
      personnelNumber,
      examAttemptId: null,
      issuedAt: (Number.isNaN(issuedAt.getTime()) ? new Date() : issuedAt).toISOString(),
      validUntil: validUntil.toISOString(),
      revokedAt: null,
      revokeReason: null,
      status: 'VALID' as CertificateStatus,
      verifyUrl: `${ENERGO_PORTAL_ORIGIN.replace(/\/+$/, '')}/public/${encodeURIComponent(publicId)}`,
      avatarUrl: resolveStoredAvatarUrl(user.avatarUrl),
    };
  }

  private energoCardDigits(
    personnelNumber: string | null,
    user: User,
  ): string {
    const personnel = (personnelNumber ?? '').replace(/\D/g, '');
    if (personnel) return personnel.slice(-4).padStart(4, '0');

    const src = user.email || user.energoId || user.id || '';
    let hash = 0;
    for (let i = 0; i < src.length; i += 1) {
      hash = (hash * 31 + src.charCodeAt(i)) % 10000;
    }
    return String(hash).padStart(4, '0');
  }

  private async listByUserId(userId: string, avatarUrl: string | null) {
    const rows = await this.certificateRepo.find({
      where: { userId },
      order: { issuedAt: 'DESC' },
    });
    return rows.map((row) => this.toFullDto(row, avatarUrl));
  }

  /**
   * Guvohnoma berish mumkinmi.
   * Admin har qanday vaziyatda berishi mumkin — imtihon shart emas.
   */
  async checkEligibility(
    userId: string,
    actor: Actor,
  ): Promise<CertificateEligibility> {
    await this.loadEmployeeInScope(userId, actor);
    const attempt = await this.findPassedAttempt(userId);

    return {
      eligible: true,
      reason: null,
      examAttemptId: attempt?.id ?? null,
      finalizedAt: attempt?.finalizedAt?.toISOString() ?? null,
    };
  }

  /** Ochiq (autentifikatsiyasiz) tekshiruv — minimal ma'lumot. */
  async verifyByNumber(certificateNumber: string) {
    const row = await this.certificateRepo.findOne({
      where: { certificateNumber: certificateNumber.trim().toUpperCase() },
    });

    if (!row) {
      return { found: false as const };
    }

    return {
      found: true as const,
      certificateNumber: row.certificateNumber,
      fullName: row.fullName,
      positionTitle: row.positionTitle,
      branchName: row.branchName,
      organizationTitle: ORG_TITLE,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      validUntil: row.validUntil?.toISOString() ?? null,
      status: this.resolveStatus(row),
      avatarUrl: null as string | null,
      personnelNumber: row.personnelNumber,
    };
  }

  /** QR /public/{energoId} yoki user id orqali ochiq guvohnoma. */
  async getPublicIdCard(energoOrUserId: string) {
    const id = energoOrUserId.trim();
    // `users.id` va `users.energo_id` UUID — noto'g'ri format Postgres 22P02 → 500 beradi.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!id || !UUID_RE.test(id)) {
      throw new NotFoundException('Xodim topilmadi');
    }

    let user = await this.userRepo.findOne({
      where: { energoId: id },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) {
      user = await this.userRepo.findOne({
        where: { id },
        relations: ['organizations', 'organizations.organization'],
      });
    }
    if (!user) throw new NotFoundException('Xodim topilmadi');

    const card = await this.buildEnergoIdCard(user);
    return {
      found: true as const,
      certificateNumber: card.certificateNumber,
      fullName: card.fullName,
      lastName: card.lastName,
      firstName: card.firstName,
      middleName: card.middleName,
      positionTitle: card.positionTitle,
      branchName: card.branchName,
      organizationTitle: card.organizationTitle,
      issuedAt: card.issuedAt,
      validUntil: card.validUntil,
      status: card.status,
      avatarUrl: card.avatarUrl,
      personnelNumber: card.personnelNumber,
      verifyUrl: card.verifyUrl,
    };
  }

  // ---------------------------------------------------------------- commands

  async issueForUser(
    userId: string,
    actor: Actor,
    options: { examAttemptId?: string } = {},
  ) {
    const user = await this.loadEmployeeInScope(userId, actor);

    // Imtihon bo‘lsa — muddat/filial undan; bo‘lmasa ham guvohnoma beriladi.
    const attempt = await this.findPassedAttempt(userId, options.examAttemptId);

    const organizationId =
      attempt?.assignment?.organizationId ??
      user.organizations?.[0]?.organization?.id;
    if (!organizationId) {
      throw new BadRequestException('Xodimning filiali aniqlanmadi');
    }

    const organization = await this.organizationRepo.findOne({
      where: { id: organizationId },
    });
    const nes = await this.nesEmployeeRepo.findOne({
      where: { userId },
      select: ['personnelNumber', 'post', 'middleName', 'organizationName'],
    });

    const lastName = user.lastName?.trim() ?? '';
    const firstName = user.firstName?.trim() ?? '';
    const middleName = nes?.middleName?.trim() ?? '';
    const branchName =
      organization?.name?.trim() || nes?.organizationName?.trim() || '';

    const prefix = resolveCertificatePrefix(branchName);
    const certificateNumber = await this.nextCertificateNumber(prefix);

    // Unique index: bir imtihonga faqat bitta bog‘lanish — takror bo‘lsa null.
    let examAttemptId: string | null = attempt?.id ?? null;
    if (examAttemptId) {
      const alreadyLinked = await this.certificateRepo.findOne({
        where: { examAttemptId },
      });
      if (alreadyLinked) {
        examAttemptId = null;
      }
    }

    const saved = await this.certificateRepo.save(
      this.certificateRepo.create({
        certificateNumber,
        userId,
        organizationId,
        levelId: null,
        fullName: [lastName, firstName, middleName].filter(Boolean).join(' '),
        lastName,
        firstName,
        middleName,
        positionTitle: nes?.post?.trim() || '',
        branchName,
        personnelNumber: nes?.personnelNumber?.trim() || null,
        examAttemptId,
        issuedByUserId: actor.id,
        fileUrl: null,
        issuedAt: new Date(),
        validUntil: attempt
          ? this.resolveValidUntil(attempt)
          : this.defaultValidUntil(),
        revokedAt: null,
        revokeReason: null,
      }),
    );

    return this.toFullDto(saved, resolveStoredAvatarUrl(user.avatarUrl));
  }

  async revoke(id: string, actor: Actor, reason?: string) {
    const row = await this.certificateRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Guvohnoma topilmadi');

    await this.loadEmployeeInScope(row.userId, actor);

    if (row.revokedAt) {
      throw new ConflictException('Guvohnoma allaqachon bekor qilingan');
    }

    row.revokedAt = new Date();
    row.revokeReason = reason?.trim() || null;
    await this.certificateRepo.save(row);

    return this.toFullDto(row);
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Raqamni filial prefiksi bo'yicha ketma-ket beradi.
   * INSERT ... ON CONFLICT DO UPDATE atomar — bir vaqtda bir necha moderator
   * guvohnoma bersa ham raqamlar takrorlanmaydi.
   */
  private async nextCertificateNumber(prefix: string): Promise<string> {
    const rows = await this.certificateRepo.manager.query<
      { last_number: number | string }[]
    >(
      `INSERT INTO certificate_number_counters ("prefix", "last_number", "updated_at")
       VALUES ($1, 1, now())
       ON CONFLICT ("prefix") DO UPDATE
         SET "last_number" = certificate_number_counters."last_number" + 1,
             "updated_at" = now()
       RETURNING "last_number"`,
      [prefix],
    );

    const sequence = Number(rows?.[0]?.last_number ?? 1);
    return formatCertificateNumber(prefix, sequence);
  }

  /** Og'zaki bosqich "qoniqarli" va urinish yakunlangan bo'lishi shart. */
  private async findPassedAttempt(userId: string, attemptId?: string) {
    const qb = this.attemptRepo
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.assignment', 'asn')
      .where('asn.user_id = :userId', { userId })
      .andWhere('a.oral_result = :result', {
        result: OralResult.SATISFACTORY,
      })
      .andWhere('a.finalized_at IS NOT NULL')
      .orderBy('a.finalized_at', 'DESC')
      .limit(1);

    if (attemptId) {
      qb.andWhere('a.id = :attemptId', { attemptId });
    }

    return qb.getOne();
  }

  private resolveValidUntil(attempt: ExamAttempt): Date {
    const base = attempt.finalizedAt ?? new Date();
    const months =
      attempt.nextExamMonths && attempt.nextExamMonths > 0
        ? attempt.nextExamMonths
        : DEFAULT_VALID_MONTHS;

    const until = new Date(base);
    until.setMonth(until.getMonth() + months);
    return until;
  }

  private defaultValidUntil(): Date {
    const until = new Date();
    until.setMonth(until.getMonth() + DEFAULT_VALID_MONTHS);
    return until;
  }

  private resolveStatus(row: Certificate): CertificateStatus {
    if (row.revokedAt) return 'REVOKED';
    if (row.validUntil && row.validUntil.getTime() < Date.now()) {
      return 'EXPIRED';
    }
    return 'VALID';
  }

  /** Xodim mavjudmi va so'rovchi moderator uni ko'ra oladimi. */
  private async loadEmployeeInScope(userId: string, actor: Actor) {
    const user = await this.userRepo.findOne({
      where: { id: userId, role: In([...REPORTING_ROLES]) },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) throw new NotFoundException('Xodim topilmadi');

    if (actor.role === Role.MODERATOR) {
      const scope = await this.organizationsService.resolveModeratorScope(
        actor.organizationIds,
      );
      if (scope && scope.length) {
        const allowed = (user.organizations ?? []).some((uo) =>
          scope.includes(uo.organization?.id ?? ''),
        );
        if (!allowed) throw new NotFoundException('Xodim topilmadi');
      }
    }

    return user;
  }

  private toFullDto(row: Certificate, avatarUrl: string | null = null) {
    return {
      id: row.id,
      certificateNumber: row.certificateNumber,
      userId: row.userId,
      organizationId: row.organizationId,
      organizationTitle: ORG_TITLE,
      branchName: row.branchName,
      fullName: row.fullName,
      lastName: row.lastName,
      firstName: row.firstName,
      middleName: row.middleName,
      positionTitle: row.positionTitle,
      personnelNumber: row.personnelNumber,
      examAttemptId: row.examAttemptId,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      validUntil: row.validUntil?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      revokeReason: row.revokeReason,
      status: this.resolveStatus(row),
      verifyUrl: buildVerifyUrl(row.certificateNumber),
      avatarUrl,
    };
  }
}
