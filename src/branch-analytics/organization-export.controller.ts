import { Controller, Get, Param, ParseUUIDPipe, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { ExportService } from './export.service';

@ApiTags('Organizations (Admin)')
@Controller('admin/organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class OrganizationExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get(':id/export-credentials')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Tashkilot xodimlari login-parollar Excel (faqat SuperAdmin)' })
  async exportCredentials(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
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
