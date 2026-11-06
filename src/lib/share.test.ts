import { describe, expect, it } from 'vitest';
import { parsePackSize, parseShare } from './share';

const share = (params: Record<string, string>) => parseShare(new URLSearchParams(params));

describe('parseShare', () => {
  it('reads an Aldi product page shared from Chrome', () => {
    expect(
      share({
        title: 'Specially Selected Irish Beef Mince 500g | ALDI.IE',
        url: 'https://www.aldi.ie/product/specially-selected-irish-beef-mince-000000000000315027',
      }),
    ).toEqual({
      name: 'Specially Selected Irish Beef Mince',
      url: 'https://www.aldi.ie/product/specially-selected-irish-beef-mince-000000000000315027',
      shop: 'aldi',
      sku: '000000000000315027',
      packSize: 500,
      packUnit: 'g',
    });
  });

  it('reads multipacks and counts', () => {
    expect(parsePackSize('Sparkling Water 6 x 330ml')).toEqual({ packSize: 1980, packUnit: 'ml' });
    expect(parsePackSize('12 Each')).toEqual({ packSize: 12, packUnit: 'pcs' });
    expect(parsePackSize('1 KG')).toEqual({ packSize: 1000, packUnit: 'g' });
  });

  it('reads the other ways shops write litres and grams', () => {
    expect(parsePackSize('Milk 1 Ltr')).toEqual({ packSize: 1000, packUnit: 'ml' });
    expect(parsePackSize('2Litres')).toEqual({ packSize: 2000, packUnit: 'ml' });
    expect(parsePackSize('750 mls')).toEqual({ packSize: 750, packUnit: 'ml' });
    expect(parsePackSize('500 grams')).toEqual({ packSize: 500, packUnit: 'g' });
    expect(parsePackSize('1.5 kgs')).toEqual({ packSize: 1500, packUnit: 'g' });
    expect(parsePackSize('1 LTR')).toEqual({ packSize: 1000, packUnit: 'ml' });
  });

  it('doesn’t read words that start with a unit letter as a size', () => {
    expect(parsePackSize('2 Lemons')).toBeUndefined();
    expect(parsePackSize('3 Large Onions')).toBeUndefined();
    expect(parsePackSize('5 gluten free wraps')).toBeUndefined();
  });

  it('finds the link inside the text and names the product from it', () => {
    expect(share({ text: 'https://www.lidl.ie/p/basmati-rice-1kg/p10012345' })).toMatchObject({
      shop: 'lidl',
      url: 'https://www.lidl.ie/p/basmati-rice-1kg/p10012345',
      packSize: 1000,
      packUnit: 'g',
    });
  });

  it('drops links that are not web links', () => {
    expect(share({ title: 'Milk 2L', url: 'javascript:alert(1)' })).toEqual({
      name: 'Milk',
      url: undefined,
      shop: 'any',
      packSize: 2000,
      packUnit: 'ml',
    });
  });

  it('returns nothing for an empty share', () => {
    expect(share({})).toBeNull();
  });
});

describe('parsePackSize', () => {
  it.each([
    ['500g', { packSize: 500, packUnit: 'g' }],
    ['1.5kg', { packSize: 1500, packUnit: 'g' }],
    ['75cl', { packSize: 750, packUnit: 'ml' }],
    ['2 L', { packSize: 2000, packUnit: 'ml' }],
    ['1,5 l', { packSize: 1500, packUnit: 'ml' }],
  ])('%s', (text, expected) => {
    expect(parsePackSize(text)).toEqual(expected);
  });
});
