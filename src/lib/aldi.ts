// Product details sent by the aldi.ie helper (src/lib/aldiBookmarklet.js).
//
// The helper runs in Chrome on an aldi.ie page, asks aldi.ie's own product API
// for the products on that page, and opens Sanso at #/aldi?d=<JSON>. Anyone can
// make such a link, so everything here is treated as untrusted input: fields are
// checked one by one, and nothing is saved until the user confirms.
//
// The helper passes Aldi's fields through mostly as they are, and the field
// names below are read defensively, so a renamed field costs one detail
// (such as the was-price) rather than the whole import.

import { addDays } from './dates';
import { packLabel } from './listView';
import { aldiSku, parsePackSize, unitFactor, unitWords } from './share';
import type { Offer, PackUnit, Product } from './types';

export interface AldiItem {
  sku: string;
  name: string;
  url: string;
  imageUrl?: string;
  packSize?: number;
  packUnit?: PackUnit;
  /** Price now, in euro. */
  price?: number;
  /** Price before a price drop, in euro. */
  wasPrice?: number;
}

export interface AldiPayload {
  items: AldiItem[];
  /** The page had more products than the helper reads at once. */
  more: boolean;
}

const maxItems = 100;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** "€1.49", "1,49 €" or "EUR 1.49" in euro. */
export function parseEuro(value: unknown): number | undefined {
  const m = /(\d+)(?:[.,](\d{1,2}))?/.exec(text(value));
  if (!m) return undefined;
  const euro = Number(m[1]) + (m[2] ? Number(m[2].padEnd(2, '0')) / 100 : 0);
  return euro > 0 && euro < 10_000 ? Math.round(euro * 100) / 100 : undefined;
}

/** Aldi's API gives amounts in cent. */
function fromCent(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 1_000_000
    ? value / 100
    : undefined;
}

