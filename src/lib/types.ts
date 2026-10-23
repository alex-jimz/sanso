// The data model. Everything here is stored on the phone in IndexedDB and is
// included in backups, so changes need a migration in db.ts.

export interface Recipe {
  id: string;
  title: string;
  /** Key of the photo in the photos store. */
  photoId?: string;
  tags: string[];
  /** Number of portions the ingredient amounts are written for. */
  portions: number;
  prepMinutes?: number;
  /** Includes waiting time such as marinating, proving or baking. */
  totalMinutes?: number;
  /** 0 to 10. Undefined until rated. */
  score?: number;
  /** One line per ingredient, as typed. A line ending in ":" is a group heading. */
  ingredients: string[];
  steps: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type Shop = 'aldi' | 'lidl' | 'any';
export type PackUnit = 'g' | 'ml' | 'pcs';
/** auto: by amount type. check: always under "Check what you have". skip: never listed. */
export type ListMode = 'auto' | 'check' | 'skip';

export interface Offer {
  /** Offer price of one pack, in euro. */
  price: number;
  /** Last day of the offer, YYYY-MM-DD. */
  until: string;
}

export interface Product {
  id: string;
  name: string;
  sectionId?: string;
  shop: Shop;
  packSize?: number;
  packUnit?: PackUnit;
  /** Price of one pack, in euro. */
  price?: number;
  url?: string;
  listMode: ListMode;
  /** Normalised ingredient names that mean this product. */
  aliases: string[];
  offer?: Offer;
  createdAt: string;
  updatedAt: string;
}

export type Zone = 'ambient' | 'fridge' | 'freezer';

export interface Section {
  id: string;
  name: string;
  zone: Zone;
  /** Walking order in the shop. */
  order: number;
}

export type Slot = 'lunch' | 'dinner';
export type MealState = 'toShop' | 'ready' | 'cooked' | 'noCooking';

export interface Meal {
  /** `${date}:${slot}` */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  slot: Slot;
  recipeId?: string;
  portions: number;
  state: MealState;
  note?: string;
}

/** What one shopping item adds up to, by kind of amount. */
export interface Amounts {
  /** Grams. */
  mass: number;
  /** Millilitres. */
  volume: number;
  /** Plain counts, as in "2 onions". */
  count: number;
  /** Other units by unit id, e.g. { tbsp: 2, clove: 3 }. */
  other: Record<string, number>;
  /** True if a line gave no amount at all, as in "salt". */
  unspecified: boolean;
}

/** buy: on the list. check: may already be at home. have: the user has it. */
export type ItemPart = 'buy' | 'check' | 'have';

export interface ItemSource {
  mealId: string;
  recipeId: string;
  /** The ingredient line, scaled to the meal's portions. */
  text: string;
}

export interface ShoppingItem {
  id: string;
  /** "p:<product id>" or "n:<normalised name>". Merges lines and keeps decisions when the list is rebuilt. */
  key: string;
  productId?: string;
  name: string;
  part: ItemPart;
  /** True once the user has moved the item between parts themselves. */
  decided: boolean;
  amounts: Amounts;
  sources: ItemSource[];
  /** Added by hand rather than from a recipe. */
  manual: boolean;
  /** Free-text amount or note, mainly for manual items. */
  note?: string;
  /** Section for items with no product. */
  sectionId?: string;
  done: boolean;
}

export interface ShoppingList {
  mealIds: string[];
  items: ShoppingItem[];
  createdAt: string;
  /** True while in shop mode. */
  shopping: boolean;
}

export interface CookingSession {
  mealIds: string[];
  startedAt: string;
  /** Keys of ticked ingredients and finished steps. */
  ticked: string[];
}

export interface BackupSettings {
  /** "owner/name" of a private GitHub repository. */
  repo: string;
  token: string;
  lastBackupAt?: string;
  lastError?: string;
}

export interface Settings {
  defaultPortions: number;
  /** Tag vocabulary, in display order. */
  tags: string[];
  backup?: BackupSettings;
}

export interface Meta {
  /** When local data last changed. Compared with the last backup. */
  changedAt?: string;
}

/** Everything the app stores, as written to backups and export files. */
export interface DataSnapshot {
  version: 1;
  recipes: Recipe[];
  products: Product[];
  sections: Section[];
  meals: Meal[];
  list: ShoppingList | null;
  settings: Omit<Settings, 'backup'>;
}
