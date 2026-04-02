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
          ip: req.ip ?? null,
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

