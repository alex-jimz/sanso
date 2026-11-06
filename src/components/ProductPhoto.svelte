<script lang="ts">
  // A product's photo: one stored on the phone (`photoId`), or one on Aldi's
  // image server (`url`). Chrome keeps Aldi's in its normal cache, so it may be
  // missing offline; the row works without it.
  import { photoUrl } from '../lib/photos';

  let {
    url,
    photoId,
    src,
    size = 44,
  }: {
    url?: string | undefined;
    photoId?: string | undefined;
    /** A ready display URL, e.g. for a photo not saved yet. Wins over the others. */
    src?: string | undefined;
    size?: number;
  } = $props();

  let stored = $state<string | undefined>();
  let failed = $state(false);

  $effect(() => {
    const id = photoId;
    stored = undefined;
    if (!id) return;
    let current = true;
    void photoUrl(id).then((value) => {
      if (current) stored = value;
    });
    return () => {
      current = false;
    };
  });

  $effect(() => {
    void url;
    failed = false;
  });

  const shown = $derived(src ?? stored ?? (photoId ? undefined : failed ? undefined : url));
</script>

{#if shown}
  <img
    class="product-photo"
    class:own={!!(src ?? stored)}
    src={shown}
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

  /* Photos from the web are usually not on a white background. */
  .product-photo.own {
    object-fit: cover;
  }
</style>
