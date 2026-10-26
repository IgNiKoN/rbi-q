/**
 * Вкладка «Единицы»: общий справочник (только чтение) + свои единицы компании (добавить / удалить).
 * Без права planfact.units.manage (can_manage_units) — только чтение. Общую единицу удалить нельзя (сервер тоже не даст).
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { CompanyAccess, ProjectsApi, UnitItem } from '../core/projects.service.ts';

export function UnitsTab(props: { api: ProjectsApi; company: CompanyAccess }): ReactElement {
  const { api, company } = props;
  const [rows, setRows] = useState<UnitItem[] | null>(null);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> { setRows(await api.listUnits(company.company_id)); }
  useEffect(() => { void load(); }, []);

  async function add(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const form = ev.currentTarget as HTMLFormElement;
    const code = (form.elements.namedItem('code') as HTMLInputElement).value.trim();
    const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
    if (!code || !name) { setError('Введите обозначение и название единицы'); return; }
    setBusy(true); setError(''); setNotice('');
    const res = await api.addUnit(company.company_id, code, name);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    form.reset(); setNotice('Единица добавлена'); await load();
  }

  async function remove(u: UnitItem): Promise<void> {
    if (busy) return;
    setConfirm(''); setBusy(true); setError(''); setNotice('');
    const res = await api.deleteUnit(u.id);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setNotice('Единица удалена'); await load();
  }

  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  const common = rows.filter((u) => u.is_common);
  const own = rows.filter((u) => !u.is_common);

  function item(u: UnitItem): ReactElement {
    return h('div', { key: u.id, className: 'un-row', 'data-unit-id': u.id },
      h('span', { className: 'un-code' }, u.code), h('span', { className: 'un-name' }, u.name),
      !u.is_common && company.can_manage_units
        ? (confirm === u.id
            ? h('span', { className: 'un-actions' },
                h('button', { type: 'button', className: 'pf-btn un-danger', 'data-testid': 'un-delete-yes', disabled: busy, onClick: () => { void remove(u); } }, 'Да, удалить'),
                h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setConfirm('') }, 'Нет'))
            : h('span', { className: 'un-actions' },
                h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'un-delete', disabled: busy, onClick: () => setConfirm(u.id) }, 'Удалить')))
        : null);
  }

  return h('div', { className: 'pj-tab', 'data-testid': 'un-units' },
    company.can_manage_units
      ? h('form', { className: 'pf-card pj-form', onSubmit: add, 'data-testid': 'un-add' },
          h('label', { className: 'pf-field' }, 'Обозначение', h('input', { name: 'code', type: 'text', className: 'pj-input un-code-input', maxLength: 20, placeholder: 'м² пола' })),
          h('label', { className: 'pf-field pj-grow' }, 'Название', h('input', { name: 'name', type: 'text', className: 'pj-input', maxLength: 100, placeholder: 'Площадь пола' })),
          h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Добавить единицу'))
      : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null,
    h('h3', { className: 'pf-title un-title' }, 'Свои единицы компании'),
    h('div', { className: 'pf-card pj-list', 'data-testid': 'un-own' },
      own.length ? own.map(item) : h('div', { className: 'pj-empty pf-muted', 'data-testid': 'un-own-empty' }, 'Своих единиц пока нет.')),
    h('h3', { className: 'pf-title un-title' }, 'Общие единицы (для всех компаний)'),
    h('div', { className: 'pf-card pj-list', 'data-testid': 'un-common' }, common.map(item)));
}

export const UNITS_CSS = `
.un-title{font-size:12px;margin-top:6px}
.un-row{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--card-border)}
.un-row:last-child{border-bottom:0}
.un-code{flex:0 0 96px;font-weight:700;font-variant-numeric:tabular-nums}
.un-name{flex:1 1 160px;min-width:0;overflow-wrap:anywhere;color:var(--text-main)}
.un-actions{display:flex;gap:8px;margin-left:auto}
.un-danger{background:var(--color-red);border-color:var(--color-red)}
.un-code-input{width:140px}
@media (max-width:600px){.un-code{flex-basis:80px}.un-actions{width:100%;margin-left:0}.un-code-input{width:100%}}
`;
