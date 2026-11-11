<script lang="ts">
  // A step chart of a product's price: the regular price as a green line,
  // offers as red dips, and anything after today faded. Below it, the latest
  // changes as text, since the chart alone hides the exact amounts.
  import { addDays, formatDayMonth, fromISODate } from '../lib/dates';
  import { formatOfferWeek } from '../lib/offers';
  import { priceEvents, priceLogOf, priceSteps, type PriceStep } from '../lib/priceHistory';
  import { formatPrice } from '../lib/quantity';
  import type { Product } from '../lib/types';

  let { product, today }: { product: Product; today: string } = $props();

  const steps = $derived(priceSteps(product, today));
  const events = $derived(priceEvents(product).slice(0, 5));
  const since = $derived(priceLogOf(product)[0]?.date);

  const width = 320;
  const height = 130;
  const left = 46;
  const right = 10;
  const top = 12;
  const bottom = 22;
  const minDays = 28;

  const day = 86_400_000;
  const days = (a: string, b: string) =>
    Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / day);

  const domain = $derived.by(() => {
    const end = addDays(steps.at(-1)?.until ?? today, 1);
    const first = steps[0]?.from ?? today;
    const start = days(first, end) < minDays ? addDays(end, -minDays) : first;
    return { start, end, span: days(start, end) };
  });

  const range = $derived.by(() => {
    const prices = steps.map((s) => s.price);
    let low = Math.min(...prices);
    let high = Math.max(...prices);
    if (low === high) {
      low *= 0.85;
      high *= 1.15;
    }
    const pad = (high - low) * 0.12;
    return {
      low: Math.max(0, low - pad),
      high: high + pad,
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  });

  const x = (date: string) =>
    left + (days(domain.start, date) / domain.span) * (width - left - right);
  const y = (price: number) =>
    top + ((range.high - price) / (range.high - range.low || 1)) * (height - top - bottom);

  /** The step line between two dates; `end` is the day after the last one drawn. */
  function line(list: PriceStep[], from: string, end: string): string {
    let d = '';
    for (const step of list) {
      const a = step.from > from ? step.from : from;
      const b = addDays(step.until, 1) < end ? addDays(step.until, 1) : end;
      if (a >= b) continue;
      d += `${d ? 'L' : 'M'}${x(a).toFixed(1)} ${y(step.price).toFixed(1)}L${x(b).toFixed(1)} ${y(step.price).toFixed(1)}`;
    }
    return d;
  }

  const tomorrow = $derived(addDays(today, 1));
  const past = $derived(line(steps, domain.start, tomorrow));
  const future = $derived(line(steps, tomorrow, domain.end));
  const dips = $derived(
    steps
      .filter((s) => s.offer)
      .map((s) => ({ step: s, d: line([s], domain.start, domain.end), future: s.from > today })),
  );
  const showToday = $derived(domain.end > tomorrow);
  // Date labels are about 40 px wide, so ones that would overlap are left out.
  const todayLabel = $derived(x(tomorrow) - left > 56);
  const endLabel = $derived(width - right - x(tomorrow) > 56);
</script>

<div class="card card-pad stack">
  <div>
    <span class="title">Price history</span>
    {#if !events.length && since}
      <span class="hint">
        {product.price !== undefined ? formatPrice(product.price) : 'This price'} since {formatDayMonth(
          since,
        )}. The graph fills in when the price changes or the product goes on offer.
      </span>
    {/if}
  </div>

  {#if events.length && steps.length}
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Price from ${formatPrice(range.min)} to ${formatPrice(range.max)} since ${formatDayMonth(steps[0]!.from)}`}
    >
      <line class="grid" x1={left} x2={width - right} y1={y(range.max)} y2={y(range.max)} />
      <line class="grid" x1={left} x2={width - right} y1={y(range.min)} y2={y(range.min)} />
      <text class="axis" x={left - 6} y={y(range.max) + 4} text-anchor="end"
        >{formatPrice(range.max)}</text
      >
      {#if range.min !== range.max}
        <text class="axis" x={left - 6} y={y(range.min) + 4} text-anchor="end"
          >{formatPrice(range.min)}</text
        >
      {/if}
      {#if showToday}
        <line class="today" x1={x(tomorrow)} x2={x(tomorrow)} y1={top - 4} y2={height - bottom} />
      {/if}
      <path class="price" d={past} />
      {#if showToday}<path class="price future" d={future} />{/if}
      {#each dips as dip (dip.step.from)}
        <path class="dip" class:future={dip.future} d={dip.d} />
      {/each}
      <text class="axis" x={left} y={height - 6}>{formatDayMonth(domain.start)}</text>
      {#if showToday}
        {#if todayLabel}
          <text class="axis" x={x(tomorrow)} y={height - 6} text-anchor="middle">Today</text>
        {/if}
        {#if endLabel}
          <text class="axis" x={width - right} y={height - 6} text-anchor="end"
            >{formatDayMonth(addDays(domain.end, -1))}</text
          >
        {/if}
      {:else}
        <text class="axis" x={width - right} y={height - 6} text-anchor="end">Today</text>
      {/if}
    </svg>

    <ul class="events">
      {#each events as event (event.kind + event.date)}
        <li>
          {#if event.kind === 'change'}
            <span class="when">{formatDayMonth(event.date)}</span>
            <span class="what" class:up={event.to > event.from} class:down={event.to < event.from}
              >{event.to > event.from ? 'Up' : 'Down'} to {formatPrice(event.to)}</span
            >
            <span class="was">from {formatPrice(event.from)}</span>
          {:else}
            <span class="when">{formatOfferWeek(event.offer)}</span>
            <span class="what offer">Offer {formatPrice(event.offer.price)}</span>
            {#if event.regular !== undefined}<span class="was"
                >usually {formatPrice(event.regular)}</span
              >{/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .title {
    display: block;
    font-weight: 650;
  }

  .hint {
    display: block;
    margin-top: 2px;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }

  .today {
    stroke: var(--faint);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }

  .axis {
    fill: var(--muted);
    font-size: 11px;
    font-family: var(--font-ui);
  }

  path {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .price {
    stroke: var(--accent);
    stroke-width: 2.5;
  }

  .dip {
    stroke: var(--tomato);
    stroke-width: 3.5;
  }

  .future {
    opacity: 0.45;
    stroke-dasharray: 5 4;
  }

  .events {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.875rem;
  }

  .events li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
  }

  .when {
    min-width: 7.5em;
    color: var(--muted);
  }

  .what {
    font-weight: 650;
  }

  .up {
    color: var(--mustard);
  }

  .down {
    color: var(--accent);
  }

  .offer {
    color: var(--tomato);
  }

  .was {
    color: var(--muted);
  }
</style>
