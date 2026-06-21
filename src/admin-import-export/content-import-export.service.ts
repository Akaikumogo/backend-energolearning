import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import {
  CONTENT_EXPORT_VERSION,
  type ContentExportBundle,
  type ContentQuestionExport,
  type ContentTheoryExport,
} from './types/content-export.types';

export type ContentImportResult = {
  success: boolean;
  levels: { created: number; updated: number };
  theories: { created: number; updated: number };
  questions: { created: number; updated: number };
  options: { created: number; updated: number };
  errors: string[];
};

@Injectable()
export class ContentImportExportService {
  constructor(
    @InjectRepository(Level) private readonly levelRepo: Repository<Level>,
    @InjectRepository(Theory) private readonly theoryRepo: Repository<Theory>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly optionRepo: Repository<QuestionOption>,
    private readonly dataSource: DataSource,
  ) {}

  async exportBundle(): Promise<ContentExportBundle> {
    const levels = await this.levelRepo.find({
      order: { orderIndex: 'ASC', createdAt: 'ASC' },
    });

    const theories = await this.theoryRepo.find({
      order: { orderIndex: 'ASC', createdAt: 'ASC' },
    });

    const questions = await this.questionRepo.find({
      relations: ['options'],
      order: { orderIndex: 'ASC', createdAt: 'ASC' },
    });

    for (const q of questions) {
      q.options?.sort((a, b) => a.orderIndex - b.orderIndex);
    }

    return {
      version: CONTENT_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      levels: levels.map((l) => ({
        id: l.id,
        title: l.title,
        orderIndex: l.orderIndex,
        isActive: l.isActive,
      })),
      theories: theories.map((t) => ({
        id: t.id,
        levelId: t.levelId,
        parentTheoryId: t.parentTheoryId,
        title: t.title,
        orderIndex: t.orderIndex,
        content: t.content ?? '',
        slides: t.slides ?? null,
        theoryRole: t.theoryRole ?? null,
      })),
      questions: questions.map((q) => ({
        id: q.id,
        levelId: q.levelId,
        theoryId: q.theoryId,
        type: q.type,
        prompt: q.prompt,
        orderIndex: q.orderIndex,
        isActive: q.isActive,
        options: (q.options ?? []).map((o) => ({
          id: o.id,
          optionText: o.optionText,
          orderIndex: o.orderIndex,
          isCorrect: o.isCorrect,
          matchText: o.matchText ?? null,
        })),
      })),
    };
  }

  parseBundle(raw: string): ContentExportBundle {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('JSON fayl o‘qib bo‘lmadi');
    }

    const bundle = parsed as Partial<ContentExportBundle>;
    if (bundle.version !== CONTENT_EXPORT_VERSION) {
      throw new BadRequestException(
        `Noto‘g‘ri versiya (kutilgan: ${CONTENT_EXPORT_VERSION})`,
      );
    }
    if (!Array.isArray(bundle.levels)) {
      throw new BadRequestException('levels massivi topilmadi');
    }
    if (!Array.isArray(bundle.theories)) {
      throw new BadRequestException('theories massivi topilmadi');
    }
    if (!Array.isArray(bundle.questions)) {
      throw new BadRequestException('questions massivi topilmadi');
    }

