import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Brackets, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import {
  mergeModeratorPermissions,
  MODERATOR_PERMISSION_KEYS,
  type ModeratorPermissions,
} from '../database/entities/moderator-permission.entity';
import { ModeratorPermission } from '../database/entities/moderator-permission.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { User } from '../database/entities/user.entity';
import {
  latinizeSearchText,
  splitSearchTokens,
  variantsForSearchToken,
} from '../common/utils/latinize-search.util';
import { MergeLegacyModeratorDto } from './dto/merge-legacy-moderator.dto';
import {
  loginSearchHints,
  normName,
  parseFullName,
  parseModeratorImportExcel,
  type ModeratorImportRow,
} from '../common/utils/moderator-import.util';

type RowCount = { table: string; count: number };

export type MigrationSuggestion = {
  user: User;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  matchReasons: string[];
};

export type LegacyModeratorPreview = {
  dryRun: boolean;
  source: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    energoId: string | null;
  };
  target: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    energoId: string | null;
  };
  sourceRowCounts: RowCount[];
  conflicts: string[];
  plannedActions: string[];
  merged?: boolean;
  deletedSourceId?: string;
  targetUserId?: string;
};

export type BulkModeratorMigrationItem = {
  row: ModeratorImportRow;
  source: LegacyModeratorPreview['source'] | null;
  target: LegacyModeratorPreview['target'] | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchReasons: string[];
  canAutoMerge: boolean;
};

export type BulkModeratorMigrationPreview = {
  summary: {
    total: number;
    sourceFound: number;
    targetFound: number;
    readyToMerge: number;
  };
  items: BulkModeratorMigrationItem[];
};

@Injectable()
export class LegacyModeratorMigrationService {
  private readonly tableExistsCache = new Map<string, boolean>();

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(NesEmployee)
    private readonly nesRepo: Repository<NesEmployee>,
    @InjectRepository(ModeratorPermission)
    private readonly permRepo: Repository<ModeratorPermission>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async listLegacyModerators(): Promise<User[]> {
    return this.usersRepo.find({
      where: { role: Role.MODERATOR },
      relations: ['organizations', 'organizations.organization'],
      order: { lastName: 'ASC', firstName: 'ASC' },
    }).then((rows) => rows.filter((u) => !u.energoId));
  }

  /** Migratsiya maqsadi — nes_employees orqali (ENERGO ID sync bilan bir xil) */
  async searchMigrationTargets(search?: string, limit = 50): Promise<User[]> {
    const qb = this.nesRepo
      .createQueryBuilder('nes')
      .innerJoinAndSelect('nes.user', 'u')
      .leftJoinAndSelect('u.organizations', 'uo')
      .leftJoinAndSelect('uo.organization', 'org')
      .where('u.role = :role', { role: Role.USER })
      .andWhere('u.energo_id IS NOT NULL')
      .orderBy('nes.lastName', 'ASC')
      .addOrderBy('nes.firstName', 'ASC')
      .take(Math.min(Math.max(limit, 1), 100));

    const rawTokens = splitSearchTokens(search ?? '');
    if (rawTokens.length === 0) {
      return [];
    }

    rawTokens.forEach((rawToken, i) => {
      const variants = variantsForSearchToken(rawToken);
      qb.andWhere(
        new Brackets((sub) => {
          variants.forEach((token, j) => {
            const key = `mtok${i}_${j}`;
            sub.orWhere(
              `(
                LOWER(nes.login) LIKE :${key}
                OR LOWER(nes.personnel_number) LIKE :${key}
                OR LOWER(nes.full_name) LIKE :${key}
                OR LOWER(nes.last_name) LIKE :${key}
                OR LOWER(nes.first_name) LIKE :${key}
                OR LOWER(u.email) LIKE :${key}
                OR LOWER(u.first_name) LIKE :${key}
                OR LOWER(u.last_name) LIKE :${key}
                OR LOWER(CONCAT(u.last_name, ' ', u.first_name)) LIKE :${key}
                OR LOWER(CONCAT(u.first_name, ' ', u.last_name)) LIKE :${key}
              )`,
              { [key]: `%${token}%` },
            );
          });
        }),
      );
    });

    const rows = await qb.getMany();
    return rows.map((nes) => nes.user);
  }

