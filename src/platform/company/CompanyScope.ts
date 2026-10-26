/**
 * Выбор компании для экранов «Проекты» / «Единицы»: список компаний с сервера (pf_my_company_access).
 * Кнопки правки показываются по флагам сервера; сами действия сервер проверяет заново.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { CompanyAccess, ProjectsApi } from '../core/projects.service.ts';

export function CompanyScope(props: { api: ProjectsApi; render: (c: CompanyAccess) => ReactElement }): ReactElement {
  const { api, render } = props;
  const [list, setList] = useState<CompanyAccess[] | null>(null);
  const [id, setId] = useState('');

  useEffect(() => {
    let alive = true;
    void api.myAccess().then((l) => { if (!alive) return; setList(l); setId(l.length ? l[0].company_id : ''); });
    return () => { alive = false; };
  }, []);

  if (list === null) return h('div', { className: 'pf-root pf-muted' }, 'Загрузка…');
  if (!list.length) return h('div', { className: 'pf-root pf-muted', 'data-testid': 'pj-noaccess' }, 'Нет доступа. Обратитесь к администратору компании.');
  const cur = list.find((c) => c.company_id === id) || list[0];
  return h('div', { className: 'pf-root pj-root' },
    list.length > 1
      ? h('select', { className: 'pj-input pj-company', 'aria-label': 'Компания', value: cur.company_id, onChange: (e) => setId((e.target as HTMLSelectElement).value) },
          list.map((c) => h('option', { key: c.company_id, value: c.company_id }, c.company_name)))
      : null,
    h('div', { key: cur.company_id }, render(cur)));
}

export const SCOPE_CSS = `
.pj-root{max-width:1100px;display:flex;flex-direction:column;gap:12px}
.pj-input{font-size:16px;padding:10px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main);min-width:0;max-width:100%}
.pj-company{align-self:flex-start}
`;
