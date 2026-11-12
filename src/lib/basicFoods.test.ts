import { describe, expect, it } from 'vitest';
import {
  applyFill,
  basicFoods,
  fillFrom,
  isEmptyFill,
  searchBasicFoods,
  suggestBasicFood,
} from './basicFoods';
import { hasNutrition } from './nutrition';

const food = (name: string) => basicFoods.find((f) => f.name === name)!;

describe('the basic foods table', () => {
  it('has complete values for every food, with fibre left out of carbs', () => {
    expect(basicFoods.length).toBeGreaterThan(90);
    for (const f of basicFoods) {
      expect(hasNutrition(f), f.name).toBe(true);
      expect(f.protein + f.fat + f.carbs, f.name).toBeLessThanOrEqual(100.5);
    }
    // USDA SR Legacy: onions 40 kcal, 1.1 g protein, 9.34 g carbs with 1.7 g fibre.
    expect(food('Onion')).toMatchObject({ kcal: 40, protein: 1.1, fat: 0.1, carbs: 7.6 });
    expect(food('Onion').weights).toMatchObject({ piece: 110 });
    expect(food('Garlic').weights).toMatchObject({ clove: 3 });
  });

  it('has unique names', () => {
    expect(new Set(basicFoods.map((f) => f.name)).size).toBe(basicFoods.length);
  });
});

describe('suggestBasicFood', () => {
  it('matches names, aliases and longer shop names', () => {
    expect(suggestBasicFood('Onions')?.name).toBe('Onion');
    expect(suggestBasicFood('Irish brown onions')?.name).toBe('Onion');
    expect(suggestBasicFood('Loose carrots')?.name).toBe('Carrot');
    expect(suggestBasicFood('Rooster potatoes')?.name).toBe('Potato');
    expect(suggestBasicFood('Sweet potatoes')?.name).toBe('Sweet potato');
    expect(suggestBasicFood('Leeks')?.name).toBe('Leek');
    expect(suggestBasicFood('Ground beef 20% fat')?.name).toBe('Beef mince 20% fat');
    expect(suggestBasicFood('Irish beef mince')?.name).toBe('Beef mince 10% fat');
  });

  it('prefers the longest name it contains', () => {
    expect(suggestBasicFood('Spring onions')?.name).toBe('Spring onion');
    expect(suggestBasicFood('Chicken thigh fillets')?.name).toBe('Chicken thighs');
  });

  it('leaves out things that only end in a food word, or aren’t food in the table', () => {
    expect(suggestBasicFood('Black pepper')).toBeUndefined();
    expect(suggestBasicFood('Sesame oil')).toBeUndefined();
    expect(suggestBasicFood('Garlic bread')).toBeUndefined();
    expect(suggestBasicFood('Chicken stock cubes')).toBeUndefined();
    expect(suggestBasicFood('Turkey mince')).toBeUndefined();
  });
});

describe('searchBasicFoods', () => {
  it('finds foods by name or alias', () => {
    expect(searchBasicFoods('courgette').map((f) => f.name)).toEqual(['Courgette']);
    expect(searchBasicFoods('zucchini').map((f) => f.name)).toEqual(['Courgette']);
    expect(searchBasicFoods('').length).toBe(basicFoods.length);
  });
});

describe('fillFrom', () => {
  it('adds nutrition and weights a product doesn’t have', () => {
    const fill = fillFrom(food('Garlic'), { weights: { clove: 5 } });
    expect(fill.nutrition).toEqual({ kcal: 149, protein: 6.4, fat: 0.5, carbs: 31 });
    expect(fill.weights).toEqual({ tsp: 2.8 });
    expect(applyFill({ weights: { clove: 5 } }, fill)).toEqual({
      nutrition: fill.nutrition,
      weights: { clove: 5, tsp: 2.8 },
    });
  });

  it('keeps nutrition that’s already complete', () => {
    const own = { kcal: 45, protein: 1, fat: 0, carbs: 9 };
    const fill = fillFrom(food('Onion'), { nutrition: own });
    expect(fill.nutrition).toBeUndefined();
    expect(fill.weights).toEqual({ piece: 110, tbsp: 10 });
    expect(applyFill({ nutrition: own }, fill).nutrition).toBe(own);
  });

  it('switches values per piece back to per 100 g when it fills them', () => {
    const fill = fillFrom(food('Onion'), { nutrition: { kcal: 44 } });
    expect(applyFill({ nutritionPer: 'piece' as const }, fill).nutritionPer).toBeUndefined();
  });

  it('has nothing to add when everything is set', () => {
    const fill = fillFrom(food('Kale'), { nutrition: { kcal: 1, protein: 1, fat: 1, carbs: 1 } });
    expect(isEmptyFill(fill)).toBe(true);
  });
});
