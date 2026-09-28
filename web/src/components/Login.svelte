<script>
  import { post } from '../lib/api.js';

  let { onLogin } = $props();
  let username = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const { user } = await post('/api/auth/login', { username, password });
      onLogin(user);
    } catch (err) {
      error = err.message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="center">
  <form class="card narrow" onsubmit={submit}>
    <h1 class="brand">Radionica</h1>
    <p class="muted">Prijavi se da nastaviš.</p>
    <label class="field">
      <span>Korisničko ime</span>
      <input bind:value={username} autocomplete="username" autocapitalize="none" required />
    </label>
    <label class="field">
      <span>Lozinka</span>
      <input type="password" bind:value={password} autocomplete="current-password" required />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn solid wide" disabled={busy}>{busy ? 'Prijavljujem…' : 'Prijavi se'}</button>
    <p class="muted small">
      Zaboravljena admin lozinka se menja na serveru komandom <code>sudo radionica reset-admin</code>.
    </p>
  </form>
</div>
