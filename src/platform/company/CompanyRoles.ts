/**
 * «Компания → Роли»: список ролей (шаблоны — только копия), копирование, переименование, галочки действий по группам, удаление.
 * Все изменения — через сервер (pf_*); при отказе показывается текст сервера.
 * P2-0048 этап 4 (вариант В): строка роли «что может · у N чел.»; телефон — список → роль («‹ Роли»), от 680 px контейнера — рядом;
 * группы прав раскрываются, со счётчиком «2 из 3»; «Сохранить» / «Отменить» закреплены внизу панели.
 */
import { createElement as h, useEffect, useState } from 'react';
import { ConfirmDialog } from '../ui/settings.ts';
import type { FormEvent, ReactElement } from 'react';
import { abilities, actionLabel, groupCatalog } from './action-groups.ts';
import type { CatalogRow, CompanyApi, MemberRow, RoleRow } from './company.service.ts';

/** Что может роль — группы, где отмечено хоть одно действие («Работы и план, Факт»); в нескольких модулях — модули. */
export function roleAbilities(actions: string[], catalog: CatalogRow[]): string {
  const groups = abilities(actions, catalog);
  return groups.length ? groups.join(', ') : actions.length ? 'особые права' : 'ничего не может';
}
/** Сколько разных людей с действующим назначением роли (по строкам сотрудников). */
export function peopleByRole(rows: MemberRow[]): Map<string, number> {
  const sets = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.role_id || !r.is_active || r.disabled_at) continue;
    const s = sets.get(r.role_id) || new Set<string>();
    s.add(r.user_id); sets.set(r.role_id, s);
  }
  return new Map(Array.from(sets, ([k, v]) => [k, v.size]));
}

const sameSet = (a: string[], b: Set<string>) => a.length === b.size && a.every((x) => b.has(x));

export function CompanyRoles(props: { api: CompanyApi; companyId: string }): ReactElement {
  const { api, companyId } = props;
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detail, setDetail] = useState(false);   // телефон: открыта роль (иначе — список)
  const [byRole, setByRole] = useState<Map<string, number> | null>(null);

  async function load(selectId?: string): Promise<void> {
    const [r, c, m] = await Promise.all([api.listRoles(companyId), catalog.length ? Promise.resolve(catalog) : api.catalog(),
      api.listMembers(companyId).catch(() => null)]);
    setRoles(r); setCatalog(c); setByRole(m ? peopleByRole(m) : null);
    const keep = selectId || selected;
    const pick = r.find((x) => x.id === keep) || r[0];
    if (pick) { setSelected(pick.id); setDraft(new Set(pick.actions)); }
  }

  useEffect(() => { setRoles(null); setSelected(''); void load(); }, [companyId]);

  const role = roles ? roles.find((r) => r.id === selected) || null : null;
  const isTemplate = !!(role && role.template_code);

  function choose(r: RoleRow): void {
    setSelected(r.id); setDraft(new Set(r.actions)); setError(''); setNotice(''); setConfirmDelete(false); setDetail(true);
  }

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, done: string, selectId?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setError(res.message || 'Не удалось выполнить'); return false; }
    setNotice(done);
    await load(selectId);
    return true;
  }

  async function copy(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (!role) return;
    const form = ev.currentTarget as HTMLFormElement;
    const name = (form.elements.namedItem('copyName') as HTMLInputElement).value.trim();
    if (!name) { setError('Введите название новой роли'); return; }
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    const res = await api.createRole(role.id, name);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    form.reset();
    setNotice(`Роль «${name}» создана — отметьте нужные действия`);
    await load(res.value);
  }

  async function rename(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (!role) return;
    const name = ((ev.currentTarget as HTMLFormElement).elements.namedItem('roleName') as HTMLInputElement).value.trim();
    if (!name) { setError('Введите название роли'); return; }
    await run(() => api.renameRole(role.id, name), 'Название сохранено');
  }

  function toggle(action: string): void {
    const next = new Set(draft);
    if (next.has(action)) next.delete(action); else next.add(action);
    setDraft(next); setNotice('');
  }

  if (roles === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');

  const groups = groupCatalog(catalog);
  const manyModules = new Set(groups.map((g) => g.moduleName).filter(Boolean)).size > 1;
  const changed = role ? !sameSet(role.actions, draft) : false;

  const who = (r: RoleRow): string => {
    const n = byRole ? byRole.get(r.id) || 0 : r.active_assignments;
    return n ? (byRole ? `у ${n} чел.` : `назначена: ${n}`) : 'не назначена';
  };

  return h('div', { className: 'cr-wrap' }, h('div', { className: 'co-split cr', 'data-testid': 'co-roles', 'data-detail': detail ? '1' : '0' },
    h('div', { className: 'co-list cr-list' },
      roles.map((r) => h('button', {
        key: r.id, type: 'button', 'data-role-id': r.id, onClick: () => choose(r),
        className: 'co-list-item' + (r.id === selected ? ' co-list-item--active' : '')
      },
      h('span', { className: 'co-list-name' }, r.name, r.template_code ? h('span', { className: 'sui-badge' }, 'шаблон') : null),
      h('span', { className: 'co-list-meta', 'data-testid': 'co-role-meta' }, `${roleAbilities(r.actions, catalog)} · ${who(r)}`),
      h('span', { className: 'cr-chev', 'aria-hidden': 'true' }, '›')))),
    role ? h('div', { className: 'co-panel pf-card cr-panel', 'data-testid': 'co-role-panel' },
      h('button', { type: 'button', className: 'cm-back', 'data-testid': 'co-roles-back', onClick: () => setDetail(false) }, '‹ Роли'),
      isTemplate
        ? h('div', null,
            h('h3', { className: 'pf-title' }, role.name, ' ', h('span', { className: 'sui-badge' }, 'шаблон')),
            h('div', { className: 'sui-hint', 'data-testid': 'co-template-note' }, 'Шаблон, только копия: изменить или удалить нельзя — скопируйте и настройте копию.'))
        : h('form', { className: 'co-row', onSubmit: rename, key: 'rn-' + role.id },
            h('label', { className: 'pf-field co-grow' }, 'Название роли', h('input', { name: 'roleName', type: 'text', className: 'co-input', defaultValue: role.name, maxLength: 100 })),
            h('button', { type: 'submit', className: 'pf-btn pf-btn--ghost', disabled: busy }, 'Переименовать')),
      h('div', { className: 'sui-hint', 'data-testid': 'co-role-sum' }, `Может: ${roleAbilities(Array.from(draft), catalog)}. ${who(role)[0].toUpperCase() + who(role).slice(1)}`.replace(/([^.])$/, '$1.')),
      h('form', { className: 'co-row', onSubmit: copy, 'data-testid': 'co-copy' },
        h('label', { className: 'pf-field co-grow' }, 'Копировать в новую роль', h('input', { name: 'copyName', type: 'text', className: 'co-input', placeholder: 'Например, Старший прораб', maxLength: 100 })),
        h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Копировать')),
      error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
      notice ? h('div', { className: 'co-notice', role: 'status' }, notice) : null,
      h('div', { className: 'co-groups cr-groups' },
        groups.flatMap((g, i) => {
          const on = g.items.filter((it) => draft.has(it.action)).length;
          // P2-0070: группы — из каталога; несколько модулей — заголовок модуля перед его группами
          const head = manyModules && g.moduleName && g.moduleName !== groups[i - 1]?.moduleName
            ? [h('div', { key: 'm-' + g.key, className: 'cr-module', 'data-testid': 'co-module-head' }, g.moduleName)] : [];
          return [...head, h('details', { key: role.id + g.key, className: 'co-group cr-group', open: on > 0 || undefined, 'data-group': g.title },
            h('summary', null, h('b', null, g.title), h('span', { className: 'cr-count', 'data-testid': 'co-group-count' }, `${on} из ${g.items.length}`)),
            h('div', { className: 'cr-items' }, g.items.map((it) => h('label', { key: it.action, className: 'co-check', title: it.description },
              h('input', { type: 'checkbox', 'data-action': it.action, checked: draft.has(it.action), disabled: isTemplate || busy, onChange: () => toggle(it.action) }),
              h('span', null, actionLabel(it))))))];
        })),
      isTemplate ? null : h('div', { className: 'co-row cr-bar' },
        h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'co-save-actions', disabled: busy || !changed,
          onClick: () => { void run(() => api.setRoleActions(role.id, Array.from(draft)), 'Действия роли сохранены — права действуют со следующего запроса'); } }, 'Сохранить действия'),
        changed ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'co-cancel-actions', onClick: () => setDraft(new Set(role.actions)) }, 'Отменить изменения') : null,
        h('span', { className: 'co-grow' }),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost cm-danger-t', 'data-testid': 'co-delete', disabled: busy,
          title: role.active_assignments ? 'Сначала отзовите назначения в «Сотрудниках»' : '', onClick: () => setConfirmDelete(true) }, 'Удалить роль'),
        // P2-0038: подтверждение — общий диалог «Настроек»
        confirmDelete ? h(ConfirmDialog, { title: 'Удалить роль?', text: `Роль «${role.name}» будет удалена. Назначенную роль сервер удалить не даст.`,
          yes: 'Да, удалить', yesTestId: 'co-delete-yes', danger: true, busy, onNo: () => setConfirmDelete(false),
          onYes: () => { setConfirmDelete(false); void run(() => api.deleteRole(role.id), `Роль «${role.name}» удалена`, ''); } }) : null)
    ) : h('div', { className: 'pf-muted' }, 'Ролей нет')
  ));
}

