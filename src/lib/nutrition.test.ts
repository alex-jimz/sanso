import { describe, expect, it } from 'vitest';
import { parseIngredient } from './ingredients';
import {
  cleanNutrition,
  cleanWeights,
  formatMacro,
  lineAmount,
  lineFacts,
  recipeFacts,
  weightsNeeded,
} from './nutrition';
import { productResolver } from './shopping';
import type { Product } from './types';

function product(name: string, extra: Partial<Product> = {}): Product {
  return {
    id: name,
    name,
    shop: 'aldi',
    listMode: 'auto',
    aliases: [],
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

const line = (text: string) => parseIngredient(text)!;

const chicken = product('Chicken breast', {
  nutrition: { kcal: 106, protein: 24, fat: 1, carbs: 0 },
  packSize: 1000,
  packUnit: 'g',
  price: 8,
});
const onion = product('Onion', {
  nutrition: { kcal: 40, protein: 1.1, fat: 0.1, carbs: 7.6 },
  packSize: 1000,
  packUnit: 'g',
  price: 1,
  weights: { piece: 150 },
});
const garlic = product('Garlic', {
  nutrition: { kcal: 149, protein: 6.4, fat: 0.5, carbs: 31 },
  packSize: 4,
  packUnit: 'pcs',
  price: 1.2,
  weights: { clove: 5, piece: 50 },
});
const salt = product('Salt', { negligible: true });

describe('lineAmount', () => {
  it('converts weighed and measured amounts directly', () => {
    expect(lineAmount(1.2, 'kg', chicken)).toEqual({ grams: 1200, pieces: undefined });
    expect(lineAmount(200, 'ml', product('Milk'))).toEqual({ grams: 200, pieces: undefined });
  });

  it('uses the piece weight for plain counts', () => {
    expect(lineAmount(2, undefined, onion)).toEqual({ grams: 300, pieces: 2 });
    expect(lineAmount(2, undefined, product('Leek'))).toEqual({ pieces: 2, needs: 'piece' });
  });

  it('uses unit weights, as for cloves and spoons', () => {
    expect(lineAmount(3, 'clove', garlic)).toEqual({ grams: 15, pieces: 0.3 });
    expect(lineAmount(1, 'tbsp', product('Olive oil'))).toEqual({ needs: 'tbsp' });
  });

  it('treats a tin or pack as one of the product’s packs', () => {
    const tomatoes = product('Chopped tomatoes', { packSize: 400, packUnit: 'g' });
    expect(lineAmount(2, 'tin', tomatoes)).toEqual({ grams: 800 });
    const eggs = product('Eggs', { packSize: 6, packUnit: 'pcs' });
    expect(lineAmount(1, 'pack', eggs)).toEqual({ pieces: 6, needs: 'piece' });
  });
});

describe('lineFacts', () => {
  it('works out nutrition and cost for a weighed line', () => {
    const facts = lineFacts(line('500 g chicken breast'), chicken);
    expect(facts.missing).toEqual([]);
    expect(facts.nutrition).toEqual({ kcal: 530, protein: 120, fat: 5, carbs: 0 });
    expect(facts.cost).toBeCloseTo(4);
  });

  it('prices a line by the piece for products sold in pieces', () => {
    const facts = lineFacts(line('3 garlic cloves'), garlic);
    expect(facts.nutrition?.kcal).toBeCloseTo(22.35);
    // 15 g is 0.3 of a 50 g bulb; a bulb costs €0.30.
    expect(facts.cost).toBeCloseTo(0.09);
  });

  it('counts negligible products as zero, even without an amount', () => {
    expect(lineFacts(line('salt'), salt)).toMatchObject({
      nutrition: { kcal: 0 },
      cost: 0,
      missing: [],
    });
  });

  it('lists what is missing', () => {
    expect(lineFacts(line('2 carrots'), undefined).missing).toEqual([{ kind: 'product' }]);
    expect(lineFacts(line('olive oil'), product('Olive oil')).missing).toEqual([
      { kind: 'amount' },
      { kind: 'nutrition' },
      { kind: 'price' },
    ]);
    const leek = product('Leek', { packSize: 500, packUnit: 'g', price: 1.5 });
    expect(lineFacts(line('1 leek'), leek).missing).toEqual([
      { kind: 'nutrition' },
      { kind: 'weight', unit: 'piece' },
    ]);
  });

  it('needs every nutrient before a line counts', () => {
    const partial = product('Rice', { nutrition: { kcal: 350 }, packSize: 1000, packUnit: 'g' });
    expect(lineFacts(line('100 g rice'), partial).nutrition).toBeUndefined();
  });
});

describe('recipeFacts', () => {
  it('adds up per portion and counts the lines that are covered', () => {
    const match = productResolver([chicken, onion, garlic, salt]);
    const facts = recipeFacts(
      {
        portions: 2,
        ingredients: [
          'For the chicken:',
          '500 g chicken breast',
          '1 onion, chopped',
          '3 garlic cloves',
          'salt',
          '100 ml water',
          '1 tbsp olive oil',
        ],
      },
      match,
    );
    // Headings and tap water don't count; olive oil has no product.
    expect(facts.lines).toHaveLength(5);
    expect(facts.nutritionCount).toBe(4);
    expect(facts.costCount).toBe(4);
    expect(facts.nutrition.kcal).toBeCloseTo((530 + 60 + 22.35) / 2);
    expect(facts.nutrition.protein).toBeCloseTo((120 + 1.65 + 0.96) / 2);
    expect(facts.cost).toBeCloseTo((4 + 0.15 + 0.09) / 2);
  });

  it('costs recipes at regular prices, even while a product is on offer', () => {
    // An offer that covers any day the test runs on: 500 g at €8 per kg is €4, not €2.
    const onOffer = {
      ...chicken,
      offers: [{ price: 4, from: '2000-01-06', until: '2999-12-31' }],
    };
    const facts = recipeFacts(
      { portions: 1, ingredients: ['500 g chicken breast'] },
      productResolver([onOffer]),
    );
    expect(facts.cost).toBeCloseTo(4);
  });
});

describe('weightsNeeded', () => {
  it('asks for the units recipes use that have no weight', () => {
    const lines = ['3 garlic cloves', '1 bulb garlic', '20 g garlic', 'garlic'].map(line);
    expect(weightsNeeded(product('Garlic'), lines)).toEqual([
      { key: 'bulb', example: '1 bulb garlic' },
      { key: 'clove', example: '3 garlic cloves' },
    ]);
  });

  it('keeps weights already set and asks for a piece weight for products sold by the piece', () => {
    const lines = [line('20 g garlic')];
    expect(weightsNeeded(garlic, lines).map((w) => w.key)).toEqual(['piece', 'clove']);
    const loose = product('Garlic', { packSize: 4, packUnit: 'pcs' });
    expect(weightsNeeded(loose, lines)).toEqual([{ key: 'piece', example: '20 g garlic' }]);
  });

  it('needs nothing for tins when the pack size is known', () => {
    const tomatoes = product('Chopped tomatoes', { packSize: 400, packUnit: 'g' });
    expect(weightsNeeded(tomatoes, [line('1 tin chopped tomatoes')])).toEqual([]);
  });
});

describe('cleaning', () => {
  it('keeps only valid numbers', () => {
    expect(cleanNutrition({ kcal: '120', protein: -1, fat: 0, carbs: 'x' })).toEqual({
      kcal: 120,
      fat: 0,
    });
    expect(cleanNutrition('nope')).toBeUndefined();
    expect(cleanWeights({ clove: 5, tbsp: 0, 'bad key': 3 })).toEqual({ clove: 5 });
    expect(cleanWeights({})).toBeUndefined();
  });

  it('formats macros', () => {
    expect(formatMacro(3.14)).toBe('3.1 g');
    expect(formatMacro(38.6)).toBe('39 g');
  });
});
