import { parse } from 'pg-connection-string';

const DEFAULT_URL =
  'postgresql://sarvarbekxazratov:StrongPassword123!@localhost:5432/elektrolearn';

export function getPostgresConnectionOptions(): {
  host?: string;
  port?: number;
  username?: string;
  password: string;
  database?: string;
  ssl?: boolean | { rejectUnauthorized?: boolean } | object;
} {
  const raw = process.env.DATABASE_URL;
  const url =
    raw == null || String(raw).trim() === '' ? DEFAULT_URL : String(raw).trim();
  const p = parse(url);
  const password = p.password != null ? String(p.password) : '';
  const opts: ReturnType<typeof getPostgresConnectionOptions> = {
    password,
  };
  if (p.host) opts.host = p.host;
  if (p.port) opts.port = Number(p.port);
  if (p.user) opts.username = p.user;
  if (p.database != null && p.database !== '') opts.database = p.database;
  if (p.ssl !== undefined) opts.ssl = p.ssl as typeof opts.ssl;
  return opts;
}
