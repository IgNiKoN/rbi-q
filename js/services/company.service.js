// company.service.js — Minimal Company Context (§29, п.11)
//
// Config/context компании (single-tenant) — не multi-tenant engine.
// enabledModules — каталог business platform-modules (quality/construction/knowledge).
// knowledge — сквозной: при quality и/или construction всегда присутствует в каталоге
// (sanitize) и в init через BUNDLES; knowledge-only и empty shell [] допустимы.
// P2-0031: плашка «Модули платформы» (оверрайд appSettings.enabledModules на устройстве) убрана, сохранённый выбор
// не читается — модули компании включает администратор платформы (core.company_modules). Feature-of / construction-v2 —
// через BUNDLES в app.entry; settings — ALWAYS_INIT (platform chrome).
// app.entry режет init по availableModules (= enabled ∩ getAllowedModules)
// + бандлы + ALWAYS_INIT.
//
// §23 Блок 2: roleMatrixOverrides — company SoT в памяти (+ mirror в
// appSettings для offline UI). Cloud: таблица rbi_company_settings.
// Пустой '{}' / нет строки = права как DEFAULT ROLE_MATRIX в permission.service.
//
// «Указатель официальной версии» (редактор системных чек-листов, Блок 1):
// officialTemplates — company SoT в памяти (+ mirror в appSettings), своя
// колонка rbi_company_settings.official_templates, свой dirty-флаг —
// НЕ переиспользует переменные/колонку role_matrix_overrides (push — отдельный
// upsert-вызов, риск гонки двух функций одной строки).

