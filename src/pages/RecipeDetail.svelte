<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import PlanPickerSheet from '../components/PlanPickerSheet.svelte';
  import RecipePhoto from '../components/RecipePhoto.svelte';
  import Stepper from '../components/Stepper.svelte';
  import { displayParts, parseIngredients } from '../lib/ingredients';
  import { formatMinutes } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';

  let { id }: { id: string } = $props();

  const recipe = $derived(store.recipeById.get(id));
  const lines = $derived(recipe ? parseIngredients(recipe.ingredients) : []);
  let portions = $state(1);
  let planning = $state(false);

  $effect(() => {
    if (recipe) portions = recipe.portions;
  });

  const factor = $derived(recipe ? portions / recipe.portions : 1);
</script>

{#if !recipe}
  <div class="page">
    <div class="top-bar">
      <button
        class="icon-btn"
        type="button"
        aria-label="Back"
        onclick={() => router.back('/recipes')}
      >
        <ArrowLeft size={22} />
      </button>
    </div>
    <div class="empty">
      <h2>Recipe not found</h2>
      <p>It may have been deleted.</p>
    </div>
  </div>
{:else}
  <article>
    <div class="hero">
      <RecipePhoto photoId={recipe.photoId} title={recipe.title} iconSize={64} />
      <div class="hero-bar">
        <button
          class="icon-btn glass"
          type="button"
          aria-label="Back"
          onclick={() => router.back('/recipes')}
        >
          <ArrowLeft size={22} />
        </button>
        <button
          class="icon-btn glass"
          type="button"
          aria-label="Edit recipe"
          onclick={() => router.go(`/recipes/${recipe.id}/edit`)}
        >
          <Pencil size={20} />
        </button>
      </div>
    </div>

    <div class="content page">
      <h1>{recipe.title}</h1>
      {#if recipe.tags.length}
        <div class="tags">
          {#each recipe.tags as tag (tag)}<span class="pill">{tag}</span>{/each}
        </div>
      {/if}

      {#if recipe.prepMinutes || recipe.totalMinutes || recipe.score !== undefined}
        <dl class="stats card">
          {#if recipe.prepMinutes}
            <div>
              <dt>Prep</dt>
              <dd>{formatMinutes(recipe.prepMinutes)}</dd>
            </div>
          {/if}
          {#if recipe.totalMinutes}
            <div>
              <dt>Total</dt>
              <dd>{formatMinutes(recipe.totalMinutes)}</dd>
            </div>
          {/if}
          {#if recipe.score !== undefined}
            <div>
              <dt>Score</dt>
              <dd>{recipe.score}<small> / 10</small></dd>
            </div>
          {/if}
        </dl>
      {/if}

      <section>
        <div class="section-head">
          <div>
            <h2 class="section-title">Ingredients</h2>
            <p class="hint">
              {portions === 1 ? '1 portion' : `${portions} portions`}{factor !== 1
                ? ` · written for ${recipe.portions}`
                : ''}
            </p>
          </div>
          <Stepper bind:value={portions} label="Portions" />
        </div>
        {#if lines.length}
          <ul class="ingredients">
            {#each lines as line, i (i)}
              {#if line.heading}
                <li class="group">{line.name}</li>
              {:else}
                {@const parts = displayParts(line, factor)}
                <li>
                  {parts.before}{#if parts.amount}<strong>{parts.amount}</strong>{/if}{parts.after}
                </li>
              {/if}
            {/each}
          </ul>
        {:else}
          <p class="hint">No ingredients yet.</p>
        {/if}
      </section>

      {#if recipe.steps.length}
        <section>
          <h2 class="section-title">Steps</h2>
          <ol class="steps">
            {#each recipe.steps as step, i (i)}
              <li>
                <span class="num">{i + 1}</span>
                <p>{step}</p>
              </li>
            {/each}
          </ol>
        </section>
      {/if}

      {#if recipe.notes.trim()}
        <section>
          <h2 class="section-title">Notes</h2>
          <div class="notes">{recipe.notes}</div>
        </section>
      {/if}
    </div>
  </article>

  <div class="action-bar">
    <button class="btn btn-primary" type="button" onclick={() => (planning = true)}>
      <CalendarPlus size={20} /> Add to plan
    </button>
  </div>

  <PlanPickerSheet bind:open={planning} {recipe} />
{/if}

<style>
  .hero {
    position: relative;
    height: min(46vh, 420px);
    max-width: 640px;
    margin: 0 auto;
  }

  .hero-bar {
    position: absolute;
    inset: calc(10px + var(--safe-top)) 12px auto;
    display: flex;
    justify-content: space-between;
  }

  .content {
    position: relative;
    margin-top: -28px;
    padding-top: 24px;
    border-radius: 28px 28px 0 0;
    background: var(--bg);
  }

  h1 {
    margin: 0;
    font-size: 2rem;
    letter-spacing: -0.025em;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }

  .stats {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    margin: 20px 0 0;
    padding: 14px 4px;
  }

  .stats div {
    display: grid;
    justify-items: center;
    gap: 2px;
  }

  .stats div + div {
    border-left: 1px solid var(--line);
  }

  dt {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.1875rem;
    font-weight: 600;
  }

  dd small {
    color: var(--muted);
    font-size: 0.875rem;
  }

  .section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin: 30px 0 12px;
  }

  .section-head .section-title {
    margin: 0 0 2px;
  }

  .ingredients {
    margin: 0;
    padding: 4px 16px;
    list-style: none;
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .ingredients li {
    position: relative;
    padding: 11px 0 11px 18px;
    line-height: 1.4;
  }

  .ingredients li + li {
    border-top: 1px solid var(--line);
  }

  .ingredients li:not(.group)::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 1.15em;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    opacity: 0.55;
  }

  .ingredients .group {
    padding: 14px 0 6px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 750;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  strong {
    font-weight: 750;
  }

  .steps {
    display: grid;
    gap: 18px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .steps li {
    display: flex;
    gap: 14px;
  }

  .num {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 750;
    font-size: 0.875rem;
  }

  .steps p {
    margin: 4px 0 0;
    line-height: 1.6;
  }

  .notes {
    padding: 14px 16px;
    border-radius: var(--radius);
    background: var(--mustard-soft);
    color: #5a4316;
    line-height: 1.55;
    white-space: pre-line;
  }
</style>
