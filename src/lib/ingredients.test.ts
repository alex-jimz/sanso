import { describe, expect, it } from 'vitest';
import { isTapWater, normalizeName, parseIngredient, parseNumber, scaleLine } from './ingredients';

function parse(line: string) {
  const result = parseIngredient(line);
  if (!result) throw new Error(`no result for "${line}"`);
  return result;
}

describe('parseNumber', () => {
  it.each([
    ['2', 2],
    ['1.5', 1.5],
    ['1,5', 1.5],
    ['1,500', 1500],
    ['1/2', 0.5],
    ['1 1/2', 1.5],
    ['½', 0.5],
    ['1½', 1.5],
    ['1 ½', 1.5],
  ])('%s -> %d', (raw, expected) => {
    expect(parseNumber(raw)).toBeCloseTo(expected);
  });
});

describe('parseIngredient', () => {
  it('reads weights with and without a space', () => {
    expect(parse('600 g chicken breast')).toMatchObject({
      quantity: 600,
      unit: 'g',
      name: 'chicken breast',
    });
    expect(parse('600g chicken breast')).toMatchObject({
      quantity: 600,
      unit: 'g',
      name: 'chicken breast',
    });
    expect(parse('1.5kg potatoes')).toMatchObject({ quantity: 1.5, unit: 'kg', name: 'potatoes' });
    expect(parse('200 ml milk')).toMatchObject({ quantity: 200, unit: 'ml', name: 'milk' });
  });

  it('reads counts and trailing units', () => {
    expect(parse('1 onion')).toMatchObject({ quantity: 1, unit: undefined, name: 'onion' });
    expect(parse('3 garlic cloves')).toMatchObject({
      quantity: 3,
      unit: 'clove',
      name: 'garlic',
      unitInSpan: false,
    });
    expect(parse('3 cloves garlic')).toMatchObject({
      quantity: 3,
      unit: 'clove',
      name: 'garlic',
      unitInSpan: true,
    });
    expect(parse('3 cloves of garlic')).toMatchObject({
      quantity: 3,
      unit: 'clove',
      name: 'garlic',
    });
  });

  it('reads lines without an amount', () => {
    expect(parse('salt')).toMatchObject({ quantity: undefined, name: 'salt' });
    expect(parse('Salt and pepper, to taste')).toMatchObject({
      name: 'Salt and pepper',
      note: 'to taste',
    });
  });

  it('reads fractions, ranges and words', () => {
    expect(parse('½ tsp cumin')).toMatchObject({ quantity: 0.5, unit: 'tsp', name: 'cumin' });
    expect(parse('1 1/2 tbsp olive oil')).toMatchObject({
      quantity: 1.5,
      unit: 'tbsp',
      name: 'olive oil',
    });
    expect(parse('2-3 tbsp soy sauce')).toMatchObject({
      quantity: 3,
      unit: 'tbsp',
      name: 'soy sauce',
    });
    expect(parse('a pinch of salt')).toMatchObject({ quantity: 1, unit: 'pinch', name: 'salt' });
    expect(parse('two onions')).toMatchObject({ quantity: 2, name: 'onions' });
    expect(parse('half a lemon')).toMatchObject({ quantity: 0.5, name: 'lemon' });
    expect(parse('a little oil')).toMatchObject({ quantity: undefined, name: 'a little oil' });
  });

  it('reads tins and pack sizes', () => {
    expect(parse('2 x 400 g tins chopped tomatoes')).toMatchObject({
      quantity: 800,
      unit: 'g',
      name: 'chopped tomatoes',
    });
    expect(parse('1 (400 g) tin chopped tomatoes')).toMatchObject({
      quantity: 400,
      unit: 'g',
      name: 'chopped tomatoes',
    });
    expect(parse('1 tin chickpeas')).toMatchObject({ quantity: 1, unit: 'tin', name: 'chickpeas' });
    expect(parse('200g/7oz plain flour')).toMatchObject({
      quantity: 200,
      unit: 'g',
      name: 'plain flour',
    });
  });

  it('splits notes from the name', () => {
    expect(parse('1 onion, finely chopped')).toMatchObject({
      name: 'onion',
      note: 'finely chopped',
    });
    expect(parse('2 eggs (beaten)')).toMatchObject({ quantity: 2, name: 'eggs', note: 'beaten' });
    expect(parse('olive oil for frying')).toMatchObject({ name: 'olive oil', note: 'for frying' });
  });

  it('reads an amount after the name', () => {
    expect(parse('Chicken breast 600 g')).toMatchObject({
      quantity: 600,
      unit: 'g',
      name: 'Chicken breast',
    });
    expect(parse('Pasta: 100g')).toMatchObject({ quantity: 100, unit: 'g', name: 'Pasta' });
  });

  it('handles headings, bullets and blank lines', () => {
    expect(parse('For the sauce:')).toMatchObject({ heading: true, name: 'For the sauce' });
    expect(parse('- 200 g flour')).toMatchObject({ text: '200 g flour', quantity: 200, unit: 'g' });
    expect(parseIngredient('   ')).toBeNull();
  });

  it('does not mistake words for units', () => {
    expect(parse('2 large eggs')).toMatchObject({
      quantity: 2,
      unit: undefined,
      name: 'large eggs',
    });
    expect(parse('1 lemon')).toMatchObject({ quantity: 1, unit: undefined, name: 'lemon' });
    expect(parse('2 tomatoes')).toMatchObject({ quantity: 2, unit: undefined, name: 'tomatoes' });
  });
});

