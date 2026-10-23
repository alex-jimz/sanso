<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Plus from '@lucide/svelte/icons/plus';
  import ShoppingBasket from '@lucide/svelte/icons/shopping-basket';
  import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';
  import { onMount } from 'svelte';
  import ItemSheet from '../components/ItemSheet.svelte';
  import MealSelectSheet from '../components/MealSelectSheet.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { todayISO } from '../lib/dates';
  import { itemAmount } from '../lib/listView';
  import { formatPrice } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import { activeOffer, itemCost } from '../lib/shopping';
  import { store } from '../lib/store.svelte';
  import type { Section, ShoppingItem } from '../lib/types';
  import { askConfirm, showToast } from '../lib/ui.svelte';

  const today = todayISO();

  let pickOpen = $state(false);
  let itemOpen = $state(false);
  let itemId = $state('');
  let finishOpen = $state(false);
  let keepUnticked = $state(true);
  let showHave = $state(false);
  let newItem = $state('');

  const list = $derived(store.list);
  const items = $derived(list?.items ?? []);
  const shopping = $derived(!!list?.shopping);
  const toCheck = $derived(items.filter((i) => i.part === 'check'));
  const toBuy = $derived(items.filter((i) => i.part === 'buy'));
  const have = $derived(items.filter((i) => i.part === 'have'));
  const inTrolley = $derived(items.filter((i) => i.part !== 'have'));
  const done = $derived(inTrolley.filter((i) => i.done).length);
  const untickedToBuy = $derived(toBuy.filter((i) => !i.done).length);

  const productOf = (item: ShoppingItem) =>
    item.productId ? store.productById.get(item.productId) : undefined;

  const costs = $derived.by(() => {
    let total = 0;
    let priced = 0;
    for (const item of toBuy) {
      const cost = itemCost(item, productOf(item), today);
      if (cost.total !== undefined) {
        total += cost.total;
        priced++;
      }
    }
    return { total, priced };
  });

  interface Group {
    section: Section | null;
    items: ShoppingItem[];
  }

  function group(source: ShoppingItem[], unsortedFirst: boolean): Group[] {
    const bySection = new Map<string, ShoppingItem[]>();
    for (const item of source) {
      const id = productOf(item)?.sectionId ?? item.sectionId;
      const key = id && store.sectionById.has(id) ? id : '';
      bySection.set(key, [...(bySection.get(key) ?? []), item]);
    }
    const sortItems = (list: ShoppingItem[]) =>
      [...list].sort((a, b) => a.name.localeCompare(b.name));
    const groups: Group[] = store.orderedSections
      .filter((s) => bySection.has(s.id))
      .map((s) => ({ section: s, items: sortItems(bySection.get(s.id)!) }));
    const unsorted = bySection.get('');
    if (unsorted) {
      const g = { section: null, items: sortItems(unsorted) };
      if (unsortedFirst) groups.unshift(g);
      else groups.push(g);
    }
    return groups;
  }

  const buyGroups = $derived(group(toBuy, true));
  const shopGroups = $derived(group(inTrolley, false));

  onMount(() => {
    if (router.route.query.has('pick')) {
      router.go('/shopping', { replace: true });
      pickOpen = true;
    }
  });

  const suggested = $derived(
    store.meals
      .filter((m) => m.state === 'toShop' && m.recipeId && m.date >= today)
      .map((m) => m.id),
  );

  async function chooseMeals(mealIds: string[]) {
    if (list) await store.setListMeals(mealIds);
    else await store.createList(mealIds);
  }

  function openItem(item: ShoppingItem) {
    itemId = item.id;
    itemOpen = true;
  }

  async function remove(item: ShoppingItem) {
    const undo = await store.removeItem(item.id);
    showToast(
      item.manual ? `Removed ${item.name}` : `${item.name}: you have it`,
      undo && { label: 'Undo', run: undo },
    );
  }

  async function addItem() {
    const name = newItem.trim();
    if (!name) return;
    newItem = '';
    await store.addManualItem(name);
  }

  async function clear() {
    const ok = await askConfirm({
      title: 'Clear the shopping list?',
      message: 'Your meals stay planned. You can make a new list any time.',
      confirmLabel: 'Clear list',
      danger: true,
    });
    if (ok) await store.clearList();
  }

  async function finish() {
    const ready = await store.finishShopping(keepUnticked);
    finishOpen = false;
    showToast(
      ready
        ? `Done. ${ready === 1 ? '1 meal is' : `${ready} meals are`} ready to cook.`
        : 'Shopping finished.',
    );
  }