  /**
   * Eski moderator uchun mos keladigan Energo ID xodimlarini avtomatik
   * tavsiya qiladi. Familiya/ism/login bo'yicha moslik darajasiga qarab
   * ball beriladi va eng yuqori nomzodlar qaytariladi.
   */
  async suggestTargets(
    sourceUserId: string,
    limit = 5,
  ): Promise<MigrationSuggestion[]> {
    const source = await this.usersRepo.findOne({
      where: { id: sourceUserId },
    });
    if (!source) throw new NotFoundException('Eski moderator topilmadi');
    if (source.role !== Role.MODERATOR) {
      throw new BadRequestException('Faqat MODERATOR uchun tavsiya beriladi');
    }

    const norm = (value?: string | null) =>
      latinizeSearchText((value ?? '').trim().toLowerCase());

    const sLast = norm(source.lastName);
    const sFirst = norm(source.firstName);
    const sEmailLocal = norm((source.email ?? '').split('@')[0]);

    const seedTokens = [
      source.lastName,
      source.firstName,
      (source.email ?? '').split('@')[0],
    ]
      .map((t) => (t ?? '').trim())
      .filter(Boolean);

    if (seedTokens.length === 0) return [];

    const qb = this.nesRepo
      .createQueryBuilder('nes')
      .innerJoinAndSelect('nes.user', 'u')
      .leftJoinAndSelect('u.organizations', 'uo')
      .leftJoinAndSelect('uo.organization', 'org')
      .where('u.role = :role', { role: Role.USER })
      .andWhere('u.energo_id IS NOT NULL')
      .take(80);

    qb.andWhere(
      new Brackets((outer) => {
        seedTokens.forEach((rawToken, i) => {
          variantsForSearchToken(rawToken).forEach((token, j) => {
            const key = `sug${i}_${j}`;
            outer.orWhere(
              `(
                LOWER(nes.login) LIKE :${key}
                OR LOWER(nes.personnel_number) LIKE :${key}
                OR LOWER(nes.full_name) LIKE :${key}
                OR LOWER(nes.last_name) LIKE :${key}
                OR LOWER(nes.first_name) LIKE :${key}
                OR LOWER(u.email) LIKE :${key}
                OR LOWER(u.first_name) LIKE :${key}
                OR LOWER(u.last_name) LIKE :${key}
              )`,
              { [key]: `%${token}%` },
            );
          });
        });
      }),
    );

    const rows = await qb.getMany();

    const scored: MigrationSuggestion[] = rows
      .map((nes) => {
        const u = nes.user;
        const cLast = norm(u.lastName || nes.lastName);
        const cFirst = norm(u.firstName || nes.firstName);
        const cLogin = norm(nes.login);
        const cEmailLocal = norm((u.email ?? '').split('@')[0]);

        let score = 0;
        const matchReasons: string[] = [];

        if (sLast && cLast && sLast === cLast) {
          score += 4;
          matchReasons.push('Familiya to`liq mos');
        } else if (
          sLast &&
          cLast &&
          (cLast.includes(sLast) || sLast.includes(cLast))
        ) {
          score += 2;
          matchReasons.push('Familiya qisman mos');
        }

        if (sFirst && cFirst && sFirst === cFirst) {
          score += 4;
          matchReasons.push('Ism to`liq mos');
        } else if (
          sFirst &&
          cFirst &&
          (cFirst.includes(sFirst) || sFirst.includes(cFirst))
        ) {
          score += 2;
          matchReasons.push('Ism qisman mos');
        }

        if (
          sEmailLocal &&
          (sEmailLocal === cLogin || sEmailLocal === cEmailLocal)
        ) {
          score += 5;
          matchReasons.push('Login/email mos');
        }

        let confidence: 'high' | 'medium' | 'low' = 'low';
        if (score >= 8) confidence = 'high';
        else if (score >= 4) confidence = 'medium';

        return { user: u, score, confidence, matchReasons };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Math.max(limit, 1), 20));

    return scored;
  }

