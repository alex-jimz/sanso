<script module lang="ts">
  let openSheets = 0;
</script>

<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import type { Snippet } from 'svelte';
  import { onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { forgetSheet, popSheet, pushSheet, reducedMotion } from '../lib/ui.svelte';

  interface Props {
    open: boolean;
    title?: string;
    /** Runs whenever the sheet closes, however it was closed. */
    onclose?: () => void;
    children: Snippet;
    footer?: Snippet;
  }

  let { open = $bindable(), title, onclose, children, footer }: Props = $props();

  let entry: ReturnType<typeof pushSheet> | null = null;
  const duration = reducedMotion.matches ? 0 : 260;

  function lockScroll(lock: boolean) {
    openSheets = Math.max(0, openSheets + (lock ? 1 : -1));
    document.documentElement.style.overflow = openSheets ? 'hidden' : '';
  }

  $effect(() => {
    if (open && !entry) {
      lockScroll(true);
      entry = pushSheet(() => {
        entry = null;
        lockScroll(false);
        open = false;
        onclose?.();
      });
    } else if (!open && entry) {
      const current = entry;
      entry = null;
      lockScroll(false);
      popSheet(current);
      onclose?.();
    }
  });

  onDestroy(() => {
    if (entry) {
      forgetSheet(entry);
      lockScroll(false);
    }
  });

  function close() {
    open = false;
  }
</script>

{#if open}
  <div class="backdrop" transition:fade={{ duration }} onclick={close} aria-hidden="true"></div>
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    transition:fly={{ y: 520, duration, opacity: 1 }}
  >
    <div class="handle" aria-hidden="true"></div>
    {#if title}
      <header>
        <h2>{title}</h2>
        <button class="icon-btn" type="button" aria-label="Close" onclick={close}>
          <X size={22} />
        </button>
      </header>
    {/if}
    <div class="body">{@render children()}</div>
    {#if footer}
      <footer>{@render footer()}</footer>
    {/if}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgb(30 24 18 / 0.4);
  }

  .sheet {
    position: fixed;
    inset: auto 0 0;
    z-index: 41;
    display: flex;
    flex-direction: column;
    max-width: 640px;
    max-height: min(90dvh, 860px);
    margin: 0 auto;
    padding-bottom: var(--safe-bottom);
    border-radius: 26px 26px 0 0;
    background: var(--bg);
    box-shadow: var(--shadow-lg);
  }

  .handle {
    flex: none;
    width: 40px;
    height: 5px;
    margin: 8px auto 2px;
    border-radius: 99px;
    background: var(--surface-3);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 10px 4px 20px;
  }

  h2 {
    margin: 0;
    font-size: 1.3125rem;
  }

  .body {
    padding: 6px 20px 20px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  footer {
    display: flex;
    gap: 10px;
    padding: 12px 20px 14px;
    border-top: 1px solid var(--line);
  }

  footer :global(.btn) {
    flex: 1;
  }
</style>
