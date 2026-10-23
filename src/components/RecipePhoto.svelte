<script lang="ts">
  import Utensils from '@lucide/svelte/icons/utensils';
  import { photoUrl } from '../lib/photos';

  interface Props {
    photoId?: string;
    /** Picks the placeholder colour, so each recipe keeps its own. */
    title?: string;
    iconSize?: number;
  }

  let { photoId, title = '', iconSize = 30 }: Props = $props();

  let src = $state<string | undefined>();
  let loaded = $state(false);

  $effect(() => {
    const id = photoId;
    src = undefined;
    loaded = false;
    if (!id) return;
    void photoUrl(id).then((url) => {
      if (photoId === id) src = url;
    });
  });

  const palette = [
    ['#f4e1cf', '#ad6a3b'],
    ['#e2ead4', '#5b7639'],
    ['#f5e7c1', '#94700f'],
    ['#dfe8f0', '#476b8a'],
    ['#efdfe7', '#8a4a67'],
    ['#e5dff0', '#5f528a'],
  ];

  function hash(text: string): number {
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  const colors = $derived(palette[hash(title) % palette.length]!);
</script>

<div class="photo" style:--tile={colors[0]} style:--ink={colors[1]}>
  {#if src}
    <img {src} alt="" class:loaded decoding="async" onload={() => (loaded = true)} />
  {:else}
    <Utensils size={iconSize} strokeWidth={1.6} />
  {/if}
</div>

<style>
  .photo {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--tile);
    color: var(--ink);
  }

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.25s ease;
  }

  img.loaded {
    opacity: 1;
  }
</style>
