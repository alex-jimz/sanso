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
  /**
   * One line per ingredient, as typed. A line ending in ":" is a group heading.
   * "or" between ingredients offers a choice, as in "600 g chicken thighs or 600 g chicken breast".
   */
  ingredients: string[];
  /** Options picked on the recipe page, as option keys from choices.ts. New meals start with them. */
  choices?: string[];
  steps: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type Shop = 'aldi' | 'lidl' | 'any';
export type PackUnit = 'g' | 'ml' | 'pcs';
/** auto: by amount type. check: always under "Check what you have". skip: never listed. */
export type ListMode = 'auto' | 'check' | 'skip';

/** Offers run for a week, Thursday to Wednesday (offers.ts). */
export interface Offer {
  /** Offer price of one pack, in euro. */
  price: number;
  /** First day of the offer, YYYY-MM-DD, a Thursday. */
  from: string;
  /** Last day of the offer, YYYY-MM-DD, a Wednesday. */
  until: string;
}

/** The regular price from a day on, for the price graph. */
export interface PricePoint {
  /** YYYY-MM-DD */
  date: string;
  price: number;
}

/** Per 100 g, or per 100 ml for products sold by volume, as on EU labels. */
export interface Nutrition {
  kcal?: number;
  /** Grams. */
  protein?: number;
  /** Grams. */
  fat?: number;
  /** Grams, without fibre, as on EU labels. */
  carbs?: number;
}

/** One part a product breaks down into at home, per pack, as in 450 g of thighs per chicken. */
export interface BreakdownPart {
  productId: string;
  amount: number;
  /** Grams, or pieces for parts counted like "2 drumsticks". */
  unit: 'g' | 'pcs';
  /** Share of the pack's price that this part carries, in percent. No share means free. */
  costShare?: number;
}

/** How a shopping item is got: the product as it is, or one that breaks down into it. */
export type Via = 'self' | string;

export interface Product {
  id: string;
  name: string;
  /** Parts one pack breaks down into, for things cut up at home like a whole chicken. */
  breakdown?: BreakdownPart[];
  /** The way this product was last got, so the next list suggests it. */
  lastVia?: Via;
  /** A photo stored on the phone. Shown instead of `imageUrl`. */
  photoId?: string;
  nutrition?: Nutrition;
  /** Salt, spices and the like: counted as zero calories and zero cost. */
  negligible?: boolean;
  /**
   * Grams in one of a recipe unit, by unit id, as in { clove: 5, tbsp: 14 }.
   * "piece" is used for plain counts, as in "2 onions".
   */
  weights?: Record<string, number>;
  sectionId?: string;
  shop: Shop;
  packSize?: number;
  packUnit?: PackUnit;
  /** Price of one pack, in euro. */
  price?: number;
  url?: string;
  /** Aldi's product number, the long number at the end of an aldi.ie product link. */
  sku?: string;
  /** Product photo on Aldi's image server. */
  imageUrl?: string;
  /** Day the price was last read from aldi.ie, YYYY-MM-DD. */
  priceCheckedAt?: string;
  listMode: ListMode;
  /** Normalised ingredient names linked to this product. Several products can share one. */
  aliases: string[];
  /**
   * Names this product is the usual pick for, so recipes that haven't picked
   * one use it. Each name is the usual pick of one product at most.
   */
  usualFor?: string[];
  /** Normalised ingredient names its name contains that don't mean it, as "milk" for Coconut milk. */
  notFor?: string[];
  /** Past, current and upcoming offers, in date order. Older versions stored a single `offer`. */
  offers?: Offer[];
  /** Regular price changes, oldest first. Recorded when the price changes (priceHistory.ts). */
  priceLog?: PricePoint[];
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
  /** Options picked for this meal, as option keys from choices.ts. Copied from the recipe when planned. */
  choices?: string[];
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
  /**
   * For products with more than one way to get them: "self", or the id of the
   * product that breaks down into this one. Such an item is bought as part of that product.
   */
  via?: Via;
  /** Extra packs of this product, to cover parts other items get from it. */
  partPacks?: number;
  /** Added only to cover other items' parts, not needed by a recipe itself. */
  forParts?: boolean;
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
