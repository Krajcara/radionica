<script>
  import { fmt, partColor } from '../lib/format.js';

  /** Raspored delova po cevima ili daskama. */
  let { result, kind } = $props();

  const groups = $derived.by(() => {
    const m = new Map();
    for (const b of result.bins) {
      if (!m.has(b.group)) m.set(b.group, []);
      m.get(b.group).push(b);
    }
    return [...m.entries()];
  });

  function counted(bin) {
    const m = new Map();
    for (const c of bin.cuts) {
      const key = `${c.name}|${c.real}|${c.note}`;
      const e = m.get(key) || { ...c, n: 0 };
      e.n += 1;
      m.set(key, e);
    }
    return [...m.values()];
  }
</script>

<p class="hint">
  Rez {fmt(result.k)} mm{kind === 'drvo' && result.lenAllow
    ? `, dodatak na dužinu ${fmt(result.lenAllow)} mm po delu`
    : ''}. Crvena crta je rez.
</p>
{#if !result.bins.length}
  <p class="muted">Ništa iz lagera ne odgovara ovim delovima.</p>
{/if}
{#each groups as [group, bins] (group)}
  <h4 class="group-title">{group}</h4>
  {#each bins as b, i (i)}
    <div class="pipe">
      <div class="pipe-head">
        <b>Komad {i + 1}: {fmt(b.L)} mm</b>
        <span class="muted"
          >ostaje {fmt(b.rest)} mm{b.rest > 0
            ? b.returnsToStock
              ? ', vraća se u lager'
              : ', otpad'
            : ''}</span
        >
      </div>
      <div class="bar" role="img" aria-label="Raspored reza na komadu od {fmt(b.L)} mm">
        {#each b.cuts as c, j (j)}
          {@const pct = (c.len / b.L) * 100}
          <div
            class="seg {kind}"
            style="flex: 0 0 {pct}%; box-shadow: inset 0 -5px 0 {partColor(c.ci)}"
            title="{c.name} {fmt(c.real)} mm"
          >
            {pct > 10 ? `${c.name} ${fmt(c.real)}` : pct > 4 ? fmt(c.real) : ''}
          </div>
          {#if j < b.cuts.length - 1 || b.rest > 0}<div class="kerf"></div>{/if}
        {/each}
        <div class="rest">{b.rest / b.L > 0.08 ? fmt(b.rest) : ''}</div>
      </div>
      <ul class="cutlist">
        {#each counted(b) as c (c.name + c.real + c.note)}
          <li>
            <b>{c.n} ×</b>
            {c.name}
            {fmt(c.real)} mm{#if c.note}<span class="muted">{` (${c.note})`}</span>{/if}
          </li>
        {/each}
      </ul>
    </div>
  {/each}
{/each}
{#if result.unused.length}
  <p class="muted small">
    Ostaju nedirnuti: {result.unused.map((u) => `${fmt(u.L)} mm`).join(', ')}.
  </p>
{/if}
