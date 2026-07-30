import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ContentService } from './content.service';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { CreateTheoryDto } from './dto/create-theory.dto';
import { UpdateTheoryDto } from './dto/update-theory.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ImportQuestionsDocxDto } from './dto/import-questions-docx.dto';

const docxUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      name.endsWith('.docx') ||
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'application/octet-stream';
    cb(ok ? null : new BadRequestException('Faqat .docx fayl yuklang'), ok);
  },
});

@ApiTags('Content (Admin)')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  // ─── Levels ──────────────────────────────────────────

  @Get('levels')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Barcha darajalar ro`yxati (nested search)' })
  @ApiQuery({ name: 'search', required: false })
  findAllLevels(@Query('search') search?: string) {
    return this.contentService.findAllLevels({ search });
  }

  @Get('levels/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Daraja batafsil (nazariyalar, savollar bilan)' })
  findLevelById(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentService.findLevelById(id);
  }

  @Post('levels')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Yangi daraja yaratish' })
  @ApiBody({ type: CreateLevelDto })
  createLevel(
    @Body() dto: CreateLevelDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.contentService.createLevel(dto, req.user.id);
  }

  @Put('levels/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Darajani yangilash' })
  @ApiBody({ type: UpdateLevelDto })
  updateLevel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLevelDto,
  ) {
    return this.contentService.updateLevel(id, dto);
  }

  @Delete('levels/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Darajani o`chirish' })
  removeLevel(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentService.removeLevel(id);
  }

  // ─── Theories ────────────────────────────────────────

  @Get('theories')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Barcha nazariyalar (search + filter + pagination)' })
  @ApiQuery({ name: 'levelId', required: false })
  @ApiQuery({
    name: 'parentTheoryId',
    required: false,
    description: 'Dars (lesson) theory id — faqat shu dars ostidagi nazariyalar',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAllTheories(
    @Query('levelId') levelId?: string,
    @Query('parentTheoryId') parentTheoryId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contentService.findAllTheories({
      levelId,
      parentTheoryId,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('levels/:levelId/theories')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Daraja nazariyalari' })
  findTheoriesByLevel(@Param('levelId', ParseUUIDPipe) levelId: string) {
    return this.contentService.findTheoriesByLevel(levelId);
  }

  @Get('levels/:levelId/theories-tree')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Daraja nazariyalari (tree)' })
  findTheoryTreeByLevel(@Param('levelId', ParseUUIDPipe) levelId: string) {
    return this.contentService.findTheoryTreeByLevel(levelId);
  }

  @Get('theories/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Nazariya batafsil' })
  findTheoryById(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentService.findTheoryById(id);
  }

  @Post('theories')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Yangi nazariya yaratish' })
  @ApiBody({ type: CreateTheoryDto })
  createTheory(
    @Body() dto: CreateTheoryDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.contentService.createTheory(dto, req.user.id);
  }

  @Put('theories/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Nazariyani yangilash' })
  @ApiBody({ type: UpdateTheoryDto })
  updateTheory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTheoryDto,
  ) {
    return this.contentService.updateTheory(id, dto);
  }

  @Delete('theories/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Nazariyani o`chirish' })
  removeTheory(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentService.removeTheory(id);
  }

  // ─── Questions ───────────────────────────────────────

  @Get('content-positions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Savolga biriktirish uchun lavozimlar ro`yxati (read-only, barcha moderatorlarga)',
  })
  findContentPositions() {
    return this.contentService.findPositionsForContent();
  }

  @Get('questions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Savollar ro`yxati (filter + search + pagination)' })
  @ApiQuery({ name: 'levelId', required: false })
  @ApiQuery({ name: 'theoryId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findQuestions(
    @Query('levelId') levelId?: string,
    @Query('theoryId') theoryId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contentService.findQuestions({
      levelId,
      theoryId,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('questions/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Savol batafsil (variantlar bilan)' })
  findQuestionById(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentService.findQuestionById(id);
  }

  @Post('questions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Yangi savol yaratish (variantlar bilan)' })
  @ApiBody({ type: CreateQuestionDto })
  createQuestion(
    @Body() dto: CreateQuestionDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.contentService.createQuestion(dto, req.user.id);
  }

  @Post('questions/import-docx')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'DOCX dan savollarni dars (lesson root) ga import qilish. dryRun=true → preview.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'levelId', 'theoryId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        levelId: { type: 'string', format: 'uuid' },
        theoryId: { type: 'string', format: 'uuid' },
        dryRun: { type: 'boolean', default: false },
        latinize: { type: 'boolean', default: true },
      },
    },
  })
  @UseInterceptors(docxUpload)
  importQuestionsDocx(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportQuestionsDocxDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('DOCX fayl yuklanmadi');
    }
    const levelId = String(body.levelId ?? '').trim();
    const theoryId = String(body.theoryId ?? '').trim();
    if (!levelId || !theoryId) {
      throw new BadRequestException('levelId va theoryId majburiy');
    }
    return this.contentService.importQuestionsFromDocx(file.buffer, {
      levelId,
      theoryId,
      dryRun:
        (body.dryRun as unknown) === true ||
        (body.dryRun as unknown) === 'true' ||
        (body.dryRun as unknown) === '1',
      latinize: !(
        (body.latinize as unknown) === false ||
        (body.latinize as unknown) === 'false' ||
        (body.latinize as unknown) === '0'
      ),
      userId: req.user.id,
    });
  }

  @Put('questions/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Savolni yangilash (variantlar bilan)' })
  @ApiBody({ type: UpdateQuestionDto })
  updateQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.contentService.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Savolni o`chirish' })
  removeQuestion(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentService.removeQuestion(id);
  }

  @Delete('question-options/:id')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Javob variantini o`chirish' })
  removeOption(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentService.removeOption(id);
  }
}
