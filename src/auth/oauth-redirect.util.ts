import type { OAuthClientType } from './oauth-client-type.util';

type OAuthConfig = {
  redirectUri: string;
  routes?: { web?: string; webUrls?: string[]; mobile?: string };
  allowedRedirectUrls?: string[];
};

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function getEnvOAuthRedirectUris(): string[] {
  const items = [
    process.env.ENERGO_ID_OAUTH_REDIRECT_URI_WEB?.trim(),
    process.env.ENERGO_ID_OAUTH_REDIRECT_URI_MOBILE?.trim(),
  ];
  const mobileWeb = process.env.MOBILE_WEB_ORIGIN?.trim();
  if (mobileWeb) {
    items.push(`${mobileWeb.replace(/\/+$/, '')}/oauth/callback`);
  }
  return items.filter(Boolean) as string[];
}

export function getCorsOAuthCallbackUris(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => isHttpUrl(o))
    .map((o) => `${o.replace(/\/+$/, '')}/oauth/callback`);
}

export function collectAllowedRedirectUris(config: OAuthConfig): string[] {
  const items = [
    config.redirectUri,
    config.routes?.web,
    ...(config.routes?.webUrls ?? []),
    config.routes?.mobile,
    ...(config.allowedRedirectUrls ?? []),
    ...getEnvOAuthRedirectUris(),
    ...getCorsOAuthCallbackUris(),
  ]
    .map((u) => u?.trim())
    .filter(Boolean) as string[];
  return [...new Set(items)];
}

export function resolveOAuthRedirectUri(
  config: OAuthConfig,
  client: OAuthClientType,
  requestOrigin?: string,
): string {
  const allowed = collectAllowedRedirectUris(config);

  if (client === 'web' && requestOrigin?.trim()) {
    const origin = requestOrigin.trim().replace(/\/+$/, '');
    const candidate = `${origin}/oauth/callback`;
    if (allowed.includes(candidate)) {
      return candidate;
    }
    try {
      const wanted = new URL(candidate).origin;
      const byOrigin = allowed.find((u) => {
        try {
          return new URL(u).origin === wanted;
        } catch {
          return false;
        }
      });
      if (byOrigin) return byOrigin;
    } catch {
      /* ignore */
    }
  }

  if (client === 'web') {
    const webEnv = process.env.ENERGO_ID_OAUTH_REDIRECT_URI_WEB?.trim();
    if (webEnv && allowed.includes(webEnv)) {
      return webEnv;
    }
    const routeWeb = config.routes?.web?.trim();
    if (routeWeb && allowed.includes(routeWeb)) {
      return routeWeb;
    }
    const firstWeb = config.routes?.webUrls?.find((u) => allowed.includes(u.trim()));
    if (firstWeb) return firstWeb.trim();
  }

  return config.redirectUri;
}

export function isAllowedOAuthRedirectUri(
  config: OAuthConfig,
  redirectUri: string,
): boolean {
  const uri = redirectUri.trim();
  return collectAllowedRedirectUris(config).includes(uri);
}
