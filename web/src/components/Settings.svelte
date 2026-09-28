<script>
  import ChangePassword from './ChangePassword.svelte';
  import Users from './Users.svelte';
  import Backups from './Backups.svelte';
  import Update from './Update.svelte';

  let { me, version, onRestored } = $props();
</script>

<h2>Podešavanja</h2>

<div class="sections">
  <section class="card">
    <h3>Moj nalog</h3>
    <p class="muted">
      Prijavljen si kao <b>{me.username}</b>{me.displayName ? ` (${me.displayName})` : ''}.
    </p>
    <ChangePassword />
  </section>

  <section class="card">
    <h3>{me.role === 'admin' ? 'Ažuriranje' : 'O aplikaciji'}</h3>
    {#if me.role === 'admin'}
      <Update {version} />
    {:else}
      <p>Radionica, verzija {version ?? '…'}</p>
    {/if}
  </section>

  {#if me.role === 'admin'}
    <section class="card widecard">
      <h3>Korisnici</h3>
      <Users {me} />
    </section>

    <section class="card widecard">
      <h3>Rezervne kopije</h3>
      <Backups {onRestored} />
    </section>
  {/if}
</div>
