export function parseBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseIntOr(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
}

/** Converts TRUST_PROXY into the value Express expects for `app.set('trust proxy', ...)`. */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  const raw = (value ?? '').trim();
  if (raw === '' || raw.toLowerCase() === 'false') return false;
  if (raw.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

/** Returns '*' for wildcard, otherwise an array of trimmed origins. */
export function parseCorsOrigins(value: string | undefined): string | string[] {
  const raw = (value ?? '*').trim();
  if (raw === '' || raw === '*') return '*';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
