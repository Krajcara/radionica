<script>
  import { fmt, partColor } from '../lib/format.js';

  /** Raspored delova po pločama, sa smerom dezena i ostacima. */
  let { result, kind } = $props();
  const word = $derived(kind === 'sper' ? 'žica' : 'dezen');

  function grainLines(s) {
    const lines = [];
    if (s.grain === 'l')
      for (let y = s.W / 16; y < s.W; y += s.W / 16) lines.push({ x1: 0, y1: y, x2: s.L, y2: y });
    if (s.grain === 'w')
      for (let x = s.L / 22; x < s.L; x += s.L / 22) lines.push({ x1: x, y1: 0, x2: x, y2: s.W });
    return lines;
  }

  function labelOf(s, p) {
    const fs = Math.max(s.L, s.W) / 34;
    const tall = p.h > p.w * 1.4;
    const along = tall ? p.h : p.w;
    const across = tall ? p.w : p.h;
    const f = Math.min(fs, across / 2.8, along / 3);
    const dims = `${fmt(p.w)}×${fmt(p.h)}`;
    return {
      show: f > fs * 0.35,
      f,
      dims,
      showDims: along > f * dims.length * 0.55 && across > f * 2.6,
      cx: p.x + p.w / 2,
      cy: p.y + p.h / 2,
      tall,
    };
  }

  const grainText = (s) =>
    s.grain === 'l'
      ? `${word} po dužini`
      : s.grain === 'w'
        ? `${word} po širini`
        : kind === 'sper'
          ? 'žica nije bitna'
          : 'bez dezena';
</script>

<p class="hint">
  Svi rezovi idu od ivice do ivice, pa raspored može da se iseče kružnom ili stonom testerom. Rez {fmt(
    result.k,
  )}
  mm{result.trim ? `, obrub ivica ${fmt(result.trim)} mm` : ''}. Tanke linije pokazuju smer {word === 'žica'
    ? 'žice'
    : 'dezena'}, šrafirana polja su ostaci koji se vraćaju u lager.
</p>
{#each result.groups as g (g.materialId)}
  <h4 class="group-title">{g.label}</h4>
  {#if g.noStock}
    <p class="muted">U lageru nemaš nijednu ploču ovog materijala.</p>
  {:else if !g.sheets.length}
    <p class="muted">Nijedan deo ne staje na ploče ovog materijala iz lagera.</p>
  {/if}
  {#each g.sheets as s, i (i)}
    {@const fs = Math.max(s.L, s.W) / 34}
    <div class="sheet-card">
      <div class="sheet-head">
        <b>Ploča {i + 1}: {fmt(s.L)} × {fmt(s.W)} mm</b>
        <span class="muted">{grainText(s)}, iskorišćeno {s.usedPct}%</span>
      </div>
      <svg
        class="sheet"
        viewBox="0 0 {s.L} {s.W}"
        role="img"
        aria-label="Raspored delova na ploči {fmt(s.L)} × {fmt(s.W)} mm"
      >
        <rect class="sh-bg" x="0" y="0" width={s.L} height={s.W} />
        {#each grainLines(s) as l, j (j)}
          <line class="grain" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} vector-effect="non-scaling-stroke" />
        {/each}
        {#if result.trim > 0}
          <rect
            class="sh-trim"
            x={result.trim}
            y={result.trim}
            width={s.L - 2 * result.trim}
            height={s.W - 2 * result.trim}
            vector-effect="non-scaling-stroke"
          />
        {/if}
        {#each s.offcuts as o, j (j)}
          <rect class="off" x={o.x} y={o.y} width={o.w} height={o.h} vector-effect="non-scaling-stroke" />
          {#if o.w > fs * 5 && o.h > fs * 1.2}
            <text
              class="off-t"
              x={o.x + o.w / 2}
              y={o.y + o.h / 2}
              font-size={fs * 0.75}
              text-anchor="middle"
              dominant-baseline="middle">{fmt(o.w)}×{fmt(o.h)}</text
            >
          {/if}
        {/each}
        {#each s.parts as p, j (j)}
          {@const lb = labelOf(s, p)}
          <rect
            class="pt"
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            fill={partColor(p.ci)}
            vector-effect="non-scaling-stroke"
          >
            <title>{p.name} {fmt(p.l)} × {fmt(p.lw)}</title>
          </rect>
          {#if lb.show}
            <g transform={lb.tall ? `rotate(-90 ${lb.cx} ${lb.cy})` : undefined}>
              <text
                class="pt-n"
                x={lb.cx}
                y={lb.showDims ? lb.cy - lb.f * 0.2 : lb.cy}
                font-size={lb.f * 1.15}
                text-anchor="middle"
                dominant-baseline="middle">{j + 1}</text
              >
              {#if lb.showDims}
                <text
                  class="pt-d"
                  x={lb.cx}
                  y={lb.cy + lb.f * 0.95}
                  font-size={lb.f * 0.72}
                  text-anchor="middle"
                  dominant-baseline="middle">{lb.dims}</text
                >
              {/if}
            </g>
          {/if}
        {/each}
      </svg>
      <ol class="legend">
        {#each s.parts as p, j (j)}
          <li>
            <span class="n" style="background: {partColor(p.ci)}">{j + 1}</span>
            <span
              >{p.name}
              {fmt(p.l)} × {fmt(p.lw)}{#if p.grain}<span class="muted small">{` prati ${word}`}</span
                >{/if}</span
            >
          </li>
        {/each}
      </ol>
      {#if s.offcuts.length}
        <p class="muted small">
          Ostaci za lager: {s.offcuts.map((o) => `${fmt(o.w)} × ${fmt(o.h)}`).join(', ')} mm.
        </p>
      {/if}
    </div>
  {/each}
{/each}
