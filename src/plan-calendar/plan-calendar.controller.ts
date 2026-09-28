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

  @Put('days/:day')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Kun sozlamasi: norma / dam olish / bayram nomi' })
  setDay(
    @Req() req: AuthedRequest,
    @Param('day') day: string,
    @Body() body: SetPlanCalendarDayDto,
  ) {
    return this.service.setDay(day, body, req.user.id);
  }

  @Delete('days/:day')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Kunni avtomatik holatga qaytarish' })
  resetDay(@Param('day') day: string) {
    return this.service.resetDay(day);
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
