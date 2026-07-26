import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { XpAnomaliesService } from './xp-anomalies.service';

@ApiTags('XP Anomalies (Admin)')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
@Controller('admin/xp-anomalies')
export class XpAnomaliesController {
  constructor(private readonly xpAnomaliesService: XpAnomaliesService) {}

  @Get('audit')
  @ApiOperation({
    summary:
      'Javoblar vs ball (is_correct) anomaliyalarini tekshirish — SUPERADMIN',
  })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiOkResponse({ description: 'Audit summary + affected users + samples' })
  audit(@Query('limit') limit?: string) {
    return this.xpAnomaliesService.audit(
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('reconcile')
  @ApiOperation({
    summary:
      'Barcha gradeable urinishlarni tanlangan variantga mos qilib is_correct / heart_lost ni tuzatish',
  })
  @ApiOkResponse({ description: 'Reconcile result' })
  reconcile() {
    return this.xpAnomaliesService.reconcile();
  }
}
