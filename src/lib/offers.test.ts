import { describe, expect, it } from 'vitest';
import {
  activeOffer,
  cleanOffers,
  formatOfferWeek,
  nextWeekOffer,
  offerWeekStart,
  offerWeeks,
  upcomingOffers,
  weekOffer,
  withOffer,
} from './offers';
import type { Product } from './types';

// November 2026: Thursday 5, Wednesday 11, Thursday 12.
function product(offers: Product['offers']): Product {
  return {
    id: 'p',
    name: 'Mince',
    shop: 'aldi',
    listMode: 'auto',
    aliases: [],
    offers,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('offer weeks', () => {
  it('start on the Thursday on or before a date', () => {
    expect(offerWeekStart('2026-11-05')).toBe('2026-11-05');
    expect(offerWeekStart('2026-11-08')).toBe('2026-11-05');
    expect(offerWeekStart('2026-11-11')).toBe('2026-11-05');
    expect(offerWeekStart('2026-11-12')).toBe('2026-11-12');
    expect(offerWeekStart('2026-11-04')).toBe('2026-10-29');
  });

  it('run Thursday to Wednesday', () => {
    expect(weekOffer(3.49, '2026-11-12')).toEqual({
      price: 3.49,
      from: '2026-11-12',
      until: '2026-11-18',
    });
  });

  it('offers this week and the next two, also on a Wednesday', () => {
    expect(offerWeeks('2026-11-11')).toEqual([
      { from: '2026-11-05', until: '2026-11-11', label: 'This week' },
      { from: '2026-11-12', until: '2026-11-18', label: 'Next week' },
      { from: '2026-11-19', until: '2026-11-25', label: 'In 2 weeks' },
    ]);
  });

  it('format as a week, across months too', () => {
    expect(formatOfferWeek({ from: '2026-11-12', until: '2026-11-18' })).toBe(
      'Thu 12 – Wed 18 Nov',
    );
    expect(formatOfferWeek({ from: '2026-11-26', until: '2026-12-02' })).toBe(
      'Thu 26 Nov – Wed 2 Dec',
    );
  });
});

describe('offers on a product', () => {
  const now = weekOffer(3.49, '2026-11-05');
  const next = weekOffer(2.99, '2026-11-12');
  const mince = product([weekOffer(3.79, '2026-10-22'), now, next]);

  it('finds the offer on now and the one next week', () => {
    expect(activeOffer(mince, '2026-11-11')).toEqual(now);
    expect(nextWeekOffer(mince, '2026-11-11')).toEqual(next);
    expect(activeOffer(mince, '2026-11-12')).toEqual(next);
    expect(nextWeekOffer(mince, '2026-11-12')).toBeUndefined();
    expect(activeOffer(mince, '2026-11-04')).toBeUndefined();
  });

  it('lists the offers that haven’t ended', () => {
    expect(upcomingOffers(mince.offers, '2026-11-11')).toEqual([now, next]);
    expect(upcomingOffers(mince.offers, '2026-11-12')).toEqual([next]);
  });

  it('replaces an offer for the same week', () => {
    const cheaper = weekOffer(3.19, '2026-11-05');
    expect(withOffer(mince.offers, cheaper)).toEqual([mince.offers![0], cheaper, next]);
  });
});

describe('cleanOffers', () => {
  it('moves the single offer older versions saved into the offer week it started in', () => {
    // Set on Friday 6 Nov, so it ran to Thursday 12.
    expect(cleanOffers({ offer: { price: 3.49, until: '2026-11-12' } })).toEqual([
      { price: 3.49, from: '2026-11-05', until: '2026-11-11' },
    ]);
    // Set on a Thursday, so it already ended on a Wednesday.
    expect(cleanOffers({ offer: { price: 3.49, until: '2026-11-18' } })).toEqual([
      { price: 3.49, from: '2026-11-12', until: '2026-11-18' },
    ]);
  });

  it('keeps valid offers in date order and drops broken ones', () => {
    expect(
      cleanOffers({
        offers: [
          weekOffer(2.99, '2026-11-12'),
          { price: 'cheap', until: '2026-11-11' },
          { price: 1, from: '2026-11-05' },
          weekOffer(3.49, '2026-11-05'),
        ],
      }),
    ).toEqual([weekOffer(3.49, '2026-11-05'), weekOffer(2.99, '2026-11-12')]);
    expect(cleanOffers({})).toBeUndefined();
    expect(cleanOffers({ offers: 'none' })).toBeUndefined();
  });
});
