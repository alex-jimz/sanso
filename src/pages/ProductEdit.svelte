<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import ImagePlus from '@lucide/svelte/icons/image-plus';
  import Leaf from '@lucide/svelte/icons/leaf';
  import Plus from '@lucide/svelte/icons/plus';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Tag from '@lucide/svelte/icons/tag';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';
  import { untrack } from 'svelte';
  import ProductPickerSheet from '../components/ProductPickerSheet.svelte';
  import BasicFoodSheet from '../components/BasicFoodSheet.svelte';
  import SectionPicker from '../components/SectionPicker.svelte';
  import ProductPhoto from '../components/ProductPhoto.svelte';
  import PriceHistory from '../components/PriceHistory.svelte';
  import { cleanBreakdown, isShopProduct } from '../lib/breakdown';
  import { foodNutrition, suggestBasicFood, type BasicFood } from '../lib/basicFoods';
  import { readClipboardImage, resizePhoto } from '../lib/photos';
  import { formatDayMonth, formatWeekday, todayISO } from '../lib/dates';
  import { normalizeName } from '../lib/ingredients';
  import { wordMatch } from '../lib/matching';
  import {
    cleanNutrition,
    cleanWeights,
    countedLines,
    nutrientKeys,
    nutrientLabels,
    weightLabel,
    weightsNeeded,
  } from '../lib/nutrition';
  import { formatOfferWeek, offerWeeks, upcomingOffers, weekOffer, withOffer } from '../lib/offers';
  import { logPrice } from '../lib/priceHistory';
  import { formatPrice } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import { unitPrice } from '../lib/shopping';
  import { store } from '../lib/store.svelte';
  import type { BreakdownPart, ListMode, Offer, PackUnit, Product, Shop } from '../lib/types';
  import { askConfirm, showToast, ui } from '../lib/ui.svelte';
  import { parseDecimal, safeUrl } from '../lib/util';

  let { id }: { id: string } = $props();

  // App.svelte re-creates this page for each route, so reading the id once is enough.
  const productId = untrack(() => id);
  const existing = productId === 'new' ? undefined : store.productById.get(productId);
  const shared = productId === 'new' ? ui.shared : null;
  const aldiRaw = shared ? ui.aldiRaw : '';
  // A picture shared from Chrome, sent here from the photo page.
  const sharedPhoto = ui.pendingPhoto;
  ui.shared = null;
  ui.aldiRaw = '';
  ui.pendingPhoto = null;

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
  let notFor = $state([...(base.notFor ?? [])]);
  // Offers that have ended stay as they are, for the price graph. The form edits the rest.
  const pastOffers = (base.offers ?? []).filter((o) => o.until < today);
  let offers = $state<Offer[]>(upcomingOffers(base.offers, today));
  const weeks = offerWeeks(today);
  let addingOffer = $state(false);
  let offerPrice = $state('');
  let offerWeek = $state(weeks[0]!.from);
  const chosenWeek = $derived(weeks.find((w) => w.from === offerWeek) ?? weeks[0]!);

  function startOffer() {
    // Start on the first week that has no offer yet.
    offerWeek = (weeks.find((w) => !offers.some((o) => o.from === w.from)) ?? weeks[0]!).from;
    offerPrice = '';
    addingOffer = true;
  }

  /** The offers to save, with one being typed in if it has a price. */
  function offersWithDraft(): Offer[] {
    const draft = addingOffer ? parseDecimal(offerPrice) : undefined;
    return draft === undefined ? offers : withOffer(offers, weekOffer(draft, offerWeek));
  }

  function addOffer() {
    if (parseDecimal(offerPrice) === undefined) {
      showToast('Type the offer price first.');
      return;
    }
    offers = offersWithDraft();
    addingOffer = false;
  }

  function offerLabel(offer: Offer): string {
    if (offer.from <= today) return 'On now';
    return weeks.find((w) => w.from === offer.from)?.label ?? '';
  }
  let nutrition = $state<Record<string, string>>(
    Object.fromEntries(nutrientKeys.map((k) => [k, base.nutrition?.[k]?.toString() ?? ''])),
  );
  let negligible = $state(!!base.negligible);
  let weights = $state<Record<string, string>>(
    Object.fromEntries(Object.entries(base.weights ?? {}).map(([k, v]) => [k, String(v)])),
  );

  // Photo: a new Blob replaces the stored one, null removes it, undefined keeps it.
  let photo = $state<Blob | null | undefined>(undefined);
  let photoBusy = $state(false);
  let fileInput = $state<HTMLInputElement>();
  const photoPreview = $derived(photo ? URL.createObjectURL(photo) : undefined);
  $effect(() => {
    const url = photoPreview;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });
  const hasOwnPhoto = $derived(photo ? true : photo === null ? false : !!base.photoId);

  async function usePhoto(source: Blob | (() => Promise<Blob>)) {
    photoBusy = true;
    try {
      const blob = typeof source === 'function' ? await source() : source;
      photo = await resizePhoto(blob, 800);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Couldn’t use that picture.');
    } finally {
      photoBusy = false;
    }
  }

  if (sharedPhoto) void usePhoto(sharedPhoto);

  function pickedFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void usePhoto(file);
  }

  // Parts this product breaks down into, as typed.
  interface PartRow {
    productId: string;
    amount: string;
    unit: BreakdownPart['unit'];
    costShare: string;
  }
  let parts = $state<PartRow[]>(
    (base.breakdown ?? []).map((p) => ({
      productId: p.productId,
      amount: String(p.amount),
      unit: p.unit,
      costShare: p.costShare?.toString() ?? '',
    })),
  );
  let partPickerOpen = $state(false);
  const shareTotal = $derived(parts.reduce((sum, p) => sum + (parseDecimal(p.costShare) ?? 0), 0));
  const anyShare = $derived(parts.some((p) => parseDecimal(p.costShare) !== undefined));

  function addPart(product: Product) {
    parts.push({ productId: product.id, amount: '', unit: 'g', costShare: '' });
  }

  // Products that break down into this one: the other ways to get it.
  const sources = $derived(store.sources.get(base.id) ?? []);
  let sourcePickerOpen = $state(false);

  /** Adds this product to a shop product's breakdown, one pack for one pack. */
  async function addSource(source: Product) {
    const unit: BreakdownPart['unit'] = source.packUnit === 'pcs' ? 'pcs' : 'g';
    const amount = source.packUnit === 'pcs' ? 1 : (source.packSize ?? 1000);
    const breakdown = [
      ...(source.breakdown ?? []).filter((p) => p.productId !== base.id),
      { productId: base.id, amount, unit, costShare: 100 },
    ];
    await store.saveProduct({ ...$state.snapshot(source), breakdown });
    showToast(`${source.name} is now a way to get ${base.name}`);
  }

  async function removeSource(source: Product) {
    const breakdown = (source.breakdown ?? []).filter((p) => p.productId !== base.id);
    await store.saveProduct({
      ...$state.snapshot(source),
      breakdown: breakdown.length ? breakdown : undefined,
    });
  }

  const nutrientUnits: Record<string, string> = {
    kcal: 'kcal',
    protein: 'g',
    fat: 'g',
    carbs: 'g',
  };
  const weightHints: Record<string, string> = { tsp: '5', tbsp: '15', clove: '5' };

  const recipeLines = $derived(store.recipes.flatMap((r) => countedLines(r.ingredients)));
  // Ingredient names in recipes that this product's name contains, as "ground beef" for Ground beef 10% fat.
  const wordNames = $derived.by(() => {
    const own = normalizeName(name);
    const found = new Set<string>();
    for (const line of recipeLines) {
      const n = normalizeName(line.name);
      if (n && n !== own && !aliases.includes(n) && !notFor.includes(n) && wordMatch(n, own))
        found.add(n);
    }
    return [...found].sort();
  });
  // Recipe lines that use this product, so the form can ask for the weights they need.
  const ownLines = $derived.by(() => {
    const names = new Set([normalizeName(name), ...aliases, ...wordNames]);
    return recipeLines.filter((line) => names.has(normalizeName(line.name)));
  });
  const neededWeights = $derived(
    weightsNeeded(
      {
        // Weights being edited stay listed, including ones a basic food just filled in.
        weights: Object.fromEntries(Object.keys(weights).map((k) => [k, 1])),
        packSize: parseDecimal(packSize),
        packUnit,
      },
      ownLines,
    ),
  );

  // Basic foods: values for fresh produce and other things without a label.
  let foodSheetOpen = $state(false);
  const suggestedFood = $derived(suggestBasicFood(name));
  let filledFrom = $state<BasicFood>();

  function useFood(food: BasicFood) {
    for (const key of nutrientKeys) nutrition[key] = String(foodNutrition(food)[key]);
    // Weights already typed stay; the food only adds the ones missing.
    for (const [key, grams] of Object.entries(food.weights ?? {}))
      if (!parseDecimal(weights[key])) weights[key] = String(grams);
    filledFrom = food;
  }

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

  // The price graph follows the form as it's edited, before saving.
  const preview = $derived.by(() => {
    const draft: Product = {
      ...base,
      price: parseDecimal(price),
      offers: [...pastOffers, ...offers],
    };
    return { ...draft, priceLog: logPrice(existing ? base : undefined, draft, today) };
  });

  async function save() {
    if (!name.trim()) {
      showToast('Give the product a name first.');
      return;
    }
    const size = parseDecimal(packSize);
    const newPrice = parseDecimal(price);
    const allOffers = [...pastOffers, ...offersWithDraft()];
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
      notFor,
      offers: allOffers.length ? allOffers : undefined,
      nutrition: cleanNutrition(
        Object.fromEntries(nutrientKeys.map((k) => [k, parseDecimal(nutrition[k])])),
      ),
      negligible: negligible || undefined,
      weights: cleanWeights(
        Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, parseDecimal(v)])),
      ),
      breakdown: cleanBreakdown(
        parts.map((p) => ({
          productId: p.productId,
          amount: parseDecimal(p.amount),
          unit: p.unit,
          costShare: parseDecimal(p.costShare),
        })),
        base.id,
      ),
    };
    if (parts.some((p) => !(parseDecimal(p.amount)! > 0))) {
      showToast('Add an amount for each part, or remove the part.');
      return;
    }
    await store.saveProduct(product, photo);
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

    <div class="photo-card card card-pad">
      {#if photoPreview || hasOwnPhoto || base.imageUrl}
        <div class="photo">
          <ProductPhoto
            src={photoPreview}
            photoId={photo === undefined ? base.photoId : undefined}
            url={base.imageUrl}
            size={120}
          />
        </div>
      {/if}
      <div class="photo-actions">
        <button
          class="btn btn-small btn-outline"
          type="button"
          disabled={photoBusy}
          onclick={() => usePhoto(readClipboardImage)}
        >
          <ClipboardPaste size={16} /> Paste photo
        </button>
        <button
          class="btn btn-small btn-outline"
          type="button"
          disabled={photoBusy}
          onclick={() => fileInput?.click()}
        >
          <ImagePlus size={16} /> Choose a file
        </button>
        {#if hasOwnPhoto}
          <button class="btn btn-small btn-quiet" type="button" onclick={() => (photo = null)}
            >Remove photo</button
          >
        {/if}
      </div>
      <p class="hint">
        To use a picture from the web: in Chrome, long-press it and tap Share image, then pick
        Sanso. Or tap Copy image and come back here to paste it.
      </p>
      <input
        bind:this={fileInput}
        class="sr-only"
        type="file"
        accept="image/*"
        tabindex="-1"
        onchange={pickedFile}
      />
    </div>

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

    <div class="card card-pad stack offer-card" class:on={offers.length > 0}>
      <div>
        <span class="switch-title"><Tag size={17} /> Offers</span>
        <span class="hint"
          >Offers run Thursday to Wednesday. Shopping lists use the offer price that week.</span
        >
      </div>
      {#if offers.length}
        <ul class="offers">
          {#each offers as offer (offer.from)}
            <li class="offer-row">
              <span class="offer-price">{formatPrice(offer.price)}</span>
              <span class="offer-week">
                {formatOfferWeek(offer)}
                {#if offerLabel(offer)}<span class="hint">{offerLabel(offer)}</span>{/if}
              </span>
              <button
                class="icon-btn"
                type="button"
                aria-label={`Remove the offer for ${formatOfferWeek(offer)}`}
                onclick={() => (offers = offers.filter((o) => o.from !== offer.from))}
              >
                <X size={18} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if addingOffer}
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
        <div class="field">
          <span class="field-label">Starts on</span>
          <div class="weeks">
            {#each weeks as week (week.from)}
              <button
                class="week"
                type="button"
                aria-pressed={offerWeek === week.from}
                onclick={() => (offerWeek = week.from)}
              >
                <span class="week-day"
                  >{formatWeekday(week.from, true)} {formatDayMonth(week.from)}</span
                >
                <span class="week-label">{week.label}</span>
              </button>
            {/each}
          </div>
          <span class="hint"
            >Ends {formatWeekday(chosenWeek.until)}
            {formatDayMonth(chosenWeek.until)}{offers.some(
              (o) => o.from <= chosenWeek.until && o.until >= chosenWeek.from,
            )
              ? ', replacing the offer already set for that week.'
              : '.'}</span
          >
        </div>
        <div class="offer-actions">
          <button class="btn btn-small btn-primary" type="button" onclick={addOffer}
            ><Check size={16} /> Add offer</button
          >
          <button
            class="btn btn-small btn-quiet"
            type="button"
            onclick={() => (addingOffer = false)}>Cancel</button
          >
        </div>
      {:else}
        <button class="btn btn-small btn-outline" type="button" onclick={startOffer}
          ><Plus size={16} /> Add an offer</button
        >
      {/if}
    </div>

    {#if existing && (preview.price !== undefined || preview.offers?.length)}
      <PriceHistory product={preview} {today} />
    {/if}

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
        <div class="food-fill">
          {#if filledFrom}
            <p class="hint filled">
              Filled in from {filledFrom.name} in the basic foods table (USDA: {filledFrom.usda}).
              Change any value if yours differs, then save.
            </p>
          {/if}
          <div class="food-actions">
            {#if suggestedFood && filledFrom?.name !== suggestedFood.name}
              <button
                class="btn btn-small btn-outline"
                type="button"
                onclick={() => useFood(suggestedFood)}
              >
                <Leaf size={16} /> Use values for {suggestedFood.name}
              </button>
            {/if}
            <button
              class="btn btn-small btn-quiet"
              type="button"
              onclick={() => (foodSheetOpen = true)}
            >
              {#if suggestedFood}Other basic food{:else}<Leaf size={16} /> Fill from basic foods{/if}
            </button>
          </div>
        </div>
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

    {#if sources.length || (existing && !isShopProduct(base) && !parts.length)}
      <div class="card card-pad stack">
        <div>
          <span class="switch-title">Ways to get it</span>
          <span class="hint"
            >{sources.length
              ? 'Shopping lists ask which one you want. Tap one to change its amount or cost share.'
              : 'Add a product you buy for it, like a pack of thighs or a whole chicken. Shopping lists then ask which one you want.'}</span
          >
        </div>
        {#if sources.length}
          <ul class="list ways">
            {#each sources as { source, part } (source.id)}
              <li class="way-row">
                <a
                  class="row"
                  href={`#/more/products/${source.id}`}
                  onclick={(e) => (e.preventDefault(), router.go(`/more/products/${source.id}`))}
                >
                  <ProductPhoto url={source.imageUrl} photoId={source.photoId} size={36} />
                  <span class="row-main">
                    <span class="row-title">{source.name}</span>
                    <span class="row-sub">
                      {part.unit === 'pcs'
                        ? `${part.amount} per pack`
                        : `${part.amount} g per pack`}{part.costShare !== undefined
                        ? ` · ${part.costShare}% of the cost`
                        : ' · no cost share'}
                    </span>
                  </span>
                </a>
                <button
                  class="icon-btn"
                  type="button"
                  aria-label={`Stop getting it from ${source.name}`}
                  onclick={() => removeSource(source)}
                >
                  <X size={18} />
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if existing}
          <button
            class="btn btn-small btn-outline"
            type="button"
            onclick={() => (sourcePickerOpen = true)}
          >
            <Plus size={16} /> Add a product you buy for it
          </button>
        {/if}
      </div>
    {/if}

    {#if !parts.length && !sources.length}
      <button
        class="btn btn-quiet start-parts"
        type="button"
        onclick={() => (partPickerOpen = true)}
      >
        <Plus size={16} /> It breaks down into parts, like a whole chicken
      </button>
    {:else if parts.length}
      <div class="card card-pad stack">
        <div>
          <span class="switch-title">Breaks down into</span>
          <span class="hint"
            >For things you cut up at home, like a whole chicken. Amounts are for one pack.</span
          >
        </div>
        {#each parts as row, i (row.productId)}
          {@const partProduct = store.productById.get(row.productId)}
          <div class="part">
            <div class="part-head">
              <span class="part-name">{partProduct?.name ?? 'Deleted product'}</span>
              <button
                class="icon-btn"
                type="button"
                aria-label={`Remove ${partProduct?.name ?? 'part'}`}
                onclick={() => parts.splice(i, 1)}
              >
                <X size={18} />
              </button>
            </div>
            <div class="part-fields">
              <label class="field">
                <span class="field-label">Amount</span>
                <input
                  class="input"
                  inputmode="decimal"
                  bind:value={row.amount}
                  placeholder={row.unit === 'g' ? '450' : '2'}
                />
              </label>
              <div class="field">
                <span class="field-label">Unit</span>
                <div class="segmented units">
                  <button
                    type="button"
                    aria-pressed={row.unit === 'g'}
                    onclick={() => (row.unit = 'g')}>g</button
                  >
                  <button
                    type="button"
                    aria-pressed={row.unit === 'pcs'}
                    onclick={() => (row.unit = 'pcs')}>pieces</button
                  >
                </div>
              </div>
              <label class="field">
                <span class="field-label">Cost share</span>
                <span class="with-suffix">
                  <input
                    class="input"
                    inputmode="decimal"
                    bind:value={row.costShare}
                    placeholder="0"
                    aria-label={`Cost share of ${partProduct?.name ?? 'part'}, in percent`}
                  />
                  <span class="suffix">%</span>
                </span>
              </label>
            </div>
          </div>
        {/each}
        {#if parts.length && anyShare}
          <p class="hint" class:warn={Math.abs(shareTotal - 100) > 0.5}>
            Cost shares add up to {Math.round(shareTotal * 10) / 10}%{Math.abs(shareTotal - 100) >
            0.5
              ? '. Usually they add up to 100%.'
              : '.'} Parts without a share cost nothing in recipes.
          </p>
        {/if}
        <button
          class="btn btn-small btn-outline"
          type="button"
          onclick={() => (partPickerOpen = true)}
        >
          <Plus size={16} /> Add a part
        </button>
      </div>
    {/if}

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

    {#if aliases.length || wordNames.length || notFor.length}
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
          {#each wordNames as word (word)}
            <span class="chip alias by-words">
              {word}
              <button
                type="button"
                aria-label={`Don’t offer it for “${word}”`}
                onclick={() => (notFor = [...notFor, word])}
              >
                <X size={14} />
              </button>
            </span>
          {/each}
          {#each notFor as word (word)}
            <span class="chip alias removed">
              {word}
              <button
                type="button"
                aria-label={`Offer it for “${word}” again`}
                onclick={() => (notFor = notFor.filter((n) => n !== word))}
              >
                <RotateCcw size={14} />
              </button>
            </span>
          {/each}
        </div>
        {#if wordNames.length || notFor.length}
          <span class="hint"
            >Dashed names match because the product’s name contains them. Remove one to stop this
            product being offered for it.</span
          >
        {/if}
      </div>
    {/if}

    {#if existing}
      <button class="btn btn-danger" type="button" onclick={remove}
        ><Trash2 size={18} /> Delete product</button
      >
    {/if}
  </form>
</div>

<BasicFoodSheet bind:open={foodSheetOpen} suggested={suggestedFood} onpick={useFood} />

<ProductPickerSheet
  bind:open={partPickerOpen}
  title="Add a part"
  hint="Pick the product you get from it, or type a new one, like Chicken thighs."
  exclude={[base.id, ...parts.map((p) => p.productId)]}
  allowNew
  onpick={addPart}
/>

<ProductPickerSheet
  bind:open={sourcePickerOpen}
  title={`Buy ${base.name} as`}
  hint="Pick the product you buy. For a whole chicken, add its other parts on its own page."
  exclude={[base.id, ...sources.map((s) => s.source.id)]}
  onpick={addSource}
/>

<style>
  form {
    padding-top: 6px;
  }

  .photo-card {
    display: grid;
    gap: 12px;
  }

  .photo-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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

  .offers {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .offer-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .offer-price {
    min-width: 3.6em;
    color: var(--tomato);
    font-weight: 700;
  }

  .offer-week {
    flex: 1;
    min-width: 0;
  }

  .offer-week .hint {
    display: block;
  }

  .weeks {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .week {
    display: grid;
    gap: 2px;
    padding: 9px 6px;
    border: 1.5px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    text-align: center;
  }

  .week[aria-pressed='true'] {
    border-color: var(--tomato);
    background: var(--tomato-soft);
  }

  .week-day {
    font-weight: 650;
    font-size: 0.9375rem;
  }

  .week-label {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .offer-actions {
    display: flex;
    gap: 8px;
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

  .food-fill {
    display: grid;
    gap: 8px;
  }

  .food-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .filled {
    margin: 0;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--accent-strong);
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

  .ways {
    margin: 0 -6px;
  }

  .way-row {
    display: flex;
    align-items: center;
  }

  .way-row .row {
    flex: 1;
    min-width: 0;
  }

  .part {
    display: grid;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }

  .part-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .part-name {
    font-weight: 650;
  }

  .part-fields {
    display: grid;
    grid-template-columns: 1fr 1.2fr 1fr;
    gap: 8px;
  }

  .start-parts {
    justify-self: start;
  }

  .hint.warn {
    color: var(--tomato);
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

  .alias.by-words {
    border: 1.5px dashed var(--faint);
    background: transparent;
  }

  .alias.removed {
    color: var(--faint);
    text-decoration: line-through;
    background: transparent;
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
