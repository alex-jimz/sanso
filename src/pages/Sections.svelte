<script lang="ts">
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Sheet from '../components/Sheet.svelte';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import type { Section, Zone } from '../lib/types';
  import { askConfirm } from '../lib/ui.svelte';

  const zones: { id: Zone; label: string }[] = [
    { id: 'ambient', label: 'Dry & fresh' },
    { id: 'fridge', label: 'Fridge' },
    { id: 'freezer', label: 'Freezer' },
  ];
  const zoneLabel = (zone: Zone) => zones.find((z) => z.id === zone)?.label ?? '';

  let editOpen = $state(false);
  let editing = $state<Section | null>(null);
  let name = $state('');
  let zone = $state<Zone>('ambient');

  function edit(section?: Section) {
    editing = section ?? null;
    name = section?.name ?? '';
    zone = section?.zone ?? 'ambient';
    editOpen = true;
  }

  async function save() {
    if (!name.trim()) return;
    if (editing) await store.saveSection({ ...$state.snapshot(editing), name: name.trim(), zone });
    else await store.addSection(name, zone);
    editOpen = false;
  }

  async function remove() {
    const section = editing;
    if (!section) return;
    const count = store.products.filter((p) => p.sectionId === section.id).length;
    const ok = await askConfirm({
      title: `Delete ${section.name}?`,
      message: count
        ? `${count === 1 ? '1 product' : `${count} products`} will have no section.`
        : undefined,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await store.deleteSection(section.id);
    editOpen = false;
  }
</script>

<div class="page">
  <div class="top-bar">
    <button class="icon-btn" type="button" aria-label="Back" onclick={() => router.back('/more')}>
      <ArrowLeft size={22} />
    </button>
    <h1 class="top-bar-title">Shop sections</h1>
    <button class="icon-btn" type="button" aria-label="New section" onclick={() => edit()}>
      <Plus size={22} />
    </button>
  </div>

  <p class="hint intro">
    In the order you walk through the shop. Shopping lists follow it, so you can go aisle by aisle:
    shelves first, then the fridge, then the freezer.
  </p>

  <ul class="list">
    {#each store.orderedSections as section, i (section.id)}
      <li class="section-row">
        <button class="row" type="button" onclick={() => edit(section)}>
          <span class="dot zone-{section.zone}"></span>
          <span class="row-main">
            <span class="row-title">{section.name}</span>
            <span class="row-sub">{zoneLabel(section.zone)}</span>
          </span>
        </button>
        <button
          class="icon-btn"
          type="button"
          aria-label={`Move ${section.name} up`}
          disabled={i === 0}
          onclick={() => store.moveSection(section.id, -1)}
        >
          <ArrowUp size={18} />
        </button>
        <button
          class="icon-btn"
          type="button"
          aria-label={`Move ${section.name} down`}
          disabled={i === store.orderedSections.length - 1}
          onclick={() => store.moveSection(section.id, 1)}
        >
          <ArrowDown size={18} />
        </button>
      </li>
    {/each}
  </ul>
</div>

<Sheet bind:open={editOpen} title={editing ? 'Edit section' : 'New section'}>
  <form class="stack" onsubmit={(e) => (e.preventDefault(), save())}>
    <label class="field">
      <span class="field-label">Name</span>
      <input class="input" bind:value={name} placeholder="Cereals" autocomplete="off" />
    </label>
    <div class="field">
      <span class="field-label">Kind</span>
      <div class="segmented">
        {#each zones as z (z.id)}
          <button type="button" aria-pressed={zone === z.id} onclick={() => (zone = z.id)}
            >{z.label}</button
          >
        {/each}
      </div>
    </div>
    {#if editing}
      <button class="btn btn-danger" type="button" onclick={remove}
        ><Trash2 size={18} /> Delete section</button
      >
    {/if}
  </form>
  {#snippet footer()}
    <button class="btn" type="button" onclick={() => (editOpen = false)}>Cancel</button>
    <button class="btn btn-primary" type="button" disabled={!name.trim()} onclick={save}
      >Save</button
    >
  {/snippet}
</Sheet>

<style>
  .intro {
    margin: 4px 4px 16px;
    font-size: 0.875rem;
  }

  .section-row {
    display: flex;
    align-items: center;
    padding-right: 6px;
  }

  .section-row .row {
    flex: 1;
    min-width: 0;
  }

  .section-row .icon-btn {
    width: 38px;
    height: 38px;
    color: var(--muted);
  }

  .section-row .icon-btn:disabled {
    opacity: 0.25;
  }

  .dot {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .zone-ambient {
    background: #c9a26b;
  }

  .zone-fridge {
    background: var(--sky);
  }

  .zone-freezer {
    background: var(--frost);
  }
</style>
