/**
 * «Компания → Сотрудники»: участники компании (ФИО, почта), их назначения (роль, проект или «все проекты», срок, фирма подрядчика),
 * «Назначить роль», «Отозвать». Роль с правом «только своя фирма-подрядчик» (quality.scope.contractor, P2-0018) — с выбором
 * фирмы из «Контрагентов» (вид «подрядчик»); что видит сотрудник, проверяет сервер.
 * P2-0028: «Добавить сотрудника» (почта, ФИО, роль, объект) → временный пароль показывается один раз; «Сбросить пароль»
 * (только учётке, созданной компанией), «Отключить доступ», «Изменить ФИО» (032a: новое ФИО — и в старых записях Качества).
 * P2-0033: «Объекты Качества» при назначении роли — галочки по объектам компании (ничего не отмечено — все объекты);
 * закрепление хранится по id объекта (ADR-070), что видит сотрудник — решает сервер (033).
 * Всё — через pf_*; права и правила — на сервере (032, 032a, 033).
 * P2-0038: карточка на сотрудника (телефон и ПК): действия по человеку — меню «⋯», подтверждения — диалог.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { CompanyApi, ContractorRef, MemberRow, ProjectRef, QualityObjectRef, RoleRow } from './company.service.ts';
import { ActionsMenu, ConfirmDialog } from '../ui/settings.ts';

const DAY = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short' });

interface Person {
  user_id: string; email: string; name: string; items: MemberRow[];
  disabled: boolean; mustChange: boolean; managed: boolean;
}
/** Временный пароль на экране: показывается один раз, после «Готово» не восстановить. */
interface TempPassword { who: string; email: string; password: string }

const SCOPE_CONTRACTOR = 'quality.scope.contractor';

/** Объекты назначения для таблицы: null — все объекты Качества. */
export function objectsText(list: QualityObjectRef[] | null | undefined): string {
  return list && list.length ? list.map((o) => o.name).join(', ') : '';
}

function people(rows: MemberRow[]): Person[] {
  const map = new Map<string, Person>();
  for (const r of rows) {
    const p = map.get(r.user_id) || { user_id: r.user_id, email: r.email || '—', name: r.full_name || '', items: [],
      disabled: !!r.disabled_at, mustChange: r.must_change_password === true, managed: r.managed === true };
    if (r.assignment_id) p.items.push(r);
    map.set(r.user_id, p);
  }
  return Array.from(map.values());
}

function status(r: MemberRow): string {
  if (r.is_active) return r.valid_to ? `до ${DAY.format(new Date(r.valid_to))}` : 'бессрочно';
  if (r.valid_to && new Date(r.valid_to) <= new Date()) return `истекло ${DAY.format(new Date(r.valid_to))}`;
  return r.valid_from ? `с ${DAY.format(new Date(r.valid_from))}` : 'не действует';
}

