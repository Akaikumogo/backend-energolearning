import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Role } from '../common/enums/role.enum';
import { EnergoIdAuthClient } from '../auth/energo-id-auth.client';

let SQL_ENGINE: SqlJsStatic | null = null;
async function getSqlEngine(): Promise<SqlJsStatic> {
  if (!SQL_ENGINE) {
    SQL_ENGINE = await initSqlJs();
  }
  return SQL_ENGINE;
}

export interface ElektroArchiveMetadataRecord {
  archiveId: string;
  createdAt: string;
  sourceDatabase: string;
  schemaVersion: string;
  tableCounts: Record<string, number>;
  checksumSha256: string;
  status: 'INITIALIZING' | 'VERIFIED' | 'FAILED';
  verifiedAt: string;
  executedBy: string;
}

@Injectable()
export class ElektroArchiveService {
  private readonly logger = new Logger(ElektroArchiveService.name);
  private readonly archivesDir = path.resolve(
    process.cwd(),
    'data',
    'archives',
  );

  constructor(
    private readonly dataSource: DataSource,
    private readonly energoIdAuthClient: EnergoIdAuthClient,
  ) {
    if (!fs.existsSync(this.archivesDir)) {
      fs.mkdirSync(this.archivesDir, { recursive: true });
    }
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.dataSource.query(`SELECT to_regclass($1) AS reg`, [
      `public.${tableName}`,
    ]);
    return Boolean(rows[0]?.reg);
  }

  /**
   * Cutover preview: qancha test foydalanuvchi, urinish va sertifikatlar
   * arxivlanishi va qancha o'quv kontenti saqlanib qolishi hisoboti.
   */
  async getCutoverPreview() {
    const safeCount = async (sql: string, params: unknown[] = []) => {
      try {
        const rows = await this.dataSource.query(sql, params);
        return Number(rows[0]?.count ?? 0);
      } catch {
        return 0;
      }
    };

    const [
      testUsers,
      moderators,
      superadmins,
      examAttempts,
      certificates,
      progressRows,
      levels,
      theories,
      questions,
      examQuestions,
    ] = await Promise.all([
      safeCount(`SELECT COUNT(*)::int AS count FROM users WHERE role = $1`, [
        Role.USER,
      ]),
      safeCount(
        `SELECT COUNT(*)::int AS count FROM users WHERE role <> $1 AND role <> $2`,
        [Role.SUPERADMIN, Role.USER],
      ),
      safeCount(`SELECT COUNT(*)::int AS count FROM users WHERE role = $1`, [
        Role.SUPERADMIN,
      ]),
      safeCount(`SELECT COUNT(*)::int AS count FROM exam_attempts`),
      safeCount(`SELECT COUNT(*)::int AS count FROM certificates`),
      safeCount(`SELECT COUNT(*)::int AS count FROM user_progress`),
      safeCount(`SELECT COUNT(*)::int AS count FROM levels`),
      safeCount(`SELECT COUNT(*)::int AS count FROM theories`),
      safeCount(`SELECT COUNT(*)::int AS count FROM questions`),
      safeCount(`SELECT COUNT(*)::int AS count FROM exam_questions`),
    ]);

    let energoIdStatus = {
      configured: false,
      reachable: false,
      error: undefined as string | undefined,
    };

    if (this.energoIdAuthClient.isConfigured()) {
      energoIdStatus.configured = true;
      try {
        await this.energoIdAuthClient.listEmployees();
        energoIdStatus.reachable = true;
      } catch (err: unknown) {
        energoIdStatus.reachable = false;
        energoIdStatus.error =
          err instanceof Error ? err.message : 'Energo ID ulanmadi';
      }
    } else {
      energoIdStatus.error = 'ENERGO_ID_BASE_URL sozlanmagan';
    }

    let activeSync = false;
    let activeSyncReason = '';
    try {
      const activeSyncLocks = await this.dataSource.query(
        `SELECT name FROM "app_sync_locks" WHERE "name" = 'elektrolearn-energo-employee-sync'`,
      );
      if (activeSyncLocks && activeSyncLocks.length > 0) {
        activeSync = true;
        activeSyncReason = 'Energo ID xodimlarni sinxronlash jarayoni faol';
      }
    } catch {
      // ignore
    }

    return {
      toArchive: {
        testUsers,
        moderators,
        examAttempts,
        certificates,
        progressRows,
      },
      preservedContent: {
        levels,
        theories,
        questions,
        examQuestions,
        superadmins,
      },
      energoIdStatus,
      activeSync,
      activeSyncReason,
    };
  }

