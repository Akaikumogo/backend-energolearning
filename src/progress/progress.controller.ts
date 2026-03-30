import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProgressService } from './progress.service';
import { SubmitAnswerDto } from './dto/submit-answer.dto';

@ApiTags('Progress')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('me')
  @ApiOperation({ summary: 'Joriy foydalanuvchi progressi' })
  @ApiOkResponse({ description: 'Levels ro`yxati progress bilan' })
  getMyProgress(@Req() req: Request & { user: { id: string } }) {
    return this.progressService.getMyProgress(req.user.id);
  }

  @Post('answer')
  @ApiOperation({ summary: 'Javob yuborish' })
  @ApiBody({ type: SubmitAnswerDto })
  @ApiOkResponse({ description: 'Javob natijasi: isCorrect, correctOptionId, xpEarned' })
  submitAnswer(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.progressService.submitAnswer(req.user.id, dto);
  }

  @Get('level/:levelId')
  @ApiOperation({ summary: 'Level detali: theories va progress' })
  @ApiParam({ name: 'levelId', description: 'Level IDsi' })
  @ApiOkResponse({ description: 'Level detali theories bilan' })
  getLevelDetail(
    @Req() req: Request & { user: { id: string } },
    @Param('levelId') levelId: string,
  ) {
    return this.progressService.getLevelDetail(req.user.id, levelId);
  }
}
