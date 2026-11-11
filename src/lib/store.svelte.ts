// All app data, loaded into memory at startup. Each change updates this state
// first (so the screen reacts at once) and is then written to IndexedDB.

import { todayISO } from './dates';
import {
  db,
  deletePhoto,
  deleteRecord,
  getValue,
  putPhoto,
  putRecord,
  replaceAll,
  requestPersistence,
  setValue,
} from './db';
import {
  applyBreakdowns,
  cleanBreakdown,
  coveringSource,
  sourceIndex,
  withPartCost,
} from './breakdown';
import { ingredientRows, type IngredientRow, type Option } from './choices';
import { defaultSections, defaultSettings } from './defaults';
import { capitalize, normalizeName } from './ingredients';
import { cleanNutrition, cleanWeights, recipeFacts } from './nutrition';
import { cleanOffers } from './offers';
import { forgetPhotoUrls } from './photos';
import { cleanPriceLog, logPrice } from './priceHistory';
import type { ImportedRecipe } from './recipeFormat';
import { emptyAmounts, formatAmounts } from './quantity';
import { buildItems, mergeDecisions, productResolver, type Matcher } from './shopping';
import type {
  BackupSettings,
  CookingSession,
  DataSnapshot,
  ItemPart,
  Meal,
  Meta,
  Product,
  Recipe,
  Section,
  Settings,
  ShoppingItem,
  ShoppingList,
  Slot,
  Via,
  Zone,
} from './types';
import { showToast } from './ui.svelte';
import { newId, nowISO } from './util';

function plain<T>(value: T): T {
  return $state.snapshot(value) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function cleanRecipe(raw: Recipe): Recipe {
  return {
    ...raw,
    title: String(raw.title ?? ''),
    tags: strings(raw.tags),
    portions: Number(raw.portions) > 0 ? Number(raw.portions) : 1,
    ingredients: strings(raw.ingredients),
    choices: Array.isArray(raw.choices) ? strings(raw.choices) : undefined,
    steps: strings(raw.steps),
    notes: String(raw.notes ?? ''),
  };
}

export function cleanProduct(raw: Product): Product {
  // `offer` is how older versions stored a single offer; cleanOffers converts it.
  const { offer: _legacyOffer, ...rest } = raw as Product & { offer?: unknown };
  return {
    ...rest,
    offers: cleanOffers(raw as Product & { offer?: unknown }),
    priceLog: cleanPriceLog(raw.priceLog),
    nutrition: cleanNutrition(raw.nutrition),
    negligible: raw.negligible === true ? true : undefined,
    weights: cleanWeights(raw.weights),
    breakdown: cleanBreakdown(raw.breakdown, raw.id),
    lastVia: typeof raw.lastVia === 'string' ? raw.lastVia : undefined,
    photoId: typeof raw.photoId === 'string' ? raw.photoId : undefined,
    name: String(raw.name ?? ''),
    shop: raw.shop === 'aldi' || raw.shop === 'lidl' ? raw.shop : 'any',
    listMode: raw.listMode === 'check' || raw.listMode === 'skip' ? raw.listMode : 'auto',
    aliases: strings(raw.aliases),
    notFor: Array.isArray(raw.notFor) && raw.notFor.length ? strings(raw.notFor) : undefined,
    usualFor:
      Array.isArray(raw.usualFor) && raw.usualFor.length ? strings(raw.usualFor) : undefined,
  };
}

function records<T extends { id: string }>(value: unknown, clean: (r: T) => T = (r) => r): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is T => isObject(r) && typeof r.id === 'string').map(clean);
}

class Store {
  ready = $state(false);
  loadError = $state<string | null>(null);
  recipes = $state<Recipe[]>([]);
  products = $state<Product[]>([]);
  sections = $state<Section[]>([]);
  meals = $state<Meal[]>([]);
  list = $state<ShoppingList | null>(null);
  cooking = $state<CookingSession | null>(null);
  settings = $state<Settings>(defaultSettings());
  meta = $state<Meta>({});

