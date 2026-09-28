<script>
  import { onMount } from 'svelte';
  import { computeProject } from '@radionica/shared';
  import { get } from '../lib/api.js';
  import { api, store } from '../lib/data.svelte.js';
  import { countPieces, plural } from '../lib/format.js';
  import ProjectView from './ProjectView.svelte';

  let { sub, canWrite } = $props();
  let projects = $state([]);
  let loaded = $state(false);
  let error = $state('');

  async function load() {
    try {
      projects = (await get('/api/projects')).projects;
      loaded = true;
    } catch (err) {
      error = err.message;
    }
  }
  onMount(load);

  const cards = $derived(
    projects.map((p) => {
      const n = countPieces(p.parts);
      if (p.doneAt)
        return { p, n, cls: 'done', st: `Završen ${new Date(p.doneAt).toLocaleDateString('sr-Latn-RS')}` };
      if (!n) return { p, n, cls: '', st: 'Još nema delova' };
      const r = computeProject({
        parts: p.parts,
        stock: store.stock,
        materials: store.materials,
        settings: store.cutting,
      });
      const miss = r.total - r.placed;
      return miss
        ? { p, n, cls: 'bad', st: `Fali materijal za ${miss} ${plural(miss, 'deo', 'dela', 'delova')}` }
        : { p, n, cls: 'ok', st: 'Imaš sav materijal' };
    }),
  );

  async function create() {
    error = '';
    try {
      const { project } = await api.create('/api/projects', { name: 'Novi projekat' });
      location.hash = `#/projekti/${project.id}`;
    } catch (err) {
      error = err.message;
    }
  }
</script>

{#if sub}
  {#key sub}
    <ProjectView projectId={sub} {canWrite} />
  {/key}
{:else}
  <div class="list-head">
    <div>
      <h2>Projekti</h2>
      <p class="hint">
        Za svaki projekat upiši delove koji ti trebaju. Program proverava da li imaš materijal u lageru.
      </p>
    </div>
    {#if canWrite}<button type="button" class="btn solid" onclick={create}>Novi projekat</button>{/if}
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if loaded && !projects.length}
    <div class="empty">
      <p>Još nemaš nijedan projekat.</p>
      <p class="muted small">
        Prvo u <a href="#/sifarnik">Šifarniku</a> definiši materijale, u <a href="#/materijal">Materijalu</a> upiši
        šta imaš, pa napravi projekat i upiši delove.
      </p>
    </div>
  {:else}
    <div class="plist">
      {#each cards as c (c.p.id)}
        <a class="pcard {c.cls}" href={`#/projekti/${c.p.id}`}>
          <b>{c.p.name}</b>
          <span class="muted small">{c.n} {plural(c.n, 'deo', 'dela', 'delova')}</span>
          <span class="st small">{c.st}</span>
        </a>
      {/each}
    </div>
  {/if}
{/if}
