// session.service.js — Фаза 25: AuditSessionService (16-й инфраструктурный сервис)
//
// Фасад над window.state / window.details / window.photos / window.currentTemplateKey /
// window.currentChecklist. Полная обратная совместимость — не заменяет хранилище,
// только предоставляет API для новых модулей через ctx.session.

(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  /* Владение session-квинтетом + customExpertConclusions (Реальная изоляция
     модулей, часть 3, Группа C, критичный шаг): перенесено 1:1 из
     js/core/bootstrap.js — SessionService теперь единственный владелец
     объявлений, window.* остаются синхронизированными живыми ссылками для
     полной обратной совместимости со всеми существующими потребителями. */
  window.state = {};
  window.details = {};
  window.photos = {};
  window.currentTemplateKey = '';
  window.currentChecklist = [];
  window.customExpertConclusions = {};

  var SessionService = {
    // Живые ссылки — не копии
    getState: function () { return window.state; },
    getDetails: function () { return window.details; },
    getPhotos: function () { return window.photos; },
    getTemplateKey: function () { return window.currentTemplateKey; },
    getChecklist: function () { return window.currentChecklist; },

    // Сеттеры — мутируют существующие объекты (обратная совместимость)
    setState: function (key, val) {
      if (window.state && typeof window.state === 'object') window.state[key] = val;
    },
    setDetail: function (key, val) {
      if (window.details && typeof window.details === 'object') window.details[key] = val;
    },
    addPhoto: function (posKey, src) {
      if (window.photos) {
        if (!window.photos[posKey]) window.photos[posKey] = [];
        window.photos[posKey].push(src);
      }
    },
    removePhoto: function (posKey, idx) {
      if (window.photos && window.photos[posKey]) {
        window.photos[posKey].splice(idx, 1);
      }
    },
    setTemplateKey: function (key) {
      window.currentTemplateKey = key;
    },
    setChecklist: function (groups) {
      window.currentChecklist = groups;
    },
    getPhotoRaw: function (key) {
      return window.photos ? window.photos[key] : undefined;
    },
    setPhotoRaw: function (key, val) {
      if (window.photos) window.photos[key] = val;
    },
    deletePhotoRaw: function (key) {
      if (window.photos) delete window.photos[key];
    },
    replaceState: function (obj) {
      window.state = obj;
    },
    replaceDetails: function (obj) {
      window.details = obj;
    },
    replacePhotos: function (obj) {
      window.photos = obj;
    },

    // Утилиты
    isSessionEmpty: function () {
      return !window.state || Object.keys(window.state).length === 0;
    },
    getSessionSnapshot: function () {
      return {
        state: JSON.parse(JSON.stringify(window.state || {})),
        details: JSON.parse(JSON.stringify(window.details || {})),
        photosCount: Object.keys(window.photos || {}).reduce(function (acc, k) {
          return acc + (window.photos[k] ? window.photos[k].length : 0);
        }, 0),
        templateKey: window.currentTemplateKey || null,
      };
    },
    reset: function () {
      if (window.state) Object.keys(window.state).forEach(function (k) { delete window.state[k]; });
      if (window.details) Object.keys(window.details).forEach(function (k) { delete window.details[k]; });
      if (window.photos) Object.keys(window.photos).forEach(function (k) { delete window.photos[k]; });
      window.currentTemplateKey = '';
      window.currentChecklist = [];
    },

    // Восстановление сессии из IndexedDB (перенесено из js/app.js, Шаг 2)
    restoreSession: async function () {
      try {
        const data = await dbGet(STORES.STATE, 'current_session');

        // Курсорный проход вместо dbGetAll — не материализует весь стор HISTORY
        // в RAM одним массивом (тот же паттерн, что уже применён для REPORTS).
        // ЖЕСТКАЯ ОЧИСТКА: Эталоны, затесавшиеся в Историю, идут не в contractorArray,
        // а в список на физическое удаление (dbDelete — после закрытия курсора,
        // см. предупреждение в dbForEachCursor/storage-db.core.js).
        const historyList = [];
        const etalonIdsToRemoveFromHistory = [];
        await dbForEachCursor(STORES.HISTORY, (item) => {
          if (!item) return;
          if (item.templateKey === 'sys_etalon_act') {
            etalonIdsToRemoveFromHistory.push(item.id);
            return;
          }
          // P2-0024: повторяющиеся строки — общим экземпляром (содержимое то же, −16% памяти истории)
          if (!item._deleted) historyList.push(window.RbiHistoryMemory ? window.RbiHistoryMemory.lighten(item) : item);
        });
        window.contractorArray = historyList;
        // P2-0024: Журнал, уже показанный первой порцией из базы, — на полную историю из памяти (без второй копии)
        if (window.HistoryState && typeof window.HistoryState.useMemoryHistoryIfReady === 'function'
            && window.HistoryState.useMemoryHistoryIfReady()
            && document.getElementById('history-list') && typeof window.renderHistoryTab === 'function') {
          try { window.renderHistoryTab(); } catch (_e) { /* ignore */ }
        }

        if (etalonIdsToRemoveFromHistory.length > 0) {
          for (const id of etalonIdsToRemoveFromHistory) {
            await dbDelete(STORES.HISTORY, id);
          }
          console.log(`[Очистка] Удалено ${etalonIdsToRemoveFromHistory.length} эталонов из Истории`);
        }

        // Загружаем эталоны в СВОЙ отдельный массив — курсором, без dbGetAll.
        const etalonsList = [];
        await dbForEachCursor(STORES.ETALON_ACTS, (item) => {
          if (item && !item._deleted) etalonsList.push(item);
        });
        window.etalonActsArray = etalonsList;
        // Загружаем сохраненные PDF-отчеты
        const reportsList = [];
        await dbForEachCursor(STORES.REPORTS, (r) => {
            if (!r || r._deleted) return;
            const url = r.file_url || r.fileUrl || '';
            if (r.file_blob && typeof url === 'string' && url.indexOf('http') === 0) {
                reportsList.push({ ...r, file_blob: null });
            } else {
                reportsList.push(r);
            }
        });
        window.reportsArray = reportsList;
        if (window.RBI?.services?.reports?.detachCloudBlobsInMemory) {
            window.RBI.services.reports.detachCloudBlobsInMemory(window.reportsArray);
        } else {
            (window.reportsArray || []).forEach((r) => {
                if (r && r.file_blob && r.file_url && String(r.file_url).startsWith('http')) r.file_blob = null;
            });
        }

        // НОВОЕ: Инициализируем кэш и запускаем миграцию
        await PhotoManager.init();
        if (!localStorage.getItem('photo_migration_v1_done')) {
          await runPhotoMigration(window.contractorArray);
          localStorage.setItem('photo_migration_v1_done', '1');
        }

        // Разовый полный пересчёт агрегатов подрядчика (contractor-metrics.service.js)
        // — один раз при старте приложения, не при каждом открытии вкладок
        // «Подрядчики»/«Сводка» (см. отчёт по оптимизации журнала/аналитики).
        if (window.RBI && window.RBI.services && window.RBI.services.contractorMetrics) {
          window.RBI.services.contractorMetrics.recalcAll();
        }

        if (!data) return;

        if (data.templateKey) window.currentTemplateKey = data.templateKey;

        if (window.currentTemplateKey) {
          const type = window.currentTemplateKey.split('_')[0];
          const key = window.currentTemplateKey.slice(type.length + 1);
          if (type === 'sys' && window.SYSTEM_TEMPLATES[key]) window.currentChecklist = window.SYSTEM_TEMPLATES[key].groups;
          else if (type === 'user' && userTemplates[key]) window.currentChecklist = userTemplates[key].groups;
        }

        window.state = data.state || {};
        window.details = data.details || {};
        assignPhotosMap(data.photos);
        window.customExpertConclusions = data.customExpertConclusions || {};

        // НОВОЕ: Распаковываем фото в незаконченном черновике, если они там есть
        // RBI NEW (Множественные фото к пункту чек-листа, B1): window.photos[k]
        // может быть массивом — обрабатываем каждый элемент отдельно.
        for (let k in window.photos) {
          if (Array.isArray(window.photos[k])) {
            for (let pi = 0; pi < window.photos[k].length; pi++) {
              const p = window.photos[k][pi];
              if (p && p.startsWith('local://')) {
                window.photos[k][pi] = await PhotoManager.getBlobUrl(p) || p;
              }
            }
          } else if (window.photos[k] && window.photos[k].startsWith('local://')) {
            window.photos[k] = await PhotoManager.getBlobUrl(window.photos[k]) || window.photos[k];
          }
        }

        if (window.currentTemplateKey && document.getElementById('checklist-selector')) {
          document.getElementById('checklist-selector').value = window.currentTemplateKey;
        }

        if (document.getElementById('inp-project')) document.getElementById('inp-project').value = data.project || '';
        if (document.getElementById('inp-inspector')) document.getElementById('inp-inspector').value = data.inspector || '';
        if (document.getElementById('inp-contractor')) document.getElementById('inp-contractor').value = data.contractor || '';
        if (document.getElementById('inp-section')) document.getElementById('inp-section').value = data.section || '';
        if (document.getElementById('inp-floor')) document.getElementById('inp-floor').value = data.floor || '';
        if (document.getElementById('inp-room')) document.getElementById('inp-room').value = data.room || '';

        updateLocationFromStructured(); // Пересчитываем скрытый inp-location

        // Q-pin-1: восстановить pin из draft session (top-level или metrics.planPin)
        var restoredPin = data.planPin || (data.metrics && data.metrics.planPin) || null;
        if (window.AuditState && typeof window.AuditState.restorePlanPin === 'function') {
          window.AuditState.restorePlanPin(restoredPin);
        }
        try {
          var ind = document.getElementById('quality-plan-pin-indicator');
          var roomEl = document.getElementById('inp-room');
          if (restoredPin && restoredPin.locationId != null) {
            if (ind) { ind.classList.remove('hidden'); ind.classList.add('flex'); }
            if (roomEl) roomEl.placeholder = 'Оси/Пом. (опц.)';
          } else if (ind) {
            ind.classList.add('hidden');
            ind.classList.remove('flex');
          }
        } catch (_pinUi) { /* ignore */ }

        // applySmartLocks — audit.actions (quality). На DCL / без quality модуля — no-op.
        if (typeof window.applySmartLocks === 'function') {
          window.applySmartLocks();
        }

        if (typeof updateDataSummary === 'function') window.updateDataSummary();

        // ПРИНУДИТЕЛЬНЫЙ РЕНДЕР АНАЛИТИКИ (ЕСЛИ МЫ НА ЭТОЙ ВКЛАДКЕ ПОСЛЕ F5)
        const activeTab = document.querySelector('.view-section.active');
        if (activeTab && activeTab.id === 'tab-analytics' && typeof renderCurrentAnalyticsTab === 'function') {
          renderCurrentAnalyticsTab();
        }
      } catch (e) {
        console.error('Ошибка восстановления:', e);
      }
      // updateAllDynamicFilters — history.render (quality). То же: DCL / stub без quality.
      if (typeof window.updateAllDynamicFilters === 'function') {
        window.updateAllDynamicFilters();
      }
      setTimeout(() => {
        if (typeof checkScheduledBackups === 'function') checkScheduledBackups();
        if (typeof checkAutoReports === 'function') checkAutoReports(); // <-- ДОБАВИЛИ
      }, 2000);
    },
  };

  window.RBI = window.RBI || {};
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.session = SessionService;
  if (window.RBI.registry && window.RBI.registry.register) {
    window.RBI.registry.register('service.session', SessionService);
  }
  window.restoreSession = SessionService.restoreSession;

  console.log('[SessionService] session.service.js loaded');
}());
