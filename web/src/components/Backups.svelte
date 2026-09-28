<script>
  import { onMount } from 'svelte';
  import { formatDate, formatSize, get, post, put } from '../lib/api.js';
  import ConfirmButton from './ConfirmButton.svelte';

  let { onRestored } = $props();
  let backups = $state([]);
  let settings = $state({ enabled: true, hour: 3, keep: 14 });
  let error = $state('');
  let message = $state('');
  let busy = $state(false);

  async function load() {
    try {
      const data = await get('/api/backups');
      backups = data.backups;
      settings = data.settings;
    } catch (err) {
      error = err.message;
    }
  }
  onMount(load);

  async function run(fn) {
    error = message = '';
    busy = true;
    try {
      await fn();
    } catch (err) {
      error = err.message;
    } finally {
      busy = false;
    }
  }

  const makeNow = () =>
    run(async () => {
      const { backup } = await post('/api/backups');
      message = `Napravljena kopija ${backup.name}.`;
      await load();
    });

  function saveSettings(event) {
    event.preventDefault();
    run(async () => {
      settings = (await put('/api/backups/settings', settings)).settings;
      message = 'Podešavanja kopija su sačuvana.';
      await load();
    });
  }

  const restore = (b) =>
    run(async () => {
      await post(`/api/backups/${b.name}/restore`);
      onRestored();
    });

  const kind = (name) =>
    name.endsWith('-rucna.sqlite')
      ? 'ručna'
      : name.endsWith('-pre-vracanja.sqlite')
        ? 'pre vraćanja'
        : 'dnevna';
</script>

<form class="settingsrow" onsubmit={saveSettings}>
  <label class="check">
    <input type="checkbox" bind:checked={settings.enabled} />
    Pravi kopiju svaki dan
  </label>
  <label class="field inline">
    <span>posle</span>
    <input type="number" min="0" max="23" bind:value={settings.hour} disabled={!settings.enabled} />
    <span>časova</span>
  </label>
  <label class="field inline">
    <span>čuvaj poslednjih</span>
    <input type="number" min="1" max="365" bind:value={settings.keep} />
    <span>dnevnih</span>
  </label>
  <button class="btn" disabled={busy}>Sačuvaj</button>
</form>
<p class="muted small">Ručne kopije i kopije napravljene pre vraćanja se ne brišu same.</p>

{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if message}<p class="ok" role="status">{message}</p>{/if}

<div class="row">
  <button type="button" class="btn solid" disabled={busy} onclick={makeNow}>Napravi kopiju sada</button>
  <a class="btn quiet" href="/api/export" download>Izvezi podatke (JSON)</a>
</div>

{#if backups.length}
  <div class="tablewrap">
    <table>
      <thead><tr><th>Kopija</th><th>Vrsta</th><th class="num">Veličina</th><th></th></tr></thead>
      <tbody>
        {#each backups as b (b.name)}
          <tr>
            <td
              >{formatDate(b.createdAt)}
              <div class="muted small">{b.name}</div></td
            >
            <td>{kind(b.name)}</td>
            <td class="num">{formatSize(b.size)}</td>
            <td
              ><div class="actions">
                <a class="btn quiet" href={'/api/backups/' + b.name} download>Preuzmi</a>
                <ConfirmButton
                  label="Vrati"
                  confirmLabel="Klikni ponovo, ovo menja sve podatke"
                  disabled={busy}
                  onConfirm={() => restore(b)}
                />
              </div></td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="muted small">
    Pre vraćanja se automatski pravi kopija trenutnog stanja. Posle vraćanja svi se prijavljuju ponovo.
  </p>
{:else}
  <p class="muted">Još nema rezervnih kopija.</p>
{/if}
