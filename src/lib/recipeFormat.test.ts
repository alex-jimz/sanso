import { describe, expect, it } from 'vitest';
import {
  parseInstructions,
  parseIsoDuration,
  parseRecipesFile,
  parseYield,
  plainText,
  recipesFile,
  toIsoDuration,
} from './recipeFormat';
import type { Recipe } from './types';

const tags = ['Meal', 'Dessert', 'Breakfast/snack', 'Baking'];
const photo = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

const curry: Recipe = {
  id: 'r1',
  title: 'Chickpea curry',
  photoId: 'p1',
  tags: ['Meal', 'Weeknight'],
  portions: 2,
  prepMinutes: 15,
  totalMinutes: 95,
  score: 8,
  ingredients: ['For the curry:', '2 tins chickpeas', '400 ml coconut milk', '3 garlic cloves'],
  steps: ['Soften the onion.', 'Simmer for 15 minutes.'],
  notes: 'Better the next day.',
  createdAt: '2026-10-30T18:00:00.000Z',
  updatedAt: '2026-11-01T18:00:00.000Z',
};

describe('durations', () => {
  it('writes and reads ISO 8601 durations', () => {
    expect(toIsoDuration(20)).toBe('PT20M');
    expect(toIsoDuration(60)).toBe('PT1H');
    expect(toIsoDuration(95)).toBe('PT1H35M');
    expect(parseIsoDuration('PT1H35M')).toBe(95);
    expect(parseIsoDuration('P0DT0H45M')).toBe(45);
    expect(parseIsoDuration('PT90M')).toBe(90);
    expect(parseIsoDuration('P1D')).toBe(1440);
  });

  it('ignores durations it can’t read', () => {
    expect(parseIsoDuration('20 minutes')).toBeUndefined();
    expect(parseIsoDuration('PT')).toBeUndefined();
    expect(parseIsoDuration('PT0M')).toBeUndefined();
    expect(parseIsoDuration(20)).toBeUndefined();
  });
});

describe('parseYield', () => {
  it('reads numbers, text and lists', () => {
    expect(parseYield(4)).toBe(4);
    expect(parseYield('Serves 4-6')).toBe(4);
    expect(parseYield(['6', '6 servings'])).toBe(6);
    expect(parseYield('a big pot')).toBeUndefined();
  });
});

describe('plainText', () => {
  it('drops tags and decodes entities', () => {
    expect(plainText('<p>Salt &amp; pepper,&nbsp;to taste</p>')).toBe('Salt & pepper, to taste');
    expect(plainText('1&#189; cups &frac12; tsp &#x2014;')).toBe('1½ cups ½ tsp —');
    expect(plainText('Line one<br>Line two')).toBe('Line one\nLine two');
  });
});

describe('parseInstructions', () => {
  it('reads strings, steps and sections', () => {
    expect(parseInstructions('1. Chop.\n2. Fry.\n\n')).toEqual(['Chop.', 'Fry.']);
    expect(
      parseInstructions([
        {
          '@type': 'HowToSection',
          name: 'Sauce',
          itemListElement: [{ '@type': 'HowToStep', text: 'Stir.' }],
        },
        { '@type': 'HowToStep', text: '<p>Serve.</p>' },
        'Eat.',
      ]),
    ).toEqual(['Stir.', 'Serve.', 'Eat.']);
  });
});

describe('a Sanso export', () => {
  it('reads back what it wrote', () => {
    const file = recipesFile([{ recipe: curry, photo }]);
    const { recipes, newTags } = parseRecipesFile(file, tags, 1);

    expect(recipes).toEqual([
      {
        title: 'Chickpea curry',
        tags: ['Meal', 'Weeknight'],
        portions: 2,
        prepMinutes: 15,
        totalMinutes: 95,
        score: 8,
        ingredients: curry.ingredients,
        steps: curry.steps,
        notes: 'Better the next day.',
        createdAt: '2026-10-30T18:00:00.000Z',
        photo,
        linkedPhoto: false,
        fromSanso: true,
      },
    ]);
    expect(newTags).toEqual(['Weeknight']);
  });

  it('writes a schema.org graph', () => {
    const doc = JSON.parse(recipesFile([{ recipe: curry }]));
    expect(doc['@context']).toBe('https://schema.org');
    expect(doc['@graph'][0]).toMatchObject({
      '@type': 'Recipe',
      name: 'Chickpea curry',
      recipeYield: '2 portions',
      prepTime: 'PT15M',
      totalTime: 'PT1H35M',
      recipeCategory: ['Meal', 'Weeknight'],
    });
    expect(doc['@graph'][0].image).toBeUndefined();
  });
});

describe('recipes from elsewhere', () => {
  const page = `<html><head>
    <script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":["Recipe"],
      "name":"Lemon &amp; Ricotta Cake","image":["https://example.com/cake.jpg"],
      "recipeYield":["8","8 slices"],"prepTime":"PT20M","cookTime":"PT45M",
      "recipeCategory":"Dessert","keywords":"cake, lemon, easy bake",
      "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","bestRating":"5"},
      "description":"A <b>light</b> cake.",
      "recipeIngredient":["200 g ricotta","2 lemons"],
      "recipeInstructions":[{"@type":"HowToStep","text":"Mix."},{"@type":"HowToStep","text":"Bake."}]}]}
    </script></head></html>`;

  it('reads the JSON-LD of a saved web page', () => {
    const [cake] = parseRecipesFile(page, tags, 1).recipes;
    expect(cake).toMatchObject({
      title: 'Lemon & Ricotta Cake',
      portions: 8,
      prepMinutes: 20,
      totalMinutes: 65,
      ingredients: ['200 g ricotta', '2 lemons'],
      steps: ['Mix.', 'Bake.'],
      notes: 'A light cake.',
      linkedPhoto: true,
      fromSanso: false,
    });
    expect(cake!.photo).toBeUndefined();
  });

  it('keeps only tags this phone has, and not the site’s public rating', () => {
    const { recipes, newTags } = parseRecipesFile(page, tags, 1);
    expect(recipes[0]!.tags).toEqual(['Dessert']);
    expect(recipes[0]!.score).toBeUndefined();
    expect(newTags).toEqual([]);
  });

  it('uses the default portions when there is no yield', () => {
    const file = JSON.stringify({ '@type': 'Recipe', name: 'Toast', recipeIngredient: ['bread'] });
    expect(parseRecipesFile(file, tags, 2).recipes[0]!.portions).toBe(2);
  });

  it('rejects files without recipes', () => {
    expect(() => parseRecipesFile('{"@type":"Person"}', tags, 1)).toThrow('No recipes');
    expect(() => parseRecipesFile('{nope', tags, 1)).toThrow('valid JSON');
    expect(() => parseRecipesFile('<html></html>', tags, 1)).toThrow('No recipes');
  });

  it('never takes a photo that isn’t an inlined image', () => {
    const file = JSON.stringify({
      '@type': 'Recipe',
      name: 'Odd',
      image: 'data:text/html;base64,PHNjcmlwdD4=',
    });
    const [odd] = parseRecipesFile(file, tags, 1).recipes;
    expect(odd!.photo).toBeUndefined();
  });
});
