import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  SetDivisionReportActiveDto,
  SetReportActiveDto,
} from './dto/set-report-active.dto';
import { ReportingActivationService } from './reporting-activation.service';

@ApiTags('Reporting activation')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN, Role.MODERATOR)
@Controller('admin/reporting-activation')
export class ReportingActivationController {
  constructor(
    private readonly activationService: ReportingActivationService,
    private readonly orgService: OrganizationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Filial / bo‘lim report_active holatlari (ierarxiya UI)',
  })
  @ApiQuery({ name: 'orgId', required: false })
  async snapshot(
    @Req()
    req: Request & {
      user: { id: string; role: Role; organizationIds: string[] };
    },
    @Query('orgId') orgId?: string,
  ) {
    const allowed = await this.orgService.getAllowedOrgIds(
      req.user.role,
      req.user.organizationIds,
    );
    let orgIds: string[] | null = allowed;
    if (orgId && orgId !== 'all') {
      await this.orgService.assertModeratorOrgAccess(
        req.user.role,
        req.user.organizationIds,
        orgId,
      );
      orgIds = [orgId];
    }
    return this.activationService.getSnapshot(orgIds);
  }

  @Patch('organizations/:orgId')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Filial switch — OFF = hisobotdan chiqarish (DELETE emas)',
  })
  @ApiBody({ type: SetReportActiveDto })
  setOrganization(
    @Req() req: Request & { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: SetReportActiveDto,
  ) {
    return this.activationService.setOrganizationActive(
      orgId,
      dto.isActive,
      req.user.id,
    );
  }

  @Patch('divisions')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Bo‘lim switch — OFF = filial KPI dan chiqarish',
  })
  @ApiBody({ type: SetDivisionReportActiveDto })
  async setDivision(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: SetDivisionReportActiveDto,
  ) {
    return this.activationService.setDivisionActive(
      dto.organizationId,
      dto.division ?? '',
      dto.isActive,
      req.user.id,
    );
  }

  @Patch('employees/:userId')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Xodim switch — OFF = reportingdan chiqarish',
  })
  @ApiBody({ type: SetReportActiveDto })
  setEmployee(
    @Req() req: Request & { user: { id: string } },
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetReportActiveDto,
  ) {
    return this.activationService.setEmployeeActive(
      userId,
      dto.isActive,
      req.user.id,
    );
  }
}
