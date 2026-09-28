<script>
  import { api, store } from '../lib/data.svelte.js';

  let { canWrite } = $props();
  let values = $state({ ...store.cutting });
  let message = $state('');
  let error = $state('');

  const GROUPS = [
    {
      title: 'Metal',
      fields: [
        ['kerfMetal', 'Širina reza testere', 'mm'],
        ['minMetal', 'Najmanji ostatak za lager', 'mm'],
      ],
    },
    {
      title: 'Iverica i šperploča',
      fields: [
        ['kerfBoard', 'Širina reza testere', 'mm'],
        ['trim', 'Obrub oštećenih ivica', 'mm po strani'],
        ['minBoard', 'Najmanji ostatak za lager', 'mm, obe mere'],
      ],
    },
    {
      title: 'Drvo',
      fields: [
        ['kerfWood', 'Širina reza testere', 'mm'],
        ['planeAllow', 'Dodatak za rendisanje', 'mm po strani'],
        ['lenAllow', 'Dodatak na dužinu', 'mm po delu'],
        ['minWood', 'Najmanji ostatak za lager', 'mm'],
      ],
    },
    {
      title: 'Standardne mere za kupovinu',
      fields: [
        ['buyMetal', 'Dužina cevi', 'mm'],
        ['buyIvL', 'Iverica, dužina', 'mm'],
        ['buyIvW', 'Iverica, širina', 'mm'],
        ['buySpL', 'Šperploča, dužina', 'mm'],
        ['buySpW', 'Šperploča, širina', 'mm'],
        ['buyWood', 'Dužina drvne građe', 'mm'],
      ],
    },
  ];

  async function save(event) {
    event.preventDefault();
    message = error = '';
    try {
      const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v) || 0]));
      store.cutting = (await api.put('/api/settings/cutting', body)).settings;
      values = { ...store.cutting };
      message = 'Podešavanja krojenja su sačuvana.';
    } catch (err) {
      error = err.message;
    }
  }
</script>

<form class="stack wide" onsubmit={save}>
  <div class="setgrid">
    {#each GROUPS as g (g.title)}
      <fieldset>
        <legend>{g.title}</legend>
        {#each g.fields as [key, label, unit] (key)}
          <label class="setfield">
            <span>{label}<small>{unit}</small></span>
            <input type="number" min="0" step="0.5" bind:value={values[key]} disabled={!canWrite} />
          </label>
        {/each}
      </fieldset>
    {/each}
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if message}<p class="ok" role="status">{message}</p>{/if}
  {#if canWrite}<div class="row"><button class="btn solid">Sačuvaj podešavanja krojenja</button></div>{/if}
</form>
