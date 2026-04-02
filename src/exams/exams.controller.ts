import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreatePositionDto } from './dto/create-position.dto';
import { CreateExamDto } from './dto/create-exam.dto';
import { CreateExamQuestionDto } from './dto/create-exam-question.dto';
import { ScheduleExamAssignmentDto } from './dto/schedule-exam-assignment.dto';
import { ExamsService } from './exams.service';

@ApiTags('Exams (Admin)')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  // ─── Positions ────────────────────────────────────────────────────────────
  @Get('positions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Lavozimlar ro`yxati (default-org mod yoki SuperAdmin)' })
  listPositions(@Req() req: Request & { user: { role: Role; organizationIds: string[] } }) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.listPositions());
  }

  @Post('positions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Lavozim yaratish (default-org mod yoki SuperAdmin)' })
  @ApiBody({ type: CreatePositionDto })
  createPosition(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Body() body: CreatePositionDto,
  ) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.createPosition(body));
  }

  @Put('positions/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Lavozim yangilash (default-org mod yoki SuperAdmin)' })
  updatePosition(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Partial<CreatePositionDto>,
  ) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.updatePosition(id, body));
  }

  @Delete('positions/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Lavozim o`chirish (default-org mod yoki SuperAdmin)' })
  deletePosition(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.deletePosition(id));
  }

  // ─── Exams ───────────────────────────────────────────────────────────────
  @Get('exams')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Imtihonlar ro`yxati (default-org mod yoki SuperAdmin)' })
  listExams(@Req() req: Request & { user: { role: Role; organizationIds: string[] } }) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.listExams());
  }

  @Post('exams')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Imtihon yaratish (default-org mod yoki SuperAdmin)' })
  @ApiBody({ type: CreateExamDto })
  createExam(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Body() body: CreateExamDto,
  ) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.createExam(body));
  }

  @Put('exams/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Imtihon yangilash (default-org mod yoki SuperAdmin)' })
  updateExam(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Partial<CreateExamDto>,
  ) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.updateExam(id, body as any));
  }

  @Delete('exams/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Imtihon o`chirish (default-org mod yoki SuperAdmin)' })
  deleteExam(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.deleteExam(id));
  }

  // ─── Exam questions ───────────────────────────────────────────────────────
  @Get('exam-questions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Imtihon savollari (default-org mod yoki SuperAdmin)' })
  listExamQuestions(@Req() req: Request & { user: { role: Role; organizationIds: string[] } }) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.listExamQuestions());
  }

  @Post('exam-questions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Imtihon savoli yaratish (default-org mod yoki SuperAdmin)' })
  @ApiBody({ type: CreateExamQuestionDto })
  createExamQuestion(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Body() body: CreateExamQuestionDto,
  ) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.createExamQuestion(body as any));
  }

  @Delete('exam-questions/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Imtihon savolini o`chirish (default-org mod yoki SuperAdmin)' })
  deleteExamQuestion(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.deleteExamQuestion(id));
  }

  // ─── Upcoming + schedule ──────────────────────────────────────────────────
  @Get('exams/upcoming')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Kelayotgan imtihonlar (org scoped)' })
  @ApiQuery({ name: 'orgId', required: false })
  listUpcoming(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Query('orgId') orgId?: string,
  ) {
    return this.examsService.listUpcomingAssignments(req.user, orgId?.trim() || undefined);
  }

  @Post('exam-assignments/:id/schedule')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Imtihon sanasini belgilash (±3 kun oynasi ichida)' })
  @ApiBody({ type: ScheduleExamAssignmentDto })
  @ApiOkResponse({ description: 'Updated assignment' })
  schedule(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScheduleExamAssignmentDto,
  ) {
    return this.examsService.scheduleAssignment(req.user, id, body.scheduledAt);
  }

  // ─── Basket (default-org mod yoki SuperAdmin) ─────────────────────────────
  @Get('basket')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Korzinka (imtihon moduli: positions/exams/exam-questions)' })
  listBasket(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
  ) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.listBasket());
  }

  @Post('basket/:type/:id/restore')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiParam({ name: 'type', enum: ['positions', 'exams', 'exam-questions'] })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Korzinkadan tiklash' })
  restoreBasket(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('type') type: 'positions' | 'exams' | 'exam-questions',
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.restoreBasketItem(type, id));
  }

  @Delete('basket/:type/:id/purge')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiParam({ name: 'type', enum: ['positions', 'exams', 'exam-questions'] })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Korzinkadan butunlay o`chirish (purge)' })
  purgeBasket(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('type') type: 'positions' | 'exams' | 'exam-questions',
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.examsService.ensureDefaultOrgModerator(req.user).then(() => this.examsService.purgeBasketItem(type, id));
  }
}

