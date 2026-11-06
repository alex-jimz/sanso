<script lang="ts">
  // A product's photo from Aldi's image server. Chrome keeps it in its normal
  // cache, so it may be missing offline; the row works without it.
  let { url, size = 44 }: { url: string | undefined; size?: number } = $props();
  let failed = $state(false);
</script>

{#if url && !failed}
  <img
    class="product-photo"
    src={url}
    alt=""
    width={size}
    height={size}
    loading="lazy"
    referrerpolicy="no-referrer"
    onerror={() => (failed = true)}
    style:--size={`${size}px`}
  />
{/if}

<style>
  .product-photo {
    flex: none;
    width: var(--size);
    height: var(--size);
    border-radius: 10px;
    background: #fff;
    object-fit: contain;
  }
</style>
