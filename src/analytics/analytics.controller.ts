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
import { AnalyticsService } from './analytics.service';
import { AnalyticsSummaryDto } from './dto/analytics-summary.dto';

@ApiTags('Analytics (Admin)')
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
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
    @Req() req: Request & { user: { role: Role } },
  ): Promise<AnalyticsSummaryDto> {
    const safeOrgId = orgId?.trim() || 'all';
    if (safeOrgId === 'all' && req.user.role !== Role.SUPERADMIN) {
      return this.analyticsService.getSummary('all');
    }
    return this.analyticsService.getSummary(safeOrgId);
  }

  @Get('level-funnel')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Level funnel — har daraja uchun boshlagan/tugatgan' })
  @ApiQuery({ name: 'orgId', required: false, example: 'all' })
  async levelFunnel(@Query('orgId') orgId?: string) {
    return this.analyticsService.getLevelFunnel(orgId?.trim() || 'all');
  }

  @Get('questions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Eng ko`p xato qilingan savollar' })
  @ApiQuery({ name: 'orgId', required: false, example: 'all' })
  async questionErrors(@Query('orgId') orgId?: string) {
    return this.analyticsService.getQuestionErrors(orgId?.trim() || 'all');
  }

  @Get('hearts-lost')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
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
    const requestedOrgId = (orgId?.trim() || 'all') as string;
    const effectiveOrgId =
      req.user.role === Role.SUPERADMIN
        ? requestedOrgId
        : req.user.organizationIds?.[0] ?? 'all';
    return this.analyticsService.getHeartsLost(effectiveOrgId, safeRange);
  }
}
