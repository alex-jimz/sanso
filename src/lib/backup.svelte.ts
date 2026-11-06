// Backups to a private GitHub repository, plus export and import as a file.
//
// A backup is one commit containing recipes.json, products.json, sections.json,
// plan.json, list.json, settings.json and photos/<id>.<ext>. Only files that
// changed are uploaded: each file's git blob hash is computed here and compared
// with the repository's tree first. The token never appears in backed-up files.

import { allPhotos } from './db';
import { blobToDataUrl, downloadFile } from './files';
import { store } from './store.svelte';
import type { BackupSettings, DataSnapshot } from './types';
import { nowISO } from './util';

const API = 'https://api.github.com';

class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function explain(status: number, message: string): string {
  if (status === 401)
    return 'GitHub rejected the token. It may have expired: make a new one and paste it in.';
  if (status === 403)
    return `GitHub refused (${message}). Check the token can read and write this repository’s contents.`;
  if (status === 404)
    return 'Repository not found. Check its name and that the token has access to it.';
  return `GitHub error ${status}: ${message}`;
}

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new GitHubError('Couldn’t reach GitHub. Check the connection.', 0);
  }
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Keep the status text.
    }
    throw new GitHubError(explain(response.status, message), response.status);
  }
  return (await response.json()) as T;
}

function repoPath(repo: string): string {
  const m = /^\s*([\w.-]+)\/([\w.-]+)\s*$/.exec(repo);
  if (!m) throw new Error('Enter the repository as owner/name, for example alex-jimz/sanso-data.');
  return `/repos/${m[1]}/${m[2]}`;
}

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The hash git gives a file's contents, so unchanged files can be skipped. */
async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = encoder.encode(`blob ${bytes.length}\0`);
  const data = new Uint8Array(header.length + bytes.length);
  data.set(header);
  data.set(bytes, header.length);
  const hash = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const photoTypes: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  png: 'image/png',
};

function photoExtension(type: string): string {
  return type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp';
}

const json = (value: unknown) => encoder.encode(`${JSON.stringify(value, null, 2)}\n`);

const readme = `# Sanso data

Backups from the Sanso app: recipes, products, shop sections, meal plan and shopping list as JSON, and recipe photos. Each backup is one commit, so the history shows every change.

Keep this repository private.
`;

interface Head {
  base: string;
  branch: string;
  commit: string;
  /** When the latest commit was made. */
  date: string;
  tree: string;
  files: Map<string, string>;
}

/**
 * Reads the latest commit of the repository's default branch. An empty
 * repository has no branch yet: with `create` a README is added to start one,
 * otherwise the result is null.
 */
async function readHead(token: string, repo: string, create: true): Promise<Head>;
async function readHead(token: string, repo: string, create: false): Promise<Head | null>;
async function readHead(token: string, repo: string, create: boolean): Promise<Head | null> {
  const base = repoPath(repo);
  const info = await gh<{ private: boolean; default_branch: string }>(token, base);
  if (!info.private) {
    throw new Error(
      'This repository is public. Your data can only be backed up to a private repository.',
    );
  }
  const branch = info.default_branch;
  let commit: string;
  try {
    commit = (await gh<{ object: { sha: string } }>(token, `${base}/git/ref/heads/${branch}`))
      .object.sha;
  } catch (error) {
    if (!(error instanceof GitHubError) || (error.status !== 409 && error.status !== 404)) {
      throw error;
    }
    if (!create) return null;
    const created = await gh<{ commit: { sha: string } }>(token, `${base}/contents/README.md`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Start Sanso backups',
        content: toBase64(encoder.encode(readme)),
      }),
    });
    commit = created.commit.sha;
  }
  const details = await gh<{ tree: { sha: string }; committer: { date: string } }>(
    token,
    `${base}/git/commits/${commit}`,
  );
  const tree = details.tree.sha;
  const listing = await gh<{ tree: { path: string; sha: string; type: string }[] }>(
    token,
    `${base}/git/trees/${tree}?recursive=1`,
  );
  const files = new Map(listing.tree.filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
  return { base, branch, commit, date: details.committer.date, tree, files };
}

