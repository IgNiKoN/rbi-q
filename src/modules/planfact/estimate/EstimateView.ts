/**
 * Открытая смета (P2-0006c): строки в структуре ВОР заказчика (группы / работы / материалы под работой) — объём, норма,
 * цена работы, цена материала, суммы «Работа / Материалы / Всего»; итоги по листам и всего (calc.ts — единый расчёт).
 * Цена из справочника подставлена сервером; правка в строке — «вручную» (справочник не меняется),
 * подсказка «в справочнике X от даты». Фильтр «без цены»; «Подставить цены справочника заново»; «Цены из файла ВОР»
 * (цены строк загруженного файла → ручные цены сметы); «Записать ручные цены в справочник» (выбор строк, источник — смета).
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { VorApi, VorImport } from '../vor/vor.service.ts';
import type { EstimateApi, EstimateItem, EstimateRow, PriceInput, RowPrice } from './estimate.service.ts';
import { calcRows, calcTotals } from './calc.ts';
import { guessPriceColumns, guessTotalColumns, money, parsePriceInput, unitPrice } from './prices.ts';
import { PriceField } from './PricesTab.ts';

type Filter = 'all' | 'unpriced' | 'manual';
const qtyFmt = (n: number | null): string => n === null ? '' : n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const dateFmt = (d: string | null): string => { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU'); } catch { return d; } };
const same = (a: number | null, b: number | null): boolean => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);

export interface EstimateViewProps {
  api: EstimateApi; vor: VorApi; estimate: EstimateItem; imports: VorImport[]; companyId: string; onBack: () => void;
  /** Блоки следующих этапов (надбавки, КП) — получают строки и итоги прямых затрат. */
  extra?: (rows: EstimateRow[], totals: { labor: number; material: number }, area: number | null) => ReactElement | null;
}