  /**
   * 2-bosqichli xavfsiz Cutover (ElektroLearn):
   * 1. Idempotency lock
   * 2. Test ma'lumotlarini SQLite ga to'liq ko'chirish
   * 3. Integrity check + exact counts verification + SHA-256 Checksum
   * 4. FAQAT VA FAQAT tekshiruvdan to'liq o'tgandan so'ng FK tartibida PostgreSQL tozalash
   * 5. O'quv kontenti (levels, theories, questions) mutlaqo saqlanadi
   */
  async executeCutover(
    executedBy: string,
    confirmationCode: string,
    force = false,
  ): Promise<{
    success: boolean;
    archiveId: string;
    fileName: string;
    checksumSha256: string;
    tableCounts: Record<string, number>;
  }> {
    if (confirmationCode !== 'CONFIRM-CUTOVER') {
      throw new BadRequestException(
        'Tasdiqlash kodi noto‘g‘ri. "CONFIRM-CUTOVER" deb kiritilishi shart.',
      );
    }

    const lockAcquired = await this.tryCutoverLock(force);
    if (!lockAcquired) {
      throw new ConflictException('Cutover jarayoni ayni paytda bajarilmoqda.');
    }

    const archiveId = `el_archive_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(4).toString('hex')}`;
    const fileName = `${archiveId}.sqlite`;
    const filePath = path.join(this.archivesDir, fileName);

    let sqliteDb: Database | null = null;
    const tableCounts: Record<string, number> = {};

    try {
      this.logger.log(`Boshlandi: ElektroLearn Cutover [${archiveId}]`);

      const SQL = await getSqlEngine();
      sqliteDb = new SQL.Database();
      sqliteDb.run('PRAGMA synchronous = NORMAL;');
      sqliteDb.run('PRAGMA journal_mode = WAL;');

      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS archive_metadata (
          archive_id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          source_database TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          table_counts TEXT NOT NULL,
          checksum_sha256 TEXT NOT NULL,
          status TEXT NOT NULL,
          verified_at TEXT,
          executed_by TEXT NOT NULL
        );
      `);

      const tablesToArchive: Array<{
        name: string;
        sql: string;
        params?: unknown[];
      }> = [
        {
          name: 'users_non_superadmin',
          sql: `SELECT * FROM users WHERE role <> 'SUPERADMIN'`,
        },
        {
          name: 'moderator_permissions',
          sql: `SELECT * FROM moderator_permissions`,
        },
        {
          name: 'exam_attempt_answers',
          sql: `SELECT * FROM exam_attempt_answers`,
        },
        {
          name: 'exam_attempts',
          sql: `SELECT * FROM exam_attempts`,
        },
        {
          name: 'exam_sessions',
          sql: `SELECT * FROM exam_sessions`,
        },
        {
          name: 'exam_assignments',
          sql: `SELECT * FROM exam_assignments`,
        },
        {
          name: 'user_question_attempts',
          sql: `SELECT * FROM user_question_attempts`,
        },
        {
          name: 'user_progress',
          sql: `SELECT * FROM user_progress`,
        },
        {
          name: 'user_level_completions',
          sql: `SELECT * FROM user_level_completions`,
        },
        {
          name: 'certificates',
          sql: `SELECT * FROM certificates`,
        },
        {
          name: 'employee_certificates',
          sql: `SELECT * FROM employee_certificates`,
        },
        {
          name: 'user_activity_events',
          sql: `SELECT * FROM user_activity_events`,
        },
        {
          name: 'user_sessions',
          sql: `SELECT * FROM user_sessions`,
        },
        {
          name: 'daily_plans',
          sql: `SELECT * FROM daily_plans`,
        },
        {
          name: 'notifications',
          sql: `SELECT * FROM notifications`,
        },
        {
          name: 'admin_audit_logs',
          sql: `SELECT * FROM admin_audit_logs`,
        },
        {
          name: 'nes_employee_position_history',
          sql: `SELECT * FROM nes_employee_position_history`,
        },
        {
          name: 'nes_employee_history',
          sql: `SELECT * FROM nes_employee_history`,
        },
        {
          name: 'nes_employees',
          sql: `SELECT * FROM nes_employees`,
        },
        {
          name: 'terminated_employees',
          sql: `SELECT * FROM terminated_employees`,
        },
        {
          name: 'employee_safety_record_changes',
          sql: `SELECT * FROM employee_safety_record_changes`,
        },
        {
          name: 'employee_safety_records',
          sql: `SELECT * FROM employee_safety_records`,
        },
        {
          name: 'employee_safety_profiles',
          sql: `SELECT * FROM employee_safety_profiles`,
        },
        {
          name: 'report_submissions',
          sql: `SELECT * FROM report_submissions`,
        },
        {
          name: 'reporting_activation_history',
          sql: `SELECT * FROM reporting_activation_history`,
        },
        {
          name: 'user_positions',
          sql: `SELECT * FROM user_positions`,
        },
        {
          name: 'user_organizations',
          sql: `SELECT * FROM user_organizations`,
        },
        {
          name: 'moderator_violations',
          sql: `SELECT * FROM moderator_violations`,
        },
      ];

      for (const t of tablesToArchive) {
        const exists = await this.tableExists(
          t.name === 'users_non_superadmin' ? 'users' : t.name,
        );
        if (!exists) continue;

        const rows: Array<Record<string, unknown>> =
          await this.dataSource.query(t.sql, t.params ?? []);
        tableCounts[t.name] = rows.length;

        if (rows.length > 0) {
          const sample = rows[0]!;
          const cols = Object.keys(sample);
          const colDefs = cols
            .map((c) => `"${c}" ${this.inferSqliteType(sample[c])}`)
            .join(', ');
          sqliteDb.run(`CREATE TABLE IF NOT EXISTS "${t.name}" (${colDefs});`);

          const placeholders = cols.map(() => '?').join(', ');
          const insertSql = `INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders});`;
          const insertStmt = sqliteDb.prepare(insertSql);

          sqliteDb.run('BEGIN TRANSACTION;');
          for (const row of rows) {
            const values = cols.map((col) => this.serializeValue(row[col]));
            insertStmt.run(values as any[]);
          }
          sqliteDb.run('COMMIT;');
          insertStmt.free();
        } else {
          sqliteDb.run(
            `CREATE TABLE IF NOT EXISTS "${t.name}" (id TEXT PRIMARY KEY);`,
          );
        }
      }

      // 2-BOSQICH: VERIFIKATSIYA
      const integrityRes = sqliteDb.exec('PRAGMA integrity_check;');
      const integrity = integrityRes[0]?.values?.[0]?.[0];

      if (integrity !== 'ok') {
        throw new Error(
          `SQLite arxivi yaxlitlik tekshiruvidan o'tmadi: ${integrity}`,
        );
      }

      for (const t of tablesToArchive) {
        if (tableCounts[t.name] === undefined) continue;
        const countRes = sqliteDb.exec(
          `SELECT COUNT(*) as count FROM "${t.name}"`,
        );
        const checkCount = Number(countRes[0]?.values?.[0]?.[0] ?? 0);

        if (checkCount !== tableCounts[t.name]) {
          throw new Error(
            `Qatorlar soni mos kelmadi [${t.name}]: PG=${tableCounts[t.name]}, SQLite=${checkCount}`,
          );
        }
      }

      const initialData = sqliteDb.export();
      fs.writeFileSync(filePath, Buffer.from(initialData));
      sqliteDb.close();
      sqliteDb = null;

      const fileBuffer = fs.readFileSync(filePath);
      const checksumSha256 = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      const writerDb = new SQL.Database(fileBuffer);
      writerDb.run(
        `INSERT INTO archive_metadata (
          archive_id, created_at, source_database, schema_version,
          table_counts, checksum_sha256, status, verified_at, executed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          archiveId,
          new Date().toISOString(),
          'elektrolearn_postgres',
          '1.0.0',
          JSON.stringify(tableCounts),
          checksumSha256,
          'VERIFIED',
          new Date().toISOString(),
          executedBy,
        ],
      );
      fs.writeFileSync(filePath, Buffer.from(writerDb.export()));
      writerDb.close();

      this.logger.log(
        `ElektroLearn arxivi VERIFIED: ${archiveId}, checksum: ${checksumSha256.slice(0, 12)}...`,
      );

      // 3-BOSQICH: PostgreSQL Tozalash (Strict FK Dependency Order)
      const DELETE_ORDER = [
        'exam_attempt_answers',
        'exam_attempts',
        'exam_sessions',
        'exam_assignments',
        'user_question_attempts',
        'user_progress',
        'user_level_completions',
        'certificates',
        'employee_certificates',
        'employee_checks',
        'user_activity_events',
        'user_sessions',
        'daily_plans',
        'ai_chat_messages',
        'ai_chat_sessions',
        'notifications',
        'admin_audit_logs',
        'moderator_violations',
        'moderator_permissions',
        'employee_safety_record_changes',
        'employee_safety_records',
        'employee_safety_profiles',
        'report_submissions',
        'reporting_activation_history',
        'nes_employee_position_history',
        'nes_employee_history',
        'nes_employees',
        'terminated_employees',
        'user_positions',
        'user_organizations',
      ];

      await this.dataSource.transaction(async (manager) => {
        for (const tbl of DELETE_ORDER) {
          if (await this.tableExists(tbl)) {
            await manager.query(`DELETE FROM "${tbl}"`);
          }
        }

        // O'quv kontenti (levels, theories, questions)dagi created_by agar o'chirilayotgan adminga bog'langan bo'lsa,
        // FK constraint xatoligi bo'lmasligi uchun NULL ga o'tkaziladi (o'quv kontentining o'zi to'liq saqlanadi!)
        if (await this.tableExists('levels')) {
          await manager
            .query(
              `UPDATE levels SET created_by = NULL WHERE created_by IN (SELECT id FROM users WHERE role <> 'SUPERADMIN')`,
            )
            .catch(() => undefined);
        }
        if (await this.tableExists('theories')) {
          await manager
            .query(
              `UPDATE theories SET created_by = NULL WHERE created_by IN (SELECT id FROM users WHERE role <> 'SUPERADMIN')`,
            )
            .catch(() => undefined);
        }
        if (await this.tableExists('questions')) {
          await manager
            .query(
              `UPDATE questions SET created_by = NULL WHERE created_by IN (SELECT id FROM users WHERE role <> 'SUPERADMIN')`,
            )
            .catch(() => undefined);
        }

        if (await this.tableExists('refresh_tokens')) {
          await manager
            .query(`DELETE FROM refresh_tokens`)
            .catch(() => undefined);
        }

        // Barcha USER, MODERATOR, APPROVER, ACCOUNTING va boshqa rollar to'liq o'chiriladi.
        // FAQAT VA FAQAT SUPERADMIN saqlanadi!
        await manager.query(`DELETE FROM users WHERE role <> 'SUPERADMIN'`);

        // Tekshirish: o'quv kontenti joyidami?
        const checkContent = await manager.query(
          `SELECT COUNT(*)::int AS count FROM levels`,
        );
        const checkSuperadmin = await manager.query(
          `SELECT COUNT(*)::int AS count FROM users WHERE role = 'SUPERADMIN'`,
        );
        this.logger.log(
          `Postgres tozalashdan so'ng: levels=${checkContent[0]?.count}, superadmin soni=${checkSuperadmin[0]?.count}. Barcha boshqa xodim va moderatorlar tozalandi.`,
        );
      });

      return {
        success: true,
        archiveId,
        fileName,
        checksumSha256,
        tableCounts,
      };
    } catch (error) {
      if (sqliteDb) {
        try {
          sqliteDb.close();
        } catch {
          // ignore
        }
      }
      this.logger.error(
        `ElektroLearn Cutover xatosi: ${error instanceof Error ? error.message : error}`,
        error as Error,
      );
      throw error;
    } finally {
      await this.releaseCutoverLock();
    }
  }

  async listArchives(): Promise<ElektroArchiveMetadataRecord[]> {
    if (!fs.existsSync(this.archivesDir)) return [];

    const files = fs
      .readdirSync(this.archivesDir)
      .filter((f) => f.endsWith('.sqlite'))
      .sort()
      .reverse();

    const archives: ElektroArchiveMetadataRecord[] = [];
    const SQL = await getSqlEngine();

    for (const file of files) {
      const filePath = path.join(this.archivesDir, file);
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const db = new SQL.Database(fileBuffer);
        const res = db.exec('SELECT * FROM archive_metadata LIMIT 1');
        db.close();

        if (res.length > 0 && res[0].values.length > 0) {
          const cols = res[0].columns;
          const val = res[0].values[0];
          const meta: Record<string, unknown> = {};
          cols.forEach((col, idx) => {
            meta[col] = val[idx];
          });

          archives.push({
            archiveId: String(meta.archive_id),
            createdAt: String(meta.created_at),
            sourceDatabase: String(meta.source_database),
            schemaVersion: String(meta.schema_version),
            tableCounts: JSON.parse(String(meta.table_counts || '{}')),
            checksumSha256: String(meta.checksum_sha256),
            status: meta.status as 'INITIALIZING' | 'VERIFIED' | 'FAILED',
            verifiedAt: String(meta.verified_at),
            executedBy: String(meta.executed_by),
          });
        }
      } catch (err) {
        this.logger.warn(`Arxiv faylini o'qib bo'lmadi [${file}]: ${err}`);
      }
    }

    return archives;
  }

  async getArchiveRecords(
    archiveId: string,
    tableName = 'users_test_role',
    options: { page?: number; limit?: number; search?: string } = {},
  ) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const filePath = path.join(this.archivesDir, `${archiveId}.sqlite`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Arxiv topilmadi: ${archiveId}`);
    }

    const SQL = await getSqlEngine();
    const fileBuffer = fs.readFileSync(filePath);
    const db = new SQL.Database(fileBuffer);
    try {
      let countSql = `SELECT COUNT(*) as count FROM "${tableName}"`;
      let dataSql = `SELECT * FROM "${tableName}"`;
      const params: Array<string | number> = [];

      if (options.search?.trim()) {
        const q = `%${options.search.trim()}%`;
        if (tableName.includes('user')) {
          countSql += ` WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?`;
          dataSql += ` WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?`;
          params.push(q, q, q);
        }
      }

      dataSql += ` LIMIT ? OFFSET ?`;

      const countStmt = db.prepare(countSql);
      if (params.length > 0) countStmt.bind(params as any[]);
      let total = 0;
      if (countStmt.step()) {
        const countObj = countStmt.getAsObject();
        total = Number(countObj.count ?? 0);
      }
      countStmt.free();

      const dataStmt = db.prepare(dataSql);
      dataStmt.bind([...params, limit, offset] as any[]);
      const rows: Array<Record<string, unknown>> = [];
      while (dataStmt.step()) {
        rows.push(dataStmt.getAsObject());
      }
      dataStmt.free();

      return {
        archiveId,
        table: tableName,
        page,
        limit,
        total,
        data: rows,
      };
    } finally {
      db.close();
    }
  }

  getArchiveFilePath(archiveId: string): string {
    const filePath = path.join(this.archivesDir, `${archiveId}.sqlite`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Arxiv fayli topilmadi: ${archiveId}`);
    }
    return filePath;
  }

  private inferSqliteType(value: unknown): string {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'INTEGER' : 'REAL';
    }
    if (typeof value === 'boolean') {
      return 'INTEGER';
    }
    return 'TEXT';
  }

  private serializeValue(value: unknown): string | number | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value;
    return String(value);
  }

  private async tryCutoverLock(force = false): Promise<boolean> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "app_sync_locks" (
        "name" text PRIMARY KEY,
        "locked_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await this.dataSource.query(
      `DELETE FROM "app_sync_locks"
       WHERE "locked_at" < now() - interval '2 hours'`,
    );

    // Agar sync faol bo'lsa
    const activeSyncLocks = await this.dataSource.query(
      `SELECT name FROM "app_sync_locks" WHERE "name" = 'elektrolearn-energo-employee-sync'`,
    );
    if (activeSyncLocks.length > 0) {
      if (force) {
        this.logger.warn(
          `Majburiy cutover (force=true): faol Energo ID xodimlar sinxronizatsiyasi to'xtatildi va lock tozalandi.`,
        );
        await this.dataSource.query(
          `DELETE FROM "app_sync_locks" WHERE "name" = 'elektrolearn-energo-employee-sync'`,
        );
      } else {
        throw new ConflictException({
          message:
            'Energo ID xodimlarni sinxronlash jarayoni ayni paytda faol. Barcha jarayonlarni to‘xtatib, cutoverni davom ettirishni istaysizmi?',
          canForce: true,
          activeProcesses: true,
        });
      }
    }

    const rows = await this.dataSource.query(
      `INSERT INTO "app_sync_locks"("name")
       VALUES ($1)
       ON CONFLICT ("name") DO NOTHING
       RETURNING "name"`,
      ['elektrolearn-prod-cutover-lock'],
    );
    if (rows.length === 0) {
      return false;
    }

    // Cutover paytida cron sync ishga tushib ketmasligi uchun sync lockni ham band qilamiz
    await this.dataSource.query(
      `INSERT INTO "app_sync_locks"("name")
       VALUES ('elektrolearn-energo-employee-sync')
       ON CONFLICT ("name") DO UPDATE SET "locked_at" = now()`,
    );

    return true;
  }

  private async releaseCutoverLock() {
    await this.dataSource
      .query(
        `DELETE FROM "app_sync_locks" WHERE "name" IN ('elektrolearn-prod-cutover-lock', 'elektrolearn-energo-employee-sync')`,
      )
      .catch(() => undefined);
  }

  async abortSyncAndClearLocks(): Promise<{
    success: boolean;
    message: string;
  }> {
    await this.dataSource
      .query(
        `DELETE FROM "app_sync_locks" WHERE "name" IN ('elektrolearn-prod-cutover-lock', 'elektrolearn-energo-employee-sync')`,
      )
      .catch(() => undefined);

    this.logger.warn(`ElektroLearn sync va cutover locklari tozalandi.`);
    return {
      success: true,
      message: `Sinxronizatsiya va qulflar muvaffaqiyatli tozalandi.`,
    };
  }
}