/** Дата из поля «Срок до» → конец этого дня по местному времени. Пусто → бессрочно. */
export function endOfDayIso(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function CompanyMembers(props: { api: CompanyApi; companyId: string; me: string }): ReactElement {
  const { api, companyId, me } = props;
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  /** Открытый диалог подтверждения: сброс пароля / отключение (по человеку) или отзыв назначения. */
  const [confirm, setConfirm] = useState<{ kind: 'reset' | 'disable' | 'revoke'; userId: string; assignmentId?: string } | null>(null);
  const [contractors, setContractors] = useState<ContractorRef[]>([]);
  const [roleId, setRoleId] = useState('');
  const [adding, setAdding] = useState(false);
  const [temp, setTemp] = useState<TempPassword | null>(null);
  const [copied, setCopied] = useState(false);
  const [editName, setEditName] = useState('');   // user_id, у которого правится ФИО
  const [qObjects, setQObjects] = useState<QualityObjectRef[]>([]);

  async function load(): Promise<void> {
    const [m, r, p, k, o] = await Promise.all([api.listMembers(companyId), api.listRoles(companyId), api.listProjects(), api.listContractors(companyId),
      // список объектов Качества — необязательный: ошибка сервера не ломает экран (ревью P2-0033, L7)
      api.listQualityObjects ? api.listQualityObjects(companyId).catch(() => [] as QualityObjectRef[]) : Promise.resolve([] as QualityObjectRef[])]);
    setRows(m); setRoles(r); setProjects(p.filter((x) => x.company_id === companyId)); setContractors(k); setQObjects(o);
  }
  const needsFirm = roles.find((x) => x.id === roleId)?.actions.includes(SCOPE_CONTRACTOR) ?? false;
  // объекты Качества — для ролей с доступом к Качеству, если у компании есть объекты
  const showObjects = qObjects.length > 0 && (roles.find((x) => x.id === roleId)?.actions.some((a) => a.startsWith('quality.')) ?? false);
  useEffect(() => { setRows(null); void load(); }, [companyId]);

  async function assign(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const form = ev.currentTarget as HTMLFormElement;
    const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement).value;
    const user = val('user'), role = val('role'), project = val('project'), until = val('until');
    const firm = needsFirm ? val('firm') : '';
    if (!user || !role) { setError('Выберите сотрудника и роль'); return; }
    if (needsFirm && !firm) { setError('Выберите фирму подрядчика: без фирмы сотрудник не увидит ни одной записи'); return; }
    const objs = showObjects ? Array.from(form.querySelectorAll('input[name=qobj]:checked')).map((x) => (x as HTMLInputElement).value) : [];
    setBusy(true); setError(''); setNotice('');
    const res = await api.assignRole(user, role, project || null, endOfDayIso(until), firm || null, objs);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    form.reset(); setRoleId('');
    setNotice('Роль назначена — права действуют со следующего запроса');
    await load();
  }

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
    if (res.value.temp_password) setTemp({ who: name, email: email.toLowerCase(), password: res.value.temp_password });
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

  async function revoke(id: string): Promise<void> {
    if (busy) return;
    setConfirm(null); setBusy(true); setError(''); setNotice('');
    const res = await api.revoke(id);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setNotice('Назначение отозвано');
    await load();
  }

  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  const list = people(rows);
  const label = (p: Person) => (p.name ? `${p.name} · ${p.email}` : p.email) + (p.email === me ? ' (вы)' : '');

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
      h('button', { type: 'submit', className: 'pf-btn co-btn-sm', disabled: busy }, 'Сохранить'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost co-btn-sm', onClick: () => setEditName('') }, 'Отмена'));
  }

  function confirmDialog(): ReactElement | null {
    if (!confirm) return null;
    const p = list.find((x) => x.user_id === confirm.userId);
    if (!p) return null;
    const who = p.name || p.email;
    if (confirm.kind === 'reset') return h(ConfirmDialog, { title: 'Сбросить пароль?', yes: 'Да, сбросить', yesTestId: 'co-reset-yes', busy,
      text: `${who}: старый пароль перестанет работать, новый временный покажем один раз.`, onYes: () => { void resetPassword(p); }, onNo: () => setConfirm(null) });
    if (confirm.kind === 'disable') return h(ConfirmDialog, { title: 'Отключить доступ?', yes: 'Да, отключить', yesTestId: 'co-disable-yes', danger: true, busy,
      text: `${who} больше не сможет войти. Записи сотрудника останутся в истории.`, onYes: () => { void disable(p); }, onNo: () => setConfirm(null) });
    const r = p.items.find((x) => x.assignment_id === confirm.assignmentId);
    return h(ConfirmDialog, { title: 'Отозвать роль?', yes: 'Да, отозвать', yesTestId: 'co-revoke-yes', danger: true, busy,
      text: `${who}: роль «${r ? r.role_name : ''}»${r ? ' · ' + (r.project_name || 'все проекты') : ''}. Права пропадут со следующего запроса.`,
      onYes: () => { if (confirm.assignmentId) void revoke(confirm.assignmentId); }, onNo: () => setConfirm(null) });
  }

  function assignmentRow(p: Person, r: MemberRow): ReactElement {
    return h('div', { key: r.assignment_id, className: 'sui-sub co-assignment' + (!r.is_active || p.disabled ? ' co-inactive' : ''), 'data-assignment-id': r.assignment_id },
      h('div', { className: 'sui-sub-main' },
        h('div', { className: 'co-role-name' }, r.role_name, r.counterparty_name ? h('span', { className: 'pf-muted' }, ` · ${r.counterparty_name}`) : null),
        h('div', { className: 'sui-sub-meta' }, (r.project_name || 'Все проекты') + ' · ' + status(r)),
        objectsText(r.quality_objects) ? h('div', { className: 'sui-sub-meta', 'data-testid': 'co-row-objects' }, `Объекты: ${objectsText(r.quality_objects)}`) : null),
      p.disabled ? null : h('button', { type: 'button', className: 'pf-btn pf-btn--ghost co-btn-sm', 'data-testid': 'co-revoke', disabled: busy,
        onClick: () => setConfirm({ kind: 'revoke', userId: p.user_id, assignmentId: r.assignment_id! }) }, 'Отозвать'));
  }

  function personCard(p: Person): ReactElement {
    return h('div', { key: p.user_id, className: 'sui-card co-person-card' + (p.disabled ? ' co-inactive' : ''), 'data-user-id': p.user_id },
      h('div', { className: 'sui-card-head' },
        h('div', { className: 'sui-card-main' },
          h('div', { className: 'co-person-name' }, (p.name || p.email) + (p.email === me ? ' (вы)' : '')),
          p.name ? h('div', { className: 'pf-muted co-person-mail' }, p.email) : null,
          p.disabled ? h('span', { className: 'co-badge', 'data-testid': 'co-badge-disabled' }, 'доступ отключён') : null,
          p.mustChange && !p.disabled ? h('span', { className: 'co-badge' }, 'ещё не сменил временный пароль') : null),
        personMenu(p)),
      nameForm(p),
      p.items.length ? p.items.map((r) => assignmentRow(p, r))
        : h('div', { className: 'sui-sub sui-sub-meta' }, p.disabled ? '—' : 'нет ролей'));
  }

  return h('div', { className: 'co-members', 'data-testid': 'co-members' },
    adding
      ? h('form', { className: 'co-panel co-row', onSubmit: add, 'data-testid': 'co-add' },
          h('label', { className: 'pf-field co-grow' }, 'Почта (логин)',
            h('input', { name: 'email', type: 'email', inputMode: 'email', autoComplete: 'off', className: 'co-input' })),
          h('label', { className: 'pf-field co-grow' }, 'ФИО', h('input', { name: 'full_name', className: 'co-input', maxLength: 120 })),
          h('label', { className: 'pf-field co-grow' }, 'Роль',
            h('select', { name: 'role', className: 'co-input', defaultValue: '' },
              h('option', { value: '' }, '— выберите —'),
              roles.map((r) => h('option', { key: r.id, value: r.id }, r.name)))),
          h('label', { className: 'pf-field co-grow' }, 'Проект',
            h('select', { name: 'project', className: 'co-input', defaultValue: '' },
              h('option', { value: '' }, 'Все проекты компании'),
              projects.filter((p) => !p.archived_at).map((p) => h('option', { key: p.id, value: p.id }, p.name)))),
          h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Добавить'),
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setAdding(false) }, 'Отмена'))
      : h('div', { className: 'co-row' },
          h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'co-add-open', onClick: () => { setAdding(true); setTemp(null); setNotice(''); setError(''); } }, 'Добавить сотрудника')),
    temp ? h('div', { className: 'co-panel co-temp', role: 'status', 'data-testid': 'co-temp' },
      h('div', { className: 'co-temp-title' }, `Временный пароль — ${temp.who}`),
      h('div', { className: 'pf-muted' }, `Почта для входа: ${temp.email}`),
      h('div', { className: 'co-row' },
        h('code', { className: 'co-temp-pw', 'data-testid': 'co-temp-pw' }, temp.password),
        h('button', { type: 'button', className: 'pf-btn co-btn-sm', 'data-testid': 'co-temp-copy', onClick: () => { void copyTemp(); } }, copied ? 'Скопировано' : 'Скопировать'),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost co-btn-sm', 'data-testid': 'co-temp-done', onClick: () => { setTemp(null); setCopied(false); } }, 'Готово')),
      h('div', { className: 'pf-muted co-hint' }, 'Больше этот пароль не покажем. Передайте его сотруднику: при первом входе он придумает свой.')) : null,
    h('form', { className: 'co-panel co-row', onSubmit: assign, 'data-testid': 'co-assign' },
      h('label', { className: 'pf-field co-grow' }, 'Сотрудник',
        h('select', { name: 'user', className: 'co-input', defaultValue: '' },
          h('option', { value: '' }, '— выберите —'),
          list.filter((p) => !p.disabled).map((p) => h('option', { key: p.user_id, value: p.user_id, disabled: p.email === me }, label(p))))),
      h('label', { className: 'pf-field co-grow' }, 'Роль',
        h('select', { name: 'role', className: 'co-input', defaultValue: '', onChange: (e: { target: { value: string } }) => setRoleId(e.target.value) },
          h('option', { value: '' }, '— выберите —'),
          roles.map((r) => h('option', { key: r.id, value: r.id }, r.name)))),
      h('label', { className: 'pf-field co-grow' }, 'Проект',
        h('select', { name: 'project', className: 'co-input', defaultValue: '' },
          h('option', { value: '' }, 'Все проекты компании'),
          projects.filter((p) => !p.archived_at).map((p) => h('option', { key: p.id, value: p.id }, p.name)))),   // архивные — не назначаем (P2-0011)
      needsFirm ? h('label', { className: 'pf-field co-grow' }, 'Фирма подрядчика',
        h('select', { name: 'firm', className: 'co-input', defaultValue: '', 'data-testid': 'co-firm' },
          h('option', { value: '' }, contractors.length ? '— выберите —' : 'нет подрядчиков в «Контрагентах»'),
          contractors.map((c) => h('option', { key: c.id, value: c.id }, c.draft ? `${c.name} (нужен ИНН)` : c.name)))) : null,
      h('label', { className: 'pf-field' }, 'Срок до (необязательно)', h('input', { name: 'until', type: 'date', className: 'co-input' })),
      showObjects ? h('fieldset', { className: 'co-objects', 'data-testid': 'co-objects' },
        h('legend', null, 'Объекты Качества'),
        h('div', { className: 'pf-muted co-hint' }, 'Ничего не отмечено — все объекты. Отмеченные — сотрудник видит записи только этих объектов и свои без объекта.'),
        h('div', { className: 'co-objects-list' }, qObjects.map((o) =>
          h('label', { key: o.id, className: 'co-check' }, h('input', { type: 'checkbox', name: 'qobj', value: o.id }), o.name)))) : null,
      h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Назначить роль')),
    needsFirm ? h('div', { className: 'pf-muted co-hint', 'data-testid': 'co-firm-hint' },
      'Сотрудник увидит в Качестве и Стройконтроле только записи этой фирмы — это проверяет сервер.') : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'co-notice', role: 'status' }, notice) : null,
    h('div', { className: 'sui-cards', 'data-testid': 'co-people' }, list.map(personCard)),
    confirmDialog()
  );
}

