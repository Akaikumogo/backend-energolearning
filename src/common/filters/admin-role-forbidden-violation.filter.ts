import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ModeratorPermissionsService } from '../../moderator-permissions/moderator-permissions.service';
import { Role } from '../enums/role.enum';

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

@Catch(ForbiddenException)
export class AdminRoleForbiddenViolationFilter implements ExceptionFilter {
  constructor(
    private readonly moderatorPermissionsService: ModeratorPermissionsService,
  ) {}

  async catch(exception: ForbiddenException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { user?: { id?: string; role?: Role; organizationIds?: string[] } }>();
    const res = ctx.getResponse<Response>();

    // Always respond as usual
    const statusCode = exception.getStatus?.() ?? 403;

    // Log only admin write actions where a MODERATOR got 403
    try {
      const method = (req.method || '').toUpperCase();
      const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
      const path = normalizePath(req.originalUrl || req.url || '');
      const isAdmin = path.startsWith('/admin/');
      const user = req.user;

      if (
        isWrite &&
        isAdmin &&
        statusCode === 403 &&
        user?.role === Role.MODERATOR &&
        typeof user.id === 'string'
      ) {
        await this.moderatorPermissionsService.logViolation({
          moderatorUserId: user.id,
          organizationId: user.organizationIds?.[0] ?? null,
          actionKey: 'roles.forbidden',
          method,
          path,
          requestBodyPreview: safeBodyPreview((req as any).body),
          ip: getClientIp(req),
          userAgent: req.headers['user-agent'] ?? null,
        });
      }
    } catch {
      // ignore logging failures
    }

    // Preserve original exception response shape
    const response = exception.getResponse();
    if (typeof response === 'object') {
      return res.status(statusCode).json(response as any);
    }
    return res.status(statusCode).json({
      statusCode,
      message: response,
      error: 'Forbidden',
    });
  }
}

