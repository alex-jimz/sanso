<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Check from '@lucide/svelte/icons/check';
  import Download from '@lucide/svelte/icons/download';
  import Upload from '@lucide/svelte/icons/upload';
  import { getPhoto } from '../lib/db';
  import { blobToDataUrl, downloadFile } from '../lib/files';
  import { normalizeName } from '../lib/ingredients';
  import { resizePhoto } from '../lib/photos';
  import { parseRecipesFile, recipesFile, type ImportResult } from '../lib/recipeFormat';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import { showToast } from '../lib/ui.svelte';
  import { nowISO } from '../lib/util';

  let fileInput: HTMLInputElement;
  let exporting = $state(false);
  let importing = $state(false);
  let found = $state<ImportResult | null>(null);
  let chosen = $state<number[]>([]);

  const ownTitles = $derived(new Set(store.recipes.map((r) => normalizeName(r.title))));
  const isDuplicate = (title: string) => ownTitles.has(normalizeName(title));
  const linkedPhotos = $derived(
    found ? chosen.filter((i) => found!.recipes[i]!.linkedPhoto).length : 0,
  );

  function plural(n: number, one: string, many: string) {
    return `${n} ${n === 1 ? one : many}`;
  }

  async function exportAll() {
    exporting = true;
    try {
      const items = [];
      for (const recipe of store.recipes) {
        const blob = recipe.photoId ? await getPhoto(recipe.photoId) : undefined;
        items.push({ recipe, photo: blob ? await blobToDataUrl(blob) : undefined });
      }
      const file = new Blob([recipesFile(items)], { type: 'application/ld+json' });
      downloadFile(file, `sanso-recipes-${nowISO().slice(0, 10)}.json`);
      showToast(`Saved ${plural(items.length, 'recipe', 'recipes')} to your Downloads`);
    } catch (error) {
      console.error(error);
      showToast('Couldn’t export the recipes.');
    } finally {
      exporting = false;
    }
  }

  async function pick(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      found = parseRecipesFile(
        await file.text(),
        store.settings.tags,
        store.settings.defaultPortions,
      );
      // Recipes already in the book start unticked, so importing twice adds nothing.
      chosen = found.recipes.flatMap((r, i) => (isDuplicate(r.title) ? [] : [i]));
    } catch (error) {
      found = null;
      showToast(error instanceof Error ? error.message : 'Couldn’t read that file.');
    }
  }

  function toggle(i: number) {
    chosen = chosen.includes(i) ? chosen.filter((c) => c !== i) : [...chosen, i];
  }

  async function photoFrom(dataUrl: string | undefined): Promise<Blob | undefined> {
    if (!dataUrl) return undefined;
    try {
      return await resizePhoto(await (await fetch(dataUrl)).blob());
    } catch {
      return undefined;
    }
  }

  async function importChosen() {
    if (!found || !chosen.length) return;
    importing = true;
    try {
      const items = [];
      for (const i of [...chosen].sort((a, b) => a - b)) {
        const recipe = found.recipes[i]!;
        items.push({ recipe, photo: await photoFrom(recipe.photo) });
      }
      await store.addImportedRecipes(items, found.newTags);
      showToast(`Imported ${plural(items.length, 'recipe', 'recipes')}`);
      found = null;
      router.go('/recipes');
    } finally {
      importing = false;
    }
  }
</script>

<div class="page">
  <div class="top-bar">
    <button class="icon-btn" type="button" aria-label="Back" onclick={() => router.back('/more')}>
      <ArrowLeft size={22} />
    </button>
    <h1 class="top-bar-title">Recipe files</h1>
    <span class="spacer"></span>
  </div>

  {#if found}
    <h2 class="section-title">
      Found {plural(found.recipes.length, 'recipe', 'recipes')}
    </h2>
    <ul class="list">
      {#each found.recipes as recipe, i (i)}
        <li>
          <button
            class="row"
            type="button"
            aria-pressed={chosen.includes(i)}
            onclick={() => toggle(i)}
          >
            <span class="check" class:on={chosen.includes(i)}
              ><Check size={16} strokeWidth={3} /></span
            >
            <span class="row-main">
              <span class="row-title">{recipe.title}</span>
              <span class="row-sub">
                {[
                  plural(recipe.ingredients.length, 'ingredient', 'ingredients'),
                  recipe.photo ? 'photo' : '',
                  ...recipe.tags,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            {#if isDuplicate(recipe.title)}<span class="pill">Already in your book</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
    {#if linkedPhotos}
      <p class="hint note">
        {linkedPhotos === 1 ? 'One recipe links' : `${linkedPhotos} recipes link`} to a photo on a website.
        Sanso can’t download it, so add a photo yourself if you want one.
      </p>
    {/if}
    <div class="buttons">
      <button class="btn" type="button" onclick={() => (found = null)}>Cancel</button>
      <button
        class="btn btn-primary"
        type="button"
        disabled={!chosen.length || importing}
        onclick={importChosen}
      >
        {importing ? 'Importing…' : `Import ${plural(chosen.length, 'recipe', 'recipes')}`}
      </button>
    </div>
  {:else}
    <p class="intro">
      Recipe files use schema.org Recipe, the format recipe websites use to describe their recipes.
      Other recipe apps, such as Mealie, can import it.
    </p>

    <h2 class="section-title">Export</h2>
    <div class="card card-pad stack">
      <p class="hint">
        Saves all {plural(store.recipes.length, 'recipe', 'recipes')} with their photos as one file in
        your Downloads. Meal plans, products and lists aren’t included: for those, use Backup.
      </p>
      <button
        class="btn btn-outline"
        type="button"
        disabled={exporting || !store.recipes.length}
        onclick={exportAll}
      >
        <Download size={18} />
        {exporting ? 'Exporting…' : 'Export recipes'}
      </button>
    </div>

    <h2 class="section-title">Import</h2>
    <div class="card card-pad stack">
      <p class="hint">
        Pick a file exported from Sanso, a recipe saved from another app, or a recipe web page saved
        from Chrome. Imported recipes are added to your book; nothing is replaced.
      </p>
      <button class="btn btn-outline" type="button" onclick={() => fileInput.click()}>
        <Upload size={18} /> Choose a file
      </button>
    </div>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept=".json,.jsonld,.html,.htm,application/json,application/ld+json,text/html"
    hidden
    onchange={pick}
  />
</div>

<style>
  .spacer {
    width: 42px;
  }

  .intro {
    margin: 4px 4px 0;
    color: var(--muted);
    line-height: 1.5;
  }

  .note {
    margin: 12px 4px 0;
  }

  .buttons {
    display: flex;
    gap: 10px;
    margin-top: 18px;
  }

  .buttons .btn {
    flex: 1;
  }

  .row .pill {
    flex: none;
  }
</style>
