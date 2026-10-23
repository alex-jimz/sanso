/**
 * Keeps the screen on until the returned function is called. Android drops the
 * lock whenever the app goes to the background, so it's taken again on return.
 */
export function keepScreenOn(onChange?: (on: boolean) => void): () => void {
  let lock: WakeLockSentinel | null = null;
  let active = true;

  async function acquire() {
    if (!active || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
    try {
      lock = await navigator.wakeLock.request('screen');
      onChange?.(true);
      lock.addEventListener('release', () => onChange?.(false));
    } catch {
      onChange?.(false);
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void acquire();
  };
  document.addEventListener('visibilitychange', onVisibility);
  void acquire();

  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisibility);
    void lock?.release().catch(() => {});
    lock = null;
  };
}
