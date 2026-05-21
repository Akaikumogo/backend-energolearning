import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

@ApiTags('NES Employees Sync')
@Controller('admin/nes-employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class NesEmployeesController {
  constructor(private readonly nesEmployeesService: NesEmployeesService) {}

  @Get('filter-options')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Filtr uchun noyob tashkilot va bo`limlar ro`yxati' })
  filterOptions() {
    return this.nesEmployeesService.getFilterOptions();
  }

  @Get('sync-status')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Hozirgi sync holati va progressi' })
  syncStatus() {
    return this.nesEmployeesService.getSyncStatus();
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'NESdan import qilingan xodimlar ro`yxati' })
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

  @Get(':personnelNumber/history')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'NES xodimining o`zgarish tarixi' })
  history(@Param('personnelNumber') personnelNumber: string) {
    return this.nesEmployeesService.listHistory(personnelNumber);
  }

  @Get(':personnelNumber/positions')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'NES xodimining lavozim xronologiyasi' })
  positions(@Param('personnelNumber') personnelNumber: string) {
    return this.nesEmployeesService.listPositionHistory(personnelNumber);
  }

  @Post('sync')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'NES xodimlarini qo`lda sinxron qilish' })
  @ApiBody({ type: SyncNesEmployeesDto })
  sync(@Body() body: SyncNesEmployeesDto) {
    return this.nesEmployeesService.syncFromNes(body.date);
  }
}
