// Finds the products an ingredient name can mean. A product's own name or one
// of its aliases is an exact match, and comes first. After it come products
// whose name contains every word of the ingredient, as "Ground beef 10% fat"
// for "ground beef". The ingredient's last word has to be the product's main
// noun, so "garlic" doesn't find "Garlic bread" and "beef" doesn't find
// "Beef stock cubes"; only sizes and words like "fat" or "fillets" may follow it.

import { normalizeName } from './ingredients';
import type { Product } from './types';

export interface ProductMatch {
  product: Product;
  /** Matched by name or alias, rather than by the words in its name. */
  exact: boolean;
}

/** Products an ingredient name can mean, best first. */
export type Resolver = (normalized: string) => ProductMatch[];

/** The best product for a name. */
export type Matcher = (normalized: string) => Product | undefined;

/** Words that can follow a product's main noun without changing what it is. */
const qualifiers = new Set([
  'fat',
  'lean',
  'extra',
  'pack',
  'value',
  'family',
  'fillet',
  'boneless',
  'skinless',
  'bone',
  'skin',
  'in',
  'on',
  'off',
  'free',
  'range',
  'irish',
  'x',
  'g',
  'kg',
  'ml',
  'l',
  'cl',
  'pc',
  'pcs',
  'piece',
]);

function isQualifier(word: string): boolean {
  return /^\d/.test(word) || qualifiers.has(word);
}

/** True when a product name means the ingredient, by its words. Both are normalised. */
export function wordMatch(ingredient: string, productName: string): boolean {
  const want = ingredient.split(' ').filter(Boolean);
  const have = productName.split(' ').filter(Boolean);
  if (!want.length || !want.every((w) => have.includes(w))) return false;
  const head = have.lastIndexOf(want[want.length - 1]!);
  return have.slice(head + 1).every(isQualifier);
}

const maxWordMatches = 6;

export function productResolver(products: Product[]): Resolver {
  const exact = new Map<string, Product>();
  for (const product of products) {
    for (const alias of product.aliases) exact.set(alias, product);
  }
  // Names win over aliases, so a product is always found by its own name.
  const named = products.map((product) => ({ product, key: normalizeName(product.name) }));
  for (const { product, key } of named) exact.set(key, product);

  const cache = new Map<string, ProductMatch[]>();
  return (normalized) => {
    if (!normalized) return [];
    const hit = cache.get(normalized);
    if (hit) return hit;
    const first = exact.get(normalized);
    const byWords = named
      .filter(
        ({ product, key }) =>
          product !== first &&
          key !== normalized &&
          !product.notFor?.includes(normalized) &&
          wordMatch(normalized, key),
      )
      .sort(
        (a, b) =>
          a.key.split(' ').length - b.key.split(' ').length ||
          a.product.name.localeCompare(b.product.name),
      )
      .slice(0, maxWordMatches);
    const out: ProductMatch[] = [
      ...(first ? [{ product: first, exact: true }] : []),
      ...byWords.map(({ product }) => ({ product, exact: false })),
    ];
    cache.set(normalized, out);
    return out;
  };
}

export function productMatcher(products: Product[]): Matcher {
  const resolve = productResolver(products);
  return (normalized) => resolve(normalized)[0]?.product;
}
