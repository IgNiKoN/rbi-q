/**
 * Экран «План/Факт → ВОР» (P2-0006): проект → загрузки проекта; загрузка Excel, выбор листа, предпросмотр разбора,
 * «Сохранить черновик» (строки исходника на сервер порциями). Без сервера (демо) — только предпросмотр.
 * Библиотека Excel и чтение файла подгружаются лениво (import('./xlsx-reader.ts')) — только когда выбран файл.
 */
import { isPartial, useMyArea } from '../area.ts';
import { createElement as h, Fragment, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { parseSheet, contextLabel, columnMapFrom, editColumn } from './parse.ts';
import type { ColumnMap, EditableRole, ParseResult, ParsedRow, RowKind, SheetData } from './parse.ts';
import { VorColumns } from './VorColumns.ts';
import { VorDraft, revisionLabel } from './VorDraft.ts';
import { RowErrorsCard } from './VorRevision.ts';
import { rowErrors } from './revision.ts';
import { VorPositions } from './VorPositions.ts';
import { PositionsRegistry, POSITIONS_REGISTRY_CSS } from './PositionsRegistry.ts';
import { positionRegistryActions, POSITION_ACTIONS_CSS } from './PositionActions.ts';
import type { FactApi } from '../fact/fact.service.ts';
import type { SummaryApi } from '../summary/summary.service.ts';
import type { ProjectsApi } from '../../../platform/core/projects.service.ts';
import { VOR_MANAGE } from './vor.service.ts';
import type { VorApi, VorImport, VorProfile, VorProject } from './vor.service.ts';
import { initialProjectId, isArchived, ProjectPicker } from '../ProjectPicker.ts';
import { InHead } from '../PageHead.ts';
import { StatusBadge } from '../../../platform/ui/index.ts';

const KIND_LABEL: Record<RowKind, string> = { work: 'Работа', material: 'Материал', group: 'Группа', context: 'Место', skip: 'Пропуск' };
type Filter = 'all' | RowKind;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' }, { id: 'work', label: 'Работы' }, { id: 'material', label: 'Материалы' },
  { id: 'group', label: 'Группы' }, { id: 'context', label: 'Места' }, { id: 'skip', label: 'Пропуск' }
];

export interface LoadedFile { name: string; sheets: SheetData[]; sha256: string }

/** Читает выбранный файл: лениво грузит модуль чтения Excel. Вынесено для подмены в тестах. */
export async function loadFile(file: File): Promise<LoadedFile> {
  const buf = await file.arrayBuffer();
  const { readWorkbook, sha256Hex } = await import('./xlsx-reader.ts');
  const wb = await readWorkbook(buf);
  return { name: file.name, sheets: wb.sheets, sha256: await sha256Hex(buf) };
}

const dateFmt = (iso: string): string => { try { return new Date(iso).toLocaleDateString('ru-RU'); } catch { return iso; } };

