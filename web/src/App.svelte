<script>
  import { onMount } from 'svelte';
  import { applyTheme, readTheme } from './lib/theme.js';
  import { get, post, setUnauthorizedHandler } from './lib/api.js';
  import Login from './components/Login.svelte';
  import ChangePassword from './components/ChangePassword.svelte';
  import Settings from './components/Settings.svelte';
  import MaterialsPage from './components/MaterialsPage.svelte';
  import StockPage from './components/StockPage.svelte';
  import ProjectsPage from './components/ProjectsPage.svelte';
  import InventoryPage from './components/InventoryPage.svelte';
  import { loadAll, saving, store } from './lib/data.svelte.js';

  const pages = [
    {
      id: 'projekti',
      label: 'Projekti',
      phase: 3,
      text: 'Projekti sa rasporedom sečenja i spiskom za kupovinu.',
    },
    { id: 'materijal', label: 'Materijal', phase: 3, text: 'Lager metala, iverice, šperploče i drva.' },
    { id: 'inventar', label: 'Inventar', phase: 4, text: 'Sve u radionici, sa lokacijama i QR nalepnicama.' },
    {
      id: 'sifarnik',
      label: 'Šifarnik',
      phase: 3,
      text: 'Materijali koje definišeš jednom i posle biraš sa liste.',
    },
    { id: 'podesavanja', label: 'Podešavanja' },
  ];
  const themes = [
    { id: 'sistem', label: 'Sistem' },
    { id: 'svetla', label: 'Svetla' },
    { id: 'tamna', label: 'Tamna' },
  ];

  let current = $state(pageFromHash());
  let sub = $state(subFromHash());
  let theme = $state(readTheme());
  let version = $state(null);
  let user = $state(null);
  let loading = $state(true);
  let offline = $state(false);
  let notice = $state('');

  const page = $derived(pages.find((p) => p.id === current) ?? pages[0]);

  function pageFromHash() {
    const id = location.hash.replace('#/', '').split('/')[0];
    return pages.some((p) => p.id === id) ? id : 'projekti';
  }
  function subFromHash() {
    const s = location.hash.replace('#/', '').split('/')[1];
    return s && /^\d+$/.test(s) ? Number(s) : null;
  }
  const canWrite = $derived(user && user.role !== 'gost');

  $effect(() => {
    if (user && !user.mustChangePassword && !store.loaded) loadAll();
  });

  function setTheme(id) {
    theme = id;
    applyTheme(id);
  }

  async function logout() {
    try {
      await post('/api/auth/logout');
    } catch {
      // Sesija je već nevažeća.
    }
    user = null;
  }

  function restored() {
    user = null;
    store.loaded = false;
    notice = 'Podaci su vraćeni iz rezervne kopije. Prijavi se ponovo.';
  }

  onMount(() => {
    setUnauthorizedHandler(() => (user = null));
    const onHash = () => {
      current = pageFromHash();
      sub = subFromHash();
    };
    window.addEventListener('hashchange', onHash);
    get('/api/health')
      .then((h) => (version = h.version))
      .catch(() => (offline = true));
    get('/api/auth/me')
      .then((r) => (user = r.user))
      .catch(() => (user = null))
      .finally(() => (loading = false));
    return () => window.removeEventListener('hashchange', onHash);
  });
</script>

{#snippet themeSwitch()}
  <div class="seg" role="group" aria-label="Tema">
    {#each themes as t (t.id)}
      <button type="button" aria-pressed={theme === t.id} onclick={() => setTheme(t.id)}>{t.label}</button>
    {/each}
  </div>
{/snippet}

{#if loading}
  <div class="center"><p class="muted">Učitavam…</p></div>
{:else if offline && !user}
  <div class="center">
    <p class="error">
      Server ne odgovara. Proveri da li servis radi: <code>systemctl status radionica</code>
    </p>
  </div>
{:else if !user}
  {#if notice}<p class="ok center-note" role="status">{notice}</p>{/if}
  <Login onLogin={(u) => ((user = u), (notice = ''))} />
  <div class="center-note">{@render themeSwitch()}</div>
{:else if user.mustChangePassword}
  <div class="center">
    <ChangePassword forced onDone={(u) => (user = u)} onLogout={logout} />
  </div>
{:else}
  <header class="wrap">
    <div class="titlebar">
      <h1 class="brand">Radionica</h1>
      <div class="side">
        <span class="muted small savestate" class:err={saving.error}
          >{saving.pending ? 'Čuvam…' : saving.error ? `Nije sačuvano: ${saving.error}` : ''}</span
        >
        <span class="muted small">{user.displayName || user.username}</span>
        <button type="button" class="linkbtn" onclick={logout}>Odjavi se</button>
        {@render themeSwitch()}
      </div>
    </div>
    <nav aria-label="Glavni meni">
      {#each pages as p (p.id)}
        <a href={'#/' + p.id} aria-current={current === p.id ? 'page' : undefined}>{p.label}</a>
      {/each}
    </nav>
  </header>

  <main class="wrap">
    {#if store.error}
      <p class="error" role="alert">Podaci nisu učitani: {store.error}</p>
    {/if}
    {#if current === 'podesavanja'}
      <Settings me={user} {version} onRestored={restored} />
    {:else if !store.loaded}
      <p class="muted">Učitavam…</p>
    {:else if current === 'projekti'}
      <ProjectsPage {sub} {canWrite} />
    {:else if current === 'materijal'}
      <StockPage {canWrite} />
    {:else if current === 'sifarnik'}
      <MaterialsPage {canWrite} />
    {:else if current === 'inventar'}
      <InventoryPage {canWrite} />
    {:else}
      <h2>{page.label}</h2>
      <div class="empty">
        <p>{page.text}</p>
        <p class="muted small">Ovaj deo stiže u fazi {page.phase}. Plan je u docs/PLAN.md.</p>
      </div>
    {/if}
  </main>
{/if}
