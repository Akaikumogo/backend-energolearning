import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
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
import { CreateStudentDto } from './dto/create-student.dto';

@ApiTags('Employees')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN, Role.MODERATOR)
@Controller(['admin/students', 'admin/employees'])
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @ApiOperation({ summary: 'Xodim qo`shish (admin)' })
  @ApiBody({ type: CreateStudentDto })
  create(
    @Req()
    req: Request & {
      user: { id: string; role: Role; organizationIds: string[] };
    },
    @Body() body: CreateStudentDto,
  ) {
    void req;
    void body;
    throw new ForbiddenException('Xodimlar faqat Energo ID orqali qo`shiladi');
  }

  @Get()
  @ApiOperation({ summary: 'Xodimlar ro`yxati (admin)' })
  @ApiQuery({ name: 'orgId', required: false })
  @ApiQuery({ name: 'levelId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Paginated xodimlar ro`yxati' })
  findAll(
    @Req()
    req: Request & {
      user: { id: string; role: Role; organizationIds: string[] };
    },
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
  @ApiOperation({ summary: 'Xodim to`liq ma`lumoti' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiOkResponse({ description: 'Xodim detali' })
  findOne(
    @Req()
    req: Request & {
      user: { id: string; role: Role; organizationIds: string[] };
    },
    @Param('id') id: string,
  ) {
    return this.studentsService.findOne(id, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xodimni o`chirish (admin)' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  remove(
    @Req()
    req: Request & {
      user: { id: string; role: Role; organizationIds: string[] };
    },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService
      .deleteStudent(id, req.user)
      .then(() => ({ ok: true }));
  }

  @Get(':id/lost-questions')
  @ApiOperation({ summary: 'Eng ko`p xato qilingan savollar' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiOkResponse({ description: 'Lost questions ro`yxati' })
  getLostQuestions(
    @Req()
    req: Request & {
      user: { id: string; role: Role; organizationIds: string[] };
    },
    @Param('id') id: string,
  ) {
    return this.studentsService.getLostQuestions(id, req.user);
  }

  @Get(':id/xp-history')
  @ApiOperation({
    summary:
      'XP tarixi — qachon, qaysi savoldan necha ball (reyting shikoyatlari uchun)',
  })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getXpHistory(
    @Req()
    req: Request & {
      user: { id: string; role: Role; organizationIds: string[] };
    },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.studentsService.getXpHistory(id, req.user, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      onlyCorrect: true,
    });
  }

  @Get(':id/activity')
  @ApiOperation({ summary: '28 kunlik faollik heatmap' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiOkResponse({ description: 'Activity data: [{date, count}]' })
  getActivity(
    @Req()
    req: Request & {
      user: { id: string; role: Role; organizationIds: string[] };
    },
    @Param('id') id: string,
  ) {
    return this.studentsService.getActivity(id, req.user);
  }
}
