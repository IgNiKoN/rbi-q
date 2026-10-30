/**
 * audit.desktop.render.js
 * Desktop Осмотр (≥1280):
 *  - шапка как Analytics: slim #app-desk-topbar, мобильный #main-header скрыт
 *  - chrome: селектор / УрК / поля объекта (те же DOM id)
 *  - body: чек-лист фикс. слева | план flex справа
 * Mobile audit.* / карточки пунктов не переписывает.
 */

import {
  repositionPlanPin,
  clearPin,
  updatePinIndicator
} from './features/quality-plan-pin.js';

const DESKTOP_MIN = 1280;
const SHELL_ID = 'audit-desktop-shell';
const CHROME_ID = 'audit-desktop-chrome';
const WORK_ID = 'audit-desktop-work';
const CHECK_ID = 'audit-desktop-check';
const PLAN_ID = 'audit-desktop-plan';
const CSS_HREF = './css/audit.desktop.css';
const WIDE_CLASS = 'rbi-audit-desktop-wide';

let _resizeBound = false;
let _hooksBound = false;
let _localeBound = false;
let _shellApplied = false;
let _previewToken = 0;
let _origRenderAudit = null;
let _chromeRO = null;

function _t(key, fallback, vars) {
  try {
    const i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
    if (i18n && typeof i18n.t === 'function') {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_) { /* ignore */ }
  if (vars && typeof fallback === 'string') {
    return fallback.replace(/\{(\w+)\}/g, function (_, name) {
      return vars[name] != null ? String(vars[name]) : '{' + name + '}';
    });
  }
  return fallback;
}

function isDesktopViewport() {
  return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN;
}

function isQualityMode() {
  try {
    if (window.AppModeManager && window.AppModeManager.currentMode) {
      return window.AppModeManager.currentMode === 'quality';
    }
  } catch (_) { /* ignore */ }
  return /#\/quality\//i.test(String(location.hash || ''));
}

function isAuditActive() {
  if (!isQualityMode()) return false;
  const hash = String(location.hash || '');
  // Hash — источник истины. Fallthrough на stale #tab-audit.active
  // (markup монтируется с active по умолчанию / до AppRouter) захватывал
  // shell поверх Инженера/Аналитики после F5.
  if (hash && hash !== '#') {
    return /#\/quality\/audit(\/|$|\?)/i.test(hash) || /^#\/quality\/audit$/i.test(hash);
  }
  const tab = document.getElementById('tab-audit');
  return !!(tab && tab.classList.contains('active'));
}

function ensureDesktopCss() {
  if (document.querySelector('link[data-audit-desktop-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.setAttribute('data-audit-desktop-css', '1');
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

function setMobileAuditHeaderVisible(on) {
  const header = document.getElementById('main-header');
  if (!header) return;
  header.style.display = on ? 'block' : 'none';
  if (typeof window.updateBodyPadding === 'function') {
    try { window.updateBodyPadding(); } catch (_) { /* ignore */ }
  }
}

function getPlanPin() {
  const st = window.AuditState;
  if (st && typeof st.getPlanPin === 'function') return st.getPlanPin();
  return null;
}

function locations() {
  const rbi = window.RBI;
  return (rbi && rbi.services && rbi.services.locations) || null;
}

const DESK_FIELD_LABELS = [
  ['inp-contractor', 'quality.audit.field.contractor', 'Подрядчик'],
  ['inp-project', 'quality.audit.field.project', 'Объект'],
  ['inp-section', 'quality.audit.field.building', 'Корпус'],
  ['inp-floor', 'quality.audit.field.floor', 'Этаж'],
  ['inp-room', 'quality.audit.field.room', 'Оси / помещение']
];

function decorateDeskFields() {
  DESK_FIELD_LABELS.forEach(function (pair) {
    const id = pair[0];
    const text = _t(pair[1], pair[2]);
    const inp = document.getElementById(id);
    if (!inp || !inp.parentElement) return;
    const wrap = inp.parentElement;
    wrap.classList.add('audit-desk-field');
    const existing = wrap.querySelector(':scope > .audit-desk-field-label');
    if (existing) {
      existing.textContent = text;
      return;
    }
    const lab = document.createElement('label');
    lab.className = 'audit-desk-field-label';
    lab.htmlFor = id;
    lab.textContent = text;
    wrap.insertBefore(lab, wrap.firstChild);
  });
}

function undecorateDeskFields() {
  document.querySelectorAll('.audit-desk-field-label').forEach(function (el) {
    if (el.closest('.audit-desk-zone-tpl') && !el.closest('.audit-desk-field')) return;
    if (el.closest('#header-checklist-container')) return;
    el.remove();
  });
  document.querySelectorAll('.audit-desk-field').forEach(function (el) {
    el.classList.remove('audit-desk-field');
  });
  const selSpan = document.querySelector('#header-checklist-container > span');
  if (selSpan) {
    selSpan.className = 'text-rbi-caption font-bold text-brand uppercase flex items-center gap-1.5';
    selSpan.textContent = _t('quality.audit.checklist.chevron', 'Чек-лист ▾');
  }
  const expanded = document.getElementById('dash-expanded-view');
  if (expanded) expanded.classList.add('hidden');
}

function moveHeaderPiecesIntoChrome(chrome) {
  if (!chrome) return;
  // slotCheck живёт в .audit-desk-topbar-strip — теперь отдельном от chrome
  // прямом ребёнке shell (см. ensureShell), поэтому ищем от document, не от chrome.
  const slotCheck = document.querySelector('[data-audit-desk-slot-checklist]');
  const slotDash = document.querySelector('[data-audit-desk-slot-dash]');
  const slotData = chrome.querySelector('[data-audit-desk-slot-data]');
  const slotNav = chrome.querySelector('[data-audit-desk-slot-nav]');

  const checklist = document.getElementById('header-checklist-container');
  const dash = document.getElementById('header-dashboard');
  const data = document.getElementById('header-data-block');
  const nav = document.getElementById('audit-group-nav');

  if (slotCheck && checklist && checklist.parentElement !== slotCheck) {
    slotCheck.appendChild(checklist);
  }
  if (slotDash && dash && dash.parentElement !== slotDash) {
    slotDash.appendChild(dash);
  }
  if (slotData && data) {
    const content = document.getElementById('data-block-content');
    if (content && slotData && content.parentElement !== slotData) {
      slotData.appendChild(content);
    }
  }
  if (slotNav && nav && nav.parentElement !== slotNav) {
    slotNav.appendChild(nav);
  }
  decorateDeskFields();
  // На desk всегда показываем коэффициенты
  const expanded = document.getElementById('dash-expanded-view');
  if (expanded) expanded.classList.remove('hidden');
}

function restoreHeaderPieces() {
  undecorateDeskFields();

  const modeBox = document.getElementById('app-mode-selector-container');
  const right = modeBox && modeBox.parentElement;
  const inner = document.getElementById('header-inner');
  const checklist = document.getElementById('header-checklist-container');
  const dash = document.getElementById('header-dashboard');
  const data = document.getElementById('header-data-block');
  const content = document.getElementById('data-block-content');
  const nav = document.getElementById('audit-group-nav');

  if (right && checklist && checklist.parentElement !== right) {
    right.appendChild(checklist);
  }
  if (inner && dash) {
    const topRow = inner.querySelector('.header-top-row');
    if (topRow && topRow.nextSibling !== dash) {
      if (topRow.nextSibling) inner.insertBefore(dash, topRow.nextSibling);
      else inner.appendChild(dash);
    } else if (!dash.parentElement || dash.parentElement !== inner) {
      inner.appendChild(dash);
    }
  }
  if (inner && data && data.parentElement !== inner) {
    inner.appendChild(data);
  }
  if (data && content && content.parentElement !== data) {
    data.appendChild(content);
  }
  if (data && nav && nav.parentElement !== data) {
    data.appendChild(nav);
  }
}

function ensureShell() {
  const appRoot = document.getElementById('app-root');
  const tab = document.getElementById('tab-audit');
  if (!appRoot || !tab) return null;

  let shell = document.getElementById(SHELL_ID);
  // Старая раскладка без side / без единой headstrip — пересобрать
  if (shell && (!document.getElementById('audit-desktop-side')
      || !shell.querySelector('.audit-desk-topbar-strip'))) {
    restoreHeaderPieces();
    if (tab.parentElement !== appRoot) {
      appRoot.insertBefore(tab, shell);
    }
    shell.remove();
    shell = null;
  }

  if (!shell) {
    shell = document.createElement('div');
    shell.id = SHELL_ID;

    // Strip — отдельный от chrome прямой ребёнок shell (не вложен в короткий
    // .audit-desk-chrome), чтобы containing block для position:sticky был
    // высотой всего shell (chrome + work с длинным чек-листом), а не только
    // короткой chrome-секции — иначе sticky «кончается» на границе chrome
    // и полоса уезжает под #app-desk-topbar при скролле длинного чек-листа.
    const strip = document.createElement('div');
    strip.className = 'audit-desk-topbar-strip';
    strip.setAttribute('data-audit-desk-topbar-strip', '');
    strip.innerHTML = ''
      + '<div class="audit-desk-topbar-strip-inner">'
      + '  <div class="audit-desk-topbar-brand">'
      + '    <span class="audit-desk-topbar-label">' + _t('quality.desk.audit.strip_label', 'Осмотр') + '</span>'
      + '    <span class="audit-desk-topbar-sub" data-audit-desk-chrome-sub>' + _t('quality.desk.audit.strip_sub_pick', 'Выберите чек-лист') + '</span>'
      + '  </div>'
      + '  <div class="audit-desk-topbar-tpl" data-audit-desk-slot-checklist></div>'
      + '</div>';

    // Компактная шапка (как строка фильтров у Аналитики): 1 плоская карточка,
    // без заголовков/подсказок над блоками — строка полей объекта, ниже (если
    // есть) строка групп пунктов чек-листа.
    const chrome = document.createElement('section');
    chrome.id = CHROME_ID;
    chrome.className = 'audit-desk-chrome';
    chrome.innerHTML = ''
      + '<div class="audit-desk-chrome-body">'
      + '  <div class="audit-desk-chrome-row audit-desk-chrome-row-fields" data-audit-desk-slot-data></div>'
      + '  <div class="audit-desk-chrome-row audit-desk-chrome-row-groups" data-audit-desk-slot-nav-wrap>'
      + '    <div data-audit-desk-slot-nav></div>'
      + '  </div>'
      + '</div>';

    const work = document.createElement('div');
    work.id = WORK_ID;
    work.className = 'audit-desk-work';

    const check = document.createElement('div');
    check.id = CHECK_ID;

    const side = document.createElement('div');
    side.id = 'audit-desktop-side';
    side.className = 'audit-desk-side';

    const plan = document.createElement('aside');
    plan.id = PLAN_ID;
    plan.className = 'audit-desk-plan';
    plan.innerHTML = ''
      + '<div class="audit-desk-plan-toolbar">'
      + '  <h3 class="audit-desk-plan-title">' + _t('quality.desk.audit.plan_title', 'План этажа') + '</h3>'
      + '  <span class="audit-desk-plan-meta" data-audit-desk-plan-meta></span>'
      + '  <button type="button" class="audit-desk-btn" data-audit-desk-move-pin hidden>' + _t('quality.desk.audit.plan_move', 'Переставить') + '</button>'
      + '  <button type="button" class="audit-desk-btn" data-audit-desk-clear-pin hidden>' + _t('quality.desk.audit.plan_clear', 'Снять') + '</button>'
      + '</div>'
      + '<div class="audit-desk-plan-stage" data-audit-desk-plan-stage>'
      + '  <div class="audit-desk-plan-empty" data-audit-desk-plan-empty data-empty-kind="nopin">'
      + '    <div class="audit-desk-plan-art" aria-hidden="true">'
      + '      <svg viewBox="0 0 240 168" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '        <rect x="12" y="12" width="216" height="144" rx="6" class="audit-desk-plan-art-frame"/>'
      + '        <path d="M12 56h216M12 112h216M80 12v144M160 12v144" class="audit-desk-plan-art-grid"/>'
      + '        <rect x="28" y="28" width="40" height="20" rx="2" class="audit-desk-plan-art-room"/>'
      + '        <rect x="92" y="28" width="56" height="20" rx="2" class="audit-desk-plan-art-room"/>'
      + '        <rect x="172" y="28" width="40" height="20" rx="2" class="audit-desk-plan-art-room"/>'
      + '        <rect x="28" y="72" width="56" height="28" rx="2" class="audit-desk-plan-art-room"/>'
      + '        <rect x="108" y="72" width="48" height="28" rx="2" class="audit-desk-plan-art-room"/>'
      + '        <rect x="172" y="72" width="40" height="28" rx="2" class="audit-desk-plan-art-room"/>'
      + '        <rect x="28" y="120" width="184" height="20" rx="2" class="audit-desk-plan-art-room"/>'
      + '        <circle cx="132" cy="86" r="7" class="audit-desk-plan-art-pin"/>'
      + '        <circle cx="132" cy="86" r="3" class="audit-desk-plan-art-pin-core"/>'
      + '      </svg>'
      + '    </div>'
      + '    <div class="audit-desk-plan-empty-copy">'
      + '      <div class="audit-desk-plan-empty-title">' + _t('quality.desk.audit.plan_empty_nopin_title', 'План не выбран') + '</div>'
      + '      <p>' + _t('quality.desk.audit.plan_empty_nopin_hint', 'Нажмите «на плане» рядом с полем осей — откроется выбор этажа и точка на чертеже.') + '</p>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    const metrics = document.createElement('section');
    metrics.id = 'audit-desktop-metrics';
    metrics.className = 'audit-desk-metrics';
    metrics.innerHTML = ''
      + '<div class="audit-desk-metrics-head">'
      + '  <h3 class="audit-desk-metrics-title">' + _t('quality.desk.audit.metrics_title', 'УрК и коэффициенты') + '</h3>'
      + '  <p class="audit-desk-metrics-hint">' + _t('quality.desk.audit.metrics_hint', 'Подрядчик · изделие · формулы расчёта') + '</p>'
      + '</div>'
      + '<div data-audit-desk-slot-dash></div>';

    side.appendChild(plan);
    side.appendChild(metrics);
    work.appendChild(check);
    work.appendChild(side);
    shell.appendChild(strip);
    shell.appendChild(chrome);
    shell.appendChild(work);
  }

  if (shell.parentElement !== appRoot) {
    if (tab.parentElement === appRoot) {
      appRoot.insertBefore(shell, tab);
    } else {
      appRoot.insertBefore(shell, appRoot.firstChild);
    }
  }

  const chrome = document.getElementById(CHROME_ID);
  moveHeaderPiecesIntoChrome(chrome);

  // Убрать дубли «Выбрать план» из старой разметки просмотрщика
  document.querySelectorAll('[data-audit-desk-pick-plan]').forEach(function (el) {
    el.remove();
  });

  const checkHost = document.getElementById(CHECK_ID);
  if (checkHost && tab.parentElement !== checkHost) {
    checkHost.appendChild(tab);
  }

  if (!shell._auditDeskBound) {
    shell._auditDeskBound = true;
    shell.addEventListener('click', onPlanToolbarClick);
  }

  syncChromeSubtitle();
  return shell;
}

function syncChromeSubtitle() {
  const label = document.getElementById('current-checklist-label');
  const raw = (label && label.textContent || '').trim();
  const noneLabel = _t('quality.desk.audit.strip_sub_none', 'Не выбран');
  const name = raw && !/не выбран|not selected|nije izabrano/i.test(raw) ? raw : noneLabel;

  const sub = document.querySelector('[data-audit-desk-chrome-sub]');
  if (sub) {
    sub.textContent = name === noneLabel
      ? _t('quality.desk.audit.strip_sub_pick', 'Выберите чек-лист')
      : name;
  }

  const selSpan = document.querySelector('#header-checklist-container > span');
  if (selSpan) {
    selSpan.className = 'audit-desk-tpl-face';
    selSpan.innerHTML = ''
      + '<span class="audit-desk-tpl-name">' + escapeHtml(name) + '</span>'
      + '<span class="audit-desk-tpl-chev" aria-hidden="true">▾</span>';
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function onPlanToolbarClick(e) {
  const move = e.target.closest('[data-audit-desk-move-pin]');
  const clr = e.target.closest('[data-audit-desk-clear-pin]');
  if (move) {
    e.preventDefault();
    repositionPlanPin();
    return;
  }
  if (clr) {
    e.preventDefault();
    clearPin();
    if (typeof window.showToast === 'function') {
      window.showToast(_t('quality.audit.plan.pin_cleared', 'Точка на плане снята'));
    }
    updatePinIndicator();
    paintPlanPanel();
  }
}

function restoreTabAudit() {
  restoreHeaderPieces();

  const appRoot = document.getElementById('app-root');
  const tab = document.getElementById('tab-audit');
  const shell = document.getElementById(SHELL_ID);
  if (appRoot && tab && tab.parentElement !== appRoot) {
    if (shell && shell.parentElement === appRoot) {
      appRoot.insertBefore(tab, shell);
    } else {
      appRoot.insertBefore(tab, appRoot.firstChild);
    }
  }
  if (shell && shell.parentElement) {
    shell.remove();
  }
}

function planEmptyHtml(kind) {
  const titles = {
    nopin: _t('quality.desk.audit.plan_empty_nopin_title', 'План не выбран'),
    nopdf: _t('quality.desk.audit.plan_empty_nopdf_title', 'Нет PDF у этажа'),
    nopdfjs: _t('quality.desk.audit.plan_empty_nopdfjs_title', 'Превью недоступно'),
    fail: _t('quality.desk.audit.plan_empty_fail_title', 'Не удалось загрузить план')
  };
  const hints = {
    nopin: _t('quality.desk.audit.plan_empty_nopin_hint', 'Нажмите «на плане» рядом с полем осей — откроется выбор этажа и точка на чертеже.'),
    nopdf: _t('quality.desk.audit.plan_empty_nopdf_hint', 'Выберите другой этаж через «на плане» в форме объекта.'),
    nopdfjs: _t('quality.desk.audit.plan_empty_nopdfjs_hint', 'PDF.js не загружен. Откройте точку через «на плане» в форме.'),
    fail: _t('quality.desk.audit.plan_empty_fail_hint', 'Повторите через «на плане» в форме объекта.')
  };
  const title = titles[kind] || titles.nopin;
  const hint = hints[kind] || hints.nopin;
  // Схематичный «чертёж» — декоративная заглушка, не настоящий план
  const art = ''
    + '<div class="audit-desk-plan-art" aria-hidden="true">'
    + '  <svg viewBox="0 0 240 168" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '    <rect x="12" y="12" width="216" height="144" rx="6" class="audit-desk-plan-art-frame"/>'
    + '    <path d="M12 56h216M12 112h216M80 12v144M160 12v144" class="audit-desk-plan-art-grid"/>'
    + '    <rect x="28" y="28" width="40" height="20" rx="2" class="audit-desk-plan-art-room"/>'
    + '    <rect x="92" y="28" width="56" height="20" rx="2" class="audit-desk-plan-art-room"/>'
    + '    <rect x="172" y="28" width="40" height="20" rx="2" class="audit-desk-plan-art-room"/>'
    + '    <rect x="28" y="72" width="56" height="28" rx="2" class="audit-desk-plan-art-room"/>'
    + '    <rect x="108" y="72" width="48" height="28" rx="2" class="audit-desk-plan-art-room"/>'
    + '    <rect x="172" y="72" width="40" height="28" rx="2" class="audit-desk-plan-art-room"/>'
    + '    <rect x="28" y="120" width="184" height="20" rx="2" class="audit-desk-plan-art-room"/>'
    + '    <circle cx="132" cy="86" r="7" class="audit-desk-plan-art-pin"/>'
    + '    <circle cx="132" cy="86" r="3" class="audit-desk-plan-art-pin-core"/>'
    + '  </svg>'
    + '</div>';
  return ''
    + '<div class="audit-desk-plan-empty" data-audit-desk-plan-empty data-empty-kind="' + kind + '">'
    + art
    + '  <div class="audit-desk-plan-empty-copy">'
    + '    <div class="audit-desk-plan-empty-title">' + title + '</div>'
    + '    <p>' + hint + '</p>'
    + '  </div>'
    + '</div>';
}

function paintPlanPanel() {
  const stage = document.querySelector('[data-audit-desk-plan-stage]');
  const meta = document.querySelector('[data-audit-desk-plan-meta]');
  const moveBtn = document.querySelector('[data-audit-desk-move-pin]');
  const clearBtn = document.querySelector('[data-audit-desk-clear-pin]');
  if (!stage) return;

  const pin = getPlanPin();
  if (moveBtn) moveBtn.hidden = !pin;
  if (clearBtn) clearBtn.hidden = !pin;

  if (!pin || pin.x == null || pin.y == null) {
    if (meta) meta.textContent = '';
    stage.innerHTML = planEmptyHtml('nopin');
    return;
  }

  const loc = locations();
  const floor = loc && typeof loc.getNode === 'function' ? loc.getNode(pin.locationId) : null;
  const plan = loc && typeof loc.getPlanForFloor === 'function'
    ? loc.getPlanForFloor(pin.locationId)
    : null;
  if (meta) {
    const floorName = (floor && (floor.name || floor.title))
      || pin.locationId
      || _t('quality.audit.plan.floor_fallback', 'этаж');
    meta.textContent = plan && plan.pdf_url
      ? (floorName + ' ' + _t('quality.audit.plan.pin_meta', '· точка {x}% / {y}%', {
        x: Math.round(pin.x),
        y: Math.round(pin.y)
      }))
      : (floorName + ' ' + _t('quality.audit.plan.no_pdf', '· PDF нет'));
  }

  if (!plan || !plan.pdf_url) {
    stage.innerHTML = planEmptyHtml('nopdf');
    return;
  }

  const token = ++_previewToken;
  stage.innerHTML = '<div class="audit-desk-plan-loader">' + _t('quality.desk.audit.plan_loading', 'Загрузка плана…') + '</div>';
  renderPdfPreview(stage, plan.pdf_url, pin, token);
}

async function renderPdfPreview(stage, pdfUrl, pin, token) {
  let pdfjs = null;
  try { pdfjs = window.rbiPdfjs ? await window.rbiPdfjs() : window.pdfjsLib; } catch (_e) { pdfjs = null; }
  if (token !== _previewToken) return;
  if (!pdfjs) {
    stage.innerHTML = planEmptyHtml('nopdfjs');
    return;
  }

  try {
    const doc = await pdfjs.getDocument(pdfUrl).promise;
    if (token !== _previewToken) return;
    const page = await doc.getPage(1);
    if (token !== _previewToken) return;

    const base = page.getViewport({ scale: 1 });
    const avail = Math.max(280, (stage.clientWidth || 480) - 16);
    const scale = Math.min(1.5, avail / base.width);
    const viewport = page.getViewport({ scale: scale });

    const wrap = document.createElement('div');
    wrap.className = 'audit-desk-plan-canvas-wrap';
    wrap.style.width = viewport.width + 'px';

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrap.appendChild(canvas);

    const pinEl = document.createElement('div');
    pinEl.className = 'audit-desk-plan-pin';
    pinEl.style.left = pin.x + '%';
    pinEl.style.top = pin.y + '%';
    wrap.appendChild(pinEl);

    stage.innerHTML = '';
    stage.appendChild(wrap);

    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: viewport
    }).promise;
  } catch (e) {
    if (token !== _previewToken) return;
    console.warn('[audit.desktop] plan preview failed', e);
    stage.innerHTML = planEmptyHtml('fail');
  }
}

// Chrome (объект проверки + группы пунктов) закреплён (position: sticky) —
// высота динамическая (группы могут занимать 1-2 строки), поэтому реальную
// высоту пишем в CSS-переменную на shell: от неё зависит top у .audit-desk-side,
// иначе план заезжал бы под закреплённую шапку.
function syncChromeHeightVar() {
  const shell = document.getElementById(SHELL_ID);
  const chrome = document.getElementById(CHROME_ID);
  if (!shell || !chrome) return;
  const h = chrome.offsetHeight || 0;
  shell.style.setProperty('--audit-desk-chrome-h', h + 'px');
}

function bindChromeResizeObserver() {
  const chrome = document.getElementById(CHROME_ID);
  if (!chrome || _chromeRO) return;
  if (typeof ResizeObserver !== 'function') return;
  _chromeRO = new ResizeObserver(function () {
    syncChromeHeightVar();
  });
  _chromeRO.observe(chrome);
}

export function showAuditDesktop() {
  if (!isDesktopViewport() || !isAuditActive()) {
    teardownAuditDesktop();
    return;
  }
  setWideLayout(true);
  setMobileAuditHeaderVisible(false);
  const shell = ensureShell();
  if (!shell) return;
  _shellApplied = true;
  // Catalog/locale may become ready after first shell build (DOMContentLoaded race).
  try { refreshAuditDeskChromeI18n(); } catch (_) { /* ignore */ }
  paintPlanPanel();
  bindChromeResizeObserver();
  syncChromeHeightVar();
}

export function teardownAuditDesktop() {
  _previewToken += 1;
  const auditStill = isAuditActive();

  if (_chromeRO) {
    try { _chromeRO.disconnect(); } catch (_) { /* ignore */ }
    _chromeRO = null;
  }

  if (_shellApplied) {
    restoreTabAudit();
    _shellApplied = false;
  } else {
    // Orphan shell после гонки (show до снятия .active) — убрать без wide.
    const shell = document.getElementById(SHELL_ID);
    if (shell && !auditStill) {
      try { restoreHeaderPieces(); } catch (_) { /* ignore */ }
      const appRoot = document.getElementById('app-root');
      const tab = document.getElementById('tab-audit');
      if (appRoot && tab && tab.parentElement !== appRoot) {
        appRoot.insertBefore(tab, shell);
      }
      shell.remove();
    }
  }

  setWideLayout(false);

  // Вернуть мобильную шапку только если Осмотр ещё активен (mobile / уход с desk)
  if (auditStill && !isDesktopViewport()) {
    setMobileAuditHeaderVisible(true);
  }
  // desktop+active → showAuditDesktop вернёт wide; другая вкладка → switchViewNode
}

function syncAuditDesktop() {
  if (isDesktopViewport() && isAuditActive()) {
    showAuditDesktop();
  } else {
    teardownAuditDesktop();
  }
}

function refreshAuditDeskChromeI18n() {
  if (!_shellApplied || !document.getElementById(SHELL_ID)) return;

  const label = document.querySelector('.audit-desk-topbar-label');
  if (label) label.textContent = _t('quality.desk.audit.strip_label', 'Осмотр');

  const planTitle = document.querySelector('.audit-desk-plan-title');
  if (planTitle) planTitle.textContent = _t('quality.desk.audit.plan_title', 'План этажа');
  const moveBtn = document.querySelector('[data-audit-desk-move-pin]');
  if (moveBtn) moveBtn.textContent = _t('quality.desk.audit.plan_move', 'Переставить');
  const clearBtn = document.querySelector('[data-audit-desk-clear-pin]');
  if (clearBtn) clearBtn.textContent = _t('quality.desk.audit.plan_clear', 'Снять');

  const empty = document.querySelector('[data-audit-desk-plan-empty]');
  if (empty) {
    const kind = empty.getAttribute('data-empty-kind') || 'nopin';
    const titleEl = empty.querySelector('.audit-desk-plan-empty-title');
    const hintEl = empty.querySelector('.audit-desk-plan-empty-copy p');
    const titles = {
      nopin: _t('quality.desk.audit.plan_empty_nopin_title', 'План не выбран'),
      nopdf: _t('quality.desk.audit.plan_empty_nopdf_title', 'Нет PDF у этажа'),
      nopdfjs: _t('quality.desk.audit.plan_empty_nopdfjs_title', 'Превью недоступно'),
      fail: _t('quality.desk.audit.plan_empty_fail_title', 'Не удалось загрузить план')
    };
    const hints = {
      nopin: _t('quality.desk.audit.plan_empty_nopin_hint', 'Нажмите «на плане» рядом с полем осей — откроется выбор этажа и точка на чертеже.'),
      nopdf: _t('quality.desk.audit.plan_empty_nopdf_hint', 'Выберите другой этаж через «на плане» в форме объекта.'),
      nopdfjs: _t('quality.desk.audit.plan_empty_nopdfjs_hint', 'PDF.js не загружен. Откройте точку через «на плане» в форме.'),
      fail: _t('quality.desk.audit.plan_empty_fail_hint', 'Повторите через «на плане» в форме объекта.')
    };
    if (titleEl) titleEl.textContent = titles[kind] || titles.nopin;
    if (hintEl) hintEl.textContent = hints[kind] || hints.nopin;
  }

  const loader = document.querySelector('.audit-desk-plan-loader');
  if (loader) loader.textContent = _t('quality.desk.audit.plan_loading', 'Загрузка плана…');

  const metricsTitle = document.querySelector('.audit-desk-metrics-title');
  if (metricsTitle) metricsTitle.textContent = _t('quality.desk.audit.metrics_title', 'УрК и коэффициенты');
  const metricsHint = document.querySelector('.audit-desk-metrics-hint');
  if (metricsHint) metricsHint.textContent = _t('quality.desk.audit.metrics_hint', 'Подрядчик · изделие · формулы расчёта');

  decorateDeskFields();

  const meta = document.querySelector('[data-audit-desk-plan-meta]');
  const pin = getPlanPin();
  if (meta && pin && pin.x != null && pin.y != null) {
    const loc = locations();
    const floor = loc && typeof loc.getNode === 'function' ? loc.getNode(pin.locationId) : null;
    const plan = loc && typeof loc.getPlanForFloor === 'function'
      ? loc.getPlanForFloor(pin.locationId)
      : null;
    const floorName = (floor && (floor.name || floor.title))
      || pin.locationId
      || _t('quality.audit.plan.floor_fallback', 'этаж');
    meta.textContent = plan && plan.pdf_url
      ? (floorName + ' ' + _t('quality.audit.plan.pin_meta', '· точка {x}% / {y}%', {
        x: Math.round(pin.x),
        y: Math.round(pin.y)
      }))
      : (floorName + ' ' + _t('quality.audit.plan.no_pdf', '· PDF нет'));
  }

  syncChromeSubtitle();
}

function bindLocale() {
  if (_localeBound) return;
  _localeBound = true;
  if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
    window.RBI.events.on('i18n:localeChanged', function () {
      try { refreshAuditDeskChromeI18n(); } catch (_) { /* ignore */ }
    });
  }
}

function bindHooks() {
  if (_hooksBound) return;
  _hooksBound = true;

  document.addEventListener('quality:planPin:changed', function () {
    if (_shellApplied) paintPlanPanel();
  });

  // Label / template changes
  document.addEventListener('change', function (e) {
    if (!_shellApplied) return;
    if (e.target && (e.target.id === 'checklist-selector' || e.target.id === 'fake-checklist-selector')) {
      queueMicrotask(syncChromeSubtitle);
    }
  });

  window.addEventListener('hashchange', function () {
    queueMicrotask(function () {
      setTimeout(syncAuditDesktop, 0);
      setTimeout(syncAuditDesktop, 80);
    });
  });

  // AppRouter.navigate использует replaceState — hashchange не всегда приходит.
  if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
    window.RBI.events.on('appMode:changed', function () {
      queueMicrotask(function () {
        setTimeout(syncAuditDesktop, 0);
        setTimeout(syncAuditDesktop, 100);
      });
    });
  }

  if (window.AppViews && typeof window.AppViews.renderAudit === 'function') {
    _origRenderAudit = window.AppViews.renderAudit;
    window.AppViews.renderAudit = function () {
      const r = _origRenderAudit.apply(this, arguments);
      queueMicrotask(syncAuditDesktop);
      return r;
    };
  }

  document.addEventListener('click', function (e) {
    const nav = e.target.closest('[data-route], .app-nav2-item, .nav-item, [href*="audit"], [href*="analytics"]');
    if (nav) queueMicrotask(function () { setTimeout(syncAuditDesktop, 50); });
  });
}

function bindResize() {
  if (_resizeBound) return;
  _resizeBound = true;
  let t = null;
  window.addEventListener('resize', function () {
    if (t) clearTimeout(t);
    t = setTimeout(syncAuditDesktop, 120);
  });
}

function boot() {
  bindHooks();
  bindResize();
  bindLocale();
  if (!_origRenderAudit && window.AppViews && typeof window.AppViews.renderAudit === 'function') {
    _origRenderAudit = window.AppViews.renderAudit;
    window.AppViews.renderAudit = function () {
      const r = _origRenderAudit.apply(this, arguments);
      queueMicrotask(syncAuditDesktop);
      return r;
    };
  }
  syncAuditDesktop();
  setTimeout(syncAuditDesktop, 400);
  setTimeout(syncAuditDesktop, 1200);
  // quality грузится на window.load после AppRouter — повторить после platform:ready
  if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
    window.RBI.events.on('platform:ready', function () {
      queueMicrotask(function () {
        setTimeout(syncAuditDesktop, 0);
        setTimeout(syncAuditDesktop, 200);
      });
    });
  }
  window.addEventListener('load', function () {
    setTimeout(syncAuditDesktop, 0);
    setTimeout(syncAuditDesktop, 300);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

window.__auditDesktop = {
  show: showAuditDesktop,
  teardown: teardownAuditDesktop,
  sync: syncAuditDesktop,
  paintPlan: paintPlanPanel,
  isDesktop: isDesktopViewport,
  isShellApplied: function () { return !!_shellApplied; }
};
