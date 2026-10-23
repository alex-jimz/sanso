<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Plus from '@lucide/svelte/icons/plus';
  import ShoppingBasket from '@lucide/svelte/icons/shopping-basket';
  import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
  import MealSheet from '../components/MealSheet.svelte';
  import RecipePhoto from '../components/RecipePhoto.svelte';
  import StatePill from '../components/StatePill.svelte';
  import {
    addDays,
    formatWeekRange,
    formatWeekday,
    fromISODate,
    startOfWeek,
    todayISO,
    weekDates,
  } from '../lib/dates';
  import { router } from '../lib/router.svelte';
  import { slotLabel } from '../lib/states';
  import { store } from '../lib/store.svelte';
  import type { Slot } from '../lib/types';

  const today = todayISO();
  const thisWeek = startOfWeek(today);
  const slots: Slot[] = ['lunch', 'dinner'];

  let monday = $state(startOfWeek(router.route.query.get('week') ?? today));
  let sheetOpen = $state(false);
  let selected = $state<{ date: string; slot: Slot }>({ date: today, slot: 'dinner' });

  const days = $derived(weekDates(monday));
  const toShop = $derived(
    store.meals.filter(
      (m) =>
        m.state === 'toShop' &&
        m.recipeId &&
        m.date >= today &&
        !store.list?.mealIds.includes(m.id),
    ).length,
  );

  function openSlot(date: string, slot: Slot) {
    selected = { date, slot };
    sheetOpen = true;
  }

  function showWeek(start: string) {
    monday = start;
    router.go(start === thisWeek ? '/plan' : `/plan?week=${start}`, { replace: true });
  }
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1 class="page-title">Plan</h1>
      <p class="page-subtitle">{monday === thisWeek ? 'This week' : formatWeekRange(monday)}</p>
    </div>
    <div class="week-nav">
      {#if monday !== thisWeek}
        <button class="btn btn-outline btn-small" type="button" onclick={() => showWeek(thisWeek)}
          >Today</button
        >
      {/if}
      <button
        class="icon-btn filled"
        type="button"
        aria-label="Previous week"
        onclick={() => showWeek(addDays(monday, -7))}
      >
        <ChevronLeft size={20} />
      </button>
      <button
        class="icon-btn filled"
        type="button"
        aria-label="Next week"
        onclick={() => showWeek(addDays(monday, 7))}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  </header>

  {#if toShop > 0}
    <button class="shop-banner" type="button" onclick={() => router.go('/shopping?pick=1')}>
      <span class="banner-icon"><ShoppingBasket size={20} /></span>
      <span class="row-main">
        <span class="row-title">{toShop === 1 ? '1 meal' : `${toShop} meals`} to shop for</span>
        <span class="row-sub">Make the shopping list</span>
      </span>
      <ChevronRight size={20} />
    </button>
  {/if}

  <div class="days">
    {#each days as date (date)}
      {@const isToday = date === today}
      <section class="day card" class:today={isToday} class:past={date < today}>
        <div class="day-label" aria-label={formatWeekday(date)}>
          <span class="weekday">{formatWeekday(date, true)}</span>
          <span class="num">{fromISODate(date).getDate()}</span>
        </div>
        <div class="slots">
          {#each slots as slot (slot)}
            {@const meal = store.mealById.get(`${date}:${slot}`)}
            {@const recipe = meal?.recipeId ? store.recipeById.get(meal.recipeId) : undefined}
            {#if meal}
              <button class="slot" type="button" onclick={() => openSlot(date, slot)}>
                <span class="thumb">
                  {#if recipe}
                    <RecipePhoto photoId={recipe.photoId} title={recipe.title} iconSize={18} />
                  {:else}
                    <span class="thumb-icon"><UtensilsCrossed size={18} /></span>
                  {/if}
                </span>
                <span class="slot-main">
                  <span class="slot-name">{slotLabel[slot]}</span>
                  <span class="slot-title">
                    {recipe?.title ??
                      (meal.state === 'noCooking' ? meal.note || 'No cooking' : 'Deleted recipe')}
                  </span>
                  <span class="slot-meta">
                    <StatePill state={meal.state} />
                    {#if recipe && meal.portions !== store.settings.defaultPortions}
                      <span class="portions">{meal.portions} portions</span>
                    {/if}
                  </span>
                </span>
              </button>
            {:else}
              <button class="slot empty" type="button" onclick={() => openSlot(date, slot)}>
                <Plus size={17} />
                {slotLabel[slot]}
              </button>
            {/if}
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>

<MealSheet bind:open={sheetOpen} date={selected.date} slot={selected.slot} />

<style>
  .week-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 2px;
  }

  .shop-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    margin-bottom: 14px;
    padding: 12px 14px;
    border: 0;
    border-radius: var(--radius-lg);
    background: var(--mustard-soft);
    color: #5c430f;
    text-align: left;
  }

  .shop-banner .row-sub {
    color: #7c5d1c;
  }

  .banner-icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--surface);
    color: var(--mustard);
  }

  .days {
    display: grid;
    gap: 10px;
  }

  .day {
    display: flex;
    gap: 4px;
    padding: 8px 8px 8px 4px;
  }

  .day.past {
    opacity: 0.6;
  }

  .day-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: none;
    width: 50px;
    padding-top: 8px;
  }

  .weekday {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .num {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    margin-top: 2px;
    border-radius: 50%;
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
  }

  .today .num {
    background: var(--accent);
    color: var(--on-accent);
  }

  .today .weekday {
    color: var(--accent);
  }

  .slots {
    display: grid;
    flex: 1;
    gap: 6px;
    min-width: 0;
  }

  .slot {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 64px;
    padding: 7px;
    border: 0;
    border-radius: 16px;
    background: var(--surface-2);
    text-align: left;
  }

  .slot:active {
    background: var(--surface-3);
  }

  .slot.empty {
    justify-content: center;
    gap: 6px;
    min-height: 48px;
    border: 1.5px dashed var(--surface-3);
    background: transparent;
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 650;
  }

  .thumb {
    flex: none;
    width: 50px;
    height: 50px;
    overflow: hidden;
    border-radius: 12px;
  }

  .thumb-icon {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    background: var(--plum-soft);
    color: var(--plum);
  }

  .slot-main {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .slot-name {
    color: var(--muted);
    font-size: 0.6875rem;
    font-weight: 750;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .slot-title {
    overflow: hidden;
    font-weight: 650;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .slot-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .portions {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 650;
  }
</style>
