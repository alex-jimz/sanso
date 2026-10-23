<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Package from '@lucide/svelte/icons/package';
  import Plus from '@lucide/svelte/icons/plus';
  import Search from '@lucide/svelte/icons/search';
  import { todayISO } from '../lib/dates';
  import { normalizeName } from '../lib/ingredients';
  import { packLabel } from '../lib/listView';
  import { formatPrice } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import { activeOffer, unitPrice } from '../lib/shopping';
  import { store } from '../lib/store.svelte';
  import type { Product, Section } from '../lib/types';

  type Filter = 'all' | 'offer' | 'aldi' | 'lidl' | 'unsorted';
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'offer', label: 'On offer' },
    { id: 'aldi', label: 'Aldi' },
    { id: 'lidl', label: 'Lidl' },
    { id: 'unsorted', label: 'No section' },
  ];

  const today = todayISO();
  let query = $state('');
  let filter = $state<Filter>('all');

  const shown = $derived(
    store.products.filter((p) => {
      if (query.trim() && !normalizeName(p.name).includes(normalizeName(query))) return false;
      if (filter === 'offer') return !!activeOffer(p, today);
      if (filter === 'aldi' || filter === 'lidl') return p.shop === filter;
      if (filter === 'unsorted') return !p.sectionId || !store.sectionById.has(p.sectionId);
      return true;
    }),
  );

  const groups = $derived.by(() => {
    const result: { section: Section | null; products: Product[] }[] = [];
    const byName = (a: Product, b: Product) => a.name.localeCompare(b.name);
    for (const section of store.orderedSections) {
      const products = shown.filter((p) => p.sectionId === section.id).sort(byName);
      if (products.length) result.push({ section, products });
    }
    const rest = shown
      .filter((p) => !p.sectionId || !store.sectionById.has(p.sectionId))
      .sort(byName);
    if (rest.length) result.push({ section: null, products: rest });
    return result;
  });

  function details(product: Product): string {
    const per = unitPrice(product);
    return [
      packLabel(product),
      product.price !== undefined ? formatPrice(product.price) : '',
      per ? `${formatPrice(per.value)}/${per.per}` : '',
      product.shop === 'any' ? '' : product.shop === 'aldi' ? 'Aldi' : 'Lidl',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function open(event: MouseEvent, path: string) {
    event.preventDefault();
    router.go(path);
  }
</script>

<div class="page">
  <div class="top-bar">
    <button class="icon-btn" type="button" aria-label="Back" onclick={() => router.back('/more')}>
      <ArrowLeft size={22} />
    </button>
    <h1 class="top-bar-title">Products</h1>
    <button
      class="icon-btn"
      type="button"
      aria-label="New product"
      onclick={() => router.go('/more/products/new')}
    >
      <Plus size={22} />
    </button>
  </div>

  {#if !store.products.length}
    <div class="empty">
      <div class="empty-icon"><Package size={34} strokeWidth={1.7} /></div>
      <h2>No products yet</h2>
      <p>
        Products are the things you buy. They appear as you sort shopping list items into shop
        sections. To add one with its link, open the product on aldi.ie in Chrome, tap Share and
        pick Sanso.
      </p>
      <button class="btn btn-primary" type="button" onclick={() => router.go('/more/products/new')}>
        <Plus size={20} /> Add a product
      </button>
    </div>
  {:else}
    <div class="tools">
      <label class="search">
        <span class="sr-only">Search products</span>
        <Search class="search-icon" size={18} />
        <input class="input" type="search" placeholder="Search products" bind:value={query} />
      </label>
      <div class="chips">
        {#each filters as f (f.id)}
          <button
            class="chip"
            type="button"
            aria-pressed={filter === f.id}
            onclick={() => (filter = f.id)}
          >
            {f.label}
          </button>
        {/each}
      </div>
    </div>

    {#each groups as g (g.section?.id ?? 'none')}
      <section class="group">
        <h2 class="eyebrow">{g.section?.name ?? 'No section'}</h2>
        <ul class="list">
          {#each g.products as product (product.id)}
            {@const offer = activeOffer(product, today)}
            <li>
              <a
                class="row"
                href={`#/more/products/${product.id}`}
                onclick={(e) => open(e, `/more/products/${product.id}`)}
              >
                <span class="row-main">
                  <span class="row-title">{product.name}</span>
                  {#if details(product)}<span class="row-sub">{details(product)}</span>{/if}
                </span>
                {#if offer}<span class="pill offer">{formatPrice(offer.price)}</span>{/if}
                {#if product.listMode === 'check'}<span class="pill">Ask first</span>{/if}
                {#if product.listMode === 'skip'}<span class="pill">Never listed</span>{/if}
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <p class="none">No products match.</p>
    {/each}
  {/if}
</div>

<style>
  .tools {
    display: grid;
    gap: 12px;
    margin: 8px 0 20px;
  }

  .group {
    margin-bottom: 20px;
  }

  .group .eyebrow {
    margin: 0 0 8px 4px;
    font-family: var(--font-ui);
  }

  .none {
    margin: 30px 0;
    color: var(--muted);
    text-align: center;
  }
</style>
