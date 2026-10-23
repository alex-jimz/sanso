<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Tag from '@lucide/svelte/icons/tag';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';
  import { untrack } from 'svelte';
  import SectionPicker from '../components/SectionPicker.svelte';
  import { addDays, todayISO } from '../lib/dates';
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
  ui.shared = null;

  const base: Product = existing
    ? $state.snapshot(existing)
    : store.newProduct(shared?.name ?? '', {
        shop: shared?.shop ?? 'any',
        url: shared?.url,
        packSize: shared?.packSize,
        packUnit: shared?.packUnit,
      });

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
    const product: Product = {
      ...base,
      name: name.trim(),
      sectionId,
      shop,
      packSize: size && size > 0 ? size : undefined,
      packUnit: size && size > 0 ? packUnit : undefined,
      price: parseDecimal(price),
      url: safeUrl(url),
      listMode,
      aliases,
      offer: onOffer && offer !== undefined ? { price: offer, until: offerUntil } : undefined,
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
    {#if shared}
      <p class="shared">
        Shared from {shared.shop === 'aldi' ? 'Aldi' : shared.shop === 'lidl' ? 'Lidl' : 'the web'}.
        Check the name and pack size, then add the price.
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
        {#if per}<span class="hint">{formatPrice(per.value)} per {per.per}</span>{/if}
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

  .shared {
    margin: 0;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent-strong);
    line-height: 1.45;
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
