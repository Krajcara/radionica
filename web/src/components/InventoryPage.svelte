<script>
  import { onMount } from 'svelte';
  import { get } from '../lib/api.js';
  import { api } from '../lib/data.svelte.js';
  import {
    TYPE_LABELS,
    catById,
    childrenOf,
    inv,
    isLow,
    itemsIn,
    loadInventory,
    locById,
    locName,
    pathText,
    search,
  } from '../lib/inventory.svelte.js';
  import { fmt } from '../lib/format.js';
  import ItemEditor from './ItemEditor.svelte';
  import Labels from './Labels.svelte';
  import LocationPanel from './LocationPanel.svelte';

  let { canWrite } = $props();
  let route = $state(parse());
  let query = $state('');
  let category = $state(null);
  let editor = $state(null); // { item } ili { locationId }
  let printId = $state(null);
  let error = $state('');
  let open = $state(new Set());

  function parse() {
    const parts = location.hash.replace('#/', '').split('/');
    if (parts[1] === 'l' && parts[2]) return { code: decodeURIComponent(parts[2]) };
    return { id: parts[1] && /^\d+$/.test(parts[1]) ? Number(parts[1]) : null };
  }

  async function resolveCode(code) {
    try {
      const { id } = await get(`/api/locations/by-code/${encodeURIComponent(code)}`);
      location.replace(`#/inventar/${id}`);
    } catch (err) {
      error = err.message;
      route = { id: null };
    }
  }

  onMount(() => {
    if (!inv.loaded) loadInventory();
    const onHash = () => (route = parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  $effect(() => {
    if (route.code) resolveCode(route.code);
  });

  const current = $derived(route.id ? locById(route.id) : null);
  // Otvori granu stabla do izabrane lokacije.
  $effect(() => {
    if (!current) return;
    let p = current.parentId;
    const next = new Set(open);
    while (p) {
      next.add(p);
      p = locById(p)?.parentId;
    }
    if (next.size !== open.size) open = next;
  });

  const searching = $derived(query.trim().length > 0 || category !== null);
  const results = $derived(searching ? search(query, category) : null);
  const low = $derived(inv.items.filter(isLow));
  const lent = $derived(inv.loans.filter((l) => !l.returnedAt));
  const homeless = $derived(inv.items.filter((i) => !i.locationId));

  function toggle(id) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    open = next;
  }

  async function addRoot() {
    error = '';
    try {
      const { location: l } = await api.create('/api/locations', { type: 'regal', name: '' });
      inv.locations.push(l);
      window.location.hash = `#/inventar/${l.id}`;
    } catch (err) {
      error = err.message;
    }
  }

  async function renameCategory(c) {
    const name = prompt('Novi naziv kategorije', c.name);
    if (!name?.trim() || name.trim() === c.name) return;
    try {
      await api.patch(`/api/categories/${c.id}`, { name: name.trim() });
      c.name = name.trim();
    } catch (err) {
      error = err.message;
    }
  }
  async function deleteCategory(c) {
    await api.remove(`/api/categories/${c.id}`);
    inv.categories = inv.categories.filter((x) => x.id !== c.id);
    for (const i of inv.items) if (i.categoryId === c.id) i.categoryId = null;
    if (category === c.id) category = null;
  }
  async function addCategory() {
    const name = prompt('Naziv nove kategorije');
    if (!name?.trim()) return;
    try {
      const { category: c } = await api.create('/api/categories', { name: name.trim() });
      inv.categories.push(c);
    } catch (err) {
      error = err.message;
    }
  }
  const itemById = (id) => inv.items.find((i) => i.id === id);
</script>

{#snippet tree(parentId, depth)}
  {#each childrenOf(parentId) as l (l.id)}
    {@const kids = childrenOf(l.id).length}
    <div class="tnode" style="padding-left: {depth * 16}px">
      {#if kids}
        <button
          type="button"
          class="tgl"
          aria-label={open.has(l.id) ? 'Skupi' : 'Raširi'}
          aria-expanded={open.has(l.id)}
          onclick={() => toggle(l.id)}>{open.has(l.id) ? '▾' : '▸'}</button
        >
      {:else}<span class="tgl"></span>{/if}
      <a href={`#/inventar/${l.id}`} class:sel={current?.id === l.id}>
        <span>{locName(l)}</span><span class="muted small">{itemsIn(l.id, true).length}</span>
      </a>
    </div>
    {#if kids && open.has(l.id)}{@render tree(l.id, depth + 1)}{/if}
  {/each}
{/snippet}

{#if printId}
  <Labels rootId={printId} onClose={() => (printId = null)} />
{/if}

<div class="invtop">
  <label class="field grow">
    <span>Traži po celoj radionici</span>
    <input type="search" bind:value={query} placeholder="npr. wago, bušilica, A-2" />
  </label>
  {#if canWrite}
    <button
      type="button"
      class="btn solid selfend"
      onclick={() => (editor = { locationId: current?.id ?? null })}>Dodaj stvar</button
    >
  {/if}
</div>
<div class="chips">
  <button type="button" class:on={category === null} onclick={() => (category = null)}>Sve</button>
  {#each inv.categories as c (c.id)}
    <button
      type="button"
      class:on={category === c.id}
      onclick={() => (category = category === c.id ? null : c.id)}>{c.name}</button
    >
  {/each}
</div>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if inv.error}<p class="error" role="alert">{inv.error}</p>{/if}

<div class="invgrid">
  <aside class="card treecard" aria-label="Lokacije">
    <h3>Lokacije</h3>
    {#if !inv.locations.length}<p class="muted small">Još nema lokacija.</p>{/if}
    {@render tree(null, 0)}
    {#if canWrite}<button type="button" class="btn quiet" onclick={addRoot}>Nova lokacija na vrhu</button
      >{/if}
  </aside>

  <section class="invmain">
    {#if searching}
      <h3>Rezultati: {results.items.length + results.locations.length}</h3>
      {#each results.locations as l (l.id)}
        <a class="resrow" href={`#/inventar/${l.id}`} onclick={() => (query = '')}>
          <b>{locName(l)}</b>
          <span class="muted small">{TYPE_LABELS[l.type]}{l.code ? `, ${l.code}` : ''}</span>
          <span class="muted small">{pathText(l.parentId)}</span>
        </a>
      {/each}
      {#each results.items as i (i.id)}
        <button type="button" class="resrow" onclick={() => (editor = { item: i })}>
          <b>{i.name}</b>
          <span class="muted small"
            >{fmt(i.qty)} {i.unit}{catById(i.categoryId) ? `, ${catById(i.categoryId).name}` : ''}</span
          >
          <span class="where">{pathText(i.locationId)}</span>
        </button>
      {:else}
        {#if !results.locations.length}<p class="muted">Ništa nije pronađeno.</p>{/if}
      {/each}
    {:else if current}
      {#key current.id}
        <LocationPanel
          loc={current}
          {canWrite}
          onOpenItem={(i) => (editor = { item: i })}
          onNewItem={(id) => (editor = { locationId: id })}
          onPrint={(id) => (printId = id)}
        />
      {/key}
    {:else}
      <h2>Inventar</h2>
      <p class="hint">
        Napravi lokacije redom kako stoje u radionici (regal, polica, kutija), pa u njih upisuj stvari. Za
        početak je dovoljno da za svaku kutiju grubo napišeš šta je unutra i slikaš sadržaj.
      </p>
      <div class="stats">
        <span><b>{inv.locations.length}</b> lokacija</span>
        <span><b>{inv.items.length}</b> stvari</span>
        <span><b>{lent.length}</b> pozajmljeno</span>
      </div>

      {#if low.length}
        <div class="buy">
          <h3>Za dokupiti</h3>
          <ul>
            {#each low as i (i.id)}
              <li>
                <button type="button" class="linkbtn" onclick={() => (editor = { item: i })}>{i.name}</button
                >: ima
                {fmt(i.qty)}
                {i.unit}, dokupi ispod {fmt(i.minQty)}
                <span class="muted small">({pathText(i.locationId)})</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if lent.length}
        <h4 class="group-title">Pozajmljeno</h4>
        <ul class="plainlist">
          {#each lent as l (l.id)}
            {@const it = itemById(l.itemId)}
            <li>
              <button type="button" class="linkbtn" onclick={() => (editor = { item: it })}>{it?.name}</button
              >:
              <b>{l.borrower}</b>, od {new Date(l.since).toLocaleDateString('sr-Latn-RS')}
            </li>
          {/each}
        </ul>
      {/if}

      {#if homeless.length}
        <h4 class="group-title">Bez lokacije ({homeless.length})</h4>
        <ul class="plainlist">
          {#each homeless as i (i.id)}
            <li>
              <button type="button" class="linkbtn" onclick={() => (editor = { item: i })}>{i.name}</button>
            </li>
          {/each}
        </ul>
      {/if}

      <h4 class="group-title">Kategorije</h4>
      <div class="catlist">
        {#each inv.categories as c (c.id)}
          <span class="catitem">
            {c.name} <span class="muted small">{inv.items.filter((i) => i.categoryId === c.id).length}</span>
            {#if canWrite}
              <button type="button" class="linkbtn small" onclick={() => renameCategory(c)}>preimenuj</button>
              <button
                type="button"
                class="del"
                aria-label={`Obriši kategoriju ${c.name}`}
                onclick={() => deleteCategory(c)}>×</button
              >
            {/if}
          </span>
        {/each}
        {#if canWrite}<button type="button" class="btn quiet" onclick={addCategory}>Nova kategorija</button
          >{/if}
      </div>
    {/if}
  </section>
</div>

{#if editor}
  <ItemEditor
    item={editor.item ?? null}
    locationId={editor.locationId ?? null}
    {canWrite}
    onClose={() => (editor = null)}
  />
{/if}
