import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../enums/role.enum';
import { ModeratorPermissionsService } from '../../moderator-permissions/moderator-permissions.service';
import type { ModeratorPermissions } from '../../database/entities/moderator-permission.entity';

type CrudAction = 'create' | 'update' | 'delete';
type ModuleKey = keyof ModeratorPermissions;

function normalizePath(originalUrl: string) {
  const noQuery = originalUrl.split('?')[0] ?? originalUrl;
  return noQuery.replace(/^\/api\b/, '') || '/';
}

function resolveAction(method: string, path: string): { module: ModuleKey; action: CrudAction } | null {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return null;

  // Content
  if (path === '/admin/levels') return { module: 'contentLevels', action: 'create' };
  if (/^\/admin\/levels\/[^/]+$/.test(path) && m === 'PUT') return { module: 'contentLevels', action: 'update' };
  if (/^\/admin\/levels\/[^/]+$/.test(path) && m === 'DELETE') return { module: 'contentLevels', action: 'delete' };

  if (path === '/admin/theories') return { module: 'contentTheories', action: 'create' };
  if (/^\/admin\/theories\/[^/]+$/.test(path) && m === 'PUT') return { module: 'contentTheories', action: 'update' };
  if (/^\/admin\/theories\/[^/]+$/.test(path) && m === 'DELETE') return { module: 'contentTheories', action: 'delete' };

  if (path === '/admin/questions') return { module: 'contentQuestions', action: 'create' };
  if (/^\/admin\/questions\/[^/]+$/.test(path) && m === 'PUT') return { module: 'contentQuestions', action: 'update' };
  if (/^\/admin\/questions\/[^/]+$/.test(path) && m === 'DELETE') return { module: 'contentQuestions', action: 'delete' };
  if (/^\/admin\/question-options\/[^/]+$/.test(path) && m === 'DELETE') return { module: 'contentQuestions', action: 'delete' };

  // Organizations
  if (path === '/admin/organizations' && m === 'POST') return { module: 'organizations', action: 'create' };
  if (/^\/admin\/organizations\/[^/]+$/.test(path) && m === 'PUT') return { module: 'organizations', action: 'update' };
  if (/^\/admin\/organizations\/[^/]+$/.test(path) && m === 'DELETE') return { module: 'organizations', action: 'delete' };

  // Students: currently read-only endpoints, but keep mapping for future write endpoints
  if (path === '/admin/students' && m === 'POST') return { module: 'students', action: 'create' };
  if (/^\/admin\/students\/[^/]+$/.test(path) && (m === 'PUT' || m === 'PATCH')) return { module: 'students', action: 'update' };
  if (/^\/admin\/students\/[^/]+$/.test(path) && m === 'DELETE') return { module: 'students', action: 'delete' };

  // Users / Moderators management
  if (path === '/admin/users/moderators' && m === 'POST') return { module: 'moderators', action: 'create' };
  if (/^\/admin\/users\/[^/]+$/.test(path) && m === 'DELETE') return { module: 'users', action: 'delete' };

  // Profile actions from admin-panel
  if (path === '/auth/me' && (m === 'PATCH' || m === 'PUT')) return { module: 'profile', action: 'update' };
  if (path === '/auth/change-password' && m === 'POST') return { module: 'profile', action: 'update' };

  return null;
}

function safeBodyPreview(body: unknown) {
  if (body === undefined || body === null) return null;
  try {
    const raw =
      typeof body === 'string' ? body : JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
    const max = 1200;
    return raw.length > max ? `${raw.slice(0, max)}…` : raw;
  } catch {
    return null;
  }
}

function getClientIp(request: Request): string | null {
  const cfIp = request.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();

  const xff = request.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  return request.ip ?? null;
}

@Injectable()
export class ModeratorPermissionsGuard implements CanActivate {
  constructor(
    private readonly moderatorPermissionsService: ModeratorPermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string; role: Role; organizationIds?: string[] } }>();

    const user = request.user;
    if (!user || user.role !== Role.MODERATOR) return true;

    const path = normalizePath(request.originalUrl || request.url || '');
    const resolved = resolveAction(request.method, path);
    if (!resolved) return true;

    const permRow = await this.moderatorPermissionsService.getOrCreate(user.id);
    const allowed = !!permRow.permissions?.[resolved.module]?.[resolved.action];

    if (allowed) return true;

    const orgId = user.organizationIds?.[0] ?? null;
    await this.moderatorPermissionsService.logViolation({
      moderatorUserId: user.id,
      organizationId: orgId,
      actionKey: `${String(resolved.module)}.${resolved.action}`,
      method: request.method,
      path,
      requestBodyPreview: safeBodyPreview((request as any).body),
      ip: getClientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    });

    throw new ForbiddenException('Sizda ushbu amal uchun ruxsat yo`q');
  }
}

