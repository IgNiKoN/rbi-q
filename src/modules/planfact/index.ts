/**
 * Platform entry: модуль «План/Факт» (Vite-бандл → js/dist/planfact/planfact.js).
 * Контракт модуля: init(ctx) / mount(el) / unmount(). Выключатель — manifest.enabled.
 */
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { visibleNavItems } from './nav-items.ts';
import type { NavItem } from './nav-items.ts';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { PLANFACT_CSS } from './PlanfactTable.ts';
import { PlanfactApp, PLANFACT_AUTH_CSS, PLANFACT_TABS_CSS, ROUTE_EVENT } from './PlanfactApp.ts';
import { SCOPE_CSS } from '../../platform/company/CompanyScope.ts';
import { PROJECTS_CSS } from '../../platform/company/ProjectsTab.ts';
import { LOCATIONS_CSS } from '../../platform/company/LocationsTree.ts';
import { UNITS_CSS } from '../../platform/company/UnitsTab.ts';
import { createProjectsService } from '../../platform/core/projects.service.ts';
import { createCoreService } from '../../platform/core/core.service.ts';
import type { CoreApi } from '../../platform/core/core.service.ts';
import type { ProjectsApi } from '../../platform/core/projects.service.ts';
import { PLANFACT_WORKS_CSS } from './PlanfactWorks.ts';
import { VOR_CSS } from './vor/VorTab.ts';
import { VOR_COLUMNS_CSS } from './vor/VorColumns.ts';
import { VOR_DRAFT_CSS } from './vor/VorDraft.ts';
import { VOR_WORKS_CSS } from './vor/VorWorks.ts';
import { VOR_POSITIONS_CSS } from './vor/VorPositions.ts';
import { createVorService } from './vor/vor.service.ts';
import { PRICES_CSS } from './estimate/PricesTab.ts';
import { ESTIMATE_CSS } from './estimate/EstimateView.ts';
import { OVERHEADS_CSS } from './estimate/OverheadsEditor.ts';
import { KP_CSS } from './estimate/KpBlock.ts';
import { PRICES_IMPORT_CSS } from './estimate/PricesImport.ts';
import { createEstimateService } from './estimate/estimate.service.ts';
import type { EstimateApi } from './estimate/estimate.service.ts';
import type { VorApi } from './vor/vor.service.ts';
import { createFactService } from './fact/fact.service.ts';
import { FACT_CSS } from './fact/FactTab.ts';
import { CHESSBOARD_CSS } from './fact/ChessboardTab.ts';
import { FACT_ENTRY_CSS } from './fact/FactEntryForm.ts';
import type { FactApi } from './fact/fact.service.ts';
import { createKs2Service } from './ks2/ks2.service.ts';
import type { Ks2Api } from './ks2/ks2.service.ts';
import { KS2_CSS } from './ks2/Ks2Tab.ts';
import { KS2_ACT_CSS } from './ks2/Ks2Act.ts';
import { KS2_TPL_CSS } from './ks2/Ks2Template.ts';
import { createSummaryService } from './summary/summary.service.ts';
import type { SummaryApi } from './summary/summary.service.ts';
import { SUMMARY_CSS } from './summary/SummaryTab.ts';
import { SUMMARY_PROJECT_CSS } from './summary/ProjectView.ts';
import { SUMMARY_GAP_CSS } from './summary/Ks2Gap.ts';
import { DASHBOARD_CSS } from './summary/Dashboard.ts';
import { ATTENTION_CSS } from './summary/Attention.ts';
import { P2_CHESS_CSS, P2_UI_CSS } from '../../platform/ui/index.ts';
import { createDataService } from './data.service.ts';
import type { DataApi } from './data.service.ts';
import { createAuthService, readAuthConfig } from '../../platform/auth/auth.service.ts';
import type { AuthApi } from '../../platform/auth/auth.service.ts';
import type { PlanfactDemo } from './model.ts';
import { withInboxRefresh } from './inbox/inbox.ts';
import { INBOX_CSS } from './inbox/InboxTab.ts';
import demo from './demo-data.json' with { type: 'json' };

