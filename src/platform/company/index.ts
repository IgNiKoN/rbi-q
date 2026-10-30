/**
 * Platform entry: раздел платформы «Компания» (Vite-бандл → js/dist/company/company.js).
 * Контракт: init(ctx) / mount(el) / unmount(). Экран монтируется в подраздел Настроек «Компания» (RBI.platformPanels.company);
 * подраздел виден при праве security.roles.assign (флаг RBI.platformMenuAccess.company по ответу сервера; сервер проверяет каждый вызов).
 */
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { CompanyApp, COMPANY_CSS, COMPANY_ROUTE_EVENT } from './CompanyApp.ts';
import { createCompanyService } from './company.service.ts';
import { renderAttention } from './CompanyHome.ts';
import { createCoreService } from '../core/core.service.ts';
import type { CoreApi } from '../core/core.service.ts';
import { createProjectsService } from '../core/projects.service.ts';
import type { ProjectsApi } from '../core/projects.service.ts';
import { SCOPE_CSS } from './CompanyScope.ts';
import { PROJECTS_CSS } from './ProjectsTab.ts';
import { OBJECTS_CSS } from './ObjectsPlaces.ts';
import { CHESS_CSS } from './PlacesChess.ts';
import { PLANS_CSS } from './PlacePlans.ts';
import { IMPORT_CSS } from './PlacesImport.ts';
import { UNITS_CSS } from './UnitsTab.ts';
import type { CompanyApi } from './company.service.ts';
import { createAuthService, readAuthConfig } from '../auth/auth.service.ts';
import type { AuthApi } from '../auth/auth.service.ts';
import { prefetchCore } from './prefetch.ts';
import type { CorePrefetchStats } from './prefetch.ts';
import { markPrefetched, prefetchDue } from '../services/offline/copy.ts';
import { PLATFORM_AUTH_CSS } from '../auth/LoginForm.ts';
import { P2_PAGE_CSS, P2_REGISTRY_CSS, P2_TREE_CSS, P2_UI_CSS } from '../ui/index.ts';

const STYLE_ID = 'company-style';

let root: Root | null = null;
let mountedEl: HTMLElement | null = null;
let auth: AuthApi | null | undefined;
let api: CompanyApi | null = null;
let core: CoreApi | null = null;
let projects: ProjectsApi | null = null;

function getAuth(): AuthApi | null {
  if (auth === undefined) {
    const cfg = readAuthConfig();
    auth = cfg ? createAuthService(cfg) : null;
    api = auth ? createCompanyService() : null;
    core = auth ? createCoreService() : null;
    projects = auth ? createProjectsService() : null;   // P2-0038: объекты и единицы — в «Компании»
  }
  return auth;
}

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PLATFORM_AUTH_CSS + P2_UI_CSS + P2_REGISTRY_CSS + P2_PAGE_CSS + P2_TREE_CSS + COMPANY_CSS + SCOPE_CSS + PROJECTS_CSS + OBJECTS_CSS + CHESS_CSS + PLANS_CSS + IMPORT_CSS + UNITS_CSS;
  doc.head.appendChild(style);
}

export function mount(el: HTMLElement): void {
  // Настройки монтируют панель при каждом показе маршрута #/settings/company… — тот же контейнер не пересоздаём
  // (выбор компании и загруженные данные сохраняются), а сообщаем экрану новый адрес (P2-0011).
  if (root && mountedEl === el && el.isConnected) { window.dispatchEvent(new Event(COMPANY_ROUTE_EVENT)); return; }
  if (root) unmount();
  ensureStyle(el.ownerDocument);
  mountedEl = el;
  root = createRoot(el);
  const r = root;
  const a = getAuth();
  flushSync(() => r.render(createElement(CompanyApp, { auth: a, api, core, projects })));
}

export function unmount(): void {
  if (root) root.unmount();
  root = null;
  if (mountedEl) mountedEl.replaceChildren();
  mountedEl = null;
}

/** P2-0048: «Требует внимания» на главной «Настроек» (сотрудники без ролей, не сменили временный пароль, отключены). */
export function mountHome(el: HTMLElement): Promise<void> {
  getAuth();
  return renderAttention(el, api, projects);
}

export function isMounted(): boolean {
  return root !== null;
}

/** P2-0013: маршрут #/company и видимость подраздела держит обёртка js/modules/company/index.js (бандл грузится только при доступе);
 *  право «Компания» — по ответу сервера через вход платформы (RBI.platformMenuAccess.company), здесь не перепроверяется. */
/** P2-0060: «держать без сети» ядра платформы — заранее скачать экраны «Компании» (раз в сутки; force — по кнопке). */
let prefetching: Promise<CorePrefetchStats | null> | null = null;
export function prefetchOffline(opts?: { force?: boolean }): Promise<CorePrefetchStats | null> {
  getAuth();
  if (prefetching) return prefetching;
  if (!(opts && opts.force) && !prefetchDue('company', Date.now())) return Promise.resolve(null);
  prefetching = prefetchCore({ api, core, projects })
    .then((st) => { if (!st.stopped) markPrefetched('company', st, Date.now()); return st; })
    .finally(() => { prefetching = null; });
  return prefetching;
}

export async function init(): Promise<void> {
  // ничего: обёртка сама регистрирует панель Настроек и маршрут
}
