/**
 * Раздел платформы «Компания» (администратор компании): вход — общая форма платформы, вкладки «Роли» / «Сотрудники» / «Журнал».
 * Доступ решает сервер (pf_my_admin_companies → security.roles.assign); без права — понятное сообщение.
 * P2-0011: открытая вкладка — только адрес оболочки #/settings/company/<roles|members|counterparties|audit> (назад/вперёд, F5, ссылка).
 * P2-0015: вкладка «Контрагенты» — справочник ядра (сервис src/platform/core).
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { AuthApi } from '../auth/auth.service.ts';
import { openPlatformLogin, platformSignOut } from '../auth/shell-user.ts';
import { CompanyRoles } from './CompanyRoles.ts';
import { CompanyMembers, COMPANY_MEMBERS_CSS } from './CompanyMembers.ts';
import { CompanyAudit } from './CompanyAudit.ts';
import type { CompanyApi, CompanyRef } from './company.service.ts';
import { CounterpartiesTab, COUNTERPARTIES_CSS } from './CounterpartiesTab.ts';
import type { CoreApi } from '../core/core.service.ts';

type Mode = 'loading' | 'login' | 'noaccess' | 'ready';
type Tab = 'roles' | 'members' | 'counterparties' | 'audit';

const BASE = '#/settings/company';
/** Событие раздела: адрес #/settings/company… показан снова (index.ts — при повторном монтировании в тот же контейнер). */
export const COMPANY_ROUTE_EVENT = 'company:route';
/** #/settings/company[/roles|/members|/counterparties|/audit] → вкладка; без вкладки и неизвестная — «Роли». */
export function tabFromHash(hash: string): Tab {
  const t = String(hash || '').replace(/^#\/settings\/company\/?/, '').split('/')[0];
  return t === 'members' || t === 'counterparties' || t === 'audit' ? t : 'roles';
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'roles', label: 'Роли' },
  { id: 'members', label: 'Сотрудники' },
  { id: 'counterparties', label: 'Контрагенты' },
  { id: 'audit', label: 'Журнал' }
];

export function CompanyApp(props: { auth: AuthApi | null; api: CompanyApi | null; core?: CoreApi | null }): ReactElement {
  const { auth, api, core } = props;
  const [mode, setMode] = useState<Mode>('loading');
  const [who, setWho] = useState('');
  const [companies, setCompanies] = useState<CompanyRef[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [tab, setTab] = useState<Tab>(tabFromHash(window.location.hash));

  useEffect(() => {
    const onRoute = (): void => setTab(tabFromHash(window.location.hash));
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);
    window.addEventListener(COMPANY_ROUTE_EVENT, onRoute);
    return () => { window.removeEventListener('hashchange', onRoute); window.removeEventListener('popstate', onRoute); window.removeEventListener(COMPANY_ROUTE_EVENT, onRoute); };
  }, []);
  const go = (t: Tab): void => {
    const r = (window as unknown as { AppRouter?: { navigate?: (p: string) => void } }).AppRouter;
    if (r && typeof r.navigate === 'function') r.navigate(`${BASE}/${t}`); else { window.history.pushState(null, '', `${BASE}/${t}`); setTab(t); }
  };

  async function enter(): Promise<void> {
    if (!auth || !api) return;
    const mail = await auth.getEmail();
    if (!mail) { setMode('login'); return; }
    setWho(mail);
    const list = await api.myAdminCompanies();
    setCompanies(list);
    setCompanyId(list.length ? list[0].company_id : '');
    setMode(list.length ? 'ready' : 'noaccess');
  }

  // Вход и выход — на общем экране «Вход» платформы (P2-0013); раздел перечитывает, кто вошёл.
  useEffect(() => {
    if (auth && auth.onAuthChange) return auth.onAuthChange(() => { void enter(); });
    void enter();
    return undefined;
  }, []);

  async function logout(): Promise<void> {
    await platformSignOut(auth ? () => auth.signOut() : null);
    setWho(''); setCompanies([]); setCompanyId(''); setMode('login');
  }

  if (!auth || !api) {
    return h('div', { className: 'pf-root pf-muted', 'data-testid': 'co-offline' }, 'Раздел «Компания» работает только с сервером — вход не настроен.');
  }
  if (mode === 'loading') return h('div', { className: 'pf-root pf-muted' }, 'Загрузка…');
  if (mode === 'login') {
    return h('div', { className: 'pf-root pf-hint', 'data-testid': 'co-login' }, h('div', { className: 'pf-muted' }, 'Войдите, чтобы управлять компанией.'),
      h('button', { type: 'button', className: 'pf-btn', onClick: openPlatformLogin }, 'Войти'));
  }

  const bar = h('div', { className: 'pf-bar', 'data-testid': 'co-user' },
    h('span', null, h('b', null, who),
      companies.length > 1
        ? h('select', { className: 'co-select', 'aria-label': 'Компания', value: companyId, onChange: (e) => setCompanyId((e.target as HTMLSelectElement).value) },
            companies.map((c) => h('option', { key: c.company_id, value: c.company_id }, c.company_name)))
        : companies.length ? ' · ' + companies[0].company_name : null),
    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: logout }, 'Выйти'));

  if (mode === 'noaccess') {
    return h('div', null, bar,
      h('div', { className: 'pf-root pf-muted', 'data-testid': 'co-noaccess' }, 'Нет права управлять ролями. Раздел доступен администратору компании.'));
  }

  return h('div', null, bar,
    h('div', { className: 'pf-root co-root' },
      h('div', { className: 'co-head' },
        h('div', { className: 'co-tabs', role: 'tablist', 'data-testid': 'co-tabs' },
          TABS.map((t) => h('button', { key: t.id, type: 'button', role: 'tab', 'aria-selected': tab === t.id, 'data-tab': t.id,
            className: 'co-tab' + (tab === t.id ? ' co-tab--active' : ''), onClick: () => go(t.id) }, t.label)))),
      tab === 'roles' ? h(CompanyRoles, { api, companyId, key: companyId }) : null,
      tab === 'members' ? h(CompanyMembers, { api, companyId, me: who, key: companyId }) : null,
      tab === 'counterparties' && core ? h(CounterpartiesTab, { core, companyId, key: companyId }) : null,
      tab === 'audit' ? h(CompanyAudit, { api, companyId, key: companyId }) : null));
}

