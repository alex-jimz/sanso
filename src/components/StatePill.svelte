<script lang="ts">
  import { stateInfo } from '../lib/states';
  import type { MealState } from '../lib/types';

  let { state }: { state: MealState } = $props();

  const info = $derived(stateInfo(state));
</script>

<span class="pill state-{state}">
  <info.icon size={13} strokeWidth={2.3} />
  {info.label}
</span>