  async previewBulkFromExcel(buffer: Buffer): Promise<BulkModeratorMigrationPreview> {
    const rows = parseModeratorImportExcel(buffer);
    if (rows.length === 0) {
      throw new BadRequestException('Excel bo`sh yoki format noto`g`ri');
    }

    const legacyModerators = await this.listLegacyModerators();
    const items: BulkModeratorMigrationItem[] = [];

    for (const row of rows) {
      const source = this.findLegacyByRow(legacyModerators, row);
      const targetMatch = source
        ? await this.suggestTargets(source.id, 1)
        : await this.findTargetByRow(row);

      const top = targetMatch[0] ?? null;
      const confidence = top?.confidence ?? 'none';

      items.push({
        row,
        source: source ? this.toUserSummary(source) : null,
        target: top ? this.toUserSummary(top.user) : null,
        confidence,
        matchReasons: top?.matchReasons ?? [],
        canAutoMerge:
          !!source &&
          !!top &&
          (confidence === 'high' || confidence === 'medium'),
      });
    }

    return {
      summary: {
        total: items.length,
        sourceFound: items.filter((i) => i.source).length,
        targetFound: items.filter((i) => i.target).length,
        readyToMerge: items.filter((i) => i.canAutoMerge).length,
      },
      items,
    };
  }

