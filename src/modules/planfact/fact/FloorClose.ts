/**
 * «Закрыть этаж / секцию целиком» (P2-0007, PR-01): все позиции места и вложенных (квартиры) с остатками. Объём каждой строки —
 * остаток (100 %) или X % от плана; любую строку можно поправить или снять галочкой до отправки. Одна бригада и дата на пачку;
 * пачка уходит одной операцией (всё или ничего), правило перебора сервер применяет к каждой строке отдельно.
 * P2-0019: та же форма для «Закрыть выбранные» / «Закрыть через РП» из реестра позиций (title, requireApproval);
 * больше 500 строк — частями по 500 (каждая часть — всё или ничего; при ошибке сказано, сколько уже записано).
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Brigade, FactApi, FactPosition } from './fact.service.ts';
import { fmtQty, parseQty, remainder, splitFloor, sumByUnit, todayMoscow } from './fact.ts';

/** Предел строк одной пачки на сервере (pf_fact_add_batch). */
export const BATCH_MAX = 500;

export function FloorClose(props: {
  api: FactApi; projectId: string; place: { id: string; name: string }; positions: FactPosition[]; brigades: Brigade[]; lastBrigade: string;
  onBrigade: (id: string) => void; onClose: () => void; onDone: (msg: string, partial?: boolean) => void;
  title?: string; requireApproval?: boolean;
}): ReactElement {
  const { api, projectId, place, positions, brigades, lastBrigade, onBrigade, onClose, onDone, requireApproval } = props;
  const [mode, setMode] = useState<'remainder' | 'percent'>('remainder');
  const [pct, setPct] = useState('50');
  const [values, setValues] = useState<Record<string, string>>({});
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [brigade, setBrigade] = useState(brigades.some((b) => b.id === lastBrigade) ? lastBrigade : '');
  const [date, setDate] = useState(todayMoscow());
  const [workers, setWorkers] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => positions.map((p) => ({ id: p.position_id, unit: p.unit_code, plan: p.plan_qty, fact: p.fact_qty })), [positions]);
  const pctNum = parseQty(pct);
  // Пересчёт по режиму: перезаписывает объёмы всех строк (ручные правки сбрасываются — явное действие смены режима).
  function recompute(m: 'remainder' | 'percent', p: number | null): void {
    const split = splitFloor(items, m === 'remainder' ? { kind: 'remainder' } : { kind: 'percent', pct: p ?? 0 });
    const next: Record<string, string> = {};
    for (const it of items) next[it.id] = split[it.id] ? String(split[it.id]).replace('.', ',') : '';
    setValues(next);
  }
  useEffect(() => { recompute('remainder', null); }, [items]);

  const rows = positions.map((p) => {
    const raw = values[p.position_id] ?? '';
    const qty = parseQty(raw);
    return { p, raw, qty, on: !off[p.position_id], rem: remainder(p.plan_qty, p.fact_qty) };
  });
  const send = rows.filter((r) => r.on && r.qty !== null && r.qty > 0);
  const totals = sumByUnit(send.map((r) => ({ unit: r.p.unit_code, qty: r.qty as number })));

  async function submit(): Promise<void> {
    if (busy) return;
    if (!brigade) { setError('Выберите бригаду'); return; }
    if (!date) { setError('Укажите дату'); return; }
    const bad = rows.find((r) => r.on && r.raw.trim() !== '' && (r.qty === null || r.qty <= 0));
    if (bad) { setError(`Проверьте объём: «${bad.p.work_name}»`); return; }
    if (!send.length) { setError('Нет строк для отправки: все объёмы нулевые или сняты'); return; }
    const w = workers.trim() === '' ? null : Number(workers);
    if (w !== null && (!Number.isInteger(w) || w < 0)) { setError('Людей — целое число'); return; }
    setBusy(true); setError('');
    onBrigade(brigade);
    const items = send.map((x) => ({ position_id: x.p.position_id, qty: x.qty as number }));
    let acc = 0, pen = 0;
    for (let i = 0; i < items.length; i += BATCH_MAX) {
      const r = await api.addBatch({ projectId, brigadeId: brigade, date, workers: w, note: note.trim(), items: items.slice(i, i + BATCH_MAX), ...(requireApproval ? { requireApproval: true } : {}) });
      if (!r.ok) {
        setBusy(false);
        setError(i ? `Записано строк: ${acc + pen} из ${items.length}; остальные не записаны: ${r.message}` : r.message);
        if (i) onDone(`Записано строк: ${acc + pen} из ${items.length} (часть не записана — см. ошибку)`, true);
        return;
      }
      acc += r.value.accepted; pen += r.value.pending;
    }
    setBusy(false);
    onDone(`Записано строк: ${acc + pen}` + (pen ? `, из них ждут подтверждения РП: ${pen}` : ''));
  }

  return h('div', { className: 'pf-card ft-sheet', 'data-testid': 'ft-close' },
    h('div', { className: 'ft-sheet-head' }, h('b', null, props.title || `Закрыть целиком: ${place.name}`),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: onClose, 'data-testid': 'ft-close-cancel' }, 'Отмена')),
    requireApproval ? h('div', { className: 'pf-muted', 'data-testid': 'ft-close-via-pm' }, 'Все строки уйдут на подтверждение РП и войдут в факт после его решения.') : null,
    h('div', { className: 'ft-modes' },
      h('label', { className: 'pr-check' }, h('input', { type: 'radio', name: 'mode', checked: mode === 'remainder', 'data-testid': 'ft-mode-rest', onChange: () => { setMode('remainder'); recompute('remainder', null); } }), '100 %: внести остатки'),
      h('span', { className: 'ft-mode-pct' },
        h('label', { className: 'pr-check' }, h('input', { type: 'radio', name: 'mode', checked: mode === 'percent', 'data-testid': 'ft-mode-pct', onChange: () => { setMode('percent'); recompute('percent', pctNum); } }), 'На'),
        h('input', { type: 'text', inputMode: 'decimal', className: 'pj-input ft-pct', value: pct, 'aria-label': 'Процент от плана', 'data-testid': 'ft-pct',
          onChange: (e) => { const v = (e.target as HTMLInputElement).value; setPct(v); setMode('percent'); recompute('percent', parseQty(v)); } }),
        h('span', { className: 'pf-muted' }, '% от плана'))),
    h('div', { className: 'ft-form-grid' },
      h('label', { className: 'pf-field' }, 'Бригада',
        h('select', { className: 'pj-input', value: brigade, 'data-testid': 'ft-close-brigade', onChange: (e) => setBrigade((e.target as HTMLSelectElement).value) },
          h('option', { value: '' }, '— выберите —'), brigades.map((b) => h('option', { key: b.id, value: b.id }, b.name)))),
      h('label', { className: 'pf-field' }, 'Дата', h('input', { type: 'date', className: 'pj-input', value: date, max: todayMoscow(), 'data-testid': 'ft-close-date', onChange: (e) => setDate((e.target as HTMLInputElement).value) })),
      h('label', { className: 'pf-field' }, 'Людей', h('input', { type: 'number', min: 0, className: 'pj-input pf-num', value: workers, onChange: (e) => setWorkers((e.target as HTMLInputElement).value) })),
      h('label', { className: 'pf-field pj-grow' }, 'Примечание', h('input', { type: 'text', className: 'pj-input', maxLength: 300, value: note, onChange: (e) => setNote((e.target as HTMLInputElement).value) }))),
    h('div', { className: 'ft-close-list', 'data-testid': 'ft-close-rows' },
      rows.map((r) => h('div', { key: r.p.position_id, className: 'ft-close-row' + (r.on ? '' : ' ft-close-row--off'), 'data-position-id': r.p.position_id },
        h('label', { className: 'pr-check ft-close-name' },
          h('input', { type: 'checkbox', checked: r.on, 'data-testid': 'ft-close-on', onChange: () => setOff({ ...off, [r.p.position_id]: r.on }) }),
          h('span', null, h('b', null, r.p.work_name), h('span', { className: 'pf-muted ft-place' }, ` ${r.p.location_path}`))),
        h('span', { className: 'pf-muted ft-close-nums' }, `факт ${fmtQty(r.p.fact_qty)} из ${fmtQty(r.p.plan_qty)} ${r.p.unit_code} · остаток ${fmtQty(r.rem)}`),
        h('span', { className: 'ft-close-qty' },
          h('input', { type: 'text', inputMode: 'decimal', className: 'pj-input pf-num' + (r.on && r.raw.trim() !== '' && (r.qty === null || r.qty <= 0) ? ' pr-input--bad' : ''), value: r.raw, disabled: !r.on, 'aria-label': `Объём: ${r.p.work_name}`, 'data-testid': 'ft-close-qty',
            onChange: (e) => setValues({ ...values, [r.p.position_id]: (e.target as HTMLInputElement).value }) }),
          h('span', { className: 'pf-muted' }, r.p.unit_code),
          r.on && r.qty !== null && r.p.fact_qty + r.qty > r.p.plan_qty + 1e-9 ? h('span', { className: 'ft-warn' }, 'сверх плана') : null)))),
    h('div', { className: 'ft-total', 'data-testid': 'ft-close-total' }, 'К отправке: ', `${send.length} из ${rows.length} строк`,
      Object.keys(totals).length ? ' · ' + Object.entries(totals).map(([u, q]) => `${fmtQty(q)} ${u}`).join(', ') : ''),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    h('div', { className: 'pj-actions' },
      h('button', { type: 'button', className: 'pf-btn', disabled: busy || !positions.length, 'data-testid': 'ft-close-send', onClick: () => { void submit(); } }, 'Отправить'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: onClose }, 'Отмена')));
}
