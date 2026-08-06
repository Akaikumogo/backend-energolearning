import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LibraryDocumentsService } from './library-documents.service';

@ApiTags('Library documents (Mobile)')
@Controller('library-documents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
export class LibraryDocumentsController {
  constructor(private readonly service: LibraryDocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Faol hujjatlar (mobil kutubxona)' })
  @ApiOkResponse({ description: 'PDF / Word ro`yxati' })
  list() {
    return this.service.listForMobile();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Hujjat detail' })
  @ApiParam({ name: 'id' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getForMobile(id);
  }
}
