import { describe, expect, it } from 'vitest';
import { formatAmounts } from './quantity';
import {
  buildItems,
  itemCost,
  mergeDecisions,
  packsNeeded,
  productMatcher,
  unitPrice,
} from './shopping';
import type { Meal, Product, Recipe } from './types';

let counter = 0;
const newId = () => `id${++counter}`;

function recipe(id: string, portions: number, ingredients: string[]): Recipe {
  return {
    id,
    title: id,
    tags: [],
    portions,
    ingredients,
    steps: [],
    notes: '',
    createdAt: '',
    updatedAt: '',
  };
}

function meal(id: string, recipeId: string, portions = 1, state: Meal['state'] = 'toShop'): Meal {
  return { id, date: id.split(':')[0]!, slot: 'dinner', recipeId, portions, state };
}

function product(id: string, name: string, extra: Partial<Product> = {}): Product {
  return {
    id,
    name,
    shop: 'aldi',
    listMode: 'auto',
    aliases: [],
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

const curry = recipe('curry', 4, [
  '600 g chicken breast',
  '3 garlic cloves',
  '1 onion, chopped',
  '400 ml coconut milk',
  'salt',
  '200 ml water',
]);
const stew = recipe('stew', 2, ['300 g chicken breast', '1 onion', '2 tbsp olive oil']);
const recipes = new Map([
  ['curry', curry],
  ['stew', stew],
]);

describe('buildItems', () => {
  it('scales by portions, merges lines and skips tap water', () => {
    const items = buildItems(
      [meal('2026-10-20:dinner', 'curry', 2), meal('2026-10-21:dinner', 'stew', 1)],
      recipes,
      productMatcher([]),
      newId,
    );
    const byName = new Map(items.map((i) => [i.name, i]));
    expect(byName.get('Chicken breast')?.amounts.mass).toBeCloseTo(450);
    expect(byName.get('Chicken breast')?.part).toBe('buy');
    expect(byName.get('Chicken breast')?.sources).toHaveLength(2);
    expect(byName.get('Garlic')?.amounts.other.clove).toBeCloseTo(1.5);
    expect(byName.get('Garlic')?.part).toBe('check');
    expect(byName.get('Onion')?.amounts.count).toBeCloseTo(1);
    expect(byName.get('Coconut milk')?.amounts.volume).toBeCloseTo(200);
    expect(byName.get('Salt')?.amounts.unspecified).toBe(true);
    expect(byName.has('Water')).toBe(false);
  });

  it('skips meals with no cooking', () => {
    const items = buildItems(
      [meal('2026-10-20:dinner', 'curry', 2, 'noCooking')],
      recipes,
      productMatcher([]),
      newId,
    );
    expect(items).toHaveLength(0);
  });

  it('uses products, their aliases and how they should be listed', () => {
    const products = [
      product('p1', 'Chicken breast fillets', {
        aliases: ['chicken breast'],
        packSize: 400,
        packUnit: 'g',
      }),
      product('p2', 'Olive oil', { listMode: 'check' }),
      product('p3', 'Sea salt', { aliases: ['salt'], listMode: 'skip' }),
    ];
    const items = buildItems(
      [meal('2026-10-20:dinner', 'curry', 4), meal('2026-10-21:dinner', 'stew', 2)],
      recipes,
      productMatcher(products),
      newId,
    );
    const chicken = items.find((i) => i.productId === 'p1');
    expect(chicken?.name).toBe('Chicken breast fillets');
    expect(chicken?.amounts.mass).toBeCloseTo(900);
    expect(packsNeeded(chicken!.amounts, products[0])).toBe(3);
    expect(items.find((i) => i.productId === 'p2')?.part).toBe('check');
    expect(items.some((i) => i.productId === 'p3')).toBe(false);
  });
});

describe('mergeDecisions', () => {
  it('keeps ticks, choices and manual items when meals change', () => {
    const first = buildItems(
      [meal('2026-10-20:dinner', 'curry', 4)],
      recipes,
      productMatcher([]),
      newId,
    );
    const garlic = first.find((i) => i.name === 'Garlic')!;
    garlic.part = 'have';
    garlic.decided = true;
    first.find((i) => i.name === 'Chicken breast')!.done = true;
    first.push({
      ...garlic,
      id: 'manual1',
      key: 'm:1',
      name: 'Bin bags',
      manual: true,
      sources: [],
    });

    const fresh = buildItems(
      [meal('2026-10-20:dinner', 'curry', 4), meal('2026-10-21:dinner', 'stew', 2)],
      recipes,
      productMatcher([]),
      newId,
    );
    const merged = mergeDecisions(fresh, first);
    expect(merged.find((i) => i.name === 'Garlic')?.part).toBe('have');
    expect(merged.find((i) => i.name === 'Chicken breast')?.done).toBe(true);
    expect(merged.find((i) => i.name === 'Chicken breast')?.amounts.mass).toBeCloseTo(900);
    expect(merged.find((i) => i.name === 'Bin bags')?.manual).toBe(true);
  });
});

describe('packs and prices', () => {
  const rice = product('r', 'Basmati rice', { packSize: 1000, packUnit: 'g', price: 1.89 });
  const amounts = (mass: number) => ({ mass, volume: 0, count: 0, other: {}, unspecified: false });

  it('rounds up to whole packs, allowing a little short', () => {
    expect(packsNeeded(amounts(650), rice)).toBe(1);
    expect(packsNeeded(amounts(1040), rice)).toBe(1);
    expect(packsNeeded(amounts(1200), rice)).toBe(2);
    expect(packsNeeded(amounts(0), rice)).toBeUndefined();
  });

  it('uses offer prices until the offer ends', () => {
    const onOffer = { ...rice, offer: { price: 1.49, until: '2026-10-25' } };
    const item = { amounts: amounts(1200) } as Parameters<typeof itemCost>[0];
    expect(itemCost(item, onOffer, '2026-10-24').total).toBeCloseTo(2.98);
    expect(itemCost(item, onOffer, '2026-10-26').total).toBeCloseTo(3.78);
  });

  it('works out the price per kg', () => {
    expect(unitPrice(rice)).toEqual({ value: 1.89, per: 'kg' });
    expect(
      unitPrice(product('m', 'Mince', { packSize: 500, packUnit: 'g', price: 3.49 }))?.value,
    ).toBeCloseTo(6.98);
  });

  it('formats summed amounts', () => {
    expect(
      formatAmounts({ mass: 1250, volume: 0, count: 0, other: { tbsp: 2 }, unspecified: false }),
    ).toBe('1.25 kg + 2 tbsp');
  });
});
