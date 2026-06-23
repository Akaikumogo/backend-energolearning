import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthIntegrationSetting } from '../database/entities/oauth-integration-setting.entity';
import { EnergoIdAuthClient } from '../auth/energo-id-auth.client';
import { UpdateOAuthIntegrationDto } from './dto/update-oauth-integration.dto';

const SOURCE = 'energo-id';

@Injectable()
export class OAuthIntegrationSettingsService {
  constructor(
    @InjectRepository(OAuthIntegrationSetting)
    private readonly repo: Repository<OAuthIntegrationSetting>,
    private readonly energoIdAuthClient: EnergoIdAuthClient,
  ) {}

  private envMobileRedirectUri() {
    return (
      process.env.ENERGO_ID_OAUTH_REDIRECT_URI_MOBILE?.trim() ||
      'uz.elektroxavfsizlik.app://oauth/callback'
    );
  }

  private envWebRedirectUri() {
    return (
      process.env.ENERGO_ID_OAUTH_REDIRECT_URI_WEB?.trim() ||
      'http://localhost:5173/oauth/callback'
    );
  }

  async getOrCreateRow() {
    let row = await this.repo.findOne({ where: { source: SOURCE } });
    if (!row) {
      row = await this.repo.save(
        this.repo.create({
          source: SOURCE,
          mobileRedirectUri: this.envMobileRedirectUri(),
          webRedirectUri: this.envWebRedirectUri(),
          callbackPath: '/oauth/callback',
          oauthScopes: 'employee.auth profile.read',
        }),
      );
    }
    return row;
  }

  async getEffective() {
    const row = await this.getOrCreateRow();
    return {
      mobileRedirectUri:
        row.mobileRedirectUri?.trim() || this.envMobileRedirectUri(),
      webRedirectUri: row.webRedirectUri?.trim() || this.envWebRedirectUri(),
      callbackPath: row.callbackPath?.trim() || '/oauth/callback',
      scopes: row.oauthScopes?.trim() || 'employee.auth profile.read',
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    };
  }

  getRedirectUri(client: 'mobile' | 'web', effective?: Awaited<ReturnType<typeof this.getEffective>>) {
    const settings = effective;
    if (client === 'web') {
      return settings?.webRedirectUri ?? this.envWebRedirectUri();
    }
    return settings?.mobileRedirectUri ?? this.envMobileRedirectUri();
  }

  isAllowedRedirectUri(
    redirectUri: string,
    effective?: Awaited<ReturnType<typeof this.getEffective>>,
  ) {
    const uri = redirectUri.trim();
    if (!uri) return false;
    const settings = effective;
    const allowed = [
      settings?.mobileRedirectUri ?? this.envMobileRedirectUri(),
      settings?.webRedirectUri ?? this.envWebRedirectUri(),
    ].map((u) => u.trim());
    return allowed.includes(uri);
  }

  buildAuthorizeTemplate(
    redirectUri: string,
    scopes: string,
  ) {
    const baseUrl = process.env.ENERGO_ID_BASE_URL?.replace(/\/+$/, '') ?? '';
    const clientId =
      process.env.ENERGO_ID_CLIENT_ID?.trim() || 'elektrolearn_backend';
    if (!baseUrl) {
      return '';
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state: '{state}',
      scope: scopes,
    });
    return `${baseUrl}/oauth/authorize?${params.toString()}`;
  }

  async getAdminView() {
    const effective = await this.getEffective();
    const configured = this.energoIdAuthClient.isConfigured();
    let reachable = false;
    if (configured) {
      reachable = await this.energoIdAuthClient.checkHealth();
    }

    return {
      mobileRedirectUri: effective.mobileRedirectUri,
      webRedirectUri: effective.webRedirectUri,
      callbackPath: effective.callbackPath,
      scopes: effective.scopes,
      templates: {
        authorizeUrl: this.buildAuthorizeTemplate(
          effective.mobileRedirectUri,
          effective.scopes,
        ),
        callbackMobile: `${effective.mobileRedirectUri}?code={code}&state={state}`,
        callbackWeb: `${effective.webRedirectUri}?code={code}&state={state}`,
      },
      endpoints: {
        authorizeUrl: '/auth/energo-id/authorize-url',
        exchange: '/auth/energo-id/exchange',
      },
      energoIdHealth: { configured, reachable },
      deployChecklist: {
        message:
          'Redirect URI lar Energo ID platforma adminidan boshqariladi. ElektroLearn /oauth/client-config orqali oladi.',
        source: 'energo-id-platform-admin',
      },
      updatedAt: effective.updatedAt,
      updatedBy: effective.updatedBy,
    };
  }

  async update(dto: UpdateOAuthIntegrationDto, adminId: string) {
    const row = await this.getOrCreateRow();

    if (dto.mobileRedirectUri !== undefined) {
      const uri = dto.mobileRedirectUri.trim();
      if (!uri) {
        throw new BadRequestException('Mobile redirect URI bo‘sh bo‘lmasligi kerak');
      }
      row.mobileRedirectUri = uri;
    }
    if (dto.webRedirectUri !== undefined) {
      const uri = dto.webRedirectUri.trim();
      if (!uri) {
        throw new BadRequestException('Web redirect URI bo‘sh bo‘lmasligi kerak');
      }
      row.webRedirectUri = uri;
    }
    if (dto.oauthScopes !== undefined) {
      const scopes = dto.oauthScopes.trim();
      if (!scopes) {
        throw new BadRequestException('OAuth scope bo‘sh bo‘lmasligi kerak');
      }
      row.oauthScopes = scopes;
    }

    row.updatedBy = adminId;
    await this.repo.save(row);
    return this.getAdminView();
  }

  async buildEnvExport() {
    const effective = await this.getEffective();
    const baseUrl = process.env.ENERGO_ID_BASE_URL?.replace(/\/+$/, '') ?? '';
    const platform = process.env.ENERGO_ID_PLATFORM ?? 'elektrolearn';
    const clientId =
      process.env.ENERGO_ID_CLIENT_ID ?? 'elektrolearn_backend';
    return [
      `ENERGO_ID_BASE_URL=${baseUrl}`,
      `ENERGO_ID_PLATFORM=${platform}`,
      `ENERGO_ID_CLIENT_ID=${clientId}`,
      'ENERGO_ID_CLIENT_SECRET=<your-secret>',
      `ENERGO_ID_OAUTH_REDIRECT_URI_MOBILE=${effective.mobileRedirectUri}`,
      `ENERGO_ID_OAUTH_REDIRECT_URI_WEB=${effective.webRedirectUri}`,
      'ENERGO_ID_TIMEOUT_MS=5000',
    ].join('\n');
  }
}
