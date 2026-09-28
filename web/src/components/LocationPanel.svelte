<script>
  import { api, saveLater } from '../lib/data.svelte.js';
  import {
    TYPE_LABELS,
    activeLoan,
    catById,
    childrenOf,
    inv,
    isLow,
    itemsIn,
    locName,
    locationOptions,
    pathOf,
    photosOf,
  } from '../lib/inventory.svelte.js';
  import { fmt } from '../lib/format.js';
  import ConfirmButton from './ConfirmButton.svelte';
  import Photos from './Photos.svelte';

  let { loc, canWrite, onOpenItem, onNewItem, onPrint } = $props();
  let deep = $state(false);
  let error = $state('');

  const path = $derived(pathOf(loc.id));
  const children = $derived(childrenOf(loc.id));
  const items = $derived(itemsIn(loc.id, deep));
  const deepCount = $derived(itemsIn(loc.id, true).length);

  function edit(key, value) {
    error = '';
    loc[key] = value;
    saveLater(`/api/locations/${loc.id}`, { [key]: value });
  }

  async function saveCode(e) {
    error = '';
    const code = e.currentTarget.value.trim().toUpperCase();
    try {
      const { location } = await api.patch(`/api/locations/${loc.id}`, { code: code || null });
      loc.code = location.code;
    } catch (err) {
      error = err.message;
      e.currentTarget.value = loc.code || '';
    }
  }

  async function move(e) {
    error = '';
    const parentId = e.currentTarget.value ? Number(e.currentTarget.value) : null;
    try {
      await api.patch(`/api/locations/${loc.id}`, { parentId });
      loc.parentId = parentId;
    } catch (err) {
      error = err.message;
    }
  }

  async function addChild() {
    error = '';
    const type =
      { regal: 'polica', ormar: 'polica', fiokar: 'fioka', prostorija: 'regal', polica: 'kutija' }[
        loc.type
      ] || 'kutija';
    try {
      const { location } = await api.create('/api/locations', { parentId: loc.id, type, name: '' });
      inv.locations.push(location);
      window.location.hash = `#/inventar/${location.id}`;
    } catch (err) {
      error = err.message;
    }
  }

  async function remove() {
    error = '';
    try {
      await api.remove(`/api/locations/${loc.id}`);
      inv.locations = inv.locations.filter((l) => l.id !== loc.id);
      window.location.hash = loc.parentId ? `#/inventar/${loc.parentId}` : '#/inventar';
    } catch (err) {
      error = err.message;
    }
  }
</script>

<nav class="crumbs" aria-label="Putanja">
  <a href="#/inventar">Inventar</a>
  {#each path.slice(0, -1) as p (p.id)}<span>›</span><a href={`#/inventar/${p.id}`}>{locName(p)}</a>{/each}
</nav>

<div class="lochead">
  <input
    class="pname"
    value={loc.name}
    placeholder={`${TYPE_LABELS[loc.type]} ${loc.code || ''}`}
    aria-label="Naziv lokacije"
    disabled={!canWrite}
    oninput={(e) => edit('name', e.currentTarget.value)}
  />
</div>

<div class="formrow">
  <label class="field">
    <span>Vrsta</span>
    <select value={loc.type} disabled={!canWrite} onchange={(e) => edit('type', e.currentTarget.value)}>
      {#each inv.types as t (t)}<option value={t}>{TYPE_LABELS[t]}</option>{/each}
    </select>
  </label>
  <label class="field">
    <span>Oznaka</span>
    <input class="codein" value={loc.code || ''} disabled={!canWrite} onchange={saveCode} />
  </label>
  <label class="field grow">
    <span>Nalazi se u</span>
    <select value={loc.parentId ?? ''} disabled={!canWrite} onchange={move}>
      <option value="">radionica (vrh)</option>
      {#each locationOptions(loc.id) as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
    </select>
  </label>
</div>
<label class="field">
  <span>Grubo, šta je unutra</span>
  <textarea
    rows="2"
    value={loc.note}
    disabled={!canWrite}
    placeholder="npr. kleme, osigurači, izolir trake, ostaci kablova"
    oninput={(e) => edit('note', e.currentTarget.value)}></textarea>
</label>
<Photos ownerType="location" ownerId={loc.id} {canWrite} />
{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if children.length || canWrite}
  <h4 class="group-title">Unutra</h4>
  <div class="locgrid">
    {#each children as c (c.id)}
      <a class="loccard" href={`#/inventar/${c.id}`}>
        {#if photosOf('location', c.id)[0]}
          <img src={`/api/photos/${photosOf('location', c.id)[0].id}/thumb`} alt="" loading="lazy" />
        {/if}
        <b>{locName(c)}</b>
        <span class="muted small"
          >{TYPE_LABELS[c.type]}{c.code ? `, ${c.code}` : ''}, {itemsIn(c.id, true).length} stvari</span
        >
      </a>
    {/each}
    {#if canWrite}
      <button type="button" class="loccard addloc" onclick={addChild}>Dodaj lokaciju unutra</button>
    {/if}
  </div>
{/if}

<div class="list-head" style="margin-top: 18px">
  <h4 class="group-title grow" style="margin: 0">Stvari ({items.length})</h4>
  {#if deepCount !== itemsIn(loc.id, false).length || deep}
    <label class="check small"><input type="checkbox" bind:checked={deep} /> i iz unutrašnjih lokacija</label>
  {/if}
</div>
{#if items.length}
  <div class="tablewrap">
    <table>
      <thead
        ><tr
          ><th>Stvar</th><th>Kategorija</th><th class="num">Količina</th>{#if deep}<th>Gde</th>{/if}<th
          ></th></tr
        ></thead
      >
      <tbody>
        {#each items as i (i.id)}
          <tr class="clickrow" onclick={() => onOpenItem(i)}>
            <td>
              <button
                type="button"
                class="linkbtn strong"
                onclick={(e) => (e.stopPropagation(), onOpenItem(i))}>{i.name}</button
              >
              {#if photosOf('item', i.id).length}<span class="muted small"> (slika)</span>{/if}
            </td>
            <td class="muted">{catById(i.categoryId)?.name || ''}</td>
            <td class="num">{fmt(i.qty)} {i.unit}</td>
            {#if deep}<td class="muted small">{locName(inv.locations.find((l) => l.id === i.locationId))}</td
              >{/if}
            <td>
              {#if activeLoan(i.id)}<span class="tag">pozajmljeno: {activeLoan(i.id).borrower}</span>{/if}
              {#if isLow(i)}<span class="tag warnt">dokupiti</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <p class="muted">Ovde još nema popisanih stvari.</p>
{/if}

<div class="row" style="margin-top: 14px">
  {#if canWrite}<button type="button" class="btn solid" onclick={() => onNewItem(loc.id)}
      >Dodaj stvar ovde</button
    >{/if}
  <button type="button" class="btn" onclick={() => onPrint(loc.id)}>Štampaj nalepnice</button>
  {#if canWrite}
    <ConfirmButton label="Obriši lokaciju" confirmLabel="Klikni ponovo da obrišeš" onConfirm={remove} />
  {/if}
</div>
