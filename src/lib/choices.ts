// Ingredient lines with options. A line can offer alternatives, written with
// "or": "600 g chicken thighs or 600 g chicken breast". Each alternative can
// also match more than one product, as "ground beef" matches both "Ground beef
// 10% fat" and "Ground beef 20% fat". Every pairing is an option, and a list
// of option keys says which one is picked. Recipes keep the keys picked on the
// recipe page, and meals keep their own, so the shopping list, cooking, the
// PDF, calories and cost all use the same pick.

import { normalizeName, parseIngredient, type ParsedLine } from './ingredients';
import type { Resolver } from './matching';
import type { Product } from './types';

export interface Option {
  /** "p:<product id>", or "n:<normalised name>" for an alternative with no product. */
  key: string;
  line: ParsedLine;
  product?: Product;
  /** True when the product matched by name or alias, not just by the words in its name. */
  exact: boolean;
}

export interface HeadingRow {
  heading: true;
  line: ParsedLine;
}

export interface IngredientRow {
  heading: false;
  /** The alternatives as written, in order. */
  alternatives: ParsedLine[];
  options: Option[];
  chosen: Option;
}

export type Row = HeadingRow | IngredientRow;

const orWord = /\s+or\s+/gi;
const notIngredient = /^(to taste|to serve|optional)\b/i;

/** Splits "1 kg potatoes or sweet potatoes" into lines, each with an amount: "1 kg potatoes", "1 kg sweet potatoes". */
export function splitAlternatives(line: string): string[] {
  const text = line
    .trim()
    .replace(/^[-•*·]\s*/, '')
    .trim();
  if (!text || text.endsWith(':')) return [text];

  // "or" inside brackets is a note, as in "1 onion (or 2 shallots)".
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && /\s/.test(ch!)) {
      orWord.lastIndex = i;
      const m = orWord.exec(text);
      if (m && m.index === i) {
        pieces.push(text.slice(start, i));
        start = i + m[0].length;
        i = start - 1;
      }
    }
  }
  pieces.push(text.slice(start));

  // A piece that isn't an ingredient of its own belongs to the one before,
  // as in "1 onion, chopped or grated" or "salt or to taste".
  // Without an amount of its own, a piece after a note is part of that note,
  // as in "1 onion, chopped or sliced into rings".
  const merged: string[] = [];
  for (const raw of pieces) {
    const piece = raw.trim().replace(/,$/, '').trim();
    const parsed = parseIngredient(piece);
    const previous = merged.length ? parseIngredient(merged[merged.length - 1]!) : null;
    const valid =
      !!piece &&
      !notIngredient.test(piece) &&
      !!parsed &&
      !!normalizeName(parsed.name) &&
      !(previous?.note && parsed.quantity === undefined);
    if (!valid && merged.length) merged[merged.length - 1] += ` or ${raw.trim()}`;
    else merged.push(piece);
  }
  if (merged.length < 2) return [text];

  // An alternative without an amount takes it from the first one that has one.
  // A count of a trailing unit isn't copied: "3 garlic cloves or garlic powder".
  const parsed = merged.map((p) => parseIngredient(p)!);
  const donor = parsed.find((p) => p.quantity !== undefined && p.span);
  if (!donor || (donor.unit && !donor.unitInSpan)) return merged;
  const amount = donor.text.slice(donor.span![0], donor.span![1]).trim();
  return merged.map((piece, i) =>
    parsed[i]!.quantity === undefined ? `${amount} ${piece}` : piece,
  );
}

export function optionKey(product: Product | undefined, normalized: string): string {
  return product ? `p:${product.id}` : `n:${normalized}`;
}

/** Most products offered for one alternative, so a common word can't flood the list. */
const maxProducts = 4;

export function ingredientRows(
  ingredients: string[],
  resolve: Resolver,
  choices: string[] = [],
): Row[] {
  const rows: Row[] = [];
  for (const raw of ingredients) {
    const pieces = splitAlternatives(raw);
    const alternatives = pieces
      .map((p) => parseIngredient(p))
      .filter((p): p is ParsedLine => p !== null);
    const first = alternatives[0];
    if (!first) continue;
    if (first.heading) {
      rows.push({ heading: true, line: first });
      continue;
    }
    const options: Option[] = [];
    for (const line of alternatives) {
      const normalized = normalizeName(line.name);
      const matches = resolve(normalized).slice(0, maxProducts);
      if (!matches.length)
        options.push({ key: optionKey(undefined, normalized), line, exact: false });
      for (const { product, exact } of matches)
        options.push({ key: optionKey(product, normalized), line, product, exact });
    }
    const unique = options.filter((o, i) => options.findIndex((p) => p.key === o.key) === i);
    const chosen = unique.find((o) => choices.includes(o.key)) ?? unique[0]!;
    rows.push({ heading: false, alternatives, options: unique, chosen });
  }
  return rows;
}

export function hasOptions(row: Row): row is IngredientRow {
  return !row.heading && row.options.length > 1;
}

/** The choices with one row's pick changed. Rows without options aren't stored. */
export function withChoice(rows: Row[], row: IngredientRow, key: string): string[] {
  const id = (r: IngredientRow) => r.options.map((o) => o.key).join('|');
  const target = id(row);
  return rows.filter(hasOptions).map((r) => (id(r) === target ? key : r.chosen.key));
}

/** The lines as they'll be cooked: headings, and the picked alternative of each ingredient. */
export function chosenLines(rows: Row[]): ParsedLine[] {
  return rows.map((row) => (row.heading ? row.line : row.chosen.line));
}

/** Identifies the picks, so meals of one recipe with different picks are cooked apart. */
export function choiceSignature(rows: Row[]): string {
  return rows
    .filter(hasOptions)
    .map((r) => r.chosen.key)
    .join('|');
}

/** Options grouped by alternative, for a picker. */
export function optionGroups(row: IngredientRow): { line: ParsedLine; options: Option[] }[] {
  return row.alternatives
    .map((line) => ({ line, options: row.options.filter((o) => o.line.text === line.text) }))
    .filter((g) => g.options.length);
}
