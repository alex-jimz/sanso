import { describe, expect, it } from 'vitest';
import { weekOffer } from './offers';
import { cleanPriceLog, logPrice, priceEvents, priceSteps } from './priceHistory';
import type { Product } from './types';

function product(extra: Partial<Product> = {}): Product {
  return {
    id: 'p',
    name: 'Milk',
    shop: 'aldi',
    listMode: 'auto',
    aliases: [],
    price: 1.15,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...extra,
  };
}

describe('logPrice', () => {
  it('records nothing while the price stays the same', () => {
    const milk = product();
    expect(logPrice(milk, { ...milk }, '2026-11-11')).toBeUndefined();
  });

  it('records the old price from the day the product was added, then the new one', () => {
    const milk = product();
    expect(logPrice(milk, { ...milk, price: 1.25 }, '2026-11-11')).toEqual([
      { date: '2026-09-01', price: 1.15 },
      { date: '2026-11-11', price: 1.25 },
    ]);
  });

  it('starts the log for a new product with a price', () => {
    expect(logPrice(undefined, product(), '2026-11-11')).toEqual([
      { date: '2026-11-11', price: 1.15 },
    ]);
  });

  it('replaces a change made earlier the same day, and drops it when the price goes back', () => {
    const log = [
      { date: '2026-09-01', price: 1.15 },
      { date: '2026-11-11', price: 1.25 },
    ];
    const milk = product({ price: 1.25, priceLog: log });
    expect(logPrice(milk, { ...milk, price: 1.29 }, '2026-11-11')).toEqual([
      log[0],
      { date: '2026-11-11', price: 1.29 },
    ]);
    expect(logPrice(milk, { ...milk, price: 1.15 }, '2026-11-11')).toEqual([log[0]]);
  });

  it('keeps the log when the price is cleared', () => {
    const log = [{ date: '2026-09-01', price: 1.15 }];
    const milk = product({ priceLog: log });
    expect(logPrice(milk, { ...milk, price: undefined }, '2026-11-11')).toEqual(log);
  });
});

describe('cleanPriceLog', () => {
  it('keeps valid points, oldest first', () => {
    expect(
      cleanPriceLog([
        { date: '2026-11-01', price: 1.25 },
        { date: 'soon', price: 1 },
        { date: '2026-09-01', price: 1.15, extra: true },
      ]),
    ).toEqual([
      { date: '2026-09-01', price: 1.15 },
      { date: '2026-11-01', price: 1.25 },
    ]);
    expect(cleanPriceLog('none')).toBeUndefined();
  });
});

describe('priceSteps', () => {
  const log = [
    { date: '2026-09-01', price: 1.15 },
    { date: '2026-10-15', price: 1.25 },
  ];

  it('is one flat step for a price that never changed', () => {
    expect(priceSteps(product(), '2026-11-11')).toEqual([
      { from: '2026-09-01', until: '2026-11-11', price: 1.15, offer: false },
    ]);
  });

  it('dips for an offer and runs on to the end of an upcoming one', () => {
    const milk = product({
      price: 1.25,
      priceLog: log,
      offers: [weekOffer(0.99, '2026-10-22'), weekOffer(1.05, '2026-11-12')],
    });
    expect(priceSteps(milk, '2026-11-11')).toEqual([
      { from: '2026-09-01', until: '2026-10-14', price: 1.15, offer: false },
      { from: '2026-10-15', until: '2026-10-21', price: 1.25, offer: false },
      { from: '2026-10-22', until: '2026-10-28', price: 0.99, offer: true },
      { from: '2026-10-29', until: '2026-11-11', price: 1.25, offer: false },
      { from: '2026-11-12', until: '2026-11-18', price: 1.05, offer: true },
    ]);
  });

  it('is empty without a price or offers', () => {
    expect(priceSteps(product({ price: undefined }), '2026-11-11')).toEqual([]);
  });
});

describe('priceEvents', () => {
  it('lists changes and offers, newest first, with the usual price', () => {
    const offer = weekOffer(0.99, '2026-10-22');
    const milk = product({
      price: 1.25,
      priceLog: [
        { date: '2026-09-01', price: 1.15 },
        { date: '2026-10-15', price: 1.25 },
      ],
      offers: [offer],
    });
    expect(priceEvents(milk)).toEqual([
      { kind: 'offer', date: '2026-10-22', offer, regular: 1.25 },
      { kind: 'change', date: '2026-10-15', from: 1.15, to: 1.25 },
    ]);
  });
});
