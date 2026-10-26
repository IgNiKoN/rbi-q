/**
 * «Справочники → Цены» (P2-0006c): единый справочник цен компании — вкладки «Работы» (по видам работ компании) и «Материалы».
 * Поиск, правка цены в строке (запись в историю с источником «вручную»), дата цены и подсветка старых, история строки,
 * «Добавить материал», «Взять цены из загруженного ВОР» (предпросмотр → применить). Доступ — право planfact.estimate.manage
 * (сервер отвечает на каждый вызов; прораб сюда не попадает).
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { CompanyAccess } from '../../../platform/core/projects.service.ts';
import type { VorApi, WorkType } from '../vor/vor.service.ts';
import type { EstimateApi, PriceHistoryRow, PriceInput, PriceItem } from './estimate.service.ts';
import { isStale, money, parsePriceInput, priceKey } from './prices.ts';
import { PricesImport } from './PricesImport.ts';

type Kind = 'work' | 'material';
interface Line { key: string; kind: Kind; name: string; unit: string; work_type_id: string | null; item: PriceItem | null }

const dateFmt = (d: string): string => { try { return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU'); } catch { return d; } };
const srcLabel = (s: string): string => s === 'manual' ? 'вручную' : s.startsWith('import:') ? 'из ВОР' : s.startsWith('estimate:') ? 'из сметы' : s;

/** Поле цены в строке: сохраняет по Enter/уходу с поля, если значение изменилось. */
export function PriceField(props: { value: number | null; label: string; disabled: boolean; onSave: (v: number) => Promise<boolean>; testid: string }): ReactElement {
  const { value, label, disabled, onSave, testid } = props;
  const [text, setText] = useState(money(value));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(money(value)); setBad(false); }, [value]);
  async function commit(): Promise<void> {
    const v = parsePriceInput(text);
    if (v === null) { setText(money(value)); setBad(false); return; }
    if (Number.isNaN(v)) { setBad(true); return; }
    setBad(false);
    if (value !== null && Math.abs(v - value) < 1e-9) { setText(money(value)); return; }
    if (!(await onSave(v))) setText(money(value));
  }
  return h('label', { className: 'pr-field' },
    h('span', { className: 'pr-field-label' }, label),
    h('input', { type: 'text', inputMode: 'decimal', className: 'pj-input pr-input pf-num' + (bad ? ' pr-input--bad' : ''), value: text, disabled,
      'aria-label': label, 'aria-invalid': bad, 'data-testid': testid, placeholder: '—',
      onChange: (e) => setText((e.target as HTMLInputElement).value),
      onBlur: () => { void commit(); },
      onKeyDown: (e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); } }));
}

function History(props: { api: EstimateApi; item: PriceItem }): ReactElement {
  const [rows, setRows] = useState<PriceHistoryRow[] | null>(null);
  useEffect(() => { void props.api.priceHistory(props.item.id).then(setRows); }, [props.item.id, props.item.updated_at]);
  if (rows === null) return h('div', { className: 'pr-hist pf-muted' }, 'Загрузка…');
  const pair = (o: number | null, n: number | null): string => (o === n ? money(n) : `${o === null ? '—' : money(o)} → ${n === null ? '—' : money(n)}`);
  return h('div', { className: 'pr-hist', 'data-testid': 'pr-history' },
    rows.length ? rows.map((r, i) => h('div', { key: i, className: 'pr-hist-row' },
      h('span', null, new Date(r.changed_at).toLocaleString('ru-RU')),
      h('span', null, srcLabel(r.source)),
      props.item.kind === 'work' ? h('span', null, 'работа: ', pair(r.old_labor, r.new_labor)) : null,
      h('span', null, props.item.kind === 'work' ? 'материалы: ' : 'цена: ', pair(r.old_material, r.new_material)),
      r.changed_by_email ? h('span', { className: 'pf-muted' }, r.changed_by_email) : null))
      : h('div', { className: 'pf-muted' }, 'Изменений пока нет.'));
}