  recipeById = $derived(new Map(this.recipes.map((r) => [r.id, r])));
  productById = $derived(new Map(this.products.map((p) => [p.id, p])));
  sectionById = $derived(new Map(this.sections.map((s) => [s.id, s])));
  mealById = $derived(new Map(this.meals.map((m) => [m.id, m])));
  orderedSections = $derived([...this.sections].sort((a, b) => a.order - b.order));
  /** Products an ingredient name can mean, best first. */
  resolve = $derived(productResolver(this.products));
  /** The best product for an ingredient name. */
  match: Matcher = $derived.by(() => {
    const resolve = this.resolve;
    return (name: string) => resolve(name)[0]?.product;
  });
  /** Products that break down into each product, by the part's id. */
  sources = $derived(sourceIndex(this.products));

  /** A recipe's ingredient lines with their options, picked as `choices` says. */
  rowsFor(recipe: Pick<Recipe, 'ingredients'>, choices: string[] | undefined) {
    return ingredientRows(recipe.ingredients, this.resolve, choices);
  }

  /** The price a product is costed at in recipes. Parts like chicken thighs take a share of what they're cut from. */
  priced = (product: Product): Product => withPartCost(product, this.sources);

  /** Calories, macros and cost per portion, for the recipe page's picks unless given others. */
  factsFor(recipe: Pick<Recipe, 'ingredients' | 'portions' | 'choices'>, choices = recipe.choices) {
    return recipeFacts(recipe, this.resolve, choices, this.priced);
  }

  /** Runs after every change to the data, e.g. to schedule a backup. */
  onChange: (() => void) | undefined;
  private askedPersistence = false;

  async load() {
    try {
      const database = await db();
      const [recipes, products, sections, meals, list, cooking, settings, meta] = await Promise.all(
        [
          database.getAll('recipes'),
          database.getAll('products'),
          database.getAll('sections'),
          database.getAll('meals'),
          getValue<ShoppingList>('list'),
          getValue<CookingSession>('cooking'),
          getValue<Settings>('settings'),
          getValue<Meta>('meta'),
        ],
      );
      this.recipes = recipes.map(cleanRecipe);
      this.products = products.map(cleanProduct);
      this.meals = meals;
      this.list = list ?? null;
      this.cooking = cooking ?? null;
      this.settings = { ...defaultSettings(), ...settings };
      this.meta = meta ?? {};
      if (sections.length) {
        this.sections = sections;
      } else {
        this.sections = structuredClone(defaultSections);
        await Promise.all(defaultSections.map((s) => putRecord('sections', s)));
      }
      this.ready = true;
    } catch (error) {
      console.error(error);
      this.loadError = error instanceof Error ? error.message : String(error);
    }
  }

  private async write(task: () => Promise<unknown>) {
    try {
      await task();
    } catch (error) {
      console.error(error);
      showToast('Couldn’t save that change. Please try again.');
      return;
    }
    this.meta.changedAt = nowISO();
    void setValue('meta', plain(this.meta)).catch(console.error);
    if (!this.askedPersistence) {
      this.askedPersistence = true;
      void requestPersistence().catch(console.error);
    }
    this.onChange?.();
  }

  // Recipes

  /** `photo`: a new Blob replaces the photo, null removes it, undefined keeps it. */
  async saveRecipe(
    input: Recipe,
    photo?: Blob | null,
    options: { keepCreatedAt?: boolean } = {},
  ): Promise<Recipe> {
    const recipe = cleanRecipe(plain(input));
    const previous = this.recipeById.get(recipe.id);
    const oldPhotoId = previous?.photoId;
    if (photo) recipe.photoId = newId();
    else if (photo === null) recipe.photoId = undefined;
    recipe.updatedAt = nowISO();
    if (!previous && !options.keepCreatedAt) recipe.createdAt = recipe.updatedAt;

    const i = this.recipes.findIndex((r) => r.id === recipe.id);
    if (i >= 0) this.recipes[i] = recipe;
    else this.recipes.push(recipe);

    await this.write(async () => {
      if (photo) await putPhoto(recipe.photoId!, photo);
      await putRecord('recipes', recipe);
      if (oldPhotoId && oldPhotoId !== recipe.photoId) await deletePhoto(oldPhotoId);
    });
    this.refreshList();
    return recipe;
  }

