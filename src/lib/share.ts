// Turns a page shared from Chrome's share menu into a product draft.
// Chrome sends the page title and URL; some apps put everything in `text`.

import { capitalize } from './ingredients';
import type { PackUnit, Product, Shop } from './types';
import { parseDecimal, safeUrl } from './util';

/** A new product's details from another app or from aldi.ie, before the user saves it. */
export type SharedProduct = Pick<Product, 'name' | 'shop'> &
  Partial<
    Pick<
      Product,
      'url' | 'sku' | 'imageUrl' | 'packSize' | 'packUnit' | 'price' | 'offer' | 'priceCheckedAt'
    >
  >;

/** Weight and volume units as shops write them, longest spellings first. */
export const unitWords =
  'kilograms?|kilos?|kgm|kgs?|grams?|grammes?|grm|gr|g|millilitres?|milliliters?|mlt|mls?|cl|litres?|liters?|ltrs?|lt|l';
const packPattern = new RegExp(
  `(?:(\\d+)\\s?x\\s?)?(\\d+(?:[.,]\\d+)?)\\s?(${unitWords})(?![\\p{L}\\d])`,
  'iu',
);
const countPattern = /\b(\d+)\s?(each|pack|pk|pcs|pieces)\b/i;

/** How many g or ml one of `unit` is: "kg" -> 1000 g, "cl" -> 10 ml, "Ltr" -> 1000 ml. */
export function unitFactor(unit: string): { factor: number; packUnit: PackUnit } | undefined {
  const u = unit.toLowerCase();
  if (/^(kilo|kg)/.test(u)) return { factor: 1000, packUnit: 'g' };
  if (/^(gr|g)/.test(u)) return { factor: 1, packUnit: 'g' };
  if (/^(millil|ml)/.test(u)) return { factor: 1, packUnit: 'ml' };
  if (u === 'cl') return { factor: 10, packUnit: 'ml' };
  if (/^l/.test(u)) return { factor: 1000, packUnit: 'ml' };
  return undefined;
}

/** "500g", "1.5 KG", "1 Ltr", "6 x 330ml" (1980 ml) or "4 Each" (4 pieces). */
export function parsePackSize(text: string): { packSize: number; packUnit: PackUnit } | undefined {
  const m = packPattern.exec(text);
  if (!m) {
    const count = countPattern.exec(text);
    const n = count ? Number(count[1]) : 0;
    return n > 0 ? { packSize: n, packUnit: 'pcs' } : undefined;
  }
  const value = parseDecimal(m[2]!);
  const unit = unitFactor(m[3]!);
  if (!value || !unit) return undefined;
  const times = m[1] ? Number(m[1]) : 1;
  return {
    packSize: Math.round(times * value * unit.factor * 1000) / 1000,
    packUnit: unit.packUnit,
  };
}

/** Aldi's product number from an aldi.ie product link, e.g. …/cucina-penne-000000000000282766. */
export function aldiSku(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { hostname, pathname } = new URL(url);
    if (!/(^|\.)aldi\.ie$/i.test(hostname)) return undefined;
    return /\/product\/[^/]*-(\d{6,18})\/?$/.exec(pathname)?.[1];
  } catch {
    return undefined;
  }
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[|–—-]\s*(aldi|lidl)\b.*$/i, '')
    .replace(/^\s*(aldi|lidl)(\.ie)?\s*[|:–—-]\s*/i, '')
    .replace(packPattern, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,–—-]+$/, '')
    .trim();
}

function nameFromUrl(url: string): string {
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
  return capitalize(
    decodeURIComponent(slug)
      .replace(/\.html?$/, '')
      .replace(/[-_]?\d{6,}$/, '')
      .replace(/^p?\d+[-_]/, '')
      .replace(/[-_]+/g, ' ')
      .trim(),
  );
}

export function parseShare(params: URLSearchParams): SharedProduct | null {
  const title = params.get('title')?.trim() ?? '';
  const text = params.get('text')?.trim() ?? '';
  const url = safeUrl(params.get('url') ?? /(https?:\/\/\S+)/.exec(text)?.[1]);
  if (!title && !text && !url) return null;

  const host = url ? new URL(url).hostname : '';
  const shop: Shop = /(^|\.)aldi\./i.test(host)
    ? 'aldi'
    : /(^|\.)lidl\./i.test(host)
      ? 'lidl'
      : 'any';
  const textWithoutUrl = text.replace(/https?:\/\/\S+/g, '').trim();
  const rawName = title || textWithoutUrl;
  const name = cleanTitle(rawName) || (url ? nameFromUrl(url) : '');
  const pack =
    parsePackSize(rawName) ??
    (url ? parsePackSize(new URL(url).pathname.replace(/-/g, ' ')) : undefined);
  return { name, url, shop, sku: aldiSku(url), ...pack };
}
