<script>
  import { api } from '../lib/data.svelte.js';
  import { inv, photosOf } from '../lib/inventory.svelte.js';
  import { preparePhoto } from '../lib/images.js';

  /** Slike stvari ili lokacije. Bez ownerId (nova stvar) slike čekaju u pending dok se ne sačuva. */
  let { ownerType, ownerId = null, canWrite, pending = $bindable([]) } = $props();
  let busy = $state(false);
  let error = $state('');
  let input = $state();

  const list = $derived(ownerId ? photosOf(ownerType, ownerId) : []);

  async function pick(e) {
    const files = [...(e.currentTarget.files || [])];
    e.currentTarget.value = '';
    if (!files.length) return;
    busy = true;
    error = '';
    try {
      for (const f of files) {
        const prepared = await preparePhoto(f);
        if (!ownerId) {
          pending = [...pending, prepared];
          continue;
        }
        const { photo } = await api.create('/api/photos', { ownerType, ownerId, ...prepared });
        inv.photos.push(photo);
      }
    } catch (err) {
      error = err.message || 'Slika nije sačuvana.';
    } finally {
      busy = false;
    }
  }

  async function remove(p) {
    await api.remove(`/api/photos/${p.id}`);
    inv.photos = inv.photos.filter((x) => x.id !== p.id);
  }
</script>

<div class="photos">
  {#each list as p (p.id)}
    <div class="ph">
      <a href={`/api/photos/${p.id}`} target="_blank" rel="noopener">
        <img src={`/api/photos/${p.id}/thumb`} alt="Slika" loading="lazy" />
      </a>
      {#if canWrite}
        <button type="button" class="del" aria-label="Obriši sliku" onclick={() => remove(p)}>×</button>
      {/if}
    </div>
  {/each}
  {#each pending as p, i (i)}
    <div class="ph">
      <img src={`data:image/jpeg;base64,${p.thumb}`} alt="Nova slika" />
      <button
        type="button"
        class="del"
        aria-label="Ukloni sliku"
        onclick={() => (pending = pending.filter((_, j) => j !== i))}>×</button
      >
    </div>
  {/each}
  {#if canWrite}
    <button type="button" class="ph addph" disabled={busy} onclick={() => input.click()}>
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg
      >
      <span>{busy ? 'Čuvam…' : 'Slikaj ili dodaj'}</span>
    </button>
    <input
      bind:this={input}
      type="file"
      accept="image/*"
      capture="environment"
      multiple
      hidden
      onchange={pick}
    />
  {/if}
</div>
{#if error}<p class="error small">{error}</p>{/if}