</script>

{#snippet offerPill(item: ShoppingItem)}
  {#if activeOffer(productOf(item), today)}<span class="pill offer">Offer</span>{/if}
{/snippet}

<div class="page with-action">
  {#if !list}
    <header class="page-header"><h1 class="page-title">Shopping</h1></header>
    <div class="empty">
      <div class="empty-icon"><ShoppingBasket size={34} strokeWidth={1.7} /></div>
      <h2>No shopping list yet</h2>
      <p>
        {suggested.length
          ? `${suggested.length === 1 ? '1 planned meal needs' : `${suggested.length} planned meals need`} shopping. Pick the ones to buy for.`
          : 'Plan some meals, then make a list from their ingredients. You can add other things too.'}
      </p>
      <button class="btn btn-primary" type="button" onclick={() => (pickOpen = true)}>
        <ShoppingBasket size={20} /> Make a list
      </button>
      <button class="btn btn-quiet" type="button" onclick={() => store.createList([])}
        >Start an empty list</button
      >
    </div>
  {:else if shopping}
    <header class="page-header shop-header">
      <div>
        <h1 class="page-title">In the shop</h1>
        <p class="page-subtitle">{done} of {inTrolley.length} in the trolley</p>
      </div>
      <button
        class="btn btn-outline btn-small"
        type="button"
        onclick={() => store.setShopping(false)}
      >
        <Pencil size={16} /> Edit list
      </button>
    </header>
    <div class="progress" aria-hidden="true">
      <span style:width={`${inTrolley.length ? (done / inTrolley.length) * 100 : 0}%`}></span>
    </div>

    {#each shopGroups as g (g.section?.id ?? 'other')}
      <section class="group">
        <h2 class="group-title zone-{g.section?.zone ?? 'none'}">
          <span class="dot"></span>{g.section?.name ?? 'Other'}
        </h2>
        <ul class="list">
          {#each g.items as item (item.id)}
            <li>
              <button
                class="row shop-row"
                class:done={item.done}
                type="button"
                onclick={() => store.toggleDone(item.id)}
              >
                <span class="check" class:on={item.done}><Check size={17} strokeWidth={3} /></span>
                <span class="row-main">
                  <span class="row-title">{item.name}</span>
                  <span class="row-sub">
                    {itemAmount(item, productOf(item))}{item.part === 'check'
                      ? ' · only if needed'
                      : ''}
                  </span>
                </span>
                {@render offerPill(item)}
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {:else}
    <header class="page-header">
      <div>
        <h1 class="page-title">Shopping</h1>
        <button class="meals-link" type="button" onclick={() => (pickOpen = true)}>
          {list.mealIds.length === 0
            ? 'Add meals'
            : `For ${list.mealIds.length === 1 ? '1 meal' : `${list.mealIds.length} meals`}`}
          <ChevronDown size={16} />
        </button>
      </div>
      <button class="icon-btn filled" type="button" aria-label="Clear the list" onclick={clear}>
        <Trash2 size={19} />
      </button>
    </header>

    <form class="add" onsubmit={(e) => (e.preventDefault(), addItem())}>
      <input
        class="input"
        bind:value={newItem}
        placeholder="Add something else"
        list="product-names"
        autocomplete="off"
        enterkeyhint="done"
      />
      <button
        class="icon-btn add-btn"
        type="submit"
        aria-label="Add to the list"
        disabled={!newItem.trim()}
      >
        <Plus size={22} />
      </button>
      <datalist id="product-names">
        {#each store.products as p (p.id)}<option value={p.name}></option>{/each}
      </datalist>
    </form>

    {#if costs.priced > 0}
      <p class="estimate">
        About <strong>{formatPrice(costs.total)}</strong>
        <span>for {costs.priced} of {toBuy.length} items with a price</span>
      </p>
    {/if}

    {#if toCheck.length}
      <section class="card check-card">
        <h2 class="check-title">Check what you have</h2>
        <p class="hint">These might already be at home. Buy them only if you need to.</p>
        <ul class="check-list">
          {#each toCheck as item (item.id)}
            <li>
              <button class="check-main" type="button" onclick={() => openItem(item)}>
                <span class="row-title">{item.name}</span>
                <span class="row-sub">{itemAmount(item, productOf(item)) || 'Some'}</span>
              </button>
              <button
                class="btn btn-small"
                type="button"
                onclick={() => store.setItemPart(item.id, 'have')}>Have it</button
              >
              <button
                class="btn btn-small btn-primary"
                type="button"
                onclick={() => store.setItemPart(item.id, 'buy')}>Buy</button
              >
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if toBuy.length}
      <h2 class="section-title">To buy</h2>
      {#each buyGroups as g (g.section?.id ?? 'unsorted')}
        <section class="group">
          <h3 class="group-title zone-{g.section?.zone ?? 'none'}">
            <span class="dot"></span>{g.section?.name ?? 'Not sorted yet'}
          </h3>
          {#if !g.section}
            <p class="hint unsorted-hint">
              Tap an item to say where it is in the shop. Sanso remembers it.
            </p>
          {/if}
          <ul class="list">
            {#each g.items as item (item.id)}
              {@const cost = itemCost(item, productOf(item), today)}
              <li class="item">
                <button class="row" type="button" onclick={() => openItem(item)}>
                  <span class="row-main">
                    <span class="row-title">{item.name}</span>
                    {#if itemAmount(item, productOf(item))}
                      <span class="row-sub">{itemAmount(item, productOf(item))}</span>
                    {/if}
                  </span>
                  {@render offerPill(item)}
                  {#if cost.total !== undefined}<span class="price">{formatPrice(cost.total)}</span
                    >{/if}
                </button>
                <button
                  class="icon-btn remove"
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onclick={() => remove(item)}
                >
                  <X size={18} />
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    {:else if !toCheck.length}
      <p class="none">The list is empty. Add meals or items above.</p>
    {/if}

    {#if have.length}
      <button
        class="have-toggle"
        type="button"
        onclick={() => (showHave = !showHave)}
        aria-expanded={showHave}
      >
        {have.length === 1 ? '1 item' : `${have.length} items`} you have at home
        <ChevronDown size={16} class={showHave ? 'flip' : ''} />
      </button>
      {#if showHave}
        <ul class="list have-list">
          {#each have as item (item.id)}
            <li>
              <button class="row" type="button" onclick={() => store.setItemPart(item.id, 'buy')}>
                <span class="row-main"><span class="row-title">{item.name}</span></span>
                <span class="put-back">Put back</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}
</div>

{#if list && inTrolley.length}
  <div class="action-bar with-tabs">
    {#if shopping}
      <button class="btn btn-primary" type="button" onclick={() => (finishOpen = true)}>
        <Check size={20} /> Finish shopping
      </button>
    {:else}
      <button class="btn btn-primary" type="button" onclick={() => store.setShopping(true)}>
        <ShoppingCart size={20} /> Start shopping
      </button>
    {/if}
  </div>
{/if}

<MealSelectSheet
  bind:open={pickOpen}
  initial={list ? list.mealIds : suggested}
  confirmLabel={(n) =>
    list
      ? 'Update the list'
      : n
        ? `Make the list (${n === 1 ? '1 meal' : `${n} meals`})`
        : 'Start an empty list'}
  onconfirm={chooseMeals}
/>

<ItemSheet bind:open={itemOpen} {itemId} />

<Sheet bind:open={finishOpen} title="Finish shopping?">
  <div class="stack">
    <p class="finish-text">
      {list?.mealIds.length
        ? `The meals on this list move to “Ready to cook”.`
        : 'This clears the list.'}
    </p>
    {#if untickedToBuy > 0}
      <label class="keep">
        <input type="checkbox" bind:checked={keepUnticked} />
        <span>
          Keep the {untickedToBuy === 1 ? 'item' : `${untickedToBuy} items`} you didn’t tick for next
          time
        </span>
      </label>
    {/if}
  </div>
  {#snippet footer()}
    <button class="btn" type="button" onclick={() => (finishOpen = false)}>Not yet</button>
    <button class="btn btn-primary" type="button" onclick={finish}>Finish</button>
  {/snippet}
</Sheet>

<style>
  .meals-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 0.9375rem;
    font-weight: 650;
  }

  .add {
    position: relative;
    margin-bottom: 14px;
  }

  .add .input {
    padding-right: 52px;
    border-color: transparent;
    border-radius: 999px;
    box-shadow: var(--shadow-sm);
  }

  .add-btn {
    position: absolute;
    right: 4px;
    top: 50%;
    width: 38px;
    height: 38px;
    background: var(--accent);
    color: var(--on-accent);
    translate: 0 -50%;
  }

  .add-btn:disabled {
    background: var(--surface-2);
    color: var(--faint);
  }

  .estimate {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    margin: 0 4px 16px;
    color: var(--muted);
  }

  .estimate strong {
    color: var(--text);
    font-family: var(--font-display);
    font-size: 1.375rem;
    font-weight: 600;
  }

  .estimate span {
    font-size: 0.8125rem;
  }

  .check-card {
    padding: 16px 16px 8px;
    background: var(--mustard-soft);
    box-shadow: none;
  }

  .check-title {
    margin: 0 0 2px;
    font-size: 1.1875rem;
    color: #5c430f;
  }

  .check-card .hint {
    color: #7c5d1c;
  }

  .check-list {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
  }

  .check-list li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
  }

  .check-list li + li {
    border-top: 1px solid rgb(156 102 16 / 0.15);
  }

  .check-main {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }

  .check-list .btn:not(.btn-primary) {
    background: var(--surface);
  }

  .group {
    margin-bottom: 18px;
  }

  .group-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px 4px;
    font-family: var(--font-ui);
    font-size: 0.8125rem;
    font-weight: 750;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--zone, var(--faint));
  }

  .zone-ambient {
    --zone: #c9a26b;
  }

  .zone-fridge {
    --zone: var(--sky);
  }

  .zone-freezer {
    --zone: var(--frost);
  }

  .zone-none {
    --zone: var(--tomato);
  }

  .unsorted-hint {
    margin: -4px 4px 8px;
  }

  .item {
    display: flex;
    align-items: center;
  }

  .item .row {
    flex: 1;
    min-width: 0;
    padding-right: 4px;
  }

  .price {
    color: var(--muted);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  .remove {
    margin-right: 6px;
    color: var(--faint);
  }

  .none {
    margin: 30px 0;
    color: var(--muted);
    text-align: center;
  }

  .have-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 8px auto 10px;
    padding: 8px 12px;
    border: 0;
    background: none;
    color: var(--muted);
    font-weight: 650;
  }

  .have-toggle :global(.flip) {
    rotate: 180deg;
  }

  .have-list .row-title {
    color: var(--muted);
    text-decoration: line-through;
  }

  .put-back {
    color: var(--accent);
    font-size: 0.875rem;
    font-weight: 650;
  }

  .progress {
    height: 8px;
    margin: -4px 0 20px;
    overflow: hidden;
    border-radius: 99px;
    background: var(--surface-3);
  }

  .progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width 0.3s ease;
  }

  .shop-row {
    min-height: 64px;
  }

  .shop-row .row-title {
    font-size: 1.0625rem;
  }

  .shop-row.done .row-title {
    color: var(--faint);
    text-decoration: line-through;
  }

  .shop-row.done .row-sub {
    color: var(--faint);
  }

  .finish-text {
    margin: 0;
    line-height: 1.5;
  }

  .keep {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    line-height: 1.4;
  }

  .keep input {
    width: 20px;
    height: 20px;
    margin: 0;
    accent-color: var(--accent);
  }
</style>
