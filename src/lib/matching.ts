// Finds the products an ingredient name can mean, best first:
// 1. The usual pick for the name, if one was set.
// 2. Products whose own name is the name, as "Carrots" and "Small carrots" for
//    "carrots" ("small" is ignored). Shorter names come first.
// 3. Products linked to the name by hand (their aliases).
// 4. Products whose name contains every word of the ingredient, as "Ground beef
//    10% fat" for "ground beef". The ingredient's last word has to be the
//    product's main noun, so "garlic" doesn't find "Garlic bread" and "beef"
//    doesn't find "Beef stock cubes"; only sizes and words like "fat" or
//    "fillets" may follow it.
// 5. The same for common other names, as "beef mince" for "ground beef".
// 1-3 are exact matches; 4 and 5 are suggestions.

import { normalizeName } from './ingredients';
import type { Product } from './types';

export interface ProductMatch {
  product: Product;
  /** Matched by name, alias or usual pick, rather than by the words in its name. */
  exact: boolean;
  /** The usual pick for this name. */
  usual?: boolean;
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
  'organic',
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

/**
 * Words in an ingredient that don't change what to buy, so a product needn't
 * have them: "boneless chicken thighs" finds "Chicken thighs".
 */
const ingredientExtras = new Set([
  'boneless',
  'skinless',
  'lean',
  'extra',
  'free',
  'range',
  'irish',
  'organic',
  'fillet',
  'value',
  'family',
]);

function isQualifier(word: string): boolean {
  return /^\d/.test(word) || qualifiers.has(word);
}

/**
 * True when a product name means the ingredient, by its words. Both are
 * normalised. `loose` lets the ingredient have words like "boneless" or
 * "lean" that the product's name doesn't.
 */
export function wordMatch(ingredient: string, productName: string, loose = false): boolean {
  const words = ingredient.split(' ').filter(Boolean);
  const core = loose ? words.filter((w) => !ingredientExtras.has(w)) : words;
  const want = core.length ? core : words;
  const have = productName.split(' ').filter(Boolean);
  if (!want.length || !want.every((w) => have.includes(w))) return false;
  const head = have.lastIndexOf(want[want.length - 1]!);
  return have.slice(head + 1).every(isQualifier);
}

/** Other names for the same food, mostly American and Irish ones. Normalised. */
const synonymPairs: [string, string][] = [
  ['ground beef', 'beef mince'],
  ['ground pork', 'pork mince'],
  ['ground lamb', 'lamb mince'],
  ['ground turkey', 'turkey mince'],
  ['ground chicken', 'chicken mince'],
  ['zucchini', 'courgette'],
  ['eggplant', 'aubergine'],
  ['cilantro', 'coriander'],
  ['scallion', 'spring onion'],
  ['green onion', 'spring onion'],
  ['garbanzo bean', 'chickpea'],
  ['shrimp', 'prawn'],
  ['arugula', 'rocket'],
  ['heavy cream', 'double cream'],
  ['all purpose flour', 'plain flour'],
  ['powdered sugar', 'icing sugar'],
  ['confectioner sugar', 'icing sugar'],
  ['cornstarch', 'cornflour'],
  ['baking soda', 'bread soda'],
  ['baking soda', 'bicarbonate soda'],
  ['tomato paste', 'tomato puree'],
];

/** The name with each other name it can go by swapped in: "ground beef" -> ["beef mince"]. */
export function synonymKeys(normalized: string): string[] {
  const padded = ` ${normalized} `;
  const out = new Set<string>();
  for (const [a, b] of synonymPairs) {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      if (padded.includes(` ${from} `)) out.add(padded.replace(` ${from} `, ` ${to} `).trim());
    }
  }
  out.delete(normalized);
  return [...out];
}

/** Most suggestions offered for one name, so a common word can't flood the list. */
const maxSuggestions = 10;

interface Entry {
  product: Product;
  key: string;
  /** Words in the name as written, so "Carrots" comes before "Small carrots". */
  words: number;
}

const byLength = (a: Entry, b: Entry) =>
  a.words - b.words || a.product.name.localeCompare(b.product.name);

export function productResolver(products: Product[]): Resolver {
  const entries: Entry[] = products.map((product) => ({
    product,
    key: normalizeName(product.name),
    words: product.name.trim().split(/\s+/).length,
  }));
  const byName = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = byName.get(entry.key) ?? [];
    list.push(entry);
    byName.set(entry.key, list);
  }
  for (const list of byName.values()) list.sort(byLength);
  const byAlias = new Map<string, Product[]>();
  const usual = new Map<string, Product>();
  for (const product of products) {
    for (const alias of product.aliases)
      byAlias.set(alias, [...(byAlias.get(alias) ?? []), product]);
    for (const name of product.usualFor ?? []) usual.set(name, product);
  }
  for (const list of byAlias.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  function direct(name: string): Product[] {
    const out: Product[] = [];
    const add = (p: Product) => {
      if (!out.includes(p)) out.push(p);
    };
    const pick = usual.get(name);
    if (pick) add(pick);
    for (const { product } of byName.get(name) ?? []) add(product);
    for (const product of byAlias.get(name) ?? []) add(product);
    return out;
  }

  function byWords(name: string, skip: Set<Product>): Product[] {
    return entries
      .filter(
        ({ product, key }) =>
          !skip.has(product) && !product.notFor?.includes(name) && wordMatch(name, key, true),
      )
      .sort(
        (a, b) =>
          a.key.split(' ').length - b.key.split(' ').length ||
          a.product.name.localeCompare(b.product.name),
      )
      .map(({ product }) => product);
  }

  const cache = new Map<string, ProductMatch[]>();
  return (normalized) => {
    if (!normalized) return [];
    const hit = cache.get(normalized);
    if (hit) return hit;
    const exact = direct(normalized);
    const seen = new Set(exact);
    const loose: Product[] = [];
    const suggest = (p: Product) => {
      if (seen.has(p) || p.notFor?.includes(normalized)) return;
      seen.add(p);
      loose.push(p);
    };
    byWords(normalized, seen).forEach(suggest);
    for (const other of synonymKeys(normalized)) {
      direct(other).forEach(suggest);
      byWords(other, seen).forEach(suggest);
    }
    const pick = usual.get(normalized);
    const out: ProductMatch[] = [
      ...exact.map((product) => ({ product, exact: true, usual: product === pick })),
      ...loose.slice(0, maxSuggestions).map((product) => ({ product, exact: false })),
    ];
    cache.set(normalized, out);
    return out;
  };
}

export function productMatcher(products: Product[]): Matcher {
  const resolve = productResolver(products);
  return (normalized) => resolve(normalized)[0]?.product;
}
