/**
 * Оболочка экрана «План/Факт»: шапка «кто · компания · роль», выход. Вход — общий экран «Вход» платформы (P2-0013), своей формы нет.
 * Нет настроек сервера → локальный режим без входа (только разбор файла ВОР). «Работать локально» остаётся всегда.
 * P2-0009: страница по умолчанию и для разделов без права — «Сводка»; старая демо-таблица «Работы» больше не показывается
 * (PlanfactTable/PlanfactWorks не удалены — отдельным решением, ТД).
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { AccessEntry, AuthApi } from '../../platform/auth/auth.service.ts';
import { PLATFORM_AUTH_CSS } from '../../platform/auth/LoginForm.ts';
import { CompanyScope } from '../../platform/company/CompanyScope.ts';
import { ProjectsTab } from '../../platform/company/ProjectsTab.ts';
import type { CoreApi } from '../../platform/core/core.service.ts';
import { UnitsTab } from '../../platform/company/UnitsTab.ts';
import { VorTab } from './vor/VorTab.ts';
import { BrigadesTab } from './fact/BrigadesTab.ts';
import { FactTab } from './fact/FactTab.ts';
import type { FactApi } from './fact/fact.service.ts';
import { PricesTab } from './estimate/PricesTab.ts';
import { EstimateTab } from './estimate/EstimateTab.ts';
import { OverheadTemplateTab } from './estimate/OverheadsEditor.ts';
import type { EstimateApi } from './estimate/estimate.service.ts';
import { Ks2Tab } from './ks2/Ks2Tab.ts';
import { SummaryTab } from './summary/SummaryTab.ts';
import { showShellUser, restoreShellUser, openPlatformLogin, platformSignOut, readPlatformView, setPlatformCompany, platformRoleLabel, PLATFORM_ACCESS_EVENT } from '../../platform/auth/shell-user.ts';
import type { SummaryApi } from './summary/summary.service.ts';
import type { Ks2Api } from './ks2/ks2.service.ts';
import { KS2_EDIT, KS2_VIEW } from './ks2/ks2.service.ts';
import type { CompanyAccess, ProjectsApi } from '../../platform/core/projects.service.ts';
import type { DataApi } from './data.service.ts';
import type { VorApi } from './vor/vor.service.ts';
import type { PlanfactDemo } from './model.ts';
import { InboxTab } from './inbox/InboxTab.ts';

type Mode = 'loading' | 'authed' | 'demo';
const BASE = '#/planfact';
/** Событие модуля: маршрут #/planfact… показан (его шлёт index.ts при каждом переходе роутера). */
export const ROUTE_EVENT = 'planfact:route';
type Page = 'directories' | 'vor' | 'estimate' | 'fact' | 'ks2' | 'summary' | 'inbox';
type Sub = 'objects' | 'units' | 'brigades' | 'prices' | 'overheads';
/** «Цены» — только с правом planfact.estimate.manage (коммерческая тайна; прораб вкладку не видит, сервер тоже не отдаст). */
const SUBS: { id: Sub; label: string; estimate?: boolean }[] = [{ id: 'objects', label: 'Объекты' }, { id: 'units', label: 'Единицы' }, { id: 'brigades', label: 'Бригады' }, { id: 'prices', label: 'Цены', estimate: true }, { id: 'overheads', label: 'Надбавки', estimate: true }];

/** Адрес #/planfact[/vor|/estimate|/fact|/ks2|/summary|/inbox|/directories[/objects|/units|/prices|/overheads]] → страница и вкладка справочников.
 *  #/planfact и неизвестный адрес — «Сводка». Пункты верхнего уровня — в боковом меню (манифест модуля). */
