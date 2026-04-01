import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { ModeratorPermissionsService } from './moderator-permissions.service';
import { UpdateModeratorPermissionsDto } from './dto/update-moderator-permissions.dto';

@ApiTags('Moderator Permissions (Admin)')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class ModeratorPermissionsController {
  constructor(private readonly moderatorPermissionsService: ModeratorPermissionsService) {}

  @Get('my-permissions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Joriy admin user permissions (Moderator uchun)' })
  @ApiOkResponse({ description: 'Moderator permissions json' })
  getMyPermissions(
    @Req()
    req: Request & { user: { id: string; role: Role } },
  ) {
    if (req.user.role !== Role.MODERATOR) {
      return { permissions: null };
    }
    return this.moderatorPermissionsService.getOrCreate(req.user.id).then((r) => ({
      permissions: r.permissions,
    }));
  }

  @Get('moderator-permissions/:moderatorId')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Moderator permissions olish (SuperAdmin)' })
  @ApiParam({ name: 'moderatorId' })
  @ApiOkResponse({ description: 'Moderator permission record' })
  getModeratorPermissions(@Param('moderatorId', ParseUUIDPipe) moderatorId: string) {
    return this.moderatorPermissionsService.getOrCreate(moderatorId);
  }

  @Put('moderator-permissions/:moderatorId')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Moderator permissions yangilash (SuperAdmin)' })
  @ApiParam({ name: 'moderatorId' })
  @ApiOkResponse({ description: 'Yangilangan permission record' })
  updateModeratorPermissions(
    @Param('moderatorId', ParseUUIDPipe) moderatorId: string,
    @Body() body: UpdateModeratorPermissionsDto,
  ) {
    return this.moderatorPermissionsService.setPermissions(moderatorId, body.permissions as any);
  }

  @Get('moderator-violations')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Moderator qoidabuzarliklari ro`yxati (SuperAdmin)' })
  @ApiQuery({ name: 'range', required: true, enum: ['today', 'month', 'year'] })
  @ApiQuery({ name: 'moderatorId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listViolations(
    @Query('range') range: 'today' | 'month' | 'year',
    @Query('moderatorId') moderatorId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.moderatorPermissionsService.listViolations({
      range: range || 'today',
      moderatorUserId: moderatorId?.trim() || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}

