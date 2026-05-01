import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AudioBook } from '../database/entities/audio-book.entity';
import { AudioChapter } from '../database/entities/audio-chapter.entity';
import { AudioParagraph } from '../database/entities/audio-paragraph.entity';
import { AudioLibraryController } from './audio-library.controller';
import { AudioLibraryService } from './audio-library.service';

@Module({
  imports: [TypeOrmModule.forFeature([AudioBook, AudioChapter, AudioParagraph])],
  controllers: [AudioLibraryController],
  providers: [AudioLibraryService],
})
export class AudioLibraryModule {}

