<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Check from '@lucide/svelte/icons/check';
  import CookingPot from '@lucide/svelte/icons/cooking-pot';
  import Sun from '@lucide/svelte/icons/sun';
  import { onMount } from 'svelte';
  import RecipePhoto from '../components/RecipePhoto.svelte';
  import StatePill from '../components/StatePill.svelte';
  import { mealsToCook } from '../lib/cooking';
  import { addDays, formatDayMonth, relativeDay, todayISO } from '../lib/dates';
  import { choiceSignature, chosenLines } from '../lib/choices';
  import { displayParts, type ParsedLine } from '../lib/ingredients';
  import { router } from '../lib/router.svelte';
  import { slotLabel } from '../lib/states';
  import { store } from '../lib/store.svelte';
  import type { Meal, Recipe } from '../lib/types';
  import { askConfirm, showToast } from '../lib/ui.svelte';
  import { keepScreenOn } from '../lib/wakeLock';

  const today = todayISO();
  const candidates = $derived(mealsToCook(store.meals, store.recipeById, today));
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
    /** The recipe id, plus the picks when they differ from the recipe's plain lines. */
    key: string;
    recipe: Recipe;
    lines: ParsedLine[];
    meals: Meal[];
    portions: number;
  }

  // Meals of one recipe are cooked together, unless they picked different options.
  const dishes = $derived.by((): Dish[] => {
    const session = store.cooking;
    if (!session) return [];
    const byKey = new Map<string, Dish>();
    for (const id of session.mealIds) {
      const meal = store.mealById.get(id);
      const recipe = meal?.recipeId ? store.recipeById.get(meal.recipeId) : undefined;
      if (!meal || !recipe) continue;
      const rows = store.rowsFor(recipe, meal.choices);
      const signature = choiceSignature(rows);
      const key = signature ? `${recipe.id}#${signature}` : recipe.id;
      const dish = byKey.get(key);
      if (dish) {
        dish.meals.push(meal);
        dish.portions += meal.portions;
      } else {
        byKey.set(key, {
          key,
          recipe,
          lines: chosenLines(rows),
          meals: [meal],
          portions: meal.portions,
        });
      }
    }
    return [...byKey.values()];
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
  <div class="top-bar">
    <button class="icon-btn" type="button" aria-label="Back" onclick={() => router.back('/plan')}>
      <ArrowLeft size={22} />
    </button>
    <h1 class="top-bar-title">{store.cooking ? 'Cooking' : 'Cook'}</h1>
    {#if store.cooking}
      <button class="btn btn-outline btn-small" type="button" onclick={stop}>Stop</button>
    {:else}
      <span class="top-bar-spacer"></span>
    {/if}
  </div>

  {#if !store.cooking}
    <p class="lead">What are you cooking?</p>

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
        <button class="btn btn-primary" type="button" onclick={() => router.back('/plan')}
          >Plan meals</button
        >
      </div>
    {/if}
  {:else}
    <p class="lead screen">
      {#if screenOn}<Sun size={15} /> The screen stays on{:else}Tap ingredients and steps as you go{/if}
    </p>

    <div class="stack">
      {#each dishes as dish (dish.key)}
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
            {#each dish.lines as line, i (i)}
              {#if line.heading}
                <li class="group">{line.name}</li>
              {:else}
                {@const key = `${dish.key}:i:${i}`}
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
                {@const key = `${dish.key}:s:${i}`}
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

<div class="action-bar">
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
  .top-bar-spacer {
    width: 42px;
    flex: none;
  }

  .lead {
    margin: 4px 4px 16px;
    color: var(--muted);
  }

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
