import type { OAuthClientType } from './oauth-client-type.util';

type OAuthConfig = {
  redirectUri: string;
  routes?: { web?: string; mobile?: string };
  allowedRedirectUrls?: string[];
};

export function collectAllowedRedirectUris(config: OAuthConfig): string[] {
  const items = [
    config.redirectUri,
    config.routes?.web,
    config.routes?.mobile,
    ...(config.allowedRedirectUrls ?? []),
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
