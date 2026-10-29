/**
 * Раздел платформы «Компания» (администратор компании): вход — общая форма платформы, вкладки «Роли» / «Сотрудники» / «Журнал».
 * Доступ решает сервер (pf_my_admin_companies → security.roles.assign); без права — понятное сообщение.
 * P2-0011: открытая вкладка — только адрес оболочки #/settings/company/<roles|members|counterparties|audit> (назад/вперёд, F5, ссылка).
 * P2-0015: вкладка «Контрагенты» — справочник ядра (сервис src/platform/core).
 * P2-0038: «Компания» — уровень «Администрирования»: Сотрудники · Роли · Объекты (+структура) · Контрагенты · Справочники (единицы) ·
 * Оформление · Модули компании · Журнал. Вкладки — по правам сервера: управление ролями (pf_my_admin_companies) — люди, роли,
 * контрагенты, оформление, модули, журнал; объекты и единицы — по правам planfact.projects.manage / planfact.units.manage
 * (pf_my_company_access; РП и ПТО правят их, как раньше в План/Факте). «Оформление» — блок старых Настроек (логотип, цвет),
 * его показывает settings.render.js под этой вкладкой.
 * P2-0048 этап 3: разделы «Компании» — пункты левой колонки / главной «Настроек» (js/modules/settings/settings.nav.js);
 * здесь — только внутренние вкладки «Сотрудники · Роли и права» и строка «почта · компания · Выйти».
 */
import { createElement as h, useEffect, useRef, useState } from 'react';
import { NeedInternet, NO_COPY_TEXT, useOfflineEntry } from '../auth/need-internet.ts';
import { OFFLINE_HINT, OfflineMark, useScreenChange } from '../services/offline/index.ts';
import type { ReactElement } from 'react';
import type { AuthApi } from '../auth/auth.service.ts';
import { openPlatformLogin, platformSignOut } from '../auth/shell-user.ts';
import { CompanyRoles, COMPANY_ROLES_CSS } from './CompanyRoles.ts';
import { CompanyMembers, COMPANY_MEMBERS_CSS } from './CompanyMembers.ts';
import { CompanyAudit, COMPANY_AUDIT_CSS } from './CompanyAudit.ts';
import { SETTINGS_UI_CSS } from '../ui/settings.ts';
import type { CompanyApi, CompanyRef, MemberRow } from './company.service.ts';
import { CounterpartiesTab, COUNTERPARTIES_CSS } from './CounterpartiesTab.ts';
import type { CoreApi } from '../core/core.service.ts';
import type { CompanyAccess, ProjectsApi } from '../core/projects.service.ts';
import { CompanyScope } from './CompanyScope.ts';
import { ProjectsTab } from './ProjectsTab.ts';
import { Patterns, PATTERNS_CSS } from './Patterns.ts';
import { UnitsTab } from './UnitsTab.ts';

type Mode = 'loading' | 'login' | 'noaccess' | 'ready';
type Tab = 'members' | 'roles' | 'objects' | 'counterparties' | 'directories' | 'branding' | 'modules' | 'audit' | 'patterns';

