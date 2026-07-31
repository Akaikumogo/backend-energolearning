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
    return this.listByUserId(userId, resolveStoredAvatarUrl(user.avatarUrl));
  }

  async listMine(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return this.listByUserId(userId, resolveStoredAvatarUrl(user.avatarUrl));
  }

  private async listByUserId(userId: string, avatarUrl: string | null) {
    const rows = await this.certificateRepo.find({
      where: { userId },
      order: { issuedAt: 'DESC' },
    });
    return rows.map((row) => this.toFullDto(row, avatarUrl));
  }

  /**
   * Guvohnoma berish mumkinmi — imtihon muvaffaqiyatli yakunlanganmi.
   * UI tugmani shu asosda faollashtiradi.
   */
  async checkEligibility(
    userId: string,
    actor: Actor,
  ): Promise<CertificateEligibility> {
    await this.loadEmployeeInScope(userId, actor);
    const attempt = await this.findPassedAttempt(userId);

    if (!attempt) {
      return {
        eligible: false,
        reason: 'Xodim imtihondan muvaffaqiyatli o‘tmagan',
        examAttemptId: null,
        finalizedAt: null,
      };
    }

    const existing = await this.certificateRepo.findOne({
      where: { examAttemptId: attempt.id },
    });
    if (existing && !existing.revokedAt) {
      return {
        eligible: false,
        reason: 'Bu imtihon uchun guvohnoma allaqachon berilgan',
        examAttemptId: attempt.id,
        finalizedAt: attempt.finalizedAt?.toISOString() ?? null,
      };
    }

    return {
      eligible: true,
      reason: null,
      examAttemptId: attempt.id,
      finalizedAt: attempt.finalizedAt?.toISOString() ?? null,
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
    };
  }

  // ---------------------------------------------------------------- commands

  async issueForUser(
    userId: string,
    actor: Actor,
    options: { examAttemptId?: string } = {},
  ) {
    const user = await this.loadEmployeeInScope(userId, actor);

    const attempt = await this.findPassedAttempt(userId, options.examAttemptId);
    if (!attempt) {
      throw new BadRequestException(
        'Guvohnoma berib bo‘lmaydi: xodim imtihondan muvaffaqiyatli o‘tmagan',
      );
    }

    const existing = await this.certificateRepo.findOne({
      where: { examAttemptId: attempt.id },
    });
    if (existing && !existing.revokedAt) {
      throw new ConflictException(
        `Bu imtihon uchun guvohnoma allaqachon berilgan: ${existing.certificateNumber}`,
      );
    }

    const organizationId =
      attempt.assignment?.organizationId ??
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
        examAttemptId: attempt.id,
        issuedByUserId: actor.id,
        fileUrl: null,
        issuedAt: new Date(),
        validUntil: this.resolveValidUntil(attempt),
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