export const COMPANY_CSS = COMPANY_MEMBERS_CSS + COUNTERPARTIES_CSS + `
.co-root{max-width:1200px}
.co-head{margin-bottom:16px}
.co-tabs{display:flex;flex-wrap:nowrap;gap:var(--rbi-subtab-gap,6px);padding:4px;border:1px solid var(--card-border);border-radius:12px;background:var(--card-bg);overflow-x:auto;-webkit-overflow-scrolling:touch}
.co-tab{flex:1 1 0;min-width:max-content;min-height:40px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;padding:8px 12px;border-radius:8px;border:0;background:transparent;color:var(--text-muted);cursor:pointer;white-space:nowrap;text-align:center}
.co-tab--active{background:var(--accent,var(--primary));color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.co-select{margin-left:8px;font-size:12px;padding:6px 8px;border:1px solid var(--card-border);border-radius:8px;background:var(--card-bg);color:var(--text-main)}
.co-split{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:16px;align-items:start}
@media (max-width:760px){.co-split{grid-template-columns:1fr}}
.co-card,.co-list,.co-panel{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow-card)}
.co-list{display:flex;flex-direction:column;padding:6px;max-height:70vh;overflow-y:auto}
.co-list-item{display:flex;flex-direction:column;gap:2px;text-align:left;padding:9px 10px;border:0;border-radius:10px;background:transparent;color:var(--text-main);cursor:pointer;font-size:13px}
.co-list-item:hover{background:var(--hover-bg)}
.co-list-item--active{background:var(--hover-bg);box-shadow:inset 3px 0 0 var(--primary)}
.co-list-meta{display:flex;gap:6px;align-items:center;font-size:11px;color:var(--text-muted)}
.co-badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:6px;border:1px solid var(--card-border);color:var(--text-muted)}
.co-panel{padding:16px;display:flex;flex-direction:column;gap:14px;min-width:0}
.co-row{display:flex;flex-direction:row;flex-wrap:wrap;gap:10px;align-items:flex-end}
.co-grow{flex:1 1 200px}
.co-hint{font-size:12px;color:var(--text-muted)}
.co-notice{font-size:12px;color:var(--color-green)}
.co-groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.co-group{border:1px solid var(--card-border);border-radius:12px;padding:10px 12px;margin:0;min-width:0}
.co-group legend{font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);padding:0 4px}
.co-check{display:flex;gap:8px;align-items:flex-start;font-size:13px;padding:4px 0;cursor:pointer}
.co-check input{margin-top:2px;accent-color:var(--primary)}
.co-check input:disabled+span{color:var(--text-muted)}
.co-danger{background:var(--color-red);border-color:var(--color-red)}
`;
