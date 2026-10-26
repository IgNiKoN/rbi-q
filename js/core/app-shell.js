// app-shell.js — App Shell, Шаг 1 (§29, п.9): формализация существующей оболочки.
//
// ShellService — тонкие обёртки над уже существующими DOM-точками App Shell.
// Не переносит логику из views.js/app-mode-utils.js/layout.utils.js/notify.utils.js —
// только читает те же DOM-узлы / делегирует в существующие глобальные функции.

(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var SELECTED_MODULES_KEY = 'rbi_selected_business_modules';
  var BUSINESS_MODULES = [
    { id: 'quality', label: 'Качество' },
    { id: 'construction', label: 'Стройконтроль' },
    { id: 'knowledge', label: 'База знаний' }
  ];
  var PLACEHOLDER_MODULES = [
    { id: 'safety', label: 'Безопасность' },
    { id: 'warranty', label: 'Гарантия' },
    { id: 'tender', label: 'Тендерный отдел' },
    { id: 'standards', label: 'Стандарты (тех. решения)' },
    { id: 'schedule', label: 'Сроки' },
    { id: 'budget', label: 'Бюджет' }
  ];
  var pendingModuleSelection = null;

  /** P2-0013: как вошли — 'email' | 'pin' | 'demo' | 'none' (решает вход платформы js/dist/platform/platform.js). */
  function platformEntryMode() {
    var p2 = window.RBI && window.RBI.platform2;
    var st = p2 && typeof p2.getState === 'function' ? p2.getState() : null;
    return (st && st.mode) || 'none';
  }

  /**
   * P2-0013: модуль Platform 2.0 положен этому входу? Почта — модуль включён у выбранной компании и есть право (ответ сервера
   * pf_my_platform → RBI.platformMenuAccess[id]); демо — только модули с menu.demo (разбор ВОР без сервера); PIN и «никто» — нет.
   * Единственное место правила для меню, адреса и загрузки модуля.
   */
  function isPlatformModuleAllowed(id) {
    var mode = platformEntryMode();
    if (mode === 'email') {
      var access = (window.RBI && window.RBI.platformMenuAccess) || {};
      return access[id] === true;
    }
    if (mode === 'demo') {
      var loader = window.RBI && window.RBI.moduleLoader;
      var m = loader && typeof loader.getById === 'function' ? loader.getById(id) : null;
      return !!(m && m.menu && m.menu.demo === true);
    }
    return false;
  }

  /**
   * Platform 2.0: пункты меню модулей из manifest (menu.section 'platform', enabled !== false) — только положенные (isPlatformModuleAllowed).
   * Единая точка: новый модуль появляется в меню без правок оболочки. Клик — через data-path (router).
   */
  function getPlatformMenuItems() {
    var loader = window.RBI && window.RBI.moduleLoader;
    if (!loader || typeof loader.getMenuItems !== 'function') return [];
    var access = (window.RBI && window.RBI.platformMenuAccess) || {};
    return loader.getMenuItems().filter(function (item) {
      if (item.section !== 'platform' || !item.path) return false;
      if (!isPlatformModuleAllowed(item.id)) return false;
      if (item.requiresAccess && access[item.id] !== true) return false;  // право подтверждает сервер (раздел ставит флаг)
      return true;
    });
  }

  /**
   * P2-0030: пункт платформы на экране сейчас (План/Факт…) — по началу hash; null — экран старого Quality.
   * Настройки — служебный раздел текущего модуля: пока они открыты, остаётся тот пункт, с которого в них пришли.
   */
  var lastPlatformPath = null;
  function currentPlatformItem() {
    var hash = String(location.hash || '');
    var items = getPlatformMenuItems();
    var i;
    for (i = 0; i < items.length; i++) {
      if (hash.indexOf(items[i].path) === 0) { lastPlatformPath = items[i].path; return items[i]; }
    }
    if (!/^#\/(quality\/)?settings(\/|$)/i.test(hash)) { lastPlatformPath = null; return null; }
    for (i = 0; i < items.length; i++) if (items[i].path === lastPlatformPath) return items[i];
    return null;
  }

  function businessModuleLabels() {
    return {
      quality: _navLabel('quality', 'Качество'),
      construction: _navLabel('construction', 'Стройконтроль'),
      knowledge: _navLabel('knowledge', 'База знаний'),
      'construction-v2': _navLabel('construction_v2', 'Стройконтроль в2 (тест)')
    };
  }

  // Место .mobile-module-menu-wrap в шапке (комментарий-якорь), куда она возвращается из #mobile-module-strip.
  var mobileMenuWrapAnchor = null;

  /**
   * P2-0016: модуль старого Quality (quality, construction, construction-v2, knowledge) в меню этого входа?
   * Почта — если модуль включён у текущей компании и положен человеку (RBI.platformMenuAccess, ответ сервера) и мост
   * синхронизации с хранилищем компании подключён (RBI.qualitySync). P2-0031: «База знаний» — тоже по выключателю компании
   * (сервер даёт её при включённом Качестве и праве quality.view, 038), «ИИ-помощник» (ai) — по выключателю и праву quality.ai.
   * Демо и «никто» — как раньше.
   */
  function legacyModuleAllowed(id) {
    if (platformEntryMode() !== 'email') return true;
    var access = (window.RBI && window.RBI.platformMenuAccess) || {};
    var base = id === 'construction-v2' ? 'construction' : id;
    if (base !== 'quality' && base !== 'construction' && base !== 'knowledge' && base !== 'ai') return false;
    return access[base] === true && !!(window.RBI && window.RBI.qualitySync);
  }

  /**
   * P2-0021: число на пункте меню («красная точка»). Модуль сообщает числа: setNavBadges(scope, { '<путь>': n, 'module:<id>': n }) —
   * путь — пункт подвкладок (нижний таббар, nav2), 'module:<id>' — пункт модуля в боковом меню и в мобильном меню модулей.
   * 0 / нет числа — без точки; > 99 — «99+». setNavBadges(scope, null) — убрать числа модуля. Без чисел меню прежнее.
   */
  var navBadgesByScope = {};
  var NAV_BADGE_STYLE_ID = 'shell-nav-badge-style';
  var NAV_BADGE_CSS =
    '.shell-nav-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;' +
    'border-radius:8px;background:var(--color-red);color:var(--white);font-size:10px;font-weight:700;line-height:1;box-sizing:border-box;' +
    'pointer-events:none;font-variant-numeric:tabular-nums}' +
    '.has-shell-nav-badge{position:relative}' +
    '#main-bottom-nav .shell-nav-badge,#app-sidebar .shell-nav-badge{position:absolute;top:2px;left:calc(50% + 4px)}' +
    '#app-nav2 .shell-nav-badge,#mobile-module-menu .shell-nav-badge{margin-left:auto}';

  function navBadgeCount(key) {
    var sum = 0;
    Object.keys(navBadgesByScope).forEach(function (s) {
      var n = Number(navBadgesByScope[s][key]);
      if (isFinite(n) && n > 0) sum += Math.floor(n);
    });
    return sum;
  }

  function navBadgeText(n) {
    return n > 99 ? '99+' : String(n);
  }

  function ensureNavBadgeStyle() {
    if (document.getElementById(NAV_BADGE_STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = NAV_BADGE_STYLE_ID;
    st.textContent = NAV_BADGE_CSS;
    (document.head || document.body).appendChild(st);
  }

  /** Рисует точки на уже отрисованных пунктах: боковое меню, мобильное меню модулей, нижний таббар, nav2. */
  function paintNavBadges() {
    var hasAny = Object.keys(navBadgesByScope).length > 0;
    var els = document.querySelectorAll('#app-sidebar [data-path], #mobile-module-menu [data-path], #main-bottom-nav [data-path], #app-nav2 [data-path]');
    if (hasAny) ensureNavBadgeStyle();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var old = el.querySelector('.shell-nav-badge');
      if (old) old.remove();
      el.classList.remove('has-shell-nav-badge');
      if (!hasAny) continue;
      var mod = el.getAttribute('data-sidebar-module-id') || el.getAttribute('data-menu-module-id');
      var key = mod ? 'module:' + mod : el.getAttribute('data-path');
      var n = navBadgeCount(key);
      if (n <= 0) continue;
      var b = document.createElement('span');
      b.className = 'shell-nav-badge';
      b.textContent = navBadgeText(n);
      b.setAttribute('aria-label', 'Требует участия: ' + n);
      el.classList.add('has-shell-nav-badge');
      el.appendChild(b);
    }
  }

  function setNavBadges(scope, map) {
    if (!scope) return;
    if (map && typeof map === 'object') navBadgesByScope[scope] = Object.assign({}, map);
    else delete navBadgesByScope[scope];
    paintNavBadges();
  }

  function _i18n() {
    return window.RBI && window.RBI.services && window.RBI.services.i18n;
  }

  /** Label for module id via i18n key nav.<id> (hyphens → underscores); fallback to Russian literal. */
  function _navLabel(id, fallback) {
    var i18n = _i18n();
    if (i18n && typeof i18n.t === 'function') {
      var key = 'nav.' + String(id).replace(/-/g, '_');
      var tr = i18n.t(key);
      if (tr && tr !== key) return tr;
    }
    return fallback;
  }

  function _placeholderSuffix() {
    var i18n = _i18n();
    if (i18n && typeof i18n.t === 'function') {
      var tr = i18n.t('nav.placeholder_suffix');
      if (tr && tr !== 'nav.placeholder_suffix') return tr;
    }
    return ' \u2014 \u0432 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0435';
  }

  function defaultBusinessModuleIds() {
    return BUSINESS_MODULES.map(function (m) { return m.id; });
  }

  function isValidBusinessModuleId(id) {
    return BUSINESS_MODULES.some(function (m) { return m.id === id; });
  }

  // Реальный список бизнес-модулей, разрешённых текущей роли (§29 п.10в) —
  // читает permission.service.js, fallback на весь список BUSINESS_MODULES,
  // если сервис недоступен (не должно происходить в норме).
  function getRoleAllowedBusinessModuleIds() {
    if (window.RBI && window.RBI.services && window.RBI.services.permissions &&
      typeof window.RBI.services.permissions.getAllowedModules === 'function') {
      return window.RBI.services.permissions.getAllowedModules();
    }
    return defaultBusinessModuleIds();
  }

  var ShellService = {
    platformEntryMode: platformEntryMode,
    isPlatformModuleAllowed: isPlatformModuleAllowed,
    legacyModuleAllowed: legacyModuleAllowed,
    setNavBadges: setNavBadges,
    paintNavBadges: paintNavBadges,
    getContentRoot: function () {
      return document.getElementById('app-content');
    },
    getModalsRoot: function () {
      return document.getElementById('app-modals');
    },
    getHeaderEl: function () {
      return document.getElementById('main-header');
    },
    getBottomNavEl: function () {
      return document.getElementById('main-bottom-nav');
    },
    getNav2El: function () {
      return document.getElementById('app-nav2');
    },
    showToast: function (message) {
      if (typeof window.showToast === 'function') {
        return window.showToast(message);
      }
    },
    isOnline: function () {
      return navigator.onLine;
    },
    onOnlineStatusChange: function (handler) {
      if (typeof handler !== 'function') return;
      window.addEventListener('online', function () { handler(true); });
      window.addEventListener('offline', function () { handler(false); });
    },
    getSyncStatusEl: function () {
      return document.getElementById('header-sync-status');
    },
    getUserBlockEl: function () {
      return document.getElementById('header-user-block');
    },
    renderUserBlock: function (userContext) {
      var el = this.getUserBlockEl();
      if (el && userContext) {
        el.textContent = userContext.name + ' \u00b7 ' + userContext.role;
      }
      if (window.RBI && window.RBI.shellDesktop && typeof window.RBI.shellDesktop.renderDeskUser === 'function') {
        window.RBI.shellDesktop.renderDeskUser(userContext);
      }
    },
    renderCompanyBlock: function () {
      var header = this.getHeaderEl();
      var el = document.getElementById('header-company-block');
      if (!header || !el) return;
      var company = (window.RBI.services.company && typeof window.RBI.services.company.getCompany === 'function')
        ? window.RBI.services.company.getCompany()
        : null;
      if (!company) return;

      var syncEl = this.getSyncStatusEl();
      var online = this.isOnline();
      var suffix = '';
      if (!online) {
        var i18nOff = _i18n();
        if (i18nOff && typeof i18nOff.t === 'function') {
          var offTr = i18nOff.t('shell.offline_suffix');
          suffix = (offTr && offTr !== 'shell.offline_suffix') ? offTr : ' \u00b7 \u043e\u0444\u043b\u0430\u0439\u043d';
        } else {
          suffix = ' \u00b7 \u043e\u0444\u043b\u0430\u0439\u043d';
        }
      }
      el.textContent = company.name + suffix;
      if (syncEl) el.dataset.hasSyncIndicator = '1';
    },
    /**
     * P2-0013: при открытии решает вход платформы (js/dist/platform/platform.js) — кто вошёл (почта / PIN / демо);
     * никто — экран «Вход» поверх оболочки. Ключи старого Quality (rbi_auth_gate_seen) не читаются и не пишутся.
     */
    shouldShowAuthGate: function () {
      return true;
    },
    _platformEntry: null,
    loadPlatformEntry: function () {
      if (!this._platformEntry) {
        var url = new URL('./js/dist/platform/platform.js', document.baseURI).href;
        this._platformEntry = import(url).then(function (m) { return m.api; });
      }
      return this._platformEntry;
    },
    showAuthGate: function () {
      var el = document.getElementById('auth-gate-overlay');
      // Сразу закрыть экран, если на устройстве нет ни сессии, ни выбора «демо» (без мелькания оболочки).
      var known = false;
      try { known = !!(localStorage.getItem('platform2-auth') || localStorage.getItem('platform2_entry')); } catch (e) { /* ignore */ }
      if (el && !known) el.classList.remove('hidden');
      this.loadPlatformEntry().then(function (api) { return api.start(); }).catch(function (e) {
        console.error('[ShellService] вход платформы не загрузился', e);
        if (el) el.classList.remove('hidden');
      });
    },
    hideAuthGate: function () {
      var el = document.getElementById('auth-gate-overlay');
      if (el) el.classList.add('hidden');
      window.dispatchEvent(new Event('platform2:refresh'));   // вход по PIN завершён — вход платформы перечитывает состояние
    },
    showPlatformEntry: function () {
      var el = document.getElementById('platform-entry-modal');
      if (el) el.classList.remove('hidden');
      this.renderModuleSelection();
    },
    hidePlatformEntry: function () {
      var el = document.getElementById('platform-entry-modal');
      if (el) el.classList.add('hidden');
    },
    getSelectedModules: function () {
      var raw = localStorage.getItem(SELECTED_MODULES_KEY);
      if (!raw) return defaultBusinessModuleIds();
      try {
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return defaultBusinessModuleIds();
        var filtered = parsed.filter(isValidBusinessModuleId);
        return filtered.length > 0 ? filtered : defaultBusinessModuleIds();
      } catch (e) {
        return defaultBusinessModuleIds();
      }
    },
    setSelectedModules: function (ids) {
      var valid = (Array.isArray(ids) ? ids : []).filter(isValidBusinessModuleId);
      if (valid.length === 0) valid = defaultBusinessModuleIds();
      localStorage.setItem(SELECTED_MODULES_KEY, JSON.stringify(valid));
      this._updateModeSelectorOptions(valid);
      return valid;
    },
    /**
     * Peer-модуль knowledge только в knowledge-only наборе.
     * Если выбраны Качество и/или Стройконтроль — БЗ экран внутри них
     * (#/quality|construction/reference), не отдельный пункт rail/гамбургера.
     */
    isKnowledgePeerVisible: function (selectedIds) {
      var selected = Array.isArray(selectedIds) ? selectedIds : this.getSelectedModules();
      return selected.indexOf('knowledge') !== -1
        && selected.indexOf('quality') === -1
        && selected.indexOf('construction') === -1;
    },
    /**
     * Куда вести «База знаний» как вход: peer #/knowledge или экран host-модуля.
     * @returns {{ mode: string, path: string }}
     */
    resolveKnowledgeEntry: function (currentMode) {
      var selected = this.getSelectedModules();
      if (this.isKnowledgePeerVisible(selected)) {
        return { mode: 'knowledge', path: '#/knowledge' };
      }
      var mode = currentMode || null;
      var host = null;
      if (mode === 'quality' && selected.indexOf('quality') !== -1) host = 'quality';
      else if ((mode === 'construction' || mode === 'construction-v2')
        && selected.indexOf('construction') !== -1) host = 'construction';
      else if (selected.indexOf('quality') !== -1) host = 'quality';
      else if (selected.indexOf('construction') !== -1) host = 'construction';
      if (!host) return { mode: 'knowledge', path: '#/knowledge' };
      return {
        mode: host,
        path: host === 'quality' ? '#/quality/reference' : '#/construction/reference'
      };
    },
    // Sidebar icon-rail (App Shell, §29 п.9, вариант A) — вертикальный список иконок
    // переключения бизнес-модуля, видим только на ПК (>=768px, см. css/style.css).
    // Переиспользует те же данные, что renderModuleSelection(), другой рендер
    // (иконки+подпись, не grid карточек), 0 новой бизнес-логики переключения —
    // клик делегирует в существующую window.changeAppMode(id).
    renderSidebar: function () {
      var container = document.getElementById('app-sidebar');
      if (!container) return;

      var selected = this.getSelectedModules();
      var roleAllowedIds = getRoleAllowedBusinessModuleIds();
      var currentMode = (window.AppModeManager && window.AppModeManager.currentMode) || null;
      var knowledgePeer = this.isKnowledgePeerVisible(selected);

      var icons = {
        quality: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>',
        construction: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path>',
        'construction-v2': '<path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path>',
        knowledge: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>'
      };

      var html = '';
      var legacy = platformEntryMode() !== 'email';   // заглушки модулей — как раньше, не при входе почтой
      BUSINESS_MODULES.forEach(function (mod) {
        if (!legacyModuleAllowed(mod.id)) return;
        if (roleAllowedIds.indexOf(mod.id) === -1) return;
        if (selected.indexOf(mod.id) === -1) return;
        if (mod.id === 'knowledge' && !knowledgePeer) return;
        var isActive = currentMode === mod.id;
        var label = _navLabel(mod.id, mod.label);
        html += '<button type="button" data-sidebar-module-id="' + mod.id + '"' +
          ' onclick="window.changeAppMode(\'' + mod.id + '\')"' +
          ' class="app-sidebar-item' + (isActive ? ' active' : '') + '" title="' + label + '">' +
          '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">' + icons[mod.id] + '</svg>' +
          '<span class="app-sidebar-item-label">' + label + '</span>' +
          '</button>';
        // Тестовый вход construction-v2 — сразу под обычным Стройконтролем
        if (mod.id === 'construction') {
          var v2Active = currentMode === 'construction-v2';
          var v2Label = _navLabel('construction_v2', 'Стройконтроль в2 (тест)');
          html += '<button type="button" data-sidebar-module-id="construction-v2"' +
            ' onclick="window.changeAppMode(\'construction-v2\')"' +
            ' class="app-sidebar-item' + (v2Active ? ' active' : '') + '" title="' + v2Label + '">' +
            '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">' + icons['construction-v2'] + '</svg>' +
            '<span class="app-sidebar-item-label">' + v2Label + '</span>' +
            '</button>';
        }
      });
      getPlatformMenuItems().forEach(function (item) {
        var pActive = String(location.hash || '').indexOf(item.path) === 0;
        html += '<button type="button" data-sidebar-module-id="' + item.id + '" data-path="' + item.path + '"' +
          ' class="app-sidebar-item' + (pActive ? ' active' : '') + '" title="' + item.label + '">' +
          '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 14h18M10 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"></path></svg>' +
          '<span class="app-sidebar-item-label">' + item.label + '</span>' +
          '</button>';
      });
      if (legacy) PLACEHOLDER_MODULES.forEach(function (mod) {
        var phLabel = _navLabel(mod.id, mod.label);
        html += '<button type="button" data-shell-action="showPlaceholderModule" data-shell-action-arg="' + mod.id + '"' +
          ' class="app-sidebar-item app-sidebar-item--placeholder" title="' + phLabel + _placeholderSuffix() + '">' +
          '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><circle cx="12" cy="12" r="9"></circle></svg>' +
          '<span class="app-sidebar-item-label">' + phLabel + '</span>' +
          '</button>';
      });

      // Spacer + platform Settings (chrome, not a business module)
      var settingsActive = /^#\/settings(\/|$)/i.test(String(location.hash || ''))
        || /^#\/quality\/settings(\/|$)/i.test(String(location.hash || ''));
      var settingsLabel = _navLabel('settings', 'Настройки');
      html += '<div class="app-sidebar-spacer" aria-hidden="true"></div>';
      html += '<button type="button" data-path="#/settings" data-sidebar-settings="1"' +
        ' class="app-sidebar-item app-sidebar-item--settings' + (settingsActive ? ' active' : '') + '"' +
        ' title="' + settingsLabel + '">' +
        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>' +
        '</svg>' +
        '<span class="app-sidebar-item-label">' + settingsLabel + '</span>' +
        '</button>';

      container.innerHTML = html;
      paintNavBadges();
      // P2-0011: подсветка — по текущему маршруту (единое правило роутера), а не только по режиму
      if (window.AppRouter && typeof window.AppRouter.updateNavHighlight === 'function') window.AppRouter.updateNavHighlight(location.hash);
    },
    renderModuleSelection: function () {
      var container = document.getElementById('platform-entry-modules');
      if (!container) return;

      var selected = pendingModuleSelection || this.getSelectedModules();
      pendingModuleSelection = selected.slice();
      var roleAllowedIds = getRoleAllowedBusinessModuleIds();

      var html = '';
      BUSINESS_MODULES.forEach(function (mod) {
        if (roleAllowedIds.indexOf(mod.id) === -1) {
          html += '<div class="p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-[11px] font-bold uppercase text-center text-slate-400 dark:text-slate-500">' +
            _navLabel(mod.id, mod.label) + '</div>';
          return;
        }
        var isActive = selected.indexOf(mod.id) !== -1;
        html += '<button type="button" data-module-id="' + mod.id + '" onclick="window.RBI.services.shell.toggleModuleSelection(\'' + mod.id + '\')"' +
          ' class="platform-entry-card p-3 rounded-xl border text-[11px] font-bold uppercase text-center transition-colors ' +
          (isActive
            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700') +
          '">' + _navLabel(mod.id, mod.label) + '</button>';
      });
      var comingSoon = (function () {
        var i18nCs = _i18n();
        if (i18nCs && typeof i18nCs.t === 'function') {
          var cs = i18nCs.t('nav.coming_soon');
          if (cs && cs !== 'nav.coming_soon') return cs;
        }
        return 'Скоро';
      })();
      PLACEHOLDER_MODULES.forEach(function (mod) {
        html += '<div class="p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase text-center text-slate-400 dark:text-slate-500 relative">' +
          _navLabel(mod.id, mod.label) +
          '<span class="block mt-1 text-[8px] font-black text-indigo-400 normal-case">' + comingSoon + '</span></div>';
      });
      container.innerHTML = html;
    },
    toggleModuleSelection: function (moduleId) {
      if (!isValidBusinessModuleId(moduleId)) return;
      if (getRoleAllowedBusinessModuleIds().indexOf(moduleId) === -1) return;
      var current = pendingModuleSelection || this.getSelectedModules();
      var idx = current.indexOf(moduleId);
      if (idx !== -1) {
        if (current.length <= 1) return;
        current.splice(idx, 1);
      } else {
        current.push(moduleId);
      }
      pendingModuleSelection = current;
      this.renderModuleSelection();
    },
    applyModuleSelection: function () {
      var selection = pendingModuleSelection || this.getSelectedModules();
      this.setSelectedModules(selection);
      this.hidePlatformEntry();
      this.renderSidebar();
      this.renderMobileModuleMenu();
    },
    // Клик по disabled-разделу sidebar (§29 п.9, PLACEHOLDER_MODULES) — единая
    // заглушка "модуль не разработан" (js/core/views.js#showModePlaceholder),
    // без переключения AppModeManager.currentMode (см. rbi_showSidebarPlaceholder).
    showPlaceholderModule: function (moduleId) {
      if (typeof window.rbi_showSidebarPlaceholder === 'function') {
        window.rbi_showSidebarPlaceholder(moduleId);
      }
    },
    // Мобильный переключатель модулей (гамбургер, <768px) — тот же набор
    // пунктов, что desktop #app-sidebar (renderSidebar выше), но как выпадающий
    // список вместо icon-rail (на телефоне вертикальная панель слева не
    // помещается). Единая точка входа взамен старых #app-mode-selector-container
    // и кнопки "Выбрать модуль" (Platform Entry) — они скрыты на мобильных
    // через CSS (см. style.css, @media max-width:767px).
    renderMobileModuleMenu: function () {
      var container = document.getElementById('mobile-module-menu');
      if (!container) return;

      var selected = this.getSelectedModules();
      var roleAllowedIds = getRoleAllowedBusinessModuleIds();
      // P2-0030: на экране раздела платформы (План/Факт…) отмечен он, а не режим старого Quality
      var platformItem = currentPlatformItem();
      var currentMode = platformItem ? null : ((window.AppModeManager && window.AppModeManager.currentMode) || null);
      var knowledgePeer = this.isKnowledgePeerVisible(selected);

      var labels = businessModuleLabels();
      var html = '';

      var legacy = platformEntryMode() !== 'email';   // заглушки модулей — как раньше, не при входе почтой
      BUSINESS_MODULES.forEach(function (mod) {
        if (!legacyModuleAllowed(mod.id)) return;
        if (roleAllowedIds.indexOf(mod.id) === -1) return;
        if (selected.indexOf(mod.id) === -1) return;
        if (mod.id === 'knowledge' && !knowledgePeer) return;
        var isActive = currentMode === mod.id;
        html += '<button type="button" data-shell-action="selectMobileModule" data-shell-action-arg="' + mod.id + '"' +
          ' class="w-full text-left px-3.5 py-2.5 text-[11px] font-bold uppercase flex items-center justify-between gap-2 transition-colors ' +
          (isActive ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'text-slate-700 dark:text-slate-300') + '">' +
          '<span>' + (labels[mod.id] || _navLabel(mod.id, mod.label)) + '</span>' +
          (isActive ? '<span class="text-[8px] font-black text-indigo-500">●</span>' : '') +
          '</button>';
        if (mod.id === 'construction') {
          var v2Active = currentMode === 'construction-v2';
          html += '<button type="button" data-shell-action="selectMobileModule" data-shell-action-arg="construction-v2"' +
            ' class="w-full text-left px-3.5 py-2.5 text-[11px] font-bold uppercase flex items-center justify-between gap-2 transition-colors ' +
            (v2Active ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'text-slate-700 dark:text-slate-300') + '">' +
            '<span>' + labels['construction-v2'] + '</span>' +
            (v2Active ? '<span class="text-[8px] font-black text-indigo-500">●</span>' : '') +
            '</button>';
        }
      });

      getPlatformMenuItems().forEach(function (item) {
        var pActive = !!platformItem && platformItem.path === item.path;
        html += '<button type="button" data-path="' + item.path + '" data-menu-module-id="' + item.id + '"' +
          ' class="w-full text-left px-3.5 py-2.5 text-[11px] font-bold uppercase flex items-center justify-between gap-2 transition-colors ' +
          (pActive ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'text-slate-700 dark:text-slate-300') + '">' +
          '<span>' + item.label + '</span>' +
          (pActive ? '<span class="text-[8px] font-black text-indigo-500">●</span>' : '') +
          '</button>';
      });

      if (legacy) html += '<div class="border-t border-[var(--card-border)] my-1"></div>';

      if (legacy) PLACEHOLDER_MODULES.forEach(function (mod) {
        html += '<button type="button" data-shell-action="selectMobilePlaceholderModule" data-shell-action-arg="' + mod.id + '"' +
          ' class="w-full text-left px-3.5 py-2.5 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 opacity-70">' +
          _navLabel(mod.id, mod.label) + '</button>';
      });

      container.innerHTML = html;
      paintNavBadges();
    },
    toggleMobileModuleMenu: function () {
      var menu = document.getElementById('mobile-module-menu');
      if (!menu) return;
      var willOpen = menu.classList.contains('hidden');
      if (willOpen) {
        this.renderMobileModuleMenu();
        menu.classList.remove('hidden');
      } else {
        menu.classList.add('hidden');
      }
    },
    closeMobileModuleMenu: function () {
      var menu = document.getElementById('mobile-module-menu');
      if (menu) menu.classList.add('hidden');
    },
    // P2-0030: экраны без шапки #main-header (План/Факт, Настройки, Аналитика…) — на телефоне «☰» пропадал вместе
    // с ней. Тогда та же .mobile-module-menu-wrap (кнопка и список) переезжает в строку #mobile-module-strip над
    // содержимым, рядом — название текущего модуля; шапка снова видна — возвращается на место. На ПК строка скрыта (CSS).
    syncMobileModuleStrip: function () {
      var strip = document.getElementById('mobile-module-strip');
      var header = document.getElementById('main-header');
      var wrap = document.querySelector('.mobile-module-menu-wrap');
      if (!strip || !header || !wrap) return;
      if (!mobileMenuWrapAnchor && wrap.parentNode !== strip) {
        mobileMenuWrapAnchor = document.createComment('mobile-module-menu-wrap');
        wrap.parentNode.insertBefore(mobileMenuWrapAnchor, wrap);
      }
      var headerHidden = header.style.display === 'none' || window.getComputedStyle(header).display === 'none';
      if (headerHidden && wrap.parentNode !== strip) {
        this.closeMobileModuleMenu();
        strip.insertBefore(wrap, strip.firstChild);
      } else if (!headerHidden && wrap.parentNode === strip && mobileMenuWrapAnchor && mobileMenuWrapAnchor.parentNode) {
        this.closeMobileModuleMenu();
        mobileMenuWrapAnchor.parentNode.insertBefore(wrap, mobileMenuWrapAnchor.nextSibling);
      }
      strip.classList.toggle('is-on', headerHidden);
      var label = strip.querySelector('.mobile-module-strip-label');
      if (label) {
        var item = currentPlatformItem();
        var mode = (window.AppModeManager && window.AppModeManager.currentMode) || '';
        label.textContent = item ? item.label : (businessModuleLabels()[mode] || '');
      }
    },
    selectMobileModule: function (moduleId) {
      this.closeMobileModuleMenu();
      if (typeof window.changeAppMode === 'function') window.changeAppMode(moduleId);
    },
    selectMobilePlaceholderModule: function (moduleId) {
      this.closeMobileModuleMenu();
      this.showPlaceholderModule(moduleId);
    },
    _updateModeSelectorOptions: function (selectedIds) {
      var select = document.getElementById('app-mode-selector');
      var container = document.getElementById('app-mode-selector-container');
      if (!select) return;

      var labels = {
        quality: _navLabel('quality', 'Качество'),
        construction: _navLabel('construction', 'Стройконтроль'),
        knowledge: _navLabel('knowledge', 'База знаний'),
        'construction-v2': _navLabel('construction_v2', 'Стройконтроль в2 (тест)')
      };
      var currentValue = select.value;
      var knowledgePeer = this.isKnowledgePeerVisible(selectedIds);
      select.innerHTML = '';
      selectedIds.forEach(function (id) {
        if (id === 'knowledge' && !knowledgePeer) return;
        var opt = document.createElement('option');
        opt.value = id;
        opt.textContent = labels[id] || id;
        select.appendChild(opt);
        // Тестовый v2 — сразу под пунктом Стройконтроль
        if (id === 'construction') {
          var v2 = document.createElement('option');
          v2.value = 'construction-v2';
          v2.textContent = labels['construction-v2'];
          select.appendChild(v2);
        }
      });

      var optionValues = [...select.options].map(function (o) { return o.value; });
      if (optionValues.indexOf(currentValue) !== -1) {
        select.value = currentValue;
      } else {
        select.value = selectedIds[0];
      }

      if (container) {
        // >1 с учётом тестового v2 под construction
        container.style.display = select.options.length > 1 ? 'flex' : 'none';
      }
    },
    submitAuthGateConnect: function () {
      var self = this;
      function copyField(gateId, targetId) {
        var gateEl = document.getElementById(gateId);
        var targetEl = document.getElementById(targetId);
        if (!targetEl) {
          targetEl = document.createElement('input');
          targetEl.type = 'hidden';
          targetEl.id = targetId;
          document.body.appendChild(targetEl);
        }
        targetEl.value = gateEl ? gateEl.value : '';
      }
      copyField('gate-sync-name', 'sync-name');
      copyField('gate-sync-code', 'sync-code');
      copyField('gate-sync-pin', 'sync-pin');

      if (typeof window.initCloudConnection !== 'function') return;
      var btn = document.querySelector('[data-shell-action="submitAuthGateConnect"]');
      var result = window.initCloudConnection(btn);
      if (result && typeof result.then === 'function') {
        result.then(function () { self.hideAuthGate(); }).catch(function () { self.hideAuthGate(); });
      } else {
        self.hideAuthGate();
      }
    },
  };

  window.RBI = window.RBI || {};
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.shell = ShellService;
  if (window.RBI.registry && window.RBI.registry.register) {
    window.RBI.registry.register('core.shell', ShellService);
  }

  // Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
  // (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-shell-action).
  // Действия — методы window.RBI.services.shell, кроме checkForUpdates (bare window.*).
  // Файл сам себя инициализирует (IIFE) — биндится сразу здесь, без отдельного init(ctx).
  function bindShellActionDelegation() {
    if (window.__shellActionDelegationBound) return;
    window.__shellActionDelegationBound = true;

    var dispatch = function (el) {
      var action = el.dataset.shellAction;
      var fn = ShellService[action] || window[action];
      if (typeof fn !== 'function') return;
      var thisArg = ShellService[action] ? ShellService : window;
      var arg = el.dataset.shellActionArg;
      if (arg !== undefined) fn.call(thisArg, arg);
      else fn.call(thisArg);
    };

    var resolveActionElement = function (target) {
      var el = target;
      while (el && el.nodeType === 1) {
        if (el.dataset && el.dataset.shellAction) return el;
        var inlineOnclick = el.getAttribute && el.getAttribute('onclick');
        if (inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
        el = el.parentElement;
      }
      return null;
    };

    document.addEventListener('click', function (e) {
      var el = resolveActionElement(e.target);
      if (el) dispatch(el);
      // Закрываем мобильное меню модулей при клике вне его самого/кнопки —
      // тот же паттерн, что для стандартных выпадающих select в проекте.
      if (!e.target.closest('.mobile-module-menu-wrap')) {
        ShellService.closeMobileModuleMenu();
      }
    }, true);
  }
  bindShellActionDelegation();
  ShellService.renderSidebar();
  ShellService.renderMobileModuleMenu();

  // P2-0030: строка «☰» следит за шапкой — её прячут/показывают экраны (switchViewNode, План/Факт, Аналитика…)
  // и смена маршрута/ширины; несколько изменений подряд — одна проверка.
  (function wireMobileModuleStrip() {
    var queued = false;
    var sync = function () {
      if (queued) return;
      queued = true;
      var run = function () { queued = false; ShellService.syncMobileModuleStrip(); };
      window.setTimeout(run, 0);   // не requestAnimationFrame: в фоновой вкладке он не вызывается, строка «застревала»
    };
    var header = document.getElementById('main-header');
    if (header && typeof window.MutationObserver === 'function') {
      new window.MutationObserver(sync).observe(header, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    if (typeof window.MutationObserver === 'function') {
      new window.MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('hashchange', sync);
    window.addEventListener('rbi:route', sync);
    window.addEventListener('rbi:platform-access', sync);
    window.addEventListener('resize', sync);
    ShellService.syncMobileModuleStrip();
  })();

  // i18n — перерисовка chrome без reload
  if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
    window.RBI.events.on('i18n:localeChanged', function () {
      ShellService.renderSidebar();
      ShellService.renderMobileModuleMenu();
      ShellService.renderCompanyBlock();
      if (document.getElementById('platform-entry-modal') &&
          !document.getElementById('platform-entry-modal').classList.contains('hidden')) {
        ShellService.renderModuleSelection();
      }
      var selected = ShellService.getSelectedModules();
      ShellService._updateModeSelectorOptions(selected);
      var i18n = _i18n();
      if (i18n && typeof i18n.applyDom === 'function') i18n.applyDom(document);
      // Bottom-nav / nav2 labels come from renderBottomNav → t(), not path-map
      if (typeof window.AppModeManager !== 'undefined' &&
          window.AppModeManager &&
          typeof window.AppModeManager.renderBottomNav === 'function') {
        window.AppModeManager.renderBottomNav();
      }
      if (window.RBI && window.RBI.shellDesktop &&
          typeof window.RBI.shellDesktop.setModeChip === 'function') {
        var mode = (window.AppModeManager && window.AppModeManager.currentMode) || 'quality';
        window.RBI.shellDesktop.setModeChip(mode);
      }
      if (window.AppRouter && typeof window.AppRouter.updateNavHighlight === 'function') {
        window.AppRouter.updateNavHighlight(location.hash || '');
      }
    });
  }

  console.log('[ShellService] app-shell.js loaded');
}());
