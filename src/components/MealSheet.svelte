<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Repeat from '@lucide/svelte/icons/repeat';
  import Soup from '@lucide/svelte/icons/soup';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
  import { untrack } from 'svelte';
  import { addDays, dayInSentence, relativeDay } from '../lib/dates';
  import { router } from '../lib/router.svelte';
  import { mealStates, slotLabel } from '../lib/states';
  import { store } from '../lib/store.svelte';
  import type { Meal, Recipe, Slot } from '../lib/types';
  import { showToast } from '../lib/ui.svelte';
  import RecipePhoto from './RecipePhoto.svelte';
  import RecipePicker from './RecipePicker.svelte';
  import Sheet from './Sheet.svelte';
  import Stepper from './Stepper.svelte';

  let { open = $bindable(), date, slot }: { open: boolean; date: string; slot: Slot } = $props();

  const id = $derived(`${date}:${slot}`);
  const meal = $derived(store.mealById.get(id));
  const recipe = $derived(meal?.recipeId ? store.recipeById.get(meal.recipeId) : undefined);
  const nextDay = $derived(addDays(date, 1));
  const canPlanLeftovers = $derived(
    slot === 'dinner' &&
      !!recipe &&
      meal?.state !== 'noCooking' &&
      !store.mealById.get(`${nextDay}:lunch`),
  );
  const slotPhrase = $derived(`${dayInSentence(date)}’s ${slotLabel[slot].toLowerCase()}`);

  let picking = $state(false);
  let note = $state('');
  let portions = $state(1);

  $effect(() => {
    if (!open) return;
    const current = untrack(() => store.mealById.get(id));
    picking = !current;
    note = current?.note ?? '';
    portions = current?.portions ?? untrack(() => store.settings.defaultPortions);
  });

  async function update(patch: Partial<Meal>) {
    if (meal) await store.saveMeal({ ...$state.snapshot(meal), ...patch });
  }

  async function pick(chosen: Recipe) {
    if (meal) {
      const wasNoCooking = meal.state === 'noCooking';
      await update({
        recipeId: chosen.id,
        state: wasNoCooking ? 'toShop' : meal.state,
        note: wasNoCooking ? undefined : meal.note,
      });
    } else {
      await store.planRecipe(date, slot, chosen.id);
    }
    open = false;
    showToast(`${chosen.title} planned for ${slotPhrase}`);
  }

  async function noCooking() {
    await store.saveMeal({
      id,
      date,
      slot,
      portions: meal?.portions ?? store.settings.defaultPortions,
      state: 'noCooking',
      note: meal?.note,
    });
    picking = false;
  }

  async function planLeftovers() {
    if (!meal || !recipe) return;
    await store.saveMeal({
      id: `${nextDay}:lunch`,
      date: nextDay,
      slot: 'lunch',
      recipeId: recipe.id,
      portions: store.settings.defaultPortions,
      state: meal.state,
      note: 'Leftovers',
    });
    showToast(`Leftovers planned for ${dayInSentence(nextDay)}’s lunch`);
  }

  async function remove() {
    if (!meal) return;
    const before = $state.snapshot(meal);
    await store.removeMeal(id);
    open = false;
    showToast('Removed from the plan', { label: 'Undo', run: () => void store.saveMeal(before) });
  }
</script>

