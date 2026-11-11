import { describe, expect, it } from 'vitest';
import { ingredientRows, withChoice, type IngredientRow } from './choices';
import { normalizeName } from './ingredients';
import { lineStatus, needsText, optionFacts } from './lineStatus';
import { productResolver, synonymKeys, wordMatch } from './matching';
import type { Product } from './types';

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

const n = normalizeName;
const ids = (list: { product: Product }[]) => list.map((m) => m.product.id);

describe('productResolver', () => {
  it('offers every product with the same name, shortest first', () => {
    const resolve = productResolver([
      product('small', 'Small carrots'),
      product('organic', 'Organic carrots'),
      product('plain', 'Carrots'),
    ]);
    expect(resolve(n('carrots')).map((m) => [m.product.id, m.exact])).toEqual([
      ['plain', true],
      ['small', true],
      ['organic', false],
    ]);
  });

  it('puts the usual pick first, even before a product with the same name', () => {
    const resolve = productResolver([
      product('plain', 'Carrots'),
      product('organic', 'Organic carrots', { aliases: ['carrot'], usualFor: ['carrot'] }),
    ]);
    expect(resolve('carrot').map((m) => [m.product.id, m.usual])).toEqual([
      ['organic', true],
      ['plain', false],
    ]);
  });

  it('lets several products be linked to one name', () => {
    const resolve = productResolver([
      product('a', 'Arborio', { aliases: ['rice'] }),
      product('j', 'Jasmine', { aliases: ['rice'] }),
    ]);
    expect(resolve('rice').map((m) => [m.product.id, m.exact])).toEqual([
      ['a', true],
      ['j', true],
    ]);
  });

  it('offers every kind of rice, but not rice noodles', () => {
    const rices = [
      'Basmati rice',
      'Brown rice',
      'Long grain rice 1kg',
      'Risotto rice',
      'Wild rice',
    ];
    const resolve = productResolver([
      ...rices.map((name, i) => product(`r${i}`, name)),
      product('noodles', 'Rice noodles'),
    ]);
    expect(ids(resolve('rice'))).toEqual(['r0', 'r1', 'r3', 'r4', 'r2']);
    const row = ingredientRows(['300 g rice'], resolve)[0] as IngredientRow;
    expect(row.options).toHaveLength(5);
  });

  it('ignores words like boneless that a product name leaves out', () => {
    const resolve = productResolver([product('t', 'Chicken thighs')]);
    expect(ids(resolve(n('boneless skinless chicken thighs')))).toEqual(['t']);
    expect(ids(resolve(n('chicken thigh fillets')))).toEqual(['t']);
    // Basic foods still tell lean mince apart.
    expect(wordMatch(n('lean beef mince'), n('Beef mince'))).toBe(false);
    expect(wordMatch(n('lean beef mince'), n('Beef mince'), true)).toBe(true);
  });

  it('suggests products by other names for the same food', () => {
    expect(synonymKeys(n('ground beef'))).toEqual(['beef mince']);
    expect(synonymKeys(n('zucchini'))).toEqual(['courgette']);
    expect(synonymKeys(n('chopped coriander'))).toEqual(['cilantro']);
    const resolve = productResolver([
      product('m', 'Irish beef mince 10% fat'),
      product('c', 'Courgettes'),
    ]);
    expect(resolve(n('ground beef')).map((m) => [m.product.id, m.exact])).toEqual([['m', false]]);
    expect(ids(resolve(n('zucchini')))).toEqual(['c']);
  });
});

describe('withChoice', () => {
  it('keeps the product of every line, so later links don’t change the recipe', () => {
    const resolve = productResolver([
      product('basmati', 'Basmati rice'),
      product('onion', 'Onions'),
      product('t', 'Chicken thighs'),
      product('b', 'Chicken breast'),
    ]);
    const rows = ingredientRows(
      ['300 g rice', '1 onion', '600 g chicken thighs or 600 g chicken breast', 'water'],
      resolve,
    );
    const chicken = rows[2] as IngredientRow;
    expect(withChoice(rows, chicken, 'p:b')).toEqual(['p:basmati', 'p:onion', 'p:b']);

    // Arborio is linked to "rice" later: the recipe keeps Basmati.
    const later = productResolver([
      product('arborio', 'Arborio', { aliases: ['rice'], usualFor: ['rice'] }),
      product('basmati', 'Basmati rice'),
    ]);
    const kept = ingredientRows(['300 g rice'], later, ['p:basmati', 'p:onion', 'p:b']);
    expect((kept[0] as IngredientRow).chosen.product?.id).toBe('basmati');
    expect((ingredientRows(['300 g rice'], later)[0] as IngredientRow).chosen.product?.id).toBe(
      'arborio',
    );
  });

  it('stores a product picked from the whole list for its line', () => {
    const resolve = productResolver([product('basmati', 'Basmati rice')]);
    const rows = ingredientRows(['300 g rice'], resolve);
    expect(withChoice(rows, rows[0] as IngredientRow, 'p:arborio')).toEqual(['p:arborio']);
  });
});

describe('lineStatus', () => {
  const full = product('rice', 'Basmati rice', {
    price: 2,
    packSize: 1000,
    packUnit: 'g',
    nutrition: { kcal: 350, protein: 8, fat: 1, carbs: 77 },
  });
  const rowFor = (line: string, products: Product[]) =>
    ingredientRows([line], productResolver(products))[0] as IngredientRow;

  it('tells apart unlinked, incomplete and ready lines', () => {
    expect(lineStatus(optionFacts(rowFor('300 g rice', []).chosen))).toBe('unlinked');
    expect(lineStatus(optionFacts(rowFor('300 g rice', [full]).chosen))).toBe('ready');
    const bare = { ...full, price: undefined, nutrition: undefined };
    const facts = optionFacts(rowFor('300 g rice', [bare]).chosen);
    expect(lineStatus(facts)).toBe('incomplete');
    expect(needsText(facts!.missing)).toBe('Needs nutrition and price');
    expect(lineStatus(optionFacts(rowFor('200 ml water', []).chosen))).toBe('skip');
  });

  it('names the weight a line needs', () => {
    const garlic = product('g', 'Garlic', {
      price: 0.5,
      packSize: 4,
      packUnit: 'pcs',
      nutrition: { kcal: 149, protein: 6, fat: 0.5, carbs: 31 },
    });
    const facts = optionFacts(rowFor('3 garlic cloves', [garlic]).chosen);
    expect(lineStatus(facts)).toBe('incomplete');
    expect(needsText(facts!.missing)).toMatch(/^Needs weight of 1 clove/);
  });
});
