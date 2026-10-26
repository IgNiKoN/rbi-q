/**
 * Вход платформы (Vite-бандл → js/dist/platform/platform.js, без React). Подключает оболочка (app-shell.showAuthGate) при открытии.
 * Решает, кто на устройстве: вошедший почтой (сессия Supabase) или демо; иначе — экран «Вход» поверх оболочки (P2-0016: PIN-входа в 2.0 нет).
 * Публикует состояние для меню и Настроек: window.RBI.platformMenuAccess (событие rbi:platform-access) и window.RBI.platform2.
 * Качество/Стройконтроль при входе почтой — мост quality-bridge.ts (window.RBI.qualitySync).
 */
import { createClient } from '@supabase/supabase-js';
import { createAuthService, getClient, readAuthConfig } from './auth.service.ts';
import { applyQualityBridge, QUALITY_COMPANY_KEY, QUALITY_USER_KEY } from './quality-bridge.ts';
import { createProjectsService } from '../core/projects.service.ts';
import type { QualityProject } from './quality-bridge.ts';
import { createPlatform, homePathFor, LAST_MODULE_HASH_KEY } from './platform.service.ts';
import type { Platform, PlatformState } from './platform.service.ts';
import { LOGIN_CSS, renderLoginScreen } from './login-screen.ts';
import { PASSWORD_CSS, renderMyProfile as drawMyProfile, renderPasswordScreen } from './password-screen.ts';
import { showShellUser, restoreShellUser } from './shell-user.ts';
import { cleanupLegacyDevice, deleteIndexedDb } from './legacy-device.ts';

type Rbi = Record<string, unknown> & {
  services?: { shell?: { renderSidebar?: () => void; renderMobileModuleMenu?: () => void } };
};
type Win = Window & { RBI?: Rbi; AppRouter?: { navigate?: (p: string, replace?: boolean) => void }; AppModeManager?: { renderBottomNav?: () => void } };

const OVERLAY_ID = 'auth-gate-overlay';
const STYLE_ID = 'p2-login-style';

let platform: Platform | null = null;
let started: Promise<PlatformState> | null = null;

function w(): Win { return window as Win; }
function rbi(): Rbi { const x = w(); x.RBI = x.RBI || {}; return x.RBI; }

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = LOGIN_CSS + PASSWORD_CSS + `
.p2-company-switch{max-width:100%;font-size:12px;font-weight:700;min-height:40px;padding:4px 8px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main)}`;
  document.head.appendChild(s);
}

function getPlatform(): Platform {
  if (platform) return platform;
  const cfg = readAuthConfig();
  const auth = cfg ? createAuthService(cfg) : null;
  const client = auth ? getClient() : null;
  platform = createPlatform({
    auth,
    rpc: client ? async (fn, args) => { const r = await client.rpc(fn, args || {}); return { data: r.data, error: r.error }; } : null,
    storage: (() => { try { return window.localStorage; } catch { return null; } })(),
    // P2-0016: в Платформе 2.0 вход только почтой (+ демо); PIN — в старом приложении РБИ.
    pinActive: () => false
  });
  platform.subscribe(apply);
  if (auth && auth.onAuthChange) auth.onAuthChange(() => { void platform!.refresh(); });
  window.addEventListener('platform2:refresh', () => { void platform!.refresh(); });
  return platform;
}

function overlay(): HTMLElement | null { return document.getElementById(OVERLAY_ID); }

function showLogin(): void {
  const o = overlay();
  if (!o) return;
  ensureStyle();
  const host = o.querySelector('[data-p2-login-host]') as HTMLElement | null || o;
  const p = getPlatform();
  renderLoginScreen(host, {
    signIn: async (email, password) => {
      const res = await p.signIn(email, password);
      if (res.ok) goHome();
      return res;
    },
    onDemo: () => { p.chooseDemo(); go('#/planfact/vor'); }
  });
  o.classList.remove('hidden');
}

/** P2-0028: вошли временным паролем — «Придумайте пароль» поверх оболочки, дальше не пускает. */
let passwordShown = false;
function showPasswordScreen(email: string): void {
  const o = overlay();
  if (!o) return;
  ensureStyle();
  const host = o.querySelector('[data-p2-login-host]') as HTMLElement | null || o;
  const p = getPlatform();
  if (!passwordShown) {
    renderPasswordScreen(host, {
      email,
      change: async (pw) => {
        const res = await p.changePassword(pw);
        if (res.ok) goHome();
        return res;
      },
      signOut: () => { void p.signOut(); }
    });
    passwordShown = true;
  }
  o.classList.remove('hidden');
}

