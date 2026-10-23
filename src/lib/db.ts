import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Meal, Product, Recipe, Section } from './types';

interface SansoDB extends DBSchema {
  recipes: { key: string; value: Recipe };
  products: { key: string; value: Product };
  sections: { key: string; value: Section };
  meals: { key: string; value: Meal };
  /** Recipe photos by photo id. */
  photos: { key: string; value: Blob };
  /** Single values: list, cooking, settings, meta. */
  kv: { key: string; value: unknown };
}

export type RecordStore = 'recipes' | 'products' | 'sections' | 'meals';

let opening: Promise<IDBPDatabase<SansoDB>> | undefined;

export function db(): Promise<IDBPDatabase<SansoDB>> {
  opening ??= openDB<SansoDB>('sanso', 1, {
    upgrade(database) {
      database.createObjectStore('recipes', { keyPath: 'id' });
      database.createObjectStore('products', { keyPath: 'id' });
      database.createObjectStore('sections', { keyPath: 'id' });
      database.createObjectStore('meals', { keyPath: 'id' });
      database.createObjectStore('photos');
      database.createObjectStore('kv');
    },
  });
  return opening;
}

export async function putRecord<S extends RecordStore>(store: S, value: SansoDB[S]['value']) {
  await (await db()).put(store, value);
}

export async function deleteRecord(store: RecordStore, id: string) {
  await (await db()).delete(store, id);
}

export async function getValue<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined;
}

export async function setValue(key: string, value: unknown) {
  await (await db()).put('kv', value, key);
}

export async function getPhoto(id: string): Promise<Blob | undefined> {
  return (await db()).get('photos', id);
}

export async function putPhoto(id: string, blob: Blob) {
  await (await db()).put('photos', blob, id);
}

export async function deletePhoto(id: string) {
  await (await db()).delete('photos', id);
}

export async function allPhotos(): Promise<Map<string, Blob>> {
  const database = await db();
  const tx = database.transaction('photos');
  const [keys, values] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()]);
  await tx.done;
  return new Map(keys.map((key, i) => [key, values[i]!]));
}

export interface StoredData {
  recipes: Recipe[];
  products: Product[];
  sections: Section[];
  meals: Meal[];
  kv: Record<string, unknown>;
  photos: Map<string, Blob>;
}

/** Replaces everything in one transaction, for restores and imports. */
export async function replaceAll(data: StoredData) {
  const database = await db();
  const tx = database.transaction(
    ['recipes', 'products', 'sections', 'meals', 'photos', 'kv'],
    'readwrite',
  );
  const ops: Promise<unknown>[] = [
    tx.objectStore('recipes').clear(),
    tx.objectStore('products').clear(),
    tx.objectStore('sections').clear(),
    tx.objectStore('meals').clear(),
    tx.objectStore('photos').clear(),
  ];
  for (const r of data.recipes) ops.push(tx.objectStore('recipes').put(r));
  for (const p of data.products) ops.push(tx.objectStore('products').put(p));
  for (const s of data.sections) ops.push(tx.objectStore('sections').put(s));
  for (const m of data.meals) ops.push(tx.objectStore('meals').put(m));
  for (const [id, blob] of data.photos) ops.push(tx.objectStore('photos').put(blob, id));
  for (const [key, value] of Object.entries(data.kv))
    ops.push(tx.objectStore('kv').put(value, key));
  ops.push(tx.done);
  await Promise.all(ops);
}

/** Asks the browser not to clear the data when space runs low. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
