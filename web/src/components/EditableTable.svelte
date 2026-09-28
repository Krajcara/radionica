<script>
  /**
   * Tabela u kojoj se menja direktno u ćelijama.
   * columns: [{ key, label, type: 'text'|'num'|'check'|'select', options?, placeholder?, disabled?(row) }]
   */
  let {
    rows,
    columns,
    readonly = false,
    onEdit,
    onDelete,
    onAdd,
    addLabel = 'Dodaj red',
    emptyText = 'Još nema unosa.',
  } = $props();

  function change(row, col, target) {
    let value;
    if (col.type === 'check') value = target.checked;
    else if (col.type === 'num') {
      const v = parseFloat(String(target.value).replace(',', '.'));
      value = Number.isFinite(v) ? v : null;
      if (col.key === 'qty') value = Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    } else if (col.type === 'select') {
      const raw = target.value;
      value = raw === '' ? null : /^\d+$/.test(raw) && col.numeric ? Number(raw) : raw;
    } else value = target.value;
    row[col.key] = value;
    onEdit(row, col.key, value);
  }

  let wrap;
  export function focusLast() {
    setTimeout(() => {
      const inputs = wrap?.querySelectorAll('tbody tr:last-child input, tbody tr:last-child select');
      if (!inputs?.length) return;
      const empty = [...inputs].find((i) => i.type !== 'checkbox' && !i.value);
      (empty || inputs[0]).focus();
    });
  }
</script>

<div class="tablewrap edit" bind:this={wrap}>
  <table>
    <thead>
      <tr>
        {#each columns as c (c.key)}<th class:num={c.type === 'num'}>{c.label}</th>{/each}
        {#if !readonly}<th><span class="sr">Obriši</span></th>{/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.id)}
        <tr>
          {#each columns as c (c.key)}
            {@const dis = readonly || c.disabled?.(row)}
            <td class:c={c.type === 'check'}>
              {#if c.type === 'check'}
                <input
                  type="checkbox"
                  checked={Boolean(row[c.key])}
                  disabled={dis}
                  aria-label={c.label}
                  onchange={(e) => change(row, c, e.currentTarget)}
                />
              {:else if c.type === 'select'}
                <select
                  value={row[c.key] ?? ''}
                  disabled={dis}
                  aria-label={c.label}
                  onchange={(e) => change(row, c, e.currentTarget)}
                >
                  {#each c.options(row) as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
                </select>
              {:else}
                <input
                  type={c.type === 'num' ? 'number' : 'text'}
                  inputmode={c.type === 'num' ? 'decimal' : undefined}
                  min={c.type === 'num' ? 0 : undefined}
                  step="any"
                  value={row[c.key] ?? ''}
                  placeholder={c.placeholder || ''}
                  disabled={dis}
                  aria-label={c.label}
                  oninput={(e) => change(row, c, e.currentTarget)}
                />
              {/if}
            </td>
          {/each}
          {#if !readonly}
            <td
              ><button type="button" class="del" aria-label="Obriši red" onclick={() => onDelete(row)}
                >×</button
              ></td
            >
          {/if}
        </tr>
      {:else}
        <tr><td class="emptyrow" colspan={columns.length + 1}>{emptyText}</td></tr>
      {/each}
    </tbody>
  </table>
</div>
{#if !readonly && onAdd}
  <button type="button" class="btn add" onclick={onAdd}>{addLabel}</button>
{/if}
