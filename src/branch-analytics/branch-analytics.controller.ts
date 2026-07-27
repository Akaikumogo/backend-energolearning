import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationsService } from '../organizations/organizations.service';
import { BranchAnalyticsService } from './branch-analytics.service';
import { ExportService } from './export.service';

@ApiTags('Branch Analytics (Admin)')
@Controller('admin/branch-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class BranchAnalyticsController {
  constructor(
    private readonly analyticsService: BranchAnalyticsService,
    private readonly exportService: ExportService,
    private readonly orgService: OrganizationsService,
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

  @Get('employee-attempts')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Xodim javoblari auditi: qaysi savolga qaysi variantni belgilagani (sana oralig`i bilan)',
  })
  @ApiQuery({ name: 'orgId', required: true })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async employeeAttempts(
    @Query('orgId') orgId: string,
    @Query('userId') userId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const safeOrgId = await this.analyticsService.resolveOrgScope(
      orgId,
      req.user,
    );
    return this.analyticsService.getEmployeeAttempts(
      safeOrgId,
      userId,
      from,
      to,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('monthly-progress')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Oylik progress: bajarilgan kunlar / oy kunlari (har xodim)',
  })
  @ApiQuery({ name: 'orgId', required: true })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM' })
  async monthlyProgress(
    @Query('orgId') orgId: string,
    @Query('month') month: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const safeOrgId = await this.analyticsService.resolveOrgScope(
      orgId,
      req.user,
    );
    return this.analyticsService.getMonthlyProgress(safeOrgId, month);
  }

  @Get('monthly-plan-matrix')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Oylik reja jadvali: xodim × kun (X/10). orgId ixtiyoriy — bo‘lmasa barcha filial',
  })
  @ApiQuery({ name: 'orgId', required: false })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM' })
  async monthlyPlanMatrix(
    @Query('orgId') orgId: string | undefined,
    @Query('month') month: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const allowedOrgIds = await this.moderatorOrgIds(req);
    if (orgId?.trim() && orgId !== 'all') {
      await this.analyticsService.resolveOrgScope(orgId, req.user);
    }
    return this.analyticsService.getMonthlyPlanMatrix(
      orgId,
      month,
      allowedOrgIds,
    );
  }

  @Get('branch-comparison')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Filiallar oylik reytingi (o`rtacha progress %)' })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM' })
  async branchComparison(
    @Query('month') month: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    let allowedOrgIds: string[] | null = null;
    if (req.user.role === Role.MODERATOR) {
      allowedOrgIds =
        (await this.orgService.resolveModeratorScope(
          req.user.organizationIds,
        )) ?? req.user.organizationIds;
    }
    return this.analyticsService.getBranchComparison(month, allowedOrgIds);
  }

  private async moderatorOrgIds(
    req: Request & { user: { role: Role; organizationIds: string[] } },
  ): Promise<string[] | null> {
    if (req.user.role !== Role.MODERATOR) return null;
    const scope = await this.orgService.resolveModeratorScope(
      req.user.organizationIds,
    );
    // undefined = asosiy filial moderator → barcha filiallar
    if (scope === undefined) return null;
    return scope;
  }

  @Get('executive-dashboard')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Rahbar bosh dashboard — kunlik reja KPI' })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD' })
  async executiveDashboard(
    @Query('date') date: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const allowedOrgIds = await this.moderatorOrgIds(req);
    return this.analyticsService.getExecutiveDashboard(date, allowedOrgIds);
  }

  @Get('branch-ranking')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Kunlik filiallar reytingi' })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD' })
  async branchRanking(
    @Query('date') date: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const allowedOrgIds = await this.moderatorOrgIds(req);
    return this.analyticsService.getBranchRanking(date, allowedOrgIds);
  }

  @Get('division-summary')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Filial ichidagi bo`limlar bo`yicha kunlik reja' })
  @ApiQuery({ name: 'orgId', required: true })
  @ApiQuery({ name: 'date', required: false })
  async divisionSummary(
    @Query('orgId') orgId: string,
    @Query('date') date: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const safeOrgId = await this.analyticsService.resolveOrgScope(orgId, req.user);
    return this.analyticsService.getDivisionSummary(safeOrgId, date);
  }

  @Get('employee-ranking')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Xodimlar reytingi (filial yoki bo`lim)' })
  @ApiQuery({ name: 'orgId', required: true })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'division', required: false })
  async employeeRanking(
    @Query('orgId') orgId: string,
    @Query('date') date: string | undefined,
    @Query('division') division: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const safeOrgId = await this.analyticsService.resolveOrgScope(orgId, req.user);
    return this.analyticsService.getEmployeeRanking(safeOrgId, date, division);
  }

  @Get('hourly-progress')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Kun davomida bajarilish (soat bo`yicha)' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'orgId', required: false })
  async hourlyProgress(
    @Query('date') date: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    let safeOrgId: string | undefined;
    if (orgId) {
      safeOrgId = await this.analyticsService.resolveOptionalOrgScope(
        orgId,
        req.user,
      );
    }
    return this.analyticsService.getHourlyProgress(date, safeOrgId);
  }

  @Get('daily-trend')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Kunlik trend (oxirgi 30 kun)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'orgId', required: false })
  async dailyTrend(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const safeOrgId = await this.analyticsService.resolveOptionalOrgScope(
      orgId,
      req.user,
    );
    const allowedOrgIds = await this.moderatorOrgIds(req);
    return this.analyticsService.getDailyTrend(from, to, safeOrgId, allowedOrgIds);
  }

  @Get('weekday-heatmap')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Filiallar × hafta kuni heatmap' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'orgId', required: false })
  async weekdayHeatmap(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const allowedOrgIds = await this.moderatorOrgIds(req);
    const safeOrgId = await this.analyticsService.resolveOptionalOrgScope(
      orgId,
      req.user,
    );
    return this.analyticsService.getBranchWeekdayHeatmap(from, to, allowedOrgIds, safeOrgId);
  }

  @Get('underperformers')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Rejani bajarmayotganlar (filial/bo`lim/xodim)' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'threshold', required: false })
  async underperformers(
    @Query('date') date: string | undefined,
    @Query('threshold') threshold: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const allowedOrgIds = await this.moderatorOrgIds(req);
    const t = threshold ? parseInt(threshold, 10) : 70;
    return this.analyticsService.getUnderperformers(date, t, allowedOrgIds);
  }

  @Get('daily-report')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Kunlik hisobot (dashboard + filiallar + xodimlar)' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'orgId', required: false, description: 'Bitta filial UUID (ixtiyoriy)' })
  async dailyReport(
    @Query('date') date: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const allowedOrgIds = await this.moderatorOrgIds(req);
    return this.analyticsService.getDailyReport(date, allowedOrgIds, orgId);
  }

  @Get('monthly-report')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Oylik hisobot (filiallar + trend + xodimlar)' })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM' })
  @ApiQuery({ name: 'orgId', required: false, description: 'Bitta filial UUID (ixtiyoriy)' })
  async monthlyReport(
    @Query('month') month: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    const allowedOrgIds = await this.moderatorOrgIds(req);
    return this.analyticsService.getMonthlyReport(month, allowedOrgIds, orgId);
  }

  @Get('export/daily-report')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Kunlik hisobot Excel — Xulosa + har filial alohida sheet (rangli)',
  })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'orgId', required: false, description: 'Bitta filial UUID (ixtiyoriy)' })
  async exportDailyReport(
    @Query('date') date: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Res() res: Response,
  ) {
    const allowedOrgIds = await this.moderatorOrgIds(req);
    const data = await this.analyticsService.getDailyReport(
      date,
      allowedOrgIds,
      orgId,
    );
    const buffer = await this.exportService.buildDailyReportExcel(data);
    const scope =
      orgId && data.branches[0]
        ? data.branches[0].orgName.replace(/[^\p{L}\p{N}_-]+/gu, '_')
        : 'barcha';
    const filename = `kunlik_${data.planDate}_${scope}.xlsx`;
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    res.send(buffer);
  }

  @Get('export/monthly-report')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Oylik hisobot Excel — Xulosa + trend + har filial alohida sheet (rangli)',
  })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM' })
  @ApiQuery({ name: 'orgId', required: false, description: 'Bitta filial UUID (ixtiyoriy)' })
  async exportMonthlyReport(
    @Query('month') month: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Res() res: Response,
  ) {
    const allowedOrgIds = await this.moderatorOrgIds(req);
    const data = await this.analyticsService.getMonthlyReport(
      month,
      allowedOrgIds,
      orgId,
    );
    const buffer = await this.exportService.buildMonthlyReportExcel(data);
    const scope =
      orgId && data.branches[0]
        ? data.branches[0].orgName.replace(/[^\p{L}\p{N}_-]+/gu, '_')
        : 'barcha';
    const filename = `oylik_${data.month}_${scope}.xlsx`;
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    res.send(buffer);
  }

  @Get('export/monthly-progress')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Oylik progress Excel (masalan 2026-07_Toshkent.xlsx)' })
  @ApiQuery({ name: 'orgId', required: true })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM' })
  async exportMonthlyProgress(
    @Query('orgId') orgId: string,
    @Query('month') month: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Res() res: Response,
  ) {
    const safeOrgId = await this.analyticsService.resolveOrgScope(
      orgId,
      req.user,
    );
    const data = await this.analyticsService.getMonthlyProgress(
      safeOrgId,
      month,
    );
    const buffer = await this.exportService.buildMonthlyProgressExcel(data);

    const safeName = data.orgName.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    const filename = `${data.month}_${safeName}.xlsx`;
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="progress.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    res.send(buffer);
  }

  @Get('export/monthly-plan-matrix')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Filial oylik reja jadvali Excel (kunlar × xodimlar)',
  })
  @ApiQuery({ name: 'orgId', required: true })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM' })
  async exportMonthlyPlanMatrix(
    @Query('orgId') orgId: string,
    @Query('month') month: string | undefined,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Res() res: Response,
  ) {
    const safeOrgId = await this.analyticsService.resolveOrgScope(
      orgId,
      req.user,
    );
    const data = await this.analyticsService.getMonthlyPlanMatrix(
      safeOrgId,
      month,
      null,
    );
    const buffer = await this.exportService.buildMonthlyPlanMatrixExcel(data);

    const safeName = data.orgName.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    const filename = `${data.month}_${safeName}_oylik_reja.xlsx`;
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="plan-matrix.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    res.send(buffer);
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
