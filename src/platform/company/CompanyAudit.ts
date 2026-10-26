/**
 * «Компания → Журнал»: кто, что и когда менял в ролях и назначениях (pf_list_company_audit, только админ компании).
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { CompanyApi, CompanyAuditRow } from './company.service.ts';

const WHEN = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function auditText(r: CompanyAuditRow): string {
  const o = r.old_data || {}, n = r.new_data || {};
  if (r.table_name === 'counterparties') {
    if (r.action === 'INSERT') return `Добавлен контрагент «${str(n.name)}», ИНН ${str(n.inn)}`;
    if (o.archived !== n.archived) return `Контрагент «${str(n.name)}» ${n.archived ? 'перенесён в архив' : 'возвращён из архива'}`;
    return `Изменён контрагент «${str(n.name)}»`;
  }
  const actions = (d: Record<string, unknown>) => (Array.isArray(d.actions) ? (d.actions as string[]) : []);
  switch (r.action) {
    case 'ROLE_CREATE': return `Создана роль «${str(n.name)}»`;
    case 'ROLE_RENAME': return `Роль «${str(o.name)}» переименована в «${str(n.name)}»`;
    case 'ROLE_DELETE': return `Удалена роль «${str(o.name)}»`;
    case 'ROLE_ACTIONS': {
      const was = new Set(actions(o)), now = new Set(actions(n));
      const added = [...now].filter((a) => !was.has(a)), removed = [...was].filter((a) => !now.has(a));
      const parts = [added.length ? `добавлено: ${added.join(', ')}` : '', removed.length ? `убрано: ${removed.join(', ')}` : ''].filter(Boolean);
      return `Изменены действия роли «${str(n.name)}»` + (parts.length ? ` (${parts.join('; ')})` : '');
    }
    case 'ASSIGN': return `Назначена роль «${str(n.role_name)}» → ${r.subject_email || 'сотрудник'}` + (n.project_id ? ' (проект)' : ' (все проекты)') + (n.valid_to ? `, до ${WHEN.format(new Date(str(n.valid_to)))}` : '');
    case 'REVOKE': return `Отозвана роль «${str(o.role_name)}» у ${r.subject_email || 'сотрудника'}`;
    default: return r.action;
  }
}

export function CompanyAudit(props: { api: CompanyApi; companyId: string }): ReactElement {
  const { api, companyId } = props;
  const [rows, setRows] = useState<CompanyAuditRow[] | null>(null);
  useEffect(() => { setRows(null); void api.listAudit(companyId).then(setRows); }, [companyId]);
  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  return h('div', { className: 'co-card', 'data-testid': 'co-audit' },
    h('table', { className: 'co-table' },
      h('thead', null, h('tr', null, h('th', null, 'Когда'), h('th', null, 'Кто'), h('th', null, 'Что'))),
      h('tbody', null, rows.length
        ? rows.map((r, i) => h('tr', { key: i },
            h('td', { className: 'co-nowrap' }, WHEN.format(new Date(r.at))), h('td', null, r.actor_email || 'система'), h('td', null, auditText(r))))
        : h('tr', null, h('td', { colSpan: 3, className: 'pf-muted' }, 'Изменений ролей пока не было')))));
}
