<script>
  import { onMount, untrack } from 'svelte';
  import { api } from '../lib/data.svelte.js';
  import { UNITS, activeLoan, catById, inv, locationOptions } from '../lib/inventory.svelte.js';
  import ConfirmButton from './ConfirmButton.svelte';
  import Photos from './Photos.svelte';

  /** item: postojeća stvar ili null za novu; locationId: podrazumevana lokacija za novu. */
  let { item = null, locationId = null, canWrite, onClose } = $props();

  const blank = () => ({
    name: '',
    categoryId: null,
    locationId,
    qty: 1,
    unit: 'kom',
    minQty: null,
    battery: '',
    note: '',
  });
  // Prozor se pravi iznova za svaku stvar, pa je dovoljna početna vrednost.
  const start = untrack(() => item);
  let form = $state(start ? { ...start } : blank());
  let current = $state(start);
  let pending = $state([]);
  let error = $state('');
  let saved = $state('');
  let borrower = $state('');
  let since = $state(new Date().toISOString().slice(0, 10));
  let dialog;
  let nameInput;

  const loan = $derived(current ? activeLoan(current.id) : null);
  const history = $derived(current ? inv.loans.filter((l) => l.itemId === current.id && l.returnedAt) : []);
  const showBattery = $derived(/bater/i.test(catById(form.categoryId)?.name || '') || Boolean(form.battery));

  onMount(() => {
    dialog.showModal();
    nameInput?.focus();
  });

  function close() {
    dialog.close();
    onClose();
  }

  const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

  async function save(next) {
    error = saved = '';
    if (!form.name.trim()) {
      error = 'Upiši naziv.';
      return;
    }
    const body = {
      name: form.name,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      locationId: form.locationId ? Number(form.locationId) : null,
      qty: num(form.qty) ?? 0,
      unit: form.unit,
      minQty: num(form.minQty),
      battery: form.battery || '',
      note: form.note || '',
    };
    try {
      if (current) {
        const { item: it } = await api.patch(`/api/items/${current.id}`, body);
        Object.assign(
          inv.items.find((i) => i.id === it.id),
          it,
        );
        current = it;
        saved = 'Sačuvano.';
        if (!next) close();
      } else {
        const { item: it } = await api.create('/api/items', body);
        inv.items.push(it);
        for (const p of pending) {
          const { photo } = await api.create('/api/photos', { ownerType: 'item', ownerId: it.id, ...p });
          inv.photos.push(photo);
        }
        pending = [];
        if (next) {
          const keep = { categoryId: form.categoryId, locationId: form.locationId, unit: form.unit };
          form = { ...blank(), ...keep };
          saved = `Sačuvano: ${it.name}. Upiši sledeću stvar.`;
          nameInput?.focus();
        } else close();
      }
    } catch (err) {
      error = err.message;
    }
  }

  async function remove() {
    await api.remove(`/api/items/${current.id}`);
    inv.items = inv.items.filter((i) => i.id !== current.id);
    inv.photos = inv.photos.filter((p) => !(p.ownerType === 'item' && p.ownerId === current.id));
    close();
  }

  async function lend(e) {
    e.preventDefault();
    error = '';
    try {
      const { loan: l } = await api.create('/api/loans', { itemId: current.id, borrower, since });
      inv.loans.unshift(l);
      borrower = '';
    } catch (err) {
      error = err.message;
    }
  }

  async function giveBack() {
    const { loan: l } = await api.post(`/api/loans/${loan.id}/return`);
    Object.assign(
      inv.loans.find((x) => x.id === l.id),
      l,
    );
  }

  async function newCategory() {
    const name = prompt('Naziv nove kategorije');
    if (!name?.trim()) return;
    try {
      const { category } = await api.create('/api/categories', { name: name.trim() });
      inv.categories.push(category);
      form.categoryId = category.id;
    } catch (err) {
      error = err.message;
    }
  }
</script>

<dialog bind:this={dialog} class="editor" oncancel={onClose} aria-labelledby="item-title">
  <form
    class="stack wide"
    onsubmit={(e) => {
      e.preventDefault();
      save(false);
    }}
  >
    <div class="dlg-head">
      <h3 id="item-title">{current ? 'Stvar' : 'Nova stvar'}</h3>
      <button type="button" class="linkbtn" onclick={close}>Zatvori</button>
    </div>

    <Photos ownerType="item" ownerId={current?.id} {canWrite} bind:pending />

    <label class="field">
      <span>Naziv</span>
      <input bind:this={nameInput} bind:value={form.name} disabled={!canWrite} required />
    </label>
    <div class="formrow">
      <label class="field grow">
        <span>Kategorija</span>
        <select bind:value={form.categoryId} disabled={!canWrite}>
          <option value={null}>bez kategorije</option>
          {#each inv.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </label>
      {#if canWrite}<button type="button" class="btn quiet selfend" onclick={newCategory}
          >Nova kategorija</button
        >{/if}
    </div>
    <label class="field">
      <span>Lokacija</span>
      <select bind:value={form.locationId} disabled={!canWrite}>
        <option value={null}>bez lokacije</option>
        {#each locationOptions() as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
      </select>
    </label>
    <div class="formrow">
      <label class="field">
        <span>Količina</span>
        <input type="number" min="0" step="any" bind:value={form.qty} disabled={!canWrite} />
      </label>
      <label class="field">
        <span>Jedinica</span>
        <select bind:value={form.unit} disabled={!canWrite}>
          {#each UNITS as u (u)}<option value={u}>{u}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Dokupi ispod</span>
        <input
          type="number"
          min="0"
          step="any"
          bind:value={form.minQty}
          placeholder="nije potrošno"
          disabled={!canWrite}
        />
      </label>
    </div>
    {#if showBattery}
      <label class="field">
        <span>Sistem baterija</span>
        <input bind:value={form.battery} placeholder="npr. Makita 18V LXT" disabled={!canWrite} />
      </label>
    {/if}
    <label class="field">
      <span>Napomena</span>
      <textarea rows="2" bind:value={form.note} disabled={!canWrite}></textarea>
    </label>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if saved}<p class="ok" role="status">{saved}</p>{/if}

    {#if canWrite}
      <div class="row">
        <button class="btn solid">Sačuvaj</button>
        {#if !current}
          <button type="button" class="btn" onclick={() => save(true)}>Sačuvaj i dodaj sledeću</button>
        {:else}
          <ConfirmButton label="Obriši" confirmLabel="Klikni ponovo da obrišeš" onConfirm={remove} />
        {/if}
      </div>
    {/if}
  </form>

  {#if current}
    <div class="loanbox">
      <h4>Pozajmica</h4>
      {#if loan}
        <p>
          Pozajmljeno: <b>{loan.borrower}</b>, od {new Date(loan.since).toLocaleDateString('sr-Latn-RS')}
        </p>
        {#if canWrite}<button type="button" class="btn" onclick={giveBack}>Vraćeno</button>{/if}
      {:else if canWrite}
        <form class="formrow" onsubmit={lend}>
          <label class="field grow"><span>Kome</span><input bind:value={borrower} required /></label>
          <label class="field"><span>Od</span><input type="date" bind:value={since} /></label>
          <button class="btn selfend">Pozajmi</button>
        </form>
      {:else}
        <p class="muted">Nije pozajmljeno.</p>
      {/if}
      {#if history.length}
        <p class="muted small">
          Ranije: {history
            .map((h) => `${h.borrower} (${new Date(h.since).toLocaleDateString('sr-Latn-RS')})`)
            .join(', ')}
        </p>
      {/if}
    </div>
  {/if}
</dialog>
