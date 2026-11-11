// A product's price over time: regular price changes from its price log, with
// offers as dips. Prices rarely change, so the log only gets an entry when
// the regular price does.

import { addDays, toISODate } from './dates';
import { offerOn } from './offers';
import type { Offer, PricePoint, Product } from './types';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function dayOf(isoTime: string | undefined): string | undefined {
  const time = isoTime ? new Date(isoTime) : undefined;
  return time && !Number.isNaN(time.getTime()) ? toISODate(time) : undefined;
}

export function cleanPriceLog(raw: unknown): PricePoint[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter(
      (p): p is PricePoint =>
        typeof p === 'object' &&
        p !== null &&
        typeof p.date === 'string' &&
        isoDate.test(p.date) &&
        typeof p.price === 'number' &&
        p.price >= 0,
    )
    .map(({ date, price }) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return out.length ? out : undefined;
}

/**
 * The price log after saving `next` over `previous`. A change adds today's
 * price; a second change on the same day replaces the first. The first change
 * also records the old price, from the day the product was added.
 */
export function logPrice(
  previous: Product | undefined,
  next: Product,
  today: string,
): PricePoint[] | undefined {
  const log = [...(next.priceLog ?? [])];
  const price = next.price;
  if (price === undefined) return log.length ? log : undefined;
  if (!log.length) {
    if (previous?.price === price) return undefined;
    if (previous?.price !== undefined)
      log.push({ date: dayOf(previous.createdAt) ?? today, price: previous.price });
  }
  if (log.at(-1)?.price === price) return log;
  if ((log.at(-1)?.date ?? '') >= today) {
    log.pop();
    if (log.at(-1)?.price === price) return log;
  }
  log.push({ date: today, price });
  return log;
}

/** The log, or the current price since the product was added if it has never changed. */
export function priceLogOf(product: Product): PricePoint[] {
  if (product.priceLog?.length) return product.priceLog;
  if (product.price === undefined) return [];
  return [{ date: dayOf(product.createdAt) ?? toISODate(new Date()), price: product.price }];
}

/** A stretch of days at one price. Both dates are included. */
export interface PriceStep {
  from: string;
  until: string;
  price: number;
  offer: boolean;
}

function regularOn(log: PricePoint[], date: string): number | undefined {
  let price: number | undefined;
  for (const point of log) if (point.date <= date) price = point.price;
  return price;
}

/** The price day by day, as steps, from the first known price to today or the last offer. */
export function priceSteps(product: Product, today: string): PriceStep[] {
  const log = priceLogOf(product);
  const offers = product.offers ?? [];
  const starts = [log[0]?.date, offers[0]?.from].filter((d): d is string => !!d).sort();
  const start = starts[0];
  if (!start) return [];
  const end = [today, ...offers.map((o) => o.until)].sort().at(-1)!;
  const bounds = [
    ...new Set([
      start,
      ...log.map((p) => p.date),
      ...offers.flatMap((o) => [o.from, addDays(o.until, 1)]),
    ]),
  ]
    .filter((d) => d >= start && d <= end)
    .sort();

  const steps: PriceStep[] = [];
  bounds.forEach((from, i) => {
    const until = i + 1 < bounds.length ? addDays(bounds[i + 1]!, -1) : end;
    const offer = offerOn(product, from);
    const price = offer?.price ?? regularOn(log, from);
    if (price === undefined) return;
    const last = steps[steps.length - 1];
    if (last && last.price === price && last.offer === !!offer && addDays(last.until, 1) === from)
      last.until = until;
    else steps.push({ from, until, price, offer: !!offer });
  });
  return steps;
}

export type PriceEvent =
  | { kind: 'change'; date: string; from: number; to: number }
  | { kind: 'offer'; date: string; offer: Offer; regular?: number };

/** Price changes and offers, newest first. */
export function priceEvents(product: Product): PriceEvent[] {
  const log = priceLogOf(product);
  const events: PriceEvent[] = [];
  log.forEach((point, i) => {
    if (i > 0)
      events.push({ kind: 'change', date: point.date, from: log[i - 1]!.price, to: point.price });
  });
  for (const offer of product.offers ?? [])
    events.push({ kind: 'offer', date: offer.from, offer, regular: regularOn(log, offer.from) });
  return events.sort((a, b) => b.date.localeCompare(a.date));
}
