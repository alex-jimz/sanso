<script lang="ts">
  // Picks a food from the built-in basic foods table, with the suggested one first.
  import Search from '@lucide/svelte/icons/search';
  import { searchBasicFoods, type BasicFood } from '../lib/basicFoods';
  import { formatMacro, weightLabel } from '../lib/nutrition';
  import Sheet from './Sheet.svelte';

  let {
    open = $bindable(),
    suggested,
    onpick,
  }: {
    open: boolean;
    suggested?: BasicFood;
    onpick: (food: BasicFood) => void;
  } = $props();

  let query = $state('');

  $effect(() => {
    if (open) query = '';
  });

  const matches = $derived.by(() => {
    const found = searchBasicFoods(query);
    if (query.trim() || !suggested) return found;
    return [suggested, ...found.filter((f) => f.name !== suggested.name)];
  });

  function pick(food: BasicFood) {
    open = false;
    onpick(food);
  }
</script>

<Sheet bind:open title="Basic foods">
  <div class="stack">
    <p class="hint">
      Per 100 g, raw, from USDA FoodData Central. Carbs leave out fibre, as on EU labels.
    </p>
    <label class="search">
      <span class="sr-only">Search basic foods</span>
      <Search class="search-icon" size={18} />
      <input
        class="input"
        type="search"
        placeholder="Search, like onion or chicken"
        bind:value={query}
        autocomplete="off"
      />
    </label>
    {#if matches.length}
      <ul class="list">
        {#each matches as food (food.name)}
          <li>
            <button class="row" type="button" onclick={() => pick(food)}>
              <span class="row-main">
                <span class="row-title"
                  >{food.name}{#if food.name === suggested?.name && !query.trim()}<span class="pill"
                      >Suggested</span
                    >{/if}</span
                >
                <span class="row-sub"
                  >{food.kcal} kcal · P {formatMacro(food.protein)} · F {formatMacro(food.fat)} · C {formatMacro(
                    food.carbs,
                  )}{#each Object.entries(food.weights ?? {}).slice(0, 1) as [key, grams] (key)}
                    · {weightLabel(key)} {grams} g{/each}</span
                >
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">No basic food matches. Type the values from another source instead.</p>
    {/if}
  </div>
</Sheet>

<style>
  .row-title .pill {
    margin-left: 8px;
    vertical-align: 1px;
  }
</style>