export function PricesTab(props: { api: EstimateApi; vor: VorApi | null; company: CompanyAccess }): ReactElement {
  const { api, vor, company } = props;
  const [items, setItems] = useState<PriceItem[] | null>(null);
  const [denied, setDenied] = useState('');
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [kind, setKind] = useState<Kind>('work');
  const [query, setQuery] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [hist, setHist] = useState('');
  const [confirmDel, setConfirmDel] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    const r = await api.listPrices(company.company_id);
    if (!r.ok) { setDenied(r.message); setItems([]); return; }
    setItems(r.value);
  }
  useEffect(() => {
    void load();
    if (vor) void vor.listProjects().then(async (ps) => {
      const p = ps.find((x) => x.company_id === company.company_id);
      if (p) setWorkTypes(await vor.listWorkTypes(p.id));
    });
  }, []);

  const lines = useMemo<Line[]>(() => {
    if (!items) return [];
    const out = new Map<string, Line>();
    for (const w of workTypes) out.set(priceKey('work', w.id, w.name, null), { key: priceKey('work', w.id, w.name, null), kind: 'work', name: w.name, unit: w.unit_code || '', work_type_id: w.id, item: null });
    for (const p of items) {
      const k = priceKey(p.kind, p.work_type_id, p.name, p.unit_text);
      out.set(k, { key: k, kind: p.kind, name: p.name, unit: p.kind === 'work' ? (p.unit_code || out.get(k)?.unit || '') : p.unit_text, work_type_id: p.work_type_id, item: p });
    }
    return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [items, workTypes]);

  async function save(list: PriceInput[], okText: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    const r = await api.upsertPrices(company.company_id, list, 'manual');
    setBusy(false);
    if (!r.ok) { setError(r.message); return false; }
    setNotice(okText); await load();
    return true;
  }

  function saveLine(l: Line, field: 'labor' | 'material', v: number): Promise<boolean> {
    const input: PriceInput = l.kind === 'work'
      ? { kind: 'work', work_type_id: l.work_type_id, price_labor: field === 'labor' ? v : null, price_material: field === 'material' ? v : null }
      : { kind: 'material', name: l.name, unit_text: l.unit, price_material: v };
    return save([input], `Цена «${l.name}» сохранена`);
  }

  async function addMaterial(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    const f = ev.currentTarget as HTMLFormElement;
    const name = (f.elements.namedItem('name') as HTMLInputElement).value.trim();
    const unit = (f.elements.namedItem('unit') as HTMLInputElement).value.trim();
    const pv = parsePriceInput((f.elements.namedItem('price') as HTMLInputElement).value);
    if (!name) { setError('Введите наименование материала'); return; }
    if (pv === null || Number.isNaN(pv)) { setError('Цена — число от 0'); return; }
    if (await save([{ kind: 'material', name, unit_text: unit, price_material: pv }], 'Материал добавлен')) f.reset();
  }

  async function remove(item: PriceItem): Promise<void> {
    setConfirmDel(''); setBusy(true); setError(''); setNotice('');
    const r = await api.deletePrice(item.id);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setNotice('Цена удалена из справочника'); await load();
  }

  if (items === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  if (denied) return h('div', { className: 'pf-muted', 'data-testid': 'pr-noaccess' }, 'Нет права на цены компании: справочник цен доступен ПТО, руководителю проекта и администратору.');

  const q = query.trim().toLowerCase();
  const shown = lines.filter((l) => l.kind === kind && (!q || l.name.toLowerCase().includes(q))
    && (!onlyEmpty || !l.item || (kind === 'work' ? l.item.price_labor === null : l.item.price_material === null)));
  const count = (k: Kind): number => lines.filter((l) => l.kind === k).length;
  const now = new Date();

  return h('div', { className: 'pj-tab pr-tab', 'data-testid': 'pr-prices' },
    h('div', { className: 'pr-tools' },
      h('div', { className: 'pf-seg pr-seg', role: 'tablist', 'data-testid': 'pr-kinds' },
        (['work', 'material'] as Kind[]).map((k) => h('button', { key: k, type: 'button', role: 'tab', 'aria-selected': kind === k, 'data-kind': k,
          className: 'pf-seg-btn' + (kind === k ? ' pf-seg-btn--active' : ''), onClick: () => setKind(k) },
          `${k === 'work' ? 'Работы' : 'Материалы'} · ${count(k)}`))),
      h('input', { type: 'search', className: 'pj-input pr-search', placeholder: 'Поиск по наименованию', value: query, 'aria-label': 'Поиск',
        onChange: (e) => setQuery((e.target as HTMLInputElement).value) }),
      h('label', { className: 'pr-check' }, h('input', { type: 'checkbox', checked: onlyEmpty, onChange: () => setOnlyEmpty(!onlyEmpty) }), 'Только без цены'),
      h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'pr-import-open', onClick: () => setImportOpen(!importOpen) },
        importOpen ? 'Скрыть «Взять цены из ВОР»' : 'Взять цены из загруженного ВОР')),
    importOpen && vor
      ? h(PricesImport, { api, vor, company, current: items, workTypes,
          onDone: (text: string) => { setImportOpen(false); setNotice(text); void load(); } })
      : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null,
    kind === 'material'
      ? h('form', { className: 'pf-card pj-form', onSubmit: addMaterial, 'data-testid': 'pr-add' },
          h('label', { className: 'pf-field pj-grow' }, 'Материал', h('input', { name: 'name', type: 'text', className: 'pj-input', maxLength: 500 })),
          h('label', { className: 'pf-field pr-unit-in' }, 'ЕИ', h('input', { name: 'unit', type: 'text', className: 'pj-input', maxLength: 50, placeholder: 'кг' })),
          h('label', { className: 'pf-field pr-unit-in' }, 'Цена, ₽', h('input', { name: 'price', type: 'text', inputMode: 'decimal', className: 'pj-input pf-num' })),
          h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Добавить материал'))
      : null,
    h('div', { className: 'pf-card pj-list', 'data-testid': 'pr-list' },
      shown.length
        ? shown.map((l) => h('div', { key: l.key, className: 'pr-row', 'data-key': l.key },
            h('div', { className: 'pr-name' },
              h('b', null, l.name),
              l.unit ? h('span', { className: 'pj-badge' }, l.unit) : null,
              l.item ? h('span', { className: 'pr-date' + (isStale(l.item.price_date, now) ? ' pr-date--stale' : ''), title: isStale(l.item.price_date, now) ? 'Цена старше 90 дней — проверьте' : '' },
                `от ${dateFmt(l.item.price_date)}`) : h('span', { className: 'pr-date pf-muted' }, 'без цены')),
            h('div', { className: 'pr-prices' },
              l.kind === 'work'
                ? h(PriceField, { value: l.item?.price_labor ?? null, label: 'Работа, ₽', disabled: busy, testid: 'pr-labor', onSave: (v) => saveLine(l, 'labor', v) })
                : null,
              h(PriceField, { value: l.item?.price_material ?? null, label: l.kind === 'work' ? 'Материалы в составе, ₽' : 'Цена, ₽', disabled: busy, testid: 'pr-material', onSave: (v) => saveLine(l, 'material', v) }),
              l.item
                ? h('span', { className: 'pr-acts' },
                    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'pr-hist-btn', onClick: () => setHist(hist === l.item!.id ? '' : l.item!.id) }, hist === l.item.id ? 'Скрыть историю' : 'История'),
                    confirmDel === l.item.id
                      ? h('button', { type: 'button', className: 'pf-btn un-danger', disabled: busy, onClick: () => { void remove(l.item!); } }, 'Да, удалить')
                      : h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, onClick: () => setConfirmDel(l.item!.id) }, 'Удалить'))
                : null),
            l.item && hist === l.item.id ? h(History, { api, item: l.item }) : null))
        : h('div', { className: 'pj-empty pf-muted', 'data-testid': 'pr-empty' },
            kind === 'work' ? 'Видов работ пока нет — они появляются при разборе ВОР.' : 'Материалов пока нет — добавьте вручную или возьмите цены из ВОР.')));
}

