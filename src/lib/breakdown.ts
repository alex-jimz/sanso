// Products that break down into parts at home, like a whole chicken into
// breasts, thighs, drumsticks, wings and a carcass. A part can then be got in
// more than one way: as a product of its own, or by buying something that
// breaks down into it. Shopping lists ask which way, work out how many of the
// whole product to buy, and show what's left over for the freezer.

import { emptyAmounts, formatMetric, formatNumber } from './quantity';
import { activeOffer, packsNeeded } from './shopping';
import type { Amounts, BreakdownPart, Product, ShoppingItem, Via } from './types';

export interface Source {
  source: Product;
  part: BreakdownPart;
}

export interface Way {
  via: Via;
  /** Set for ways through a product that breaks down into this one. */
  from?: Source;
}

function positive(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Keeps only valid parts, for data read from backups and files. */
export function cleanBreakdown(raw: unknown, ownId: string): BreakdownPart[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: BreakdownPart[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { productId, amount, unit, costShare } = entry as Record<string, unknown>;
    const value = positive(amount);
    if (typeof productId !== 'string' || productId === ownId || seen.has(productId) || !value)
      continue;
    seen.add(productId);
    const share = typeof costShare === 'number' ? costShare : Number(costShare);
    out.push({
      productId,
      amount: value,
      unit: unit === 'pcs' ? 'pcs' : 'g',
      costShare:
        costShare !== undefined && costShare !== null && costShare !== '' && share >= 0
          ? Math.min(100, share)
          : undefined,
    });
  }
  return out.length ? out : undefined;
}

/** A product that can be bought as it is, because it has a pack size or a price. */
export function isShopProduct(product: Pick<Product, 'packSize' | 'price'>): boolean {
  return product.packSize !== undefined || product.price !== undefined;
}

/** Products that break down into each product, by the part's product id. */
export function sourceIndex(products: Iterable<Product>): Map<string, Source[]> {
  const index = new Map<string, Source[]>();
  for (const source of products) {
    for (const part of source.breakdown ?? []) {
      if (part.productId === source.id) continue;
      index.set(part.productId, [...(index.get(part.productId) ?? []), { source, part }]);
    }
  }
  return index;
}

/** The ways to get a product. Only products that something breaks down into have a choice. */
export function waysOf(product: Product, sources: Source[]): Way[] {
  if (!sources.length) return [];
  return [
    ...(isShopProduct(product) ? [{ via: 'self' }] : []),
    ...sources.map((from) => ({ via: from.source.id, from })),
  ];
}

/** How much of an item's amounts is in a part's unit. Lines that can't be converted are left out. */
export function needIn(
  amounts: Amounts,
  unit: BreakdownPart['unit'],
  product: Pick<Product, 'weights'> | undefined,
): number {
  const piece = product?.weights?.piece;
  let grams = amounts.mass + amounts.volume;
  let pieces = amounts.count;
  for (const [unitId, quantity] of Object.entries(amounts.other)) {
    if (unitId === 'piece') pieces += quantity;
    else {
      const weight = product?.weights?.[unitId];
      if (weight) grams += quantity * weight;
    }
  }
  if (unit === 'g') return grams + (piece ? pieces * piece : 0);
  return pieces + (piece ? grams / piece : 0);
}

/** Whole packs of the source needed for an amount of one part, allowing 5% short. */
export function packsForPart(need: number, part: BreakdownPart): number {
  if (!(need > 0)) return 1;
  return Math.max(1, Math.ceil(need / part.amount - 0.05));
}

/** The source an item is bought through, if it is covered by one. */
export function coveringSource(
  item: ShoppingItem,
  products: Map<string, Product>,
): Source | undefined {
  if (!item.via || item.via === 'self' || item.part === 'have' || !item.productId) return;
  const source = products.get(item.via);
  const part = source?.breakdown?.find((p) => p.productId === item.productId);
  return source && part ? { source, part } : undefined;
}

/** An item still waiting for the user to say how to get it. */
export function needsChoice(item: ShoppingItem, index: Map<string, Source[]>): boolean {
  return !item.manual && !item.decided && !!item.productId && !!index.get(item.productId)?.length;
}

/**
 * Brings a list up to date with the products' breakdowns: suggests the last
 * way used for items that haven't been decided, and adds or updates the
 * items for products bought to cover other items' parts.
 */
export function applyBreakdowns(
  items: ShoppingItem[],
  products: Map<string, Product>,
  newId: () => string,
): ShoppingItem[] {
  const index = sourceIndex(products.values());
  const oldForParts = new Map<string, ShoppingItem>();
  const out: ShoppingItem[] = [];
  for (const item of items) {
    if (item.forParts) {
      if (!oldForParts.has(item.key)) oldForParts.set(item.key, item);
      continue;
    }
    const next: ShoppingItem = { ...item, partPacks: undefined };
    const product = next.productId ? products.get(next.productId) : undefined;
    const sources = product ? (index.get(product.id) ?? []) : [];
    if (!next.manual && product && sources.length) {
      const valid = (via: Via | undefined) =>
        via === 'self' ? isShopProduct(product) : sources.some((s) => s.source.id === via);
      if (next.decided && next.via !== undefined && !valid(next.via)) next.decided = false;
      if (!next.decided) next.via = valid(product.lastVia) ? product.lastVia : undefined;
    } else if (!next.manual) {
      next.via = undefined;
    }
    out.push(next);
  }

  const packs = new Map<string, number>();
  for (const item of out) {
    const covering = coveringSource(item, products);
    if (!covering) continue;
    const part = products.get(item.productId!);
    const n = packsForPart(needIn(item.amounts, covering.part.unit, part), covering.part);
    packs.set(covering.source.id, Math.max(packs.get(covering.source.id) ?? 0, n));
  }

  for (const [sourceId, n] of packs) {
    const key = `p:${sourceId}`;
    const direct = out.find((i) => i.key === key && !i.manual);
    if (direct) {
      direct.partPacks = n;
      continue;
    }
    const source = products.get(sourceId)!;
    const old = oldForParts.get(key);
    out.push({
      ...(old ?? {
        id: newId(),
        key,
        part: 'buy',
        decided: true,
        amounts: emptyAmounts(),
        sources: [],
        manual: false,
        done: false,
      }),
      productId: sourceId,
      name: source.name,
      forParts: true,
      partPacks: n,
      via: undefined,
    });
  }
  return out;
}

/** Items bought through a source, as in the thighs and breast a chicken is bought for. */
export function coveredBy(
  sourceId: string,
  items: ShoppingItem[],
  products: Map<string, Product>,
): ShoppingItem[] {
  return items.filter((i) => coveringSource(i, products)?.source.id === sourceId);
}

/** "600 g Chicken thighs" or "Drumsticks × 4". */
export function partLabel(name: string, amount: number, unit: BreakdownPart['unit']): string {
  if (unit === 'pcs') return `${name} × ${formatNumber(Math.round(amount * 10) / 10)}`;
  return `${formatMetric(amount, 'mass')} ${name}`;
}

/** What a number of packs gives beyond what the list needs, for the freezer. */
export function leftovers(
  source: Product,
  packs: number,
  covered: ShoppingItem[],
  products: Map<string, Product>,
): string[] {
  const out: string[] = [];
  for (const part of source.breakdown ?? []) {
    const product = products.get(part.productId);
    if (!product) continue;
    const item = covered.find((i) => i.productId === part.productId);
    const used = item ? needIn(item.amounts, part.unit, product) : 0;
    const left = packs * part.amount - used;
    const minimum = part.unit === 'g' ? 10 : 0.5;
    if (left >= minimum) out.push(partLabel(product.name, left, part.unit));
  }
  return out;
}

/** Packs and estimated cost of getting an item one way, on its own. */
export function wayEstimate(
  item: ShoppingItem,
  product: Product,
  way: Way,
  today: string,
): { packs?: number; cost?: number; packProduct: Product } {
  const packProduct = way.from?.source ?? product;
  const packs = way.from
    ? packsForPart(needIn(item.amounts, way.from.part.unit, product), way.from.part)
    : packsNeeded(item.amounts, product);
  const price = activeOffer(packProduct, today)?.price ?? packProduct.price;
  return {
    packs,
    cost: price === undefined ? undefined : price * (packs ?? 1),
    packProduct,
  };
}

/**
 * A product with a price and pack size taken from what it breaks down from,
 * for cost per portion. Parts without a cost share are free. Products with a
 * price of their own keep it.
 */
export function withPartCost(product: Product, index: Map<string, Source[]>): Product {
  if (product.price !== undefined && product.packSize && product.packUnit) return product;
  const sources = (index.get(product.id) ?? []).filter(
    (s) => s.source.price !== undefined && s.part.costShare !== undefined,
  );
  const chosen = sources.find((s) => s.source.id === product.lastVia) ?? sources[0];
  if (!chosen) return product;
  return {
    ...product,
    price: (chosen.source.price! * chosen.part.costShare!) / 100,
    packSize: chosen.part.amount,
    packUnit: chosen.part.unit === 'pcs' ? 'pcs' : 'g',
  };
}
