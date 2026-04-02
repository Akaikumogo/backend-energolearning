import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('Audit Logs (Admin)')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get('audit-logs')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Admin write audit logs (SuperAdmin)' })
  @ApiQuery({ name: 'range', required: true, enum: ['today', 'month', 'year'] })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'orgId', required: false })
  @ApiQuery({ name: 'statusCode', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ description: 'Paginated audit logs' })
  list(
    @Req() _req: Request,
    @Query('range') range: 'today' | 'month' | 'year',
    @Query('actorId') actorId?: string,
    @Query('orgId') orgId?: string,
    @Query('statusCode') statusCode?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLogsService.list({
      range: range || 'today',
      actorId: actorId?.trim() || undefined,
      orgId: orgId?.trim() || undefined,
      statusCode: statusCode ? parseInt(statusCode, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}

