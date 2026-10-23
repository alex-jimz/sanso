export function newId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Returns the URL only if it is a plain web link. Links come from typing and
 * from other apps' share sheets, and anything else (such as javascript:) must
 * never end up in an href.
 */
export function safeUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Reads a number typed with a dot or a comma; undefined for blanks and nonsense. */
export function parseDecimal(raw: string | number | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  const value = Number(raw.trim().replace(',', '.'));
  return raw.trim() && Number.isFinite(value) ? value : undefined;
}
