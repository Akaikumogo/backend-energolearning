import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AudioBook } from '../database/entities/audio-book.entity';
import { AudioChapter } from '../database/entities/audio-chapter.entity';
import { AudioParagraph } from '../database/entities/audio-paragraph.entity';

@Injectable()
export class AudioLibraryService {
  constructor(
    @InjectRepository(AudioBook)
    private readonly bookRepo: Repository<AudioBook>,
    @InjectRepository(AudioChapter)
    private readonly chapterRepo: Repository<AudioChapter>,
    @InjectRepository(AudioParagraph)
    private readonly paragraphRepo: Repository<AudioParagraph>,
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

  // ─── Admin CRUD ──────────────────────────────────────────────────────────

  async adminListBooks(params?: { search?: string }) {
    const qb = this.bookRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.chapters', 'c')
      .where('1=1');

    if (params?.search?.trim()) {
      qb.andWhere('b.title ILIKE :q', { q: `%${params.search.trim()}%` });
    }

    qb.orderBy('b.createdAt', 'DESC');
    const books = await qb.getMany();

    return books.map((b) => ({
      id: b.id,
      title: b.title,
      coverUrl: b.coverUrl,
      description: b.description,
      isActive: b.isActive,
      chaptersCount: (b.chapters ?? []).length,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  }

  async adminGetBook(bookId: string) {
    const book = await this.bookRepo.findOne({
      where: { id: bookId },
      relations: { chapters: { paragraphs: true } },
    });
    if (!book) throw new NotFoundException('Audio book not found');
    return this.getBookDetailForAdminEntity(book);
  }

  async adminCreateBook(args: {
    title: string;
    description?: string | null;
    coverUrl?: string | null;
    isActive?: boolean;
  }) {
    const created = await this.bookRepo.save(
      this.bookRepo.create({
        title: args.title,
        description: args.description ?? null,
        coverUrl: args.coverUrl ?? null,
        isActive: args.isActive ?? true,
      }),
    );
    return this.adminGetBook(created.id);
  }

  async adminUpdateBook(bookId: string, args: Partial<{
    title: string;
    description: string | null;
    coverUrl: string | null;
    isActive: boolean;
  }>) {
    const book = await this.bookRepo.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Audio book not found');
    await this.bookRepo.update(
      { id: bookId },
      {
        title: args.title ?? book.title,
        description: args.description ?? book.description,
        coverUrl: args.coverUrl ?? book.coverUrl,
        isActive: typeof args.isActive === 'boolean' ? args.isActive : book.isActive,
      },
    );
    return this.adminGetBook(bookId);
  }

  async adminDeleteBook(bookId: string) {
    const book = await this.bookRepo.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Audio book not found');
    // Soft-delete: keep rows but hide from mobile.
    await this.bookRepo.update({ id: bookId }, { isActive: false });
    return { ok: true };
  }

  async adminCreateChapter(bookId: string, args: { title: string; orderIndex: number }) {
    const book = await this.bookRepo.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Audio book not found');
    const created = await this.chapterRepo.save(
      this.chapterRepo.create({
        bookId,
        title: args.title,
        orderIndex: args.orderIndex ?? 0,
      }),
    );
    return { ok: true, id: created.id };
  }

  async adminUpdateChapter(chapterId: string, args: Partial<{ title: string; orderIndex: number }>) {
    const chapter = await this.chapterRepo.findOne({ where: { id: chapterId } });
    if (!chapter) throw new NotFoundException('Audio chapter not found');
    await this.chapterRepo.update(
      { id: chapterId },
      {
        title: args.title ?? chapter.title,
        orderIndex: typeof args.orderIndex === 'number' ? args.orderIndex : chapter.orderIndex,
      },
    );
    return { ok: true };
  }

  async adminDeleteChapter(chapterId: string) {
    const chapter = await this.chapterRepo.findOne({ where: { id: chapterId } });
    if (!chapter) throw new NotFoundException('Audio chapter not found');
    await this.chapterRepo.delete({ id: chapterId });
    return { ok: true };
  }

  async adminCreateParagraph(chapterId: string, args: { text: string; orderIndex: number; audioUrl: string }) {
    const chapter = await this.chapterRepo.findOne({ where: { id: chapterId } });
    if (!chapter) throw new NotFoundException('Audio chapter not found');
    const created = await this.paragraphRepo.save(
      this.paragraphRepo.create({
        chapterId,
        text: args.text,
        orderIndex: args.orderIndex ?? 0,
        audioUrl: args.audioUrl,
      }),
    );
    return { ok: true, id: created.id };
  }

  async adminUpdateParagraph(
    paragraphId: string,
    args: Partial<{ text: string; orderIndex: number; audioUrl: string }>,
  ) {
    const p = await this.paragraphRepo.findOne({ where: { id: paragraphId } });
    if (!p) throw new NotFoundException('Audio paragraph not found');
    await this.paragraphRepo.update(
      { id: paragraphId },
      {
        text: args.text ?? p.text,
        orderIndex: typeof args.orderIndex === 'number' ? args.orderIndex : p.orderIndex,
        audioUrl: args.audioUrl ?? p.audioUrl,
      },
    );
    return { ok: true };
  }

  async adminDeleteParagraph(paragraphId: string) {
    const p = await this.paragraphRepo.findOne({ where: { id: paragraphId } });
    if (!p) throw new NotFoundException('Audio paragraph not found');
    await this.paragraphRepo.delete({ id: paragraphId });
    return { ok: true };
  }

  private getBookDetailForAdminEntity(book: AudioBook) {
    return {
      id: book.id,
      title: book.title,
      coverUrl: book.coverUrl,
      description: book.description,
      isActive: book.isActive,
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
