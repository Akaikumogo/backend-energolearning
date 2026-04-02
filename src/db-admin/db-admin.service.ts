import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { spawn } from 'child_process';
import { createReadStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function requireEnabled() {
  const enabled = (process.env.ALLOW_DB_ADMIN ?? '').toLowerCase();
  if (enabled !== 'true') {
    throw new ForbiddenException('DB admin amallari o`chirilgan (ALLOW_DB_ADMIN=true qiling)');
  }
}

function runCmd(cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const p = spawn(cmd, args, {
      env: { ...process.env, ...(opts.env ?? {}) },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += String(d)));
    p.stderr.on('data', (d) => (stderr += String(d)));
    p.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

@Injectable()
export class DbAdminService {
  async createBackupFile(): Promise<{ filePath: string; fileName: string }> {
    requireEnabled();
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new BadRequestException('DATABASE_URL yo`q');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup-${stamp}.sql`;
    const filePath = join(tmpdir(), fileName);

    const args = [
      dbUrl,
      '--no-owner',
      '--no-acl',
      '--format=plain',
      '--file',
      filePath,
    ];

    const r = await runCmd('pg_dump', args);
    if (r.code !== 0) {
      throw new InternalServerErrorException(`pg_dump xatosi: ${r.stderr || r.stdout}`);
    }
    return { filePath, fileName };
  }

  async openBackupStream(filePath: string) {
    return createReadStream(filePath);
  }

  async cleanupFile(filePath: string) {
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore
    }
  }

  /**
   * Restore backup into target DB.
   * Target DB is resolved from RESTORE_DATABASE_URL (preferred) else DATABASE_URL.
   */
  async restoreFromFile(filePath: string) {
    requireEnabled();
    const targetDbUrl = process.env.RESTORE_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!targetDbUrl) throw new BadRequestException('RESTORE_DATABASE_URL yoki DATABASE_URL yo`q');

    // We use psql to execute .sql file.
    const args = [targetDbUrl, '-v', 'ON_ERROR_STOP=1', '-f', filePath];
    const r = await runCmd('psql', args);
    if (r.code !== 0) {
      throw new InternalServerErrorException(`psql restore xatosi: ${r.stderr || r.stdout}`);
    }
    return { success: true };
  }
}

