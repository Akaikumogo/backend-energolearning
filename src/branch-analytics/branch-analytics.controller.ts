import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { BranchAnalyticsService } from './branch-analytics.service';

@ApiTags('Branch Analytics (Admin)')
@Controller('admin/branch-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class BranchAnalyticsController {
  constructor(
    private readonly analyticsService: BranchAnalyticsService,
  ) {}

  @Get('summary')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Filial analitika summary' })
  @ApiQuery({ name: 'orgId', required: true })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async summary(
    @Query('orgId') orgId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const safeOrgId = await this.analyticsService.resolveOrgScope(
      orgId,
      req.user,
    );
    return this.analyticsService.getSummary(safeOrgId, from, to);
  }

  @Get('activity-matrix')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Xodimlar kunlik aktivlik matritsasi' })
  @ApiQuery({ name: 'orgId', required: true })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async activityMatrix(
    @Query('orgId') orgId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const safeOrgId = await this.analyticsService.resolveOrgScope(
      orgId,
      req.user,
    );
    return this.analyticsService.getActivityMatrix(safeOrgId, from, to);
  }

  @Get('daily-plan-result')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Kunlik plan va natija' })
  @ApiQuery({ name: 'orgId', required: true })
  @ApiQuery({ name: 'date', required: false })
  async dailyPlanResult(
    @Query('orgId') orgId: string,
    @Query('date') date: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const safeOrgId = await this.analyticsService.resolveOrgScope(
      orgId,
      req.user,
    );
    return this.analyticsService.getDailyPlanResult(safeOrgId, date);
  }

  @Get('export/moderators-credentials')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ deprecated: true, summary: 'O`chirilgan — Energo ID OAuth ishlating' })
  exportModerators() {
    throw new ForbiddenException(
      'Login/parol export o`chirilgan. Moderatorlar Energo ID orqali kiradi.',
    );
  }
}
