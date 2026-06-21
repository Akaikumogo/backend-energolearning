import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { User } from '../database/entities/user.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { Organization } from '../database/entities/organization.entity';
import { Role } from '../common/enums/role.enum';

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
      // SUPERADMIN parolini Excel'ga chiqarmaymiz — moderatorlar uchun
      // initialPassword zarur (xodimga parol berish uchun), SUPERADMIN
      // esa env'da sozlanadi va plain ko'rsatilmasligi kerak.
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
