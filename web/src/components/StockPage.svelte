<script>
  import { KIND_LABELS, materialLabel } from '@radionica/shared';
  import { api, materialById, materialsOf, saveLater, store } from '../lib/data.svelte.js';
  import { countPieces, fmt, plural } from '../lib/format.js';
  import EditableTable from './EditableTable.svelte';
  import KindTabs from './KindTabs.svelte';

  let { canWrite } = $props();
  let kind = $state('metal');
  let error = $state('');
  let table = $state();

  const matOptions = (k) => () => materialsOf(k).map((m) => ({ value: m.id, label: materialLabel(m) }));
  const grainOptions = (k) => (row) => {
    const m = materialById(row.materialId);
    if (m && !m.hasGrain) return [{ value: 'none', label: 'nije bitno' }];
    return [
      { value: 'l', label: 'po dužini' },
      { value: 'w', label: 'po širini' },
      { value: 'none', label: k === 'sper' ? 'nije bitno' : 'bez dezena' },
    ];
  };
  const noGrain = (row) => {
    const m = materialById(row.materialId);
    return Boolean(m && !m.hasGrain);
  };

  const COLUMNS = {
    metal: [
      { key: 'materialId', label: 'Materijal', type: 'select', numeric: true, options: matOptions('metal') },
      { key: 'length', label: 'Dužina', type: 'num' },
      { key: 'qty', label: 'Kom', type: 'num' },
      { key: 'note', label: 'Napomena', type: 'text' },
    ],
    iverica: [
      {
        key: 'materialId',
        label: 'Materijal',
        type: 'select',
        numeric: true,
        options: matOptions('iverica'),
      },
      { key: 'length', label: 'Dužina', type: 'num' },
      { key: 'width', label: 'Širina', type: 'num' },
      {
        key: 'grain',
        label: 'Dezen ide',
        type: 'select',
        options: grainOptions('iverica'),
        disabled: noGrain,
      },
      { key: 'qty', label: 'Kom', type: 'num' },
      { key: 'note', label: 'Napomena', type: 'text' },
    ],
    sper: [
      { key: 'materialId', label: 'Materijal', type: 'select', numeric: true, options: matOptions('sper') },
      { key: 'length', label: 'Dužina', type: 'num' },
      { key: 'width', label: 'Širina', type: 'num' },
      { key: 'grain', label: 'Žica ide', type: 'select', options: grainOptions('sper'), disabled: noGrain },
      { key: 'qty', label: 'Kom', type: 'num' },
      { key: 'note', label: 'Napomena', type: 'text' },
    ],
    drvo: [
      { key: 'materialId', label: 'Drvo', type: 'select', numeric: true, options: matOptions('drvo') },
      { key: 'thickness', label: 'Debljina', type: 'num' },
      { key: 'width', label: 'Širina', type: 'num' },
      { key: 'length', label: 'Dužina', type: 'num' },
      { key: 'planed', label: 'Obrađeno', type: 'check' },
      { key: 'qty', label: 'Kom', type: 'num' },
      { key: 'note', label: 'Napomena', type: 'text' },
    ],
  };
  const HINTS = {
    metal: 'Cevi i profili koje imaš. Dužina je u milimetrima.',
    iverica: 'Za svaku ploču izaberi kako ide dezen: po dužini ili po širini ploče.',
    sper: 'Za svaku ploču izaberi kako ide žica na licu.',
    drvo: 'Daske, grede i letve. Presek je debljina × širina. Označi „Obrađeno“ ako je komad već rendisan.',
  };

  const rows = $derived(store.stock.filter((s) => s.kind === kind));
  const badges = $derived(
    Object.fromEntries(
      ['metal', 'iverica', 'sper', 'drvo'].map((k) => [
        k,
        { text: countPieces(store.stock.filter((s) => s.kind === k)) },
      ]),
    ),
  );
  const summary = $derived.by(() => {
    const pcs = countPieces(rows);
    if (!pcs) return 'Lager je prazan za ovu vrstu materijala.';
    if (kind === 'metal' || kind === 'drvo') {
      const m = rows.reduce((a, r) => a + (r.length || 0) * Math.max(0, r.qty || 0), 0) / 1000;
      return `Ukupno ${pcs} ${plural(pcs, 'komad', 'komada', 'komada')}, ${fmt(m)} m.`;
    }
    const area =
      rows.reduce((a, r) => a + (r.length || 0) * (r.width || 0) * Math.max(0, r.qty || 0), 0) / 1e6;
    return `Ukupno ${pcs} ${plural(pcs, 'ploča', 'ploče', 'ploča')}, ${fmt(area)} m².`;
  });

  async function add() {
    error = '';
    const last = rows[rows.length - 1];
    const mats = materialsOf(kind);
    const materialId = last?.materialId ?? mats[0]?.id ?? null;
    const m = materialById(materialId);
    const body = { kind, materialId, qty: 1 };
    if (kind === 'iverica' || kind === 'sper') body.grain = m && !m.hasGrain ? 'none' : (last?.grain ?? 'l');
    if (kind === 'drvo')
      Object.assign(body, {
        thickness: last?.thickness ?? null,
        width: last?.width ?? null,
        planed: last?.planed ?? false,
      });
    try {
      const { item } = await api.create('/api/stock', body);
      store.stock.push(item);
      table?.focusLast();
    } catch (err) {
      error = err.message;
    }
  }

  function edit(row, key, value) {
    const changes = { [key]: value };
    if (key === 'materialId') {
      const m = materialById(value);
      if (m && (kind === 'iverica' || kind === 'sper')) {
        // Bez dezena nema smera; kad se pređe na materijal sa dezenom, podrazumeva se „po dužini“.
        const grain = !m.hasGrain ? 'none' : row.grain === 'none' ? 'l' : row.grain;
        if (grain !== row.grain) {
          row.grain = grain;
          changes.grain = grain;
        }
      }
    }
    saveLater(`/api/stock/${row.id}`, changes);
  }

  async function remove(row) {
    error = '';
    try {
      await api.remove(`/api/stock/${row.id}`);
      store.stock = store.stock.filter((s) => s.id !== row.id);
    } catch (err) {
      error = err.message;
    }
  }
</script>

<h2>Materijal na lageru</h2>
<p class="hint">
  Sav materijal koji imaš u radionici. Kad završiš projekat, iskorišćeno se skida odavde, a upotrebljivi
  ostaci se vraćaju.
</p>
<KindTabs current={kind} onPick={(k) => (kind = k)} {badges} />

<div class="narrowcol wide">
  <p class="hint">{HINTS[kind]}</p>
  {#if !materialsOf(kind).length}
    <div class="empty">
      <p>U šifarniku još nema materijala za {KIND_LABELS[kind].toLowerCase()}.</p>
      <p class="muted small">
        Prvo ga dodaj u <a href="#/sifarnik">Šifarniku</a>, pa ga ovde biraš sa liste.
      </p>
    </div>
  {:else}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <EditableTable
      bind:this={table}
      {rows}
      columns={COLUMNS[kind]}
      readonly={!canWrite}
      onEdit={edit}
      onDelete={remove}
      onAdd={add}
      addLabel={kind === 'metal' || kind === 'drvo' ? 'Dodaj komad' : 'Dodaj ploču'}
      emptyText="Lager je prazan. Dodaj prvi komad dugmetom ispod."
    />
    <p class="summary">{summary}</p>
  {/if}
</div>
