import { describe, expect, it } from 'vitest';
import {
  chosenLines,
  choiceSignature,
  hasOptions,
  ingredientRows,
  optionGroups,
  splitAlternatives,
  withChoice,
  type IngredientRow,
} from './choices';
import { normalizeName } from './ingredients';
import { productResolver, wordMatch } from './matching';
import { recipeFacts } from './nutrition';
import { buildItems } from './shopping';
import type { Meal, Product, Recipe } from './types';

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

function recipe(ingredients: string[], extra: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r',
    title: 'r',
    tags: [],
    portions: 2,
    ingredients,
    steps: [],
    notes: '',
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

const n = normalizeName;

describe('wordMatch', () => {
  it('matches products whose name contains the ingredient', () => {
    expect(wordMatch(n('ground beef'), n('Ground beef 10% fat'))).toBe(true);
    expect(wordMatch(n('chicken thighs'), n('Irish chicken thigh fillets'))).toBe(true);
    expect(wordMatch(n('greek yogurt'), n('Brooklea Greek Style Yogurt 500g'))).toBe(true);
    expect(wordMatch(n('milk'), n('Cowbell Fresh Milk 2L'))).toBe(true);
  });

  it('needs the ingredient to be what the product is', () => {
    expect(wordMatch(n('garlic'), n('Garlic bread'))).toBe(false);
    expect(wordMatch(n('beef'), n('Beef stock cubes'))).toBe(false);
    expect(wordMatch(n('chicken'), n('Chicken breast fillets'))).toBe(false);
    expect(wordMatch(n('egg'), n('Egg noodles'))).toBe(false);
    expect(wordMatch(n('ground beef'), n('Ground pork'))).toBe(false);
  });
});

describe('productResolver', () => {
  const beef10 = product('b10', 'Ground beef 10% fat');
  const beef20 = product('b20', 'Ground beef 20% fat');
  const coconut = product('cm', 'Coconut milk');

  it('offers every product that matches by its words, shortest name first', () => {
    const resolve = productResolver([
      beef20,
      beef10,
      product('x', 'Ground beef 5% fat value pack'),
    ]);
    expect(resolve('ground beef').map((m) => [m.product.id, m.exact])).toEqual([
      ['b10', false],
      ['b20', false],
      ['x', false],
    ]);
  });

  it('puts an exact match first, then the others', () => {
    const resolve = productResolver([beef20, { ...beef10, aliases: ['ground beef'] }]);
    expect(resolve('ground beef').map((m) => [m.product.id, m.exact])).toEqual([
      ['b10', true],
      ['b20', false],
    ]);
  });

  it('leaves out products marked as not meaning a name', () => {
    expect(productResolver([coconut])('milk')).toHaveLength(1);
    expect(productResolver([{ ...coconut, notFor: ['milk'] }])('milk')).toHaveLength(0);
  });
});

describe('splitAlternatives', () => {
  it('splits on "or", in any case', () => {
    expect(splitAlternatives('600g chicken thighs OR 600g chicken breast')).toEqual([
      '600g chicken thighs',
      '600g chicken breast',
    ]);
  });

  it('copies the amount to an alternative without one', () => {
    expect(splitAlternatives('1 kg potatoes or sweet potatoes')).toEqual([
      '1 kg potatoes',
      '1 kg sweet potatoes',
    ]);
    expect(splitAlternatives('2 tbsp olive oil, or butter')).toEqual([
      '2 tbsp olive oil',
      '2 tbsp butter',
    ]);
    expect(splitAlternatives('Ground beef or turkey mince, 500 g')).toEqual([
      '500 g Ground beef',
      'turkey mince, 500 g',
    ]);
  });

  it('keeps "or" in notes and brackets', () => {
    expect(splitAlternatives('1 onion (or 2 shallots)')).toEqual(['1 onion (or 2 shallots)']);
    expect(splitAlternatives('1 onion, chopped or grated')).toEqual(['1 onion, chopped or grated']);
    expect(splitAlternatives('1 onion, chopped or sliced into rings')).toEqual([
      '1 onion, chopped or sliced into rings',
    ]);
    expect(splitAlternatives('salt or to taste')).toEqual(['salt or to taste']);
    expect(splitAlternatives('For the sauce or dip:')).toEqual(['For the sauce or dip:']);
  });

  it('doesn’t copy a count of cloves to something else', () => {
    expect(splitAlternatives('3 garlic cloves or garlic powder')).toEqual([
      '3 garlic cloves',
      'garlic powder',
    ]);
  });

  it('leaves words containing "or" alone', () => {
    expect(splitAlternatives('200 g chorizo')).toEqual(['200 g chorizo']);
  });
});

describe('ingredientRows', () => {
  const thighs = product('t', 'Chicken thighs', {
    packSize: 1000,
    packUnit: 'g',
    price: 5,
    nutrition: { kcal: 180, protein: 18, fat: 12, carbs: 0 },
  });
  const breast = product('b', 'Chicken breast', {
    packSize: 1000,
    packUnit: 'g',
    price: 8,
    nutrition: { kcal: 110, protein: 23, fat: 2, carbs: 0 },
  });
  const beef10 = product('b10', 'Ground beef 10% fat', {
    packSize: 500,
    packUnit: 'g',
    price: 4,
    nutrition: { kcal: 176, protein: 20, fat: 10, carbs: 0 },
  });
  const beef20 = product('b20', 'Ground beef 20% fat', {
    packSize: 500,
    packUnit: 'g',
    price: 3,
    nutrition: { kcal: 254, protein: 17, fat: 20, carbs: 0 },
  });
  const resolve = productResolver([thighs, breast, beef10, beef20]);
  const lines = [
    'Main:',
    '600 g chicken thighs or 600 g chicken breast',
    '500 g ground beef',
    'salt',
  ];

  it('makes one option per alternative and product, the first picked', () => {
    const rows = ingredientRows(lines, resolve);
    expect(rows.map((r) => (r.heading ? 'heading' : r.options.map((o) => o.key)))).toEqual([
      'heading',
      ['p:t', 'p:b'],
      ['p:b10', 'p:b20'],
      ['n:salt'],
    ]);
    expect(chosenLines(rows).map((l) => l.text)).toEqual([
      'Main:',
      '600 g chicken thighs',
      '500 g ground beef',
      'salt',
    ]);
  });

  it('picks the options named in the choices', () => {
    const rows = ingredientRows(lines, resolve, ['p:b', 'p:b20']);
    expect(chosenLines(rows).map((l) => l.text)).toContain('600 g chicken breast');
    const beef = rows[2] as IngredientRow;
    expect(beef.chosen.product?.id).toBe('b20');
    expect(choiceSignature(rows)).toBe('p:b|p:b20');
  });

  it('changes one pick and keeps the others', () => {
    const rows = ingredientRows(lines, resolve, ['p:b20']);
    const chicken = rows[1] as IngredientRow;
    expect(withChoice(rows, chicken, 'p:b')).toEqual(['p:b', 'p:b20']);
    expect(rows.filter(hasOptions)).toHaveLength(2);
  });

  it('groups options by alternative', () => {
    const rows = ingredientRows(['500 g ground beef or 500 g lentils'], resolve);
    const groups = optionGroups(rows[0] as IngredientRow);
    expect(groups.map((g) => [g.line.text, g.options.map((o) => o.key)])).toEqual([
      ['500 g ground beef', ['p:b10', 'p:b20']],
      ['500 g lentils', ['n:lentil']],
    ]);
  });

  it('counts calories and cost for the picks', () => {
    const r = recipe(lines);
    const first = recipeFacts(r, resolve);
    const other = recipeFacts(r, resolve, ['p:b', 'p:b20']);
    // 600 g thighs and 500 g 10% beef, for 2 portions.
    expect(first.nutrition.kcal).toBeCloseTo((1080 + 880) / 2);
    expect(first.cost).toBeCloseTo((3 + 4) / 2);
    expect(other.nutrition.kcal).toBeCloseTo((660 + 1270) / 2);
    expect(other.cost).toBeCloseTo((4.8 + 3) / 2);
  });

  it('shops for each meal’s picks', () => {
    const recipes = new Map([['r', recipe(lines)]]);
    const meal = (id: string, choices?: string[]): Meal => ({
      id,
      date: id,
      slot: 'dinner',
      recipeId: 'r',
      portions: 2,
      state: 'toShop',
      choices,
    });
    let i = 0;
    const items = buildItems(
      [meal('d1'), meal('d2', ['p:b', 'p:b10'])],
      recipes,
      resolve,
      () => `i${++i}`,
    );
    expect(items.map((it) => [it.key, it.amounts.mass])).toEqual([
      ['p:t', 600],
      ['p:b10', 1000],
      ['n:salt', 0],
      ['p:b', 600],
    ]);
    expect(items.find((it) => it.key === 'p:b')?.sources[0]?.text).toBe('600 g chicken breast');
  });
});
