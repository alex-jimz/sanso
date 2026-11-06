<script lang="ts">
  // Crops a photo to the shape recipes show it in: drag to move, pinch or use
  // the slider to zoom. The frame shows exactly what will be kept.
  import Sheet from './Sheet.svelte';
  import { cropPhoto } from '../lib/photos';
  import { showToast } from '../lib/ui.svelte';

  let {
    open = $bindable(),
    file,
    aspect = 4 / 3,
    onconfirm,
  }: {
    open: boolean;
    file: Blob | undefined;
    /** Width over height of the crop. */
    aspect?: number;
    /** Gets the cropped photo, or the whole photo when `cropped` is false. */
    onconfirm: (photo: Blob, cropped: boolean) => void;
  } = $props();

  let src = $state<string | undefined>();
  let natural = $state({ width: 0, height: 0 });
  let frameWidth = $state(0);
  let zoom = $state(1);
  // The point of the photo at the frame's centre, as fractions of its size.
  let cx = $state(0.5);
  let cy = $state(0.5);
  let busy = $state(false);

  const frameHeight = $derived(frameWidth / aspect);
  const cover = $derived(
    natural.width && frameWidth
      ? Math.max(frameWidth / natural.width, frameHeight / natural.height)
      : 1,
  );
  const scale = $derived(cover * zoom);
  const shown = $derived({ width: natural.width * scale, height: natural.height * scale });

  $effect(() => {
    const photo = file;
    if (!open || !photo) return;
    const url = URL.createObjectURL(photo);
    src = url;
    zoom = 1;
    cx = 0.5;
    cy = 0.5;
    natural = { width: 0, height: 0 };
    void createImageBitmap(photo, { imageOrientation: 'from-image' })
      .then((bitmap) => {
        natural = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
      })
      .catch(() => showToast('Couldn’t read that photo.'));
    return () => URL.revokeObjectURL(url);
  });

  function clampCentre() {
    if (!shown.width) return;
    const halfX = Math.min(0.5, frameWidth / 2 / shown.width);
    const halfY = Math.min(0.5, frameHeight / 2 / shown.height);
    cx = Math.min(1 - halfX, Math.max(halfX, cx));
    cy = Math.min(1 - halfY, Math.max(halfY, cy));
  }

  function setZoom(value: number) {
    zoom = Math.min(4, Math.max(1, value));
    clampCentre();
  }

  // Pointers on the frame: one drags, two pinch.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let zoomStart = 1;

  function distance(): number {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function down(event: PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      pinchStart = distance();
      zoomStart = zoom;
    }
  }

  function move(event: PointerEvent) {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, next);
    if (pointers.size === 1 && shown.width) {
      cx -= (next.x - last.x) / shown.width;
      cy -= (next.y - last.y) / shown.height;
      clampCentre();
    } else if (pointers.size === 2 && pinchStart) {
      setZoom((zoomStart * distance()) / pinchStart);
    }
  }

  function up(event: PointerEvent) {
    pointers.delete(event.pointerId);
    pinchStart = 0;
  }

  function wheel(event: WheelEvent) {
    event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
  }

  async function confirm() {
    if (!file || !natural.width) return;
    busy = true;
    try {
      const width = frameWidth / scale;
      const height = frameHeight / scale;
      const photo = await cropPhoto(file, {
        x: cx * natural.width - width / 2,
        y: cy * natural.height - height / 2,
        width,
        height,
      });
      open = false;
      onconfirm(photo, true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Couldn’t crop that photo.');
    } finally {
      busy = false;
    }
  }

  function keepWhole() {
    if (!file) return;
    open = false;
    onconfirm(file, false);
  }
</script>

<Sheet bind:open title="Crop photo">
  <div class="stack">
    <div
      class="frame"
      bind:clientWidth={frameWidth}
      style:height={`${frameHeight}px`}
      role="application"
      aria-label="Drag to move the photo, pinch to zoom"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onwheel={wheel}
    >
      {#if src && natural.width}
        <img
          {src}
          alt=""
          draggable="false"
          style:width={`${shown.width}px`}
          style:height={`${shown.height}px`}
          style:left={`${frameWidth / 2 - cx * shown.width}px`}
          style:top={`${frameHeight / 2 - cy * shown.height}px`}
        />
        <span class="grid" aria-hidden="true"></span>
      {/if}
    </div>
    <label class="zoom">
      <span class="field-label">Zoom</span>
      <input
        type="range"
        min="1"
        max="4"
        step="0.01"
        value={zoom}
        oninput={(e) => setZoom(Number((e.currentTarget as HTMLInputElement).value))}
      />
    </label>
    <p class="hint">Drag the photo to move it. Pinch or use the slider to zoom.</p>
  </div>
  {#snippet footer()}
    <button class="btn" type="button" onclick={keepWhole} disabled={busy}>Use whole photo</button>
    <button
      class="btn btn-primary"
      type="button"
      onclick={confirm}
      disabled={busy || !natural.width}>Crop</button
    >
  {/snippet}
</Sheet>

<style>
  .frame {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--surface-3);
    touch-action: none;
    cursor: grab;
    user-select: none;
  }

  .frame img {
    position: absolute;
    max-width: none;
    pointer-events: none;
  }

  /* Rule-of-thirds lines. */
  .grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(
        to right,
        transparent calc(33.33% - 0.5px),
        rgb(255 255 255 / 0.55) 0,
        rgb(255 255 255 / 0.55) calc(33.33% + 0.5px),
        transparent 0,
        transparent calc(66.66% - 0.5px),
        rgb(255 255 255 / 0.55) 0,
        rgb(255 255 255 / 0.55) calc(66.66% + 0.5px),
        transparent 0
      ),
      linear-gradient(
        to bottom,
        transparent calc(33.33% - 0.5px),
        rgb(255 255 255 / 0.55) 0,
        rgb(255 255 255 / 0.55) calc(33.33% + 0.5px),
        transparent 0,
        transparent calc(66.66% - 0.5px),
        rgb(255 255 255 / 0.55) 0,
        rgb(255 255 255 / 0.55) calc(66.66% + 0.5px),
        transparent 0
      );
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.4);
  }

  .zoom {
    display: grid;
    gap: 6px;
  }

  .zoom input {
    width: 100%;
    accent-color: var(--accent);
  }

  .hint {
    margin: 0;
  }
</style>
