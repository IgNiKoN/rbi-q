/**
 * «Компания → Роли»: список ролей (шаблоны — только копия), копирование, переименование, галочки действий по группам, удаление.
 * Все изменения — через сервер (pf_*); при отказе показывается текст сервера.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { groupCatalog } from './action-groups.ts';
import type { CatalogRow, CompanyApi, RoleRow } from './company.service.ts';

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

  async function load(selectId?: string): Promise<void> {
    const [r, c] = await Promise.all([api.listRoles(companyId), catalog.length ? Promise.resolve(catalog) : api.catalog()]);
    setRoles(r); setCatalog(c);
    const keep = selectId || selected;
    const pick = r.find((x) => x.id === keep) || r[0];
    if (pick) { setSelected(pick.id); setDraft(new Set(pick.actions)); }
  }

  useEffect(() => { setRoles(null); setSelected(''); void load(); }, [companyId]);

  const role = roles ? roles.find((r) => r.id === selected) || null : null;
  const isTemplate = !!(role && role.template_code);

  function choose(r: RoleRow): void {
    setSelected(r.id); setDraft(new Set(r.actions)); setError(''); setNotice(''); setConfirmDelete(false);
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
  const changed = role ? !sameSet(role.actions, draft) : false;

  return h('div', { className: 'co-split', 'data-testid': 'co-roles' },
    h('div', { className: 'co-list pf-card' },
      roles.map((r) => h('button', {
        key: r.id, type: 'button', 'data-role-id': r.id, onClick: () => choose(r),
        className: 'co-list-item' + (r.id === selected ? ' co-list-item--active' : '')
      },
      h('span', { className: 'co-list-name' }, r.name),
      h('span', { className: 'co-list-meta' },
        r.template_code ? h('span', { className: 'co-badge' }, 'шаблон') : null,
        r.active_assignments ? `назначена: ${r.active_assignments}` : null)))),
    role ? h('div', { className: 'co-panel pf-card', 'data-testid': 'co-role-panel' },
      isTemplate
        ? h('div', null,
            h('h3', { className: 'pf-title' }, role.name),
            h('div', { className: 'co-hint', 'data-testid': 'co-template-note' }, 'Шаблон, только копия: изменить или удалить нельзя — скопируйте и настройте копию.'))
        : h('form', { className: 'co-row', onSubmit: rename, key: 'rn-' + role.id },
            h('label', { className: 'pf-field co-grow' }, 'Название роли', h('input', { name: 'roleName', type: 'text', defaultValue: role.name, maxLength: 100 })),
            h('button', { type: 'submit', className: 'pf-btn pf-btn--ghost', disabled: busy }, 'Переименовать')),
      h('form', { className: 'co-row', onSubmit: copy, 'data-testid': 'co-copy' },
        h('label', { className: 'pf-field co-grow' }, 'Копировать в новую роль', h('input', { name: 'copyName', type: 'text', placeholder: 'Например, Старший прораб', maxLength: 100 })),
        h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Копировать')),
      error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
      notice ? h('div', { className: 'co-notice', role: 'status' }, notice) : null,
      h('div', { className: 'co-groups' },
        groups.map((g) => h('fieldset', { key: g.title, className: 'co-group' },
          h('legend', null, g.title),
          g.items.map((it) => h('label', { key: it.action, className: 'co-check' },
            h('input', { type: 'checkbox', 'data-action': it.action, checked: draft.has(it.action), disabled: isTemplate || busy, onChange: () => toggle(it.action) }),
            h('span', null, it.description)))))),
      isTemplate ? null : h('div', { className: 'co-row' },
        h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'co-save-actions', disabled: busy || !changed,
          onClick: () => { void run(() => api.setRoleActions(role.id, Array.from(draft)), 'Действия роли сохранены — права действуют со следующего запроса'); } }, 'Сохранить действия'),
        changed ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setDraft(new Set(role.actions)) }, 'Отменить изменения') : null,
        h('span', { className: 'co-grow' }),
        confirmDelete
          ? h('span', { className: 'co-row' }, h('span', { className: 'co-hint' }, 'Удалить роль?'),
              h('button', { type: 'button', className: 'pf-btn co-danger', 'data-testid': 'co-delete-yes',
                onClick: () => { setConfirmDelete(false); void run(() => api.deleteRole(role.id), `Роль «${role.name}» удалена`, ''); } }, 'Да, удалить'),
              h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setConfirmDelete(false) }, 'Нет'))
          : h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'co-delete', disabled: busy,
              title: role.active_assignments ? 'Сначала отзовите назначения в «Сотрудниках»' : '', onClick: () => setConfirmDelete(true) }, 'Удалить роль'))
    ) : h('div', { className: 'pf-muted' }, 'Ролей нет')
  );
}