const BASE = '#/settings/company';
/** Событие раздела: адрес #/settings/company… показан снова (index.ts — при повторном монтировании в тот же контейнер). */
export const COMPANY_ROUTE_EVENT = 'company:route';
/** #/settings/company[/<вкладка>] → вкладка; без вкладки и неизвестная — null (откроется первая доступная). */
export function tabFromHash(hash: string): Tab | null {
  const t = String(hash || '').replace(/^#\/settings\/company\/?/, '').split(/[/?]/)[0];
  return TABS.some((x) => x.id === t) ? t as Tab : null;
}

/** admin — управление ролями компании; dirs — объекты/единицы (planfact.projects.manage / units.manage). */
const TABS: { id: Tab; label: string; need: 'admin' | 'projects' | 'units' | 'platform' }[] = [
  { id: 'members', label: 'Сотрудники', need: 'admin' },
  { id: 'roles', label: 'Роли', need: 'admin' },
  { id: 'objects', label: 'Проекты', need: 'projects' },
  { id: 'counterparties', label: 'Контрагенты', need: 'admin' },
  { id: 'directories', label: 'Справочники', need: 'units' },
  { id: 'branding', label: 'Оформление', need: 'admin' },
  { id: 'modules', label: 'Модули компании', need: 'admin' },
  { id: 'audit', label: 'Журнал', need: 'admin' },
  { id: 'patterns', label: 'Образцы', need: 'platform' }   // P2-0047: детали дизайн-системы — администратору платформы
];

/** P2-0048: внутренние вкладки раздела «Сотрудники и доступ» (остальные вкладки — пункты левой колонки «Настроек»). */
const INNER_TABS: Tab[] = ['members', 'roles'];
const INNER_LABELS: Partial<Record<Tab, string>> = { members: 'Сотрудники', roles: 'Роли и права' };

export interface CompanyRights { admin: boolean; projects: boolean; units: boolean; platform?: boolean }
/** Какие вкладки видны: по правам сервера (без права вкладки нет, прямой адрес → первая доступная). */
export function visibleTabs(r: CompanyRights): Tab[] {
  return TABS.filter((t) => !!r[t.need]).map((t) => t.id);
}
export function rightsFrom(admin: CompanyRef[], access: CompanyAccess[]): CompanyRights {
  return { admin: admin.length > 0, projects: access.some((c) => c.can_manage_projects), units: access.some((c) => c.can_manage_units), platform: isPlatformAdmin() };
}

/** Модули платформы (просмотр «что включено у компании»; включает администратор платформы). */
const MODULES: { code: string; name: string }[] = [
  { code: 'planfact', name: 'План/Факт' }, { code: 'quality', name: 'Качество' }, { code: 'construction', name: 'Стройконтроль' },
  { code: 'knowledge', name: 'База знаний' }, { code: 'ai', name: 'ИИ-помощник' }
];
interface P2Company { id: string; name: string; modules: string[] }
function isPlatformAdmin(): boolean {
  const p2 = (window as unknown as { RBI?: { platform2?: { getState?: () => { isPlatformAdmin?: boolean } } } }).RBI?.platform2;
  return !!(p2 && typeof p2.getState === 'function' && p2.getState().isPlatformAdmin);
}
function platformCompanies(): P2Company[] {
  const p2 = (window as unknown as { RBI?: { platform2?: { getState?: () => { companies?: P2Company[] } } } }).RBI?.platform2;
  const st = p2 && typeof p2.getState === 'function' ? p2.getState() : null;
  return st && Array.isArray(st.companies) ? st.companies : [];
}
function ModulesView(props: { companyId: string }): ReactElement {
  const c = platformCompanies().find((x) => x.id === props.companyId);
  const on = new Set(c ? c.modules : []);
  return h('div', { className: 'sui-cards', 'data-testid': 'co-modules' },
    h('div', { className: 'sui-hint' }, 'Какие модули включены у компании. Включает и выключает администратор платформы.'),
    h('div', { className: 'sui-card sui-list' }, MODULES.map((m) => h('div', { key: m.code, className: 'sui-list-row', 'data-module': m.code },
      h('span', { className: 'sui-title' }, m.name),
      h('span', { className: 'sui-badge' + (on.has(m.code) ? ' sui-badge--on' : '') }, on.has(m.code) ? 'включён' : 'выключен')))));
}

/** P2-0047: сотрудники компании для выбора руководителя проекта (по одному на человека, без отключённых). */
async function peopleOf(api: CompanyApi, companyId: string): Promise<{ user_id: string; name: string }[]> {
  const rows = await api.listMembers(companyId).catch(() => [] as MemberRow[]);
  const seen = new Map<string, string>();
  for (const m of rows) if (!m.disabled_at && !seen.has(m.user_id)) seen.set(m.user_id, m.full_name || m.email || 'Сотрудник');
  return Array.from(seen, ([user_id, name]) => ({ user_id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export function CompanyApp(props: { auth: AuthApi | null; api: CompanyApi | null; core?: CoreApi | null; projects?: ProjectsApi | null }): ReactElement {
  const { auth, api, core, projects } = props;
  const [mode, setMode] = useState<Mode>('loading');
  const [who, setWho] = useState('');
  const [companies, setCompanies] = useState<CompanyRef[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [tab, setTab] = useState<Tab | null>(tabFromHash(window.location.hash));
  const [rights, setRights] = useState<CompanyRights>({ admin: false, projects: false, units: false });
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const offline = useOfflineEntry();   // P2-0060: без сети — просмотр по копии; копии нет — «Нужен интернет»
  useScreenChange('company', String(tab));   // пропуски копии — по текущей вкладке
  // телефон: активная вкладка видна в полосе (прокрутка только полосы, не страницы)
  useEffect(() => {
    const strip = tabsRef.current;
    const act = strip ? strip.querySelector('.co-tab--active') as HTMLElement | null : null;
    if (!strip || !act || strip.scrollWidth <= strip.clientWidth) return;
    const l = act.offsetLeft - strip.offsetLeft;
    if (l < strip.scrollLeft || l + act.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = Math.max(0, l - 8);
  });

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

  // Вкладка из адреса закрыта или не указана → первая доступная, и адрес тоже (без лишней записи в истории).
  useEffect(() => {
    if (mode !== 'ready') return;
    const tabs = visibleTabs(rights);
    if (tab && tabs.includes(tab)) return;
    const first = tabs[0];
    const r = (window as unknown as { AppRouter?: { navigate?: (p: string, replace?: boolean) => void } }).AppRouter;
    if (/^#\/settings\/company(\/|$)/.test(window.location.hash || '')) {
      if (r && typeof r.navigate === 'function') r.navigate(`${BASE}/${first}`, true); else window.history.replaceState(null, '', `${BASE}/${first}`);
    }
    setTab(first);
  }, [mode, rights, tab]);

  async function enter(): Promise<void> {
    if (!auth || !api) return;
    const mail = await auth.getEmail();
    if (!mail) { setMode('login'); return; }
    setWho(mail);
    const [list, access] = await Promise.all([api.myAdminCompanies(), projects ? projects.myAccess().catch(() => [] as CompanyAccess[]) : Promise.resolve([] as CompanyAccess[])]);
    const r = rightsFrom(list, access);
    setCompanies(list);
    setCompanyId(list.length ? list[0].company_id : '');
    setRights(r);
    setMode(visibleTabs(r).length ? 'ready' : 'noaccess');
  }

  // Вход и выход — на общем экране «Вход» платформы (P2-0013); раздел перечитывает, кто вошёл.
  useEffect(() => {
    if (auth && auth.onAuthChange) return auth.onAuthChange(() => { void enter(); });
    void enter();
    return undefined;
  }, []);

  async function logout(): Promise<void> {
    await platformSignOut(auth ? () => auth.signOut() : null);
    setWho(''); setCompanies([]); setCompanyId(''); setRights({ admin: false, projects: false, units: false }); setMode('login');
  }

  if (!auth || !api) {
    return h('div', { className: 'pf-root pf-muted', 'data-testid': 'co-offline' }, 'Раздел «Компания» работает только с сервером — вход не настроен.');
  }
  if (mode === 'loading') return h('div', { className: 'pf-root pf-muted' }, 'Загрузка…');
  if (mode === 'login') {
    return h('div', { className: 'pf-root pf-hint', 'data-testid': 'co-login' }, h('div', { className: 'pf-muted' }, 'Войдите, чтобы управлять компанией.'),
      h('button', { type: 'button', className: 'pf-btn', onClick: openPlatformLogin }, 'Войти'));
  }

  const bar = h('div', { className: 'pf-bar co-userbar', 'data-testid': 'co-user' },
    h('span', { className: 'co-who' }, h('b', null, who),
      companies.length > 1
        ? h('select', { className: 'co-select', 'aria-label': 'Компания', value: companyId, onChange: (e) => setCompanyId((e.target as HTMLSelectElement).value) },
            companies.map((c) => h('option', { key: c.company_id, value: c.company_id }, c.company_name)))
        : companies.length ? ' · ' + companies[0].company_name : null),
    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: logout }, 'Выйти'));

  // без сети, а раздел с интернетом не открывали — прав «Компании» в копии нет: не «нет права», а «Нужен интернет»
  if (offline && mode === 'noaccess') return h(NeedInternet, { section: '«Компания»', testId: 'co-need-internet', text: NO_COPY_TEXT });
  if (mode === 'noaccess') {
    return h('div', null, bar,
      h('div', { className: 'pf-root pf-muted', 'data-testid': 'co-noaccess' }, 'Нет права управлять компанией. Раздел доступен администратору компании (проекты и единицы — тем, кто их ведёт).'));
  }

  const tabs = visibleTabs(rights);
  const cur: Tab = tab && tabs.includes(tab) ? tab : tabs[0];
  const body = cur === 'members' ? h(CompanyMembers, { api, companyId, me: who, projects: projects || null, key: companyId })
    : cur === 'roles' ? h(CompanyRoles, { api, companyId, key: companyId })
    : cur === 'objects' && projects ? h(CompanyScope, { api: projects, render: (c) => h(ProjectsTab, { api: projects, company: c, core: core || null, people: () => peopleOf(api, c.company_id) }) })
    : cur === 'counterparties' && core ? h(CounterpartiesTab, { core, companyId, key: companyId })
    : cur === 'directories' && projects ? h(CompanyScope, { api: projects, render: (c) => h(UnitsTab, { api: projects, company: c }) })
    : cur === 'branding' ? h('div', { className: 'sui-hint', 'data-testid': 'co-branding' }, 'Логотип и фирменный цвет — для отчётов и шапки у всех сотрудников компании.')
    : cur === 'modules' ? h(ModulesView, { companyId, key: companyId })
    : cur === 'audit' ? h(CompanyAudit, { api, companyId, key: companyId })
    : cur === 'patterns' ? h(Patterns)
    : null;
  // P2-0048: разделы «Компании» — в левой колонке / на главной «Настроек»; здесь только внутренние вкладки «Сотрудники и доступ».
  const inner = INNER_TABS.includes(cur) ? INNER_TABS.filter((t) => tabs.includes(t)) : [];
  return h('div', null, bar,
    h('div', { className: 'pf-root co-root', 'data-company-tab': cur },
      offline ? h('div', { className: 'co-offline', role: 'note', 'data-testid': 'co-offline-hint' }, h(OfflineMark, { module: 'company' }),
        h('span', { className: 'pf-muted' }, OFFLINE_HINT)) : null,
      inner.length > 1 ? h('div', { className: 'co-head' },
        h('div', { className: 'co-tabs', role: 'tablist', 'data-testid': 'co-tabs', ref: tabsRef },
          inner.map((id) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': cur === id, 'data-tab': id,
            className: 'co-tab' + (cur === id ? ' co-tab--active' : ''), onClick: () => go(id) }, INNER_LABELS[id])))) : null,
      body));
}

export const COMPANY_CSS = SETTINGS_UI_CSS + PATTERNS_CSS + COMPANY_MEMBERS_CSS + COMPANY_AUDIT_CSS + COUNTERPARTIES_CSS + `
.co-root{max-width:1200px}
.co-offline{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:12px;margin-bottom:12px}
.co-head{margin-bottom:16px}
.co-tabs{display:flex;flex-wrap:wrap;gap:6px}
.co-tab{min-height:44px;font-size:14px;font-weight:600;padding:9px 14px;border-radius:10px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);cursor:pointer;white-space:nowrap;text-align:center}
.co-tab--active{background:var(--accent,var(--primary));border-color:var(--accent,var(--primary));color:#fff}
.co-userbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;font-size:13px;color:var(--text-muted);padding:0 0 10px;margin-bottom:12px}
.co-who{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0;overflow-wrap:anywhere}
.co-who b{color:var(--text-main);font-weight:600}
.co-select{font-size:16px;min-height:40px;padding:6px 10px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main);max-width:100%}
.co-split{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:16px;align-items:start}
@media (max-width:760px){.co-split{grid-template-columns:1fr}}
.co-card,.co-list,.co-panel{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow-card)}
.co-list{display:flex;flex-direction:column;padding:6px;max-height:70vh;overflow-y:auto}
.co-list-item{display:flex;flex-direction:column;gap:2px;text-align:left;padding:9px 10px;border:0;border-radius:10px;background:transparent;color:var(--text-main);cursor:pointer;font-size:13px}
.co-list-item:hover{background:var(--hover-bg)}
.co-list-item--active{background:var(--hover-bg);box-shadow:inset 3px 0 0 var(--primary)}
.co-list-meta{display:flex;gap:6px;align-items:center;font-size:11px;color:var(--text-muted)}
.co-panel{padding:16px;display:flex;flex-direction:column;gap:14px;min-width:0}
.co-row{display:flex;flex-direction:row;flex-wrap:wrap;gap:10px;align-items:flex-end}
.co-grow{flex:1 1 200px}
.co-notice{font-size:12px;color:var(--color-green)}
.co-groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.co-group{border:1px solid var(--card-border);border-radius:12px;padding:10px 12px;margin:0;min-width:0}
.co-group legend{font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);padding:0 4px}
.co-check{display:flex;gap:8px;align-items:flex-start;font-size:13px;padding:4px 0;cursor:pointer}
.co-check input{margin-top:2px;accent-color:var(--primary)}
.co-check input:disabled+span{color:var(--text-muted)}
.co-danger{background:var(--color-red);border-color:var(--color-red)}
`+ COMPANY_ROLES_CSS;
