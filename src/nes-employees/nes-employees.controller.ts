import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { SyncNesEmployeesDto } from './dto/sync-nes-employees.dto';
import { NesEmployeesService } from './nes-employees.service';

@ApiTags('Energo ID Employees')
@Controller('admin/nes-employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class NesEmployeesController {
  constructor(private readonly nesEmployeesService: NesEmployeesService) {}

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
  filterOptions() {
    return this.nesEmployeesService.getFilterOptions();
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
  terminated(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.nesEmployeesService.listTerminatedEmployees({
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('archive-summary')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Arxiv hub kartochkalari uchun sonlar' })
  archiveSummary() {
    return this.nesEmployeesService.getArchiveSummary();
  }

  @Delete()
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    summary: '[Deprecated] Barcha NES xodimlarini o`chirish — cutover scriptidan foydalaning',
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
  list(
    @Query('search') search?: string,
    @Query('organizationName') organizationName?: string,
    @Query('division') division?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.nesEmployeesService.listEmployees({
      search,
      organizationName,
      division,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('sync')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Energo ID dan xodimlarni qo`lda sinxron qilish' })
  @ApiBody({ type: SyncNesEmployeesDto })
  sync(@Body() _body: SyncNesEmployeesDto) {
    return this.nesEmployeesService.syncFromNes();
  }

  @Get('export-credentials')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ deprecated: true, summary: 'O`chirilgan — Energo ID OAuth ishlating' })
  exportCredentials() {
    throw new ForbiddenException(
      'Login/parol export o`chirilgan. Xodimlar Energo ID orqali kiradi.',
    );
  }
}
