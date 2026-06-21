import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  ONE_TIME_CUTOVER_FLAG_PATH,
  ONE_TIME_CUTOVER_SCRIPT,
} from './one-time-cutover.constants';

export type CutoverRunResult = {
  success: boolean;
  alreadyCompleted: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  completedAt?: string;
  message: string;
};

@Injectable()
export class OneTimeCutoverService {
  private readonly logger = new Logger(OneTimeCutoverService.name);

  isEnabled(): boolean {
    return (process.env.ONE_TIME_CUTOVER_ENABLED ?? '').toLowerCase() === 'true';
  }

  isCompleted(): boolean {
    return fs.existsSync(ONE_TIME_CUTOVER_FLAG_PATH);
  }

  isAvailable(): boolean {
    return this.isEnabled() && !this.isCompleted();
  }

  getStatus() {
    return {
      enabled: this.isEnabled(),
      completed: this.isCompleted(),
      available: this.isAvailable(),
      flagPath: ONE_TIME_CUTOVER_FLAG_PATH,
    };
  }

  async run(token: string): Promise<CutoverRunResult> {
    if (!this.isEnabled()) {
      throw new ForbiddenException('One-time cutover o`chirilgan');
    }

    if (this.isCompleted()) {
      return {
        success: true,
        alreadyCompleted: true,
        exitCode: 0,
        durationMs: 0,
        stdout: '',
        stderr: '',
        message: 'Cutover allaqachon bajarilgan — endpoint yopilgan',
      };
    }

    const expected = process.env.ONE_TIME_CUTOVER_TOKEN?.trim();
    if (!expected) {
      throw new ServiceUnavailableException(
        'ONE_TIME_CUTOVER_TOKEN env o`rnatilmagan',
      );
    }
    if (token?.trim() !== expected) {
      throw new ForbiddenException('Token noto`g`ri');
    }

    const scriptPath = this.resolveScriptPath();
    if (!scriptPath) {
      throw new ServiceUnavailableException(
        `${ONE_TIME_CUTOVER_SCRIPT} topilmadi`,
      );
    }

    this.logger.warn('One-time Energo ID cutover boshlandi (SuperAdmin)');

    const result = await this.spawnCutover(scriptPath);
    if (result.exitCode !== 0) {
      throw new BadRequestException({
        message: 'Cutover script xato bilan tugadi',
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    }

    const completedAt = new Date().toISOString();
    this.writeCompletionFlag({
      completedAt,
      exitCode: result.exitCode,
      script: ONE_TIME_CUTOVER_SCRIPT,
    });

    this.logger.warn(
      `One-time cutover muvaffaqiyatli. Flag: ${ONE_TIME_CUTOVER_FLAG_PATH}`,
    );

    return {
      success: true,
      alreadyCompleted: false,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
      completedAt,
      message:
        'Cutover tugadi. Keyin pm2 restart va ENERGO ID sinxronlash. Swagger dan endpoint yo`qolishi uchun backend ni qayta ishga tushiring.',
    };
  }

  private resolveScriptPath(): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'scripts', ONE_TIME_CUTOVER_SCRIPT),
      path.resolve(__dirname, '../../scripts', ONE_TIME_CUTOVER_SCRIPT),
      path.resolve(__dirname, '../../../scripts', ONE_TIME_CUTOVER_SCRIPT),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
    return null;
  }

  private spawnCutover(scriptPath: string): Promise<{
    exitCode: number | null;
    durationMs: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const child = spawn(
        process.execPath,
        ['-r', 'dotenv/config', scriptPath, '--confirm'],
        {
          env: process.env,
          cwd: process.cwd(),
        },
      );

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
      }, 15 * 60_000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code,
          durationMs: Date.now() - startedAt,
          stdout: stdout.slice(-50_000),
          stderr: stderr.slice(-50_000),
        });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private writeCompletionFlag(payload: Record<string, unknown>) {
    fs.mkdirSync(path.dirname(ONE_TIME_CUTOVER_FLAG_PATH), { recursive: true });
    fs.writeFileSync(
      ONE_TIME_CUTOVER_FLAG_PATH,
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf8',
    );
  }
}
