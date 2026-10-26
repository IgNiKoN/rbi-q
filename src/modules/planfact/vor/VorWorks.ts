/**
 * Черновик ВОР, «Виды работ» (P2-0006, этап 5): светофор строк-работ 🟢/🟡/🔴, фильтр по цвету, подтверждение 🟡 пачкой,
 * для 🔴 — выбрать вид работ из справочника или создать (наименование и ЕИ — из строки), неизвестная ЕИ — «Добавить ЕИ».
 * Каждое подтверждение пополняет словарь компании (pf_vor_learn) и сохраняется в строку черновика (pf_vor_resolve_rows).
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import type { ProjectsApi, UnitItem } from '../../../platform/core/projects.service.ts';
import { classify, canonName, unitKey, workTypeName, buildIdf, findUnit } from './matching.ts';
import type { Light, Verdict } from './matching.ts';
import type { DictEntry, Resolution, VorApi, VorRow, WorkType } from './vor.service.ts';

export const LIGHT_LABEL: Record<Light, string> = { green: '🟢 есть в словаре', yellow: '🟡 похоже', red: '🔴 нет вариантов' };
const PAGE = 100;

export interface RowVerdict { row: VorRow; v: Verdict }

/** Цвет строки: подтверждённое решение (green в черновике) — как есть, иначе — по словарю и справочнику. */
export function verdicts(rows: VorRow[], units: { id: string; code: string }[], workTypes: WorkType[], dict: DictEntry[]): RowVerdict[] {
  const works = rows.filter((r) => r.kind === 'work');
  // Вес слов — по видам работ компании и строкам этой загрузки: общие слова формы («поверхности», «смесями») весят мало.
  const idf = buildIdf([...workTypes.map((w) => w.name), ...dict.map((d) => d.canon_name), ...works.map((r) => r.name)]);
  return works.map((r) => {
    if (r.match === 'green' && r.work_type_id && r.unit_id) return { row: r, v: { light: 'green', workTypeId: r.work_type_id, unitId: r.unit_id, score: 1, reason: 'dictionary' } };
    // ЕИ строки не распознана, но ПТО выбрал её в черновике — разбираем строку с этой ЕИ.
    const chosen = r.unit_id && !findUnit(r.unit_text, units) ? units.find((u) => u.id === r.unit_id) : undefined;
    const v = classify(r.name, chosen ? chosen.code : r.unit_text, units, workTypes, dict, idf);
    return { row: r, v };
  });
}

