import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  NotFoundException,
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
import { UsersService } from './users.service';
import { CreateModeratorDto } from './dto/create-moderator.dto';

@ApiTags('Users (Admin)')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Barcha foydalanuvchilar ro`yxati (search + pagination)' })
  @ApiQuery({ name: 'role', required: false, enum: Role })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Query('role') role?: Role,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.findAll({
      role,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      organizationIds:
        req.user.role === Role.MODERATOR ? req.user.organizationIds : undefined,
    });
  }

  @Get('moderators')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Moderatorlar ro`yxati (search + pagination)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findModerators(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.findAll({
      role: Role.MODERATOR,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Foydalanuvchi batafsil' })
  findById(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.findById(id).then((u) => {
      if (!u) throw new NotFoundException('Foydalanuvchi topilmadi');
      if (req.user.role === Role.MODERATOR) {
        const allowed = (u.organizations ?? []).some((uo) =>
          req.user.organizationIds.includes(uo.organization?.id),
        );
        if (!allowed) throw new NotFoundException('Foydalanuvchi topilmadi');
      }
      return u;
    });
  }

  @Post('moderators')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Yangi moderator yaratish (faqat SuperAdmin)' })
  @ApiBody({ type: CreateModeratorDto })
  createModerator(@Body() dto: CreateModeratorDto) {
    return this.usersService.createModerator(dto);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Foydalanuvchini o`chirish' })
  removeUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.removeUser(id);
  }
}
