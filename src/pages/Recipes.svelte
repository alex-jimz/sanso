<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Plus from '@lucide/svelte/icons/plus';
  import Search from '@lucide/svelte/icons/search';
  import RecipeCard from '../components/RecipeCard.svelte';
  import { filterRecipes, recipeSorts, sortRecipes, type RecipeSort } from '../lib/recipes';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';

  let query = $state('');
  let tag = $state<string | null>(null);
  let sort = $state<RecipeSort>('score');

  const shown = $derived(sortRecipes(filterRecipes(store.recipes, query, tag), sort));
</script>

<div class="page with-action">
  <header class="page-header">
    <div>
      <h1 class="page-title">Recipes</h1>
      <p class="page-subtitle">
        {store.recipes.length === 1 ? '1 recipe' : `${store.recipes.length} recipes`}
      </p>
    </div>
  </header>

  {#if store.recipes.length === 0}
    <div class="empty">
      <div class="empty-icon"><BookOpen size={34} strokeWidth={1.7} /></div>
      <h2>Your recipe book is empty</h2>
      <p>Add the recipes you cook. Ingredients, steps, times and a photo all go in one place.</p>
      <button class="btn btn-primary" type="button" onclick={() => router.go('/recipes/new')}>
        <Plus size={20} /> Add a recipe
      </button>
    </div>
  {:else}
    <div class="tools">
      <label class="search">
        <span class="sr-only">Search recipes</span>
        <Search class="search-icon" size={18} />
        <input
          class="input"
          type="search"
          placeholder="Search recipes or ingredients"
          bind:value={query}
        />
      </label>

      <div class="chips" role="group" aria-label="Filter by tag">
        <button class="chip" type="button" aria-pressed={tag === null} onclick={() => (tag = null)}
          >All</button
        >
        {#each store.settings.tags as t (t)}
          <button
            class="chip"
            type="button"
            aria-pressed={tag === t}
            onclick={() => (tag = tag === t ? null : t)}>{t}</button
          >
        {/each}
      </div>

      <div class="sort">
        <label for="sort">Sort</label>
        <select id="sort" bind:value={sort}>
          {#each recipeSorts as option (option.id)}
            <option value={option.id}>{option.label}</option>
          {/each}
        </select>
      </div>
    </div>

    {#if shown.length}
      <div class="grid">
        {#each shown as recipe (recipe.id)}
          <RecipeCard {recipe} />
        {/each}
      </div>
    {:else}
      <p class="none">No recipes match{query ? ` “${query}”` : ''}{tag ? ` in ${tag}` : ''}.</p>
    {/if}
  {/if}
</div>

{#if store.recipes.length}
  <button class="btn btn-primary fab" type="button" onclick={() => router.go('/recipes/new')}>
    <Plus size={22} /> Recipe
  </button>
{/if}

<style>
  .tools {
    display: grid;
    gap: 12px;
    margin-bottom: 18px;
  }

  .sort {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-top: -2px;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .sort select {
    border: 0;
    background: transparent;
    color: var(--text);
    font-weight: 650;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 22px 14px;
  }

  .none {
    margin: 40px 0;
    color: var(--muted);
    text-align: center;
  }
</style>
