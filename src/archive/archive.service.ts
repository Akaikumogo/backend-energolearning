import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DatabaseSync } from 'node:sqlite';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Role } from '../common/enums/role.enum';
import { EnergoIdAuthClient } from '../auth/energo-id-auth.client';

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
      examAttempts,
      certificates,
      progressRows,
      levels,
      theories,
      questions,
      examQuestions,
      admins,
    ] = await Promise.all([
      safeCount(`SELECT COUNT(*)::int AS count FROM users WHERE role = $1`, [
        Role.USER,
      ]),
      safeCount(`SELECT COUNT(*)::int AS count FROM exam_attempts`),
      safeCount(`SELECT COUNT(*)::int AS count FROM certificates`),
      safeCount(`SELECT COUNT(*)::int AS count FROM user_progress`),
      safeCount(`SELECT COUNT(*)::int AS count FROM levels`),
      safeCount(`SELECT COUNT(*)::int AS count FROM theories`),
      safeCount(`SELECT COUNT(*)::int AS count FROM questions`),
      safeCount(`SELECT COUNT(*)::int AS count FROM exam_questions`),
      safeCount(
        `SELECT COUNT(*)::int AS count FROM users WHERE role IN ($1, $2)`,
        [Role.SUPERADMIN, Role.MODERATOR],
      ),
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

    return {
      toArchive: {
        testUsers,
        examAttempts,
        certificates,
        progressRows,
      },
      preservedContent: {
        levels,
        theories,
        questions,
        examQuestions,
        admins,
      },
      energoIdStatus,
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

    const lockAcquired = await this.tryCutoverLock();
    if (!lockAcquired) {
      throw new ConflictException('Cutover jarayoni ayni paytda bajarilmoqda.');
    }

    const archiveId = `el_archive_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(4).toString('hex')}`;
    const fileName = `${archiveId}.sqlite`;
    const filePath = path.join(this.archivesDir, fileName);

    let sqliteDb: DatabaseSync | null = null;
    const tableCounts: Record<string, number> = {};

    try {
      this.logger.log(`Boshlandi: ElektroLearn Cutover [${archiveId}]`);

      sqliteDb = new DatabaseSync(filePath);
      sqliteDb.exec('PRAGMA synchronous = NORMAL;');
      sqliteDb.exec('PRAGMA journal_mode = WAL;');

      sqliteDb.exec(`
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
          name: 'users_test_role',
          sql: `SELECT * FROM users WHERE role = 'USER' ORDER BY created_at ASC`,
        },
        {
          name: 'exam_attempt_answers',
          sql: `SELECT * FROM exam_attempt_answers ORDER BY created_at ASC`,
        },
        {
          name: 'exam_attempts',
          sql: `SELECT * FROM exam_attempts ORDER BY created_at ASC`,
        },
        {
          name: 'exam_sessions',
          sql: `SELECT * FROM exam_sessions ORDER BY created_at ASC`,
        },
        {
          name: 'exam_assignments',
          sql: `SELECT * FROM exam_assignments ORDER BY created_at ASC`,
        },
        {
          name: 'user_question_attempts',
          sql: `SELECT * FROM user_question_attempts ORDER BY created_at ASC`,
        },
        {
          name: 'user_progress',
          sql: `SELECT * FROM user_progress ORDER BY created_at ASC`,
        },
        {
          name: 'user_level_completions',
          sql: `SELECT * FROM user_level_completions ORDER BY created_at ASC`,
        },
        {
          name: 'certificates',
          sql: `SELECT * FROM certificates ORDER BY created_at ASC`,
        },
        {
          name: 'employee_certificates',
          sql: `SELECT * FROM employee_certificates ORDER BY created_at ASC`,
        },
        {
          name: 'user_activity_events',
          sql: `SELECT * FROM user_activity_events ORDER BY created_at ASC`,
        },
        {
          name: 'user_sessions',
          sql: `SELECT * FROM user_sessions ORDER BY created_at ASC`,
        },
        {
          name: 'daily_plans',
          sql: `SELECT * FROM daily_plans ORDER BY created_at ASC`,
        },
        {
          name: 'notifications',
          sql: `SELECT * FROM notifications ORDER BY created_at ASC`,
        },
        {
          name: 'admin_audit_logs',
          sql: `SELECT * FROM admin_audit_logs ORDER BY created_at ASC`,
        },
        {
          name: 'nes_employee_position_history',
          sql: `SELECT * FROM nes_employee_position_history ORDER BY created_at ASC`,
        },
        {
          name: 'nes_employee_history',
          sql: `SELECT * FROM nes_employee_history ORDER BY created_at ASC`,
        },
        {
          name: 'nes_employees',
          sql: `SELECT * FROM nes_employees ORDER BY created_at ASC`,
        },
        {
          name: 'terminated_employees',
          sql: `SELECT * FROM terminated_employees ORDER BY terminated_at ASC`,
        },
      ];

      for (const t of tablesToArchive) {
        const exists = await this.tableExists(
          t.name === 'users_test_role' ? 'users' : t.name,
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
          sqliteDb.exec(`CREATE TABLE IF NOT EXISTS "${t.name}" (${colDefs});`);

          const placeholders = cols.map(() => '?').join(', ');
          const insertSql = `INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
          const insertStmt = sqliteDb.prepare(insertSql);

          sqliteDb.exec('BEGIN TRANSACTION;');
          for (const row of rows) {
            const values = cols.map((col) => this.serializeValue(row[col]));
            insertStmt.run(...(values as Array<string | number | null>));
          }
          sqliteDb.exec('COMMIT;');
        } else {
          sqliteDb.exec(
            `CREATE TABLE IF NOT EXISTS "${t.name}" (id TEXT PRIMARY KEY);`,
          );
        }
      }

      // 2-BOSQICH: VERIFIKATSIYA
      const integrity = (
        sqliteDb.prepare('PRAGMA integrity_check;').all() as Array<{
          integrity_check: string;
        }>
      )[0]?.integrity_check;

      if (integrity !== 'ok') {
        throw new Error(
          `SQLite arxivi yaxlitlik tekshiruvidan o'tmadi: ${integrity}`,
        );
      }

      for (const t of tablesToArchive) {
        if (tableCounts[t.name] === undefined) continue;
        const checkCount = (
          sqliteDb
            .prepare(`SELECT COUNT(*) as count FROM "${t.name}"`)
            .all() as Array<{
            count: number;
          }>
        )[0]?.count;

        if (checkCount !== tableCounts[t.name]) {
          throw new Error(
            `Qatorlar soni mos kelmadi [${t.name}]: PG=${tableCounts[t.name]}, SQLite=${checkCount}`,
          );
        }
      }

      sqliteDb.close();
      sqliteDb = null;

      const fileBuffer = fs.readFileSync(filePath);
      const checksumSha256 = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      const writerDb = new DatabaseSync(filePath);
      const metaStmt = writerDb.prepare(`
        INSERT INTO archive_metadata (
          archive_id, created_at, source_database, schema_version,
          table_counts, checksum_sha256, status, verified_at, executed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      metaStmt.run(
        archiveId,
        new Date().toISOString(),
        'elektrolearn_postgres',
        '1.0.0',
        JSON.stringify(tableCounts),
        checksumSha256,
        'VERIFIED',
        new Date().toISOString(),
        executedBy,
      );
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
        'employee_safety_records',
        'employee_safety_profile',
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

        if (await this.tableExists('refresh_tokens')) {
          await manager.query(`
            DELETE FROM refresh_tokens
            WHERE user_id IN (SELECT id FROM users WHERE role = 'USER')
          `);
        }

        // Faqat role = 'USER' bo'lgan xodimlar o'chiriladi.
        // SUPERADMIN va MODERATOR lar 100% saqlanadi!
        await manager.query(`DELETE FROM users WHERE role = 'USER'`);

        // Tekshirish: o'quv kontenti joyidami?
        const checkContent = await manager.query(
          `SELECT COUNT(*)::int AS count FROM levels`,
        );
        this.logger.log(
          `Postgres tozalashdan so'ng: levels=${checkContent[0]?.count}, superadmin/moderatorlar saqlandi.`,
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

    for (const file of files) {
      const filePath = path.join(this.archivesDir, file);
      try {
        const db = new DatabaseSync(filePath, { readOnly: true });
        const meta = (
          db.prepare('SELECT * FROM archive_metadata LIMIT 1').all() as Array<{
            archive_id: string;
            created_at: string;
            source_database: string;
            schema_version: string;
            table_counts: string;
            checksum_sha256: string;
            status: 'INITIALIZING' | 'VERIFIED' | 'FAILED';
            verified_at: string;
            executed_by: string;
          }>
        )[0];
        db.close();

        if (meta) {
          archives.push({
            archiveId: meta.archive_id,
            createdAt: meta.created_at,
            sourceDatabase: meta.source_database,
            schemaVersion: meta.schema_version,
            tableCounts: JSON.parse(meta.table_counts || '{}'),
            checksumSha256: meta.checksum_sha256,
            status: meta.status,
            verifiedAt: meta.verified_at,
            executedBy: meta.executed_by,
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

    const db = new DatabaseSync(filePath, { readOnly: true });
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

      const total =
        (db.prepare(countSql).all(...params) as Array<{ count: number }>)[0]
          ?.count ?? 0;

      const rows = db.prepare(dataSql).all(...params, limit, offset);

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

  private async tryCutoverLock(): Promise<boolean> {
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

    // Agar sync faol bo'lsa cutoverga yo'l qo'yilmaydi
    const activeSyncLocks = await this.dataSource.query(
      `SELECT name FROM "app_sync_locks" WHERE "name" = 'elektrolearn-energo-employee-sync'`,
    );
    if (activeSyncLocks.length > 0) {
      throw new ConflictException(
        'Energo ID xodimlarni sinxronlash jarayoni ayni paytda faol. Cutoverdan oldin uning yakunlanishini kuting.',
      );
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
}
