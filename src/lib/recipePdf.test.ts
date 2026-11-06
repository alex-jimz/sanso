import { writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { pdfFileName, recipePdf } from './recipePdf';
import type { Recipe } from './types';

function recipe(extra: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r',
    title: 'Slow-cooked beef ragù',
    tags: ['Meal', 'Batch'],
    portions: 4,
    prepMinutes: 25,
    totalMinutes: 210,
    score: 9,
    ingredients: [
      'For the ragù',
      '800 g beef shin, in large pieces',
      '⅓ cup red wine 🍷',
      '2 onions, finely chopped',
      'To serve',
      '400 g pappardelle',
    ],
    steps: [],
    notes: '',
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

async function pages(blob: Blob): Promise<number> {
  return (await PDFDocument.load(await blob.arrayBuffer())).getPageCount();
}

describe('recipePdf', () => {
  it('makes a one-page PDF and copes with characters the fonts lack', async () => {
    const blob = await recipePdf({ recipe: recipe(), portions: 4, date: '6 Nov 2026' });
    expect(blob.type).toBe('application/pdf');
    expect(await pages(blob)).toBe(1);
  });

  it('flows long ingredients, steps and notes onto more pages', async () => {
    const long = recipe({
      ingredients: Array.from({ length: 40 }, (_, i) => `${i + 1}00 g ingredient number ${i + 1}`),
      steps: Array.from(
        { length: 14 },
        (_, i) =>
          `Step ${i + 1}: stir slowly and keep an eye on the pan, adding a splash of stock whenever it looks dry, for about ten minutes.`,
      ),
      notes: Array.from({ length: 30 }, () => 'A long note line that wraps across the page.').join(
        '\n',
      ),
    });
    const blob = await recipePdf({ recipe: long, portions: 4, date: '6 Nov 2026' });
    expect(await pages(blob)).toBeGreaterThan(1);
    // Set PDF_OUT to look at it.
    if (process.env.PDF_OUT)
      writeFileSync(process.env.PDF_OUT, new Uint8Array(await blob.arrayBuffer()));
  });

  it('names the file after the recipe', () => {
    expect(pdfFileName('Chicken / leek pie?')).toBe('Chicken leek pie.pdf');
    expect(pdfFileName('  ')).toBe('Recipe.pdf');
  });
});
