import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from './users.service';
import { CreateModeratorDto } from './dto/create-moderator.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateModeratorDto } from './dto/update-moderator.dto';
import { PromoteModeratorDto } from './dto/promote-moderator.dto';
import { PromoteSuperAdminDto } from './dto/promote-superadmin.dto';
import { mapUserToProfile } from './user-profile.mapper';

@ApiTags('Users (Admin)')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Get()
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Barcha foydalanuvchilar ro`yxati (search + pagination)',
  })
  @ApiQuery({ name: 'role', required: false, enum: Role })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Query('role') role?: Role,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // Moderator scope: bosh (default) filial moderatori barcha filiallarni,
    // parent filial moderatori esa child filiallarni ham ko'radi.
    const organizationIds =
      req.user.role === Role.MODERATOR
        ? await this.organizationsService.resolveModeratorScope(
            req.user.organizationIds,
          )
        : undefined;

    return this.usersService.findAll({
      role,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      organizationIds,
    });
  }

  @Get('moderators')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Moderatorlar ro`yxati (search + pagination)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'orgId', required: false })
  @ApiQuery({
    name: 'orgMode',
    required: false,
    enum: ['include', 'exclude'],
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findModerators(
    @Query('search') search?: string,
    @Query('orgId') orgId?: string,
    @Query('orgMode') orgMode?: 'include' | 'exclude',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService
      .findAll({
        role: Role.MODERATOR,
        search,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        organizationIds: orgId?.trim() ? [orgId.trim()] : undefined,
        organizationFilterMode: orgMode === 'exclude' ? 'exclude' : 'include',
        requireEnergoId: true,
      })
      .then((result) => ({
        ...result,
        data: result.data.map(mapUserToProfile),
      }));
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Foydalanuvchi batafsil' })
  async findById(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const u = await this.usersService.findById(id);
    if (!u) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (req.user.role === Role.MODERATOR) {
      const scopedOrgIds = await this.organizationsService.resolveModeratorScope(
        req.user.organizationIds,
      );
      if (scopedOrgIds) {
        const allowed = (u.organizations ?? []).some((uo) =>
          scopedOrgIds.includes(uo.organization?.id),
        );
        if (!allowed) throw new NotFoundException('Foydalanuvchi topilmadi');
      }
    }
    return u;
  }

  @Post('superadmins/promote')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    summary:
      'Mavjud Energo ID xodimga SuperAdmin berish (yangi user yaratilmaydi)',
  })
  @ApiBody({ type: PromoteSuperAdminDto })
  promoteSuperAdmin(@Body() dto: PromoteSuperAdminDto) {
    return this.usersService.promoteToSuperAdmin(dto);
  }

  @Post('superadmins/:id/demote')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    summary:
      'Energo ID SuperAdmin dan USER ga tushirish (local bootstrap himoyalangan)',
  })
  demoteSuperAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.demoteFromSuperAdmin(id);
  }

  @Post('moderators/promote')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Mavjud xodimga moderator statusi berish (yangi user yaratilmaydi)',
  })
  @ApiBody({ type: PromoteModeratorDto })
  promoteModerator(@Body() dto: PromoteModeratorDto) {
    return this.usersService
      .promoteToModerator(dto)
      .then((user) => mapUserToProfile(user));
  }

  @Post('moderators/:id/demote')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Moderatorlikdan olib tashlash (xodim USER bo`lib qoladi)' })
  demoteModerator(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService
      .demoteFromModerator(id)
      .then((user) => mapUserToProfile(user));
  }

  @Post('moderators')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Yangi moderator yaratish (eski usul — o`rniga promote ishlating)',
    deprecated: true,
  })
  @ApiBody({ type: CreateModeratorDto })
  createModerator() {
    throw new ForbiddenException(
      'Yangi moderator yaratilmaydi. Mavjud xodimga POST /admin/users/moderators/promote ishlating.',
    );
  }

  @Put('moderators/:id')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Moderatorni tahrirlash (faqat SuperAdmin)' })
  @ApiBody({ type: UpdateModeratorDto })
  updateModerator(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateModeratorDto,
  ) {
    return this.usersService
      .updateModerator(id, dto)
      .then((user) => mapUserToProfile(user));
  }

  @Post('moderators/bulk-generate-passwords')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ deprecated: true, summary: 'O`chirilgan — Energo ID OAuth ishlating' })
  bulkGenerateModeratorPasswords() {
    throw new ForbiddenException(
      'Parol generatsiyasi o`chirilgan. Moderatorlar Energo ID orqali kiradi.',
    );
  }

  @Post()
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Yangi USER yaratish (admin)' })
  @ApiBody({ type: CreateUserDto })
  async createUser(
    @Req()
    req: Request & {
      user: { id: string; role: Role; organizationIds: string[] };
    },
    @Body() dto: CreateUserDto,
  ) {
    void req;
    void dto;
    throw new ForbiddenException(
      'USER/xodimlar faqat Energo ID orqali qo`shiladi. Qo`lda faqat moderator qo`shiladi.',
    );
  }

  @Put(':id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'USER profilini yangilash (admin)' })
  @ApiBody({ type: UpdateUserDto })
  async updateUser(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const existing = await this.usersService.findById(id);
    if (!existing) throw new NotFoundException('Foydalanuvchi topilmadi');

    if (req.user.role === Role.MODERATOR) {
      const scopedOrgIds =
        (await this.organizationsService.resolveModeratorScope(
          req.user.organizationIds,
        )) ?? null;
      if (scopedOrgIds) {
        const allowed = (existing.organizations ?? []).some((uo) =>
          scopedOrgIds.includes(uo.organization?.id),
        );
        if (!allowed) throw new NotFoundException('Foydalanuvchi topilmadi');
      }
      if (dto.organizationId) {
        if (scopedOrgIds && !scopedOrgIds.includes(dto.organizationId)) {
          throw new NotFoundException('Ruxsat yo`q');
        }
      }
    }

    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      await this.usersService.updateProfile(id, {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      } as any);
    }
    if (dto.organizationId) {
      await this.organizationsService.assignUser(dto.organizationId, id);
    }
    return this.usersService.findById(id);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Foydalanuvchini o`chirish' })
  removeUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.removeUser(id);
  }
}
