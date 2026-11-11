<script lang="ts">
  // Searches your products, or creates a new one from what was typed.
  import Plus from '@lucide/svelte/icons/plus';
  import Search from '@lucide/svelte/icons/search';
  import { normalizeName } from '../lib/ingredients';
  import { store } from '../lib/store.svelte';
  import type { Product } from '../lib/types';
  import ProductPhoto from './ProductPhoto.svelte';

  let {
    query = $bindable(''),
    exclude = [],
    allowNew = false,
    onpick,
  }: {
    query?: string;
    exclude?: string[];
    allowNew?: boolean;
    /** `created` is true for a product made from what was typed. */
    onpick: (product: Product, created: boolean) => void;
  } = $props();

  const typed = $derived(normalizeName(query));
  // Each typed word has to start a word of the name, so "rice" finds "Basmati rice" but not "Licorice".
  const matches = $derived.by(() => {
    const words = typed.split(' ').filter(Boolean);
    return store.products
      .filter((p) => !exclude.includes(p.id))
      .filter((p) => {
        if (!words.length) return true;
        const name = ` ${normalizeName(p.name)}`;
        return words.every((w) => name.includes(` ${w}`));
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);
  });
  const exact = $derived(store.products.some((p) => normalizeName(p.name) === typed));

  async function create() {
    const name = query.trim();
    if (!name) return;
    onpick(await store.saveProduct(store.newProduct(name)), true);
  }
</script>

<div class="stack">
  <label class="search">
    <span class="sr-only">Search products</span>
    <Search class="search-icon" size={18} />
    <input
      class="input"
      type="search"
      placeholder={allowNew ? 'Search or type a new name' : 'Search your products'}
      bind:value={query}
      autocomplete="off"
    />
  </label>
  {#if allowNew && typed && !exact}
    <button class="btn btn-outline" type="button" onclick={create}>
      <Plus size={18} /> New product “{query.trim()}”
    </button>
  {/if}
  {#if matches.length}
    <ul class="list">
      {#each matches as p (p.id)}
        <li>
          <button class="row" type="button" onclick={() => onpick(p, false)}>
            <ProductPhoto url={p.imageUrl} photoId={p.photoId} size={36} />
            <span class="row-main">
              <span class="row-title">{p.name}</span>
              {#if p.sectionId}<span class="row-sub"
                  >{store.sectionById.get(p.sectionId)?.name}</span
                >{/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if !allowNew || !typed}
    <p class="hint">No products match.</p>
  {/if}
</div>
