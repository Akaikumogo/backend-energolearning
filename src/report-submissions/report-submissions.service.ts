import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import {
  ReportSubmission,
  ReportSubmissionEmployeeRow,
  ReportSubmissionPayload,
  ReportIntegrityStatus,
} from '../database/entities/report-submission.entity';
import { Organization } from '../database/entities/organization.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { BranchAnalyticsService } from '../branch-analytics/branch-analytics.service';
import { verifyReportContentHash } from './report-integrity.util';

type AuthUser = {
  id: string;
  role: Role;
  organizationIds: string[];
};

@Injectable()
export class ReportSubmissionsService {
  constructor(
    @InjectRepository(ReportSubmission)
    private readonly submissionRepo: Repository<ReportSubmission>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    private readonly orgService: OrganizationsService,
    private readonly analyticsService: BranchAnalyticsService,
  ) {}

  async assertCanCompare(user: AuthUser) {
    if (user.role === Role.SUPERADMIN) return;
    const ok = await this.orgService.isDefaultModerator(
      user.organizationIds ?? [],
    );
    if (!ok) {
      throw new ForbiddenException(
        'Solishtirish faqat asosiy filial moderatorlariga ochiq',
      );
    }
  }

  private async resolveUploadOrgIds(user: AuthUser): Promise<string[] | null> {
    if (user.role === Role.SUPERADMIN) return null;
    const scope = await this.orgService.resolveModeratorScope(
      user.organizationIds ?? [],
    );
    // undefined = asosiy filial (barcha org)
    return scope ?? null;
  }

