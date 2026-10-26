/**
 * «Компания → Журнал»: кто, что и когда менял в ролях и назначениях (pf_list_company_audit, только админ компании).
 * P2-0038: фильтры по дате, человеку и виду действия (по загруженным записям), «Показать ещё» (сервер отдаёт до 200 последних);
 * на телефоне строки — карточки (общая адаптивная таблица sui-table).
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

/** Вид записи для фильтра. */
export type AuditKind = 'roles' | 'assign' | 'counterparties' | 'other';
export const AUDIT_KINDS: { id: AuditKind; label: string }[] = [
  { id: 'roles', label: 'Роли' }, { id: 'assign', label: 'Назначения' }, { id: 'counterparties', label: 'Контрагенты' }, { id: 'other', label: 'Другое' }
];
export function auditKind(r: CompanyAuditRow): AuditKind {
  if (r.table_name === 'counterparties') return 'counterparties';
  if (r.action.startsWith('ROLE_')) return 'roles';
  if (r.action === 'ASSIGN' || r.action === 'REVOKE') return 'assign';
  return 'other';
}

export interface AuditFilter { from: string; to: string; who: string; kind: AuditKind | '' }
/** from/to — дни «ГГГГ-ММ-ДД» по местному времени (включительно); who — почта автора или «система». */
export function filterAudit(rows: CompanyAuditRow[], f: AuditFilter): CompanyAuditRow[] {
  const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : -Infinity;
  const to = f.to ? new Date(`${f.to}T23:59:59.999`).getTime() : Infinity;
  return rows.filter((r) => {
    const t = new Date(r.at).getTime();
    if (t < from || t > to) return false;
    if (f.who && (r.actor_email || 'система') !== f.who) return false;
    if (f.kind && auditKind(r) !== f.kind) return false;
    return true;
  });
}

/** Сколько записей просить у сервера: сначала 100, «Показать ещё» — до 200 (больше сервер не отдаёт). */
export const AUDIT_PAGE = 100;
export const AUDIT_MAX = 200;

export function CompanyAudit(props: { api: CompanyApi; companyId: string }): ReactElement {
  const { api, companyId } = props;
  const [rows, setRows] = useState<CompanyAuditRow[] | null>(null);
  const [limit, setLimit] = useState(AUDIT_PAGE);
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState<AuditFilter>({ from: '', to: '', who: '', kind: '' });
  useEffect(() => { setRows(null); setLimit(AUDIT_PAGE); void api.listAudit(companyId, AUDIT_PAGE).then(setRows); }, [companyId]);
  async function more(): Promise<void> {
    const next = Math.min(limit + AUDIT_PAGE, AUDIT_MAX);
    setLoading(true);
    const r = await api.listAudit(companyId, next);
    setLoading(false); setRows(r); setLimit(next);
  }
  if (rows === null) return h('div', { className: 'pf-muted' }, 'Загрузка…');
  const shown = filterAudit(rows, f);
  const people = Array.from(new Set(rows.map((r) => r.actor_email || 'система'))).sort();
  const set = (k: keyof AuditFilter) => (e: { target: unknown }) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  const filtered = !!(f.from || f.to || f.who || f.kind);
  const canMore = rows.length >= limit && limit < AUDIT_MAX;
  return h('div', { className: 'co-audit', 'data-testid': 'co-audit' },
    h('div', { className: 'sui-filters sui-panel', 'data-testid': 'co-audit-filters' },
      h('label', { className: 'pf-field' }, 'С даты', h('input', { type: 'date', className: 'co-input', value: f.from, 'data-testid': 'co-audit-from', onChange: set('from') })),
      h('label', { className: 'pf-field' }, 'По дату', h('input', { type: 'date', className: 'co-input', value: f.to, 'data-testid': 'co-audit-to', onChange: set('to') })),
      h('label', { className: 'pf-field' }, 'Кто',
        h('select', { className: 'co-input', value: f.who, 'data-testid': 'co-audit-who', onChange: set('who') },
          h('option', { value: '' }, 'Все'), people.map((p) => h('option', { key: p, value: p }, p)))),
      h('label', { className: 'pf-field' }, 'Действие',
        h('select', { className: 'co-input', value: f.kind, 'data-testid': 'co-audit-kind', onChange: set('kind') },
          h('option', { value: '' }, 'Все'), AUDIT_KINDS.map((k) => h('option', { key: k.id, value: k.id }, k.label)))),
      filtered ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'co-audit-reset', onClick: () => setF({ from: '', to: '', who: '', kind: '' }) }, 'Сбросить') : null),
    h('div', { className: 'co-card' },
      h('table', { className: 'sui-table' },
        h('thead', null, h('tr', null, h('th', null, 'Когда'), h('th', null, 'Кто'), h('th', null, 'Что'))),
        h('tbody', null, shown.length
          ? shown.map((r, i) => h('tr', { key: i, 'data-kind': auditKind(r) },
              h('td', { className: 'co-audit-when' }, WHEN.format(new Date(r.at))), h('td', { 'data-label': 'Кто' }, r.actor_email || 'система'), h('td', null, auditText(r))))
          : h('tr', null, h('td', { colSpan: 3, className: 'pf-muted' }, rows.length ? 'По фильтру ничего не найдено' : 'Изменений ролей пока не было'))))),
    h('div', { className: 'co-row co-audit-foot' },
      h('span', { className: 'sui-hint', 'data-testid': 'co-audit-count' },
        `Показано ${shown.length} из ${rows.length} последних` + (rows.length >= AUDIT_MAX ? ` (сервер хранит в выдаче до ${AUDIT_MAX})` : '') + (filtered ? ' — фильтр по загруженным записям' : '')),
      canMore ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost sui-more', disabled: loading, 'data-testid': 'co-audit-more', onClick: () => { void more(); } },
        loading ? 'Загрузка…' : 'Показать ещё') : null));
}

export const COMPANY_AUDIT_CSS = `
.co-audit{display:flex;flex-direction:column;gap:12px}
.co-audit-when{white-space:nowrap;font-variant-numeric:tabular-nums}
.co-audit-foot{align-items:center;justify-content:space-between}
@media (max-width:760px){.co-audit-when{font-size:11px;color:var(--text-muted)}}
`;
