// ─── audit.actions.js — Фаза 15: бизнес-действия вкладки «Аудит» (owner-module) ─
// Реализация перенесена из audit.legacy.js. Источник данных — AuditState.*
// (window.state/.details/.photos/.currentTemplateKey/.currentChecklist по
// ссылке). Остальные глобалы (app.js) используются как есть (bare identifiers).
// Эмитит кастомные события для межмодульной коммуникации (сохранён паттерн
// делегатора, существовавший ранее в этом файле).

function _t(key, fallback, vars) {
  try {
    var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
    if (i18n && typeof i18n.t === 'function') {
      var s = vars ? i18n.t(key, vars) : i18n.t(key);
      if (s && s !== key) return s;
    }
  } catch (e) {}
  if (vars && fallback) {
    return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) {
      return vars[k] != null ? String(vars[k]) : '';
    });
  }
  return fallback;
}

(function () {
  'use strict';

  function emit(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (e) {
      console.warn('[AuditActions] emit error:', e);
    }
  }

  function _objects() {
    try {
      if (AuditActions._ctx && AuditActions._ctx.services && AuditActions._ctx.services.objects) {
        return AuditActions._ctx.services.objects;
      }
      if (AuditActions._ctx && AuditActions._ctx.objects) {
        return AuditActions._ctx.objects;
      }
    } catch (e) {}
    return (window.RBI && window.RBI.services && window.RBI.services.objects) || null;
  }
  function _contractors() {
    try {
      if (AuditActions._ctx && AuditActions._ctx.services && AuditActions._ctx.services.contractors) {
        return AuditActions._ctx.services.contractors;
      }
      if (AuditActions._ctx && AuditActions._ctx.contractors) {
        return AuditActions._ctx.contractors;
      }
    } catch (e) {}
    return (window.RBI && window.RBI.services && window.RBI.services.contractors) || null;
  }
  function _objectList() {
    var o = _objects();
    if (!o) return [];
    if (typeof o.list === 'function') {
      var l = o.list();
      return Array.isArray(l) ? l : [];
    }
    return Array.isArray(o.objects) ? o.objects : [];
  }
  function _contractorList() {
    var c = _contractors();
    if (!c) return [];
    if (typeof c.list === 'function') {
      var l = c.list();
      return Array.isArray(l) ? l : [];
    }
    return Array.isArray(c.contractors) ? c.contractors : [];
  }

  // Фаза 50-B (перенесено из audit.legacy.js): единая точка доступа к
  // настройкам через SettingsService с fallback.
  function _getSetting(key) {
    if (AuditActions._ctx && AuditActions._ctx.settings) return AuditActions._ctx.settings.get(key);
    return window.RBI.services.settings.get(key);
  }

  // Фаза 131 (перенесено из audit.legacy.js): единая точка записи настроек
  // через SettingsService или fallback.
  function _setSetting(key, value) {
    if (AuditActions._ctx && AuditActions._ctx.settings) return AuditActions._ctx.settings.set(key, value);
    return window.RBI.services.settings.set(key, value);
  }

  // Единая точка вызова gameLogAction через GameService (owner: gamification)
  // с fallback на bare-обращение.
  function _gameLogAction(actionType, targetId) {
    if (AuditActions._ctx && AuditActions._ctx.game) {
      return AuditActions._ctx.game.logAction(actionType, targetId);
    }
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
      return window.RBI.services.game.logAction(actionType, targetId);
    }
    if (typeof gameLogAction === 'function') return gameLogAction(actionType, targetId);
  }

  // Межмодульное чтение customExpertConclusions (owner: quality/reports) через
  // ReportService с fallback на bare-обращение.
  function _reports() {
    if (AuditActions._ctx && AuditActions._ctx.reports) {
      return AuditActions._ctx.reports;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.reports) {
      return window.RBI.services.reports;
    }
    return {
      getExpertConclusions: function () {
        return typeof customExpertConclusions !== 'undefined' ? customExpertConclusions : {};
      }
    };
  }

  // Фаза 59 (перенесено из audit.legacy.js): изоляция isDemoMode через
  // AppModeService с fallback.
  function _isDemoMode() {
    if (AuditActions._ctx && AuditActions._ctx.appMode) return AuditActions._ctx.appMode.isDemo();
    return window.RBI.services.appMode.isDemo();
  }

  // Фаза 65 (перенесено из audit.legacy.js): изоляция SyncQueueManager через
  // SyncService с fallback.
  function _syncEnqueue(action, payload) {
    if (AuditActions._ctx && AuditActions._ctx.sync &&
      typeof AuditActions._ctx.sync.enqueue === 'function') {
      AuditActions._ctx.sync.enqueue(action, payload);
      return;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.sync &&
      typeof window.RBI.services.sync.enqueue === 'function') {
      window.RBI.services.sync.enqueue(action, payload);
      return;
    }
    if (window.SyncQueueManager && typeof window.SyncQueueManager.enqueue === 'function') {
      window.SyncQueueManager.enqueue(action, payload);
    }
  }

  // Фаза 74 (перенесено из audit.legacy.js): изоляция userTemplates через
  // TemplateService с fallback.
  function _templates() {
    if (AuditActions._ctx && AuditActions._ctx.templates) {
      return AuditActions._ctx.templates;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.templates) {
      return window.RBI.services.templates;
    }
    return {
      getUserTemplates: function () {
        return typeof window.userTemplates !== 'undefined' ? window.userTemplates : {};
      },
      getByKey: function (key) {
        var ut = typeof window.userTemplates !== 'undefined' ? window.userTemplates : {};
        return ut[key] || null;
      },
      getSystemTemplates: function () {
        return typeof window.SYSTEM_TEMPLATES !== 'undefined' ? window.SYSTEM_TEMPLATES : {};
      },
      getEffectiveTemplate: function (key) {
        var sys = typeof window.SYSTEM_TEMPLATES !== 'undefined' ? window.SYSTEM_TEMPLATES : {};
        var base = sys[key];
        return base ? { groups: base.groups, title: base.title, isOfficialOverride: false } : null;
      }
    };
  }

  // Редактор системных чек-листов Блок 1: снимок использованного чек-листа
  // (groups/items с id/n(название)/w(вес) как использовались на момент
  // сохранения) — открытие даже очень старой проверки не зависит от того,
  // как чек-лист поменяется дальше. Пишется только для новых записей.
  function _buildChecklistSnapshot(checklist) {
    if (!Array.isArray(checklist)) return null;
    try {
      return checklist.map(function (g) {
        return {
          group: g && g.group,
          items: Array.isArray(g && g.items) ? g.items.map(function (it) {
            return { id: it.id, n: it.n, w: it.w };
          }) : []
        };
      });
    } catch (_e) {
      return null;
    }
  }

  // Фаза 88 (перенесено из audit.legacy.js): единая точка доступа к
  // syncConfig через SyncService или fallback.
  function _syncConfig() {
    if (AuditActions._ctx && AuditActions._ctx.sync &&
      typeof AuditActions._ctx.sync.getConfig === 'function') {
      return AuditActions._ctx.sync.getConfig();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.sync &&
      typeof window.RBI.services.sync.getConfig === 'function') {
      return window.RBI.services.sync.getConfig();
    }
    return window.syncConfig || {};
  }

  // Фаза 101 (перенесено из audit.legacy.js): единая точка доступа к
  // IndexedDB через StorageService или fallback.
  function _storage() {
    if (AuditActions._ctx && AuditActions._ctx.storage) {
      return AuditActions._ctx.storage;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.storage) {
      return window.RBI.services.storage;
    }
    return {
      stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
      get: function (store, key) { return dbGet(store, key); },
      getAll: function (store) { return dbGetAll(store); },
      put: function (store, data) { return dbPut(store, data); },
      delete: function (store, key) { return dbDelete(store, key); }
    };
  }

  function _getTasks() {
    if (AuditActions._ctx && AuditActions._ctx.tasks) {
      return AuditActions._ctx.tasks.getTasksSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.tasks) {
      return window.RBI.services.tasks.getTasksSync();
    }
    return typeof window.rbi_tasksData !== 'undefined' ? window.rbi_tasksData : [];
  }

  function _getAllInspections() {
    if (AuditActions._ctx && AuditActions._ctx.inspections) {
      return AuditActions._ctx.inspections.getAllSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
      return window.RBI.services.inspections.getAllSync();
    }
    return Array.isArray(window.contractorArray) ? window.contractorArray : [];
  }

  function _pushInspection(item) {
    if (AuditActions._ctx && AuditActions._ctx.inspections) {
      return AuditActions._ctx.inspections.pushSync(item);
    }
    if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
      return window.RBI.services.inspections.pushSync(item);
    }
    if (Array.isArray(window.contractorArray)) {
      window.contractorArray.push(item);
      return true;
    }
    return false;
  }

  // Фаза 122 (перенесено из audit.legacy.js): единая точка вызова
  // синхронизации через SyncService или fallback.
  function _sync(mode) {
    var m = mode || 'silent';
    if (AuditActions._ctx && AuditActions._ctx.sync) {
      return AuditActions._ctx.sync.trigger(m);
    }
    if (window.RBI && window.RBI.services && window.RBI.services.sync) {
      return window.RBI.services.sync.trigger(m);
    }
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
  }

  // Примечание («Что разобрать» п.3 плана): _session() из audit.legacy.js не
  // вызывался нигде внутри самого файла (подтверждено Grep) — мёртвый код,
  // не переносится (YAGNI).

  var AuditActions = {
    _ctx: null,
    bindCtx: function (ctx) { this._ctx = ctx; },

    // =====================================================================
    // АВТОСОХРАНЕНИЕ ЧЕРНОВИКА (debounce)
    // Перенесено из audit.legacy.js (было в app.js, строка 437).
    // =====================================================================
    _sessionIsEmpty: function () {
      if (AuditState.currentTemplateKey) return false;
      var st = AuditState.state;
      if (st && typeof st === 'object' && Object.keys(st).length > 0) return false;
      var photos = AuditActions.getSessionPhotosForSync();
      if (photos && Object.keys(photos).length > 0) return false;
      function _field(id) {
        var el = document.getElementById(id);
        return el && String(el.value || '').trim();
      }
      if (_field('inp-project') || _field('inp-inspector') || _field('inp-contractor') || _field('inp-location')) {
        return false;
      }
      return true;
    },

    // P2-0025: содержимое черновика (те же поля, что пишет saveSession, без времени).
    _draftFingerprint: function () {
      var policy = window.RbiSyncRetryPolicy;
      if (!policy || typeof policy.draftFingerprint !== 'function') return null;
      function _val(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
      }
      var planPin = (window.AuditState && typeof window.AuditState.getPlanPin === 'function')
        ? window.AuditState.getPlanPin()
        : null;
      return policy.draftFingerprint({
        templateKey: AuditState.currentTemplateKey,
        project: _val('inp-project'), inspector: _val('inp-inspector'), contractor: _val('inp-contractor'),
        section: _val('inp-section'), floor: _val('inp-floor'), room: _val('inp-room'), location: _val('inp-location'),
        planPin: planPin || null,
        state: AuditState.state, details: AuditState.details, photos: AuditActions.getSessionPhotosForSync(),
        customExpertConclusions: _reports().getExpertConclusions()
      });
    },
    _lastDraftFp: null,
    _lastDraftChangeAt: 0,

    // P2-0025: «к отправке» — только при реальном изменении черновика (сравнение по содержимому).
    // Первый вызов после загрузки страницы (отпечатка ещё нет) помечает, как раньше.
    scheduleSessionSave: function () {
      if (AuditActions._sessionIsEmpty()) return;
      var fp = AuditActions._draftFingerprint();
      if (fp === null || fp !== AuditActions._lastDraftFp) {
        AuditActions._lastDraftFp = fp;
        AuditActions._lastDraftChangeAt = Date.now();
        localStorage.setItem('rbi_cloud_dirty', '1');
      }
      clearTimeout(window.__saveSessionTimer);
      window.__saveSessionTimer = setTimeout(function () {
        AuditActions.saveSession();
      }, 500);
    },

    // P2-0025: после синхронизации — сохранить черновик; «к отправке» снова, только если он
    // менялся после начала синхронизации (иначе раньше: метка каждый раз → синхронизация раз в минуту).
    onSyncCompleted: function (detail) {
      if (AuditActions._sessionIsEmpty()) return;
      var fp = AuditActions._draftFingerprint();
      if (fp !== null && fp !== AuditActions._lastDraftFp) {
        AuditActions.scheduleSessionSave();
        return;
      }
      var policy = window.RbiSyncRetryPolicy;
      var startedAt = detail && detail.startedAt;
      var again = (policy && typeof policy.draftNeedsPushAfterSync === 'function')
        ? policy.draftNeedsPushAfterSync(AuditActions._lastDraftChangeAt, startedAt)
        : true;
      if (fp === null || again) localStorage.setItem('rbi_cloud_dirty', '1');
      clearTimeout(window.__saveSessionTimer);
      window.__saveSessionTimer = setTimeout(function () {
        AuditActions.saveSession();
      }, 500);
    },

    // =====================================================================
    // СОХРАНЕНИЕ СЕССИИ В IndexedDB
    // Перенесено из audit.legacy.js (было в app.js, строка 457).
    // =====================================================================
    saveSession: async function () {
      if (_isDemoMode()) return;
      if (AuditActions._sessionIsEmpty()) return;
      try {
        var secEl = document.getElementById('inp-section');
        var floorEl = document.getElementById('inp-floor');
        var roomEl = document.getElementById('inp-room');
        var planPin = (window.AuditState && typeof window.AuditState.getPlanPin === 'function')
          ? window.AuditState.getPlanPin()
          : null;
        await _storage().put(_storage().stores().STATE, {
          key: 'current_session',
          timestamp: Date.now(),
          templateKey: AuditState.currentTemplateKey,
          project: document.getElementById('inp-project') ? document.getElementById('inp-project').value : '',
          inspector: document.getElementById('inp-inspector') ? document.getElementById('inp-inspector').value : '',
          contractor: document.getElementById('inp-contractor') ? document.getElementById('inp-contractor').value : '',
          section: secEl ? secEl.value : '',
          floor: floorEl ? floorEl.value : '',
          room: roomEl ? roomEl.value : '',
          location: document.getElementById('inp-location') ? document.getElementById('inp-location').value : '',
          planPin: planPin || null,
          state: AuditState.state, details: AuditState.details, photos: AuditActions.getSessionPhotosForSync(),
          customExpertConclusions: _reports().getExpertConclusions()
        });
        emit('audit:session:saved');
      } catch (e) {
        var soft = (e && (e.name === 'AbortError' || e.name === 'InvalidStateError'))
          || document.visibilityState === 'hidden';
        if (soft) {
          console.warn('Ошибка сохранения в IndexedDB (soft):', e);
          return;
        }
        console.error('Ошибка сохранения в IndexedDB:', e);
        if (document.visibilityState === 'visible') {
          var now = Date.now();
          if (!window.__rbiLastAutosaveToastAt || (now - window.__rbiLastAutosaveToastAt) >= 30000) {
            window.__rbiLastAutosaveToastAt = now;
            showToast(_t('quality.audit.toast.autosave_error', '⚠️ Ошибка автосохранения!'));
          }
        }
      }
    },

    // =====================================================================
    // ПОЛУЧЕНИЕ ФОТО СЕССИИ БЕЗ ФОТО ДЕФЕКТОВ СК
    // Перенесено из audit.legacy.js (было в app.js, строка 448).
    // =====================================================================
    getSessionPhotosForSync: function () {
      var sessionPhotos = {};
      var photos = AuditState.photos;
      Object.keys(photos || {}).forEach(function (key) {
        if (String(key).startsWith('def_')) return;
        sessionPhotos[key] = AuditState.photos[key];
      });
      return sessionPhotos;
    },

    // =====================================================================
    // ПЕРЕКЛЮЧЕНИЕ СТАТУСА OK
    // Перенесено из audit.legacy.js (было в app.js, строка 2841).
    // =====================================================================
    toggleOk: function (id) {
      if (AuditState.state[id] === 'ok') {
        AuditState.setState(id, null); delete AuditState.photos[id]; delete AuditState.details[id];
      } else {
        AuditState.setState(id, 'ok'); delete AuditState.details[id];
      }
      window.updateCardDOM(id); window.updateUI(); AuditActions.scheduleSessionSave();
      emit('audit:state:changed', { posId: id, action: 'ok' });
    },

    // =====================================================================
    // ПЕРЕКЛЮЧЕНИЕ СТАТУСА FAIL
    // Перенесено из audit.legacy.js (было в app.js, строка 2850).
    // =====================================================================
    toggleFail: function (id) {
      if (AuditState.state[id] === 'fail' || AuditState.state[id] === 'fail_escalated') {
        AuditState.setState(id, null); delete AuditState.photos[id]; delete AuditState.details[id];
      } else {
        AuditState.setState(id, 'fail'); delete AuditState.details[id];
      }
      window.updateCardDOM(id); window.updateUI(); AuditActions.scheduleSessionSave();
      emit('audit:state:changed', { posId: id, action: 'fail' });
    },

    // =====================================================================
    // ПЕРЕКЛЮЧЕНИЕ ЭСКАЛАЦИИ (B2 → B3)
    // Перенесено из audit.legacy.js (было в app.js, строка 2859).
    // =====================================================================
    toggleEscalation: function (id) {
      if (AuditState.state[id] === 'fail_escalated') AuditState.setState(id, 'fail');
      else if (AuditState.state[id] === 'fail') AuditState.setState(id, 'fail_escalated');
      window.updateCardDOM(id); window.updateUI(); AuditActions.scheduleSessionSave();
      emit('audit:state:changed', { posId: id, action: 'escalation' });
    },

    // =====================================================================
    // СМЕНА ШАБЛОНА (ВИДА РАБОТ)
    // Перенесено из audit.legacy.js (было в app.js, строка 2742).
    // Вызывается из index.html: onchange="changeTemplate(this.value)"
    // =====================================================================
    changeTemplate: function (val) {
      if (val === 'HOME') {
        AuditState.setTemplate('');
        if (document.getElementById('checklist-selector')) document.getElementById('checklist-selector').value = '';
        AuditState.resetSession(); assignPhotosMap({});

        var pInp = document.getElementById('inp-project');
        var cInp = document.getElementById('inp-contractor');
        if (pInp && !pInp.hasAttribute('readonly') && !pInp.disabled) pInp.value = '';
        if (cInp && !cInp.hasAttribute('readonly')) cInp.value = '';
        if (document.getElementById('inp-location')) document.getElementById('inp-location').value = '';
        if (document.getElementById('inp-section')) document.getElementById('inp-section').value = '';
        if (document.getElementById('inp-floor')) document.getElementById('inp-floor').value = '';
        if (document.getElementById('inp-room')) document.getElementById('inp-room').value = '';
        if (window.AuditState && typeof window.AuditState.clearPlanPin === 'function') window.AuditState.clearPlanPin();
        try {
          var _ind = document.getElementById('quality-plan-pin-indicator');
          if (_ind) { _ind.classList.add('hidden'); _ind.classList.remove('flex'); }
        } catch (_e) { /* ignore */ }

        switchTab('tab-audit');
        if (window.AuditRender && typeof window.AuditRender.syncPaneVisibility === 'function') {
          window.AuditRender.syncPaneVisibility();
        } else {
          document.getElementById('empty-checklist-state').style.display = 'block';
          document.getElementById('audit-items').style.display = 'none';
          document.getElementById('audit-actions').style.display = 'none';
        }

        var nav = document.getElementById('audit-group-nav');
        if (nav) { nav.innerHTML = ''; nav.classList.add('hidden'); }

        document.getElementById('data-block-summary')?.classList.add('hidden');
        if (document.getElementById('current-checklist-label')) document.getElementById('current-checklist-label').innerText = _t('quality.audit.checklist.none', 'Вид работ не выбран');

        AuditActions.saveSession();
        { var o = _objects(); if (o && typeof o.initUI === 'function') o.initUI(); }
        emit('audit:state:changed', { action: 'template', key: val });
        return;
      }

      if (val === 'UPLOAD') {
        document.getElementById('json-input').click();
        document.getElementById('checklist-selector').value = AuditState.currentTemplateKey || "";
        return;
      }

      AuditState.setTemplate(val);
      var type = val.split('_')[0];
      var key = val.replace(type + '_', '');

      if (type === 'sys') {
        // ctx.templates часто указывает на RBI.utils.templates (read-only,
        // без getEffectiveTemplate) из-за перезаписи shared ctx под-модулями
        // (см. audit.module.js:152) — берём сервис напрямую с fallback.
        var _tSvc = (window.RBI && window.RBI.services && window.RBI.services.templates) || _templates();
        var _eff = (_tSvc && typeof _tSvc.getEffectiveTemplate === 'function')
          ? _tSvc.getEffectiveTemplate(key)
          : null;
        if (_eff) AuditState.setChecklist(_eff.groups);
      } else if (type === 'user' && _templates().getUserTemplates()[key]) AuditState.setChecklist(_templates().getUserTemplates()[key].groups);

      // Keep object; reset contractor + section/floor/room/pin + session (follow-up UX).
      AuditActions.resetPinContextKeepProject({ clearContractor: true });

      AuditActions.saveSession();

      if (document.getElementById('checklist-selector')) {
        document.getElementById('checklist-selector').value = val;
      }
      window.updateDataSummary();

      if (window.AuditRender && typeof window.AuditRender.syncPaneVisibility === 'function') {
        window.AuditRender.syncPaneVisibility();
      } else {
        document.getElementById('empty-checklist-state').style.display = 'none';
        document.getElementById('audit-items').style.display = 'block';
        document.getElementById('audit-actions').style.display = 'grid';
      }

      if (document.getElementById('tab-audit').classList.contains('active')) { window.render(); window.updateUI(); }
      { var o2 = _objects(); if (o2 && typeof o2.initUI === 'function') o2.initUI(); }
      emit('audit:state:changed', { action: 'template', key: val });
    },

    /**
     * Reset pin/floor/section/room/session; keep inp-project.
     * opts.clearContractor — also clear contractor (template change).
     */
    resetPinContextKeepProject: function (opts) {
      opts = opts || {};
      if (opts.clearContractor) {
        var cInp = document.getElementById('inp-contractor');
        if (cInp && !cInp.hasAttribute('readonly')) cInp.value = '';
      }
      if (document.getElementById('inp-location')) document.getElementById('inp-location').value = '';
      if (document.getElementById('inp-section')) document.getElementById('inp-section').value = '';
      if (document.getElementById('inp-floor')) document.getElementById('inp-floor').value = '';
      if (document.getElementById('inp-room')) document.getElementById('inp-room').value = '';
      if (window.AuditState && typeof window.AuditState.clearPlanPin === 'function') {
        window.AuditState.clearPlanPin();
      }
      try {
        var _ind = document.getElementById('quality-plan-pin-indicator');
        if (_ind) { _ind.classList.add('hidden'); _ind.classList.remove('flex'); }
        var roomPh = document.getElementById('inp-room');
        if (roomPh) roomPh.placeholder = _t('quality.audit.field.room_required', 'Оси/Пом.*');
      } catch (_e) { /* ignore */ }
      AuditState.resetSession();
      assignPhotosMap({});
    },

    // =====================================================================
    // СБРОС ТЕКУЩЕГО ЧЕКЛИСТА
    // Перенесено из audit.legacy.js (было в app.js, строка 3779).
    // Вызывается из index.html: onclick="resetChecklist()"
    // =====================================================================
    resetChecklist: function () {
      if (!confirm(_t('quality.audit.confirm.reset_checklist', 'Очистить только текущий чек-лист?'))) return;
      AuditState.resetSession(); assignPhotosMap({}); document.getElementById('inp-location').value = '';
      if (document.getElementById('inp-section')) document.getElementById('inp-section').value = '';
      if (document.getElementById('inp-floor')) document.getElementById('inp-floor').value = '';
      if (document.getElementById('inp-room')) document.getElementById('inp-room').value = '';
      if (window.AuditState && typeof window.AuditState.clearPlanPin === 'function') window.AuditState.clearPlanPin();
      try {
        var _indR = document.getElementById('quality-plan-pin-indicator');
        if (_indR) { _indR.classList.add('hidden'); _indR.classList.remove('flex'); }
      } catch (_eR) { /* ignore */ }
      AuditActions.saveSession(); window.render(); window.updateUI();
      emit('audit:state:changed', { action: 'reset' });
    },

    // =====================================================================
    // СОХРАНЕНИЕ ПРОВЕРКИ В ИСТОРИЮ
    // Перенесено из audit.legacy.js (было в app.js, строка 3347).
    // Вызывается из index.html: onclick="saveProductToArray()"
    // =====================================================================
    saveProductToArray: async function () {
      var _permSvc = (AuditActions._ctx && AuditActions._ctx.permissions) || window.RBI.services.permissions;
      if (_permSvc && !_permSvc.canCreate()) {
        return showToast(_t('quality.audit.toast.role_no_create', '⛔ Ваша роль не позволяет создавать проверки'));
      }
      var projInput = document.getElementById('inp-project');
      var inspInput = document.getElementById('inp-inspector');
      var contrInput = document.getElementById('inp-contractor');
      var secInput = document.getElementById('inp-section');
      var floorInput = document.getElementById('inp-floor');
      var roomInput = document.getElementById('inp-room');
      var locHidden = document.getElementById('inp-location');

      if (_getSetting('engineerName')) {
        if (inspInput) inspInput.value = _getSetting('engineerName');
      }

      if (!inspInput || !inspInput.value.trim()) {
        return showToast(_t('quality.audit.toast.need_engineer_name', '⚠️ Укажите ваше Имя во вкладке "Инженер -> Профиль" перед сохранением!'));
      }

      var hasError = false;
      var planPin = (window.AuditState && typeof window.AuditState.getPlanPin === 'function')
        ? window.AuditState.getPlanPin()
        : null;
      var hasPlanPin = !!(planPin && planPin.locationId != null
        && Number.isFinite(Number(planPin.x)) && Number.isFinite(Number(planPin.y)));

      // Soft-validation: при pin оси (inp-room) опциональны; project/contractor/section — как раньше.
      [projInput, contrInput, secInput].forEach(function (el) {
        if (el && !el.value.trim()) {
          el.classList.add('border-danger', 'bg-danger-soft');
          setTimeout(function () { el.classList.remove('border-danger', 'bg-danger-soft'); }, 3000);
          hasError = true;
        }
      });

      if (hasError) {
        showToast(_t('quality.audit.toast.fill_required', '⚠️ Заполните все поля со звездочкой (Объект, Подрядчик, Секция)!'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      var isCloudConnected = _syncConfig().enabled && _syncConfig().projectCode;
      var _permSvc2 = (AuditActions._ctx && AuditActions._ctx.permissions) || window.RBI.services.permissions;
      var currentRole = _permSvc2 ? _permSvc2.getCurrentRole() : 'guest';

      if (isCloudConnected && currentRole === 'engineer' && projInput.tagName.toLowerCase() === 'input') {
        var newObjName = projInput.value.trim();

        if (!_getSetting('pendingAssignedProjects')) _setSetting('pendingAssignedProjects', []);
        var exists = (_getSetting('pendingAssignedProjects') || []).some(function (p) { return p.raw_name === newObjName; });

        if (!exists) {
          var _pap = _getSetting('pendingAssignedProjects') || [];
          _pap.push({
            raw_name: newObjName,
            status: 'pending',
            created_at: new Date().toISOString()
          });
          _setSetting('pendingAssignedProjects', _pap);

          // Единый путь отправки заявки на привязку инженера к объекту
          // (симметрично window.addAssignedProject) — раньше здесь был отдельный
          // прямой update() без request_type, из-за чего заявка не попадала под
          // фильтр панели «Команда» согласованно с остальными путями, и ошибки
          // сети/RLS проглатывались молча (не было .catch()). См. current_plan.md §2.2.
          if (typeof window.pushObjectRequestToCloud === 'function') {
            window.pushObjectRequestToCloud({
              raw_name: newObjName,
              canonical_key: '',
              display_name: newObjName,
              status: 'pending',
              request_type: 'profile_only',
              created_at: new Date().toISOString()
            }).catch(function (e) {
              console.warn('[AuditActions] Не удалось отправить заявку на объект:', e);
              localStorage.setItem('rbi_cloud_dirty', '1');
            });
          }
          showToast(_t('quality.audit.toast.object_pending', '🏢 Объект "{name}" отправлен на согласование руководителю.', { name: newObjName }));
        }
      }

      var locVal = locHidden.value.trim();
      var projVal = projInput.value.trim();
      var contrVal = contrInput.value.trim();

      function _planPinOf(item) {
        if (!item) return null;
        if (item.planPin) return item.planPin;
        if (item.metrics && item.metrics.planPin) return item.metrics.planPin;
        return null;
      }
      function _samePlanPoint(a, b, eps) {
        if (!a || !b) return false;
        if (String(a.locationId) !== String(b.locationId)) return false;
        var ax = Number(a.x), ay = Number(a.y), bx = Number(b.x), by = Number(b.y);
        if (![ax, ay, bx, by].every(Number.isFinite)) return false;
        var dx = ax - bx, dy = ay - by;
        return Math.hypot(dx, dy) <= (eps == null ? 1.0 : eps);
      }

      var _inspections = _getAllInspections();
      var isDuplicate = _inspections.some(function (item) {
        if (item.projectName !== projVal ||
            item.contractorName !== contrVal ||
            item.templateKey !== AuditState.currentTemplateKey) {
          return false;
        }
        if (hasPlanPin) {
          return _samePlanPoint(planPin, _planPinOf(item), 1.0);
        }
        return item.location === locVal;
      });

      if (isDuplicate) {
        return showToast(_t('quality.audit.toast.duplicate_location', '⚠️ Проверка с такой локацией уже существует в Истории!'));
      }

      var settingsChanged = false;
      if (!_getSetting('defaultProject') && projInput.value.trim()) {
        _setSetting('defaultProject', projInput.value.trim());
        settingsChanged = true;
      }
      if (settingsChanged && !_isDemoMode()) {
        applySmartLocks();
      }

      var mergedState = {};
      var mergedDetails = {};
      var mergedPhotos = {};
      var checkedStageNames = [];
      var stagesToMetric = [];

      AuditState.currentChecklist.forEach(function (group) {
        var hasAnswersInStage = false;
        group.items.forEach(function (item) {
          if (AuditState.state[item.id]) {
            mergedState[item.id] = AuditState.state[item.id];
            if (AuditState.details[item.id]) mergedDetails[item.id] = AuditState.details[item.id];
            if (AuditState.photos[item.id]) mergedPhotos[item.id] = AuditState.photos[item.id];
            hasAnswersInStage = true;
          }
        });

        if (hasAnswersInStage) {
          checkedStageNames.push(group.group || group.title);
          stagesToMetric.push(group);
        }
      });

      if (checkedStageNames.length === 0) {
        return showToast(_t('quality.audit.toast.empty_checklist', '⚠️ Чек-лист пуст. Заполните хотя бы один пункт.'));
      }

      var finalMetrics = getProductMetrics(mergedState, stagesToMetric);
      if (hasPlanPin) {
        finalMetrics = finalMetrics || {};
        finalMetrics.planPin = {
          locationId: String(planPin.locationId),
          x: Number(planPin.x),
          y: Number(planPin.y)
        };
      }
      var isFullCheck = checkedStageNames.length === AuditState.currentChecklist.length;
      var stageNameLabel = isFullCheck ? _t('quality.audit.stage.full', 'Полная проверка') : _t('quality.audit.stage.partial', 'Частичная проверка');

      var selectEl = document.getElementById('checklist-selector');
      var tTitle = selectEl.options[selectEl.selectedIndex].text.replace('▼', '').trim();

      var instanceId = "default";
      if (secInput.value && floorInput.value) instanceId = `${secInput.value.replace(/[^\d-]/g, '')}_${floorInput.value.replace(/[^\d-]/g, '')}`;

      var dbPhotos = {};
      for (var photoId in mergedPhotos) {
        var photoArr = window.normalizeItemPhotos(mergedPhotos[photoId]);
        var savedArr = [];
        for (var pi = 0; pi < photoArr.length; pi++) {
          var photoData = photoArr[pi];
          if (photoData && photoData.startsWith('data:image')) {
            savedArr.push(await PhotoManager.saveLocal(photoData, 'hist'));
          } else {
            savedArr.push(photoData);
          }
        }
        dbPhotos[photoId] = savedArr;
      }

      var rawProjectValue = projInput.value.trim();
      var rawProjectName = (projInput.dataset && projInput.dataset.displayName) ? projInput.dataset.displayName : rawProjectValue;

      var projectCanonicalKey = rawProjectValue;
      var projectDisplayName = rawProjectName;
      var projectId = '';

      var od = _objects();
      if (od) {
        var resolved = null;
        if (typeof od.resolveObjectRef === 'function') {
          resolved = od.resolveObjectRef(rawProjectValue)
            || od.resolveObjectRef(rawProjectName);
        }
        var objList = _objectList();
        if (!resolved && objList.length) {
          var clean = od.cleanString
            ? od.cleanString(rawProjectName)
            : rawProjectName.toLowerCase().trim();

          resolved = objList.find(function (o) {
            var displayClean = od.cleanString ? od.cleanString(o.display_name || '') : String(o.display_name || '').toLowerCase().trim();
            var keyClean = od.cleanString ? od.cleanString(o.canonical_key || '') : String(o.canonical_key || '').toLowerCase().trim();

            var synonymMatch = Array.isArray(o.synonyms)
              ? o.synonyms.some(function (syn) {
                var synClean = od.cleanString ? od.cleanString(syn) : String(syn).toLowerCase().trim();
                return synClean === clean;
              })
              : false;

            return displayClean === clean || keyClean === clean || synonymMatch;
          }) || null;
        }

        if (resolved) {
          projectCanonicalKey = resolved.canonical_key || '';
          projectDisplayName = resolved.display_name || rawProjectName;
          projectId = resolved.id || '';
        }
      }

      if (!projectCanonicalKey) {
        projectCanonicalKey = rawProjectValue || rawProjectName;
      }

      var contractorNormalized = typeof window.normalizeInspectionContractorBeforeSave === 'function'
        ? await window.normalizeInspectionContractorBeforeSave()
        : {
          contractor_raw_name: contrInput.value.trim(),
          contractor_name: contrInput.value.trim(),
          contractor_canonical_key: '',
          contractor_normalization_status: 'pending',
          contractorId: ''
        };

      var _appMode = (AuditActions._ctx && AuditActions._ctx.appMode)
        ? AuditActions._ctx.appMode.getMode()
        : (window.RBI && window.RBI.services && window.RBI.services.appMode)
          ? window.RBI.services.appMode.getMode()
          : (window.AppModeManager ? window.AppModeManager.currentMode : 'quality');
      var isConstructionMode = (_appMode === 'construction') || window.activeAcceptanceRequestId;
      var inspType = isConstructionMode ? 'sk_acceptance' : 'rbi_audit';

      var initialSyncStatus = isConstructionMode ? 'blocked' : 'not_synced';
      var initialSyncReason = isConstructionMode ? _t('quality.audit.sync.sk_offline', 'Модуль СК временно отключен от облака') : '';

      // P2-0024: снимок чек-листа — один раз на версию шаблона (хранилище checklist_snapshots),
      // в проверке — ссылка. Демо / ошибка хранилища — как раньше, копией в записи (читается так же).
      var checklistSnapshot = _buildChecklistSnapshot(AuditState.currentChecklist);
      var checklistSnapshotRef = '';
      if (checklistSnapshot && !_isDemoMode() && typeof window.rbiPutChecklistSnapshot === 'function') {
        try {
          checklistSnapshotRef = await window.rbiPutChecklistSnapshot(checklistSnapshot);
        } catch (_e) {
          checklistSnapshotRef = '';
        }
      }

      var newItem = {
        id: String(Date.now() + Math.floor(Math.random() * 1000)),
        date: new Date().toISOString(),
        projectName: projectDisplayName,
        project_canonical_key: projectCanonicalKey,
        project_display_name: projectDisplayName,
        projectId: projectId || '',
        inspectorName: inspInput.value.trim(),
        contractorName: contractorNormalized.contractor_name || contrInput.value.trim(),
        contractor_name: contractorNormalized.contractor_name || contrInput.value.trim(),
        contractor_raw_name: contractorNormalized.contractor_raw_name || contrInput.value.trim(),
        contractor_canonical_key: contractorNormalized.contractor_canonical_key || '',
        contractor_normalization_status: contractorNormalized.contractor_normalization_status || 'pending',
        contractorId: contractorNormalized.contractorId || '',
        templateKey: AuditState.currentTemplateKey,
        templateTitle: tTitle,
        checklistSnapshot: checklistSnapshotRef ? undefined : checklistSnapshot,
        checklistSnapshotRef: checklistSnapshotRef || undefined,
        section: secInput.value.trim(),
        floor: floorInput.value.trim(),
        room: roomInput.value.trim(),
        location: locHidden.value.trim(),
        instanceId: instanceId,
        stageId: 0,
        stageName: stageNameLabel,
        checkedStagesInfo: checkedStageNames,
        isCompleted: isFullCheck,
        state: JSON.parse(JSON.stringify(mergedState)),
        details: JSON.parse(JSON.stringify(mergedDetails)),
        photos: dbPhotos,
        metrics: finalMetrics,
        planPin: hasPlanPin ? {
          locationId: String(planPin.locationId),
          x: Number(planPin.x),
          y: Number(planPin.y)
        } : null,
        inspection_type: inspType,
        source: 'local',
        syncStatus: initialSyncStatus,
        sync_status: initialSyncStatus,
        syncBlockReason: initialSyncReason,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (newItem.checklistSnapshot === undefined) delete newItem.checklistSnapshot;
      if (newItem.checklistSnapshotRef === undefined) delete newItem.checklistSnapshotRef;

      _pushInspection(newItem);
      if (!_isDemoMode()) {
        await _storage().put(_storage().stores().HISTORY, newItem);
        _syncEnqueue('SAVE_INSPECTION', newItem);
      }

      // XP: уникальный target = id проверки (раньше 'esc'/'etalon' дублировали начисления)
      if (finalMetrics.escalated_found) {
        _gameLogAction('escalation_bonus', newItem.id);
      }
      if (AuditState.currentTemplateKey === 'sys_etalon_act' && Object.keys(mergedPhotos).length > 0) {
        _gameLogAction('etalon_accepted', newItem.id);
      }

      if (isConstructionMode) {
        var createdDefects = [];

        var futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 14);
        var defaultDeadline = futureDate.toISOString().split('T')[0];

        for (var itemId in mergedState) {
          var stateVal = mergedState[itemId];
          if (stateVal === 'fail' || stateVal === 'fail_escalated') {
            var flatList = getFlatList(AuditState.currentChecklist);
            var itemInfo = flatList.find(function (x) { return String(x.id) === String(itemId); });
            if (!itemInfo) continue;

            var cleanNorm = itemInfo.t ? itemInfo.t.replace(/<\/?[^>]+(>|$)/g, "").replace(/<br>/g, " ") : "";
            var desc = `Нарушение: ${itemInfo.n}.`;
            if (cleanNorm && cleanNorm !== 'Без норматива') desc += ` Требования: ${cleanNorm}`;

            if (mergedDetails[itemId] && mergedDetails[itemId].comment) {
              desc += `\nУточнение инженера: ${mergedDetails[itemId].comment}`;
            }

            var category = 'B2';
            if (stateVal === 'fail_escalated' || itemInfo.w === 3) category = 'B3';
            else if (itemInfo.w === 1) category = 'B1';

            var newDefectId = 'def_auto_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);

            // Дефект СК — своя однофото-семантика (не входит в этот блок): берём
            // первое фото пункта чек-листа из массива (mergedPhotos[itemId]).
            var defectPhoto = window.normalizeItemPhotos(mergedPhotos[itemId])[0] || null;
            if (defectPhoto && AuditState.photos) {
              AuditState.photos[newDefectId] = defectPhoto;
            }

            var newDefect = {
              id: newDefectId,
              x: hasPlanPin ? Number(planPin.x) : 50,
              y: hasPlanPin ? Number(planPin.y) : 50,
              locationFloorId: hasPlanPin ? String(planPin.locationId) : null,
              floorId: null,
              templateKey: AuditState.currentTemplateKey,
              itemId: String(itemId),
              itemName: itemInfo.n,
              normText: itemInfo.t,
              text: itemInfo.n,
              category: category,
              deadline: defaultDeadline,
              contractor: contractorNormalized.contractor_name || contrInput.value.trim(),
              contractorId: contractorNormalized.contractorId || '',
              description: desc,
              photo: defectPhoto,
              status: 'issued',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              created_by: inspInput.value.trim() || 'Инженер',
              locationDesc: locHidden.value.trim()
            };

            createdDefects.push(newDefect);
          }
        }

        if (createdDefects.length > 0) {
          setTimeout(function () {
            emit('audit:defectsCreated', { defects: createdDefects });
          }, 1000);
        }
      }

      updateSmartInputCache('projectName', projInput.value.trim());
      updateSmartInputCache('contractorName', contractorNormalized.contractor_name || contrInput.value.trim());
      updateSmartInputCache('section', secInput.value.trim());
      updateSmartInputCache('floor', floorInput.value.trim());
      updateSmartInputCache('room', roomInput.value.trim());

      var _inspectionsForPast = _getAllInspections();
      var pastChecks = _inspectionsForPast.filter(function (c) {
        return c.contractorName === (contractorNormalized.contractor_name || contrInput.value.trim()) &&
          c.templateKey === AuditState.currentTemplateKey;
      });
      if (pastChecks.length === 1 && typeof gameGenerateWeeklyPlan === 'function') {
        gameGenerateWeeklyPlan(true);
      } else {
        var _gameSvc = (AuditActions._ctx && AuditActions._ctx.game) || window.RBI.services.game;
        _gameSvc.updatePlanProgress();
      }

      if (window.activeTaskId) {
        var task = _getTasks().find(function (t) { return t.id === window.activeTaskId; });
        if (task) {
          task.done = (task.done || 0) + 1;
          task.updatedAt = new Date().toISOString();

          if (task.done >= task.target) {
            task.status = 'done';
            task.resultComment = `Выполнено (${task.done}/${task.target})`;
          } else {
            task.resultComment = `В процессе (${task.done}/${task.target})`;
          }
          _storage().put(_storage().stores().TASKS, task);
        }
        window.activeTaskId = null;
      }

      if (window.activeAcceptanceRequestId) {
        var _acceptanceStatus = (finalMetrics.isDanger || finalMetrics.final < 85) ? 'rejected' : 'accepted';
        if (_acceptanceStatus === 'rejected') {
          showToast(_t('quality.audit.toast.works_rejected', '❌ Работы отклонены по результатам чек-листа'));
        } else {
          showToast(_t('quality.audit.toast.works_accepted', '✅ Работы успешно приняты!'));
        }
        emit('audit:acceptanceStatusChanged', { requestId: window.activeAcceptanceRequestId, status: _acceptanceStatus });
        window.activeAcceptanceRequestId = null;
      }

      AuditState.resetSession(); assignPhotosMap({});
      if (hasPlanPin) {
        // Keep-floor: object / section / floor / location path stay; clear axes + pin coords.
        if (roomInput) roomInput.value = '';
        if (window.AuditState && typeof window.AuditState.clearPlanPin === 'function') {
          window.AuditState.clearPlanPin();
        }
        try {
          var _indSaveKeep = document.getElementById('quality-plan-pin-indicator');
          if (_indSaveKeep) { _indSaveKeep.classList.add('hidden'); _indSaveKeep.classList.remove('flex'); }
          if (roomInput) roomInput.placeholder = _t('quality.audit.field.room_required', 'Оси/Пом.*');
        } catch (_eSaveKeep) { /* ignore */ }
      } else {
        secInput.value = ''; floorInput.value = ''; roomInput.value = ''; locHidden.value = '';
        if (window.AuditState && typeof window.AuditState.clearPlanPin === 'function') {
          window.AuditState.clearPlanPin();
        }
        try {
          var _indSave = document.getElementById('quality-plan-pin-indicator');
          if (_indSave) { _indSave.classList.add('hidden'); _indSave.classList.remove('flex'); }
          var roomPh = document.getElementById('inp-room');
          if (roomPh) roomPh.placeholder = _t('quality.audit.field.room_required', 'Оси/Пом.*');
        } catch (_eSave) { /* ignore */ }
      }

      AuditActions.scheduleSessionSave();

      window.scrollTo({ top: 0, behavior: "smooth" });
      showToast(_t('quality.audit.toast.saved_history', '✅ Сохранено в Историю!'));

      window.render();
      window.updateUI();
      localStorage.setItem('rbi_cloud_dirty', '1');

      if (_syncConfig().enabled) {
        _sync('silent');
      }

      emit('audit:session:saved');
    },

    // =====================================================================
    // ОТКРЫТИЕ МОДАЛА ВЫБОРА ИСТОЧНИКА ФОТО
    // Перенесено из audit.legacy.js (было в app.js, строка 4288).
    // Вызывается из динамически генерируемого HTML: onclick="triggerPhotoInput(id)"
    // =====================================================================
    triggerPhotoInput: function (id) {
      syncPhotoTargetId(id);
      document.getElementById('photo-source-modal').style.display = 'flex';
    },

    // =====================================================================
    // ОБРАБОТКА ЗАГРУЗКИ ФОТО ИЗ ФАЙЛОВОГО ИНПУТА
    // Перенесено из audit.legacy.js (было в app.js, строка 4353).
    // Вызывается из index.html: onchange="handlePhotoUpload(event)"
    // =====================================================================
    handlePhotoUpload: function (event) {
      var file = event.target.files[0];
      if (!file) return;

      var photoId = resolvePhotoTargetId();
      if (window.activePhotoContext !== 'etalon' && !photoId) return;
      syncPhotoTargetId(photoId);

      var reader = new FileReader();
      reader.onload = function (e) {
        window.editorImgElement = new Image();
        window.editorImgElement.onload = function () {
          document.getElementById('photo-editor-overlay').style.display = 'flex';
          document.body.classList.add('modal-open');

          initPhotoEditor();

          var saveBtn = document.querySelector('#photo-editor-overlay button.text-green-400');
          if (window.activePhotoContext === 'etalon') {
            saveBtn.onclick = window.saveEtalonMarkupPhoto;
          } else {
            saveBtn.onclick = saveEditedPhoto;
          }
        };
        window.editorImgElement.src = e.target.result;
      };
      reader.readAsDataURL(file);
      event.target.value = '';
      emit('audit:state:changed', { action: 'photo' });
    },

    // =====================================================================
    // УДАЛЕНИЕ ФОТО
    // Перенесено из audit.legacy.js (было в app.js, строка 4293).
    // Вызывается из динамически генерируемого HTML: onclick="removePhoto(id, event, index)"
    // index — позиция в массиве photos[id] (Множественные фото, B1). Без
    // index (undefined) удаляет весь набор фото пункта (обратная совместимость
    // со старыми вызовами/старым форматом photos[id] как строки).
    // =====================================================================
    removePhoto: function (id, e, index) {
      if (e) e.stopPropagation();
      if (!confirm(_t('quality.audit.confirm.delete_photo', 'Удалить фото?'))) return;

      if (index === undefined || index === null) {
        delete AuditState.photos[id];
      } else {
        var arr = window.normalizeItemPhotos(AuditState.photos[id]);
        arr.splice(index, 1);
        if (arr.length === 0) delete AuditState.photos[id];
        else AuditState.photos[id] = arr;
      }

      window.updateCardDOM(id);
      AuditActions.saveSession();
    },

    // =====================================================================
    // ОТКРЫТИЕ МОДАЛА КОММЕНТАРИЯ/ПРИЧИНЫ ДЕФЕКТА
    // Перенесено из audit.legacy.js (было в app.js, строка 4209).
    // Вызывается из динамически генерируемого HTML: onclick="toggleCommentField(id)"
    // =====================================================================
    toggleCommentField: function (id) {
      window._auditCurrentCommentId = id;
      var container = document.getElementById('modal-cause-checkboxes');
      var textarea = document.getElementById('modal-cause-comment');

      var currentData = AuditState.details[id] || {};
      var savedCodes = currentData.causeCode ? currentData.causeCode.split(',') : [];

      var DEFECT_CAUSES = window._AUDIT_DEFECT_CAUSES || window.DEFECT_CAUSES || [];
      var html = '';
      DEFECT_CAUSES.forEach(function (c) {
        var isChecked = savedCodes.includes(c.code) ? 'checked' : '';
        var causeLabel = _t('quality.audit.cause.' + String(c.code).toLowerCase(), c.name);
        html += '<label class="flex items-center gap-2 cursor-pointer text-rbi-label font-bold text-ink"><input type="checkbox" value="' + c.code + '" class="cause-checkbox w-4 h-4 accent-indigo-600 rounded cursor-pointer" ' + isChecked + '> ' + causeLabel + '</label>';
      });
      if (container) container.innerHTML = html;

      var pureComment = currentData.comment || '';
      if (pureComment.startsWith('[')) {
        pureComment = pureComment.replace(/^\[.*?\]\s*/, '');
      }
      if (textarea) textarea.value = pureComment;

      var aiHint = document.getElementById('ai-hint-block');
      if (aiHint) { aiHint.innerHTML = ''; aiHint.classList.add('hidden'); }
      var overlay = document.getElementById('comment-modal-overlay');
      if (overlay) { overlay.style.display = 'flex'; document.body.classList.add('modal-open'); }
    },

    // =====================================================================
    // ЗАКРЫТИЕ МОДАЛА КОММЕНТАРИЯ
    // Перенесено из audit.legacy.js (было в app.js, строка 4238).
    // Вызывается из index.html: onclick="closeCommentModal()"
    // =====================================================================
    closeCommentModal: function () {
      var overlay = document.getElementById('comment-modal-overlay');
      if (overlay) overlay.style.display = 'none';
      document.body.classList.remove('modal-open');
      window._auditCurrentCommentId = null;
    },

    // =====================================================================
    // СОХРАНЕНИЕ КОММЕНТАРИЯ ИЗ МОДАЛА
    // Перенесено из audit.legacy.js (было в app.js, строка 4244).
    // Вызывается из index.html: onclick="saveCommentModal()"
    // =====================================================================
    saveCommentModal: function () {
      var id = window._auditCurrentCommentId;
      if (!id) return;

      var DEFECT_CAUSES = window._AUDIT_DEFECT_CAUSES || window.DEFECT_CAUSES || [];
      var checkboxes = document.querySelectorAll('.cause-checkbox:checked');
      var checkedCodes = Array.from(checkboxes).map(function (cb) { return cb.value; });
      var code = checkedCodes.join(',');

      var textarea = document.getElementById('modal-cause-comment');
      var text = textarea ? textarea.value.trim() : '';

      AuditState.details[id] = AuditState.details[id] || {};
      AuditState.details[id].causeCode = code;

      // Stored comment keeps canonical (RU) cause names — data, not UI chrome.
      var causeNames = checkedCodes.map(function (cCode) {
        var found = DEFECT_CAUSES.find(function (c) { return c.code === cCode; });
        return found ? found.name : null;
      }).filter(Boolean).join(', ');

      var finalComment = text;
      if (causeNames) {
        finalComment = text ? '[' + causeNames + '] ' + text : '[' + causeNames + ']';
      }
      AuditState.details[id].comment = finalComment;

      window.updateCardDOM(id);
      AuditActions.saveSession();

      if (text.length > 15) {
        _gameLogAction('comment_written', id);
      }
      window.closeCommentModal();
    },

    // =====================================================================
    // УДАЛЕНИЕ КОММЕНТАРИЯ
    // Перенесено из audit.legacy.js (было в app.js, строка 4279).
    // Вызывается из динамически генерируемого HTML: onclick="deleteComment(id, event)"
    // =====================================================================
    deleteComment: function (id, e) {
      if (e) e.stopPropagation();
      if (AuditState.details[id]) {
        AuditState.details[id].comment = '';
        AuditState.details[id].causeCode = '';
      }
      window.updateCardDOM(id);
      AuditActions.saveSession();
    }
  };

  window.AuditActions = AuditActions;

  // =========================================================================
  // УМНАЯ ФИКСАЦИЯ ПОЛЕЙ
  // Перенесено из app.js (было app.js:1114-1166). startSmartLock/
  // cancelSmartLock не имеют найденных вызывающих в разметке (проверено
  // Grep по index.html/js/**) — перенесены 1:1 без удаления, решение об
  // удалении мёртвого кода — предмет отдельного будущего блока.
  // =========================================================================
  let smartLockTimer = null;

  function startSmartLock(e, inputId) {
    const input = document.getElementById(inputId);
    if (!input || !input.hasAttribute('readonly')) return;

    smartLockTimer = setTimeout(() => {
      if (confirm(_t('quality.audit.confirm.unlock_field', 'Разблокировать поле для изменения значения?'))) {
        unlockSmartField(inputId);
        // Если разблокировали инспектора, убираем из настроек
        if (inputId === 'inp-inspector') { _setSetting('engineerName', ''); }
        if (inputId === 'inp-project') { _setSetting('defaultProject', ''); }
      }
    }, 800); // 800 мс долгого нажатия
  }

  function cancelSmartLock() {
    if (smartLockTimer) clearTimeout(smartLockTimer);
  }

  function unlockSmartField(inputId) {
    const input = document.getElementById(inputId);
    const lock = document.getElementById(`lock-${inputId}`);
    if (!input) return;

    input.removeAttribute('readonly');
    input.classList.remove('bg-surface', 'text-muted', 'cursor-not-allowed');
    if (lock) {
      lock.classList.add('hidden');
    }
    input.focus();
  }

  window.applySmartLocks = function () {
    if (window.isDemoMode) return;

    const inspInput = document.getElementById('inp-inspector');

    // 1. Блокировка имени инспектора (всегда)
    if (inspInput && _getSetting('engineerName')) {
      inspInput.value = _getSetting('engineerName');
      inspInput.setAttribute('readonly', 'true');
      inspInput.classList.add('bg-surface', 'text-muted', 'cursor-not-allowed', 'pointer-events-none');
      document.getElementById('lock-inp-inspector')?.classList.remove('hidden');
    } else if (inspInput) {
      inspInput.classList.remove('pointer-events-none');
    }

    // Блокировку объекта мы полностью делегировали в ObjectDirectory.initUI()
    { var o3 = _objects(); if (o3 && typeof o3.initUI === 'function') o3.initUI(); }
  };

  // =========================================================================
  // WINDOW-ПРОКСИ (обратная совместимость: index.html inline-обработчики,
  // динамически генерируемый HTML — onclick в строках, генерируемых
  // updateCardDOM/render — и вызовы из app.js/export.js).
  // =========================================================================
  window.saveSessionData = AuditActions.saveSession.bind(AuditActions);
  window.scheduleSessionSave = AuditActions.scheduleSessionSave.bind(AuditActions);
  window.getSessionPhotosForSync = AuditActions.getSessionPhotosForSync.bind(AuditActions);
  window.toggleOk = AuditActions.toggleOk.bind(AuditActions);
  window.toggleFail = AuditActions.toggleFail.bind(AuditActions);
  window.toggleEscalation = AuditActions.toggleEscalation.bind(AuditActions);
  window.saveProductToArray = AuditActions.saveProductToArray.bind(AuditActions);
  window.changeTemplate = AuditActions.changeTemplate.bind(AuditActions);
  window.resetChecklist = AuditActions.resetChecklist.bind(AuditActions);
  window.handlePhotoUpload = AuditActions.handlePhotoUpload.bind(AuditActions);
  window.triggerPhotoInput = AuditActions.triggerPhotoInput.bind(AuditActions);
  window.removePhoto = AuditActions.removePhoto.bind(AuditActions);
  window.toggleCommentField = AuditActions.toggleCommentField.bind(AuditActions);
  window.closeCommentModal = AuditActions.closeCommentModal.bind(AuditActions);
  window.saveCommentModal = AuditActions.saveCommentModal.bind(AuditActions);
  window.deleteComment = AuditActions.deleteComment.bind(AuditActions);

  // Внутренний ID текущего комментария в модалке (UI-состояние, не сессионные
  // данные аудита — не оборачивается в AuditState, см. план «Что разобрать» п.2).
  window._auditCurrentCommentId = window._auditCurrentCommentId || null;

  console.log('[RBI Module] audit.actions loaded (owner-module: full business logic)');
}());

// =========================================================================
// РАЗМЕТКА МОДАЛКИ «comment-modal-overlay» (перенос из index.html:1224-1263,
// перенос 30 modal/overlay-блоков #app-modals в JS-рендер). HTML-строка 1:1
// идентична прежней статичной разметке.
// =========================================================================
function renderCommentModalOverlayMarkup() {
  return `
    <div id="comment-modal-overlay"
        class="fixed inset-0 bg-slate-900/70 z-[1600] hidden items-center justify-center p-4 backdrop-blur-sm"
        data-audit-action="closeCommentModal">
        <div class="bg-[var(--card-bg)] w-full max-w-md p-6 rounded-2xl shadow-2xl transition-transform"
            onclick="event.stopPropagation()">
            <div
                class="font-black text-rbi-body uppercase tracking-tight mb-4 border-b border-[var(--card-border)] pb-3 flex items-center gap-2 text-ink dark:text-white">
                <svg class="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z">
                    </path>
                </svg>
                ${_t('quality.audit.comment.title', 'Детали дефекта')}
            </div>
            <div class="mb-4">
                <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1.5 block">${_t('quality.audit.comment.causes_label', 'Причины дефекта (Можно выбрать несколько)')}</label>
                <!-- ВСТАВКА: Контейнер для чекбоксов вместо селекта -->
                <div id="modal-cause-checkboxes" class="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto custom-scrollbar p-2 bg-[var(--hover-bg)] border border-[var(--card-border)] rounded-xl" data-action="generateAiHintForDefect" data-action-event="change"></div>
                <!-- Сюда будет падать ответ нейросети -->
                <div id="ai-hint-block"
                    class="mt-2 text-rbi-caption text-brand bg-brand-soft border border-brand-soft rounded-lg p-2 hidden shadow-inner leading-snug">
                </div>
            </div>
            <div class="mb-5">
                <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1.5 block">${_t('quality.audit.comment.detail_label', 'Уточняющий комментарий')}</label>
                <textarea id="modal-cause-comment"
                    class="w-full bg-[var(--hover-bg)] border border-[var(--card-border)] rounded-xl p-3 text-rbi-body outline-none h-24 resize-none text-ink"
                    placeholder="${_t('quality.audit.comment.placeholder', 'Напишите детали (величину отклонения, размеры и т.д.)...')}"></textarea>
            </div>
            <div class="flex gap-2">
                <button data-audit-action="closeCommentModal"
                    class="bg-surface text-muted border border-surface px-4 py-3.5 rounded-xl font-bold text-rbi-label uppercase active:scale-95 flex-1">${_t('quality.audit.comment.cancel', 'Отмена')}</button>
                <button data-audit-action="saveCommentModal"
                    class="flex-1 bg-brand text-white px-4 py-3.5 rounded-xl font-bold text-rbi-label uppercase shadow-md active:scale-95">${_t('quality.audit.comment.save', 'Сохранить')}</button>
            </div>
        </div>
    </div>
`;
}

(function mountCommentModalOverlayMarkup() {
  if (document.getElementById('comment-modal-overlay')) return;
  var root = window.RBI && window.RBI.services && window.RBI.services.shell
    ? window.RBI.services.shell.getModalsRoot()
    : document.getElementById('app-modals');
  if (!root) return;
  root.insertAdjacentHTML('beforeend', renderCommentModalOverlayMarkup());
}());

export const AuditActions = window.AuditActions;
