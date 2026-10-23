<script lang="ts">
  import { fly } from 'svelte/transition';
  import { hideToast, reducedMotion, ui } from '../lib/ui.svelte';

  const duration = reducedMotion.matches ? 0 : 200;

  function act() {
    ui.toast?.action?.run();
    hideToast();
  }
</script>

{#if ui.toast}
  {#key ui.toast.id}
    <div class="toast" role="status" transition:fly={{ y: 24, duration }}>
      <span>{ui.toast.message}</span>
      {#if ui.toast.action}
        <button type="button" onclick={act}>{ui.toast.action.label}</button>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 14px);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 14px;
    width: max-content;
    max-width: min(92vw, 560px);
    padding: 12px 12px 12px 18px;
    border-radius: 16px;
    background: var(--text);
    color: var(--bg);
    box-shadow: var(--shadow-lg);
    font-size: 0.9375rem;
    translate: -50% 0;
  }

  span {
    flex: 1;
  }

  button {
    padding: 6px 10px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: #a9d8c6;
    font-weight: 700;
  }
</style>
