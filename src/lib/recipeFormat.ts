// Recipes as schema.org/Recipe JSON-LD, the format recipe websites embed for
// search engines and that recipe apps such as Mealie can import.
//
// An export is one JSON file: {"@context": "https://schema.org", "@graph": [...]},
// with photos inlined as data URLs. Import reads that, a single recipe, or the
// JSON-LD inside a saved web page.

import type { Recipe } from './types';

/** Marks recipes exported by Sanso, whose tags, score and notes can be trusted as ours. */
const idPrefix = 'sanso:';

export interface ImportedRecipe {
  title: string;
  tags: string[];
  portions: number;
  prepMinutes?: number;
  totalMinutes?: number;
  score?: number;
  ingredients: string[];
  steps: string[];
  notes: string;
  createdAt?: string;
  /** An inlined photo (data URL). */
  photo?: string;
  /** True if the recipe has a photo that is only a link, which can't be imported. */
  linkedPhoto: boolean;
  fromSanso: boolean;
}

export interface ImportResult {
  recipes: ImportedRecipe[];
  /** Tags from Sanso exports that aren't in this phone's tag list yet. */
  newTags: string[];
}

// Export

export function toIsoDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `PT${h ? `${h}H` : ''}${m || !h ? `${m}M` : ''}`;
}

export function toSchemaRecipe(recipe: Recipe, photo?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {
    '@type': 'Recipe',
    identifier: `${idPrefix}${recipe.id}`,
    name: recipe.title,
  };
  if (photo) out.image = photo;
  out.recipeYield = `${recipe.portions} ${recipe.portions === 1 ? 'portion' : 'portions'}`;
  if (recipe.prepMinutes) out.prepTime = toIsoDuration(recipe.prepMinutes);
  if (recipe.totalMinutes) out.totalTime = toIsoDuration(recipe.totalMinutes);
  if (recipe.tags.length) {
    out.recipeCategory = recipe.tags;
    out.keywords = recipe.tags.join(', ');
  }
  out.recipeIngredient = recipe.ingredients;
  out.recipeInstructions = recipe.steps.map((text) => ({ '@type': 'HowToStep', text }));
  if (recipe.notes.trim()) out.description = recipe.notes;
  if (recipe.score !== undefined) {
    out.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: recipe.score,
      bestRating: 10,
      worstRating: 0,
      ratingCount: 1,
    };
  }
  out.dateCreated = recipe.createdAt;
  out.dateModified = recipe.updatedAt;
  return out;
}

export function recipesFile(recipes: { recipe: Recipe; photo?: string }[]): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': recipes.map(({ recipe, photo }) => toSchemaRecipe(recipe, photo)),
  });
}

// Import

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  deg: '°',
};

/** Websites often put HTML in these fields. Keeps the text only. */
export function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]\w*);/gi, (match, code: string) => {
      if (code[0] === '#') {
        const n =
          code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
      }
      return entities[code.toLowerCase()] ?? match;
    })
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasType(value: Record<string, unknown>, type: string): boolean {
  return asArray(value['@type']).some((t) => typeof t === 'string' && t.endsWith(type));
}

/** "PT1H20M", "P0DT45M" or "PT90M" in minutes. Undefined if it can't be read. */
export function parseIsoDuration(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const m =
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
      value.trim(),
    );
  if (!m || !m.slice(1).some(Boolean)) return undefined;
  const [days, hours, minutes, seconds] = m.slice(1).map((v) => Number(v ?? 0));
  const total = Math.round(days! * 1440 + hours! * 60 + minutes! + seconds! / 60);
  return total > 0 ? total : undefined;
}

/** "4 servings", "Serves 4-6", 4 or ["4", "4 servings"] in portions. */
export function parseYield(value: unknown): number | undefined {
  for (const item of asArray(value)) {
    if (typeof item === 'number' && item > 0) return Math.round(item);
    const m = typeof item === 'string' ? /\d+/.exec(item) : null;
    if (m && Number(m[0]) > 0) return Number(m[0]);
  }
  return undefined;
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+[.)]|step \d+:?)\s*/i, '').trim())
    .filter(Boolean);
}

/** Steps from a string, a list of strings, HowToSteps or HowToSections. */
export function parseInstructions(value: unknown): string[] {
  const steps: string[] = [];
  for (const item of asArray(value)) {
    if (typeof item === 'string') steps.push(...splitLines(plainText(item)));
    else if (isObject(item) && hasType(item, 'HowToSection'))
      steps.push(...parseInstructions(item.itemListElement));
    else if (isObject(item)) {
      const text = plainText(item.text) || plainText(item.name);
      if (text) steps.push(...splitLines(text));
    }
  }
  return steps;
}

