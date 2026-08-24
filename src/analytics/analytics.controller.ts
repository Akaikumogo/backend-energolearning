import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationsService } from '../organizations/organizations.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsSummaryDto } from './dto/analytics-summary.dto';
import { HomeOverviewDto } from './dto/home-overview.dto';

@ApiTags('Analytics (Admin)')
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Get('home-overview')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.ACCOUNTING)
  @ApiOperation({ summary: 'Bosh sahifa вЂ” filial activity heatmap va reytinglar' })
  @ApiOkResponse({ type: HomeOverviewDto })
  async homeOverview(
    @Req()
    req: Request & {
      user: { role: Role; organizationIds?: string[] };
    },
  ): Promise<HomeOverviewDto> {
    const allowed = await this.organizationsService.getAllowedOrgIds(
      req.user.role,
      req.user.organizationIds,
    );
    return this.analyticsService.getHomeOverview(allowed);
  }

  @Get('summary')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.ACCOUNTING)
  @ApiOperation({
    summary: 'Analitika summary (KPI)',
    description:
      'Jami user, faol user (7 kun), tashkilot, moderator, daraja, savol. orgId=all faqat SUPERADMIN uchun.',
  })
  @ApiQuery({
    name: 'orgId',
    required: true,
    description: '`all` yoki organization UUID',
    example: 'all',
  })
  @ApiOkResponse({ type: AnalyticsSummaryDto })
  @ApiUnauthorizedResponse({
    description: 'Token yaroqsiz yoki yo`q',
    type: ApiErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Role bo`yicha ruxsat yo`q',
    type: ApiErrorResponseDto,
  })
  async summary(
    @Query('orgId') orgId: string,
    @Req()
    req: Request & {
      user: { role: Role; organizationIds?: string[] };
    },
  ): Promise<AnalyticsSummaryDto> {
    const effectiveOrgId = await this.organizationsService.resolveAnalyticsOrgId(
      req.user.role,
      req.user.organizationIds,
      orgId,
    );
    return this.analyticsService.getSummary(effectiveOrgId);
  }

  @Get('level-funnel')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.ACCOUNTING)
  @ApiOperation({ summary: 'Level funnel вЂ” har daraja uchun boshlagan/tugatgan' })
  @ApiQuery({ name: 'orgId', required: false, example: 'all' })
  async levelFunnel(
    @Query('orgId') orgId: string | undefined,
    @Req()
    req: Request & {
      user: { role: Role; organizationIds?: string[] };
    },
  ) {
    const effectiveOrgId = await this.organizationsService.resolveAnalyticsOrgId(
      req.user.role,
      req.user.organizationIds,
      orgId,
    );
    return this.analyticsService.getLevelFunnel(effectiveOrgId);
  }

  @Get('questions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.ACCOUNTING)
  @ApiOperation({ summary: 'Eng ko`p xato qilingan savollar' })
  @ApiQuery({ name: 'orgId', required: false, example: 'all' })
  async questionErrors(
    @Query('orgId') orgId: string | undefined,
    @Req()
    req: Request & {
      user: { role: Role; organizationIds?: string[] };
    },
  ) {
    const effectiveOrgId = await this.organizationsService.resolveAnalyticsOrgId(
      req.user.role,
      req.user.organizationIds,
      orgId,
    );
    return this.analyticsService.getQuestionErrors(effectiveOrgId);
  }

  @Get('hearts-lost')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.ACCOUNTING, Role.APPROVER)
  @ApiOperation({
    summary: 'Yurak yo`qotish (noto`g`ri javoblar) statistikasi',
    description: 'range=today|month|year, orgId=all faqat SUPERADMIN uchun.',
  })
  @ApiQuery({ name: 'range', required: true, enum: ['today', 'month', 'year'] })
  @ApiQuery({ name: 'orgId', required: false, example: 'all' })
  async heartsLost(
    @Query('range') range: 'today' | 'month' | 'year',
    @Query('orgId') orgId: string | undefined,
    @Req()
    req: Request & {
      user: { role: Role; organizationIds?: string[] };
    },
  ) {
    const safeRange = range || 'today';
    const effectiveOrgId = await this.organizationsService.resolveAnalyticsOrgId(
      req.user.role,
      req.user.organizationIds,
      orgId,
    );
    return this.analyticsService.getHeartsLost(effectiveOrgId, safeRange);
  }
}
