import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { randomInt } from 'node:crypto';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ContentService,
  type MobileTheoryQuizMode,
} from './content.service';

function shuffle<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function parseQuizMode(raw?: string): MobileTheoryQuizMode {
  return raw === 'retry' ? 'retry' : 'continue';
}

@ApiTags('Content (Mobile)')
@Controller()
export class MobileContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('levels/:levelId/theories')
  @ApiOperation({ summary: 'Level nazariyalari (mobile uchun)' })
  @ApiParam({ name: 'levelId' })
  @ApiOkResponse({ description: 'Nazariyalar ro`yxati' })
  async getTheoriesByLevel(
    @Param('levelId', ParseUUIDPipe) levelId: string,
  ) {
    const theories = await this.contentService.findTheoriesForMobileByLevel(levelId);
    return theories.map((t) => ({
      id: t.id,
      levelId: t.levelId,
      title: t.title,
      content: t.content,
      orderIndex: t.orderIndex,
    }));
  }

  @Get('levels/:levelId/theories-tree')
  @ApiOperation({ summary: 'Level nazariyalari (tree, mobile uchun)' })
  @ApiParam({ name: 'levelId' })
  @ApiOkResponse({ description: 'Nazariyalar tree' })
  async getTheoryTreeByLevel(@Param('levelId', ParseUUIDPipe) levelId: string) {
    const rows = await this.contentService.findTheoryTreeForMobileByLevel(levelId);
    const byId = new Map(rows.map((t) => [t.id, { ...t, children: [] as any[] }]));
    const roots: any[] = [];
    for (const t of rows) {
      const node = byId.get(t.id)!;
      if (t.parentTheoryId && byId.has(t.parentTheoryId)) {
        byId.get(t.parentTheoryId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const mapNode = (n: any): any => ({
      id: n.id,
      levelId: n.levelId,
      title: n.title,
      content: n.content,
      orderIndex: n.orderIndex,
      parentTheoryId: n.parentTheoryId ?? null,
      children: (n.children ?? []).map(mapNode),
    });

    return roots.map(mapNode);
  }

  @Get('theories/:id')
  @ApiOperation({ summary: 'Nazariya batafsil (mobile uchun)' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Nazariya detail' })
  async getTheoryById(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentService.findTheoryForMobileLessonView(id);
  }

  @Get('theories/:theoryId/questions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Modul savollari (mobile)',
    description:
      'continue: yechilgan savollarsiz qolganlardan random ≤4. ' +
      'retry: tugatilgan modul — barcha savollar qayta random.',
  })
  @ApiParam({ name: 'theoryId' })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: ['continue', 'retry'],
    description: 'continue (default) | retry',
  })
  @ApiOkResponse({
    description:
      'Savollar + progress meta (variantlar shuffled, isCorrect yo`q)',
  })
  async getQuestionsByTheoryId(
    @Param('theoryId', ParseUUIDPipe) theoryId: string,
    @Query('mode') modeRaw: string | undefined,
    @Req() req: Request & { user: { id: string } },
  ) {
    const mode = parseQuizMode(modeRaw);
    const result = await this.contentService.findQuestionsForMobileByTheoryId(
      theoryId,
      req.user.id,
      mode,
    );

    // Business rule: mobile clients to`g`ri javobni ko`rmasligi kerak,
    // shuning uchun `isCorrect` ni response’ga kiritmaymiz.
    return {
      mode: result.mode,
      totalQuestions: result.totalQuestions,
      answeredCount: result.answeredCount,
      remainingCount: result.remainingCount,
      isModuleComplete: result.isModuleComplete,
      questions: result.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        orderIndex: q.orderIndex,
        // Har so'rovda variantlar tartibi o'zgaradi.
        options: shuffle(q.options ?? []).map((o, displayIndex) => ({
          id: o.id,
          optionText: o.optionText,
          orderIndex: displayIndex,
          matchText: o.matchText,
        })),
      })),
    };
  }
}
