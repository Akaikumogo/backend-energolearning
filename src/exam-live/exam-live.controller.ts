import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ExamQuestionSection } from '../common/enums/exam-question-section.enum';
import { OralResult } from '../common/enums/oral-result.enum';
import { ExamLiveService } from './exam-live.service';
import { ExamLiveGateway } from './exam-live.gateway';

@ApiTags('Exam Live')
@Controller('exams/live')
export class ExamLiveController {
  constructor(
    private readonly examLive: ExamLiveService,
    private readonly gateway: ExamLiveGateway,
  ) {}

  @Post('validate-qr')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'QR tokenni tekshirish va kutish sessiyasini ochish (USER)' })
  async validateQr(
    @Req() req: Request & { user: { id: string; role: Role } },
    @Body() body: { qrToken: string },
  ) {
    if (req.user.role !== Role.USER) {
      return { error: 'Faqat xodim (USER) uchun' };
    }
    const { assignment, session, isNew } = await this.examLive.validateQrAndEnsureSession(
      req.user.id,
      body.qrToken,
    );
    if (isNew) {
      this.gateway.emitToOrg(assignment.organizationId, 'exam_pending', {
        sessionId: session.id,
        assignmentId: assignment.id,
        userId: assignment.userId,
      });
    }
    return {
      sessionId: session.id,
      assignmentId: assignment.id,
      status: session.status,
      includesPt: assignment.includesPt,
      includesTb: assignment.includesTb,
      examTitle: assignment.exam?.title ?? null,
    };
  }

  @Get('session/:sessionId/state')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Sessiya holati (xodim)' })
  sessionState(
    @Req() req: Request & { user: { id: string } },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.examLive.getEmployeeExamState(sessionId, req.user.id);
  }

  @Post('session/:sessionId/verify-code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  verifyCode(
    @Req() req: Request & { user: { id: string } },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: { code: string },
  ) {
    return this.examLive.verifyEmployeeCode(sessionId, req.user.id, body.code);
  }

  @Post('session/:sessionId/start-section')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  startSection(
    @Req() req: Request & { user: { id: string } },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: { section: ExamQuestionSection },
  ) {
    return this.examLive.startSection(sessionId, req.user.id, body.section);
  }

  @Post('session/:sessionId/answer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  saveAnswer(
    @Req() req: Request & { user: { id: string } },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: { section: ExamQuestionSection; questionId: string; selectedOptionId: string },
  ) {
    return this.examLive.saveAnswer(
      sessionId,
      req.user.id,
      body.section,
      body.questionId,
      body.selectedOptionId,
    );
  }

  @Post('session/:sessionId/submit-section')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  submitSection(
    @Req() req: Request & { user: { id: string } },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: { section: ExamQuestionSection },
  ) {
    return this.examLive.submitSection(sessionId, req.user.id, body.section);
  }

  @Post('session/:sessionId/tab-switch')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  tabSwitch(
    @Req() req: Request & { user: { id: string } },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.examLive.recordTabSwitch(sessionId, req.user.id);
  }

  @Get('me/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  myHistory(@Req() req: Request & { user: { id: string; role: Role } }) {
    if (req.user.role !== Role.USER) return [];
    return this.examLive.listHistoryForUser(req.user.id);
  }

  @Get('me/next')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  myNext(@Req() req: Request & { user: { id: string; role: Role } }) {
    if (req.user.role !== Role.USER) return { next: null };
    return this.examLive.getNextExamForUser(req.user.id);
  }

  @Get('moderator/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiBearerAuth('bearer')
  moderatorPending(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
  ) {
    return this.examLive.listPendingSessionsForModerator({
      role: req.user.role,
      organizationIds: req.user.organizationIds ?? [],
    });
  }

  @Get('moderator/awaiting-oral')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiBearerAuth('bearer')
  moderatorAwaitingOral(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
  ) {
    return this.examLive.listAwaitingOralForModerator({
      role: req.user.role,
      organizationIds: req.user.organizationIds ?? [],
    });
  }

  @Post('moderator/sessions/:sessionId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiBearerAuth('bearer')
  async moderatorApprove(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    const { plainOtp, expiresAt } = await this.examLive.moderatorApprove(
      sessionId,
      req.user.id,
      { role: req.user.role, organizationIds: req.user.organizationIds ?? [] },
    );
    this.gateway.emitToSession(sessionId, 'code_issued', {
      code: plainOtp,
      expiresAt,
    });
    return { ok: true, expiresAt, code: plainOtp };
  }

  @Post('moderator/sessions/:sessionId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiBearerAuth('bearer')
  async moderatorReject(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: { reason: string },
  ) {
    await this.examLive.moderatorReject(sessionId, req.user.id, body.reason, {
      role: req.user.role,
      organizationIds: req.user.organizationIds ?? [],
    });
    this.gateway.emitToSession(sessionId, 'moderator_rejected', {
      reason: body.reason ?? 'Rad etildi',
    });
    return { ok: true };
  }

  @Post('moderator/attempts/:attemptId/finalize-oral')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiBearerAuth('bearer')
  finalizeOral(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body()
    body: { oralResult: OralResult; oralFeedback: string; nextExamMonths: number },
  ) {
    return this.examLive.finalizeOral(attemptId, req.user.id, body, {
      role: req.user.role,
      organizationIds: req.user.organizationIds ?? [],
    });
  }

  @Post('admin/extra-assignment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiBearerAuth('bearer')
  createExtra(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Body()
    body: {
      userId: string;
      organizationId: string;
      includesPt: boolean;
      includesTb: boolean;
      reason: string;
    },
  ) {
    return this.examLive.createExtraAssignment({
      ...body,
      moderator: { role: req.user.role, organizationIds: req.user.organizationIds ?? [] },
    });
  }

  @Get('superadmin/attempts/:attemptId/detail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  @ApiBearerAuth('bearer')
  superadminDetail(@Param('attemptId', ParseUUIDPipe) attemptId: string) {
    return this.examLive.getSuperadminAttemptDetail(attemptId);
  }

  @Get('superadmin/recent-attempts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  @ApiBearerAuth('bearer')
  async recentAttempts() {
    return this.examLive.listRecentAttemptsForSuperadmin(20);
  }
}
