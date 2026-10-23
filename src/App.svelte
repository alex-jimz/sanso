<script lang="ts">
  import ConfirmHost from './components/ConfirmHost.svelte';
  import TabBar from './components/TabBar.svelte';
  import Toast from './components/Toast.svelte';
  import { applyUpdate, pwa } from './lib/pwa.svelte';
  import { router } from './lib/router.svelte';
  import { store } from './lib/store.svelte';
  import Backup from './pages/Backup.svelte';
  import Cook from './pages/Cook.svelte';
  import More from './pages/More.svelte';
  import Plan from './pages/Plan.svelte';
  import ProductEdit from './pages/ProductEdit.svelte';
  import Products from './pages/Products.svelte';
  import RecipeDetail from './pages/RecipeDetail.svelte';
  import RecipeEdit from './pages/RecipeEdit.svelte';
  import Recipes from './pages/Recipes.svelte';
  import Sections from './pages/Sections.svelte';
  import Shopping from './pages/Shopping.svelte';

  const segments = $derived(router.route.segments);
  const [top = 'recipes', second, third] = $derived(segments);
  const topLevel = $derived(segments.length <= 1);
  const iconUrl = `${import.meta.env.BASE_URL}icon.svg`;
</script>

{#if store.loadError}
  <div class="splash">
    <h1>Sanso couldn’t open its storage</h1>
    <p>{store.loadError}</p>
    <p>
      Try closing and reopening the app. If you use a private window, storage may be turned off.
    </p>
  </div>
{:else if !store.ready}
  <div class="splash" aria-busy="true">
    <img src={iconUrl} alt="" width="72" height="72" />
  </div>
{:else}
  {#key router.route.path}
    {#if top === 'recipes' && second === 'new'}
      <RecipeEdit />
    {:else if top === 'recipes' && second && third === 'edit'}
      <RecipeEdit id={second} />
    {:else if top === 'recipes' && second}
      <RecipeDetail id={second} />
    {:else if top === 'plan'}
      <Plan />
    {:else if top === 'shopping'}
      <Shopping />
    {:else if top === 'cook'}
      <Cook />
    {:else if top === 'more' && second === 'products' && third}
      <ProductEdit id={third} />
    {:else if top === 'more' && second === 'products'}
      <Products />
    {:else if top === 'more' && second === 'sections'}
      <Sections />
    {:else if top === 'more' && second === 'backup'}
      <Backup />
    {:else if top === 'more'}
      <More />
    {:else}
      <Recipes />
    {/if}
  {/key}

  {#if topLevel}
    <TabBar />
  {/if}
{/if}

{#if pwa.needRefresh}
  <div class="update" class:raised={topLevel} role="status">
    <span>A new version of Sanso is ready.</span>
    <button type="button" onclick={applyUpdate}>Update</button>
  </div>
{/if}

<Toast />
<ConfirmHost />

<style>
  .splash {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 8px;
    min-height: 100dvh;
    padding: 24px;
    text-align: center;
  }

  .splash img {
    border-radius: 22%;
    box-shadow: 0 12px 32px rgb(47 93 80 / 0.28);
  }

  .splash h1 {
    font-size: 1.5rem;
  }

  .splash p {
    max-width: 24rem;
    margin: 0;
    color: var(--muted);
    line-height: 1.5;
  }

  .update {
    position: fixed;
    inset: auto 12px calc(12px + var(--safe-bottom));
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    max-width: 616px;
    margin: 0 auto;
    padding: 8px 8px 8px 18px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: var(--shadow-lg);
  }

  .update.raised {
    bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 12px);
  }

  .update button {
    padding: 10px 18px;
    border: 0;
    border-radius: 999px;
    background: var(--on-accent);
    color: var(--accent);
    font-weight: 700;
  }
</style>
