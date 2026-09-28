<script>
  import { onMount } from 'svelte';
  import { KIND_LABELS, KINDS, computeProject, materialLabel } from '@radionica/shared';
  import { get } from '../lib/api.js';
  import { api, materialsOf, reloadStock, saveLater, store } from '../lib/data.svelte.js';
  import { allCut, plural } from '../lib/format.js';
  import ConfirmButton from './ConfirmButton.svelte';
  import EditableTable from './EditableTable.svelte';
  import KindTabs from './KindTabs.svelte';
  import Results1D from './Results1D.svelte';
  import Results2D from './Results2D.svelte';

  let { projectId, canWrite } = $props();
  let project = $state(null);
  let tab = $state('pregled');
  let error = $state('');
  let notice = $state('');
  let table = $state();

  onMount(async () => {
    try {
      project = (await get(`/api/projects/${projectId}`)).project;
    } catch (err) {
      error = err.message;
    }
  });

  const done = $derived(Boolean(project?.doneAt));
  const editable = $derived(canWrite && !done);
  const result = $derived(
    project && !done
      ? computeProject({
          parts: project.parts,
          stock: store.stock,
          materials: store.materials,
          settings: store.cutting,
        })
      : null,
  );
  const badges = $derived(
    result
      ? Object.fromEntries(
          KINDS.filter((k) => result.cats[k].total).map((k) => [
            k,
            {
              text: `${result.cats[k].placed}/${result.cats[k].total}`,
              cls: result.cats[k].placed === result.cats[k].total ? 'good' : 'bad',
            },
          ]),
        )
      : {},
  );

  const matOptions = (k, any) => () => [
    ...(any ? [{ value: '', label: 'bilo koje' }] : []),
    ...materialsOf(k).map((m) => ({ value: m.id, label: materialLabel(m) })),
  ];
  const COLUMNS = {
    metal: [
      { key: 'name', label: 'Naziv', type: 'text', placeholder: 'npr. Noga' },
      { key: 'materialId', label: 'Materijal', type: 'select', numeric: true, options: matOptions('metal') },
      { key: 'anyWall', label: 'Bilo koji zid', type: 'check' },
      { key: 'length', label: 'Dužina', type: 'num' },
      { key: 'qty', label: 'Kom', type: 'num' },
    ],
    iverica: [
      { key: 'name', label: 'Naziv', type: 'text', placeholder: 'npr. Stranica' },
      {
        key: 'materialId',
        label: 'Materijal',
        type: 'select',
        numeric: true,
        options: matOptions('iverica'),
      },
      { key: 'length', label: 'Dužina', type: 'num' },
      { key: 'width', label: 'Širina', type: 'num' },
      { key: 'grain', label: 'Prati dezen', type: 'check' },
      { key: 'qty', label: 'Kom', type: 'num' },
    ],
    sper: [
      { key: 'name', label: 'Naziv', type: 'text', placeholder: 'npr. Polica' },
      { key: 'materialId', label: 'Materijal', type: 'select', numeric: true, options: matOptions('sper') },
      { key: 'length', label: 'Dužina', type: 'num' },
      { key: 'width', label: 'Širina', type: 'num' },
      { key: 'grain', label: 'Prati žicu', type: 'check' },
      { key: 'qty', label: 'Kom', type: 'num' },
    ],
    drvo: [
      { key: 'name', label: 'Naziv', type: 'text', placeholder: 'npr. Letva' },
      { key: 'materialId', label: 'Drvo', type: 'select', numeric: true, options: matOptions('drvo', true) },
      { key: 'thickness', label: 'Debljina', type: 'num' },
      { key: 'width', label: 'Širina', type: 'num' },
      { key: 'length', label: 'Dužina', type: 'num' },
      { key: 'planed', label: 'Obrađeno', type: 'check' },
      { key: 'qty', label: 'Kom', type: 'num' },
    ],
  };
  const HINTS = {
    metal:
      'Dužine upiši tačno onakve kakve sečeš. „Bilo koji zid“ uzima isti profil sa bilo kojom debljinom zida.',
    iverica: 'Kod dela koji prati dezen, dužina je mera duž koje ide dezen.',
    sper: 'Kod dela koji prati žicu, dužina je mera duž koje ide žica.',
    drvo: 'Upiši gotove mere dela. Ako je deo obrađen, a komad u lageru nije, dodaje se mera za rendisanje.',
  };

  const partsOf = (k) => project.parts.filter((p) => p.kind === k);

  async function addPart() {
    error = '';
    const k = tab;
    const last = partsOf(k).at(-1);
    const body = { kind: k, qty: 1, materialId: last?.materialId ?? materialsOf(k)[0]?.id ?? null };
    if (k === 'iverica' || k === 'sper') body.grain = last?.grain ?? true;
    if (k === 'metal') body.anyWall = last?.anyWall ?? false;
    if (k === 'drvo') {
      Object.assign(body, {
        thickness: last?.thickness ?? null,
        width: last?.width ?? null,
        planed: last?.planed ?? true,
      });
      if (last && last.materialId === null) body.materialId = null;
    }
    try {
      const { part } = await api.create(`/api/projects/${project.id}/parts`, body);
      project.parts.push(part);
      table?.focusLast();
    } catch (err) {
      error = err.message;
    }
  }

  const editPart = (row, key, value) => saveLater(`/api/parts/${row.id}`, { [key]: value });

  async function removePart(row) {
    try {
      await api.remove(`/api/parts/${row.id}`);
      project.parts = project.parts.filter((p) => p.id !== row.id);
    } catch (err) {
      error = err.message;
    }
  }

  function rename(e) {
    project.name = e.currentTarget.value;
    saveLater(`/api/projects/${project.id}`, { name: project.name });
  }

  async function finish() {
    error = '';
    try {
      const res = await api.post(`/api/projects/${project.id}/finish`);
      project = res.project;
      await reloadStock();
      notice = `Sa lagera je skinuto ${res.taken} ${plural(res.taken, 'komad', 'komada', 'komada')}, a vraćeno je ${res.added} ${plural(res.added, 'ostatak', 'ostatka', 'ostataka')}.`;
    } catch (err) {
      error = err.message;
    }
  }

  async function undo() {
    error = '';
    try {
      project = (await api.post(`/api/projects/${project.id}/undo`)).project;
      await reloadStock();
      notice = 'Lager je vraćen na stanje pre završetka projekta.';
    } catch (err) {
      error = err.message;
    }
  }

  async function copy() {
    const { project: p } = await api.post(`/api/projects/${project.id}/copy`);
    location.hash = `#/projekti/${p.id}`;
  }

  async function remove() {
    await api.remove(`/api/projects/${project.id}`);
    location.hash = '#/projekti';
  }

  function groupMiss(r) {
    const m = new Map();
    for (const x of r.miss) m.set(x.text, (m.get(x.text) || 0) + 1);
    return [...m.entries()];
  }
