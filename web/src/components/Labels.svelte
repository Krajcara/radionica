<script>
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';
  import { TYPE_LABELS, descendantIds, locById, locName, pathOf } from '../lib/inventory.svelte.js';

  /** Nalepnice za lokaciju i sve lokacije u njoj. A4, 3 × 7 (70 × 42,3 mm). */
  let { rootId, onClose } = $props();
  let includeChildren = $state(true);
  let labels = $state([]);
  const origin = window.location.origin;
  const localhost = /localhost|127\.0\.0\.1/.test(origin);

  async function build() {
    const ids = includeChildren ? descendantIds(rootId) : [rootId];
    const out = [];
    for (const id of ids) {
      const l = locById(id);
      if (!l?.code) continue;
      const svg = await QRCode.toString(`${origin}/l/${encodeURIComponent(l.code)}`, {
        type: 'svg',
        margin: 0,
        errorCorrectionLevel: 'M',
      });
      out.push({
        id,
        code: l.code,
        name: locName(l),
        type: TYPE_LABELS[l.type],
        path: pathOf(id).slice(0, -1).map(locName).join(', '),
        svg,
      });
    }
    labels = out;
  }

  onMount(() => {
    document.body.classList.add('printing');
    build();
    return () => document.body.classList.remove('printing');
  });
</script>

<div class="labels-screen">
  <div class="labels-bar noprint">
    <b>Nalepnice: {labels.length}</b>
    <label class="check"
      ><input type="checkbox" bind:checked={includeChildren} onchange={build} /> i sve lokacije unutra</label
    >
    <button type="button" class="btn solid" onclick={() => window.print()}>Štampaj</button>
    <button type="button" class="btn" onclick={onClose}>Zatvori</button>
    <p class="muted small">
      A4 sa 21 nalepnicom (3 × 7, 70 × 42,3 mm), npr. Herma 4453 ili Avery 3652. Može i na običan papir, pa
      iseći. QR vodi na {origin}.
    </p>
    {#if localhost}
      <p class="error small">
        Otvoreno je preko localhost adrese, pa QR neće raditi sa telefona. Otvori aplikaciju preko IP adrese
        servera.
      </p>
    {/if}
  </div>
  <div class="sheet-a4">
    {#each labels as l (l.id)}
      <div class="label">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG pravi biblioteka qrcode ovde, iz oznake lokacije -->
        <div class="qr">{@html l.svg}</div>
        <div class="ltext">
          <div class="lcode">{l.code}</div>
          <div class="lname">{l.name}</div>
          <div class="lpath">{l.path || l.type}</div>
        </div>
      </div>
    {/each}
  </div>
</div>
