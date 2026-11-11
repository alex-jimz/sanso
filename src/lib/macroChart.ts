// The ring chart of a portion's calories: protein, fat and carbs as shares of
// the calories they give, with the total in the middle. Shared by the recipe
// page (SVG) and the PDF (pdf-lib paths), so both draw the same shapes.

import type { NutrientKey } from './nutrition';

export type MacroKey = Exclude<NutrientKey, 'kcal'>;

export const macroKeys: MacroKey[] = ['protein', 'fat', 'carbs'];

export const macroLabels: Record<MacroKey, string> = {
  protein: 'Protein',
  fat: 'Fat',
  carbs: 'Carbs',
};

/** Fill colours, with dark text on top, as in the user's macro tracker. */
export const macroColors: Record<MacroKey, string> = {
  protein: '#ee8466',
  fat: '#f5d36d',
  carbs: '#72ba8b',
};
export const macroText = '#2b2723';

/** Calories per gram, the general factors EU labels use. */
const kcalPerGram: Record<MacroKey, number> = { protein: 4, fat: 9, carbs: 4 };

export interface MacroShare {
  key: MacroKey;
  grams: number;
  /** Share of the calories from the three macros, 0 to 1. */
  share: number;
}

export function macroShares(nutrition: Record<MacroKey, number>): MacroShare[] {
  const kcal = macroKeys.map((key) => Math.max(0, nutrition[key]) * kcalPerGram[key]);
  const total = kcal.reduce((a, b) => a + b, 0);
  return macroKeys.map((key, i) => ({
    key,
    grams: nutrition[key],
    share: total > 0 ? kcal[i]! / total : 0,
  }));
}

export interface RingSegment {
  key: MacroKey;
  /** Degrees clockwise from the top. */
  start: number;
  end: number;
}

/** The ring's segments, with a small gap between them as in a tracker app. */
export function ringSegments(shares: MacroShare[], gap = 4): RingSegment[] {
  const shown = shares.filter((s) => s.share > 0);
  const gaps = shown.length > 1 ? gap : 0;
  let angle = 0;
  return shown.map((s) => {
    const sweep = s.share * 360;
    const segment = { key: s.key, start: angle + gaps / 2, end: angle + sweep - gaps / 2 };
    angle += sweep;
    return segment;
  });
}

function point(cx: number, cy: number, r: number, degrees: number): string {
  const a = ((degrees - 90) * Math.PI) / 180;
  return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
}

/**
 * A ring segment as a closed SVG path, in SVG coordinates (y down). Arcs are
 * drawn as short straight lines, so any path renderer can draw them.
 */
export function segmentPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  if (end <= start) return '';
  const steps = Math.max(2, Math.ceil((end - start) / 3));
  const angles = Array.from({ length: steps + 1 }, (_, i) => start + ((end - start) * i) / steps);
  const out = angles.map((a) => point(cx, cy, outer, a));
  const back = [...angles].reverse().map((a) => point(cx, cy, inner, a));
  return `M${out.join('L')}L${back.join('L')}Z`;
}
