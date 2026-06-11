import {
  BadRequestException,
  Controller,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';

function makeDiskStorage(folder: string) {
  return diskStorage({
    destination: (_req, _file, cb) => {
      const dir = `uploads/${folder}`;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = (extname(file.originalname) || '').toLowerCase();
      cb(null, `${unique}${ext}`);
    },
  });
}

const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!file.mimetype.match(/^image\/(jpg|jpeg|png|gif|webp|svg\+xml)$/)) {
    cb(
      new BadRequestException(
        'Faqat rasm fayllari qabul qilinadi (jpg, png, gif, webp, svg)',
      ),
      false,
    );
    return;
  }
  cb(null, true);
};

const audioFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const isAudio =
    file.mimetype.startsWith('audio/') ||
    /\.(mp3|m4a|aac|ogg|oga|wav|webm|opus|flac)$/i.test(file.originalname);
  if (!isAudio) {
    cb(
      new BadRequestException(
        'Faqat audio fayllar qabul qilinadi (mp3, m4a, aac, ogg, wav, opus, flac)',
      ),
      false,
    );
    return;
  }
  cb(null, true);
};

const videoFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const isVideo =
    file.mimetype.startsWith('video/') ||
    /\.(mp4|m4v|mov|webm|mkv|3gp)$/i.test(file.originalname);
  if (!isVideo) {
    cb(
      new BadRequestException(
        'Faqat video fayllar qabul qilinadi (mp4, mov, webm, mkv, 3gp)',
      ),
      false,
    );
    return;
  }
  cb(null, true);
};

const avatarStorage = makeDiskStorage('avatars');

@ApiTags('Upload')
@Controller()
export class UploadController {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  // ─── Avatar uploads (foydalanuvchi va admin) ────────────────────────────
  @Post('users/me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: avatarStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiOperation({
    summary: "O'z avatarini yuklash",
    description:
      "Login qilgan user o'z profiliga rasm qo'yadi. Max: 5MB. Formatlar: jpg, png, gif, webp.",
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Rasm fayli' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Avatar URL qaytaradi',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        avatarUrl: {
          type: 'string',
          example: '/uploads/avatars/1234567890.png',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Token yaroqsiz' })
  async uploadMyAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: { id: string } },
  ) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');

    const avatarUrl = `/uploads/avatars/${file.filename}`;
    await this.usersRepo.update(req.user.id, { avatarUrl });

    return { success: true, avatarUrl };
  }

  @Post('users/:userId/avatar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiBearerAuth('bearer')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: avatarStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiOperation({
    summary: "Istalgan userni avatarini o'rnatish (Admin/Moderator)",
  })
  @ApiParam({ name: 'userId', description: 'Avatar biriktiriladigan user UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Rasm fayli' },
      },
    },
  })
  async uploadUserAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Param('userId') userId: string,
  ) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');

    const avatarUrl = `/uploads/avatars/${file.filename}`;
    await this.usersRepo.update(userId, { avatarUrl });

    return { success: true, avatarUrl, userId };
  }

  // ─── Audio upload (admin/moderator) ─────────────────────────────────────
  @Post('admin/upload/audio')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiBearerAuth('bearer')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: makeDiskStorage('audio'),
      fileFilter: audioFileFilter,
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    }),
  )
  @ApiOperation({
    summary: 'Audio fayl yuklash (admin)',
    description:
      "Audiokitob paragraflari uchun .mp3/.m4a/.ogg/.wav va shu kabi audio fayllar. Maks: 100MB.",
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Audio fayl' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Audio URL qaytaradi',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        url: { type: 'string', example: '/uploads/audio/1234567890.mp3' },
        size: { type: 'number', example: 524288 },
        mimeType: { type: 'string', example: 'audio/mpeg' },
        originalName: { type: 'string', example: 'paragraf-1.mp3' },
      },
    },
  })
  async uploadAudio(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');
    return {
      success: true,
      url: `/uploads/audio/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }

  // ─── Video upload (admin/moderator) ─────────────────────────────────────
  @Post('admin/upload/video')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiBearerAuth('bearer')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: makeDiskStorage('video'),
      fileFilter: videoFileFilter,
      limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    }),
  )
  @ApiOperation({
    summary: 'Video fayl yuklash (admin)',
    description:
      "Video kontent uchun .mp4/.mov/.webm va shu kabi formatlar. Maks: 500MB.",
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Video fayl' },
      },
    },
  })
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');
    return {
      success: true,
      url: `/uploads/video/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }

  // ─── Image upload (admin/moderator) ─────────────────────────────────────
  @Post('admin/upload/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiBearerAuth('bearer')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: makeDiskStorage('image'),
      fileFilter: imageFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  @ApiOperation({
    summary: 'Rasm fayl yuklash (admin)',
    description:
      "Audiokitob muqovasi, kontent rasmlari uchun. Formatlar: jpg/png/gif/webp/svg. Maks: 10MB.",
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Rasm fayl' },
      },
    },
  })
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');
    return {
      success: true,
      url: `/uploads/image/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }
}
