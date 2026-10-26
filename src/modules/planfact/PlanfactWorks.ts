/**
 * «План/Факт» из базы: переключатель проекта, таблица работ, «Добавить работу» (по праву), журнал (по праву).
 * Права берутся с сервера (pf_my_permissions); скрытие кнопки — только UX, сервер проверяет сам.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { formatNumber } from './model.ts';
import type { AuditRow, DataApi, ProjectRow, WorkRow } from './data.service.ts';

const MONEY = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const WHEN = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

function actionText(r: AuditRow): string {
  const name = (r.new_data && r.new_data.name) || (r.old_data && r.old_data.name) || '';
  const verb = r.action === 'INSERT' ? 'Добавлена работа' : r.action === 'UPDATE' ? 'Изменена работа' : 'Удалена работа';
  return `${verb} «${String(name)}»`;
}

export function PlanfactWorks(props: { api: DataApi }): ReactElement {
  const { api } = props;
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [projectId, setProjectId] = useState('');
  const [perms, setPerms] = useState<string[]>([]);
  const [works, setWorks] = useState<WorkRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.listProjects().then((p) => { if (!alive) return; setProjects(p); if (p.length) setProjectId(p[0].id); });
    return () => { alive = false; };
  }, []);

  async function load(id: string, alive: () => boolean = () => true): Promise<void> {
    const pr = await api.permissions(id);
    const [w, a] = await Promise.all([api.listWorks(id), pr.includes('planfact.audit.view') ? api.listAudit(id) : Promise.resolve([])]);
    if (!alive()) return;
    setPerms(pr); setWorks(w); setAudit(a);
  }

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    setPerms([]); setWorks([]); setAudit([]); setAdding(false); setError('');
    void load(projectId, () => alive);
    return () => { alive = false; };
  }, [projectId]);

  async function submit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (busy) return;
    const form = ev.currentTarget as HTMLFormElement;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
    const unit = (form.elements.namedItem('unit') as HTMLInputElement).value.trim();
    const qtyRaw = (form.elements.namedItem('qty') as HTMLInputElement).value.trim().replace(',', '.');
    const qty = qtyRaw === '' ? null : Number(qtyRaw);
    if (!name) { setError('Введите наименование работы'); return; }
    if (qty !== null && !Number.isFinite(qty)) { setError('Объём должен быть числом'); return; }
    setBusy(true); setError('');
    const res = await api.addWork(projectId, name, unit, qty);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    form.reset(); setAdding(false);
    await load(projectId);
  }

  if (projects === null) return h('div', { className: 'pf-root pf-muted' }, 'Загрузка…');
  if (!projects.length) return h('div', { className: 'pf-root pf-muted', 'data-testid': 'pf-noprojects' }, 'Нет доступных проектов. Обратитесь к администратору компании.');

  const canEdit = perms.includes('planfact.works.edit');
  const canMoney = perms.includes('planfact.money.view');
  const canAudit = perms.includes('planfact.audit.view');

  return h('div', { className: 'pf-root' },
    h('div', { className: 'pf-head' },
      h('h2', { className: 'pf-title' }, 'План/Факт'),
      h('div', { className: 'pf-sub' },
        h('select', { className: 'pf-select', 'aria-label': 'Проект', value: projectId, onChange: (e) => setProjectId((e.target as HTMLSelectElement).value) },
          projects.map((p) => h('option', { key: p.id, value: p.id }, p.name)))),
      canEdit && !adding ? h('button', { type: 'button', className: 'pf-btn', 'data-testid': 'pf-add', onClick: () => setAdding(true) }, 'Добавить работу') : null
    ),
    adding ? h('form', { className: 'pf-card pf-addform', onSubmit: submit, 'data-testid': 'pf-addform' },
      h('label', { className: 'pf-field' }, 'Наименование', h('input', { name: 'name', type: 'text' })),
      h('label', { className: 'pf-field' }, 'Ед.', h('input', { name: 'unit', type: 'text' })),
      h('label', { className: 'pf-field' }, 'План (объём)', h('input', { name: 'qty', type: 'text', inputMode: 'decimal' })),
      error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null,
      h('button', { type: 'submit', className: 'pf-btn', disabled: busy }, busy ? 'Сохраняем…' : 'Сохранить'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: () => { setAdding(false); setError(''); } }, 'Отмена')
    ) : (error ? h('div', { className: 'pf-error', role: 'alert' }, error) : null),
    h('div', { className: 'pf-card' },
      h('table', { className: 'pf-table' },
        h('thead', null, h('tr', null,
          h('th', null, 'Наименование работ'), h('th', null, 'Ед.'), h('th', { className: 'pf-num' }, 'План'),
          canMoney ? h('th', { className: 'pf-num', 'data-testid': 'pf-money-col' }, 'Сумма план, ₽') : null)),
        h('tbody', null,
          works.length ? works.map((w) => h('tr', { key: w.id, 'data-work-id': w.id },
            h('td', null, w.name), h('td', { className: 'pf-unit' }, w.unit),
            h('td', { className: 'pf-num' }, w.plan_qty === null ? '—' : formatNumber(w.plan_qty)),
            canMoney ? h('td', { className: 'pf-num' }, w.plan_amount === null ? '—' : MONEY.format(w.plan_amount)) : null))
          : h('tr', null, h('td', { colSpan: canMoney ? 4 : 3, className: 'pf-muted' }, 'В проекте пока нет работ'))))),
    canAudit ? h('div', { className: 'pf-audit', 'data-testid': 'pf-audit' },
      h('h3', { className: 'pf-title' }, 'Журнал изменений'),
      h('div', { className: 'pf-card' }, h('table', { className: 'pf-table' },
        h('thead', null, h('tr', null, h('th', null, 'Когда'), h('th', null, 'Кто'), h('th', null, 'Что'))),
        h('tbody', null, audit.length ? audit.map((r, i) => h('tr', { key: i },
          h('td', { className: 'pf-unit' }, WHEN.format(new Date(r.at))), h('td', null, r.actor_email || 'система'), h('td', null, actionText(r))))
          : h('tr', null, h('td', { colSpan: 3, className: 'pf-muted' }, 'Записей пока нет'))))) ) : null
  );
}

export const PLANFACT_WORKS_CSS = `
.pf-head{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.pf-head .pf-select,.pf-head .pf-btn{min-height:38px;box-sizing:border-box}
.pf-select{font-size:13px;padding:8px 10px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main)}
.pf-addform{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:14px;margin-bottom:12px}
.pf-audit{margin-top:24px}
`;
