<script lang="ts">
  // Picks one of your products, or creates a new one from what was typed.
  import type { Product } from '../lib/types';
  import ProductSearch from './ProductSearch.svelte';
  import Sheet from './Sheet.svelte';

  let {
    open = $bindable(),
    title,
    hint,
    exclude = [],
    allowNew = false,
    onpick,
  }: {
    open: boolean;
    title: string;
    hint?: string;
    exclude?: string[];
    allowNew?: boolean;
    onpick: (product: Product) => void;
  } = $props();

  let query = $state('');

  $effect(() => {
    if (open) query = '';
  });

  function pick(product: Product) {
    open = false;
    onpick(product);
  }
</script>

<Sheet bind:open {title}>
  <div class="stack">
    {#if hint}<p class="hint">{hint}</p>{/if}
    <ProductSearch bind:query {exclude} {allowNew} onpick={pick} />
  </div>
</Sheet>
