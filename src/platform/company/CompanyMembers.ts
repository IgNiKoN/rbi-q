/**
 * «Компания → Сотрудники и доступ → Сотрудники» (P2-0048 этап 4, вариант В): поиск (ФИО, почта, проект), фильтры-счётчики
 * «Все · Без ролей · Не сменили пароль · Отключены», переключатель «Люди / По проектам»; список — одна строка на человека;
 * карточка сотрудника — ФИО, почта, метки, меню «⋯» (ФИО, сброс пароля, отключение — прежние диалоги), «Где работает» —
 * назначения, сгруппированные по «роль × проект», у группы «Изменить» (мастер на шаге 2; там же «Отозвать»), «+ Добавить участие».
 * Телефон: список → карточка («‹ Сотрудники»); от 680 px ширины контейнера — список и карточка рядом.
 * Назначение — мастер AssignWizard (pf_set_participation, 047), прежняя форма «Назначить роль» в нём.
 * «+ Сотрудник» — прежняя форма добавления (P2-0028: почта, ФИО, роль, проект → временный пароль один раз) в листе.
 * Всё — через pf_*; права и правила — на сервере (032, 032a, 033, 047).
 */
import { createElement as h, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { CompanyApi, ContractorRef, MemberRow, ProjectRef, QualityObjectRef, RoleRow } from './company.service.ts';
import type { ProjectsApi } from '../core/projects.service.ts';
import { ActionsMenu, ConfirmDialog } from '../ui/settings.ts';
import { PlaceTree, Sheet, StatusBadge } from '../ui/index.ts';
import { AssignWizard, kindLabel } from './AssignWizard.ts';
import type { LoadPlaces, PlaceItem, WizardInit } from './AssignWizard.ts';
import { counts, dateInput, groupsOf, groupWhere, hasFactOwner, initials, matches, NO_OBJECTS, people, personFlags, pickFromHash, takeIntent, whereLine, whoByNode } from './participation.ts';
import type { Filter, Group, Person } from './participation.ts';

export { endOfDayIso } from './participation.ts';

/** Временный пароль на экране: показывается один раз, после «Готово» не восстановить. */
interface TempPassword { who: string; email: string; password: string; note?: string }

/** Объекты назначения для строки: null — все объекты Качества. */
export function objectsText(list: QualityObjectRef[] | null | undefined): string {
  return list && list.length ? list.map((o) => o.name).join(', ') : '';
}

/** Дерево мест проекта для мастера и «По проектам» — то же, что в «Проекты и объекты» (pf_project_places; иначе pf_list_locations). */
export function placesLoader(projects: ProjectsApi | null | undefined): LoadPlaces | null {
  if (!projects) return null;
  return async (projectId, parent) => {
    const list = projects.projectPlaces ? await projects.projectPlaces(projectId, parent) : await projects.listLocations(projectId, parent);
    return list.map((n) => ({ id: n.id, parent_id: n.parent_id, name: n.name, node_type: n.node_type, path: n.path || n.name, hasKids: n.child_count > 0 }));
  };
}

const FILTERS: { id: Filter; label: string; tone: 'green' | 'red' | 'yellow' | 'grey' }[] = [
  { id: 'all', label: 'Все', tone: 'green' }, { id: 'norole', label: 'Без ролей', tone: 'red' },
  { id: 'mustchange', label: 'Не сменили пароль', tone: 'yellow' }, { id: 'disabled', label: 'Отключены', tone: 'grey' }
];

export function CompanyMembers(props: { api: CompanyApi; companyId: string; me: string; projects?: ProjectsApi | null }): ReactElement {
  const { api, companyId, me } = props;
  const loadPlaces = useRef<LoadPlaces | null>(placesLoader(props.projects)).current;
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  /** Открытый диалог подтверждения по человеку: сброс пароля / отключение. */
  const [confirm, setConfirm] = useState<{ kind: 'reset' | 'disable'; userId: string } | null>(null);
  const [contractors, setContractors] = useState<ContractorRef[]>([]);
  const [adding, setAdding] = useState(false);
  const [temp, setTemp] = useState<TempPassword | null>(null);
  const [copied, setCopied] = useState(false);
  const [editName, setEditName] = useState('');   // user_id, у которого правится ФИО
  const [container, setContainer] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'people' | 'projects'>('people');
  const [sel, setSel] = useState(() => pickFromHash(window.location.hash, 'user'));   // P2-0073: из «Кто что может» — человек открыт сразу
  const [wizard, setWizard] = useState<WizardInit | null>(null);
  const [wizKey, setWizKey] = useState(0);

  async function load(): Promise<void> {
    const [m, r, p, k, c] = await Promise.all([api.listMembers(companyId), api.listRoles(companyId), api.listProjects(), api.listContractors(companyId),
      // P2-0071: проект-контейнер Качества («Без объектов») — необязательный: ошибка сервера не ломает экран
      api.qualityContainer ? api.qualityContainer(companyId).catch(() => null) : Promise.resolve(null)]);
    // назначение на контейнер — «Без объектов» (только общие разделы), а не название служебного проекта
    setRows(c ? m.map((x) => (x.project_id === c ? { ...x, project_name: NO_OBJECTS } : x)) : m);
    setRoles(r); setProjects(p.filter((x) => x.company_id === companyId)); setContractors(k); setContainer(c);
  }
  useEffect(() => { setRows(null); void load(); }, [companyId]);

  // «+ Назначить» / «+ Сотрудник» с главной «Настроек» — открыть мастер / форму, когда данные загружены
  const loaded = rows !== null;
  useEffect(() => {
    if (!loaded) return undefined;
    const apply = (): void => {
      const it = takeIntent();
      if (it === 'assign') openWizard({ step: 1 });
      if (it === 'add') openAdd();
    };
    apply();
    window.addEventListener('company:route', apply);
    return () => window.removeEventListener('company:route', apply);
  }, [loaded]);

  function openWizard(init: WizardInit): void { setWizard(init); setWizKey((k) => k + 1); setError(''); setNotice(''); }
  function openAdd(): void { setAdding(true); setTemp(null); setNotice(''); setError(''); }

  async function add(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const form = ev.currentTarget as HTMLFormElement;
    const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement).value.trim();
    const email = val('email'), name = val('full_name'), role = val('role'), project = val('project');
    if (!email || !name || !role) { setError('Укажите почту, ФИО и роль'); return; }
    setBusy(true); setError(''); setNotice(''); setTemp(null); setCopied(false);
    const res = await api.addMember(companyId, email, name, role, project || null);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    form.reset(); setAdding(false);
    // P2-0035b: пароль пришёл, а учётка не новая — её раньше создала другая компания: сервер сменил пароль и закрыл входы
    if (res.value.temp_password) setTemp({ who: name, email: email.toLowerCase(), password: res.value.temp_password,
      note: res.value.created ? undefined : 'Эту учётку раньше создала другая компания — прежний пароль больше не действует, все входы закрыты.' });
    else setNotice('У этой почты уже есть учётка — сотрудник добавлен в компанию, пароль у него прежний');
    await load();
  }

  async function resetPassword(p: Person): Promise<void> {
    if (busy) return;
    setConfirm(null); setBusy(true); setError(''); setNotice(''); setTemp(null); setCopied(false);
    const res = await api.resetPassword(companyId, p.user_id);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setTemp({ who: p.name || p.email, email: p.email, password: res.value });
    await load();
  }

  async function disable(p: Person): Promise<void> {
    if (busy) return;
    setConfirm(null); setBusy(true); setError(''); setNotice('');
    const res = await api.disableMember(companyId, p.user_id);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setNotice(`Доступ отключён: ${p.name || p.email}. Записи сотрудника остаются в истории`);
    await load();
  }

  async function saveName(ev: FormEvent, p: Person): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const name = ((ev.currentTarget as HTMLFormElement).elements.namedItem('full_name') as HTMLInputElement).value.trim();
    if (!name) { setError('Укажите ФИО'); return; }
    setBusy(true); setError(''); setNotice('');
    const res = await api.setFullName(p.user_id, name);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setEditName('');
    setNotice(`ФИО сохранено: ${name}` + (res.value ? ` — обновлено записей: ${res.value}` : ''));
    await load();
  }

  async function copyTemp(): Promise<void> {
    if (!temp) return;
    try { await navigator.clipboard.writeText(temp.password); setCopied(true); }
    catch { setError('Не удалось скопировать — выделите пароль и скопируйте вручную'); }
  }

  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  const list = people(rows);
  const c = counts(list);
  const shown = list.filter((p) => matches(p, filter, q));
  const cur = sel ? list.find((p) => p.user_id === sel) || null : null;

  /** Меню «⋯» по человеку: ФИО, сброс пароля (только учётке компании), отключение доступа; себе — только ФИО. */
  function personMenu(p: Person): ReactElement | null {
    if (p.disabled) return null;
    const own = p.email === me;
    return h(ActionsMenu, { label: `Действия: ${p.name || p.email}`, testId: 'co-person-menu', items: [
      { key: 'n', label: 'Изменить ФИО', testId: 'co-name-edit', disabled: busy, onSelect: () => { setEditName(p.user_id); setConfirm(null); } },
      ...(!own && p.managed ? [{ key: 'r', label: 'Сбросить пароль', testId: 'co-reset', disabled: busy, onSelect: () => setConfirm({ kind: 'reset' as const, userId: p.user_id }) }] : []),
      ...(!own ? [{ key: 'd', label: 'Отключить доступ', testId: 'co-disable', danger: true, disabled: busy, onSelect: () => setConfirm({ kind: 'disable' as const, userId: p.user_id }) }] : [])] });
  }

  function nameForm(p: Person): ReactElement | null {
    if (p.disabled || editName !== p.user_id) return null;
    return h('form', { className: 'co-row co-name-form', 'data-testid': 'co-name-form', onSubmit: (e: FormEvent) => { void saveName(e, p); } },
      h('input', { name: 'full_name', className: 'co-input', defaultValue: p.name, maxLength: 120, 'aria-label': 'ФИО' }),
      h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Сохранить'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setEditName('') }, 'Отмена'));
  }

  function confirmDialog(): ReactElement | null {
    if (!confirm) return null;
    const p = list.find((x) => x.user_id === confirm.userId);
    if (!p) return null;
    const who = p.name || p.email;
    if (confirm.kind === 'reset') return h(ConfirmDialog, { title: 'Сбросить пароль?', yes: 'Да, сбросить', yesTestId: 'co-reset-yes', busy,
      text: `${who}: старый пароль перестанет работать, новый временный покажем один раз.`, onYes: () => { void resetPassword(p); }, onNo: () => setConfirm(null) });
    return h(ConfirmDialog, { title: 'Отключить доступ?', yes: 'Да, отключить', yesTestId: 'co-disable-yes', danger: true, busy,
      text: `${who} больше не сможет войти. Записи сотрудника останутся в истории.`, onYes: () => { void disable(p); }, onNo: () => setConfirm(null) });
  }

  function editGroup(p: Person, g: Group): void {
    const none = !!container && g.project_id === container;   // P2-0071: «Без объектов»
    openWizard({ step: 2, users: [p.user_id], roleId: g.role_id, scope: none ? 'none' : g.project_id ? 'project' : 'company',
      projectId: none ? '' : g.project_id || '', places: g.places, factOwner: g.factOwner, until: dateInput(g.validTo), firm: g.counterparty_id || '',
      edit: { userId: p.user_id, group: g } });
  }

  function groupRow(p: Person, g: Group): ReactElement {
    return h('div', { key: g.key, className: 'cm-group' + (!g.active || p.disabled ? ' co-inactive' : ''), 'data-group': g.key,
      'data-assignment-id': g.items.map((x) => x.assignment_id).join(' ') },
      h('div', { className: 'cm-x' },
        h('div', { className: 'co-role-name' }, h('b', null, g.project_name || 'Вся компания'), ' · ', g.role_name,
          g.counterparty_name ? h('span', { className: 'pf-muted' }, ` · ${g.counterparty_name}`) : null),
        h('div', { className: 'cm-d cm-wrap', 'data-testid': 'co-group-where' }, groupWhere(g)),
        g.objects.length ? h('div', { className: 'cm-d cm-wrap', 'data-testid': 'co-row-objects' }, `Объекты Качества: ${objectsText(g.objects)}`) : null,
        h('div', { className: 'cm-tags' },
          g.factOwner ? h(StatusBadge, { status: 'green', label: 'отвечает за факт', testId: 'co-tag-owner' }) : null,
          h(StatusBadge, { status: g.active ? 'grey' : 'yellow', label: g.status, testId: 'co-tag-status' }))),
      p.disabled ? null : h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'co-group-edit', disabled: busy,
        onClick: () => editGroup(p, g) }, 'Изменить'));
  }

  function personCard(p: Person): ReactElement {
    const own = p.email === me;
    const groups = groupsOf(p.items);
    return h('div', { className: 'cm-card', 'data-user-id': p.user_id, 'data-testid': 'co-person' },
      h('button', { type: 'button', className: 'cm-back', 'data-testid': 'co-back', onClick: () => setSel('') }, '‹ Сотрудники'),
      h('div', { className: 'sui-card co-person-card' + (p.disabled ? ' co-inactive' : '') },
        h('div', { className: 'cm-head' },
          h('span', { className: 'cm-av cm-av--l', 'aria-hidden': 'true' }, initials(p)),
          h('div', { className: 'cm-x' },
            h('div', { className: 'co-person-name' }, (p.name || p.email) + (own ? ' (вы)' : '')),
            p.name ? h('div', { className: 'pf-muted co-person-mail' }, p.email) : null,
            h('div', { className: 'cm-tags' },
              p.disabled ? h(StatusBadge, { status: 'grey', label: 'доступ отключён', testId: 'co-badge-disabled' }) : null,
              p.mustChange && !p.disabled ? h(StatusBadge, { status: 'yellow', label: 'ещё не сменил временный пароль', testId: 'co-badge-must' }) : null)),
          personMenu(p)),
        nameForm(p)),
      h('div', { className: 'cm-h' }, 'Где работает'),
      groups.length ? h('div', { className: 'sui-card cm-groups', 'data-testid': 'co-groups' }, groups.map((g) => groupRow(p, g)))
        : h('div', { className: 'sui-card sui-sub-meta', 'data-testid': 'co-noroles' }, p.disabled ? '—' : 'нет ролей'),
      p.disabled || own ? null : h('button', { type: 'button', className: 'pf-btn cm-wide', 'data-testid': 'co-add-part', disabled: busy,
        onClick: () => openWizard({ step: 2, users: [p.user_id] }) }, '+ Добавить участие'));
  }

  function personRow(p: Person): ReactElement {
    const f = personFlags(p);
    return h('button', { key: p.user_id, type: 'button', className: 'cm-row' + (p.user_id === sel ? ' is-on' : '') + (p.disabled ? ' co-inactive' : ''),
      'data-person': p.user_id, 'aria-current': p.user_id === sel ? 'true' : undefined, onClick: () => { setSel(p.user_id); setEditName(''); } },
      h('span', { className: 'cm-av', 'aria-hidden': 'true' }, initials(p)),
      h('span', { className: 'cm-x' },
        h('b', null, (p.name || p.email) + (p.email === me ? ' (вы)' : '')),
        h('span', { className: 'cm-d', 'data-testid': 'co-where' }, whereLine(p))),
      h('span', { className: 'cm-tags cm-tags--row' },
        f.factOwner ? h(StatusBadge, { status: 'green', label: 'факт' }) : null,
        f.mustChange ? h(StatusBadge, { status: 'yellow', label: 'пароль' }) : null,
        f.noRole ? h(StatusBadge, { status: 'red', label: 'нет ролей' }) : null),
      h('span', { className: 'cm-chev', 'aria-hidden': 'true' }, '›'));
  }

  const tools = h('div', { className: 'cm-tools' },
    h('input', { type: 'search', className: 'co-input', placeholder: 'Найти: имя, почта, проект', 'aria-label': 'Найти сотрудника', value: q,
      'data-testid': 'co-search', onChange: (e: { target: { value: string } }) => setQ(e.target.value) }),
    h('div', { className: 'cm-filters', role: 'group', 'aria-label': 'Фильтр' }, FILTERS.map((x) => h('button', { key: x.id, type: 'button',
      className: 'cm-filter cm-filter--' + x.tone + (filter === x.id ? ' is-on' : ''), 'aria-pressed': filter === x.id, 'data-filter': x.id,
      onClick: () => setFilter(x.id) }, x.label, h('span', { className: 'cm-n' }, String(c[x.id]))))),
    h('div', { className: 'cm-seg', role: 'tablist', 'aria-label': 'Вид' }, (['people', 'projects'] as const).map((v) => h('button', { key: v, type: 'button', role: 'tab',
      'aria-selected': view === v, 'data-view': v, className: 'cm-seg-b' + (view === v ? ' is-on' : ''), onClick: () => setView(v) }, v === 'people' ? 'Люди' : 'По проектам'))));

  const people$ = h('div', { className: 'cm-list', 'data-testid': 'co-people' },
    shown.length ? shown.map(personRow) : h('div', { className: 'sui-hint cm-empty' }, 'Никого не нашлось'));

  const head = h('div', { className: 'cm-actions cm-actions--top' },
    h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'co-assign-open', onClick: () => openWizard({ step: 1 }) }, '+ Назначить'),
    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'co-add-open', onClick: openAdd }, '+ Сотрудник'));
  const fab = h('div', { className: 'cm-actions cm-actions--fab' },
    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'co-add-open-m', onClick: openAdd }, '+ Сотрудник'),
    h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'co-assign-open-m', onClick: () => openWizard({ step: 1 }) }, '+ Назначить'));

  const body = view === 'projects'
    ? h('div', { className: 'cm-one' }, tools,
        h(ByProject, { rows, projects: projects.filter((p) => !p.archived_at), loadPlaces,
          onAdd: (projectId, place) => openWizard({ step: 1, scope: 'project', projectId, places: place ? [place] : [] }) }))
    : h('div', { className: 'cm-split', 'data-has-sel': cur ? '1' : '0' },
        h('div', { className: 'cm-left' }, tools, people$),
        h('div', { className: 'cm-right' }, cur ? personCard(cur)
          : h('div', { className: 'sui-card cm-pick-hint' }, 'Выберите сотрудника в списке')));

  return h('div', { className: 'co-members cm', 'data-testid': 'co-members' },
    head,
    temp ? h('div', { className: 'co-panel co-temp', role: 'status', 'data-testid': 'co-temp' },
      h('div', { className: 'co-temp-title' }, `Временный пароль — ${temp.who}`),
      h('div', { className: 'pf-muted' }, `Почта для входа: ${temp.email}`),
      temp.note ? h('div', { className: 'sui-hint', 'data-testid': 'co-temp-note' }, temp.note) : null,
      h('div', { className: 'co-row' },
        h('code', { className: 'co-temp-pw', 'data-testid': 'co-temp-pw' }, temp.password),
        h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'co-temp-copy', onClick: () => { void copyTemp(); } }, copied ? 'Скопировано' : 'Скопировать'),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'co-temp-done', onClick: () => { setTemp(null); setCopied(false); } }, 'Готово')),
      h('div', { className: 'pf-muted sui-hint' }, 'Больше этот пароль не покажем. Передайте его сотруднику: при первом входе он придумает свой.')) : null,
    error && !adding && !wizard ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'co-notice', role: 'status', 'data-testid': 'co-notice' }, notice) : null,
    body,
    fab,
    adding ? h(Sheet, { title: 'Новый сотрудник', sub: 'Учётка и первая роль; временный пароль покажем один раз', testId: 'co-add-sheet', onClose: () => { setAdding(false); setError(''); } },
      h('form', { className: 'cm-form', onSubmit: add, 'data-testid': 'co-add' },
        h('label', { className: 'pf-field' }, 'Почта (логин)',
          h('input', { name: 'email', type: 'email', inputMode: 'email', autoComplete: 'off', className: 'co-input' })),
        h('label', { className: 'pf-field' }, 'ФИО', h('input', { name: 'full_name', className: 'co-input', maxLength: 120 })),
        h('label', { className: 'pf-field' }, 'Роль',
          h('select', { name: 'role', className: 'co-input', defaultValue: '' },
            h('option', { value: '' }, '— выберите —'),
            roles.map((r) => h('option', { key: r.id, value: r.id }, r.name)))),
        h('label', { className: 'pf-field' }, 'Проект',
          h('select', { name: 'project', className: 'co-input', defaultValue: '' },
            h('option', { value: '' }, 'Все проекты компании'),
            projects.filter((p) => !p.archived_at).map((p) => h('option', { key: p.id, value: p.id }, p.name)))),
        error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
        h('div', { className: 'co-row cm-form-foot' },
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => { setAdding(false); setError(''); } }, 'Отмена'),
          h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Добавить')))) : null,
    wizard ? h(AssignWizard, { key: wizKey, api, loadPlaces, persons: list, roles, projects, contractors, container, me, init: wizard,
      onClose: () => setWizard(null),
      onDone: (msg) => { setWizard(null); setNotice(msg); void load(); } }) : null,
    confirmDialog());
}

