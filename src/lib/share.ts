// Turns a page shared from Chrome's share menu into a product draft.
// Chrome sends the page title and URL; some apps put everything in `text`.

import { capitalize } from './ingredients';
import type { PackUnit, Shop } from './types';
import { parseDecimal, safeUrl } from './util';

export interface SharedProduct {
  name: string;
  url?: string;
  shop: Shop;
  packSize?: number;
  packUnit?: PackUnit;
}

const packPattern = /(\d+(?:[.,]\d+)?)\s?(kg|g|ml|cl|l|litre|litres)\b/i;

export function parsePackSize(text: string): { packSize: number; packUnit: PackUnit } | undefined {
  const m = packPattern.exec(text);
  if (!m) return undefined;
  const value = parseDecimal(m[1]!);
  if (!value) return undefined;
  const unit = m[2]!.toLowerCase();
  if (unit === 'kg') return { packSize: value * 1000, packUnit: 'g' };
  if (unit === 'g') return { packSize: value, packUnit: 'g' };
  if (unit === 'cl') return { packSize: value * 10, packUnit: 'ml' };
  if (unit === 'ml') return { packSize: value, packUnit: 'ml' };
  return { packSize: value * 1000, packUnit: 'ml' };
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
  return { name, url, shop, ...pack };
}
