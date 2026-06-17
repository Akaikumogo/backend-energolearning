import { Controller, Get, Param, ParseUUIDPipe, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException } from '@nestjs/common';
import { ExportService } from './export.service';

@ApiTags('Organizations (Admin)')
@Controller('admin/organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class OrganizationExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get(':id/export-credentials')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Tashkilot xodimlari login-parollar Excel' })
  async exportCredentials(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Res() res: Response,
  ) {
    if (
      req.user.role === Role.MODERATOR &&
      !req.user.organizationIds.includes(id)
    ) {
      throw new NotFoundException('Tashkilot topilmadi');
    }
    const buffer =
      await this.exportService.buildOrganizationCredentialsExcel(id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="filial-${id.slice(0, 8)}-login-parollar.xlsx"`,
    );
    res.send(buffer);
  }
}
