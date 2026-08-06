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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateLibraryDocumentDto,
  UpdateLibraryDocumentDto,
} from './dto/library-document.dto';
import { LibraryDocumentsService } from './library-documents.service';

@ApiTags('Library documents (Admin)')
@Controller('admin/library-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN, Role.MODERATOR)
@ApiBearerAuth('bearer')
export class AdminLibraryDocumentsController {
  constructor(private readonly service: LibraryDocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Kutubxona hujjatlari (admin)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiOkResponse({ description: 'Hujjatlar ro`yxati' })
  list(@Query('search') search?: string) {
    return this.service.adminList(search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Hujjat detail (admin)' })
  @ApiParam({ name: 'id' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminGet(id);
  }

  @Post()
  @ApiOperation({ summary: 'Hujjat yaratish' })
  create(@Body() body: CreateLibraryDocumentDto) {
    return this.service.adminCreate(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Hujjatni yangilash' })
  @ApiParam({ name: 'id' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateLibraryDocumentDto,
  ) {
    return this.service.adminUpdate(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hujjatni o`chirish (soft)' })
  @ApiParam({ name: 'id' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminDelete(id);
  }
}
