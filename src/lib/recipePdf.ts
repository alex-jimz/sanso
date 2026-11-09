// Draws a recipe as an A4 PDF in the app's look: photo across the top, title,
// times and score, calories, macros and cost per portion, then ingredients
// and steps side by side, and notes. Loaded only when a PDF is made.
//
// It uses the PDF standard fonts (Times for headings, Helvetica for text), so
// nothing extra is downloaded. They cover Western European text, the euro sign
// and ½; anything else is swapped for a close character or left out.

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type Color,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import { displayParts, parseIngredients, type ParsedLine } from './ingredients';
import { formatKcal, formatMacro, type RecipeFacts } from './nutrition';
import { formatMinutes, formatPrice } from './quantity';
import type { Recipe } from './types';

export interface RecipePdfInput {
  recipe: Recipe;
  /** Portions to write the ingredients for. */
  portions: number;
  /** The ingredient lines with options picked. Without them, every line is printed as typed. */
  lines?: ParsedLine[];
  facts?: RecipeFacts;
  photo?: Blob;
  /** Shown in the footer, e.g. "6 Nov 2026". */
  date: string;
}

const W = 595.28;
const H = 841.89;
const M = 44;
const FOOTER = M + 18;
const HERO = 300;

function hex(value: string): Color {
  const n = parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// The app's palette (src/app.css).
const c = {
  bg: hex('#faf6f0'),
  surface: hex('#ffffff'),
  surface2: hex('#f3ede4'),
  line: hex('#e8dfd2'),
  text: hex('#2b2723'),
  muted: hex('#766d63'),
  accent: hex('#2f5d50'),
  accentSoft: hex('#e1ebe6'),
  onAccent: hex('#fbf7f1'),
  onAccentMuted: hex('#bcd2c9'),
  mustardSoft: hex('#f8ebcf'),
  mustardText: hex('#5a4316'),
};

const replacements: Record<string, string> = {
  '⅓': '1/3',
  '⅔': '2/3',
  '⅕': '1/5',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
  '\u202f': '\u00a0',
  '\u2009': ' ',
  '\u2007': ' ',
  '−': '-',
  '≈': '~',
  '→': '->',
  '\t': ' ',
};

interface Fonts {
  serif: PDFFont;
  sans: PDFFont;
  bold: PDFFont;
  clean: (text: string) => string;
}

function cleaner(font: PDFFont): (text: string) => string {
  const supported = new Set(font.getCharacterSet());
  return (text) => {
    let out = '';
    for (const ch of text) {
      const swap = replacements[ch];
      if (swap !== undefined) out += swap;
      else if (supported.has(ch.codePointAt(0)!)) out += ch;
      else {
        // é and friends are covered; for other letters keep the base letter.
        const base = ch.normalize('NFD')[0];
        if (base && base !== ch && supported.has(base.codePointAt(0)!)) out += base;
      }
    }
    return out;
  };
}

interface Run {
  text: string;
  font: PDFFont;
}

interface Piece extends Run {
  x: number;
}

/** Breaks runs of text into lines that fit `width`. */
function wrap(runs: Run[], size: number, width: number): Piece[][] {
  const lines: Piece[][] = [[]];
  let x = 0;
  for (const run of runs) {
    for (const token of run.text.split(/(\s+)/)) {
      if (!token) continue;
      const line = lines[lines.length - 1]!;
      if (/^\s+$/.test(token)) {
        if (line.length) {
          const w = run.font.widthOfTextAtSize(' ', size);
          line.push({ text: ' ', font: run.font, x });
          x += w;
        }
        continue;
      }
      let word = token;
      let w = run.font.widthOfTextAtSize(word, size);
      if (x + w > width && line.length) {
        while (line.length && line[line.length - 1]!.text === ' ') line.pop();
        lines.push([]);
        x = 0;
      }
      // A word longer than the line is split by characters.
      while (w > width) {
        let cut = word.length - 1;
        while (cut > 1 && run.font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--;
        lines[lines.length - 1]!.push({ text: word.slice(0, cut), font: run.font, x: 0 });
        lines.push([]);
        word = word.slice(cut);
        w = run.font.widthOfTextAtSize(word, size);
      }
      lines[lines.length - 1]!.push({ text: word, font: run.font, x });
      x += w;
    }
  }
  return lines.filter((l, i) => l.length || i === 0);
}

function drawLine(page: PDFPage, line: Piece[], x: number, y: number, size: number, color: Color) {
  for (const piece of line) {
    if (piece.text === ' ') continue;
    page.drawText(piece.text, { x: x + piece.x, y, size, font: piece.font, color });
  }
}

/** A rectangle with rounded corners; `y` is its top edge. */
function roundedRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: Color,
  corners: 'all' | 'top' = 'all',
) {
  const r = Math.min(radius, width / 2, corners === 'top' ? height : height / 2);
  const bottom =
    corners === 'all'
      ? `V ${height - r} A ${r} ${r} 0 0 1 ${width - r} ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height - r}`
      : `V ${height} H 0`;
  const path = `M ${r} 0 H ${width - r} A ${r} ${r} 0 0 1 ${width} ${r} ${bottom} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  page.drawSvgPath(path, { x, y, color, borderWidth: 0 });
}

/** The photo, cut to the banner's shape, as a JPEG the PDF can hold. */
async function bannerImage(doc: PDFDocument, photo: Blob): Promise<PDFImage | undefined> {
  try {
    const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
    const aspect = W / HERO;
    let sw = bitmap.width;
    let sh = sw / aspect;
    if (sh > bitmap.height) {
      sh = bitmap.height;
      sw = sh * aspect;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(1600, Math.round(sw));
    canvas.height = Math.round(canvas.width / aspect);
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      bitmap,
      (bitmap.width - sw) / 2,
      (bitmap.height - sh) / 2,
      sw,
      sh,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.86),
    );
    return blob ? doc.embedJpg(await blob.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

/** "From 5 of 9 ingredients", as on the recipe page. */
export function factsSummary(facts: RecipeFacts): string {
  const total = facts.lines.length;
  if (facts.nutritionCount === total && facts.costCount === total)
    return 'All ingredients counted.';
  if (facts.nutritionCount === facts.costCount)
    return `From ${facts.nutritionCount} of ${total} ingredients.`;
  return `Calories from ${facts.nutritionCount} of ${total} ingredients, cost from ${facts.costCount}.`;
}

export async function recipePdf(input: RecipePdfInput): Promise<Blob> {
  const { recipe, portions, facts, photo, date } = input;
  const lines = input.lines ?? parseIngredients(recipe.ingredients);
  const doc = await PDFDocument.create();
  doc.setTitle(recipe.title);
  doc.setCreator('Sanso');
  doc.setProducer('Sanso');

  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const fonts: Fonts = {
    serif: await doc.embedFont(StandardFonts.TimesRomanBold),
    sans,
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    clean: cleaner(sans),
  };
  const { serif, bold, clean } = fonts;
  const title = clean(recipe.title.trim() || 'Untitled recipe');

  const pages: PDFPage[] = [];
  function addPage(): PDFPage {
    const page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: c.bg });
    if (pages.length) {
      page.drawText(title, { x: M, y: H - M + 4, size: 10, font: serif, color: c.muted });
    }
    pages.push(page);
    return page;
  }

  const first = addPage();
  let y: number;

  // Photo across the top, with the page curving over its bottom edge like the app.
  const image = photo ? await bannerImage(doc, photo) : undefined;
  if (image) {
    first.drawImage(image, { x: 0, y: H - HERO, width: W, height: HERO });
    roundedRect(first, 0, H - HERO + 24, W, 24, 24, c.bg, 'top');
    y = H - HERO - 6;
  } else {
    first.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: c.accent });
    y = H - M - 8;
  }

  // Title.
  const titleLines = wrap([{ text: title, font: serif }], 28, W - 2 * M);
  for (const line of titleLines) {
    y -= 30;
    drawLine(first, line, M, y, 28, c.text);
  }

  // Tags as pills.
  if (recipe.tags.length) {
    y -= 26;
    let x = M;
    for (const tag of recipe.tags.map(clean).filter(Boolean)) {
      const w = bold.widthOfTextAtSize(tag, 8.5) + 16;
      if (x + w > W - M) {
        x = M;
        y -= 22;
      }
      roundedRect(first, x, y + 13, w, 18, 9, c.accentSoft);
      first.drawText(tag, { x: x + 8, y: y + 1, size: 8.5, font: bold, color: c.accent });
      x += w + 6;
    }
  }

  // Times, score and portions.
  const stats: { label: string; value: string; small?: string }[] = [];
  if (recipe.prepMinutes) stats.push({ label: 'PREP', value: formatMinutes(recipe.prepMinutes) });
  if (recipe.totalMinutes)
    stats.push({ label: 'TOTAL', value: formatMinutes(recipe.totalMinutes) });
  if (recipe.score !== undefined)
    stats.push({ label: 'SCORE', value: String(recipe.score), small: ' / 10' });
  stats.push({ label: 'PORTIONS', value: String(portions) });
  y -= 24;
  const statsHeight = 50;
  roundedRect(first, M, y, W - 2 * M, statsHeight, 14, c.surface);
  const statWidth = (W - 2 * M) / stats.length;
  stats.forEach((stat, i) => {
    const cx = M + statWidth * (i + 0.5);
    const label = clean(stat.label);
    first.drawText(label, {
      x: cx - bold.widthOfTextAtSize(label, 7) / 2,
      y: y - 17,
      size: 7,
      font: bold,
      color: c.muted,
    });
    const value = clean(stat.value);
    const small = stat.small ? clean(stat.small) : '';
    const vw = serif.widthOfTextAtSize(value, 15) + (small ? sans.widthOfTextAtSize(small, 9) : 0);
    first.drawText(value, { x: cx - vw / 2, y: y - 36, size: 15, font: serif, color: c.text });
    if (small)
      first.drawText(small, {
        x: cx - vw / 2 + serif.widthOfTextAtSize(value, 15),
        y: y - 36,
        size: 9,
        font: sans,
        color: c.muted,
      });
    if (i)
      first.drawLine({
        start: { x: M + statWidth * i, y: y - 12 },
        end: { x: M + statWidth * i, y: y - statsHeight + 12 },
        thickness: 0.75,
        color: c.line,
      });
  });
  y -= statsHeight;

  // Calories, macros and cost per portion.
  if (facts && facts.lines.length && (facts.nutritionCount || facts.costCount)) {
    y -= 12;
    const panel = 70;
    roundedRect(first, M, y, W - 2 * M, panel, 14, c.accent);
    first.drawText('PER PORTION', {
      x: M + 16,
      y: y - 18,
      size: 7,
      font: bold,
      color: c.onAccentMuted,
    });
    const n = facts.nutrition;
    const has = facts.nutritionCount > 0;
    const cells = [
      { value: has ? formatKcal(n.kcal) : '–', label: 'kcal' },
      { value: has ? formatMacro(n.protein) : '–', label: 'Protein' },
      { value: has ? formatMacro(n.fat) : '–', label: 'Fat' },
      { value: has ? formatMacro(n.carbs) : '–', label: 'Carbs' },
      { value: facts.costCount ? formatPrice(facts.cost) : '–', label: 'Cost' },
    ];
    const cellWidth = (W - 2 * M - 16) / cells.length;
    cells.forEach((cell, i) => {
      const x = M + 16 + cellWidth * i;
      first.drawText(clean(cell.value), {
        x,
        y: y - 42,
        size: 17,
        font: serif,
        color: c.onAccent,
      });
      first.drawText(cell.label, {
        x,
        y: y - 57,
        size: 8,
        font: sans,
        color: c.onAccentMuted,
      });
    });
    y -= panel;
    y -= 14;
    first.drawText(clean(`${factsSummary(facts)} Cost uses regular prices.`), {
      x: M + 2,
      y,
      size: 8,
      font: sans,
      color: c.muted,
    });
  }

  // Ingredients on the left, steps on the right, each flowing onto new pages.
  const top = y - 30;
  const left = { x: M, width: 186, page: 0, y: top };
  const right = { x: M + 186 + 28, width: W - M - (M + 186 + 28), page: 0, y: top };
  type Column = typeof left;
  const pageTop = H - M - 22;

  function room(column: Column, height: number): PDFPage {
    if (column.y - height < FOOTER) {
      column.page += 1;
      column.y = pageTop;
    }
    while (pages.length <= column.page) addPage();
    return pages[column.page]!;
  }

  function heading(column: Column, text: string, sub?: string) {
    const page = room(column, 40);
    column.y -= 17;
    page.drawText(text, { x: column.x, y: column.y, size: 17, font: serif, color: c.text });
    if (sub) {
      column.y -= 14;
      page.drawText(clean(sub), {
        x: column.x,
        y: column.y,
        size: 8.5,
        font: sans,
        color: c.muted,
      });
    }
    column.y -= 10;
  }

  const factor = recipe.portions > 0 ? portions / recipe.portions : 1;
  if (lines.length) {
    heading(left, 'Ingredients', portions === 1 ? 'For 1 portion' : `For ${portions} portions`);
    let firstItem = true;
    for (const line of lines) {
      if (line.heading) {
        const page = room(left, 28);
        left.y -= 18;
        page.drawText(clean(line.name.toUpperCase()), {
          x: left.x,
          y: left.y,
          size: 7.5,
          font: bold,
          color: c.muted,
        });
        left.y -= 4;
        firstItem = true;
        continue;
      }
      const parts = displayParts(line, factor);
      const runs: Run[] = [
        { text: clean(parts.before), font: sans },
        { text: clean(parts.amount), font: bold },
        { text: clean(parts.after), font: sans },
      ].filter((r) => r.text);
      const wrapped = wrap(runs, 10, left.width - 12);
      const height = wrapped.length * 13.5 + 11;
      const page = room(left, height);
      if (!firstItem && left.y !== pageTop)
        page.drawLine({
          start: { x: left.x, y: left.y },
          end: { x: left.x + left.width, y: left.y },
          thickness: 0.6,
          color: c.line,
        });
      firstItem = false;
      let ly = left.y - 6;
      page.drawCircle({ x: left.x + 2.5, y: ly - 7, size: 2.2, color: c.accent, opacity: 0.6 });
      for (const l of wrapped) {
        ly -= 10.5;
        drawLine(page, l, left.x + 12, ly, 10, c.text);
        ly -= 3;
      }
      left.y -= height;
    }
  }

  if (recipe.steps.length) {
    heading(right, 'Steps');
    recipe.steps.forEach((step, i) => {
      const wrapped = wrap([{ text: clean(step), font: sans }], 10, right.width - 30);
      const height = Math.max(20, wrapped.length * 14.5) + 12;
      const page = room(right, height);
      const number = String(i + 1);
      page.drawCircle({ x: right.x + 10, y: right.y - 12, size: 10, color: c.accentSoft });
      page.drawText(number, {
        x: right.x + 10 - bold.widthOfTextAtSize(number, 8.5) / 2,
        y: right.y - 15,
        size: 8.5,
        font: bold,
        color: c.accent,
      });
      let ly = right.y - 2;
      for (const l of wrapped) {
        ly -= 11;
        drawLine(page, l, right.x + 30, ly, 10, c.text);
        ly -= 3.5;
      }
      right.y -= height;
    });
  }

  // Notes, full width, under whichever column ends lower.
  const notes = recipe.notes.trim();
  if (notes) {
    const last = Math.max(left.page, right.page);
    const ys = [left, right].filter((col) => col.page === last).map((col) => col.y);
    const column: Column = { x: M, width: W - 2 * M, page: last, y: Math.min(...ys) - 18 };
    heading(column, 'Notes');
    const wrapped = notes
      .split('\n')
      .flatMap((paragraph) => wrap([{ text: clean(paragraph), font: sans }], 10, W - 2 * M - 28));
    let i = 0;
    while (i < wrapped.length) {
      const page = room(column, 40);
      const fit = Math.max(1, Math.floor((column.y - FOOTER - 24) / 14.5));
      const chunk = wrapped.slice(i, i + fit);
      const boxHeight = chunk.length * 14.5 + 22;
      roundedRect(page, column.x, column.y, column.width, boxHeight, 14, c.mustardSoft);
      let ly = column.y - 8;
      for (const l of chunk) {
        ly -= 11;
        drawLine(page, l, column.x + 14, ly, 10, c.mustardText);
        ly -= 3.5;
      }
      column.y -= boxHeight;
      i += chunk.length;
      if (i < wrapped.length) column.y = FOOTER - 1; // continue on a new page
    }
  }

  // Footer on every page.
  pages.forEach((page, i) => {
    page.drawLine({
      start: { x: M, y: M + 6 },
      end: { x: W - M, y: M + 6 },
      thickness: 0.6,
      color: c.line,
    });
    page.drawText('Sanso', { x: M, y: M - 8, size: 10, font: serif, color: c.accent });
    const right = clean(pages.length > 1 ? `${date} · Page ${i + 1} of ${pages.length}` : date);
    page.drawText(right, {
      x: W - M - sans.widthOfTextAtSize(right, 8),
      y: M - 7,
      size: 8,
      font: sans,
      color: c.muted,
    });
  });

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** "Chicken tikka masala.pdf", without characters file systems don't like. */
export function pdfFileName(title: string): string {
  const name = title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${name || 'Recipe'}.pdf`;
}
