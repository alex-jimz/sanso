// Calories, macros and cost per portion of a recipe, worked out from the
// products its ingredients link to. Products store nutrition per 100 g (or
// 100 ml), and grams per piece, clove or spoon for lines that aren't weighed.
// A line that can't be worked out is listed with what's missing, so a total
// can show how many ingredients it covers.

import { isTapWater, normalizeName, parseIngredients, type ParsedLine } from './ingredients';
import type { Nutrition, Product, Recipe } from './types';
import { getUnit } from './units';

export const nutrientKeys = ['kcal', 'protein', 'fat', 'carbs'] as const;
export type NutrientKey = (typeof nutrientKeys)[number];
export type Totals = Record<NutrientKey, number>;

export const nutrientLabels: Record<NutrientKey, string> = {
  kcal: 'Calories',
  protein: 'Protein',
  fat: 'Fat',
  carbs: 'Carbs',
};

/** Recipe units that mean "one of the product's packs" when no weight is set for them. */
const containerUnits = new Set(['pack', 'tin', 'jar', 'bag', 'tub', 'bottle', 'carton', 'sachet']);

/** The key in `Product.weights` for a recipe unit. Plain counts and "pieces" share "piece". */
export function weightKey(unitId: string | undefined): string {
  return !unitId || unitId === 'piece' ? 'piece' : unitId;
}

