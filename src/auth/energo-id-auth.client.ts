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
import { readFile } from 'fs/promises';
import { resolveEnergoIdBaseUrl } from './energo-id-env.util';

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
  avatarUrl?: string | null;
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

type EnergoIdDepartment = {
  name: string;
  employeeCount?: number;
};

type EnergoIdPosition = {
  name: string;
  employeeCount?: number;
};

type EnergoIdPlatformSyncResponse = {
  success: boolean;
  data?: {
    branches?: EnergoIdBranch[];
    departments?: EnergoIdDepartment[];
    positions?: EnergoIdPosition[];
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

type EnergoIdOAuthClientConfig = {
  clientId: string;
  clientType: 'web' | 'mobile';
  platform: { code: string; name: string };
  redirectUri: string;
  routes: { web?: string; webUrls?: string[]; mobile?: string };
  allowedRedirectUrls?: string[];
  scopes: string[];
};

@Injectable()
export class EnergoIdAuthClient {
  isConfigured() {
    return !!resolveEnergoIdBaseUrl();
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

  buildAuthorizeUrl(
    redirectUri: string,
    state: string,
    scope?: string,
    clientType: 'mobile' | 'web' = 'mobile',
    pkce?: { codeChallenge: string; codeChallengeMethod?: string },
  ) {
    const config = this.getConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: scope?.trim() || 'employee.auth profile.read',
      client_type: clientType,
    });
    if (pkce?.codeChallenge) {
      params.set('code_challenge', pkce.codeChallenge);
      params.set('code_challenge_method', pkce.codeChallengeMethod ?? 'S256');
    }
    return `${config.baseUrl}/oauth/authorize?${params.toString()}`;
  }

  async fetchOAuthClientConfig(
    clientType: 'mobile' | 'web' = 'mobile',
    callbackOrigin?: string,
  ): Promise<EnergoIdOAuthClientConfig> {
    const config = this.getConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_type: clientType,
    });
    if (callbackOrigin?.trim()) {
      params.set('callback_origin', callbackOrigin.trim());
    }
    const response = await this.request(
      `${config.baseUrl}/oauth/client-config?${params.toString()}`,
      { method: 'GET' },
      config.timeoutMs,
    );
    if (!response.ok) {
      await this.throwMappedError(response);
    }
    return (await response.json()) as EnergoIdOAuthClientConfig;
  }

  async checkHealth(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const config = this.getConfig();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const healthResponse = await fetch(`${config.baseUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        if (healthResponse.ok) {
          const payload = (await healthResponse.json()) as {
            service?: string;
          };
          if (payload.service === 'energo-id-portal-api') {
            return true;
          }
        }

        const response = await fetch(`${config.baseUrl}/oauth/authorize`, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'manual',
        });
        return response.status < 500;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return false;
    }
  }

  createOAuthState() {
    return createHash('sha256')
      .update(randomBytes(32))
      .digest('base64url');
  }

  async exchangeAuthorizationCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<EnergoIdUser> {
    const config = this.getConfig();
    const tokenResponse = await this.request(
      `${config.baseUrl}/oauth/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          onetime: code,
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: redirectUri,
          ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
        }),
      },
      config.timeoutMs,
    );

    if (!tokenResponse.ok) {
      await this.throwMappedError(tokenResponse);
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
      await this.throwMappedError(userInfoResponse);
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
      await this.throwMappedError(response);
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
    row: EnergoIdUser & {
      id?: string;
      personnel_number?: string | null;
    },
  ): EnergoIdUser {
    const energoUserId = (row.energoUserId ?? row.id ?? '').trim();
    const login = (row.login ?? row.email ?? '').trim();
    const personnelNumber =
      (row.personnelNumber ?? row.personnel_number ?? '').trim() || null;
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
      personnelNumber,
      initialPassword:
        (row as EnergoIdUser & { initialPassword?: string | null })
          .initialPassword ?? null,
    };
  }

  async listBranches(): Promise<EnergoIdBranch[]> {
    const payload = await this.platformSync(['branches']);
    if (!Array.isArray(payload.data?.branches)) {
      throw new ServiceUnavailableException(
        'Energo ID branches javobi noto`g`ri',
      );
    }
    return payload.data.branches;
  }

  async listDepartments(): Promise<EnergoIdDepartment[]> {
    const payload = await this.platformSync(['departments']);
    return Array.isArray(payload.data?.departments)
      ? payload.data.departments
      : [];
  }

  async listPositions(): Promise<EnergoIdPosition[]> {
    const payload = await this.platformSync(['positions']);
    return Array.isArray(payload.data?.positions) ? payload.data.positions : [];
  }

  async uploadUserAvatar(
    energoUserId: string,
    file: { path: string; mimetype: string; originalname: string },
  ): Promise<{ success: boolean; userId: string; avatarUrl: string }> {
    const config = this.getConfig();
    const bytes = await readFile(file.path);
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: file.mimetype }),
      file.originalname || `avatar-${energoUserId}.jpg`,
    );

    const response = await this.request(
      `${config.baseUrl}/internal/v1/users/${encodeURIComponent(energoUserId)}/avatar`,
      {
        method: 'PUT',
        headers: {
          'X-Platform': config.platform,
          'X-Client-Id': config.clientId,
          Authorization: `Bearer ${config.clientSecret}`,
        },
        body: form,
      },
      Math.max(config.timeoutMs, 15000),
    );

    if (!response.ok) {
      await this.throwMappedError(response);
    }
    return (await response.json()) as {
      success: boolean;
      userId: string;
      avatarUrl: string;
    };
  }

  private async platformSync(
    resources: Array<'branches' | 'departments' | 'positions' | 'employees'>,
  ): Promise<EnergoIdPlatformSyncResponse> {
    const config = this.getConfig();
    const response = await this.request(
      `${config.baseUrl}/internal/v1/platform-sync`,
      {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({ resources }),
      },
      config.timeoutMs,
    );

    if (!response.ok) {
      await this.throwMappedError(response);
    }

    return (await response.json()) as EnergoIdPlatformSyncResponse;
  }

  private getConfig() {
    const baseUrl = resolveEnergoIdBaseUrl();
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

  private async throwMappedError(response: Response): Promise<never> {
    const status = response.status;
    let message = 'Auth service unavailable';
    try {
      const payload = (await response.json()) as { message?: string | string[] };
      if (typeof payload.message === 'string') {
        message = payload.message;
      } else if (Array.isArray(payload.message)) {
        message = payload.message.join(', ');
      }
    } catch {
      /* ignore */
    }

    if (status === 400) {
      throw new BadRequestException(message);
    }
    if (status === 401) {
      throw new UnauthorizedException(message || 'Avtorizatsiya rad etildi');
    }
    if (status === 403) {
      throw new ForbiddenException(
        message ||
          `Energo ID rad etildi. ENERGO_ID_BASE_URL portal API (:8081) bo‘lishi kerak — masalan https://cabinetid-api.uzbekistonmet.uz`,
      );
    }
    if (status === 429) {
      throw new HttpException(
        message || 'Login urinishlari juda ko`p',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    throw new ServiceUnavailableException(message);
  }
}