const ROUTE = '#/planfact';
const VIEW_ID = 'tab-planfact';
const STYLE_ID = 'planfact-style';

let root: Root | null = null;
let mountedEl: HTMLElement | null = null;
let auth: AuthApi | null | undefined;
let dataApi: DataApi | null = null;
let projectsApi: ProjectsApi | null = null;
let vorApi: VorApi | null = null;
let estimateApi: EstimateApi | null = null;
let factApi: FactApi | null = null;
let ks2Api: Ks2Api | null = null;
let summaryApi: SummaryApi | null = null;
let coreApi: CoreApi | null = null;

function getAuth(): AuthApi | null {
  if (auth === undefined) {
    const cfg = readAuthConfig();
    auth = cfg ? createAuthService(cfg) : null;
    dataApi = auth ? createDataService() : null;
    projectsApi = auth ? createProjectsService() : null;
    vorApi = auth ? createVorService() : null;
    estimateApi = auth ? createEstimateService() : null;
    // P2-0021: после своих действий (решение РП, исправление, ввод факта, акт КС-2) точки «Требует моего участия» перечитываются
    factApi = auth ? withInboxRefresh(createFactService(), ['add', 'addBatch', 'correct', 'decide', 'decideBatch']) : null;
    ks2Api = auth ? withInboxRefresh(createKs2Service(), ['setContract', 'createAct', 'issue', 'annul']) : null;
    summaryApi = auth ? createSummaryService() : null;
    coreApi = auth ? createCoreService() : null;
  }
  return auth;
}

/** requiresAccess: true — доступ к компании; 'estimate' — право на цены и сметы (planfact.estimate.manage); 'ks2' — право на КС-2 (ks2.view/ks2.edit). */
interface ShellCtx {
  shell?: { renderSidebar?: () => void } | null;
  /** P2-0013: маршрут #/planfact держит обёртка js/modules/planfact/index.js (проверка доступа до загрузки бандла) — бандл свой не регистрирует. */
  externalRoute?: boolean;
  nav?: NavItem[];   // подвкладки из манифеста (js/modules/planfact/planfact.manifest.js) — единственный источник
}

type RbiGlobal = { RBI?: { platformNav?: { id: string; title: string; items: { path: string; label: string; icon?: string }[] } | null } };
type ModeMgr = { AppModeManager?: { renderBottomNav?: () => void } };
let navItems: NavItem[] = [];
let hasDirectories = false;
let hasEstimate = false;
let hasKs2 = false;
let demoNav = false;
let navActive = false;

/** Подвкладки модуля в нижнем таббаре (телефон/планшет) и nav2 (≥1280) — общий механизм оболочки window.RBI.platformNav. */
function syncPlatformNav(): void {
  const w = window as unknown as RbiGlobal & ModeMgr;
  w.RBI = w.RBI || {};
  w.RBI.platformNav = navActive
    ? { id: 'planfact', title: 'План/Факт', items: visibleNavItems(navItems, { directories: hasDirectories, estimate: hasEstimate, ks2: hasKs2, demo: demoNav }).map((i) => ({ path: i.path, label: i.label, icon: i.icon })) }
    : null;
  if (w.AppModeManager && typeof w.AppModeManager.renderBottomNav === 'function') w.AppModeManager.renderBottomNav();
}

function onAccess(has: boolean, est: boolean, k2: boolean): void {
  if (has === hasDirectories && est === hasEstimate && k2 === hasKs2) return;
  hasDirectories = has;
  hasEstimate = est;
  hasKs2 = k2;
  if (navActive) syncPlatformNav();
}

