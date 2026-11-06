<script lang="ts">
  // Makes a PDF of a recipe and offers to share it or save it to Downloads.
  import Download from '@lucide/svelte/icons/download';
  import FileText from '@lucide/svelte/icons/file-text';
  import Share2 from '@lucide/svelte/icons/share-2';
  import { getPhoto } from '../lib/db';
  import { downloadFile } from '../lib/files';
  import { store } from '../lib/store.svelte';
  import type { Recipe } from '../lib/types';
  import { showToast } from '../lib/ui.svelte';
  import Sheet from './Sheet.svelte';

  let {
    open = $bindable(),
    recipe,
    portions,
  }: { open: boolean; recipe: Recipe; portions: number } = $props();

  let file = $state<File | undefined>();
  let making = $state(false);
  let failed = $state(false);

  const canShare = $derived(
    !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }),
  );

  $effect(() => {
    if (!open) return;
    void make(recipe, portions);
  });

  async function make(target: Recipe, count: number) {
    file = undefined;
    failed = false;
    making = true;
    try {
      const [{ recipePdf, pdfFileName }, photo] = await Promise.all([
        import('../lib/recipePdf'),
        target.photoId ? getPhoto(target.photoId) : Promise.resolve(undefined),
      ]);
      const date = new Date().toLocaleDateString('en-IE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const blob = await recipePdf({
        recipe: $state.snapshot(target) as Recipe,
        portions: count,
        facts: store.factsFor(target),
        photo,
        date,
      });
      file = new File([blob], pdfFileName(target.title), { type: 'application/pdf' });
    } catch (error) {
      console.error(error);
      failed = true;
    } finally {
      making = false;
    }
  }

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: recipe.title });
    } catch (error) {
      // Closing the share menu isn't an error.
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        showToast('Couldn’t share the PDF.');
    }
  }

  function save() {
    if (!file) return;
    downloadFile(file, file.name);
    showToast('Saved to Downloads');
  }
</script>

<Sheet bind:open title="Recipe PDF">
  <div class="stack">
    <div class="file">
      <span class="file-icon"><FileText size={26} strokeWidth={1.7} /></span>
      <span class="file-text">
        <span class="row-title">{file?.name ?? `${recipe.title}.pdf`}</span>
        <span class="row-sub">
          {#if making}
            Making the PDF…
          {:else if failed}
            Couldn’t make the PDF. Please try again.
          {:else if file}
            For {portions === 1 ? '1 portion' : `${portions} portions`} · {Math.max(
              1,
              Math.round(file.size / 1024),
            )} KB
          {/if}
        </span>
      </span>
    </div>
    <p class="hint">
      Photo, ingredients and steps, with calories, macros and cost per portion. Change the portions
      on the recipe page first to scale the ingredients.
    </p>
  </div>
  {#snippet footer()}
    {#if failed}
      <button class="btn btn-primary" type="button" onclick={() => make(recipe, portions)}
        >Try again</button
      >
    {:else}
      <button class="btn" type="button" disabled={!file} onclick={save}>
        <Download size={18} /> Save
      </button>
      {#if canShare || !file}
        <button class="btn btn-primary" type="button" disabled={!file} onclick={share}>
          <Share2 size={18} /> Share
        </button>
      {/if}
    {/if}
  {/snippet}
</Sheet>

<style>
  .file {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .file-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--tomato-soft);
    color: var(--tomato);
  }

  .file-text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .file-text .row-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint {
    margin: 0;
  }
</style>