async function readJsonFile(token: string, head: Head, path: string): Promise<unknown> {
  const sha = head.files.get(path);
  if (!sha) return undefined;
  const blob = await gh<{ content: string }>(token, `${head.base}/git/blobs/${sha}`);
  return JSON.parse(new TextDecoder().decode(fromBase64(blob.content)));
}

export interface BackupSummary {
  /** When the latest backup was made. */
  savedAt: string;
  recipes: number;
  products: number;
}

/**
 * Checks the token and repository and says what backup it holds, without
 * changing anything. Null means the repository has no Sanso backup yet.
 */
export async function inspectGitHubBackup(
  settings: Pick<BackupSettings, 'repo' | 'token'>,
): Promise<BackupSummary | null> {
  const head = await readHead(settings.token, settings.repo, false);
  if (!head?.files.has('recipes.json')) return null;
  const [recipes, products] = await Promise.all([
    readJsonFile(settings.token, head, 'recipes.json'),
    readJsonFile(settings.token, head, 'products.json'),
  ]);
  return {
    savedAt: head.date,
    recipes: Array.isArray(recipes) ? recipes.length : 0,
    products: Array.isArray(products) ? products.length : 0,
  };
}

/**
 * Refuses to replace a backup that has recipes or products with one that has
 * none. That is what an empty phone, such as a new install, would upload, and
 * it would hide the real backup from Restore.
 */
async function refuseEmptyOverwrite(head: Head, files: Map<string, Uint8Array>) {
  const empty = await gitBlobSha(json([]));
  for (const [path, what] of [
    ['recipes.json', 'recipes'],
    ['products.json', 'products'],
  ] as const) {
    const remote = head.files.get(path);
    if (!remote || remote === empty) continue;
    if ((await gitBlobSha(files.get(path)!)) !== empty) continue;
    throw new Error(
      `This phone has no ${what}, but the backup on GitHub has some, so Sanso didn’t replace it. ` +
        `Tap Restore to get them back. If you deleted them on purpose, delete ${path} in the repository first.`,
    );
  }
}

function backupFiles(snapshot: DataSnapshot): Map<string, Uint8Array> {
  return new Map([
    ['recipes.json', json(snapshot.recipes)],
    ['products.json', json(snapshot.products)],
    ['sections.json', json(snapshot.sections)],
    ['plan.json', json(snapshot.meals)],
    ['list.json', json(snapshot.list)],
    ['settings.json', json({ version: snapshot.version, ...snapshot.settings })],
  ]);
}

