/**
 * «Компания → Проекты» (P2-0047, утверждённые макеты reports/P2-0047/compare/): справочник проектов с поиском, стадиями-кнопками
 * и группами по подразделениям; строка открывает карточку проекта (стадия, код, подразделение, адрес, сроки, руководитель,
 * заказчик, генподрядчик, наша роль, пояс, страна) со вкладками «Карточка · Объекты и места». Одна главная кнопка на экране,
 * редкое — в «⋯» (архив, подразделения). Права ядра — без включённых модулей (pf_project_catalog / pf_save_project, MODULES 1а).
 * id новой записи создаёт приложение (newId): повтор после обрыва связи не создаёт дубль. Права и проверки — на сервере.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { LocationsTree } from './LocationsTree.ts';
import { newId } from '../core/projects.service.ts';
import type { CompanyAccess, Division, DictItem, ProjectCard, ProjectCardInput, ProjectDicts, ProjectsApi } from '../core/projects.service.ts';
import type { CoreApi } from '../core/core.service.ts';
import type { Counterparty, CounterpartyKind } from '../core/counterparties.ts';
import { EMPTY_STATE, MoreMenu, PageTabs, RecordFields, RegistryTable, Sheet, StageBadge, StageStrip } from '../ui/index.ts';
import type { MoreItem, RegistryColumn, RegistryFilter, RegistryState, Status } from '../ui/index.ts';

export interface Person { user_id: string; name: string }

/** Цвет стадии — только вид метки; сами стадии и подписи — справочник сервера. */
const STAGE_TONE: Record<string, Status> = { design: 'grey', tender: 'grey', construction: 'blue', commissioning: 'yellow', warranty: 'green', operation: 'grey' };
export const stageTone = (code: string): Status => STAGE_TONE[code] || 'grey';
const NO_DIV = 'Без подразделения';
/** Часовые пояса стройки (IANA) — частые для РФ; пояс сервер проверяет по своему списку. */
export const TIMEZONES = ['Europe/Kaliningrad', 'Europe/Moscow', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk', 'Asia/Krasnoyarsk',
  'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka'];
const ruDate = (d: string | null): string => (d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : '');
const period = (p: ProjectCard): string => (p.planned_start || p.planned_finish ? `${ruDate(p.planned_start) || '…'} — ${ruDate(p.planned_finish) || '…'}` : '');
const nameOf = (list: DictItem[], code: string | null): string => (code ? (list.find((x) => x.code === code) || { name: code }).name : '');
const TZ_RU: Record<string, string> = { 'Europe/Kaliningrad': 'Калининград', 'Europe/Moscow': 'Москва', 'Europe/Samara': 'Самара', 'Asia/Yekaterinburg': 'Екатеринбург',
  'Asia/Omsk': 'Омск', 'Asia/Novosibirsk': 'Новосибирск', 'Asia/Krasnoyarsk': 'Красноярск', 'Asia/Irkutsk': 'Иркутск', 'Asia/Yakutsk': 'Якутск',
  'Asia/Vladivostok': 'Владивосток', 'Asia/Magadan': 'Магадан', 'Asia/Kamchatka': 'Камчатка' };