export function routeFromHash(hash: string): { page: Page; sub: Sub } {
  const parts = String(hash || '').replace(/^#\/planfact\/?/, '').split('?')[0].split('/');
  return { page: parts[0] === 'directories' ? 'directories' : parts[0] === 'fact' ? 'fact' : parts[0] === 'ks2' ? 'ks2' : parts[0] === 'summary' ? 'summary' : parts[0] === 'vor' ? 'vor' : parts[0] === 'estimate' ? 'estimate' : parts[0] === 'inbox' ? 'inbox' : 'summary', sub: parts[1] === 'units' ? 'units' : parts[1] === 'brigades' ? 'brigades' : parts[1] === 'prices' ? 'prices' : parts[1] === 'overheads' ? 'overheads' : 'objects' };
}

/** Подвкладка «Факта» (P2-0017): #/planfact/fact — «Ввод», #/planfact/fact/chessboard — «Шахматка»;
 *  P2-0020: #/planfact/fact/pending[?вид] — «Ждёт подтверждения» (реестр РП; вкладка — только при праве fact.approve в объекте),
 *  #/planfact/fact/journal[?вид] — «Журнал» (все записи факта объекта за период; всем с fact.view). */
export type FactSub = 'entry' | 'chessboard' | 'pending' | 'journal';
export const FACT_SUBS: { id: FactSub; label: string; short?: string; path: string; approve?: boolean }[] = [{ id: 'entry', label: 'Ввод', path: '/fact' }, { id: 'chessboard', label: 'Шахматка', path: '/fact/chessboard' },
  { id: 'pending', label: 'Ждёт подтверждения', short: 'Ждёт РП', path: '/fact/pending', approve: true }, { id: 'journal', label: 'Журнал', path: '/fact/journal' }];
const FACT_SUB_IDS: string[] = ['chessboard', 'pending', 'journal'];
/** Подвкладка «ВОР» (P2-0019): #/planfact/vor — «Загрузка», #/planfact/vor/positions[?вид] — «Позиции» (реестр). */
export type VorSub = 'load' | 'positions';
export const VOR_SUBS: { id: VorSub; label: string; path: string }[] = [{ id: 'load', label: 'Загрузка', path: '/vor' }, { id: 'positions', label: 'Позиции', path: '/vor/positions' }];
export function vorSubFromHash(hash: string): VorSub {
  return String(hash || '').replace(/^#\/planfact\/?/, '').split('?')[0].split('/')[1] === 'positions' ? 'positions' : 'load';
}

export function factSubFromHash(hash: string): FactSub {
  const sub = String(hash || '').replace(/^#\/planfact\/?/, '').split('?')[0].split('/')[1] || '';
  return FACT_SUB_IDS.includes(sub) ? sub as FactSub : 'entry';
}

/** Что доступно вошедшему (то же правило, что выбор экрана ниже). */
export interface RouteAccess { company: boolean; estimate: boolean; ks2: boolean; fact: boolean; brigades: boolean }

/** P2-0011: адрес = то, что открыто (единый источник — маршрут оболочки). Раздел без права и неизвестный адрес показывают
 *  «Сводку» → адрес #/planfact; вкладка справочников без права («Цены», «Надбавки», «Бригады») или неизвестная → «Объекты».
 *  null — адрес уже верный (или нет доступа к компании: тогда экран-подсказка, адрес не трогаем). */
export function canonicalHash(hash: string, a: RouteAccess): string | null {
  // Экран модуля остаётся смонтированным, пока открыт другой раздел, — чужие адреса не трогаем.
  if (!a.company || !/^#\/planfact(\/|$)/.test(String(hash || ''))) return null;
  const parts = String(hash || '').replace(/^#\/planfact\/?/, '').split('/');
  const r = routeFromHash(hash);
  const known = ['', 'summary', 'vor', 'fact', 'estimate', 'ks2', 'directories', 'inbox'];
  const page0 = parts[0].split('?')[0];   // вид реестра в адресе (#/planfact/ks2?f.status=…, P2-0020)
  const pageOk = known.indexOf(page0) >= 0 && (r.page !== 'estimate' || a.estimate) && (r.page !== 'ks2' || a.ks2) && (r.page !== 'fact' || a.fact);
  if (!pageOk) return BASE;
  if (r.page === 'directories' && parts.length > 1 && parts[1] !== '') {
    const subOk = parts[1] === r.sub && !((r.sub === 'prices' || r.sub === 'overheads') && !a.estimate) && !(r.sub === 'brigades' && !a.brigades);
    if (!subOk) return `${BASE}/directories/objects`;
  }
  if (r.page === 'fact' && parts.length > 1 && parts[1].split('?')[0] !== '' && !FACT_SUB_IDS.includes(parts[1].split('?')[0])) return `${BASE}/fact`;
  if (r.page === 'vor' && parts.length > 1 && parts[1].split('?')[0] !== '' && parts[1].split('?')[0] !== 'positions') return `${BASE}/vor`;
  return null;
}

/** Подпись подвкладки со счётчиком; short — на телефоне (≤ 760 px), полная — для экранного диктора и на ПК. */
function segLabel(label: string, short: string | undefined, count: number | null): ReactNode[] {
  const n = count === null ? '' : ` (${count})`;
  return short
    ? [h('span', { key: 'f', className: 'pf-seg-full' }, label + n), h('span', { key: 's', className: 'pf-seg-short', 'aria-hidden': 'true' }, short + n)]
    : [label + n];
}

function accessLabel(entries: AccessEntry[]): string {
  if (!entries.length) return 'нет назначенных ролей';
  const parts = entries.map((e) => `${e.company} · ${e.role}`);
  return Array.from(new Set(parts)).join('; ');
}

export function PlanfactApp(props: { auth: AuthApi | null; data: PlanfactDemo; api?: DataApi | null; projects?: ProjectsApi | null; vor?: VorApi | null; estimate?: EstimateApi | null; fact?: FactApi | null; ks2?: Ks2Api | null; summary?: SummaryApi | null; core?: CoreApi | null; onAccess?: (hasDirectories: boolean, hasEstimate: boolean, hasKs2: boolean) => void; onDemo?: (demo: boolean) => void }): ReactElement {
  const { auth, projects, vor: vorApi, estimate, fact: factApi, ks2: ks2Api, summary: summaryApi, onAccess, onDemo } = props;
  const [mode, setMode] = useState<Mode>(auth ? 'loading' : 'demo');
  const [who, setWho] = useState('');
  const [vorCount, setVorCount] = useState<number | null>(null);
  const [access, setAccess] = useState<AccessEntry[]>([]);
  const [route, setRoute] = useState(routeFromHash(window.location.hash));
  const [companies, setCompanies] = useState<CompanyAccess[]>([]);
  const [canEstimate, setCanEstimate] = useState(false);
  const [canKs2, setCanKs2] = useState(false);
  const [factApprove, setFactApprove] = useState<number | null>(null);   // ждут РП в выбранном объекте; null — нет права fact.approve
  const [p2, setP2] = useState(readPlatformView());

  // P2-0026: в демо (без входа) меню оболочки показывает все подвкладки, закрытые открывают подсказку «Войдите».
  useEffect(() => { if (onDemo) onDemo(mode === 'demo'); }, [mode]);

  useEffect(() => {
    const onP2 = (): void => setP2(readPlatformView());
    window.addEventListener(PLATFORM_ACCESS_EVENT, onP2);
    return () => window.removeEventListener(PLATFORM_ACCESS_EVENT, onP2);
  }, []);

  useEffect(() => {
    const onHash = (): void => setRoute(routeFromHash(window.location.hash));
    // Роутер оболочки переходит через history.pushState — hashchange при этом НЕ приходит; модуль шлёт planfact:route на каждый заход в маршрут.
    window.addEventListener('hashchange', onHash);
    window.addEventListener(ROUTE_EVENT, onHash);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener(ROUTE_EVENT, onHash); };
  }, []);

  async function enter(a: AuthApi): Promise<void> {
    const mail = await a.getEmail();
    if (!mail) { reset(); setMode('demo'); return; }
    setWho(mail);
    setAccess(await a.getAccess());
    const comp = projects ? await projects.myAccess() : [];
    setCompanies(comp);
    let est = false;
    if (estimate) for (const c of comp) if (await estimate.canUse(c.company_id)) { est = true; break; }
    setCanEstimate(est);
    // «КС-2»: право просмотра или правки хотя бы в одном проекте (сервер проверяет каждый вызов).
    let k2 = false;
    if (ks2Api && vorApi && comp.length) for (const p of await vorApi.listProjects()) { const pr = await vorApi.permissions(p.id); if (pr.includes(KS2_VIEW) || pr.includes(KS2_EDIT)) { k2 = true; break; } }
    setCanKs2(k2);
    if (onAccess) onAccess(comp.length > 0, est, k2);
    showShellUser(mail, (await a.getAccess())[0]?.role || '');
    setMode('authed');
  }

  // Вход и выход — на общем экране «Вход» платформы (P2-0013); раздел только перечитывает, кто вошёл.
  useEffect(() => {
    if (!auth) return undefined;
    if (auth.onAuthChange) return auth.onAuthChange(() => { void enter(auth); });
    void enter(auth);
    return undefined;
  }, []);

  // Адрес без права / неизвестный — заменить на открытый экран (replace: «назад» не возвращает на недоступный адрес).
  const fix = mode === 'authed' && projects && summaryApi
    ? canonicalHash(window.location.hash, { company: companies.length > 0, estimate: canEstimate && !!estimate && !!vorApi, ks2: canKs2 && !!ks2Api && !!vorApi,
        fact: !!factApi && !!vorApi, brigades: !!factApi })
    : null;
  useEffect(() => {
    if (!fix) return;
    const r = (window as unknown as { AppRouter?: { navigate?: (p: string, replace?: boolean) => void } }).AppRouter;
    if (r && typeof r.navigate === 'function') r.navigate(fix, true); else { window.history.replaceState(null, '', fix); setRoute(routeFromHash(fix)); }
  }, [fix]);

  // На телефоне подвкладки «Факта» прокручиваются вбок: открытая — всегда в поле зрения (P2-0020: их четыре).
  useEffect(() => {
    const el = document.querySelector('[data-testid="pf-facttabs"] .pf-seg-btn--active') as (HTMLElement & { scrollIntoView?: (o?: object) => void }) | null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [route, factSubFromHash(window.location.hash), mode, companies.length, factApprove]);

  function reset(): void {
    restoreShellUser();
    setWho(''); setAccess([]); setCompanies([]); setCanEstimate(false); setCanKs2(false); if (onAccess) onAccess(false, false, false);
  }

  async function logout(): Promise<void> {
    await platformSignOut(auth ? () => auth.signOut() : null);
    reset(); setMode('demo');
  }

  if (mode === 'loading') return h('div', { className: 'pf-root pf-muted' }, 'Загрузка…');

  const bar = mode === 'authed'
    ? h('div', { className: 'pf-bar', 'data-testid': 'pf-user' },
        p2
          ? h('span', { className: 'pf-bar-who' }, h('b', null, who), ' · ',
              p2.companies.length > 1
                ? h('select', { className: 'pf-bar-company', 'aria-label': 'Компания', 'data-testid': 'pf-company', value: p2.companyId || '',
                    onChange: (e: { target: EventTarget | null }) => setPlatformCompany((e.target as HTMLSelectElement).value) },
                    p2.companies.map((c) => h('option', { key: c.id, value: c.id }, 'Компания: ' + c.name)))
                : (p2.companies.find((c) => c.id === p2.companyId)?.name || ''),
              ' · ', platformRoleLabel(p2))
          : h('span', null, h('b', null, who), ' · ', accessLabel(access)),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: logout }, 'Выйти'))
    : auth
      ? h('div', { className: 'pf-bar' }, h('span', null, 'Локальный демо-режим, без входа'),
          h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: openPlatformLogin }, 'Войти'))
      : null;

  // «Справочники» открываются, только если сервер дал доступ к компании (пункт меню показывается по тому же признаку).
  const dirs = mode === 'authed' && projects && companies.length > 0 && route.page === 'directories';
  const nav = (path: string): void => {
    const r = (window as unknown as { AppRouter?: { navigate?: (p: string) => void } }).AppRouter;
    if (r && typeof r.navigate === 'function') r.navigate(path); else window.location.hash = path;
  };
  const go = (sub: Sub): void => nav(`${BASE}/directories/${sub}`);
  // «ВОР»: при доступе к компании; в локальном демо-режиме — только просмотр разбора файла (сервер не нужен).
  const vor = route.page === 'vor' && ((mode === 'authed' && companies.length > 0) || mode === 'demo');
  // «Смета»: только с правом planfact.estimate.manage (сервер проверяет каждый вызов).
  const est = route.page === 'estimate' && mode === 'authed' && canEstimate && estimate && vorApi;
  // «Факт»: при доступе к компании (права на просмотр/ввод/подтверждение сервер проверяет каждым вызовом).
  const vsub = vorSubFromHash(window.location.hash);
  const fsub = factSubFromHash(window.location.hash);   // route обновляется при каждом переходе роутера — адрес уже текущий
  const fct = route.page === 'fact' && mode === 'authed' && companies.length > 0 && factApi && vorApi && projects;
  // «КС-2»: с правом planfact.ks2.view / ks2.edit хотя бы в одном проекте.
  const k2 = route.page === 'ks2' && mode === 'authed' && canKs2 && ks2Api && vorApi;
  // P2-0021: «Требует моего участия» — по всем объектам с правом (сервер отдаёт только своё); при доступе к компании.
  const inb = route.page === 'inbox' && mode === 'authed' && companies.length > 0 && summaryApi;
  // «Сводка»: по умолчанию и вместо раздела, на который нет права (закладка, прямая ссылка); при доступе к компании —
  // проекты, ₽ и общий % отдаёт сервер по правам fact.view / money.view.
  const sm = mode === 'authed' && companies.length > 0 && summaryApi && !(k2 || fct || est || vor || dirs || inb);
  // Без входа и без доступа к компании — подсказка вместо данных (старая демо-таблица «Работы» больше не показывается).
  const hint = mode === 'authed'
    ? 'Нет доступных объектов. Обратитесь к администратору компании.'
    : auth
      ? 'Войдите, чтобы увидеть сводку, ВОР, факт и акты КС-2. Без входа доступен только разбор файла ВОР.'
      : 'Сервер не настроен — вход недоступен. Без входа доступен только разбор файла ВОР.';
  const body = inb
    ? h('div', { className: 'pf-root' }, h(InboxTab, { api: summaryApi!, me: who, go: nav }))
    : sm
    ? h('div', { className: 'pf-root' }, h(SummaryTab, { api: summaryApi!, links: { go: (pg) => nav(`${BASE}/${pg}`), can: { ks2: !!canKs2, estimate: !!canEstimate, fact: true } } }))
    : k2
    ? h('div', { className: 'pf-root' }, h(Ks2Tab, { api: ks2Api!, vor: vorApi!, me: who }))
    : fct
    ? h('div', { className: 'pf-root' }, h(FactTab, { api: factApi!, vor: vorApi!, projects: projects!, me: who, mode: fsub, onApprove: setFactApprove }))
    : est
    ? h('div', { className: 'pf-root' }, h(EstimateTab, { api: estimate!, vor: vorApi! }))
    : vor
    ? h('div', { className: 'pf-root' }, h(VorTab, { api: mode === 'authed' ? vorApi || null : null, projects: mode === 'authed' ? projects || null : null,
        sub: mode === 'authed' ? vsub : 'load', fact: mode === 'authed' ? factApi || null : null, summary: mode === 'authed' ? summaryApi || null : null, user: who, onCount: setVorCount }))
    : dirs && projects
    ? h(CompanyScope, { api: projects, render: (c) => route.sub === 'units' ? h(UnitsTab, { api: projects, company: c })
        : route.sub === 'brigades' && factApi ? h(BrigadesTab, { api: factApi, company: c })
        : route.sub === 'prices' && canEstimate && estimate ? h(PricesTab, { api: estimate, vor: vorApi || null, company: c })
        : route.sub === 'overheads' && canEstimate && estimate ? h(OverheadTemplateTab, { api: estimate, company: c })
        : h(ProjectsTab, { api: projects, company: c, core: props.core }) })
    : h('div', { className: 'pf-root' }, h('div', { className: 'pf-card pf-hint', 'data-testid': 'pf-hint' },
        h('div', null, hint),
        mode === 'demo' ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'pf-hint-vor', onClick: () => nav(`${BASE}/vor`) }, 'Разбор файла ВОР') : null));
  const head = inb
    ? h('div', { className: 'pf-root pf-dirhead' }, h('h2', { className: 'pf-title' }, 'Требует моего участия'))
    : sm
    ? h('div', { className: 'pf-root pf-dirhead' }, h('h2', { className: 'pf-title' }, 'Сводка — готовность объектов'))
    : k2
    ? h('div', { className: 'pf-root pf-dirhead' }, h('h2', { className: 'pf-title' }, 'КС-2 — акты о приёмке выполненных работ'))
    : fct
    ? h('div', { className: 'pf-root pf-dirhead' },
        h('h2', { className: 'pf-title' }, 'Факт — выполненные объёмы'),
        h('div', { className: 'pf-seg', role: 'tablist', 'data-testid': 'pf-facttabs' },
          FACT_SUBS.filter((t) => !t.approve || factApprove !== null).map((t) => h('button', { key: t.id, type: 'button', role: 'tab', 'aria-selected': fsub === t.id, 'data-sub': t.id,
            className: 'pf-seg-btn' + (fsub === t.id ? ' pf-seg-btn--active' : ''), onClick: () => nav(`${BASE}${t.path}`) },
            ...segLabel(t.label, t.short, t.approve && factApprove !== null ? factApprove : null)))))
    : est
    ? h('div', { className: 'pf-root pf-dirhead' }, h('h2', { className: 'pf-title' }, 'Смета — тендерная стоимость по ВОР заказчика'))
    : vor
    ? h('div', { className: 'pf-root pf-dirhead' },
        h('h2', { className: 'pf-title' }, vsub === 'positions' && mode === 'authed' ? 'ВОР — позиции' : 'ВОР — загрузка ведомости объёмов работ'),
        mode === 'authed'
          ? h('div', { className: 'pf-seg', role: 'tablist', 'data-testid': 'pf-vortabs' },
              VOR_SUBS.map((t) => h('button', { key: t.id, type: 'button', role: 'tab', 'aria-selected': vsub === t.id, 'data-sub': t.id,
                className: 'pf-seg-btn' + (vsub === t.id ? ' pf-seg-btn--active' : ''), onClick: () => nav(`${BASE}${t.path}`) },
                t.id === 'positions' && vorCount !== null ? `${t.label} (${vorCount})` : t.label)))
          : null)
    : dirs
    ? h('div', { className: 'pf-root pf-dirhead' },
        h('h2', { className: 'pf-title' }, 'Справочники'),
        h('div', { className: 'pf-seg', role: 'tablist', 'data-testid': 'pf-dirtabs' },
          SUBS.filter((t) => !t.estimate || canEstimate).map((t) => h('button', { key: t.id, type: 'button', role: 'tab', 'aria-selected': route.sub === t.id, 'data-sub': t.id,
            className: 'pf-seg-btn' + (route.sub === t.id ? ' pf-seg-btn--active' : ''), onClick: () => go(t.id) }, t.label))))
    : null;
  return h('div', null, bar, head, body);
}

