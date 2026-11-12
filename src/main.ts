import '@fontsource-variable/fraunces/opsz.css';
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { startAutoBackup } from './lib/backup.svelte';
import { router } from './lib/router.svelte';
import { takeSharedImage } from './lib/photos';
import { parseShare } from './lib/share';
import { store } from './lib/store.svelte';
import { showToast, ui } from './lib/ui.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('index.html is missing the #app element');

mount(App, { target });

/**
 * Chrome opens the app with ?title=…&text=…&url=… when a page is shared to it,
 * or ?shared-image=1 for a picture (see share_target in vite.config.ts and
 * public/share-target.js). Turn a page into a product, and ask which product
 * a picture is for.
 */
async function openShared() {
  const params = new URLSearchParams(location.search);
  if (params.has('shared-image')) {
    history.replaceState(history.state, '', `${location.pathname}${location.hash}`);
    const image = await takeSharedImage().catch(() => undefined);
    if (!image) {
      showToast('The picture didn’t come through. Try sharing it again.');
      return;
    }
    ui.pendingPhoto = image;
    // Replaced rather than pushed, so saving the product lands on Products.
    router.go('/photo', { replace: true });
    return;
  }
  if (!params.has('title') && !params.has('text') && !params.has('url')) return;
  history.replaceState(history.state, '', `${location.pathname}${location.hash}`);
  const shared = parseShare(params);
  if (!shared) return;
  const known = store.products.find(
    (p) => (!!shared.url && p.url === shared.url) || (!!shared.sku && p.sku === shared.sku),
  );
  if (known) {
    router.go(`/products/${known.id}`);
    showToast('You already have this product. Update its price or offer here.');
  } else {
    ui.shared = shared;
    router.go('/products/new');
  }
}

void store.load().then(() => {
  if (!store.ready) return;
  startAutoBackup();
  void openShared();
});
