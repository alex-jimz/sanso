// Meals the Cook page offers: planned with a recipe, not cooked yet, from
// yesterday to six days ahead, in the order they're eaten.

import { addDays } from './dates';
import type { Meal, Recipe } from './types';

const order = (m: Meal) => `${m.date}-${m.slot === 'lunch' ? 0 : 1}`;

export function mealsToCook(meals: Meal[], recipeById: Map<string, Recipe>, today: string): Meal[] {
  return meals
    .filter(
      (m) =>
        m.recipeId &&
        recipeById.has(m.recipeId) &&
        m.state !== 'cooked' &&
        m.state !== 'noCooking' &&
        m.date >= addDays(today, -1) &&
        m.date <= addDays(today, 6),
    )
    .sort((a, b) => order(a).localeCompare(order(b)));
}