  /** Saves the options picked on the recipe page. Not an edit, so the recipe's date stays. */
  async setRecipeChoices(id: string, choices: string[]) {
    const recipe = this.recipeById.get(id);
    if (!recipe) return;
    recipe.choices = choices.length ? choices : undefined;
    const saved = plain(recipe);
    await this.write(() => putRecord('recipes', saved));
  }

  /** Deletes a recipe and removes it from upcoming meals that aren't cooked yet. */
  async deleteRecipe(id: string) {
    const recipe = this.recipeById.get(id);
    if (!recipe) return;
    const today = todayISO();
    const removed = new Set(
      this.meals
        .filter((m) => m.recipeId === id && m.date >= today && m.state !== 'cooked')
        .map((m) => m.id),
    );
    const photoId = recipe.photoId;
    this.recipes = this.recipes.filter((r) => r.id !== id);
    this.meals = this.meals.filter((m) => !removed.has(m.id));
    await this.write(async () => {
      await deleteRecord('recipes', id);
      if (photoId) await deletePhoto(photoId);
      await Promise.all([...removed].map((mealId) => deleteRecord('meals', mealId)));
    });
    if (this.list) await this.setListMeals(this.list.mealIds.filter((m) => !removed.has(m)));
  }

  /** Adds recipes from an import file as new recipes, and any new tags they bring. */
  async addImportedRecipes(items: { recipe: ImportedRecipe; photo?: Blob }[], newTags: string[]) {
    const tags = newTags.filter((t) => !this.settings.tags.includes(t));
    if (tags.length) await this.updateSettings({ tags: [...this.settings.tags, ...tags] });
    for (const { recipe: imported, photo } of items) {
      const now = nowISO();
      const { photo: _photo, linkedPhoto: _linked, fromSanso: _sanso, ...fields } = imported;
      const recipe: Recipe = {
        ...fields,
        id: newId(),
        createdAt: imported.createdAt ?? now,
        updatedAt: now,
      };
      await this.saveRecipe(recipe, photo, { keepCreatedAt: true });
    }
  }

  // Products

  /** `photo`: a new Blob replaces the photo, null removes it, undefined keeps it. */
  async saveProduct(input: Product, photo?: Blob | null): Promise<Product> {
    const product = cleanProduct(plain(input));
    const previous = this.productById.get(product.id);
    const oldPhotoId = previous?.photoId;
    product.priceLog = logPrice(previous && plain(previous), product, todayISO());
    if (photo) product.photoId = newId();
    else if (photo === null) product.photoId = undefined;
    const ownName = normalizeName(product.name);
    product.aliases = [...new Set(product.aliases.filter((a) => a && a !== ownName))];
    const notFor = (product.notFor ?? []).filter((n) => !product.aliases.includes(n));
    product.notFor = notFor.length ? [...new Set(notFor)] : undefined;
    // A usual pick is for a name the product is linked to.
    const usualFor = (product.usualFor ?? []).filter(
      (n) => n === ownName || product.aliases.includes(n),
    );
    product.usualFor = usualFor.length ? [...new Set(usualFor)] : undefined;
    product.updatedAt = nowISO();
    if (!this.productById.has(product.id)) product.createdAt = product.updatedAt;

    // Several products can be linked to one name, but only one is its usual pick.
    const changed: Product[] = [product];
    for (const other of this.products) {
      if (other.id === product.id || !other.usualFor) continue;
      const kept = other.usualFor.filter((n) => !product.usualFor?.includes(n));
      if (kept.length !== other.usualFor.length) {
        other.usualFor = kept.length ? kept : undefined;
        changed.push(plain(other));
      }
    }
    const i = this.products.findIndex((p) => p.id === product.id);
    if (i >= 0) this.products[i] = product;
    else this.products.push(product);

    await this.write(async () => {
      if (photo) await putPhoto(product.photoId!, photo);
      await Promise.all(changed.map((p) => putRecord('products', p)));
      if (oldPhotoId && oldPhotoId !== product.photoId) await deletePhoto(oldPhotoId);
    });
    this.refreshList();
    return product;
  }

