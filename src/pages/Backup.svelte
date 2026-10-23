<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import CloudDownload from '@lucide/svelte/icons/cloud-download';
  import CloudUpload from '@lucide/svelte/icons/cloud-upload';
  import Download from '@lucide/svelte/icons/download';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Upload from '@lucide/svelte/icons/upload';
  import { onMount } from 'svelte';
  import {
    backupConfigured,
    backupStatus,
    exportFile,
    fetchGitHubBackup,
    hasUnsavedChanges,
    readImportFile,
    runBackup,
  } from '../lib/backup.svelte';
  import { timeAgo } from '../lib/dates';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import { askConfirm, showToast } from '../lib/ui.svelte';

  let repo = $state(store.settings.backup?.repo ?? '');
  let token = $state('');
  let editing = $state(!backupConfigured());
  let restoring = $state(false);
  let persisted = $state<boolean | null>(null);
  let usage = $state('');
  let fileInput: HTMLInputElement;

  const backup = $derived(store.settings.backup);

  onMount(async () => {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.usage) usage = `${(estimate.usage / 1024 / 1024).toFixed(1)} MB`;
  });

  async function connect() {
    const cleanRepo = repo
      .trim()
      .replace(/^https:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/\/$/, '');
    const cleanToken = token.trim() || backup?.token || '';
    if (!/^[\w.-]+\/[\w.-]+$/.test(cleanRepo)) {
      showToast('Enter the repository as owner/name, for example alex-jimz/sanso-data.');
      return;
    }
    if (!cleanToken) {
      showToast('Paste the token first.');
      return;
    }
    await store.setBackup({ repo: cleanRepo, token: cleanToken });
    token = '';
    const result = await runBackup();
    if (result === 'failed') {
      showToast(store.settings.backup?.lastError ?? 'The backup failed.');
      return;
    }
    editing = false;
    showToast('Backup is set up. Sanso backs up a few minutes after each change.');
  }

  async function backUpNow() {
    const result = await runBackup();
    if (result === 'saved') showToast('Backed up');
    else if (result === 'unchanged') showToast('Already up to date');
    else if (result === 'failed')
      showToast(store.settings.backup?.lastError ?? 'The backup failed.');
  }

  async function restore() {
    if (!backup) return;
    const ok = await askConfirm({
      title: 'Restore from GitHub?',
      message: 'Everything on this phone is replaced with the latest backup.',
      confirmLabel: 'Restore',
      danger: true,
    });
    if (!ok) return;
    restoring = true;
    try {
      const { data, photos } = await fetchGitHubBackup(backup);
      await store.restore(data, photos);
      await store.setBackup({
        ...backup,
        lastBackupAt: store.meta.changedAt,
        lastError: undefined,
      });
      showToast(
        `Restored ${store.recipes.length === 1 ? '1 recipe' : `${store.recipes.length} recipes`}`,
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Couldn’t restore the backup.');
    } finally {
      restoring = false;
    }
  }

  async function turnOff() {
    const ok = await askConfirm({
      title: 'Turn off backups?',
      message: 'The token is removed from this phone. Backups already on GitHub stay there.',
      confirmLabel: 'Turn off',
      danger: true,
    });
    if (!ok) return;
    await store.setBackup(undefined);
    repo = '';
    editing = true;
  }

  async function exportNow() {
    try {
      await exportFile();
      showToast('Saved to your Downloads');
    } catch {
      showToast('Couldn’t export the data.');
    }
  }

  async function importNow(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const { data, photos } = await readImportFile(file);
      const ok = await askConfirm({
        title: 'Import this file?',
        message: 'Everything on this phone is replaced with the contents of the file.',
        confirmLabel: 'Import',
        danger: true,
      });
      if (!ok) return;
      await store.restore(data, photos);
      showToast('Imported');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Couldn’t read that file.');
    }
  }
</script>

