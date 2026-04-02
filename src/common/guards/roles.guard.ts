import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { ModeratorPermissionsService } from '../../moderator-permissions/moderator-permissions.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moderatorPermissionsService: ModeratorPermissionsService,
  ) {}

  private normalizePath(originalUrl: string) {
    const noQuery = originalUrl.split('?')[0] ?? originalUrl;
    return noQuery.replace(/^\/api\b/, '') || '/';
  }

  private safeBodyPreview(body: unknown) {
    if (body === undefined || body === null) return null;
    try {
      const raw =
        typeof body === 'string'
          ? body
          : JSON.stringify(body, (_k, v) =>
              typeof v === 'bigint' ? String(v) : v,
            );
      const max = 1200;
      return raw.length > max ? `${raw.slice(0, max)}…` : raw;
    } catch {
      return null;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id?: string; role?: Role; organizationIds?: string[] } }>();
    const { user } = request;

    if (!user?.role || !requiredRoles.includes(user.role)) {
      // Also record this as a moderator violation for admin write attempts.
      // This is needed because RolesGuard denies before ModeratorPermissionsGuard can log.
      try {
        const method = (request.method || '').toUpperCase();
        const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
        const path = this.normalizePath(request.originalUrl || request.url || '');
        const isAdmin = path.startsWith('/admin/');
        if (isWrite && isAdmin && user?.role === Role.MODERATOR && user?.id) {
          const orgId = user.organizationIds?.[0] ?? null;
          await this.moderatorPermissionsService.logViolation({
            moderatorUserId: user.id,
            organizationId: orgId,
            actionKey: `roles.forbidden:${requiredRoles.join('|')}`,
            method,
            path,
            requestBodyPreview: this.safeBodyPreview((request as any).body),
            ip: request.ip ?? null,
            userAgent: request.headers['user-agent'] ?? null,
          });
        }
      } catch {
        // never block the main request on logging failure
      }
      throw new ForbiddenException('Sizda ushbu endpoint uchun ruxsat yo`q');
    }

    return true;
  }
}
