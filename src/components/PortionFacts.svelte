<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { capitalize, type ParsedLine } from '../lib/ingredients';
  import {
    macroColors,
    macroLabels,
    macroShares,
    macroText,
    ringSegments,
    segmentPath,
  } from '../lib/macroChart';
  import {
    formatKcal,
    formatMacro,
    weightLabel,
    type LineFacts,
    type Missing,
  } from '../lib/nutrition';
  import { formatPrice } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import type { Product, Recipe } from '../lib/types';
  import { afterHistory } from '../lib/ui.svelte';
  import Sheet from './Sheet.svelte';

  let {
    recipe,
    onunlinked,
  }: {
    recipe: Recipe;
    /** Opens the product picker for an ingredient with no product. */
    onunlinked?: (line: ParsedLine) => void;
  } = $props();

  const facts = $derived(store.factsFor(recipe));
  const total = $derived(facts.lines.length);
  const hasNutrition = $derived(facts.nutritionCount > 0);
  const hasCost = $derived(facts.costCount > 0);
  const complete = $derived(facts.nutritionCount === total && facts.costCount === total);
  const gaps = $derived(facts.lines.filter((l) => l.missing.length));
  const shares = $derived(macroShares(facts.nutrition));
  const segments = $derived(ringSegments(shares));
  let open = $state(false);

  function describe(missing: Missing[], product: Product | undefined): string {
    const isPart = !!product && !!store.sources.get(product.id)?.length;
    const notes: string[] = [];
    const needs: string[] = [];
    for (const m of missing) {
      if (m.kind === 'product') notes.push('Not linked to a product yet');
      else if (m.kind === 'amount') notes.push('No amount in the recipe');
      else if (m.kind === 'nutrition') needs.push('nutrition');
      else if (m.kind === 'price')
        needs.push(isPart ? 'a cost share where it comes from' : 'price and pack size');
      else needs.push(`weight of ${weightLabel(m.unit)}`);
    }
    if (needs.length) notes.push(`${notes.length ? 'needs' : 'Needs'} ${needs.join(', ')}`);
    return notes.join('; ');
  }

  function openLine(facts: LineFacts) {
    if (!facts.product && onunlinked) {
      // Waits for this sheet's history entry to go before the picker adds its own.
      afterHistory(() => onunlinked(facts.line));
      return;
    }
    open = false;
    if (facts.missing.every((m) => m.kind === 'amount')) router.go(`/recipes/${recipe.id}/edit`);
    else if (facts.product) router.go(`/more/products/${facts.product.id}`);
    else router.go(`/more/products/new?name=${encodeURIComponent(capitalize(facts.line.name))}`);
  }

  function summary(): string {
    if (complete) return 'All ingredients counted';
    if (facts.nutritionCount === facts.costCount)
      return `From ${facts.nutritionCount} of ${total} ingredients`;
    return `Calories from ${facts.nutritionCount} of ${total} ingredients, cost from ${facts.costCount}`;
  }
</script>

{#if total}
  <section class="facts card">
    <div class="head">
      <h2 class="eyebrow">Per portion</h2>
      {#if hasCost}<span class="cost">{formatPrice(facts.cost)}</span>{/if}
    </div>
    {#if hasNutrition}
      <div class="macros">
        <svg
          class="ring"
          viewBox="0 0 120 120"
          role="img"
          aria-label={`${formatKcal(facts.nutrition.kcal)} kcal: ${shares
            .map((s) => `${macroLabels[s.key]} ${formatMacro(s.grams)}`)
            .join(', ')}`}
        >
          {#if segments.length}
            {#each segments as s (s.key)}
              <path d={segmentPath(60, 60, 57, 48, s.start, s.end)} fill={macroColors[s.key]} />
            {/each}
          {:else}
            <circle class="empty-ring" cx="60" cy="60" r="52.5" />
          {/if}
          <text class="ring-kcal" x="60" y="64" text-anchor="middle"
            >{formatKcal(facts.nutrition.kcal)}</text
          >
          <text class="ring-unit" x="60" y="82" text-anchor="middle">kcal</text>
        </svg>
        <ul class="legend">
          {#each shares as s (s.key)}
            <li style={`background:${macroColors[s.key]};color:${macroText}`}>
              <span class="macro-name">{macroLabels[s.key]}</span>
              <span class="macro-grams">{formatMacro(s.grams)}</span>
              <span class="macro-share">{Math.round(s.share * 100)}%</span>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="hint">
        Add nutrition and prices to this recipe’s products to see calories and cost here.
      </p>
    {/if}
    {#if complete}
      <p class="hint coverage">{summary()}</p>
    {:else}
      <button class="coverage-btn" type="button" onclick={() => (open = true)}>
        <span>{summary()}</span>
        <ChevronRight size={18} />
      </button>
    {/if}
  </section>

  <Sheet bind:open title="What’s missing">
    <div class="stack">
      <p class="hint">
        Tap an ingredient to pick or fill in its product. Cost uses regular prices, not offers.
      </p>
      <ul class="list">
        {#each gaps as gap, i (i)}
          <li>
            <button class="row" type="button" onclick={() => openLine(gap)}>
              <span class="row-main">
                <span class="row-title">{gap.line.text}</span>
                <span class="row-sub"
                  >{gap.product ? `${gap.product.name}: ` : ''}{describe(
                    gap.missing,
                    gap.product,
                  )}</span
                >
              </span>
              <ChevronRight size={18} />
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </Sheet>
{/if}

<style>
  .facts {
    margin-top: 12px;
    padding: 14px 16px 6px;
    overflow: hidden;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .head .eyebrow {
    margin: 0;
  }

  .cost {
    font-family: var(--font-display);
    font-size: 1.1875rem;
    font-weight: 600;
  }

  .macros {
    display: grid;
    grid-template-columns: 124px 1fr;
    align-items: center;
    gap: 16px;
    margin: 12px 0 8px;
  }

  .ring {
    display: block;
    width: 124px;
    height: 124px;
  }

  .empty-ring {
    fill: none;
    stroke: var(--surface-3);
    stroke-width: 9;
  }

  .ring-kcal {
    fill: var(--text);
    font-family: var(--font-display);
    font-size: 27px;
    font-weight: 650;
  }

  .ring-unit {
    fill: var(--muted);
    font-family: var(--font-ui);
    font-size: 12px;
  }

  .legend {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .legend li {
    display: grid;
    grid-template-columns: 1fr auto 3.2em;
    align-items: baseline;
    gap: 8px;
    padding: 7px 11px;
    border-radius: var(--radius-sm);
  }

  .macro-name {
    font-size: 0.875rem;
    font-weight: 650;
  }

  .macro-grams {
    font-family: var(--font-display);
    font-size: 1.0625rem;
    font-weight: 650;
    white-space: nowrap;
  }

  .macro-share {
    font-size: 0.8125rem;
    opacity: 0.75;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .facts > .hint {
    margin: 8px 0 4px;
  }

  .coverage {
    padding: 8px 0 8px;
  }

  .coverage-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: calc(100% + 32px);
    margin: 4px -16px 0;
    padding: 10px 16px 10px;
    border: 0;
    border-top: 1px solid var(--line);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.8125rem;
    text-align: left;
  }

  .coverage-btn:active {
    background: var(--surface-2);
  }

  .row-title {
    white-space: normal;
  }
</style>
