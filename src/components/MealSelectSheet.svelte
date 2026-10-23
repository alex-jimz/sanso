<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import { untrack } from 'svelte';
  import { addDays, formatDayMonth, relativeDay, todayISO } from '../lib/dates';
  import { slotLabel, stateInfo } from '../lib/states';
  import { store } from '../lib/store.svelte';
  import type { Meal } from '../lib/types';
  import Sheet from './Sheet.svelte';

  interface Props {
    open: boolean;
    initial: string[];
    confirmLabel: (count: number) => string;
    onconfirm: (mealIds: string[]) => void;
  }

  let { open = $bindable(), initial, confirmLabel, onconfirm }: Props = $props();

  const today = todayISO();
  let chosen = $state<string[]>([]);

  const order = (m: Meal) => `${m.date}-${m.slot === 'lunch' ? 0 : 1}`;
  const candidates = $derived(
    store.meals
      .filter(
        (m) =>
          m.recipeId &&
          store.recipeById.has(m.recipeId) &&
          m.state !== 'cooked' &&
          m.state !== 'noCooking' &&
          m.date >= addDays(today, -2) &&
          m.date <= addDays(today, 13),
      )
      .sort((a, b) => order(a).localeCompare(order(b))),
  );
  const days = $derived([...new Set(candidates.map((m) => m.date))]);

  $effect(() => {
    if (open) chosen = untrack(() => [...initial]);
  });

  function toggle(id: string) {
    chosen = chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
  }

  function confirm() {
    onconfirm(candidates.filter((m) => chosen.includes(m.id)).map((m) => m.id));
    open = false;
  }
</script>

<Sheet bind:open title="Shop for which meals?">
  {#if candidates.length}
    <div class="stack">
      {#each days as date (date)}
        <div>
          <p class="eyebrow day">{relativeDay(date, today)} · {formatDayMonth(date)}</p>
          <ul class="list">
            {#each candidates.filter((m) => m.date === date) as meal (meal.id)}
              {@const recipe = store.recipeById.get(meal.recipeId!)}
              <li>
                <button
                  class="row"
                  type="button"
                  onclick={() => toggle(meal.id)}
                  aria-pressed={chosen.includes(meal.id)}
                >
                  <span class="check" class:on={chosen.includes(meal.id)}
                    ><Check size={16} strokeWidth={3} /></span
                  >
                  <span class="row-main">
                    <span class="row-title">{recipe?.title}</span>
                    <span class="row-sub">
                      {slotLabel[meal.slot]} · {meal.portions === 1
                        ? '1 portion'
                        : `${meal.portions} portions`} ·
                      {stateInfo(meal.state).label}
                    </span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {:else}
    <p class="hint empty-hint">
      No meals with recipes in the next two weeks. Plan some meals first, or add items by hand.
    </p>
  {/if}
  {#snippet footer()}
    <button class="btn btn-primary" type="button" onclick={confirm}
      >{confirmLabel(chosen.length)}</button
    >
  {/snippet}
</Sheet>

<style>
  .day {
    margin: 0 0 8px 4px;
  }

  .empty-hint {
    padding: 16px 0;
    font-size: 0.9375rem;
  }
</style>
