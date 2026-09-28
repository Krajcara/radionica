<script>
  import { post } from '../lib/api.js';

  /** forced: prva prijava sa privremenom lozinkom. */
  let { forced = false, onDone, onLogout } = $props();
  let current = $state('');
  let next = $state('');
  let repeat = $state('');
  let error = $state('');
  let done = $state(false);
  let busy = $state(false);

  async function submit(event) {
    event.preventDefault();
    error = '';
    done = false;
    if (next !== repeat) {
      error = 'Nova lozinka i ponovljena lozinka se ne poklapaju.';
      return;
    }
    busy = true;
    try {
      const { user } = await post('/api/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      current = next = repeat = '';
      done = true;
      onDone?.(user);
    } catch (err) {
      error = err.message;
    } finally {
      busy = false;
    }
  }
</script>

<form class={forced ? 'card narrow' : 'stack'} onsubmit={submit}>
  {#if forced}
    <h1 class="brand">Nova lozinka</h1>
    <p>Prijavio si se privremenom lozinkom. Pre nastavka izaberi svoju lozinku, od najmanje 8 znakova.</p>
  {/if}
  <label class="field">
    <span>{forced ? 'Privremena lozinka' : 'Trenutna lozinka'}</span>
    <input type="password" bind:value={current} autocomplete="current-password" required />
  </label>
  <label class="field">
    <span>Nova lozinka</span>
    <input type="password" bind:value={next} autocomplete="new-password" minlength="8" required />
  </label>
  <label class="field">
    <span>Ponovi novu lozinku</span>
    <input type="password" bind:value={repeat} autocomplete="new-password" minlength="8" required />
  </label>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if done && !forced}<p class="ok" role="status">
      Lozinka je promenjena. Ostali uređaji su odjavljeni.
    </p>{/if}
  <div class="row">
    <button class="btn solid" disabled={busy}>{busy ? 'Čuvam…' : 'Promeni lozinku'}</button>
    {#if forced}<button type="button" class="linkbtn" onclick={onLogout}>Odjavi se</button>{/if}
  </div>
</form>
