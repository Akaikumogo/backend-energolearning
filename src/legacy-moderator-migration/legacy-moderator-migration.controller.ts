import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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

  @Post('merge')
  @ApiOperation({
    summary:
      'Eski moderatorni Energo ID xodimiga birlashtirish (dryRun=true — faqat ko`rish)',
  })
  merge(@Body() dto: MergeLegacyModeratorDto) {
    return this.migrationService.merge(dto);
  }
}
