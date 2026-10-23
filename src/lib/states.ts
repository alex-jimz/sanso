import CircleCheck from '@lucide/svelte/icons/circle-check';
import CookingPot from '@lucide/svelte/icons/cooking-pot';
import ShoppingBasket from '@lucide/svelte/icons/shopping-basket';
import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
import type { MealState } from './types';

export const mealStates = [
  { id: 'toShop', label: 'To shop', short: 'To shop', icon: ShoppingBasket },
  { id: 'ready', label: 'Ready to cook', short: 'Ready', icon: CookingPot },
  { id: 'cooked', label: 'Cooked', short: 'Cooked', icon: CircleCheck },
  { id: 'noCooking', label: 'No cooking', short: 'No cooking', icon: UtensilsCrossed },
] as const satisfies readonly { id: MealState; label: string; short: string; icon: unknown }[];

export function stateInfo(state: MealState) {
  return mealStates.find((s) => s.id === state) ?? mealStates[0];
}

export const slotLabel = { lunch: 'Lunch', dinner: 'Dinner' } as const;
