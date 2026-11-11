<script lang="ts">
  // Fills in nutrition and recipe weights for many products at once, from the
  // basic foods table. Each product gets a suggested food, which can be
  // changed or unticked before saving. Values already set are kept.
  import Check from '@lucide/svelte/icons/check';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import X from '@lucide/svelte/icons/x';
  import BasicFoodSheet from '../components/BasicFoodSheet.svelte';
  import {
    applyFill,
    fillFrom,
    isEmptyFill,
    suggestBasicFood,
    type BasicFood,
    type FoodFill,
  } from '../lib/basicFoods';
  import { linesByProduct, missingInfo } from '../lib/missingInfo';
  import { formatMacro, weightLabel } from '../lib/nutrition';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import type { Product } from '../lib/types';
  import { showToast } from '../lib/ui.svelte';

  // Products that lack nutrition or a weight their recipes need, as on the Missing info filter.
  const lines = linesByProduct(store.recipes, store.resolve);
  const candidates = store.products
    .filter((p) => {
      const missing = missingInfo(p, {
        hasSection: true,
        isPart: !!store.sources.get(p.id)?.length,
        lines: lines.get(p.id) ?? [],
      });
      return missing.includes('nutrition') || missing.includes('weights');
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  let foods = $state<Record<string, BasicFood | undefined>>(
    Object.fromEntries(candidates.map((p) => [p.id, suggestBasicFood(p.name)])),
  );
  const fills = $derived(
    new Map(
      candidates.map((p) => {
        const food = foods[p.id];
        return [p.id, food ? fillFrom(food, p) : undefined] as const;
      }),
    ),
  );
  const usable = (id: string) => {
    const fill = fills.get(id);
    return !!fill && !isEmptyFill(fill);
  };
  let ticked = $state(candidates.filter((p) => usable(p.id)).map((p) => p.id));
  const matched = $derived(candidates.filter((p) => usable(p.id)));
  const unmatched = $derived(candidates.filter((p) => !usable(p.id)));
  const chosenCount = $derived(ticked.filter((id) => usable(id)).length);

  let sheetFor = $state<Product>();
  let sheetOpen = $state(false);
  let saving = $state(false);

  function choose(product: Product) {
    sheetFor = product;
    sheetOpen = true;
  }

  function picked(food: BasicFood) {
    if (!sheetFor) return;
    const id = sheetFor.id;
    foods[id] = food;
    if (!ticked.includes(id)) ticked = [...ticked, id];
  }

  function toggle(id: string) {
    ticked = ticked.includes(id) ? ticked.filter((t) => t !== id) : [...ticked, id];
  }

  function describe(fill: FoodFill): string {
    const parts: string[] = [];
    const n = fill.nutrition;
    if (n)
      parts.push(
        `${n.kcal} kcal · P ${formatMacro(n.protein)} · F ${formatMacro(n.fat)} · C ${formatMacro(n.carbs)}`,
      );
    for (const [key, grams] of Object.entries(fill.weights))
      parts.push(`${weightLabel(key)} ${grams} g`);
    return parts.join(' · ');
  }

  async function save() {
    saving = true;
    let count = 0;
    try {
      for (const product of candidates) {
        const fill = fills.get(product.id);
        if (!ticked.includes(product.id) || !fill || isEmptyFill(fill)) continue;
        const current = store.productById.get(product.id);
        if (!current) continue;
        await store.saveProduct(applyFill($state.snapshot(current) as Product, fill));
        count++;
      }
    } finally {
      saving = false;
    }
    showToast(count === 1 ? 'Filled in 1 product' : `Filled in ${count} products`);
    router.back('/products');
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
    <h1 class="top-bar-title">Basic foods</h1>
    <button
      class="btn btn-primary btn-small"
      type="button"
      disabled={saving || !chosenCount}
      onclick={save}><Check size={18} /> Save</button
    >
  </div>

  <p class="intro">
    Values per 100 g for fresh produce, raw meat and fish and a few staples, from USDA FoodData
    Central. Carbs leave out fibre, as on EU labels. Weights are for a medium piece; weigh one of
    yours if it’s much bigger or smaller. Nothing you’ve already filled in is replaced.
  </p>

  {#if !candidates.length}
    <p class="none">Every product has its nutrition and recipe weights.</p>
  {/if}

  {#if matched.length}
    <section>
      <h2 class="eyebrow">Ready to fill in · {chosenCount} ticked</h2>
      <ul class="list">
        {#each matched as product (product.id)}
          {@const fill = fills.get(product.id)!}
          {@const on = ticked.includes(product.id)}
          <li class="fill-row">
            <button
              class="row tick-row"
              type="button"
              aria-pressed={on}
              aria-label={`${on ? 'Skip' : 'Fill in'} ${product.name}`}
              onclick={() => toggle(product.id)}
            >
              <span class="tick" class:on
                >{#if on}<Check size={16} />{/if}</span
              >
              <span class="row-main">
                <span class="row-title">{product.name}</span>
                <span class="row-sub food">As {foods[product.id]?.name}</span>
                <span class="row-sub">{describe(fill)}</span>
              </span>
            </button>
            <button class="change" type="button" onclick={() => choose(product)}>Change</button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if unmatched.length}
    <section>
      <h2 class="eyebrow">No match</h2>
      <p class="hint section-hint">
        Pick a basic food for these, or fill them in from the label on their own page.
      </p>
      <ul class="list">
        {#each unmatched as product (product.id)}
          <li>
            <button class="row" type="button" onclick={() => choose(product)}>
              <span class="row-main">
                <span class="row-title">{product.name}</span>
                <span class="row-sub"
                  >{foods[product.id]
                    ? `${foods[product.id]?.name} has nothing it’s missing`
                    : 'Pick a basic food'}</span
                >
              </span>
              <ChevronRight size={18} />
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<BasicFoodSheet
  bind:open={sheetOpen}
  suggested={sheetFor ? foods[sheetFor.id] : undefined}
  onpick={picked}
/>

<style>
  .intro {
    margin: 8px 4px 18px;
    color: var(--muted);
    font-size: 0.875rem;
    line-height: 1.45;
  }

  section {
    margin-bottom: 22px;
  }

  section .eyebrow {
    margin: 0 0 8px 4px;
    font-family: var(--font-ui);
  }

  .section-hint {
    margin: -2px 4px 8px;
  }

  .fill-row {
    display: flex;
    align-items: center;
  }

  .tick-row {
    flex: 1;
    min-width: 0;
  }

  .tick {
    display: grid;
    flex: none;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1.5px solid var(--faint);
    border-radius: 7px;
    color: var(--on-accent);
  }

  .tick.on {
    border-color: var(--accent);
    background: var(--accent);
  }

  .food {
    color: var(--accent);
    font-weight: 650;
  }

  .row-sub {
    white-space: normal;
  }

  .change {
    flex: none;
    padding: 10px 14px;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 650;
  }

  .none {
    margin: 30px 0;
    color: var(--muted);
    text-align: center;
  }
</style>
