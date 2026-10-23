// Builds the shopping list from planned meals.
// Lines for the same product (or, without a product, the same name) are merged,
// scaled to each meal's portions, and sorted into "To buy" and "Check what you have".

import { capitalize, isTapWater, normalizeName, parseIngredient, scaleLine } from './ingredients';
import { emptyAmounts } from './quantity';
import type { Amounts, ItemPart, Meal, Product, Recipe, ShoppingItem } from './types';
import { getUnit } from './units';

export type Matcher = (normalized: string) => Product | undefined;

/** Finds products by normalised name or by one of their aliases. */
export function productMatcher(products: Product[]): Matcher {
  const map = new Map<string, Product>();
  for (const product of products) {
    for (const alias of product.aliases) map.set(alias, product);
  }
  // Names win over aliases, so a product is always found by its own name.
  for (const product of products) map.set(normalizeName(product.name), product);
  return (normalized) => map.get(normalized);
}

export function addAmount(
  amounts: Amounts,
  quantity: number | undefined,
  unitId: string | undefined,
) {
  if (quantity === undefined) {
    amounts.unspecified = true;
    return;
  }
  const unit = unitId ? getUnit(unitId) : undefined;
  if (!unit) amounts.count += quantity;
  else if (unit.dimension === 'mass') amounts.mass += quantity * unit.factor;
  else if (unit.dimension === 'volume') amounts.volume += quantity * unit.factor;
  else amounts.other[unit.id] = (amounts.other[unit.id] ?? 0) + quantity;
}

/** Weighed or measured items go on the list; anything vague may already be at home. */
export function defaultPart(amounts: Amounts, product?: Product): ItemPart {
  if (product?.listMode === 'check') return 'check';
  return amounts.mass > 0 || amounts.volume > 0 ? 'buy' : 'check';
}

export function itemKey(product: Product | undefined, normalized: string): string {
  return product ? `p:${product.id}` : `n:${normalized}`;
}

export function buildItems(
  meals: Meal[],
  recipeById: Map<string, Recipe>,
  match: Matcher,
  newId: () => string,
): ShoppingItem[] {
  const items = new Map<string, ShoppingItem>();
  const productByKey = new Map<string, Product>();
  for (const meal of meals) {
    if (meal.state === 'noCooking' || !meal.recipeId) continue;
    const recipe = recipeById.get(meal.recipeId);
    if (!recipe) continue;
    const factor = meal.portions / (recipe.portions || 1);
    for (const raw of recipe.ingredients) {
      const line = parseIngredient(raw);
      if (!line || line.heading || !line.name) continue;
      const normalized = normalizeName(line.name);
      if (!normalized || isTapWater(normalized)) continue;
      const product = match(normalized);
      if (product?.listMode === 'skip') continue;
      const key = itemKey(product, normalized);
      let item = items.get(key);
      if (!item) {
        item = {
          id: newId(),
          key,
          productId: product?.id,
          name: product?.name ?? capitalize(line.name),
          part: 'buy',
          decided: false,
          amounts: emptyAmounts(),
          sources: [],
          manual: false,
          done: false,
        };
        items.set(key, item);
        if (product) productByKey.set(key, product);
      }
      addAmount(
        item.amounts,
        line.quantity === undefined ? undefined : line.quantity * factor,
        line.unit,
      );
      item.sources.push({ mealId: meal.id, recipeId: recipe.id, text: scaleLine(line, factor) });
    }
  }
  for (const item of items.values())
    item.part = defaultPart(item.amounts, productByKey.get(item.key));
  return [...items.values()];
}

/**
 * Rebuilds the list for a new set of meals without losing what the user did:
 * ticks, "have it" / "buy" choices, sections and manual items carry over.
 */
export function mergeDecisions(fresh: ShoppingItem[], old: ShoppingItem[]): ShoppingItem[] {
  const generated = old.filter((item) => !item.manual);
  const byKey = new Map(generated.map((item) => [item.key, item]));
  const byName = new Map(generated.map((item) => [normalizeName(item.name), item]));
  const merged = fresh.map((item) => {
    const prev = byKey.get(item.key) ?? byName.get(normalizeName(item.name));
    if (!prev) return item;
    return {
      ...item,
      id: prev.id,
      part: prev.decided ? prev.part : item.part,
      decided: prev.decided,
      done: prev.done,
      sectionId: prev.sectionId ?? item.sectionId,
      note: prev.note,
    };
  });
  return [...merged, ...old.filter((item) => item.manual)];
}

/** Whole packs needed, allowing 5% short so 410 g still means one 400 g pack. */
export function packsNeeded(amounts: Amounts, product: Product | undefined): number | undefined {
  if (!product?.packSize || !product.packUnit) return undefined;
  const need =
    product.packUnit === 'g'
      ? amounts.mass
      : product.packUnit === 'ml'
        ? amounts.volume
        : amounts.count;
  if (!(need > 0)) return undefined;
  return Math.max(1, Math.ceil(need / product.packSize - 0.05));
}

export function activeOffer(product: Product | undefined, today: string) {
  return product?.offer && product.offer.until >= today ? product.offer : undefined;
}

/** Estimated cost of an item: packs times pack price, using the offer price when there is one. */
export function itemCost(item: ShoppingItem, product: Product | undefined, today: string) {
  const offer = activeOffer(product, today);
  const unitPrice = offer?.price ?? product?.price;
  const packs = packsNeeded(item.amounts, product);
  return {
    packs,
    offer,
    total: unitPrice === undefined ? undefined : unitPrice * (packs ?? 1),
  };
}

/** Price per kg, litre or piece, as shown on supermarket labels. */
export function unitPrice(product: Product): { value: number; per: string } | undefined {
  if (!product.price || !product.packSize || !product.packUnit) return undefined;
  if (product.packUnit === 'pcs') return { value: product.price / product.packSize, per: 'each' };
  return {
    value: (product.price / product.packSize) * 1000,
    per: product.packUnit === 'g' ? 'kg' : 'l',
  };
}