export const COMPANY_ROLES_CSS = `
.cr-wrap{container-type:inline-size;container-name:cr;min-width:0}
.cr{display:flex;flex-direction:column;gap:12px}
.cr .co-list-name{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-weight:600;font-size:14.5px}
.cr .co-list-item{position:relative;min-height:56px;padding:10px 32px 10px 12px;justify-content:center}
.cr .co-list-meta{font-size:12.5px;display:block;overflow-wrap:anywhere}
.cr-chev{position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:20px}
.cr-list{max-height:none}
.cr .co-input{width:100%}
.cr-group{padding:0}
.cr-module{margin:8px 0 -4px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)}
.cr-group summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:48px;padding:0 12px;cursor:pointer;font-size:14px}
.cr-count{font-size:12.5px;color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.cr-items{padding:0 12px 8px}
.cr-items .co-check{min-height:44px;align-items:center;font-size:14px}
.cr-items .co-check input{width:20px;height:20px;flex:none;margin:0}
.cr-groups{grid-template-columns:1fr}
.cr-bar{position:sticky;bottom:0;z-index:3;background:var(--card-bg);padding:10px 0 calc(6px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--card-border);align-items:center}
.cr-bar .pf-btn{min-height:44px}
.cr-bar .co-grow{flex:1 1 0;min-width:0}
.cr[data-detail="1"] .cr-list{display:none}
.cr[data-detail="0"] .cr-panel{display:none}
@container cr (min-width: 680px){
  .cr{display:grid;grid-template-columns:minmax(240px,320px) minmax(0,1fr);gap:16px;align-items:start}
  .cr[data-detail="1"] .cr-list{display:flex}
  .cr[data-detail="0"] .cr-panel{display:flex}
  .cr .cm-back{display:none}
}
@container cr (min-width: 1000px){ .cr-groups{grid-template-columns:repeat(2,minmax(0,1fr))} }
`;
