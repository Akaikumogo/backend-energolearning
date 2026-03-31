import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { UserProfileDto } from '../users/dto/user-profile.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginSuccessResponseDto } from './dto/login-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JoinOrganizationDto } from './dto/join-organization.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Yangi foydalanuvchi ro`yxatdan o`tishi' })
  @ApiBody({ type: RegisterDto })
  @ApiOkResponse({ description: 'Muvaffaqiyatli ro`yxatdan o`tish', type: LoginSuccessResponseDto })
  @ApiBadRequestResponse({ description: 'Email allaqachon mavjud', type: ApiErrorResponseDto })
  register(@Body() body: RegisterDto): Promise<LoginSuccessResponseDto> {
    return this.authService.register(body);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Email + parol orqali login',
    description:
      'JWT access token qaytaradi. Superadmin default login: elektroLearn@admin.com / !Qw3rty',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Muvaffaqiyatli login javobi',
    type: LoginSuccessResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Noto`g`ri login yoki parol',
    type: ApiErrorResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Noto`g`ri body format',
    type: ApiErrorResponseDto,
  })
  login(@Body() body: LoginDto): Promise<LoginSuccessResponseDto> {
    return this.authService.login(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Joriy foydalanuvchi profili',
    description: 'Bearer token bo`yicha profile qaytaradi.',
  })
  @ApiHeader({
    name: 'x-organization-id',
    required: false,
    description:
      'Ko`p tashkilotli userlar uchun active org konteksti. MVPda ixtiyoriy.',
  })
  @ApiOkResponse({
    description: 'Foydalanuvchi profili',
    type: UserProfileDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Token yaroqsiz yoki yo`q',
    type: ApiErrorResponseDto,
  })
  me(@Req() req: Request & { user: { id: string } }): Promise<UserProfileDto> {
    return this.authService.me(req.user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Profil ma`lumotlarini yangilash',
    description: 'Ism va/yoki familiyani yangilash.',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({
    description: 'Yangilangan profil',
    type: UserProfileDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Token yaroqsiz',
    type: ApiErrorResponseDto,
  })
  updateProfile(
    @Req() req: Request & { user: { id: string } },
    @Body() body: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    return this.authService.updateProfile(req.user.id, body);
  }

  @Post('me/organization')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Tashkilotga biriktirish (o`quvchi)',
    description:
      'Faqat USER roli va hali tashkilotga biriktirilmagan foydalanuvchilar uchun.',
  })
  @ApiBody({ type: JoinOrganizationDto })
  @ApiOkResponse({ description: 'Yangilangan profil', type: UserProfileDto })
  @ApiBadRequestResponse({
    description: 'Allaqachon tashkilot bor',
    type: ApiErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Rol mos emas',
    type: ApiErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Token yaroqsiz',
    type: ApiErrorResponseDto,
  })
  joinOrganization(
    @Req() req: Request & { user: { id: string } },
    @Body() body: JoinOrganizationDto,
  ): Promise<UserProfileDto> {
    return this.authService.joinOrganization(req.user.id, body.organizationId);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Parolni o`zgartirish',
    description: 'Joriy parolni tekshirib, yangi parolga almashtiradi.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ description: 'Parol muvaffaqiyatli yangilandi' })
  @ApiBadRequestResponse({
    description: 'Joriy parol noto`g`ri',
    type: ApiErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Token yaroqsiz',
    type: ApiErrorResponseDto,
  })
  changePassword(
    @Req() req: Request & { user: { id: string } },
    @Body() body: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.id, body);
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh token orqali yangi access token olish',
    description:
      'Body orqali refreshToken yuboriladi. Backend DBda refresh token hashni tekshiradi.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ description: 'Yangi access token' })
  @ApiUnauthorizedResponse({
    description: 'Refresh token yaroqsiz',
    type: ApiErrorResponseDto,
  })
  refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Logout (refresh token revoke)',
    description:
      'Refresh token DBda revoked bo`ladi. Access token o`zi expire bo`ladi.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ description: 'Logout muvaffaqiyatli' })
  logout(@Body() body: RefreshTokenDto) {
    return this.authService.logout(body.refreshToken).then(() => ({
      success: true,
      message: 'Logout muvaffaqiyatli',
    }));
  }
}