/** P2-0026: раздел в демо-режиме (без входа) — в меню все подвкладки. */
function onDemo(demo: boolean): void {
  if (demo === demoNav) return;
  demoNav = demo;
  if (navActive) syncPlatformNav();
}

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = P2_UI_CSS + P2_CHESS_CSS + PLANFACT_CSS + PLANFACT_AUTH_CSS + PLANFACT_WORKS_CSS + PLANFACT_TABS_CSS + SCOPE_CSS + PROJECTS_CSS + LOCATIONS_CSS + UNITS_CSS + VOR_CSS + VOR_COLUMNS_CSS + VOR_DRAFT_CSS + VOR_WORKS_CSS + VOR_POSITIONS_CSS + PRICES_CSS + PRICES_IMPORT_CSS + ESTIMATE_CSS + OVERHEADS_CSS + KP_CSS + FACT_CSS + FACT_ENTRY_CSS + CHESSBOARD_CSS + KS2_CSS + KS2_ACT_CSS + KS2_TPL_CSS + SUMMARY_CSS + SUMMARY_PROJECT_CSS + SUMMARY_GAP_CSS + DASHBOARD_CSS + ATTENTION_CSS + INBOX_CSS;
  doc.head.appendChild(style);
}

/** Монтирует React-экран в el (синхронно: после вызова таблица уже в DOM). Повторный mount сначала размонтирует предыдущий. */
export function mount(el: HTMLElement): void {
  if (root) unmount();
  ensureStyle(el.ownerDocument);
  mountedEl = el;
  root = createRoot(el);
  const r = root;
  flushSync(() => r.render(createElement(PlanfactApp, { auth: getAuth(), data: demo as PlanfactDemo, api: dataApi, projects: projectsApi, vor: vorApi, estimate: estimateApi, fact: factApi, ks2: ks2Api, summary: summaryApi, core: coreApi, onAccess, onDemo })));
}

/** Снимает React-экран и очищает контейнер. Безопасен при повторном вызове. */
export function unmount(): void {
  if (navActive) { navActive = false; syncPlatformNav(); }
  if (root) root.unmount();
  root = null;
  if (mountedEl) mountedEl.replaceChildren();
  mountedEl = null;
}

export function isMounted(): boolean {
  return root !== null;
}

function ensureView(): HTMLElement {
  let el = document.getElementById(VIEW_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = VIEW_ID;
  el.className = 'view-section hidden';
  const anchor = document.getElementById('tab-mode-placeholder');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
  else document.body.appendChild(el);
  return el;
}

/** Маршрут #/planfact: показать вкладку модуля (как switchViewNode оболочки) и смонтировать экран. */
export function showView(): void {
  const el = ensureView();
  document.querySelectorAll('.view-section').forEach((n) => n.classList.remove('active'));
  el.classList.add('active');
  const header = document.getElementById('main-header');
  if (header) header.style.display = 'none';
  // P2-0030: плашка «Стройконтроль — бета» — режима Стройконтроля; при переходе оттуда в План/Факт она оставалась
  const banner = document.getElementById('construction-warning-banner');
  if (banner) banner.style.display = 'none';
  if (mountedEl !== el || !root) mount(el);
  navActive = true;
  syncPlatformNav();
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

export async function init(ctx?: ShellCtx): Promise<void> {
  if (ctx && Array.isArray(ctx.nav)) navItems = ctx.nav;
  // Ушли из модуля — убрать его подвкладки из таббара/nav2. Роутер переходит через pushState (hashchange нет) и шлёт rbi:route (P2-0011).
  // Настройки — служебный раздел текущего модуля (как у Quality): подвкладки План/Факт остаются, чтобы вернуться одним нажатием.
  const onLeave = (): void => {
    const hash = String(location.hash || '');
    if (navActive && hash.indexOf(ROUTE) !== 0 && !/^#\/settings(\/|$)/.test(hash)) { navActive = false; syncPlatformNav(); }
  };
  window.addEventListener('hashchange', onLeave);
  window.addEventListener('rbi:route', onLeave);
  const router = (window as unknown as { AppRouter?: { addRoute?: (p: string, fn: () => void) => void } }).AppRouter;
  if (router && typeof router.addRoute === 'function' && !(ctx && ctx.externalRoute)) {
    router.addRoute(ROUTE, showView);
    if (String(location.hash || '').indexOf(ROUTE) === 0) showView();
  }
  if (ctx && ctx.shell && typeof ctx.shell.renderSidebar === 'function') ctx.shell.renderSidebar();
}
