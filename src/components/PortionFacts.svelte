<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { capitalize } from '../lib/ingredients';
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
  import Sheet from './Sheet.svelte';

  let { recipe }: { recipe: Recipe } = $props();

  const facts = $derived(store.factsFor(recipe));
  const total = $derived(facts.lines.length);
  const hasNutrition = $derived(facts.nutritionCount > 0);
  const hasCost = $derived(facts.costCount > 0);
  const complete = $derived(facts.nutritionCount === total && facts.costCount === total);
  const gaps = $derived(facts.lines.filter((l) => l.missing.length));
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
      <dl class="grid">
        <div class="kcal">
          <dt>kcal</dt>
          <dd>{formatKcal(facts.nutrition.kcal)}</dd>
        </div>
        <div>
          <dt>Protein</dt>
          <dd>{formatMacro(facts.nutrition.protein)}</dd>
        </div>
        <div>
          <dt>Fat</dt>
          <dd>{formatMacro(facts.nutrition.fat)}</dd>
        </div>
        <div>
          <dt>Carbs</dt>
          <dd>{formatMacro(facts.nutrition.carbs)}</dd>
        </div>
      </dl>
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
        Tap an ingredient to fill in its product. Cost uses regular prices, not offers.
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

  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin: 10px 0 4px;
  }

  .grid div {
    display: grid;
    gap: 2px;
  }

  .grid div + div {
    padding-left: 12px;
    border-left: 1px solid var(--line);
  }

  dt {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 700;
  }

  dd {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .kcal dd {
    color: var(--accent);
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
