import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ContentImportExportService } from './content-import-export.service';
import { ModeratorsImportExportService } from './moderators-import-export.service';

const jsonUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/json' ||
      file.originalname.toLowerCase().endsWith('.json');
    cb(null, ok);
  },
});

@ApiTags('Import / Export (SuperAdmin)')
@Controller('admin/import-export')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
@ApiBearerAuth('bearer')
export class AdminImportExportController {
  constructor(
    private readonly contentService: ContentImportExportService,
    private readonly moderatorsService: ModeratorsImportExportService,
  ) {}

  @Get('content/export')
  @ApiOperation({ summary: 'Modullar (level→theory→question) JSON export' })
  async exportContent(@Res() res: Response) {
    const bundle = await this.contentService.exportBundle();
    const json = JSON.stringify(bundle, null, 2);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="elektrolearn-kontent.json"',
    );
    res.send(json);
  }

  @Post('content/import')
  @ApiOperation({ summary: 'Modullar JSON import (FK bog‘lanishlari saqlanadi)' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'replace',
    required: false,
    description:
      'true bo‘lsa mavjud kontent to‘liq o‘chiriladi va fayldan qayta yuklanadi',
  })
  @UseInterceptors(jsonUpload)
  async importContent(
    @UploadedFile() file: Express.Multer.File,
    @Query('replace') replace: string | undefined,
    @Req() req: Request & { user: { id: string } },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('JSON fayl yuklanmadi');
    }
    const raw = file.buffer.toString('utf-8');
    const bundle = this.contentService.parseBundle(raw);
    return this.contentService.importBundle(
      bundle,
      replace === 'true' || replace === '1',
      req.user.id,
    );
  }

  @Get('moderators/export')
  @ApiOperation({ summary: 'Moderatorlar + ruxsatlar JSON export (orgsiz)' })
  async exportModerators(@Res() res: Response) {
    const bundle = await this.moderatorsService.exportBundle();
    const json = JSON.stringify(bundle, null, 2);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="elektrolearn-moderatorlar.json"',
    );
    res.send(json);
  }

  @Post('moderators/import')
  @ApiOperation({ summary: 'Moderatorlar JSON import (filial talab qilinmaydi)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(jsonUpload)
  async importModerators(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('JSON fayl yuklanmadi');
    }
    const raw = file.buffer.toString('utf-8');
    const bundle = this.moderatorsService.parseBundle(raw);
    return this.moderatorsService.importBundle(bundle);
  }
}
