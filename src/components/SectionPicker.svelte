<script lang="ts">
  import { store } from '../lib/store.svelte';

  let { value, onpick }: { value?: string; onpick: (sectionId: string) => void } = $props();
</script>

<div class="sections" role="radiogroup" aria-label="Shop section">
  {#each store.orderedSections as section (section.id)}
    <button
      type="button"
      role="radio"
      aria-checked={value === section.id}
      class="chip zone-{section.zone}"
      onclick={() => onpick(section.id)}
    >
      <span class="dot"></span>{section.name}
    </button>
  {/each}
</div>

<style>
  .sections {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--zone);
  }

  .zone-ambient {
    --zone: #c9a26b;
  }

  .zone-fridge {
    --zone: var(--sky);
  }

  .zone-freezer {
    --zone: var(--frost);
  }

  .chip[aria-checked='true'] {
    border-color: var(--text);
    background: var(--text);
    color: var(--bg);
  }

  .chip[aria-checked='true'] .dot {
    background: var(--bg);
  }
</style>
