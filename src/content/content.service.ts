import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { QuestionPosition } from '../database/entities/question-position.entity';
import { LevelPosition } from '../database/entities/level-position.entity';
import { Position } from '../database/entities/position.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { CreateTheoryDto } from './dto/create-theory.dto';
import { UpdateTheoryDto } from './dto/update-theory.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import type { TheorySlide } from '../common/types/theory-slide';
import { TheoryRole } from '../common/enums/theory-role.enum';
import { QuestionType } from '../common/enums/question-type.enum';
import {
  parseDocxQuestions,
  type ParsedDocxQuestion,
} from '../common/utils/docx-questions.parser';
import { parseModuleDocx } from '../common/utils/docx-module.parser';

export type ImportQuestionsDocxResult = {
  success: boolean;
  dryRun: boolean;
  levelId: string;
  theoryId: string;
  parsed: number;
  created: number;
  skipped: number;
  warnings: number;
  questions: Array<{
    sourceIndex: number;
    prompt: string;
    optionsCount: number;
    correctCount: number;
    warnings: string[];
  }>;
  skippedDetails: string[];
};

export type ImportModuleDocxResult = {
  success: boolean;
  dryRun: boolean;
  moduleTitle: string;
  theories: Array<{
    title: string;
    contentLength: number;
    questionsCount: number;
  }>;
  totalQuestions: number;
  errors: string[];
  createdLevelId: string | null;
};

/** Mobile modul quiz: davom etish yoki tugatilgan modulni qayta random. */
export type MobileTheoryQuizMode = 'continue' | 'retry';