  async applyBulkFromExcel(
    buffer: Buffer,
    opts?: {
      dryRun?: boolean;
      permissionMerge?: 'prefer-source' | 'prefer-target' | 'union';
      onlyReady?: boolean;
    },
  ) {
    const preview = await this.previewBulkFromExcel(buffer);
    const permissionMerge = opts?.permissionMerge ?? 'prefer-source';
    const results: Array<{
      row: ModeratorImportRow;
      success: boolean;
      message: string;
      preview?: LegacyModeratorPreview;
    }> = [];

    for (const item of preview.items) {
      if (!item.source || !item.target) {
        results.push({
          row: item.row,
          success: false,
          message: 'Source yoki target topilmadi',
        });
        continue;
      }

      if (opts?.onlyReady !== false && !item.canAutoMerge) {
        results.push({
          row: item.row,
          success: false,
          message: 'Past moslik — qo‘lda birlashtiring',
        });
        continue;
      }

      const mergeResult = await this.merge({
        sourceUserId: item.source.id,
        targetUserId: item.target.id,
        permissionMerge,
        dryRun: !!opts?.dryRun,
      });

      results.push({
        row: item.row,
        success: !opts?.dryRun && !!mergeResult.merged,
        message: opts?.dryRun
          ? 'Dry run — tayyor'
          : mergeResult.merged
            ? 'Birlashtirildi'
            : 'Xatolik',
        preview: mergeResult,
      });
    }

    return {
      dryRun: !!opts?.dryRun,
      merged: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  private findLegacyByRow(legacyModerators: User[], row: ModeratorImportRow) {
    const hints = loginSearchHints(row.login);
    const emails = new Set([row.login, row.email, ...hints].filter(Boolean));

    return (
      legacyModerators.find((user) =>
        emails.has((user.email ?? '').trim().toLowerCase()),
      ) ??
      legacyModerators.find((user) => {
        const { lastName, firstName } = parseFullName(row.fullName);
        return (
          normName(user.lastName) === normName(lastName) &&
          normName(user.firstName) === normName(firstName)
        );
      }) ??
      null
    );
  }

  private async findTargetByRow(row: ModeratorImportRow) {
    const { lastName, firstName } = parseFullName(row.fullName);
    const hints = loginSearchHints(row.login);

    const qb = this.nesRepo
      .createQueryBuilder('nes')
      .innerJoinAndSelect('nes.user', 'u')
      .where('u.role = :role', { role: Role.USER })
      .andWhere('u.energo_id IS NOT NULL')
      .take(30);

    qb.andWhere(
      new Brackets((outer) => {
        if (lastName) {
          outer.orWhere('LOWER(nes.last_name) LIKE :ln', {
            ln: `%${lastName.toLowerCase()}%`,
          });
        }
        if (firstName) {
          outer.orWhere('LOWER(nes.first_name) LIKE :fn', {
            fn: `%${firstName.toLowerCase()}%`,
          });
        }
        hints.forEach((hint, i) => {
          outer.orWhere(`LOWER(nes.login) LIKE :h${i}`, {
            [`h${i}`]: `%${hint.toLowerCase()}%`,
          });
        });
      }),
    );

    const rows = await qb.getMany();
    const scored: MigrationSuggestion[] = rows
      .map((nes) => {
        const u = nes.user;
        let score = 0;
        const matchReasons: string[] = [];
        const sLast = normName(lastName);
        const sFirst = normName(firstName);
        const cLast = normName(u.lastName || nes.lastName);
        const cFirst = normName(u.firstName || nes.firstName);
        const cLogin = normName(nes.login);

        if (sLast && cLast && sLast === cLast) {
          score += 4;
          matchReasons.push('Familiya mos');
        }
        if (sFirst && cFirst && sFirst === cFirst) {
          score += 4;
          matchReasons.push('Ism mos');
        }
        for (const hint of hints) {
          const h = normName(hint);
          if (h && (cLogin === h || cLogin.includes(h))) {
            score += 5;
            matchReasons.push('Login mos');
            break;
          }
        }

        let confidence: MigrationSuggestion['confidence'] = 'low';
        if (score >= 8) confidence = 'high';
        else if (score >= 5) confidence = 'medium';
        if (score <= 0) return null;

        return { user: u, score, confidence, matchReasons };
      })
      .filter((s): s is MigrationSuggestion => s !== null)
      .sort((a, b) => b.score - a.score);

    return scored;
  }

  async merge(dto: MergeLegacyModeratorDto): Promise<LegacyModeratorPreview> {
    const source = await this.usersRepo.findOne({
      where: { id: dto.sourceUserId },
      relations: ['organizations', 'organizations.organization'],
    });
    const target = await this.usersRepo.findOne({
      where: { id: dto.targetUserId },
      relations: ['organizations', 'organizations.organization'],
    });

    if (!source) throw new NotFoundException('Eski moderator topilmadi');
    if (!target) throw new NotFoundException('Maqsad xodim topilmadi');
    if (source.id === target.id) {
      throw new BadRequestException('Source va target bir xil bo`lishi mumkin emas');
    }
    if (source.role !== Role.MODERATOR) {
      throw new BadRequestException('Source faqat MODERATOR bo`lishi kerak');
    }
    if (source.energoId) {
      throw new BadRequestException('Source allaqachon Energo ID bilan bog`langan');
    }
    if (!target.energoId) {
      throw new BadRequestException('Target Energo ID xodimi bo`lishi kerak');
    }
    if (target.role === Role.SUPERADMIN) {
      throw new BadRequestException('SuperAdmin target sifatida tanlanmaydi');
    }

    const permissionMerge = dto.permissionMerge ?? 'prefer-source';
    const sourceRowCounts = await this.countSourceRows(source.id);
    const conflicts = await this.detectConflicts(source.id, target.id);
    const plannedActions = this.buildPlannedActions(
      source,
      target,
      permissionMerge,
      conflicts,
    );

    const preview: LegacyModeratorPreview = {
      dryRun: !!dto.dryRun,
      source: this.toUserSummary(source),
      target: this.toUserSummary(target),
      sourceRowCounts,
      conflicts,
      plannedActions,
    };

    if (dto.dryRun) {
      return preview;
    }

    await this.executeMerge(source, target, permissionMerge, conflicts);

    return {
      ...preview,
      dryRun: false,
      merged: true,
      deletedSourceId: source.id,
      targetUserId: target.id,
    };
  }

  private async tableExists(tableName: string): Promise<boolean> {
    if (this.tableExistsCache.has(tableName)) {
      return this.tableExistsCache.get(tableName)!;
    }
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = $1
      ) AS "exists"`,
      [tableName],
    );
    const ok = Boolean(rows[0]?.exists);
    this.tableExistsCache.set(tableName, ok);
    return ok;
  }

  private async countRowsIfTable(
    tableName: string,
    sql: string,
    params: unknown[],
  ): Promise<number> {
    if (!(await this.tableExists(tableName))) return 0;
    const row = await this.dataSource.query(sql, params);
    return Number(row[0]?.c ?? 0);
  }

  private toUserSummary(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      energoId: user.energoId,
    };
  }

  private async countSourceRows(sourceId: string): Promise<RowCount[]> {
    const tables: Array<{ label: string; table: string; sql: string }> = [
      {
        label: 'moderator_permissions',
        table: 'moderator_permissions',
        sql: `SELECT COUNT(*)::int AS c FROM moderator_permissions WHERE moderator_user_id = $1`,
      },
      {
        label: 'moderator_violations',
        table: 'moderator_violations',
        sql: `SELECT COUNT(*)::int AS c FROM moderator_violations WHERE moderator_user_id = $1`,
      },
      {
        label: 'user_organizations',
        table: 'user_organizations',
        sql: `SELECT COUNT(*)::int AS c FROM user_organizations WHERE "userId" = $1`,
      },
      {
        label: 'admin_audit_logs',
        table: 'admin_audit_logs',
        sql: `SELECT COUNT(*)::int AS c FROM admin_audit_logs WHERE actor_user_id = $1`,
      },
      {
        label: 'levels (created_by)',
        table: 'levels',
        sql: `SELECT COUNT(*)::int AS c FROM levels WHERE created_by = $1`,
      },
      {
        label: 'theories (created_by)',
        table: 'theories',
        sql: `SELECT COUNT(*)::int AS c FROM theories WHERE created_by = $1`,
      },
      {
        label: 'questions (created_by)',
        table: 'questions',
        sql: `SELECT COUNT(*)::int AS c FROM questions WHERE created_by = $1`,
      },
      {
        label: 'exam_sessions (approved_by)',
        table: 'exam_sessions',
        sql: `SELECT COUNT(*)::int AS c FROM exam_sessions WHERE approved_by_user_id = $1`,
      },
      {
        label: 'exam_attempts (oral_reviewed)',
        table: 'exam_attempts',
        sql: `SELECT COUNT(*)::int AS c FROM exam_attempts WHERE oral_reviewed_by_id = $1`,
      },
      {
        label: 'oauth_integration_settings (updated_by)',
        table: 'oauth_integration_settings',
        sql: `SELECT COUNT(*)::int AS c FROM oauth_integration_settings WHERE updated_by = $1`,
      },
    ];

    const out: RowCount[] = [];
    for (const item of tables) {
      const count = await this.countRowsIfTable(item.table, item.sql, [sourceId]);
      out.push({ table: item.label, count });
    }
    return out;
  }

  private async detectConflicts(
    sourceId: string,
    targetId: string,
  ): Promise<string[]> {
    const conflicts: string[] = [];

    const sourcePerm = await this.permRepo.findOne({
      where: { moderatorUserId: sourceId },
    });
    const targetPerm = await this.permRepo.findOne({
      where: { moderatorUserId: targetId },
    });
    if (sourcePerm && targetPerm) {
      conflicts.push(
        'moderator_permissions: ikkala hisobda ham ruxsatlar bor — birlashtiriladi',
      );
    }

    const orgOverlap = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS c
      FROM user_organizations s
      INNER JOIN user_organizations t
        ON s."organizationId" = t."organizationId"
      WHERE s."userId" = $1 AND t."userId" = $2
      `,
      [sourceId, targetId],
    );
    if (Number(orgOverlap[0]?.c ?? 0) > 0) {
      conflicts.push(
        'user_organizations: umumiy filial(lar) bor — dublikatlar o`tkazib yuboriladi',
      );
    }

    const progressOverlap =
      (await this.tableExists('user_progress'))
        ? await this.dataSource.query(
            `
      SELECT COUNT(*)::int AS c
      FROM user_progress s
      INNER JOIN user_progress t
        ON s.organization_id = t.organization_id
      WHERE s.user_id = $1 AND t.user_id = $2
      `,
            [sourceId, targetId],
          )
        : [{ c: 0 }];
    if (Number(progressOverlap[0]?.c ?? 0) > 0) {
      conflicts.push(
        'user_progress: bir xil filialda progress bor — target progress saqlanadi',
      );
    }

    if (await this.tableExists('employee_certificates')) {
      const certTarget = await this.dataSource.query(
        `SELECT COUNT(*)::int AS c FROM employee_certificates WHERE user_id = $1`,
        [targetId],
      );
      const certSource = await this.dataSource.query(
        `SELECT COUNT(*)::int AS c FROM employee_certificates WHERE user_id = $1`,
        [sourceId],
      );
      if (Number(certTarget[0]?.c) > 0 && Number(certSource[0]?.c) > 0) {
        conflicts.push(
          'employee_certificates: ikkala hisobda ham guvohnoma — faqat created_by ko`chiriladi',
        );
      }
    }

    return conflicts;
  }

