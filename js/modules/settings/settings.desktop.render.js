/**
 * settings.desktop.render.js
 * Desktop Настройки (≥1280): платформенный split — rail секций | stage.
 * Mobile markup settings.render.js не переписывает.
 */

const DESKTOP_MIN = 1280;
const WIDE_CLASS = 'rbi-settings-desktop-wide';
const CSS_HREF = './css/settings.desktop.css';
const TAB_ID = 'tab-settings';

let _shellApplied = false;
let _hooksBound = false;
let _resizeBound = false;
let _localeBound = false;

const SECTION_KEYS = {
  platform: 'settings.section.platform',
  company: 'settings.section.company',
  'platform-admin': 'settings.section.platform_admin',
  admin: 'settings.section.admin',
  quality: 'settings.section.quality',
  construction: 'settings.section.construction'
};

const SECTION_FALLBACKS = {
  platform: 'Платформа',
  company: 'Компания',
  'platform-admin': 'Админ платформы',
  admin: 'Админ Качества',
  quality: 'Качество',
  construction: 'Стройконтроль'
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
  const key = SECTION_KEYS[id];
  if (!key) return id;
  return _t(key, SECTION_FALLBACKS[id] || id);
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
  if (window.AppRouter && typeof window.AppRouter.subTabIdFromPath === 'function') {
    return window.AppRouter.subTabIdFromPath(location.hash || '', '#/settings') || 'platform';
  }
  return 'platform';
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

function ensureDeskStructure() {
  const tab = document.getElementById(TAB_ID);
  if (!tab) return null;
  if (tab.querySelector('.settings-desk-body')) return tab;

  const sticky = tab.querySelector('.sticky-top-panel');
  const panels = tab.querySelector('.settings-panels');
  const subnav = document.getElementById('settings-subnav');
  if (!sticky || !panels || !subnav) return tab;

  // Strip: brand + platform chip + actions from sticky header row
  const strip = document.createElement('div');
  strip.className = 'settings-desk-topbar-strip rbi-desk-module-strip';
  strip.innerHTML =
    '<div class="settings-desk-topbar-strip-inner rbi-desk-module-strip-inner">' +
    '<div class="settings-desk-topbar-brand">' +
    '<span class="settings-desk-topbar-label" data-i18n="nav.settings">' +
    _escapeHtml(_t('nav.settings', 'Настройки')) + '</span>' +
    '<span class="rbi-chip" id="settings-desk-platform-chip" data-i18n="settings.strip_chip">' +
    _escapeHtml(_t('settings.strip_chip', 'Платформа')) + '</span>' +
    '<span class="settings-desk-topbar-sub" id="settings-desk-strip-sub"></span>' +
    '</div>' +
    '<div class="settings-desk-topbar-actions" id="settings-desk-strip-actions"></div>' +
    '</div>';

  const actionsHost = strip.querySelector('#settings-desk-strip-actions');
  const actionRow = sticky.querySelector('.flex.justify-between.items-center');
  if (actionRow && actionsHost) {
    const btns = actionRow.querySelector('.flex.items-center.gap-2.shrink-0');
    if (btns) actionsHost.appendChild(btns);
  }

  const body = document.createElement('div');
  body.className = 'settings-desk-body';

  const rail = document.createElement('nav');
  rail.className = 'settings-desk-rail';
  rail.setAttribute('aria-label', _t('settings.rail_aria', 'Разделы настроек'));
  rail.setAttribute('data-i18n', 'settings.rail_aria');
  rail.setAttribute('data-i18n-attr', 'aria-label');
  // Move subnav into rail (keep same buttons / handlers)
  const subWrap = subnav.parentElement;
  rail.appendChild(subnav);
  if (subWrap && subWrap !== sticky && subWrap.childNodes.length === 0) {
    try { subWrap.remove(); } catch (_) { /* ignore */ }
  }

  const stage = document.createElement('div');
  stage.className = 'settings-desk-stage';
  stage.appendChild(panels);

  body.appendChild(rail);
  body.appendChild(stage);

  sticky.replaceWith(strip);
  tab.appendChild(body);

  return tab;
}

function _escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
