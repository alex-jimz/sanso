<script lang="ts">
  let { value = $bindable() }: { value: number | undefined } = $props();

  const scores = Array.from({ length: 10 }, (_, i) => i + 1);
</script>

<div class="scores" role="radiogroup" aria-label="Score out of 10">
  {#each scores as score (score)}
    <button
      type="button"
      role="radio"
      aria-checked={value === score}
      class:filled={value !== undefined && score <= value}
      onclick={() => (value = value === score ? undefined : score)}
    >
      {score}
    </button>
  {/each}
</div>
<p class="hint">
  {value === undefined ? 'Not rated yet.' : `${value} out of 10. Tap it again to clear.`}
</p>

<style>
  .scores {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 4px;
  }

  button {
    aspect-ratio: 1;
    max-height: 40px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 700;
    transition:
      background-color 0.12s ease,
      color 0.12s ease;
  }

  button.filled {
    border-color: transparent;
    background: var(--mustard-soft);
    color: var(--mustard);
  }

  button[aria-checked='true'] {
    background: var(--mustard);
    color: #fff;
  }

  .hint {
    margin-top: 6px;
  }
</style>
