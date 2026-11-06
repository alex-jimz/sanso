<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Tag from '@lucide/svelte/icons/tag';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';
  import { untrack } from 'svelte';
  import SectionPicker from '../components/SectionPicker.svelte';
  import ProductPhoto from '../components/ProductPhoto.svelte';
  import { addDays, formatDayMonth, todayISO } from '../lib/dates';
  import { normalizeName } from '../lib/ingredients';
  import {
    cleanNutrition,
    cleanWeights,
    countedLines,
    nutrientKeys,
    nutrientLabels,
    weightLabel,
    weightsNeeded,
  } from '../lib/nutrition';
  import { formatPrice } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import { unitPrice } from '../lib/shopping';
  import { store } from '../lib/store.svelte';
  import type { ListMode, PackUnit, Product, Shop } from '../lib/types';
  import { askConfirm, showToast, ui } from '../lib/ui.svelte';
  import { parseDecimal, safeUrl } from '../lib/util';

  let { id }: { id: string } = $props();

  // App.svelte re-creates this page for each route, so reading the id once is enough.
  const productId = untrack(() => id);
  const existing = productId === 'new' ? undefined : store.productById.get(productId);
  const shared = productId === 'new' ? ui.shared : null;
  const aldiRaw = shared ? ui.aldiRaw : '';
  ui.shared = null;
  ui.aldiRaw = '';

  async function copyAldiRaw() {
    try {
      await navigator.clipboard.writeText(aldiRaw);
      showToast('Copied');
    } catch {
      showToast('Couldn’t copy.');
    }
  }

  const base: Product = existing ? $state.snapshot(existing) : newFromShared();

  function newFromShared(): Product {
    // A recipe's "add a product" link passes the ingredient name.
    if (!shared) return store.newProduct(router.route.query.get('name')?.slice(0, 120) ?? '');
    const { name, ...fields } = shared;
    return store.newProduct(name, fields);
  }

  const today = todayISO();
  let name = $state(base.name);
  let sectionId = $state(base.sectionId);
  let shop = $state<Shop>(base.shop);
  let packSize = $state(base.packSize?.toString() ?? '');
  let packUnit = $state<PackUnit>(base.packUnit ?? 'g');
  let price = $state(base.price?.toFixed(2) ?? '');
  let url = $state(base.url ?? '');
  let listMode = $state<ListMode>(base.listMode);
  let aliases = $state([...base.aliases]);
  let onOffer = $state(!!base.offer && base.offer.until >= today);
  let offerPrice = $state(base.offer?.price.toFixed(2) ?? '');
  let offerUntil = $state(
    base.offer && base.offer.until >= today ? base.offer.until : addDays(today, 6),
  );
  let nutrition = $state<Record<string, string>>(
    Object.fromEntries(nutrientKeys.map((k) => [k, base.nutrition?.[k]?.toString() ?? ''])),
  );
  let negligible = $state(!!base.negligible);
  let weights = $state<Record<string, string>>(
    Object.fromEntries(Object.entries(base.weights ?? {}).map(([k, v]) => [k, String(v)])),
  );

  const nutrientUnits: Record<string, string> = {
    kcal: 'kcal',
    protein: 'g',
    fat: 'g',
    carbs: 'g',
  };
  const weightHints: Record<string, string> = { tsp: '5', tbsp: '15', clove: '5' };

  // Recipe lines that use this product, so the form can ask for the weights they need.
  const ownLines = $derived.by(() => {
    const names = new Set([normalizeName(name), ...aliases]);
    return store.recipes
      .flatMap((r) => countedLines(r.ingredients))
      .filter((line) => names.has(normalizeName(line.name)));
  });
  const neededWeights = $derived(
    weightsNeeded({ weights: base.weights, packSize: parseDecimal(packSize), packUnit }, ownLines),
  );

  const shops: { id: Shop; label: string }[] = [
    { id: 'aldi', label: 'Aldi' },
    { id: 'lidl', label: 'Lidl' },
    { id: 'any', label: 'Either' },
  ];
  const units: { id: PackUnit; label: string }[] = [
    { id: 'g', label: 'g' },
    { id: 'ml', label: 'ml' },
    { id: 'pcs', label: 'pieces' },
  ];
  const modes: { id: ListMode; label: string; hint: string }[] = [
    {
      id: 'auto',
      label: 'Normal',
      hint: 'Weighed amounts go on the list. Vague ones, like “a pinch”, go under Check what you have.',
    },
    {
      id: 'check',
      label: 'Ask first',
      hint: 'Always under Check what you have, for things you usually keep at home.',
    },
    {
      id: 'skip',
      label: 'Never',
      hint: 'Never on the list, for things you always have, like salt.',
    },
  ];

  const per = $derived(
    unitPrice({
      ...base,
      price: parseDecimal(price),
      packSize: parseDecimal(packSize),
      packUnit,
    }),
  );
  const link = $derived(safeUrl(url));

  async function save() {
    if (!name.trim()) {
      showToast('Give the product a name first.');
      return;
    }
    const size = parseDecimal(packSize);
    const offer = parseDecimal(offerPrice);
    const newPrice = parseDecimal(price);
    const product: Product = {
      ...base,
      name: name.trim(),
      sectionId,
      shop,
      packSize: size && size > 0 ? size : undefined,
      packUnit: size && size > 0 ? packUnit : undefined,
      price: newPrice,
      // A price typed by hand is no longer the one read from aldi.ie.
      priceCheckedAt: newPrice === base.price ? base.priceCheckedAt : undefined,
      url: safeUrl(url),
      listMode,
      aliases,
      offer: onOffer && offer !== undefined ? { price: offer, until: offerUntil } : undefined,
      nutrition: cleanNutrition(
        Object.fromEntries(nutrientKeys.map((k) => [k, parseDecimal(nutrition[k])])),
      ),
      negligible: negligible || undefined,
      weights: cleanWeights(
        Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, parseDecimal(v)])),
      ),
    };
    await store.saveProduct(product);
    showToast(existing ? 'Product saved' : `${product.name} added`);
    router.back('/more/products');
  }

  async function remove() {
    const ok = await askConfirm({
      title: `Delete ${base.name}?`,
      message: 'Shopping lists will no longer know its section, pack size or price.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await store.deleteProduct(base.id);
    router.back('/more/products');
  }
</script>

<div class="page">
  <div class="top-bar">
    <button
      class="icon-btn"
      type="button"
      aria-label="Cancel"
      onclick={() => router.back('/more/products')}
    >
      <X size={22} />
    </button>
    <h1 class="top-bar-title">{existing ? 'Product' : 'New product'}</h1>
    <button class="btn btn-primary btn-small" type="button" onclick={save}
      ><Check size={18} /> Save</button
    >
  </div>

  <form class="stack" onsubmit={(e) => (e.preventDefault(), save())}>
    {#if base.imageUrl}
      <div class="photo"><ProductPhoto url={base.imageUrl} size={120} /></div>
    {/if}

    {#if shared}
      <p class="shared">
        {#if shared.priceCheckedAt}
          From aldi.ie. Pick where it is in the shop, and check the name{shared.packSize
            ? '.'
            : ' and add the pack size, which aldi.ie didn’t show.'}
          {#if aldiRaw}
            <button class="link-btn" type="button" onclick={copyAldiRaw}
              >Copy what aldi.ie sent</button
            >
          {/if}
        {:else}
          Shared from {shared.shop === 'aldi'
            ? 'Aldi'
            : shared.shop === 'lidl'
              ? 'Lidl'
              : 'the web'}. Check the name and pack size, then add the price.
        {/if}
      </p>
    {/if}

    <label class="field">
      <span class="field-label">Name</span>
      <input class="input" bind:value={name} placeholder="Basmati rice" autocomplete="off" />
    </label>

    <div class="field">
      <span class="field-label">Where it is in the shop</span>
      <SectionPicker
        value={sectionId}
        onpick={(s) => (sectionId = sectionId === s ? undefined : s)}
      />
    </div>

    <div class="field">
      <span class="field-label">Shop</span>
      <div class="segmented">
        {#each shops as s (s.id)}
          <button type="button" aria-pressed={shop === s.id} onclick={() => (shop = s.id)}
            >{s.label}</button
          >
        {/each}
      </div>
    </div>

    <div class="card card-pad stack">
      <div class="input-row">
        <label class="field">
          <span class="field-label">Pack size</span>
          <input class="input" inputmode="decimal" bind:value={packSize} placeholder="500" />
        </label>
        <div class="field">
          <span class="field-label">Unit</span>
          <div class="segmented units">
            {#each units as u (u.id)}
              <button
                type="button"
                aria-pressed={packUnit === u.id}
                onclick={() => (packUnit = u.id)}>{u.label}</button
              >
            {/each}
          </div>
        </div>
      </div>
      <label class="field">
        <span class="field-label">Price per pack</span>
        <span class="with-unit">
          <span class="euro">€</span>
          <input class="input money" inputmode="decimal" bind:value={price} placeholder="1.89" />
        </span>
        {#if per || base.priceCheckedAt}
          <span class="hint">
            {[
              per ? `${formatPrice(per.value)} per ${per.per}` : '',
              base.priceCheckedAt ? `from aldi.ie on ${formatDayMonth(base.priceCheckedAt)}` : '',
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
        {/if}
      </label>
    </div>

    <div class="field">
      <span class="field-label">On the shopping list</span>
      <div class="segmented">
        {#each modes as m (m.id)}
          <button type="button" aria-pressed={listMode === m.id} onclick={() => (listMode = m.id)}
            >{m.label}</button
          >
        {/each}
      </div>
      <span class="hint">{modes.find((m) => m.id === listMode)?.hint}</span>
    </div>

    <div class="card card-pad stack offer-card" class:on={onOffer}>
      <label class="switch">
        <span>
          <span class="switch-title"><Tag size={17} /> On offer</span>
          <span class="hint">Shopping lists highlight it until the offer ends.</span>
        </span>
        <input type="checkbox" role="switch" bind:checked={onOffer} />
      </label>
      {#if onOffer}
        <div class="input-row">
          <label class="field">
            <span class="field-label">Offer price</span>
            <span class="with-unit">
              <span class="euro">€</span>
              <input
                class="input money"
                inputmode="decimal"
                bind:value={offerPrice}
                placeholder="1.49"
              />
            </span>
          </label>
          <label class="field">
            <span class="field-label">Until</span>
            <input class="input" type="date" bind:value={offerUntil} min={today} />
          </label>
        </div>
      {/if}
    </div>

    <div class="card card-pad stack">
      <div>
        <span class="switch-title">Nutrition</span>
        <span class="hint"
          >Per 100 {packUnit === 'ml' ? 'ml' : 'g'}, as on the label. Recipes use it for calories
          per portion.</span
        >
      </div>
      <label class="switch">
        <span>
          <span class="switch-title small">Too little to count</span>
          <span class="hint">For salt, spices and herbs: zero calories and zero cost.</span>
        </span>
        <input type="checkbox" role="switch" bind:checked={negligible} />
      </label>
      {#if !negligible}
        <div class="nutrients">
          {#each nutrientKeys as key (key)}
            <label class="field">
              <span class="field-label">{nutrientLabels[key]}</span>
              <span class="with-suffix">
                <input
                  class="input"
                  inputmode="decimal"
                  bind:value={nutrition[key]}
                  placeholder="0"
                  aria-label={`${nutrientLabels[key]} per 100 ${packUnit === 'ml' ? 'ml' : 'g'}`}
                />
                <span class="suffix">{nutrientUnits[key]}</span>
              </span>
            </label>
          {/each}
        </div>
        {#if neededWeights.length}
          <div class="stack weights">
            <div>
              <span class="switch-title small">Weights for recipes</span>
              <span class="hint">So lines without grams, like “3 garlic cloves”, can count.</span>
            </div>
            {#each neededWeights as need (need.key)}
              <label class="weight-row">
                <span class="weight-label">
                  {weightLabel(need.key)}
                  {#if need.example}<span class="hint">as in “{need.example}”</span>{/if}
                </span>
                <span class="with-suffix">
                  <input
                    class="input"
                    inputmode="decimal"
                    bind:value={weights[need.key]}
                    placeholder={weightHints[need.key] ?? ''}
                  />
                  <span class="suffix">g</span>
                </span>
              </label>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <label class="field">
      <span class="field-label">Link</span>
      <span class="link-row">
        <input
          class="input"
          type="url"
          bind:value={url}
          placeholder="https://www.aldi.ie/…"
          autocomplete="off"
        />
        {#if link}
          <a
            class="icon-btn filled"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the link"
          >
            <ExternalLink size={18} />
          </a>
        {/if}
      </span>
    </label>

    {#if aliases.length}
      <div class="field">
        <span class="field-label">Recipes that call it</span>
        <div class="chips wrap">
          {#each aliases as alias (alias)}
            <span class="chip alias">
              {alias}
              <button
                type="button"
                aria-label={`Forget “${alias}”`}
                onclick={() => (aliases = aliases.filter((a) => a !== alias))}
              >
                <X size={14} />
              </button>
            </span>
          {/each}
        </div>
      </div>
    {/if}

    {#if existing}
      <button class="btn btn-danger" type="button" onclick={remove}
        ><Trash2 size={18} /> Delete product</button
      >
    {/if}
  </form>
</div>

<style>
  form {
    padding-top: 6px;
  }

  .photo {
    display: grid;
    place-items: center;
    padding: 10px;
    border-radius: var(--radius);
    background: #fff;
  }

  .shared {
    margin: 0;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent-strong);
    line-height: 1.45;
  }

  .link-btn {
    display: block;
    margin-top: 6px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.875rem;
    text-decoration: underline;
  }

  .units button {
    padding: 0 2px;
  }

  .with-unit {
    position: relative;
    display: block;
  }

  .euro {
    position: absolute;
    left: 14px;
    top: 50%;
    translate: 0 -50%;
    color: var(--muted);
    pointer-events: none;
  }

  .money {
    padding-left: 30px;
  }

  .offer-card.on {
    box-shadow: inset 0 0 0 1.5px var(--tomato-soft);
  }

  .switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .switch-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 650;
  }

  .switch .hint {
    display: block;
    margin-top: 2px;
  }

  input[role='switch'] {
    flex: none;
    width: 46px;
    height: 28px;
    margin: 0;
    appearance: none;
    border-radius: 99px;
    background: var(--surface-3);
    position: relative;
    transition: background-color 0.15s ease;
  }

  input[role='switch']::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: var(--shadow-sm);
    transition: translate 0.15s ease;
  }

  input[role='switch']:checked {
    background: var(--tomato);
  }

  input[role='switch']:checked::after {
    translate: 18px 0;
  }

  .switch-title.small {
    font-size: 0.9375rem;
  }

  .nutrients {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .with-suffix {
    position: relative;
    display: block;
  }

  .with-suffix .input {
    padding-right: 48px;
  }

  .suffix {
    position: absolute;
    right: 14px;
    top: 50%;
    translate: 0 -50%;
    color: var(--muted);
    font-size: 0.875rem;
    pointer-events: none;
  }

  .weights {
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }

  .weight-row {
    display: grid;
    grid-template-columns: 1fr 112px;
    align-items: center;
    gap: 12px;
  }

  .weight-label {
    font-weight: 600;
    min-width: 0;
  }

  .weight-label .hint {
    display: block;
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .alias {
    padding-right: 6px;
    background: var(--surface-2);
    border-color: transparent;
  }

  .alias button {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
  }
</style>
