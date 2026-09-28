import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import {
  SetPlanCalendarDayDto,
  SetUserPlanDayDto,
  SetUserPlanNormDto,
} from './dto/plan-calendar.dto';
import { PlanCalendarService } from './plan-calendar.service';

type AuthedRequest = Request & {
  user: { id: string; role: Role; organizationIds: string[] };
};

@ApiTags('Plan calendar')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/plan-calendar')
export class PlanCalendarController {
  constructor(private readonly service: PlanCalendarService) {}

  @Get()
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.ACCOUNTING, Role.APPROVER)
  @ApiOperation({ summary: 'Oy bo‘yicha plan kalendari (hamma uchun)' })
  @ApiQuery({ name: 'month', required: false, example: '2026-10' })
  getMonth(@Query('month') month?: string) {
    return this.service.getMonth(month);
  }

  @Get('permissions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.ACCOUNTING, Role.APPROVER)
  @ApiOperation({ summary: 'Joriy foydalanuvchi planni o‘zgartira oladimi (markaziy apparat)' })
  async permissions(@Req() req: AuthedRequest) {
    return { canEdit: await this.service.canEditPlans(req.user) };
  }

  @Get('changes')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Plan o‘zgarishlari tarixi (faqat superadmin)' })
  getChanges(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('kind') kind?: string,
    @Query('actorId') actorId?: string,
    @Query('search') search?: string,
  ) {
    return this.service.getChanges({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      kind,
      actorId,
      search,
    });
  }

  @Get('custom-plans')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Shaxsiy plani bor xodimlar (faqat superadmin)' })
  getCustomPlans() {
    return this.service.getCustomPlans();
  }

  @Put('days/:day')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Kun sozlamasi: norma / dam olish / bayram nomi (markaziy apparat)' })
  setDay(
    @Req() req: AuthedRequest,
    @Param('day') day: string,
    @Body() body: SetPlanCalendarDayDto,
  ) {
    return this.service.setDay(day, body, req.user);
  }

  @Delete('days/:day')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Kunni avtomatik holatga qaytarish (markaziy apparat)' })
  resetDay(@Req() req: AuthedRequest, @Param('day') day: string) {
    return this.service.resetDay(day, req.user);
  }

  @Get('users/:userId')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.ACCOUNTING, Role.APPROVER)
  @ApiOperation({ summary: 'Xodimning oylik plani' })
  @ApiQuery({ name: 'month', required: false, example: '2026-10' })
  getUserPlan(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('month') month?: string,
  ) {
    return this.service.getUserPlan(userId, req.user, month);
  }

  @Patch('users/:userId/norm')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Xodimning doimiy kunlik normasi (null = standart)' })
  @ApiQuery({ name: 'month', required: false })
  setUserNorm(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SetUserPlanNormDto,
    @Query('month') month?: string,
  ) {
    return this.service.setUserNorm(userId, body.goal ?? null, req.user, month);
  }

  @Put('users/:userId/days/:day')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Xodimning aniq kun normasi' })
  setUserDay(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('day') day: string,
    @Body() body: SetUserPlanDayDto,
  ) {
    return this.service.setUserDay(userId, day, body.goal, body.note, req.user);
  }

  @Delete('users/:userId/days/:day')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Xodimning kun normasini olib tashlash' })
  resetUserDay(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('day') day: string,
  ) {
    return this.service.resetUserDay(userId, day, req.user);
  }
}

/** Mobil: xodim o'z plan kalendarini ko'radi (o'zgartira olmaydi). */
@ApiTags('Mobile Daily Plan')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('mobile/daily-plan')
export class MobilePlanCalendarController {
  constructor(private readonly service: PlanCalendarService) {}

  @Get('calendar')
  @ApiOperation({ summary: 'Mening oylik plan kalendarim (faqat ko‘rish)' })
  @ApiQuery({ name: 'month', required: false, example: '2026-10' })
  getMine(@Req() req: AuthedRequest, @Query('month') month?: string) {
    return this.service.getOwnPlan(req.user.id, month);
  }
}