export const PRICES_CSS = `
.pr-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.pr-seg{flex:0 1 360px}
.pr-search{flex:1 1 220px}
.pr-check{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--text-main);min-height:40px;cursor:pointer}
.pr-check input{accent-color:var(--primary)}
.pr-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--card-border)}
.pr-row:last-child{border-bottom:0}
.pr-name{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;min-width:0;overflow-wrap:anywhere;font-size:13px}
.pr-date{font-size:11px;color:var(--text-muted)}
.pr-date--stale{color:var(--color-yellow);font-weight:700}
.pr-prices{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;justify-content:flex-end}
.pr-field{display:flex;flex-direction:column;gap:2px}
.pr-field-label{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.pr-input{width:150px;min-height:40px;box-sizing:border-box;text-align:right}
.pr-input--bad{border-color:var(--color-red)}
.pr-acts{display:flex;gap:6px}
.pr-unit-in{flex:0 1 120px}
.pr-hist{grid-column:1/-1;display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:10px;background:var(--hover-bg);font-size:12px}
.pr-hist-row{display:flex;flex-wrap:wrap;gap:4px 12px}
@media (max-width:760px){.pr-row{grid-template-columns:minmax(0,1fr)}.pr-prices{justify-content:flex-start}.pr-field{flex:1 1 140px}.pr-input{width:100%}.pr-acts{width:100%}.pr-acts .pf-btn{flex:1 1 auto}.pr-seg{flex:1 1 100%}}
`;
