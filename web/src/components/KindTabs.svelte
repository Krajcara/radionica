<script>
  import { KIND_LABELS, KINDS } from '@radionica/shared';

  /** badges: { kind: { text, cls } } */
  let { current, onPick, badges = {}, extra = null } = $props();
</script>

<div class="subtabs" role="tablist">
  {#if extra}
    <button type="button" role="tab" aria-selected={current === extra.id} onclick={() => onPick(extra.id)}>
      {extra.label}
    </button>
  {/if}
  {#each KINDS as k (k)}
    <button type="button" role="tab" aria-selected={current === k} onclick={() => onPick(k)}>
      <span class="dot {k}"></span>{KIND_LABELS[k]}
      {#if badges[k]}<span class="badge {badges[k].cls || ''}">{badges[k].text}</span>{/if}
    </button>
  {/each}
</div>