/** «По проектам»: проект → дерево (весь проект + узлы), кто назначен (метка «факт» у ответственного), «+» — мастер с этим местом. */
function ByProject(props: { rows: MemberRow[]; projects: ProjectRef[]; loadPlaces: LoadPlaces | null;
  onAdd: (projectId: string, place?: { id: string; path: string }) => void }): ReactElement {
  const { rows, projects, loadPlaces } = props;
  const [pid, setPid] = useState(projects[0] ? projects[0].id : '');
  const [kids, setKids] = useState<Record<string, PlaceItem[] | undefined>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function toggle(n: PlaceItem, force?: boolean): Promise<void> {
    setOpen((o) => ({ ...o, [n.id]: force ? true : !o[n.id] }));
    if (loadPlaces && pid) {
      const list = await loadPlaces(pid, n.id).catch(() => [] as PlaceItem[]);
      setKids((k) => (k[n.id] ? k : { ...k, [n.id]: list }));
    }
  }
  useEffect(() => {
    setKids({}); setOpen({});
    if (!loadPlaces || !pid) return;
    let alive = true;
    void loadPlaces(pid, null).then((list) => {
      if (!alive) return;
      setKids({ '': list });
      for (const n of list.slice(0, 3)) if (n.hasKids) void toggle(n, true);
    }).catch(() => { if (alive) setKids({ '': [] }); });
    return () => { alive = false; };
  }, [pid]);

  if (!projects.length) return h('div', { className: 'sui-card sui-hint', 'data-testid': 'co-byproject' }, 'Проектов нет — назначения только на всю компанию.');
  const who = whoByNode(rows, pid);
  const all = Object.values(kids).flatMap((l) => l || []);
  const parentOf = (id: string): string | null => { const n = all.find((x) => x.id === id); return n ? n.parent_id : null; };
  const chips = (id: string): ReactElement[] => (who.get(id) || []).map((w) => h('span', { key: w.user_id + w.role, className: 'cm-chip' + (w.factOwner ? ' cm-chip--ok' : ''),
    'data-who': w.user_id }, w.name + ' · ' + (w.factOwner ? 'факт' : w.role)));
  const warn = (n: PlaceItem): ReactElement | null => {
    const check = n.node_type === 'section' || (!n.parent_id && !n.hasKids);
    if (!check || hasFactOwner(n.id, who, parentOf)) return null;
    return h('span', { key: 'warn', className: 'cm-warn', 'data-testid': 'co-no-owner' }, 'нет ответственного за факт — вносит любой прораб проекта');
  };
  const roots = kids[''];
  return h('div', { className: 'cm-byproject', 'data-testid': 'co-byproject' },
    h('label', { className: 'pf-field' }, 'Проект',
      h('select', { className: 'co-input', value: pid, 'data-testid': 'co-bp-project', onChange: (e: { target: { value: string } }) => setPid(e.target.value) },
        projects.map((p) => h('option', { key: p.id, value: p.id }, p.name)))),
    h('div', { className: 'sui-card cm-bp-all', 'data-node-id': '' },
      h('div', { className: 'cm-x' }, h('b', null, 'Весь проект'), h('div', { className: 'cm-tags' }, chips(''))),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost cm-plus', 'aria-label': 'Назначить на весь проект', 'data-testid': 'co-bp-add',
        onClick: () => props.onAdd(pid) }, '+')),
    !loadPlaces ? null : !roots ? h('div', { className: 'sui-hint' }, 'Загрузка…')
      : !roots.length ? h('div', { className: 'sui-hint' }, 'В проекте нет мест. Места заводятся в «Проекты и объекты».')
      : h(PlaceTree<PlaceItem>, { testId: 'co-bp-tree', roots, kids, open, onToggle: (n) => { void toggle(n); }, kind: (n) => kindLabel(n.node_type),
          extra: (n) => { const c = chips(n.id); const w = warn(n); return c.length || w ? [...c, w] : null; },
          action: (n) => h('button', { type: 'button', className: 'pf-btn pf-btn--ghost cm-plus', 'aria-label': 'Назначить: ' + n.name, 'data-testid': 'co-bp-add',
            onClick: () => props.onAdd(pid, { id: n.id, path: n.path || n.name }) }, '+') }));
}

