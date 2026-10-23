<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import CookingPot from '@lucide/svelte/icons/cooking-pot';
  import Sun from '@lucide/svelte/icons/sun';
  import { onMount } from 'svelte';
  import RecipePhoto from '../components/RecipePhoto.svelte';
  import StatePill from '../components/StatePill.svelte';
  import { addDays, formatDayMonth, relativeDay, todayISO } from '../lib/dates';
  import { displayParts, parseIngredients } from '../lib/ingredients';
  import { router } from '../lib/router.svelte';
  import { slotLabel } from '../lib/states';
  import { store } from '../lib/store.svelte';
  import type { Meal, Recipe } from '../lib/types';
  import { askConfirm, showToast } from '../lib/ui.svelte';
  import { keepScreenOn } from '../lib/wakeLock';

  const today = todayISO();
  const order = (m: Meal) => `${m.date}-${m.slot === 'lunch' ? 0 : 1}`;

  const candidates = $derived(
    store.meals
      .filter(
        (m) =>
          m.recipeId &&
          store.recipeById.has(m.recipeId) &&
          m.state !== 'cooked' &&
          m.state !== 'noCooking' &&
          m.date >= addDays(today, -1) &&
          m.date <= addDays(today, 6),
      )
      .sort((a, b) => order(a).localeCompare(order(b))),
  );
  const days = $derived([...new Set(candidates.map((m) => m.date))]);

  let chosen = $state<string[]>([]);

  onMount(() => {
    // Start with today's meals that are ready, plus later meals cooked from the same recipe (leftovers).
    const todays = candidates.filter((m) => m.date === today && m.state === 'ready');
    const recipes = new Set(todays.map((m) => m.recipeId));
    chosen = candidates
      .filter((m) => todays.includes(m) || (recipes.has(m.recipeId) && m.date <= addDays(today, 2)))
      .map((m) => m.id);
  });

  function toggle(id: string) {
    chosen = chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
  }

  interface Dish {
    recipe: Recipe;
    meals: Meal[];
    portions: number;
  }

  const dishes = $derived.by((): Dish[] => {
    const session = store.cooking;
    if (!session) return [];
    const byRecipe = new Map<string, Meal[]>();
    for (const id of session.mealIds) {
      const meal = store.mealById.get(id);
      if (!meal?.recipeId || !store.recipeById.has(meal.recipeId)) continue;
      byRecipe.set(meal.recipeId, [...(byRecipe.get(meal.recipeId) ?? []), meal]);
    }
    return [...byRecipe].map(([recipeId, meals]) => ({
      recipe: store.recipeById.get(recipeId)!,
      meals,
      portions: meals.reduce((sum, m) => sum + m.portions, 0),
    }));
  });

  const cooking = $derived(!!store.cooking);
  let screenOn = $state(false);

  $effect(() => {
    if (!cooking) return;
    return keepScreenOn((on) => (screenOn = on));
  });

  const ticked = (key: string) => store.cooking?.ticked.includes(key) ?? false;

  function mealsLabel(meals: Meal[]): string {
    return meals
      .map((m) => `${relativeDay(m.date, today)} ${slotLabel[m.slot].toLowerCase()}`)
      .join(', ');
  }

  async function finish() {
    const count = await store.finishCooking();
    showToast(
      count === 1
        ? 'Enjoy! The meal is marked as cooked.'
        : `Enjoy! ${count} meals are marked as cooked.`,
    );
  }

  async function stop() {
    const ok = await askConfirm({
      title: 'Stop cooking?',
      message: 'The meals stay as they are, not marked as cooked.',
      confirmLabel: 'Stop',
    });
    if (ok) await store.stopCooking();
  }
</script>