export function VorWorks(props: {
  api: VorApi; projects: ProjectsApi | null; projectId: string; companyId: string; rows: VorRow[]; editable: boolean; canUnits: boolean;
  save: (items: Resolution[]) => Promise<boolean>;
}): ReactElement {
  const { api, projects, projectId, companyId, rows, editable, canUnits, save } = props;
  const [units, setUnits] = useState<UnitItem[] | null>(null);
  const [types, setTypes] = useState<WorkType[] | null>(null);
  const [dict, setDict] = useState<DictEntry[] | null>(null);
  const [filter, setFilter] = useState<Light | 'all'>('all');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [choice, setChoice] = useState<Record<number, string>>({});

  async function reload(): Promise<void> {
    const [u, t, d] = await Promise.all([projects ? projects.listUnits(companyId) : Promise.resolve([] as UnitItem[]), api.listWorkTypes(projectId), api.dictionary(projectId)]);
    setUnits(u); setTypes(t); setDict(d);
  }
  useEffect(() => { void reload(); }, [projectId]);

  const list = useMemo(() => units && types && dict ? verdicts(rows, units, types, dict) : null, [rows, units, types, dict]);

  // 🟢 по словарю, ещё не сохранённые в черновике, — сохранить (подтверждение ПТО уже было раньше — запись словаря).
  useEffect(() => {
    if (!list || !editable || busy) return;
    const auto = list.filter((x) => x.v.light === 'green' && x.row.match !== 'green');
    if (!auto.length) return;
    setBusy('Сохраняю 🟢…');
    void save(auto.map((x) => ({ row_no: x.row.row_no, location_id: x.row.location_id, work_type_id: x.v.workTypeId, unit_id: x.v.unitId, match: 'green' })))
      .then(() => setBusy(''));
  }, [list]);

  /** Подтвердить решения: словарь компании + строки черновика (зелёные). */
  async function confirm(items: { row: VorRow; workTypeId: string; unitId: string }[]): Promise<void> {
    if (!items.length) return;
    setError('');
    const learn = await api.learn(projectId, items.map((x) => ({ name: x.row.name, unit_text: unitKey(x.row.unit_text), work_type_id: x.workTypeId })));
    if (!learn.ok) { setError(learn.message); return; }
    const ok = await save(items.map((x) => ({ row_no: x.row.row_no, location_id: x.row.location_id, work_type_id: x.workTypeId, unit_id: x.unitId, match: 'green' })));
    if (ok) setDict(await api.dictionary(projectId));
  }

  async function confirmYellow(): Promise<void> {
    if (!list || busy) return;
    setBusy('Подтверждаю 🟡…');
    await confirm(list.filter((x) => x.v.light === 'yellow' && x.v.workTypeId && x.v.unitId)
      .map((x) => ({ row: x.row, workTypeId: (choice[x.row.row_no] || x.v.workTypeId) as string, unitId: x.v.unitId as string })));
    setBusy('');
  }

  /** 🔴 с известной ЕИ: создать виды работ из строк (без дублей по наименованию + ЕИ) и подтвердить. */
  async function createRed(only?: RowVerdict): Promise<void> {
    if (!list || busy) return;
    const reds = (only ? [only] : list.filter((x) => x.v.light === 'red' && x.v.unitId && !choice[x.row.row_no])) as RowVerdict[];
    if (!reds.length) return;
    setBusy(only ? 'Создаю вид работ…' : `Создаю виды работ: ${reds.length}…`); setError('');
    const uniq = new Map<string, { name: string; unit_id: string | null }>();
    for (const x of reds) { const n = workTypeName(x.row.name); const k = canonName(n) + '|' + x.v.unitId; if (!uniq.has(k)) uniq.set(k, { name: n, unit_id: x.v.unitId }); }
    const made = await api.addWorkTypes(projectId, Array.from(uniq.values()));
    if (!made.ok) { setBusy(''); setError(made.message); return; }
    const idOf = new Map(made.value.map((m) => [canonName(m.name) + '|' + m.unit_id, m.id]));
    setTypes(await api.listWorkTypes(projectId));
    await confirm(reds.map((x) => ({ row: x.row, workTypeId: idOf.get(canonName(workTypeName(x.row.name)) + '|' + x.v.unitId) as string, unitId: x.v.unitId as string })));
    setBusy('');
  }

  async function applyChoice(x: RowVerdict): Promise<void> {
    const wt = choice[x.row.row_no] || x.v.workTypeId;
    if (!wt || !x.v.unitId || busy) return;
    setBusy('Сохраняю…');
    await confirm([{ row: x.row, workTypeId: wt, unitId: x.v.unitId }]);
    setBusy('');
  }

  /** Пустая ЕИ в файле: ПТО выбирает ЕИ строки (сохраняется в черновик; словарь запомнит решение «без ЕИ»). */
  async function chooseUnit(x: RowVerdict, unitId: string): Promise<void> {
    if (busy || !unitId) return;
    setBusy('Сохраняю ЕИ…');
    await save([{ row_no: x.row.row_no, location_id: x.row.location_id, work_type_id: x.row.work_type_id, unit_id: unitId, match: null }]);
    setBusy('');
  }

  async function addUnit(text: string): Promise<void> {
    if (!projects || busy) return;
    setBusy('Добавляю ЕИ…'); setError('');
    const code = String(text || '').trim();
    const r = await projects.addUnit(companyId, code, code);
    if (!r.ok) setError(r.message);
    setUnits(await projects.listUnits(companyId));
    setBusy('');
  }

  if (!list || !types) return h('div', { className: 'pf-muted' }, 'Загрузка видов работ…');
  const count = (l: Light): number => list.filter((x) => x.v.light === l).length;
  const shown = list.filter((x) => filter === 'all' || x.v.light === filter);
  const nameOf = (id: string | null): string => (id && types.find((t) => t.id === id)?.name) || '';
  const redCreatable = list.filter((x) => x.v.light === 'red' && x.v.unitId).length;
  const unknownUnits = Array.from(new Set(list.filter((x) => x.v.reason === 'unit').map((x) => (x.row.unit_text || '').trim())));

  return h('div', { className: 'pj-tab', 'data-testid': 'vor-works' },
    h('h3', { className: 'pf-title un-title' }, 'Виды работ'),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    h('div', { className: 'pf-seg vor-filter vor-lights', role: 'tablist', 'data-testid': 'vor-lights' },
      ([['all', `Все ${list.length}`], ['green', `🟢 ${count('green')}`], ['yellow', `🟡 ${count('yellow')}`], ['red', `🔴 ${count('red')}`]] as [Light | 'all', string][])
        .map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', 'data-light': id, 'aria-selected': filter === id,
          className: 'pf-seg-btn' + (filter === id ? ' pf-seg-btn--active' : ''), onClick: () => { setFilter(id); setLimit(PAGE); } }, label))),
    editable
      ? h('div', { className: 'pj-actions vor-works-actions' },
          count('yellow') ? h('button', { type: 'button', className: 'pf-btn', disabled: !!busy, 'data-testid': 'vor-confirm-yellow', onClick: () => { void confirmYellow(); } },
            `Подтвердить все 🟡 (${count('yellow')})`) : null,
          redCreatable ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: !!busy, 'data-testid': 'vor-create-red', onClick: () => { void createRed(); } },
            `Создать виды работ для 🔴 (${redCreatable})`) : null,
          busy ? h('span', { className: 'pf-muted' }, busy) : null)
      : null,
    unknownUnits.length
      ? h('div', { className: 'pf-card vor-missing', 'data-testid': 'vor-unknown-units' },
          h('b', null, 'ЕИ строк, которых нет в справочнике: ' + unknownUnits.map((u) => u ? `«${u}»` : '«пусто»').join(', ')),
          editable && canUnits
            ? h('div', { className: 'pj-actions' }, unknownUnits.filter(Boolean).map((u) => h('button', { key: u, type: 'button', className: 'pf-btn pf-btn--ghost', disabled: !!busy,
                'data-testid': 'vor-add-unit', onClick: () => { void addUnit(u); } }, `Добавить ЕИ «${u}»`)))
            : h('div', { className: 'pf-muted' }, 'Добавить ЕИ может ПТО, РП или администратор — «Справочники → Единицы».'),
          unknownUnits.includes('') ? h('div', { className: 'pf-muted' }, 'У строк с пустой ЕИ выберите ЕИ в списке у строки — решение запомнится в словаре.') : null)
      : null,
    h('div', { className: 'pf-card vor-list', 'data-testid': 'vor-work-rows' },
      shown.slice(0, limit).map((x) => h('div', { key: x.row.row_no, className: `vor-wrow vor-wrow--${x.v.light}`, 'data-light': x.v.light, 'data-row': x.row.row_no },
        h('span', { className: 'vor-light' }, LIGHT_LABEL[x.v.light]),
        h('span', { className: 'vor-c-name' }, h('span', null, x.row.name),
          h('span', { className: 'vor-place' }, `стр. ${x.row.row_no} · ${x.row.unit_text || 'нет ЕИ'} · ${x.row.qty === null ? 'нет объёма' : x.row.qty.toLocaleString('ru-RU')}`),
          x.row.context && x.row.context.note ? h('span', { className: 'pf-muted vor-wnote', 'data-testid': 'vor-wnote' }, x.row.context.note) : null,
          x.v.workTypeId ? h('span', { className: 'pf-muted' }, `→ ${nameOf(x.v.workTypeId)}${x.v.light === 'yellow' ? ` (сходство ${Math.round(x.v.score * 100)} %)` : ''}`) : null),
        editable && x.v.light !== 'green' && x.v.unitId
          ? h('span', { className: 'vor-wrow-act' },
              h('select', { className: 'pj-input', value: choice[x.row.row_no] || x.v.workTypeId || '', 'data-testid': 'vor-wt-select',
                onChange: (e: ChangeEvent<HTMLSelectElement>) => setChoice({ ...choice, [x.row.row_no]: e.currentTarget.value }) },
                h('option', { value: '' }, '— выбрать вид работ —'),
                types.filter((t) => !t.unit_id || t.unit_id === x.v.unitId).map((t) => h('option', { key: t.id, value: t.id }, t.name))),
              h('button', { type: 'button', className: 'pf-btn', disabled: !!busy || !(choice[x.row.row_no] || x.v.workTypeId), 'data-testid': 'vor-wt-apply',
                onClick: () => { void applyChoice(x); } }, 'Подтвердить'),
              x.v.light === 'red' ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: !!busy, 'data-testid': 'vor-wt-create',
                onClick: () => { void createRed(x); } }, 'Создать вид работ') : null)
          : editable && x.v.reason === 'unit' && !(x.row.unit_text || '').trim() && units
            ? h('span', { className: 'vor-wrow-act' },
                h('select', { className: 'pj-input', value: '', 'data-testid': 'vor-unit-select',
                  onChange: (e: ChangeEvent<HTMLSelectElement>) => { void chooseUnit(x, e.currentTarget.value); } },
                  h('option', { value: '' }, '— ЕИ в файле пустая: выбрать —'),
                  units.map((u) => h('option', { key: u.id, value: u.id }, u.code))))
            : null)),
      shown.length > limit ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost vor-more', onClick: () => setLimit(limit + PAGE) }, `Показать ещё (${shown.length - limit})`) : null,
      shown.length ? null : h('div', { className: 'pj-empty pf-muted' }, 'Нет строк этого цвета.')));
}

export const VOR_WORKS_CSS = `
.vor-lights .pf-seg-btn{min-width:0;padding:8px 6px;letter-spacing:.02em}
.vor-works-actions{align-items:center}
.vor-wrow{display:grid;grid-template-columns:150px minmax(0,1fr) minmax(0,360px);gap:10px;align-items:start;padding:10px 14px;border-bottom:1px solid var(--card-border)}
.vor-wrow:last-child{border-bottom:0}
.vor-wrow--green .vor-light{color:var(--color-green)}
.vor-wrow--yellow .vor-light{color:var(--color-yellow)}
.vor-wrow--red .vor-light{color:var(--color-red)}
.vor-light{font-size:11px;font-weight:700;white-space:nowrap}
.vor-wnote{font-size:11px}
.vor-wrow-act{display:flex;flex-wrap:wrap;gap:6px}
.vor-wrow-act select{flex:1 1 200px;min-width:0;min-height:40px}
.vor-more{margin:10px 14px}
@media (max-width:760px){.vor-wrow{grid-template-columns:minmax(0,1fr)}.vor-wrow-act .pf-btn{flex:1 1 auto}}
`;
