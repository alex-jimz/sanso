// Parses ingredient lines as typed, e.g. "600 g chicken breast", "3 garlic cloves",
// "2 x 400 g tins chopped tomatoes" or "salt", into amount, unit and name.

import { formatAmount, formatNumber } from './quantity';
import { containerWords, findUnit, getUnit, trailingUnits } from './units';

export interface ParsedLine {
  /** The line as typed, without a leading bullet. */
  text: string;
  /** A line ending in ":" groups the lines under it, as in "For the sauce:". */
  heading: boolean;
  /** Amount in `unit`, or a plain count when there is no unit. */
  quantity?: number;
  /** Unit id from units.ts. */
  unit?: string;
  /** What the ingredient is, as in "chicken breast". */
  name: string;
  /** Preparation or extra detail, as in "finely chopped". */
  note?: string;
  /** Where the amount sits in `text`, so scaling can rewrite just that part. */
  span?: [number, number];
  /** True when the unit is inside `span` ("600 g"), false when it trails the name ("3 garlic cloves"). */
  unitInSpan: boolean;
}

const fractionChars: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};
const fc = Object.keys(fractionChars).join('');
const NUM = `(?:\\d+\\s*[${fc}]|[${fc}]|\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:[.,]\\d+)?)`;

const leadingAmount = new RegExp(
  `^(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?(?:\\s*[x×]\\s*(${NUM}))?`,
  'i',
);
const bracketAmount = new RegExp(`^\\s*\\(\\s*(${NUM})\\s*([a-z]+)\\.?\\s*\\)`, 'i');
const altAmount = new RegExp(`^\\s*/\\s*${NUM}\\s*[a-z]+\\.?(?=[\\s,(]|$)`, 'i');
const trailingAmount = new RegExp(`^(.*?\\S)([\\s,:–-]+)((${NUM})\\s*([a-z]+)\\.?)$`, 'i');
const nextWord = /^\s*([a-z]+\.?)(?=[\s,(/]|$)/i;
const numberWords: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  half: 0.5,
};
const leadingWord = new RegExp(
  `^(${Object.keys(numberWords).join('|')})(\\s+(?:a|an))?(?=\\s)`,
  'i',
);

export function parseNumber(raw: string): number {
  const s = raw.trim();
  let m = new RegExp(`^(\\d+)\\s*([${fc}])$`).exec(s);
  if (m) return Number(m[1]) + fractionChars[m[2]!]!;
  if (fractionChars[s] !== undefined) return fractionChars[s];
  m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d+)\/(\d+)$/.exec(s);
  if (m) return Number(m[1]) / Number(m[2]);
  m = /^(\d+)([.,])(\d+)$/.exec(s);
  // "1,500" is a thousands separator; "1,5" and "1.5" are decimals.
  if (m)
    return m[2] === ',' && m[3]!.length === 3 ? Number(m[1]! + m[3]) : Number(`${m[1]}.${m[3]}`);
  return Number(s);
}

const notePhrases =
  /\s+(to taste|to serve|for frying|for serving|for greasing|for dusting|for the pan|optional)$/i;

function splitNote(raw: string): { name: string; note?: string } {
  let name = raw.trim();
  const notes: string[] = [];
  const bracket = /\s*\(([^)]*)\)\s*$/.exec(name);
  if (bracket) {
    notes.push(bracket[1]!.trim());
    name = name.slice(0, bracket.index);
  }
  const comma = name.indexOf(',');
  if (comma >= 0) {
    notes.unshift(name.slice(comma + 1).trim());
    name = name.slice(0, comma);
  }
  const phrase = notePhrases.exec(name);
  if (phrase) {
    notes.unshift(phrase[1]!);
    name = name.slice(0, phrase.index);
  }
  const note = notes.filter(Boolean).join(', ');
  return { name: name.trim(), note: note || undefined };
}

export function parseIngredient(line: string): ParsedLine | null {
  const text = line
    .trim()
    .replace(/^[-•*·]\s*/, '')
    .trim();
  if (!text) return null;
  if (text.endsWith(':')) {
    return { text, heading: true, name: text.slice(0, -1).trim(), unitInSpan: false };
  }

  let quantity: number | undefined;
  let unit: string | undefined;
  let span: [number, number] | undefined;
  let unitInSpan = false;
  let rest = text;

  const lead = leadingAmount.exec(text);
  const word = lead ? null : leadingWord.exec(text);
  if (lead) {
    const first = parseNumber(lead[1]!);
    const upper = lead[2] ? parseNumber(lead[2]) : undefined;
    const times = lead[3] ? parseNumber(lead[3]) : undefined;
    quantity = times !== undefined ? first * times : (upper ?? first);
    let end = lead[0].length;
    const bracket = bracketAmount.exec(text.slice(end));
    const bracketUnit = bracket ? findUnit(bracket[2]!) : undefined;
    if (bracket && bracketUnit && bracketUnit.dimension !== 'other') {
      quantity *= parseNumber(bracket[1]!);
      unit = bracketUnit.id;
      unitInSpan = true;
      end += bracket[0].length;
    } else {
      const w = nextWord.exec(text.slice(end));
      const u = w ? findUnit(w[1]!) : undefined;
      if (w && u) {
        unit = u.id;
        unitInSpan = true;
        end += w[0].length;
        const alt = altAmount.exec(text.slice(end));
        if (alt) end += alt[0].length;
      }
    }
    span = [0, end];
    rest = text.slice(end);
  } else if (word) {
    const key = word[1]!.toLowerCase();
    const w = nextWord.exec(text.slice(word[0].length));
    const u = w ? findUnit(w[1]!) : undefined;
    // "a" and "an" only count as an amount before a unit, as in "a pinch of salt".
    if ((key !== 'a' && key !== 'an') || u) {
      quantity = numberWords[key];
      let end = word[0].length;
      if (w && u) {
        unit = u.id;
        unitInSpan = true;
        end += w[0].length;
      }
      span = [0, end];
      rest = text.slice(end);
    }
  } else {
    const tail = trailingAmount.exec(text);
    const u = tail ? findUnit(tail[5]!) : undefined;
    if (tail && u) {
      quantity = parseNumber(tail[4]!);
      unit = u.id;
      unitInSpan = true;
      span = [tail[1]!.length + tail[2]!.length, text.length];
      rest = tail[1]!;
    }
  }

  let name = rest.trim();
  if (quantity !== undefined) name = name.replace(/^of\s+/i, '');
  const unitDef = unit ? getUnit(unit) : undefined;
  if (unitDef && unitDef.dimension !== 'other') {
    const first = name.split(/\s+/)[0]?.toLowerCase();
    if (first && containerWords.has(first)) {
      name = name
        .slice(first.length)
        .trim()
        .replace(/^of\s+/i, '');
    }
  }
  const split = splitNote(name);
  name = split.name;

  if (quantity !== undefined && !unit) {
    const words = name.split(/\s+/);
    const last = words.length > 1 ? findUnit(words[words.length - 1]!) : undefined;
    if (last && trailingUnits.has(last.id)) {
      unit = last.id;
      name = words.slice(0, -1).join(' ');
    }
  }

  if (quantity !== undefined && !(quantity > 0 && Number.isFinite(quantity))) {
    quantity = undefined;
    unit = undefined;
    span = undefined;
    unitInSpan = false;
  }

  return { text, heading: false, quantity, unit, name, note: split.note, span, unitInSpan };
}

