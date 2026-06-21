import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity';
import { Role } from '../common/enums/role.enum';
import { ModeratorPermissionsService } from '../moderator-permissions/moderator-permissions.service';
import {
  MODERATORS_EXPORT_VERSION,
  type ModeratorExportRow,
  type ModeratorsExportBundle,
} from './types/moderators-export.types';

export type ModeratorsImportResult = {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

@Injectable()
export class ModeratorsImportExportService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly permissionsService: ModeratorPermissionsService,
  ) {}

  async exportBundle(): Promise<ModeratorsExportBundle> {
    const moderators = await this.userRepo.find({
      where: { role: Role.MODERATOR },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });

    const rows: ModeratorExportRow[] = [];
    for (const m of moderators) {
      const perm = await this.permissionsService.getOrCreate(m.id);
      rows.push({
        email: m.email,
        firstName: m.firstName,
        lastName: m.lastName,
        initialPassword: m.initialPassword ?? null,
        mustChangePassword: m.mustChangePassword,
        permissions: perm.permissions,
      });
    }

    return {
      version: MODERATORS_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      moderators: rows,
    };
  }

  parseBundle(raw: string): ModeratorsExportBundle {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('JSON fayl o‘qib bo‘lmadi');
    }

    const bundle = parsed as Partial<ModeratorsExportBundle>;
    if (bundle.version !== MODERATORS_EXPORT_VERSION) {
      throw new BadRequestException(
        `Noto‘g‘ri versiya (kutilgan: ${MODERATORS_EXPORT_VERSION})`,
      );
    }
    if (!Array.isArray(bundle.moderators)) {
      throw new BadRequestException('moderators massivi topilmadi');
    }

    return bundle as ModeratorsExportBundle;
  }

  async importBundle(bundle: ModeratorsExportBundle): Promise<ModeratorsImportResult> {
    const result: ModeratorsImportResult = {
      success: true,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    for (const row of bundle.moderators) {
      const email = row.email?.trim().toLowerCase();
      if (!email) {
        result.errors.push('Bo‘sh email qator o‘tkazib yuborildi');
        result.skipped++;
        continue;
      }

      try {
        const existing = await this.userRepo.findOne({ where: { email } });

        if (existing?.role === Role.SUPERADMIN) {
          result.skipped++;
          continue;
        }

        if (existing && existing.role !== Role.MODERATOR) {
          result.errors.push(`${email}: USER roli — o‘tkazib yuborildi`);
          result.skipped++;
          continue;
        }

        if (existing) {
          existing.firstName = row.firstName ?? existing.firstName;
          existing.lastName = row.lastName ?? existing.lastName;
          existing.mustChangePassword = row.mustChangePassword ?? false;

          if (row.initialPassword?.trim()) {
            const plain = row.initialPassword.trim();
            existing.passwordHash = await bcrypt.hash(plain, 10);
            existing.initialPassword = plain;
          }

          await this.userRepo.save(existing);
          await this.permissionsService.setPermissions(
            existing.id,
            row.permissions,
          );
          result.updated++;
        } else {
          const plainPassword =
            row.initialPassword?.trim() || this.generatePassword();
          const passwordHash = await bcrypt.hash(plainPassword, 10);

          const user = await this.userRepo.save(
            this.userRepo.create({
              email,
              firstName: row.firstName ?? '',
              lastName: row.lastName ?? '',
              role: Role.MODERATOR,
              passwordHash,
              initialPassword: plainPassword,
              mustChangePassword:
                row.mustChangePassword ??
                !row.initialPassword?.trim(),
            }),
          );

          await this.permissionsService.setPermissions(
            user.id,
            row.permissions,
          );
          result.created++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${email}: ${msg}`);
        result.skipped++;
      }
    }

    return result;
  }

  private generatePassword(): string {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let out = '';
    for (let i = 0; i < 10; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }
}
