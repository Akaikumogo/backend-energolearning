import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudentsService } from './students.service';

@ApiTags('Students')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN, Role.MODERATOR)
@Controller('admin/students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @ApiOperation({ summary: 'Talabalar ro`yxati (admin)' })
  @ApiQuery({ name: 'orgId', required: false })
  @ApiQuery({ name: 'levelId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Paginated talabalar ro`yxati' })
  findAll(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Query('orgId') orgId?: string,
    @Query('levelId') levelId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.studentsService.findAll(req.user, {
      orgId,
      levelId,
      search,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Talaba to`liq ma`lumoti' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiOkResponse({ description: 'Talaba detali' })
  findOne(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('id') id: string,
  ) {
    return this.studentsService.findOne(id, req.user);
  }

  @Get(':id/lost-questions')
  @ApiOperation({ summary: 'Eng ko`p xato qilingan savollar' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiOkResponse({ description: 'Lost questions ro`yxati' })
  getLostQuestions(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('id') id: string,
  ) {
    return this.studentsService.getLostQuestions(id, req.user);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: '28 kunlik faollik heatmap' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiOkResponse({ description: 'Activity data: [{date, count}]' })
  getActivity(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('id') id: string,
  ) {
    return this.studentsService.getActivity(id, req.user);
  }
}
