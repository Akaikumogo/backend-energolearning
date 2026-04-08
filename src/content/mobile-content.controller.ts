import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ContentService } from './content.service';

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
    const theory = await this.contentService.findTheoryForMobileById(id);
    return {
      id: theory.id,
      levelId: theory.levelId,
      title: theory.title,
      content: theory.content,
      orderIndex: theory.orderIndex,
    };
  }

  @Get('theories/:theoryId/questions')
  @ApiOperation({
    summary: 'Nazariya savollari (mobile uchun)',
    description:
      'Nazariya ichidagi tasodifiy 4 ta savol (kamida 4 ta bo`lsa barchasi). Har safar yangi tanlov.',
  })
  @ApiParam({ name: 'theoryId' })
  @ApiOkResponse({
    description:
      'Tasodifiy 4 ta savol (variantlar bilan, isCorrectsiz); savollar soni 4 dan kam bo`lishi mumkin',
  })
  async getQuestionsByTheoryId(
    @Param('theoryId', ParseUUIDPipe) theoryId: string,
  ) {
    const questions = await this.contentService.findQuestionsForMobileByTheoryId(theoryId);

    // Business rule: mobile clients to`g`ri javobni ko`rmasligi kerak,
    // shuning uchun `isCorrect` ni response’ga kiritmaymiz.
    return questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      orderIndex: q.orderIndex,
      options: (q.options ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((o) => ({
          id: o.id,
          optionText: o.optionText,
          orderIndex: o.orderIndex,
          matchText: o.matchText,
        })),
    }));
  }
}

