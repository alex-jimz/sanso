// UI state shared across pages: toasts, confirm dialogs, and open bottom sheets.
//
// Each open sheet adds a browser history entry, so Android's back gesture
// closes the sheet instead of leaving the page. Closing sheets from the app
// removes their entries again with one history.go(-n), which completes
// asynchronously; afterHistory() lets navigation wait for that so the two
// can't interleave.

import type { SharedProduct } from './share';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

class Ui {
  toast = $state<{ id: number; message: string; action?: ToastAction } | null>(null);
  confirm = $state<ConfirmRequest | null>(null);
  /** A product page shared to Sanso from another app, waiting to be saved. */
  shared = $state<SharedProduct | null>(null);
}

export const ui = new Ui();

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastId = 0;

export function showToast(message: string, action?: ToastAction, ms = 4500) {
  ui.toast = { id: ++toastId, message, action };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (ui.toast = null), ms);
}

export function hideToast() {
  clearTimeout(toastTimer);
  ui.toast = null;
}

export function askConfirm(request: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    ui.confirm = { ...request, resolve };
  });
}

interface SheetEntry {
  close: () => void;
}

const sheets: SheetEntry[] = [];
/** history.go() calls whose popstate hasn't arrived yet. */
let traversals = 0;
/** Sheet entries to remove with the next history.go(). */
let queued = 0;
let waiting: (() => void)[] = [];

function runWaiting() {
  const run = waiting;
  waiting = [];
  for (const fn of run) fn();
}

window.addEventListener('popstate', () => {
  if (traversals > 0) {
    traversals--;
    if (traversals === 0 && queued === 0) runWaiting();
    return;
  }
  sheets.pop()?.close();
});

/** Removes history entries, batching everything closed in the same tick into one step. */
function removeEntries(count: number) {
  if (count <= 0) return;
  const first = queued === 0;
  queued += count;
  if (!first) return;
  queueMicrotask(() => {
    const n = queued;
    queued = 0;
    traversals++;
    history.go(-n);
  });
}

/** Registers an opened sheet. `close` runs when the user goes back. */
export function pushSheet(close: () => void): SheetEntry {
  const entry = { close };
  sheets.push(entry);
  history.pushState({ ...(history.state ?? {}), sheet: sheets.length }, '');
  return entry;
}

/** The app closed the sheet itself: drop its history entry. */
export function popSheet(entry: SheetEntry) {
  const i = sheets.indexOf(entry);
  if (i < 0) return;
  sheets.splice(i, 1);
  removeEntries(1);
}

/** The sheet disappeared with its page: forget it without touching history. */
export function forgetSheet(entry: SheetEntry) {
  const i = sheets.indexOf(entry);
  if (i >= 0) sheets.splice(i, 1);
}

/**
 * Closes every open sheet and runs `fn` once their history entries are gone.
 * Used before navigating, so a page change never lands under a stale sheet entry.
 */
export function afterHistory(fn: () => void) {
  const open = sheets.splice(0, sheets.length);
  for (const entry of open.reverse()) entry.close();
  removeEntries(open.length);
  if (traversals > 0 || queued > 0) waiting.push(fn);
  else fn();
}

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