export function EstimateView(props: EstimateViewProps): ReactElement {
  const { api, vor, estimate, imports, companyId, onBack, extra } = props;
  const [rows, setRows] = useState<EstimateRow[] | null>(null);
  const [name, setName] = useState(estimate.name);
  const [areaText, setAreaText] = useState(estimate.area_m2 ? String(estimate.area_m2).replace('.', ',') : '');
  const [filter, setFilter] = useState<Filter>('all');
  const [toRef, setToRef] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    const r = await api.estimateRows(estimate.id);
    if (!r.ok) { setError(r.message); setRows([]); return; }
    setRows(r.value);
  }
  useEffect(() => { void load(); }, []);

  const calc = useMemo(() => calcRows(rows || []), [rows]);
  const totals = useMemo(() => calcTotals(rows || [], calc), [rows, calc]);
  const area = parsePriceInput(areaText);

  async function run<T>(fn: () => Promise<{ ok: true; value: T } | { ok: false; message: string }>, ok: (v: T) => string, reload = true): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.message); return false; }
    setNotice(ok(r.value));
    if (reload) await load();
    return true;
  }

  async function savePrice(r: EstimateRow, field: 'labor' | 'material', v: number): Promise<boolean> {
    const item: RowPrice = { source_row_id: r.source_row_id,
      price_labor: r.kind === 'work' ? (field === 'labor' ? v : r.price_labor) : null,
      price_material: field === 'material' ? v : r.price_material };
    const ok = await run(() => api.setPrices(estimate.id, [item]), () => `Цена строки ${r.row_no} сохранена (вручную)`, false);
    if (ok) setRows((rows || []).map((x) => x.source_row_id === r.source_row_id ? { ...x, price_labor: item.price_labor ?? null, price_material: item.price_material ?? null, price_source: 'manual' } : x));
    return ok;
  }

  async function fromFile(): Promise<void> {
    if (!rows || busy) return;
    setBusy(true); setError(''); setNotice('');
    const items: RowPrice[] = [];
    for (const id of estimate.import_ids) {
      const src = await vor.importRows(id);
      const labels = Array.from(new Set(src.flatMap((r) => Object.keys(r.prices || {}))));
      const cols = guessPriceColumns(labels);
      const tot = guessTotalColumns(labels);
      const byNo = new Map(src.map((r) => [r.row_no, r]));
      for (const r of rows) {
        if (r.import_id !== id || (r.kind !== 'work' && r.kind !== 'material')) continue;
        const s = byNo.get(r.row_no);
        if (!s) continue;
        // Нет цены за единицу, но есть сумма строки — цена = сумма ÷ объём (P2-0009, К2).
        const pl = r.kind === 'work' ? unitPrice(cols.labor ? s.prices[cols.labor] : null, tot.labor ? s.prices[tot.labor] : null, s.qty) : null;
        const pm = unitPrice(cols.material ? s.prices[cols.material] : null, tot.material ? s.prices[tot.material] : null, s.qty);
        if (pl === null && pm === null) continue;
        if (same(pl, r.price_labor) && same(pm, r.price_material)) continue;
        items.push({ source_row_id: r.source_row_id, price_labor: r.kind === 'work' ? pl : null, price_material: pm });
      }
    }
    setBusy(false);
    if (!items.length) { setNotice('Цены сметы уже совпадают с ценами файла ВОР.'); return; }
    await run(() => api.setPrices(estimate.id, items), (n) => `Цены из файла ВОР записаны в смету: ${n} строк (пометка «вручную»).`);
  }

  async function writeToRef(): Promise<void> {
    if (!rows || !toRef) return;
    const list: PriceInput[] = rows.filter((r) => toRef.includes(r.source_row_id)).map((r) => r.kind === 'work'
      ? { kind: 'work', work_type_id: r.work_type_id, price_labor: r.price_labor, price_material: r.price_material }
      : { kind: 'material', name: r.name, unit_text: r.unit_text || '', price_material: r.price_material });
    const ok = await run(() => api.upsertPrices(companyId, list, 'estimate:' + estimate.id),
      (c) => `Записано в справочник: новых ${c.created}, изменено ${c.updated}, без изменений ${c.unchanged}.`);
    if (ok) setToRef(null);
  }

  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка сметы…');
  const manualRows = rows.filter((r) => r.price_source === 'manual' && (r.kind === 'work' ? !!r.work_type_id : true));
  const sheet = (id: string): string => { const i = imports.find((x) => x.id === id); return i ? i.sheet_name : 'лист'; };
  const shown = rows.filter((r) => {
    if (filter === 'all') return true;
    if (r.kind !== 'work' && r.kind !== 'material') return false;
    return filter === 'unpriced' ? !calc.get(r.source_row_id)?.priced : r.price_source === 'manual';
  });

  return h('div', { className: 'pj-tab es-view', 'data-testid': 'es-view' },
    h('div', { className: 'es-head' },
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: onBack }, '← Сметы'),
      h('label', { className: 'pf-field pj-grow' }, 'Смета', h('input', { type: 'text', className: 'pj-input', value: name, maxLength: 300, onChange: (e) => setName((e.target as HTMLInputElement).value) })),
      h('label', { className: 'pf-field' }, 'S, м²', h('input', { type: 'text', inputMode: 'decimal', className: 'pj-input pf-num es-area', value: areaText, 'data-testid': 'es-area',
        onChange: (e) => setAreaText((e.target as HTMLInputElement).value) })),
      h('button', { type: 'button', className: 'pf-btn', disabled: busy, 'data-testid': 'es-save-head',
        onClick: () => { const a = parsePriceInput(areaText); if (a !== null && (Number.isNaN(a) || a <= 0)) { setError('Площадь — положительное число'); return; }
          void run(() => api.updateEstimate(estimate.id, name.trim(), a), () => 'Название и площадь сохранены', false); } }, 'Сохранить')),
    h('div', { className: 'pf-card es-totals', 'data-testid': 'es-totals' },
      h('div', { className: 'es-trow es-trow--head' }, h('span', null, 'Лист'), h('span', { className: 'pf-num' }, 'Работа'), h('span', { className: 'pf-num' }, 'Материалы'), h('span', { className: 'pf-num' }, 'Всего')),
      estimate.import_ids.map((id) => { const s = totals.byImport.get(id); return h('div', { key: id, className: 'es-trow', 'data-import': id },
        h('span', null, `«${sheet(id)}»`, s && s.unpriced ? h('span', { className: 'es-warn' }, ` без цены: ${s.unpriced}`) : null),
        h('span', { className: 'pf-num es-t-l', 'data-testid': 'es-sum-labor' }, money(s?.labor ?? 0)), h('span', { className: 'pf-num es-t-m', 'data-testid': 'es-sum-material' }, money(s?.material ?? 0)),
        h('span', { className: 'pf-num es-t-t' }, money(s?.total ?? 0))); }),
      h('div', { className: 'es-trow es-trow--all' }, h('span', null, 'Прямые затраты по ВОР'), h('span', { className: 'pf-num es-t-l' }, money(totals.all.labor)),
        h('span', { className: 'pf-num es-t-m' }, money(totals.all.material)), h('span', { className: 'pf-num es-t-t', 'data-testid': 'es-sum-all' }, money(totals.all.total)))),
    h('div', { className: 'pr-tools' },
      h('div', { className: 'pf-seg es-filter', role: 'tablist' },
        ([['all', 'Все строки'], ['unpriced', `Без цены · ${totals.all.unpriced}`], ['manual', `Вручную · ${rows.filter((r) => r.price_source === 'manual').length}`]] as [Filter, string][])
          .map(([f, l]) => h('button', { key: f, type: 'button', role: 'tab', 'aria-selected': filter === f, 'data-filter': f,
            className: 'pf-seg-btn' + (filter === f ? ' pf-seg-btn--active' : ''), onClick: () => setFilter(f) }, l))),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, 'data-testid': 'es-refill', onClick: () => { void run(() => api.refill(estimate.id), (n) => `Цены справочника подставлены заново: ${n} строк (ручные не тронуты).`); } }, 'Подставить цены справочника'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, 'data-testid': 'es-from-file', onClick: () => { void fromFile(); } }, 'Цены из файла ВОР'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy || !manualRows.length, 'data-testid': 'es-to-ref',
        onClick: () => setToRef(toRef ? null : manualRows.filter((r) => !same(r.price_labor, r.ref_labor) || !same(r.price_material, r.ref_material)).map((r) => r.source_row_id)) },
        toRef ? 'Отмена' : 'Записать ручные цены в справочник')),
    toRef
      ? h('div', { className: 'pf-card pri-box', 'data-testid': 'es-to-ref-box' },
          h('div', { className: 'pri-step' }, `Отметьте строки, цены которых записать в справочник компании (${toRef.length} из ${manualRows.length}):`),
          h('div', { className: 'pri-list' }, manualRows.map((r) => h('label', { key: r.source_row_id, className: 'pr-check' },
            h('input', { type: 'checkbox', checked: toRef.includes(r.source_row_id), onChange: () => setToRef(toRef.includes(r.source_row_id) ? toRef.filter((x) => x !== r.source_row_id) : [...toRef, r.source_row_id]) }),
            `стр. ${r.row_no} ${r.name.slice(0, 80)} — ${r.kind === 'work' ? `работа ${money(r.price_labor)}${r.price_material !== null ? ` · мат. ${money(r.price_material)}` : ''}` : money(r.price_material)}${r.ref_item_id ? ` (в справочнике ${r.kind === 'work' ? money(r.ref_labor) : money(r.ref_material)})` : ' (новая)'}`))),
          h('div', { className: 'pj-actions' }, h('button', { type: 'button', className: 'pf-btn', disabled: busy || !toRef.length || !companyId, 'data-testid': 'es-to-ref-apply', onClick: () => { void writeToRef(); } }, 'Записать в справочник')))
      : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null,
    h('div', { className: 'pf-card es-rows', 'data-testid': 'es-rows' },
      h('div', { className: 'es-row es-row--head' }, h('span', null, '№'), h('span', null, 'Наименование'), h('span', null, 'ЕИ'), h('span', { className: 'pf-num' }, 'Объём'),
        h('span', { className: 'pf-num' }, 'Цена работы'), h('span', { className: 'pf-num' }, 'Цена мат.'), h('span', { className: 'pf-num' }, 'Работа'), h('span', { className: 'pf-num' }, 'Материалы')),
      shown.slice(0, 3000).map((r, i) => {
        const prevImport = i > 0 ? shown[i - 1].import_id : null;
        const sheetHead = estimate.import_ids.length > 1 && r.import_id !== prevImport
          ? h('div', { key: 'sh' + r.import_id, className: 'es-sheet' }, `Лист «${sheet(r.import_id)}»`) : null;
        if (r.kind === 'group' || r.kind === 'context') {
          return [sheetHead, h('div', { key: r.source_row_id, className: `es-row es-row--${r.kind}` }, h('span', { className: 'es-no' }, String(r.row_no)), h('span', { className: 'es-gname' }, [r.number, r.name].filter(Boolean).join(' ')))];
        }
        const c = calc.get(r.source_row_id);
        const hint = r.price_source === 'manual' && r.ref_item_id && (!same(r.price_labor, r.ref_labor) || !same(r.price_material, r.ref_material))
          ? `в справочнике ${r.kind === 'work' ? money(r.ref_labor) + (r.ref_material !== null ? ' / ' + money(r.ref_material) : '') : money(r.ref_material)} от ${dateFmt(r.ref_date)}` : '';
        return [sheetHead, h('div', { key: r.source_row_id, className: `es-row es-row--${r.kind}${c && !c.priced ? ' es-row--unpriced' : ''}`, 'data-row': r.row_no, 'data-source': r.price_source || '' },
          h('span', { className: 'es-no' }, String(r.row_no)),
          h('span', { className: 'es-name' }, r.number ? h('span', { className: 'vor-num' }, r.number) : null, r.name,
            r.price_source === 'manual' ? h('span', { className: 'es-badge', title: hint }, 'вручную') : null,
            r.price_source === 'none' || (c && !c.priced) ? h('span', { className: 'es-badge es-badge--none' }, 'без цены') : null,
            hint ? h('span', { className: 'es-hint' }, hint) : null),
          h('span', { className: 'es-unit pf-unit' }, r.unit_text || ''),
          h('span', { className: 'pf-num es-qty' }, qtyFmt(c?.qty ?? null), r.norm !== null ? h('span', { className: 'vor-norm' }, `норма ${qtyFmt(r.norm)}`) : null),
          h('span', { className: 'es-price' }, r.kind === 'work'
            ? h(PriceField, { value: r.price_labor, label: 'Цена работы', disabled: busy, testid: 'es-labor', onSave: (v: number) => savePrice(r, 'labor', v) }) : null),
          h('span', { className: 'es-price' }, h(PriceField, { value: r.price_material, label: r.kind === 'work' ? 'Мат. в составе' : 'Цена материала', disabled: busy, testid: 'es-material', onSave: (v: number) => savePrice(r, 'material', v) })),
          h('span', { className: 'pf-num es-sum es-sum--l' }, c && c.labor ? money(c.labor) : ''),
          h('span', { className: 'pf-num es-sum es-sum--m' }, c && c.material ? money(c.material) : ''))];
      })),
    extra ? extra(rows, { labor: totals.all.labor, material: totals.all.material }, area !== null && !Number.isNaN(area) && area > 0 ? area : null) : null);
}

