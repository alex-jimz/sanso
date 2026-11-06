import { describe, expect, it } from 'vitest';
import {
  applyBreakdowns,
  cleanBreakdown,
  coveredBy,
  leftovers,
  needIn,
  packsForPart,
  sourceIndex,
  waysOf,
  wayEstimate,
  withPartCost,
} from './breakdown';
import { emptyAmounts } from './quantity';
import { buildItems, itemCost, itemPacks, mergeDecisions, productMatcher } from './shopping';
import type { Meal, Product, Recipe, ShoppingItem } from './types';

let counter = 0;
const newId = () => `id${++counter}`;

function product(id: string, name: string, extra: Partial<Product> = {}): Product {
  return {
    id,
    name,
    shop: 'any',
    listMode: 'auto',
    aliases: [],
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

function recipe(id: string, ingredients: string[]): Recipe {
  return {
    id,
    title: id,
    tags: [],
    portions: 1,
    ingredients,
    steps: [],
    notes: '',
    createdAt: '',
    updatedAt: '',
  };
}

const meal = (id: string, recipeId: string): Meal => ({
  id,
  date: '2026-11-10',
  slot: 'dinner',
  recipeId,
  portions: 1,
  state: 'toShop',
});

const chicken = product('chicken', 'Whole chicken XL', {
  shop: 'aldi',
  packSize: 2200,
  packUnit: 'g',
  price: 7.99,
  breakdown: [
    { productId: 'breast', amount: 600, unit: 'g', costShare: 45 },
    { productId: 'thigh', amount: 450, unit: 'g', costShare: 30 },
    { productId: 'drum', amount: 2, unit: 'pcs', costShare: 15 },
    { productId: 'carcass', amount: 1, unit: 'pcs' },
  ],
});
const thighPack = product('pack', 'Thigh fillets', {
  shop: 'aldi',
  packSize: 1000,
  packUnit: 'g',
  price: 5.49,
  breakdown: [{ productId: 'thigh', amount: 1000, unit: 'g', costShare: 100 }],
});
const breast = product('breast', 'Chicken breast');
const thigh = product('thigh', 'Chicken thighs');
const drum = product('drum', 'Drumsticks');
const carcass = product('carcass', 'Chicken carcass');
const onion = product('onion', 'Onion', { packSize: 1000, packUnit: 'g', price: 0.99 });
const all = [chicken, thighPack, breast, thigh, drum, carcass, onion];
const byId = new Map(all.map((p) => [p.id, p]));

function list(lines: string[], products = byId): ShoppingItem[] {
  const items = buildItems(
    [meal('m1', 'r1')],
    new Map([['r1', recipe('r1', lines)]]),
    productMatcher([...products.values()]),
    newId,
  );
  return applyBreakdowns(items, products, newId);
}

const find = (items: ShoppingItem[], productId: string) =>
  items.find((i) => i.productId === productId)!;

describe('cleanBreakdown', () => {
  it('keeps valid parts only', () => {
    expect(
      cleanBreakdown(
        [
          { productId: 'a', amount: '450', unit: 'g', costShare: 30 },
          { productId: 'a', amount: 1, unit: 'g' },
          { productId: 'self', amount: 1, unit: 'g' },
          { productId: 'b', amount: 0, unit: 'g' },
          { productId: 'c', amount: 2, unit: 'pcs', costShare: 150 },
          'nonsense',
        ],
        'self',
      ),
    ).toEqual([
      { productId: 'a', amount: 450, unit: 'g', costShare: 30 },
      { productId: 'c', amount: 2, unit: 'pcs', costShare: 100 },
    ]);
    expect(cleanBreakdown([], 'x')).toBeUndefined();
    expect(cleanBreakdown(undefined, 'x')).toBeUndefined();
  });
});

describe('ways', () => {
  it('lists the products a part comes from, and the part itself when it can be bought', () => {
    const index = sourceIndex(all);
    expect(waysOf(thigh, index.get('thigh')!).map((w) => w.via)).toEqual(['chicken', 'pack']);
    const shopThigh = { ...thigh, packSize: 500, packUnit: 'g' as const };
    expect(waysOf(shopThigh, index.get('thigh')!).map((w) => w.via)).toEqual([
      'self',
      'chicken',
      'pack',
    ]);
    expect(waysOf(onion, index.get('onion') ?? [])).toEqual([]);
  });

  it('converts amounts to the part’s unit', () => {
    const amounts = { ...emptyAmounts(), mass: 300, count: 2 };
    expect(needIn(amounts, 'g', { weights: { piece: 120 } })).toBe(540);
    expect(needIn(amounts, 'pcs', { weights: { piece: 150 } })).toBe(4);
    expect(needIn(amounts, 'g', undefined)).toBe(300);
    expect(packsForPart(600, { productId: 'x', amount: 450, unit: 'g' })).toBe(2);
    expect(packsForPart(460, { productId: 'x', amount: 450, unit: 'g' })).toBe(1);
    expect(packsForPart(0, { productId: 'x', amount: 450, unit: 'g' })).toBe(1);
  });
});

describe('applyBreakdowns', () => {
  it('leaves a part undecided until the user chooses, with no default the first time', () => {
    const items = list(['600 g chicken thighs', '1 kg onion']);
    expect(find(items, 'thigh')).toMatchObject({ decided: false, via: undefined });
    expect(items.some((i) => i.forParts)).toBe(false);
  });

  it('suggests the last way used and adds the whole product to cover it', () => {
    const products = new Map(byId);
    products.set('thigh', { ...thigh, lastVia: 'chicken' });
    const items = list(['600 g chicken thighs', '500 g chicken breast'], products);
    expect(find(items, 'thigh')).toMatchObject({ decided: false, via: 'chicken' });
    // Breast has no last way yet, so it waits for a choice.
    expect(find(items, 'breast').via).toBeUndefined();
    const whole = find(items, 'chicken');
    expect(whole).toMatchObject({ forParts: true, partPacks: 2, part: 'buy' });
    expect(itemCost(whole, chicken, '2026-11-06').total).toBeCloseTo(15.98);
  });

  it('buys enough wholes for the part that needs most, and shows what’s left', () => {
    let items = list(['600 g chicken thighs', '500 g chicken breast', '4 drumsticks']);
    items = items.map((i) =>
      i.productId === 'thigh' || i.productId === 'breast' || i.productId === 'drum'
        ? { ...i, decided: true, part: 'buy', via: 'chicken' }
        : i,
    );
    items = applyBreakdowns(items, byId, newId);
    const whole = find(items, 'chicken');
    expect(whole.partPacks).toBe(2);
    const covered = coveredBy('chicken', items, byId);
    expect(covered.map((i) => i.productId).sort()).toEqual(['breast', 'drum', 'thigh']);
    expect(leftovers(chicken, 2, covered, byId)).toEqual([
      '700 g Chicken breast',
      '300 g Chicken thighs',
      'Chicken carcass × 2',
    ]);
  });

  it('drops the whole product when nothing needs it any more, and keeps its tick otherwise', () => {
    let items = list(['600 g chicken thighs']);
    items = applyBreakdowns(
      items.map((i) => (i.productId === 'thigh' ? { ...i, decided: true, via: 'chicken' } : i)),
      byId,
      newId,
    );
    const whole = find(items, 'chicken');
    items = applyBreakdowns(
      items.map((i) => (i.id === whole.id ? { ...i, done: true } : i)),
      byId,
      newId,
    );
    expect(find(items, 'chicken')).toMatchObject({ id: whole.id, done: true });

    // Have it: the chicken goes.
    items = applyBreakdowns(
      items.map((i) => (i.productId === 'thigh' ? { ...i, part: 'have' } : i)),
      byId,
      newId,
    );
    expect(items.some((i) => i.productId === 'chicken')).toBe(false);
  });

  it('adds packs to a recipe’s own use of the whole product', () => {
    let items = list(['1 whole chicken xl', '600 g chicken thighs']);
    items = applyBreakdowns(
      items.map((i) => (i.productId === 'thigh' ? { ...i, decided: true, via: 'chicken' } : i)),
      byId,
      newId,
    );
    const wholes = items.filter((i) => i.productId === 'chicken');
    expect(wholes).toHaveLength(1);
    expect(wholes[0]!.forParts).toBeUndefined();
    expect(wholes[0]!.partPacks).toBe(2);
    // One for the recipe that uses it whole, two for the thighs.
    expect(itemPacks(wholes[0]!, chicken)).toBe(3);
  });

  it('undoes a choice whose way no longer exists', () => {
    let items = list(['600 g chicken thighs']);
    items = items.map((i) => (i.productId === 'thigh' ? { ...i, decided: true, via: 'pack' } : i));
    const products = new Map(byId);
    products.set('pack', { ...thighPack, breakdown: undefined });
    items = applyBreakdowns(items, products, newId);
    expect(find(items, 'thigh')).toMatchObject({ decided: false, via: undefined });
  });

  it('keeps choices and bought-for-parts items through a list rebuild', () => {
    let items = list(['600 g chicken thighs']);
    items = applyBreakdowns(
      items.map((i) => (i.productId === 'thigh' ? { ...i, decided: true, via: 'chicken' } : i)),
      byId,
      newId,
    );
    const whole = find(items, 'chicken');
    const fresh = buildItems(
      [meal('m1', 'r1')],
      new Map([['r1', recipe('r1', ['600 g chicken thighs'])]]),
      productMatcher(all),
      newId,
    );
    const rebuilt = applyBreakdowns(mergeDecisions(fresh, items), byId, newId);
    expect(find(rebuilt, 'thigh')).toMatchObject({ decided: true, via: 'chicken' });
    expect(find(rebuilt, 'chicken').id).toBe(whole.id);
    expect(rebuilt.filter((i) => i.productId === 'chicken')).toHaveLength(1);
  });
});

describe('costs', () => {
  it('estimates each way on its own', () => {
    const item = find(list(['600 g chicken thighs']), 'thigh');
    const index = sourceIndex(all);
    const [viaChicken, viaPack] = waysOf(thigh, index.get('thigh')!);
    expect(wayEstimate(item, thigh, viaChicken!, '2026-11-06')).toMatchObject({ packs: 2 });
    expect(wayEstimate(item, thigh, viaChicken!, '2026-11-06').cost).toBeCloseTo(15.98);
    expect(wayEstimate(item, thigh, viaPack!, '2026-11-06')).toMatchObject({
      packs: 1,
      cost: 5.49,
    });
  });

  it('prices a part by its share of what it comes from', () => {
    const index = sourceIndex(all);
    // Last got from the chicken: 30% of €7.99 for 450 g.
    const viaChicken = withPartCost({ ...thigh, lastVia: 'chicken' }, index);
    expect(viaChicken.price).toBeCloseTo(2.397);
    expect(viaChicken).toMatchObject({ packSize: 450, packUnit: 'g' });
    expect(withPartCost({ ...thigh, lastVia: 'pack' }, index)).toMatchObject({
      price: 5.49,
      packSize: 1000,
    });
    expect(withPartCost(drum, index)).toMatchObject({ packSize: 2, packUnit: 'pcs' });
    // No share: no price.
    expect(withPartCost(carcass, index).price).toBeUndefined();
    // A price of its own wins.
    expect(withPartCost(onion, index)).toBe(onion);
  });
});
