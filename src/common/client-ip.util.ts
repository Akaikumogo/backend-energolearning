import { Request } from 'express';

/** Incoming HTTP requestdan haqiqiy mijoz IP (mobile/browser). Headerga ishonmaydi. */
export function getClientIp(req: Request): string | null {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) {
    return normalizeIp(cf.trim());
  }

  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const first = xff.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }

  const raw = req.ip || req.socket?.remoteAddress || null;
  return raw ? normalizeIp(raw) : null;
}

function normalizeIp(value: string) {
  return value.replace(/^::ffff:/, '');
}
