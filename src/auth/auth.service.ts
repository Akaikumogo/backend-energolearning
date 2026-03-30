import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserProfileDto } from '../users/dto/user-profile.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { UsersService } from '../users/users.service';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { User } from '../database/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginSuccessResponseDto } from './dto/login-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
  ) {}

  async login(dto: LoginDto): Promise<LoginSuccessResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Email yoki parol noto`g`ri');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Email yoki parol noto`g`ri');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationIds: this.getOrganizationIds(user),
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.issueRefreshToken(user.id);
    const profile = this.toProfile(user);

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

  async register(dto: RegisterDto): Promise<LoginSuccessResponseDto> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('Bu email allaqachon ro`yxatdan o`tgan');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      organizationId: dto.organizationId,
    });

    const fullUser = await this.usersService.findById(user.id);
    if (!fullUser) throw new BadRequestException('Foydalanuvchi yaratilmadi');

    const payload: JwtPayload = {
      sub: fullUser.id,
      email: fullUser.email,
      role: fullUser.role,
      organizationIds: this.getOrganizationIds(fullUser),
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.issueRefreshToken(fullUser.id);

    return {
      success: true,
      message: 'Ro`yxatdan o`tish muvaffaqiyatli',
      data: { accessToken, refreshToken, user: this.toProfile(fullUser) },
    };
  }

  async me(userId: string): Promise<UserProfileDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }

    return this.toProfile(user);
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

  private getOrganizations(
    user: User,
  ): { id: string; name: string }[] {
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
