<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
  import FileDown from '@lucide/svelte/icons/file-down';
  import Link2Off from '@lucide/svelte/icons/link-2-off';
  import Pencil from '@lucide/svelte/icons/pencil';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import IngredientSheet from '../components/IngredientSheet.svelte';
  import PlanPickerSheet from '../components/PlanPickerSheet.svelte';
  import PortionFacts from '../components/PortionFacts.svelte';
  import RecipePdfSheet from '../components/RecipePdfSheet.svelte';
  import RecipePhoto from '../components/RecipePhoto.svelte';
  import Stepper from '../components/Stepper.svelte';
  import { withChoice, type IngredientRow, type Option } from '../lib/choices';
  import { displayParts, normalizeName, type ParsedLine } from '../lib/ingredients';
  import { lineStatus, missingPhrases, optionFacts, type LineStatus } from '../lib/lineStatus';
  import { formatMinutes } from '../lib/quantity';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';

  let { id }: { id: string } = $props();

  const recipe = $derived(store.recipeById.get(id));
  const rows = $derived(recipe ? store.rowsFor(recipe, recipe.choices) : []);
  let portions = $state(1);
  let planning = $state(false);
  let exporting = $state(false);
  let choosing = $state(false);
  let choiceRow = $state<IngredientRow | undefined>();

  function openChoice(row: IngredientRow) {
    choiceRow = row;
    choosing = true;
  }

  async function pick(option: Option) {
    const row = choiceRow;
    if (!recipe || !row) return;
    await store.setRecipeChoices(recipe.id, withChoice(rows, row, option.key));
    await store.learnPick(row, option);
  }

  /** From the "What's missing" sheet: an ingredient with no product. */
  function openLine(line: ParsedLine) {
    const row = rows.find(
      (r): r is IngredientRow => !r.heading && r.chosen.line.text === line.text,
    );
    if (row) openChoice(row);
  }

  interface LineInfo {
    status: LineStatus;
    /** Under the line: the product, if it isn't obvious, and what's missing. */
    sub: string;
    label: string;
  }

  function lineInfo(row: IngredientRow): LineInfo {
    const { product, line } = row.chosen;
    const facts = optionFacts(row.chosen, store.priced);
    const status = lineStatus(facts);
    const parts: string[] = [];
    const count = row.options.filter((o) => o.product).length;
    if (product && (count > 1 || normalizeName(product.name) !== normalizeName(line.name)))
      parts.push(product.name);
    if (row.options.length > 1) parts.push(`${row.options.length} options`);
    if (status === 'unlinked') parts.push('No product yet');
    if (status === 'incomplete' && facts) {
      const isPart = !!product && !!store.sources.get(product.id)?.length;
      parts.push(`needs ${missingPhrases(facts.missing, isPart).join(', ')}`);
    }
    const sub = parts.join(' · ');
    const label =
      status === 'unlinked'
        ? 'Not linked to a product'
        : status === 'incomplete'
          ? 'Product is missing information'
          : 'Linked';
    return { status, sub: sub && sub[0]!.toUpperCase() + sub.slice(1), label };
  }

  const infos = $derived(rows.map((r) => (r.heading ? undefined : lineInfo(r))));
  const needsWork = $derived(
    infos.some((i) => i?.status === 'unlinked' || i?.status === 'incomplete'),
  );

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
        <span class="hero-actions">
          <button
            class="icon-btn glass"
            type="button"
            aria-label="Make a PDF"
            onclick={() => (exporting = true)}
          >
            <FileDown size={20} />
          </button>
          <button
            class="icon-btn glass"
            type="button"
            aria-label="Edit recipe"
            onclick={() => router.go(`/recipes/${recipe.id}/edit`)}
          >
            <Pencil size={20} />
          </button>
        </span>
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

      <PortionFacts {recipe} onunlinked={openLine} />

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
        {#if rows.length}
          <ul class="ingredients">
            {#each rows as row, i (i)}
              {#if row.heading}
                <li class="group">{row.line.name}</li>
              {:else}
                {@const parts = displayParts(row.chosen.line, factor)}
                {@const info = infos[i]}
                <li>
                  <button class="line" type="button" onclick={() => openChoice(row)}>
                    <span class="line-main">
                      <span
                        >{parts.before}{#if parts.amount}<strong>{parts.amount}</strong
                          >{/if}{parts.after}</span
                      >
                      {#if info?.sub}<span class="line-sub">{info.sub}</span>{/if}
                    </span>
                    {#if info?.status === 'unlinked'}
                      <span class="status unlinked" role="img" aria-label={info.label}
                        ><Link2Off size={15} strokeWidth={2.4} /></span
                      >
                    {:else if info?.status === 'incomplete'}
                      <span class="status incomplete" role="img" aria-label={info.label}
                        ><TriangleAlert size={15} strokeWidth={2.4} /></span
                      >
                    {/if}
                  </button>
                </li>
              {/if}
            {/each}
          </ul>
          <p class="hint signs-key">
            {#if needsWork}
              <span class="key"
                ><span class="status unlinked small"><Link2Off size={11} strokeWidth={2.6} /></span>
                No product</span
              >
              <span class="key"
                ><span class="status incomplete small"
                  ><TriangleAlert size={11} strokeWidth={2.6} /></span
                > Product missing info</span
              >
              <span>Tap an ingredient to fix it.</span>
            {:else}
              Tap an ingredient to change its product.
            {/if}
          </p>
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
  <RecipePdfSheet bind:open={exporting} {recipe} {portions} />
  <IngredientSheet
    bind:open={choosing}
    row={choiceRow}
    {factor}
    portions={recipe.portions}
    onpick={pick}
  />
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

  .hero-actions {
    display: flex;
    gap: 8px;
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
    line-height: 1.4;
  }

  .ingredients .line {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 11px 0 11px 18px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .ingredients .line:active {
    background: var(--surface-2);
  }

  .line-main {
    flex: 1;
    min-width: 0;
  }

  .line-sub {
    display: block;
    margin-top: 2px;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .status {
    display: grid;
    place-items: center;
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
  }

  .status.unlinked {
    background: var(--tomato);
    color: #fff;
  }

  .status.incomplete {
    background: var(--mustard-soft);
    color: var(--mustard);
    box-shadow: inset 0 0 0 1.5px var(--mustard);
  }

  .status.small {
    display: inline-grid;
    width: 18px;
    height: 18px;
    vertical-align: -4px;
  }

  .signs-key {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 8px 4px 0;
  }

  .key {
    white-space: nowrap;
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
