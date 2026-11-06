<script lang="ts">
  // Opens when a picture is shared to Sanso from Chrome: pick the product it's for.
  import Plus from '@lucide/svelte/icons/plus';
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import ProductPhoto from '../components/ProductPhoto.svelte';
  import { normalizeName } from '../lib/ingredients';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import { ui } from '../lib/ui.svelte';

  const photo = ui.pendingPhoto;
  const preview = photo ? URL.createObjectURL(photo) : undefined;
  let query = $state('');

  $effect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  });

  const typed = $derived(normalizeName(query));
  const matches = $derived(
    store.products
      .filter((p) => !typed || normalizeName(p.name).includes(typed))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  function open(path: string) {
    // ProductEdit takes the photo from ui.pendingPhoto.
    ui.pendingPhoto = photo;
    router.go(path, { replace: true });
  }

  function cancel() {
    ui.pendingPhoto = null;
    router.go('/more/products', { replace: true });
  }
</script>

<div class="page">
  <div class="top-bar">
    <button class="icon-btn" type="button" aria-label="Cancel" onclick={cancel}>
      <X size={22} />
    </button>
    <h1 class="top-bar-title">Add a photo</h1>
    <span></span>
  </div>

  {#if !photo}
    <p class="hint">The picture didn’t come through. Try sharing it again.</p>
  {:else}
    <div class="stack">
      <div class="preview"><img src={preview} alt="Shared from Chrome" /></div>
      <p class="hint">Which product is it for? You can check it before saving.</p>
      <label class="search">
        <span class="sr-only">Search products</span>
        <Search class="search-icon" size={18} />
        <input
          class="input"
          type="search"
          placeholder="Search or type a new name"
          bind:value={query}
          autocomplete="off"
        />
      </label>
      {#if typed && !store.products.some((p) => normalizeName(p.name) === typed)}
        <button
          class="btn btn-outline"
          type="button"
          onclick={() => open(`/more/products/new?name=${encodeURIComponent(query.trim())}`)}
        >
          <Plus size={18} /> New product “{query.trim()}”
        </button>
      {/if}
      <ul class="list">
        {#each matches as p (p.id)}
          <li>
            <button class="row" type="button" onclick={() => open(`/more/products/${p.id}`)}>
              <ProductPhoto url={p.imageUrl} photoId={p.photoId} size={36} />
              <span class="row-main"><span class="row-title">{p.name}</span></span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .preview {
    display: grid;
    place-items: center;
    padding: 10px;
    border-radius: var(--radius);
    background: var(--surface);
  }

  .preview img {
    max-width: 100%;
    max-height: 220px;
    border-radius: 10px;
    object-fit: contain;
  }
</style>
