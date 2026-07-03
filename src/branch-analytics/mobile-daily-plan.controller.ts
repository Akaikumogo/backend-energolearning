import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BranchAnalyticsService } from './branch-analytics.service';

@ApiTags('Mobile Daily Plan')
@Controller('mobile/daily-plan')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
export class MobileDailyPlanController {
  constructor(private readonly analyticsService: BranchAnalyticsService) {}

  @Get('today')
  @ApiOperation({ summary: 'Bugungi kunlik plan savollari' })
  async getToday(
    @Req()
    req: Request & {
      user: { id: string; organizationIds?: string[] };
    },
  ) {
    const orgId = req.user.organizationIds?.[0];
    if (!orgId) {
      return {
        planDate: new Date().toISOString().slice(0, 10),
        organizationId: null,
        targetQuestions: 10,
        dailyGoalCorrect: 10,
        questionCount: 0,
        answeredCount: 0,
        correctCount: 0,
        completionPercent: 0,
        completed: false,
        questions: [],
      };
    }
    return this.analyticsService.getMobileDailyPlan(req.user.id, orgId);
  }
}
