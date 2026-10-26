/**
 * Форма ввода факта по позиции (P2-0007, вынесена из FactTab в P2-0017): объём, дата, бригада (по умолчанию последняя), люди, чел.-ч,
 * примечание. Одна форма и одна отправка (FactApi.add) для обычного ввода и для окна из шахматки; допуск перебора и подтверждение
 * РП решает сервер. quick — окно факта (P2-0017 шахматка, P2-0022 и «Ввод» — FactWindow): «−/+», плитки «до 25/50/75/100 % плана»,
 * «Внесено / Осталось», «История». «День / Период» (P2-0022): в «Периоде» — «с … по …» и общий объём, одна запись (сервер, 030).
 */
import { createElement as h, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { Brigade, FactApi, FactPosition } from './fact.service.ts';
import { fmtPeriod, fmtPct, fmtQty, parseQty, percent, periodError, remainder, round3, todayMoscow } from './fact.ts';

export const QUICK_STEPS = [25, 50, 75, 100];

/** Объём плитки «до X % плана»: сколько внести, чтобы накопленный факт стал X % плана; уже достигнуто — 0 (в минус не уходит). */
export const toPercent = (plan: number, fact: number, pct: number): number => remainder(round3((plan * pct) / 100), fact);

/** Шаг «−/+»: 1 единица позиции (для малых планов — десятая доля). */
export const qtyStep = (plan: number): number => (plan > 0 && plan < 10 ? 0.1 : 1);

export function FactEntryForm(props: {
  api: FactApi; pos: FactPosition; brigades: Brigade[]; lastBrigade: string; onBrigade: (id: string) => void; onCancel: () => void; onSaved: (msg: string) => void;
  quick?: { onHistory: () => void; historyCount: number | null };
}): ReactElement {
  const { api, pos, brigades, lastBrigade, onBrigade, onCancel, onSaved, quick } = props;
  const [qty, setQty] = useState('');
  const [brigade, setBrigade] = useState(brigades.some((b) => b.id === lastBrigade) ? lastBrigade : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState(false);
  const q = parseQty(qty);
  const after = q !== null && q > 0 ? percent(pos.fact_qty + q, pos.plan_qty) : null;
  const over = q !== null && pos.fact_qty + q > pos.plan_qty + 1e-9;
  const setNum = (v: number): void => setQty(v > 0 ? String(round3(v)).replace('.', ',') : '');

  async function submit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const f = ev.currentTarget as HTMLFormElement;
    const val = (k: string): string => (f.elements.namedItem(k) as HTMLInputElement).value.trim();
    if (q === null || q <= 0) { setError('Введите объём больше нуля'); return; }
    if (!brigade) { setError('Выберите бригаду'); return; }
    const date = val('date');
    const from = period ? val('date_from') : '';
    if (period) { const pe = periodError(from, date); if (pe) { setError(pe); return; } }
    if (!date) { setError('Укажите дату'); return; }
    if (date > todayMoscow()) { setError('Дата не может быть в будущем'); return; }
    const workers = val('workers') === '' ? null : Number(val('workers'));
    const mh = val('man_hours') === '' ? null : parseQty(val('man_hours'));
    if (workers !== null && (!Number.isInteger(workers) || workers < 0)) { setError('Людей — целое число'); return; }
    if (val('man_hours') !== '' && mh === null) { setError('Чел.-ч — число'); return; }
    setBusy(true); setError('');
    onBrigade(brigade);
    const r = await api.add(pos.position_id, { brigadeId: brigade, date, qty: q, workers, manHours: mh, note: val('note'), ...(period ? { periodFrom: from } : {}) });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onSaved(r.value.status === 'pending_approval'
      ? `Записано, но объём выше допуска плана — ждёт подтверждения РП (в итог пока не входит)`
      : `Записано: ${fmtQty(q)} ${pos.unit_code}${period ? ' ' + fmtPeriod(from, date) : ''}`);
  }

  const step = qtyStep(pos.plan_qty);
  const qtyInput = h('input', { name: 'qty', type: 'text', inputMode: 'decimal', autoComplete: 'off', className: 'pj-input pf-num', value: qty, 'data-testid': 'ft-qty', onChange: (e) => setQty((e.target as HTMLInputElement).value) });
  const today = todayMoscow();
  return h('form', { className: 'ft-form' + (quick ? ' ft-form--quick' : ''), onSubmit: (e: FormEvent) => { void submit(e); }, 'data-testid': 'ft-form' },
    h('div', { className: 'pf-seg ft-period-seg', role: 'tablist', 'aria-label': 'За день или за период', 'data-testid': 'ft-period-seg' },
      [['day', 'День'], ['period', 'Период']].map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': (id === 'period') === period,
        className: 'pf-seg-btn' + ((id === 'period') === period ? ' pf-seg-btn--active' : ''), 'data-testid': `ft-mode-${id}`,
        onClick: () => { setPeriod(id === 'period'); setError(''); } }, label))),
    quick ? h('div', { className: 'ft-quick-sum', 'data-testid': 'ft-quick-sum' },
      h('span', null, 'Внесено ', h('b', null, `${fmtQty(pos.fact_qty)} ${pos.unit_code}`), ` · ${fmtPct(percent(pos.fact_qty, pos.plan_qty))}`),
      h('span', null, 'Осталось ', h('b', null, `${fmtQty(remainder(pos.plan_qty, pos.fact_qty))} ${pos.unit_code}`), ` из ${fmtQty(pos.plan_qty)}`)) : null,
    quick ? h('div', { className: 'ft-steps', 'data-testid': 'ft-steps' }, QUICK_STEPS.map((p) => {
      const v = toPercent(pos.plan_qty, pos.fact_qty, p);
      return h('button', { key: p, type: 'button', className: 'ft-step', disabled: !(v > 0), 'data-pct': p, onClick: () => setNum(v), title: `Довести до ${p} % плана` },
        h('b', null, `до ${p} %`), h('span', null, v > 0 ? `+${fmtQty(v)} ${pos.unit_code}` : 'уже'));
    })) : null,
    h('div', { className: 'ft-form-grid' },
      quick
        ? h('label', { className: 'pf-field' }, `Объём, ${pos.unit_code}`,
            h('div', { className: 'ft-pm' },
              h('button', { type: 'button', className: 'pf-btn pf-btn--ghost ft-pm-btn', 'aria-label': 'Меньше', 'data-testid': 'ft-minus', onClick: () => setNum(Math.max(0, (q || 0) - step)) }, '−'),
              qtyInput,
              h('button', { type: 'button', className: 'pf-btn pf-btn--ghost ft-pm-btn', 'aria-label': 'Больше', 'data-testid': 'ft-plus', onClick: () => setNum((q || 0) + step) }, '+')))
        : h('label', { className: 'pf-field' }, `Объём, ${pos.unit_code}`, qtyInput),
      period ? h('label', { className: 'pf-field' }, 'С', h('input', { name: 'date_from', type: 'date', className: 'pj-input', max: today, 'data-testid': 'ft-date-from' })) : null,
      h('label', { className: 'pf-field' }, period ? 'По' : 'Дата', h('input', { name: 'date', type: 'date', className: 'pj-input', defaultValue: today, max: today, 'data-testid': 'ft-date' })),
      h('label', { className: 'pf-field' }, 'Бригада',
        h('select', { name: 'brigade', className: 'pj-input', value: brigade, 'data-testid': 'ft-brigade', onChange: (e) => setBrigade((e.target as HTMLSelectElement).value) },
          h('option', { value: '' }, '— выберите —'), brigades.map((b) => h('option', { key: b.id, value: b.id }, b.name)))),
      h('label', { className: 'pf-field' }, 'Людей', h('input', { name: 'workers', type: 'number', min: 0, inputMode: 'numeric', className: 'pj-input pf-num' })),
      h('label', { className: 'pf-field' }, 'Чел.-ч', h('input', { name: 'man_hours', type: 'text', inputMode: 'decimal', className: 'pj-input pf-num' })),
      h('label', { className: 'pf-field pj-grow' }, 'Примечание', h('input', { name: 'note', type: 'text', className: 'pj-input', maxLength: 300 }))),
    !brigades.length ? h('div', { className: 'pf-error' }, 'Нет бригад. Попросите ПТО или руководителя добавить их в «Справочники → Бригады».') : null,
    after !== null ? h('div', { className: over ? 'ft-warn' : 'pf-muted', 'data-testid': 'ft-after' }, over ? `После записи: ${fmtPct(after)} — больше плана; если выше допуска, потребуется подтверждение РП` : `После записи: ${fmtPct(after)}`) : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    h('div', { className: 'pj-actions' },
      h('button', { type: 'submit', className: 'pf-btn', disabled: busy, 'data-testid': 'ft-save' }, quick ? 'Внести' : 'Записать'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: onCancel }, 'Отмена'),
      quick ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'ft-quick-history', onClick: quick.onHistory },
        quick.historyCount === null ? 'История' : `История (${quick.historyCount})`) : null));
}

export const FACT_ENTRY_CSS = `
.ft-period-seg{align-self:flex-start}
.ft-period-seg .pf-seg-btn{min-width:96px;min-height:40px}
.ft-quick-sum{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;font-variant-numeric:tabular-nums}
.ft-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.ft-step{display:flex;flex-direction:column;align-items:center;gap:2px;min-height:48px;padding:6px 4px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main);font:inherit;font-size:12px;cursor:pointer;font-variant-numeric:tabular-nums}
.ft-step b{font-size:13px}
.ft-step span{color:var(--text-muted);font-size:11px;white-space:nowrap}
.ft-step:disabled{opacity:.45;cursor:default}
.ft-form--quick .ft-form-grid>.pf-field:first-child,.ft-form--quick .ft-form-grid>.pj-grow{grid-column:1/-1}
.ft-pm{display:flex;gap:6px;align-items:stretch}
.ft-pm .pj-input{flex:1 1 auto;min-width:0;text-align:center}
.ft-pm-btn{flex:0 0 44px;min-height:44px;padding:0;font-size:20px;line-height:1}
`;
