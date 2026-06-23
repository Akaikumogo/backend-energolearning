export type OAuthClientType = 'mobile' | 'web';

export function resolveOAuthClientType(
  redirectUri?: string | null,
  client?: OAuthClientType | null,
): OAuthClientType {
  if (client === 'web' || client === 'mobile') {
    return client;
  }
  const uri = redirectUri?.trim() ?? '';
  if (/^https?:\/\//i.test(uri)) {
    return 'web';
  }
  return 'mobile';
}

export function buildCallbackRedirectUri(origin: string, pathname: string) {
  const base = origin.replace(/\/+$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${path}`.replace(/\/+$/, '') || `${base}/oauth/callback`;
}
