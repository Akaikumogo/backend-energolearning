import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { TelegramNewsService } from './telegram-news.service';

class TelegramNewsTestDto {
  @IsUUID()
  chatRowId: string;
}

@ApiTags('Admin Telegram News')
@Controller('admin/telegram-news')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
@ApiBearerAuth('bearer')
export class TelegramNewsController {
  constructor(private readonly news: TelegramNewsService) {}

  @Get()
  @ApiOperation({ summary: 'Yangiliklar va yuborish holati' })
  list() {
    return this.news.list();
  }

  @Get(':key/slides/:index')
  @ApiOperation({ summary: 'Slayd rasmi (PNG)' })
  async slide(
    @Param('key') key: string,
    @Param('index', ParseIntPipe) index: number,
    @Res() res: Response,
  ) {
    const png = await this.news.previewPng(key, index);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(png);
  }

  @Post(':key/test')
  @ApiOperation({ summary: 'Bitta chatga (oʻziga) test yuborish' })
  test(
    @Param('key') key: string,
    @Body() dto: TelegramNewsTestDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.news.sendTest(key, dto.chatRowId, req.user.id);
  }

  @Post(':key/broadcast')
  @ApiOperation({
    summary: 'Hammaga yuborish (har bir chatga faqat bir marta)',
  })
  broadcast(@Param('key') key: string, @Req() req: { user: { id: string } }) {
    return this.news.startBroadcast(key, req.user.id);
  }
}
