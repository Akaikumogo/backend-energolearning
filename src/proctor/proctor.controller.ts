import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateRoomDto,
  EnterRoomDto,
  EventsDto,
  HeartbeatDto,
  InterruptDto,
  RecordingChunkDto,
  SaveAnswerDto,
  SightingsDto,
  UpdatePolicyDto,
  UpsertQuestionDto,
  UpsertStandardDto,
} from './proctor.dto';
import { Actor, ProctorService } from './proctor.service';

type Authed = { user: Actor };

@ApiTags('Proctor admin')
@Controller('admin/proctor')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class ProctorAdminController {
  constructor(private readonly proctor: ProctorService) {}

  @Get('dashboard')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  dashboard(@Req() req: Authed, @Query('orgId') orgId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.proctor.dashboard(req.user, orgId, from, to);
  }

  @Get('questions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  questions(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    return this.proctor.listQuestions(Number(page || 1), Number(limit || 20), search);
  }

  @Post('questions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  createQuestion(@Req() req: Authed, @Body() dto: UpsertQuestionDto) {
    return this.proctor.saveQuestion(dto, req.user);
  }

  @Put('questions/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  updateQuestion(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertQuestionDto) {
    return this.proctor.saveQuestion(dto, req.user, id);
  }

  @Delete('questions/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  deleteQuestion(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string) {
    return this.proctor.deleteQuestion(id, req.user);
  }

  @Get('standards')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  standards() {
    return this.proctor.listStandards();
  }

  @Post('standards')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  createStandard(@Req() req: Authed, @Body() dto: UpsertStandardDto) {
    return this.proctor.saveStandard(dto, req.user);
  }

  @Put('standards/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  updateStandard(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertStandardDto) {
    return this.proctor.saveStandard(dto, req.user, id);
  }

  @Get('policies')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  policies() {
    return this.proctor.listPolicies();
  }

  @Put('policies/:code')
  @Roles(Role.SUPERADMIN)
  updatePolicy(@Req() req: Authed, @Param('code') code: string, @Body() dto: UpdatePolicyDto) {
    return this.proctor.updatePolicy(code, dto, req.user);
  }

  @Get('rooms')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  rooms(@Req() req: Authed, @Query('page') page?: string, @Query('status') status?: string) {
    return this.proctor.listRooms(req.user, Number(page || 1), 20, status);
  }

  @Post('rooms')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  createRoom(@Req() req: Authed, @Body() dto: CreateRoomDto) {
    return this.proctor.createRoom(dto, req.user);
  }

  @Post('rooms/:id/notify')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  notify(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string) {
    return this.proctor.retryNotify(id, req.user);
  }

  @Post('rooms/:id/cancel')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  cancel(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string) {
    return this.proctor.cancel(id, req.user);
  }

  @Post('rooms/:id/restart')
  @Roles(Role.SUPERADMIN)
  restart(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string) {
    return this.proctor.restart(id, req.user);
  }

  @Get('live')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  live(@Req() req: Authed) {
    return this.proctor.liveRooms(req.user);
  }

  @Get('rooms/:id/monitor')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  monitor(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string) {
    return this.proctor.monitor(id, req.user);
  }

  @Get('violations')
  @Roles(Role.SUPERADMIN)
  violations(@Req() req: Authed, @Query('page') page?: string) {
    return this.proctor.listViolations(req.user, Number(page || 1));
  }

  @Get('results')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  results(@Req() req: Authed, @Query('userId', ParseUUIDPipe) userId: string) {
    return this.proctor.resultsForUser(userId, req.user, true);
  }
}

@ApiTags('Proctor session')
@Controller('proctor')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class ProctorSessionController {
  constructor(private readonly proctor: ProctorService) {}

  @Get('my/rooms')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  myRooms(@Req() req: Authed) {
    return this.proctor.myRooms(req.user);
  }

  @Get('my/results')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  myResults(@Req() req: Authed) {
    return this.proctor.resultsForUser(req.user.id, req.user, false);
  }

  @Get('ice')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  ice() {
    return { iceServers: this.proctor.iceServers() };
  }

  @Post('enter')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  enter(@Req() req: Authed, @Body() dto: EnterRoomDto) {
    return this.proctor.enter(dto.token, req.user);
  }

  @Post('rooms/:id/start')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  start(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string) {
    return this.proctor.startOrResume(id, req.user);
  }

  @Post('attempts/:id/answers')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  answer(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveAnswerDto) {
    return this.proctor.saveAnswer(id, dto, req.user);
  }

  @Post('attempts/:id/heartbeat')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  heartbeat(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HeartbeatDto) {
    return this.proctor.heartbeat(id, dto, req.user);
  }

  @Post('attempts/:id/interrupt')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  interrupt(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InterruptDto) {
    return this.proctor.interrupt(id, dto, req.user);
  }

  @Post('attempts/:id/events')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  events(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EventsDto) {
    return this.proctor.addEvents(id, dto, req.user);
  }

  @Post('attempts/:id/sightings')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  sightings(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SightingsDto) {
    return this.proctor.reportSightings(id, dto, req.user);
  }

  @Post('attempts/:id/submit')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  submit(@Req() req: Authed, @Param('id', ParseUUIDPipe) id: string) {
    return this.proctor.submit(id, req.user);
  }

  @Post('attempts/:id/recordings')
  @Roles(Role.USER, Role.MODERATOR, Role.SUPERADMIN, Role.APPROVER, Role.ACCOUNTING)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  recording(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordingChunkDto,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    return this.proctor.saveRecording(id, dto, file?.buffer ?? Buffer.alloc(0), req.user);
  }
}
