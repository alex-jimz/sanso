<script lang="ts">
  // Picks the product for one ingredient line. Lists the products that match
  // it, with each one's calories and cost, and the alternatives written with
  // "or". Any other product can be picked from the whole list, or a new one
  // made, and it's then offered for that name in every recipe.
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Check from '@lucide/svelte/icons/check';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Search from '@lucide/svelte/icons/search';
  import Star from '@lucide/svelte/icons/star';
  import { optionGroups, optionKey, type IngredientRow, type Option } from '../lib/choices';
  import { capitalize, normalizeName, scaleLine, type ParsedLine } from '../lib/ingredients';
  import { needsText, optionFacts } from '../lib/lineStatus';
  import { formatKcal } from '../lib/nutrition';
  import { formatPrice } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import type { Product } from '../lib/types';
  import ProductPhoto from './ProductPhoto.svelte';
  import ProductSearch from './ProductSearch.svelte';
  import Sheet from './Sheet.svelte';

  let {
    open = $bindable(),
    row,
    factor = 1,
    portions,
    onpick,
  }: {
    open: boolean;
    row: IngredientRow | undefined;
    /** Scales the amounts shown, for the portions being viewed or planned. */
    factor?: number;
    /** Portions the recipe is written for, to show values per portion. */
    portions: number;
    onpick: (option: Option) => void | Promise<void>;
  } = $props();

  let searching = $state<ParsedLine | undefined>();
  let query = $state('');

  $effect(() => {
    if (open) searching = undefined;
  });

  const groups = $derived(row ? optionGroups(row) : []);
  const several = $derived((row?.alternatives.length ?? 0) > 1);
  const chosen = $derived(row?.chosen);
  const chosenFacts = $derived(chosen ? optionFacts(chosen, store.priced) : undefined);
  const isPart = (p: Product | undefined) => !!p && !!store.sources.get(p.id)?.length;
  const chosenNeeds = $derived(
    chosenFacts?.product ? needsText(chosenFacts.missing, isPart(chosenFacts.product)) : '',
  );
  // Offer to make the pick the usual one when other recipes would start with a different product.
  const canMakeUsual = $derived.by(() => {
    if (!row || !chosen?.product || chosen.usual) return false;
    const group = groups.find((g) => g.line.text === chosen.line.text);
    const products = group?.options.filter((o) => o.product) ?? [];
    return products.length > 1 && products[0]!.key !== chosen.key;
  });

  function describe(option: Option): string {
    const facts = optionFacts(option, store.priced);
    if (!option.product) return 'No product yet';
    if (!facts) return '';
    const count = portions > 0 ? portions : 1;
    const parts = [
      facts.nutrition ? `${formatKcal(facts.nutrition.kcal / count)} kcal` : undefined,
      facts.cost !== undefined ? formatPrice(facts.cost / count) : undefined,
    ].filter(Boolean);
    const needs = needsText(facts.missing, isPart(option.product));
    if (!parts.length) return needs || 'Nothing missing';
    return [`${parts.join(' · ')} per portion`, needs].filter(Boolean).join('. ');
  }

  function pick(option: Option) {
    open = false;
    if (option.key !== row?.chosen.key) void onpick(option);
  }

  function search(line: ParsedLine) {
    searching = line;
    query = capitalize(line.name);
  }

  async function pickProduct(product: Product, created: boolean) {
    const line = searching;
    if (!line) return;
    const option: Option = {
      key: optionKey(product, normalizeName(line.name)),
      line,
      product,
      exact: false,
    };
    open = false;
    await onpick(option);
    // A new product has nothing filled in yet.
    if (created) router.go(`/more/products/${product.id}`);
  }

  function fillIn(product: Product) {
    open = false;
    router.go(`/more/products/${product.id}`);
  }

  async function makeUsual() {
    if (chosen?.product) await store.setUsual(chosen.product.id, chosen.line.name);
  }
</script>

<Sheet bind:open title={row ? capitalize(scaleLine(row.chosen.line, factor)) : 'Ingredient'}>
  {#if row}
    {#if searching}
      <div class="stack">
        <button class="back" type="button" onclick={() => (searching = undefined)}>
          <ArrowLeft size={18} /> Suggestions
        </button>
        <p class="hint">
          Pick the product for “{searching.name}”, or type a name to make a new one. It’s then
          offered for “{searching.name}” in your other recipes too.
        </p>
        <ProductSearch bind:query allowNew onpick={pickProduct} />
      </div>
    {:else}
      <div class="stack">
        {#each groups as group, g (g)}
          {@const products = group.options.filter((o) => o.product)}
          <div class="group">
            {#if several}
              <p class="eyebrow">{capitalize(scaleLine(group.line, factor))}</p>
            {/if}
            {#if products.length || several}
              <ul class="list">
                {#each group.options as option (option.key)}
                  {@const on = option.key === row.chosen.key}
                  <li>
                    <button
                      class="row"
                      type="button"
                      aria-pressed={on}
                      onclick={() => pick(option)}
                    >
                      {#if option.product}
                        <ProductPhoto
                          url={option.product.imageUrl}
                          photoId={option.product.photoId}
                          size={40}
                        />
                      {/if}
                      <span class="row-main">
                        <span class="row-title"
                          >{option.product?.name ?? capitalize(option.line.name)}</span
                        >
                        <span class="row-sub">
                          {#if option.usual && products.length > 1}<span class="usual"
                              ><Star size={12} /> Usual</span
                            >{/if}{describe(option)}
                        </span>
                      </span>
                      <span class="check" class:on><Check size={16} strokeWidth={3} /></span>
                    </button>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="hint">None of your products matches “{group.line.name}” yet.</p>
            {/if}
            <button class="more" type="button" onclick={() => search(group.line)}>
              <Search size={17} />
              {products.length ? 'Pick another product' : 'Pick a product or make one'}
            </button>
          </div>
        {/each}

        {#if chosenFacts?.product && chosenNeeds}
          <button class="fill" type="button" onclick={() => fillIn(chosenFacts.product!)}>
            <span class="row-main">
              <span class="row-title">Fill in {chosenFacts.product.name}</span>
              <span class="row-sub">{chosenNeeds}</span>
            </span>
            <ChevronRight size={18} />
          </button>
        {/if}

        {#if canMakeUsual && chosen?.product}
          <button class="btn btn-outline" type="button" onclick={makeUsual}>
            <Star size={17} /> Use {chosen.product.name} for “{chosen.line.name}” in other recipes
          </button>
        {/if}

        <p class="hint">
          Products whose name contains the ingredient are offered too. If one doesn’t belong, open
          it and remove the name under “Recipes that call it”.
        </p>
      </div>
    {/if}
  {/if}
</Sheet>

<style>
  .group {
    display: grid;
    gap: 8px;
  }

  .eyebrow {
    margin: 0;
  }

  .row-title {
    white-space: normal;
  }

  .usual {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-right: 6px;
    color: var(--mustard);
    font-weight: 700;
  }

  .more,
  .back {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-self: start;
    padding: 6px 2px;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 650;
  }

  .fill {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 12px 14px;
    border: 0;
    border-radius: var(--radius);
    background: var(--mustard-soft);
    color: #5a4316;
    font: inherit;
    text-align: left;
  }

  .fill .row-sub {
    color: inherit;
    opacity: 0.85;
  }
</style>
