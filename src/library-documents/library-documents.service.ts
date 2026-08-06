import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LibraryDocument } from '../database/entities/library-document.entity';
import {
  CreateLibraryDocumentDto,
  UpdateLibraryDocumentDto,
} from './dto/library-document.dto';

@Injectable()
export class LibraryDocumentsService {
  constructor(
    @InjectRepository(LibraryDocument)
    private readonly docsRepo: Repository<LibraryDocument>,
  ) {}

  listForMobile() {
    return this.docsRepo.find({
      where: { isActive: true },
      order: { orderIndex: 'ASC', createdAt: 'DESC' },
    });
  }

  async getForMobile(id: string) {
    const doc = await this.docsRepo.findOne({
      where: { id, isActive: true },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');
    return doc;
  }

  adminList(search?: string) {
    const qb = this.docsRepo
      .createQueryBuilder('d')
      .orderBy('d.order_index', 'ASC')
      .addOrderBy('d.created_at', 'DESC');
    if (search?.trim()) {
      qb.andWhere(
        '(LOWER(d.title) LIKE :q OR LOWER(COALESCE(d.original_name, \'\')) LIKE :q)',
        { q: `%${search.trim().toLowerCase()}%` },
      );
    }
    return qb.getMany();
  }

  async adminGet(id: string) {
    const doc = await this.docsRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');
    return doc;
  }

  adminCreate(dto: CreateLibraryDocumentDto) {
    const row = this.docsRepo.create({
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      fileKind: dto.fileKind,
      fileUrl: dto.fileUrl,
      originalName: dto.originalName ?? null,
      mimeType: dto.mimeType ?? null,
      fileSize: dto.fileSize ?? null,
      orderIndex: dto.orderIndex ?? 0,
      isActive: dto.isActive ?? true,
    });
    return this.docsRepo.save(row);
  }

  async adminUpdate(id: string, dto: UpdateLibraryDocumentDto) {
    const doc = await this.adminGet(id);
    if (dto.title !== undefined) doc.title = dto.title.trim();
    if (dto.description !== undefined) {
      doc.description = dto.description?.trim() || null;
    }
    if (dto.fileKind !== undefined) doc.fileKind = dto.fileKind;
    if (dto.fileUrl !== undefined) doc.fileUrl = dto.fileUrl;
    if (dto.originalName !== undefined) doc.originalName = dto.originalName;
    if (dto.mimeType !== undefined) doc.mimeType = dto.mimeType;
    if (dto.fileSize !== undefined) doc.fileSize = dto.fileSize;
    if (dto.orderIndex !== undefined) doc.orderIndex = dto.orderIndex;
    if (dto.isActive !== undefined) doc.isActive = dto.isActive;
    return this.docsRepo.save(doc);
  }

  async adminDelete(id: string) {
    const doc = await this.adminGet(id);
    doc.isActive = false;
    return this.docsRepo.save(doc);
  }
}