<div class="page">
  <div class="top-bar">
    <button class="icon-btn" type="button" aria-label="Back" onclick={() => router.back('/more')}>
      <ArrowLeft size={22} />
    </button>
    <h1 class="top-bar-title">Backup</h1>
    <span class="spacer"></span>
  </div>

  <p class="intro">
    Your recipes, products and plans are stored on this phone. Back them up so a lost or reset phone
    doesn’t lose them.
  </p>

  <h2 class="section-title">Private GitHub repository</h2>
  {#if editing}
    <div class="card card-pad stack">
      <ol class="steps">
        <li>
          Create a <strong>private</strong> repository, for example <code>sanso-data</code>.
          <a href="https://github.com/new" target="_blank" rel="noopener noreferrer"
            >New repository <ExternalLink size={13} /></a
          >
        </li>
        <li>
          Create a fine-grained token. Under <em>Repository access</em>, pick only that repository.
          Under
          <em>Permissions</em>, set <em>Contents</em> to <em>Read and write</em>.
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noopener noreferrer"
          >
            New token <ExternalLink size={13} />
          </a>
        </li>
        <li>Paste both here.</li>
      </ol>
      <label class="field">
        <span class="field-label">Repository</span>
        <input
          class="input"
          bind:value={repo}
          placeholder="alex-jimz/sanso-data"
          autocomplete="off"
          spellcheck="false"
          autocapitalize="off"
        />
      </label>
      <label class="field">
        <span class="field-label">Token</span>
        <input
          class="input"
          type="password"
          bind:value={token}
          placeholder={backup?.token ? 'Leave empty to keep the saved token' : 'github_pat_…'}
          autocomplete="off"
          spellcheck="false"
        />
        <span class="hint">The token stays on this phone and is only sent to GitHub.</span>
      </label>
      <div class="buttons">
        {#if backupConfigured()}
          <button class="btn" type="button" onclick={() => (editing = false)}>Cancel</button>
        {/if}
        <button
          class="btn btn-primary"
          type="button"
          disabled={backupStatus.running}
          onclick={connect}
        >
          {backupStatus.running ? 'Connecting…' : 'Save and back up'}
        </button>
      </div>
    </div>
  {:else if backup}
    <div class="card card-pad stack">
      <div class="status" class:error={!!backup.lastError}>
        <ShieldCheck size={22} />
        <div>
          <p class="status-title">{backup.repo}</p>
          <p class="hint">
            {#if backupStatus.running}
              Backing up…
            {:else if backup.lastError}
              {backup.lastError}
            {:else if backup.lastBackupAt}
              Backed up {timeAgo(backup.lastBackupAt)}{hasUnsavedChanges()
                ? '. Newer changes are waiting.'
                : '.'}
            {:else}
              No backup yet.
            {/if}
          </p>
        </div>
      </div>
      <div class="buttons">
        <button
          class="btn btn-primary"
          type="button"
          disabled={backupStatus.running}
          onclick={backUpNow}
        >
          <CloudUpload size={18} /> Back up now
        </button>
        <button class="btn btn-outline" type="button" disabled={restoring} onclick={restore}>
          <CloudDownload size={18} />
          {restoring ? 'Restoring…' : 'Restore'}
        </button>
      </div>
      <div class="links">
        <button class="btn btn-quiet" type="button" onclick={() => (editing = true)}
          >Change token</button
        >
        <button class="btn btn-quiet danger" type="button" onclick={turnOff}>Turn off</button>
      </div>
    </div>
  {/if}

  <h2 class="section-title">File</h2>
  <div class="card card-pad stack">
    <p class="hint">
      A single file with everything, photos included. Handy before changing phones.
    </p>
    <div class="buttons">
      <button class="btn btn-outline" type="button" onclick={exportNow}
        ><Download size={18} /> Export</button
      >
      <button class="btn btn-outline" type="button" onclick={() => fileInput.click()}
        ><Upload size={18} /> Import</button
      >
    </div>
    <input
      bind:this={fileInput}
      type="file"
      accept="application/json,.json"
      hidden
      onchange={importNow}
    />
  </div>

  <h2 class="section-title">This phone</h2>
  <div class="card card-pad">
    <p class="hint">
      {persisted === true
        ? 'Chrome won’t clear Sanso’s data when space runs low.'
        : persisted === false
          ? 'Chrome may clear Sanso’s data if the phone runs very low on space, so keep a backup.'
          : 'Storage status unknown.'}
      {usage ? ` Using ${usage}.` : ''}
    </p>
  </div>
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
    gap: 10px;
    margin: 0;
    padding-left: 20px;
    line-height: 1.5;
  }

  .steps a {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-weight: 650;
    white-space: nowrap;
  }

  code {
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--surface-2);
    font-size: 0.875em;
  }

  .buttons {
    display: flex;
    gap: 10px;
  }

  .buttons .btn {
    flex: 1;
  }

  .links {
    display: flex;
    justify-content: space-between;
    margin: -6px -10px -6px;
  }

  .danger {
    color: var(--tomato);
  }

  .status {
    display: flex;
    gap: 12px;
    color: var(--accent);
  }

  .status.error {
    color: var(--tomato);
  }

  .status p {
    margin: 0;
  }

  .status-title {
    color: var(--text);
    font-weight: 650;
  }
</style>
