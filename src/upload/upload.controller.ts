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

const avatarStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = 'uploads/avatars';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
    cb(new BadRequestException('Faqat rasm fayllari qabul qilinadi (jpg, png, gif, webp)'), false);
    return;
  }
  cb(null, true);
};

@ApiTags('Upload')
@Controller('users')
export class UploadController {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: avatarStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  @ApiOperation({
    summary: 'O\'z avatarini yuklash',
    description: 'Login qilgan user o\'z profiliga rasm qo\'yadi. Max: 5MB. Formatlar: jpg, png, gif, webp.',
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
        avatarUrl: { type: 'string', example: '/uploads/avatars/1234567890.png' },
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

  @Post(':userId/avatar')
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
    summary: 'Istalgan userni avatarini o\'rnatish (Admin/Moderator)',
    description:
      'SUPERADMIN yoki MODERATOR boshqa userga avatar biriktiradi. Masalan: user yaratishda.',
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
  @ApiOkResponse({
    description: 'Avatar URL qaytaradi',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        avatarUrl: { type: 'string', example: '/uploads/avatars/1234567890.png' },
        userId: { type: 'string', example: 'uuid-...' },
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
}
