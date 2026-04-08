import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { CreateTheoryDto } from './dto/create-theory.dto';
import { UpdateTheoryDto } from './dto/update-theory.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(Level) private readonly levelRepo: Repository<Level>,
    @InjectRepository(Theory) private readonly theoryRepo: Repository<Theory>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly optionRepo: Repository<QuestionOption>,
  ) {}

  // ─── Mobile (client) helpers ───────────────────────────
  // Mobile controller `options` ni map qilayotganda `isCorrect` ni response'dan
  // ataylab yashiradi, shuning uchun bu metodlar faqat kerakli relationlarni
  // qaytaradi.
  async findTheoriesForMobileByLevel(levelId: string): Promise<Theory[]> {
    return this.theoryRepo
      .createQueryBuilder('t')
      .innerJoin('t.level', 'l')
      .where('t.level_id = :levelId', { levelId })
      .andWhere('l.is_active = true')
      .orderBy('t.order_index', 'ASC')
      .addOrderBy('t.created_at', 'ASC')
      .getMany();
  }

  async findTheoryTreeForMobileByLevel(levelId: string): Promise<Theory[]> {
    const theories = await this.theoryRepo
      .createQueryBuilder('t')
      .innerJoin('t.level', 'l')
      .where('t.level_id = :levelId', { levelId })
      .andWhere('l.is_active = true')
      .orderBy('t.parent_theory_id', 'ASC', 'NULLS FIRST')
      .addOrderBy('t.order_index', 'ASC')
      .addOrderBy('t.created_at', 'ASC')
      .getMany();
    return theories;
  }

  async findTheoryForMobileById(id: string): Promise<Theory> {
    const theory = await this.theoryRepo
      .createQueryBuilder('t')
      .innerJoin('t.level', 'l')
      .where('t.id = :id', { id })
      .andWhere('l.is_active = true')
      .getOne();

    if (!theory) throw new NotFoundException('Nazariya topilmadi');
    return theory;
  }

  /** Mobile: nazariya bo'yicha har safar tasodifiy 4 ta savol (kamida 4 ta bo'lsa hammasi qaytadi). */
  private static readonly MOBILE_THEORY_QUESTION_SAMPLE = 4;

  async findQuestionsForMobileByTheoryId(
    theoryId: string,
  ): Promise<Question[]> {
    const idRows = await this.questionRepo
      .createQueryBuilder('q')
      .select('q.id')
      .where('q.theory_id = :theoryId', { theoryId })
      .andWhere('q.is_active = true')
      .orderBy('RANDOM()')
      .limit(ContentService.MOBILE_THEORY_QUESTION_SAMPLE)
      .getRawMany();

    const ids = idRows.map((row) => row.q_id as string);
    if (ids.length === 0) return [];

    const questions = await this.questionRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.options', 'o')
      .where('q.id IN (:...ids)', { ids })
      .orderBy('o.order_index', 'ASC')
      .getMany();

    const byId = new Map(questions.map((q) => [q.id, q]));
    return ids.map((id) => byId.get(id)).filter((q): q is Question => q != null);
  }

  // ─── Levels ──────────────────────────────────────────

  async findAllLevels(filters?: { search?: string }): Promise<Level[]> {
    const qb = this.levelRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.createdBy', 'u')
      .orderBy('l.order_index', 'ASC');

    if (filters?.search) {
      qb.leftJoin('l.theories', 'th')
        .leftJoin('l.questions', 'q')
        .andWhere(
          `(LOWER(l.title) LIKE :q OR LOWER(th.title) LIKE :q OR LOWER(q.prompt) LIKE :q)`,
          { q: `%${filters.search.toLowerCase()}%` },
        )
        .distinct(true);
    }

    return qb.getMany();
  }

  async findLevelById(id: string): Promise<Level> {
    const level = await this.levelRepo.findOne({
      where: { id },
      relations: ['theories', 'questions', 'createdBy'],
    });
    if (!level) throw new NotFoundException('Daraja topilmadi');
    return level;
  }

  async createLevel(dto: CreateLevelDto, userId: string): Promise<Level> {
    const maxOrder = await this.levelRepo
      .createQueryBuilder('l')
      .select('MAX(l.order_index)', 'max')
      .getRawOne();
    const nextOrder = dto.orderIndex ?? (maxOrder?.max ?? -1) + 1;

    const level = this.levelRepo.create({
      title: dto.title,
      orderIndex: nextOrder,
      isActive: dto.isActive ?? true,
      createdById: userId,
    });
    return this.levelRepo.save(level);
  }

  async updateLevel(id: string, dto: UpdateLevelDto): Promise<Level> {
    const level = await this.findLevelById(id);
    Object.assign(level, dto);
    return this.levelRepo.save(level);
  }

  async removeLevel(id: string): Promise<void> {
    const level = await this.findLevelById(id);
    await this.levelRepo.remove(level);
  }

  // ─── Theories ────────────────────────────────────────

  async findAllTheories(filters?: {
    levelId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Theory[]; total: number; page: number; limit: number }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;

    const countQb = this.theoryRepo.createQueryBuilder('t');
    if (filters?.levelId) {
      countQb.andWhere('t.level_id = :levelId', { levelId: filters.levelId });
    }
    if (filters?.search) {
      countQb.andWhere(
        '(LOWER(t.title) LIKE :q OR LOWER(t.content) LIKE :q)',
        { q: `%${filters.search.toLowerCase()}%` },
      );
    }
    const total = await countQb.getCount();

    const idsQb = this.theoryRepo
      .createQueryBuilder('t')
      .leftJoin('t.level', 'l')
      .select('t.id')
      .orderBy('l.order_index', 'ASC')
      .addOrderBy('t.order_index', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit);

    if (filters?.levelId) {
      idsQb.andWhere('t.level_id = :levelId', { levelId: filters.levelId });
    }
    if (filters?.search) {
      idsQb.andWhere(
        '(LOWER(t.title) LIKE :q OR LOWER(t.content) LIKE :q)',
        { q: `%${filters.search.toLowerCase()}%` },
      );
    }

    const idRows = await idsQb.getRawMany();
    const ids: string[] = idRows.map((r) => r.t_id);

    if (ids.length === 0) {
      return { data: [], total, page, limit };
    }

    const data = await this.theoryRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.level', 'l')
      .leftJoinAndSelect('t.createdBy', 'u')
      .whereInIds(ids)
      .orderBy('l.order_index', 'ASC')
      .addOrderBy('t.order_index', 'ASC')
      .getMany();

    return { data, total, page, limit };
  }

  async findTheoriesByLevel(levelId: string): Promise<Theory[]> {
    return this.theoryRepo.find({
      where: { levelId },
      order: { orderIndex: 'ASC' },
      relations: ['createdBy'],
    });
  }

  async findTheoryById(id: string): Promise<Theory> {
    const theory = await this.theoryRepo.findOne({
      where: { id },
      relations: ['level', 'questions', 'createdBy'],
    });
    if (!theory) throw new NotFoundException('Nazariya topilmadi');
    return theory;
  }

  async createTheory(dto: CreateTheoryDto, userId: string): Promise<Theory> {
    await this.findLevelById(dto.levelId);

    const maxOrder = await this.theoryRepo
      .createQueryBuilder('t')
      .select('MAX(t.order_index)', 'max')
      .where('t.level_id = :levelId', { levelId: dto.levelId })
      .getRawOne();
    const nextOrder = dto.orderIndex ?? (maxOrder?.max ?? -1) + 1;

    const parentTheoryId =
      dto.parentTheoryId === undefined ? null : (dto.parentTheoryId ?? null);
    if (parentTheoryId) {
      const parent = await this.theoryRepo.findOne({
        where: { id: parentTheoryId, levelId: dto.levelId },
      });
      if (!parent) throw new BadRequestException('Parent nazariya topilmadi');
    }

    const theory = this.theoryRepo.create({
      levelId: dto.levelId,
      title: dto.title,
      orderIndex: nextOrder,
      content: dto.content ?? '',
      parentTheoryId,
      createdById: userId,
    });
    return this.theoryRepo.save(theory);
  }

  async updateTheory(id: string, dto: UpdateTheoryDto): Promise<Theory> {
    const theory = await this.findTheoryById(id);
    if (dto.parentTheoryId !== undefined) {
      const nextParent =
        dto.parentTheoryId === null ? null : (dto.parentTheoryId ?? null);
      if (nextParent === id) {
        throw new BadRequestException('Parent nazariya o`zi bo`la olmaydi');
      }
      if (nextParent) {
        const parent = await this.theoryRepo.findOne({
          where: { id: nextParent, levelId: theory.levelId },
        });
        if (!parent) throw new BadRequestException('Parent nazariya topilmadi');
      }
      theory.parentTheoryId = nextParent;
    }
    if (dto.title !== undefined) theory.title = dto.title;
    if (dto.orderIndex !== undefined) theory.orderIndex = dto.orderIndex;
    if (dto.content !== undefined) theory.content = dto.content ?? '';
    return this.theoryRepo.save(theory);
  }

  async findTheoryTreeByLevel(levelId: string): Promise<Theory[]> {
    return this.theoryRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.createdBy', 'u')
      .where('t.level_id = :levelId', { levelId })
      .orderBy('t.parent_theory_id', 'ASC', 'NULLS FIRST')
      .addOrderBy('t.order_index', 'ASC')
      .addOrderBy('t.created_at', 'ASC')
      .getMany();
  }

  async removeTheory(id: string): Promise<void> {
    const theory = await this.findTheoryById(id);
    await this.theoryRepo.remove(theory);
  }

  // ─── Questions ───────────────────────────────────────

  async findQuestions(filters: {
    levelId?: string;
    theoryId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Question[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const countQb = this.questionRepo.createQueryBuilder('q');
    if (filters.levelId) {
      countQb.andWhere('q.level_id = :levelId', { levelId: filters.levelId });
    }
    if (filters.theoryId) {
      countQb.andWhere('q.theory_id = :theoryId', {
        theoryId: filters.theoryId,
      });
    }
    if (filters.search) {
      countQb.andWhere('LOWER(q.prompt) LIKE :q', {
        q: `%${filters.search.toLowerCase()}%`,
      });
    }
    const total = await countQb.getCount();

    const idsQb = this.questionRepo
      .createQueryBuilder('q')
      .leftJoin('q.level', 'l')
      .select('q.id')
      .orderBy('l.order_index', 'ASC')
      .addOrderBy('q.order_index', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit);

    if (filters.levelId) {
      idsQb.andWhere('q.level_id = :levelId', { levelId: filters.levelId });
    }
    if (filters.theoryId) {
      idsQb.andWhere('q.theory_id = :theoryId', {
        theoryId: filters.theoryId,
      });
    }
    if (filters.search) {
      idsQb.andWhere('LOWER(q.prompt) LIKE :q', {
        q: `%${filters.search.toLowerCase()}%`,
      });
    }

    const idRows = await idsQb.getRawMany();
    const ids: string[] = idRows.map((r) => r.q_id);

    if (ids.length === 0) {
      return { data: [], total, page, limit };
    }

    const data = await this.questionRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.options', 'o')
      .leftJoinAndSelect('q.level', 'l')
      .leftJoinAndSelect('q.theory', 't')
      .leftJoinAndSelect('q.createdBy', 'u')
      .whereInIds(ids)
      .orderBy('l.order_index', 'ASC')
      .addOrderBy('q.order_index', 'ASC')
      .addOrderBy('o.order_index', 'ASC')
      .getMany();

    return { data, total, page, limit };
  }

  async findQuestionById(id: string): Promise<Question> {
    const question = await this.questionRepo.findOne({
      where: { id },
      relations: ['options', 'level', 'theory', 'createdBy'],
    });
    if (!question) throw new NotFoundException('Savol topilmadi');
    return question;
  }

  async createQuestion(
    dto: CreateQuestionDto,
    userId: string,
  ): Promise<Question> {
    await this.findLevelById(dto.levelId);
    await this.findTheoryById(dto.theoryId);

    const maxOrder = await this.questionRepo
      .createQueryBuilder('q')
      .select('MAX(q.order_index)', 'max')
      .where('q.level_id = :levelId', { levelId: dto.levelId })
      .getRawOne();
    const nextOrder = dto.orderIndex ?? (maxOrder?.max ?? -1) + 1;

    const question = this.questionRepo.create({
      levelId: dto.levelId,
      theoryId: dto.theoryId,
      prompt: dto.prompt,
      type: dto.type,
      orderIndex: nextOrder,
      isActive: dto.isActive ?? true,
      createdById: userId,
    });
    const saved = await this.questionRepo.save(question);

    if (dto.options?.length) {
      const options = dto.options.map((o, i) =>
        this.optionRepo.create({
          questionId: saved.id,
          optionText: o.optionText,
          orderIndex: o.orderIndex ?? i,
          isCorrect: o.isCorrect,
          matchText: o.matchText ?? null,
        }),
      );
      await this.optionRepo.save(options);
    }

    return this.findQuestionById(saved.id);
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto): Promise<Question> {
    const question = await this.findQuestionById(id);

    if (dto.prompt !== undefined) question.prompt = dto.prompt;
    if (dto.type !== undefined) question.type = dto.type;
    if (dto.orderIndex !== undefined) question.orderIndex = dto.orderIndex;
    if (dto.isActive !== undefined) question.isActive = dto.isActive;
    await this.questionRepo.save(question);

    if (dto.options) {
      const existingIds = new Set(
        dto.options.filter((o) => o.id).map((o) => o.id!),
      );
      const toRemove = question.options.filter((o) => !existingIds.has(o.id));
      if (toRemove.length) await this.optionRepo.remove(toRemove);

      for (const optDto of dto.options) {
        if (optDto.id) {
          await this.optionRepo.update(optDto.id, {
            ...(optDto.optionText !== undefined && {
              optionText: optDto.optionText,
            }),
            ...(optDto.orderIndex !== undefined && {
              orderIndex: optDto.orderIndex,
            }),
            ...(optDto.isCorrect !== undefined && {
              isCorrect: optDto.isCorrect,
            }),
            ...(optDto.matchText !== undefined && {
              matchText: optDto.matchText,
            }),
          });
        } else {
          const newOpt = this.optionRepo.create({
            questionId: id,
            optionText: optDto.optionText ?? '',
            orderIndex: optDto.orderIndex ?? 0,
            isCorrect: optDto.isCorrect ?? false,
            matchText: optDto.matchText ?? null,
          });
          await this.optionRepo.save(newOpt);
        }
      }
    }

    return this.findQuestionById(id);
  }

  async removeQuestion(id: string): Promise<void> {
    const question = await this.findQuestionById(id);
    await this.questionRepo.remove(question);
  }

  // ─── Question Options (standalone) ───────────────────

  async removeOption(id: string): Promise<void> {
    const option = await this.optionRepo.findOne({ where: { id } });
    if (!option) throw new NotFoundException('Javob varianti topilmadi');
    await this.optionRepo.remove(option);
  }
}
