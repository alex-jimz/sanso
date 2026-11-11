import { describe, expect, it } from 'vitest';
import { applyAldi, findProduct, newProductFields, parseAldiPayload, parseEuro } from './aldi';
import type { Product } from './types';

const image =
  'https://dm.emea.cms.aldi.cx/is/image/aldiprodeu/product/jpg/scaleWidth/{width}/abc-123/{slug}';

function payload(items: unknown[], more = false) {
  return JSON.stringify({ v: 1, page: 'https://www.aldi.ie/products', more, items });
}

const penne = {
  sku: '000000000000282766',
  name: 'Penne Pasta',
  brandName: 'CUCINA',
  urlSlugText: 'cucina-penne-pasta-1kg',
  sellingSize: '1 KG',
  price: {
    amount: 99,
    amountRelevantDisplay: '€0.99',
    comparisonDisplay: '€0.99/1 KG',
    wasPriceDisplay: null,
  },
  image,
};

const mince = {
  sku: '000000000000412345',
  name: 'Irish Beef Mince 5% Fat',
  brandName: 'SPECIALLY SELECTED',
  urlSlugText: 'specially-selected-irish-beef-mince',
  price: {
    amount: 449,
    amountRelevantDisplay: '€4.49',
    comparisonDisplay: '€8.98/1 KG',
    wasPriceDisplay: '€5.29',
  },
};

function product(extra: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Penne',
    shop: 'any',
    listMode: 'auto',
    aliases: ['pasta'],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...extra,
  };
}

describe('parseEuro', () => {
  it('reads prices as Aldi writes them', () => {
    expect(parseEuro('€1.49')).toBe(1.49);
    expect(parseEuro('1,49 €')).toBe(1.49);
    expect(parseEuro('€12')).toBe(12);
    expect(parseEuro('€0.5')).toBe(0.5);
    expect(parseEuro(null)).toBeUndefined();
    expect(parseEuro('free')).toBeUndefined();
  });
});

