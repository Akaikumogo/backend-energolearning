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
import { UpsertEmployeeCertificateDto } from './dto/upsert-employee-certificate.dto';
import { EmployeeCheckType } from '../common/enums/employee-check-type.enum';
import { CreateEmployeeCheckDto } from './dto/create-employee-check.dto';
import { UpdateEmployeeCheckDto } from './dto/update-employee-check.dto';
import { CreateStudentDto } from './dto/create-student.dto';

@ApiTags('Students')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN, Role.MODERATOR)
@Controller('admin/students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @ApiOperation({ summary: 'Xodim qo`shish (admin)' })
  @ApiBody({ type: CreateStudentDto })
  create(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Body() body: CreateStudentDto,
  ) {
    return this.studentsService.createStudent(req.user, body);
  }

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

  @Delete(':id')
  @ApiOperation({ summary: 'Xodimni o`chirish (admin)' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  remove(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.deleteStudent(id, req.user).then(() => ({ ok: true }));
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

  @Get(':id/employee-certificate')
  @ApiOperation({ summary: 'Xodim guvohnomasi (admin)' })
  getEmployeeCertificate(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.getEmployeeCertificate(id, req.user);
  }

  @Put(':id/employee-certificate')
  @ApiOperation({ summary: 'Xodim guvohnomasini yaratish/yangilash (admin)' })
  @ApiBody({ type: UpsertEmployeeCertificateDto })
  upsertEmployeeCertificate(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpsertEmployeeCertificateDto,
  ) {
    return this.studentsService.upsertEmployeeCertificate(id, req.user, body);
  }

  @Get(':id/checks')
  @ApiOperation({ summary: 'Xodim tekshiruvlari ro`yxati (admin)' })
  @ApiQuery({ name: 'type', required: false, enum: EmployeeCheckType })
  listChecks(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type?: EmployeeCheckType,
  ) {
    return this.studentsService.listEmployeeChecks(id, req.user, type);
  }

  @Post(':id/checks')
  @ApiOperation({ summary: 'Tekshiruv qo`shish (admin)' })
  @ApiBody({ type: CreateEmployeeCheckDto })
  createCheck(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateEmployeeCheckDto,
  ) {
    return this.studentsService.createEmployeeCheck(id, req.user, body as any);
  }

  @Put(':id/checks/:checkId')
  @ApiOperation({ summary: 'Tekshiruvni yangilash (admin)' })
  @ApiBody({ type: UpdateEmployeeCheckDto })
  updateCheck(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('checkId', ParseUUIDPipe) checkId: string,
    @Body() body: UpdateEmployeeCheckDto,
  ) {
    return this.studentsService.updateEmployeeCheck(id, checkId, req.user, body as any);
  }

  @Delete(':id/checks/:checkId')
  @ApiOperation({ summary: 'Tekshiruvni o`chirish (admin)' })
  removeCheck(
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('checkId', ParseUUIDPipe) checkId: string,
  ) {
    return this.studentsService.deleteEmployeeCheck(id, checkId, req.user).then(() => ({ ok: true }));
  }
}
