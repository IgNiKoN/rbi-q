/**
 * «Справочники → Бригады» (P2-0007): добавить, изменить, отправить в архив и вернуть. Бригады — справочник компании;
 * прораб выбирает действующую при вводе факта. Без права planfact.brigades.manage список только для чтения
 * (сервер проверяет каждое действие).
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { CompanyAccess } from '../../../platform/core/projects.service.ts';
import type { Brigade, FactApi } from './fact.service.ts';

export function BrigadesTab(props: { api: FactApi; company: CompanyAccess }): ReactElement {
  const { api, company } = props;
  const [rows, setRows] = useState<Brigade[] | null>(null);
  const [archived, setArchived] = useState(false);
  const [editId, setEditId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(withArchived = archived): Promise<void> { setRows(await api.listBrigades(company.company_id, withArchived)); }
  useEffect(() => { void load(); }, []);

  const canManage = !!rows && rows.some((b) => b.can_manage);

  async function save(ev: FormEvent, id: string | null): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const f = ev.currentTarget as HTMLFormElement;
    const val = (k: string): string => (f.elements.namedItem(k) as HTMLInputElement).value.trim();
    if (!val('name')) { setError('Введите название бригады'); return; }
    setBusy(true); setError(''); setNotice('');
    const r = await api.saveBrigade(company.company_id, id, val('name'), val('leader'), val('phone'));
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    if (!id) f.reset();
    setEditId(''); setNotice(id ? 'Бригада изменена' : 'Бригада добавлена'); await load();
  }
  async function archive(b: Brigade, value: boolean): Promise<void> {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    const r = await api.archiveBrigade(b.id, value);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setNotice(value ? 'Бригада в архиве' : 'Бригада возвращена'); await load();
  }
  async function toggleArchive(): Promise<void> { const v = !archived; setArchived(v); await load(v); }

  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  const field = (label: string, name: string, def: string, cls = ''): ReactElement =>
    h('label', { className: 'pf-field ' + cls }, label, h('input', { name, type: 'text', className: 'pj-input', maxLength: name === 'name' ? 120 : 120, defaultValue: def }));

  return h('div', { className: 'pj-tab br-tab', 'data-testid': 'br-tab' },
    // Форма «Добавить» видна всем, у кого есть право; при пустом списке право неизвестно — показываем, сервер проверит.
    (canManage || rows.length === 0)
      ? h('form', { className: 'pf-card pj-form', onSubmit: (e: FormEvent) => { void save(e, null); }, 'data-testid': 'br-add' },
          field('Название бригады', 'name', '', 'pj-grow'), field('Бригадир', 'leader', '', 'pj-grow'), field('Телефон', 'phone', '', 'pj-grow'),
          h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, 'Добавить бригаду'))
      : null,
    error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
    notice ? h('div', { className: 'pj-notice', role: 'status' }, notice) : null,
    h('label', { className: 'pr-check' }, h('input', { type: 'checkbox', checked: archived, 'data-testid': 'br-archived', onChange: () => { void toggleArchive(); } }), 'Показать архивные'),
    h('div', { className: 'pf-card pj-list', 'data-testid': 'br-list' },
      rows.length ? rows.map((b) => editId === b.id
        ? h('form', { key: b.id, className: 'pj-form br-row', onSubmit: (e: FormEvent) => { void save(e, b.id); }, 'data-brigade-id': b.id },
            field('Название', 'name', b.name, 'pj-grow'), field('Бригадир', 'leader', b.leader_name || '', 'pj-grow'), field('Телефон', 'phone', b.phone || '', 'pj-grow'),
            h('span', { className: 'pj-actions' },
              h('button', { type: 'submit', className: 'pf-btn', disabled: busy, 'data-testid': 'br-save' }, 'Сохранить'),
              h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => setEditId('') }, 'Отмена')))
        : h('div', { key: b.id, className: 'pj-row' + (b.archived_at ? ' pj-row--archived' : ''), 'data-brigade-id': b.id },
            h('div', { className: 'pj-name' }, h('b', null, b.name),
              b.archived_at ? h('span', { className: 'pj-badge' }, 'в архиве') : null,
              b.leader_name ? h('span', { className: 'pf-muted' }, b.leader_name) : null,
              b.phone ? h('span', { className: 'pf-muted' }, b.phone) : null),
            b.can_manage
              ? h('span', { className: 'pj-actions' },
                  h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'br-edit', onClick: () => setEditId(b.id) }, 'Изменить'),
                  h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'br-archive', disabled: busy, onClick: () => { void archive(b, !b.archived_at); } }, b.archived_at ? 'Вернуть' : 'В архив'))
              : null))
      : h('div', { className: 'pj-empty pf-muted', 'data-testid': 'br-empty' }, 'Бригад пока нет.')));
}