<div class="page with-action">
  {#if !store.cooking}
    <header class="page-header">
      <div>
        <h1 class="page-title">Cook</h1>
        <p class="page-subtitle">What are you cooking?</p>
      </div>
    </header>

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
                    aria-pressed={chosen.includes(meal.id)}
                    onclick={() => toggle(meal.id)}
                  >
                    <span class="check" class:on={chosen.includes(meal.id)}
                      ><Check size={16} strokeWidth={3} /></span
                    >
                    <span class="row-main">
                      <span class="row-title">{recipe?.title}</span>
                      <span class="row-sub">
                        {slotLabel[meal.slot]} · {meal.portions === 1
                          ? '1 portion'
                          : `${meal.portions} portions`}
                      </span>
                    </span>
                    <StatePill state={meal.state} />
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
        <p class="hint">
          Pick the same recipe for two meals, such as dinner and tomorrow’s lunch, to cook it once
          for both.
        </p>
      </div>
    {:else}
      <div class="empty">
        <div class="empty-icon"><CookingPot size={34} strokeWidth={1.7} /></div>
        <h2>Nothing to cook yet</h2>
        <p>Meals you plan for the coming days show up here, ready to cook.</p>
        <button
          class="btn btn-primary"
          type="button"
          onclick={() => router.go('/plan', { replace: true })}>Plan meals</button
        >
      </div>
    {/if}
  {:else}
    <header class="page-header">
      <div>
        <h1 class="page-title">Cooking</h1>
        <p class="page-subtitle screen">
          {#if screenOn}<Sun size={15} /> The screen stays on{:else}Tap ingredients and steps as you
            go{/if}
        </p>
      </div>
      <button class="btn btn-outline btn-small" type="button" onclick={stop}>Stop</button>
    </header>

    <div class="stack">
      {#each dishes as dish (dish.recipe.id)}
        {@const recipe = dish.recipe}
        {@const factor = dish.portions / recipe.portions}
        <article class="dish card">
          <div class="dish-head">
            <span class="thumb"
              ><RecipePhoto photoId={recipe.photoId} title={recipe.title} iconSize={22} /></span
            >
            <div>
              <h2>{recipe.title}</h2>
              <p class="hint">
                {dish.portions === 1 ? '1 portion' : `${dish.portions} portions`} · {mealsLabel(
                  dish.meals,
                )}
              </p>
            </div>
          </div>

          <h3 class="eyebrow">Ingredients</h3>
          <ul class="ticks">
            {#each parseIngredients(recipe.ingredients) as line, i (i)}
              {#if line.heading}
                <li class="group">{line.name}</li>
              {:else}
                {@const key = `${recipe.id}:i:${i}`}
                {@const parts = displayParts(line, factor)}
                <li>
                  <button
                    type="button"
                    class:done={ticked(key)}
                    onclick={() => store.toggleTick(key)}
                  >
                    <span class="check small" class:on={ticked(key)}
                      ><Check size={14} strokeWidth={3} /></span
                    >
                    <span
                      >{parts.before}{#if parts.amount}<strong>{parts.amount}</strong
                        >{/if}{parts.after}</span
                    >
                  </button>
                </li>
              {/if}
            {/each}
          </ul>

          {#if recipe.steps.length}
            <h3 class="eyebrow">Steps</h3>
            <ol class="ticks steps">
              {#each recipe.steps as step, i (i)}
                {@const key = `${recipe.id}:s:${i}`}
                <li>
                  <button
                    type="button"
                    class:done={ticked(key)}
                    onclick={() => store.toggleTick(key)}
                  >
                    <span class="num" class:on={ticked(key)}>
                      {#if ticked(key)}<Check size={14} strokeWidth={3} />{:else}{i + 1}{/if}
                    </span>
                    <span>{step}</span>
                  </button>
                </li>
              {/each}
            </ol>
          {/if}

          {#if recipe.notes.trim()}
            <div class="notes">{recipe.notes}</div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</div>

<div class="action-bar with-tabs">
  {#if store.cooking}
    <button class="btn btn-primary" type="button" onclick={finish}
      ><Check size={20} /> Done cooking</button
    >
  {:else if candidates.length}
    <button
      class="btn btn-primary"
      type="button"
      disabled={!chosen.length}
      onclick={() => store.startCooking(chosen)}
    >
      <CookingPot size={20} />
      {chosen.length
        ? `Start cooking (${chosen.length === 1 ? '1 meal' : `${chosen.length} meals`})`
        : 'Pick meals to cook'}
    </button>
  {/if}
</div>

<style>
  .day {
    margin: 0 0 8px 4px;
  }

  .screen {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dish {
    padding: 16px;
  }

  .dish-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 8px;
  }

  .dish-head h2 {
    margin: 0;
    font-size: 1.375rem;
  }

  .thumb {
    flex: none;
    width: 60px;
    height: 60px;
    overflow: hidden;
    border-radius: 14px;
  }

  .eyebrow {
    margin: 18px 0 6px;
  }

  .ticks {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ticks button {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    padding: 9px 0;
    border: 0;
    background: none;
    text-align: left;
    line-height: 1.45;
  }

  .ticks button.done > span:last-child {
    color: var(--faint);
    text-decoration: line-through;
  }

  .ticks .group {
    padding: 10px 0 2px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 750;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .check.small {
    width: 22px;
    height: 22px;
    margin-top: 1px;
  }

  .steps button {
    padding: 11px 0;
    font-size: 1.0625rem;
    line-height: 1.55;
  }

  .num {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    margin-top: 1px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.8125rem;
    font-weight: 750;
  }

  .num.on {
    background: var(--accent);
    color: var(--on-accent);
  }

  .notes {
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--mustard-soft);
    color: #5a4316;
    white-space: pre-line;
  }
</style>
