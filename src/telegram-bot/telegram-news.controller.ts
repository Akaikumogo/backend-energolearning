import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { MAX_NEWS_IMAGES, TelegramNewsService } from './telegram-news.service';
import type { TelegramNewsPostInput } from './telegram-news.service';

class TelegramNewsSendDto {
  @IsUUID()
  chatRowId: string;
}

const imagesUpload = FilesInterceptor('images', MAX_NEWS_IMAGES, {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!/^image\/(jpe?g|png|webp|gif|heic|heif)$/i.test(file.mimetype)) {
      cb(new BadRequestException('Faqat rasm fayllari (jpg, png, webp)'), false);
      return;
    }
    cb(null, true);
  },
});

@ApiTags('Admin Telegram News')
@Controller('admin/telegram-news')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
@ApiBearerAuth('bearer')
export class TelegramNewsController {
  constructor(private readonly news: TelegramNewsService) {}

  @Get()
  @ApiOperation({ summary: 'Barcha newslar (tizim + custom) va yuborish holati' })
  list() {
    return this.news.list();
  }

  @Get(':key/slides/:index')
  @ApiOperation({ summary: 'Tizim newsi slayd rasmi (PNG)' })
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

  @Post('posts')
  @UseInterceptors(imagesUpload)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Yangi news (rasmlar + matn)' })
  create(
    @Body() body: TelegramNewsPostInput,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: { user: { id: string } },
  ) {
    return this.news.createPost(body, files ?? [], req.user.id);
  }

  @Put('posts/:id')
  @UseInterceptors(imagesUpload)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Newsni tahrirlash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TelegramNewsPostInput,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: { user: { id: string } },
  ) {
    return this.news.updatePost(id, body, files ?? [], req.user.id);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: 'Newsni o‘chirish' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.news.deletePost(id);
  }

  @Post(':key/send')
  @ApiOperation({ summary: 'Bitta chatga yuborish (o‘ziga test yoki biror odamga)' })
  send(
    @Param('key') key: string,
    @Body() dto: TelegramNewsSendDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.news.sendToChat(key, dto.chatRowId, req.user.id);
  }

  @Post(':key/broadcast')
  @ApiOperation({ summary: 'Hammaga yuborish (har bir chatga faqat bir marta)' })
  broadcast(@Param('key') key: string, @Req() req: { user: { id: string } }) {
    return this.news.startBroadcast(key, req.user.id);
  }
}
