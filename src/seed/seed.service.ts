import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { MODULE_SEED_DATA, type QSeed } from './seed-curriculum';
import { LESSON_SLIDES } from './seed-lesson-slides';
import type { TheorySlide } from '../common/types/theory-slide';

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(Level) private readonly levelRepo: Repository<Level>,
    @InjectRepository(Theory) private readonly theoryRepo: Repository<Theory>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly optionRepo: Repository<QuestionOption>,
  ) {}

  async seedAll() {
    const modules = MODULE_SEED_DATA;
    let createdModules = 0;
    let createdTheories = 0;
    let createdQuestions = 0;
    let createdOptions = 0;
    let skippedModules = 0;
    let skippedTheories = 0;
    let skippedQuestions = 0;
    let skippedOptions = 0;

    for (let mi = 0; mi < modules.length; mi++) {
      const mod = modules[mi];
      let level = await this.levelRepo.findOne({
        where: { title: mod.title },
      });
      if (!level) {
        level = await this.levelRepo.save(
          this.levelRepo.create({
            title: mod.title,
            orderIndex: mi,
            isActive: true,
          }),
        );
        createdModules++;
      } else {
        skippedModules++;
        const nextOrderIndex = level.orderIndex ?? mi;
        const nextIsActive = level.isActive ?? true;
        if (level.orderIndex !== nextOrderIndex || level.isActive !== nextIsActive) {
          await this.levelRepo.update(
            { id: level.id },
            { orderIndex: nextOrderIndex, isActive: nextIsActive },
          );
          level = { ...level, orderIndex: nextOrderIndex, isActive: nextIsActive };
        }
      }

      for (let ti = 0; ti < mod.lessons.length; ti++) {
        const lesson = mod.lessons[ti];
        const nazTitle = `${lesson.title} · Nazariya`;
        const mashTitle = `${lesson.title} · Mashq`;

        const parent = await this.upsertTheory(level.id, {
          title: lesson.title,
          content: lesson.parentContent,
          orderIndex: ti,
          parentTheoryId: null,
          slides: null,
        });
        if (parent._created) createdTheories++;
        else skippedTheories++;

        const lessonKey = lesson.title.match(/^(\d+\.\d+)-dars/)?.[1];
        const fromMap =
          lessonKey && LESSON_SLIDES[lessonKey]?.length
            ? LESSON_SLIDES[lessonKey]
            : null;
        const slides: TheorySlide[] | null =
          fromMap ?? (lesson.slides?.length ? lesson.slides : null);
        const naz = await this.upsertTheory(level.id, {
          title: nazTitle,
          content: slides?.length ? '' : lesson.nazariya,
          orderIndex: 0,
          parentTheoryId: parent.id,
          slides,
        });
        if (naz._created) createdTheories++;
        else skippedTheories++;

        const mash = await this.upsertTheory(level.id, {
          title: mashTitle,
          content: '',
          orderIndex: 1,
          parentTheoryId: parent.id,
          slides: null,
        });
        if (mash._created) createdTheories++;
        else skippedTheories++;

        await this.questionRepo.delete({ theoryId: parent.id });
        await this.questionRepo.delete({ theoryId: naz.id });

        const sq = await this.seedQuestions(level.id, mash.id, lesson.mashq);
        createdQuestions += sq.createdQuestions;
        skippedQuestions += sq.skippedQuestions;
        createdOptions += sq.createdOptions;
        skippedOptions += sq.skippedOptions;
      }
    }

    return {
      success: true,
      message: 'Seed/Update muvaffaqiyatli (idempotent)',
      stats: {
        modules: modules.length,
        created: {
          modules: createdModules,
          theories: createdTheories,
          questions: createdQuestions,
          options: createdOptions,
        },
        skipped: {
          modules: skippedModules,
          theories: skippedTheories,
          questions: skippedQuestions,
          options: skippedOptions,
        },
      },
    };
  }

  private async upsertTheory(
    levelId: string,
    args: {
      title: string;
      content: string;
      orderIndex: number;
      parentTheoryId: string | null;
      slides: TheorySlide[] | null;
    },
  ): Promise<Theory & { _created: boolean }> {
    let theory = await this.theoryRepo.findOne({
      where: { levelId, title: args.title },
    });
    if (!theory) {
      theory = await this.theoryRepo.save(
        this.theoryRepo.create({
          levelId,
          title: args.title,
          content: args.content,
          orderIndex: args.orderIndex,
          parentTheoryId: args.parentTheoryId,
          slides: args.slides,
        }),
      );
      return Object.assign(theory, { _created: true });
    }
    await this.theoryRepo.update(
      { id: theory.id },
      {
        content: args.content,
        orderIndex: args.orderIndex,
        parentTheoryId: args.parentTheoryId,
        slides: args.slides,
      },
    );
    return Object.assign({ ...theory, ...args }, { _created: false });
  }

  private async seedQuestions(
    levelId: string,
    theoryId: string,
    questions: QSeed[],
  ) {
    let createdQuestions = 0;
    let skippedQuestions = 0;
    let createdOptions = 0;
    let skippedOptions = 0;

    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];
      let question = await this.questionRepo.findOne({
        where: { theoryId, prompt: q.prompt },
      });
      if (!question) {
        question = await this.questionRepo.save(
          this.questionRepo.create({
            levelId,
            theoryId,
            prompt: q.prompt,
            type: q.type,
            orderIndex: qi,
            isActive: true,
          }),
        );
        createdQuestions++;
      } else {
        skippedQuestions++;
        if (question.isActive !== true) {
          await this.questionRepo.update({ id: question.id }, { isActive: true });
        }
        if (question.type !== q.type || question.orderIndex !== qi) {
          await this.questionRepo.update(
            { id: question.id },
            { type: q.type, orderIndex: qi },
          );
        }
      }

      for (let oi = 0; oi < q.options.length; oi++) {
        const o = q.options[oi];
        const existingOpt = await this.optionRepo.findOne({
          where: { questionId: question.id, optionText: o.text },
        });
        if (existingOpt) {
          skippedOptions++;
          continue;
        }
        await this.optionRepo.save(
          this.optionRepo.create({
            questionId: question.id,
            optionText: o.text,
            isCorrect: o.correct,
            matchText: o.match ?? null,
            orderIndex: oi,
          }),
        );
        createdOptions++;
      }
    }

    return { createdQuestions, skippedQuestions, createdOptions, skippedOptions };
  }
}
