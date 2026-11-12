<script lang="ts">
  import Leaf from '@lucide/svelte/icons/leaf';
  import Package from '@lucide/svelte/icons/package';
  import Plus from '@lucide/svelte/icons/plus';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Search from '@lucide/svelte/icons/search';
  import ProductPhoto from '../components/ProductPhoto.svelte';
  import { todayISO } from '../lib/dates';
  import { normalizeName } from '../lib/ingredients';
  import { packLabel } from '../lib/listView';
  import {
    linesByProduct,
    missingInfo,
    missingKinds,
    missingLabels,
    type MissingKind,
  } from '../lib/missingInfo';
  import { activeOffer, nextWeekOffer } from '../lib/offers';
  import { formatPrice } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import { unitPrice } from '../lib/shopping';
  import { store } from '../lib/store.svelte';
  import type { Product, Section } from '../lib/types';

  type Filter = 'all' | 'offer' | 'nextOffer' | 'aldi' | 'lidl' | 'missing';
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'offer', label: 'On offer now' },
    { id: 'nextOffer', label: 'On offer next week' },
    { id: 'missing', label: 'Missing info' },
    { id: 'aldi', label: 'Aldi' },
    { id: 'lidl', label: 'Lidl' },
  ];

  const today = todayISO();
  const onOffer = $derived(store.products.filter((p) => activeOffer(p, today)).length);
  let query = $state('');
  let filter = $state<Filter>('all');
  /** Which missing detail to show under "Missing info", or any. */
  let missingKind = $state<MissingKind | 'any'>('any');

  const recipeLines = $derived(linesByProduct(store.recipes, store.resolve));
  const missing = $derived(
    new Map(
      store.products.map((p) => [
        p.id,
        missingInfo(p, {
          hasSection: !!p.sectionId && store.sectionById.has(p.sectionId),
          isPart: !!store.sources.get(p.id)?.length,
          lines: recipeLines.get(p.id) ?? [],
        }),
      ]),
    ),
  );
  const missingCounts = $derived(
    missingKinds
      .map((kind) => ({
        kind,
        count: store.products.filter((p) => missing.get(p.id)?.includes(kind)).length,
      }))
      .filter((k) => k.count > 0),
  );
  const missingAny = $derived(store.products.filter((p) => missing.get(p.id)?.length).length);

  const shown = $derived(
    store.products.filter((p) => {
      if (query.trim() && !normalizeName(p.name).includes(normalizeName(query))) return false;
      if (filter === 'offer') return !!activeOffer(p, today);
      if (filter === 'nextOffer') return !!nextWeekOffer(p, today);
      if (filter === 'aldi' || filter === 'lidl') return p.shop === filter;
      if (filter === 'missing') {
        const list = missing.get(p.id) ?? [];
        return missingKind === 'any' ? list.length > 0 : list.includes(missingKind);
      }
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
      product.breakdown?.length
        ? `${product.breakdown.length} ${product.breakdown.length === 1 ? 'part' : 'parts'}`
        : '',
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
  <header class="page-header">
    <div>
      <h1 class="page-title">Products</h1>
      <p class="page-subtitle">
        {store.products.length === 1 ? '1 product' : `${store.products.length} products`}{onOffer
          ? ` · ${onOffer} on offer`
          : ''}
      </p>
    </div>
    <button
      class="icon-btn filled"
      type="button"
      aria-label="New product"
      onclick={() => router.go('/products/new')}
    >
      <Plus size={22} />
    </button>
  </header>

  {#if !store.products.length}
    <div class="empty">
      <div class="empty-icon"><Package size={34} strokeWidth={1.7} /></div>
      <h2>No products yet</h2>
      <p>
        Products are the things you buy. They appear as you sort shopping list items into shop
        sections, or you can add them from aldi.ie with their prices and photos.
      </p>
      <button class="btn btn-primary" type="button" onclick={() => router.go('/products/new')}>
        <Plus size={20} /> Add a product
      </button>
      <button class="btn btn-outline" type="button" onclick={() => router.go('/more/aldi')}>
        <RefreshCw size={18} /> Add from aldi.ie
      </button>
    </div>
  {:else}
    <a class="aldi" href="#/more/aldi" onclick={(e) => open(e, '/more/aldi')}>
      <RefreshCw size={18} />
      <span>Get prices and photos from aldi.ie</span>
    </a>
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
      {#if filter === 'missing' && missingAny}
        <div class="chips missing-chips" role="group" aria-label="Missing">
          <button
            class="chip small"
            type="button"
            aria-pressed={missingKind === 'any'}
            onclick={() => (missingKind = 'any')}
            >Anything <span class="count">{missingAny}</span></button
          >
          {#each missingCounts as { kind, count } (kind)}
            <button
              class="chip small"
              type="button"
              aria-pressed={missingKind === kind}
              onclick={() => (missingKind = kind)}
              >{missingLabels[kind]} <span class="count">{count}</span></button
            >
          {/each}
        </div>
      {/if}
    </div>

    {#if filter === 'missing' && missingAny}
      <p class="missing-hint">
        Prices and pack sizes give costs, nutrition and weights give calories, and sections and
        photos help in the shop.
      </p>
      {#if missingCounts.some((k) => k.kind === 'nutrition' || k.kind === 'weights')}
        <a
          class="aldi basic"
          href="#/more/basic-foods"
          onclick={(e) => open(e, '/more/basic-foods')}
        >
          <Leaf size={18} />
          <span>Fill in nutrition for fresh food from basic foods</span>
        </a>
      {/if}
    {/if}

    {#each groups as g (g.section?.id ?? 'none')}
      <section class="group">
        <h2 class="eyebrow">{g.section?.name ?? 'No section'}</h2>
        <ul class="list">
          {#each g.products as product (product.id)}
            {@const offer = activeOffer(product, today)}
            {@const nextOffer = nextWeekOffer(product, today)}
            {@const lacks = missing.get(product.id) ?? []}
            <li>
              <a
                class="row"
                href={`#/products/${product.id}`}
                onclick={(e) => open(e, `/products/${product.id}`)}
              >
                <ProductPhoto url={product.imageUrl} photoId={product.photoId} />
                <span class="row-main">
                  <span class="row-title">{product.name}</span>
                  {#if details(product)}<span class="row-sub">{details(product)}</span>{/if}
                  {#if filter === 'missing' && lacks.length}
                    <span class="row-sub lacks"
                      >No {lacks.map((k) => missingLabels[k].toLowerCase()).join(', ')}</span
                    >
                  {/if}
                </span>
                {#if offer}<span class="pill offer">{formatPrice(offer.price)}</span>{/if}
                {#if nextOffer && nextOffer.from !== offer?.from}
                  <span class="pill offer next">Next week {formatPrice(nextOffer.price)}</span>
                {/if}
                {#if product.listMode === 'check'}<span class="pill">Ask first</span>{/if}
                {#if product.listMode === 'skip'}<span class="pill">Never listed</span>{/if}
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <p class="none">
        {filter === 'missing' && !missingAny && !query.trim()
          ? 'Every product has everything it needs.'
          : 'No products match.'}
      </p>
    {/each}
  {/if}
</div>

<style>
  .tools {
    display: grid;
    gap: 12px;
    margin: 8px 0 20px;
  }

  .aldi.basic {
    margin: 0 0 18px;
  }

  .aldi {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 650;
    text-decoration: none;
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

  .chip.small {
    height: 32px;
    padding: 0 12px;
    font-size: 0.875rem;
  }

  .count {
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }

  .missing-hint {
    margin: -8px 4px 12px;
    color: var(--muted);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .lacks {
    color: var(--mustard);
  }

  .pill.next {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--tomato-soft);
  }
</style>
