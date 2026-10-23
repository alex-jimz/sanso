<script lang="ts">
  import Clock from '@lucide/svelte/icons/clock';
  import { formatMinutes } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import type { Recipe } from '../lib/types';
  import RecipePhoto from './RecipePhoto.svelte';

  let { recipe }: { recipe: Recipe } = $props();

  const time = $derived(recipe.totalMinutes ?? recipe.prepMinutes);

  function open(event: MouseEvent) {
    event.preventDefault();
    router.go(`/recipes/${recipe.id}`);
  }
</script>

<a class="recipe" href={`#/recipes/${recipe.id}`} onclick={open}>
  <div class="media">
    <RecipePhoto photoId={recipe.photoId} title={recipe.title} iconSize={34} />
    {#if recipe.score !== undefined}
      <span class="score">{recipe.score}<small>/10</small></span>
    {/if}
  </div>
  <h3>{recipe.title}</h3>
  {#if time}
    <p class="meta"><Clock size={13} strokeWidth={2.2} /> {formatMinutes(time)}</p>
  {/if}
</a>

<style>
  .recipe {
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }

  .recipe:active .media {
    transform: scale(0.98);
  }

  .media {
    position: relative;
    aspect-ratio: 4 / 3.4;
    overflow: hidden;
    border-radius: 18px;
    box-shadow: var(--shadow-sm);
    transition: transform 0.15s ease;
  }

  .score {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.92);
    color: var(--text);
    font-size: 0.8125rem;
    font-weight: 750;
    box-shadow: var(--shadow-sm);
  }

  .score small {
    color: var(--muted);
    font-size: 0.6875rem;
    font-weight: 650;
  }

  h3 {
    display: -webkit-box;
    margin: 9px 2px 0;
    overflow: hidden;
    font-size: 1.0625rem;
    line-height: 1.2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 4px 2px 0;
    color: var(--muted);
    font-size: 0.8125rem;
  }
</style>
