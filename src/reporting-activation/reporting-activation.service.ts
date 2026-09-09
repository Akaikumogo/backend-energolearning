import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { Organization } from '../database/entities/organization.entity';
import { OrganizationDivisionSetting } from '../database/entities/organization-division-setting.entity';
import {
  ReportingActivationHistory,
  ReportingActivationScope,
} from '../database/entities/reporting-activation-history.entity';
import { User } from '../database/entities/user.entity';

export type ReportingActivationSnapshot = {
  organizations: Array<{ id: string; reportActive: boolean }>;
  divisions: Array<{
    organizationId: string;
    division: string;
    isActive: boolean;
  }>;
};

@Injectable()
export class ReportingActivationService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(OrganizationDivisionSetting)
    private readonly divisionRepo: Repository<OrganizationDivisionSetting>,
    @InjectRepository(ReportingActivationHistory)
    private readonly historyRepo: Repository<ReportingActivationHistory>,
  ) {}

  normalizeDivision(division?: string | null): string {
    return (division ?? '').trim();
  }

  /**
   * TypeORM QB: faqat effective report-active xodimlar.
   * Aliases: user = `u`, organization = `org` (yoki opts).
   * asOfDate (YYYY-MM-DD) berilsa — o‘sha kundagi history; aks holda joriy flaglar.
   */
  applyEmployeeReportActiveFilter<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    opts?: {
      userAlias?: string;
      orgAlias?: string;
      asOfDate?: string;
      paramPrefix?: string;
    },
  ): SelectQueryBuilder<T> {
    const u = opts?.userAlias ?? 'u';
    const org = opts?.orgAlias ?? 'org';
    const p = opts?.paramPrefix ?? 'ra';
    const asOf = opts?.asOfDate?.trim();

    if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw new BadRequestException(
        'asOfDate YYYY-MM-DD formatida bo‘lishi kerak',
      );
    }

    // Hisobot/KPI: faqat Energo ID orqali kelgan xodimlar
    qb.andWhere(`${u}.energoId IS NOT NULL`);

    if (!asOf) {
      return qb
        .andWhere(`${org}.reportActive = true`)
        .andWhere(`${u}.reportActive = true`)
        .andWhere(
          `COALESCE((
            SELECT ods.is_active
            FROM organization_division_settings ods
            WHERE ods.organization_id = ${org}.id
              AND ods.division_name = COALESCE((
                SELECT TRIM(ne.division)
                FROM nes_employees ne
                WHERE ne.user_id = ${u}.id
                  AND ne.organization_id = ${org}.id
                LIMIT 1
              ), '')
          ), true) = true`,
        );
    }

    const asOfKey = `${p}AsOf`;
    return qb
      .andWhere(
        `COALESCE((
          SELECT h.is_active
          FROM reporting_activation_history h
          WHERE h.scope_type = 'organization'
            AND h.organization_id = ${org}.id
            AND (h.changed_at AT TIME ZONE 'Asia/Tashkent')::date <= CAST(:${asOfKey} AS date)
          ORDER BY h.changed_at DESC
          LIMIT 1
        ), true) = true`,
        { [asOfKey]: asOf },
      )
      .andWhere(
        `COALESCE((
          SELECT h.is_active
          FROM reporting_activation_history h
          WHERE h.scope_type = 'employee'
            AND h.user_id = ${u}.id
            AND (h.changed_at AT TIME ZONE 'Asia/Tashkent')::date <= CAST(:${asOfKey} AS date)
          ORDER BY h.changed_at DESC
          LIMIT 1
        ), true) = true`,
      )
      .andWhere(
        `COALESCE((
          SELECT h.is_active
          FROM reporting_activation_history h
          WHERE h.scope_type = 'division'
            AND h.organization_id = ${org}.id
            AND h.division_name = COALESCE((
              SELECT TRIM(ne.division)
              FROM nes_employees ne
              WHERE ne.user_id = ${u}.id
                AND ne.organization_id = ${org}.id
              LIMIT 1
            ), '')
            AND (h.changed_at AT TIME ZONE 'Asia/Tashkent')::date <= CAST(:${asOfKey} AS date)
          ORDER BY h.changed_at DESC
          LIMIT 1
        ), true) = true`,
      );
  }

  /** Raw SQL AND fragment (aliases u / org = DB tables). Current flags only. */
  currentEmployeeActiveSql(userAlias = 'u', orgAlias = 'org'): string {
    return `(
      ${userAlias}.energo_id IS NOT NULL
      AND ${orgAlias}.report_active = true
      AND ${userAlias}.report_active = true
      AND COALESCE((
        SELECT ods.is_active
        FROM organization_division_settings ods
        WHERE ods.organization_id = ${orgAlias}.id
          AND ods.division_name = COALESCE((
            SELECT TRIM(ne.division)
            FROM nes_employees ne
            WHERE ne.user_id = ${userAlias}.id
              AND ne.organization_id = ${orgAlias}.id
            LIMIT 1
          ), '')
      ), true) = true
    )`;
  }

  async getSnapshot(
    orgIds?: string[] | null,
  ): Promise<ReportingActivationSnapshot> {
    const orgQb = this.orgRepo
      .createQueryBuilder('o')
      .select(['o.id', 'o.reportActive'])
      .andWhere('o.archivedAt IS NULL');
    if (orgIds?.length) {
      orgQb.andWhere('o.id IN (:...orgIds)', { orgIds });
    }
    const orgs = await orgQb.getMany();

    const divQb = this.divisionRepo.createQueryBuilder('d');
    if (orgIds?.length) {
      divQb.where('d.organizationId IN (:...orgIds)', { orgIds });
    }
    const divisions = await divQb.getMany();

    return {
      organizations: orgs.map((o) => ({
        id: o.id,
        reportActive: o.reportActive !== false,
      })),
      divisions: divisions.map((d) => ({
        organizationId: d.organizationId,
        division: d.divisionName,
        isActive: d.isActive !== false,
      })),
    };
  }

  async setOrganizationActive(
    orgId: string,
    isActive: boolean,
    changedByUserId?: string,
  ) {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Tashkilot topilmadi');

    org.reportActive = isActive;
    await this.orgRepo.save(org);

    // 1. Kaskad bo'limlar: Filial ostidagi barcha bo'limlarni yangilash
    const divisionRows = await this.orgRepo.manager.query(
      `SELECT DISTINCT COALESCE(TRIM(division), '') AS division
       FROM nes_employees
       WHERE organization_id = $1`,
      [orgId],
    );
    const divNames = new Set<string>(
      divisionRows.map((r: { division: string }) => r.division ?? ''),
    );
    divNames.add('');

    const existingDivs = await this.divisionRepo.find({
      where: { organizationId: orgId },
      select: ['divisionName'],
    });
    for (const ed of existingDivs) {
      divNames.add(ed.divisionName ?? '');
    }

    for (const dName of divNames) {
      await this.orgRepo.manager.query(
        `INSERT INTO organization_division_settings (id, organization_id, division_name, is_active, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
         ON CONFLICT (organization_id, division_name)
         DO UPDATE SET is_active = $3, updated_at = NOW()`,
        [orgId, dName, isActive],
      );
    }

    // 2. Kaskad xodimlar: Filial ostidagi barcha xodimlarni (users) report_active = isActive qilish
    await this.orgRepo.manager.query(
      `UPDATE users
       SET report_active = $2
       WHERE id IN (
         SELECT DISTINCT "userId" FROM user_organizations WHERE "organizationId" = $1
         UNION
         SELECT DISTINCT user_id FROM nes_employees WHERE organization_id = $1 AND user_id IS NOT NULL
       )`,
      [orgId, isActive],
    );

    await this.appendHistory({
      scopeType: 'organization',
      organizationId: orgId,
      isActive,
      changedByUserId,
    });
    return { id: org.id, reportActive: org.reportActive };
  }

  async setDivisionActive(
    organizationId: string,
    division: string,
    isActive: boolean,
    changedByUserId?: string,
  ) {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Tashkilot topilmadi');

    if (isActive && org.reportActive === false) {
      throw new BadRequestException(
        'Filial o‘chiq holatda. Filial o‘chiq bo‘lsa, uning ichidagi bo‘limni yoqib bo‘lmaydi. Avval filialni yoqing.',
      );
    }

    const divisionName = this.normalizeDivision(division);
    let row = await this.divisionRepo.findOne({
      where: { organizationId, divisionName },
    });

    if (!row) {
      row = this.divisionRepo.create({
        organizationId,
        divisionName,
        isActive,
      });
    } else if (row.isActive === isActive) {
      return {
        organizationId,
        division: divisionName,
        isActive: row.isActive,
      };
    } else {
      row.isActive = isActive;
    }

    await this.divisionRepo.save(row);

    // Kaskad: Ushbu bo'limdagi barcha xodimlarni report_active = isActive qilish
    if (divisionName === '') {
      await this.orgRepo.manager.query(
        `UPDATE users
         SET report_active = $2
         WHERE id IN (
           SELECT DISTINCT user_id
           FROM nes_employees
           WHERE organization_id = $1
             AND (division IS NULL OR TRIM(division) = '')
             AND user_id IS NOT NULL
         )`,
        [organizationId, isActive],
      );
    } else {
      await this.orgRepo.manager.query(
        `UPDATE users
         SET report_active = $3
         WHERE id IN (
           SELECT DISTINCT user_id
           FROM nes_employees
           WHERE organization_id = $1
             AND TRIM(division) = $2
             AND user_id IS NOT NULL
         )`,
        [organizationId, divisionName, isActive],
      );
    }

    await this.appendHistory({
      scopeType: 'division',
      organizationId,
      divisionName,
      isActive,
      changedByUserId,
    });
    return {
      organizationId,
      division: divisionName,
      isActive: row.isActive,
    };
  }

  async setPositionActive(
    organizationId: string,
    division: string | undefined,
    post: string,
    isActive: boolean,
    changedByUserId?: string,
  ) {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Tashkilot topilmadi');

    if (isActive && org.reportActive === false) {
      throw new BadRequestException(
        'Filial o‘chiq holatda. Filial o‘chiq bo‘lsa, uning ichidagi lavozimni yoqib bo‘lmaydi. Avval filialni yoqing.',
      );
    }

    const divisionName = this.normalizeDivision(division);
    const postName = (post ?? '').trim();

    if (isActive && divisionName) {
      const divSetting = await this.divisionRepo.findOne({
        where: { organizationId, divisionName },
      });
      if (divSetting && divSetting.isActive === false) {
        throw new BadRequestException(
          'Bo‘lim o‘chiq holatda. Bo‘lim o‘chiq bo‘lsa, uning ichidagi lavozimni yoqib bo‘lmaydi. Avval bo‘limni yoqing.',
        );
      }
    }

    // Shu lavozimdagi barcha xodimlarni yangilash
    let updatedUsers: Array<{ id: string }> = [];
    if (divisionName === '' && postName === '') {
      updatedUsers = await this.orgRepo.manager.query(
        `UPDATE users
         SET report_active = $2
         WHERE id IN (
           SELECT DISTINCT user_id
           FROM nes_employees
           WHERE organization_id = $1
             AND (division IS NULL OR TRIM(division) = '')
             AND (post IS NULL OR TRIM(post) = '')
             AND user_id IS NOT NULL
         )
         RETURNING id`,
        [organizationId, isActive],
      );
    } else if (divisionName === '') {
      updatedUsers = await this.orgRepo.manager.query(
        `UPDATE users
         SET report_active = $3
         WHERE id IN (
           SELECT DISTINCT user_id
           FROM nes_employees
           WHERE organization_id = $1
             AND (division IS NULL OR TRIM(division) = '')
             AND TRIM(post) = $2
             AND user_id IS NOT NULL
         )
         RETURNING id`,
        [organizationId, postName, isActive],
      );
    } else if (postName === '') {
      updatedUsers = await this.orgRepo.manager.query(
        `UPDATE users
         SET report_active = $3
         WHERE id IN (
           SELECT DISTINCT user_id
           FROM nes_employees
           WHERE organization_id = $1
             AND TRIM(division) = $2
             AND (post IS NULL OR TRIM(post) = '')
             AND user_id IS NOT NULL
         )
         RETURNING id`,
        [organizationId, divisionName, isActive],
      );
    } else {
      updatedUsers = await this.orgRepo.manager.query(
        `UPDATE users
         SET report_active = $4
         WHERE id IN (
           SELECT DISTINCT user_id
           FROM nes_employees
           WHERE organization_id = $1
             AND TRIM(division) = $2
             AND TRIM(post) = $3
             AND user_id IS NOT NULL
         )
         RETURNING id`,
        [organizationId, divisionName, postName, isActive],
      );
    }

    return {
      organizationId,
      division: divisionName,
      post: postName,
      isActive,
      affectedCount: updatedUsers.length,
    };
  }

  async setEmployeeActive(
    userId: string,
    isActive: boolean,
    changedByUserId?: string,
  ) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) throw new NotFoundException('Xodim topilmadi');

    if (isActive) {
      // Filial holatini tekshirish
      const orgIds = await this.orgRepo.manager.query(
        `SELECT DISTINCT org_id FROM (
           SELECT "organizationId" AS org_id FROM user_organizations WHERE "userId" = $1
           UNION
           SELECT organization_id AS org_id FROM nes_employees WHERE user_id = $1 AND organization_id IS NOT NULL
         ) AS o`,
        [userId],
      );
      if (orgIds.length > 0) {
        const inactiveOrg = await this.orgRepo.findOne({
          where: {
            id: In(orgIds.map((r: { org_id: string }) => r.org_id)),
            reportActive: false,
          },
        });
        if (inactiveOrg) {
          throw new BadRequestException(
            'Filial o‘chiq holatda. Filial o‘chiq bo‘lsa, xodimni yoqib bo‘lmaydi. Avval filialni yoqing.',
          );
        }
      }

      // Bo'lim holatini tekshirish
      const nes = await this.orgRepo.manager.query(
        `SELECT organization_id, division FROM nes_employees WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      if (nes.length > 0 && nes[0].organization_id) {
        const divName = this.normalizeDivision(nes[0].division);
        const divSetting = await this.divisionRepo.findOne({
          where: {
            organizationId: nes[0].organization_id,
            divisionName: divName,
          },
        });
        if (divSetting && divSetting.isActive === false) {
          throw new BadRequestException(
            'Bo‘lim o‘chiq holatda. Bo‘lim o‘chiq bo‘lsa, xodimni yoqib bo‘lmaydi. Avval bo‘limni yoqing.',
          );
        }
      }
    }

    if (user.reportActive === isActive) {
      return { id: user.id, reportActive: user.reportActive };
    }

    user.reportActive = isActive;
    await this.userRepo.save(user);
    await this.appendHistory({
      scopeType: 'employee',
      userId,
      isActive,
      changedByUserId,
    });
    return { id: user.id, reportActive: user.reportActive };
  }

  private async appendHistory(input: {
    scopeType: ReportingActivationScope;
    organizationId?: string;
    divisionName?: string;
    userId?: string;
    isActive: boolean;
    changedByUserId?: string;
  }) {
    await this.historyRepo.save(
      this.historyRepo.create({
        scopeType: input.scopeType,
        organizationId: input.organizationId ?? null,
        divisionName:
          input.divisionName !== undefined ? input.divisionName : null,
        userId: input.userId ?? null,
        isActive: input.isActive,
        changedByUserId: input.changedByUserId ?? null,
        changedAt: new Date(),
      }),
    );
  }
}