export type MobileTheoryQuestionsResult = {
  mode: MobileTheoryQuizMode;
  questions: Question[];
  totalQuestions: number;
  answeredCount: number;
  remainingCount: number;
  isModuleComplete: boolean;
};

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(Level) private readonly levelRepo: Repository<Level>,
    @InjectRepository(Theory) private readonly theoryRepo: Repository<Theory>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly optionRepo: Repository<QuestionOption>,
    @InjectRepository(QuestionPosition)
    private readonly questionPositionRepo: Repository<QuestionPosition>,
    @InjectRepository(LevelPosition)
    private readonly levelPositionRepo: Repository<LevelPosition>,
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    @InjectRepository(UserQuestionAttempt)
    private readonly attemptRepo: Repository<UserQuestionAttempt>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Kontentga savol biriktirish uchun lavozimlar ro'yxati.
   * /admin/positions (exams) faqat bosh filial moderatoriga ochiq — bu
   * read-only ro'yxat esa barcha moderatorlarga kerak.
   */
  async findPositionsForContent(): Promise<Position[]> {
    return this.positionRepo.find({
      where: { deletedAt: IsNull() },
      order: { title: 'ASC' },
    });
  }

  /** positionIds ni dedupe qilib, savolning lavozim bog'lamalarini qayta yozadi. */
  private async replaceQuestionPositions(
    questionId: string,
    positionIds: string[],
  ): Promise<void> {
    await this.questionPositionRepo.delete({ questionId });
    const unique = [...new Set(positionIds)];
    if (unique.length === 0) return;
    await this.questionPositionRepo.save(
      unique.map((positionId) =>
        this.questionPositionRepo.create({ questionId, positionId }),
      ),
    );
  }

  private async replaceLevelPositions(
    levelId: string,
    positionIds: string[],
  ): Promise<void> {
    try {
      await this.levelPositionRepo.delete({ levelId });
      const unique = [...new Set(positionIds)];
      if (unique.length === 0) return;
      await this.levelPositionRepo.save(
        unique.map((positionId) =>
          this.levelPositionRepo.create({ levelId, positionId }),
        ),
      );
    } catch (error) {
      if ((error as { code?: string }).code === '42P01') {
        // Jadval yo‘q — migratsiya kutiladi; daraja o‘zi saqlanadi.
        return;
      }
      throw error;
    }
  }

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

  /**
   * Dars root ID yoki bolalar ID: o‘qish uchun dars intro + nazariya bo‘limlari (slayd/matn),
   * savollar dars ildizi (parent theory_id) da.
   */
  async findTheoryForMobileLessonView(id: string): Promise<{
    id: string;
    levelId: string;
    title: string;
    content: string;
    slides: TheorySlide[] | null;
    nazariyaSections: Array<{
      id: string;
      title: string;
      slides: TheorySlide[] | null;
      content: string;
    }>;
    orderIndex: number;
    quizTheoryId: string;
  }> {
    let theory = await this.findTheoryForMobileById(id);
    while (theory.parentTheoryId) {
      theory = await this.findTheoryForMobileById(theory.parentTheoryId);
    }
    const children = await this.theoryRepo.find({
      where: { parentTheoryId: theory.id },
      order: { orderIndex: 'ASC' },
    });

    const stripNazariyaSuffix = (s: string) =>
      s.replace(/\s*·\s*Nazariya\s*$/i, '').trim() || s;

    const nazChildren = children.filter(
      (c) =>
        c.theoryRole === TheoryRole.NAZARIYA ||
        c.title.endsWith(' · Nazariya'),
    );

    const mapSection = (c: Theory) => ({
      id: c.id,
      title: stripNazariyaSuffix(c.title),
      slides: c.slides && c.slides.length > 0 ? c.slides : null,
      content:
        c.slides && c.slides.length > 0 ? '' : (c.content?.trim() ?? ''),
    });

    let nazariyaSections: Array<{
      id: string;
      title: string;
      slides: TheorySlide[] | null;
      content: string;
    }>;

    if (nazChildren.length > 0) {
      nazariyaSections = nazChildren.map(mapSection);
    } else {
      const naz =
        children.find((c) => c.theoryRole === TheoryRole.NAZARIYA) ??
        children.find((c) => c.title.endsWith(' · Nazariya'));
      if (naz) {
        const slideList = naz.slides && naz.slides.length > 0 ? naz.slides : null;
        nazariyaSections = [
          {
            id: naz.id,
            title: stripNazariyaSuffix(naz.title),
            slides: slideList,
            content: slideList?.length ? '' : (naz.content?.trim() ?? ''),
          },
        ];
      } else {
        nazariyaSections = [
          {
            id: theory.id,
            title: theory.title,
            slides: null,
            content: theory.content?.trim() ?? '',
          },
        ];
      }
    }

    const allSlidesFlat: TheorySlide[] = [];
    for (const s of nazariyaSections) {
      if (s.slides?.length) allSlidesFlat.push(...s.slides);
    }

    const introLesson =
      !nazChildren.length &&
      nazariyaSections.length === 1 &&
      nazariyaSections[0].id === theory.id
        ? ''
        : (theory.content?.trim() ?? '');

    return {
      id: theory.id,
      levelId: theory.levelId,
      title: theory.title,
      content: introLesson,
      slides: allSlidesFlat.length > 0 ? allSlidesFlat : null,
      nazariyaSections,
      orderIndex: theory.orderIndex,
      quizTheoryId: theory.id,
    };
  }

  /**
   * Mobile modul quiz:
   * - continue: yechilgan (attempt bor) savollar chiqmaydi, qolganlardan random ≤4
   * - retry: modul tugaganidan keyin — barcha aktiv savollar qayta random
   */
  private static readonly MOBILE_THEORY_QUESTION_SAMPLE = 4;

  async findQuestionsForMobileByTheoryId(
    theoryId: string,
    userId: string,
    mode: MobileTheoryQuizMode = 'continue',
  ): Promise<MobileTheoryQuestionsResult> {
    const effectiveMode: MobileTheoryQuizMode =
      mode === 'retry' ? 'retry' : 'continue';

    const totalQuestions = await this.questionRepo.count({
      where: { theoryId, isActive: true },
    });

    const answeredRow = await this.attemptRepo
      .createQueryBuilder('a')
      .innerJoin('a.question', 'q')
      .select('COUNT(DISTINCT a.question_id)', 'cnt')
      .where('a.user_id = :userId', { userId })
      .andWhere('q.theory_id = :theoryId', { theoryId })
      .andWhere('q.is_active = true')
      .getRawOne<{ cnt: string }>();

    const answeredCount = parseInt(answeredRow?.cnt ?? '0', 10);
    const remainingCount = Math.max(0, totalQuestions - answeredCount);
    const isModuleComplete =
      totalQuestions > 0 && answeredCount >= totalQuestions;

    if (effectiveMode === 'continue' && isModuleComplete) {
      return {
        mode: 'continue',
        questions: [],
        totalQuestions,
        answeredCount,
        remainingCount: 0,
        isModuleComplete: true,
      };
    }

    const idQb = this.questionRepo
      .createQueryBuilder('q')
      .select('q.id')
      .where('q.theory_id = :theoryId', { theoryId })
      .andWhere('q.is_active = true')
      .orderBy('RANDOM()');

    if (effectiveMode === 'continue') {
      idQb
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM user_question_attempts a
            WHERE a.question_id = q.id AND a.user_id = :userId
          )`,
        )
        .setParameter('userId', userId)
        .limit(ContentService.MOBILE_THEORY_QUESTION_SAMPLE);
    }

    const idRows = await idQb.getRawMany();
    const ids = idRows.map((row) => row.q_id as string);

    if (ids.length === 0) {
      return {
        mode: effectiveMode,
        questions: [],
        totalQuestions,
        answeredCount,
        remainingCount:
          effectiveMode === 'retry' ? totalQuestions : remainingCount,
        isModuleComplete,
      };
    }

    const questions = await this.questionRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.options', 'o')
      .where('q.id IN (:...ids)', { ids })
      .orderBy('o.order_index', 'ASC')
      .getMany();

    const byId = new Map(questions.map((q) => [q.id, q]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((q): q is Question => q != null);

    return {
      mode: effectiveMode,
      questions: ordered,
      totalQuestions,
      answeredCount,
      remainingCount:
        effectiveMode === 'retry' ? totalQuestions : remainingCount,
      isModuleComplete,
    };
  }

  // ─── Levels ──────────────────────────────────────────

  private async getLevelEntity(
    id: string,
    relations: string[] = ['createdBy', 'positionLinks', 'positionLinks.position'],
  ): Promise<Level> {
    try {
      const level = await this.levelRepo.findOne({ where: { id }, relations });
      if (!level) throw new NotFoundException('Daraja topilmadi');
      return level;
    } catch (error) {
      // Productionda `level_positions` migratsiyasi kechikishi mumkin (42P01).
      if ((error as { code?: string }).code !== '42P01') throw error;
      const safeRelations = relations.filter(
        (rel) => !rel.startsWith('positionLinks'),
      );
      const level = await this.levelRepo.findOne({
        where: { id },
        relations: safeRelations,
      });
      if (!level) throw new NotFoundException('Daraja topilmadi');
      level.positionLinks = [];
      return level;
    }
  }

  /** TypeORM relationlaridagi aylana havolalarni JSON uchun xavfsiz qilib qaytaradi. */
  private serializeLevel(
    level: Level,
    opts?: { includeTheories?: boolean; includeQuestions?: boolean },
  ) {
    const payload: Record<string, unknown> = {
      id: level.id,
      title: level.title,
      orderIndex: level.orderIndex,
      isActive: level.isActive,
      createdById: level.createdById,
      createdAt: level.createdAt,
      updatedAt: level.updatedAt,
      createdBy: level.createdBy
        ? {
            id: level.createdBy.id,
            firstName: level.createdBy.firstName,
            lastName: level.createdBy.lastName,
          }
        : null,
      positionLinks: (level.positionLinks ?? []).map((link) => ({
        id: link.id,
        levelId: link.levelId,
        positionId: link.positionId,
        createdAt: link.createdAt,
        position: link.position
          ? {
              id: link.position.id,
              title: link.position.title,
              title1c: link.position.title1c ?? null,
            }
          : undefined,
      })),
    };

    if (opts?.includeTheories && level.theories) {
      payload.theories = level.theories.map((theory) => ({
        id: theory.id,
        levelId: theory.levelId,
        parentTheoryId: theory.parentTheoryId,
        title: theory.title,
        orderIndex: theory.orderIndex,
        content: theory.content,
        slides: theory.slides,
        theoryRole: theory.theoryRole,
        createdById: theory.createdById,
        createdAt: theory.createdAt,
        updatedAt: theory.updatedAt,
      }));
    }

    if (opts?.includeQuestions && level.questions) {
      payload.questions = level.questions.map((question) => ({
        id: question.id,
        levelId: question.levelId,
        theoryId: question.theoryId,
        type: question.type,
        prompt: question.prompt,
        orderIndex: question.orderIndex,
        isActive: question.isActive,
        createdById: question.createdById,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
      }));
    }

    return payload;
  }

  async findAllLevels(filters?: { search?: string }): Promise<Level[]> {
    const levels = await this.loadAllLevelEntities(filters);
    return levels.map((level) => this.serializeLevel(level) as unknown as Level);
  }

  private async loadAllLevelEntities(filters?: {
    search?: string;
  }): Promise<Level[]> {
    const build = (withPositions: boolean) => {
      const qb = this.levelRepo
        .createQueryBuilder('l')
        .leftJoinAndSelect('l.createdBy', 'u')
        .orderBy('l.orderIndex', 'ASC');

      if (withPositions) {
        qb.leftJoinAndSelect('l.positionLinks', 'pl').leftJoinAndSelect(
          'pl.position',
          'pos',
        );
      }

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
    };

    try {
      return await build(true);
    } catch (error) {
      if ((error as { code?: string }).code !== '42P01') throw error;
      const levels = await build(false);
      for (const level of levels) level.positionLinks = [];
      return levels;
    }
  }

  async findLevelById(id: string): Promise<Level> {
    const level = await this.getLevelEntity(id, [
      'theories',
      'questions',
      'createdBy',
      'positionLinks',
      'positionLinks.position',
    ]);
    return this.serializeLevel(level, {
      includeTheories: true,
      includeQuestions: true,
    }) as unknown as Level;
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
    const saved = await this.levelRepo.save(level);
    if (dto.positionIds?.length) {
      await this.replaceLevelPositions(saved.id, dto.positionIds);
    }
    return this.findLevelById(saved.id);
  }

  async updateLevel(id: string, dto: UpdateLevelDto): Promise<Level> {
    const level = await this.getLevelEntity(id, []);
    if (dto.title !== undefined) level.title = dto.title;
    if (dto.orderIndex !== undefined) level.orderIndex = dto.orderIndex;
    if (dto.isActive !== undefined) level.isActive = dto.isActive;
    await this.levelRepo.save(level);

    if (dto.positionIds !== undefined) {
      await this.replaceLevelPositions(id, dto.positionIds);
    }

    return this.findLevelById(id);
  }

  async removeLevel(id: string): Promise<void> {
    const level = await this.getLevelEntity(id, []);
    await this.levelRepo.remove(level);
  }

  // ─── Theories ────────────────────────────────────────

  async findAllTheories(filters?: {
    levelId?: string;
    parentTheoryId?: string;
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
    if (filters?.parentTheoryId) {
      countQb.andWhere('t.parent_theory_id = :pid', {
        pid: filters.parentTheoryId,
      });
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
    if (filters?.parentTheoryId) {
      idsQb.andWhere('t.parent_theory_id = :pid', {
        pid: filters.parentTheoryId,
      });
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
    await this.getLevelEntity(dto.levelId, []);

    const parentTheoryId =
      dto.parentTheoryId === undefined ? null : (dto.parentTheoryId ?? null);

    const orderQb = this.theoryRepo
      .createQueryBuilder('t')
      .select('MAX(t.order_index)', 'max')
      .where('t.level_id = :levelId', { levelId: dto.levelId });
    if (parentTheoryId) {
      orderQb.andWhere('t.parent_theory_id = :pid', { pid: parentTheoryId });
    } else {
      orderQb.andWhere('t.parent_theory_id IS NULL');
    }
    const maxOrder = await orderQb.getRawOne();
    const nextOrder = dto.orderIndex ?? (maxOrder?.max ?? -1) + 1;

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
      slides: dto.slides ?? null,
      parentTheoryId,
      createdById: userId,
      theoryRole: dto.theoryRole ?? null,
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
    if (dto.slides !== undefined) theory.slides = dto.slides ?? null;
    if (dto.theoryRole !== undefined) theory.theoryRole = dto.theoryRole ?? null;
    return this.theoryRepo.save(theory);
  }

  async findTheoryTreeByLevel(levelId: string): Promise<Theory[]> {
    const all = await this.theoryRepo.find({
      where: { levelId },
      relations: ['createdBy'],
      order: { orderIndex: 'ASC', createdAt: 'ASC' },
    });
    const byParent = new Map<string | null, Theory[]>();
    for (const t of all) {
      const pid = t.parentTheoryId ?? null;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid)!.push(t);
    }
    for (const arr of byParent.values()) {
      arr.sort(
        (a, b) =>
          a.orderIndex - b.orderIndex ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
    }
    const roots = byParent.get(null) ?? [];
    const attach = (node: Theory): Theory => {
      const kids = byParent.get(node.id) ?? [];
      return { ...node, children: kids.map(attach) } as Theory;
    };
    return roots.map(attach);
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
      .leftJoinAndSelect('q.positionLinks', 'pl')
      .leftJoinAndSelect('pl.position', 'pos')
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
      relations: [
        'options',
        'level',
        'theory',
        'createdBy',
        'positionLinks',
        'positionLinks.position',
      ],
    });
    if (!question) throw new NotFoundException('Savol topilmadi');
    return question;
  }

  async createQuestion(
    dto: CreateQuestionDto,
    userId: string,
  ): Promise<Question> {
    await this.getLevelEntity(dto.levelId, []);
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
      const normalized = this.normalizeSingleCorrectOptions(
        dto.type ?? QuestionType.SINGLE_CHOICE,
        dto.options.map((o, i) => ({
          optionText: o.optionText,
          orderIndex: o.orderIndex ?? i,
          isCorrect: o.isCorrect,
          matchText: o.matchText ?? null,
        })),
      );
      const options = normalized.map((o) =>
        this.optionRepo.create({
          questionId: saved.id,
          optionText: o.optionText,
          orderIndex: o.orderIndex,
          isCorrect: o.isCorrect,
          matchText: o.matchText,
        }),
      );
      await this.optionRepo.save(options);
    }

    if (dto.positionIds?.length) {
      await this.replaceQuestionPositions(saved.id, dto.positionIds);
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
      const type = dto.type ?? question.type;
      const normalized = this.normalizeSingleCorrectOptions(
        type,
        dto.options.map((o, i) => ({
          id: o.id,
          optionText: o.optionText ?? '',
          orderIndex: o.orderIndex ?? i,
          isCorrect: o.isCorrect ?? false,
          matchText: o.matchText ?? null,
        })),
      );

      const existingIds = new Set(
        normalized.filter((o) => o.id).map((o) => o.id!),
      );
      const toRemove = question.options.filter((o) => !existingIds.has(o.id));
      if (toRemove.length) await this.optionRepo.remove(toRemove);

      for (const optDto of normalized) {
        if (optDto.id) {
          await this.optionRepo.update(optDto.id, {
            optionText: optDto.optionText,
            orderIndex: optDto.orderIndex,
            isCorrect: optDto.isCorrect,
            matchText: optDto.matchText,
          });
        } else {
          const newOpt = this.optionRepo.create({
            questionId: id,
            optionText: optDto.optionText,
            orderIndex: optDto.orderIndex,
            isCorrect: optDto.isCorrect,
            matchText: optDto.matchText,
          });
          await this.optionRepo.save(newOpt);
        }
      }
    }

    // undefined = tegilmaydi; bo'sh massiv = barcha bog'lamalar o'chiriladi.
    if (dto.positionIds !== undefined) {
      await this.replaceQuestionPositions(id, dto.positionIds);
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

  /**
   * Qat'iy shablondagi DOCX dan to'liq modul yaratadi:
   * Level → LESSON root → NAZARIYA child → Questions.
   */
  async importModuleFromDocx(
    buffer: Buffer,
    opts: {
      dryRun?: boolean;
      latinize?: boolean;
      userId: string;
    },
  ): Promise<ImportModuleDocxResult> {
    let parsed;
    try {
      parsed = await parseModuleDocx(buffer, {
        latinize: opts.latinize !== false,
      });
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'DOCX o‘qib bo‘lmadi',
      );
    }

    const existing = parsed.title
      ? await this.levelRepo
          .createQueryBuilder('l')
          .where('LOWER(l.title) = LOWER(:title)', { title: parsed.title })
          .getOne()
      : null;
    const errors = [...parsed.errors];
    if (existing) errors.push(`"${parsed.title}" nomli modul allaqachon mavjud`);

    const resultBase = {
      moduleTitle: parsed.title,
      theories: parsed.theories.map((theory) => ({
        title: theory.title,
        contentLength: theory.content.length,
        questionsCount: theory.questions.length,
      })),
      totalQuestions: parsed.totalQuestions,
      errors,
    };

    if (opts.dryRun === true) {
      return {
        success: errors.length === 0,
        dryRun: true,
        ...resultBase,
        createdLevelId: null,
      };
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    const createdLevelId = await this.dataSource.transaction(async (manager) => {
      const levelRepo = manager.getRepository(Level);
      const theoryRepo = manager.getRepository(Theory);
      const questionRepo = manager.getRepository(Question);
      const optionRepo = manager.getRepository(QuestionOption);

      const duplicate = await levelRepo
        .createQueryBuilder('l')
        .where('LOWER(l.title) = LOWER(:title)', { title: parsed.title })
        .getOne();
      if (duplicate) {
        throw new BadRequestException(
          `"${parsed.title}" nomli modul allaqachon mavjud`,
        );
      }

      const maxLevelOrder = await levelRepo
        .createQueryBuilder('l')
        .select('MAX(l.order_index)', 'max')
        .getRawOne();
      const level = await levelRepo.save(
        levelRepo.create({
          title: parsed.title,
          orderIndex: (maxLevelOrder?.max ?? -1) + 1,
          isActive: true,
          createdById: opts.userId,
        }),
      );

      for (let theoryIndex = 0; theoryIndex < parsed.theories.length; theoryIndex++) {
        const sourceTheory = parsed.theories[theoryIndex];
        const lesson = await theoryRepo.save(
          theoryRepo.create({
            levelId: level.id,
            title: sourceTheory.title,
            orderIndex: theoryIndex,
            content: '',
            slides: null,
            parentTheoryId: null,
            theoryRole: TheoryRole.LESSON,
            createdById: opts.userId,
          }),
        );

        await theoryRepo.save(
          theoryRepo.create({
            levelId: level.id,
            title: `${sourceTheory.title} · Nazariya`,
            orderIndex: 0,
            content: sourceTheory.content,
            slides: null,
            parentTheoryId: lesson.id,
            theoryRole: TheoryRole.NAZARIYA,
            createdById: opts.userId,
          }),
        );

        for (
          let questionIndex = 0;
          questionIndex < sourceTheory.questions.length;
          questionIndex++
        ) {
          const sourceQuestion = sourceTheory.questions[questionIndex];
          const question = await questionRepo.save(
            questionRepo.create({
              levelId: level.id,
              theoryId: lesson.id,
              prompt: sourceQuestion.prompt,
              type: QuestionType.SINGLE_CHOICE,
              orderIndex: questionIndex,
              isActive: true,
              createdById: opts.userId,
            }),
          );

          await optionRepo.save(
            sourceQuestion.options.map((option, optionIndex) =>
              optionRepo.create({
                questionId: question.id,
                optionText: option.text,
                orderIndex: optionIndex,
                isCorrect: option.isCorrect,
                matchText: null,
              }),
            ),
          );
        }
      }

      return level.id;
    });

    return {
      success: true,
      dryRun: false,
      ...resultBase,
      createdLevelId,
    };
  }

  /**
   * DOCX dan savollarni dars (lesson root) theory_id ga import qiladi.
   * dryRun=true → faqat parse/preview.
   */
  async importQuestionsFromDocx(
    buffer: Buffer,
    opts: {
      levelId: string;
      theoryId: string;
      dryRun?: boolean;
      latinize?: boolean;
      userId: string;
    },
  ): Promise<ImportQuestionsDocxResult> {
    const level = await this.getLevelEntity(opts.levelId, []);
    const theory = await this.findTheoryById(opts.theoryId);

    if (theory.levelId !== level.id) {
      throw new BadRequestException(
        'Tanlangan dars ushbu modulga tegishli emas',
      );
    }
    if (theory.parentTheoryId) {
      throw new BadRequestException(
        'Savollar faqat dars (lesson root) ga bog‘lanadi — nazariya bolasiga emas',
      );
    }

    let parsed;
    try {
      parsed = await parseDocxQuestions(buffer, {
        latinize: opts.latinize !== false,
      });
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'DOCX o‘qib bo‘lmadi',
      );
    }

    if (parsed.questions.length === 0) {
      throw new BadRequestException(
        'DOCX dan hech qanday savol topilmadi. Format: `1-savol. ...` + `a) ...*`',
      );
    }

    const preview = parsed.questions.map((q) => ({
      sourceIndex: q.sourceIndex,
      prompt: q.prompt,
      optionsCount: q.options.length,
      correctCount: q.options.filter((o) => o.isCorrect).length,
      warnings: q.warnings,
    }));

    const dryRun = opts.dryRun === true;
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        levelId: level.id,
        theoryId: theory.id,
        parsed: parsed.questions.length,
        created: 0,
        skipped: parsed.skipped.length,
        warnings: preview.filter((q) => q.warnings.length > 0).length,
        questions: preview,
        skippedDetails: parsed.skipped,
      };
    }

    const created = await this.persistParsedQuestions(
      parsed.questions,
      level.id,
      theory.id,
      opts.userId,
    );

    return {
      success: true,
      dryRun: false,
      levelId: level.id,
      theoryId: theory.id,
      parsed: parsed.questions.length,
      created,
      skipped: parsed.skipped.length,
      warnings: preview.filter((q) => q.warnings.length > 0).length,
      questions: preview,
      skippedDetails: parsed.skipped,
    };
  }

  private async persistParsedQuestions(
    questions: ParsedDocxQuestion[],
    levelId: string,
    theoryId: string,
    userId: string,
  ): Promise<number> {
    let created = 0;

    await this.dataSource.transaction(async (manager) => {
      const questionRepo = manager.getRepository(Question);
      const optionRepo = manager.getRepository(QuestionOption);

      const maxOrder = await questionRepo
        .createQueryBuilder('q')
        .select('MAX(q.order_index)', 'max')
        .where('q.level_id = :levelId', { levelId })
        .getRawOne();
      let nextOrder = (maxOrder?.max ?? -1) + 1;

      for (const q of questions) {
        // To‘g‘ri javob yo‘q bo‘lsa — birinchi variantni to‘g‘ri deb belgilamaymiz;
        // admin previewda ko‘rgan bo‘lishi kerak. Baribir saqlaymiz.
        const saved = await questionRepo.save(
          questionRepo.create({
            levelId,
            theoryId,
            prompt: q.prompt,
            type: QuestionType.SINGLE_CHOICE,
            orderIndex: nextOrder++,
            isActive: true,
            createdById: userId,
          }),
        );

        await optionRepo.save(
          q.options.map((o, i) =>
            optionRepo.create({
              questionId: saved.id,
              optionText: o.optionText,
              orderIndex: o.orderIndex ?? i,
              isCorrect: o.isCorrect,
              matchText: null,
            }),
          ),
        );
        created++;
      }
    });

    return created;
  }

  /**
   * SINGLE_CHOICE / YES_NO: faqat bitta to‘g‘ri javob.
   * Bir nechta belgilangan bo‘lsa — massivdagi birinchisi; hech biri yo‘q — 0-index.
   */
  private normalizeSingleCorrectOptions<
    T extends { isCorrect?: boolean },
  >(type: QuestionType, options: T[]): T[] {
    if (
      type !== QuestionType.SINGLE_CHOICE &&
      type !== QuestionType.YES_NO
    ) {
      return options;
    }
    const keep = Math.max(
      0,
      options.findIndex((o) => o.isCorrect),
    );
    return options.map((o, i) => ({ ...o, isCorrect: i === keep }));
  }
}
