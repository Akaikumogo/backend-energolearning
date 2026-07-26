import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { User } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/user-session.entity';

@ApiTags('Blocked email logins (Admin)')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
@Controller('admin/blocked-email-logins')
export class BlockedEmailLoginsController {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepo: Repository<UserSession>,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Loginida @ bor (SUPERADMIN emas) akkauntlar — bloklanganlar + oxirgi kirish',
  })
  @ApiOkResponse({ description: 'Ro‘yxat' })
  async list() {
    const users = await this.userRepo
      .createQueryBuilder('u')
      .where(`u.role <> :sa`, { sa: Role.SUPERADMIN })
      .andWhere(`u.email LIKE '%@%'`)
      .orderBy('u.created_at', 'DESC')
      .getMany();

    if (users.length === 0) {
      return { total: 0, blocked: 0, withLoginHistory: 0, users: [] };
    }

    const ids = users.map((u) => u.id);
    const sessionRows = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.user_id', 'userId')
      .addSelect('MAX(s.login_at)', 'lastLoginAt')
      .addSelect('MAX(s.last_seen_at)', 'lastSeenAt')
      .addSelect('COUNT(*)::int', 'sessionCount')
      .where('s.user_id IN (:...ids)', { ids })
      .groupBy('s.user_id')
      .getRawMany<{
        userId: string;
        lastLoginAt: Date | string | null;
        lastSeenAt: Date | string | null;
        sessionCount: number;
      }>();

    const sessionMap = new Map(
      sessionRows.map((r) => [
        r.userId,
        {
          lastLoginAt: r.lastLoginAt
            ? new Date(r.lastLoginAt).toISOString()
            : null,
          lastSeenAt: r.lastSeenAt
            ? new Date(r.lastSeenAt).toISOString()
            : null,
          sessionCount: Number(r.sessionCount) || 0,
        },
      ]),
    );

    const rows = users.map((u) => {
      const s = sessionMap.get(u.id);
      return {
        userId: u.id,
        login: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        energoId: u.energoId,
        hasEnergoId: Boolean(u.energoId),
        loginBlocked: u.loginBlocked,
        hadPassword: false, // password cleared on block
        createdAt: u.createdAt?.toISOString?.() ?? String(u.createdAt),
        lastLoginAt: s?.lastLoginAt ?? null,
        lastSeenAt: s?.lastSeenAt ?? null,
        sessionCount: s?.sessionCount ?? 0,
        everLoggedIn: (s?.sessionCount ?? 0) > 0,
      };
    });

    return {
      total: rows.length,
      blocked: rows.filter((r) => r.loginBlocked).length,
      withLoginHistory: rows.filter((r) => r.everLoggedIn).length,
      neverLoggedIn: rows.filter((r) => !r.everLoggedIn).length,
      users: rows,
    };
  }
}
