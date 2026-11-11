// Whether an ingredient line on a recipe is ready for calories, cost and the
// shopping list: linked to a product, and that product has what the line needs.

import type { Option } from './choices';
import { isTapWater, normalizeName } from './ingredients';
import { lineFacts, weightLabel, type LineFacts, type Missing } from './nutrition';
import type { Product } from './types';

/** "unlinked": no product. "incomplete": the product is missing something. "skip": tap water. */
export type LineStatus = 'ready' | 'unlinked' | 'incomplete' | 'skip';

export function optionFacts(
  option: Pick<Option, 'line' | 'product'>,
  priced: (product: Product) => Product = (p) => p,
): LineFacts | undefined {
  const { line, product } = option;
  if (!line.name || isTapWater(normalizeName(line.name))) return undefined;
  return lineFacts(line, product && priced(product));
}

export function lineStatus(facts: LineFacts | undefined): LineStatus {
  if (!facts) return 'skip';
  if (!facts.product) return 'unlinked';
  return facts.missing.length ? 'incomplete' : 'ready';
}

/**
 * What a line is missing, as short phrases: "nutrition", "price",
 * "weight of 1 clove". Parts like chicken thighs need a cost share instead of a price.
 */
export function missingPhrases(missing: Missing[], isPart = false): string[] {
  return missing.flatMap((m) => {
    if (m.kind === 'product') return [];
    if (m.kind === 'amount') return ['an amount in the recipe'];
    if (m.kind === 'nutrition') return ['nutrition'];
    if (m.kind === 'price') return [isPart ? 'a cost share' : 'price'];
    return [`weight of ${weightLabel(m.unit)}`];
  });
}

/** "Needs nutrition and price", or "" when nothing is missing. */
export function needsText(missing: Missing[], isPart = false): string {
  const phrases = missingPhrases(missing, isPart);
  if (!phrases.length) return '';
  const list =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
  return `Needs ${list}`;
}
