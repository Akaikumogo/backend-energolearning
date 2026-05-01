import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AudioLibraryService } from './audio-library.service';

@ApiTags('Audio Library (Mobile)')
@Controller()
@UseGuards(JwtAuthGuard)
export class AudioLibraryController {
  constructor(private readonly audioLibraryService: AudioLibraryService) {}

  @Get('audio-books')
  @ApiOperation({ summary: 'Audio kitoblar ro`yxati (mobile)' })
  @ApiOkResponse({ description: 'Audio kitoblar summary ro`yxati' })
  async listBooks() {
    return this.audioLibraryService.listBooksForMobile();
  }

  @Get('audio-books/:bookId')
  @ApiOperation({ summary: 'Audio kitob detail (chapters + paragraphs)' })
  @ApiParam({ name: 'bookId' })
  @ApiOkResponse({ description: 'Audio kitob detail' })
  async getBook(@Param('bookId', ParseUUIDPipe) bookId: string) {
    return this.audioLibraryService.getBookDetailForMobile(bookId);
  }
}

