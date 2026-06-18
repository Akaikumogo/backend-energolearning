const SENSITIVE_KEYS = new Set([
  'passwordhash',
  'password_hash',
  'initialpassword',
  'initial_password',
  'password',
  'refreshtoken',
  'refresh_token',
]);

export function sanitizeSensitiveData<T>(value: T): T {
  return scrub(value) as T;
}

function scrub(value: unknown): unknown {
  if (value == null) return value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item));
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    out[key] = scrub(child);
  }
  return out;
}
