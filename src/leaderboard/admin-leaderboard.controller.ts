import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { UsersService } from '../users/users.service';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('Leaderboard (Admin)')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/leaderboard')
export class AdminLeaderboardController {
  constructor(
    private readonly leaderboardService: LeaderboardService,
    private readonly usersService: UsersService,
  ) {}

  @Get('global')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Global reyting (Admin) — top + men nechinchiman' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiOkResponse({ description: 'Leaderboard response' })
  async global(
    @Req() req: Request & { user: { id: string } },
    @Query('limit') limit?: string,
  ) {
    return this.leaderboardService.getGlobalLeaderboard(
      req.user.id,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('organization')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Organization reytingi (Admin). SUPERADMIN orgId tanlaydi, MODERATOR o`z orgi bilan cheklanadi.',
  })
  @ApiQuery({ name: 'orgId', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  async organization(
    @Req()
    req: Request & { user: { id: string; role: Role; organizationIds?: string[] } },
    @Query('orgId') orgId?: string,
    @Query('limit') limit?: string,
  ) {
    const effectiveOrgId =
      req.user.role === Role.SUPERADMIN
        ? (orgId?.trim() || null)
        : req.user.organizationIds?.[0] ?? null;

    if (!effectiveOrgId) {
      return { scope: 'organization', orgId: null, me: null, top: [] };
    }

    // Ensure me exists (for consistent "me" row)
    await this.usersService.findById(req.user.id);

    return this.leaderboardService.getOrganizationLeaderboard(
      req.user.id,
      effectiveOrgId,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}

