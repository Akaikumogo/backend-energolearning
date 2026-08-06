import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
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
import { diskStorage, memoryStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { EnergoIdAuthClient } from '../auth/energo-id-auth.client';
import { resolveStoredAvatarUrl } from '../common/avatar-url.util';

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

const documentFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const name = file.originalname?.toLowerCase() ?? '';
  const okExt = /\.(pdf|docx|doc)$/i.test(name);
  const okMime =
    file.mimetype === 'application/pdf' ||
    file.mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.mimetype === 'application/msword' ||
    file.mimetype === 'application/octet-stream';
  if (!okExt && !okMime) {
    cb(
      new BadRequestException(
        'Faqat PDF yoki Word (.pdf, .docx, .doc) fayllar qabul qilinadi',
      ),
      false,
    );
    return;
  }
  cb(null, true);
};

const avatarMemoryStorage = memoryStorage();

function parseHasFace(body: {
  hasFace?: string | boolean;
  faceConfidence?: string | number;
}): boolean {
  return (
    body?.hasFace === true ||
    body?.hasFace === 'true' ||
    body?.hasFace === '1'
  );
}

@ApiTags('Upload')
@Controller()
export class UploadController {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly energoIdClient: EnergoIdAuthClient,
  ) {}

  private saveLocalAvatar(file: Express.Multer.File): string {
    const dir = 'uploads/avatars';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = (extname(file.originalname) || '.jpg').toLowerCase();
    const filename = `${unique}${ext}`;
    fs.writeFileSync(join(dir, filename), file.buffer);
    return `/uploads/avatars/${filename}`;
  }

  /**
   * Energo ID bog‘langan user: rasm Energo ga yuboriladi, EL faqat imageId saqlaydi.
   * Guest (energoId yo‘q): eski lokal `/uploads/avatars/...` saqlanadi.
   */
  private async persistAvatar(
    userId: string,
    file: Express.Multer.File,
    opts?: { requireFace?: boolean; hasFace?: boolean },
  ): Promise<{
    avatarUrl: string;
    imageId: string | null;
    energoIdSynced: boolean;
  }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    if (opts?.requireFace && !opts.hasFace) {
      throw new BadRequestException(
        'Rasmda yuz aniqlanmadi. Iltimos, yuzingiz aniq ko‘rinadigan boshqa rasm yuklang.',
      );
    }

    if (user.energoId) {
      const uploaded = await this.energoIdClient.uploadUserAvatar(
        user.energoId,
        file,
      );
      await this.usersRepo.update(userId, {
        // Faqat Energo image ID — binary EL diskida saqlanmaydi.
        avatarUrl: uploaded.imageId,
        ...(opts?.hasFace ? { avatarHasFace: true } : {}),
      });
      return {
        imageId: uploaded.imageId,
        avatarUrl: resolveStoredAvatarUrl(uploaded.imageId) ?? uploaded.avatarUrl,
        energoIdSynced: true,
      };
    }

    const localPath = this.saveLocalAvatar(file);
    await this.usersRepo.update(userId, {
      avatarUrl: localPath,
      ...(opts?.hasFace ? { avatarHasFace: true } : {}),
    });
    return {
      imageId: null,
      avatarUrl: localPath,
      energoIdSynced: false,
    };
  }

  // ─── Avatar uploads (foydalanuvchi va admin) ────────────────────────────
  @Post('users/me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: avatarMemoryStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiOperation({
    summary: "O'z avatarini yuklash",
    description:
      "Login qilgan user o'z profiliga rasm qo'yadi. Max: 5MB. Formatlar: jpg, png, gif, webp. Energo ID bog‘langanda rasm Energo da saqlanadi, EL faqat imageId saqlaydi.",
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
    description: 'Avatar URL va (Energo bo‘lsa) imageId qaytaradi',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        avatarUrl: {
          type: 'string',
          example: 'https://cabinetid-api.uzbekistonmet.uz/images/uuid',
        },
        imageId: {
          type: 'string',
          nullable: true,
          example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Token yaroqsiz' })
  async uploadMyAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: { id: string } },
    @Body() body: { hasFace?: string | boolean; faceConfidence?: string | number },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Fayl yuklanmadi');

    const hasFace = parseHasFace(body);
    const result = await this.persistAvatar(req.user.id, file, {
      requireFace: true,
      hasFace,
    });

    return {
      success: true,
      avatarUrl: result.avatarUrl,
      imageId: result.imageId,
      hasFace: true,
      energoIdSynced: result.energoIdSynced,
    };
  }

  @Post('users/:userId/avatar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiBearerAuth('bearer')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: avatarMemoryStorage,
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
    @Body() body: { hasFace?: string | boolean; faceConfidence?: string | number },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Fayl yuklanmadi');

    const hasFace = parseHasFace(body);
    const result = await this.persistAvatar(userId, file, { hasFace });

    return {
      success: true,
      avatarUrl: result.avatarUrl,
      imageId: result.imageId,
      userId,
      hasFace: !!hasFace,
      energoIdSynced: result.energoIdSynced,
    };
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

  // ─── Document upload (PDF / Word) ───────────────────────────────────────
  @Post('admin/upload/document')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiBearerAuth('bearer')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: makeDiskStorage('documents'),
      fileFilter: documentFileFilter,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  @ApiOperation({
    summary: 'Kutubxona hujjati yuklash (PDF / Word)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadDocument(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');
    const name = file.originalname?.toLowerCase() ?? '';
    let fileKind: 'PDF' | 'DOCX' | 'DOC' = 'PDF';
    if (name.endsWith('.docx')) fileKind = 'DOCX';
    else if (name.endsWith('.doc')) fileKind = 'DOC';
    else if (name.endsWith('.pdf')) fileKind = 'PDF';
    else if (file.mimetype.includes('wordprocessingml')) fileKind = 'DOCX';
    else if (file.mimetype === 'application/msword') fileKind = 'DOC';

    return {
      success: true,
      url: `/uploads/documents/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
      fileKind,
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
      storage: avatarMemoryStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  @ApiOperation({
    summary: 'Rasm fayl yuklash (admin)',
    description:
      "Audiokitob muqovasi, kontent rasmlari uchun. Rasm Energo ID ga yuboriladi; javobda imageId va public URL qaytadi. Maks: 10MB.",
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
    if (!file?.buffer?.length) throw new BadRequestException('Fayl yuklanmadi');

    const uploaded = await this.energoIdClient.uploadImage(file);
    return {
      success: true,
      // Clientlar va coverUrl maydonlari URL kutadi — Energo public URL.
      url: uploaded.imageUrl,
      imageId: uploaded.imageId,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }
}
