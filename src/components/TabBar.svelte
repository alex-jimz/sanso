<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import CookingPot from '@lucide/svelte/icons/cooking-pot';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import ShoppingBasket from '@lucide/svelte/icons/shopping-basket';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';

  const tabs = [
    { path: '/recipes', label: 'Recipes', icon: BookOpen },
    { path: '/plan', label: 'Plan', icon: CalendarDays },
    { path: '/shopping', label: 'Shopping', icon: ShoppingBasket },
    { path: '/cook', label: 'Cook', icon: CookingPot },
    { path: '/more', label: 'More', icon: Ellipsis },
  ];

  const current = $derived(`/${router.route.segments[0] ?? 'recipes'}`);
  const toBuy = $derived(store.list?.items.filter((i) => i.part === 'buy' && !i.done).length ?? 0);

  function open(event: MouseEvent, path: string) {
    event.preventDefault();
    router.go(path, { replace: true });
  }
</script>

<nav class="tabbar" aria-label="Main">
  {#each tabs as tab (tab.path)}
    {@const Icon = tab.icon}
    {@const active = current === tab.path}
    <a
      href={`#${tab.path}`}
      class:active
      aria-current={active ? 'page' : undefined}
      onclick={(e) => open(e, tab.path)}
    >
      <span class="icon">
        <Icon size={23} strokeWidth={active ? 2.25 : 1.9} />
        {#if tab.path === '/shopping' && toBuy > 0}
          <span class="badge" aria-label={`${toBuy} to buy`}>{toBuy > 99 ? '99+' : toBuy}</span>
        {:else if tab.path === '/cook' && store.cooking}
          <span class="dot" aria-label="Cooking in progress"></span>
        {/if}
      </span>
      <span class="label">{tab.label}</span>
    </a>
  {/each}
</nav>

<style>
  .tabbar {
    position: fixed;
    inset: auto 0 0;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    height: calc(var(--tabbar-height) + var(--safe-bottom));
    padding: 0 max(4px, calc((100vw - 640px) / 2)) var(--safe-bottom);
    border-top: 1px solid var(--line);
    background: color-mix(in srgb, var(--surface) 94%, transparent);
    backdrop-filter: blur(14px);
  }

  a {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    color: var(--muted);
    font-size: 0.6875rem;
    font-weight: 650;
    text-decoration: none;
  }

  a.active {
    color: var(--accent);
  }

  .icon {
    position: relative;
    display: grid;
    place-items: center;
    width: 58px;
    height: 30px;
    border-radius: 999px;
    transition: background-color 0.2s ease;
  }

  a.active .icon {
    background: var(--accent-soft);
  }

  .badge {
    position: absolute;
    top: -3px;
    right: 6px;
    display: grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border: 2px solid var(--surface);
    border-radius: 99px;
    background: var(--tomato);
    color: #fff;
    font-size: 0.625rem;
    font-weight: 750;
  }

  .dot {
    position: absolute;
    top: 2px;
    right: 13px;
    width: 10px;
    height: 10px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--tomato);
  }
</style>
