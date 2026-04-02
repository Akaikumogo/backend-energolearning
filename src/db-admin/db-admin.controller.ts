import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response, Request } from 'express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { DbAdminService } from './db-admin.service';

const backupStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = 'uploads/db-backups';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `restore-${unique}${extname(file.originalname || '.sql') || '.sql'}`);
  },
});

@ApiTags('DB Admin (SuperAdmin)')
@Controller('admin/db')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class DbAdminController {
  constructor(private readonly dbAdminService: DbAdminService) {}

  @Get('backup')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Download DB backup (.sql)' })
  async downloadBackup(@Res() res: Response) {
    const { filePath, fileName } = await this.dbAdminService.createBackupFile();
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const stream = await this.dbAdminService.openBackupStream(filePath);
    stream.on('close', () => {
      this.dbAdminService.cleanupFile(filePath).catch(() => undefined);
    });
    stream.pipe(res);
  }

  @Post('restore')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Restore backup into target DB' })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'Restore result' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: backupStorage,
      limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
    }),
  )
  async restoreBackup(
    @UploadedFile() file: Express.Multer.File,
    @Req() _req: Request,
  ) {
    if (!file?.path) return { success: false, message: 'Fayl yuklanmadi' };
    try {
      return await this.dbAdminService.restoreFromFile(file.path);
    } finally {
      this.dbAdminService.cleanupFile(file.path).catch(() => undefined);
    }
  }
}

