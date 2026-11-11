// What a product still needs for shopping lists, calories and cost to work,
// for the Products page's "Missing info" filter.

import { normalizeName, type ParsedLine } from './ingredients';
import type { Resolver } from './matching';
import { countedLines, hasNutrition, weightsNeeded } from './nutrition';
import type { Product, Recipe } from './types';

export type MissingKind = 'price' | 'pack' | 'nutrition' | 'weights' | 'section' | 'photo';

export const missingKinds: MissingKind[] = [
  'price',
  'pack',
  'nutrition',
  'weights',
  'section',
  'photo',
];

export const missingLabels: Record<MissingKind, string> = {
  price: 'Price',
  pack: 'Pack size',
  nutrition: 'Nutrition',
  weights: 'Weights',
  section: 'Section',
  photo: 'Photo',
};

/** Recipe lines by the id of each product they can mean, every alternative included. */
export function linesByProduct(
  recipes: Pick<Recipe, 'ingredients'>[],
  resolve: Resolver,
): Map<string, ParsedLine[]> {
  const out = new Map<string, ParsedLine[]>();
  for (const recipe of recipes) {
    for (const line of countedLines(recipe.ingredients)) {
      for (const { product } of resolve(normalizeName(line.name))) {
        const lines = out.get(product.id);
        if (lines) lines.push(line);
        else out.set(product.id, [line]);
      }
    }
  }
  return out;
}

export interface MissingContext {
  /** False when the product has no shop section, or one that was deleted. */
  hasSection: boolean;
  /** True for parts got from another product, like thighs from a whole chicken, which take its price. */
  isPart: boolean;
  /** Recipe lines that use the product. */
  lines: ParsedLine[];
}

/**
 * What the product is missing. Salt and the like ("Too little to count") need
 * no price or nutrition, products never put on the list need no section or
 * photo, and things that break down into parts take nutrition from the parts.
 */
export function missingInfo(product: Product, context: MissingContext): MissingKind[] {
  const missing: MissingKind[] = [];
  const counts = !product.negligible;
  if (counts && !context.isPart) {
    if (product.price === undefined) missing.push('price');
    if (!product.packSize || !product.packUnit) missing.push('pack');
  }
  if (counts && !product.breakdown?.length) {
    if (!hasNutrition(product.nutrition)) missing.push('nutrition');
    const needs = weightsNeeded(product, context.lines);
    if (needs.some((need) => !product.weights?.[need.key])) missing.push('weights');
  }
  if (product.listMode !== 'skip') {
    if (!context.hasSection) missing.push('section');
    if (!product.photoId && !product.imageUrl) missing.push('photo');
  }
  return missing;
}