/** "BRAND NAME" -> "Brand Name"; mixed case is left alone. */
function brandCase(brand: string): string {
  if (brand !== brand.toUpperCase()) return brand;
  return brand
    .toLowerCase()
    .replace(/(^|[\s&'-])(\p{L})/gu, (_m, gap, letter) => gap + letter.toUpperCase());
}

function priceOf(price: Record<string, unknown>): { price?: number; wasPrice?: number } {
  const display = Object.entries(price).find(
    ([key]) => /display$/i.test(key) && !/was|comparison|unit|per|saving/i.test(key),
  );
  const now =
    parseEuro(price.amountRelevantDisplay) ??
    parseEuro(display?.[1]) ??
    fromCent(price.amountRelevant) ??
    fromCent(price.amount);
  const was = parseEuro(price.wasPriceDisplay) ?? fromCent(price.wasPrice);
  return { price: now, wasPrice: was && now && was > now ? was : undefined };
}

/** "€3.78/1 KG", "€1.15 per litre" or "€0.12/100 ML". */
const unitPricePattern = new RegExp(
  `€\\s?(\\d+(?:[.,]\\d{1,2})?)\\s*(?:\\/|per)\\s*(\\d+(?:[.,]\\d+)?)?\\s*(${unitWords})(?![\\p{L}\\d])`,
  'iu',
);

/** Works out the pack size from the price per kg or litre, when the size itself is missing. */
function packFromUnitPrice(price: number | undefined, unitPrice: string) {
  const m = unitPricePattern.exec(unitPrice.includes('€') ? unitPrice : `€${unitPrice}`);
  const perPrice = m ? parseEuro(m[1]) : undefined;
  const unit = m ? unitFactor(m[3]!) : undefined;
  if (!m || !price || !perPrice || !unit) return undefined;
  const amount = Number((m[2] ?? '1').replace(',', '.'));
  const size = Math.round((price / perPrice) * amount * unit.factor);
  return size > 0 ? { packSize: size, packUnit: unit.packUnit } : undefined;
}

/**
 * The pack size printed on the aldi.ie page, e.g. "Cowbell Fresh Milk 1 l €1.15 (€1.15/1 L)".
 * Prices per kg or litre are taken out first, so their "1 L" isn't read as the pack.
 */
function packFromPage(pageText: string) {
  return parsePackSize(withoutUnitPrices(pageText));
}

/** The first plain price on the page, skipping prices per kg or litre. */
function priceFromPage(pageText: string): number | undefined {
  return parseEuro(/€\s?\d+(?:[.,]\d{1,2})?/.exec(withoutUnitPrices(pageText))?.[0]);
}

/** Removes "€1.15/1 L", "€0.25/1 Each" and "€1.15 per litre". */
function withoutUnitPrices(pageText: string): string {
  return pageText.replace(/€\s?[\d.,]+\s*(?:\/|per\b)[^€)]*/giu, ' ');
}

function imageOf(raw: unknown, slug: string): string | undefined {
  const template = text(raw, 600);
  if (!template) return undefined;
  try {
    const url = new URL(template.replace('{width}', '320').replace('{slug}', slug || 'product'));
    if (url.protocol !== 'https:') return undefined;
    if (!/(^|\.)aldi\.(cx|ie)$/i.test(url.hostname)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function readItem(raw: Record<string, unknown>): AldiItem | null {
  const sku = text(raw.sku, 18);
  if (!/^\d{1,18}$/.test(sku)) return null;
  const brand = brandCase(text(raw.brandName ?? raw.brand, 60));
  const plainName = text(raw.name, 120);
  if (!plainName) return null;
  const name =
    brand && !plainName.toLowerCase().startsWith(brand.toLowerCase())
      ? `${brand} ${plainName}`
      : plainName;

  const slug = text(raw.urlSlugText, 160);
  const url = /^[a-z0-9-]+$/i.test(slug)
    ? `https://www.aldi.ie/product/${slug.toLowerCase()}-${sku}`
    : `https://www.aldi.ie/product/${sku}`;

  // What the page itself shows next to the product, read by the helper in case
  // the API leaves a detail out.
  const pageText = text(raw.pageText, 400);
  const price = isObject(raw.price) ? priceOf(raw.price) : { price: parseEuro(raw.priceDisplay) };
  if (price.price === undefined && pageText) price.price = priceFromPage(pageText);

  // The API's own size fields first, then anything else that looks like one.
  const sizeFields = [raw.sellingSize, raw.size, raw.packageSize, raw.weight, raw.volume].concat(
    Object.entries(raw)
      .filter(([key]) => /size|weight|volume/i.test(key))
      .map(([, value]) => value),
  );
  const sizes = sizeFields
    .map((v) => (typeof v === 'number' ? '' : text(v)))
    .filter(Boolean)
    .map((s) => parsePackSize(s));
  const unitPrices = [
    isObject(raw.price) ? text(raw.price.comparisonDisplay) : '',
    pageText,
  ].filter(Boolean);
  const pack =
    sizes.find(Boolean) ??
    (pageText ? packFromPage(pageText) : undefined) ??
    parsePackSize(plainName) ??
    unitPrices.map((u) => packFromUnitPrice(price.price, u)).find(Boolean);

  return {
    sku,
    name,
    url,
    imageUrl: imageOf(raw.image, slug),
    ...pack,
    ...price,
  };
}

/** Reads the helper's data. Throws with a message for the user if it's unusable. */
export function parseAldiPayload(raw: string | null): AldiPayload {
  let data: unknown;
  try {
    data = JSON.parse(raw ?? '');
  } catch {
    throw new Error('This link has no product details in it.');
  }
  if (!isObject(data) || data.v !== 1 || !Array.isArray(data.items)) {
    throw new Error('This link has no product details in it.');
  }
  const seen = new Set<string>();
  const items: AldiItem[] = [];
  for (const entry of data.items.slice(0, maxItems)) {
    const item = isObject(entry) ? readItem(entry) : null;
    if (item && !seen.has(item.sku)) {
      seen.add(item.sku);
      items.push(item);
    }
  }
  if (!items.length) throw new Error('aldi.ie didn’t send any products Sanso could read.');
  return { items, more: data.more === true };
}

/** The product this Aldi item is, by product number or link. */
export function findProduct(products: Product[], item: AldiItem): Product | undefined {
  return (
    products.find((p) => p.sku === item.sku) ??
    products.find((p) => !p.sku && aldiSku(p.url) === item.sku)
  );
}

function sameOffer(a: Offer | undefined, b: Offer | undefined) {
  return a?.price === b?.price && a?.until === b?.until;
}

/**
 * Applies what aldi.ie shows to a product. Prices and pack size come from Aldi;
 * the name, section and list settings stay as the user set them. A price drop
 * becomes an offer for a week, since Aldi doesn't say when it ends. Returns
 * the updated product and the changes worth showing.
 */
export function applyAldi(
  product: Product,
  item: AldiItem,
  today: string,
): { product: Product; changes: string[] } {
  const euro = (n: number) => `€${n.toFixed(2)}`;
  const changes: string[] = [];
  const next: Product = {
    ...product,
    shop: product.shop === 'lidl' ? product.shop : 'aldi',
    sku: item.sku,
    url: product.url ?? item.url,
    imageUrl: item.imageUrl ?? product.imageUrl,
    priceCheckedAt: today,
  };
  if (item.imageUrl && !product.imageUrl) changes.push('Photo');

  const regular = item.wasPrice ?? item.price;
  if (regular !== undefined && regular !== product.price) {
    changes.push(
      product.price === undefined
        ? `Price ${euro(regular)}`
        : `Price ${euro(product.price)} → ${euro(regular)}`,
    );
    next.price = regular;
  }

  if (item.wasPrice && item.price) {
    const current = product.offer && product.offer.until >= today ? product.offer : undefined;
    const offer =
      current?.price === item.price ? current : { price: item.price, until: addDays(today, 6) };
    if (!sameOffer(offer, product.offer)) changes.push(`On offer at ${euro(item.price)}`);
    next.offer = offer;
  }

  if (
    item.packSize &&
    item.packUnit &&
    (item.packSize !== product.packSize || item.packUnit !== product.packUnit)
  ) {
    changes.push(
      product.packSize && product.packUnit
        ? `Pack ${packLabel(product)} → ${packLabel(item)}`
        : `Pack ${packLabel(item)}`,
    );
    next.packSize = item.packSize;
    next.packUnit = item.packUnit;
  }
  return { product: next, changes };
}

/** Fields for a new product made from an Aldi item. */
export function newProductFields(item: AldiItem, today: string): Partial<Product> {
  return {
    shop: 'aldi',
    sku: item.sku,
    url: item.url,
    imageUrl: item.imageUrl,
    packSize: item.packSize,
    packUnit: item.packUnit,
    price: item.wasPrice ?? item.price,
    offer:
      item.wasPrice && item.price ? { price: item.price, until: addDays(today, 6) } : undefined,
    priceCheckedAt: today,
  };
}