export const COMPANY_MEMBERS_CSS = `
.co-members{display:flex;flex-direction:column;gap:12px}
.co-input{font-size:14px;padding:9px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main);text-transform:none;font-weight:400}
.co-inactive td{color:var(--text-muted)}
.co-btn-sm{padding:6px 10px;font-size:12px}
.co-hint{font-size:13px}
.co-members .pf-field{min-width:0;max-width:100%}
.co-members select.co-input{max-width:100%;min-width:0;text-overflow:ellipsis}
.co-person-card .co-badge{margin-top:6px}
.co-role-name{font-weight:700;color:var(--text-main)}
.co-inactive .co-role-name,.co-inactive .co-person-name{color:var(--text-muted)}
.co-name-form{margin-top:6px;gap:6px}
.co-name-form .co-input{flex:1 1 160px;min-width:0}
.co-person-name{font-weight:700;color:var(--text-main)}
.co-person-mail{font-size:12px;overflow-wrap:anywhere}
.co-badge{display:inline-block;margin:4px 6px 0 0;padding:2px 8px;border-radius:999px;border:1px solid var(--card-border);font-size:11px;color:var(--text-muted)}
.co-temp{flex-direction:column;align-items:stretch;gap:8px}
.co-temp-title{font-weight:800}
.co-objects{flex:1 1 100%;min-width:0;border:1px solid var(--card-border);border-radius:10px;padding:8px 12px;margin:0}
.co-objects legend{font-size:12px;font-weight:700;color:var(--text-muted);padding:0 4px}
.co-objects-list{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:6px}
.co-check{display:flex;align-items:center;gap:8px;min-height:36px;font-size:14px;color:var(--text-main);cursor:pointer}
.co-check input{width:18px;height:18px;flex:none}
.co-temp-pw{font-size:18px;font-weight:700;letter-spacing:.06em;padding:6px 10px;border:1px dashed var(--card-border);border-radius:8px;user-select:all;overflow-wrap:anywhere}
`;
