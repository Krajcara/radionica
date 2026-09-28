<script>
  import { KIND_LABELS } from '@radionica/shared';
  import { api, materialsOf, saveLater, store } from '../lib/data.svelte.js';
  import EditableTable from './EditableTable.svelte';
  import KindTabs from './KindTabs.svelte';

  let { canWrite } = $props();
  let kind = $state('metal');
  let error = $state('');
  let table = $state();

  const COLUMNS = {
    metal: [
      { key: 'name', label: 'Profil', type: 'text', placeholder: '40x40' },
      { key: 'thickness', label: 'Zid (mm)', type: 'num' },
      { key: 'note', label: 'Opis', type: 'text', placeholder: 'npr. kvadratna, crna' },
    ],
    iverica: [
      { key: 'name', label: 'Dekor', type: 'text', placeholder: 'Hrast lancelot' },
      { key: 'thickness', label: 'Debljina (mm)', type: 'num' },
      { key: 'hasGrain', label: 'Ima dezen', type: 'check' },
      { key: 'note', label: 'Opis', type: 'text', placeholder: 'npr. šifra proizvođača' },
    ],
    sper: [
      { key: 'name', label: 'Vrsta', type: 'text', placeholder: 'Breza' },
      { key: 'thickness', label: 'Debljina (mm)', type: 'num' },
      { key: 'hasGrain', label: 'Žica je bitna', type: 'check' },
      { key: 'note', label: 'Opis', type: 'text', placeholder: 'npr. vodootporna' },
    ],
    drvo: [
      { key: 'name', label: 'Vrsta drveta', type: 'text', placeholder: 'bukva' },
      { key: 'note', label: 'Opis', type: 'text' },
    ],
  };
  const HINTS = {
    metal: 'Profil piši uvek isto, npr. 40x40. Ista cev sa različitim zidom je poseban materijal.',
    iverica: 'Isključi „Ima dezen“ za jednobojne ploče, pa se delovi na njima slobodno okreću.',
    sper: 'Svaka debljina je poseban materijal. Isključi „Žica je bitna“ ako ti smer nije važan.',
    drvo: 'Samo vrsta drveta. Presek i obrađenost upisuješ u lageru za svaki komad.',
  };

  const rows = $derived(materialsOf(kind));
  const badges = $derived(
    Object.fromEntries(['metal', 'iverica', 'sper', 'drvo'].map((k) => [k, { text: materialsOf(k).length }])),
  );

  async function add() {
    error = '';
    const body = { kind, name: '', hasGrain: kind === 'sper' || kind === 'iverica' };
    const last = rows[rows.length - 1];
    if (last && kind !== 'drvo') body.thickness = last.thickness;
    try {
      const { material } = await api.create('/api/materials', body);
      store.materials.push(material);
      table?.focusLast();
    } catch (err) {
      error = err.message;
    }
  }

  function edit(row, key, value) {
    saveLater(`/api/materials/${row.id}`, { [key]: key === 'name' ? String(value) : value });
  }

  async function remove(row) {
    error = '';
    try {
      await api.remove(`/api/materials/${row.id}`);
      store.materials = store.materials.filter((m) => m.id !== row.id);
    } catch (err) {
      error = err.message;
    }
  }

  async function defaults() {
    error = '';
    try {
      const res = await api.post('/api/materials/defaults');
      store.materials = res.materials;
    } catch (err) {
      error = err.message;
    }
  }
</script>

<h2>Šifarnik materijala</h2>
<p class="hint">
  Svaki materijal definišeš jednom. U lageru i projektima ga posle samo biraš sa liste, pa nema grešaka u
  kucanju.
</p>
<KindTabs current={kind} onPick={(k) => (kind = k)} {badges} />

<div class="narrowcol">
  <p class="hint">{HINTS[kind]}</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <EditableTable
    bind:this={table}
    {rows}
    columns={COLUMNS[kind]}
    readonly={!canWrite}
    onEdit={edit}
    onDelete={remove}
    onAdd={add}
    addLabel="Dodaj materijal"
    emptyText={`Još nema materijala za ${KIND_LABELS[kind].toLowerCase()}.`}
  />
  {#if canWrite && !store.materials.length}
    <div class="row" style="margin-top: 14px">
      <button type="button" class="btn quiet" onclick={defaults}>Dodaj uobičajene materijale</button>
      <span class="muted small">cevi 40x40 i 40x20, bela iverica, HDF, breza, bukva, hrast, smrča</span>
    </div>
  {/if}
</div>