/** Загрузки ВОР проекта: файл · лист · статус · строки/работы · кто и когда. Черновик можно удалить (право vor.manage). */
function ImportsList(props: { items: VorImport[] | null; canManage: boolean; busy: boolean; onDelete: (i: VorImport) => void; onOpen: (i: VorImport) => void }): ReactElement {
  const { items, canManage, busy, onDelete, onOpen } = props;
  const [confirm, setConfirm] = useState('');
  if (items === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  // P2-0006b: действующие редакции и черновики — сверху; заменённые — «Прежние редакции» (только просмотр)
  const replaced = (i: VorImport): boolean => i.status === 'confirmed' && i.is_current === false;
  const ordered = [...items.filter((i) => !replaced(i)), ...items.filter(replaced)];
  return h('div', { className: 'pf-card pj-list', 'data-testid': 'vor-imports' },
    ordered.length
      // P2-0046: загрузка — строка файла: имя и лист, «строк → позиций», когда и кто, статус словом и цветом
      ? ordered.map((i, k) => h(Fragment, { key: i.id }, replaced(i) && (k === 0 || !replaced(ordered[k - 1]))
          ? h('div', { className: 'vor-imp-sep pf-muted', 'data-testid': 'vor-old-revisions' }, 'Прежние редакции — только просмотр') : null,
        h('div', { className: 'pj-row vor-imp' + (replaced(i) ? ' vor-imp--old' : ''), 'data-import-id': i.id },
          h('span', { className: 'vor-imp-ic', 'aria-hidden': 'true' }, 'XLSX'),
          h('div', { className: 'pj-name vor-imp-name' },
            h('span', { className: 'vor-imp-top' }, h('b', null, i.file_name),
              h(StatusBadge, { status: i.status === 'draft' ? 'yellow' : replaced(i) ? 'grey' : 'green',
                label: i.status === 'draft' ? revisionLabel(i) : replaced(i) ? `№${i.revision_no || 1} · заменена` : `Действующая · №${i.revision_no || 1}` })),
            h('span', { className: 'pf-muted' }, `лист «${i.sheet_name}» · строк: ${i.row_count} → ${i.positions ? `позиций: ${i.positions}` : `работ: ${i.works}`} · ${dateFmt(i.created_at)}${i.created_by_email ? ' · ' + i.created_by_email : ''}`)),
          h('span', { className: 'pj-actions' },
            h('button', { type: 'button', className: 'pf-btn' + (i.status === 'draft' && canManage ? '' : ' pf-btn--ghost'), 'data-testid': 'vor-open', onClick: () => onOpen(i) }, i.status === 'draft' && canManage ? 'Разобрать' : 'Открыть')),
          canManage && i.status === 'draft'
            ? (confirm === i.id
                ? h('span', { className: 'pj-actions' },
                    h('button', { type: 'button', className: 'pf-btn un-danger', disabled: busy, 'data-testid': 'vor-delete-yes', onClick: () => { setConfirm(''); onDelete(i); } }, 'Да, удалить'),
                    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setConfirm('') }, 'Нет'))
                : h('span', { className: 'pj-actions' },
                    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, 'data-testid': 'vor-delete', onClick: () => setConfirm(i.id) }, 'Удалить черновик')))
            : null)))
      : h('div', { className: 'pj-empty pf-muted', 'data-testid': 'vor-imports-empty' }, 'Загрузок ВОР в этом проекте пока нет.'));
}

const XLSX_ACCEPT = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const fmt = (n: number | null): string => n === null ? '' : n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });

function RowView(props: { r: ParsedRow; warn?: string }): ReactElement {
  const { r, warn } = props;
  const place = contextLabel(r.context);
  return h('div', { className: `vor-row vor-row--${r.kind}` + (warn ? ' vor-row--warn' : ''), 'data-kind': r.kind, 'data-row': r.rowNo, 'data-warn': warn ? '1' : undefined },
    h('span', { className: 'vor-c-no' }, String(r.rowNo)),
    h('span', { className: 'vor-c-kind' }, h('span', { className: `vor-kind vor-kind--${r.kind}` }, KIND_LABEL[r.kind])),
    h('span', { className: 'vor-c-name' },
      r.number ? h('span', { className: 'vor-num' }, r.number) : null,
      h('span', null, r.name || '—'),
      place && r.kind !== 'context' ? h('span', { className: 'vor-place' }, place) : null,
      r.context.note ? h('span', { className: 'vor-note' }, r.context.note) : null,
      warn ? h('span', { className: 'vor-warn' }, warn) : null),
    h('span', { className: 'vor-c-unit pf-unit' }, r.unitText || ''),
    h('span', { className: 'vor-c-qty pf-num' }, fmt(r.qty), r.norm !== null ? h('span', { className: 'vor-norm' }, `норма ${fmt(r.norm)}`) : null));
}

/** P2-0019: sub — подвкладка «Загрузка» / «Позиции» (реестр; нужны fact и summary — те же функции, что «Факт» и «Сводка»);
 *  onCount — число позиций проекта для счётчика подвкладки; save — скачивание Excel (подменяется в тестах). */
