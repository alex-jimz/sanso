<script lang="ts">
  import Minus from '@lucide/svelte/icons/minus';
  import Plus from '@lucide/svelte/icons/plus';

  interface Props {
    value: number;
    min?: number;
    max?: number;
    label: string;
    onchange?: (value: number) => void;
  }

  let { value = $bindable(), min = 1, max = 50, label, onchange }: Props = $props();

  function set(next: number) {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped === value) return;
    value = clamped;
    onchange?.(clamped);
  }
</script>

<div class="stepper" role="group" aria-label={label}>
  <button
    type="button"
    class="icon-btn"
    aria-label={`Decrease ${label.toLowerCase()}`}
    disabled={value <= min}
    onclick={() => set(value - 1)}
  >
    <Minus size={18} />
  </button>
  <output aria-live="polite">{value}</output>
  <button
    type="button"
    class="icon-btn"
    aria-label={`Increase ${label.toLowerCase()}`}
    disabled={value >= max}
    onclick={() => set(value + 1)}
  >
    <Plus size={18} />
  </button>
</div>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--surface-2);
  }

  .icon-btn {
    width: 38px;
    height: 38px;
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .icon-btn:disabled {
    opacity: 0.4;
  }

  output {
    min-width: 34px;
    font-size: 1.0625rem;
    font-weight: 700;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
</style>
