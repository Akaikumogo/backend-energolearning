import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
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
  middleName?: string | null;
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
  firstName1c?: string;
  lastName1c?: string;
  middleName1c?: string;
  division1c?: string;
  post1c?: string;
  lastSyncedAt?: string | null;
  initialPassword?: string | null;
  avatarUrl?: string | null;
  /** From Energo ID userinfo after OAuth (PASSWORD | EID_AGENT). */
  authMethod?: 'PASSWORD' | 'EID_AGENT';
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
  name1c?: string;
  sourceName?: string;
  employeeCount?: number;
};

type EnergoIdPosition = {
  name: string;
  name1c?: string;
  sourceName?: string;
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
  auth_method?: string;
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

/** Query stringda `code` kabi maxfiy qiymatlar bo‘lishi mumkin — logga faqat manzil yoziladi. */
function describeTarget(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

/** undici `fetch` xatolarida asl sabab `cause` ichida bo‘ladi (ENOTFOUND, ECONNREFUSED, ERR_TLS_CERT_ALTNAME_INVALID ...). */
function describeFetchError(
  error: unknown,
  timedOut: boolean,
  timeoutMs: number,
) {
  if (timedOut) {
    return `timeout ${timeoutMs}ms`;
  }
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const causeText = [cause?.code, cause?.message].filter(Boolean).join(' — ');
  return causeText
    ? `${error.name}: ${error.message} (cause: ${causeText})`
    : `${error.name}: ${error.message}`;
}

@Injectable()
export class EnergoIdAuthClient {
  private readonly logger = new Logger(EnergoIdAuthClient.name);

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
      // ~10k xodim JSON — portal/backend uchun default 5–15s yetmaydi.
      Math.max(config.timeoutMs, config.heavyTimeoutMs),
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
    const authMethod =
      row.auth_method === 'EID_AGENT' ? 'EID_AGENT' : 'PASSWORD';
    return {
      energoUserId,
      login,
      email: row.email ?? null,
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      middleName: row.middleName?.trim() || null,
      role: row.role ?? 'USER',
      permissions: row.permissions ?? [],
      organization: row.organization ?? null,
      mustChangePassword: false,
      status: row.status ?? 'ACTIVE',
      authMethod,
    };
  }

  private normalizeEmployee(
    row: EnergoIdUser & {
      id?: string;
      personnel_number?: string | null;
      middle_name?: string | null;
    },
  ): EnergoIdUser {
    const energoUserId = (row.energoUserId ?? row.id ?? '').trim();
    const login = (row.login ?? row.email ?? '').trim();
    const personnelNumber =
      (row.personnelNumber ?? row.personnel_number ?? '').trim() || null;
    const middleName =
      (row.middleName ?? row.middle_name ?? '').trim() || null;
    return {
      ...row,
      energoUserId,
      login,
      email: row.email ?? null,
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      middleName,
      firstName1c:
        (row as EnergoIdUser).firstName1c ?? row.firstName ?? '',
      lastName1c: (row as EnergoIdUser).lastName1c ?? row.lastName ?? '',
      middleName1c:
        (row as EnergoIdUser).middleName1c ?? middleName ?? '',
      division1c:
        (row as EnergoIdUser).division1c ?? row.division ?? '',
      post1c: (row as EnergoIdUser).post1c ?? row.post ?? '',
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
    file: {
      buffer?: Buffer;
      path?: string;
      mimetype: string;
      originalname: string;
    },
  ): Promise<{
    success: boolean;
    userId: string;
    imageId: string;
    avatarUrl: string;
  }> {
    const config = this.getConfig();
    const bytes = file.buffer ?? (file.path ? await readFile(file.path) : null);
    if (!bytes?.length) {
      throw new BadRequestException('Rasm fayli bo‘sh');
    }
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
    const payload = (await response.json()) as {
      success: boolean;
      userId: string;
      imageId?: string;
      avatarUrl: string;
    };
    const imageId =
      payload.imageId ??
      payload.avatarUrl?.match(
        /\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i,
      )?.[1];
    if (!imageId) {
      throw new ServiceUnavailableException(
        'Energo ID rasm ID qaytarmadi',
      );
    }
    return {
      success: payload.success,
      userId: payload.userId,
      imageId,
      avatarUrl: payload.avatarUrl,
    };
  }

  async uploadImage(file: {
    buffer?: Buffer;
    path?: string;
    mimetype: string;
    originalname: string;
  }): Promise<{
    success: boolean;
    imageId: string;
    imageUrl: string;
  }> {
    const config = this.getConfig();
    const bytes = file.buffer ?? (file.path ? await readFile(file.path) : null);
    if (!bytes?.length) {
      throw new BadRequestException('Rasm fayli bo‘sh');
    }
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: file.mimetype }),
      file.originalname || 'image.jpg',
    );

    const response = await this.request(
      `${config.baseUrl}/internal/v1/images`,
      {
        method: 'POST',
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

    const payload = (await response.json()) as {
      success: boolean;
      imageId: string;
      imageUrl: string;
    };
    if (!payload.imageId) {
      throw new ServiceUnavailableException('Energo ID rasm ID qaytarmadi');
    }
    return payload;
  }

  async patchEmployeeFields(
    energoUserId: string,
    fields: Partial<{
      firstName: string | null;
      lastName: string | null;
      middleName: string | null;
      division: string | null;
      post: string | null;
    }>,
    changedByUserId?: string,
  ) {
    const config = this.getConfig();
    const response = await this.request(
      `${config.baseUrl}/internal/v1/field-overrides/employees`,
      {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({
          energoUserId,
          fields,
          changedByUserId,
        }),
      },
      config.timeoutMs,
    );
    if (!response.ok) {
      await this.throwMappedError(response);
    }
    return response.json();
  }

  /** Beydj / bilim sinovi qisqa ma'lumotini Energo ID raw_payload ga yozadi. */
  async pushSafetyBadge(energoUserId: string, safetyBadge: unknown) {
    const config = this.getConfig();
    const response = await this.request(
      `${config.baseUrl}/internal/v1/portal/users/${encodeURIComponent(energoUserId)}/safety-badge`,
      {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({ safetyBadge }),
      },
      config.timeoutMs,
    );
    if (!response.ok) {
      await this.throwMappedError(response);
    }
    return response.json();
  }

  async patchCatalogField(
    entityType: 'department' | 'position',
    sourceName: string,
    value: string | null,
    changedByUserId?: string,
  ) {
    const config = this.getConfig();
    const response = await this.request(
      `${config.baseUrl}/internal/v1/field-overrides`,
      {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({
          entityType,
          entityId: sourceName,
          field: 'name',
          sourceName,
          value,
          changedByUserId,
        }),
      },
      config.timeoutMs,
    );
    if (!response.ok) {
      await this.throwMappedError(response);
    }
    return response.json();
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
      Math.max(config.timeoutMs, config.heavyTimeoutMs),
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
    const heavyTimeoutMs = Number(
      process.env.ENERGO_ID_HEAVY_TIMEOUT_MS ??
        Math.max(timeoutMs, 180_000),
    );
    return {
      baseUrl,
      platform,
      clientId,
      clientSecret,
      timeoutMs,
      heavyTimeoutMs,
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
      this.logger.error(
        `Energo ID ga ulanib bo‘lmadi: ${describeTarget(url)} — ` +
          describeFetchError(error, controller.signal.aborted, timeoutMs),
      );
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
    if (status === 404) {
      throw new NotFoundException(message || 'Energo ID da topilmadi');
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
