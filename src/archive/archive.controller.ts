import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ElektroArchiveService } from './archive.service';
import {
  ElektroArchiveQueryDto,
  ExecuteElektroCutoverDto,
} from './dto/archive.dto';

type AuthedReq = Request & { user: { email?: string; id?: string } };

@Controller('admin/archive')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
export class ElektroArchiveController {
  constructor(private readonly archiveService: ElektroArchiveService) {}

  @Get('preview')
  getPreview() {
    return this.archiveService.getCutoverPreview();
  }

  @Post('cutover')
  executeCutover(
    @Body() body: ExecuteElektroCutoverDto,
    @Req() req: AuthedReq,
  ) {
    const adminUser = req.user?.email || 'superadmin';
    return this.archiveService.executeCutover(adminUser, body.confirmationCode);
  }

  @Get('list')
  listArchives() {
    return this.archiveService.listArchives();
  }

  @Get(':id/records')
  getArchiveRecords(
    @Param('id') id: string,
    @Query() query: ElektroArchiveQueryDto,
  ) {
    return this.archiveService.getArchiveRecords(
      id,
      query.table || 'users_test_role',
      {
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
        search: query.search,
      },
    );
  }

  @Get(':id/download')
  downloadArchive(@Param('id') id: string, @Res() res: Response) {
    const filePath = this.archiveService.getArchiveFilePath(id);
    res.download(filePath, `${id}.sqlite`);
  }
}