const tzLabel = (z: string): string => TZ_RU[z] || z.replace(/^[A-Za-z]+\//, '');
const countryLabel = (c: string): string => (c === 'RU' ? 'Россия' : c);

type View = { kind: 'list' } | { kind: 'card'; id: string; tab: 'card' | 'tree' };
type Dialog = null | 'create' | 'edit' | 'divisions';

export function ProjectsTab(props: { api: ProjectsApi; company: CompanyAccess; core?: CoreApi | null; people?: () => Promise<Person[]> }): ReactElement {
  const { api, company, core } = props;
  const [rows, setRows] = useState<ProjectCard[] | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [dicts, setDicts] = useState<ProjectDicts>({ stages: [], objectKinds: [], roles: [] });
  const [people, setPeople] = useState<Person[] | null>(null);
  const [parties, setParties] = useState<Counterparty[] | null>(null);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [state, setState] = useState<RegistryState>(EMPTY_STATE);
  const [query, setQuery] = useState('');
  const [archive, setArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const can = company.can_manage_projects;

  async function load(): Promise<void> {
    const [list, divs] = await Promise.all([api.projectCatalog ? api.projectCatalog(company.company_id) : Promise.resolve([] as ProjectCard[]),
      api.listDivisions ? api.listDivisions(company.company_id) : Promise.resolve([] as Division[])]);
    setRows(list); setDivisions(divs);
  }
  useEffect(() => { void load(); if (api.dicts) void api.dicts().then(setDicts); }, []);

  function needLists(): void {
    if (core && parties === null) void core.listCounterparties(company.company_id, true).then(setParties);
    if (props.people && people === null) void props.people().then(setPeople).catch(() => setPeople([]));
  }

  async function save(id: string, card: ProjectCardInput, done: string): Promise<boolean> {
    if (!api.saveProject) return false;
    setBusy(true); setError(''); setNotice('');
    const r = await api.saveProject(company.company_id, id, card);
    setBusy(false);
    if (!r.ok) { setError(r.message || 'Не удалось сохранить'); return false; }
    setNotice(done); await load(); return true;
  }

  // ---------- форма карточки (создание и правка) ----------
  function field(name: string, label: string, input: ReactElement, wide?: boolean): ReactElement {
    return h('label', { className: 'pf-field' + (wide ? ' pj-wide' : ''), key: name }, label, input);
  }
  function select(name: string, label: string, value: string | null, opts: { value: string; label: string }[], empty: string): ReactElement {
    return field(name, label, h('select', { name, className: 'pj-input', defaultValue: value || '', 'data-testid': 'pj-' + name },
      h('option', { value: '' }, empty), opts.map((o) => h('option', { key: o.value, value: o.value }, o.label))));
  }
  function partyOpts(kind: CounterpartyKind, current: string | null): { value: string; label: string }[] {
    return (parties || []).filter((c) => (c.kinds.includes(kind) && !c.archived_at) || c.id === current).map((c) => ({ value: c.id, label: c.name + (c.archived_at ? ' (архив)' : '') }));
  }
  function readCard(form: HTMLFormElement, full: boolean): ProjectCardInput {
    const v = (n: string): string => { const el = form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null; return el ? el.value.trim() : ''; };
    const opt = (n: string): string | null => v(n) || null;
    const card: ProjectCardInput = { name: v('name'), code: opt('code'), division_id: opt('division'), stage: v('stage') || 'construction' };
    if (!full) return card;
    return { ...card, our_role: opt('our_role'), address: opt('address'), planned_start: opt('start'), planned_finish: opt('finish'), manager_user_id: opt('manager'),
      customer_id: opt('customer'), general_contractor_id: opt('general_contractor'), timezone: v('timezone') || 'Europe/Moscow', country: (v('country') || 'RU').toUpperCase() };
  }
  function cardForm(p: ProjectCard | null): ReactElement[] {
    const divOpts = divisions.filter((d) => !d.archived_at || d.id === p?.division_id).map((d) => ({ value: d.id, label: d.name }));
    const base = [
      field('name', 'Название', h('input', { name: 'name', className: 'pj-input', maxLength: 200, defaultValue: p?.name || '', 'data-testid': 'pj-name' }), true),
      field('code', 'Код', h('input', { name: 'code', className: 'pj-input', maxLength: 40, defaultValue: p?.code || '', 'data-testid': 'pj-code' })),
      select('stage', 'Стадия', p?.stage || 'construction', dicts.stages.map((s) => ({ value: s.code, label: s.name })), dicts.stages.length ? '— выберите —' : 'Строительство'),
      divOpts.length ? select('division', 'Подразделение', p?.division_id || null, divOpts, 'Без подразделения') : null
    ].filter(Boolean) as ReactElement[];
    if (!p) return base;
    const tz = Array.from(new Set([...TIMEZONES, p.timezone]));
    const ppl = (people || []).concat(p.manager_user_id && !(people || []).some((x) => x.user_id === p.manager_user_id) ? [{ user_id: p.manager_user_id, name: p.manager_name || 'Сотрудник' }] : []);
    return base.concat([
      select('our_role', 'Наша роль в проекте', p.our_role, dicts.roles.map((s) => ({ value: s.code, label: s.name })), 'Не указана'),
      field('address', 'Адрес', h('input', { name: 'address', className: 'pj-input', maxLength: 500, defaultValue: p.address || '' }), true),
      field('start', 'Начало (план)', h('input', { name: 'start', type: 'date', className: 'pj-input', defaultValue: p.planned_start || '' })),
      field('finish', 'Окончание (план)', h('input', { name: 'finish', type: 'date', className: 'pj-input', defaultValue: p.planned_finish || '' })),
      select('manager', 'Руководитель проекта', p.manager_user_id, ppl.map((x) => ({ value: x.user_id, label: x.name })), people === null && props.people ? 'Загрузка…' : 'Не назначен'),
      select('customer', 'Заказчик', p.customer_id ?? null, partyOpts('customer', p.customer_id ?? null), parties === null && core ? 'Загрузка…' : '— не указан —'),
      select('general_contractor', 'Генподрядчик', p.general_contractor_id ?? null, partyOpts('general_contractor', p.general_contractor_id ?? null), parties === null && core ? 'Загрузка…' : '— не указан —'),
      select('timezone', 'Часовой пояс стройки', p.timezone, tz.map((z) => ({ value: z, label: tzLabel(z) })), 'Москва'),
      field('country', 'Страна (код)', h('input', { name: 'country', className: 'pj-input', maxLength: 2, defaultValue: p.country || 'RU', 'data-testid': 'pj-country' }))
    ]);
  }

  async function onCreate(ev: FormEvent): Promise<void> {
    ev.preventDefault(); if (busy) return;
    const card = readCard(ev.currentTarget as HTMLFormElement, false);
    if (!card.name) { setError('Введите название проекта'); return; }
    const id = newId();
    if (await save(id, card, 'Проект создан')) { setDialog(null); setView({ kind: 'card', id, tab: 'card' }); }
  }
  async function onEdit(ev: FormEvent, p: ProjectCard): Promise<void> {
    ev.preventDefault(); if (busy) return;
    const card = readCard(ev.currentTarget as HTMLFormElement, true);
    if (!card.name) { setError('Введите название проекта'); return; }
    if (await save(p.id, card, 'Проект сохранён')) setDialog(null);
  }
  async function onDivision(ev: FormEvent): Promise<void> {
    ev.preventDefault(); if (busy || !api.saveDivision) return;
    const form = ev.currentTarget as HTMLFormElement;
    const name = (form.elements.namedItem('div-name') as HTMLInputElement).value.trim();
    if (!name) { setError('Введите название подразделения'); return; }
    setBusy(true); setError('');
    const r = await api.saveDivision(company.company_id, newId(), name, null, null);
    setBusy(false);
    if (!r.ok) { setError(r.message || 'Не удалось сохранить'); return; }
    form.reset(); await load();
  }
  async function archiveDivision(d: Division): Promise<void> {
    if (!api.saveDivision) return;
    setBusy(true); setError('');
    const r = await api.saveDivision(company.company_id, d.id, d.name, d.head_user_id, !d.archived_at);
    setBusy(false);
    if (!r.ok) setError(r.message || 'Не удалось сохранить'); else await load();
  }

  const errorBox = error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null;
  const noticeBox = notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null;

  const divisionsSheet = dialog === 'divisions'
    ? h(Sheet, { title: 'Подразделения', sub: 'Дирекции и филиалы — группы проектов (необязательно)', testId: 'pj-divs', onClose: () => setDialog(null) },
        errorBox,
        h('div', { className: 'pf-card pj-divlist' }, divisions.length ? divisions.map((d) => h('div', { key: d.id, className: 'pj-divrow' + (d.archived_at ? ' is-arch' : ''), 'data-division-id': d.id },
          h('div', { className: 'pj-divname' }, h('b', null, d.name), h('span', null, `проектов ${d.project_count}` + (d.head_name ? ' · ' + d.head_name : '') + (d.archived_at ? ' · в архиве' : ''))),
          can ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', disabled: busy, 'data-testid': 'pj-div-archive', onClick: () => { void archiveDivision(d); } }, d.archived_at ? 'Вернуть' : 'В архив') : null))
          : h('div', { className: 'pf-muted pj-empty' }, 'Подразделений нет — проекты показываются одним списком.')),
        can ? h('form', { className: 'pj-divform', onSubmit: (e: FormEvent) => { void onDivision(e); }, 'data-testid': 'pj-div-create' },
          h('label', { className: 'pf-field pj-wide' }, 'Новое подразделение', h('input', { name: 'div-name', className: 'pj-input', maxLength: 200 })),
          h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, '+ Подразделение')) : null)
    : null;

  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');

  // ---------- карточка проекта ----------
  if (view.kind === 'card') {
    const p = rows.find((x) => x.id === view.id);
    if (!p) return h('div', { className: 'pj-tab' }, h('button', { type: 'button', className: 'pj-back', onClick: () => setView({ kind: 'list' }) }, '‹ Проекты'),
      h('div', { className: 'pf-muted' }, 'Проект не найден или нет доступа.'));
    const more: MoreItem[] = p.can_manage ? [{ id: 'archive', label: p.archived_at ? 'Вернуть из архива' : 'В архив', hint: p.archived_at ? undefined : 'проект пропадёт из выбора в модулях',
      onClick: () => { void save(p.id, { archived: !p.archived_at }, p.archived_at ? 'Проект возвращён из архива' : 'Проект перенесён в архив'); } }] : [];
    const stageName = nameOf(dicts.stages, p.stage) || p.stage;
    const head = h('div', { className: 'pj-cardhead' },
      h('button', { type: 'button', className: 'pj-back', 'data-testid': 'pj-back', onClick: () => { setView({ kind: 'list' }); setNotice(''); setError(''); } }, '‹ Проекты'),
      h('div', { className: 'pj-titlerow' },
        h('div', { className: 'pj-titlebox' }, h('h2', { className: 'pj-title' }, p.name), h('span', { className: 'pf-muted' }, [p.code, p.division_name, p.archived_at ? 'в архиве' : ''].filter(Boolean).join(' · '))),
        h('div', { className: 'pj-head-actions' }, h(StageBadge, { label: stageName, tone: stageTone(p.stage), testId: 'pj-stage' }), h(MoreMenu, { testId: 'pj-card-more', items: more }),
          p.can_manage && !p.archived_at && view.tab === 'card' ? h('button', { type: 'button', className: 'pf-btn pj-main', 'data-testid': 'pj-edit', onClick: () => { setError(''); needLists(); setDialog('edit'); } }, 'Изменить') : null)),
      h(PageTabs, { testId: 'pj-card-tabs', active: view.tab, onPick: (id) => setView({ kind: 'card', id: p.id, tab: id === 'tree' ? 'tree' : 'card' }),
        items: [{ id: 'card', label: ['Карточка'] }, { id: 'tree', label: ['Объекты и места'] }] }));
    const body = view.tab === 'tree'
      ? h(LocationsTree, { api, project: p, canManage: p.can_manage && !p.archived_at })
      : h('div', { className: 'pj-cardbody' },
          dicts.stages.length ? h(StageStrip, { testId: 'pj-stages', items: dicts.stages, current: p.stage }) : null,
          h(RecordFields, { testId: 'pj-fields', fields: [
            { id: 'code', label: 'Код', value: p.code }, { id: 'division', label: 'Подразделение', value: p.division_name },
            { id: 'address', label: 'Адрес', value: p.address }, { id: 'period', label: 'Сроки (план)', value: period(p) },
            { id: 'manager', label: 'Руководитель проекта', value: p.manager_name }, { id: 'role', label: 'Наша роль', value: nameOf(dicts.roles, p.our_role) || 'не указана' },
            { id: 'customer', label: 'Заказчик', value: p.customer_name }, { id: 'gc', label: 'Генподрядчик', value: p.general_contractor_name },
            { id: 'tz', label: 'Часовой пояс · страна', value: `${tzLabel(p.timezone)} · ${countryLabel(p.country)}` },
            { id: 'objects', label: 'Объектов · мест', value: `${p.object_count} · ${p.place_count}` }] }),
          p.places_led_by_quality ? h('div', { className: 'pj-led', 'data-testid': 'pj-led' }, 'Места этого проекта ведутся в Качестве — в «Объектах и местах» только просмотр.') : null);
    return h('div', { className: 'pj-tab', 'data-testid': 'pj-card', 'data-project-id': p.id }, head, errorBox, noticeBox, body,
      dialog === 'edit' ? h(Sheet, { title: 'Изменить проект', sub: p.name, testId: 'pj-edit-sheet', onClose: () => setDialog(null) },
        errorBox,
        h('form', { className: 'pj-form', onSubmit: (e: FormEvent) => { void onEdit(e, p); }, 'data-testid': 'pj-edit-form', key: (parties === null ? 'a' : 'b') + (people === null ? 'a' : 'b') },
          ...cardForm(p),
          h('div', { className: 'pj-formfoot' }, h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setDialog(null) }, 'Отмена'),
            h('button', { type: 'submit', className: 'pf-btn', disabled: busy, 'data-testid': 'pj-save' }, 'Сохранить')))) : null);
  }

  // ---------- список ----------
  const visible = rows.filter((p) => (archive ? !!p.archived_at : !p.archived_at));
  const q = query.trim().toLowerCase();
  const found = q ? visible.filter((p) => (p.name + ' ' + (p.code || '')).toLowerCase().includes(q)) : visible;
  const archivedCount = rows.filter((p) => p.archived_at).length;
  const hasDivs = rows.some((p) => p.division_id);
  const stageLabel = (c: string): string => nameOf(dicts.stages, c) || c;
  const columns: RegistryColumn<ProjectCard>[] = [
    { id: 'name', label: 'Проект', fixed: true, value: (p) => p.name, render: (p) => h('b', null, p.name) },
    { id: 'code', label: 'Код', value: (p) => p.code, render: (p) => (p.code ? h('span', { className: 'pj-nowrap' }, p.code) : '—') },
    { id: 'stage', label: 'Стадия', value: (p) => stageLabel(p.stage), render: (p) => h(StageBadge, { label: stageLabel(p.stage), tone: stageTone(p.stage) }) },
    { id: 'manager', label: 'Руководитель', value: (p) => p.manager_name },
    { id: 'period', label: 'Сроки', value: (p) => p.planned_finish, render: (p) => period(p) || '—' },
    { id: 'objects', label: 'Объектов', align: 'right', value: (p) => p.object_count }];
  const stageOpts = dicts.stages.filter((s) => visible.some((p) => p.stage === s.code)).map((s) => ({ value: s.code, label: s.name }));
  const filters: RegistryFilter<ProjectCard>[] = [{ id: 'stage', label: 'Стадия', get: (p) => p.stage, optionLabel: stageLabel, options: stageOpts }];
  const more: MoreItem[] = [
    archivedCount || archive ? { id: 'archive', label: archive ? 'Действующие проекты' : `Показать архив · ${archivedCount}`, onClick: () => setArchive(!archive) } : null,
    can || divisions.length ? { id: 'divisions', label: 'Подразделения', hint: divisions.length ? `${divisions.filter((d) => !d.archived_at).length} действующих` : 'не заведены',
      onClick: () => { setError(''); setDialog('divisions'); } } : null
  ].filter(Boolean) as MoreItem[];

  return h('div', { className: 'pj-tab', 'data-testid': 'pj-projects' },
    h('div', { className: 'pj-titlerow' },
      h('div', { className: 'pj-titlebox' }, h('h2', { className: 'pj-title' }, archive ? 'Проекты в архиве' : 'Проекты'),
        h('span', { className: 'pf-muted' }, `${visible.length} ${archive ? 'в архиве' : 'проектов'}` + (hasDivs ? ` · подразделений ${divisions.filter((d) => !d.archived_at).length}` : ''))),
      h('div', { className: 'pj-head-actions' }, h(MoreMenu, { testId: 'pj-more', items: more }),
        can && !archive ? h('button', { type: 'button', className: 'pf-btn pj-main', 'data-testid': 'pj-add', onClick: () => { setError(''); setDialog('create'); } }, '+ Проект') : null)),
    errorBox, noticeBox,
    h('input', { type: 'search', className: 'pj-input pj-search', placeholder: 'Найти проект по названию или коду', value: query, 'aria-label': 'Найти проект',
      'data-testid': 'pj-search', onInput: (e: Event) => setQuery((e.target as HTMLInputElement).value), onChange: (e: Event) => setQuery((e.target as HTMLInputElement).value) }),
    h(RegistryTable<ProjectCard>, {
      testId: 'pj-registry', rows: found, rowKey: (p) => p.id, columns, filters, state, onState: setState,
      groupBy: hasDivs ? { label: 'Подразделение', key: (p) => p.division_name || NO_DIV } : undefined,
      selected: new Set<string>(), onSelect: () => undefined, noSelect: true, onOpen: (p) => { setNotice(''); setError(''); setView({ kind: 'card', id: p.id, tab: 'card' }); },
      quick: stageOpts.length > 1 ? { filter: 'stage', all: 'Все' } : undefined,
      compact: (p) => h('span', { className: 'pj-compact' }, h('span', { className: 'pj-compact__t' }, h('b', null, p.name), h('small', null, [p.code, `объектов ${p.object_count}`].filter(Boolean).join(' · '))),
        h(StageBadge, { label: stageLabel(p.stage), tone: stageTone(p.stage) })),
      empty: q ? 'Ничего не найдено' : archive ? 'В архиве проектов нет' : can ? 'Проектов пока нет — нажмите «+ Проект».' : 'Нет доступных проектов.'
    }),
    dialog === 'create' ? h(Sheet, { title: 'Новый проект', sub: 'Остальное — в карточке после создания', testId: 'pj-create-sheet', onClose: () => setDialog(null) },
      errorBox,
      h('form', { className: 'pj-form', onSubmit: (e: FormEvent) => { void onCreate(e); }, 'data-testid': 'pj-create' }, ...cardForm(null),
        h('div', { className: 'pj-formfoot' }, h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setDialog(null) }, 'Отмена'),
          h('button', { type: 'submit', className: 'pf-btn', disabled: busy, 'data-testid': 'pj-create-submit' }, 'Создать проект')))) : null,
    divisionsSheet);
}

