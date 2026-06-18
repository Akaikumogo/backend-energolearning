import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_EXTS = ['.mjs', '.cjs', '.js'];
const NAME_RE = /^[A-Za-z0-9_-]+$/;
const MAX_OUTPUT = 200_000; // ~200KB
const TIMEOUT_MS = 10 * 60_000; // 10 daqiqa

export type RunResult = {
  script: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
};

@Injectable()
export class AdminScriptsService {
  private readonly logger = new Logger(AdminScriptsService.name);

  private resolveScriptsDir(): string {
    // dist/ ichidan ham, src/ ichidan ham `../../scripts` topiladi
    const candidates = [
      path.resolve(process.cwd(), 'scripts'),
      path.resolve(__dirname, '../../scripts'),
      path.resolve(__dirname, '../../../scripts'),
    ];
    for (const dir of candidates) {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        return dir;
      }
    }
    return candidates[0];
  }

  listScripts(): string[] {
    const dir = this.resolveScriptsDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => ALLOWED_EXTS.includes(path.extname(f)))
      .sort();
  }

  async runScript(
    scriptName: string,
    env?: Record<string, string>,
  ): Promise<RunResult> {
    if (!scriptName || typeof scriptName !== 'string') {
      throw new BadRequestException('scriptName majburiy');
    }

    // scriptName .mjs/.js bo'lishi mumkin yoki kengaytmasiz
    let baseName = scriptName.trim();
    let ext = path.extname(baseName);
    if (ext) {
      if (!ALLOWED_EXTS.includes(ext)) {
        throw new BadRequestException(
          `Ruxsat etilmagan kengaytma: ${ext}. Faqat: ${ALLOWED_EXTS.join(', ')}`,
        );
      }
      baseName = baseName.slice(0, -ext.length);
    }

    if (!NAME_RE.test(baseName)) {
      throw new BadRequestException(
        'scriptName faqat A-Z, a-z, 0-9, _, - belgilarini saqlashi mumkin',
      );
    }

    const dir = this.resolveScriptsDir();
    let resolvedPath: string | null = null;
    for (const e of ext ? [ext] : ALLOWED_EXTS) {
      const candidate = path.join(dir, `${baseName}${e}`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        resolvedPath = candidate;
        break;
      }
    }

    if (!resolvedPath) {
      throw new NotFoundException(
        `Script topilmadi: ${baseName} (${dir})`,
      );
    }

    // Path traversal himoyasi
    if (!path.resolve(resolvedPath).startsWith(path.resolve(dir) + path.sep)) {
      throw new BadRequestException('Path traversal aniqlandi');
    }

    return this.spawnNode(resolvedPath, env);
  }

  private spawnNode(
    scriptPath: string,
    extraEnv?: Record<string, string>,
  ): Promise<RunResult> {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const child = spawn(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          ...(extraEnv ?? {}),
        },
        cwd: path.dirname(path.dirname(scriptPath)),
      });

      let stdout = '';
      let stderr = '';
      let truncated = false;

      const onStdout = (chunk: Buffer) => {
        if (stdout.length + chunk.length > MAX_OUTPUT) {
          stdout += chunk.toString('utf8', 0, MAX_OUTPUT - stdout.length);
          truncated = true;
          child.stdout.removeListener('data', onStdout);
        } else {
          stdout += chunk.toString('utf8');
        }
      };

      const onStderr = (chunk: Buffer) => {
        if (stderr.length + chunk.length > MAX_OUTPUT) {
          stderr += chunk.toString('utf8', 0, MAX_OUTPUT - stderr.length);
          truncated = true;
          child.stderr.removeListener('data', onStderr);
        } else {
          stderr += chunk.toString('utf8');
        }
      };

      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);

      const timeout = setTimeout(() => {
        this.logger.warn(`Script timeout, killing: ${scriptPath}`);
        child.kill('SIGKILL');
      }, TIMEOUT_MS);

      child.on('close', (code, signal) => {
        clearTimeout(timeout);
        resolve({
          script: path.basename(scriptPath),
          exitCode: code,
          signal,
          durationMs: Date.now() - startedAt,
          stdout,
          stderr,
          truncated,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          script: path.basename(scriptPath),
          exitCode: -1,
          signal: null,
          durationMs: Date.now() - startedAt,
          stdout,
          stderr: stderr + `\n[spawn error] ${err.message}`,
          truncated,
        });
      });
    });
  }
}
