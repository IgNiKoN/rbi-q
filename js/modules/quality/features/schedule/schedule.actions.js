// schedule.actions.js — Блок 29/31: бизнес-действия модуля Schedule
//
// Шаг 31 (10-шаговый цикл очистки, раздел 15 PLATFORM_TARGET_ARCHITECTURE.md):
// бизнес-логика физически перенесена сюда из app.js (была там до Step 31).
// Паттерн _scheduleStorage()/_scheduleSync() (Step 30) перенесён без изменений —
// переход на ctx.storage/ctx.sync — отдельный будущий шаг.
// window.rbi_* присваиваются здесь напрямую (синхронно при загрузке скрипта),
// чтобы inline onclick/onchange в index.html и HTML, сгенерированном
// schedule.render.js, продолжали работать без изменений.

(function () {

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

  /**
   * Безопасный вызов legacy-функции.
   * Если функция недоступна — выводит предупреждение.
   */
  function _templates() {
    if (ScheduleActions._ctx && ScheduleActions._ctx.templates) {
      return ScheduleActions._ctx.templates;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.templates) {
      return window.RBI.services.templates;
    }
    return {
      getUserTemplates: function () {
        return typeof window.userTemplates !== 'undefined' ? window.userTemplates : {};
      },
      getSystemTemplates: function () {
        return typeof window.SYSTEM_TEMPLATES !== 'undefined' ? window.SYSTEM_TEMPLATES : {};
      }
    };
  }

  function _isDemoMode() {
    return (ScheduleActions._ctx && ScheduleActions._ctx.appMode) ?
      ScheduleActions._ctx.appMode.isDemo() :
      window.RBI.services.appMode.isDemo();
  }

  function _call(name, fn, args) {
    if (typeof fn === 'function') {
      return fn.apply(null, args || []);
    } else {
      console.warn('[ScheduleActions] ' + name + ' недоступен');
    }
  }

  // Бронебойная функция парсинга дат из Excel
  window.rbi_safeDateISO = function (val) {
    if (val === undefined || val === null || val === '') return new Date().toISOString();
    let d = null;
    if (typeof val === 'number') {
        d = new Date((val - 25569) * 86400 * 1000);
    } else if (typeof val === 'string') {
        const parts = val.trim().split(/[.,/ -]/);
        if (parts.length === 3) {
            let day = parts[0].padStart(2, '0');
            let month = parts[1].padStart(2, '0');
            let year = parts[2];
            if (year.length === 2) year = "20" + year;
            d = new Date(`${year}-${month}-${day}T12:00:00Z`);
        } else {
            d = new Date(val);
        }
    }
    if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
    return new Date().toISOString();
  };

  window.rbi_findTemplateKey = function (titleStr) {
    if (!titleStr) return '';
    const search = titleStr.toLowerCase();
    const _st = _templates().getSystemTemplates();
    for (let key in _st) {
        if (_st[key].title.toLowerCase().includes(search)) return `sys_${key}`;
    }
    const _ut = _templates().getUserTemplates();
    for (let key in _ut) {
        if (_ut[key].title.toLowerCase().includes(search)) return `user_${key}`;
    }
    return '';
  };

  window.rbi_importScheduleExcel = function () {
    document.getElementById('schedule-excel-input').click();
  };

  // Блок 30: единая точка доступа к IndexedDB через StorageService или fallback (Schedule-блок)
  function _scheduleStorage() {
    if (ScheduleActions._ctx && ScheduleActions._ctx.storage) {
        return ScheduleActions._ctx.storage;
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

  // Блок 30: единая точка вызова синхронизации через SyncService или fallback (Schedule-блок)
  function _scheduleSync(mode) {
    var m = mode || 'silent';
    if (ScheduleActions._ctx && ScheduleActions._ctx.sync) {
        return ScheduleActions._ctx.sync.trigger(m);
    }
    if (window.RBI && window.RBI.services && window.RBI.services.sync) {
        return window.RBI.services.sync.trigger(m);
    }
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
  }

  // Мягкое удаление одной строки
  window.rbi_deleteScheduleRow = async function (id) {
    if (!confirm(_t('quality.schedule.confirm.delete_row', 'Удалить эту строку?'))) return;
    let item = window.rbi_scheduleData.find(s => s.id === id);
    if (item) {
        item._deleted = true;
        item.updatedAt = new Date().toISOString();
        await _scheduleStorage().put(_scheduleStorage().stores().SCHEDULE, item);
        localStorage.setItem('rbi_cloud_dirty', '1');
        _scheduleSync('silent');
    }
    rbi_renderScheduleTab(true);
  };

  // Мягкое удаление всего графика
  window.rbi_clearSchedule = async function () {
    if (!confirm(_t('quality.schedule.confirm.clear_all', 'Удалить ВЕСЬ график? Это действие необратимо.'))) return;
    for (let s of window.rbi_scheduleData) {
        s._deleted = true;
        s.updatedAt = new Date().toISOString();
        await _scheduleStorage().put(_scheduleStorage().stores().SCHEDULE, s);
    }
    localStorage.setItem('rbi_cloud_dirty', '1');
    _scheduleSync('silent');
    rbi_renderScheduleTab(true);
    showToast(_t('quality.schedule.toast.cleared', '🗑️ График полностью очищен'));
  };

  // Сохранение графика (Только при реальных изменениях)
  window.rbi_saveSchedule = async function () {
    if (_isDemoMode()) return showToast(_t('quality.schedule.toast.demo_save_disabled', 'В демо-режиме сохранение отключено'));

    const rows = document.querySelectorAll('.sched-row');
    const validIds = new Set();
    let hasRealChanges = false;

    rows.forEach(row => {
        const id = row.dataset.id;
        const wTitle = row.querySelector('.sched-work').value.trim();
        const contr = row.querySelector('.sched-contr').value.trim();
        const dStart = row.querySelector('.sched-start').value;
        const dEnd = row.querySelector('.sched-end').value;
        const tKey = row.querySelector('.sched-tmpl').value;

        if (wTitle || contr) {
            validIds.add(id);
            let existing = window.rbi_scheduleData.find(s => s.id === id);

            const newStartISO = dStart ? new Date(dStart).toISOString() : new Date().toISOString();
            const newEndISO = dEnd ? new Date(dEnd).toISOString() : new Date().toISOString();

            if (existing) {
                // Сверяем значения. Если хоть одно отличается - значит были правки
                if (existing.workTitle !== wTitle || existing.contractor !== contr ||
                    existing.startDate.split('T')[0] !== newStartISO.split('T')[0] ||
                    existing.endDate.split('T')[0] !== newEndISO.split('T')[0] ||
                    existing.templateKey !== tKey || existing._deleted) {

                    existing.workTitle = wTitle;
                    existing.contractor = contr;
                    existing.startDate = newStartISO;
                    existing.endDate = newEndISO;
                    existing.templateKey = tKey;
                    existing.updatedAt = new Date().toISOString();
                    existing._deleted = false;
                    hasRealChanges = true;
                }
            } else {
                // Это новая строка
                window.rbi_scheduleData.push({
                    id: id, workTitle: wTitle, contractor: contr,
                    startDate: newStartISO, endDate: newEndISO,
                    templateKey: tKey, updatedAt: new Date().toISOString(), _deleted: false
                });
                hasRealChanges = true;
            }
        }
    });

    // Помечаем удаленными те, что исчезли из DOM
    window.rbi_scheduleData.forEach(s => {
        if (!validIds.has(s.id) && !s._deleted) {
            s._deleted = true;
            s.updatedAt = new Date().toISOString();
            hasRealChanges = true;
        }
    });

    if (!hasRealChanges) {
        return showToast(_t('quality.schedule.toast.no_changes', 'Нет изменений для сохранения.'));
    }

    // Сохраняем в БД
    for (let s of window.rbi_scheduleData) {
        await _scheduleStorage().put(_scheduleStorage().stores().SCHEDULE, s);
    }

    localStorage.setItem('rbi_cloud_dirty', '1');
    _scheduleSync('silent');

    showToast(_t('quality.schedule.toast.saved', '✅ График СМР обновлен!'));

    // СНАЧАЛА пересчитываем задачи, А ПОТОМ перерисовываем график (чтобы задачи уже встали на новые места)
    if (typeof window.rbi_generateAutoTasks === 'function') {
        await window.rbi_generateAutoTasks(true); // Передаем true, чтобы скрыть лишние тосты генератора
    }

    rbi_renderScheduleTab(true);
  };

  // Загрузка графика из Excel
  window.rbi_handleScheduleImport = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    showToast(_t('quality.schedule.toast.reading_excel', '⚙️ Читаем Excel файл...'));

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (rows.length < 2) throw new Error(_t('quality.schedule.error.empty_file', 'Файл пуст или не содержит данных'));

            let added = 0;
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                const wTitle = row[0] ? row[0].toString().trim() : '';
                const contr = row[1] ? row[1].toString().trim() : '';

                if (!wTitle && !contr) continue;

                // Используем бронебойную функцию парсинга дат
                const dStartISO = rbi_safeDateISO(row[2]);
                const dEndISO = rbi_safeDateISO(row[3]);

                const newRow = {
                    id: window.RbiIds.newId(),
                    workTitle: wTitle,
                    contractor: contr,
                    startDate: dStartISO,
                    endDate: dEndISO,
                    templateKey: rbi_findTemplateKey(wTitle),
                    updatedAt: new Date().toISOString(),
                    _deleted: false
                };

                window.rbi_scheduleData.push(newRow);
                await _scheduleStorage().put(_scheduleStorage().stores().SCHEDULE, newRow);
                added++;
            }

            localStorage.setItem('rbi_cloud_dirty', '1');
            _scheduleSync('silent');

            showToast(_t('quality.schedule.toast.loaded_stages', '✅ Загружено этапов: {n}', { n: added }));
            rbi_renderScheduleTab(true);

            // ВЫЗЫВАЕМ ГЕНЕРАТОР ЗАДАЧ ПОСЛЕ ИМПОРТА EXCEL
            await window.rbi_generateAutoTasks();

        } catch (err) {
            console.error(err);
            alert(_t('quality.schedule.error.read_excel', 'Ошибка чтения Excel: {msg}', { msg: err.message }));
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  var ScheduleActions = {

    _ctx: null,
    bindCtx: function (ctx) { this._ctx = ctx; },

    /**
     * Отрендерить вкладку графика СМР.
     * Делегирует в window.rbi_renderScheduleTab(skipLoad).
     */
    renderScheduleTab: function (skipLoad) {
      return _call('rbi_renderScheduleTab', window.rbi_renderScheduleTab, [skipLoad]);
    },

    /**
     * Добавить пустую строку в редактор графика.
     * Делегирует в window.rbi_addScheduleRow().
     */
    addScheduleRow: function () {
      return _call('rbi_addScheduleRow', window.rbi_addScheduleRow, []);
    },

    /**
     * Удалить одну строку графика.
     * Делегирует в window.rbi_deleteScheduleRow(id).
     */
    deleteScheduleRow: function (id) {
      return _call('rbi_deleteScheduleRow', window.rbi_deleteScheduleRow, [id]);
    },

    /**
     * Очистить весь график.
     * Делегирует в window.rbi_clearSchedule().
     */
    clearSchedule: function () {
      return _call('rbi_clearSchedule', window.rbi_clearSchedule, []);
    },

    /**
     * Сохранить правки редактора графика.
     * Делегирует в window.rbi_saveSchedule().
     */
    saveSchedule: function () {
      return _call('rbi_saveSchedule', window.rbi_saveSchedule, []);
    },

    /**
     * Импортировать график из Excel-файла.
     * Делегирует в window.rbi_handleScheduleImport(event).
     */
    handleScheduleImport: function (event) {
      return _call('rbi_handleScheduleImport', window.rbi_handleScheduleImport, [event]);
    },

    /**
     * Синхронизирует состояние из legacy-переменных.
     */
    syncFromLegacy: function () {
      if (window.ScheduleState) {
        window.ScheduleState.syncFromLegacy();
      }
    }
  };

  window.ScheduleActions = ScheduleActions;
})();

console.log('[ScheduleActions] schedule.actions.js loaded');
