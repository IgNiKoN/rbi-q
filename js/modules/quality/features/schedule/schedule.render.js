// schedule.render.js — Блок 29/31: рендер модуля Schedule
//
// Шаг 31 (10-шаговый цикл очистки, раздел 15 PLATFORM_TARGET_ARCHITECTURE.md):
// бизнес-логика рендера физически перенесена сюда из app.js (была там до Step 31).
// window.rbi_renderScheduleTab / window.rbi_addScheduleRow присваиваются здесь
// напрямую (синхронно при загрузке скрипта), чтобы inline onclick в HTML,
// сгенерированном этой же функцией, и в index.html продолжали работать
// без изменений.

(function () {
  var _ctx = null;
  var _scheduleI18nBound = false;

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

  function _getTasks() {
    if (_ctx && _ctx.tasks) {
      return _ctx.tasks.getTasksSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.tasks) {
      return window.RBI.services.tasks.getTasksSync();
    }
    return typeof window.rbi_tasksData !== 'undefined' ? window.rbi_tasksData : [];
  }

  function _templates() {
    if (_ctx && _ctx.templates) {
      return _ctx.templates;
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
    return (_ctx && _ctx.appMode) ? _ctx.appMode.isDemo() : window.RBI.services.appMode.isDemo();
  }

  // Главный рендер графика (С визуализацией Ганта и задачами)
  window.rbi_renderScheduleTab = async function (skipLoad = false) {
    const container = document.getElementById('schedule-container');
    if (!container) return;

    if (!skipLoad && !_isDemoMode()) {
        await rbi_loadData();
    }
    if (!window.rbi_scheduleData) window.rbi_scheduleData = [];

    // 1. Собираем чек-листы для селектора
    const unboundOpt = _t('quality.schedule.option.unbound', '-- Не привязан --');
    const prefixSys = _t('quality.schedule.prefix.sys', '[СИС]');
    const prefixUser = _t('quality.schedule.prefix.user', '[МОЙ]');
    let clOptions = '<option value="">' + unboundOpt + '</option>';
    const _st = _templates().getSystemTemplates();
    const sysKeys = Object.keys(_st).sort((a, b) => _st[a].title.localeCompare(_st[b].title));
    sysKeys.forEach(key => { clOptions += `<option value="sys_${key}">${prefixSys} ${_st[key].title}</option>`; });

    const _ut = _templates().getUserTemplates();
    const userKeys = Object.keys(_ut).sort((a, b) => _ut[a].title.localeCompare(_ut[b].title));
    userKeys.forEach(key => { clOptions += `<option value="user_${key}">${prefixUser} ${_ut[key].title}</option>`; });

    // 2. Генерируем строки редактора (таблицы)
    let activeData = window.rbi_scheduleData.filter(s => !s._deleted);
    let rowsHtml = activeData.sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0)).map(s => {
        const d1 = s.startDate ? new Date(s.startDate).toISOString().split('T')[0] : '';
        const d2 = s.endDate ? new Date(s.endDate).toISOString().split('T')[0] : '';
        let currentSelect = clOptions.replace(`value="${s.templateKey}"`, `value="${s.templateKey}" selected`);

        return `
            <tr class="sched-row hover:bg-[var(--hover-bg)] transition-colors" data-id="${s.id}">
                <td class="p-1"><input type="text" class="input-base !py-1.5 text-rbi-caption w-full sched-work font-bold" value="${s.workTitle || ''}" placeholder="${_t('quality.schedule.ph.work', 'Вид работ')}"></td>
                <td class="p-1"><input type="text" class="input-base !py-1.5 text-rbi-caption w-full sched-contr" value="${s.contractor || ''}" placeholder="${_t('quality.schedule.ph.contractor', 'Подрядчик')}"></td>
                <td class="p-1"><input type="date" class="input-base !py-1.5 text-rbi-caption w-full sched-start" value="${d1}"></td>
                <td class="p-1"><input type="date" class="input-base !py-1.5 text-rbi-caption w-full sched-end" value="${d2}"></td>
                <td class="p-1"><select class="input-base !py-1.5 text-rbi-caption w-full sched-tmpl">${currentSelect}</select></td>
                <td class="p-1 text-center">
                    <button onclick="rbi_deleteScheduleRow('${s.id}')" class="text-danger hover:text-danger bg-danger-soft p-1.5 rounded-lg border border-danger-soft active:scale-90 flex items-center justify-center mx-auto transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                </td>
            </tr>`;
    }).join('');

    if (activeData.length === 0) {
        rowsHtml = `<tr><td colspan="6" class="text-center py-6 text-muted text-rbi-label font-bold uppercase tracking-widest border-b border-dashed border-slate-300">${_t('quality.schedule.empty.no_stages', 'В графике нет этапов.')}</td></tr>`;
    }

    // 3. ГЕНЕРИРУЕМ ВИЗУАЛЬНЫЙ ТАЙМЛАЙН (СТРОГИЙ, КОМПАКТНЫЙ СТИЛЬ)
    let ganttHtml = '';
    if (activeData.length > 0) {
        // Находим крайние точки проекта для масштаба (+5% отступы по краям)
        let minDateMs = Math.min(...activeData.map(s => new Date(s.startDate).getTime()));
        let maxDateMs = Math.max(...activeData.map(s => new Date(s.endDate).getTime()));
        const paddingTime = (maxDateMs - minDateMs) * 0.05;

        const globalStart = minDateMs - paddingTime;
        const globalEnd = maxDateMs + paddingTime;
        let totalDuration = globalEnd - globalStart;
        if (totalDuration === 0) totalDuration = 1;

        // Положение линии "СЕГОДНЯ"
        const nowTime = new Date().getTime();
        let todayPerc = ((nowTime - globalStart) / totalDuration) * 100;
        todayPerc = Math.max(0, Math.min(100, todayPerc));

        let rowsHtml = '';

        activeData.forEach(s => {
            const sStart = new Date(s.startDate).getTime();
            const sEnd = new Date(s.endDate).getTime();

            let leftPerc = ((sStart - globalStart) / totalDuration) * 100;
            let widthPerc = ((sEnd - sStart) / totalDuration) * 100;
            if (widthPerc < 1) widthPerc = 1;

            // Ищем привязанные задачи к этому этапу
            const linkedTasks = _getTasks().filter(t =>
                t.source === 'schedule' && t.stageId === s.id && !t._deleted
            );

            // Отрисовка кружочков-задач (вех)
            let tasksDots = linkedTasks.map(t => {
                const tDate = new Date(t.date).getTime();
                let tLeft = ((tDate - sStart) / (sEnd - sStart)) * 100; // Позиция внутри самой полоски
                if (tLeft < 0) tLeft = 0; if (tLeft > 100) tLeft = 100;

                const isDone = t.status === 'done';
                const dotClass = isDone ? 'bg-green-500 border-green-700 z-20' : 'bg-surface border-brand z-10';
                // Берем первую букву из типа задачи
                const initial = t.taskType ? t.taskType.charAt(0).toUpperCase() : '';

                return `
                    <div class="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 ${dotClass} cursor-pointer group hover:scale-150 transition-transform flex items-center justify-center text-rbi-caption font-black" style="left: ${tLeft}%; transform: translate(-50%, -50%);">
                        ${isDone ? '✓' : initial}
                        <div class="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-slate-800 text-white text-rbi-caption font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap z-30 font-normal">
                            ${t.taskType}<br><span class="${isDone ? 'text-green-400' : 'text-slate-300'}">${new Date(t.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                        </div>
                    </div>
                `;

            }).join('');

            rowsHtml += `
                <div class="relative py-2 border-b border-surface last:border-0 flex items-center group">
                    <div class="w-1/3 pr-2 shrink-0">
                        <div class="text-rbi-caption font-black text-ink truncate" title="${s.workTitle}">${s.workTitle}</div>
                        <div class="text-rbi-caption font-bold text-muted truncate" title="${s.contractor}">${s.contractor}</div>
                    </div>
                    <div class="w-2/3 h-5 relative shrink-0 border-l border-surface pl-2">
                        <!-- Фон полосы -->
                        <div class="absolute h-1.5 bg-surface rounded-full top-1/2 -translate-y-1/2 left-2 right-2"></div>
                        <!-- Активная заливка этапа -->
                        <div class="absolute h-1.5 bg-brand rounded-full top-1/2 -translate-y-1/2" style="left: calc(8px + ${leftPerc}% * 0.95); width: calc(${widthPerc}% * 0.95);">
                            ${tasksDots}
                        </div>
                    </div>
                </div>
            `;
        });

        const todayStr = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

        ganttHtml = `
            <!-- Легенда и правила генерации задач (Аккордеон) -->
            <details class="mb-3 group bg-surface border border-surface rounded-xl shadow-sm overflow-hidden [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 cursor-pointer flex justify-between items-center transition-colors select-none">
                    <span class="text-rbi-caption font-black uppercase tracking-widest text-brand flex items-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        ${_t('quality.schedule.help.title', 'Логика автоматических вех (Справка)')}
                    </span>
                    <span class="text-muted shrink-0 transition-transform duration-300 group-open:rotate-180">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
                    </span>
                </summary>
                <div class="p-3 border-t border-surface text-ink text-rbi-caption leading-relaxed space-y-1.5 font-medium bg-surface">
                    <div class="flex items-start gap-2"><span class="w-4 h-4 bg-surface border border-brand-soft rounded-full shrink-0 flex items-center justify-center text-rbi-caption font-black text-brand">П</span> <span><b>${_t('quality.schedule.help.ppr_label', 'ППР (-14 дн):')}</b> ${_t('quality.schedule.help.ppr_text', 'Задача на проверку и утверждение технологических карт до начала работ.')}</span></div>
                    <div class="flex items-start gap-2"><span class="w-4 h-4 bg-surface border border-brand-soft rounded-full shrink-0 flex items-center justify-center text-rbi-caption font-black text-brand">И</span> <span><b>${_t('quality.schedule.help.brief_label', 'Инструктаж (-7 дн):')}</b> ${_t('quality.schedule.help.brief_text', 'Сбор бригадиров, выдача TWI-инструкций и допусков.')}</span></div>
                    <div class="flex items-start gap-2"><span class="w-4 h-4 bg-surface border border-brand-soft rounded-full shrink-0 flex items-center justify-center text-rbi-caption font-black text-brand">Э</span> <span><b>${_t('quality.schedule.help.etalon_label', 'Эталон (-3 дн):')}</b> ${_t('quality.schedule.help.etalon_text', 'Комиссионная приемка первого образца работы.')}</span></div>
                    <div class="flex items-start gap-2"><span class="w-4 h-4 bg-surface border border-brand-soft rounded-full shrink-0 flex items-center justify-center text-rbi-caption font-black text-brand">С</span> <span><b>${_t('quality.schedule.help.start_label', 'Старт (0 дн):')}</b> ${_t('quality.schedule.help.start_text', 'Первая проверка выполненной работы на объекте в день старта этапа.')}</span></div>
                    <div class="flex items-start gap-2"><span class="w-4 h-4 bg-surface border border-brand-soft rounded-full shrink-0 flex items-center justify-center text-rbi-caption font-black text-brand">Ф</span> <span><b>${_t('quality.schedule.help.final_label', 'Финал (-3 дн от конца):')}</b> ${_t('quality.schedule.help.final_text', 'Итоговая инспекция перед закрытием объемов (КС-2), передачей фронта работ и подписания итогового акта.')}</span></div>
                </div>
            </details>

            <!-- Диаграмма Ганта -->

            <!-- Диаграмма Ганта -->
            <div class="bg-surface border border-[var(--card-border)] rounded-xl p-3 shadow-sm relative overflow-hidden">
                <!-- Вертикальная линия "СЕГОДНЯ" -->
                <div class="absolute top-0 bottom-0 w-px bg-danger/50 z-0 pointer-events-none" style="left: calc(33.333% + 8px + ${todayPerc}% * 0.63);"></div>
                <div class="absolute top-0 bg-danger text-white text-rbi-caption font-black px-1.5 py-0.5 rounded-b z-10 uppercase tracking-wide" style="left: calc(33.333% + 8px + ${todayPerc}% * 0.63); transform: translateX(-50%);">${todayStr}</div>
                
                <div class="mt-4 relative z-10">
                    ${rowsHtml}
                </div>
                
                <div class="mt-2 pt-2 border-t border-surface flex justify-between text-rbi-caption font-bold text-muted uppercase tracking-widest">
                    <span>${new Date(minDateMs).toLocaleDateString('ru-RU')}</span>
                    <span>${new Date(maxDateMs).toLocaleDateString('ru-RU')}</span>
                </div>
            </div>

            
        `;
    } else {
        ganttHtml = `<div class="text-center py-8 text-muted text-rbi-label font-bold uppercase tracking-widest bg-[var(--card-bg)] rounded-2xl border border-dashed border-[var(--card-border)] mt-4">${_t('quality.schedule.empty.gantt', 'График пуст')}</div>`;
    }

    // 4. СБОРКА ИТОГОВОГО HTML (Кнопки + Свернутый редактор + Визуал)
    let html = `
        <div class="flex gap-2 mb-4 px-1">
            <button onclick="rbi_importScheduleExcel()" class="flex-1 bg-surface border border-green-200 dark:border-green-800 py-3.5 rounded-xl font-black text-rbi-caption text-green-700 dark:text-green-500 uppercase tracking-widest active:scale-95 shadow-sm transition-transform flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"></path></svg> ${_t('quality.schedule.btn.load_excel', 'Загрузить Excel')}
            </button>
            <button onclick="window.rbi_generateAutoTasks()" class="flex-1 bg-brand text-white py-3.5 rounded-xl font-black text-rbi-caption uppercase tracking-widest shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> ${_t('quality.schedule.btn.generate_tasks', 'Сгенерировать задачи')}
            </button>
        </div>

        <!-- РЕДАКТОР ГРАФИКА (СВЕРНУТ ПО УМОЛЧАНИЮ) -->
        <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm mb-6 group [&_summary::-webkit-details-marker]:hidden">
            <summary class="p-3.5 bg-[var(--hover-bg)] cursor-pointer flex justify-between items-center transition-colors select-none group-open:border-b border-[var(--card-border)] rounded-2xl group-open:rounded-b-none">
                <span class="font-black text-rbi-label uppercase tracking-widest text-ink flex items-center gap-1.5"><svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg> ${_t('quality.schedule.editor.title', 'Редактор (Ручной ввод)')}</span>
                <span class="text-muted transition-transform duration-300 group-open:rotate-180"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg></span>
            </summary>
            <div class="p-3 border-t border-[var(--card-border)] bg-surface rounded-b-2xl">
                <div class="flex justify-end gap-2 mb-3">
                    <button onclick="rbi_clearSchedule()" class="bg-surface text-danger border border-surface px-3 py-2 rounded-lg text-rbi-caption font-bold uppercase shadow-sm active:scale-95 transition-transform flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> ${_t('quality.schedule.btn.clear_all', 'Очистить всё')}</button>
                    <button onclick="rbi_saveSchedule()" class="bg-brand text-white px-4 py-2 rounded-lg text-rbi-caption font-bold uppercase shadow-md active:scale-95 transition-transform flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg> ${_t('quality.schedule.btn.save', 'Сохранить правки')}</button>
                </div>
                <div class="overflow-x-auto custom-scrollbar bg-surface rounded-xl border border-[var(--card-border)] shadow-sm mb-3">
                    <table class="w-full text-left text-rbi-caption whitespace-nowrap min-w-[800px]">
                        <thead class="bg-[var(--hover-bg)] text-[var(--text-muted)] border-b border-[var(--card-border)] uppercase tracking-wider font-bold">
                            <tr><th class="p-2 pl-3 w-1/4">${_t('quality.schedule.th.work', 'Вид работ')}</th><th class="p-2 w-1/5">${_t('quality.schedule.th.contractor', 'Подрядчик')}</th><th class="p-2 w-32">${_t('quality.schedule.th.start', 'Начало')}</th><th class="p-2 w-32">${_t('quality.schedule.th.end', 'Окончание')}</th><th class="p-2 w-1/4">${_t('quality.schedule.th.checklist', 'Чек-лист (Привязка)')}</th><th class="p-2 w-10 text-center">${_t('quality.schedule.th.delete', 'Удал.')}</th></tr>
                        </thead>
                        <tbody id="sched-tbody" class="divide-y divide-[var(--card-border)]">${rowsHtml}</tbody>
                    </table>
                </div>
                <button onclick="rbi_addScheduleRow()" class="w-full bg-surface text-brand py-3.5 rounded-xl border border-dashed border-brand-soft text-rbi-caption font-bold uppercase active:scale-95 transition-colors flex items-center justify-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> ${_t('quality.schedule.btn.add_row', 'Добавить строку')}
                </button>
            </div>
        </details>

        <!-- ВИЗУАЛЬНЫЙ ТАЙМЛАЙН -->
        <div class="px-1">
            <h3 class="text-rbi-body font-black uppercase text-ink flex items-center gap-1.5 tracking-tight"><svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg> ${_t('quality.schedule.viz.title', 'Визуализация задач')}</h3>
            <div class="text-rbi-caption text-muted font-bold mt-1 mb-2">${_t('quality.schedule.viz.hint', 'Наведите мышку (или нажмите) на круглые узлы, чтобы увидеть запланированные задачи.')}</div>
            ${ganttHtml}
        </div>
    `;
    container.innerHTML = html;
  };

  // Добавление строки без перерисовки всей страницы
  window.rbi_addScheduleRow = function () {
    if (!window.rbi_scheduleData) window.rbi_scheduleData = [];
    const newId = window.RbiIds.newId();

    // Получаем список чек-листов для выпадающего списка
    const unboundOpt = _t('quality.schedule.option.unbound', '-- Не привязан --');
    const prefixSys = _t('quality.schedule.prefix.sys', '[СИС]');
    const prefixUser = _t('quality.schedule.prefix.user', '[МОЙ]');
    let clOptions = '<option value="">' + unboundOpt + '</option>';
    const _st2 = _templates().getSystemTemplates();
    const sysKeys = Object.keys(_st2).sort((a, b) => _st2[a].title.localeCompare(_st2[b].title));
    sysKeys.forEach(key => { clOptions += `<option value="sys_${key}">${prefixSys} ${_st2[key].title}</option>`; });
    const _ut2 = _templates().getUserTemplates();
    const userKeys = Object.keys(_ut2).sort((a, b) => _ut2[a].title.localeCompare(_ut2[b].title));
    userKeys.forEach(key => { clOptions += `<option value="user_${key}">${prefixUser} ${_ut2[key].title}</option>`; });

    const today = new Date().toISOString().split('T')[0];
    const tbody = document.getElementById('sched-tbody');

    if (tbody) {
        // Убираем заглушку "Нет этапов", если она есть
        const emptyStages = _t('quality.schedule.empty.no_stages', 'В графике нет этапов.');
        if (tbody.innerHTML.includes(emptyStages) || tbody.innerHTML.includes('В графике нет этапов')) tbody.innerHTML = '';

        const tr = `
            <tr class="sched-row hover:bg-[var(--hover-bg)] transition-colors" data-id="${newId}">
                <td class="p-1"><input type="text" class="input-base !py-1.5 text-rbi-caption w-full sched-work font-bold" value="" placeholder="${_t('quality.schedule.ph.work', 'Вид работ')}"></td>
                <td class="p-1"><input type="text" class="input-base !py-1.5 text-rbi-caption w-full sched-contr" value="" placeholder="${_t('quality.schedule.ph.contractor', 'Подрядчик')}"></td>
                <td class="p-1"><input type="date" class="input-base !py-1.5 text-rbi-caption w-full sched-start" value="${today}"></td>
                <td class="p-1"><input type="date" class="input-base !py-1.5 text-rbi-caption w-full sched-end" value="${today}"></td>
                <td class="p-1"><select class="input-base !py-1.5 text-rbi-caption w-full sched-tmpl">${clOptions}</select></td>
                <td class="p-1 text-center">
                    <button onclick="this.closest('tr').remove()" class="text-danger hover:text-danger bg-danger-soft p-1.5 rounded-lg border border-danger-soft active:scale-90 flex items-center justify-center mx-auto transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                </td>
            </tr>`;
        tbody.insertAdjacentHTML('beforeend', tr);
    }
  };

  var ScheduleRender = {

    bindCtx: function (ctx) {
      _ctx = ctx;
    },

    /**
     * Отрендерить блок «Расписание СМР» (#schedule-container).
     * Делегирует в window.rbi_renderScheduleTab(skipLoad) (реализация выше в этом файле).
     */
    render: function (skipLoad) {
      if (window.ScheduleActions) {
        window.ScheduleActions.renderScheduleTab(skipLoad);
      } else if (typeof window.rbi_renderScheduleTab === 'function') {
        window.rbi_renderScheduleTab(skipLoad);
      } else {
        console.warn('[ScheduleRender] rbi_renderScheduleTab недоступен');
      }
    }
  };

  window.ScheduleRender = ScheduleRender;

  function _bindScheduleI18n() {
    if (_scheduleI18nBound) return;
    _scheduleI18nBound = true;
    var events = window.RBI && window.RBI.events;
    if (!(events && typeof events.on === 'function')) return;
    events.on('i18n:localeChanged', function () {
      try {
        if (!document.getElementById('schedule-container')) return;
        if (typeof window.rbi_renderScheduleTab === 'function') {
          window.rbi_renderScheduleTab(true);
        }
      } catch (_e) { /* ignore */ }
    });
  }
  _bindScheduleI18n();
})();

console.log('[ScheduleRender] schedule.render.js loaded');