  private buildPlannedActions(
    source: User,
    target: User,
    permissionMerge: string,
    conflicts: string[],
  ): string[] {
    const actions = [
      `moderator_violations va audit/content actor yozuvlari ${source.email} → ${target.email}`,
      `user_organizations: source filiallari target ga qo‘shiladi`,
      `moderator_permissions: ${permissionMerge} strategiyasi bilan birlashtiriladi`,
      `target role = MODERATOR, parol tozalanadi (Energo ID OAuth)`,
      `source moderator hisobi o‘chiriladi (${source.email})`,
    ];
    if (!target.avatarUrl && source.avatarUrl) {
      actions.push('avatar_url source dan target ga ko‘chiriladi');
    }
    if (conflicts.length > 0) {
      actions.push('Konfliktlar yuqoridagi qoidalarga ko‘ra hal qilinadi');
    }
    return actions;
  }

  private async executeMerge(
    source: User,
    target: User,
    permissionMerge: 'prefer-source' | 'prefer-target' | 'union',
    conflicts: string[],
  ) {
    void conflicts;
    const sourceId = source.id;
    const targetId = target.id;

    await this.dataSource.transaction(async (manager) => {
      const query = (sql: string, params?: unknown[]) =>
        manager.query(sql, params);

      const actorUpdates: Array<[string, string]> = [
        ['moderator_violations', 'moderator_user_id'],
        ['admin_audit_logs', 'actor_user_id'],
        ['levels', 'created_by'],
        ['theories', 'created_by'],
        ['questions', 'created_by'],
        ['employee_checks', 'created_by_user_id'],
        ['employee_certificates', 'created_by_user_id'],
        ['exam_sessions', 'approved_by_user_id'],
        ['exam_attempts', 'oral_reviewed_by_id'],
        ['oauth_integration_settings', 'updated_by'],
      ];

      for (const [table, column] of actorUpdates) {
        if (!(await this.tableExists(table))) continue;
        await query(
          `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
          [targetId, sourceId],
        );
      }

      await query(
        `
        INSERT INTO user_organizations ("userId", "organizationId")
        SELECT $1, "organizationId"
        FROM user_organizations
        WHERE "userId" = $2
        ON CONFLICT ON CONSTRAINT uq_user_org DO NOTHING
        `,
        [targetId, sourceId],
      );

      await this.mergePermissions(query, sourceId, targetId, permissionMerge);

      await this.mergeUserProgress(query, sourceId, targetId);
      await this.reassignSimpleUserRows(query, sourceId, targetId);

      if (!target.avatarUrl && source.avatarUrl) {
        await query(`UPDATE users SET avatar_url = $1 WHERE id = $2`, [
          source.avatarUrl,
          targetId,
        ]);
      }

      await query(`DELETE FROM refresh_tokens WHERE "userId" = $1`, [sourceId]);

      await query(
        `
        UPDATE users SET
          role = $1,
          password_hash = NULL,
          initial_password = NULL,
          must_change_password = false
        WHERE id = $2
        `,
        [Role.MODERATOR, targetId],
      );

      await query(`DELETE FROM users WHERE id = $1`, [sourceId]);
    });
  }

  private async mergePermissions(
    query: (sql: string, params?: unknown[]) => Promise<unknown>,
    sourceId: string,
    targetId: string,
    strategy: 'prefer-source' | 'prefer-target' | 'union',
  ) {
    const rows = await query(
      `SELECT moderator_user_id, permissions FROM moderator_permissions WHERE moderator_user_id = ANY($1)`,
      [[sourceId, targetId]],
    ) as Array<{ moderator_user_id: string; permissions: ModeratorPermissions }>;

    const sourceRow = rows.find((r) => r.moderator_user_id === sourceId);
    const targetRow = rows.find((r) => r.moderator_user_id === targetId);

    const sourcePerms = sourceRow
      ? mergeModeratorPermissions(sourceRow.permissions)
      : null;
    const targetPerms = targetRow
      ? mergeModeratorPermissions(targetRow.permissions)
      : null;

    let finalPerms: ModeratorPermissions;
    if (strategy === 'prefer-source' && sourcePerms) {
      finalPerms = sourcePerms;
    } else if (strategy === 'prefer-target' && targetPerms) {
      finalPerms = targetPerms;
    } else if (sourcePerms && targetPerms) {
      finalPerms = this.unionPermissions(sourcePerms, targetPerms);
    } else {
      finalPerms = sourcePerms ?? targetPerms ?? mergeModeratorPermissions(null);
    }

    await query(
      `DELETE FROM moderator_permissions WHERE moderator_user_id = ANY($1)`,
      [[sourceId, targetId]],
    );

    await query(
      `
      INSERT INTO moderator_permissions (moderator_user_id, permissions)
      VALUES ($1, $2::jsonb)
      `,
      [targetId, JSON.stringify(finalPerms)],
    );
  }

  private unionPermissions(
    a: ModeratorPermissions,
    b: ModeratorPermissions,
  ): ModeratorPermissions {
    const out = {} as ModeratorPermissions;
    for (const key of MODERATOR_PERMISSION_KEYS) {
      out[key] = {
        view: a[key].view || b[key].view,
        create: a[key].create || b[key].create,
        update: a[key].update || b[key].update,
        delete: a[key].delete || b[key].delete,
      };
    }
    return out;
  }

  private async mergeUserProgress(
    query: (sql: string, params?: unknown[]) => Promise<unknown>,
    sourceId: string,
    targetId: string,
  ) {
    if (!(await this.tableExists('user_progress'))) return;

    const overlaps = await query(
      `
      SELECT s.id AS source_id, t.id AS target_id, s.organization_id
      FROM user_progress s
      INNER JOIN user_progress t
        ON s.organization_id = t.organization_id
      WHERE s.user_id = $1 AND t.user_id = $2
      `,
      [sourceId, targetId],
    ) as Array<{ source_id: string; target_id: string }>;

    for (const row of overlaps) {
      await query(`DELETE FROM user_progress WHERE id = $1`, [row.source_id]);
    }

    await query(
      `UPDATE user_progress SET user_id = $1 WHERE user_id = $2`,
      [targetId, sourceId],
    );
  }

  private async reassignSimpleUserRows(
    query: (sql: string, params?: unknown[]) => Promise<unknown>,
    sourceId: string,
    targetId: string,
  ) {
    const tables: Array<[string, string]> = [
      ['user_question_attempts', 'user_id'],
      ['user_level_completions', 'user_id'],
      ['certificates', 'user_id'],
      ['exam_assignments', 'user_id'],
      ['exam_sessions', 'user_id'],
      ['notifications', 'user_id'],
      ['user_sessions', 'user_id'],
      ['user_activity_events', 'user_id'],
      ['employee_checks', 'user_id'],
      ['terminated_employees', 'user_id'],
    ];

    for (const [table, column] of tables) {
      if (!(await this.tableExists(table))) continue;
      await query(
        `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
        [targetId, sourceId],
      );
    }

    if (await this.tableExists('employee_certificates')) {
      const targetCert = await query(
        `SELECT COUNT(*)::int AS c FROM employee_certificates WHERE user_id = $1`,
        [targetId],
      );
      if (Number((targetCert as Array<{ c: number }>)[0]?.c ?? 0) === 0) {
        await query(
          `UPDATE employee_certificates SET user_id = $1 WHERE user_id = $2`,
          [targetId, sourceId],
        );
      }
    }

    if (await this.tableExists('user_positions')) {
      await query(
        `
      DELETE FROM user_positions up
      WHERE up.user_id = $1
        AND EXISTS (
          SELECT 1 FROM user_positions t
          WHERE t.user_id = $2 AND t.position_id = up.position_id
        )
      `,
        [sourceId, targetId],
      );
      await query(
        `UPDATE user_positions SET user_id = $1 WHERE user_id = $2`,
        [targetId, sourceId],
      );
    }

    if (await this.tableExists('ai_chat_sessions')) {
      await query(
        `
      DELETE FROM ai_chat_sessions s
      WHERE s.user_id = $1
        AND EXISTS (
          SELECT 1 FROM ai_chat_sessions t
          WHERE t.user_id = $2 AND t.scope = s.scope
        )
      `,
        [sourceId, targetId],
      );
      await query(
        `UPDATE ai_chat_sessions SET user_id = $1 WHERE user_id = $2`,
        [targetId, sourceId],
      );
    }
  }
}