function positive(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

function nonNegative(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Keeps only valid numbers, for data read from backups and files. */
export function cleanNutrition(raw: unknown): Nutrition | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const source = raw as Record<string, unknown>;
  const out: Nutrition = {};
  for (const key of nutrientKeys) {
    const value = nonNegative(source[key]);
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function cleanWeights(raw: unknown): Record<string, number> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const grams = positive(value);
    if (grams !== undefined && /^[a-z]+$/.test(key)) out[key] = grams;
  }
  return Object.keys(out).length ? out : undefined;
}

export function hasNutrition(n: Nutrition | undefined): n is Required<Nutrition> {
  return !!n && nutrientKeys.every((key) => n[key] !== undefined);
}

export type Missing =
  | { kind: 'product' }
  | { kind: 'amount' }
  | { kind: 'nutrition' }
  | { kind: 'price' }
  | { kind: 'weight'; unit: string };

export interface LineAmount {
  /** Grams, or millilitres for liquids, taken as equal. */
  grams?: number;
  /** Pieces, for products sold by the piece. */
  pieces?: number;
  /** Weight key that's needed to get grams. */
  needs?: string;
}

/** How much of the product a recipe amount is, in grams and, where it makes sense, pieces. */
export function lineAmount(
  quantity: number,
  unitId: string | undefined,
  product: Pick<Product, 'weights' | 'packSize' | 'packUnit'>,
): LineAmount {
  const unit = unitId ? getUnit(unitId) : undefined;
  const pieceWeight = product.weights?.piece;
  if (unit && unit.dimension !== 'other') {
    const grams = quantity * unit.factor;
    return { grams, pieces: pieceWeight ? grams / pieceWeight : undefined };
  }
  const key = weightKey(unit?.id);
  const weight = product.weights?.[key];
  if (key === 'piece') {
    return pieceWeight
      ? { grams: quantity * pieceWeight, pieces: quantity }
      : { pieces: quantity, needs: 'piece' };
  }
  if (weight) {
    const grams = quantity * weight;
    return { grams, pieces: pieceWeight ? grams / pieceWeight : undefined };
  }
  if (containerUnits.has(key) && product.packSize && product.packUnit) {
    if (product.packUnit !== 'pcs') return { grams: quantity * product.packSize };
    const pieces = quantity * product.packSize;
    return pieceWeight ? { grams: pieces * pieceWeight, pieces } : { pieces, needs: 'piece' };
  }
  return { needs: key };
}

export interface LineFacts {
  line: ParsedLine;
  product?: Product;
  /** Per 100 g of `grams`, scaled. Set when the line counts towards nutrition. */
  nutrition?: Totals;
  /** Euro. Set when the line counts towards cost. */
  cost?: number;
  /** What stops the line from counting, for nutrition, cost or both. */
  missing: Missing[];
}

const zero = (): Totals => ({ kcal: 0, protein: 0, fat: 0, carbs: 0 });

function addMissing(list: Missing[], item: Missing) {
  const same = list.some(
    (m) =>
      m.kind === item.kind &&
      (m.kind !== 'weight' || item.kind !== 'weight' || m.unit === item.unit),
  );
  if (!same) list.push(item);
}

/** Works out one ingredient line, using the regular price rather than an offer. */
export function lineFacts(line: ParsedLine, product: Product | undefined): LineFacts {
  if (!product) return { line, missing: [{ kind: 'product' }] };
  if (product.negligible) return { line, product, nutrition: zero(), cost: 0, missing: [] };

  const missing: Missing[] = [];
  const amount =
    line.quantity === undefined ? undefined : lineAmount(line.quantity, line.unit, product);
  if (!amount) addMissing(missing, { kind: 'amount' });

  let nutrition: Totals | undefined;
  const per100 = product.nutrition;
  if (!hasNutrition(per100)) addMissing(missing, { kind: 'nutrition' });
  if (amount && amount.grams === undefined && amount.needs)
    addMissing(missing, { kind: 'weight', unit: amount.needs });
  if (hasNutrition(per100) && amount?.grams !== undefined) {
    const grams = amount.grams;
    nutrition = zero();
    for (const key of nutrientKeys) nutrition[key] = (per100[key] * grams) / 100;
  }

  let cost: number | undefined;
  const { price, packSize, packUnit } = product;
  if (price === undefined || !packSize || !packUnit) addMissing(missing, { kind: 'price' });
  else if (amount) {
    const used = packUnit === 'pcs' ? amount.pieces : amount.grams;
    if (used !== undefined) cost = (price * used) / packSize;
    else
      addMissing(missing, {
        kind: 'weight',
        unit: packUnit === 'pcs' ? 'piece' : (amount.needs ?? 'piece'),
      });
  }

  return { line, product, nutrition, cost, missing };
}

export interface RecipeFacts {
  lines: LineFacts[];
  /** Per portion, from the lines that count. */
  nutrition: Totals;
  cost: number;
  /** Lines that count towards nutrition and cost, out of `lines.length`. */
  nutritionCount: number;
  costCount: number;
}

/** The ingredient lines that matter: not headings, and not tap water. */
export function countedLines(ingredients: string[]): ParsedLine[] {
  return parseIngredients(ingredients).filter(
    (line) => !line.heading && line.name && !isTapWater(normalizeName(line.name)),
  );
}

export function recipeFacts(
  recipe: Pick<Recipe, 'ingredients' | 'portions'>,
  match: (normalized: string) => Product | undefined,
): RecipeFacts {
  const lines = countedLines(recipe.ingredients).map((line) =>
    lineFacts(line, match(normalizeName(line.name))),
  );
  const portions = recipe.portions > 0 ? recipe.portions : 1;
  const nutrition = zero();
  let cost = 0;
  let nutritionCount = 0;
  let costCount = 0;
  for (const facts of lines) {
    if (facts.nutrition) {
      nutritionCount += 1;
      for (const key of nutrientKeys) nutrition[key] += facts.nutrition[key] / portions;
    }
    if (facts.cost !== undefined) {
      costCount += 1;
      cost += facts.cost / portions;
    }
  }
  return { lines, nutrition, cost, nutritionCount, costCount };
}

export interface WeightNeed {
  key: string;
  /** A recipe line that uses it, as typed. */
  example?: string;
}

/**
 * The weights a product's editor should ask for: every unit its recipe lines use
 * that can't be turned into grams otherwise, plus any weight already set.
 */
export function weightsNeeded(
  product: Pick<Product, 'weights' | 'packSize' | 'packUnit'>,
  lines: ParsedLine[],
): WeightNeed[] {
  const needs = new Map<string, WeightNeed>();
  for (const key of Object.keys(product.weights ?? {})) needs.set(key, { key });
  const bare = { ...product, weights: undefined };
  for (const line of lines) {
    if (line.quantity === undefined) continue;
    const amount = lineAmount(line.quantity, line.unit, bare);
    const key = amount.needs;
    if (!key) continue;
    const known = needs.get(key);
    if (!known) needs.set(key, { key, example: line.text });
    else if (!known.example) known.example = line.text;
  }
  // Products sold by the piece need a piece weight to price weighed lines.
  if (product.packUnit === 'pcs' && !needs.has('piece')) {
    const weighed = lines.find(
      (l) => l.quantity !== undefined && lineAmount(l.quantity, l.unit, bare).pieces === undefined,
    );
    if (weighed) needs.set('piece', { key: 'piece', example: weighed.text });
  }
  return [...needs.values()].sort((a, b) =>
    a.key === 'piece' ? -1 : b.key === 'piece' ? 1 : a.key.localeCompare(b.key),
  );
}

/** "1 clove", "1 tbsp", or "1 piece" for plain counts. */
export function weightLabel(key: string): string {
  return `1 ${getUnit(key)?.label[0] ?? key}`;
}

export function formatKcal(value: number): string {
  return String(Math.round(value));
}

/** Grams of a macro: one decimal below 10 g, whole grams above. */
export function formatMacro(value: number): string {
  if (value < 10) return `${Number(value.toFixed(1))} g`;
  return `${Math.round(value)} g`;
}