describe('parseAldiPayload', () => {
  it('reads name, link, photo, pack size and price', () => {
    const { items, more } = parseAldiPayload(payload([penne]));
    expect(more).toBe(false);
    expect(items).toEqual([
      {
        sku: '000000000000282766',
        name: 'Cucina Penne Pasta',
        url: 'https://www.aldi.ie/product/cucina-penne-pasta-1kg-000000000000282766',
        imageUrl:
          'https://dm.emea.cms.aldi.cx/is/image/aldiprodeu/product/jpg/scaleWidth/320/abc-123/cucina-penne-pasta-1kg',
        packSize: 1000,
        packUnit: 'g',
        price: 0.99,
        wasPrice: undefined,
      },
    ]);
  });

  it('reads a price drop, and works out the pack size from the price per kg', () => {
    const [item] = parseAldiPayload(payload([mince])).items;
    expect(item).toMatchObject({
      name: 'Specially Selected Irish Beef Mince 5% Fat',
      price: 4.49,
      wasPrice: 5.29,
      packSize: 500,
      packUnit: 'g',
    });
  });

  it('falls back to prices in cent', () => {
    const [item] = parseAldiPayload(
      payload([
        { sku: '1', name: 'Eggs', price: { amount: 239, wasPrice: 279 }, sellingSize: '12 Each' },
      ]),
    ).items;
    expect(item).toMatchObject({ price: 2.39, wasPrice: 2.79, packSize: 12, packUnit: 'pcs' });
  });

  it('reads litres however Aldi spells them', () => {
    const milk = (sellingSize: string) =>
      parseAldiPayload(
        payload([{ sku: '5', name: 'Fresh Milk', sellingSize, price: { amount: 115 } }]),
      ).items[0];
    for (const size of ['1 l', '1L', '1 Ltr', '1 LTR', '1 litre', '1000 ml', '100 cl']) {
      expect(milk(size), size).toMatchObject({ packSize: 1000, packUnit: 'ml' });
    }
    expect(milk('2.272 l')).toMatchObject({ packSize: 2272, packUnit: 'ml' });
  });

  it('works out litres from the price per litre', () => {
    for (const comparisonDisplay of [
      '€1.15/1 L',
      '€1.15/1 LTR',
      '€1.15 per litre',
      '€0.12/100 ML',
    ]) {
      const [item] = parseAldiPayload(
        payload([{ sku: '5', name: 'Milk', price: { amount: 115, comparisonDisplay } }]),
      ).items;
      expect(item!.packUnit, comparisonDisplay).toBe('ml');
    }
    const [item] = parseAldiPayload(
      payload([{ sku: '5', name: 'Milk', price: { amount: 115, comparisonDisplay: '€1.15/1 L' } }]),
    ).items;
    expect(item!.packSize).toBe(1000);
  });

  it('reads the pack size and price from the page when the API leaves them out', () => {
    const [milk, eggs] = parseAldiPayload(
      payload([
        {
          sku: '5',
          name: 'Fresh Milk',
          via: 'page',
          pageText: 'COWBELL Fresh Milk 1 l €1.15 (€1.15/1 L)',
        },
        {
          sku: '6',
          name: 'Eggs',
          price: { amount: 299 },
          pageText: 'FARMDALE Eggs 12 Each €2.99 (€0.25/1 Each)',
        },
      ]),
    ).items;
    expect(milk).toMatchObject({ price: 1.15, packSize: 1000, packUnit: 'ml' });
    expect(eggs).toMatchObject({ price: 2.99, packSize: 12, packUnit: 'pcs' });
  });

  it('ignores the "1 L" of a price per litre when the page shows no pack size', () => {
    const [item] = parseAldiPayload(
      payload([{ sku: '5', name: 'Milk', pageText: 'Milk €2.30 (€1.15/1 L)' }]),
    ).items;
    expect(item).toMatchObject({ price: 2.3, packSize: 2000, packUnit: 'ml' });
  });

  it('skips broken items and duplicates', () => {
    const { items } = parseAldiPayload(
      payload([{ sku: 'x', name: 'No' }, { sku: '2' }, penne, penne, 'nonsense']),
    );
    expect(items.map((i) => i.sku)).toEqual(['000000000000282766']);
  });

  it('never keeps a photo from somewhere other than Aldi', () => {
    const odd = [
      { ...penne, image: 'https://evil.example/x.png' },
      { ...penne, sku: '3', image: 'http://dm.emea.cms.aldi.cx/x.png' },
      { ...penne, sku: '4', image: 'javascript:alert(1)' },
    ];
    expect(parseAldiPayload(payload(odd)).items.map((i) => i.imageUrl)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('builds the link from a safe slug only', () => {
    const [item] = parseAldiPayload(payload([{ ...penne, urlSlugText: '../../evil' }])).items;
    expect(item!.url).toBe('https://www.aldi.ie/product/000000000000282766');
  });

  it('rejects links without product data', () => {
    expect(() => parseAldiPayload(null)).toThrow('no product details');
    expect(() => parseAldiPayload('{"v":2,"items":[]}')).toThrow('no product details');
    expect(() => parseAldiPayload(payload([{ sku: 'x' }]))).toThrow('didn’t send');
  });
});

describe('findProduct', () => {
  const [item] = parseAldiPayload(payload([penne])).items;

  it('matches by product number, or by an Aldi link saved earlier', () => {
    const bySku = product({ id: 'a', sku: '000000000000282766' });
    const byLink = product({
      id: 'b',
      url: 'https://www.aldi.ie/product/cucina-penne-pasta-1kg-000000000000282766',
    });
    expect(findProduct([product({ id: 'c' }), bySku], item!)?.id).toBe('a');
    expect(findProduct([product({ id: 'c' }), byLink], item!)?.id).toBe('b');
    expect(findProduct([product({ id: 'c' })], item!)).toBeUndefined();
  });
});

describe('applyAldi', () => {
  // A Friday: the offer week runs from Thursday 5 to Wednesday 11 November.
  const today = '2026-11-06';
  const thisWeek = { from: '2026-11-05', until: '2026-11-11' };

  it('updates price and pack size and keeps what the user set', () => {
    const [item] = parseAldiPayload(payload([penne])).items;
    const before = product({ price: 0.89, packSize: 500, packUnit: 'g', sectionId: 'grains' });
    const { product: after, changes } = applyAldi(before, item!, today);

    expect(changes).toEqual(['Photo', 'Price €0.89 → €0.99', 'Pack 500 g → 1 kg']);
    expect(after).toMatchObject({
      name: 'Penne',
      sectionId: 'grains',
      aliases: ['pasta'],
      shop: 'aldi',
      sku: '000000000000282766',
      price: 0.99,
      packSize: 1000,
      priceCheckedAt: today,
    });
  });

  it('turns a price drop into an offer for this offer week, with the old price as the price', () => {
    const [item] = parseAldiPayload(payload([mince])).items;
    const { product: after, changes } = applyAldi(product({ price: 5.29 }), item!, today);
    expect(after.price).toBe(5.29);
    expect(after.offers).toEqual([{ price: 4.49, ...thisWeek }]);
    expect(changes).toContain('On offer at €4.49');
  });

  it('keeps an offer it already knows about', () => {
    const [item] = parseAldiPayload(payload([mince])).items;
    const known = product({
      price: 5.29,
      packSize: 500,
      packUnit: 'g',
      offers: [{ price: 4.49, from: '2026-11-02', until: '2026-11-08' }],
    });
    const { product: after, changes } = applyAldi(known, item!, today);
    expect(after.offers).toEqual(known.offers);
    expect(changes).toEqual([]);
  });

  it('replaces this week’s offer at another price, and keeps past and later ones', () => {
    const [item] = parseAldiPayload(payload([mince])).items;
    const past = { price: 3.99, from: '2026-10-22', until: '2026-10-28' };
    const later = { price: 3.49, from: '2026-11-12', until: '2026-11-18' };
    const known = product({
      price: 5.29,
      offers: [past, { price: 4.99, ...thisWeek }, later],
    });
    const { product: after, changes } = applyAldi(known, item!, today);
    expect(after.offers).toEqual([past, { price: 4.49, ...thisWeek }, later]);
    expect(changes).toContain('On offer at €4.49');
  });

  it('makes new products with the regular price and any offer', () => {
    const [item] = parseAldiPayload(payload([mince])).items;
    expect(newProductFields(item!, today)).toMatchObject({
      shop: 'aldi',
      price: 5.29,
      offers: [{ price: 4.49, ...thisWeek }],
      packSize: 500,
    });
  });
});
