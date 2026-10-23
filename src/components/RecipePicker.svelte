<script lang="ts">
  import Search from '@lucide/svelte/icons/search';
  import type { Snippet } from 'svelte';
  import { formatMinutes } from '../lib/quantity';
  import { filterRecipes, sortRecipes } from '../lib/recipes';
  import { store } from '../lib/store.svelte';
  import type { Recipe } from '../lib/types';
  import RecipePhoto from './RecipePhoto.svelte';

  let { onpick, before }: { onpick: (recipe: Recipe) => void; before?: Snippet } = $props();

  let query = $state('');
  let tag = $state<string | null>(null);

  const results = $derived(sortRecipes(filterRecipes(store.recipes, query, tag), 'score'));
</script>

<div class="picker">
  <label class="search">
    <span class="sr-only">Search recipes</span>
    <Search class="search-icon" size={18} />
    <input class="input" type="search" placeholder="Search recipes" bind:value={query} />
  </label>
  <div class="chips">
    <button class="chip" type="button" aria-pressed={tag === null} onclick={() => (tag = null)}
      >All</button
    >
    {#each store.settings.tags as t (t)}
      <button
        class="chip"
        type="button"
        aria-pressed={tag === t}
        onclick={() => (tag = tag === t ? null : t)}
      >
        {t}
      </button>
    {/each}
  </div>

  {@render before?.()}

  {#if results.length}
    <ul class="list">
      {#each results as recipe (recipe.id)}
        {@const time = recipe.totalMinutes ?? recipe.prepMinutes}
        <li>
          <button class="row" type="button" onclick={() => onpick(recipe)}>
            <span class="thumb"
              ><RecipePhoto photoId={recipe.photoId} title={recipe.title} iconSize={20} /></span
            >
            <span class="row-main">
              <span class="row-title">{recipe.title}</span>
              <span class="row-sub">
                {[
                  time ? formatMinutes(time) : '',
                  recipe.score !== undefined ? `${recipe.score}/10` : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || recipe.tags.join(', ')}
              </span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if store.recipes.length}
    <p class="hint none">No recipes match.</p>
  {:else}
    <p class="hint none">Your recipe book is empty. Add recipes from the Recipes tab first.</p>
  {/if}
</div>

<style>
  .picker {
    display: grid;
    gap: 12px;
  }

  .search .input {
    box-shadow: none;
    border-color: var(--line);
  }

  .thumb {
    flex: none;
    width: 48px;
    height: 48px;
    overflow: hidden;
    border-radius: 12px;
  }

  .none {
    padding: 20px 0;
    text-align: center;
  }
</style>
