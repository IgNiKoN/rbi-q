/**
 * settings.desktop.render.js
 * Широкие «Настройки»: снимает ограничение ширины оболочки (#app-root) на время раздела.
 * P2-0048 этап 3: левая колонка разделов и раскладка по диапазонам — в самой разметке settings.render.js
 * (каркас варианта В, @container в css/settings.desktop.css); разметку здесь больше не перестраиваем.
 */

import { settingsKeyFromHash, DEFAULT_KEY } from './settings.routes.js';

/** P2-0048: с планшета (600) раздел занимает всю ширину — диапазоны раскладки считаются по ширине контейнера. */
const DESKTOP_MIN = 600;
const WIDE_CLASS = 'rbi-settings-desktop-wide';
const CSS_HREF = './css/settings.desktop.css';
const TAB_ID = 'tab-settings';

let _shellApplied = false;
let _hooksBound = false;
let _resizeBound = false;
let _localeBound = false;

// P2-0038: подписи подразделов двух зон (подзаголовок полосы ПК)
const SECTION_FALLBACKS = {
  home: 'Главная настроек',
  'my-profile': 'Личные · Мой профиль',
  'my-interface': 'Личные · Вид и удобство',
  'my-device': 'Личные · Данные на устройстве',
  'my-notifications': 'Личные · Уведомления',
  'my-quality': 'Личные · Осмотр',
  'my-help': 'Личные · Помощь и о программе',
  company: 'Компания',
  admin: 'Модули · Качество',
  'modules-planfact': 'Модули · План/Факт',
  'platform-admin': 'Платформа'
};

function _t(key, fallback) {
  const i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
  if (i18n && typeof i18n.t === 'function') {
    const tr = i18n.t(key);
    if (tr && tr !== key) return tr;
  }
  return fallback;
}

function sectionLabel(id) {
  return SECTION_FALLBACKS[id] || id;
}

function isDesktopViewport() {
  return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN;
}

function isSettingsActive() {
  const hash = String(location.hash || '');
  if (hash && hash !== '#') {
    return /#\/(?:quality\/)?settings(\/|$|\?)/i.test(hash)
      || /^#\/(?:quality\/)?settings$/i.test(hash);
  }
  const tab = document.getElementById(TAB_ID);
  return !!(tab && tab.classList.contains('active'));
}