export const ESTIMATE_CSS = `
.es-tab{max-width:1400px}
.es-new{align-items:flex-start}
.es-imports{flex:1 1 100%;display:flex;flex-direction:column;gap:2px}
.es-head{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.es-area{width:140px}
.es-totals{display:flex;flex-direction:column;padding:6px 0}
.es-trow{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(3,minmax(0,1fr));gap:8px;padding:6px 14px;font-size:13px}
.es-trow--head{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.es-trow--all{border-top:1px solid var(--card-border);font-weight:700}
.es-warn{color:var(--color-yellow);font-size:11px;font-weight:700}
.es-filter{flex:0 1 460px}
.es-filter .pf-seg-btn{min-width:0;padding:8px 6px;letter-spacing:.02em}
.es-rows{display:flex;flex-direction:column;max-height:70vh;overflow:auto;overscroll-behavior:contain}
.es-row{display:grid;grid-template-columns:44px minmax(0,1fr) 56px 110px 130px 130px 120px 120px;gap:4px 8px;align-items:center;padding:4px 12px;border-bottom:1px solid var(--card-border);font-size:13px}
.es-row:last-child{border-bottom:0}
.es-row--head{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);position:sticky;top:0;background:var(--card-bg);z-index:1}
.es-row--group,.es-row--context{background:var(--hover-bg);font-weight:700}
.es-row--material .es-name{padding-left:14px;color:var(--text-muted)}
.es-row--unpriced{box-shadow:inset 3px 0 0 var(--color-yellow)}
.es-no{font-size:11px;color:var(--text-muted);font-variant-numeric:tabular-nums}
.es-gname{grid-column:2/-1;min-width:0;overflow-wrap:anywhere}
.es-name{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;min-width:0;overflow-wrap:anywhere}
.es-badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:6px;border:1px solid var(--primary);color:var(--primary)}
.es-badge--none{border-color:var(--color-yellow);color:var(--color-yellow)}
.es-hint{flex-basis:100%;font-size:11px;color:var(--text-muted)}
.es-price .pr-field-label{display:none}
.es-price .pr-input{width:100%;min-height:32px;padding:4px 8px}
.es-sheet{padding:10px 12px 4px;font-size:12px;font-weight:900;text-transform:uppercase;color:var(--text-main);border-bottom:1px solid var(--card-border)}
@media (max-width:1200px){
.es-row--head{display:none}
.es-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:10px 12px}
.es-no{grid-column:1/-1}
.es-name,.es-gname{grid-column:1/-1}
.es-price .pr-field-label{display:block}
.es-unit::before{content:'ЕИ: '}
.es-qty{text-align:left}
.es-sum{text-align:left}
.es-sum--l:not(:empty)::before{content:'Работа = '}
.es-sum--m:not(:empty)::before{content:'Материалы = '}
.es-qty::before{content:'Объём: '}
.es-t-l,.es-t-m,.es-t-t{text-align:left}
.es-t-l::before{content:'Работа: ';color:var(--text-muted)}
.es-t-m::before{content:'Материалы: ';color:var(--text-muted)}
.es-t-t::before{content:'Всего: ';color:var(--text-muted)}
.es-trow{grid-template-columns:minmax(0,1fr);row-gap:2px}
.es-trow--head{display:none}
.es-trow>span:first-child{grid-column:1/-1;font-weight:700}
.es-head .pf-btn{flex:1 1 auto}
}
`;
