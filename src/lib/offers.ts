// Aldi and Lidl offers run for one week, Thursday to the following Wednesday.
// A product keeps its offers in a list: past ones feed the price graph, and
// this week's and next week's can both be set.

import { addDays, formatDayMonth, fromISODate } from './dates';
import type { Offer, Product } from './types';

const thursday = 4;

/** The Thursday on or before the given date: the start of its offer week. */
export function offerWeekStart(iso: string): string {
  const day = fromISODate(iso).getDay();
  return addDays(iso, -((day - thursday + 7) % 7));
}

/** An offer for the week starting on the given Thursday. */
export function weekOffer(price: number, from: string): Offer {
  return { price, from, until: addDays(from, 6) };
}

export interface OfferWeek {
  from: string;
  until: string;
  /** "This week", "Next week" or "In 2 weeks". */
  label: string;
}

/** The offer weeks a new offer can start in: this one and the next few. */
export function offerWeeks(today: string, count = 3): OfferWeek[] {
  const start = offerWeekStart(today);
  return Array.from({ length: count }, (_, i) => {
    const from = addDays(start, 7 * i);
    const label = i === 0 ? 'This week' : i === 1 ? 'Next week' : `In ${i} weeks`;
    return { from, until: addDays(from, 6), label };
  });
}

/** The offer on a product on the given day. */
export function offerOn(product: Product | undefined, date: string): Offer | undefined {
  return product?.offers?.find((o) => o.from <= date && date <= o.until);
}

export function activeOffer(product: Product | undefined, today: string): Offer | undefined {
  return offerOn(product, today);
}

/** The offer in the offer week after this one. */
export function nextWeekOffer(product: Product | undefined, today: string): Offer | undefined {
  return offerOn(product, addDays(offerWeekStart(today), 7));
}

/** Offers that haven't ended yet, soonest first. */
export function upcomingOffers(offers: Offer[] | undefined, today: string): Offer[] {
  return (offers ?? [])
    .filter((o) => o.until >= today)
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** Adds an offer, replacing any offer it overlaps. Keeps the list in date order. */
export function withOffer(offers: Offer[] | undefined, offer: Offer): Offer[] {
  return [
    ...(offers ?? []).filter((o) => o.until < offer.from || o.from > offer.until),
    offer,
  ].sort((a, b) => a.from.localeCompare(b.from));
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function cleanOffer(raw: unknown): Offer | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { price, from, until } = raw as Record<string, unknown>;
  if (
    typeof price !== 'number' ||
    !(price >= 0) ||
    typeof until !== 'string' ||
    !isoDate.test(until)
  )
    return undefined;
  // Offers saved before offer weeks only had an end date and lasted 7 days from
  // the day they were set. They go in the offer week they started in.
  if (typeof from !== 'string' || !isoDate.test(from) || from > until)
    return weekOffer(price, offerWeekStart(addDays(until, -6)));
  return { price, from, until };
}

/** Valid offers from stored data, including the single `offer` older versions saved. */
export function cleanOffers(raw: { offers?: unknown; offer?: unknown }): Offer[] | undefined {
  const list = Array.isArray(raw.offers) ? raw.offers : raw.offer ? [raw.offer] : [];
  let out: Offer[] = [];
  for (const item of list) {
    const offer = cleanOffer(item);
    if (offer) out = withOffer(out, offer);
  }
  return out.length ? out : undefined;
}

/** "Thu 12 – Wed 18 Nov" or "Thu 27 Nov – Wed 3 Dec". */
export function formatOfferWeek(offer: Pick<Offer, 'from' | 'until'>): string {
  const start = fromISODate(offer.from);
  const end = fromISODate(offer.until);
  const weekday = (d: Date) => d.toLocaleDateString('en-IE', { weekday: 'short' });
  const first =
    start.getMonth() === end.getMonth() ? String(start.getDate()) : formatDayMonth(offer.from);
  return `${weekday(start)} ${first} – ${weekday(end)} ${formatDayMonth(offer.until)}`;
}
