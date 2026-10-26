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
import { createCoreService } from '../core/core.service.ts';
import type { CoreApi } from '../core/core.service.ts';
import type { CompanyApi } from './company.service.ts';
import { createAuthService, readAuthConfig } from '../auth/auth.service.ts';
import type { AuthApi } from '../auth/auth.service.ts';
import { PLATFORM_AUTH_CSS } from '../auth/LoginForm.ts';

const STYLE_ID = 'company-style';

let root: Root | null = null;
let mountedEl: HTMLElement | null = null;
let auth: AuthApi | null | undefined;
let api: CompanyApi | null = null;
let core: CoreApi | null = null;

function getAuth(): AuthApi | null {
  if (auth === undefined) {
    const cfg = readAuthConfig();
    auth = cfg ? createAuthService(cfg) : null;
    api = auth ? createCompanyService() : null;
    core = auth ? createCoreService() : null;
  }
  return auth;
}

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PLATFORM_AUTH_CSS + COMPANY_CSS;
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
  flushSync(() => r.render(createElement(CompanyApp, { auth: a, api, core })));
}

export function unmount(): void {
  if (root) root.unmount();
  root = null;
  if (mountedEl) mountedEl.replaceChildren();
  mountedEl = null;
}

export function isMounted(): boolean {
  return root !== null;
}

/** P2-0013: маршрут #/company и видимость подраздела держит обёртка js/modules/company/index.js (бандл грузится только при доступе);
 *  право «Компания» — по ответу сервера через вход платформы (RBI.platformMenuAccess.company), здесь не перепроверяется. */
export async function init(): Promise<void> {
  // ничего: обёртка сама регистрирует панель Настроек и маршрут
}