  async parseAndCreate(
    file: Express.Multer.File,
    user: AuthUser,
  ): Promise<ReportSubmission> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Excel fayl topilmadi');
    }

    const parsed = await this.parseMatrixExcel(file.buffer);
    const org = await this.orgRepo.findOne({ where: { id: parsed.payload.orgId } });
    if (!org) {
      throw new BadRequestException('Excel dagi filial topilmadi');
    }

    const allowed = await this.resolveUploadOrgIds(user);
    if (allowed && !allowed.includes(parsed.payload.orgId)) {
      throw new ForbiddenException(
        'Bu filial hisobotini yuklashga ruxsat yo‘q',
      );
    }

    const entity = this.submissionRepo.create({
      organizationId: parsed.payload.orgId,
      orgName: org.name || parsed.payload.orgName,
      month: parsed.payload.month,
      fileName: file.originalname || 'report.xlsx',
      uploadedByUserId: user.id,
      payload: parsed.payload,
      employeeCount: parsed.payload.employees.length,
      contentHash: parsed.contentHash,
      integrityStatus: parsed.integrityStatus,
      exportId: parsed.exportId,
    });

    return this.submissionRepo.save(entity);
  }

  async list(
    user: AuthUser,
    filters?: { month?: string; orgId?: string },
  ) {
    await this.assertCanCompare(user);

    const qb = this.submissionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.uploadedBy', 'u')
      .orderBy('s.created_at', 'DESC');

    if (filters?.month?.trim()) {
      qb.andWhere('s.month = :month', { month: filters.month.trim() });
    }
    if (filters?.orgId?.trim()) {
      qb.andWhere('s.organization_id = :orgId', {
        orgId: filters.orgId.trim(),
      });
    }

    const rows = await qb.getMany();
    return rows.map((s) => this.toListItem(s));
  }

  async getOne(id: string, user: AuthUser) {
    await this.assertCanCompare(user);
    const s = await this.submissionRepo.findOne({
      where: { id },
      relations: ['uploadedBy'],
    });
    if (!s) throw new NotFoundException('Yuklangan hisobot topilmadi');
    return {
      ...this.toListItem(s),
      payload: s.payload,
    };
  }

  async compare(id: string, user: AuthUser) {
    await this.assertCanCompare(user);
    const s = await this.submissionRepo.findOne({
      where: { id },
      relations: ['uploadedBy'],
    });
    if (!s) throw new NotFoundException('Yuklangan hisobot topilmadi');

    const system = await this.analyticsService.getMonthlyPlanMatrix(
      s.organizationId,
      s.month,
    );

    const uploadedByEmail = new Map(
      s.payload.employees.map((e) => [e.email.trim().toLowerCase(), e]),
    );
    const systemByEmail = new Map(
      system.employees.map((e) => [e.email.trim().toLowerCase(), e]),
    );

    const allEmails = new Set([
      ...uploadedByEmail.keys(),
      ...systemByEmail.keys(),
    ]);

    let matched = 0;
    let mismatched = 0;
    let onlyInUpload = 0;
    let onlyInSystem = 0;

    const rows: Array<{
      email: string;
      fullName: string;
      status: 'match' | 'mismatch' | 'only_upload' | 'only_system';
      uploaded: ReportSubmissionEmployeeRow | null;
      system: {
        email: string;
        fullName: string;
        daysCompleted: number;
        monthlyPercent: number;
        extraCorrectTotal: number;
        dayLabels: string[];
      } | null;
      diffs: string[];
    }> = [];

    for (const email of [...allEmails].sort()) {
      const up = uploadedByEmail.get(email) ?? null;
      const sysEmp = systemByEmail.get(email) ?? null;
      const sys = sysEmp
        ? {
            email: sysEmp.email,
            fullName: sysEmp.fullName,
            daysCompleted: sysEmp.daysCompleted,
            monthlyPercent: sysEmp.monthlyPercent,
            extraCorrectTotal: sysEmp.extraCorrectTotal,
            dayLabels: sysEmp.dayResults.map((d) => d.label),
          }
        : null;

      if (up && !sys) {
        onlyInUpload += 1;
        rows.push({
          email,
          fullName: up.fullName,
          status: 'only_upload',
          uploaded: up,
          system: null,
          diffs: ['Faqat yuklangan Excelda bor'],
        });
        continue;
      }
      if (!up && sys) {
        onlyInSystem += 1;
        rows.push({
          email,
          fullName: sys.fullName,
          status: 'only_system',
          uploaded: null,
          system: sys,
          diffs: ['Faqat tizimda bor'],
        });
        continue;
      }
      if (!up || !sys) continue;

      const diffs: string[] = [];
      if (up.daysCompleted !== sys.daysCompleted) {
        diffs.push(
          `Bajarilgan kunlar: excel=${up.daysCompleted}, tizim=${sys.daysCompleted}`,
        );
      }
      if (Number(up.monthlyPercent) !== Number(sys.monthlyPercent)) {
        diffs.push(
          `Oylik %: excel=${up.monthlyPercent}, tizim=${sys.monthlyPercent}`,
        );
      }
      if (Number(up.extraCorrectTotal) !== Number(sys.extraCorrectTotal)) {
        diffs.push(
          `Plandan tashqari: excel=${up.extraCorrectTotal}, tizim=${sys.extraCorrectTotal}`,
        );
      }

      const dayLen = Math.max(up.dayLabels.length, sys.dayLabels.length);
      for (let i = 0; i < dayLen; i++) {
        const a = up.dayLabels[i] ?? '—';
        const b = sys.dayLabels[i] ?? '—';
        if (a !== b) {
          diffs.push(`Kun ${i + 1}: excel=${a}, tizim=${b}`);
        }
      }

      if (diffs.length === 0) {
        matched += 1;
        rows.push({
          email,
          fullName: up.fullName || sys.fullName,
          status: 'match',
          uploaded: up,
          system: sys,
          diffs: [],
        });
      } else {
        mismatched += 1;
        rows.push({
          email,
          fullName: up.fullName || sys.fullName,
          status: 'mismatch',
          uploaded: up,
          system: sys,
          diffs,
        });
      }
    }

    return {
      submission: this.toListItem(s),
      integrity: {
        status: s.integrityStatus ?? 'unsigned',
        contentHash: s.contentHash,
        exportId: s.exportId,
        message:
          s.integrityStatus === 'tampered'
            ? `Excel qo‘lda o‘zgartirilgan. Yuklagan: ${
                s.uploadedBy
                  ? `${s.uploadedBy.lastName} ${s.uploadedBy.firstName}`.trim() ||
                    s.uploadedBy.email
                  : 'noma’lum'
              }`
            : s.integrityStatus === 'ok'
              ? 'Excel yaxlitligi tasdiqlandi (o‘zgartirilmagan)'
              : 'Eski fayl — imzo yo‘q (contentHash META da topilmadi)',
      },
      system: {
        orgId: system.orgId,
        orgName: system.orgName,
        month: system.month,
        totalEmployees: system.totalEmployees,
        averageMonthlyPercent: system.averageMonthlyPercent,
      },
      summary: {
        matched,
        mismatched,
        onlyInUpload,
        onlyInSystem,
        total: rows.length,
      },
      rows,
    };
  }

  private toListItem(s: ReportSubmission) {
    return {
      id: s.id,
      organizationId: s.organizationId,
      orgName: s.orgName,
      month: s.month,
      fileName: s.fileName,
      employeeCount: s.employeeCount,
      createdAt: s.createdAt?.toISOString?.() ?? String(s.createdAt),
      integrityStatus: (s.integrityStatus ?? 'unsigned') as ReportIntegrityStatus,
      contentHash: s.contentHash ?? null,
      exportId: s.exportId ?? null,
      uploadedBy: s.uploadedBy
        ? {
            id: s.uploadedBy.id,
            firstName: s.uploadedBy.firstName,
            lastName: s.uploadedBy.lastName,
            email: s.uploadedBy.email,
          }
        : null,
    };
  }

  private async parseMatrixExcel(buffer: Buffer): Promise<{
    payload: ReportSubmissionPayload;
    contentHash: string | null;
    exportId: string | null;
    integrityStatus: ReportIntegrityStatus;
  }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const metaSheet = wb.getWorksheet('META');
    let orgId = '';
    let orgName = '';
    let month = '';
    let daysInMonth = 0;
    let dailyGoalCorrect = 10;
    let metaContentHash = '';
    let exportId: string | null = null;

    if (metaSheet) {
      metaSheet.eachRow((row) => {
        const key = String(row.getCell(1).value ?? '')
          .trim()
          .toLowerCase();
        const val = String(row.getCell(2).value ?? '').trim();
        if (key === 'orgid') orgId = val;
        if (key === 'orgname') orgName = val;
        if (key === 'month') month = val;
        if (key === 'daysinmonth') daysInMonth = Number(val) || 0;
        if (key === 'dailygoalcorrect') dailyGoalCorrect = Number(val) || 10;
        if (key === 'contenthash') metaContentHash = val;
        if (key === 'exportid') exportId = val || null;
      });
    }

    const ws =
      wb.getWorksheet('Oylik reja') ||
      wb.worksheets.find((s) => s.name !== 'META') ||
      wb.worksheets[0];
    if (!ws) throw new BadRequestException('Excel varaq topilmadi');

    // Fallback meta from header rows
    if (!orgName || !month) {
      const r1 = String(ws.getRow(1).getCell(1).value ?? '');
      const r2 = String(ws.getRow(2).getCell(1).value ?? '');
      const orgMatch = r1.match(/Filial:\s*(.+)/i);
      const monthMatch = r2.match(/Oy:\s*(\d{4}-\d{2})/i);
      if (!orgName && orgMatch) orgName = orgMatch[1].trim();
      if (!month && monthMatch) month = monthMatch[1];
    }

    if (!orgId && orgName) {
      const orgs = await this.orgRepo.find({
        where: { name: orgName },
      });
      if (orgs.length === 1) orgId = orgs[0].id;
      else if (orgs.length > 1) {
        throw new BadRequestException(
          'Bir xil nomli filiallar bor — META sheet (orgId) bilan qayta yuklang',
        );
      }
    }

    if (!orgId || !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException(
        'Excel META yetarli emas (orgId / month). Tizimdan yuklab olingan faylni ishlating.',
      );
    }

    // Find header row with Email
    let headerRowIdx = 0;
    let emailCol = -1;
    let nameCol = -1;
    let dayStartCol = -1;
    let daysCompletedCol = -1;
    let monthlyPctCol = -1;
    let extraCol = -1;
    const dayCols: number[] = [];

    ws.eachRow((row, rowNumber) => {
      if (headerRowIdx) return;
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values[colNumber] = String(cell.value ?? '').trim();
      });
      const hasEmail = values.some((v) => /^email$/i.test(v));
      const hasFio = values.some((v) => /f\.?i\.?o/i.test(v));
      if (hasEmail && hasFio) {
        headerRowIdx = rowNumber;
        values.forEach((v, col) => {
          if (!v) return;
          if (/^email$/i.test(v)) emailCol = col;
          if (/f\.?i\.?o/i.test(v)) nameCol = col;
          if (/bajarilgan/i.test(v)) daysCompletedCol = col;
          if (/oylik/i.test(v) && /%|plan/i.test(v)) monthlyPctCol = col;
          if (/plandan/i.test(v)) extraCol = col;
          // Kun: "1" / "01" yoki "01.07" / "1.7"
          if (/^\d{1,2}$/.test(v) || /^\d{1,2}\.\d{1,2}$/.test(v)) {
            if (dayStartCol < 0) dayStartCol = col;
            dayCols.push(col);
          }
        });
      }
    });

    if (!headerRowIdx || emailCol < 0) {
      throw new BadRequestException('Excel jadval sarlavhasi topilmadi');
    }

    if (!daysInMonth) {
      daysInMonth = dayCols.length || 30;
    }

    const employees: ReportSubmissionEmployeeRow[] = [];
    for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const email = String(row.getCell(emailCol).value ?? '')
        .trim()
        .toLowerCase();
      if (!email) continue;

      const fullName = nameCol > 0 ? String(row.getCell(nameCol).value ?? '').trim() : '';
      const dayLabels = dayCols.map((c) =>
        String(row.getCell(c).value ?? '').trim() || '0/10',
      );
      const daysCompleted =
        daysCompletedCol > 0
          ? Number(row.getCell(daysCompletedCol).value) || 0
          : dayLabels.filter((l) => {
              const [a, b] = l.split('/').map(Number);
              return Number.isFinite(a) && Number.isFinite(b) && a >= b && b > 0;
            }).length;
      const monthlyPercent =
        monthlyPctCol > 0
          ? Number(row.getCell(monthlyPctCol).value) || 0
          : Math.round((daysCompleted / Math.max(daysInMonth, 1)) * 1000) / 10;
      const extraCorrectTotal =
        extraCol > 0 ? Number(row.getCell(extraCol).value) || 0 : 0;

      employees.push({
        email,
        fullName,
        daysCompleted,
        monthlyPercent,
        extraCorrectTotal,
        dayLabels,
      });
    }

    const payload: ReportSubmissionPayload = {
      orgId,
      orgName,
      month,
      daysInMonth,
      dailyGoalCorrect,
      employees,
      exportId,
    };

    const { status, computed } = verifyReportContentHash(metaContentHash, {
      orgId,
      month,
      employees,
    });

    return {
      payload,
      contentHash: metaContentHash || computed,
      exportId,
      integrityStatus: status,
    };
  }
}