  newProduct(name: string, extra: Partial<Product> = {}): Product {
    return {
      id: newId(),
      name: capitalize(name.trim()),
      shop: 'any',
      listMode: 'auto',
      aliases: [],
      createdAt: nowISO(),
      updatedAt: nowISO(),
      ...extra,
    };
  }

  /**
   * Remembers that an ingredient name can mean this product. With `usual`, it
   * also becomes the product recipes use for that name unless they picked another.
   */
  async linkName(productId: string, ingredientName: string, { usual = false } = {}) {
    const product = this.productById.get(productId);
    const name = normalizeName(ingredientName);
    if (!product || !name) return;
    const own = name === normalizeName(product.name);
    const linked = own || product.aliases.includes(name);
    const isUsual = !!product.usualFor?.includes(name);
    if (linked && (isUsual || !usual)) return;
    await this.saveProduct({
      ...plain(product),
      aliases: linked ? product.aliases : [...product.aliases, name],
      notFor: product.notFor?.filter((n) => n !== name),
      usualFor: usual && !isUsual ? [...(product.usualFor ?? []), name] : product.usualFor,
    });
  }

  /** Makes a product the usual pick for an ingredient name, in recipes that haven't picked one. */
  async setUsual(productId: string, ingredientName: string) {
    await this.linkName(productId, ingredientName, { usual: true });
    const product = this.productById.get(productId);
    if (product) showToast(`${product.name} is now the usual pick for “${ingredientName.trim()}”`);
  }

  /** Stops a product being offered for an ingredient name that its name happens to contain. */
  async notFor(productId: string, ingredientName: string) {
    const product = this.productById.get(productId);
    const name = normalizeName(ingredientName);
    if (!product || !name || product.notFor?.includes(name)) return;
    await this.saveProduct({
      ...plain(product),
      aliases: product.aliases.filter((a) => a !== name),
      notFor: [...(product.notFor ?? []), name],
    });
  }

  /**
   * Learns from a pick on a recipe or meal. A product picked from the whole
   * list, not one of the options, is linked to the name so it's offered in
   * every recipe. When no product matched the name exactly before, the pick
   * also becomes the usual one for that name. Returns true when it did.
   */
  async learnPick(row: IngredientRow, option: Option): Promise<boolean> {
    const product = option.product;
    if (!product) return false;
    const offered = row.options.some((o) => o.key === option.key);
    if (offered && option.exact) return false;
    const settled = row.options.some((o) => o.exact && o.line.text === option.line.text);
    if (offered && settled) return false;
    await this.linkName(product.id, option.line.name, { usual: !settled });
    if (settled) {
      showToast(`${product.name} is now offered for “${option.line.name}” in every recipe`);
      return false;
    }
    showToast(`${product.name} is now the usual pick for “${option.line.name}”`);
    return true;
  }

  async deleteProduct(id: string) {
    const photoId = this.productById.get(id)?.photoId;
    this.products = this.products.filter((p) => p.id !== id);
    // Products that broke down into it no longer list it as a part.
    const changed: Product[] = [];
    for (const other of this.products) {
      if (!other.breakdown?.some((part) => part.productId === id)) continue;
      const kept = other.breakdown.filter((part) => part.productId !== id);
      other.breakdown = kept.length ? kept : undefined;
      changed.push(plain(other));
    }
    await this.write(async () => {
      await deleteRecord('products', id);
      if (photoId) await deletePhoto(photoId);
      await Promise.all(changed.map((p) => putRecord('products', p)));
    });
    this.refreshList();
  }

