/**
 * P2-0048 этап 4: мастер «Назначить» (лист снизу на телефоне, панель справа на ПК — деталь Sheet из ui/page.ts).
 * Шаг 1 «Кто» — несколько сотрудников галочками; шаг 2 «Роль и где» — роль, «Вся компания / Проект», проект, места галочками
 * по дереву проекта (ничего — весь проект), «Отвечает за факт», «Дополнительно: срок, фирма подрядчика»; для роли только Качества —
 * вместо проекта и дерева «Объекты Качества»; шаг 3 «Проверка» — итог простыми словами → pf_set_participation.
 * «Изменить» у группы назначений открывает мастер на шаге 2 с заполненными полями; там же «Отозвать» (pf_revoke_assignment по группе).
 * Заменяет прежнюю форму «Назначить роль» (С16–С27): те же поля, подсказки и ошибки; правила — на сервере (047).
 */
import { createElement as h, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { PlaceTree, Sheet, Steps } from '../ui/index.ts';
import { ConfirmDialog } from '../ui/settings.ts';
import { PLAN_NODE_LABELS } from '../../services/locations/types.ts';
import type { PlanNodeType } from '../../services/locations/types.ts';
import type { CompanyApi, ContractorRef, ProjectRef, QualityObjectRef, RoleRow } from './company.service.ts';
import { endOfDayIso, groupsOf, groupWhere, initials, resultText, roleKind, wizardSummary, whereLine } from './participation.ts';
import type { Group, Person } from './participation.ts';

/** Узел дерева мест проекта для выбора (из pf_project_places / pf_list_locations). */
export interface PlaceItem { id: string; parent_id: string | null; name: string; node_type: string; path: string; hasKids: boolean }
export type LoadPlaces = (projectId: string, parentId: string | null) => Promise<PlaceItem[]>;

export interface WizardInit {
  step?: 1 | 2; users?: string[]; roleId?: string; scope?: 'company' | 'project'; projectId?: string;
  places?: { id: string; path: string }[]; factOwner?: boolean; until?: string; firm?: string; objects?: string[];
  /** «Изменить»: группа назначений человека (роль × проект). */
  edit?: { userId: string; group: Group };
}

export const kindLabel = (t: string): string => (PLAN_NODE_LABELS[t as PlanNodeType] || 'место').toLowerCase();

export function AssignWizard(props: {
  api: CompanyApi; loadPlaces: LoadPlaces | null; persons: Person[]; roles: RoleRow[]; projects: ProjectRef[];
  contractors: ContractorRef[]; qObjects: QualityObjectRef[]; me: string; init: WizardInit;
  onClose: () => void; onDone: (message: string) => void;
}): ReactElement {
  const { api, init, persons, roles, contractors, qObjects, me } = props;
  const edit = init.edit || null;
  const projects = props.projects.filter((p) => !p.archived_at);   // архивные — не назначаем (P2-0011)
  const [step, setStep] = useState<1 | 2 | 3>(init.step || 1);
  const [users, setUsers] = useState<string[]>(init.users || []);
  const [q, setQ] = useState('');
  const [roleId, setRoleId] = useState(init.roleId || '');
  const [scope, setScope] = useState<'company' | 'project'>(init.scope || 'project');
  const [projectId, setProjectId] = useState(init.projectId || '');
  const [places, setPlaces] = useState<Map<string, string>>(new Map((init.places || []).map((p) => [p.id, p.path])));
  const [factOwner, setFactOwner] = useState(!!init.factOwner);
  const [until, setUntil] = useState(init.until || '');
  const [firm, setFirm] = useState(init.firm || '');
  const [objects, setObjects] = useState<string[]>(init.objects || []);
  const [kids, setKids] = useState<Record<string, PlaceItem[] | undefined>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const role = roles.find((r) => r.id === roleId) || null;
  const kind = roleKind(role);
  const where: 'company' | 'project' = kind.qualityOnly ? 'company' : scope;
  const showObjects = where === 'company' && kind.quality && qObjects.length > 0;
  const project = projects.find((p) => p.id === projectId) || props.projects.find((p) => p.id === projectId) || null;

  // дерево мест выбранного проекта: корни, первый объект раскрыт
  useEffect(() => {
    setKids({}); setOpen({});
    if (!props.loadPlaces || !projectId || where !== 'project') return;
    let alive = true;
    void props.loadPlaces(projectId, null).then((list) => {
      if (!alive) return;
      setKids({ '': list });
      if (list.length && list[0].hasKids) void toggle(list[0]);
    }).catch(() => { if (alive) setKids({ '': [] }); });
    return () => { alive = false; };
  }, [projectId, where]);

  async function toggle(n: PlaceItem): Promise<void> {
    const isOpen = !!open[n.id];
    setOpen((o) => ({ ...o, [n.id]: !isOpen }));
    if (!isOpen && !kids[n.id] && props.loadPlaces && projectId) {
      const list = await props.loadPlaces(projectId, n.id).catch(() => [] as PlaceItem[]);
      setKids((k) => ({ ...k, [n.id]: list }));
    }
  }

  const candidates = useMemo(() => persons.filter((p) => !p.disabled), [persons]);
  const shown = candidates.filter((p) => !q.trim() || (p.name + ' ' + p.email + ' ' + whereLine(p)).toLowerCase().includes(q.trim().toLowerCase()));
  const nameOf = (id: string): string => { const p = persons.find((x) => x.user_id === id); return p ? p.name || p.email : id; };

  function next(): void {
    setError('');
    if (step === 1) {
      if (!users.length) { setError('Выберите сотрудника и роль'); return; }
      setStep(2); return;
    }
    if (step === 2) {
      if (!users.length || !roleId) { setError('Выберите сотрудника и роль'); return; }
      if (where === 'project' && !projectId) { setError('Выберите проект'); return; }
      if (kind.firm && !firm) { setError('Выберите фирму подрядчика: без фирмы сотрудник не увидит ни одной записи'); return; }
      setStep(3);
    }
  }

  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true); setError('');
    const res = await api.setParticipation({
      users, roleId, projectId: where === 'project' ? projectId : null, locations: where === 'project' ? Array.from(places.keys()) : [],
      factOwner: where === 'project' && factOwner, validTo: endOfDayIso(until), objects: showObjects ? objects : [],
      counterpartyId: kind.firm ? firm || null : null
    });
    if (!res.ok) { setBusy(false); setError(res.message); return; }
    const out = { ...res.value };
    // «Изменить» с другой ролью или проектом: прежняя группа отзывается (сервер приводит к области только ту же роль × проект)
    if (edit && (edit.group.role_id !== roleId || (edit.group.project_id || '') !== (where === 'project' ? projectId : ''))) {
      for (const it of edit.group.items) {
        if (!it.assignment_id || !it.is_active) continue;
        const r = await api.revoke(it.assignment_id);
        if (!r.ok) { setBusy(false); setError(r.message); return; }
        out.revoked++;
      }
    }
    setBusy(false);
    props.onDone(resultText(out));
  }

  async function revokeGroup(): Promise<void> {
    if (!edit || busy) return;
    setConfirmRevoke(false); setBusy(true); setError('');
    let n = 0;
    for (const it of edit.group.items) {
      if (!it.assignment_id) continue;
      const r = await api.revoke(it.assignment_id);
      if (!r.ok) { setBusy(false); setError(r.message); return; }
      n++;
    }
    setBusy(false);
    props.onDone(n === 1 ? 'Назначение отозвано' : `Отозвано назначений: ${n} — права пропадут со следующего запроса`);
  }

  const pick = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const togglePlace = (n: PlaceItem): void => {
    const m = new Map(places);
    if (m.has(n.id)) m.delete(n.id); else m.set(n.id, n.path || n.name);
    setPlaces(m);
  };

  const stepOne = (): ReactElement => h('div', { className: 'cm-wiz-step', 'data-testid': 'co-wiz-who' },
    h('input', { type: 'search', className: 'co-input', placeholder: 'Найти сотрудника', 'aria-label': 'Найти сотрудника', value: q,
      onChange: (e: { target: { value: string } }) => setQ(e.target.value) }),
    h('div', { className: 'cm-pick' }, shown.map((p) => {
      const self = p.email === me;
      const locked = !!edit && edit.userId === p.user_id;
      return h('label', { key: p.user_id, className: 'cm-pick-row' + (self ? ' is-off' : ''), 'data-pick': p.user_id },
        h('input', { type: 'checkbox', checked: users.includes(p.user_id), disabled: self || locked, onChange: () => setUsers(pick(users, p.user_id)) }),
        h('span', { className: 'cm-av' }, initials(p)),
        h('span', { className: 'cm-x' }, h('b', null, (p.name || p.email) + (self ? ' (вы)' : '')),
          h('span', { className: 'cm-d' }, p.name ? `${p.email} · ${whereLine(p)}` : whereLine(p))));
    }), shown.length ? null : h('div', { className: 'sui-hint' }, 'Никого не нашлось')),
    h('div', { className: 'sui-hint', 'data-testid': 'co-wiz-count' }, `Выбрано: ${users.length}`));

  const tree = (): ReactElement | null => {
    if (where !== 'project' || !projectId) return null;
    const roots = kids[''];
    return h('fieldset', { className: 'cm-fs', 'data-testid': 'co-wiz-places' },
      h('legend', null, 'Места (ничего не отмечено — весь проект)'),
      !props.loadPlaces ? h('div', { className: 'sui-hint' }, 'Дерево мест недоступно — назначение на весь проект.')
        : !roots ? h('div', { className: 'sui-hint' }, 'Загрузка…')
        : !roots.length ? h('div', { className: 'sui-hint' }, 'В проекте нет мест — назначение на весь проект. Места заводятся в «Проекты и объекты».')
        : h(PlaceTree<PlaceItem>, { testId: 'co-wiz-tree', roots, kids, open, onToggle: (n) => { void toggle(n); }, kind: (n) => kindLabel(n.node_type),
            check: (n) => ({ checked: places.has(n.id), onChange: () => togglePlace(n) }) }),
      places.size ? h('div', { className: 'cm-picked', 'data-testid': 'co-wiz-picked' }, 'Отмечено: ' + Array.from(places.values()).join(', ')) : null);
  };

  const stepTwo = (): ReactElement => h('div', { className: 'cm-wiz-step', 'data-testid': 'co-wiz-where' },
    edit ? h('div', { className: 'sui-hint' }, `Сотрудник: ${users.map(nameOf).join(', ')}`) : null,
    h('label', { className: 'pf-field' }, 'Роль',
      h('select', { name: 'role', className: 'co-input', value: roleId, 'data-testid': 'co-wiz-role', onChange: (e: { target: { value: string } }) => { setRoleId(e.target.value); setError(''); } },
        h('option', { value: '' }, '— выберите —'),
        roles.map((r) => h('option', { key: r.id, value: r.id }, r.name)))),
    kind.qualityOnly ? h('div', { className: 'sui-hint', 'data-testid': 'co-wiz-qonly' }, 'Роль Качества — назначается на всю компанию; доступ ограничивается объектами Качества.') : null,
    kind.qualityOnly ? null : h('div', { className: 'pf-field' }, 'Где',
      h('div', { className: 'cm-seg', role: 'radiogroup', 'aria-label': 'Где' },
        (['company', 'project'] as const).map((s) => h('button', { key: s, type: 'button', role: 'radio', 'aria-checked': where === s, 'data-scope': s,
          className: 'cm-seg-b' + (where === s ? ' is-on' : ''), onClick: () => setScope(s) }, s === 'company' ? 'Вся компания' : 'Проект')))),
    where === 'project' ? h('label', { className: 'pf-field' }, 'Проект',
      h('select', { name: 'project', className: 'co-input', value: projectId, 'data-testid': 'co-wiz-project',
        onChange: (e: { target: { value: string } }) => { setProjectId(e.target.value); setPlaces(new Map()); } },
        h('option', { value: '' }, '— выберите —'),
        projects.map((p) => h('option', { key: p.id, value: p.id }, p.name)))) : null,
    tree(),
    where === 'project' ? h('label', { className: 'sui-check cm-owner' },
      h('input', { type: 'checkbox', checked: factOwner, 'data-testid': 'co-wiz-owner', onChange: () => setFactOwner(!factOwner) }),
      places.size ? 'Отвечает за факт по этим местам' : 'Отвечает за факт по всему проекту') : null,
    showObjects ? h('fieldset', { className: 'cm-fs co-objects', 'data-testid': 'co-objects' },
      h('legend', null, 'Объекты Качества'),
      h('div', { className: 'pf-muted sui-hint' }, 'Ничего не отмечено — все объекты. Отмеченные — сотрудник видит записи только этих объектов и свои без объекта.'),
      h('div', { className: 'co-objects-list' }, qObjects.map((o) =>
        h('label', { key: o.id, className: 'co-check' }, h('input', { type: 'checkbox', name: 'qobj', value: o.id, checked: objects.includes(o.id),
          onChange: () => setObjects(pick(objects, o.id)) }), o.name)))) : null,
    h('details', { className: 'cm-more', open: !!(kind.firm || until) || undefined },
      h('summary', null, 'Дополнительно: срок, фирма подрядчика'),
      h('div', { className: 'cm-more-body' },
        h('label', { className: 'pf-field' }, 'Срок до (необязательно)',
          h('input', { name: 'until', type: 'date', className: 'co-input', value: until, onChange: (e: { target: { value: string } }) => setUntil(e.target.value) })),
        kind.firm ? h('label', { className: 'pf-field' }, 'Фирма подрядчика',
          h('select', { name: 'firm', className: 'co-input', value: firm, 'data-testid': 'co-firm', onChange: (e: { target: { value: string } }) => setFirm(e.target.value) },
            h('option', { value: '' }, contractors.length ? '— выберите —' : 'нет подрядчиков в «Контрагентах»'),
            contractors.map((c) => h('option', { key: c.id, value: c.id }, c.draft ? `${c.name} (нужен ИНН)` : c.name))))
          : h('div', { className: 'sui-hint' }, 'Фирма подрядчика — только для роли «только своя фирма-подрядчик».'),
        kind.firm ? h('div', { className: 'pf-muted sui-hint', 'data-testid': 'co-firm-hint' },
          'Сотрудник увидит в Качестве и Стройконтроле только записи этой фирмы — это проверяет сервер.') : null)));

  const summary = (): ReactElement => {
    const s = wizardSummary({ names: users.map(nameOf), role: role ? role.name : '', project: where === 'project' && project ? project.name : null,
      places: Array.from(places.values()), factOwner, until, firm: kind.firm ? (contractors.find((c) => c.id === firm) || { name: '' }).name : null,
      objects: showObjects ? qObjects.filter((o) => objects.includes(o.id)).map((o) => o.name) : undefined });
    // сервер приводит набор «сотрудник × роль × проект» к выбранным местам — у тех, кто уже так участвует, прежние места заменятся
    const pid = where === 'project' ? projectId : '';
    const replaced = users.filter((u) => !edit || u !== edit.userId).flatMap((u) => {
      const p = persons.find((x) => x.user_id === u);
      const g = p ? groupsOf(p.items).find((x) => x.active && x.role_id === roleId && (x.project_id || '') === pid) : null;
      return g ? [`${nameOf(u)} — ${groupWhere(g)}`] : [];
    });
    return h('div', { className: 'cm-wiz-step', 'data-testid': 'co-wiz-check' },
      h('div', { className: 'sui-card cm-sum' },
        h('b', { 'data-testid': 'co-wiz-who-sum' }, s.who),
        h('div', { 'data-testid': 'co-wiz-what' }, '→ ', s.what),
        h('div', { className: 'sui-hint', 'data-testid': 'co-wiz-n' }, edit ? 'Назначения сотрудника этой роли в этом проекте будут приведены к выбранным местам: новые добавятся, лишние отзовутся.' : s.countText + '.'),
        where === 'project' && places.size ? h('div', { className: 'sui-hint' }, 'В План/Факте увидят только эти места.') : null,
        replaced.length ? h('div', { className: 'cm-replace', 'data-testid': 'co-wiz-replace' },
          'Уже участвуют с этой ролью здесь — их места будут заменены выбранными: ' + replaced.join('; ') + '.') : null,
        h('div', { className: 'sui-hint' }, 'Запись появится в журнале компании. Права действуют со следующего запроса.')));
  };

  const title = edit ? 'Изменить участие' : 'Назначить';
  const sub = edit ? `${nameOf(edit.userId)} · ${edit.group.role_name} · ${edit.group.project_name || 'вся компания'} · ${groupWhere(edit.group)}` : undefined;
  const footer = h('div', { className: 'cm-wiz-foot' },
    edit && step === 2 ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost cm-danger-t', 'data-testid': 'co-wiz-revoke', disabled: busy,
      onClick: () => setConfirmRevoke(true) }, 'Отозвать') : null,
    h('span', { className: 'co-grow' }),
    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'co-wiz-back', disabled: busy,
      onClick: () => { setError(''); if (step === 1) props.onClose(); else setStep((step - 1) as 1 | 2); } },
      step === 1 ? 'Отмена' : 'Назад'),
    step < 3
      ? h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'co-wiz-next', disabled: busy, onClick: next }, 'Далее')
      : h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'co-wiz-save', disabled: busy, onClick: () => { void save(); } }, busy ? 'Сохраняю…' : 'Сохранить'));

  return h(Sheet, { title, sub, testId: 'co-wizard', onClose: props.onClose, footer },
    h(Steps, { steps: [{ id: '1', label: '1. Кто' }, { id: '2', label: '2. Роль и где' }, { id: '3', label: '3. Проверка' }], current: String(step) }),
    step === 1 ? stepOne() : step === 2 ? stepTwo() : summary(),
    error ? h('div', { className: 'pf-error', role: 'alert', 'data-testid': 'co-wiz-error' }, error) : null,
    confirmRevoke && edit ? h(ConfirmDialog, { title: 'Отозвать роль?', yes: 'Да, отозвать', yesTestId: 'co-revoke-yes', danger: true, busy,
      text: `${nameOf(edit.userId)}: роль «${edit.group.role_name}» · ${edit.group.project_name || 'все проекты'} · ${groupWhere(edit.group)}. Права пропадут со следующего запроса.`,
      onYes: () => { void revokeGroup(); }, onNo: () => setConfirmRevoke(false) }) : null);
}