export const PROJECTS_CSS = `
.pj-tab{display:flex;flex-direction:column;gap:14px;min-width:0}
.pj-titlerow{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px 16px}
.pj-titlebox{display:flex;flex-direction:column;gap:2px;min-width:0}
.pj-title{margin:0;font-size:22px;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere}
.pj-head-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-left:auto}
.pj-search{width:100%;max-width:420px;min-height:44px;box-sizing:border-box}
.pj-nowrap{white-space:nowrap}
.pj-notice{font-size:13px;color:var(--color-green)}
.pj-back{font:inherit;align-self:flex-start;border:0;background:transparent;color:var(--p2-chart-fact,var(--primary));font-weight:600;font-size:14px;padding:4px 0;min-height:36px;cursor:pointer}
.pj-cardhead{display:flex;flex-direction:column;gap:8px}
.pj-cardbody{display:flex;flex-direction:column;gap:12px}
.pj-led{font-size:13px;padding:10px 14px;border-radius:12px;background:color-mix(in srgb,var(--color-green,#1c7c3a) 10%,transparent);color:var(--text-main)}
.pj-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.pj-form .pf-field{min-width:0}
.pj-form .pj-wide,.pj-formfoot{grid-column:1/-1}
.pj-form .pj-input{width:100%;min-height:44px;font-size:16px;box-sizing:border-box}
.pj-formfoot{display:flex;justify-content:flex-end;gap:8px}
.pj-formfoot .pf-btn{min-height:44px}
.pj-compact{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;width:100%}
.pj-compact__t{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.pj-compact__t small{font-size:12.5px;color:var(--text-muted)}
.pj-divlist{display:flex;flex-direction:column}
.pj-divrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--card-border)}
.pj-divrow:last-child{border-bottom:0}
.pj-divrow.is-arch{color:var(--text-muted)}
.pj-divname{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.pj-divname span{font-size:12.5px;color:var(--text-muted)}
.pj-divform{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.pj-divform .pj-wide{flex:1 1 220px}
.pj-empty{padding:14px}
@media (max-width:599.98px){.pj-form{grid-template-columns:1fr}.pj-search{max-width:none}}
@media (max-width:767.98px){
  .pj-head-actions>.pj-main{position:fixed;z-index:900;left:max(16px,env(safe-area-inset-left,0px));right:max(16px,env(safe-area-inset-right,0px));
    bottom:calc(65px + env(safe-area-inset-bottom,0px) + 12px);min-height:50px;font-size:16px;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.22)}
  .pj-tab:has(.pj-main){padding-bottom:84px}
}
`;
