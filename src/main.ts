import '@fontsource-variable/fraunces/opsz.css';
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { startAutoBackup } from './lib/backup.svelte';
import { router } from './lib/router.svelte';
import { parseShare } from './lib/share';
import { store } from './lib/store.svelte';
import { showToast, ui } from './lib/ui.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('index.html is missing the #app element');

mount(App, { target });

/**
 * Chrome opens the app with ?title=…&text=…&url=… when a page is shared to it
 * (see share_target in vite.config.ts). Turn that into a product.
 */
function openSharedPage() {
  const params = new URLSearchParams(location.search);
  if (!params.has('title') && !params.has('text') && !params.has('url')) return;
  history.replaceState(history.state, '', `${location.pathname}${location.hash}`);
  const shared = parseShare(params);
  if (!shared) return;
  const known = shared.url ? store.products.find((p) => p.url === shared.url) : undefined;
  if (known) {
    router.go(`/more/products/${known.id}`);
    showToast('You already have this product. Update its price or offer here.');
  } else {
    ui.shared = shared;
    router.go('/more/products/new');
  }
}

void store.load().then(() => {
  if (!store.ready) return;
  startAutoBackup();
  openSharedPage();
});
