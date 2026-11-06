<script lang="ts">
  import { ui, type ConfirmAnswer, type ConfirmRequest } from '../lib/ui.svelte';
  import Sheet from './Sheet.svelte';

  let open = $state(false);
  let request = $state<ConfirmRequest | null>(null);

  $effect(() => {
    if (ui.confirm) {
      request = ui.confirm;
      open = true;
    }
  });

  function answer(choice: ConfirmAnswer) {
    const current = ui.confirm;
    ui.confirm = null;
    open = false;
    current?.resolve(choice);
  }
</script>

<Sheet bind:open title={request?.title} onclose={() => ui.confirm && answer(null)}>
  {#if request?.message}
    <p class="message">{request.message}</p>
  {/if}
  {#snippet footer()}
    {#if request?.secondaryLabel}
      <div class="stacked">
        <button class="btn btn-primary" type="button" onclick={() => answer('secondary')}>
          {request.secondaryLabel}
        </button>
        <button
          class="btn {request.danger ? 'btn-danger' : 'btn-outline'}"
          type="button"
          onclick={() => answer('confirm')}
        >
          {request.confirmLabel}
        </button>
        <button class="btn" type="button" onclick={() => answer(null)}>Cancel</button>
      </div>
    {:else}
      <button class="btn" type="button" onclick={() => answer(null)}>Cancel</button>
      <button
        class="btn {request?.danger ? 'btn-danger' : 'btn-primary'}"
        type="button"
        onclick={() => answer('confirm')}
      >
        {request?.confirmLabel}
      </button>
    {/if}
  {/snippet}
</Sheet>

<style>
  .message {
    margin: 0 0 6px;
    color: var(--muted);
    line-height: 1.5;
    white-space: pre-line;
  }

  .stacked {
    display: grid;
    flex: 1;
    gap: 8px;
  }
</style>
