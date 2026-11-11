import { describe, expect, it } from 'vitest';
import { parseIngredients } from './ingredients';
import { productResolver } from './matching';
import { linesByProduct, missingInfo, type MissingContext } from './missingInfo';
import type { Product } from './types';

function product(name: string, extra: Partial<Product> = {}): Product {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    shop: 'aldi',
    listMode: 'auto',
    aliases: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...extra,
  };
}

const complete: Partial<Product> = {
  price: 1.89,
  packSize: 1000,
  packUnit: 'g',
  sectionId: 'grains',
  imageUrl: 'https://example.com/rice.jpg',
  nutrition: { kcal: 350, protein: 7, fat: 1, carbs: 78 },
};

const context = (extra: Partial<MissingContext> = {}): MissingContext => ({
  hasSection: true,
  isPart: false,
  lines: [],
  ...extra,
});

describe('missingInfo', () => {
  it('finds nothing missing on a complete product', () => {
    expect(missingInfo(product('Rice', complete), context())).toEqual([]);
  });

  it('lists everything a new product lacks', () => {
    expect(missingInfo(product('Rice'), context({ hasSection: false }))).toEqual([
      'price',
      'pack',
      'nutrition',
      'section',
      'photo',
    ]);
  });

  it('asks for weights that recipe lines need', () => {
    const lines = parseIngredients(['3 garlic cloves']);
    const garlic = product('Garlic', { ...complete, packUnit: 'g', packSize: 250 });
    expect(missingInfo(garlic, context({ lines }))).toEqual(['weights']);
    expect(missingInfo({ ...garlic, weights: { clove: 5 } }, context({ lines }))).toEqual([]);
  });

  it('needs no price or nutrition for salt and the like', () => {
    const salt = product('Salt', { negligible: true, sectionId: 'x', photoId: 'ph' });
    expect(missingInfo(salt, context())).toEqual([]);
  });

  it('needs no section or photo for things never put on the list', () => {
    const water = product('Water', { ...complete, imageUrl: undefined, listMode: 'skip' });
    expect(missingInfo(water, context({ hasSection: false }))).toEqual([]);
  });

  it('needs no price for parts, and no nutrition for what breaks down into them', () => {
    const thighs = product('Chicken thighs', {
      ...complete,
      price: undefined,
      packSize: undefined,
    });
    expect(missingInfo(thighs, context({ isPart: true }))).toEqual([]);
    const chicken = product('Whole chicken', {
      ...complete,
      nutrition: undefined,
      breakdown: [{ productId: 'chicken-thighs', amount: 450, unit: 'g' }],
    });
    expect(missingInfo(chicken, context())).toEqual([]);
  });
});

describe('linesByProduct', () => {
  it('collects every alternative of a line for each product it can mean', () => {
    const beef10 = product('Ground beef 10% fat');
    const beef20 = product('Ground beef 20% fat');
    const garlic = product('Garlic');
    const lines = linesByProduct(
      [{ ingredients: ['500 g ground beef or 500 g lentils', '3 garlic cloves', 'Sauce:'] }],
      productResolver([beef10, beef20, garlic]),
    );
    expect(lines.get(beef10.id)?.map((l) => l.text)).toEqual(['500 g ground beef']);
    expect(lines.get(beef20.id)?.map((l) => l.text)).toEqual(['500 g ground beef']);
    expect(lines.get(garlic.id)?.map((l) => l.text)).toEqual(['3 garlic cloves']);
    expect(lines.size).toBe(3);
  });
});
