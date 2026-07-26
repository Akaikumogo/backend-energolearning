import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserProfileDto } from '../users/dto/user-profile.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { Role } from '../common/enums/role.enum';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { User } from '../database/entities/user.entity';
import { EmployeeCertificate } from '../database/entities/employee-certificate.entity';
import { EmployeeCheck } from '../database/entities/employee-check.entity';
import { EmployeeCheckType } from '../common/enums/employee-check-type.enum';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginSuccessResponseDto } from './dto/login-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UserActivityService } from '../user-activity/user-activity.service';
import { EnergoIdAuthClient } from './energo-id-auth.client';
import { OAuthPendingService } from './oauth-pending.service';
import { createPkcePair } from './pkce.util';
import { OAuthIntegrationSettingsService } from '../oauth-integration/oauth-integration-settings.service';
import { resolveOAuthClientType } from './oauth-client-type.util';
import {
  isAllowedOAuthRedirectUri,
  resolveOAuthRedirectUri,
} from './oauth-redirect.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => UserActivityService))
    private readonly userActivityService: UserActivityService,
    private readonly energoIdAuthClient: EnergoIdAuthClient,
    private readonly oauthPendingService: OAuthPendingService,
    private readonly oauthIntegrationSettings: OAuthIntegrationSettingsService,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
    @InjectRepository(EmployeeCertificate)
    private readonly employeeCertRepo: Repository<EmployeeCertificate>,
    @InjectRepository(EmployeeCheck)
    private readonly employeeCheckRepo: Repository<EmployeeCheck>,
  ) {}

  /** Mobile — faqat OAuth orqali; legacy login/password o‘chirilgan. */
  async login(dto: LoginDto): Promise<LoginSuccessResponseDto> {
    if (this.energoIdAuthClient.isConfigured()) {
      throw new BadRequestException(
        'Mobil ilova uchun /auth/energo-id/authorize-url va /auth/energo-id/exchange ishlating',
      );
    }
    return this.loginWithLocalPassword(dto);
  }

  async getEnergoIdAuthorizeUrl(
    client: 'mobile' | 'web' = 'mobile',
    requestOrigin?: string,
  ) {
    if (!this.energoIdAuthClient.isConfigured()) {
      throw new BadRequestException('Energo ID sozlanmagan');
    }
    const normalizedClient = client === 'web' ? 'web' : 'mobile';
    const oauthConfig = await this.energoIdAuthClient.fetchOAuthClientConfig(
      normalizedClient,
      requestOrigin,
    );
    const redirectUri = resolveOAuthRedirectUri(
      oauthConfig,
      normalizedClient,
      requestOrigin,
    );
    const state = this.energoIdAuthClient.createOAuthState();
    const scopes =
      oauthConfig.scopes?.join(' ') || 'employee.auth profile.read';
    const pkce =
      normalizedClient === 'mobile' ? createPkcePair() : undefined;
    const authorizeUrl = this.energoIdAuthClient.buildAuthorizeUrl(
      redirectUri,
      state,
      scopes,
      normalizedClient,
      pkce
        ? {
            codeChallenge: pkce.codeChallenge,
            codeChallengeMethod: 'S256',
          }
        : undefined,
    );
    this.oauthPendingService.register({
      state,
      redirectUri,
      client: normalizedClient,
      codeVerifier: pkce?.codeVerifier,
    });
    return {
      authorizeUrl,
      redirectUri,
      state,
      codeVerifier: pkce?.codeVerifier,
      client: normalizedClient,
      platform: oauthConfig.platform,
    };
  }

  async loginWithEnergoIdCode(
    code: string,
    redirectUri?: string,
    state?: string,
    client?: 'mobile' | 'web',
    codeVerifier?: string,
  ): Promise<LoginSuccessResponseDto> {
    if (!this.energoIdAuthClient.isConfigured()) {
      throw new BadRequestException('Energo ID sozlanmagan');
    }
    if (!state?.trim()) {
      throw new BadRequestException('OAuth state talab qilinadi');
    }
    const normalizedClient = resolveOAuthClientType(redirectUri, client);
    const oauthConfig = await this.energoIdAuthClient.fetchOAuthClientConfig(
      normalizedClient,
    );
    const effectiveRedirect =
      redirectUri?.trim() || oauthConfig.redirectUri;
    if (!isAllowedOAuthRedirectUri(oauthConfig, effectiveRedirect)) {
      throw new BadRequestException(
        `Redirect URI ruxsat etilmagan: ${effectiveRedirect}`,
      );
    }
    const pending = this.oauthPendingService.consume(
      state.trim(),
      effectiveRedirect,
      normalizedClient,
    );
    const effectiveVerifier =
      codeVerifier?.trim() || pending.codeVerifier?.trim();
    if (normalizedClient === 'mobile' && !effectiveVerifier) {
      throw new BadRequestException('PKCE code_verifier talab qilinadi');
    }
    const energoUser = await this.energoIdAuthClient.exchangeAuthorizationCode(
      code.trim(),
      effectiveRedirect,
      effectiveVerifier,
    );
    const user = await this.usersService.syncFromEnergoIdentity(energoUser);
    return this.issueLoginResponse(user);
  }

  async adminLoginWithEnergoIdCode(
    code: string,
    redirectUri?: string,
    state?: string,
    client?: 'mobile' | 'web',
    codeVerifier?: string,
  ): Promise<LoginSuccessResponseDto> {
    const response = await this.loginWithEnergoIdCode(
      code,
      redirectUri,
      state,
      client,
      codeVerifier,
    );
    const role = response.data.user.role;
    if (role !== Role.SUPERADMIN && role !== Role.MODERATOR) {
      throw new ForbiddenException(
        'Admin panelga faqat moderator yoki superadmin kira oladi',
      );
    }
    return response;
  }

  /** Admin panel — faqat ElektroLearn bazasi, SUPERADMIN va MODERATOR. */
  async adminLogin(dto: LoginDto): Promise<LoginSuccessResponseDto> {
    const user = await this.resolveLocalUser(dto);
    if (user.role !== Role.SUPERADMIN && user.role !== Role.MODERATOR) {
      throw new ForbiddenException(
        'Admin panelga faqat moderator yoki superadmin kira oladi',
      );
    }
    return this.issueLoginResponse(user);
  }

  private async loginWithLocalPassword(
    dto: LoginDto,
  ): Promise<LoginSuccessResponseDto> {
    const user = await this.resolveLocalUser(dto);
    return this.issueLoginResponse(user);
  }

  private async resolveLocalUser(dto: LoginDto): Promise<User> {
    const identifier = (dto.login ?? dto.email ?? '').trim();
    if (!identifier) {
      throw new UnauthorizedException('Login yoki email kiritilmadi');
    }

    let user = await this.usersService.findByEmail(identifier);
    if (!user) {
      user = await this.usersService.findByEmail(identifier.toLowerCase());
    }
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Login yoki parol noto`g`ri');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Login yoki parol noto`g`ri');
    }

    return user;
  }

  private async issueLoginResponse(
    user: User,
  ): Promise<LoginSuccessResponseDto> {
    this.assertLoginAllowed(user);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationIds: this.getOrganizationIds(user),
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.issueRefreshToken(user.id);
    const profile = this.toProfile(user);

    const orgIds = this.getOrganizationIds(user);
    void this.userActivityService
      .startSession({
        userId: user.id,
        organizationId: orgIds[0] ?? null,
      })
      .catch(() => undefined);

    return {
      success: true,
      message: 'Login muvaffaqiyatli',
      data: {
        accessToken,
        refreshToken,
        user: profile,
      },
    };
  }

  /** SUPERADMIN dan tashqari email-login (@) yoki login_blocked — kirish yopiq. */
  private assertLoginAllowed(user: User) {
    if (user.role === Role.SUPERADMIN) return;
    if (user.loginBlocked || user.email.includes('@')) {
      throw new ForbiddenException(
        'Bu akkaunt orqali kirish yopilgan (email-login / ro‘yxatdan o‘tish). Energo ID loginidan foydalaning.',
      );
    }
  }

  async register(_dto: RegisterDto): Promise<LoginSuccessResponseDto> {
    throw new ForbiddenException(
      'Ro‘yxatdan o‘tish yopilgan. Faqat Energo ID orqali kiring.',
    );
  }

  async me(userId: string): Promise<UserProfileDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }

    return this.toProfile(user);
  }

  async getMyEmployeeCertificate(userId: string) {
    return this.employeeCertRepo.findOne({
      where: { userId },
      relations: ['organization'],
    });
  }

  async listMyChecks(userId: string, type?: EmployeeCheckType) {
    const where: any = { userId };
    if (type) where.type = type;
    return this.employeeCheckRepo.find({
      where,
      order: { checkDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async joinOrganization(
    userId: string,
    organizationId: string,
  ): Promise<UserProfileDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }
    if (user.role !== Role.USER) {
      throw new ForbiddenException('Bu amal faqat o`quvchi uchun');
    }
    const existingCount = user.organizations?.length ?? 0;
    if (existingCount > 0) {
      throw new BadRequestException('Tashkilot allaqachon tanlangan');
    }
    await this.organizationsService.assignUser(organizationId, userId);
    const full = await this.usersService.findById(userId);
    if (!full) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }
    return this.toProfile(full);
  }

  private toProfile(user: User): UserProfileDto {
    const organizations = this.getOrganizations(user);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
      organizationIds: this.getOrganizationIds(user),
      organizations,
      mustChangePassword: user.mustChangePassword ?? false,
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const tokenHash = this.hashToken(refreshToken);

    const record = await this.refreshRepo.findOne({
      where: { tokenHash, revokedAt: IsNull() },
      relations: [
        'user',
        'user.organizations',
        'user.organizations.organization',
      ],
    });

    if (!record || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token yaroqsiz');
    }

    const user = record.user;
    this.assertLoginAllowed(user);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationIds: this.getOrganizationIds(user),
    };

    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    const user = await this.usersService.updateProfile(userId, dto);
    return this.toProfile(user);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }

    const currentMatch = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentMatch) {
      throw new BadRequestException('Joriy parol noto`g`ri');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.updatePasswordHash(userId, newHash);
    // Parol o'zgartirildi — endi majburiy o'zgartirish bayrog'i tushiriladi
    await this.usersService.clearMustChangePassword(userId);

    return { success: true, message: 'Parol muvaffaqiyatli yangilandi' };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.refreshRepo.update(
      { tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(raw);
    const days = Number(process.env.REFRESH_TOKEN_DAYS ?? 30);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.refreshRepo.save(
      this.refreshRepo.create({
        user: { id: userId } as User,
        tokenHash,
        expiresAt,
        revokedAt: null,
      }),
    );

    return raw;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private getOrganizationIds(user: User): string[] {
    const orgs = user.organizations ?? [];
    const ids = orgs
      .map((uo) => uo.organization?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return Array.from(new Set(ids));
  }

  private getOrganizations(user: User): { id: string; name: string }[] {
    const orgs = user.organizations ?? [];
    const mapped = orgs
      .map((uo) => {
        const org = uo.organization;
        if (!org?.id || !org?.name) return null;
        return { id: org.id, name: org.name };
      })
      .filter((v): v is { id: string; name: string } => v !== null);

    // uniq by id
    const byId = new Map<string, { id: string; name: string }>();
    for (const item of mapped) byId.set(item.id, item);
    return Array.from(byId.values());
  }
}
