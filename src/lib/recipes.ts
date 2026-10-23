import type { Recipe } from './types';

export type RecipeSort = 'score' | 'recent' | 'title' | 'time';

export const recipeSorts: { id: RecipeSort; label: string }[] = [
  { id: 'score', label: 'Best rated' },
  { id: 'recent', label: 'Newest' },
  { id: 'time', label: 'Quickest' },
  { id: 'title', label: 'A to Z' },
];

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Matches the title, tags and ingredients, so "chickpeas" finds every recipe using them. */
export function filterRecipes(recipes: Recipe[], query: string, tag: string | null): Recipe[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return recipes.filter((recipe) => {
    if (tag && !recipe.tags.includes(tag)) return false;
    if (!words.length) return true;
    const haystack = fold(
      `${recipe.title} ${recipe.tags.join(' ')} ${recipe.ingredients.join(' ')}`,
    );
    return words.every((w) => haystack.includes(w));
  });
}

export function sortRecipes(recipes: Recipe[], sort: RecipeSort): Recipe[] {
  const byTitle = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title);
  const sorted = [...recipes];
  if (sort === 'score') sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || byTitle(a, b));
  else if (sort === 'recent') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (sort === 'time') {
    const time = (r: Recipe) => r.totalMinutes ?? r.prepMinutes ?? Infinity;
    sorted.sort((a, b) => time(a) - time(b) || byTitle(a, b));
  } else sorted.sort(byTitle);
  return sorted;
}

/** One step per line; numbering such as "1." or "Step 2:" is dropped. */
export function parseSteps(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(step\s*)?\d+\s*[.):-]\s*/i, '').trim())
    .filter(Boolean);
}
