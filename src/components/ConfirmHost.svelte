<script lang="ts">
  import { ui, type ConfirmRequest } from '../lib/ui.svelte';
  import Sheet from './Sheet.svelte';

  let open = $state(false);
  let request = $state<ConfirmRequest | null>(null);

  $effect(() => {
    if (ui.confirm) {
      request = ui.confirm;
      open = true;
    }
  });

  function answer(ok: boolean) {
    const current = ui.confirm;
    ui.confirm = null;
    open = false;
    current?.resolve(ok);
  }
</script>

<Sheet bind:open title={request?.title} onclose={() => ui.confirm && answer(false)}>
  {#if request?.message}
    <p class="message">{request.message}</p>
  {/if}
  {#snippet footer()}
    <button class="btn" type="button" onclick={() => answer(false)}>Cancel</button>
    <button
      class="btn {request?.danger ? 'btn-danger' : 'btn-primary'}"
      type="button"
      onclick={() => answer(true)}
    >
      {request?.confirmLabel}
    </button>
  {/snippet}
</Sheet>

<style>
  .message {
    margin: 0 0 6px;
    color: var(--muted);
    line-height: 1.5;
  }
</style>
