<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CloudUpload from '@lucide/svelte/icons/cloud-upload';
  import Package from '@lucide/svelte/icons/package';
  import Store from '@lucide/svelte/icons/store';
  import Stepper from '../components/Stepper.svelte';
  import { backupConfigured, backupStatus, hasUnsavedChanges } from '../lib/backup.svelte';
  import { timeAgo, todayISO } from '../lib/dates';
  import { applyUpdate, checkForUpdate, pwa } from '../lib/pwa.svelte';
  import { router } from '../lib/router.svelte';
  import { activeOffer } from '../lib/shopping';
  import { store } from '../lib/store.svelte';
  import { showToast } from '../lib/ui.svelte';

  const today = todayISO();
  const offers = $derived(store.products.filter((p) => activeOffer(p, today)).length);
  let portions = $state(store.settings.defaultPortions);

  const backupText = $derived.by(() => {
    const backup = store.settings.backup;
    if (!backupConfigured()) return 'Not set up yet';
    if (backupStatus.running) return 'Backing up…';
    if (backup?.lastError) return 'Last backup failed';
    if (!backup?.lastBackupAt) return 'No backup yet';
    return `Backed up ${timeAgo(backup.lastBackupAt)}${hasUnsavedChanges() ? ', newer changes waiting' : ''}`;
  });

  function open(event: MouseEvent, path: string) {
    event.preventDefault();
    router.go(path);
  }

  async function check() {
    const ready = await checkForUpdate();
    if (!ready) showToast('You have the latest version.');
  }

  const version = `${__BUILD_ID__} · ${__BUILD_DATE__}`;
</script>

<div class="page">
  <header class="page-header"><h1 class="page-title">More</h1></header>

  <ul class="list">
    <li>
      <a class="row" href="#/more/products" onclick={(e) => open(e, '/more/products')}>
        <span class="icon"><Package size={20} /></span>
        <span class="row-main">
          <span class="row-title">Products</span>
          <span class="row-sub">
            {store.products.length === 1 ? '1 product' : `${store.products.length} products`}{offers
              ? ` · ${offers} on offer`
              : ''}
          </span>
        </span>
        <ChevronRight size={20} class="chev" />
      </a>
    </li>
    <li>
      <a class="row" href="#/more/sections" onclick={(e) => open(e, '/more/sections')}>
        <span class="icon"><Store size={20} /></span>
        <span class="row-main">
          <span class="row-title">Shop sections</span>
          <span class="row-sub">The order you walk through the shop</span>
        </span>
        <ChevronRight size={20} class="chev" />
      </a>
    </li>
    <li>
      <a class="row" href="#/more/backup" onclick={(e) => open(e, '/more/backup')}>
        <span class="icon" class:warn={!backupConfigured() || !!store.settings.backup?.lastError}>
          <CloudUpload size={20} />
        </span>
        <span class="row-main">
          <span class="row-title">Backup</span>
          <span class="row-sub">{backupText}</span>
        </span>
        <ChevronRight size={20} class="chev" />
      </a>
    </li>
  </ul>

  <h2 class="section-title">Settings</h2>
  <div class="card card-pad setting">
    <div>
      <span class="label">Portions per meal</span>
      <p class="hint">
        Used for new meals in the plan. Change a meal’s portions when you have guests.
      </p>
    </div>
    <Stepper
      bind:value={portions}
      label="Portions per meal"
      max={20}
      onchange={(v) => store.updateSettings({ defaultPortions: v })}
    />
  </div>

  <h2 class="section-title">About</h2>
  <div class="card card-pad about">
    <p><strong>Sanso</strong><span>Version {version}</span></p>
    {#if pwa.needRefresh}
      <button class="btn btn-primary btn-small" type="button" onclick={applyUpdate}
        >Update now</button
      >
    {:else}
      <button
        class="btn btn-outline btn-small"
        type="button"
        disabled={pwa.checking}
        onclick={check}
      >
        {pwa.checking ? 'Checking…' : 'Check for updates'}
      </button>
    {/if}
  </div>
</div>

<style>
  .icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent);
  }

  .icon.warn {
    background: var(--tomato-soft);
    color: var(--tomato);
  }

  .row :global(.chev) {
    color: var(--faint);
  }

  .setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .label {
    font-weight: 650;
  }

  .about {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .about p {
    display: grid;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    white-space: nowrap;
  }

  .about strong {
    color: var(--text);
  }
</style>
