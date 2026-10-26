/**
 * «Взять цены из загруженного ВОР» (P2-0006c): выбор подтверждённых загрузок компании → колонки цен (угаданы, можно сменить) →
 * предпросмотр «новых / изменится / без изменений / конфликт» → применить. Конфликт (одна позиция с разными ценами в разных
 * листах/строках) ПТО решает выбором; без выбора позиция не пишется. Источник в истории — import:<id загрузки>.
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { CompanyAccess } from '../../../platform/core/projects.service.ts';
import type { VorApi, VorImport, VorRow, WorkType } from '../vor/vor.service.ts';
import type { EstimateApi, PriceItem } from './estimate.service.ts';
import { applyItems, buildImportPreview, guessPriceColumns, money, previewCounts } from './prices.ts';
import type { PreviewItem, PriceColumns, PreviewStatus } from './prices.ts';

interface Src { imp: VorImport & { project: string }; rows: VorRow[]; labels: string[]; columns: PriceColumns }
const sameAs = (c: { labor: number | null; material: number | null }, p: PriceItem): boolean =>
  (c.labor === null || (p.price_labor !== null && Math.abs(c.labor - p.price_labor) < 1e-9)) && (c.material === null || (p.price_material !== null && Math.abs(c.material - p.price_material) < 1e-9));
const STATUS: Record<PreviewStatus, string> = { new: 'Новая', changed: 'Изменится', same: 'Без изменений', conflict: 'Конфликт' };

const pair = (labor: number | null, material: number | null, kind: string): string =>
  kind === 'work' ? `работа ${labor === null ? '—' : money(labor)} · мат. ${material === null ? '—' : money(material)}` : (material === null ? '—' : money(material));

export function PricesImport(props: { api: EstimateApi; vor: VorApi; company: CompanyAccess; current: PriceItem[]; workTypes: WorkType[]; onDone: (text: string) => void }): ReactElement {
  const { api, vor, company, current, workTypes, onDone } = props;
  const [imports, setImports] = useState<(VorImport & { project: string })[] | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [srcs, setSrcs] = useState<Src[] | null>(null);
  const [choice, setChoice] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<PreviewStatus | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const ps = (await vor.listProjects()).filter((p) => p.company_id === company.company_id);
      const all: (VorImport & { project: string })[] = [];
      for (const p of ps) for (const i of await vor.listImports(p.id)) if (i.status === 'confirmed') all.push({ ...i, project: p.name });
      setImports(all);
    })();
  }, []);

  async function show(): Promise<void> {
    if (!imports) return;
    setBusy(true); setError('');
    const out: Src[] = [];
    for (const id of checked) {
      const imp = imports.find((i) => i.id === id)!;
      const rows = await vor.importRows(id);
      const labels = Array.from(new Set(rows.flatMap((r) => Object.keys(r.prices || {}))));
      out.push({ imp, rows, labels, columns: guessPriceColumns(labels) });
    }
    setBusy(false); setSrcs(out); setChoice({});
  }

  const names = useMemo(() => new Map(workTypes.map((w) => [w.id, w.name])), [workTypes]);
  const preview = useMemo<PreviewItem[]>(() => srcs
    ? buildImportPreview(srcs.map((s) => ({ importId: s.imp.id, label: s.imp.sheet_name, rows: s.rows, columns: s.columns })), current, (id) => names.get(id) || null)
    : [], [srcs, current, names]);
  const counts = previewCounts(preview);
  const sheetOf = (id: string): string => srcs?.find((s) => s.imp.id === id)?.imp.sheet_name || '';

  async function apply(): Promise<void> {
    const groups = applyItems(preview, choice);
    if (!groups.size) { setError('Нечего записывать: новых и изменившихся цен нет (или не выбраны цены в конфликтах).'); return; }
    setBusy(true); setError('');
    let created = 0, updated = 0;
    for (const [importId, list] of groups) {
      const r = await api.upsertPrices(company.company_id, list, 'import:' + importId);
      if (!r.ok) { setBusy(false); setError(r.message); return; }
      created += r.value.created; updated += r.value.updated;
    }
    setBusy(false);
    onDone(`Цены записаны: новых ${created}, изменено ${updated}${counts.conflict - Object.keys(choice).length > 0 ? `; пропущено конфликтов без выбора: ${counts.conflict - Object.keys(choice).length}` : ''}.`);
  }

  if (imports === null) return h('div', { className: 'pf-card pri-box pf-muted' }, 'Загрузка списка ВОР…');
  return h('div', { className: 'pf-card pri-box', 'data-testid': 'pri-box' },
    h('div', { className: 'pri-step' }, '1. Подтверждённые загрузки ВОР компании (можно несколько листов):'),
    imports.length
      ? h('div', { className: 'pri-imports' }, imports.map((i) => h('label', { key: i.id, className: 'pr-check' },
          h('input', { type: 'checkbox', checked: checked.includes(i.id), 'data-testid': 'pri-import',
            onChange: () => { setChecked(checked.includes(i.id) ? checked.filter((x) => x !== i.id) : [...checked, i.id]); setSrcs(null); } }),
          `${i.project} · ${i.file_name} · «${i.sheet_name}» (${i.works} работ)`)))
      : h('div', { className: 'pf-muted' }, 'Подтверждённых загрузок ВОР нет — сначала загрузите и подтвердите ВОР.'),
    h('div', { className: 'pj-actions' },
      h('button', { type: 'button', className: 'pf-btn', disabled: busy || !checked.length, 'data-testid': 'pri-show', onClick: () => { void show(); } }, busy && !srcs ? 'Читаю строки…' : 'Показать цены')),
    srcs ? h('div', { className: 'pri-step' }, '2. Колонки цены за единицу (угаданы по шапке — проверьте):') : null,
    srcs ? srcs.map((s, idx) => h('div', { key: s.imp.id, className: 'pri-cols' },
      h('span', { className: 'pri-sheet' }, `«${s.imp.sheet_name}»`),
      (['labor', 'material'] as const).map((f) => h('label', { key: f, className: 'pf-field pri-col' }, f === 'labor' ? 'Цена работы' : 'Цена материала',
        h('select', { className: 'pj-input', value: s.columns[f] || '', 'data-testid': `pri-col-${f}`,
          onChange: (e) => { const v = (e.target as HTMLSelectElement).value || null; const next = [...srcs]; next[idx] = { ...s, columns: { ...s.columns, [f]: v } }; setSrcs(next); setChoice({}); } },
          h('option', { value: '' }, '— нет —'), s.labels.map((l) => h('option', { key: l, value: l }, l))))))) : null,
    srcs ? h('div', { className: 'pri-step' }, '3. Что изменится в справочнике:') : null,
    srcs ? h('div', { className: 'pf-seg pri-filter', role: 'tablist', 'data-testid': 'pri-counts' },
      (['all', 'new', 'changed', 'conflict', 'same'] as const).map((s) => h('button', { key: s, type: 'button', role: 'tab', 'aria-selected': filter === s, 'data-status': s,
        className: 'pf-seg-btn' + (filter === s ? ' pf-seg-btn--active' : ''), onClick: () => setFilter(s) },
        s === 'all' ? `Все · ${preview.length}` : `${STATUS[s]} · ${counts[s]}`))) : null,
    srcs ? h('div', { className: 'pri-list' },
      preview.filter((p) => filter === 'all' || p.status === filter).slice(0, 500).map((p) => h('div', { key: p.key, className: `pri-row pri-row--${p.status}`, 'data-status': p.status },
        h('div', { className: 'pr-name' }, h('b', null, p.name), p.unit ? h('span', { className: 'pj-badge' }, p.unit) : null,
          h('span', { className: 'pri-status' }, STATUS[p.status])),
        p.status === 'conflict'
          ? h('div', { className: 'pri-opts' }, p.candidates.map((c, i) => h('label', { key: i, className: 'pr-check' },
              h('input', { type: 'radio', name: 'c-' + p.key, checked: choice[p.key] === i, 'data-testid': 'pri-choice', onChange: () => setChoice({ ...choice, [p.key]: i }) }),
              `${pair(c.labor, c.material, p.kind)} — «${sheetOf(c.importId)}», стр. ${c.rowNo}${p.current && sameAs(c, p.current) ? ' (сейчас в справочнике)' : ''}`)))
          : h('div', { className: 'pri-vals' },
              p.current ? h('span', { className: 'pf-muted' }, 'было: ' + pair(p.current.price_labor, p.current.price_material, p.kind)) : null,
              h('span', null, (p.current ? 'станет: ' : '') + pair(p.candidates[0].labor, p.candidates[0].material, p.kind)))))) : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    srcs ? h('div', { className: 'pj-actions' },
      h('button', { type: 'button', className: 'pf-btn', disabled: busy, 'data-testid': 'pri-apply', onClick: () => { void apply(); } }, 'Применить')) : null);
}

export const PRICES_IMPORT_CSS = `
.pri-box{display:flex;flex-direction:column;gap:10px;padding:14px}
.pri-step{font-size:12px;font-weight:700;color:var(--text-main)}
.pri-imports{display:flex;flex-direction:column;gap:2px}
.pri-cols{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:flex-end}
.pri-sheet{font-size:13px;font-weight:700;min-width:120px}
.pri-col{flex:1 1 260px;min-width:0}
.pri-col select{width:100%}
.pri-filter .pf-seg-btn{min-width:0;padding:8px 6px;letter-spacing:.02em}
.pri-list{display:flex;flex-direction:column;max-height:60vh;overflow-y:auto;border:1px solid var(--card-border);border-radius:12px}
.pri-row{display:flex;flex-direction:column;gap:4px;padding:8px 12px;border-bottom:1px solid var(--card-border);font-size:13px}
.pri-row:last-child{border-bottom:0}
.pri-status{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.pri-row--new .pri-status{color:var(--color-green)}
.pri-row--changed .pri-status{color:var(--color-yellow)}
.pri-row--conflict .pri-status{color:var(--color-red)}
.pri-vals,.pri-opts{display:flex;flex-wrap:wrap;gap:4px 14px}
@media (max-width:600px){.pri-box .pj-actions .pf-btn{flex:1 1 auto}}
`;
