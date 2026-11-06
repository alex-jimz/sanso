<script lang="ts">
  // Picks one of your products, or creates a new one from what was typed.
  import Plus from '@lucide/svelte/icons/plus';
  import Search from '@lucide/svelte/icons/search';
  import { normalizeName } from '../lib/ingredients';
  import { store } from '../lib/store.svelte';
  import type { Product } from '../lib/types';
  import ProductPhoto from './ProductPhoto.svelte';
  import Sheet from './Sheet.svelte';

  let {
    open = $bindable(),
    title,
    hint,
    exclude = [],
    allowNew = false,
    onpick,
  }: {
    open: boolean;
    title: string;
    hint?: string;
    exclude?: string[];
    allowNew?: boolean;
    onpick: (product: Product) => void;
  } = $props();

  let query = $state('');

  $effect(() => {
    if (open) query = '';
  });

  const typed = $derived(normalizeName(query));
  const matches = $derived(
    store.products
      .filter((p) => !exclude.includes(p.id))
      .filter((p) => !typed || normalizeName(p.name).includes(typed))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40),
  );
  const exact = $derived(store.products.some((p) => normalizeName(p.name) === typed));

  function pick(product: Product) {
    open = false;
    onpick(product);
  }

  async function create() {
    const name = query.trim();
    if (!name) return;
    pick(await store.saveProduct(store.newProduct(name)));
  }
</script>

<Sheet bind:open {title}>
  <div class="stack">
    {#if hint}<p class="hint">{hint}</p>{/if}
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
            <button class="row" type="button" onclick={() => pick(p)}>
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
    {:else if !allowNew}
      <p class="hint">No products match.</p>
    {/if}
  </div>
</Sheet>