export function parseIngredients(lines: string[]): ParsedLine[] {
  return lines.map(parseIngredient).filter((line): line is ParsedLine => line !== null);
}

/** Splits a line into the text around its amount, with the amount scaled. */
export function displayParts(
  line: ParsedLine,
  factor = 1,
): { before: string; amount: string; after: string } {
  if (line.heading || line.quantity === undefined || !line.span) {
    return { before: '', amount: '', after: line.text };
  }
  const [start, end] = line.span;
  let amount = line.text.slice(start, end);
  let after = line.text.slice(end);
  if (Math.abs(factor - 1) > 1e-9) {
    const q = line.quantity * factor;
    amount = line.unitInSpan && line.unit ? formatAmount(q, line.unit) : formatNumber(q);
    // A plain count or trailing unit has to agree with the new amount: "2 onions", "1 garlic clove".
    if (!line.unitInSpan) {
      const wasMany = line.quantity > 1;
      const isMany = Number(q.toFixed(2)) > 1;
      if (wasMany !== isMany) after = inflectNoun(after, line, isMany);
    }
  }
  return { before: line.text.slice(0, start), amount, after };
}

const plurals: Record<string, string> = {
  leaf: 'leaves',
  half: 'halves',
  loaf: 'loaves',
  tomato: 'tomatoes',
  potato: 'potatoes',
  chilli: 'chillies',
};
const singulars = Object.fromEntries(Object.entries(plurals).map(([one, many]) => [many, one]));

function matchCase(original: string, word: string): string {
  return original[0] === original[0]?.toUpperCase() ? capitalize(word) : word;
}

export function pluralize(word: string): string {
  const lower = word.toLowerCase();
  if (plurals[lower]) return matchCase(word, plurals[lower]);
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

export function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (singulars[lower]) return matchCase(word, singulars[lower]);
  return singular(word);
}

/** Changes the noun after the amount (or the trailing unit, as in "garlic cloves") to plural or singular. */
function inflectNoun(after: string, line: ParsedLine, many: boolean): string {
  const start = line.name ? after.indexOf(line.name) : -1;
  if (start < 0) return after;
  let end = start + line.name.length;
  if (line.unit) {
    const unitWord = /^\s+[A-Za-z]+/.exec(after.slice(end));
    if (!unitWord) return after;
    end += unitWord[0].length;
  }
  const region = after.slice(start, end);
  const last = /[A-Za-z]+$/.exec(region);
  if (!last) return after;
  const word = many ? pluralize(last[0]) : singularize(last[0]);
  return after.slice(0, start) + region.slice(0, last.index) + word + after.slice(end);
}

/** The line with its amount scaled, as in "300 g chicken breast". */
export function scaleLine(line: ParsedLine, factor: number): string {
  const { before, amount, after } = displayParts(line, factor);
  return before + amount + after;
}

const ignoredWords = new Set([
  'a',
  'an',
  'the',
  'of',
  'some',
  'large',
  'small',
  'medium',
  'big',
  'fresh',
  'freshly',
  'ripe',
  'chopped',
  'diced',
  'sliced',
  'minced',
  'grated',
  'crushed',
  'peeled',
  'finely',
  'roughly',
  'thinly',
  'about',
  'approx',
  'approximately',
]);

const irregular: Record<string, string> = { leaves: 'leaf', halves: 'half', loaves: 'loaf' };

function singular(word: string): string {
  if (irregular[word]) return irregular[word];
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Turns an ingredient or product name into a matching key: "Fresh Tomatoes" -> "tomato". */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !ignoredWords.has(w))
    .map(singular)
    .join(' ');
}

const waterWords = new Set(['cold', 'warm', 'hot', 'boiling', 'tap', 'iced', 'ice', 'lukewarm']);

/** Tap water never goes on the shopping list. */
export function isTapWater(normalized: string): boolean {
  const words = normalized.split(' ');
  if (words[words.length - 1] !== 'water') return false;
  return words.slice(0, -1).every((w) => waterWords.has(w));
}

export function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}
