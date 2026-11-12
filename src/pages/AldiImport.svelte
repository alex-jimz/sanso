<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import { onMount, untrack } from 'svelte';
  import ProductPhoto from '../components/ProductPhoto.svelte';
  import {
    applyAldi,
    findProduct,
    newProductFields,
    parseAldiPayload,
    type AldiItem,
    type AldiPayload,
  } from '../lib/aldi';
  import { todayISO } from '../lib/dates';
  import { packLabel } from '../lib/listView';
  import { formatPrice } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import type { Product } from '../lib/types';
  import { showToast, ui } from '../lib/ui.svelte';

  // The helper's data arrives once, in the address. It's read when the page
  // opens and then removed from the address, so it doesn't stay in history.
  const raw = untrack(() => router.route.query.get('d'));
  const today = todayISO();

  const { payload, error } = read();

  function read(): { payload: AldiPayload | null; error: string } {
    try {
      return { payload: parseAldiPayload(raw), error: '' };
    } catch (e) {
      return { payload: null, error: e instanceof Error ? e.message : String(e) };
    }
  }

  interface Row {
    item: AldiItem;
    product?: Product;
    changes: string[];
  }

  const rows: Row[] = (payload?.items ?? []).map((item) => {
    const product = findProduct(store.products, item);
    return { item, product, changes: product ? applyAldi(product, item, today).changes : [] };
  });
  const known = rows.filter((r) => r.product);
  const fresh = rows.filter((r) => !r.product);
  // A single product that's new opens the product form instead, to pick its section.
  const openForm = rows.length === 1 && fresh.length === 1;

  let chosen = $state(known.map((r) => r.item.sku));
  let saving = $state(false);

  onMount(() => {
    if (openForm) {
      const { item } = fresh[0]!;
      ui.shared = { name: item.name, ...newProductFields(item, today), shop: 'aldi' };
      ui.aldiRaw = raw ?? '';
      router.go('/products/new', { replace: true });
    } else if (raw !== null) {
      router.go('/aldi', { replace: true });
    }
  });

  function toggle(sku: string) {
    chosen = chosen.includes(sku) ? chosen.filter((s) => s !== sku) : [...chosen, sku];
  }

  function details(row: Row): string {
    const { item } = row;
    if (row.product) return row.changes.length ? row.changes.join(' · ') : 'No change';
    return [
      packLabel(item),
      item.price !== undefined ? formatPrice(item.wasPrice ?? item.price) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  async function save() {
    saving = true;
    let updated = 0;
    let added = 0;
    try {
      for (const row of rows) {
        if (!chosen.includes(row.item.sku)) continue;
        if (row.product) {
          const current = store.productById.get(row.product.id) ?? row.product;
          await store.saveProduct(applyAldi($state.snapshot(current), row.item, today).product);
          updated++;
        } else {
          await store.saveProduct(
            store.newProduct(row.item.name, newProductFields(row.item, today)),
          );
          added++;
        }
      }
    } finally {
      saving = false;
    }
    const parts = [
      updated ? `Updated ${updated}` : '',
      added ? `added ${added} (give ${added === 1 ? 'it' : 'them'} a shop section)` : '',
    ].filter(Boolean);
    showToast(parts.join(', ').replace(/^a/, 'A') || 'Nothing to save');
    router.go('/products', { replace: true });
  }

  async function copyRaw() {
    try {
      await navigator.clipboard.writeText(raw ?? '');
      showToast('Copied');
    } catch {
      showToast('Couldn’t copy.');
    }
  }
</script>

<div class="page">
  <div class="top-bar">
    <button
      class="icon-btn"
      type="button"
      aria-label="Close"
      onclick={() => router.back('/products')}
    >
      <X size={22} />
    </button>
    <h1 class="top-bar-title">From aldi.ie</h1>
    <button
      class="btn btn-primary btn-small"
      type="button"
      disabled={!payload || !chosen.length || saving}
      onclick={save}
    >
      <Check size={18} /> Save
    </button>
  </div>

  {#if !payload}
    <div class="empty">
      <h2>Nothing to add</h2>
      <p>{raw === null ? 'Open this page from the aldi.ie helper.' : error}</p>
      <button class="btn btn-outline" type="button" onclick={() => router.go('/more/aldi')}>
        How the helper works
      </button>
    </div>
  {:else if !openForm}
    {#snippet row(r: Row)}
      <li>
        <button
          class="row"
          type="button"
          aria-pressed={chosen.includes(r.item.sku)}
          onclick={() => toggle(r.item.sku)}
        >
          <span class="check" class:on={chosen.includes(r.item.sku)}
            ><Check size={16} strokeWidth={3} /></span
          >
          <ProductPhoto url={r.item.imageUrl ?? r.product?.imageUrl} />
          <span class="row-main">
            <span class="row-title">{r.product?.name ?? r.item.name}</span>
            <span class="row-sub">{details(r)}</span>
          </span>
          {#if r.item.wasPrice && r.item.price}
            <span class="pill offer">{formatPrice(r.item.price)}</span>
          {/if}
        </button>
      </li>
    {/snippet}

    {#if known.length}
      <h2 class="section-title">Your products</h2>
      <ul class="list">
        {#each known as r (r.item.sku)}{@render row(r)}{/each}
      </ul>
    {/if}

    {#if fresh.length}
      <h2 class="section-title">New to Sanso</h2>
      <p class="hint note">Tick the ones you buy to add them to your products.</p>
      <ul class="list">
        {#each fresh as r (r.item.sku)}{@render row(r)}{/each}
      </ul>
    {/if}

    {#if payload.more}
      <p class="hint note">
        Only the first 60 products on the page were read. Search for fewer at a time to get the
        rest.
      </p>
    {/if}

    <button class="btn btn-quiet raw" type="button" onclick={copyRaw}>
      Copy what aldi.ie sent, to report a problem
    </button>
  {/if}
</div>

<style>
  .note {
    margin: -4px 4px 10px;
  }

  .row .pill {
    flex: none;
  }

  .raw {
    display: block;
    margin: 24px auto 0;
  }
</style>