function ensureDesktopCss() {
  if (document.querySelector('link[data-settings-desktop-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.setAttribute('data-settings-desktop-css', '1');
  document.head.appendChild(link);
}

function setWideLayout(on) {
  ensureDesktopCss();
  const root = document.getElementById('app-root');
  const body = document.body;
  if (on) {
    if (root) root.classList.add(WIDE_CLASS);
    if (body) body.classList.add(WIDE_CLASS);
  } else {
    if (root) root.classList.remove(WIDE_CLASS);
    if (body) body.classList.remove(WIDE_CLASS);
  }
}

function currentSectionId() {
  return settingsKeyFromHash(location.hash || '') || DEFAULT_KEY;
}

function syncStripSubtitle() {
  const el = document.getElementById('settings-desk-strip-sub');
  if (!el) return;
  const id = currentSectionId();
  el.textContent = sectionLabel(id);
}

/** Strip label / chip / rail aria / subtitle — без remount панелей. */
function applyDeskChromeI18n() {
  const label = document.querySelector('.settings-desk-topbar-label');
  if (label) label.textContent = _t('nav.settings', 'Настройки');
  const chip = document.getElementById('settings-desk-platform-chip');
  if (chip) chip.textContent = _t('settings.strip_chip', 'Платформа');
  const rail = document.querySelector('.settings-desk-rail');
  if (rail) rail.setAttribute('aria-label', _t('settings.rail_aria', 'Разделы настроек'));
  syncStripSubtitle();
}

/** P2-0048: каркас варианта В сам раскладывается по ширине — прежняя перестройка (rail | stage) не нужна. */
function ensureDeskStructure() {
  return document.getElementById(TAB_ID);
}

function restoreMobileStructure() {
  const tab = document.getElementById(TAB_ID);
  if (!tab || !tab.querySelector('.settings-desk-body')) return;

  const strip = tab.querySelector('.settings-desk-topbar-strip');
  const body = tab.querySelector('.settings-desk-body');

  // Desktop rail/stage wrap the mobile subnav/panels nodes — removing `.settings-desk-body`
  // wholesale (rail + stage) deletes the actual mobile content, not just the desktop chrome.
  // `#settings-subnav`/`.settings-panels` no longer exist afterward, so `rbiEnsureTabMarkup`'s
  // marker check fails on the next call and it rebuilds fresh mobile markup below — this is
  // required here (not optional), otherwise `#tab-settings` is left empty until a full route
  // re-entry (bug: resize desktop→mobile while on Settings without navigating away and back).
  if (strip) strip.remove();
  if (body) body.remove();

  if (typeof window.ensureSettingsMarkup === 'function') {
    window.ensureSettingsMarkup();
  }
  if (typeof window.renderSettingsTab === 'function') {
    window.renderSettingsTab();
  }
}

export function showSettingsDesktop() {
  if (!isDesktopViewport() || !isSettingsActive()) return;
  setWideLayout(true);
  ensureDeskStructure();
  _shellApplied = true;
  applyDeskChromeI18n();
  // Re-apply subsection so rail highlight matches hash
  const section = currentSectionId();
  if (typeof window.setSettingsSubsection === 'function') {
    window.setSettingsSubsection(section, { fromRouter: true, skipGate: section !== 'admin' });
  }
}

export function teardownSettingsDesktop() {
  const was = _shellApplied;
  _shellApplied = false;
  setWideLayout(false);
  if (was) {
    // Markup will be remounted by ensureSettingsMarkup after teardown wipe
    restoreMobileStructure();
  }
}

export function syncSettingsDesktop() {
  if (!isDesktopViewport()) {
    if (_shellApplied) teardownSettingsDesktop();
    return;
  }
  if (!isSettingsActive()) {
    if (_shellApplied) teardownSettingsDesktop();
    return;
  }
  showSettingsDesktop();
}

function bindHooks() {
  if (_hooksBound) return;
  _hooksBound = true;

  window.addEventListener('hashchange', function () {
    queueMicrotask(function () {
      setTimeout(syncSettingsDesktop, 0);
      setTimeout(syncSettingsDesktop, 80);
    });
  });

  if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
    window.RBI.events.on('appMode:changed', function () {
      queueMicrotask(function () {
        setTimeout(syncSettingsDesktop, 0);
        setTimeout(syncSettingsDesktop, 100);
      });
    });
  }
}

function bindLocale() {
  if (_localeBound) return;
  _localeBound = true;
  if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
    window.RBI.events.on('i18n:localeChanged', function () {
      try { applyDeskChromeI18n(); } catch (_) { /* ignore */ }
    });
  }
}

function bindResize() {
  if (_resizeBound) return;
  _resizeBound = true;
  let t = null;
  window.addEventListener('resize', function () {
    if (t) clearTimeout(t);
    t = setTimeout(syncSettingsDesktop, 120);
  });
}

function boot() {
  bindHooks();
  bindResize();
  bindLocale();
  // Keep strip subtitle in sync when subsection changes
  const wrapSet = function () {
    if (typeof window.setSettingsSubsection !== 'function' || window.setSettingsSubsection.__deskWrapped) return;
    const orig = window.setSettingsSubsection;
    window.setSettingsSubsection = function (key, opts) {
      const r = orig.apply(this, arguments);
      try { syncStripSubtitle(); } catch (_) { /* ignore */ }
      return r;
    };
    window.setSettingsSubsection.__deskWrapped = true;
  };
  wrapSet();
  setTimeout(wrapSet, 0);
  setTimeout(wrapSet, 500);
  queueMicrotask(syncSettingsDesktop);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

window.__settingsDesktop = {
  show: showSettingsDesktop,
  teardown: teardownSettingsDesktop,
  sync: syncSettingsDesktop,
  syncChrome: applyDeskChromeI18n
};

window.SettingsDesktopRender = window.__settingsDesktop;
