import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Post,
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
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationsService } from '../organizations/organizations.service';
import { SyncNesEmployeesDto } from './dto/sync-nes-employees.dto';
import { NesEmployeesService } from './nes-employees.service';

type AuthedRequest = Request & {
  user: { role: Role; organizationIds: string[] };
};

@ApiTags('Energo ID Employees')
@Controller('admin/nes-employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class NesEmployeesController {
  constructor(
    private readonly nesEmployeesService: NesEmployeesService,
    private readonly orgService: OrganizationsService,
  ) {}

  private async allowedOrgIds(req: AuthedRequest): Promise<string[] | null> {
    return this.orgService.getAllowedOrgIds(
      req.user.role,
      req.user.organizationIds,
    );
  }

  private async assertCanSync(req: AuthedRequest) {
    if (req.user.role === Role.SUPERADMIN) return;
    const isDefault = await this.orgService.isDefaultModerator(
      req.user.organizationIds ?? [],
    );
    if (!isDefault) {
      throw new ForbiddenException(
        'Energo ID sync faqat asosiy filial / SUPERADMIN uchun',
      );
    }
  }

  @Get('energo-id-health')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Energo ID ulanish holati' })
  energoIdHealth() {
    return this.nesEmployeesService.checkEnergoIdHealth();
  }

  @Get('filter-options')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Filtr uchun noyob tashkilot va bo`limlar ro`yxati',
  })
  async filterOptions(@Req() req: AuthedRequest) {
    const allowedOrgIds = await this.allowedOrgIds(req);
    return this.nesEmployeesService.getFilterOptions(allowedOrgIds);
  }

  @Get('departments')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Energo ID bo`limlar katalogi' })
  @ApiQuery({ name: 'search', required: false })
  departments(@Query('search') search?: string) {
    return this.nesEmployeesService.listDepartmentsCatalog({ search });
  }

  @Get('sync-status')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Hozirgi sync holati va progressi' })
  syncStatus() {
    return this.nesEmployeesService.getSyncStatus();
  }

  @Get('sync-health')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Ishlayotgan va oxirgi sync holati (polling uchun)' })
  syncHealth() {
    return this.nesEmployeesService.getSyncHealth();
  }

  @Get('terminated')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Bo`shagan xodimlar arxivi' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async terminated(
    @Req() req: AuthedRequest,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const allowedOrgIds = await this.allowedOrgIds(req);
    return this.nesEmployeesService.listTerminatedEmployees({
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      allowedOrgIds,
    });
  }

  @Get('archive-summary')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Arxiv hub kartochkalari uchun sonlar' })
  async archiveSummary(@Req() req: AuthedRequest) {
    const allowedOrgIds = await this.allowedOrgIds(req);
    return this.nesEmployeesService.getArchiveSummary(allowedOrgIds);
  }

  @Delete()
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    summary:
      '[Deprecated] Barcha NES xodimlarini o`chirish — cutover scriptidan foydalaning',
  })
  deleteAll() {
    return this.nesEmployeesService.deleteAll();
  }

  @Get()
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Energo ID dan sinxronlangan xodimlar ro`yxati' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'organizationName', required: false })
  @ApiQuery({ name: 'division', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Req() req: AuthedRequest,
    @Query('search') search?: string,
    @Query('organizationName') organizationName?: string,
    @Query('division') division?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const allowedOrgIds = await this.allowedOrgIds(req);
    return this.nesEmployeesService.listEmployees({
      search,
      organizationName,
      division,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      allowedOrgIds,
    });
  }

  @Post('sync')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Energo ID dan xodimlarni qo`lda sinxron qilish' })
  @ApiBody({ type: SyncNesEmployeesDto })
  async sync(@Req() req: AuthedRequest, @Body() _body: SyncNesEmployeesDto) {
    await this.assertCanSync(req);
    return this.nesEmployeesService.syncFromNes();
  }

  @Get('export-credentials')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    deprecated: true,
    summary: 'O`chirilgan — Energo ID OAuth ishlating',
  })
  exportCredentials() {
    throw new ForbiddenException(
      'Login/parol export o`chirilgan. Xodimlar Energo ID orqali kiradi.',
    );
  }
}