/** Uploads what changed since the last backup as one commit. */
export async function backUpToGitHub(settings: BackupSettings): Promise<'saved' | 'unchanged'> {
  const { token } = settings;
  const head = await readHead(token, settings.repo, true);
  const files = backupFiles(store.snapshot());
  await refuseEmptyOverwrite(head, files);
  const photos = await allPhotos();
  const wanted = new Set<string>();
  for (const [id, blob] of photos) {
    const path = `photos/${id}.${photoExtension(blob.type)}`;
    wanted.add(path);
    if (!head.files.has(path)) files.set(path, new Uint8Array(await blob.arrayBuffer()));
  }

  const changes: { path: string; mode: '100644'; type: 'blob'; sha: string | null }[] = [];
  for (const [path, bytes] of files) {
    if (head.files.get(path) === (await gitBlobSha(bytes))) continue;
    const blob = await gh<{ sha: string }>(token, `${head.base}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: toBase64(bytes), encoding: 'base64' }),
    });
    changes.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  for (const path of head.files.keys()) {
    if (path.startsWith('photos/') && !wanted.has(path)) {
      changes.push({ path, mode: '100644', type: 'blob', sha: null });
    }
  }
  if (!changes.length) return 'unchanged';

  const tree = await gh<{ sha: string }>(token, `${head.base}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: head.tree, tree: changes }),
  });
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const commit = await gh<{ sha: string }>(token, `${head.base}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `Backup ${stamp} UTC`,
      tree: tree.sha,
      parents: [head.commit],
    }),
  });
  await gh(token, `${head.base}/git/refs/heads/${head.branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
  return 'saved';
}

/** Downloads the latest backup. Doesn't change anything on the phone. */
export async function fetchGitHubBackup(settings: BackupSettings) {
  const { token } = settings;
  const head = await readHead(token, settings.repo, false);
  if (!head?.files.has('recipes.json'))
    throw new Error('There’s no backup in this repository yet.');
  const readJson = (path: string) => readJsonFile(token, head, path);
  const [recipes, products, sections, meals, list, settingsFile] = await Promise.all([
    readJson('recipes.json'),
    readJson('products.json'),
    readJson('sections.json'),
    readJson('plan.json'),
    readJson('list.json'),
    readJson('settings.json'),
  ]);
  const photos = new Map<string, Blob>();
  for (const [path, sha] of head.files) {
    const m = /^photos\/([\w-]+)\.(webp|jpg|png)$/.exec(path);
    if (!m) continue;
    const blob = await gh<{ content: string }>(token, `${head.base}/git/blobs/${sha}`);
    photos.set(
      m[1]!,
      new Blob([fromBase64(blob.content) as BlobPart], { type: photoTypes[m[2]!] }),
    );
  }
  const settingsObject = (settingsFile ?? {}) as Record<string, unknown>;
  const { version: _version, ...appSettings } = settingsObject;
  return {
    data: {
      version: 1,
      recipes,
      products,
      sections,
      meals,
      list: list ?? null,
      settings: appSettings,
    },
    photos,
  };
}

// File export and import, as a safety net that needs no account.

export async function exportFile() {
  const photos: Record<string, string> = {};
  for (const [id, blob] of await allPhotos()) photos[id] = await blobToDataUrl(blob);
  const file = new Blob([JSON.stringify({ ...store.snapshot(), photos })], {
    type: 'application/json',
  });
  downloadFile(file, `sanso-${nowISO().slice(0, 10)}.json`);
}

export async function readImportFile(file: File) {
  const raw = JSON.parse(await file.text()) as Record<string, unknown>;
  const photos = new Map<string, Blob>();
  const stored = raw.photos;
  if (stored && typeof stored === 'object') {
    for (const [id, dataUrl] of Object.entries(stored as Record<string, unknown>)) {
      if (typeof dataUrl !== 'string' || !/^data:image\/(webp|jpeg|png);base64,/.test(dataUrl))
        continue;
      photos.set(id, await (await fetch(dataUrl)).blob());
    }
  }
  return { data: raw, photos };
}

// Automatic backups: a few minutes after the last change, and when the app is
// put away with changes that aren't backed up yet.

class BackupStatus {
  running = $state(false);
}

export const backupStatus = new BackupStatus();

let timer: ReturnType<typeof setTimeout> | undefined;

export function backupConfigured(): boolean {
  const backup = store.settings.backup;
  return !!backup?.repo && !!backup.token;
}

export function hasUnsavedChanges(): boolean {
  const changed = store.meta.changedAt;
  const last = store.settings.backup?.lastBackupAt;
  return !!changed && (!last || changed > last);
}

export async function runBackup(): Promise<'saved' | 'unchanged' | 'failed' | 'off'> {
  const backup = store.settings.backup;
  if (!backup?.repo || !backup.token) return 'off';
  if (backupStatus.running) return 'unchanged';
  backupStatus.running = true;
  const startedAt = nowISO();
  try {
    const result = await backUpToGitHub(backup);
    await store.setBackup({ ...backup, lastBackupAt: startedAt, lastError: undefined });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.setBackup({ ...backup, lastError: message });
    return 'failed';
  } finally {
    backupStatus.running = false;
  }
}

function schedule(delay: number) {
  clearTimeout(timer);
  if (!backupConfigured()) return;
  timer = setTimeout(() => {
    if (navigator.onLine && hasUnsavedChanges()) void runBackup();
  }, delay);
}

export function startAutoBackup() {
  store.onChange = () => schedule(3 * 60_000);
  window.addEventListener('online', () => schedule(5_000));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hasUnsavedChanges()) schedule(0);
  });
  if (hasUnsavedChanges()) schedule(10_000);
}
