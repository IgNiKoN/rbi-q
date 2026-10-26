// app-shell.desktop.js — Desktop App Shell B: nav2 + slim topbar (≥1280).
// Icon-rail (#app-sidebar) остаётся отдельно (≥768, style.css).
// Mobile / tablet 768–1279: rail + bottom-nav, без nav2.

(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  /** Порог Shell B (nav2 / desk topbar). Согласован с Analytics DESKTOP_MIN. */
  var NAV2_MIN = 1280;

  var MODE_LABEL_KEYS = {
    quality: 'nav.quality',
    construction: 'nav.construction',
    'construction-v2': 'nav.construction_v2'
  };
  var MODE_LABEL_FALLBACKS = {
    quality: 'Качество',
    construction: 'Стройконтроль',
    'construction-v2': 'СК в2'
  };

  function _t(key, fallback) {
    var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
    if (i18n && typeof i18n.t === 'function') {
      var tr = i18n.t(key);
      if (tr && tr !== key) return tr;
    }
    return fallback;
  }

  function modeLabel(modeId) {
    // Модуль платформы (window.RBI.platformNav): название задаёт сам модуль
    if (modeId === 'platform') {
      var pn = window.RBI && window.RBI.platformNav;
      return (pn && pn.title) || '';
    }
    // P2-0013: вошедшему почтой режимы старого Quality не показываются (модуль не открыт — без названия)
    var sh = window.RBI && window.RBI.services && window.RBI.services.shell;
    if (sh && typeof sh.platformEntryMode === 'function' && sh.platformEntryMode() === 'email'
        && !(typeof sh.legacyModuleAllowed === 'function' && sh.legacyModuleAllowed(modeId))) return '';
    var key = MODE_LABEL_KEYS[modeId];
    if (!key) return modeId || '';
    return _t(key, MODE_LABEL_FALLBACKS[modeId] || modeId || '');
  }

  /** Snapshot for legacy readers of MODE_LABELS (RU fallbacks; prefer modeLabel()). */
  var MODE_LABELS = {
    quality: MODE_LABEL_FALLBACKS.quality,
    construction: MODE_LABEL_FALLBACKS.construction,
    'construction-v2': MODE_LABEL_FALLBACKS['construction-v2']
  };

  function fillNav2(html, modeId) {
    var nav2 = document.getElementById('app-nav2');
    if (!nav2) return;

    // Сохраняем FAB демо, если он уже внутри nav2 (innerHTML его уничтожит)
    var fab = document.getElementById('fab-exit-demo');
    if (fab && nav2.contains(fab)) {
      document.body.appendChild(fab);
    }

    if (html) {
      var label = modeLabel(modeId);
      // Настройки — platform chrome (низ #app-sidebar), не экран модуля
      var cleaned = String(html).replace(
        /<div class="nav-item"[^>]*data-path="#\/settings"[^>]*>[\s\S]*?<\/div>\s*/g,
        ''
      );
      var nav2Html = cleaned
        .replace(/\bclass="nav-item"/g, 'class="app-nav2-item"')
        .replace(/<span class="nav-text">/g, '<span class="app-nav2-text">');
      nav2.innerHTML =
        '<div class="app-nav2-label-row">' +
        '<div class="app-nav2-label">' + label + '</div>' +
        '</div>' + nav2Html;
      // Desktop: short KB → full "Knowledge base" via i18n key (no RU-only regex)
      var kbFull = _t('nav.bottom.knowledge_full', 'База знаний');
      var kbItems = nav2.querySelectorAll(
        '[data-path="#/quality/reference"] .app-nav2-text, [data-path="#/construction/reference"] .app-nav2-text, [data-path="#/knowledge"] .app-nav2-text'
      );
      for (var i = 0; i < kbItems.length; i++) {
        kbItems[i].textContent = kbFull;
      }
      nav2.hidden = false;
    } else {
      nav2.innerHTML = '';
      nav2.hidden = true;
    }

    setModeChip(modeId);
    syncDemoExitPlacement();
    // P2-0021: числа на пунктах меню — после перерисовки нижнего таббара и nav2
    var sh = window.RBI && window.RBI.services && window.RBI.services.shell;
    if (sh && typeof sh.paintNavBadges === 'function') sh.paintNavBadges();
  }

  /** Демо-выход: на ≥1280 — в шапке nav2 рядом с названием модуля; иначе fixed FAB. */
  function syncDemoExitPlacement() {
    var fab = document.getElementById('fab-exit-demo');
    if (!fab) return;

    var inDemo = document.body.classList.contains('demo-mode');
    var nav2 = document.getElementById('app-nav2');
    var row = nav2 && nav2.querySelector('.app-nav2-label-row');
    var useNav2 = inDemo && row && document.body.classList.contains('has-app-nav2') &&
      nav2 && !nav2.hidden && window.innerWidth >= NAV2_MIN;

    if (useNav2) {
      fab.classList.add('fab-exit-demo--nav2');
      fab.classList.remove('hidden');
      fab.style.display = 'inline-flex';
      fab.style.pointerEvents = 'auto';
      fab.style.visibility = 'visible';
      fab.style.opacity = '1';
      var lab = fab.querySelector('.fab-exit-demo-label');
      if (lab) lab.textContent = _t('shell.demo.short', 'Демо');
      fab.title = _t('shell.demo.exit_nav_title', 'Выйти из демо-режима');
      if (fab.parentElement !== row) row.appendChild(fab);
    } else {
      fab.classList.remove('fab-exit-demo--nav2');
      if (fab.parentElement !== document.body) document.body.appendChild(fab);
      var lab2 = fab.querySelector('.fab-exit-demo-label');
      if (lab2) lab2.textContent = _t('shell.demo.exit', 'Выйти из демо');
      fab.title = _t('shell.demo.exit_title', 'Выйти из демо');
      if (inDemo) {
        fab.classList.remove('hidden');
        fab.style.display = 'flex';
        fab.style.pointerEvents = 'auto';
        fab.style.visibility = 'visible';
        fab.style.opacity = '1';
      } else {
        fab.classList.add('hidden');
        fab.style.display = 'none';
      }
    }
  }

  function setModeChip(modeId) {
    var modeChip = document.getElementById('desk-mode-chip');
    if (modeChip) {
      var name = modeLabel(modeId) || '—';
      var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
      if (i18n && typeof i18n.t === 'function') {
        var tr = i18n.t('nav.module_chip', { name: name });
        if (tr && tr !== 'nav.module_chip') {
          modeChip.textContent = tr;
          syncDemoExitPlacement();
          return;
        }
      }
      modeChip.textContent = 'Модуль · ' + name;
    }
    syncDemoExitPlacement();
  }

  function updateChrome() {
    var nav2El = document.getElementById('app-nav2');
    var wideEnough = window.innerWidth >= NAV2_MIN;
    var hasNav2 = !!nav2El && wideEnough && !nav2El.hidden &&
      getComputedStyle(nav2El).display !== 'none';
    document.body.classList.toggle('has-app-nav2', hasNav2);

    var deskTopbar = document.getElementById('app-desk-topbar');
    var hasDeskTopbar = hasNav2 && !!deskTopbar;
    if (deskTopbar) deskTopbar.hidden = !hasDeskTopbar;
    document.body.classList.toggle('has-desk-topbar', hasDeskTopbar);

    syncDemoExitPlacement();
    return { hasNav2: hasNav2, hasDeskTopbar: hasDeskTopbar };
  }

  function renderDeskUser(userContext) {
    if (!userContext) return;
    var deskName = document.getElementById('desk-user-name');
    var deskAvatar = document.getElementById('desk-user-avatar');
    if (deskName) deskName.textContent = userContext.name || '';
    if (deskAvatar) {
      var parts = String(userContext.name || '').trim().split(/\s+/);
      var initials = parts.length >= 2
        ? (parts[0].charAt(0) + parts[1].charAt(0))
        : String(userContext.name || '?').slice(0, 2);
      deskAvatar.textContent = initials.toUpperCase();
    }
  }

  window.RBI = window.RBI || {};
  window.RBI.shellDesktop = {
    NAV2_MIN: NAV2_MIN,
    MODE_LABELS: MODE_LABELS,
    modeLabel: modeLabel,
    fillNav2: fillNav2,
    setModeChip: setModeChip,
    updateChrome: updateChrome,
    renderDeskUser: renderDeskUser,
    syncDemoExitPlacement: syncDemoExitPlacement
  };

  window.addEventListener('resize', function () {
    try { syncDemoExitPlacement(); } catch (_) { /* ignore */ }
  });
})();