</script>

{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if project}
  <div class="phead">
    <a href="#/projekti" class="muted">Nazad na projekte</a>
    <input
      class="pname"
      value={project.name}
      aria-label="Naziv projekta"
      disabled={!editable}
      oninput={rename}
    />
  </div>
  <KindTabs current={tab} onPick={(k) => (tab = k)} {badges} extra={{ id: 'pregled', label: 'Pregled' }} />

  {#if tab === 'pregled'}
    {#if notice}<p class="ok" role="status">{notice}</p>{/if}
    {#if done}
      <div class="notice">
        <p>
          <b>Projekat je završen {new Date(project.doneAt).toLocaleDateString('sr-Latn-RS')}.</b> Iskorišćeni materijal
          je skinut sa lagera, a ostaci su vraćeni. Raspored se više ne računa, jer tog materijala više nema u lageru.
        </p>
        {#if canWrite}
          <div class="row">
            <button type="button" class="btn" onclick={copy}>Napravi kopiju projekta</button>
            <ConfirmButton
              label="Poništi i vrati lager"
              confirmLabel="Klikni ponovo da vratiš lager"
              onConfirm={undo}
            />
            <ConfirmButton
              label="Obriši projekat"
              confirmLabel="Klikni ponovo da obrišeš"
              onConfirm={remove}
            />
          </div>
          <p class="muted small">
            „Poništi“ vraća lager tačno na stanje pre završetka, pa se gube i izmene lagera napravljene posle
            toga.
          </p>
        {/if}
      </div>
    {:else if result}
      {#if !result.total}
        <p class="verdict">Još nema delova.</p>
        <p class="sub">Izaberi vrstu materijala gore i upiši delove koji ti trebaju.</p>
      {:else if result.placed === result.total}
        <p class="verdict ok">Imaš sav materijal za ovaj projekat.</p>
        <p class="sub">{allCut(result.total)} Raspored sečenja vidiš u svakom odeljku.</p>
      {:else}
        <p class="verdict bad">
          Fali materijal za {result.total - result.placed}
          {plural(result.total - result.placed, 'deo', 'dela', 'delova')}.
        </p>
        <p class="sub">Ispod je spisak šta treba da kupiš, po standardnim merama iz podešavanja.</p>
      {/if}

      {#if result.total}
        <div class="catstat">
          {#each KINDS as k (k)}
            {@const r = result.cats[k]}
            <div class="catrow">
              <b><span class="dot {k}"></span>{KIND_LABELS[k]}</b>
              {#if !r.total}
                <span class="muted">nije potrebno</span><span></span>
              {:else}
                <span class={r.placed === r.total ? 'okt' : 'badt'}>{r.placed} od {r.total}</span>
                <span class="muted small">
                  {r.placed === r.total
                    ? 'imaš sve'
                    : 'nedostaje: ' +
                      groupMiss(r)
                        .map(([t, c]) => `${c} × ${t}`)
                        .join('; ')}
                </span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if result.buy.length}
        <div class="buy">
          <h3>Spisak za kupovinu</h3>
          <ul>
            {#each result.buy as b (b.text)}<li>{b.text}</li>{/each}
          </ul>
          <p class="muted small">Kad kupiš, dodaj materijal u lager i raspored se sam preračuna.</p>
        </div>
      {/if}

      {#if canWrite}
        <div class="row">
          <ConfirmButton
            kind="solid"
            label="Završi projekat i skini materijal sa lagera"
            confirmLabel="Klikni ponovo da potvrdiš"
            disabled={!result.placed}
            onConfirm={finish}
          />
          <button type="button" class="btn quiet" onclick={copy}>Napravi kopiju</button>
          <ConfirmButton label="Obriši projekat" confirmLabel="Klikni ponovo da obrišeš" onConfirm={remove} />
        </div>
        {#if result.placed && result.placed < result.total}
          <p class="muted small" style="margin-top: 8px">
            Pošto nešto fali, sa lagera će se skinuti samo materijal za delove koji mogu da se iseku. Bolje je
            da prvo dodaš kupljeni materijal u lager.
          </p>
        {/if}
      {/if}
    {/if}
  {:else}
    <div class="grid2">
      <div>
        <h3>Delovi koji mi trebaju</h3>
        <p class="hint">{HINTS[tab]}</p>
        {#if !materialsOf(tab).length && tab !== 'drvo'}
          <div class="empty">
            <p>U šifarniku još nema materijala za {KIND_LABELS[tab].toLowerCase()}.</p>
            <p class="muted small">Dodaj ga u <a href="#/sifarnik">Šifarniku</a>.</p>
          </div>
        {:else}
          <EditableTable
            bind:this={table}
            rows={partsOf(tab)}
            columns={COLUMNS[tab]}
            readonly={!editable}
            onEdit={editPart}
            onDelete={removePart}
            onAdd={addPart}
            addLabel="Dodaj deo"
            emptyText="Još nema delova. Dodaj prvi dugmetom ispod."
          />
        {/if}
      </div>
      <div aria-live="polite">
        {#if done}
          <div class="empty">Projekat je završen, pa se raspored više ne računa.</div>
        {:else if result}
          {@const r = result.cats[tab]}
          {#if !r.total}
            <div class="empty">Kad upišeš delove, ovde se pojavljuje raspored sečenja iz lagera.</div>
          {:else}
            <p class="rverdict" class:okt={r.placed === r.total}>
              {r.placed === r.total
                ? allCut(r.total)
                : `Iz lagera može da se iseče ${r.placed} od ${r.total}.`}
            </p>
            {#if r.miss.length}
              <div class="missing">
                <b>Nedostaje materijal za ove delove</b>
                <ul>
                  {#each groupMiss(r) as [t, c] (t)}<li>{c} × {t}</li>{/each}
                </ul>
              </div>
            {/if}
            {#if tab === 'metal' || tab === 'drvo'}
              <Results1D result={r} kind={tab} />
            {:else}
              <Results2D result={r} kind={tab} />
            {/if}
          {/if}
        {/if}
      </div>
    </div>
  {/if}
{/if}
