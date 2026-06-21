import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { UserActivityService } from './user-activity.service';
import { RecordEventDto } from './dto/record-event.dto';
import { ActivityQueryDto, ActivityRange } from './dto/activity-query.dto';

type AuthedRequest = Request & {
  user: { sub: string; role: Role; organizationIds?: string[] };
};

@ApiTags('User Activity')
@Controller('user-activity')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
export class UserActivityController {
  constructor(
    private readonly service: UserActivityService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post('heartbeat')
  @ApiOperation({ summary: 'HTTP fallback heartbeat (WS afzal)' })
  async heartbeat(@Req() req: AuthedRequest) {
    await this.service.heartbeat(req.user.sub);
    return { ok: true };
  }

  @Post('event')
  @ApiOperation({ summary: 'Activity event yozish (theory open, test boshlash...)' })
  async event(@Req() req: AuthedRequest, @Body() dto: RecordEventDto) {
    await this.service.recordEvent({
      userId: req.user.sub,
      eventType: dto.eventType,
      entityType: dto.entityType,
      entityId: dto.entityId,
      metadata: dto.metadata,
    });
    return { ok: true };
  }

  @Get('online')
  @UseGuards(RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Hozir online userlar' })
  async online(@Query() q: ActivityQueryDto, @Req() req: AuthedRequest) {
    const orgId = await this.scopeOrgId(req, q.organizationId);
    return this.service.getOnlineUsers({
      group: q.group,
      organizationId: orgId,
    });
  }

  @Get('users')
  @UseGuards(RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Userlar ro\'yxati + activity (table uchun)',
  })
  async users(@Query() q: ActivityQueryDto, @Req() req: AuthedRequest) {
    const orgId = await this.scopeOrgId(req, q.organizationId);
    return this.service.listUsersWithActivity({
      group: q.group,
      organizationId: orgId,
      range: q.range,
    });
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Stat cards uchun aggregate' })
  async stats(@Query() q: ActivityQueryDto, @Req() req: AuthedRequest) {
    const orgId = await this.scopeOrgId(req, q.organizationId);
    return this.service.getActivityStats({
      group: q.group,
      organizationId: orgId,
      range: q.range,
    });
  }

  @Get('timeline/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiOperation({ summary: 'User activity timeline' })
  async timeline(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.getUserTimeline(userId, 100);
  }

  @Get('sessions/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiOperation({ summary: 'User sessions (login/logout history)' })
  async sessions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('range') range?: ActivityRange,
  ) {
    return this.service.getUserSessions(userId, range);
  }

  @Get('question-stats')
  @UseGuards(RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Qaysi xodim qaysi savolda nechta xato qildi',
  })
  async questionStats(
    @Query() q: ActivityQueryDto,
    @Req() req: AuthedRequest,
  ) {
    const orgId = await this.scopeOrgId(req, q.organizationId);
    return this.service.getQuestionStats({
      userId: q.userId,
      organizationId: orgId,
    });
  }

  @Get('question-stats/:userId/:questionId')
  @UseGuards(RolesGuard)
  @Roles(Role.MODERATOR, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Bitta savol bo\'yicha userning urinishlari' })
  async userQuestionAttempts(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    return this.service.getUserQuestionAttempts(userId, questionId);
  }

  private async scopeOrgId(
    req: AuthedRequest,
    requested?: string,
  ): Promise<string | null> {
    if (req.user.role === Role.SUPERADMIN) {
      return requested && requested !== 'all' ? requested : null;
    }

    const scope = await this.organizationsService.resolveModeratorScope(
      req.user.organizationIds,
    );
    const reqOrg = requested?.trim();

    if (scope === undefined) {
      return reqOrg && reqOrg !== 'all' ? reqOrg : null;
    }
    if (scope.length === 0) return null;
    if (reqOrg && reqOrg !== 'all' && scope.includes(reqOrg)) {
      return reqOrg;
    }
    return scope.length === 1 ? scope[0] : scope[0];
  }
}