(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var DEFAULT_ENABLED_MODULES = ['quality', 'construction', 'knowledge'];
  var COMPANY_ID = 'rbi';
  var SMOKE_MARKER = '__SMOKE_TEST__';

  /** In-memory company SoT for role matrix overrides. null = ещё не применяли cloud. */
  var _roleMatrixOverrides = null;
  var _roleMatrixDirty = false;
  var _roleMatrixUpdatedAt = null;

  /** In-memory company SoT for official template pointers. null = ещё не применяли cloud. */
  var _officialTemplates = null;
  var _officialTemplatesDirty = false;
  var _officialTemplatesUpdatedAt = null;

  function _settingsSvc() {
    return (window.RBI && window.RBI.services && window.RBI.services.settings) || null;
  }

  function _emit(name, payload) {
    try {
      if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
        window.RBI.events.emit(name, payload);
      }
    } catch (_e) { /* ignore */ }
  }

  function _cloneRoleOverrides(src) {
    var out = {};
    var raw = src && typeof src === 'object' && !Array.isArray(src) ? src : {};
    Object.keys(raw).forEach(function (key) {
      if (key === SMOKE_MARKER) {
        out[SMOKE_MARKER] = raw[SMOKE_MARKER];
        return;
      }
      var entry = raw[key];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      out[key] = Object.assign({}, entry);
      if (Array.isArray(entry.allowedModules)) {
        out[key].allowedModules = entry.allowedModules.slice();
      }
    });
    return out;
  }

  /** Meaningful SoT: at least one roleKey (не считая служебный smoke-маркер). */
  function _hasMeaningfulRoleKeys(map) {
    if (!map || typeof map !== 'object') return false;
    return Object.keys(map).some(function (k) {
      return k !== SMOKE_MARKER && map[k] && typeof map[k] === 'object';
    });
  }

  function _mirrorRoleOverridesLocal(map) {
    var safe = _cloneRoleOverrides(map);
    var svc = _settingsSvc();
    if (svc && typeof svc.set === 'function') {
      return Promise.resolve(svc.set('roleMatrixOverrides', safe)).then(function () {
        return true;
      });
    }
    if (window.appSettings) {
      window.appSettings.roleMatrixOverrides = safe;
      window.appSettings.settingsUpdatedAt = Date.now();
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  /**
   * Клонировать map указателей официальных версий: { systemKey: { type, ref,
   * version, updatedAt, updatedBy } }. Валидные записи только type 'system'|'user'.
   */
  function _cloneOfficialTemplates(src) {
    var out = {};
    var raw = src && typeof src === 'object' && !Array.isArray(src) ? src : {};
    Object.keys(raw).forEach(function (key) {
      var entry = raw[key];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      var type = entry.type === 'user' ? 'user' : (entry.type === 'system' ? 'system' : null);
      if (!type) return;
      out[key] = {
        type: type,
        ref: type === 'user' ? (entry.ref || null) : null,
        version: Number(entry.version) || 1,
        updatedAt: entry.updatedAt || null,
        updatedBy: entry.updatedBy || null
      };
    });
    return out;
  }

  function _mirrorOfficialTemplatesLocal(map) {
    var safe = _cloneOfficialTemplates(map);
    var svc = _settingsSvc();
    if (svc && typeof svc.set === 'function') {
      return Promise.resolve(svc.set('officialTemplates', safe)).then(function () {
        return true;
      });
    }
    if (window.appSettings) {
      window.appSettings.officialTemplates = safe;
      window.appSettings.settingsUpdatedAt = Date.now();
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  function _currentUserLabel() {
    try {
      if (window.appSettings && window.appSettings.inspectorName) {
        return String(window.appSettings.inspectorName);
      }
    } catch (_e) { /* ignore */ }
    return 'admin';
  }

  var CompanyService = {
    getDefaultEnabledModules: function () {
      return DEFAULT_ENABLED_MODULES.slice();
    },

    getCompany: function () {
      var enabled = DEFAULT_ENABLED_MODULES.slice();
      return {
        id: COMPANY_ID,
        name: 'RBI',
        enabledModules: enabled.slice()
      };
    },

    // --- §23 Блок 2: company role-matrix SoT ---

    getCompanyId: function () {
      return COMPANY_ID;
    },

    /**
     * Копия company-оверрайдов из памяти ({} если SoT ещё не задан).
     * Не включает fallback на local prefs — это делает permission.service.
     */
    getRoleMatrixOverrides: function () {
      return _cloneRoleOverrides(_roleMatrixOverrides || {});
    },

    /**
     * Есть ли company SoT с хотя бы одним roleKey (тогда он побеждает local).
     */
    hasCompanyRoleMatrixOverrides: function () {
      return _hasMeaningfulRoleKeys(_roleMatrixOverrides);
    },

    isRoleMatrixDirty: function () {
      return !!_roleMatrixDirty;
    },

    getRoleMatrixUpdatedAt: function () {
      return _roleMatrixUpdatedAt;
    },

    /**
     * Записать sparse overrides в company SoT + local mirror; пометить dirty для sync push.
     * @returns {Promise<{ error: string|null, overrides?: object }>}
     */
    setRoleMatrixOverrides: function (overrides) {
      var next = _cloneRoleOverrides(overrides);
      _roleMatrixOverrides = next;
      _roleMatrixDirty = true;
      _roleMatrixUpdatedAt = new Date().toISOString();
      try {
        localStorage.setItem('rbi_cloud_dirty', '1');
      } catch (_ls) { /* ignore */ }
      return _mirrorRoleOverridesLocal(next).then(function () {
        _emit('company:roleMatrixOverridesChanged', {
          overrides: _cloneRoleOverrides(next),
          source: 'local'
        });
        try {
          if (typeof window.triggerSync === 'function') {
            window.triggerSync('silent');
          }
        } catch (_sync) { /* ignore */ }
        return { error: null, overrides: _cloneRoleOverrides(next) };
      }).catch(function (e) {
        console.error('[CompanyService] setRoleMatrixOverrides', e);
        return { error: e && e.message ? e.message : 'persist_failed' };
      });
    },

    /**
     * Сброс company SoT → {} (DEFAULT в permission); dirty для push.
     * @returns {Promise<{ error: string|null, overrides?: object }>}
     */
    clearRoleMatrixOverrides: function () {
      return this.setRoleMatrixOverrides({});
    },

    /**
     * Применить оверрайды с cloud pull (без dirty). Пустой/null → очистить SoT.
     * Если локально dirty — не затирать (ожидаем push).
     * @returns {{ applied: boolean, skippedDirty?: boolean }}
     */
    applyRoleMatrixOverridesFromCloud: function (overrides, updatedAt) {
      if (_roleMatrixDirty) {
        return { applied: false, skippedDirty: true };
      }
      var next = _cloneRoleOverrides(overrides || {});
      _roleMatrixOverrides = next;
      _roleMatrixUpdatedAt = updatedAt || new Date().toISOString();
      _mirrorRoleOverridesLocal(next);
      _emit('company:roleMatrixOverridesChanged', {
        overrides: _cloneRoleOverrides(next),
        source: 'cloud'
      });
      return { applied: true };
    },

    /**
     * После успешного push — снять dirty (SoT уже в облаке).
     */
    markRoleMatrixSynced: function (updatedAt) {
      _roleMatrixDirty = false;
      if (updatedAt) _roleMatrixUpdatedAt = updatedAt;
    },

    /**
     * Пометить dirty вручную (редко; обычно setRoleMatrixOverrides).
     */
    markRoleMatrixDirty: function () {
      _roleMatrixDirty = true;
      _roleMatrixUpdatedAt = new Date().toISOString();
    },

    // --- Редактор системных чек-листов Блок 1: указатель официальной версии ---

    /**
     * Копия указателей официальных версий ({} если SoT ещё не задан).
     * Ключ — systemKey (ключ SYSTEM_TEMPLATES), значение —
     * { type: 'user', ref: userTemplateSlug, version, updatedAt, updatedBy }.
     * Отсутствие ключа = «Поставка» (нет оверрайда).
     */
    getOfficialTemplates: function () {
      return _cloneOfficialTemplates(_officialTemplates || {});
    },

    isOfficialTemplatesDirty: function () {
      return !!_officialTemplatesDirty;
    },

    getOfficialTemplatesUpdatedAt: function () {
      return _officialTemplatesUpdatedAt;
    },

    /**
     * Назначить официальную версию systemKey → указатель на user_template.
     * version = +1 относительно текущего указателя того же systemKey (иначе 1).
     * @returns {Promise<{ error: string|null, entry?: object }>}
     */
    setOfficialTemplate: function (systemKey, pointer) {
      if (!systemKey || !pointer || pointer.type !== 'user' || !pointer.ref) {
        return Promise.resolve({ error: 'invalid_pointer' });
      }
      var next = _cloneOfficialTemplates(_officialTemplates || {});
      var prevVersion = (next[systemKey] && Number(next[systemKey].version)) || 0;
      var entry = {
        type: 'user',
        ref: pointer.ref,
        version: prevVersion + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: _currentUserLabel()
      };
      next[systemKey] = entry;
      _officialTemplates = next;
      _officialTemplatesDirty = true;
      _officialTemplatesUpdatedAt = entry.updatedAt;
      try {
        localStorage.setItem('rbi_cloud_dirty', '1');
      } catch (_ls) { /* ignore */ }
      return _mirrorOfficialTemplatesLocal(next).then(function () {
        _emit('company:officialTemplatesChanged', {
          officialTemplates: _cloneOfficialTemplates(next),
          source: 'local'
        });
        try {
          if (typeof window.triggerSync === 'function') {
            window.triggerSync('silent');
          }
        } catch (_sync) { /* ignore */ }
        return { error: null, entry: Object.assign({}, entry) };
      }).catch(function (e) {
        console.error('[CompanyService] setOfficialTemplate', e);
        return { error: e && e.message ? e.message : 'persist_failed' };
      });
    },

    /**
     * Снять указатель («Вернуть к поставке»). Сама пользовательская копия
     * не удаляется — становится обычным неофициальным черновиком.
     * @returns {Promise<{ error: string|null }>}
     */
    clearOfficialTemplate: function (systemKey) {
      if (!systemKey) return Promise.resolve({ error: 'invalid_key' });
      var next = _cloneOfficialTemplates(_officialTemplates || {});
      if (!next[systemKey]) return Promise.resolve({ error: null });
      delete next[systemKey];
      _officialTemplates = next;
      _officialTemplatesDirty = true;
      _officialTemplatesUpdatedAt = new Date().toISOString();
      try {
        localStorage.setItem('rbi_cloud_dirty', '1');
      } catch (_ls) { /* ignore */ }
      return _mirrorOfficialTemplatesLocal(next).then(function () {
        _emit('company:officialTemplatesChanged', {
          officialTemplates: _cloneOfficialTemplates(next),
          source: 'local'
        });
        try {
          if (typeof window.triggerSync === 'function') {
            window.triggerSync('silent');
          }
        } catch (_sync) { /* ignore */ }
        return { error: null };
      }).catch(function (e) {
        console.error('[CompanyService] clearOfficialTemplate', e);
        return { error: e && e.message ? e.message : 'persist_failed' };
      });
    },

    /**
     * Применить указатели с cloud pull (без dirty). Если локально dirty —
     * не затирать (ожидаем push).
     * @returns {{ applied: boolean, skippedDirty?: boolean }}
     */
    applyOfficialTemplatesFromCloud: function (map, updatedAt) {
      if (_officialTemplatesDirty) {
        return { applied: false, skippedDirty: true };
      }
      var next = _cloneOfficialTemplates(map || {});
      _officialTemplates = next;
      _officialTemplatesUpdatedAt = updatedAt || new Date().toISOString();
      _mirrorOfficialTemplatesLocal(next);
      _emit('company:officialTemplatesChanged', {
        officialTemplates: _cloneOfficialTemplates(next),
        source: 'cloud'
      });
      return { applied: true };
    },

    /**
     * После успешного push — снять dirty (SoT уже в облаке).
     */
    markOfficialTemplatesSynced: function (updatedAt) {
      _officialTemplatesDirty = false;
      if (updatedAt) _officialTemplatesUpdatedAt = updatedAt;
    }
  };

  window.RBI = window.RBI || {};
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.company = CompanyService;
  if (window.RBI.registry && window.RBI.registry.register) {
    window.RBI.registry.register('service.company', CompanyService);
  }

  console.log('[CompanyService] company.service.js loaded');
}());
