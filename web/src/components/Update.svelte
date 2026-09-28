<script>
  import { onDestroy } from 'svelte';
  import { formatDate, get, post } from '../lib/api.js';

  let { version } = $props();

  // Koraci koje upisuje update.sh, sa približnim procentom.
  const STEPS = {
    'Pokrećem ažuriranje': 5,
    'Proveravam da li ima novih izmena': 10,
    'Pravim rezervnu kopiju baze': 15,
    'Preuzimam novu verziju': 25,
    'Instaliram zavisnosti': 45,
    'Gradim prikaz': 70,
    'Pripremam bazu': 80,
    'Restartujem servis': 88,
    'Čekam da server proradi': 94,
    'Vraćam prethodnu verziju': 60,
    Gotovo: 100,
  };

  let info = $state(null);
  let checking = $state(false);
  let error = $state('');
  let phase = $state('idle'); // idle | running | done | error
  let step = $state('');
  let message = $state('');
  let elapsed = $state(0);
  let timers = [];

  const pct = $derived(STEPS[step] ?? 5);

  function clearTimers() {
    timers.forEach(clearInterval);
    timers = [];
  }
  onDestroy(clearTimers);

  async function check() {
    checking = true;
    error = '';
    try {
      info = await get('/api/update/check');
    } catch (err) {
      error = err.message;
    } finally {
      checking = false;
    }
  }

  async function run() {
    error = '';
    try {
      await post('/api/update/run');
    } catch (err) {
      error = err.message;
      return;
    }
    phase = 'running';
    step = 'Pokrećem ažuriranje';
    const started = Date.now();
    timers.push(setInterval(() => (elapsed = Math.floor((Date.now() - started) / 1000)), 1000));
    timers.push(setInterval(poll, 2000));
  }

  async function poll() {
    let p;
    try {
      p = await get('/api/update/progress');
    } catch {
      // Server se upravo restartuje; zadržavamo poslednji poznati korak.
      return;
    }
    if (p.step) step = p.step;
    if (p.status === 'done') {
      clearTimers();
      phase = 'done';
      message = p.message || p.step;
      if (p.step === 'Gotovo') setTimeout(() => window.location.reload(), 3000);
    } else if (p.status === 'error') {
      clearTimers();
      phase = 'error';
      message = p.message || 'Ažuriranje nije uspelo.';
    } else if (elapsed > 15 * 60) {
      clearTimers();
      phase = 'error';
      message = 'Ažuriranje traje predugo. Pogledaj dnevnik: sudo radionica logs';
    }
  }

  const minutes = $derived(`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`);
</script>

<p>
  Radionica, verzija <b>{version ?? '…'}</b>{info ? ` (commit ${info.currentCommit})` : ''}
</p>

{#if phase === 'running'}
  <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
    <div style="width: {pct}%"></div>
  </div>
  <p>{step}… <span class="muted small">{minutes}</span></p>
  <p class="muted small">
    Aplikacija će se na kratko restartovati. Stranica se sama osvežava kad bude gotovo.
  </p>
{:else if phase === 'done'}
  <p class="ok" role="status">
    {message}{step === 'Gotovo' ? ' Stranica se osvežava…' : ''}
  </p>
{:else if phase === 'error'}
  <p class="error" role="alert">{message}</p>
{:else}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if info}
    {#if info.updateAvailable}
      <div class="notice">
        <p><b>Dostupna je nova verzija {info.latestVersion}</b>{` (commit ${info.latestCommit})`}</p>
        {#if info.changes.length}
          <ul class="changes">
            {#each info.changes as c (c.sha)}
              <li>{c.subject} <span class="muted small">{formatDate(c.date)}</span></li>
            {/each}
          </ul>
        {/if}
        <p class="muted small">Pre ažuriranja se automatski pravi rezervna kopija baze.</p>
      </div>
    {:else}
      <p class="ok" role="status">Imaš najnoviju verziju.</p>
    {/if}
  {/if}
  <div class="row">
    <button type="button" class="btn" disabled={checking} onclick={check}>
      {checking ? 'Proveravam…' : 'Proveri ažuriranja'}
    </button>
    {#if info?.updateAvailable}
      <button type="button" class="btn solid" onclick={run}>Ažuriraj na {info.latestVersion}</button>
    {/if}
  </div>
{/if}

<style>
  .progress {
    height: 10px;
    border-radius: 5px;
    background: var(--surface2);
    border: 1px solid var(--line);
    overflow: hidden;
  }
  .progress div {
    height: 100%;
    background: var(--steel);
    transition: width 0.6s ease;
  }
  .changes {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
</style>
