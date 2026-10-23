<script lang="ts">
  import Camera from '@lucide/svelte/icons/camera';
  import Check from '@lucide/svelte/icons/check';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';
  import { onDestroy, untrack } from 'svelte';
  import RecipePhoto from '../components/RecipePhoto.svelte';
  import ScorePicker from '../components/ScorePicker.svelte';
  import Stepper from '../components/Stepper.svelte';
  import { normalizeName, parseIngredients } from '../lib/ingredients';
  import { resizePhoto } from '../lib/photos';
  import { formatAmount, formatNumber } from '../lib/quantity';
  import { parseSteps } from '../lib/recipes';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import type { Recipe } from '../lib/types';
  import { askConfirm, showToast } from '../lib/ui.svelte';
  import { newId, nowISO, parseDecimal } from '../lib/util';

  let { id }: { id?: string } = $props();

  // App.svelte re-creates this page for each route, so reading the id once is enough.
  const recipeId = untrack(() => id);
  const existing = recipeId ? store.recipeById.get(recipeId) : undefined;
  const base: Recipe = existing
    ? $state.snapshot(existing)
    : {
        id: newId(),
        title: '',
        tags: [],
        portions: 2,
        ingredients: [],
        steps: [],
        notes: '',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };

  let title = $state(base.title);
  let tags = $state([...base.tags]);
  let portions = $state(base.portions);
  let prep = $state(base.prepMinutes?.toString() ?? '');
  let total = $state(base.totalMinutes?.toString() ?? '');
  let score = $state(base.score);
  let ingredientsText = $state(base.ingredients.join('\n'));
  let stepsText = $state(base.steps.join('\n'));
  let notes = $state(base.notes);

  let photo = $state<Blob | null | undefined>(undefined);
  let preview = $state<string | undefined>();
  let processing = $state(false);
  let saving = $state(false);
  let newTag = $state('');
  let addingTag = $state(false);
  let fileInput: HTMLInputElement;

  const parsed = $derived(parseIngredients(ingredientsText.split('\n')));
  const hasPhoto = $derived(photo ? true : photo === null ? false : !!base.photoId);

  const dirty = $derived(
    title !== base.title ||
      tags.join('|') !== base.tags.join('|') ||
      portions !== base.portions ||
      prep !== (base.prepMinutes?.toString() ?? '') ||
      total !== (base.totalMinutes?.toString() ?? '') ||
      score !== base.score ||
      ingredientsText !== base.ingredients.join('\n') ||
      stepsText !== base.steps.join('\n') ||
      notes !== base.notes ||
      photo !== undefined,
  );

  onDestroy(() => {
    if (preview) URL.revokeObjectURL(preview);
  });

  async function choosePhoto(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    processing = true;
    try {
      const blob = await resizePhoto(file);
      if (preview) URL.revokeObjectURL(preview);
      photo = blob;
      preview = URL.createObjectURL(blob);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Couldn’t read that photo.');
    } finally {
      processing = false;
      fileInput.value = '';
    }
  }

  function removePhoto() {
    if (preview) URL.revokeObjectURL(preview);
    preview = undefined;
    photo = null;
  }

  function toggleTag(tag: string) {
    tags = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
  }

  async function addTag() {
    const tag = newTag.trim();
    addingTag = false;
    newTag = '';
    if (!tag) return;
    const known = store.settings.tags.find((t) => t.toLowerCase() === tag.toLowerCase());
    if (!known) await store.updateSettings({ tags: [...store.settings.tags, tag] });
    const name = known ?? tag;
    if (!tags.includes(name)) tags = [...tags, name];
  }

  function minutes(text: string): number | undefined {
    const value = parseDecimal(text);
    return value && value > 0 ? Math.round(value) : undefined;
  }

  async function save() {
    if (!title.trim()) {
      showToast('Give the recipe a name first.');
      return;
    }
    saving = true;
    const recipe: Recipe = {
      ...base,
      title: title.trim(),
      tags,
      portions,
      prepMinutes: minutes(prep),
      totalMinutes: minutes(total),
      score,
      ingredients: ingredientsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      steps: parseSteps(stepsText),
      notes: notes.trim(),
    };
    await store.saveRecipe(recipe, photo);
    saving = false;
    if (existing) router.back(`/recipes/${recipe.id}`);
    else router.go(`/recipes/${recipe.id}`, { replace: true });
  }

  async function cancel() {
    if (dirty) {
      const ok = await askConfirm({
        title: 'Discard changes?',
        message: 'Your changes to this recipe won’t be saved.',
        confirmLabel: 'Discard',
        danger: true,
      });
      if (!ok) return;
    }
    router.back(existing ? `/recipes/${base.id}` : '/recipes');
  }

  async function remove() {
    const planned = store.meals.filter(
      (m) => m.recipeId === base.id && m.state !== 'cooked',
    ).length;
    const ok = await askConfirm({
      title: `Delete ${base.title || 'this recipe'}?`,
      message: planned
        ? `It’s planned for ${planned === 1 ? '1 meal' : `${planned} meals`}, which will be removed from the plan.`
        : 'This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await store.deleteRecipe(base.id);
    showToast('Recipe deleted');
    router.go('/recipes', { replace: true });
  }

  function describe(line: (typeof parsed)[number]): string {
    if (line.quantity === undefined) return '';
    return line.unit ? formatAmount(line.quantity, line.unit) : formatNumber(line.quantity);
  }
</script>

<div class="page">
  <div class="top-bar">
    <button class="icon-btn" type="button" aria-label="Cancel" onclick={cancel}
      ><X size={22} /></button
    >
    <h1 class="top-bar-title">{existing ? 'Edit recipe' : 'New recipe'}</h1>
    <button
      class="btn btn-primary btn-small"
      type="button"
      disabled={saving || processing}
      onclick={save}
    >
      <Check size={18} /> Save
    </button>
  </div>

  <form class="stack" onsubmit={(e) => (e.preventDefault(), save())}>
    <div class="photo-field">
      <button
        class="photo"
        type="button"
        onclick={() => fileInput.click()}
        aria-label="Choose a photo"
      >
        {#if preview}
          <img src={preview} alt="" />
        {:else if hasPhoto}
          <RecipePhoto photoId={base.photoId} {title} />
        {:else}
          <span class="photo-empty">
            <Camera size={30} strokeWidth={1.7} />
            {processing ? 'Reading photo…' : 'Add a photo'}
          </span>
        {/if}
      </button>
      {#if hasPhoto}
        <div class="photo-actions">
          <button class="btn btn-outline btn-small" type="button" onclick={() => fileInput.click()}
            >Change</button
          >
          <button class="btn btn-danger btn-small" type="button" onclick={removePhoto}
            >Remove</button
          >
        </div>
      {/if}
      <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={choosePhoto} />
    </div>

    <label class="field">
      <span class="field-label">Name</span>
      <input
        class="input title-input"
        bind:value={title}
        placeholder="Chicken curry"
        autocomplete="off"
      />
    </label>

    <div class="field">
      <span class="field-label">Tags</span>
      <div class="chips wrap">
        {#each store.settings.tags as tag (tag)}
          <button
            class="chip"
            type="button"
            aria-pressed={tags.includes(tag)}
            onclick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        {/each}
        {#if addingTag}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="input tag-input"
            bind:value={newTag}
            placeholder="New tag"
            autofocus
            onblur={addTag}
            onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
          />
        {:else}
          <button class="chip add" type="button" onclick={() => (addingTag = true)}
            ><Plus size={16} /> Tag</button
          >
        {/if}
      </div>
    </div>

    <div class="card card-pad grid-fields">
      <div class="inline-field">
        <div>
          <span class="field-label">Portions</span>
          <p class="hint">What the amounts below make</p>
        </div>
        <Stepper bind:value={portions} label="Portions" />
      </div>
      <div class="input-row">
        <label class="field">
          <span class="field-label">Preparation</span>
          <span class="with-unit">
            <input class="input" inputmode="numeric" bind:value={prep} placeholder="20" />
            <span>min</span>
          </span>
        </label>
        <label class="field">
          <span class="field-label">Total time</span>
          <span class="with-unit">
            <input class="input" inputmode="numeric" bind:value={total} placeholder="45" />
            <span>min</span>
          </span>
        </label>
      </div>
      <p class="hint">Total time includes waiting, like marinating, proving or baking.</p>
      <div class="field">
        <span class="field-label">Score</span>
        <ScorePicker bind:value={score} />
      </div>
    </div>

    <label class="field">
      <span class="field-label">Ingredients</span>
      <textarea
        class="textarea"
        bind:value={ingredientsText}
        rows="7"
        placeholder={'600 g chicken breast\n3 garlic cloves\n1 onion, chopped\nFor the sauce:\n400 ml coconut milk\nsalt'}
      ></textarea>
      <span class="hint"
        >One per line, the way you’d say it. A line ending in “:” starts a group.</span
      >
    </label>

    {#if parsed.some((l) => !l.heading)}
      <div class="preview">
        <p class="eyebrow">Reads as</p>
        <ul>
          {#each parsed as line, i (i)}
            {#if line.heading}
              <li class="group">{line.name}</li>
            {:else}
              {@const product = store.match(normalizeName(line.name))}
              <li>
                <span class="amount" class:none={line.quantity === undefined}
                  >{describe(line) || 'no amount'}</span
                >
                <span class="name">{line.name}</span>
                {#if product}<span class="product">· {product.name}</span>{/if}
              </li>
            {/if}
          {/each}
        </ul>
        <p class="hint">
          Weighed amounts (g, kg, ml, l) go straight on the shopping list. Others, like cloves or
          spoons, go under “Check what you have”.
        </p>
      </div>
    {/if}

    <label class="field">
      <span class="field-label">Steps</span>
      <textarea
        class="textarea"
        bind:value={stepsText}
        rows="6"
        placeholder={'Brown the chicken in a hot pan.\nAdd the onion and garlic and cook for 5 minutes.'}
      ></textarea>
      <span class="hint">One step per line.</span>
    </label>

    <label class="field">
      <span class="field-label">Notes</span>
      <textarea
        class="textarea notes"
        bind:value={notes}
        rows="3"
        placeholder="Tips, swaps, where it came from"></textarea>
    </label>

    {#if existing}
      <button class="btn btn-danger" type="button" onclick={remove}
        ><Trash2 size={18} /> Delete recipe</button
      >
    {/if}
  </form>
</div>

<style>
  form {
    padding-top: 6px;
  }

  .photo-field {
    display: grid;
    gap: 10px;
  }

  .photo {
    position: relative;
    display: grid;
    place-items: center;
    height: 210px;
    padding: 0;
    overflow: hidden;
    border: 1.5px dashed var(--surface-3);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
    color: var(--muted);
  }

  .photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .photo-empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    font-weight: 650;
  }

  .photo-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .title-input {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
  }

  .chip.add {
    border-style: dashed;
    color: var(--accent);
  }

  .tag-input {
    width: 9rem;
    height: 36px;
    padding: 0 14px;
    border-radius: 999px;
  }

  .grid-fields {
    display: grid;
    gap: 16px;
  }

  .inline-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .with-unit {
    position: relative;
    display: block;
  }

  .with-unit span {
    position: absolute;
    right: 14px;
    top: 50%;
    translate: 0 -50%;
    color: var(--faint);
    pointer-events: none;
  }

  .preview {
    padding: 14px 16px;
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .preview ul {
    display: grid;
    gap: 6px;
    margin: 10px 0 12px;
    padding: 0;
    list-style: none;
    font-size: 0.875rem;
  }

  .preview li {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .preview .group {
    margin-top: 6px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .amount {
    flex: none;
    min-width: 4.5rem;
    font-weight: 700;
  }

  .amount.none {
    color: var(--faint);
    font-weight: 500;
  }

  .product {
    color: var(--accent);
  }

  .notes {
    min-height: 5rem;
  }
</style>
