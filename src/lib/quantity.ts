import type { Amounts } from './types';
import { getUnit } from './units';

const fractions: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

function trimNumber(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}

/** Formats a count or spoon-type amount with a simple fraction: 1.5 -> "1½". */
export function formatNumber(value: number): string {
  if (!(value > 0)) return '0';
  const whole = Math.floor(value);
  const rest = value - whole;
  if (rest < 0.06) return String(whole);
  if (rest > 0.94) return String(whole + 1);
  let best = fractions[0]!;
  for (const f of fractions) if (Math.abs(rest - f[0]) < Math.abs(rest - best[0])) best = f;
  if (Math.abs(rest - best[0]) < 0.06) return `${whole || ''}${best[1]}`;
  return trimNumber(value, 1);
}

function roundMetric(value: number): string {
  if (value < 10) return trimNumber(value, 1);
  if (value < 100) return String(Math.round(value));
  return String(Math.round(value / 5) * 5);
}

/** Formats grams or millilitres, switching to kg or l from 1000 up. */
export function formatMetric(value: number, dimension: 'mass' | 'volume'): string {
  const [small, big] = dimension === 'mass' ? ['g', 'kg'] : ['ml', 'l'];
  if (value >= 1000) return `${trimNumber(value / 1000, value >= 10000 ? 1 : 2)} ${big}`;
  return `${roundMetric(value)} ${small}`;
}

/** Formats an amount in the given unit, as in "300 g" or "1½ tbsp". */
export function formatAmount(quantity: number, unitId: string): string {
  const unit = getUnit(unitId);
  if (!unit) return formatNumber(quantity);
  if (unit.dimension !== 'other') return formatMetric(quantity * unit.factor, unit.dimension);
  const label = quantity > 1 ? unit.label[1] : unit.label[0];
  return `${formatNumber(quantity)} ${label}`;
}

export function emptyAmounts(): Amounts {
  return { mass: 0, volume: 0, count: 0, other: {}, unspecified: false };
}

/** Sums up what a shopping item needs, as in "650 g + 2 tbsp". Empty if no amounts were given. */
export function formatAmounts(amounts: Amounts): string {
  const parts: string[] = [];
  if (amounts.mass > 0) parts.push(formatMetric(amounts.mass, 'mass'));
  if (amounts.volume > 0) parts.push(formatMetric(amounts.volume, 'volume'));
  if (amounts.count > 0) parts.push(formatNumber(amounts.count));
  for (const [unitId, quantity] of Object.entries(amounts.other)) {
    if (quantity > 0) parts.push(formatAmount(quantity, unitId));
  }
  return parts.join(' + ');
}

/** Formats euro amounts as in "€1.29". */
export function formatPrice(value: number): string {
  return `€${value.toFixed(2)}`;
}

/** Formats minutes as in "45 min" or "1 h 20 min". */
export function formatMinutes(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
