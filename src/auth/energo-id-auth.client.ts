import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

export type EnergoIdUser = {
  energoUserId: string;
  login: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
  organization: {
    externalId: string | null;
    name: string;
  } | null;
  mustChangePassword: boolean;
  status: string;
  personnelNumber?: string | null;
  division?: string;
  post?: string;
  lastSyncedAt?: string | null;
  initialPassword?: string | null;
};

type EnergoIdEmployeesResponse = {
  success: boolean;
  sync?: {
    dailySyncTime?: string;
    timezone?: string;
  };
  data: EnergoIdUser[];
};

type EnergoIdBranch = {
  id: string;
  name: string;
  code?: string | null;
  externalId?: string | null;
};

type EnergoIdPlatformSyncResponse = {
  success: boolean;
  data?: {
    branches?: EnergoIdBranch[];
  };
};

type EnergoIdTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

type EnergoIdUserInfo = {
  sub: string;
  energoUserId?: string;
  login: string;
  email: string | null;
  firstName: string;
  lastName: string;
  middleName?: string;
  role: string;
  permissions: string[];
  organization: {
    externalId: string | null;
    name: string;
  } | null;
  status: string;
};

@Injectable()
export class EnergoIdAuthClient {
  isConfigured() {
    return !!process.env.ENERGO_ID_BASE_URL?.trim();
  }

  getDefaultRedirectUri(client: 'mobile' | 'web' = 'mobile') {
    if (client === 'web') {
      return (
        process.env.ENERGO_ID_OAUTH_REDIRECT_URI_WEB?.trim() ||
        'http://localhost:5173/oauth/callback'
      );
    }
    return (
      process.env.ENERGO_ID_OAUTH_REDIRECT_URI_MOBILE?.trim() ||
      'uz.elektroxavfsizlik.app://oauth/callback'
    );
  }

  buildAuthorizeUrl(redirectUri: string, state: string) {
    const config = this.getConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: 'employee.auth profile.read',
    });
    return `${config.baseUrl}/oauth/authorize?${params.toString()}`;
  }

  createOAuthState() {
    return createHash('sha256')
      .update(randomBytes(32))
      .digest('base64url');
  }

  async exchangeAuthorizationCode(
    code: string,
    redirectUri: string,
  ): Promise<EnergoIdUser> {
    const config = this.getConfig();
    const tokenResponse = await this.request(
      `${config.baseUrl}/oauth/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: redirectUri,
        }),
      },
      config.timeoutMs,
    );

    if (!tokenResponse.ok) {
      this.throwMappedError(tokenResponse.status);
    }

    const tokenPayload = (await tokenResponse.json()) as EnergoIdTokenResponse;
    if (!tokenPayload.access_token) {
      throw new BadRequestException('Energo ID token javobi noto`g`ri');
    }

    const userInfoResponse = await this.request(
      `${config.baseUrl}/oauth/userinfo`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenPayload.access_token}`,
        },
      },
      config.timeoutMs,
    );

    if (!userInfoResponse.ok) {
      this.throwMappedError(userInfoResponse.status);
    }

    const userInfo = (await userInfoResponse.json()) as EnergoIdUserInfo;
    return this.normalizeUserInfo(userInfo);
  }

  async listEmployees(): Promise<{
    employees: EnergoIdUser[];
    sync: { dailySyncTime: string; timezone: string };
  }> {
    const config = this.getConfig();
    const response = await this.request(
      `${config.baseUrl}/internal/v1/employees`,
      {
        method: 'GET',
        headers: config.headers,
      },
      config.timeoutMs,
    );

    if (!response.ok) {
      this.throwMappedError(response.status);
    }

    const payload = (await response.json()) as EnergoIdEmployeesResponse;
    if (!payload.success || !Array.isArray(payload.data)) {
      throw new ServiceUnavailableException(
        'Energo ID employee javobi noto`g`ri',
      );
    }
    return {
      employees: payload.data.map((row) => this.normalizeEmployee(row)),
      sync: {
        dailySyncTime: payload.sync?.dailySyncTime ?? '23:45',
        timezone: payload.sync?.timezone ?? 'Asia/Tashkent',
      },
    };
  }

  private normalizeUserInfo(row: EnergoIdUserInfo): EnergoIdUser {
    const energoUserId = (row.energoUserId ?? row.sub ?? '').trim();
    const login = (row.login ?? row.email ?? '').trim();
    if (!energoUserId || !login) {
      throw new ServiceUnavailableException('Energo ID userinfo noto`g`ri');
    }
    return {
      energoUserId,
      login,
      email: row.email ?? null,
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      role: row.role ?? 'USER',
      permissions: row.permissions ?? [],
      organization: row.organization ?? null,
      mustChangePassword: false,
      status: row.status ?? 'ACTIVE',
    };
  }

  private normalizeEmployee(
    row: EnergoIdUser & { id?: string },
  ): EnergoIdUser {
    const energoUserId = (row.energoUserId ?? row.id ?? '').trim();
    const login = (row.login ?? row.email ?? '').trim();
    return {
      ...row,
      energoUserId,
      login,
      email: row.email ?? null,
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      role: row.role ?? 'USER',
      permissions: row.permissions ?? [],
      mustChangePassword: row.mustChangePassword ?? false,
      status: row.status ?? 'ACTIVE',
      initialPassword:
        (row as EnergoIdUser & { initialPassword?: string | null })
          .initialPassword ?? null,
    };
  }

  async listBranches(): Promise<EnergoIdBranch[]> {
    const config = this.getConfig();
    const response = await this.request(
      `${config.baseUrl}/internal/v1/platform-sync`,
      {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({ resources: ['branches'] }),
      },
      config.timeoutMs,
    );

    if (!response.ok) {
      this.throwMappedError(response.status);
    }

    const payload = (await response.json()) as EnergoIdPlatformSyncResponse;
    if (!payload.success || !Array.isArray(payload.data?.branches)) {
      throw new ServiceUnavailableException(
        'Energo ID branches javobi noto`g`ri',
      );
    }
    return payload.data.branches;
  }

  private getConfig() {
    const baseUrl = process.env.ENERGO_ID_BASE_URL?.replace(/\/+$/, '');
    if (!baseUrl) {
      throw new ServiceUnavailableException('Energo ID sozlanmagan');
    }

    const platform = process.env.ENERGO_ID_PLATFORM ?? 'elektrolearn';
    const clientId = process.env.ENERGO_ID_CLIENT_ID ?? 'elektrolearn_backend';
    const clientSecret = process.env.ENERGO_ID_CLIENT_SECRET;
    if (!clientSecret) {
      throw new ServiceUnavailableException(
        'Energo ID client secret sozlanmagan',
      );
    }

    const timeoutMs = Number(process.env.ENERGO_ID_TIMEOUT_MS ?? 5000);
    return {
      baseUrl,
      platform,
      clientId,
      clientSecret,
      timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'X-Platform': platform,
        'X-Client-Id': clientId,
        Authorization: `Bearer ${clientSecret}`,
      },
    };
  }

  private async request(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException ||
        error instanceof HttpException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException('Auth service unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private throwMappedError(status: number): never {
    if (status === 401) {
      throw new UnauthorizedException('Avtorizatsiya rad etildi');
    }
    if (status === 403) {
      throw new ForbiddenException('Platformaga kirish rad etildi');
    }
    if (status === 429) {
      throw new HttpException(
        'Login urinishlari juda ko`p',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    throw new ServiceUnavailableException('Auth service unavailable');
  }
}
