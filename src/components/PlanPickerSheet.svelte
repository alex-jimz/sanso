<script lang="ts">
  import { addDays, dayInSentence, formatDayMonth, relativeDay, todayISO } from '../lib/dates';
  import { capitalize } from '../lib/ingredients';
  import { slotLabel } from '../lib/states';
  import { store } from '../lib/store.svelte';
  import type { Recipe, Slot } from '../lib/types';
  import { askConfirm, showToast } from '../lib/ui.svelte';
  import Sheet from './Sheet.svelte';
  import Stepper from './Stepper.svelte';

  let { open = $bindable(), recipe }: { open: boolean; recipe: Recipe } = $props();

  let portions = $state(1);
  const slots: Slot[] = ['lunch', 'dinner'];
  const today = todayISO();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  $effect(() => {
    if (open) portions = store.settings.defaultPortions;
  });

  function plannedTitle(date: string, slot: Slot): string | undefined {
    const meal = store.mealById.get(`${date}:${slot}`);
    if (!meal) return undefined;
    if (meal.state === 'noCooking') return 'No cooking';
    return (meal.recipeId && store.recipeById.get(meal.recipeId)?.title) || undefined;
  }

  async function plan(date: string, slot: Slot) {
    const current = plannedTitle(date, slot);
    const label = `${dayInSentence(date)}’s ${slotLabel[slot].toLowerCase()}`;
    if (current) {
      const ok = await askConfirm({
        title: 'Replace this meal?',
        message: `${capitalize(label)} is already ${current}.`,
        confirmLabel: 'Replace',
      });
      if (!ok) return;
    }
    await store.planRecipe(date, slot, recipe.id, portions);
    open = false;
    showToast(`Planned for ${label}`);
  }
</script>

<Sheet bind:open title="Add to plan">
  <div class="portions">
    <span>Portions</span>
    <Stepper bind:value={portions} label="Portions" />
  </div>
  <ul class="days">
    {#each days as date (date)}
      <li>
        <div class="day">
          <span class="name">{relativeDay(date, today)}</span>
          <span class="date">{formatDayMonth(date)}</span>
        </div>
        {#each slots as slot (slot)}
          {@const taken = plannedTitle(date, slot)}
          <button type="button" class="slot" class:taken onclick={() => plan(date, slot)}>
            <span class="slot-name">{slotLabel[slot]}</span>
            {#if taken}<span class="slot-recipe">{taken}</span>{/if}
          </button>
        {/each}
      </li>
    {/each}
  </ul>
</Sheet>

<style>
  .portions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    font-weight: 650;
  }

  .days {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 6.5rem 1fr 1fr;
    align-items: center;
    gap: 8px;
  }

  .day {
    display: grid;
  }

  .name {
    font-weight: 650;
  }

  .date {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .slot {
    display: grid;
    align-content: center;
    min-height: 50px;
    padding: 6px 10px;
    border: 1.5px dashed var(--line);
    border-radius: 14px;
    background: transparent;
    text-align: left;
  }

  .slot:active {
    background: var(--accent-soft);
  }

  .slot.taken {
    border-style: solid;
    background: var(--surface);
  }

  .slot-name {
    font-size: 0.875rem;
    font-weight: 650;
    color: var(--accent);
  }

  .taken .slot-name {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .slot-recipe {
    overflow: hidden;
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
