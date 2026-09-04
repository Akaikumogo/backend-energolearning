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
  return scrub(value, new WeakSet()) as T;
}

/**
 * Ancestor-stack cycle detection: shared (DAG) references stay intact,
 * only true circular refs are dropped. A global WeakSet would incorrectly
 * wipe reused constants (e.g. shared badge objects across student rows).
 */
function scrub(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value == null) return value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return undefined;
    ancestors.add(value);
    const out = value.map((item) => scrub(item, ancestors));
    ancestors.delete(value);
    return out;
  }
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;

  if (ancestors.has(value)) return undefined;
  ancestors.add(value);

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    out[key] = scrub(child, ancestors);
  }
  ancestors.delete(value);
  return out;
}
