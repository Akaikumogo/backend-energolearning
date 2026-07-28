import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { User } from '../database/entities/user.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { Organization } from '../database/entities/organization.entity';
import { Role } from '../common/enums/role.enum';
import {
  computeReportContentHash,
  newReportExportId,
} from '../report-submissions/report-integrity.util';

const STATUS_FILL: Record<string, string> = {
  green: 'FFD1FAE5',
  yellow: 'FFFEF3C7',
  red: 'FFFEE2E2',
};

/** Har bir filial sheet tab rangi (takrorlanadi). */
const BRANCH_TAB_COLORS = [
  'FF2563EB',
  'FF059669',
  'FFD97706',
  'FFDC2626',
  'FF7C3AED',
  'FF0891B2',
  'FFDB2777',
  'FF65A30D',
  'FFEA580C',
  'FF4F46E5',
  'FF0D9488',
  'FFBE185D',
  'FFCA8A04',
  'FF4338CA',
  'FF15803D',
];

@Injectable()
export class ExportService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    @InjectRepository(NesEmployee)
    private readonly nesRepo: Repository<NesEmployee>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
  ) {}

  async buildOrganizationCredentialsExcel(orgId: string): Promise<Buffer> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Tashkilot topilmadi');

    const users = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.organizations', 'uo')
      .innerJoin('uo.organization', 'org')
      .leftJoin(
        NesEmployee,
        'ne',
        'ne.user_id = u.id AND ne.organization_id = :orgId',
        { orgId },
      )
      .where('org.id = :orgId', { orgId })
      .andWhere('u.role = :role', { role: Role.USER })
      .select([
        'u.first_name AS "firstName"',
        'u.last_name AS "lastName"',
        'u.email AS "email"',
        'COALESCE(ne.login, u.email) AS "login"',
        'COALESCE(ne.initial_password, u.initial_password) AS "password"',
        'ne.personnel_number AS "personnelNumber"',
      ])
      .orderBy('u.last_name', 'ASC')
      .addOrderBy('u.first_name', 'ASC')
      .getRawMany<{
        firstName: string;
        lastName: string;
        email: string;
        login: string;
        password: string | null;
        personnelNumber: string | null;
      }>();

    return this.toExcelBuffer(
      `${org.name} — login parollar`,
      [
        '№',
        'F.I.O',
        'Tabel',
        'Login',
        'Parol',
        'Email',
      ],
      users.map((u, i) => [
        i + 1,
        `${u.lastName} ${u.firstName}`.trim(),
        u.personnelNumber ?? '',
        u.login,
        u.password ?? '—',
        u.email,
      ]),
    );
  }

  async buildAllNesEmployeesCredentialsExcel(filters?: {
    organizationName?: string;
  }): Promise<Buffer> {
    const qb = this.nesRepo
      .createQueryBuilder('ne')
      .innerJoin(User, 'u', 'u.id = ne.user_id')
      .where('u.role = :role', { role: Role.USER })
      .orderBy('ne.organization_name', 'ASC')
      .addOrderBy('ne.last_name', 'ASC')
      .addOrderBy('ne.first_name', 'ASC');

    if (filters?.organizationName?.trim()) {
      qb.andWhere('LOWER(ne.organization_name) = :org', {
        org: filters.organizationName.trim().toLowerCase(),
      });
    }

    const rows = await qb
      .select([
        'ne.first_name AS "firstName"',
        'ne.last_name AS "lastName"',
        'ne.login AS "login"',
        'COALESCE(ne.initial_password, u.initial_password) AS "password"',
        'ne.personnel_number AS "personnelNumber"',
        'ne.organization_name AS "organizationName"',
        'ne.division AS "division"',
        'u.energo_id AS "energoId"',
      ])
      .getRawMany<{
        firstName: string;
        lastName: string;
        login: string;
        password: string | null;
        personnelNumber: string;
        organizationName: string;
        division: string;
        energoId: string | null;
      }>();

    return this.toExcelBuffer(
      'ENERGO ID xodimlar — login parollar',
      [
        '№',
        'F.I.O',
        'Tabel',
        'Login (Energo ID)',
        'Parol',
        'Filial',
        'Bo`lim',
        'Energo ID',
      ],
      rows.map((r, i) => [
        i + 1,
        `${r.lastName} ${r.firstName}`.trim(),
        r.personnelNumber ?? '',
        r.login,
        r.password ?? '—',
        r.organizationName,
        r.division ?? '',
        r.energoId ?? '',
      ]),
    );
  }

  async buildModeratorsCredentialsExcel(): Promise<Buffer> {
    const accounts = await this.userRepo.find({
      where: [{ role: Role.MODERATOR }],
      relations: ['organizations', 'organizations.organization'],
      order: { lastName: 'ASC', firstName: 'ASC' },
    });

    accounts.sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
      ),
    );

    return this.toExcelBuffer(
      'Moderatorlar — login parollar',
      ['№', 'Rol', 'F.I.O', 'Login', 'Parol', 'Filial', 'Email'],
      accounts.map((m, i) => {
        const orgName =
          m.organizations?.[0]?.organization?.name ??
          m.organizations?.map((uo) => uo.organization?.name).filter(Boolean).join(', ') ??
          '—';
        return [
          i + 1,
          m.role,
          `${m.lastName} ${m.firstName}`.trim(),
          m.email,
          m.initialPassword ?? '—',
          orgName,
          m.email,
        ];
      }),
    );
  }

  async buildMonthlyProgressExcel(data: {
    orgName: string;
    month: string;
    daysInMonth: number;
    employees: Array<{
      fullName: string;
      email: string;
      daysCompleted: number;
      monthlyPercent: number;
      correctTotal: number;
      wrongTotal: number;
      extraCorrectTotal?: number;
      lastActiveAt: string | null;
    }>;
  }): Promise<Buffer> {
    return this.toExcelBuffer(
      `${data.month} — ${data.orgName}`,
      [
        '№',
        'F.I.O',
        'Email',
        `Bajarilgan kunlar (${data.daysInMonth} kundan)`,
        'Oylik progress %',
        'To`g`ri javoblar',
        'Xato javoblar',
        'Plandan tashqari',
        'Oxirgi faollik',
      ],
      data.employees.map((e, i) => [
        i + 1,
        e.fullName,
        e.email,
        e.daysCompleted,
        e.monthlyPercent,
        e.correctTotal,
        e.wrongTotal,
        e.extraCorrectTotal ?? 0,
        e.lastActiveAt ? e.lastActiveAt.slice(0, 16).replace('T', ' ') : '—',
      ]),
    );
  }

  async buildMonthlyPlanMatrixExcel(data: {
    orgId?: string;
    orgName: string;
    month: string;
    daysInMonth: number;
    dailyGoalCorrect: number;
    days: string[];
    averageMonthlyPercent: number;
    totalEmployees: number;
    employees: Array<{
      orgName?: string;
      fullName: string;
      email: string;
      daysCompleted: number;
      monthlyPercent: number;
      extraCorrectTotal: number;
      attemptsTotal?: number;
      wrongTotal?: number;
      dayResults: Array<{
        date: string;
        day: number;
        planCorrect: number;
        completed: boolean;
        label: string;
      }>;
    }>;
    dayFilter?: string;
    showFilial?: boolean;
  }): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const exportId = newReportExportId();
    const days = data.dayFilter
      ? data.days.filter((d) => d === data.dayFilter)
      : data.days;
    const contentHash = computeReportContentHash({
      orgId: data.orgId ?? '',
      month: data.month,
      employees: data.employees.map((e) => {
        const byDate = new Map(e.dayResults.map((c) => [c.date, c]));
        return {
          email: e.email,
          daysCompleted: e.daysCompleted,
          monthlyPercent: e.monthlyPercent,
          extraCorrectTotal: e.extraCorrectTotal,
          dayLabels: days.map(
            (d) => byDate.get(d)?.label ?? `0/${data.dailyGoalCorrect}`,
          ),
        };
      }),
    });

    const meta = wb.addWorksheet('META');
    meta.addRow(['key', 'value']);
    meta.addRow(['orgId', data.orgId ?? '']);
    meta.addRow(['orgName', data.orgName]);
    meta.addRow(['month', data.month]);
    meta.addRow(['mode', data.dayFilter ? 'daily' : 'monthly']);
    if (data.dayFilter) meta.addRow(['date', data.dayFilter]);
    meta.addRow(['daysInMonth', data.daysInMonth]);
    meta.addRow(['dailyGoalCorrect', data.dailyGoalCorrect]);
    meta.addRow(['exportId', exportId]);
    meta.addRow(['contentHash', contentHash]);
    meta.addRow(['exportedAt', new Date().toISOString()]);
    meta.getColumn(1).width = 18;
    meta.getColumn(2).width = 64;

    const sheetTitle = data.dayFilter ? 'Kunlik reja' : 'Oylik reja';
    const ws = wb.addWorksheet(sheetTitle, {
      views: [{ state: 'frozen', xSplit: data.showFilial ? 4 : 3, ySplit: 3 }],
    });
    ws.properties.tabColor = { argb: 'FF2563EB' };

    ws.addRow([`Filial: ${data.orgName}`]);
    ws.addRow([
      data.dayFilter ? `Sana: ${data.dayFilter}` : `Oy: ${data.month}`,
      `Kunlik maqsad: ${data.dailyGoalCorrect}`,
      `Xodimlar: ${data.totalEmployees}`,
      `O'rtacha oylik %: ${data.averageMonthlyPercent}`,
    ]);
    ws.addRow([]);

    const dayHeaders = days.map((d) =>
      data.dayFilter ? d : `${d.slice(8, 10)}.${d.slice(5, 7)}`,
    );
    const headers = [
      '№',
      ...(data.showFilial ? ['Filial'] : []),
      'F.I.O',
      'Email',
      ...dayHeaders,
      `Bajarilgan kunlar / ${data.daysInMonth}`,
      'Oylik plan %',
      'Urinishlar',
      'Xatolar',
      'Plandan tashqari',
    ];
    const headerRow = ws.addRow(headers);
    this.styleHeaderRow(headerRow);

    const goal = data.dailyGoalCorrect;

    for (let i = 0; i < data.employees.length; i++) {
      const e = data.employees[i];
      const byDate = new Map(e.dayResults.map((c) => [c.date, c]));
      const cells = days.map((d) => byDate.get(d)?.label ?? `0/${goal}`);
      const row = ws.addRow([
        i + 1,
        ...(data.showFilial ? [e.orgName ?? ''] : []),
        e.fullName,
        e.email,
        ...cells,
        e.daysCompleted,
        e.monthlyPercent,
        e.attemptsTotal ?? 0,
        e.wrongTotal ?? 0,
        e.extraCorrectTotal,
      ]);

      const dayStartCol = data.showFilial ? 5 : 4;
      days.forEach((d, di) => {
        const cellData = byDate.get(d);
        const cell = row.getCell(dayStartCol + di);
        const planCorrect = cellData?.planCorrect ?? 0;
        const completed = cellData?.completed ?? false;
        if (completed) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD1FAE5' },
          };
        } else if (planCorrect > 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEF3C7' },
          };
        } else {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1F5F9' },
          };
        }
        cell.alignment = { horizontal: 'center' };
      });
    }

    ws.getColumn(1).width = 6;
    let col = 2;
    if (data.showFilial) {
      ws.getColumn(col++).width = 28;
    }
    ws.getColumn(col++).width = 28;
    ws.getColumn(col++).width = 26;
    for (let c = 0; c < days.length; c++) {
      ws.getColumn(col + c).width = data.dayFilter ? 12 : 9;
    }
    col += days.length;
    ws.getColumn(col++).width = 18;
    ws.getColumn(col++).width = 14;
    ws.getColumn(col++).width = 12;
    ws.getColumn(col++).width = 12;
    ws.getColumn(col++).width = 14;

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async buildYearlyPlanMatrixExcel(data: {
    orgId?: string;
    orgName: string;
    year: string;
    months: string[];
    dailyGoalCorrect: number;
    averageYearlyPercent: number;
    totalEmployees: number;
    showFilial?: boolean;
    employees: Array<{
      orgName?: string;
      fullName: string;
      email: string;
      daysCompleted: number;
      daysInYear: number;
      yearlyPercent: number;
      extraCorrectTotal: number;
      attemptsTotal: number;
      wrongTotal: number;
      monthResults: Array<{
        month: string;
        daysCompleted: number;
        daysInMonth: number;
        percent: number;
        label: string;
        percentLabel: string;
      }>;
    }>;
  }): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const monthShort = [
      'Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn',
      'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek',
    ];
    const ws = wb.addWorksheet('Yillik reja', {
      views: [{ state: 'frozen', xSplit: data.showFilial ? 4 : 3, ySplit: 3 }],
    });
    ws.properties.tabColor = { argb: 'FF059669' };
    ws.addRow([`Filial: ${data.orgName}`]);
    ws.addRow([
      `Yil: ${data.year}`,
      `Xodimlar: ${data.totalEmployees}`,
      `O'rtacha yillik %: ${data.averageYearlyPercent}`,
    ]);
    ws.addRow([]);

    const headers = [
      '№',
      ...(data.showFilial ? ['Filial'] : []),
      'F.I.O',
      'Email',
      ...data.months.map((m) => {
        const short = monthShort[Number(m.slice(5, 7)) - 1] ?? m;
        return `${short} %`;
      }),
      ...data.months.map((m) => {
        const short = monthShort[Number(m.slice(5, 7)) - 1] ?? m;
        return `${short} (X/Y)`;
      }),
      'Yillik (X/Y)',
      'Yillik %',
      'Urinishlar',
      'Xatolar',
      'Plandan tashqari',
    ];
    const headerRow = ws.addRow(headers);
    this.styleHeaderRow(headerRow);

    for (let i = 0; i < data.employees.length; i++) {
      const e = data.employees[i];
      ws.addRow([
        i + 1,
        ...(data.showFilial ? [e.orgName ?? ''] : []),
        e.fullName,
        e.email,
        ...e.monthResults.map((m) => m.percent),
        ...e.monthResults.map((m) => m.label),
        `${e.daysCompleted}/${e.daysInYear}`,
        e.yearlyPercent,
        e.attemptsTotal,
        e.wrongTotal,
        e.extraCorrectTotal,
      ]);
    }

    ws.getColumn(1).width = 6;
    let col = 2;
    if (data.showFilial) ws.getColumn(col++).width = 28;
    ws.getColumn(col++).width = 28;
    ws.getColumn(col++).width = 26;
    for (let c = 0; c < data.months.length * 2 + 5; c++) {
      ws.getColumn(col + c).width = 12;
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async buildDailyReportExcel(data: {
    planDate: string;
    dailyGoalCorrect: number;
    totalPlan: number;
    completedTotal: number;
    extraCorrectTotal: number;
    completionPercent: number;
    totalEmployees: number;
    activeEmployees: number;
    completedEmployees: number;
    branchCount: number;
    branches: Array<{
      orgId?: string;
      orgName: string;
      totalEmployees: number;
      plan: number;
      completed: number;
      extraCorrect?: number;
      percent: number;
      completedEmployees: number;
      status: string;
    }>;
    employees: Array<{
      orgId?: string;
      orgName: string;
      fullName: string;
      answeredCount: number;
      planCorrect: number;
      extraCorrect: number;
      percent: number;
      completed: boolean;
      status: string;
    }>;
  }): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const usedNames = new Set<string>();

    const summary = wb.addWorksheet('Xulosa');
    summary.properties.tabColor = { argb: 'FF1E293B' };
    summary.addRow(['Kunlik hisobot', data.planDate]);
    summary.addRow([]);
    summary.addRow(['Jami xodimlar', data.totalEmployees]);
    summary.addRow(['Faol xodimlar', data.activeEmployees]);
    summary.addRow(['Plan bajargan xodimlar', data.completedEmployees]);
    summary.addRow(['Plan bajarilishi %', data.completionPercent]);
    summary.addRow(['Plandan tashqari (jami)', data.extraCorrectTotal]);
    summary.addRow(['Filiallar soni', data.branchCount]);
    summary.addRow([]);
    const branchHeaders = [
      'Filial',
      'Xodimlar',
      'Plan',
      'Bajarildi',
      'Plandan tashqari',
      '%',
      'Plan bajargan',
      'Holat',
    ];
    summary.addRow(branchHeaders);
    this.styleHeaderRow(summary.getRow(summary.rowCount));
    for (const b of data.branches) {
      const row = summary.addRow([
        b.orgName,
        b.totalEmployees,
        b.plan,
        b.completed,
        b.extraCorrect ?? 0,
        b.percent,
        b.completedEmployees,
        b.status,
      ]);
      this.applyStatusFill(row, 8, b.status);
    }
    summary.columns.forEach((c) => {
      c.width = 18;
    });

    const empHeaders = [
      '№',
      'F.I.O',
      'Urinilgan',
      'Plan (to`g`ri)',
      'Plandan tashqari',
      'Progress %',
      'Bajarildi',
      'Holat',
    ];

    data.branches.forEach((branch, idx) => {
      const sheetName = this.safeSheetName(branch.orgName, usedNames);
      const ws = wb.addWorksheet(sheetName);
      ws.properties.tabColor = {
        argb: BRANCH_TAB_COLORS[idx % BRANCH_TAB_COLORS.length],
      };

      ws.addRow([`Filial: ${branch.orgName}`]);
      ws.addRow([`Sana: ${data.planDate}`]);
      ws.addRow([
        `Xodimlar: ${branch.totalEmployees}`,
        `Plan: ${branch.plan}`,
        `Bajarildi: ${branch.completed}`,
        `%: ${branch.percent}`,
        `Plandan tashqari: ${branch.extraCorrect ?? 0}`,
      ]);
      ws.addRow([]);
      ws.addRow(empHeaders);
      this.styleHeaderRow(ws.getRow(ws.rowCount));

      const branchEmps = data.employees.filter((e) =>
        branch.orgId
          ? e.orgId === branch.orgId
          : e.orgName === branch.orgName,
      );
      branchEmps.forEach((e, i) => {
        const row = ws.addRow([
          i + 1,
          e.fullName,
          e.answeredCount,
          e.planCorrect,
          e.extraCorrect,
          e.percent,
          e.completed ? 'Ha' : 'Yo`q',
          e.status,
        ]);
        this.applyStatusFill(row, 8, e.status);
      });
      ws.columns.forEach((c) => {
        c.width = 16;
      });
      ws.getColumn(2).width = 28;
    });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async buildMonthlyReportExcel(data: {
    month: string;
    daysInMonth: number;
    dailyGoalCorrect: number;
    branches: Array<{
      orgId?: string;
      orgName: string;
      totalEmployees: number;
      averageMonthlyPercent: number;
      extraCorrectTotal: number;
      rank: number;
    }>;
    trend: Array<{ date: string; percent: number; completed: number; plan: number }>;
    employees: Array<{
      orgId?: string;
      orgName: string;
      fullName: string;
      email: string;
      daysCompleted: number;
      monthlyPercent: number;
      extraCorrectTotal: number;
      correctTotal: number;
      wrongTotal: number;
    }>;
  }): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const usedNames = new Set<string>();

    const summary = wb.addWorksheet('Oylik xulosa');
    summary.properties.tabColor = { argb: 'FF1E293B' };
    summary.addRow(['Oylik hisobot', data.month]);
    summary.addRow(['Kunlar soni', data.daysInMonth]);
    summary.addRow(['Kunlik maqsad', data.dailyGoalCorrect]);
    summary.addRow([]);
    const branchHeaders = [
      'Reyting',
      'Filial',
      'Xodimlar',
      'O`rtacha oylik %',
      'Plandan tashqari (jami)',
    ];
    summary.addRow(branchHeaders);
    this.styleHeaderRow(summary.getRow(summary.rowCount));
    for (const b of data.branches) {
      const status =
        b.averageMonthlyPercent >= 90
          ? 'green'
          : b.averageMonthlyPercent >= 70
            ? 'yellow'
            : 'red';
      const row = summary.addRow([
        b.rank,
        b.orgName,
        b.totalEmployees,
        b.averageMonthlyPercent,
        b.extraCorrectTotal,
      ]);
      this.applyStatusFill(row, 4, status);
    }
    summary.columns.forEach((c) => {
      c.width = 20;
    });

    const trendWs = wb.addWorksheet('Kunlik trend');
    trendWs.properties.tabColor = { argb: 'FF64748B' };
    trendWs.addRow(['Sana', 'Plan', 'Bajarildi', 'Progress %']);
    this.styleHeaderRow(trendWs.getRow(1));
    for (const p of data.trend) {
      const status =
        p.percent >= 90 ? 'green' : p.percent >= 70 ? 'yellow' : 'red';
      const row = trendWs.addRow([p.date, p.plan, p.completed, p.percent]);
      this.applyStatusFill(row, 4, status);
    }
    trendWs.columns.forEach((c) => {
      c.width = 16;
    });

    const empHeaders = [
      '№',
      'F.I.O',
      'Email',
      'Bajarilgan kunlar',
      'Oylik %',
      'Plandan tashqari',
      'To`g`ri',
      'Xato',
    ];

    data.branches.forEach((branch, idx) => {
      const sheetName = this.safeSheetName(branch.orgName, usedNames);
      const ws = wb.addWorksheet(sheetName);
      ws.properties.tabColor = {
        argb: BRANCH_TAB_COLORS[idx % BRANCH_TAB_COLORS.length],
      };

      ws.addRow([`Filial: ${branch.orgName}`]);
      ws.addRow([`Oy: ${data.month}`]);
      ws.addRow([
        `Reyting: ${branch.rank}`,
        `Xodimlar: ${branch.totalEmployees}`,
        `O‘rtacha %: ${branch.averageMonthlyPercent}`,
        `Plandan tashqari: ${branch.extraCorrectTotal}`,
      ]);
      ws.addRow([]);
      ws.addRow(empHeaders);
      this.styleHeaderRow(ws.getRow(ws.rowCount));

      const branchEmps = data.employees.filter((e) =>
        branch.orgId
          ? e.orgId === branch.orgId
          : e.orgName === branch.orgName,
      );
      branchEmps.forEach((e, i) => {
        const status =
          e.monthlyPercent >= 90
            ? 'green'
            : e.monthlyPercent >= 70
              ? 'yellow'
              : 'red';
        const row = ws.addRow([
          i + 1,
          e.fullName,
          e.email,
          e.daysCompleted,
          e.monthlyPercent,
          e.extraCorrectTotal,
          e.correctTotal,
          e.wrongTotal,
        ]);
        this.applyStatusFill(row, 5, status);
      });
      ws.columns.forEach((c) => {
        c.width = 16;
      });
      ws.getColumn(2).width = 28;
      ws.getColumn(3).width = 26;
    });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  private safeSheetName(name: string, used: Set<string>): string {
    const cleaned =
      name.replace(/[:\\/?*[\]]/g, '_').replace(/\s+/g, ' ').trim() || 'Filial';
    let base = cleaned.slice(0, 28);
    let candidate = base;
    let n = 1;
    while (used.has(candidate.toLowerCase())) {
      const suffix = `_${n++}`;
      candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    used.add(candidate.toLowerCase());
    return candidate.slice(0, 31);
  }

  private styleHeaderRow(row: ExcelJS.Row) {
    row.font = { bold: true, color: { argb: 'FF1E293B' } };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
  }

  private applyStatusFill(row: ExcelJS.Row, colIndex: number, status: string) {
    const fill = STATUS_FILL[status];
    if (!fill) return;
    row.getCell(colIndex).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: fill },
    };
  }

  private async toExcelBuffer(
    sheetName: string,
    headers: string[],
    rows: (string | number)[][],
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName.slice(0, 31));
    ws.addRow(headers);
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
    for (const row of rows) {
      ws.addRow(row);
    }
    ws.columns.forEach((col) => {
      col.width = 18;
    });
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
