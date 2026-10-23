<script lang="ts">
  import Link from '@lucide/svelte/icons/link';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Search from '@lucide/svelte/icons/search';
  import { formatDayMonth, relativeDay, todayISO } from '../lib/dates';
  import { normalizeName, parseIngredient } from '../lib/ingredients';
  import { itemAmount } from '../lib/listView';
  import { formatPrice } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import { itemCost } from '../lib/shopping';
  import { slotLabel } from '../lib/states';
  import { store } from '../lib/store.svelte';
  import type { Product } from '../lib/types';
  import SectionPicker from './SectionPicker.svelte';
  import Sheet from './Sheet.svelte';

  let { open = $bindable(), itemId }: { open: boolean; itemId: string } = $props();

  const today = todayISO();
  const item = $derived(store.list?.items.find((i) => i.id === itemId));
  const product = $derived(item?.productId ? store.productById.get(item.productId) : undefined);
  const sectionId = $derived(product?.sectionId ?? item?.sectionId);
  const cost = $derived(item ? itemCost(item, product, today) : undefined);

  let linking = $state(false);
  let query = $state('');
  let note = $state('');

  $effect(() => {
    if (open) {
      linking = false;
      query = '';
      note = item?.note ?? '';
    }
  });

  /** The ingredient names behind this item, so the app recognises them next time. */
  function ingredientNames(): string[] {
    if (!item) return [];
    const names = item.sources.map((s) => parseIngredient(s.text)?.name ?? '').filter(Boolean);
    return [...new Set([item.name, ...names])];
  }

  async function setSection(id: string) {
    if (!item) return;
    if (product) {
      await store.saveProduct({ ...$state.snapshot(product), sectionId: id });
      return;
    }
    const created = store.newProduct(item.name, {
      sectionId: id,
      aliases: ingredientNames().map(normalizeName),
    });
    await store.saveProduct(created);
    if (item.manual) await store.updateItem(item.id, { productId: created.id });
  }

  const matches = $derived(
    store.products
      .filter((p) => !query.trim() || normalizeName(p.name).includes(normalizeName(query)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40),
  );

  async function linkTo(target: Product) {
    if (!item) return;
    const names = ingredientNames();
    if (item.manual) await store.updateItem(item.id, { productId: target.id, name: target.name });
    for (const name of names) await store.linkName(target.id, name);
    open = false;
  }

  function mealLabel(mealId: string): string {
    const meal = store.mealById.get(mealId);
    if (!meal) return '';
    return `${relativeDay(meal.date, today)} ${slotLabel[meal.slot].toLowerCase()}`;
  }

  async function setPart(part: 'buy' | 'check' | 'have') {
    if (!item) return;
    await store.setItemPart(item.id, part);
    open = false;
  }
</script>

<Sheet bind:open title={item?.name ?? 'Item'}>
  {#if item}
    {#if linking}
      <div class="stack">
        <p class="hint">Pick the product this is. Sanso will remember it for next time.</p>
        <label class="search">
          <span class="sr-only">Search products</span>
          <Search class="search-icon" size={18} />
          <input
            class="input"
            type="search"
            placeholder="Search your products"
            bind:value={query}
          />
        </label>
        {#if matches.length}
          <ul class="list">
            {#each matches as p (p.id)}
              <li>
                <button class="row" type="button" onclick={() => linkTo(p)}>
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
        {:else}
          <p class="hint">No products yet. Pick a section instead and Sanso creates one.</p>
        {/if}
        <button class="btn" type="button" onclick={() => (linking = false)}>Back</button>
      </div>
    {:else}
      <div class="stack">
        <div class="facts">
          {#if itemAmount(item, product)}
            <p class="amount">{itemAmount(item, product)}</p>
          {/if}
          {#if cost?.total !== undefined}
            <p class="price">
              About {formatPrice(cost.total)}
              {#if cost.offer}
                <span class="pill offer">Offer until {formatDayMonth(cost.offer.until)}</span>
              {/if}
            </p>
          {/if}
        </div>

        {#if item.sources.length}
          <div>
            <p class="eyebrow">Needed for</p>
            <ul class="sources">
              {#each item.sources as source, i (i)}
                <li>
                  <span class="source-meal"
                    >{mealLabel(source.mealId)} · {store.recipeById.get(source.recipeId)
                      ?.title}</span
                  >
                  <span class="source-line">{source.text}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if item.manual}
          <label class="field">
            <span class="field-label">Amount or note</span>
            <input
              class="input"
              bind:value={note}
              placeholder="2 bottles"
              onchange={() => store.updateItem(item.id, { note: note.trim() || undefined })}
            />
          </label>
        {/if}

        <div class="field">
          <span class="field-label">Where it is in the shop</span>
          <SectionPicker value={sectionId} onpick={setSection} />
        </div>

        <div class="links">
          {#if product}
            <button
              class="btn btn-outline btn-small"
              type="button"
              onclick={() => router.go(`/more/products/${product.id}`)}
            >
              <Pencil size={16} /> Pack size, price, offer
            </button>
          {:else}
            <button
              class="btn btn-outline btn-small"
              type="button"
              onclick={() => (linking = true)}
            >
              <Link size={16} /> It’s one of my products
            </button>
          {/if}
        </div>
      </div>
    {/if}
  {/if}

  {#snippet footer()}
    {#if item && !linking}
      {#if item.part === 'have'}
        <button class="btn btn-primary" type="button" onclick={() => setPart('buy')}
          >Put back on the list</button
        >
      {:else}
        <button class="btn" type="button" onclick={() => setPart('have')}>I have it</button>
        {#if item.part === 'check'}
          <button class="btn btn-primary" type="button" onclick={() => setPart('buy')}
            >Buy it</button
          >
        {:else}
          <button class="btn" type="button" onclick={() => setPart('check')}>Might have it</button>
        {/if}
      {/if}
    {/if}
  {/snippet}
</Sheet>

<style>
  .facts {
    display: grid;
    gap: 4px;
  }

  .amount {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.375rem;
    font-weight: 600;
  }

  .price {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--muted);
  }

  .sources {
    display: grid;
    gap: 8px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }

  .sources li {
    display: grid;
    gap: 2px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--surface);
  }

  .source-meal {
    font-size: 0.8125rem;
    font-weight: 650;
    color: var(--muted);
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
