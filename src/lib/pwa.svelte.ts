// Service worker registration and app updates. A new version is offered with
// an Update button and never applied on its own, so it can't interrupt
// shopping or cooking.

import { registerSW } from 'virtual:pwa-register';

class Pwa {
  needRefresh = $state(false);
  checking = $state(false);
}

export const pwa = new Pwa();

let registration: ServiceWorkerRegistration | undefined;

const updateServiceWorker = registerSW({
  onNeedRefresh() {
    pwa.needRefresh = true;
  },
  onRegisteredSW(_url, reg) {
    registration = reg;
    // Android keeps installed apps in memory, so also check when the app comes
    // back to the foreground, not only on a cold start.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg?.update();
    });
  },
});

/** Returns true if a new version is ready. */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false;
  pwa.checking = true;
  try {
    await registration.update();
    // The new worker needs a moment to install before onNeedRefresh fires.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  } finally {
    pwa.checking = false;
  }
  return pwa.needRefresh;
}

export function applyUpdate() {
  void updateServiceWorker(true);
}