  // Shop sections

  async saveSection(input: Section) {
    const section = plain(input);
    const i = this.sections.findIndex((s) => s.id === section.id);
    if (i >= 0) this.sections[i] = section;
    else this.sections.push(section);
    await this.write(() => putRecord('sections', section));
  }

  async addSection(name: string, zone: Zone): Promise<Section> {
    const order = Math.max(-1, ...this.sections.map((s) => s.order)) + 1;
    const section: Section = { id: newId(), name: name.trim(), zone, order };
    await this.saveSection(section);
    return section;
  }

  async moveSection(id: string, delta: -1 | 1) {
    const ordered = this.orderedSections.map((s) => plain(s));
    const i = ordered.findIndex((s) => s.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j]!, ordered[i]!];
    ordered.forEach((s, order) => (s.order = order));
    this.sections = ordered;
    await this.write(() => Promise.all(ordered.map((s) => putRecord('sections', s))));
  }

  async deleteSection(id: string) {
    const affected = this.products.filter((p) => p.sectionId === id);
    for (const product of affected) product.sectionId = undefined;
    for (const item of this.list?.items ?? [])
      if (item.sectionId === id) item.sectionId = undefined;
    this.sections = this.sections.filter((s) => s.id !== id);
    await this.write(async () => {
      await deleteRecord('sections', id);
      await Promise.all(affected.map((p) => putRecord('products', plain(p))));
      if (this.list) await setValue('list', plain(this.list));
    });
  }

  // Meal plan

  async saveMeal(input: Meal) {
    const meal = plain(input);
    const i = this.meals.findIndex((m) => m.id === meal.id);
    if (i >= 0) this.meals[i] = meal;
    else this.meals.push(meal);
    await this.write(() => putRecord('meals', meal));
    if (this.list?.mealIds.includes(meal.id)) this.refreshList();
  }

  async planRecipe(
    date: string,
    slot: Slot,
    recipeId: string,
    portions = this.settings.defaultPortions,
  ) {
    const choices = this.recipeById.get(recipeId)?.choices;
    const meal: Meal = {
      id: `${date}:${slot}`,
      date,
      slot,
      recipeId,
      portions,
      state: 'toShop',
      choices: choices ? [...choices] : undefined,
    };
    await this.saveMeal(meal);
    return meal;
  }

  async removeMeal(id: string) {
    this.meals = this.meals.filter((m) => m.id !== id);
    await this.write(() => deleteRecord('meals', id));
    if (this.list?.mealIds.includes(id))
      await this.setListMeals(this.list.mealIds.filter((m) => m !== id));
  }

  // Shopping list

  private buildFor(mealIds: string[]): ShoppingItem[] {
    const meals = mealIds.map((id) => this.mealById.get(id)).filter((m): m is Meal => !!m);
    return buildItems(meals, this.recipeById, this.resolve, newId);
  }

  private async saveList() {
    if (this.list)
      this.list.items = applyBreakdowns(plain(this.list.items), this.productById, newId);
    await this.write(() => setValue('list', this.list ? plain(this.list) : null));
  }

  async createList(mealIds: string[]) {
    this.list = { mealIds, items: this.buildFor(mealIds), createdAt: nowISO(), shopping: false };
    await this.saveList();
  }

  /** Changes which meals the list is for, keeping ticks, choices and manual items. */
  async setListMeals(mealIds: string[]) {
    if (!this.list) return this.createList(mealIds);
    const old = plain(this.list.items);
    this.list.mealIds = mealIds;
    this.list.items = mergeDecisions(this.buildFor(mealIds), old);
    await this.saveList();
  }

  /** Rebuilds the list after recipes, products or meals change. */
  refreshList() {
    if (this.list) void this.setListMeals([...this.list.mealIds]);
  }

  async updateItem(id: string, patch: Partial<ShoppingItem>) {
    const item = this.list?.items.find((i) => i.id === id);
    if (!item) return;
    Object.assign(item, patch);
    await this.saveList();
  }

  async setItemPart(id: string, part: ItemPart) {
    await this.updateItem(id, { part, decided: true });
  }

  /**
   * Says how to get an item with more than one way: as it is ("self"),
   * through a product that breaks down into it, or "have" when it's at home.
   * The way is remembered for the next list.
   */
  async chooseWay(id: string, way: Via | 'have') {
    const item = this.list?.items.find((i) => i.id === id);
    if (!item) return;
    if (way === 'have') {
      await this.updateItem(id, { part: 'have', decided: true });
      return;
    }
    await this.updateItem(id, { part: 'buy', decided: true, via: way });
    const product = item.productId ? this.productById.get(item.productId) : undefined;
    if (product && product.lastVia !== way)
      await this.saveProduct({ ...plain(product), lastVia: way });
  }

  /** Puts an item back under "Choose how to get". */
  async reopenChoice(id: string) {
    await this.updateItem(id, { decided: false, part: 'buy' });
  }

  async toggleDone(id: string) {
    const item = this.list?.items.find((i) => i.id === id);
    if (item) await this.updateItem(id, { done: !item.done });
  }

  /** Takes an item off the list. Returns a function that puts it back. */
  async removeItem(id: string): Promise<(() => void) | undefined> {
    const list = this.list;
    const index = list?.items.findIndex((i) => i.id === id) ?? -1;
    if (!list || index < 0) return;
    const before = plain(list.items[index]!);
    if (before.manual) list.items.splice(index, 1);
    else Object.assign(list.items[index]!, { part: 'have', decided: true });
    await this.saveList();
    return () => {
      if (!this.list) return;
      if (before.manual) {
        this.list.items.splice(Math.min(index, this.list.items.length), 0, before);
      } else {
        const item = this.list.items.find((i) => i.id === id);
        if (item) Object.assign(item, { part: before.part, decided: before.decided });
      }
      void this.saveList();
    };
  }

  async addManualItem(name: string, note?: string) {
    const text = name.trim();
    if (!text) return;
    const product = this.match(normalizeName(text));
    const item: ShoppingItem = {
      id: newId(),
      key: `m:${newId()}`,
      productId: product?.id,
      name: product?.name ?? capitalize(text),
      part: 'buy',
      decided: true,
      amounts: emptyAmounts(),
      sources: [],
      manual: true,
      note: note?.trim() || undefined,
      done: false,
    };
    if (!this.list) this.list = { mealIds: [], items: [], createdAt: nowISO(), shopping: false };
    this.list.items.push(item);
    await this.saveList();
  }

  async clearList() {
    this.list = null;
    await this.saveList();
  }

  async setShopping(shopping: boolean) {
    if (!this.list) return;
    this.list.shopping = shopping;
    await this.saveList();
  }

  /** Ends a shop: its meals become "Ready to cook". Returns how many meals changed. */
  async finishShopping(keepUnticked: boolean): Promise<number> {
    const list = this.list;
    if (!list) return 0;
    const ready = list.mealIds
      .map((id) => this.mealById.get(id))
      .filter((m): m is Meal => !!m && m.state === 'toShop');
    for (const meal of ready) meal.state = 'ready';
    const left: ShoppingItem[] = keepUnticked
      ? list.items
          // Parts bought through another product follow that product.
          .filter((i) => !i.done && i.part === 'buy' && !coveringSource(i, this.productById))
          .map((i) => ({
            ...plain(i),
            key: `m:${i.id}`,
            manual: true,
            decided: true,
            sources: [],
            note:
              i.note ?? (formatAmounts(i.amounts) || (i.partPacks ? `${i.partPacks}` : undefined)),
            amounts: emptyAmounts(),
            via: undefined,
            partPacks: undefined,
            forParts: undefined,
          }))
      : [];
    this.list = left.length
      ? { mealIds: [], items: left, createdAt: nowISO(), shopping: false }
      : null;
    await this.write(async () => {
      await Promise.all(ready.map((m) => putRecord('meals', plain(m))));
      await setValue('list', this.list ? plain(this.list) : null);
    });
    return ready.length;
  }

  // Cooking

  private async saveCooking() {
    await this.write(() => setValue('cooking', this.cooking ? plain(this.cooking) : null));
  }

  async startCooking(mealIds: string[]) {
    this.cooking = { mealIds, startedAt: nowISO(), ticked: [] };
    await this.saveCooking();
  }

  async toggleTick(key: string) {
    if (!this.cooking) return;
    const ticked = this.cooking.ticked;
    const i = ticked.indexOf(key);
    if (i >= 0) ticked.splice(i, 1);
    else ticked.push(key);
    await this.saveCooking();
  }

  /** Marks the session's meals as cooked. Returns how many meals changed. */
  async finishCooking(): Promise<number> {
    const session = this.cooking;
    if (!session) return 0;
    const meals = session.mealIds.map((id) => this.mealById.get(id)).filter((m): m is Meal => !!m);
    for (const meal of meals) meal.state = 'cooked';
    this.cooking = null;
    await this.write(async () => {
      await Promise.all(meals.map((m) => putRecord('meals', plain(m))));
      await setValue('cooking', null);
    });
    return meals.length;
  }

  async stopCooking() {
    this.cooking = null;
    await this.saveCooking();
  }

  // Settings and backups

  async updateSettings(patch: Partial<Omit<Settings, 'backup'>>) {
    Object.assign(this.settings, patch);
    await this.write(() => setValue('settings', plain(this.settings)));
  }

  /** Backup status changes are saved without counting as a data change. */
  async setBackup(backup: BackupSettings | undefined) {
    this.settings.backup = backup;
    await setValue('settings', plain(this.settings));
  }

  snapshot(): DataSnapshot {
    const { backup: _backup, ...settings } = plain(this.settings);
    return {
      version: 1,
      recipes: plain(this.recipes),
      products: plain(this.products),
      sections: plain(this.sections),
      meals: plain(this.meals),
      list: this.list ? plain(this.list) : null,
      settings,
    };
  }

  /** Replaces all data, e.g. from a backup. Keeps this phone's backup settings. */
  async restore(raw: unknown, photos: Map<string, Blob>) {
    if (!isObject(raw) || raw.version !== 1) throw new Error('This isn’t a Sanso backup.');
    const recipes = records<Recipe>(raw.recipes, cleanRecipe);
    const products = records<Product>(raw.products, cleanProduct);
    const sections = records<Section>(raw.sections);
    const meals = records<Meal>(raw.meals);
    const list =
      isObject(raw.list) && Array.isArray(raw.list.items)
        ? (raw.list as unknown as ShoppingList)
        : null;
    const settings: Settings = {
      ...defaultSettings(),
      ...(isObject(raw.settings) ? (raw.settings as Partial<Settings>) : {}),
      backup: plain(this.settings.backup),
    };
    const meta: Meta = { changedAt: nowISO() };
    await replaceAll({
      recipes,
      products,
      sections: sections.length ? sections : structuredClone(defaultSections),
      meals,
      photos,
      kv: { list, settings, meta, cooking: null },
    });
    forgetPhotoUrls();
    this.recipes = recipes;
    this.products = products;
    this.sections = sections.length ? sections : structuredClone(defaultSections);
    this.meals = meals;
    this.list = list;
    this.cooking = null;
    this.settings = settings;
    this.meta = meta;
  }
}

export const store = new Store();
