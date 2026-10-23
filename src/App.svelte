<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Android keeps installed apps in memory, so also check for a new version
      // whenever the app comes back to the foreground, not only on a cold start.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update();
      });
    },
  });

  const installed = window.matchMedia('(display-mode: standalone)').matches;
  const iconUrl = `${import.meta.env.BASE_URL}icon.svg`;
  const version = `${__BUILD_ID__} · ${__BUILD_DATE__}`;
</script>

<main>
  <img class="icon" src={iconUrl} alt="" width="104" height="104" />
  <h1>Sanso</h1>
  <p class="tagline">Recipes, meal plan and shopping list.</p>

  {#if installed}
    <p class="note">Installed. Works offline, and new features will appear here.</p>
  {:else}
    <p class="note">To install, open Chrome's ⋮ menu and add it to your home screen.</p>
  {/if}

  <p class="version">Version {version}</p>
</main>

{#if $needRefresh}
  <div class="update" role="status">
    <span>A new version is ready.</span>
    <button type="button" onclick={() => updateServiceWorker(true)}>Update</button>
  </div>
{/if}

<style>
  main {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem 1.5rem calc(2rem + env(safe-area-inset-bottom));
    text-align: center;
  }

  .icon {
    border-radius: 22%;
    box-shadow: 0 12px 32px rgb(47 93 80 / 0.28);
  }

  h1 {
    margin: 1rem 0 0;
    font-size: 2.75rem;
  }

  .tagline {
    margin: 0;
    color: var(--muted);
    font-size: 1.125rem;
  }

  .note {
    max-width: 21rem;
    margin: 1.75rem 0 0;
    line-height: 1.5;
  }

  .version {
    margin: 2.5rem 0 0;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .update {
    position: fixed;
    inset: auto 1rem calc(1rem + env(safe-area-inset-bottom));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.625rem 0.625rem 0.625rem 1.25rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: 0 10px 28px rgb(0 0 0 / 0.2);
  }

  .update button {
    border: 0;
    border-radius: 999px;
    padding: 0.625rem 1.25rem;
    background: var(--on-accent);
    color: var(--accent);
    font-weight: 600;
  }
</style>
