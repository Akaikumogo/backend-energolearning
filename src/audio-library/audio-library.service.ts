import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AudioBook } from '../database/entities/audio-book.entity';

@Injectable()
export class AudioLibraryService {
  constructor(
    @InjectRepository(AudioBook)
    private readonly bookRepo: Repository<AudioBook>,
  ) {}

  async listBooksForMobile() {
    // Keep it light: list page doesn't need full chapters/paragraphs.
    const books = await this.bookRepo.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
      relations: { chapters: true },
    });

    return books.map((b) => ({
      id: b.id,
      title: b.title,
      coverUrl: b.coverUrl,
      description: b.description,
      chaptersCount: (b.chapters ?? []).length,
    }));
  }

  async getBookDetailForMobile(bookId: string) {
    const book = await this.bookRepo.findOne({
      where: { id: bookId, isActive: true },
      relations: { chapters: { paragraphs: true } },
    });
    if (!book) throw new NotFoundException('Audio book not found');

    return {
      id: book.id,
      title: book.title,
      coverUrl: book.coverUrl,
      description: book.description,
      chapters: (book.chapters ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c) => ({
          id: c.id,
          title: c.title,
          order: c.orderIndex,
          bookId: c.bookId,
          paragraphs: (c.paragraphs ?? [])
            .slice()
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((p) => ({
              id: p.id,
              text: p.text,
              order: p.orderIndex,
              chapterId: p.chapterId,
              audioUrl: p.audioUrl,
            })),
        })),
    };
  }
}

