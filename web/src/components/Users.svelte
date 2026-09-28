<script>
  import { onMount } from 'svelte';
  import { ROLE_HINTS, ROLE_LABELS, del, formatDate, get, patch, post } from '../lib/api.js';
  import ConfirmButton from './ConfirmButton.svelte';

  let { me } = $props();
  let users = $state([]);
  let error = $state('');
  let username = $state('');
  let displayName = $state('');
  let role = $state('korisnik');
  let reveal = $state(null); // { username, password } prikazuje se jednom

  async function load() {
    try {
      users = (await get('/api/users')).users;
    } catch (err) {
      error = err.message;
    }
  }
  onMount(load);

  async function run(fn) {
    error = '';
    try {
      await fn();
      await load();
    } catch (err) {
      error = err.message;
    }
  }

  function add(event) {
    event.preventDefault();
    run(async () => {
      const res = await post('/api/users', { username, displayName, role });
      reveal = { username: res.user.username, password: res.tempPassword };
      username = displayName = '';
      role = 'korisnik';
    });
  }

  const setRole = (u, value) => run(() => patch(`/api/users/${u.id}`, { role: value }));
  const toggle = (u) => run(() => patch(`/api/users/${u.id}`, { disabled: !u.disabled }));
  const remove = (u) => run(() => del(`/api/users/${u.id}`));
  const reset = (u) =>
    run(async () => {
      const res = await post(`/api/users/${u.id}/reset-password`);
      reveal = { username: u.username, password: res.tempPassword };
    });
</script>

{#if reveal}
  <div class="notice" role="status">
    <p>
      Privremena lozinka za <b>{reveal.username}</b>: <code class="big">{reveal.password}</code>
    </p>
    <p class="small">
      Zapiši je i predaj korisniku. Više se neće prikazati. Pri prijavi će morati da je promeni.
    </p>
    <button type="button" class="btn quiet" onclick={() => (reveal = null)}>Zapisao sam</button>
  </div>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<div class="tablewrap">
  <table>
    <thead>
      <tr><th>Korisnik</th><th>Uloga</th><th>Poslednja prijava</th><th>Status</th><th></th></tr>
    </thead>
    <tbody>
      {#each users as u (u.id)}
        <tr class:off={u.disabled}>
          <td
            ><b>{u.username}</b>{#if u.displayName}<span class="muted dname">{u.displayName}</span>{/if}</td
          >
          <td>
            <select
              value={u.role}
              aria-label="Uloga za {u.username}"
              disabled={u.id === me.id}
              onchange={(e) => setRole(u, e.currentTarget.value)}
            >
              {#each Object.entries(ROLE_LABELS) as [value, text] (value)}<option {value}>{text}</option
                >{/each}
            </select>
          </td>
          <td class="muted">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'nikad'}</td>
          <td>
            {#if u.disabled}<span class="tag">isključen</span>
            {:else if u.mustChangePassword}<span class="tag">čeka novu lozinku</span>
            {:else}<span class="tag okt">aktivan</span>{/if}
          </td>
          <td
            ><div class="actions">
              {#if u.id !== me.id}
                <ConfirmButton label="Nova lozinka" onConfirm={() => reset(u)} />
                <button type="button" class="btn quiet" onclick={() => toggle(u)}>
                  {u.disabled ? 'Uključi' : 'Isključi'}
                </button>
                <ConfirmButton
                  label="Obriši"
                  confirmLabel="Klikni ponovo da obrišeš"
                  onConfirm={() => remove(u)}
                />
              {:else}
                <span class="muted small">ovo si ti</span>
              {/if}
            </div></td
          >
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<form class="addrow" onsubmit={add}>
  <label class="field">
    <span>Korisničko ime</span>
    <input bind:value={username} autocapitalize="none" pattern="[a-zA-Z0-9._\-]{'{2,32}'}" required />
  </label>
  <label class="field">
    <span>Ime (nije obavezno)</span>
    <input bind:value={displayName} />
  </label>
  <label class="field">
    <span>Uloga</span>
    <select bind:value={role}>
      {#each Object.entries(ROLE_LABELS) as [value, text] (value)}<option {value}>{text}</option>{/each}
    </select>
  </label>
  <button class="btn solid">Dodaj korisnika</button>
</form>
<p class="muted small">{ROLE_LABELS[role]}: {ROLE_HINTS[role]}.</p>