    return bundle as ContentExportBundle;
  }

  async importBundle(
    bundle: ContentExportBundle,
    replaceExisting: boolean,
    userId: string,
  ): Promise<ContentImportResult> {
    this.validateRelations(bundle);

    const result: ContentImportResult = {
      success: true,
      levels: { created: 0, updated: 0 },
      theories: { created: 0, updated: 0 },
      questions: { created: 0, updated: 0 },
      options: { created: 0, updated: 0 },
      errors: [],
    };

    await this.dataSource.transaction(async (manager) => {
      if (replaceExisting) {
        await manager.query('DELETE FROM question_options');
        await manager.query('DELETE FROM questions');
        await manager.query('UPDATE theories SET parent_theory_id = NULL');
        await manager.query('DELETE FROM theories');
        await manager.query('DELETE FROM levels');
      }

      const levelRepo = manager.getRepository(Level);
      const theoryRepo = manager.getRepository(Theory);
      const questionRepo = manager.getRepository(Question);
      const optionRepo = manager.getRepository(QuestionOption);

      for (const row of bundle.levels) {
        const existing = await levelRepo.findOne({ where: { id: row.id } });
        if (existing) {
          existing.title = row.title;
          existing.orderIndex = row.orderIndex;
          existing.isActive = row.isActive;
          await levelRepo.save(existing);
          result.levels.updated++;
        } else {
          await levelRepo.save(
            levelRepo.create({
              id: row.id,
              title: row.title,
              orderIndex: row.orderIndex,
              isActive: row.isActive,
              createdById: userId,
            }),
          );
          result.levels.created++;
        }
      }

      const sortedTheories = this.sortTheoriesForImport(bundle.theories);
      for (const row of sortedTheories) {
        const existing = await theoryRepo.findOne({ where: { id: row.id } });
        if (existing) {
          existing.levelId = row.levelId;
          existing.parentTheoryId = row.parentTheoryId;
          existing.title = row.title;
          existing.orderIndex = row.orderIndex;
          existing.content = row.content ?? '';
          existing.slides = row.slides ?? null;
          existing.theoryRole = row.theoryRole ?? null;
          await theoryRepo.save(existing);
          result.theories.updated++;
        } else {
          await theoryRepo.save(
            theoryRepo.create({
              id: row.id,
              levelId: row.levelId,
              parentTheoryId: row.parentTheoryId,
              title: row.title,
              orderIndex: row.orderIndex,
              content: row.content ?? '',
              slides: row.slides ?? null,
              theoryRole: row.theoryRole ?? null,
              createdById: userId,
            }),
          );
          result.theories.created++;
        }
      }

      for (const row of bundle.questions) {
        const existing = await questionRepo.findOne({
          where: { id: row.id },
          relations: ['options'],
        });

        if (existing) {
          existing.levelId = row.levelId;
          existing.theoryId = row.theoryId;
          existing.type = row.type;
          existing.prompt = row.prompt;
          existing.orderIndex = row.orderIndex;
          existing.isActive = row.isActive;
          await questionRepo.save(existing);

          if (existing.options?.length) {
            await optionRepo.remove(existing.options);
          }
          result.questions.updated++;
        } else {
          await questionRepo.save(
            questionRepo.create({
              id: row.id,
              levelId: row.levelId,
              theoryId: row.theoryId,
              type: row.type,
              prompt: row.prompt,
              orderIndex: row.orderIndex,
              isActive: row.isActive,
              createdById: userId,
            }),
          );
          result.questions.created++;
        }

        for (const opt of row.options ?? []) {
          await optionRepo.save(
            optionRepo.create({
              id: opt.id,
              questionId: row.id,
              optionText: opt.optionText,
              orderIndex: opt.orderIndex,
              isCorrect: opt.isCorrect,
              matchText: opt.matchText ?? null,
            }),
          );
          result.options.created++;
        }
      }
    });

    return result;
  }

  private validateRelations(bundle: ContentExportBundle): void {
    const levelIds = new Set(bundle.levels.map((l) => l.id));
    const theoryIds = new Set(bundle.theories.map((t) => t.id));

    for (const t of bundle.theories) {
      if (!levelIds.has(t.levelId)) {
        throw new BadRequestException(
          `Nazariya "${t.title}" uchun levelId topilmadi: ${t.levelId}`,
        );
      }
      if (t.parentTheoryId && !theoryIds.has(t.parentTheoryId)) {
        throw new BadRequestException(
          `Nazariya "${t.title}" uchun parentTheoryId topilmadi: ${t.parentTheoryId}`,
        );
      }
    }

    for (const q of bundle.questions) {
      if (!levelIds.has(q.levelId)) {
        throw new BadRequestException(
          `Savol uchun levelId topilmadi: ${q.levelId}`,
        );
      }
      if (!theoryIds.has(q.theoryId)) {
        throw new BadRequestException(
          `Savol uchun theoryId topilmadi: ${q.theoryId}`,
        );
      }
    }
  }

  private sortTheoriesForImport(
    theories: ContentTheoryExport[],
  ): ContentTheoryExport[] {
    const sorted: ContentTheoryExport[] = [];
    const done = new Set<string>();
    let progress = true;

    while (sorted.length < theories.length && progress) {
      progress = false;
      for (const t of theories) {
        if (done.has(t.id)) continue;
        const parentId = t.parentTheoryId;
        if (!parentId || done.has(parentId)) {
          sorted.push(t);
          done.add(t.id);
          progress = true;
        }
      }
    }

    if (sorted.length < theories.length) {
      throw new BadRequestException(
        'Nazariyalar parent zanjirida xato (circular yoki yo‘q parent)',
      );
    }

    return sorted;
  }
}