function hideLogin(): void {
  passwordShown = false;
  const o = overlay();
  if (o) o.classList.add('hidden');
}

/** После входа почтой — последний открытый модуль (P2-0030), если он доступен; иначе первый доступный, без модулей — Настройки. */
function goHome(): void {
  let last: string | null = null;
  try { last = window.localStorage.getItem(LAST_MODULE_HASH_KEY); } catch { /* нет localStorage — как раньше */ }
  go(homePathFor(getPlatform().access(), last));
}

function go(path: string): void {
  const r = w().AppRouter;
  if (r && typeof r.navigate === 'function') r.navigate(path, true); else window.location.hash = path;
}

/** «Компания: …» в «Настройки → Платформа» (вызывают Настройки при показе). Одна компания — переключателя нет. */
function renderCompanySwitch(host: HTMLElement | null): void {
  if (!host) return;
  const st = getPlatform().getState();
  ensureStyle();
  let sel = host.querySelector('select');
  if (st.mode !== 'email' || st.companies.length < 2) { if (sel) sel.remove(); return; }
  if (!sel) {
    sel = document.createElement('select');
    sel.className = 'p2-company-switch';
    sel.setAttribute('aria-label', 'Компания');
    sel.setAttribute('data-testid', 'p2-company-switch');
    sel.addEventListener('change', () => getPlatform().setCompany(sel!.value));
    host.appendChild(sel);
  }
  sel.replaceChildren(...st.companies.map((c) => { const o = document.createElement('option'); o.value = c.id; o.textContent = 'Компания: ' + c.name; return o; }));
  sel.value = st.companyId || '';
}

function apply(st: PlatformState): void {
  const r = rbi();
  r.platformMenuAccess = getPlatform().access();
  r.platform2 = api;
  window.dispatchEvent(new Event('rbi:platform-access'));
  const shell = r.services?.shell;
  if (shell && typeof shell.renderSidebar === 'function') shell.renderSidebar();
  if (shell && typeof shell.renderMobileModuleMenu === 'function') shell.renderMobileModuleMenu();
  const amm = w().AppModeManager;
  if (amm && typeof amm.renderBottomNav === 'function') amm.renderBottomNav();   // подвкладки: вошедшему почтой — без старого Quality
  if (st.mode === 'email' && st.email) {
    const cur = st.companies.find((c) => c.id === st.companyId);
    showShellUser(st.fullName || st.email, cur ? cur.name + (cur.roles[0] ? ' · ' + cur.roles[0] : '') : (st.isPlatformAdmin ? 'администратор платформы' : ''));
  } else {
    restoreShellUser();
  }
  if (st.mode === 'email' && st.mustChangePassword && st.email) { showPasswordScreen(st.email); return; }   // сначала свой пароль
  if (st.mode === 'none') { passwordShown = false; showLogin(); } else hideLogin();
  postCacheAllowlist();
  void applyQuality(st);
}

let slotWired = false;
/** Вход устройства для кэша закрытых файлов: «компания:пользователь» (пусто — без компании). */
function currentSlot(): string {
  const ls = window.localStorage, company = ls.getItem(QUALITY_COMPANY_KEY) || '';
  return company ? company + ':' + (ls.getItem(QUALITY_USER_KEY) || '') : '';
}

