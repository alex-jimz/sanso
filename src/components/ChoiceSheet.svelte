<script lang="ts">
  // Picks one option of an ingredient line: an alternative written with "or",
  // or one of several products that match it, with each one's calories and cost.
  import Check from '@lucide/svelte/icons/check';
  import { optionGroups, type IngredientRow, type Option } from '../lib/choices';
  import { capitalize, scaleLine } from '../lib/ingredients';
  import { formatKcal, lineFacts } from '../lib/nutrition';
  import { formatPrice } from '../lib/quantity';
  import { store } from '../lib/store.svelte';
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
    onpick: (option: Option) => void;
  } = $props();

  const groups = $derived(row ? optionGroups(row) : []);

  function perPortion(option: Option): string {
    if (!option.product) return 'No product yet';
    const facts = lineFacts(option.line, store.priced(option.product));
    const count = portions > 0 ? portions : 1;
    const parts = [
      facts.nutrition ? `${formatKcal(facts.nutrition.kcal / count)} kcal` : undefined,
      facts.cost !== undefined ? formatPrice(facts.cost / count) : undefined,
    ].filter(Boolean);
    return parts.length ? `${parts.join(' · ')} per portion` : 'No calories or price yet';
  }

  function pick(option: Option) {
    open = false;
    if (option.key !== row?.chosen.key) onpick(option);
  }
</script>

<Sheet bind:open title="Choose an ingredient">
  {#if row}
    <div class="stack">
      {#each groups as group, g (g)}
        <div>
          {#if group.options.length > 1}
            <p class="eyebrow">{scaleLine(group.line, factor)}</p>
          {/if}
          <ul class="list">
            {#each group.options as option (option.key)}
              {@const on = option.key === row.chosen.key}
              <li>
                <button class="row" type="button" aria-pressed={on} onclick={() => pick(option)}>
                  <span class="row-main">
                    <span class="row-title"
                      >{group.options.length > 1
                        ? option.product?.name
                        : capitalize(scaleLine(option.line, factor))}</span
                    >
                    <span class="row-sub"
                      >{group.options.length === 1 && option.product
                        ? `${option.product.name} · ${perPortion(option)}`
                        : perPortion(option)}</span
                    >
                  </span>
                  <span class="check" class:on><Check size={16} strokeWidth={3} /></span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
      <p class="hint">
        Products whose name contains the ingredient are offered too. If one doesn’t belong, open it
        and remove the name under “Recipes that call it”.
      </p>
    </div>
  {/if}
</Sheet>

<style>
  .eyebrow {
    margin: 0 0 8px;
  }

  .row-title {
    white-space: normal;
  }
</style>