export const PLANFACT_TABS_CSS = `
.pf-bar-who{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0}
.pf-bar-company{max-width:100%;font-size:12px;font-weight:700;min-height:36px;padding:4px 8px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main)}
.pf-dirhead{padding-bottom:0;display:flex;flex-direction:column;gap:12px}
.pf-hint{padding:16px;display:flex;flex-direction:column;align-items:flex-start;gap:12px;font-size:14px}
.pf-seg{display:flex;flex-wrap:nowrap;gap:var(--rbi-subtab-gap,6px);padding:4px;border:1px solid var(--card-border);border-radius:12px;background:var(--card-bg);overflow-x:auto;-webkit-overflow-scrolling:touch}
.pf-seg-btn{flex:1 1 0;min-width:5rem;min-height:40px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;padding:8px 12px;border-radius:8px;border:0;background:transparent;color:var(--text-muted);cursor:pointer;white-space:nowrap;text-align:center}
.pf-seg-short{display:none}
@media (max-width:760px){.pf-seg-full{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.pf-seg-short{display:inline}}
.pf-seg-btn--active{background:var(--accent,var(--primary));color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2)}
`;

/** Стили входа перенесены в платформенный слой (LoginForm); имя сохранено для index.ts. */
export const PLANFACT_AUTH_CSS = PLATFORM_AUTH_CSS;
