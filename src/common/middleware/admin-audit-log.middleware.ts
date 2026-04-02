import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

function normalizePath(originalUrl: string) {
  const noQuery = originalUrl.split('?')[0] ?? originalUrl;
  return noQuery.replace(/^\/api\b/, '') || '/';
}

function safeBodyPreview(body: unknown) {
  if (body === undefined || body === null) return null;
  try {
    const raw =
      typeof body === 'string'
        ? body
        : JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
    const max = 1200;
    return raw.length > max ? `${raw.slice(0, max)}…` : raw;
  } catch {
    return null;
  }
}

function getBearerToken(req: Request) {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m?.[1] ?? null;
}

function getClientIp(req: Request): string | null {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();

  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  return req.ip ?? null;
}

@Injectable()
export class AdminAuditLogMiddleware {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly jwtService: JwtService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const started = Date.now();
    const method = (req.method || '').toUpperCase();
    const normalizedPath = normalizePath(req.originalUrl || req.url || '');

    const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    const isAdmin = normalizedPath.startsWith('/admin/');
    if (!isWrite || !isAdmin) return next();

    res.on('finish', () => {
      const durationMs = Date.now() - started;
      const statusCode = res.statusCode || 0;

      const token = getBearerToken(req);
      let actorUserId: string | null = null;
      let actorRole: string | null = null;
      let actorOrganizationIds: string[] | null = null;
      if (token) {
        try {
          const payload = this.jwtService.verify(token) as any;
          actorUserId = typeof payload?.sub === 'string' ? payload.sub : null;
          actorRole = typeof payload?.role === 'string' ? payload.role : null;
          actorOrganizationIds = Array.isArray(payload?.organizationIds)
            ? payload.organizationIds.filter((x: any) => typeof x === 'string')
            : null;
        } catch {
          // ignore invalid token; still log request
        }
      }

      const errorMessage =
        statusCode >= 400 && typeof (res as any).locals?.errorMessage === 'string'
          ? (res as any).locals.errorMessage
          : null;

      this.auditLogsService
        .write({
          actorUserId,
          actorRole,
          actorOrganizationIds,
          method,
          path: normalizedPath,
          statusCode,
          errorMessage,
          requestBodyPreview: safeBodyPreview((req as any).body),
          ip: getClientIp(req),
          userAgent: (req.headers['user-agent'] as string) ?? null,
          durationMs,
        })
        .catch(() => undefined);
    });

    next();
  }
}