describe('scaleLine', () => {
  it('rewrites only the amount', () => {
    expect(scaleLine(parse('600 g chicken breast'), 0.5)).toBe('300 g chicken breast');
    expect(scaleLine(parse('3 garlic cloves'), 0.5)).toBe('1½ garlic cloves');
    expect(scaleLine(parse('1 kg potatoes'), 0.5)).toBe('500 g potatoes');
    expect(scaleLine(parse('500 g pasta'), 3)).toBe('1.5 kg pasta');
    expect(scaleLine(parse('2 tbsp olive oil'), 0.25)).toBe('½ tbsp olive oil');
    expect(scaleLine(parse('a pinch of salt'), 2)).toBe('2 pinches of salt');
    expect(scaleLine(parse('Chicken breast 600 g'), 0.5)).toBe('Chicken breast 300 g');
    expect(scaleLine(parse('salt'), 2)).toBe('salt');
  });

  it('leaves the line alone at the original size', () => {
    expect(scaleLine(parse('600g chicken breast'), 1)).toBe('600g chicken breast');
  });

  it('makes counted nouns agree with the new amount', () => {
    expect(scaleLine(parse('1 onion, chopped'), 2)).toBe('2 onions, chopped');
    expect(scaleLine(parse('1 red pepper'), 1.5)).toBe('1½ red peppers');
    expect(scaleLine(parse('2 large eggs'), 0.5)).toBe('1 large egg');
    expect(scaleLine(parse('3 garlic cloves'), 1 / 3)).toBe('1 garlic clove');
    expect(scaleLine(parse('1 potato'), 3)).toBe('3 potatoes');
    expect(scaleLine(parse('two onions'), 0.5)).toBe('1 onion');
    expect(scaleLine(parse('1 tin chickpeas'), 2)).toBe('2 tins chickpeas');
  });
});

describe('normalizeName', () => {
  it('matches plurals, case, accents and descriptors', () => {
    expect(normalizeName('Fresh Tomatoes')).toBe('tomato');
    expect(normalizeName('tomato')).toBe('tomato');
    expect(normalizeName('large onions')).toBe('onion');
    expect(normalizeName('Jalapeño')).toBe('jalapeno');
    expect(normalizeName('berries')).toBe('berry');
    expect(normalizeName('bay leaves')).toBe(normalizeName('bay leaf'));
    expect(normalizeName('hummus')).toBe('hummus');
    expect(normalizeName('chickpeas')).toBe('chickpea');
  });

  it('recognises tap water but not bought water', () => {
    expect(isTapWater('water')).toBe(true);
    expect(isTapWater(normalizeName('boiling water'))).toBe(true);
    expect(isTapWater(normalizeName('coconut water'))).toBe(false);
  });
});
