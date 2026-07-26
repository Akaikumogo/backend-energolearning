import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { UserProfileDto } from '../users/dto/user-profile.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginSuccessResponseDto } from './dto/login-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EnergoIdExchangeDto } from './dto/energo-id-oauth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginThrottleGuard } from './guards/login-throttle.guard';
import { JoinOrganizationDto } from './dto/join-organization.dto';
import { EmployeeCheckType } from '../common/enums/employee-check-type.enum';

function clientMetaFromRequest(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]?.split(',')[0]?.trim()
        : undefined;
  const ipAddress =
    forwardedIp ||
    req.ip ||
    req.socket?.remoteAddress ||
    null;
  const userAgent =
    typeof req.headers['user-agent'] === 'string'
      ? req.headers['user-agent']
      : null;
  return { ipAddress, userAgent };
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'YOPIQ — ro‘yxatdan o‘tish o‘chirilgan',
    deprecated: true,
  })
  @ApiBody({ type: RegisterDto })
  @ApiForbiddenResponse({ description: 'Ro‘yxatdan o‘tish yopilgan' })
  register(@Body() body: RegisterDto): Promise<LoginSuccessResponseDto> {
    return this.authService.register(body);
  }

  @Post('login')
  @UseGuards(LoginThrottleGuard)
  @ApiOperation({
    summary: 'Mobile / xodim login (Energo ID OAuth)',
    description:
      'Legacy login o‘chirilgan. Avval /auth/energo-id/authorize-url, keyin /auth/energo-id/exchange.',
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
  login(
    @Body() body: LoginDto,
    @Req() req: Request,
  ): Promise<LoginSuccessResponseDto> {
    return this.authService.login(body, clientMetaFromRequest(req));
  }

  @Get('energo-id/authorize-url')
  @ApiOperation({
    summary: 'Energo ID OAuth authorize URL',
    description:
      'Mobil ilova shu URL ni ochadi. Foydalanuvchi Energo ID da login + ruxsat beradi, keyin code qaytadi.',
  })
  @ApiQuery({
    name: 'client',
    required: false,
    enum: ['mobile', 'web'],
    description: 'redirect_uri tanlash uchun',
  })
  @ApiQuery({
    name: 'callback_origin',
    required: false,
    description: 'Web: joriy domen (masalan https://elektrolearn-mobile.uzbekistonmet.uz)',
  })
  getEnergoIdAuthorizeUrl(
    @Query('client') client?: 'mobile' | 'web',
    @Query('callback_origin') callbackOrigin?: string,
    @Req() req?: Request,
  ) {
    const origin =
      callbackOrigin?.trim() ||
      req?.headers.origin?.trim() ||
      undefined;
    return this.authService.getEnergoIdAuthorizeUrl(client ?? 'mobile', origin);
  }

  @Post('energo-id/exchange')
  @ApiOperation({
    summary: 'OAuth code ni ElektroLearn tokeniga almashtirish',
    description:
      'Bir martalik `code` ni Energo ID ga yuborib, ElektroLearn access/refresh token oladi.',
  })
  @ApiBody({ type: EnergoIdExchangeDto })
  @ApiOkResponse({ type: LoginSuccessResponseDto })
  exchangeEnergoIdCode(
    @Body() body: EnergoIdExchangeDto,
    @Req() req: Request,
  ): Promise<LoginSuccessResponseDto> {
    const code = (body.onetime ?? body.code)?.trim();
    if (!code) {
      throw new BadRequestException('OAuth code topilmadi');
    }
    return this.authService.loginWithEnergoIdCode(
      code,
      body.redirect_uri,
      body.state,
      body.client,
      body.code_verifier,
      clientMetaFromRequest(req),
    );
  }

  @Post('admin/login')
  @UseGuards(LoginThrottleGuard)
  @ApiOperation({
    summary: 'Admin panel login (ElektroLearn local)',
    description:
      'Faqat ElektroLearn bazasidagi SUPERADMIN va MODERATOR. Energo ID ishlatilmaydi.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Muvaffaqiyatli login javobi',
    type: LoginSuccessResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Noto`g`ri email yoki parol',
    type: ApiErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Rol admin panel uchun ruxsat etilmagan',
    type: ApiErrorResponseDto,
  })
  adminLogin(
    @Body() body: LoginDto,
    @Req() req: Request,
  ): Promise<LoginSuccessResponseDto> {
    return this.authService.adminLogin(body, clientMetaFromRequest(req));
  }

  @Post('admin/energo-id/exchange')
  @ApiOperation({
    summary: 'Admin panel — Energo ID OAuth code almashtirish',
    description:
      'OAuth code ni token ga almashtiradi. Faqat SUPERADMIN va MODERATOR kirishi mumkin.',
  })
  @ApiBody({ type: EnergoIdExchangeDto })
  @ApiOkResponse({ type: LoginSuccessResponseDto })
  @ApiForbiddenResponse({
    description: 'Rol admin panel uchun ruxsat etilmagan',
    type: ApiErrorResponseDto,
  })
  exchangeAdminEnergoIdCode(
    @Body() body: EnergoIdExchangeDto,
    @Req() req: Request,
  ): Promise<LoginSuccessResponseDto> {
    const code = (body.onetime ?? body.code)?.trim();
    if (!code) {
      throw new BadRequestException('OAuth code topilmadi');
    }
    return this.authService.adminLoginWithEnergoIdCode(
      code,
      body.redirect_uri,
      body.state,
      body.client,
      body.code_verifier,
      clientMetaFromRequest(req),
    );
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

  @Get('me/employee-certificate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Xodim guvohnomasi (USER self)' })
  getMyEmployeeCertificate(@Req() req: Request & { user: { id: string } }) {
    return this.authService.getMyEmployeeCertificate(req.user.id);
  }

  @Get('me/checks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Tekshiruvlar ro`yxati (USER self)' })
  @ApiQuery({ name: 'type', required: false, enum: EmployeeCheckType })
  listMyChecks(
    @Req() req: Request & { user: { id: string } },
    @Query('type') type?: EmployeeCheckType,
  ) {
    return this.authService.listMyChecks(req.user.id, type);
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
