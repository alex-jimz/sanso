import { formatAmounts, formatMetric } from './quantity';
import { packsNeeded } from './shopping';
import type { Product, ShoppingItem } from './types';

/** "400 g", "1 l" or "6-pack". */
export function packLabel(product: Product): string {
  if (!product.packSize || !product.packUnit) return '';
  if (product.packUnit === 'pcs') return `${product.packSize}-pack`;
  return formatMetric(product.packSize, product.packUnit === 'g' ? 'mass' : 'volume');
}

/** What to pick up, as in "650 g · 2 × 400 g" or "3 · 1 × 6-pack". */
export function itemAmount(item: ShoppingItem, product: Product | undefined): string {
  const amount = formatAmounts(item.amounts);
  const packs = packsNeeded(item.amounts, product);
  const parts = [amount];
  if (packs && product) parts.push(`${packs} × ${packLabel(product)}`);
  if (item.note) parts.push(item.note);
  return parts.filter(Boolean).join(' · ');
}

export function itemProduct(
  item: ShoppingItem,
  products: Map<string, Product>,
): Product | undefined {
  return item.productId ? products.get(item.productId) : undefined;
}
