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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AudioLibraryService } from './audio-library.service';
import {
  AdminCreateAudioBookDto,
  AdminCreateAudioChapterDto,
  AdminCreateAudioParagraphDto,
  AdminUpdateAudioBookDto,
  AdminUpdateAudioChapterDto,
  AdminUpdateAudioParagraphDto,
} from './dto/admin-audio-book.dto';

@ApiTags('Audio Library (Admin)')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN, Role.MODERATOR)
@ApiBearerAuth('bearer')
export class AdminAudioLibraryController {
  constructor(private readonly audioLibraryService: AudioLibraryService) {}

  @Get('audio-books')
  @ApiOperation({ summary: 'Audio kitoblar ro`yxati (admin)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiOkResponse({ description: 'Audio kitoblar list' })
  async list(@Query('search') search?: string) {
    return this.audioLibraryService.adminListBooks({ search });
  }

  @Get('audio-books/:bookId')
  @ApiOperation({ summary: 'Audio kitob detail (admin)' })
  @ApiParam({ name: 'bookId' })
  async get(@Param('bookId', ParseUUIDPipe) bookId: string) {
    return this.audioLibraryService.adminGetBook(bookId);
  }

  @Post('audio-books')
  @ApiOperation({ summary: 'Audio kitob yaratish' })
  async createBook(@Body() body: AdminCreateAudioBookDto) {
    return this.audioLibraryService.adminCreateBook(body);
  }

  @Put('audio-books/:bookId')
  @ApiOperation({ summary: 'Audio kitobni yangilash' })
  @ApiParam({ name: 'bookId' })
  async updateBook(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Body() body: AdminUpdateAudioBookDto,
  ) {
    return this.audioLibraryService.adminUpdateBook(bookId, body);
  }

  @Delete('audio-books/:bookId')
  @ApiOperation({ summary: 'Audio kitobni o`chirish (soft, isActive=false)' })
  @ApiParam({ name: 'bookId' })
  async deleteBook(@Param('bookId', ParseUUIDPipe) bookId: string) {
    return this.audioLibraryService.adminDeleteBook(bookId);
  }

  @Post('audio-books/:bookId/chapters')
  @ApiOperation({ summary: 'Book ichiga chapter qo`shish' })
  @ApiParam({ name: 'bookId' })
  async createChapter(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Body() body: AdminCreateAudioChapterDto,
  ) {
    return this.audioLibraryService.adminCreateChapter(bookId, body);
  }

  @Put('audio-chapters/:chapterId')
  @ApiOperation({ summary: 'Chapter yangilash' })
  @ApiParam({ name: 'chapterId' })
  async updateChapter(
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
    @Body() body: AdminUpdateAudioChapterDto,
  ) {
    return this.audioLibraryService.adminUpdateChapter(chapterId, body);
  }

  @Delete('audio-chapters/:chapterId')
  @ApiOperation({ summary: 'Chapter o`chirish' })
  @ApiParam({ name: 'chapterId' })
  async deleteChapter(@Param('chapterId', ParseUUIDPipe) chapterId: string) {
    return this.audioLibraryService.adminDeleteChapter(chapterId);
  }

  @Post('audio-chapters/:chapterId/paragraphs')
  @ApiOperation({ summary: 'Chapter ichiga paragraph qo`shish (audioUrl majburiy)' })
  @ApiParam({ name: 'chapterId' })
  async createParagraph(
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
    @Body() body: AdminCreateAudioParagraphDto,
  ) {
    return this.audioLibraryService.adminCreateParagraph(chapterId, body);
  }

  @Put('audio-paragraphs/:paragraphId')
  @ApiOperation({ summary: 'Paragraph yangilash' })
  @ApiParam({ name: 'paragraphId' })
  async updateParagraph(
    @Param('paragraphId', ParseUUIDPipe) paragraphId: string,
    @Body() body: AdminUpdateAudioParagraphDto,
  ) {
    return this.audioLibraryService.adminUpdateParagraph(paragraphId, body);
  }

  @Delete('audio-paragraphs/:paragraphId')
  @ApiOperation({ summary: 'Paragraph o`chirish' })
  @ApiParam({ name: 'paragraphId' })
  async deleteParagraph(
    @Param('paragraphId', ParseUUIDPipe) paragraphId: string,
  ) {
    return this.audioLibraryService.adminDeleteParagraph(paragraphId);
  }
}