{#snippet actions()}
  <button class="btn" type="button" onclick={() => (picking = true)}
    ><Repeat size={18} /> Change</button
  >
  <button class="btn btn-danger" type="button" onclick={remove}><Trash2 size={18} /> Remove</button>
{/snippet}

<Sheet
  bind:open
  title={`${relativeDay(date)} · ${slotLabel[slot]}`}
  footer={meal && !picking ? actions : undefined}
>
  {#if picking || !meal}
    <RecipePicker onpick={pick}>
      {#snippet before()}
        <button class="no-cook" type="button" onclick={noCooking}>
          <span class="no-cook-icon"><UtensilsCrossed size={20} /></span>
          <span class="row-main">
            <span class="row-title">No cooking</span>
            <span class="row-sub">Eating out, leftovers, someone else is cooking</span>
          </span>
        </button>
      {/snippet}
    </RecipePicker>
    {#if meal}
      <button class="btn btn-quiet keep" type="button" onclick={() => (picking = false)}>
        Keep {recipe?.title ?? 'the current plan'}
      </button>
    {/if}
  {:else}
    <div class="stack">
      {#if recipe}
        <button class="recipe" type="button" onclick={() => router.go(`/recipes/${recipe.id}`)}>
          <span class="thumb"
            ><RecipePhoto photoId={recipe.photoId} title={recipe.title} iconSize={22} /></span
          >
          <span class="row-main">
            <span class="recipe-title">{recipe.title}</span>
            <span class="row-sub">Open recipe</span>
          </span>
          <ChevronRight size={20} />
        </button>
      {:else if meal.recipeId}
        <p class="hint">The recipe for this meal was deleted.</p>
      {/if}

      <div class="segmented states" role="group" aria-label="Status">
        {#each mealStates as s (s.id)}
          <button
            type="button"
            aria-pressed={meal.state === s.id}
            class="s-{s.id}"
            disabled={!recipe && s.id !== 'noCooking'}
            onclick={() => update({ state: s.id })}
          >
            <s.icon size={19} strokeWidth={2.1} />
            <span>{s.short}</span>
          </button>
        {/each}
      </div>

      {#if recipe && meal.state !== 'noCooking'}
        <div class="inline">
          <div>
            <span class="label">Portions</span>
            <span class="hint">Recipe makes {recipe.portions}</span>
          </div>
          <Stepper
            bind:value={portions}
            label="Portions"
            onchange={(v) => update({ portions: v })}
          />
        </div>
      {/if}

      <label class="field">
        <span class="field-label">Note</span>
        <input
          class="input"
          bind:value={note}
          placeholder={meal.state === 'noCooking' ? 'Dinner at Sam’s' : 'Optional'}
          onchange={() => update({ note: note.trim() || undefined })}
        />
      </label>

      {#if canPlanLeftovers}
        <button class="btn btn-outline" type="button" onclick={planLeftovers}>
          <Soup size={18} /> Also plan {dayInSentence(nextDay)}’s lunch as leftovers
        </button>
      {/if}
    </div>
  {/if}
</Sheet>

<style>
  .no-cook {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    border: 1.5px dashed color-mix(in srgb, var(--plum) 35%, transparent);
    border-radius: var(--radius);
    background: var(--plum-soft);
    color: var(--text);
    text-align: left;
  }

  .no-cook-icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--surface);
    color: var(--plum);
  }

  .keep {
    justify-self: center;
    margin-top: 6px;
    width: 100%;
  }

  .recipe {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 10px;
    border: 0;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    text-align: left;
    color: var(--muted);
  }

  .thumb {
    flex: none;
    width: 58px;
    height: 58px;
    overflow: hidden;
    border-radius: 14px;
  }

  .recipe-title {
    display: block;
    color: var(--text);
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 600;
  }

  .states button {
    flex-direction: column;
    gap: 3px;
    min-height: 58px;
    font-size: 0.75rem;
  }

  .states button[aria-pressed='true'].s-toShop {
    color: var(--mustard);
  }

  .states button[aria-pressed='true'].s-ready {
    color: var(--accent);
  }

  .states button[aria-pressed='true'].s-cooked {
    color: var(--stone);
  }

  .states button[aria-pressed='true'].s-noCooking {
    color: var(--plum);
  }

  .states button:disabled {
    opacity: 0.35;
  }

  .inline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .inline .label {
    display: block;
    font-weight: 650;
  }

  .inline .hint {
    display: block;
  }
</style>
