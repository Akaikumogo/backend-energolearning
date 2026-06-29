import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { MergeLegacyModeratorDto } from './dto/merge-legacy-moderator.dto';
import { LegacyModeratorMigrationService } from './legacy-moderator-migration.service';

@ApiTags('Moderator migration (bir martalik)')
@Controller('admin/migrations/legacy-moderators')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
@ApiBearerAuth('bearer')
export class LegacyModeratorMigrationController {
  constructor(
    private readonly migrationService: LegacyModeratorMigrationService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Eski local moderatorlar (energo_id yo`q)',
  })
  listLegacy() {
    return this.migrationService.listLegacyModerators();
  }

  @Get('targets')
  @ApiOperation({
    summary: 'Migratsiya maqsadi — Energo ID xodimlarini qidirish (nes_employees)',
  })
  searchTargets(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.migrationService.searchMigrationTargets(
      search,
      Number.isFinite(parsedLimit) ? parsedLimit : 50,
    );
  }

  @Get(':sourceUserId/suggestions')
  @ApiOperation({
    summary:
      'Eski moderator uchun mos Energo ID xodimlarini avtomatik tavsiya qilish',
  })
  suggestTargets(
    @Param('sourceUserId', ParseUUIDPipe) sourceUserId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 5;
    return this.migrationService.suggestTargets(
      sourceUserId,
      Number.isFinite(parsedLimit) ? parsedLimit : 5,
    );
  }

  @Post('merge')
  @ApiOperation({
    summary:
      'Eski moderatorni Energo ID xodimiga birlashtirish (dryRun=true — faqat ko`rish)',
  })
  merge(@Body() dto: MergeLegacyModeratorDto) {
    return this.migrationService.merge(dto);
  }
}