/** Качество и Стройконтроль при входе почтой: синхронизация в хранилище компании (P2-0016). */
async function applyQuality(st: PlatformState): Promise<void> {
  try {
    const cfg = readAuthConfig();
    const pc = getClient();
    await applyQualityBridge(st, {
      win: window as never,
      store: window.localStorage,
      reload: () => window.location.reload(),
      platformClient: pc,
      cfg,
      createClient: createClient as never,
      serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker as never : null,
      dropDatabase: (name) => { try { indexedDB.deleteDatabase(name); } catch { /* нет IndexedDB — нечего удалять */ } },
      listProjects: async (companyId) => {
        const svc = createProjectsService();   // объекты — из ядра (src/platform/core)
        const rows = svc ? await svc.listProjects(companyId) : [];
        return rows.filter((p) => !p.archived_at).map((p): QualityProject => ({ id: p.id, name: p.name }));
      }
    });
    // P2-0018: кэшу приложения — текущий «компания + пользователь» (закрытые файлы другого входа он удалит).
    const slot = currentSlot();
    if ('serviceWorker' in navigator) {
      const sw = navigator.serviceWorker;
      if (sw.controller) sw.controller.postMessage({ type: 'P2_STORAGE_SLOT', slot });
      // кэш приложения сменился (первая загрузка после обновления / жёсткой перезагрузки) — сообщить слот ему
      if (!slotWired) { slotWired = true; sw.addEventListener('controllerchange', () => { sw.controller?.postMessage({ type: 'P2_STORAGE_SLOT', slot: currentSlot() }); }); }
    }
    const shell = rbi().services?.shell;
    if (shell && typeof shell.renderSidebar === 'function') shell.renderSidebar();
    if (shell && typeof shell.renderMobileModuleMenu === 'function') shell.renderMobileModuleMenu();
  } catch (e) {
    console.warn('[Platform2] Качество: подключение к хранилищу компании не удалось', e);
  }
}

/** Кэш приложения (sw.js): файлы модулей Platform 2.0 — только положенных этому входу, остальные удаляются. */
function postCacheAllowlist(): void {
  const sh = rbi().services?.shell as { isPlatformModuleAllowed?: (id: string) => boolean } | undefined;
  const a = getPlatform().access();
  const modules: string[] = [];
  if (sh && typeof sh.isPlatformModuleAllowed === 'function' && sh.isPlatformModuleAllowed('planfact')) modules.push('planfact');
  if (a.company) modules.push('company');
  if (a.platformAdmin) modules.push('platform-admin');
  try {
    const c = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (c) c.postMessage({ type: 'P2_SW_ALLOWLIST', modules });
  } catch { /* без кэша приложения — ничего */ }
}

/** Запуск при открытии (оболочка). Повторный вызов — то же состояние; экран входа показывается, если никто не вошёл. */
/** P2-0032: разовая чистка старого приложения РБИ на этом устройстве (не задерживает вход). */
function cleanupLegacy(): void {
  let store: Storage | null = null;
  try { store = window.localStorage; } catch { store = null; }
  void cleanupLegacyDevice({
    store,
    deleteDatabase: typeof indexedDB !== 'undefined' ? (n) => deleteIndexedDb(indexedDB, n) : null
  }).catch(() => { /* повтор при следующем открытии */ });
}

export function start(): Promise<PlatformState> {
  if (!started) { cleanupLegacy(); started = getPlatform().boot(); }
  else void started.then((st) => { if (st.mode === 'none') showLogin(); });
  return started;
}

export const api = {
  start,
  getState: (): PlatformState => getPlatform().getState(),
  access: () => getPlatform().access(),
  setCompany: (id: string): void => getPlatform().setCompany(id),
  refresh: (): Promise<PlatformState> => getPlatform().refresh(),
  /** «Выйти» (Настройки → Платформа, полоса раздела): сессия завершается, экран «Вход». */
  signOut: async (): Promise<void> => { await getPlatform().signOut(); },
  showLogin,
  renderCompanySwitch,
  /** P2-0028: «Настройки → Платформа → Мой профиль» (вызывают Настройки при показе). Не вошёл почтой — пусто. */
  renderMyProfile: (host: HTMLElement | null): void => {
    if (!host) return;
    const st = getPlatform().getState();
    if (st.mode !== 'email' || !st.email) { host.replaceChildren(); delete host.dataset.p2Profile; return; }
    const key = st.email + '|' + (st.fullName || '');
    if (host.dataset.p2Profile === key && host.firstChild) return;   // тот же человек — не перерисовывать (сообщение «Пароль сменён» остаётся)
    host.dataset.p2Profile = key;
    ensureStyle();
    drawMyProfile(host, { email: st.email, fullName: st.fullName || null, change: (pw) => getPlatform().changePassword(pw),
      saveName: st.userId ? (n) => getPlatform().setFullName(n) : undefined });
  },
  /** Вызов функции сервера от имени вошедшего (одно соединение платформы; раздел администрирования своего клиента не создаёт). */
  rpc: async (fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string } | null }> => {
    getPlatform();
    const c = getClient();
    if (!c) return { data: null, error: { message: 'Сервер не настроен' } };
    const r = await c.rpc(fn, args || {});
    return { data: r.data, error: r.error ? { message: r.error.message, code: r.error.code } : null };
  }
};
