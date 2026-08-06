import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportSubmissionsService } from './report-submissions.service';

const excelUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname?.toLowerCase() ?? '';
    const ok =
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      file.mimetype?.includes('sheet') ||
      file.mimetype?.includes('excel');
    cb(null, Boolean(ok));
  },
});

@ApiTags('Report submissions (Admin)')
@Controller('admin/report-submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class ReportSubmissionsController {
  constructor(private readonly service: ReportSubmissionsService) {}

  @Post('upload')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @UseInterceptors(excelUpload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary:
      'Filial oylik Excel ni yuklash вЂ” ID bilan saqlanadi (asosiy filial solishtiradi)',
  })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
  ) {
    return this.service.parseAndCreate(file, req.user);
  }

  @Get()
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.ACCOUNTING)
  @ApiOperation({
    summary: 'Yuklangan hisobotlar (faqat asosiy filial / SUPERADMIN)',
  })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'orgId', required: false })
  list(
    @Query('month') month: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
  ) {
    return this.service.list(req.user, { month, orgId });
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.ACCOUNTING)
  @ApiOperation({ summary: 'Yuklangan hisobot (ID)' })
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
  ) {
    return this.service.getOne(id, req.user);
  }

  @Get(':id/compare')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.ACCOUNTING)
  @ApiOperation({
    summary: 'Yuklangan Excel ni tizimdagi joriy filial hisoboti bilan solishtirish',
  })
  compare(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string; role: Role; organizationIds: string[] } },
  ) {
    return this.service.compare(id, req.user);
  }
}
