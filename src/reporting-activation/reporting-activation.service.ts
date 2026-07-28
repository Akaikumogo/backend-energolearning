import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
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
      throw new BadRequestException('asOfDate YYYY-MM-DD formatida bo‘lishi kerak');
    }

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
      ${orgAlias}.report_active = true
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

  async getSnapshot(orgIds?: string[] | null): Promise<ReportingActivationSnapshot> {
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

    if (org.reportActive === isActive) {
      return { id: org.id, reportActive: org.reportActive };
    }

    org.reportActive = isActive;
    await this.orgRepo.save(org);
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

  async setEmployeeActive(
    userId: string,
    isActive: boolean,
    changedByUserId?: string,
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Xodim topilmadi');

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
