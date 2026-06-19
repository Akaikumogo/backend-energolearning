import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

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
};

type EnergoIdVerifyResponse = {
  success: boolean;
  user: EnergoIdUser;
};

type EnergoIdEmployeesResponse = {
  success: boolean;
  sync?: {
    dailySyncTime?: string;
    timezone?: string;
  };
  data: EnergoIdUser[];
};

@Injectable()
export class EnergoIdAuthClient {
  isConfigured() {
    return !!process.env.ENERGO_ID_BASE_URL?.trim();
  }

  async verifyLogin(login: string, password: string): Promise<EnergoIdUser> {
    const config = this.getConfig();
    const response = await this.request(
      `${config.baseUrl}/internal/v1/auth/verify`,
      {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({
          platform: config.platform,
          login,
          password,
        }),
      },
      config.timeoutMs,
    );

    if (!response.ok) {
      this.throwMappedError(response.status);
    }

    const payload = (await response.json()) as EnergoIdVerifyResponse;
    if (!payload.success || !payload.user?.energoUserId) {
      throw new ServiceUnavailableException('Energo ID javobi noto`g`ri');
    }
    return payload.user;
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
      employees: payload.data,
      sync: {
        dailySyncTime: payload.sync?.dailySyncTime ?? '23:45',
        timezone: payload.sync?.timezone ?? 'Asia/Tashkent',
      },
    };
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
      throw new UnauthorizedException('Login yoki parol noto`g`ri');
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