export function VorTab(props: { api?: VorApi | null; projects?: ProjectsApi | null; load?: (f: File) => Promise<LoadedFile>;
  sub?: 'load' | 'positions'; fact?: FactApi | null; summary?: SummaryApi | null; user?: string; onCount?: (n: number | null) => void;
  save?: (bytes: Uint8Array, name: string) => void }): ReactElement {
  const load = props.load || loadFile;
  const api = props.api || null;
  const registry = !!(api && props.fact && props.summary);
  const sub = props.sub || 'load';
  const [openId, setOpenId] = useState('');
  const [projects, setProjects] = useState<VorProject[] | null>(api ? null : []);
  const [projectId, setProjectId] = useState('');
  const [perms, setPerms] = useState<string[]>([]);
  const [imports, setImports] = useState<VorImport[] | null>(null);
  const [posCount, setPosCount] = useState<number | null>(null);
  const [saving, setSaving] = useState('');
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [sheet, setSheet] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [profiles, setProfiles] = useState<VorProfile[]>([]);
  const [overrides, setOverrides] = useState<Record<string, ColumnMap>>({});
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  // P2-0006b: файл — новая редакция к действующей (id действующей) или отдельная ВОР ('')
  const [prevId, setPrevId] = useState('');

  /** Разбор каждого листа: ручная карта колонок → профиль формы, узнанный по подписи шапки → колонки по шапке. */
  const results = useMemo<Record<string, { r: ParseResult; profile: VorProfile | null }>>(() => {
    const out: Record<string, { r: ParseResult; profile: VorProfile | null }> = {};
    if (file) for (const s of file.sheets) {
      const auto = parseSheet(s);
      const profile = auto.signature ? profiles.find((p) => p.signature === auto.signature) || null : null;
      const map = overrides[s.name] || (profile ? columnMapFrom(profile.column_map) : null);
      out[s.name] = { r: map ? parseSheet(s, map) : auto, profile };
    }
    return out;
  }, [file, profiles, overrides]);
  const cur = sheet ? results[sheet] : null;
  const res = cur ? cur.r : null;
  const canManage = perms.includes(VOR_MANAGE) && !isArchived((projects || []).find((p) => p.id === projectId));   // архивный объект — только просмотр
  const canProjects = perms.includes('planfact.projects.manage');
  const opened = openId && imports ? imports.find((i) => i.id === openId) || null : null;
  const currents = (imports || []).filter((i) => i.status === 'confirmed' && i.is_current !== false);
  const prev = prevId ? currents.find((i) => i.id === prevId) || null : null;
  const edited = !!(sheet && overrides[sheet]);
  const defaultName = cur && cur.profile ? cur.profile.name : file ? file.name.replace(/\.xlsx$/i, '') : '';
  const profileName = sheet && profileNames[sheet] !== undefined ? profileNames[sheet] : defaultName;

  function editCol(role: EditableRole, col: number | null): void {
    if (!res || !res.columns) return;
    setOverrides({ ...overrides, [sheet]: editColumn(res.columns, res.labels, role, col) });
  }
  function resetCols(): void {
    const next = { ...overrides }; delete next[sheet]; setOverrides(next);
  }

  useEffect(() => {
    if (!api) return;
    void api.listProjects().then((list) => { setProjects(list); if (list.length) setProjectId(initialProjectId(list, window.location.hash)); });
  }, []);

  // Счётчик подвкладки «Позиции (N)» — позиции подтверждённых загрузок проекта.
  // P2-0048: при назначении на часть проекта загрузки ВОР — файлы всего проекта (сервер их по области не делит, 047 —
  // только позиции и факт): содержимое загрузок не показываем, счётчик — по позициям области (реестр «Позиции»).
  const area = useMyArea(projectId);
  const partial = isPartial(area);
  useEffect(() => {
    if (!props.onCount) return;
    if (partial) { props.onCount(posCount); return; }
    props.onCount(imports ? imports.filter((i) => i.status === 'confirmed' && i.is_current !== false).reduce((a, i) => a + (i.positions || 0), 0) : null);
  }, [imports, partial, posCount]);

  async function reloadImports(p: string): Promise<void> {
    if (!api || !p) return;
    setImports(null);
    setImports(await api.listImports(p));
  }
  useEffect(() => {
    if (!api || !projectId) return;
    setPerms([]); setNotice(''); setOpenId('');
    void api.permissions(projectId).then(setPerms);
    void api.listProfiles(projectId).then(setProfiles);
    void reloadImports(projectId);
  }, [projectId]);

  async function saveDraft(): Promise<void> {
    if (!api || !file || !res || !res.isVor || saving) return;
    setSaving('Сохраняю…'); setError(''); setNotice('');
    // Профиль формы: новая форма или правленая карта колонок → запомнить (по подписи шапки), иначе — узнанный профиль.
    let profileId = cur && cur.profile ? cur.profile.id : null;
    if (res.columns && res.signature && (!profileId || edited || (cur && cur.profile && cur.profile.name !== profileName.trim()))) {
      const pr = await api.saveProfile(projectId, profileName.trim() || defaultName || 'Форма ВОР', res.signature, res.columns as unknown as Record<string, unknown>);
      if (!pr.ok) { setSaving(''); setError(pr.message); return; }
      profileId = pr.value;
      setProfiles(await api.listProfiles(projectId));
      const next = { ...overrides }; delete next[res.sheet]; setOverrides(next);
    }
    const totals = { works: res.stats.works, materials: res.stats.materials, rows: res.rows.length, checks: res.checks,
      kvr: res.kvrChecks.length ? { checks: res.kvrChecks.length, bad: res.kvrChecks.filter((c) => !c.ok).length } : undefined };
    const r = await api.saveDraft({ projectId, fileName: file.name, sha256: file.sha256, sheet: res.sheet, profileId, totals, previousId: prev ? prev.id : null }, res.rows,
      (done) => setSaving(`Сохраняю… ${done} из ${res.rows.length} строк`));
    setSaving('');
    if (!r.ok) { setError(r.message); return; }
    setNotice(prev ? `Черновик новой редакции №${(prev.revision_no || 1) + 1} сохранён: ${res.rows.length} строк. Проверьте места и виды работ, затем — сравнение.`
      : `Черновик сохранён: ${res.rows.length} строк листа «${res.sheet}».`);
    await reloadImports(projectId);
    setOpenId(r.value);
  }

  async function removeImport(i: VorImport): Promise<void> {
    if (!api) return;
    setSaving('Удаляю…'); setError(''); setNotice('');
    const r = await api.deleteImport(i.id);
    setSaving('');
    if (!r.ok) { setError(r.message); return; }
    setNotice('Черновик удалён'); await reloadImports(projectId);
  }

  /** Ошибка в списке → строка разбора: фильтр «Все», прокрутка и подсветка. */
  function showRow(rowNo: number): void {
    setFilter('all');
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-testid="vor-rows"] [data-row="${rowNo}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('vor-row--flash'); void el.offsetWidth; el.classList.add('vor-row--flash');
    }, 30);
  }

  async function pick(ev: ChangeEvent<HTMLInputElement>, revisionOf: string): Promise<void> {
    const f = ev.currentTarget.files && ev.currentTarget.files[0];
    if (!f) return;
    setPrevId(revisionOf);
    setBusy(true); setError(''); setFile(null); setSheet(''); setFilter('all'); setOverrides({}); setProfileNames({});
    try {
      if (!/\.xlsx$/i.test(f.name)) throw new Error('Нужен файл Excel .xlsx (старый .xls сохраните как .xlsx).');
      const lf = await load(f);
      setFile(lf);
      const parsed = lf.sheets.map((s) => ({ s, r: parseSheet(s) }));
      const first = parsed.filter((x) => x.r.isVor).sort((a, b) => Number(!!a.s.hidden) - Number(!!b.s.hidden))[0];
      setSheet(first ? first.s.name : (lf.sheets[0] ? lf.sheets[0].name : ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать файл');
    } finally {
      setBusy(false);
      ev.target.value = '';
    }
  }

  const rows = res ? res.rows.filter((r) => filter === 'all' || r.kind === filter) : [];
  const bad = res ? res.checks.filter((c) => !c.ok) : [];
  // Сверка КВР (P2-0012): расхождение — жёлтым у строк Номенклатуры и у их КВР; подтверждать ВОР можно.
  const kvrBad = res ? res.kvrChecks.filter((c) => !c.ok) : [];
  const warnOf = new Map<number, string>();
  for (const c of kvrBad) {
    const text = `не сходится с КВР (стр. ${c.kvrRowNo}): ${c.name} — по работам ${fmt(c.actual)} ${c.unit}, в КВР ${fmt(c.expected)} ${c.unit}`;
    for (const n of [c.kvrRowNo, ...c.rowNos]) warnOf.set(n, warnOf.has(n) ? warnOf.get(n) + '; ' + text : text);
  }

  if (api && projects === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  if (api && projects && !projects.length) return h('div', { className: 'pf-card pj-empty pf-muted', 'data-testid': 'vor-no-projects' }, 'Нет доступных проектов. Проект создаётся в «Компания → Проекты».');

  if (api && opened) {
    const company = (projects || []).find((p) => p.id === projectId)?.company_id || '';
    return h(VorDraft, { key: opened.id, api, projects: props.projects || null, projectId, companyId: company, imp: opened, canManage, canProjects,
      canUnits: perms.includes('planfact.units.manage'),
      onAccepted: (r) => {
        setOpenId(''); void reloadImports(projectId);
        setNotice(`Редакция №${r.revision_no} принята: добавлено ${r.added}, снято ${r.withdrawn}, изменился объём ${r.qty_changed}, без изменений ${r.unchanged}` +
          (r.fact_moved_entries ? `; перенесено записей факта: ${r.fact_moved_entries}` : '') + (r.fact_kept ? `; факт оставлен на снятых: ${r.fact_kept}` : '') +
          '. Факт остался на своих позициях; сводка, шахматка и ввод факта — уже по новым объёмам.');
      },
      onBack: () => { setOpenId(''); void reloadImports(projectId); }, onChanged: () => { void api.listImports(projectId).then(setImports); } });
  }

  // P2-0041: выбор объекта — в шапке раздела (ProjectPicker сам переносится туда); здесь остаётся только пометка «просмотр».
  const picker = api && projects
    ? h(Fragment, null,
        h(ProjectPicker, { list: projects, value: projectId, onChange: setProjectId, testId: 'vor-project', alwaysSelect: true }),
        sub === 'load' && !canManage && perms.length ? h('div', { className: 'pf-muted', 'data-testid': 'vor-readonly' }, 'Только просмотр: загрузка ВОР доступна ПТО, РП и администратору.') : null)
    : null;
  if (api && sub === 'positions') {
    const company = (projects || []).find((p) => p.id === projectId)?.company_id || '';
    return h('div', { className: 'pj-tab vor-tab', 'data-testid': 'vor-tab' }, picker,
      !projectId ? null
        : registry
          ? h(PositionsRegistry, { key: projectId, fact: props.fact!, summary: props.summary!, projectId, companyId: company, user: props.user || '', onCount: setPosCount,
              ...positionRegistryActions(props.fact!, perms, projectId, company, isArchived((projects || []).find((p) => p.id === projectId)), props.save, props.user || '') })
          : h(VorPositions, { key: projectId, api, projectId }));
  }

  if (api && partial) {
    return h('div', { className: 'pj-tab vor-tab', 'data-testid': 'vor-tab' }, picker,
      h('div', { className: 'pf-card pj-empty pf-muted', 'data-testid': 'vor-area-only' },
        'Загрузки ВОР ведут ПТО и РП по всему проекту. Позиции вашей области — на вкладке «Позиции».'));
  }
  return h('div', { className: 'pj-tab vor-tab', 'data-testid': 'vor-tab' },
    picker,
    // итог принятия редакции / сохранения — сразу под шапкой, не под формой
    notice ? h('div', { className: 'pj-notice', role: 'status', 'data-testid': 'vor-notice' }, notice) : null,
    api ? h('h3', { className: 'vor-sec' }, 'Загрузки проекта') : null,
    api ? h(ImportsList, { items: imports, canManage, busy: !!saving, onDelete: (i) => { void removeImport(i); }, onOpen: (i) => setOpenId(i.id) }) : null,
    api && imports && imports.some((i) => i.status === 'confirmed')
      ? registry
        ? h('div', { className: 'pf-muted', 'data-testid': 'vor-positions-hint' }, 'Позиции ВОР — на вкладке «Позиции»: фильтры, просроченные, история факта.')
        : h(VorPositions, { key: projectId, api, projectId })
      : null,
    api && !canManage ? null : h('div', { className: 'pf-card pj-form' },
      // P2-0041: «Загрузить Excel» — главное действие экрана, в шапке раздела; здесь — лист файла или подсказка
      // P2-0006b: есть действующая редакция — главное действие «Загрузить новую редакцию», отдельная ВОР — второстепенное
      h(InHead, { slot: 'actions' }, currents.length
        ? h('span', { className: 'vor-head-actions' },
            h('label', { className: 'pf-btn pf-btn--ghost vor-file', title: 'Ещё корпус или отдельный договор — позиции добавятся к действующим' },
              'Отдельная ВОР',
              h('input', { type: 'file', accept: XLSX_ACCEPT, disabled: busy, onChange: (e: ChangeEvent<HTMLInputElement>) => { void pick(e, ''); }, 'data-testid': 'vor-file-separate' })),
            h('label', { className: 'pf-btn vor-file' + (busy ? ' vor-file--busy' : '') },
              busy ? 'Читаю файл…' : 'Загрузить новую редакцию',
              h('input', { type: 'file', accept: XLSX_ACCEPT, disabled: busy, onChange: (e: ChangeEvent<HTMLInputElement>) => { void pick(e, currents[0].id); }, 'data-testid': 'vor-file-revision' })))
        : h('label', { className: 'pf-btn vor-file' + (busy ? ' vor-file--busy' : '') },
            busy ? 'Читаю файл…' : 'Загрузить ВОР',
            h('input', { type: 'file', accept: XLSX_ACCEPT, disabled: busy, onChange: (e: ChangeEvent<HTMLInputElement>) => { void pick(e, ''); }, 'data-testid': 'vor-file' }))),
      file && prev
        ? h('div', { className: 'pj-grow vor-rev-target', 'data-testid': 'vor-rev-target' },
            h(StatusBadge, { status: 'yellow', label: `Новая редакция №${(prev.revision_no || 1) + 1}` }),
            currents.length > 1
              ? h('label', { className: 'pf-field' }, 'Заменяет действующую',
                  h('select', { className: 'pj-input', value: prev.id, 'data-testid': 'vor-rev-of', onChange: (e: ChangeEvent<HTMLSelectElement>) => setPrevId(e.currentTarget.value) },
                    currents.map((c) => h('option', { key: c.id, value: c.id }, `${c.file_name} · №${c.revision_no || 1}`))))
              : h('span', { className: 'pf-muted' }, `заменит действующую №${prev.revision_no || 1} «${prev.file_name}» — после сравнения и принятия`))
        : null,
      file
        ? h('label', { className: 'pf-field pj-grow' }, `Лист файла «${file.name}»`,
            h('select', { className: 'pj-input', value: sheet, 'data-testid': 'vor-sheet', onChange: (e: ChangeEvent<HTMLSelectElement>) => { setSheet(e.currentTarget.value); setFilter('all'); } },
              file.sheets.map((s) => h('option', { key: s.name, value: s.name },
                s.name + (s.hidden ? ' (скрытый)' : '') + (results[s.name] && !results[s.name].r.isVor ? ' — не похоже на ВОР' : '')))))
        // P2-0046: вместо абзаца — четыре шага «как загрузить» (утверждённый макет)
        : h('div', { className: 'pj-grow vor-steps' },
            h('b', { className: 'vor-steps-title' }, !api ? 'Демо-режим: только просмотр разбора, без сохранения'
              : currents.length ? 'Пришла исправленная ВОР от заказчика' : 'Как загрузить ВОР'),
            currents.length
              ? h('ol', { className: 'vor-steps-list', 'data-testid': 'vor-steps' },
                  h('li', null, 'Нажмите «Загрузить новую редакцию» и выберите файл'),
                  h('li', null, 'Исправьте ошибки по номерам строк, проверьте места и виды работ'),
                  h('li', null, 'Посмотрите отличия: добавлено, удалено, изменился объём'),
                  h('li', null, 'Примите — факт останется на своих позициях, сводка пересчитается'))
              : h('ol', { className: 'vor-steps-list', 'data-testid': 'vor-steps' },
                  h('li', null, 'Загрузите файл заказчика в любой форме: ФКП, себестоимость, ведомость договорной цены'),
                  h('li', null, 'Проверьте разбор: работы, места, единицы'),
                  h('li', null, 'Сохраните черновик'),
                  h('li', null, 'Подтвердите — появятся позиции для факта'))),
      api && canManage && res && res.isVor
        ? h('button', { type: 'button', className: 'pf-btn', disabled: !!saving, 'data-testid': 'vor-save', onClick: () => { void saveDraft(); } }, saving || (prev ? 'Сохранить черновик редакции' : 'Сохранить черновик'))
        : null),
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    res && !res.isVor ? h('div', { className: 'pf-error', role: 'alert', 'data-testid': 'vor-notvor' }, `Лист «${res.sheet}» не похож на ВОР: ${res.reason}`) : null,
    res && res.isVor
      ? h('div', { className: 'vor-summary', 'data-testid': 'vor-summary' },
          h('span', { className: 'vor-stat' }, h('b', null, res.stats.works), ' работ'),
          h('span', { className: 'vor-stat' }, h('b', null, res.stats.materials), ' материалов'),
          h('span', { className: 'vor-stat' }, h('b', null, res.stats.groups), ' групп'),
          h('span', { className: 'vor-stat' }, h('b', null, res.stats.context), ' заголовков мест'),
          h('span', { className: 'vor-stat' + (res.stats.worksWithUnit < res.stats.works ? ' vor-stat--warn' : '') },
            'с ЕИ ', h('b', null, `${res.stats.worksWithUnit} из ${res.stats.works}`)),
          h('span', { className: 'vor-stat pf-muted' }, `шапка: строки ${res.headerRows.join(', ')}`),
          res.checks.length
            ? h('span', { className: 'vor-stat ' + (bad.length ? 'vor-stat--bad' : 'vor-stat--ok'), 'data-testid': 'vor-checks' },
                bad.length ? `итоги не сходятся: ${bad.length} из ${res.checks.length}` : `итоги сходятся (${res.checks.length})`)
            : h('span', { className: 'vor-stat pf-muted' }, 'итогов с числами в файле нет'),
          res.kvrChecks.length
            ? h('span', { className: 'vor-stat' + (kvrBad.length ? ' vor-stat--warn' : ' vor-stat--ok'), 'data-testid': 'vor-kvr-checks' },
                'сверка с КВР: ', h('b', null, `${res.kvrChecks.length - kvrBad.length} сходятся`), kvrBad.length ? h('b', null, `, расхождений ${kvrBad.length}`) : null)
            : null)
      : null,
    // P2-0006b (PTO-01): ошибки с номером строки — нет ЕИ, объём 0 / пусто, итоги и КВР не сходятся; нажатие — к строке
    res && res.isVor ? h(RowErrorsCard, { errors: rowErrors(res.rows, res.checks, res.kvrChecks), onPick: showRow }) : null,
    res && res.isVor && res.columns && (!api || canManage)
      ? h(VorColumns, { labels: res.labels, columns: res.columns, profileName: cur && cur.profile ? cur.profile.name : null, edited,
          name: profileName, onEdit: editCol, onReset: resetCols, onName: (v) => setProfileNames({ ...profileNames, [sheet]: v }) })
      : null,
    res && res.isVor
      ? h('div', { className: 'pf-seg vor-filter', role: 'tablist' }, FILTERS.map((f) => h('button', { key: f.id, type: 'button', role: 'tab',
          'aria-selected': filter === f.id, className: 'pf-seg-btn' + (filter === f.id ? ' pf-seg-btn--active' : ''), onClick: () => setFilter(f.id) }, f.label)))
      : null,
    res && res.isVor
      ? h('div', { className: 'pf-card vor-list', 'data-testid': 'vor-rows' },
          h('div', { className: 'vor-row vor-row--head' },
            h('span', { className: 'vor-c-no' }, 'Стр.'), h('span', { className: 'vor-c-kind' }, 'Тип'), h('span', { className: 'vor-c-name' }, 'Наименование · место'),
            h('span', { className: 'vor-c-unit' }, 'ЕИ'), h('span', { className: 'vor-c-qty pf-num' }, 'Объём')),
          rows.length ? rows.map((r) => h(RowView, { key: r.rowNo, r, warn: warnOf.get(r.rowNo) })) : h('div', { className: 'pj-empty pf-muted' }, 'Нет строк этого типа.'))
      : null);
}

export const VOR_CSS = POSITIONS_REGISTRY_CSS + POSITION_ACTIONS_CSS + `
.vor-head-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.vor-imp-sep{padding:10px 14px 4px;font-size:12px;font-weight:600}
.vor-imp--old .vor-imp-ic{background:var(--p2-status-grey-bg);color:var(--p2-status-grey-fg)}
.vor-rev-target{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0}
.vor-sec{margin:4px 0 0;font-size:13px;font-weight:600;color:var(--text-muted)}
.vor-imp{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:10px 12px;text-align:left}
.vor-imp .pj-actions{margin-left:auto}
.pj-list .pj-row.vor-imp{flex-direction:row;align-items:center}
@media (max-width:767.98px){.vor-imp-ic{width:34px;height:42px;font-size:10px}.vor-imp .pj-actions{flex:1 1 100%}}
.vor-imp-ic{flex:0 0 auto;width:40px;height:48px;border-radius:8px;display:grid;place-items:center;font-size:11px;font-weight:700;background:var(--p2-status-green-bg);color:var(--p2-status-green-fg)}
.vor-imp-name{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;flex:1 1 220px;text-align:left}
.vor-imp-top{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.vor-imp-top b{font-size:15px}
.vor-steps{display:flex;flex-direction:column;gap:8px;min-width:0}
.vor-steps-title{font-size:14px}
.vor-steps-list{margin:0;padding:0;list-style:none;counter-reset:vst;display:flex;flex-direction:column;gap:8px;font-size:13.5px;color:var(--text-main)}
.vor-steps-list li{counter-increment:vst;display:flex;align-items:flex-start;gap:10px}
.vor-steps-list li::before{content:counter(vst);flex:0 0 auto;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;border:1px solid var(--card-border);color:var(--text-main)}
@media (min-width:1024px){.vor-steps-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px 24px}}
.vor-file{position:relative;overflow:hidden;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-height:40px}
.vor-file input{position:absolute;inset:0;opacity:0;cursor:pointer}
.vor-file--busy{opacity:.7;cursor:progress}
.vor-summary{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px}
.vor-stat b{font-variant-numeric:tabular-nums}
.vor-stat--ok{color:var(--color-green)}
.vor-stat--bad{color:var(--color-red);font-weight:700}
.vor-stat--warn b{color:var(--color-yellow)}
.vor-bad{padding:10px 14px;font-size:12px;color:var(--color-red);display:flex;flex-direction:column;gap:4px}
.vor-list{display:flex;flex-direction:column;font-size:13px}
.vor-row{display:grid;grid-template-columns:52px 92px minmax(0,1fr) 72px 120px;gap:10px;align-items:start;padding:8px 14px;border-bottom:1px solid var(--card-border)}
.vor-row:last-child{border-bottom:0}
.vor-row--head{font-size:12px;font-weight:600;color:var(--text-muted)}
.vor-row--group .vor-c-name{font-weight:700}
.vor-row--context{background:var(--hover-bg)}
.vor-row--context .vor-c-name{font-weight:600}
.vor-row--material{color:var(--text-muted)}
.vor-row--material .vor-c-name{padding-left:14px}
.vor-row--skip{opacity:.55}
.vor-c-no{color:var(--text-muted);font-variant-numeric:tabular-nums}
.vor-c-name{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.vor-num{font-size:11px;color:var(--text-muted)}
.vor-place{font-size:11px;color:var(--primary)}
.vor-note{font-size:11px;color:var(--text-muted)}
.vor-row--warn{box-shadow:inset 3px 0 0 var(--color-yellow)}
.vor-warn{font-size:11px;font-weight:700;color:var(--color-yellow)}
.vor-norm{display:block;font-size:11px;color:var(--text-muted)}
.vor-kind{display:inline-block;font-size:12px;font-weight:600;padding:1px 6px;border-radius:6px;border:1px solid var(--card-border);color:var(--text-muted)}
.vor-kind--work{border-color:var(--primary);color:var(--primary)}
.vor-kind--context{border-color:var(--color-green);color:var(--color-green)}
.vor-kind--group{color:var(--text-main)}
.vor-badge--ok{border-color:var(--color-green);color:var(--color-green)}
@media (max-width:600px){
  .vor-row{grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"kind kind no" "name name name" "unit qty qty";gap:4px 8px;padding:10px 12px}
  .vor-row--head{display:none}
  .vor-c-no{grid-area:no;text-align:right}.vor-c-kind{grid-area:kind}.vor-c-name{grid-area:name}.vor-c-unit{grid-area:unit}.vor-c-qty{grid-area:qty}
  .vor-row--material .vor-c-name{padding-left:0}
  .vor-file{width:100%}
}
`;
