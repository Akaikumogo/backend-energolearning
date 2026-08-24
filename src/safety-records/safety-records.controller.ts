import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BulkRejectSafetyChangeDto,
  BulkSafetyChangeIdsDto,
  RejectSafetyChangeDto,
  UpsertSafetyRecordDto,
} from './dto/safety-record.dto';
import { SafetyRecordsService } from './safety-records.service';

type Authed = Request & {
  user: { id: string; role: Role; organizationIds: string[] };
};

@ApiTags('Safety records')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class SafetyRecordsController {
  constructor(private readonly safetyRecordsService: SafetyRecordsService) {}

  @Get('safety-record-types')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.APPROVER, Role.ACCOUNTING)
  @ApiOperation({ summary: 'Texnik sinov / xavfsizlik turlari' })
  listTypes() {
    return this.safetyRecordsService.listTypes();
  }

  @Get('safety-changes/pending')
  @Roles(Role.SUPERADMIN, Role.APPROVER)
  @ApiOperation({ summary: 'Tasdiq kutilayotgan o‘zgarishlar ro‘yxati' })
  listPending(@Req() req: Authed) {
    return this.safetyRecordsService.listPending(req.user);
  }

  @Get('safety-changes/pending/count')
  @Roles(Role.SUPERADMIN, Role.APPROVER)
  @ApiOperation({ summary: 'Tasdiq kutilayotganlar soni (badge)' })
  countPending(@Req() req: Authed) {
    return this.safetyRecordsService.countPending(req.user);
  }

  @Post('safety-changes/bulk-approve')
  @Roles(Role.SUPERADMIN, Role.APPROVER)
  @ApiOperation({ summary: 'Bir nechta o‘zgarishni birga tasdiqlash' })
  bulkApprove(@Req() req: Authed, @Body() dto: BulkSafetyChangeIdsDto) {
    return this.safetyRecordsService.bulkApprove(dto.changeIds, req.user);
  }

  @Post('safety-changes/bulk-reject')
  @Roles(Role.SUPERADMIN, Role.APPROVER)
  @ApiOperation({ summary: 'Bir nechta o‘zgarishni birga rad etish' })
  bulkReject(@Req() req: Authed, @Body() dto: BulkRejectSafetyChangeDto) {
    return this.safetyRecordsService.bulkReject(dto.changeIds, dto, req.user);
  }

  @Get('students/:userId/safety-records')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.APPROVER, Role.ACCOUNTING)
  @ApiOperation({ summary: 'Xodimning joriy safety yozuvlari' })
  @ApiOkResponse({ description: 'Types + latest records + pending changes' })
  listForEmployee(
    @Req() req: Authed,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.safetyRecordsService.listForEmployee(userId, req.user);
  }

  @Get('students/:userId/safety-records/:typeCode/history')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.APPROVER, Role.ACCOUNTING)
  @ApiOperation({ summary: 'Xodim safety tarixi (records + audit)' })
  history(
    @Req() req: Authed,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('typeCode') typeCode: string,
  ) {
    return this.safetyRecordsService.listHistory(userId, typeCode, req.user);
  }

  @Put('students/:userId/safety-records/:typeCode')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Safety yozuvini yaratish/yangilash (pending approval)',
  })
  upsert(
    @Req() req: Authed,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('typeCode') typeCode: string,
    @Body() dto: UpsertSafetyRecordDto,
  ) {
    return this.safetyRecordsService.createOrUpdate(
      userId,
      typeCode,
      dto,
      req.user,
    );
  }

  @Post('safety-changes/:changeId/approve')
  @Roles(Role.SUPERADMIN, Role.APPROVER)
  @ApiOperation({ summary: 'Safety o‘zgarishini tasdiqlash' })
  approve(
    @Req() req: Authed,
    @Param('changeId', ParseUUIDPipe) changeId: string,
  ) {
    return this.safetyRecordsService.approve(changeId, req.user);
  }

  @Post('safety-changes/:changeId/reject')
  @Roles(Role.SUPERADMIN, Role.APPROVER)
  @ApiOperation({ summary: 'Safety o‘zgarishini rad etish' })
  reject(
    @Req() req: Authed,
    @Param('changeId', ParseUUIDPipe) changeId: string,
    @Body() dto: RejectSafetyChangeDto,
  ) {
    return this.safetyRecordsService.reject(changeId, dto, req.user);
  }
}
