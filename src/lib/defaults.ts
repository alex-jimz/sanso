import type { Section, Settings } from './types';

/** Walking order: dry goods first, then fresh, then fridge, then freezer. Editable in the app. */
export const defaultSections: Section[] = [
  { id: 'grains', name: 'Pasta, rice & grains', zone: 'ambient', order: 0 },
  { id: 'tins', name: 'Tins & jars', zone: 'ambient', order: 1 },
  { id: 'baking', name: 'Baking', zone: 'ambient', order: 2 },
  { id: 'sauces', name: 'Oils, sauces & spices', zone: 'ambient', order: 3 },
  { id: 'breakfast', name: 'Breakfast & snacks', zone: 'ambient', order: 4 },
  { id: 'drinks', name: 'Drinks', zone: 'ambient', order: 5 },
  { id: 'household', name: 'Household', zone: 'ambient', order: 6 },
  { id: 'veg', name: 'Fruit & veg', zone: 'ambient', order: 7 },
  { id: 'bread', name: 'Bread', zone: 'ambient', order: 8 },
  { id: 'dairy', name: 'Dairy & eggs', zone: 'fridge', order: 9 },
  { id: 'meat', name: 'Meat & fish', zone: 'fridge', order: 10 },
  { id: 'chilled', name: 'Chilled', zone: 'fridge', order: 11 },
  { id: 'frozen', name: 'Frozen', zone: 'freezer', order: 12 },
];

export const defaultTags = ['Meal', 'Dessert', 'Breakfast/snack', 'Baking'];

export function defaultSettings(): Settings {
  return { defaultPortions: 1, tags: [...defaultTags] };
}
