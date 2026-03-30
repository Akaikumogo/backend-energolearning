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
} from '@nestjs/common';
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
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AssignUserDto } from './dto/assign-user.dto';
import { Request } from 'express';
import { NotFoundException } from '@nestjs/common';

@ApiTags('Organizations (Admin)')
@Controller('admin/organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class OrganizationsController {
  constructor(private readonly orgService: OrganizationsService) {}

  @Get()
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Barcha tashkilotlar ro`yxati (search bilan)' })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Query('search') search?: string,
  ) {
    const orgIds = req.user.role === Role.MODERATOR ? req.user.organizationIds : undefined;
    return this.orgService.findAll({ search }, orgIds);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Tashkilot batafsil' })
  findById(
    @Req() req: Request & { user: { role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (req.user.role === Role.MODERATOR) {
      const allowed = req.user.organizationIds.includes(id);
      if (!allowed) throw new NotFoundException('Tashkilot topilmadi');
    }
    return this.orgService.findById(id);
  }

  @Post()
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Yangi tashkilot yaratish' })
  @ApiBody({ type: CreateOrganizationDto })
  create(@Body() dto: CreateOrganizationDto) {
    return this.orgService.create(dto);
  }

  @Put(':id')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Tashkilotni yangilash' })
  @ApiBody({ type: UpdateOrganizationDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.orgService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Tashkilotni o`chirish' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.remove(id);
  }

  @Post(':id/users')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Foydalanuvchini tashkilotga biriktirish' })
  @ApiBody({ type: AssignUserDto })
  assignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUserDto,
  ) {
    return this.orgService.assignUser(id, dto.userId);
  }

  @Delete(':id/users/:userId')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Foydalanuvchini tashkilotdan chiqarish' })
  removeUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.orgService.removeUser(id, userId);
  }
}