export const COMPANY_MEMBERS_CSS = `
.co-members{display:flex;flex-direction:column;gap:12px}
.cm{container-type:inline-size;container-name:cm;min-width:0}
.co-input{font-size:16px;min-height:44px;box-sizing:border-box;padding:9px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main);text-transform:none;font-weight:400;max-width:100%;min-width:0;width:100%}
.co-inactive td{color:var(--text-muted)}
.co-btn-sm{padding:6px 10px;font-size:12px}
.cm .co-input,.cr-wrap .co-input{font-size:16px}
.co-members .pf-field{min-width:0;max-width:100%;display:flex;flex-direction:column;gap:4px}
.co-members .pf-btn,.p2-sheet .pf-btn{min-height:44px}
.co-members select.co-input{text-overflow:ellipsis}
.co-role-name{color:var(--text-main);overflow-wrap:anywhere}
.co-inactive .co-role-name,.co-inactive .co-person-name{color:var(--text-muted)}
.co-name-form{margin-top:10px;gap:6px}
.co-name-form .co-input{flex:1 1 160px;width:auto}
.co-person-name{font-weight:700;font-size:17px;color:var(--text-main);overflow-wrap:anywhere}
.co-person-mail{font-size:13px;overflow-wrap:anywhere}
.co-temp{flex-direction:column;align-items:stretch;gap:8px}
.co-temp-title{font-weight:800}
.co-objects{flex:1 1 100%;min-width:0}
.co-objects-list{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:6px}
.co-objects .co-check{display:flex;align-items:center;gap:8px;min-height:44px;font-size:14px;color:var(--text-main);cursor:pointer}
.co-objects .co-check input{width:20px;height:20px;flex:none;margin:0}
.co-temp-pw{font-size:18px;font-weight:700;letter-spacing:.06em;padding:6px 10px;border:1px dashed var(--card-border);border-radius:8px;user-select:all;overflow-wrap:anywhere}
/* P2-0048 этап 4: «Сотрудники и доступ» */
.cm-actions{display:flex;gap:8px;flex-wrap:wrap}
.cm-actions--top{display:none}
.cm-actions--fab{position:sticky;bottom:0;z-index:5;padding:10px 0 calc(10px + env(safe-area-inset-bottom,0px));background:var(--bg-main,var(--bg,var(--card-bg)));border-top:1px solid var(--card-border)}
.cm-actions--fab .pf-btn{flex:1 1 0;min-width:0}
.cm-tools{display:flex;flex-direction:column;gap:10px;min-width:0}
.cm-filters{display:flex;flex-wrap:wrap;gap:6px}
.cm-filter{font:inherit;font-size:13px;font-weight:600;min-height:40px;padding:6px 12px;border-radius:999px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.cm-filter.is-on{border-color:var(--accent,var(--primary));box-shadow:inset 0 0 0 1px var(--accent,var(--primary))}
.cm-n{font-variant-numeric:tabular-nums;font-size:12px;min-width:20px;padding:1px 6px;border-radius:10px;background:var(--hover-bg,var(--card-border));text-align:center}
.cm-filter--red .cm-n{color:var(--p2-status-red-fg,var(--color-red))}
.cm-filter--yellow .cm-n{color:var(--p2-status-yellow-fg,#9a6a00)}
.cm-seg{display:flex;gap:0;border:1px solid var(--card-border);border-radius:12px;padding:3px;background:var(--card-bg);align-self:flex-start;max-width:100%}
.cm-seg-b{font:inherit;font-size:14px;font-weight:600;min-height:40px;padding:6px 16px;border:0;border-radius:9px;background:transparent;color:var(--text-muted);cursor:pointer}
.cm-seg-b.is-on{background:var(--accent,var(--primary));color:#fff}
html[data-theme^="rbi-"] .cm-seg-b.is-on{color:#111}
.cm-split,.cm-one{display:flex;flex-direction:column;gap:12px;min-width:0}
.cm-left,.cm-right{display:flex;flex-direction:column;gap:10px;min-width:0}
.cm-split[data-has-sel="1"] .cm-left{display:none}
.cm-split[data-has-sel="0"] .cm-right{display:none}
.cm-list{display:flex;flex-direction:column;background:var(--card-bg);border:1px solid var(--card-border);border-radius:14px;overflow:hidden}
.cm-row{font:inherit;display:flex;align-items:center;gap:10px;min-height:56px;padding:8px 12px;border:0;border-top:1px solid var(--card-border);background:transparent;color:var(--text-main);text-align:left;cursor:pointer;min-width:0;width:100%}
.cm-row:first-child{border-top:0}
.cm-row:hover{background:var(--hover-bg,rgba(0,0,0,.04))}
.cm-row.is-on{background:var(--hover-bg,rgba(0,0,0,.05));box-shadow:inset 3px 0 0 var(--accent,var(--primary))}
.cm-av{flex:none;display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;background:color-mix(in srgb,var(--accent,var(--primary)) 18%,transparent);color:var(--text-main);font-size:13px;font-weight:700}
.cm-av--l{width:52px;height:52px;font-size:17px}
.cm-x{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.cm-x b{font-weight:600;font-size:14.5px;overflow-wrap:anywhere}
.cm-d{font-size:12.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.cm-wrap{white-space:normal;overflow-wrap:anywhere}
.cm-tags{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:4px}
.cm-tags:empty{display:none}
.cm-tags--row{flex:none;margin:0;justify-content:flex-end;max-width:40%}
.cm-chev{flex:none;color:var(--text-muted);font-size:20px;line-height:1}
.cm-empty{padding:16px}
.cm-back{font:inherit;align-self:flex-start;min-height:44px;padding:6px 4px;border:0;background:transparent;color:var(--accent,var(--primary));font-weight:600;font-size:15px;cursor:pointer}
.cm-card{display:flex;flex-direction:column;gap:10px;min-width:0}
.cm-head{display:flex;gap:12px;align-items:flex-start}
.cm-h{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin:6px 2px 0}
.cm-groups{padding:0 14px}
.cm-group{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-top:1px solid var(--card-border);min-width:0}
.cm-group:first-child{border-top:0}
.cm-group .co-role-name{font-size:14.5px}
.cm-wide{width:100%}
.cm-pick-hint{text-align:center;padding:40px 16px;color:var(--text-muted)}
.cm-chip{display:inline-flex;align-items:center;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid var(--card-border);color:var(--text-main);background:var(--card-bg)}
.cm-chip--ok{border-color:var(--color-green);color:var(--color-green)}
.cm-warn{flex:1 1 100%;font-size:12.5px;color:var(--p2-status-yellow-fg,#9a6a00);overflow-wrap:anywhere}
.cm-plus{flex:none;min-width:44px;font-size:20px;font-weight:700;line-height:1}
.cm-byproject{display:flex;flex-direction:column;gap:10px;min-width:0}
.cm-bp-all{display:flex;gap:10px;align-items:center}
.cm-form{display:flex;flex-direction:column;gap:12px}
.cm-form-foot{justify-content:flex-end}
.cm-wiz-step{display:flex;flex-direction:column;gap:12px;min-width:0}
.cm-pick{display:flex;flex-direction:column;border:1px solid var(--card-border);border-radius:12px;overflow:hidden}
.cm-pick-row{display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 12px;border-top:1px solid var(--card-border);cursor:pointer;min-width:0}
.cm-pick-row:first-child{border-top:0}
.cm-pick-row input{width:20px;height:20px;flex:none;margin:0;accent-color:var(--accent,var(--primary))}
.cm-pick-row.is-off{opacity:.6;cursor:default}
.cm-fs{border:1px solid var(--card-border);border-radius:12px;padding:8px 10px;margin:0;min-width:0;display:flex;flex-direction:column;gap:8px}
.cm-fs legend{font-size:13px;font-weight:700;color:var(--text-muted);padding:0 4px}
.cm-fs .p2-tree{border:0;padding:0}
.cm-picked{font-size:13px;color:var(--text-main);overflow-wrap:anywhere}
.cm-owner{font-size:14px;color:var(--text-main)}
.cm-more{border:1px solid var(--card-border);border-radius:12px}
.cm-more summary{min-height:44px;display:flex;align-items:center;padding:0 12px;cursor:pointer;font-weight:600}
.cm-more-body{display:flex;flex-direction:column;gap:10px;padding:0 12px 12px}
.cm-sum{display:flex;flex-direction:column;gap:6px;font-size:15px;overflow-wrap:anywhere}
.cm-wiz-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center;width:100%}
.cm-wiz-foot .co-grow{flex:1 1 0;min-width:0}
/* закреплённые внизу кнопки — над нижним меню приложения (оно есть до 1280 px, если меню не сверху) */
@media (max-width:1279.98px){body:not(.nav-pos-top) .cm-actions--fab,body:not(.nav-pos-top) .cr-bar{bottom:calc(65px + env(safe-area-inset-bottom,0px))}}
.cm-replace{font-size:13px;color:var(--p2-status-yellow-fg,#9a6a00);overflow-wrap:anywhere}
.cm-danger-t{color:var(--p2-status-red-fg,var(--color-red))}
[data-testid="co-wizard"] .p2-sheet__foot,[data-testid="co-add-sheet"] .p2-sheet__foot{position:sticky;bottom:-16px;background:var(--card-bg);padding:8px 0 4px}
[data-testid="co-wizard"] .p2-steps{margin:0}
@container cm (min-width: 680px){
  .cm-actions--top{display:flex;justify-content:flex-end}
  .cm-actions--fab{display:none}
  .cm-split{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);align-items:start;gap:16px}
  .cm-split[data-has-sel="1"] .cm-left,.cm-split[data-has-sel="0"] .cm-right{display:flex}
  .cm-back{display:none}
}
@container cm (min-width: 1000px){
  .cm-split{grid-template-columns:minmax(300px,380px) minmax(0,1fr)}
}
`;