function imageOf(value: unknown): string | undefined {
  for (const item of asArray(value)) {
    if (typeof item === 'string' && item) return item;
    if (isObject(item) && typeof item.url === 'string') return item.url;
  }
  return undefined;
}

const photoDataUrl = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

/** Every schema.org Recipe in a parsed JSON-LD document. */
function findRecipes(value: unknown, found: Record<string, unknown>[] = [], depth = 0) {
  if (depth > 6) return found;
  for (const item of asArray(value)) {
    if (!isObject(item)) continue;
    if (hasType(item, 'Recipe')) found.push(item);
    else {
      findRecipes(item['@graph'], found, depth + 1);
      findRecipes(item.mainEntity, found, depth + 1);
      findRecipes(item.itemListElement, found, depth + 1);
      findRecipes(item.item, found, depth + 1);
    }
  }
  return found;
}

/** Parses JSON, or pulls the JSON-LD blocks out of a saved web page. */
function documentsIn(text: string): unknown[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return [JSON.parse(trimmed)];
  const blocks = [
    ...text.matchAll(
      /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  const docs: unknown[] = [];
  for (const block of blocks) {
    try {
      docs.push(JSON.parse(block[1]!));
    } catch {
      // A broken block on a web page shouldn't stop the others.
    }
  }
  return docs;
}

function readRecipe(
  raw: Record<string, unknown>,
  knownTags: Map<string, string>,
  defaultPortions: number,
  newTags: Set<string>,
): ImportedRecipe | null {
  const title = plainText(raw.name);
  if (!title) return null;
  const fromSanso = typeof raw.identifier === 'string' && raw.identifier.startsWith(idPrefix);

  // Websites fill keywords with search terms, so only tags this phone already
  // has are kept, except from Sanso's own exports.
  const tags: string[] = [];
  const categories = asArray(raw.recipeCategory).map(plainText);
  const keywords = asArray(raw.keywords).flatMap((k) => plainText(k).split(','));
  for (const name of [...categories, ...keywords].map((t) => t.trim()).filter(Boolean)) {
    const known = knownTags.get(name.toLowerCase());
    if (known) {
      if (!tags.includes(known)) tags.push(known);
    } else if (fromSanso && categories.includes(name) && !tags.includes(name)) {
      tags.push(name);
      newTags.add(name);
    }
  }

  const rating = isObject(raw.aggregateRating) ? raw.aggregateRating : undefined;
  const score =
    fromSanso &&
    rating &&
    Number(rating.bestRating) === 10 &&
    Number.isFinite(Number(rating.ratingValue))
      ? Math.min(10, Math.max(0, Math.round(Number(rating.ratingValue))))
      : undefined;

  const prep = parseIsoDuration(raw.prepTime);
  const cook = parseIsoDuration(raw.cookTime);
  const total =
    parseIsoDuration(raw.totalTime) ?? (prep || cook ? (prep ?? 0) + (cook ?? 0) : undefined);

  const image = imageOf(raw.image);
  const photo = image && photoDataUrl.test(image) ? image : undefined;
  const created = typeof raw.dateCreated === 'string' && !Number.isNaN(Date.parse(raw.dateCreated));

  return {
    title,
    tags,
    portions: parseYield(raw.recipeYield) ?? defaultPortions,
    prepMinutes: prep,
    totalMinutes: total,
    score,
    ingredients: asArray(raw.recipeIngredient ?? raw.ingredients)
      .map(plainText)
      .map((line) => line.replace(/\n+/g, ' '))
      .filter(Boolean),
    steps: parseInstructions(raw.recipeInstructions),
    notes: plainText(raw.description),
    createdAt: created ? new Date(raw.dateCreated as string).toISOString() : undefined,
    photo,
    linkedPhoto: !!image && !photo,
    fromSanso,
  };
}

/** Reads the recipes in a file. Throws if it isn't JSON-LD or has no recipes. */
export function parseRecipesFile(
  text: string,
  knownTags: string[],
  defaultPortions: number,
): ImportResult {
  let docs: unknown[];
  try {
    docs = documentsIn(text);
  } catch {
    throw new Error('This file isn’t valid JSON.');
  }
  const tagMap = new Map(knownTags.map((t) => [t.toLowerCase(), t]));
  const newTags = new Set<string>();
  const recipes = findRecipes(docs)
    .map((raw) => readRecipe(raw, tagMap, defaultPortions, newTags))
    .filter((r): r is ImportedRecipe => !!r);
  if (!recipes.length) throw new Error('No recipes found in this file.');
  return { recipes, newTags: [...newTags] };
}
