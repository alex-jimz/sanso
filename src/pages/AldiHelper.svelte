<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Copy from '@lucide/svelte/icons/copy';
  import { helperBookmark } from '../lib/aldiHelper';
  import { router } from '../lib/router.svelte';
  import { showToast } from '../lib/ui.svelte';

  const bookmark = helperBookmark();
  let shown = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bookmark);
      showToast('Copied. Now make the bookmark (step 2).');
    } catch {
      shown = true;
      showToast('Couldn’t copy. Select the text below and copy it instead.');
    }
  }
</script>

<div class="page">
  <div class="top-bar">
    <button
      class="icon-btn"
      type="button"
      aria-label="Back"
      onclick={() => router.back('/more/products')}
    >
      <ArrowLeft size={22} />
    </button>
    <h1 class="top-bar-title">Prices from aldi.ie</h1>
    <span class="spacer"></span>
  </div>

  <p class="intro">
    A Chrome bookmark that sends what aldi.ie shows to Sanso: name, pack size, price, price drops
    and photo. Use it on a product, on search results or on an offers page. Your products get the
    new prices, and products you haven’t added yet are offered to add.
  </p>

  <h2 class="section-title">Set it up once</h2>
  <div class="card card-pad">
    <ol class="steps">
      <li>
        <button class="btn btn-primary btn-small" type="button" onclick={copy}>
          <Copy size={16} /> Copy the helper
        </button>
      </li>
      <li>
        In Chrome, open any page, tap <strong>⋮</strong> and then <strong>☆</strong> to bookmark it.
        Tap <strong>Edit</strong> in the message that appears.
      </li>
      <li>
        Change the name to <strong>Sanso</strong>. Clear the address (URL), paste the helper in its
        place and go back to save.
      </li>
    </ol>
  </div>

  <h2 class="section-title">Use it</h2>
  <div class="card card-pad">
    <ol class="steps">
      <li>Open a product, a search or an offers page on aldi.ie in Chrome.</li>
      <li>
        Tap the address bar, type <strong>Sanso</strong> and tap the bookmark in the suggestions (it has
        a star). Opening it from the bookmarks list doesn’t work.
      </li>
      <li>Sanso opens with the products. Check them and tap Save.</li>
    </ol>
  </div>

  <p class="hint note">
    The helper only runs when you pick it. It asks aldi.ie for the details of the products on the
    page, the same way the page loads them, and opens Sanso with them. It reads up to 60 products at
    a time.
  </p>

  {#if shown}
    <textarea class="textarea code" readonly rows="6" onfocus={(e) => e.currentTarget.select()}
      >{bookmark}</textarea
    >
  {:else}
    <button class="btn btn-quiet show" type="button" onclick={() => (shown = true)}>
      Show the helper’s text
    </button>
  {/if}
</div>

<style>
  .spacer {
    width: 42px;
  }

  .intro {
    margin: 4px 4px 0;
    color: var(--muted);
    line-height: 1.5;
  }

  .steps {
    display: grid;
    gap: 12px;
    margin: 0;
    padding-left: 20px;
    line-height: 1.5;
  }

  .note {
    margin: 16px 4px;
    line-height: 1.5;
  }

  .code {
    width: 100%;
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    word-break: break-all;
  }

  .show {
    display: block;
    margin: 0 auto;
  }
</style>
