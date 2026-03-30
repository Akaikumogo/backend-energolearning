import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AppService } from './app.service';
import { Roles } from './common/decorators/roles.decorator';
import { ApiErrorResponseDto } from './common/dto/api-response.dto';
import { Role } from './common/enums/role.enum';
import { RolesGuard } from './common/guards/roles.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Public health/info endpoint',
    description: 'Backend holati va asosiy URLlar haqida qisqa ma`lumot.',
  })
  @ApiOkResponse({
    description: 'Servis muvaffaqiyatli ishlamoqda',
  })
  getHello() {
    return this.appService.getPublicInfo();
  }

  @Get('admin/ping')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  @ApiBearerAuth('bearer')
  @ApiHeader({
    name: 'x-organization-id',
    required: false,
    description:
      'Permission va audit uchun organization context headeri (MVPda ixtiyoriy).',
  })
  @ApiOperation({
    summary: 'SuperAdmin protected test endpoint',
    description:
      'Permission ishlashini tekshiradi. Faqat SUPERADMIN roliga ruxsat berilgan.',
  })
  @ApiOkResponse({
    description: 'Permission tekshiruvi muvaffaqiyatli o`tdi',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token yo`q/yaroqsiz',
    type: ApiErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Role bo`yicha ruxsat yo`q',
    type: ApiErrorResponseDto,
  })
  adminPing(@Req() req: Request & { user: { email: string; role: Role } }) {
    return {
      success: true,
      message: 'SuperAdmin endpoint ishlamoqda',
      data: {
        userEmail: req.user.email,
        role: req.user.role,
      },
    };
  }
}
