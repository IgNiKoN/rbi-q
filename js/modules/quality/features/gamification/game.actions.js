// game.actions.js — бизнес-действия модуля геймификации
//
// Слияние js/game.js (удалён): реальные реализации бизнес-действий/CRUD
// геймификации (см. _ai/CURRENT_STEP.md, блок «Слияние js/game.js»).
// Перенесено 1:1, без изменения бизнес-логики. Прямые обращения к
// dbPut/dbGet/STORES/supabaseClient/triggerSync — black box, как были.
//
// Module-scope declarations, экспортируются через ES export; публикацию в
// window.* для legacy-кода делает game.module.js (entry).

import {
  getStartOfWeek, gameSaveLogs, GameState,
  gameResolveLogInspector, gameIsDuplicateActionLog
} from './game.state.js';
import { gameRenderDashboard, rbi_renderFmeaRegistry, rbi_addManualFmeaRow, gameRenderAssignedProjectChips } from './game.render.js';


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

function _tTrend(trend) {
  var map = {
    'Сбор базы (нужно 10)': 'quality.game.trend.collecting',
    'Ошибка расчета': 'quality.game.trend.error',
    'Стабильно': 'quality.game.trend.stable',
    'Улучшение': 'quality.game.trend.improve',
    'Ухудшение': 'quality.game.trend.worsen',
    'Недостаточно данных': 'quality.game.trend.insufficient'
  };
  var k = map[trend];
  return k ? _t(k, trend) : trend;
}

import { meetingRichToSafeHtml } from '../meetings/meetings.protocol.js';

/** Module-scope: id FMEA, открытого в #fmea-workspace для редактирования. */
let currentEditingFmeaId = null;

function emit(eventName, detail) {
    document.dispatchEvent(new CustomEvent(eventName, { detail: detail || {} }));
    var events = GameActions._ctx && GameActions._ctx.events;
    if (events && typeof events.emit === 'function') {
      events.emit(eventName, detail || {});
    }
  }

  // DOM-id карточки пользователя в панели «Команда».
  // Нельзя просто заменить «чужие» символы на '_': кириллические ФИО
  // одинаковой длины схлопывались в один id → getElementById читал чужой
  // <select> роли и при сохранении роль сбрасывалась на «инженер».
  function gameDomIdFromInspectorId(inspectorId) {
    return String(inspectorId || '').replace(/[^a-zA-Z0-9_-]/g, function (ch) {
      return '_' + ch.codePointAt(0).toString(16) + '_';
    });
  }

  // Перенесено из js/game.js (строка 6): изоляция isDemoMode через
  // AppModeService с fallback (приватный хелпер этого файла).
  function _isDemoMode() {
    if (GameActions._ctx && GameActions._ctx.appMode) return GameActions._ctx.appMode.isDemo();
    return window.RBI.services.appMode.isDemo();
  }

  function _getSetting(key) {
    if (GameActions._ctx && GameActions._ctx.settings) return GameActions._ctx.settings.get(key);
    return window.RBI.services.settings.get(key);
  }

  function _setSetting(key, value) {
    if (GameActions._ctx && GameActions._ctx.settings) return GameActions._ctx.settings.set(key, value);
    return window.RBI.services.settings.set(key, value);
  }

  function _objects() {
    try {
      if (GameActions._ctx && GameActions._ctx.services && GameActions._ctx.services.objects) {
        return GameActions._ctx.services.objects;
      }
      if (GameActions._ctx && GameActions._ctx.objects) {
        return GameActions._ctx.objects;
      }
    } catch (e) {}
    return (window.RBI && window.RBI.services && window.RBI.services.objects) || null;
  }
  function _contractors() {
    try {
      if (GameActions._ctx && GameActions._ctx.services && GameActions._ctx.services.contractors) {
        return GameActions._ctx.services.contractors;
      }
      if (GameActions._ctx && GameActions._ctx.contractors) {
        return GameActions._ctx.contractors;
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

  function _getAllInspections() {
    if (GameActions._ctx && GameActions._ctx.inspections) return GameActions._ctx.inspections.getAllSync();
    return window.RBI.services.inspections.getAllSync();
  }

  function _getTasks() {
    if (GameActions._ctx && GameActions._ctx.tasks) return GameActions._ctx.tasks.getTasksSync();
    return window.RBI.services.tasks.getTasksSync();
  }

  function _getFmea() {
    if (GameActions._ctx && GameActions._ctx.tasks) return GameActions._ctx.tasks.getFmeaSync();
    return window.RBI.services.tasks.getFmeaSync();
  }

  function _defectCauses() {
    if (GameActions._ctx && GameActions._ctx.inspections) {
      return GameActions._ctx.inspections.getDefectCausesSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
      return window.RBI.services.inspections.getDefectCausesSync();
    }
    return typeof DEFECT_CAUSES !== 'undefined' ? DEFECT_CAUSES : [];
  }

  function _getPractices() {
    if (GameActions._ctx && GameActions._ctx.tasks) {
      return GameActions._ctx.tasks.getPracticesSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.tasks) {
      return window.RBI.services.tasks.getPracticesSync();
    }
    return Array.isArray(window.rbi_practicesData) ? window.rbi_practicesData : [];
  }

  function _getMeetings() {
    if (GameActions._ctx && GameActions._ctx.tasks) {
      return GameActions._ctx.tasks.getMeetingsSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.tasks) {
      return window.RBI.services.tasks.getMeetingsSync();
    }
    return Array.isArray(window.rbi_meetingsData) ? window.rbi_meetingsData : [];
  }

  function _getEtalonActs() {
    if (GameActions._ctx && GameActions._ctx.knowledge) {
      return GameActions._ctx.knowledge.getEtalonActsSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.knowledge) {
      return window.RBI.services.knowledge.getEtalonActsSync();
    }
    return Array.isArray(window.etalonActsArray) ? window.etalonActsArray : [];
  }

  /**
   * Совпадение Акта-Эталона с задачей/парой (подрядчик + вид работ).
   * templateKey — основной ключ; иначе точное или префиксное сравнение
   * названий (кастомный чек-лист «База (правки…)» ↔ системный «База»).
   * Не склеивает разные подвиды («шпатлёвка» ≠ «плитка»).
   */
  function rbiNormWorkTitle(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[«»"'„“]/g, '')
      .replace(/\bустройство\b/g, '')
      .replace(/\bприемка\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function rbiWorkTitlesCompatible(a, b) {
    const na = rbiNormWorkTitle(a);
    const nb = rbiNormWorkTitle(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.startsWith(nb) || nb.startsWith(na)) return true;
    // Один подвид в скобках («Стены, колонны») + похожая база («монолит…»)
    const paren = function (s) {
      const m = s.match(/\(([^)]+)\)/);
      return m ? m[1].replace(/\s+/g, ' ').trim() : '';
    };
    const base = function (s) { return s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(); };
    const pa = paren(na);
    const pb = paren(nb);
    if (pa && pb && pa === pb) {
      const ba = base(na);
      const bb = base(nb);
      if (ba && bb && (ba.includes(bb) || bb.includes(ba))) return true;
      const rootsA = ba.split(/\s+/).filter(function (w) { return w.length >= 5; });
      const rootsB = bb.split(/\s+/).filter(function (w) { return w.length >= 5; });
      for (let i = 0; i < rootsA.length; i++) {
        for (let j = 0; j < rootsB.length; j++) {
          const x = rootsA[i].slice(0, 6);
          const y = rootsB[j].slice(0, 6);
          if (x && y && (rootsA[i].startsWith(y) || rootsB[j].startsWith(x))) return true;
        }
      }
    }
    return false;
  }

  function rbiEtalonMatchesWork(etalon, contractor, templateKey, templateTitle, workTitle) {
    if (!etalon || !contractor) return false;
    if (etalon.contractorName !== contractor) return false;
    // В сторе эталонов записи помечены instanceId='etalon'; отсекаем чужой мусор.
    if (etalon.instanceId && etalon.instanceId !== 'etalon' && etalon.templateKey !== 'sys_etalon_act') {
      return false;
    }

    if (templateKey && etalon.templateKey && etalon.templateKey === templateKey) return true;

    const etTitle = String(etalon.templateTitle || '').trim();
    const candidates = [templateTitle, workTitle].filter(Boolean).map(function (s) { return String(s).trim(); });
    for (let i = 0; i < candidates.length; i++) {
      if (rbiWorkTitlesCompatible(candidates[i], etTitle)) return true;
    }
    return false;
  }
  window.rbiEtalonMatchesWork = rbiEtalonMatchesWork;

  function _templates() {
    if (GameActions._ctx && GameActions._ctx.templates) return GameActions._ctx.templates;
    return window.RBI.services.templates;
  }

  function _triggerSync(mode) {
    var m = mode || 'silent';
    if (GameActions._ctx && GameActions._ctx.sync) return GameActions._ctx.sync.trigger(m);
    if (window.RBI && window.RBI.services && window.RBI.services.sync) return window.RBI.services.sync.trigger(m);
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
  }

  function _storage() {
    if (GameActions._ctx && GameActions._ctx.storage) return GameActions._ctx.storage;
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

  function _callAI(messages, options) {
    if (GameActions._ctx && GameActions._ctx.ai) return GameActions._ctx.ai.call(messages, options);
    if (window.RBI && window.RBI.services && window.RBI.services.ai) {
      return window.RBI.services.ai.call(messages, options);
    }
    return window.callAI(messages, options);
  }

  // Перенесено из js/game.js (строка 138).
  function gameLogAction(actionType, targetId = null, inspectorOverride = null) {
    const currentInspector = gameResolveLogInspector(inspectorOverride);
    if (!currentInspector) return;

    const gameActionLogs = window.gameActionLogs || (window.gameActionLogs = []);
    const nowIso = new Date().toISOString();
    if (gameIsDuplicateActionLog(gameActionLogs, actionType, currentInspector, targetId, nowIso)) return;

    gameActionLogs.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: nowIso,
      inspector: currentInspector,
      action: actionType,
      target: targetId
    });
    gameSaveLogs();

    if (document.getElementById('sub-engineer-rating') && !document.getElementById('sub-engineer-rating').classList.contains('hidden')) {
      gameRenderDashboard();
    }
  };

  // Перенесено из js/game.js (строка 399).
  function calculateImpactScore(inspector, contractor, template) {
    const _allInspections = _getAllInspections();
    const checks = _allInspections.filter(c => c.inspectorName === inspector && c.contractorName === contractor && c.templateKey === template).sort((a, b) => new Date(a.date) - new Date(b.date));

    // --- ИСПРАВЛЕНИЕ ЛОГИКИ IMPACT SCORE ---
    // Формируем надежную базу (первые 7 проверок), затем сравниваем с текущим срезом (последние 3)
    // Итого нужно минимум 10 проверок для объективной оценки влияния.
    if (checks.length < 10) return { score: 0, trend: 'Сбор базы (нужно 10)', color: 'text-muted' };

    const baseChecks = checks.slice(0, 7); // Фундамент (Базовый рейтинг)
    const currentChecks = checks.slice(-3); // Текущее состояние после работы инженера

    // ВАЖНО: Третий параметр (false) отключает "скользящее окно", 
    // чтобы брались именно указанные нами срезы массивов.
    const baseMetrics = getContractorMetrics(baseChecks, _templates().getUserTemplates(), false);
    const currMetrics = getContractorMetrics(currentChecks, _templates().getUserTemplates(), false);

    if (!baseMetrics || !currMetrics) return { score: 0, trend: 'Ошибка расчета', color: 'text-muted' };

    let deltaUrk = Math.max(-1, Math.min(1, (currMetrics.finalC - baseMetrics.finalC) / 100));
    let deltaStab = Math.max(-1, Math.min(1, (currMetrics.stabilityIndex - baseMetrics.stabilityIndex) / 100));
    let deltaB3 = (baseMetrics.n_изделий_с_B3 > 0 ? 1 : 0) - (currMetrics.n_изделий_с_B3 > 0 ? 1 : 0);

    const impactScore = (deltaUrk * 0.5) + (deltaStab * 0.3) + (deltaB3 * 0.2);

    let trend = "Стабильно"; let color = "text-muted";
    if (impactScore > 0.2) { trend = "Улучшение"; color = "text-green-600"; }
    else if (impactScore < -0.2) { trend = "Ухудшение"; color = "text-danger"; }

    return { score: impactScore, trend, color, baseUrk: baseMetrics.finalC, currUrk: currMetrics.finalC };
  };

  // Перенесено из js/game.js (строка 390).
  async function saveWeeklyPlan() {
    if (_isDemoMode()) return;
    try {
      await _storage().put(_storage().stores().STATE, { key: 'weekly_plan_data', data: window.weeklyPlanData });
      await _storage().put(_storage().stores().STATE, { key: 'engineer_absence', data: window.engineerAbsence });
      await _storage().put(_storage().stores().STATE, { key: 'contractor_statuses', data: window.contractorStatuses });
    } catch (e) { console.error("Ошибка сохранения плана", e); }
  };

  // Перенесено из js/game.js (строка 432).
  function gameUpdatePlanProgress() {
    const _allInspections = _getAllInspections();
    // Источник задач — живой массив; weeklyPlanData.tasks должен ссылаться на него
    // после generate, но на всякий случай берём rbi_tasksData, если он есть.
    const tasksList = (Array.isArray(window.rbi_tasksData) && window.rbi_tasksData.length)
      ? window.rbi_tasksData
      : (window.weeklyPlanData && window.weeklyPlanData.tasks);
    const weeklyPlanData = window.weeklyPlanData || { tasks: tasksList, weekId: null, completed: false };
    if (tasksList) weeklyPlanData.tasks = tasksList;
    window.weeklyPlanData = weeklyPlanData;

    const contractorStatuses = window.contractorStatuses || {};
    const fallbackInspector = (
      document.getElementById('inp-inspector')?.value.trim() ||
      (window.RBI && window.RBI.services && window.RBI.services.permissions &&
        typeof window.RBI.services.permissions.getCurrentEngineerName === 'function'
        ? window.RBI.services.permissions.getCurrentEngineerName()
        : '') ||
      ''
    ).trim();
    if (!weeklyPlanData.tasks) return;

    const startOfThisWeek = getStartOfWeek();
    let allTasksDone = true;

    // ТРЕКЕР: Запоминаем, какие задачи мы закроем на этом прогоне
    let newlyClosedTasks = [];

    weeklyPlanData.tasks.forEach(task => {
      if (task._deleted || task.is_deleted) return;
      const st = task.statusKey ? contractorStatuses[task.statusKey] : null;
      // Прогресс и автозакрытие — по инженеру ЗАДАЧИ (админ видит чужие задачи;
      // фильтр по #inp-inspector="Админ" раньше обнулял done у всех инженеров).
      const taskEngineer = (task.engineerName || task.inspectorName || fallbackInspector || '').trim();

      // АВТОМАТИЧЕСКОЕ СНЯТИЕ ЭТАЛОНА
      if (task.needsEtalon) {
        const hasEtalonCheck = _getEtalonActs().some(c =>
          rbiEtalonMatchesWork(c, task.contractor, task.templateKey, task.templateTitle, task.workTitle)
        );
        if (hasEtalonCheck) {
          task.needsEtalon = false;
          if (st) st.etalonCompleted = true;
        } else {
          allTasksDone = false;
          return; // Блокируем прогресс, если эталон всё еще нужен
        }
      }

      const matchedWeekChecks = _allInspections.filter(c =>
        (!taskEngineer || c.inspectorName === taskEngineer) &&
        c.contractorName === task.contractor &&
        c.templateKey === task.templateKey &&
        new Date(c.date) >= startOfThisWeek
      );

      if ((task.category === 'control' || task.type === 'continuous' || task.taskType === 'Аудит') && task.taskType !== 'Эталон') {
        let validChecksCount = 0; let sumFillRate = 0; let totalFails = 0; let failsWithPhotoOrComment = 0;

        matchedWeekChecks.forEach(c => {
          if (c.metrics && c.metrics.checkedCount >= 3) {
            validChecksCount++;
            sumFillRate += (c.metrics.checkedCount / (c.metrics.totalCount || c.metrics.checkedCount || 1)) * 100;

            if (c.state) {
              Object.keys(c.state).forEach(id => {
                if (c.state[id] === 'fail' || c.state[id] === 'fail_escalated') {
                  totalFails++;
                  if ((c.photos && c.photos[id]) || (c.details && c.details[id] && c.details[id].comment)) failsWithPhotoOrComment++;
                }
              });
            }
          }
        });

        // УМНЫЙ ПОДСЧЕТ: Для новых подрядчиков считаем ВСЕ исторические проверки
        if (task.target >= 7) {
          const allTimeMatched = _allInspections.filter(c =>
            (!taskEngineer || c.inspectorName === taskEngineer) &&
            c.contractorName === task.contractor &&
            c.templateKey === task.templateKey
          );
          task.done = allTimeMatched.filter(c => c.metrics && c.metrics.checkedCount >= 3).length;
        } else {
          task.done = validChecksCount;
        }

        task.fillRate = validChecksCount > 0 ? (sumFillRate / validChecksCount) : 0;
        task.photoRate = totalFails > 0 ? (failsWithPhotoOrComment / totalFails) * 100 : 100;

        // АВТОЗАКРЫТИЕ: проверка в истории за неделю (или накопленная база) закрывает задачу
        if (task.done >= task.target && (task.status === 'pending' || task.status === 'paused')) {
          task.status = 'done';
          task.resultComment = `Выполнено (${task.done}/${task.target})`;
          task.updatedAt = new Date().toISOString();
          newlyClosedTasks.push(task.id);
          _storage().put(_storage().stores().TASKS, task);
        }

        if (task.status !== 'done' && task.done < task.target) allTasksDone = false;

        if (task.priorityLvl === 4 && task.done > task.target) {
          const overCheck = matchedWeekChecks[validChecksCount - 1];
          if (overCheck) {
            gameLogAction('overfulfill_bonus', overCheck.id, taskEngineer || fallbackInspector);
          }
        }

      } else if (task.type === 'milestone') {
        if (st && st.milestoneProgress) {
          matchedWeekChecks.forEach(c => {
            if (c.checkedStagesInfo) {
              c.checkedStagesInfo.forEach(stageName => {
                if (!st.milestoneProgress.completedStages.includes(stageName)) {
                  st.milestoneProgress.completedStages.push(stageName);
                }
              });
            }
          });
          task.done = st.milestoneProgress.completedStages.length;
          task.target = st.milestoneProgress.totalStages;

          if (task.done >= task.target && (task.status === 'pending' || task.status === 'paused')) {
            st.status = 'completed';
            task.status = 'done';
            task.updatedAt = new Date().toISOString();
            newlyClosedTasks.push(task.id);
            _storage().put(_storage().stores().TASKS, task);
          } else if (task.done < task.target) {
            allTasksDone = false;
          }
        }
      }
    });

    // --- УМНОЕ АВТОЗАКРЫТИЕ (СВЕРКА С БАЗОЙ ДАННЫХ) ---
    weeklyPlanData.tasks.forEach(task => {
      if (task._deleted || task.is_deleted) return;
      if (task.status !== 'pending' && task.status !== 'paused') return;

      const taskCreateDate = new Date(task.createdAt || task.date);
      // Отступаем 1 день назад, чтобы засчитывать документы, сделанные накануне
      taskCreateDate.setDate(taskCreateDate.getDate() - 1);

      // 1. Проверяем Совещания (Мемо)
      if (task.category === 'meeting' || (task.title && task.title.includes('Совещание'))) {
        const hasMemo = _getMeetings().some(m => new Date(m.date) >= taskCreateDate);
        if (hasMemo) {
          task.status = 'done'; task.resultComment = 'Автозакрытие (найден протокол)'; task.updatedAt = new Date().toISOString();
          newlyClosedTasks.push(task.id);
          _storage().put(_storage().stores().TASKS, task);
        }
      }

      // 2. Проверяем FMEA
      if (task.title && task.title.includes('FMEA')) {
        const hasFmea = _getFmea().some(f => new Date(f.date) >= taskCreateDate);
        if (hasFmea) {
          task.status = 'done'; task.resultComment = 'Автозакрытие (сохранен FMEA)'; task.updatedAt = new Date().toISOString();
          newlyClosedTasks.push(task.id);
          _storage().put(_storage().stores().TASKS, task);
        }
      }
      // 3. Проверяем Эталоны — закрытие только при оформленном Акте-Эталоне
      if (task.taskType === 'Эталон' || (task.title && task.title.includes('Эталон'))) {
        task.target = 1; // Жестко фиксируем цель: Эталон всегда 1!

        const hasEtalonRecord = _getEtalonActs().some(e =>
          rbiEtalonMatchesWork(e, task.contractor, task.templateKey, task.templateTitle, task.workTitle)
        );

        task.done = hasEtalonRecord ? 1 : 0;

        if (hasEtalonRecord) {
          task.status = 'done';
          task.resultComment = 'Автозакрытие (Акт-Эталон найден в базе)';
          task.updatedAt = new Date().toISOString();
          newlyClosedTasks.push(task.id);
          _storage().put(_storage().stores().TASKS, task);
        }
      }
      // 4. Проверяем Магию TWI
      if (task.taskType === 'Магия TWI') {
        const currentCandidates = window.getMagicTwiCandidates ? window.getMagicTwiCandidates() : [];
        // Прогресс = Цель минус то, что еще осталось сделать
        task.done = Math.max(0, task.target - currentCandidates.length);

        if (task.done >= task.target) {
          task.status = 'done';
          task.resultComment = `Оформлено карт: ${task.done}`;
          task.updatedAt = new Date().toISOString();
          newlyClosedTasks.push(task.id);
        }
        _storage().put(_storage().stores().TASKS, task);
      }
    });

    // XP за автозакрытие задач плана (один раз на task.id) — после всех веток закрытия
    if (newlyClosedTasks.length > 0) {
      newlyClosedTasks.forEach(taskId => {
        if (!taskId) return;
        const logs = window.gameActionLogs || [];
        if (logs.some(l => l.action === 'task_completed_on_time' && l.target === taskId)) return;
        const task = (weeklyPlanData.tasks || []).find(t => t.id === taskId);
        const due = task && (task.dueDate || task.deadline || task.planDate);
        const stamped = (task && task.updatedAt) || new Date().toISOString();
        const onTime = !due || new Date(stamped) <= new Date(due);
        if (onTime) gameLogAction('task_completed_on_time', taskId);
      });
    }

    // ТИХОЕ ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (БЕЗ НАДОЕДЛИВЫХ УВЕДОМЛЕНИЙ)
    if (newlyClosedTasks.length > 0 && !window._rbiSuppressTasksRefresh) {
      setTimeout(() => {
        if (window._rbiSuppressTasksRefresh) return;
        if (window.RBI && window.RBI.events) window.RBI.events.emit('tasks:refresh', {});
      }, 300);
    }

    if (allTasksDone && weeklyPlanData.tasks.length > 0 && !weeklyPlanData.completed) {
      weeklyPlanData.completed = true;
      gameLogAction('plan_completed', weeklyPlanData.weekId, fallbackInspector);
    }

    saveWeeklyPlan();
  };

  // Перенесено из js/game.js (строка 659).
  function gameToggleAbsence() {
    const engineerAbsence = window.engineerAbsence;
    if (engineerAbsence.isActive) {
      if (confirm(_t('quality.game.confirm.end_absence', 'Прервать период отсутствия и вернуться к работе? План будет пересчитан.'))) {
        engineerAbsence.isActive = false; engineerAbsence.endDate = null; saveWeeklyPlan();
        var _tasksSvc1 = (GameActions._ctx && GameActions._ctx.tasks) || window.RBI.services.tasks;
        _tasksSvc1.generateWeeklyPlan(true); gameRenderDashboard();
      }
    } else {
      injectAbsenceModal();
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('abs-start').value = today;
      document.getElementById('abs-end').value = today;
      document.getElementById('absence-modal-overlay').style.display = 'flex';
    }
  };

  // Перенесено из js/game.js (строка 674).
  function saveAbsencePeriod() {
    const engineerAbsence = window.engineerAbsence;
    const reason = document.getElementById('abs-reason').value;
    const start = document.getElementById('abs-start').value;
    const end = document.getElementById('abs-end').value;

    if (!start || !end) return showToast(_t('quality.game.toast.dates_required', 'Укажите даты!'));
    if (new Date(end) < new Date(start)) return showToast(_t('quality.game.toast.end_before_start', 'Дата окончания не может быть раньше начала!'));

    engineerAbsence.isActive = true; engineerAbsence.reason = reason; engineerAbsence.startDate = start;
    const endDateObj = new Date(end); endDateObj.setHours(23, 59, 59, 999); engineerAbsence.endDate = endDateObj.toISOString();

    saveWeeklyPlan();
    document.getElementById('absence-modal-overlay').style.display = 'none';
    showToast(_t('quality.game.toast.status_paused', 'Статус обновлен. План приостановлен.'));
    gameRenderDashboard();
  };

  // Перенесено из js/game.js (строка 691).
  function checkAutoExpireAbsence() {
    const engineerAbsence = window.engineerAbsence;
    if (engineerAbsence.isActive && engineerAbsence.endDate && new Date() > new Date(engineerAbsence.endDate)) {
      engineerAbsence.isActive = false; engineerAbsence.endDate = null; saveWeeklyPlan();
      var _tasksSvc2 = (GameActions._ctx && GameActions._ctx.tasks) || window.RBI.services.tasks;
      _tasksSvc2.generateWeeklyPlan(true); showToast(_t('quality.game.toast.welcome_back', 'С возвращением! План работы возобновлен.'));
    }
  };

  // Функция жесткого сохранения и блокировки имени
  // Перенесено из js/game.js (строка 979).
  function saveEngineerNameForce(name) {
    const cleanName = name.trim();
    if (!cleanName) return showToast(_t('quality.game.toast.name_empty', '⚠️ Имя не может быть пустым!'));

    _setSetting('engineerName', cleanName);
    localStorage.setItem('force_eng_name', cleanName); // Жесткий бэкап

    const inpInspector = document.getElementById('inp-inspector');
    if (inpInspector) inpInspector.value = cleanName;

    if (typeof window.syncConfig !== 'undefined') {
      window.syncConfig.engineerName = cleanName;
      localStorage.setItem('rbi_sync_config', JSON.stringify(window.syncConfig));
    }

    document.getElementById('profile-name-edit-container').classList.add('hidden');
    document.getElementById('profile-title-text').classList.remove('hidden');

    showToast(_t('quality.game.toast.name_saved', '✅ Имя зафиксировано!'));
    gameRenderDashboard();
  };

  // === ПАНЕЛЬ РУКОВОДИТЕЛЯ: аутентификация (ПИН-код) ===
  // Перенесено из js/game.js (строка 1115).
  const hashString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      let char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  };
  // Перенесено из js/game.js (строка 1124).
  const MANAGER_PIN_HASH = "1570722437";
  const ADMIN_GATE_SESSION_KEY = 'rbi_admin_gate_ok';

  // P2-0037: вошедшему почтой замок не спрашивает PIN — «Админ Качества» и панель руководителя открывает право сервера
  // quality.manage / construction.manage (quality.my_access компании, RBI.qualitySync.actions); PIN при почте не действует.
  function isAdminGateEmail() {
    const sh = window.RBI && window.RBI.services && window.RBI.services.shell;
    return !!(sh && typeof sh.platformEntryMode === 'function' && sh.platformEntryMode() === 'email');
  }

  function hasQualityServerAction(action) {
    const a = window.RBI && window.RBI.qualitySync && window.RBI.qualitySync.actions;
    return Array.isArray(a) && a.indexOf(action) !== -1;
  }

  function isAdminGateUnlocked() {
    if (isAdminGateEmail()) return hasQualityServerAction('quality.manage') || hasQualityServerAction('construction.manage');
    try {
      return sessionStorage.getItem(ADMIN_GATE_SESSION_KEY) === '1';
    } catch (_e) {
      return false;
    }
  }

  function setAdminGateUnlocked() {
    try {
      sessionStorage.setItem(ADMIN_GATE_SESSION_KEY, '1');
    } catch (_e) { /* ignore */ }
  }

  /**
   * После успешного PIN: purpose в window._rbiAdminGatePending —
   * 'manager' (панель) | 'settings-admin' (вкладка Администрирование).
   */
  function gameCompleteAdminGate() {
    if (isAdminGateEmail() && !isAdminGateUnlocked()) return;   // P2-0037: при почте PIN права не даёт
    setAdminGateUnlocked();
    const pending = window._rbiAdminGatePending || 'manager';
    window._rbiAdminGatePending = null;

    const modal = document.getElementById('manager-auth-modal');
    if (modal) modal.style.display = 'none';

    if (pending === 'settings-admin') {
      if (typeof window.unlockSettingsAdminTab === 'function') {
        window.unlockSettingsAdminTab();
      }
      return;
    }

    if (typeof openManagerPanelView === 'function') {
      openManagerPanelView();
    } else if (typeof window.openManagerPanelView === 'function') {
      window.openManagerPanelView();
    } else {
      const view = document.getElementById('manager-panel-overlay');
      if (view) {
        view.classList.remove('hidden');
        document.body.classList.add('modal-open');
      }
    }
    if (typeof gameRenderManagerAnalytics === 'function') {
      gameRenderManagerAnalytics();
    } else if (typeof window.gameRenderManagerAnalytics === 'function') {
      window.gameRenderManagerAnalytics();
    }
  }

  // Перенесено из js/game.js (строка 1364).
  function gameVerifyManagerPin() {
    const pin = document.getElementById('manager-pin-input').value;
    if (hashString(pin) === MANAGER_PIN_HASH) {
      gameCompleteAdminGate();
    } else {
      showToast(_t('quality.game.toast.bad_pin', '❌ Неверный ПИН-код'));
    }
  };

  window.isAdminGateUnlocked = isAdminGateUnlocked;
  window.isAdminGateEmail = isAdminGateEmail;
  window.hasQualityServerAction = hasQualityServerAction;
  window.setAdminGateUnlocked = setAdminGateUnlocked;
  window.gameCompleteAdminGate = gameCompleteAdminGate;

  // Перенесено из js/game.js (строка 1452).
  function gameGenerateAuditPlan() {
    showToast(_t('quality.game.toast.analyzing', '⚙️ Нейросеть анализирует аномалии (протыкивания, завышения)...'));
    setTimeout(() => {
      const _allInspections = _getAllInspections();
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Берем проверки за последние 30 дней для актуальности
      const recentChecks = _allInspections.filter(c => new Date(c.date) >= lastMonth);

      if (recentChecks.length === 0) {
        document.getElementById('manager-audit-list').innerHTML = `<div class="text-center py-10 text-muted font-bold text-xs uppercase bg-surface rounded-xl border border-slate-200">${_t('quality.game.toast.no_checks', 'Проверок не найдено')}</div>`;
        return;
      }

      const anomalies = [];
      const checkedInspectors = new Set();

      // Сортируем по дате, чтобы искать "быстрые протыкивания"
      recentChecks.sort((a, b) => new Date(a.date) - new Date(b.date));

      for (let i = 1; i < recentChecks.length; i++) {
        const curr = recentChecks[i];
        const prev = recentChecks[i - 1];

        // Если один и тот же инспектор сдал 2 разные проверки с разницей меньше 60 секунд = "Протыкивание"
        if (curr.inspectorName === prev.inspectorName && curr.location !== prev.location) {
          const timeDiff = (new Date(curr.date) - new Date(prev.date)) / 1000; // в секундах
          if (timeDiff > 0 && timeDiff < 60 && curr.metrics.final >= 85) {
            anomalies.push({ check: curr, type: _t('quality.game.anomaly.fast', '⚠️ Быстрое заполнение (<60 сек)'), color: 'bg-purple-100 text-purple-800 border-purple-200' });
            checkedInspectors.add(curr.inspectorName);
          }
        }
      }

      // Аномалия: 100% у проблемного подрядчика
      const perfectChecks = recentChecks.filter(c => c.metrics && c.metrics.final === 100);
      perfectChecks.forEach(c => {
        const contrAll = recentChecks.filter(x => x.contractorName === c.contractorName);
        const avg = contrAll.reduce((sum, x) => sum + (x.metrics ? (Number(x.metrics.final) || 0) : 0), 0) / contrAll.length;
        if (avg < 75) {
          anomalies.push({ check: c, type: _t('quality.game.anomaly.inflate', 'Завышение (Подрядчик в красной зоне)'), color: 'bg-orange-100 text-orange-800 border-orange-200' });
          checkedInspectors.add(c.inspectorName);
        }
      });

      // Аномалия: B3 без доказательств
      recentChecks.forEach(c => {
        if (c.metrics && c.metrics.n_B3_fail > 0) {
          let hasPhotoOrComment = false;
          if (c.state) {
            Object.keys(c.state).forEach(id => {
              if (c.state[id] === 'fail_escalated' || (c.state[id] === 'fail' && c.photos && c.photos[id])) hasPhotoOrComment = true;
              if (c.details && c.details[id] && c.details[id].comment) hasPhotoOrComment = true;
            });
          }
          if (!hasPhotoOrComment) {
            anomalies.push({ check: c, type: _t('quality.game.anomaly.b3', 'B3 без фото и комментария'), color: 'bg-danger-soft text-danger border-danger-soft' });
            checkedInspectors.add(c.inspectorName);
          }
        }
      });

      // Разбавляем случайными аудитами для профилактики
      const allInspectors = [...new Set(recentChecks.map(c => c.inspectorName))];
      allInspectors.forEach(insp => {
        if (!checkedInspectors.has(insp)) {
          const inspChecks = recentChecks.filter(c => c.inspectorName === insp);
          if (inspChecks.length > 0) {
            const randCheck = inspChecks[Math.floor(Math.random() * inspChecks.length)];
            anomalies.push({ check: randCheck, type: _t('quality.game.anomaly.cross', 'Плановый перекрёстный аудит'), color: 'bg-slate-100 text-ink border-slate-300' });
          }
        }
      });

      let html = `<div class="grid grid-cols-1 gap-3 pb-8">`;
      // Убираем дубликаты
      const uniqueAnomalies = Array.from(new Set(anomalies.map(a => a.check.id)))
        .map(id => anomalies.find(a => a.check.id === id))
        .sort(() => 0.5 - Math.random()).slice(0, 15);

      uniqueAnomalies.forEach((item, idx) => {
        const c = item.check;
        html += `
            <div class="bg-surface border border-surface rounded-xl p-4 shadow-sm flex flex-col hover:border-brand transition-colors">
                <div class="flex justify-between items-start mb-2">
                    <span class="px-2 py-1 rounded text-rbi-caption font-black uppercase border ${item.color}">${item.type}</span>
                    <span class="text-rbi-caption font-bold text-muted">#${idx + 1}</span>
                </div>
                <div class="text-rbi-title font-black text-ink dark:text-white mb-1 leading-tight">${c.contractorName}</div>
                <div class="text-rbi-label font-bold text-brand mb-3">${c.location} | ${c.templateTitle}</div>
                
                <div class="bg-surface rounded-lg p-2.5 border border-surface flex justify-between items-center mt-auto mb-3">
                    <div>
                        <div class="text-rbi-caption uppercase font-bold text-muted mb-0.5">${_t('quality.game.audit.who', 'Кого проверяем:')}</div>
                        <div class="text-rbi-body font-black text-ink">${c.inspectorName || _t('quality.game.audit.unknown', 'Неизвестно')}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-rbi-caption uppercase font-bold text-muted mb-0.5">${_t('quality.game.audit.score', 'Оценка инженера:')}</div>
                        <div class="text-[16px] font-black ${c.metrics.final < 70 ? 'text-danger' : (c.metrics.final < 85 ? 'text-orange-500' : 'text-green-600')}">${c.metrics.final}%</div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="closeManagerPanel(); showHistoryDetail('${c.id}');" class="flex-1 bg-slate-100 text-muted py-2.5 rounded-lg text-rbi-caption font-black uppercase active:scale-95 border border-slate-200">
                        ${_t('quality.game.audit.open_act', '👁️ Открыть Акт')}
                    </button>
                    <button onclick="closeManagerPanel(); startInspectionWithValues('${c.contractorName.replace(/'/g, "\\'")}', '${c.templateKey}', null, '${c.projectName.replace(/'/g, "\\'")}', ${c.id});" class="flex-1 bg-brand text-white py-2.5 rounded-lg text-rbi-caption font-black uppercase active:scale-95 shadow-md">
    ${_t('quality.game.audit.do_audit', '⚖️ Провести аудит')}
</button>
                </div>
            </div>`;
      });

      html += `</div>`;
      document.getElementById('manager-audit-list').innerHTML = html;
      showToast(_t('quality.game.toast.audit_ready', '✅ План аудита сформирован! Найдены аномалии.'));
    }, 800);
  };

  // === ЗАПУСК ИНСПЕКЦИИ (С ПРЕДЗАПОЛНЕНИЕМ) ===
  // Перенесено из js/game.js (строка 1889).
  function startInspectionWithValues(contractor, templateKey, statusKey = null, project = null, originalAuditId = null) {
    const _allInspections = _getAllInspections();
    switchTab('tab-audit');
    changeTemplate(templateKey);

    // ИСПРАВЛЕНИЕ: Снимаем блокировку скролла от модальных окон!
    document.body.classList.remove('modal-open');

    // Очищаем предыдущий аудит
    window.auditOriginalData = null;

    setTimeout(async () => {
      const contrInput = document.getElementById('inp-contractor');
      if (contrInput && !contrInput.hasAttribute('readonly')) contrInput.value = contractor;

      const projInput = document.getElementById('inp-project');
      if (projInput && !projInput.hasAttribute('readonly')) {
        if (project && project !== 'Все') {
          projInput.value = project;
        } else {
          const pastCheck = _allInspections.find(c => c.contractorName === contractor && c.templateKey === templateKey);
          if (pastCheck && pastCheck.projectName) projInput.value = pastCheck.projectName;
        }
      }

      ['inp-location', 'inp-section', 'inp-floor', 'inp-room'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

      if (statusKey) {
        const selEl = document.getElementById('checklist-selector');
        if (selEl) selEl.dataset.pendingStatusKey = statusKey;

        const task = window.weeklyPlanData?.tasks?.find(t => t.statusKey === statusKey);

        // 1. ЛОГИКА ЭТАПНЫХ ЗАДАЧ (MILESTONE) - Предзаполнение галочек
        if (task && task.type === 'milestone') {
          const instanceId = task.priority.replace('Этап (', '').replace(')', '');
          const parts = instanceId.split(' ');
          if (parts.length >= 2) {
            const secInput = document.getElementById('inp-section');
            const floorInput = document.getElementById('inp-floor');
            if (secInput) secInput.value = parts[0];
            if (floorInput) floorInput.value = parts[1];
            updateLocationFromStructured();

            const lastCheck = _allInspections.find(c => c.contractorName === contractor && c.templateKey === templateKey && c.instanceId === `${parts[0].replace(/\D/g, '')}_${parts[1].replace(/\D/g, '')}`);
            if (lastCheck && lastCheck.state) {
              window.state = JSON.parse(JSON.stringify(lastCheck.state));
              window.details = JSON.parse(JSON.stringify(lastCheck.details || {}));
              window.photos = JSON.parse(JSON.stringify(lastCheck.photos || {}));
              showToast(_t('quality.game.toast.preload', '📥 Предзагружены данные прошлого обхода этого этапа'));
            }
          }
        }

        // 2. ЛОГИКА ЭТАЛОНА ("Было/Стало")
        if (task && task.needsEtalon) {
          // Ищем, был ли БРАК у этого подрядчика по этому виду работ раньше
          const pastFailCheck = _allInspections.find(c => c.contractorName === contractor && c.templateKey === templateKey && c.metrics && c.metrics.n_B3_fail > 0);
          if (pastFailCheck) {
            window.auditOriginalData = { isEtalonCompare: true, photos: pastFailCheck.photos, state: pastFailCheck.state };
            showToast(_t('quality.game.toast.etalon_mode', "🔍 Режим Эталона: Подгружены старые фото брака для сравнения 'Было/Стало'"));
          }
        }
      }

      // 3. ЛОГИКА ПЕРЕКРЕСТНОГО АУДИТА (Панель Руководителя)
      if (originalAuditId) {
        const originalCheck = _allInspections.find(c => c.id === originalAuditId);
        if (originalCheck) {
          window.auditOriginalData = { isCrossAudit: true, state: originalCheck.state, photos: originalCheck.photos, inspector: originalCheck.inspectorName };

          // ВАЖНО: Копируем старые ответы в текущий рабочий чек-лист
          window.state = JSON.parse(JSON.stringify(originalCheck.state || {}));
          window.details = JSON.parse(JSON.stringify(originalCheck.details || {}));
          window.photos = JSON.parse(JSON.stringify(originalCheck.photos || {}));

          // Предзаполняем локацию, чтобы аудит был в том же месте
          ['inp-section', 'inp-floor', 'inp-room'].forEach(id => {
            const el = document.getElementById(id);
            if (el && originalCheck[id.replace('inp-', '')]) el.value = originalCheck[id.replace('inp-', '')];
          });
          updateLocationFromStructured();

          showToast(_t('quality.game.toast.audit_mode', '⚖️ Режим Аудита: Вы проверяете работу инспектора {name}', { name: originalCheck.inspectorName }));
        }
      }

      render();
      if (typeof updateDataSummary === 'function') updateDataSummary();

      setTimeout(() => {
        const headerEl = document.getElementById('main-header');
        const offset = headerEl ? headerEl.offsetHeight : 140;
        window.scrollTo({ top: offset - 60, behavior: 'smooth' });
        if (typeof updateBodyPadding === 'function') updateBodyPadding();
      }, 50);
    }, 150);
  };

  // Перенесено из js/game.js (строка 1987).
  function gameChangeTaskStatus(statusKey, newStatus) {
    const contractorStatuses = window.contractorStatuses;
    if (contractorStatuses[statusKey]) {
      contractorStatuses[statusKey].status = newStatus;
      saveWeeklyPlan();
      var _tasksSvc3 = (GameActions._ctx && GameActions._ctx.tasks) || window.RBI.services.tasks;
      _tasksSvc3.generateWeeklyPlan(true); // Принудительный пересчет плана без этой задачи
      gameRenderDashboard();
      showToast(_t('quality.game.toast.status_changed', 'Статус изменен на: {status}', { status: newStatus }));
    }
    document.getElementById('task-status-modal').style.display = 'none';
  };

  // Интеграция Требования Эталона при нажатии на задачу
  // Интеграция старта задачи
  // Перенесено из js/game.js (строка 2000).
  function gameStartTask(contractor, templateKey) {
    // Обычный старт задачи (без блокировки эталоном)
    startInspectionWithValues(contractor, templateKey);
  };

  // Функция обновления единого имени инженера из Профиля
  // Перенесено из js/game.js (строка 2148).
  function gameUpdateEngineerName(newName) {
    const cleanName = newName.trim();
    if (!cleanName) return showToast(_t('quality.game.toast.name_empty', '⚠️ Имя не может быть пустым!'));

    // Сохраняем глобально
    if (typeof appSettings !== 'undefined') {
      _setSetting('engineerName', cleanName);
    }

    // Обновляем скрытое поле в шапке осмотра
    const inpInspector = document.getElementById('inp-inspector');
    if (inpInspector) inpInspector.value = cleanName;

    // Обновляем в настройках синхронизации
    if (typeof window.syncConfig !== 'undefined') {
      window.syncConfig.engineerName = cleanName;
      localStorage.setItem('rbi_sync_config', JSON.stringify(window.syncConfig));
    }

    showToast(_t('quality.game.toast.profile_updated', '✅ Профиль обновлен!'));

    // Перерисовываем дашборд, чтобы обновилась аватарка (буква имени)
    setTimeout(() => { gameRenderDashboard(); }, 200);
  };

  // ============================================================================
  // КОНСОЛИДИРОВАННЫЙ ОТЧЕТ КО ДНЮ КАЧЕСТВА
  // ============================================================================
  // Перенесено из js/game.js (строка 2212).
  async function rbi_executeQualityDayReport(taskId) {
    if (!_getSetting('aiEnabled')) {
      return showToast(_t('quality.game.toast.need_deepseek', '⚠️ Для формирования отчета требуется включить DeepSeek AI в настройках!'));
    }

    const periodValue = document.getElementById('qday-period-select').value;

    // Показываем лоадер
    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerHTML = `<div class="w-14 h-14 bg-brand-soft text-brand rounded-2xl flex items-center justify-center text-3xl mx-auto mb-2 border border-brand-soft animate-pulse">🤖</div>`;
    document.getElementById('modal-title').innerHTML = `<div class="text-center font-black uppercase text-lg">${_t('quality.game.qd.building_title', 'Сборка Дня Качества')}</div>`;
    document.getElementById('modal-body').innerHTML = `
        <div class="flex flex-col items-center justify-center py-4">
            <div class="text-rbi-label font-bold text-muted text-center space-y-2">
                <div>${_t('quality.game.qd.step_metrics', '📥 Агрегируем метрики подрядчиков...')}</div>
                <div>${_t('quality.game.qd.step_impact', '📊 Рассчитываем Impact Score команды...')}</div>
                <div>${_t('quality.game.qd.step_practices', '🏆 Выбираем лучшие практики...')}</div>
                <div class="text-brand font-black mt-2">${_t('quality.game.qd.step_ai', 'DeepSeek пишет управленческое резюме...')}</div>
            </div>
        </div>
    `;
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';

    try {
      const _allInspections = _getAllInspections();
      const now = new Date();
      let startDate, endDate;
      let periodTitle = "";

      if (periodValue === 'current_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        periodTitle = _t('quality.game.qd.period_month', 'ИТОГИ: {month}', { month: now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }) });
      } else if (periodValue === 'last_month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        periodTitle = _t('quality.game.qd.period_month', 'ИТОГИ: {month}', { month: startDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }) });
      } else if (periodValue === 'quarter') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        endDate = new Date();
        periodTitle = _t('quality.game.qd.period_quarter', 'КВАРТАЛЬНЫЙ ОТЧЕТ');
      } else {
        startDate = new Date(2000, 1, 1);
        endDate = new Date();
        periodTitle = _t('quality.game.qd.period_all', 'ОТЧЕТ ЗА ВСЁ ВРЕМЯ');
      }

      // 1. БАЗА ПРОВЕРОК
      const currentData = _allInspections.filter(c => new Date(c.date) >= startDate && new Date(c.date) <= endDate);

      if (currentData.length === 0) {
        closeModal();
        return showToast(_t('quality.game.toast.no_period_data', '⚠️ За выбранный период нет данных для отчета!'));
      }

      let currAvgUrk = 0;
      if (typeof window.avgContractorRatingsFromChecks === 'function') {
        currAvgUrk = window.avgContractorRatingsFromChecks(currentData).avgUrk;
      } else {
        let sumUrk = 0; currentData.forEach(i => { if (i.metrics) sumUrk += Number(i.metrics.final) || 0; });
        currAvgUrk = Math.round(sumUrk / currentData.length);
      }

      const currIntMetrics = typeof getObjectIntegralMetrics === 'function' ? getObjectIntegralMetrics(currentData, _templates().getUserTemplates()) : null;
      const IKO = currIntMetrics ? currIntMetrics.IKO : "0.00";
      const redZone = currIntMetrics ? currIntMetrics.redZonePerc : 0;

      // 2. HR МЕТРИКИ (КОМАНДА)
      let hrStats = [];
      if (typeof gameCalculateManagerMetrics === 'function') hrStats = gameCalculateManagerMetrics();
      let totalImpact = 0;
      hrStats.forEach(h => { totalImpact += h.avgImpact; });
      const avgTeamImpact = hrStats.length > 0 ? (totalImpact / hrStats.length) : 0;
      const bestEng = hrStats.length > 0 ? hrStats.sort((a, b) => b.pi - a.pi)[0] : { name: _t('quality.game.qd.no_data', 'Нет данных'), checks: 0 };

      // 3. ТОП ПРАКТИК
      let topPracticesHtml = `<div style="color:#64748b; font-size:10px;">${_t('quality.game.qd.no_practices', 'Практик в этом периоде не публиковалось.')}</div>`;
      if (_getPractices().length > 0) {
        const topPrac = [..._getPractices()].filter(p => new Date(p.date) >= startDate && new Date(p.date) <= endDate).sort((a, b) => b.deltaUrk - a.deltaUrk).slice(0, 2);
        if (topPrac.length > 0) {
          topPracticesHtml = topPrac.map(p => `
                    <div style="border:1px solid #cbd5e1; border-left:4px solid #16a34a; padding:10px; border-radius:6px; margin-bottom:10px; background:white; page-break-inside: avoid;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <strong style="font-size:12px; color:#0f172a;">${p.title}</strong>
                            <span style="color:#16a34a; font-weight:900;">${_t('quality.game.delta_urk', '+{n}% УрК', { n: p.deltaUrk })}</span>
                        </div>
                        <div style="font-size:10px; color:#64748b; margin-bottom:5px;">${_t('quality.game.qd.author', 'Автор: {author} | {title}', { author: p.author, title: p.templateTitle })}</div>
                        <table style="width:100%; border-collapse:collapse; font-size:10px;">
                            <tr>
                                <td style="width:50%; vertical-align:top; padding-right:5px;">
                                    <div style="color:#dc2626; font-weight:bold; margin-bottom:2px;">${_t('quality.game.qd.problem', '❌ Проблема:')}</div>
                                    <div style="color:#1e293b;">${p.problem}</div>
                                </td>
                                <td style="width:50%; vertical-align:top; padding-left:5px;">
                                    <div style="color:#16a34a; font-weight:bold; margin-bottom:2px;">${_t('quality.game.qd.solution', '✅ Решение:')}</div>
                                    <div style="color:#1e293b;">${p.solution}</div>
                                </td>
                            </tr>
                        </table>
                    </div>
                `).join('');
        }
      }

      // 4. КОРЕННЫЕ ПРИЧИНЫ (Парето)
      const causes = {};
      currentData.forEach(c => {
        if (c.state && c.details) {
          Object.keys(c.state).forEach(id => {
            if (c.state[id] === 'fail' || c.state[id] === 'fail_escalated') {
              const code = c.details[id]?.causeCode || 'C00';
              causes[code] = (causes[code] || 0) + 1;
            }
          });
        }
      });

      let causesHtml = '';
      const sortedCauses = Object.keys(causes).sort((a, b) => causes[b] - causes[a]).slice(0, 5);
      if (sortedCauses.length > 0) {
        causesHtml = sortedCauses.map(code => {
          const cName = (_defectCauses().find(x => x.code === code)?.name) || _t('quality.game.other', 'Иное');
          return `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #e2e8f0; padding:6px 0; font-size:11px;">
                    <span style="color:#334155;">${cName}</span>
                    <span style="font-weight:bold; color:#0f172a;">${_t('quality.game.qd.pcs', '{n} шт.', { n: causes[code] })}</span>
                </div>`;
        }).join('');
      } else {
        causesHtml = `<div style="color:#64748b; font-size:10px;">${_t('quality.game.qd.no_defects', 'Дефектов не выявлено.')}</div>`;
      }

      // 5. DEEPSEEK - АНАЛИЗ ДЛЯ РЕЗЮМЕ
      const promptSystem = `Ты — Директор по качеству (CQC). Сформируй официальное управленческое резюме для отчета "День Качества" за выбранный период.
        Тон: деловой, объективный, строгий. Формат: текст, разбитый на абзацы. Без воды.
        Отрази 3 вещи: 1. Оценку ИКО и тренда. 2. Оценку работы инженеров (Impact Score). 3. Главный риск следующего периода.`;

      const promptUser = `ИКО: ${IKO}. Красная зона: ${redZone}%. Средний Impact команды: ${avgTeamImpact.toFixed(2)}. Проверок за период: ${currentData.length}. ТОП проблема: ${sortedCauses.length > 0 ? sortedCauses[0] : 'Нет данных'}.`;

      const aiSummary = await _callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: promptUser }], { temperature: 0.3, max_tokens: 800 });

      closeModal();

      // 6. СБОРКА HTML ДЛЯ ПЕЧАТИ
      const pdfContent = `
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="font-size: 24pt; text-transform: uppercase; color: #0f172a; margin: 0; font-weight:900;">${_t('quality.game.qd.pdf_title', 'КОНСОЛИДИРОВАННЫЙ ОТЧЕТ КО ДНЮ КАЧЕСТВА')}</h1>
                <div style="font-size: 14pt; color: #4f46e5; font-weight: 900; margin-top: 5px; text-transform:uppercase;">${periodTitle}</div>
            </div>

            <!-- БЛОК 1: AI-РЕЗЮМЕ -->
            <div style="background: #f8fafc; border: 2px solid #cbd5e1; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h2 style="color: #4f46e5; margin: 0 0 10px 0; font-size: 14pt; text-transform: uppercase;">${_t('quality.game.qd.pdf_resume', '🧠 УПРАВЛЕНЧЕСКОЕ РЕЗЮМЕ (DEEPSEEK AI)')}</h2>
                <div style="font-size: 11pt; line-height: 1.6; color: #1e293b; font-weight: 500;">${meetingRichToSafeHtml(aiSummary)}</div>
            </div>

            <!-- БЛОК 2: МАКРОПОКАЗАТЕЛИ -->
            <table style="width: 100%; border-spacing: 15px 0; border-collapse: separate; table-layout: fixed; margin-left: -15px; margin-bottom: 20px;">
                <tr>
                    <td style="background:#f8fafc; border:2px solid #cbd5e1; border-radius:12px; padding:15px; text-align:center;">
                        <div style="font-size:9pt; color:#64748b; text-transform:uppercase; font-weight:bold;">${_t('quality.game.qd.pdf_iko', 'Индекс Риска (ИКО)')}</div>
                        <div style="font-size:28pt; font-weight:900; color:${parseFloat(IKO) >= 0.6 ? '#dc2626' : '#16a34a'};">${IKO}</div>
                    </td>
                    <td style="background:#fef2f2; border:2px solid #fca5a5; border-radius:12px; padding:15px; text-align:center;">
                        <div style="font-size:9pt; color:#991b1b; text-transform:uppercase; font-weight:bold;">${_t('quality.game.qd.pdf_red', 'Объем Красной Зоны')}</div>
                        <div style="font-size:28pt; font-weight:900; color:#dc2626;">${redZone}%</div>
                    </td>
                    <td style="background:#f0fdf4; border:2px solid #bbf7d0; border-radius:12px; padding:15px; text-align:center;">
                        <div style="font-size:9pt; color:#166534; text-transform:uppercase; font-weight:bold;">${_t('quality.game.qd.pdf_impact', 'Impact Score Команды')}</div>
                        <div style="font-size:28pt; font-weight:900; color:#16a34a;">${avgTeamImpact > 0 ? '+' : ''}${avgTeamImpact.toFixed(2)}</div>
                    </td>
                </tr>
            </table>

            <div style="page-break-before: always;"></div>

            <!-- БЛОК 3: ПРАКТИКИ И ПРИЧИНЫ -->
            <table style="width: 100%; border-spacing: 20px 0; border-collapse: separate; table-layout: fixed; margin-left: -20px; margin-bottom: 20px;">
                <tr>
                    <td style="width: 50%; vertical-align: top;">
                        <h2 style="font-size: 14pt; color: #0f172a; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px;">${_t('quality.game.qd.pdf_practices', '🏆 Лучшие практики периода')}</h2>
                        ${topPracticesHtml}
                    </td>
                    <td style="width: 50%; vertical-align: top;">
                        <h2 style="font-size: 14pt; color: #0f172a; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px;">${_t('quality.game.qd.pdf_pareto', '🔍 Топ причин брака (Парето)')}</h2>
                        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px;">
                            ${causesHtml}
                        </div>
                        
                        <h2 style="font-size: 14pt; color: #0f172a; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 25px; margin-bottom: 15px;">${_t('quality.game.qd.pdf_eng', '👤 Рейтинг Инженеров')}</h2>
                        <div style="background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px;">
                            <div style="font-size: 11pt; font-weight: bold; color: #1e293b; margin-bottom: 5px;">${_t('quality.game.qd.pdf_best', 'Лучший по Опыту (XP):')} <span style="color:#4f46e5;">${bestEng.name}</span></div>
                            <div style="font-size: 9pt; color: #64748b;">Проверок: ${bestEng.checks} | Строгость: ${bestEng.strictness > 0 ? '+' + bestEng.strictness.toFixed(1) : bestEng.strictness?.toFixed(1)}</div>
                        </div>
                    </td>
                </tr>
            </table>
        `;

      // Закрываем задачу в планировщике, так как отчет сформирован
      if (taskId) {
        const task = _getTasks().find(t => t.id === taskId);
        if (task) {
          task.status = 'done';
          task.resultComment = 'Отчет сгенерирован';
          await _storage().put(_storage().stores().TASKS, task);
          window.RBI.events.emit('tasks:refresh', {}); // Обновляем списки задач на экране
        }
      }

      // Запускаем печать. Передаем "browser", чтобы открылось системное окно печати/сохранения PDF
      printPdfShell(_t('quality.game.qd.print_name', 'День Качества'), pdfContent, "A4", "landscape", "browser");

    } catch (e) {
      closeModal();
      showToast(_t('quality.game.toast.report_error', '❌ Ошибка сборки отчета: {msg}', { msg: e.message }));
    }
  };

  // ============================================================================
  // FMEA: СОХРАНЕНИЕ/УДАЛЕНИЕ/ЗАГРУЗКА В ЧЕРНОВИК, ФОТО
  // ============================================================================

  // Перенесено из js/game.js (строка 2528).
  async function rbi_deleteFmea(id) {
    const record = _getFmea().find(m => String(m.id) === String(id));
    var _permSvc1 = (GameActions._ctx && GameActions._ctx.permissions) || window.RBI.services.permissions;
    if (record && !_permSvc1.canDelete(record.author)) return showToast(_t('quality.game.toast.fmea_no_delete', '⚠️ Нет прав на удаление чужого FMEA отчета!'));

    if (!confirm(_t('quality.game.confirm.delete_fmea', 'Удалить этот FMEA отчет?'))) return;
    if (record) {
      record._deleted = true;
      record.is_deleted = true; // <-- ДЛЯ ОБЛАКА
      record.updatedAt = new Date().toISOString();

      record.source = 'local';
      record.syncStatus = 'not_synced';
      record.sync_status = 'not_synced';

      await _storage().put(_storage().stores().FMEA, record);
      localStorage.setItem('rbi_cloud_dirty', '1');
      _triggerSync('silent');
    }
    if (typeof window.rbi_renderFmeaRegistry === 'function') {
      window.rbi_renderFmeaRegistry();
    } else {
      rbi_renderFmeaRegistry();
    }
    var _tasksSvc4 = (GameActions._ctx && GameActions._ctx.tasks) || window.RBI.services.tasks;
    _tasksSvc4.generateWeeklyPlan(true); // Пересчет задач
    showToast(_t('quality.game.toast.fmea_deleted', '🗑️ Отчет удален'));
  };

  // Перенесено из js/game.js (строка 2632). Загрузка FMEA в черновик для
  // редактирования — смешивает загрузку данных и вставку рабочей таблицы
  // в DOM; отнесено к actions (преобладает подготовка данных строк перед
  // рендером), рендер финального workspace HTML — уже здесь же, 1:1 как
  // в оригинале (решение по граничному случаю зафиксировано в отчёте).
  function rbi_loadFmeaToWorkspace(id) {
    const record = _getFmea().find(m => String(m.id) === String(id));
    if (!record) return;

    currentEditingFmeaId = id; // Глобально запоминаем ID

    let rowsHtml = record.defects.map((def, idx) => {
      let photoHtml = '';
      if (def.photo) {
        photoHtml = `
            <div class="relative w-16 h-16 mt-2 group">
                <img ${(typeof window.rbiBuildPhotoImgAttrs === 'function') ? window.rbiBuildPhotoImgAttrs(def.photo, { preferThumb: true }) : ('src="' + window.getPhotoSrc(def.photo) + '"')} class="w-full h-full object-cover rounded-lg border border-slate-300 cursor-pointer" onclick="openPhotoViewer('${def.photo}')">
                <button onclick="rbi_removeFmeaPhoto(this)" class="absolute -top-2 -right-2 bg-danger text-white w-5 h-5 rounded-full flex items-center justify-center text-rbi-caption font-bold shadow-md">✕</button>
            </div>`;
      } else {
        photoHtml = `
            <div class="mt-2 w-16">
                <div class="text-rbi-caption text-muted italic mb-1 text-center border border-dashed border-slate-300 rounded p-1">${_t('quality.game.fmea.no_photo', 'Нет фото')}</div>
                <button onclick="document.getElementById('fmea-photo-upload').click(); window.currentFmeaRowIdx=${idx};" class="w-full bg-slate-100 text-muted py-1 rounded border border-slate-300 text-rbi-caption font-bold uppercase active:scale-95 transition-colors">📷 Добавить</button>
            </div>`;
      }
      return `
        <tr class="fmea-row bg-surface hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" data-idx="${idx}">
            <input type="hidden" class="f-contr" value="${def.contractor}">
            <input type="hidden" class="f-work" value="${def.workTitle}">
            <input type="hidden" class="f-defect" value="${def.defectName}">
            <input type="hidden" class="f-photo" value="${def.photo || ''}">
            <input type="hidden" class="f-count" value="${def.count}">
            
            <td class="p-2 border border-surface align-top min-w-[150px]">
                <div class="text-rbi-caption font-bold text-muted uppercase leading-tight mb-0.5">${def.workTitle}</div>
                <div class="text-rbi-label font-black text-ink dark:text-white leading-tight mb-1">${def.contractor}</div>
                <div class="text-rbi-caption text-muted font-medium leading-snug">
                    <b>${def.defectName}</b> ${_t('quality.game.fmea.times', '({n} раз)', { n: def.count })}
                </div>
                ${photoHtml}
            </td>
            <td class="p-2 border border-surface align-top min-w-[120px]">
                <select class="f-stage input-base !py-1.5 !text-rbi-caption font-bold w-full bg-surface">
                    <option value="Ошибки СМР" ${def.stage === 'Ошибки СМР' ? 'selected' : ''}>${_t('quality.game.fmea.stage.smr', 'Ошибки СМР')}</option>
                    <option value="Проект" ${def.stage === 'Проект' ? 'selected' : ''}>${_t('quality.game.fmea.stage.project', 'Проектная ошибка')}</option>
                    <option value="Материалы" ${def.stage === 'Материалы' ? 'selected' : ''}>${_t('quality.game.fmea.stage.materials', 'Материалы / Завод')}</option>
                    <option value="Условия" ${def.stage === 'Условия' ? 'selected' : ''}>${_t('quality.game.fmea.stage.conditions', 'Внешние условия')}</option>
                </select>
            </td>
            <td class="p-2 border border-surface align-top min-w-[180px]">
                <textarea class="f-cause input-base w-full h-20 resize-none text-rbi-caption p-2" placeholder="${_t('quality.game.fmea.ph.cause', 'Коренная причина...')}">${def.cause || ''}</textarea>
            </td>
            <td class="p-2 border border-surface align-top min-w-[180px]">
                <textarea class="f-effect input-base w-full h-20 resize-none text-rbi-caption p-2" placeholder="${_t('quality.game.fmea.ph.effect', 'Последствия (Риски)...')}">${def.effect || ''}</textarea>
            </td>
            <td class="p-2 border border-surface align-top min-w-[180px]">
                <textarea class="f-fix input-base w-full h-20 resize-none text-rbi-caption p-2 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-200" placeholder="${_t('quality.game.fmea.ph.fix', 'Как устранить сейчас...')}">${def.fix || ''}</textarea>
            </td>
            <td class="p-2 border border-surface align-top min-w-[180px]">
                <textarea class="f-prevent input-base w-full h-20 resize-none text-rbi-caption p-2 bg-green-50 dark:bg-green-900/20 dark:text-green-200" placeholder="${_t('quality.game.fmea.ph.prevent', 'Системное предотвращение...')}">${def.prevent || ''}</textarea>
            </td>
            <td class="p-2 border border-surface align-top min-w-[80px]">
                <div class="text-center">
                    <div class="text-rbi-caption font-bold text-muted mb-1">RPN</div>
                    <input type="number" class="f-rpn input-base text-center font-black text-lg text-purple-700 dark:text-purple-400 !py-2" placeholder="0" value="${def.rpn || 0}">
                </div>
            </td>
        </tr>`;
    }).join('');

    const workspace = document.getElementById('fmea-workspace');
    workspace.innerHTML = `
        <div class="bg-surface border border-purple-300 dark:border-purple-700 rounded-2xl shadow-sm p-4 mb-4">
            <div class="flex justify-between items-center mb-3">
                <div class="text-rbi-label font-black text-purple-700 dark:text-purple-300 uppercase tracking-widest">
                    ${_t('quality.game.fmea.edit_title', 'Редактирование: {title}', { title: record.title })}
                </div>
            </div>
            <div class="overflow-x-auto custom-scrollbar border border-surface rounded-xl">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-surface text-muted uppercase text-rbi-caption font-bold">
                            <th class="p-2 border border-surface">${_t('quality.game.fmea.th.problem', '1. Подрядчик / Проблема')}</th>
                            <th class="p-2 border border-surface">${_t('quality.game.fmea.th.stage', '2. Этап возникновения')}</th>
                            <th class="p-2 border border-surface">${_t('quality.game.fmea.th.cause', '3. Коренная причина')}</th>
                            <th class="p-2 border border-surface">${_t('quality.game.fmea.th.effect', '4. Последствия (Риски)')}</th>
                            <th class="p-2 border border-surface text-blue-600 dark:text-blue-300">${_t('quality.game.fmea.th.fix', '5. Устранение (Fix)')}</th>
                            <th class="p-2 border border-surface text-green-600 dark:text-green-300">${_t('quality.game.fmea.th.prevent', '6. Предотвращение')}</th>
                            <th class="p-2 border border-surface text-purple-600 dark:text-purple-300 text-center">7. RPN</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
             <button onclick="rbi_addManualFmeaRow()" class="w-full mt-3 bg-surface text-muted py-3 rounded-xl font-black text-rbi-caption uppercase border border-surface active:scale-95 transition-colors flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> ${_t('quality.game.fmea.add_row_short', 'Добавить строку')}
            </button>
            <button onclick="rbi_saveFmea('${record ? record.periodName : 'Ручной ввод'}')" class="w-full mt-3 bg-purple-600 text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg> ${_t('quality.game.fmea.save_report', '💾 Сохранить отчет в Систему')}
            </button>
        </div>
    `;

    if (typeof window.rbiHydrateLocalImages === 'function') {
      window.rbiHydrateLocalImages(workspace);
    }
    // Prefer window.* so desktop wraps (engineer.desktop) can remount chrome
    if (typeof window.rbi_renderFmeaRegistry === 'function') {
      window.rbi_renderFmeaRegistry();
    } else {
      rbi_renderFmeaRegistry();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(_t('quality.game.toast.fmea_opened', 'Отчет открыт для редактирования'));
  };

  function _rbiCollectFmeaNewDraft() {
    if (currentEditingFmeaId) return null;
    const rows = document.querySelectorAll('#fmea-workspace .fmea-row');
    if (!rows.length) return null;
    const defects = [];
    let meaningful = false;
    rows.forEach(row => {
      const contractor = row.querySelector('.f-contr').value;
      const workTitle = row.querySelector('.f-work').value;
      const defectName = row.querySelector('.f-defect').value;
      const photo = row.querySelector('.f-photo').value;
      const count = row.querySelector('.f-count').value;
      const stage = row.querySelector('.f-stage').value;
      const cause = row.querySelector('.f-cause').value.trim();
      const effect = row.querySelector('.f-effect').value.trim();
      const fix = row.querySelector('.f-fix').value.trim();
      const prevent = row.querySelector('.f-prevent').value.trim();
      const rpn = row.querySelector('.f-rpn').value;
      defects.push({
        contractor, workTitle, defectName, photo, count, stage, cause, effect, fix, prevent, rpn
      });
      const hasNonDefault = (contractor && contractor !== 'Ручной ввод')
        || (workTitle && workTitle !== 'Ручной ввод')
        || (defectName && defectName !== 'Ручной ввод');
      const hasText = !!(cause || effect || fix || prevent || photo);
      const hasRpn = rpn !== '' && rpn !== '0' && rpn != null;
      if (hasNonDefault || hasText || hasRpn) meaningful = true;
    });
    return meaningful ? { defects } : null;
  }

  function _rbiApplyFmeaNewDraft(payload) {
    if (!payload || !Array.isArray(payload.defects) || !payload.defects.length) return;
    const tbody = document.querySelector('#fmea-workspace tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    payload.defects.forEach((def, idx) => {
      rbi_addManualFmeaRow();
      const row = tbody.querySelector(`.fmea-row[data-idx="${idx}"]`) || tbody.children[idx];
      if (!row) return;
      row.querySelector('.f-contr').value = def.contractor || 'Ручной ввод';
      row.querySelector('.f-work').value = def.workTitle || 'Ручной ввод';
      row.querySelector('.f-defect').value = def.defectName || 'Ручной ввод';
      row.querySelector('.f-photo').value = def.photo || '';
      row.querySelector('.f-count').value = def.count || '1';
      const workInput = row.querySelector('.f-work-input');
      const contrInput = row.querySelector('.f-contr-input');
      const defectInput = row.querySelector('.f-defect-input');
      if (workInput) workInput.value = def.workTitle || '';
      if (contrInput) contrInput.value = def.contractor || '';
      if (defectInput) defectInput.value = def.defectName || '';
      const stageEl = row.querySelector('.f-stage');
      if (stageEl && def.stage) stageEl.value = def.stage;
      row.querySelector('.f-cause').value = def.cause || '';
      row.querySelector('.f-effect').value = def.effect || '';
      row.querySelector('.f-fix').value = def.fix || '';
      row.querySelector('.f-prevent').value = def.prevent || '';
      if (def.rpn !== undefined && def.rpn !== '') row.querySelector('.f-rpn').value = def.rpn;
      if (def.photo) {
        const photoDiv = row.querySelector('.mt-2.w-16');
        if (photoDiv) {
          photoDiv.outerHTML = `
            <div class="relative w-16 h-16 mt-2 group">
                <img ${(typeof window.rbiBuildPhotoImgAttrs === 'function') ? window.rbiBuildPhotoImgAttrs(def.photo, { preferThumb: true }) : ('src="' + window.getPhotoSrc(def.photo) + '"')} class="w-full h-full object-cover rounded-lg border border-slate-300 cursor-pointer" onclick="openPhotoViewer('${def.photo}')">
                <button onclick="rbi_removeFmeaPhoto(this)" class="absolute -top-2 -right-2 bg-danger text-white w-5 h-5 rounded-full flex items-center justify-center text-rbi-caption font-bold shadow-md">✕</button>
            </div>`;
        }
      }
    });
  }

  // Перенесено из js/game.js (строка 2918).
  async function rbi_saveFmea(periodName) {
    if (_isDemoMode()) return showToast(_t('quality.game.fmea.toast.demo', 'В демо-режиме сохранение отключено'));

    const wasNewFmea = !currentEditingFmeaId;
    const rows = document.querySelectorAll('.fmea-row');
    const defects = [];

    rows.forEach(row => {
      defects.push({
        contractor: row.querySelector('.f-contr').value,
        workTitle: row.querySelector('.f-work').value,
        defectName: row.querySelector('.f-defect').value,
        photo: row.querySelector('.f-photo').value,
        count: row.querySelector('.f-count').value,
        stage: row.querySelector('.f-stage').value,
        cause: row.querySelector('.f-cause').value.trim(),
        effect: row.querySelector('.f-effect').value.trim(),
        fix: row.querySelector('.f-fix').value.trim(),
        prevent: row.querySelector('.f-prevent').value.trim(),
        rpn: row.querySelector('.f-rpn').value
      });
    });

    let fmeaId = currentEditingFmeaId || ('fmea_' + Date.now().toString(36));

    // Получаем привязку к объекту
    const projectInput = document.getElementById('inp-project')?.value || '';
    const engineerName = document.getElementById('inp-inspector')?.value || (typeof appSettings !== 'undefined' ? _getSetting('engineerName') : 'Инженер');

    let canonicalKey = projectInput;
    var fmeaObjList = _objectList();
    if (fmeaObjList.length) {
      const found = fmeaObjList.find(o =>
        o.display_name === projectInput || o.canonical_key === projectInput
      );
      if (found) canonicalKey = found.canonical_key;
    }

    const fmeaRecord = {
      id: fmeaId,
      project_code: window.syncConfig?.projectCode || 'LOCAL',
      project_canonical_key: canonicalKey,
      project_display_name: projectInput,
      engineerName: engineerName,
      inspectorName: engineerName,
      author: engineerName,
      date: new Date().toISOString(),
      title: `FMEA Анализ от ${new Date().toLocaleDateString('ru-RU')}`,
      periodName: periodName,
      defects: defects,
      source: 'local',
      syncStatus: 'not_synced',
      sync_status: 'not_synced',
      syncBlockReason: '',
      sync_block_reason: '',
      _deleted: false,
      is_deleted: false,
      updatedAt: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Обновляем массив без дубликатов
    const idx = _getFmea().findIndex(x => String(x.id) === String(fmeaId));
    if (idx >= 0) _getFmea()[idx] = fmeaRecord;
    else _getFmea().push(fmeaRecord);

    await _storage().put(_storage().stores().FMEA, fmeaRecord);
    // ОЧЕРЕДЬ
    if (!_isDemoMode()) {
      if (GameActions._ctx && GameActions._ctx.sync) {
        GameActions._ctx.sync.enqueue('SAVE_FMEA', fmeaRecord);
      } else if (window.RBI && window.RBI.services && window.RBI.services.sync) {
        window.RBI.services.sync.enqueue('SAVE_FMEA', fmeaRecord);
      } else if (window.SyncQueueManager) {
        window.SyncQueueManager.enqueue('SAVE_FMEA', fmeaRecord);
      }
    }
    currentEditingFmeaId = null; // Сбрасываем ID

    if (wasNewFmea && window.RBIFormDraft) {
      window.RBIFormDraft.clear(window.RBIFormDraft.KEYS.FMEA_NEW);
      window.RBIFormDraft.unbindAutoSave(window.RBIFormDraft.KEYS.FMEA_NEW);
    }

    localStorage.setItem('rbi_cloud_dirty', '1');
    _triggerSync('silent');

    document.getElementById('fmea-workspace').innerHTML = '';

    // АВТОЗАКРЫТИЕ ЗАДАЧИ FMEA В ПЛАНИРОВЩИКЕ
    {
      const fmeaTask = _getTasks().find(t => t.title.includes('FMEA') && t.status === 'pending');
      if (fmeaTask) {
        fmeaTask.status = 'done';
        fmeaTask.resultComment = 'Отчет сохранен в базу';
        fmeaTask.updatedAt = new Date().toISOString();
        await _storage().put(_storage().stores().TASKS, fmeaTask);
      }
    }

    showToast(_t('quality.game.toast.fmea_saved', '💾 FMEA Отчет сохранен! Задача выполнена.'));
    if (typeof window.rbi_renderFmeaRegistry === 'function') {
      window.rbi_renderFmeaRegistry();
    } else {
      rbi_renderFmeaRegistry();
    }
    window.RBI.events.emit('tasks:refresh', {});
    // Тихо пересчитываем план, чтобы проверить, появились ли новые системные дефекты
    var _tasksSvc5 = (GameActions._ctx && GameActions._ctx.tasks) || window.RBI.services.tasks;
    _tasksSvc5.generateWeeklyPlan(false);
  };

  // === ОБРАБОТКА РУЧНОГО ФОТО В FMEA ===
  // Перенесено из js/game.js (строка 3021).
  function rbi_handleFmeaPhotoUpload(event) {
    const file = event.target.files[0];
    if (!file || window.currentFmeaRowIdx === undefined) return;

    showToast(_t('quality.game.toast.fmea_photo', '⚙️ Загрузка фото FMEA...'));
    window.compressImageToBase64(file, 1000, 0.8, async (base64) => {
      // Сохраняем в кэш IndexedDB
      const localUrl = await PhotoManager.saveLocal(base64, 'fmea');

      // Находим нужную строку таблицы и её инпут
      const row = document.querySelector(`.fmea-row[data-idx="${window.currentFmeaRowIdx}"]`);
      if (row) {
        row.querySelector('.f-photo').value = localUrl;
        // Перерисовываем ячейку с фото
        const photoContainer = row.querySelector('.min-w-\\[150px\\]');
        const targetDiv = photoContainer.lastElementChild;
        targetDiv.outerHTML = `
            <div class="relative w-16 h-16 mt-2 group">
                <img ${(typeof window.rbiBuildPhotoImgAttrs === 'function') ? window.rbiBuildPhotoImgAttrs(localUrl, { preferThumb: true }) : ('src="' + window.getPhotoSrc(localUrl) + '"')} class="w-full h-full object-cover rounded-lg border border-slate-300 cursor-pointer" onclick="openPhotoViewer('${localUrl}')">
                <button onclick="rbi_removeFmeaPhoto(this)" class="absolute -top-2 -right-2 bg-danger text-white w-5 h-5 rounded-full flex items-center justify-center text-rbi-caption font-bold shadow-md">✕</button>
            </div>`;
      }
      event.target.value = '';
      if (window.RBIFormDraft && !currentEditingFmeaId) {
        window.RBIFormDraft.saveNow(window.RBIFormDraft.KEYS.FMEA_NEW, _rbiCollectFmeaNewDraft);
      }
    });
  };

  // Перенесено из js/game.js (строка 3047).
  function rbi_removeFmeaPhoto(btnEl) {
    const row = btnEl.closest('.fmea-row');
    if (!row) return;
    row.querySelector('.f-photo').value = '';

    const targetDiv = btnEl.closest('.relative');
    const idx = row.dataset.idx;
    targetDiv.outerHTML = `
        <div class="mt-2 w-16">
            <div class="text-rbi-caption text-muted italic mb-1 text-center border border-dashed border-slate-300 rounded p-1">${_t('quality.game.fmea.no_photo', 'Нет фото')}</div>
            <button onclick="document.getElementById('fmea-photo-upload').click(); window.currentFmeaRowIdx=${idx};" class="w-full bg-slate-100 text-muted py-1 rounded border border-slate-300 text-rbi-caption font-bold uppercase active:scale-95 transition-colors">📷 Добавить</button>
        </div>`;
  };

  // Перенесено из js/game.js (строка 3106). Создание пустого бланка FMEA.
  function rbi_createEmptyFmea() {
    const workspace = document.getElementById('fmea-workspace');
    const FD = window.RBIFormDraft;
    if (FD) FD.unbindAutoSave(FD.KEYS.FMEA_NEW);
    currentEditingFmeaId = null; // Сбрасываем ID, чтобы сохранился как новый

    workspace.innerHTML = `
        <div class="bg-surface border border-purple-300 dark:border-purple-700 rounded-2xl shadow-sm p-4 mb-4 animate-fadeIn">
            <div class="flex justify-between items-center mb-3">
                <div class="text-rbi-label font-black text-purple-700 dark:text-purple-300 uppercase tracking-widest">
                    ${_t('quality.game.fmea.new_manual', 'Новый ручной FMEA-Анализ')}
                </div>
                <button onclick="window.RBI.services.ai.rbi_fillFmeaWithAi()" id="btn-fmea-ai" class="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-700 px-3 py-1.5 rounded-lg text-rbi-caption font-black uppercase active:scale-95 shadow-sm transition-transform flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> ${_t('quality.game.fmea.autofill', 'Автозаполнение (ИИ)')}
            </button>
            </div>
            
            <div class="overflow-x-auto custom-scrollbar border border-surface rounded-xl">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-surface text-muted uppercase text-rbi-caption font-bold tracking-wider">
                            <th class="p-2 border border-surface">${_t('quality.game.fmea.th.problem', '1. Подрядчик / Проблема')}</th>
                            <th class="p-2 border border-surface">${_t('quality.game.fmea.th.stage', '2. Этап возникновения')}</th>
                            <th class="p-2 border border-surface">${_t('quality.game.fmea.th.cause', '3. Коренная причина')}</th>
                            <th class="p-2 border border-surface">${_t('quality.game.fmea.th.effect', '4. Последствия (Риски)')}</th>
                            <th class="p-2 border border-surface text-blue-600 dark:text-blue-300">${_t('quality.game.fmea.th.fix', '5. Устранение (Fix)')}</th>
                            <th class="p-2 border border-surface text-green-600 dark:text-green-300">${_t('quality.game.fmea.th.prevent', '6. Предотвращение')}</th>
                            <th class="p-2 border border-surface text-purple-600 dark:text-purple-300 text-center">7. RPN</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Строки появятся здесь -->
                    </tbody>
                </table>
            </div>
            <button onclick="rbi_addManualFmeaRow()" class="w-full mt-3 bg-surface text-muted py-3 rounded-xl font-black text-rbi-caption uppercase border border-surface active:scale-95 transition-colors flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> ${_t('quality.game.fmea.add_row', '➕ Добавить строку вручную')}
            </button>
            <button onclick="rbi_saveFmea('Ручной ввод')" class="w-full mt-4 bg-purple-600 text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg> ${_t('quality.game.fmea.save_report', '💾 Сохранить отчет в Систему')}
            </button>
        </div>
    `;

    // Сразу добавляем одну пустую строку
    rbi_addManualFmeaRow();

    if (FD) {
      const decision = FD.askRestore(FD.KEYS.FMEA_NEW, 'FMEA');
      if (decision === 'continue') {
        const d = FD.get(FD.KEYS.FMEA_NEW);
        if (d && d.payload) _rbiApplyFmeaNewDraft(d.payload);
      }
      FD.bindAutoSave(workspace, FD.KEYS.FMEA_NEW, _rbiCollectFmeaNewDraft);
    }

    // Скроллим к рабочей области
    workspace.scrollIntoView({ behavior: 'smooth' });
  };

  // ============================================================================
  // ПАНЕЛЬ РУКОВОДИТЕЛЯ: СПРАВОЧНИК ПОДРЯДЧИКОВ (CRUD)
  // ============================================================================

  // Перенесено из js/game.js (строка 3157).
  async function gameLoadContractorDirectory() {
    const container = document.getElementById('manager-contractor-directory-list');
    if (!container) return;

    if (!window.supabaseClient) {
      container.innerHTML = '<div class="text-center py-4 text-xs text-danger">Облако не подключено</div>';
      return;
    }

    const pCode = window.syncConfig?.projectCode || 'RBI';
    container.innerHTML = '<div class="text-center py-4 text-xs text-muted animate-pulse">Загрузка подрядчиков...</div>';

    try {
      const { data, error } = await window.supabaseClient
        .from('contractor_directory')
        .select('canonical_key, display_name, synonyms, inn, is_deleted, updated_at')
        .eq('project_code', pCode)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('display_name', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-xs text-muted">Справочник подрядчиков пуст</div>';
        return;
      }

      const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '\\\'');

      container.innerHTML = data.map(c => `
            <div class="bg-surface border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 mb-3 shadow-sm flex flex-col">
                <div class="flex justify-between items-start gap-2 mb-2 border-b border-surface pb-2">
                    <div class="min-w-0 flex-1">
                        <div class="text-rbi-body font-black text-ink dark:text-white truncate">
                            ${esc(c.display_name)}
                        </div>
                        <div class="text-rbi-caption text-muted font-mono truncate mt-0.5">
                            ID: ${esc(c.canonical_key)}
                        </div>
                    </div>
                    <div class="flex gap-1.5 shrink-0">
                        <button onclick="gameEditContractor('${esc(c.canonical_key)}', '${esc(c.display_name)}')" class="bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/30 dark:border-blue-800 px-3 py-1.5 rounded-lg text-rbi-caption font-bold active:scale-95 transition-transform shadow-sm">${_t('quality.game.aikb.edit_btn', 'Изменить')}</button>
                        <button onclick="gameDeleteContractor('${esc(c.canonical_key)}')" class="bg-danger-soft text-danger border border-danger-soft/30 px-3 py-1.5 rounded-lg text-rbi-caption font-bold active:scale-95 transition-transform shadow-sm">${_t('quality.game.aikb.del_btn', 'Удалить')}</button>
                    </div>
                </div>
                
                <div class="bg-surface/50 p-2 rounded-lg border border-surface">
                    <div class="text-rbi-caption font-bold text-muted uppercase mb-1.5 flex justify-between items-center">
                        <span>Синонимы для ПК СК:</span>
                        <button onclick="window.RBI.services.ai.gameGenerateContractorSynonymsAI('${esc(c.canonical_key)}', '${esc(c.display_name)}')" class="text-brand hover:text-brand font-black flex items-center gap-1 active:scale-95 transition-transform bg-brand-soft/30 px-1.5 py-0.5 rounded border border-brand-soft"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> AI-Генерация</button>
                    </div>
                    
                    <div class="flex flex-wrap gap-1 mb-2">
                        ${Array.isArray(c.synonyms) && c.synonyms.length > 0
          ? c.synonyms.map(s => `<span class="bg-surface text-muted px-2 py-0.5 rounded border border-surface text-rbi-caption font-medium inline-flex items-center gap-1">${esc(s)}</span>`).join('')
          : '<span class="text-rbi-caption text-muted italic">Синонимов пока нет</span>'
        }
                    </div>
                    
                    <div class="flex gap-1.5 mt-2 pt-2 border-t border-surface">
                        <input type="text" id="alias_contr_input_${esc(c.canonical_key)}" class="input-base !py-1.5 text-rbi-caption flex-1 bg-surface shadow-inner" placeholder="Напр: СК Ромашка">
                        <button onclick="window.RBI.services.ai.gameAddContractorAliasInline('${esc(c.canonical_key)}')" class="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1.5 rounded-lg text-rbi-caption font-black uppercase border border-emerald-200 dark:border-emerald-800 active:scale-95 transition-transform shrink-0">+ Добавить</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
      console.error('[gameLoadContractorDirectory]', e);
      container.innerHTML = '<div class="text-center py-4 text-xs text-danger">Ошибка загрузки подрядчиков</div>';
    }
  };

  // Перенесено из js/game.js (строка 3231).
  async function gameEditContractor(canonicalKey, currentName) {
    const newName = prompt('Введите новое корректное название подрядчика:', currentName);
    if (!newName || newName.trim() === '' || newName === currentName) return;

    showToast(_t('quality.game.toast.dir_updating', '⏳ Обновление справочника...'));

    try {
      const pCode = window.syncConfig?.projectCode || 'RBI';
      const nowIso = new Date().toISOString();

      // Обновляем ТОЛЬКО локально на устройстве
      if (typeof dbGetAll === 'function') {
        const localDirs = await _storage().getAll('contractor_directory') || [];
        const item = localDirs.find(c => c.canonical_key === canonicalKey && c.project_code === pCode);
        if (item) {
          item.display_name = newName.trim();
          item.updated_at = nowIso;
          item.source = 'local';
          item.sync_status = 'not_synced';
          await _storage().put('contractor_directory', item);
        }
      }

      showToast(_t('quality.game.toast.contr_updated', '✏️ Название подрядчика успешно обновлено'));
      gameLoadContractorDirectory();

      var contrEditSvc = _contractors();
      if (contrEditSvc && typeof contrEditSvc.init === 'function') await contrEditSvc.init();

      localStorage.setItem('rbi_cloud_dirty', '1');
      _triggerSync('silent');

    } catch (e) {
      console.error('[gameEditContractor]', e);
      showToast(_t('quality.game.toast.contr_update_err', '❌ Ошибка при обновлении названия'));
    }
  };

  // Перенесено из js/game.js (строка 3269).
  async function gameDeleteContractor(canonicalKey) {
    if (!confirm(_t('quality.game.confirm.delete_contr', 'Вы уверены, что хотите удалить подрядчика из справочника?\n\nНовые заявки от него снова будут падать в очередь на подтверждение.'))) return;

    showToast(_t('quality.game.toast.contr_deleting', '⏳ Удаление из справочника...'));

    try {
      const pCode = window.syncConfig?.projectCode || 'RBI';
      const nowIso = new Date().toISOString();

      // Удаляем ТОЛЬКО локально на устройстве (Ставим флаги удаления)
      if (typeof dbGetAll === 'function') {
        const localDirs = await _storage().getAll('contractor_directory') || [];
        const item = localDirs.find(c => c.canonical_key === canonicalKey && c.project_code === pCode);
        if (item) {
          item._deleted = true;
          item.is_deleted = true;
          item.updated_at = nowIso;
          item.source = 'local';
          item.sync_status = 'not_synced';
          await _storage().put('contractor_directory', item);
        }
      }

      showToast(_t('quality.game.toast.contr_deleted', '🗑️ Подрядчик удален из справочника'));
      gameLoadContractorDirectory();

      var contrEditSvc = _contractors();
      if (contrEditSvc && typeof contrEditSvc.init === 'function') await contrEditSvc.init();

      localStorage.setItem('rbi_cloud_dirty', '1');
      _triggerSync('silent');

    } catch (e) {
      console.error('[gameDeleteContractor]', e);
      showToast(_t('quality.game.toast.contr_delete_err', '❌ Ошибка при удалении подрядчика'));
    }
  };

  // Перенесено из js/game.js (строка 3306).
  async function gameLoadContractorRequests() {
    const container = document.getElementById('manager-contractor-requests-list');
    if (!container) return;

    if (!window.supabaseClient) {
      container.innerHTML = '<div class="text-center py-4 text-xs text-danger">Облако не подключено</div>';
      return;
    }

    const pCode = window.syncConfig?.projectCode || 'RBI';
    container.innerHTML = '<div class="text-center py-4 text-xs text-muted">Загрузка заявок подрядчиков...</div>';

    try {
      // 1. Получаем саму очередь заявок
      const { data, error } = await window.supabaseClient
        .from('contractor_normalization_queue')
        .select('id, project_code, raw_name, cleaned_name, suggested_canonical_key, created_by, status, admin_comment, updated_at')
        .eq('project_code', pCode)
        .neq('status', 'linked')
        .neq('status', 'resolved')
        .neq('status', 'rejected')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-xs text-muted">Заявок на подрядчиков нет</div>';
        return;
      }

      // 2. Получаем текущий справочник подрядчиков для выпадающего списка
      const { data: dirData } = await window.supabaseClient
        .from('contractor_directory')
        .select('canonical_key, display_name')
        .eq('project_code', pCode)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('display_name', { ascending: true });

      const directory = dirData || [];
      const dirOptions = directory.map(c => `<option value="link_${c.canonical_key}">Связать с: ${c.display_name}</option>`).join('');

      const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

      container.innerHTML = data.map(q => `
            <div class="bg-surface border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 mb-2 shadow-sm">
                <div class="text-rbi-body font-black text-ink dark:text-white">
                    ${esc(q.raw_name)}
                </div>
                <div class="text-rbi-caption text-muted mt-1">
                    Автор: ${esc(q.created_by || 'не указан')} · Статус: ${esc(q.status || 'ожидает')}
                </div>
                
                <div class="mt-3 flex flex-col gap-2 border-t border-surface pt-2">
                    <select id="contr_req_action_${esc(q.id)}" class="input-base !py-1.5 !text-rbi-caption font-bold w-full bg-surface">
                        <option value="create">✨ Создать как нового подрядчика</option>
                        <optgroup label="Связать со справочником:">
                            ${dirOptions}
                        </optgroup>
                        <option value="reject">❌ Отклонить заявку</option>
                    </select>
                    
                    <div class="flex gap-2">
                        <button onclick="gameResolveContractorRequest('${esc(q.id)}')"
                            class="bg-brand text-white px-3 py-2 rounded-lg text-rbi-caption font-black uppercase active:scale-95 shadow-sm flex-1">
                            Применить
                        </button>
                        <button onclick="gameDeleteContractorRequest('${esc(q.id)}')"
                            class="bg-slate-100 text-danger border border-slate-200 px-3 py-2 rounded-lg text-rbi-caption font-black uppercase active:scale-95">
                            Удалить
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
      console.error('[gameLoadContractorRequests]', e);
      container.innerHTML = '<div class="text-center py-4 text-xs text-danger">Ошибка загрузки заявок подрядчиков</div>';
    }
  };

  // Перенесено из js/game.js (строка 3391).
  async function gameResolveContractorRequest(requestId) {
    if (!window.supabaseClient) return showToast(_t('quality.game.toast.cloud_off', '❌ Облако не подключено'));

    const selectEl = document.getElementById(`contr_req_action_${requestId}`);
    if (!selectEl) return;

    const action = selectEl.value;
    const pCode = window.syncConfig?.projectCode || 'RBI';
    const currentUser = window.syncConfig?.engineerName || 'Админ';
    const nowIso = new Date().toISOString();

    showToast(_t('quality.game.toast.processing_req', '⏳ Обработка заявки...'));

    try {
      // Получаем данные заявки
      const { data: req, error: reqErr } = await window.supabaseClient
        .from('contractor_normalization_queue')
        .select('*')
        .eq('id', requestId)
        .single();

      if (reqErr) throw reqErr;
      if (!req) return showToast(_t('quality.game.toast.req_not_found', '⚠️ Заявка не найдена'));

      const rawName = String(req.raw_name || '').trim();
      if (!rawName) return showToast(_t('quality.game.toast.req_no_name', '⚠️ В заявке нет названия'));

      // Логика: СОЗДАТЬ НОВОГО
      if (action === 'create') {
        let canonicalKey = String(req.suggested_canonical_key || '').trim();
        if (!canonicalKey) {
          var contrKeySvc = _contractors();
          if (contrKeySvc && typeof contrKeySvc.makeCanonicalKey === 'function') {
            canonicalKey = contrKeySvc.makeCanonicalKey(rawName);
          }
        }

        const contractorPayload = {
          project_code: pCode,
          canonical_key: canonicalKey,
          display_name: rawName,
          synonyms: [rawName],
          inn: '',
          created_by: currentUser,
          is_deleted: false,
          created_at: nowIso,
          updated_at: nowIso
        };

        await window.supabaseClient.from('contractor_directory').upsert(contractorPayload, { onConflict: 'project_code,canonical_key' });
        await window.supabaseClient.from('contractor_aliases').upsert({
          project_code: pCode, raw_name: rawName, canonical_key: canonicalKey, created_by: currentUser, created_at: nowIso, updated_at: nowIso
        }, { onConflict: 'project_code,raw_name' });

        await window.supabaseClient.from('contractor_normalization_queue').update({
          status: 'linked', suggested_canonical_key: canonicalKey, admin_comment: 'Создан новый подрядчик', updated_at: nowIso
        }).eq('id', requestId);

        showToast(_t('quality.game.toast.contr_created', '✅ Создан новый подрядчик'));
      }
      // Логика: СВЯЗАТЬ С СУЩЕСТВУЮЩИМ (Алиас)
      else if (action.startsWith('link_')) {
        const targetCanonicalKey = action.replace('link_', '');

        // Добавляем синоним в базу
        await window.supabaseClient.from('contractor_aliases').upsert({
          project_code: pCode, raw_name: rawName, canonical_key: targetCanonicalKey, created_by: currentUser, created_at: nowIso, updated_at: nowIso
        }, { onConflict: 'project_code,raw_name' });

        await window.supabaseClient.from('contractor_normalization_queue').update({
          status: 'linked', suggested_canonical_key: targetCanonicalKey, admin_comment: 'Связан со справочником', updated_at: nowIso
        }).eq('id', requestId);

        showToast(_t('quality.game.toast.req_linked', '🔗 Заявка связана со справочником'));
      }
      // Логика: ОТКЛОНИТЬ
      else if (action === 'reject') {
        await window.supabaseClient.from('contractor_normalization_queue').update({
          status: 'rejected', admin_comment: 'Отклонено руководителем', updated_at: nowIso
        }).eq('id', requestId);
        showToast(_t('quality.game.toast.req_rejected', '❌ Заявка отклонена'));
      }

      // Обновляем исторические проверки и базу Стройконтроля в облаке (чтобы везде поменялось имя)
      if (action !== 'reject') {
        const finalCanonicalKey = action === 'create' ? req.suggested_canonical_key : action.replace('link_', '');
        const finalDisplayName = action === 'create' ? rawName : selectEl.options[selectEl.selectedIndex].text.replace('Связать с: ', '');

        await window.supabaseClient.from('sk_records')
          .update({ contractor_name: finalDisplayName, contractor_canonical_key: finalCanonicalKey, contractor_normalization_status: 'matched', updated_at: nowIso })
          .eq('project_code', pCode).eq('contractor_raw', rawName);
      }

      // Обновляем списки на экране
      if (typeof gameLoadContractorRequests === 'function') gameLoadContractorRequests();
      if (typeof gameLoadContractorDirectory === 'function') gameLoadContractorDirectory();
      if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('sk:renderRequested', { view: 'banner' });

      // Даем команду приложению подтянуть свежие данные
      localStorage.setItem('rbi_cloud_dirty', '1');
      _triggerSync('silent');

    } catch (e) {
      console.error('[gameResolveContractorRequest]', e);
      showToast(_t('quality.game.toast.req_err', '❌ Ошибка при обработке заявки'));
    }
  };

  // Перенесено из js/game.js (строка 3497).
  async function gameDeleteContractorRequest(requestId) {
    if (!window.supabaseClient) return showToast(_t('quality.game.toast.cloud_off', '❌ Облако не подключено'));

    if (!confirm(_t('quality.game.confirm.delete_req', 'Удалить заявку подрядчика из очереди?'))) return;

    try {
      const { error } = await window.supabaseClient
        .from('contractor_normalization_queue')
        .delete()
        .eq('id', requestId);

      if (error) throw error;

      showToast(_t('quality.game.toast.req_deleted', '🗑️ Заявка подрядчика удалена'));
      if (typeof gameLoadContractorRequests === 'function') gameLoadContractorRequests();
      if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('sk:renderRequested', { view: 'banner' });

    } catch (e) {
      console.error('[gameDeleteContractorRequest]', e);
      showToast(_t('quality.game.toast.req_delete_fail', '❌ Не удалось удалить заявку'));
    }
  };

  // === ПАНЕЛЬ РУКОВОДИТЕЛЯ: чипы закреплённых объектов ===
  // Перенесено из js/game.js (строка 3521).
  function gameAddAssignedProjectFromSelect(domId, objectRef) {
    if (!objectRef) return;
    const input = document.getElementById(`proj_input_${domId}`);
    if (!input) return;

    let projectsArray = [];
    try { projectsArray = JSON.parse(input.value || '[]'); } catch (e) { projectsArray = []; }

    let idToAdd = objectRef;
    var odAdd = _objects();
    if (odAdd && typeof odAdd.resolveProjectId === 'function') {
      const resolved = odAdd.resolveProjectId(objectRef);
      if (resolved) idToAdd = resolved;
    }
    if (odAdd && typeof odAdd.normalizeAssignedProjectsList === 'function') {
      projectsArray = odAdd.normalizeAssignedProjectsList(projectsArray.concat([idToAdd]));
    } else if (!projectsArray.includes(idToAdd)) {
      projectsArray.push(idToAdd);
    }

    input.value = JSON.stringify(projectsArray);
    gameRenderAssignedProjectChips(domId);
  };

  // Перенесено из js/game.js (строка 3537).
  function gameRemoveAssignedProjectChip(domId, objectRef) {
    const input = document.getElementById(`proj_input_${domId}`);
    if (!input) return;

    let projectsArray = [];
    try { projectsArray = JSON.parse(input.value || '[]'); } catch (e) { projectsArray = []; }

    var odRemove = _objects();
    const refClean = (odRemove && odRemove.cleanString)
      ? odRemove.cleanString(objectRef)
      : String(objectRef || '').toLowerCase().trim();
    const refId = (odRemove && typeof odRemove.resolveProjectId === 'function')
      ? odRemove.resolveProjectId(objectRef)
      : '';

    projectsArray = projectsArray.filter(v => {
      const s = String(v || '');
      if (s === objectRef || (refId && s === refId)) return false;
      if (odRemove && odRemove.cleanString
          && odRemove.cleanString(s) === refClean) return false;
      return true;
    });
    if (odRemove && typeof odRemove.normalizeAssignedProjectsList === 'function') {
      projectsArray = odRemove.normalizeAssignedProjectsList(projectsArray);
    }
    input.value = JSON.stringify(projectsArray);
    gameRenderAssignedProjectChips(domId);
  };

  // Перенесено из js/game.js (строка 3582).
  async function gameLoadRoles() {
    if (!window.supabaseClient) return showToast(_t('quality.game.toast.cloud_off_plain', 'Облако не подключено'));

    const pCode = window.syncConfig?.projectCode || 'RBI';

    const oldContainer = document.getElementById('manager-roles-list');
    const accessContainer = document.getElementById('manager-access-requests-list') || oldContainer;
    const teamContainer = document.getElementById('manager-team-list') || oldContainer;

    if (!accessContainer && !teamContainer) return;

    if (accessContainer) {
      accessContainer.innerHTML = '<div class="text-center py-4 text-rbi-caption text-muted animate-pulse">' + _t('quality.game.roles.loading_req', 'Загрузка заявок...') + '</div>';
    }

    if (teamContainer && teamContainer !== accessContainer) {
      teamContainer.innerHTML = '<div class="text-center py-4 text-rbi-caption text-muted animate-pulse">' + _t('quality.game.roles.loading_team', 'Загрузка команды...') + '</div>';
    }

    if (oldContainer && oldContainer !== accessContainer && oldContainer !== teamContainer) {
      oldContainer.innerHTML = '';
    }

    const esc = (v) => String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const escJs = (v) => String(v || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, ' ');

    const safeId = gameDomIdFromInspectorId;

    try {
      // 1. БЕРЕМ ОБЪЕКТЫ ИЗ ЛОКАЛЬНОГО СПРАВОЧНИКА (чтобы мгновенно видеть добавленные вручную)
      var odRoles = _objects();
      if (odRoles && typeof odRoles.init === 'function') {
        await odRoles.init(); // Убеждаемся, что кэш свежий
      }
      const projectObjects = _objectList().filter(o => !o._deleted && !o.is_deleted);

      // 2. Справочник подрядчиков для назначения роли contractor
      const { data: contractorDirectoryRaw, error: contrErr } = await window.supabaseClient
        .from('contractor_directory')
        .select('canonical_key, display_name, is_deleted')
        .eq('project_code', pCode)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('display_name', { ascending: true });

      if (contrErr) throw contrErr;

      const contractorDirectory = Array.isArray(contractorDirectoryRaw) ? contractorDirectoryRaw : [];

      // 3. Пользователи + settings, чтобы видеть заявки на объекты
      const { data, error } = await window.supabaseClient
        .from('rbi_engineer_profiles')
        .select('inspector_id, inspector_name, engineer_name, role, cloud_status, assigned_contractor, contractor_name, assigned_projects, settings, created_at')
        .eq('project_code', pCode)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const users = Array.isArray(data) ? data : [];

      if (users.length === 0) {
        if (accessContainer) accessContainer.innerHTML = '<div class="text-center py-4 text-rbi-caption text-muted">' + _t('quality.game.roles.no_req', 'Заявок на доступ нет') + '</div>';
        if (teamContainer) teamContainer.innerHTML = '<div class="text-center py-4 text-rbi-caption text-muted">' + _t('quality.game.roles.no_users', 'Активных пользователей нет') + '</div>';
        return;
      }

      const pendingUsers = users.filter(u => (u.cloud_status || 'pending') === 'pending');
      const activeUsers = users
        .filter(u => (u.cloud_status || 'pending') !== 'pending')
        .sort((a, b) => (a.engineer_name || a.inspector_name || '').localeCompare(b.engineer_name || b.inspector_name || ''));

      const renderUserRow = (user, mode = 'active') => {
        const inspectorId = user.inspector_id || '';
        const domId = safeId(inspectorId);
        const engineerName = user.engineer_name || user.inspector_name || 'Без имени';
        const role = user.role || 'guest';
        const cloudStatus = user.cloud_status || 'pending';

        const contrName =
          user.assigned_contractor ||
          user.contractor_name ||
          user.settings?.assignedContractor ||
          user.settings?.contractorName ||
          '';

        // Берём непустой источник (симметрично permission.service.js:getAssignedProjects()) —
        // пустой массив в колонке assigned_projects больше не блокирует fallback на
        // settings.assignedProjects, если тот реально содержит данные (было: админ видел
        // "объект не закреплён", хотя объект реально лежал во втором поле).
        const columnProjectsArr = Array.isArray(user.assigned_projects) ? user.assigned_projects : null;
        const settingsProjectsArr = Array.isArray(user.settings?.assignedProjects) ? user.settings.assignedProjects : null;
        const projectsArray = (columnProjectsArr && columnProjectsArr.length > 0)
          ? columnProjectsArr
          : (settingsProjectsArr && settingsProjectsArr.length > 0)
            ? settingsProjectsArr
            : (columnProjectsArr || settingsProjectsArr || []);

        // Подготавливаем JSON-массив объектов
        const projectsJsonStr = JSON.stringify(projectsArray).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

        const currentSettings = user.settings || {};
        const requestedProjects = Array.isArray(currentSettings.requestedProjects)
          ? currentSettings.requestedProjects.filter(r => r.source !== 'sk_import' && r.request_type !== 'directory')
          : [];

        let statusBadge = '';
        if (cloudStatus === 'pending') {
          statusBadge = '<span class="bg-yellow-100 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded text-rbi-caption font-black uppercase">' + _t('quality.game.roles.pending', 'Ожидает') + '</span>';
        } else if (cloudStatus === 'approved') {
          statusBadge = '<span class="bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded text-rbi-caption font-black uppercase">' + _t('quality.game.roles.active', 'Активен') + '</span>';
        } else {
          statusBadge = '<span class="bg-danger-soft text-danger border border-danger-soft px-1.5 py-0.5 rounded text-rbi-caption font-black uppercase">' + _t('quality.game.roles.blocked', 'Заблок.') + '</span>';
        }

        var _permSvc2 = (GameActions._ctx && GameActions._ctx.permissions) || window.RBI.services.permissions;
        const isNoObjectsRole = _permSvc2 ? _permSvc2.hasNoOwnObjects(role) : ['guest', 'director', 'deputy_manager', 'manager'].includes(role);
        const displayObjects = isNoObjectsRole ? 'none' : 'block';

        const requestedProjectsHtml = requestedProjects.length ? `
                <div class="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-2">
                    <div class="text-rbi-caption font-black text-orange-700 uppercase mb-2">
                        Заявки на объекты (${requestedProjects.length})
                    </div>

                    ${requestedProjects.map((req, idx) => {
                        // Заявка на снятие (пользователь нажал ✕ у себя в настройках,
                        // самостоятельное снятие запрещено — current_plan.md §8):
                        // отдельный, более простой select (нет смысла "связывать"/
                        // "создавать" объект, который и так уже назначен).
                        if (req.request_type === 'unassign') {
                            return `
                        <div class="mb-2 p-2 bg-white rounded-lg border border-orange-100">
                            <div class="text-rbi-caption font-black text-ink mb-1">
                                ⬅️ Снять объект: ${esc(req.raw_name || req.display_name || 'Без названия')}
                            </div>
                            <select id="req_action_${domId}_${idx}" class="input-base !py-1.5 !text-rbi-caption">
                                <option value="ignore">Оставить в ожидании</option>
                                <option value="unassign_confirm">Подтвердить снятие объекта</option>
                                <option value="reject">Отклонить (оставить объект)</option>
                            </select>
                        </div>
                    `;
                        }
                        return `
                        <div class="mb-2 p-2 bg-white rounded-lg border border-orange-100">
                            <div class="text-rbi-caption font-black text-ink mb-1">
                                ${esc(req.raw_name || req.display_name || 'Без названия')}
                            </div>

                            <select id="req_action_${domId}_${idx}" class="input-base !py-1.5 !text-rbi-caption">
                                <option value="ignore">Оставить в ожидании</option>
                                ${projectObjects.map(o => `
                                    <option value="link_${esc(o.id || o.canonical_key)}">
                                        Связать с: ${esc(o.display_name)}
                                    </option>
                                `).join('')}
                                <option value="create">Создать новый объект</option>
                                <option value="reject">Отклонить</option>
                            </select>
                        </div>
                    `;
                    }).join('')}
                </div>
            ` : '';

        var _permSvc3 = (GameActions._ctx && GameActions._ctx.permissions) || (window.RBI && window.RBI.services && window.RBI.services.permissions);
        const roleLabels = _permSvc3
            ? _permSvc3.getAllRoles().reduce(function (acc, r) { acc[r.key] = r.label; return acc; }, {})
            : {};
        const roleDisplay = roleLabels[role] || role;
        const isPending = cloudStatus === 'pending';
        const avatarColor = isPending ? 'orange' : 'indigo';

        return `
                <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl mb-2 shadow-sm group [&_summary::-webkit-details-marker]:hidden" id="user_card_${domId}" ${isPending ? 'open' : ''}>
                    
                    <!-- СВЕРНУТЫЙ ВИД (КЛЮЧЕВАЯ ИНФО) -->
                    <summary class="p-2 sm:p-3 cursor-pointer flex justify-between items-center transition-colors select-none group-open:border-b border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--hover-bg)] rounded-xl group-open:rounded-b-none">
                        <div class="flex items-center gap-3 min-w-0 pr-2">
                            <div class="w-8 h-8 rounded-lg bg-${avatarColor}-50 dark:bg-${avatarColor}-900/30 text-${avatarColor}-600 dark:text-${avatarColor}-400 flex items-center justify-center font-black text-sm shrink-0 border border-${avatarColor}-100 dark:border-${avatarColor}-800 shadow-sm">
                                ${engineerName.charAt(0).toUpperCase()}
                            </div>
                            <div class="min-w-0 flex flex-col justify-center">
                                <div class="font-black text-rbi-label sm:text-rbi-body text-ink dark:text-white uppercase truncate leading-tight">${esc(engineerName)}</div>
                                <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <span class="text-rbi-caption font-black uppercase px-1.5 py-0.5 rounded border border-surface bg-surface text-muted leading-none">${roleDisplay}</span>
                                    ${statusBadge}
                                </div>
                            </div>
                        </div>
                        <div class="shrink-0 text-muted transition-transform duration-300 group-open:rotate-180 bg-surface p-1.5 rounded-full border border-surface">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </summary>

                    <!-- РАЗВЕРНУТЫЙ ВИД (ФОРМА РЕДАКТИРОВАНИЯ) -->
                    <div class="p-3 bg-[var(--hover-bg)] rounded-b-xl">
                        
                        <!-- Селекты (в ряд) -->
                        <div class="grid grid-cols-2 gap-2 mb-2">
                            <div class="bg-[var(--card-bg)] p-2 rounded-lg border border-[var(--card-border)] shadow-sm">
                                <label class="text-rbi-caption font-bold text-muted uppercase mb-1 block">${_t('quality.game.roles.role_label', 'Роль сотрудника')}</label>
                                <select id="role_select_${domId}" class="input-base !py-1 !px-1.5 !text-rbi-caption font-bold" onchange="
                                    const r = this.value;
                                    const objBlock = document.getElementById('obj_block_${domId}');
                                    const _p = (window.GameActions && window.GameActions._ctx && window.GameActions._ctx.permissions) || window.RBI.services.permissions;
                                    if(_p ? _p.hasNoOwnObjects(r) : ['guest', 'director', 'deputy_manager', 'manager'].includes(r)) {
                                        objBlock.style.display = 'none';
                                    } else {
                                        objBlock.style.display = 'block';
                                    }
                                ">
                                    ${(function () {
                                        var _p = (GameActions._ctx && GameActions._ctx.permissions) || (window.RBI && window.RBI.services && window.RBI.services.permissions);
                                        return _p ? _p.getAllRoles() : [];
                                    })().map(r => `
                                        <option value="${esc(r.key)}" ${role === r.key ? 'selected' : ''}>${esc(r.label)}</option>
                                    `).join('')}
                                </select>
                            </div>

                            <div class="bg-[var(--card-bg)] p-2 rounded-lg border border-[var(--card-border)] shadow-sm">
                                <label class="text-rbi-caption font-bold text-muted uppercase mb-1 block">${_t('quality.game.roles.cloud_access', 'Доступ к облаку')}</label>
                                <select id="status_select_${domId}" class="input-base !py-1 !px-1.5 !text-rbi-caption font-bold">
                                    <option value="pending" ${cloudStatus === 'pending' ? 'selected' : ''}>${_t('quality.game.roles.opt.pending', 'Ожидает')}</option>
                                    <option value="approved" ${cloudStatus === 'approved' ? 'selected' : ''}>${_t('quality.game.roles.opt.approved', 'Разрешён')}</option>
                                    <option value="blocked" ${cloudStatus === 'blocked' ? 'selected' : ''}>${_t('quality.game.roles.opt.blocked', 'Заблокирован')}</option>
                                </select>
                            </div>
                        </div>

                        <div class="bg-[var(--card-bg)] p-2 rounded-lg border border-[var(--card-border)] mb-2 shadow-sm">
                            <label class="text-rbi-caption font-bold text-muted uppercase mb-1 block flex justify-between">
                                <span>${_t('quality.game.roles.contr_bind', 'Привязка к подрядчику')}</span>
                                <span class="text-rbi-caption text-muted font-normal lowercase">${_t('quality.game.roles.contr_hint', '(для роли "Подрядчик")')}</span>
                            </label>
                            <select id="contr_input_${domId}" class="input-base !py-1.5 !text-rbi-caption">
                                <option value="">${_t('quality.game.roles.unassigned', '— Не назначен —')}</option>
                                ${contractorDirectory.map(c => `<option value="${esc(c.canonical_key)}" data-display="${esc(c.display_name)}" ${contrName === c.canonical_key || contrName === c.display_name ? 'selected' : ''}>${esc(c.display_name)}</option>`).join('')}
                            </select>
                        </div>

                        <div id="obj_block_${domId}" style="display: ${displayObjects};" class="bg-brand-soft/10 p-2 rounded-lg border border-brand-soft/50 mb-2 shadow-sm">
                            <div class="flex justify-between items-center mb-1.5">
                                <label class="text-rbi-caption font-black text-brand uppercase block">${_t('quality.game.roles.assigned_objs', 'Закреплённые объекты')}</label>
                                <button onclick="document.getElementById('proj_input_${domId}').value=''; gameRenderAssignedProjectChips('${domId}')" class="text-rbi-caption text-danger font-bold hover:underline">${_t('quality.game.roles.clear_all', 'Очистить всё')}</button>
                            </div>
                            <input type="hidden" id="proj_input_${domId}" value="${projectsJsonStr}">
                            <select class="input-base !py-1.5 !text-rbi-caption mb-2 bg-surface" onchange="gameAddAssignedProjectFromSelect('${domId}', this.value); this.value='';">
                                <option value="">${_t('quality.game.roles.add_obj', '+ Добавить объект из справочника')}</option>
                                ${projectObjects.map(o => `<option value="${esc(o.id || o.canonical_key)}">${esc(o.display_name)}</option>`).join('')}
                            </select>
                            <div id="proj_chips_${domId}" class="flex flex-wrap gap-1"></div>
                        </div>

                        ${requestedProjectsHtml}

                        <!-- Кнопки управления -->
                        
                        <div class="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[var(--card-border)]">
                            <button onclick="gameHandleUserAccessRemove('${escJs(inspectorId)}', '${escJs(engineerName)}', '${escJs(cloudStatus || '')}', '${escJs(role || '')}')" class="bg-danger-soft text-danger border border-danger-soft py-2.5 rounded-lg text-rbi-caption font-black uppercase active:scale-95 transition-transform flex items-center justify-center gap-1.5 shadow-sm">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
    ${cloudStatus === 'approved' ? 'Заблокировать' : 'Удалить заявку'}
</button>
                            <button onclick="gameSaveUserAccess('${escJs(inspectorId)}', '${escJs(engineerName)}')" class="bg-brand text-white py-2.5 rounded-lg text-rbi-caption font-black uppercase shadow-md active:scale-95 transition-transform flex items-center justify-center gap-1.5">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg> Сохранить
                            </button>
                        </div>
                    </div>
                </details>
            `;
      };

      // Сводка ВСЕХ pending-заявок на объекты (в т.ч. у уже approved инженеров)
      const objectRequestRows = [];
      users.forEach((u) => {
        const reqs = Array.isArray(u.settings?.requestedProjects) ? u.settings.requestedProjects : [];
        const filtered = reqs.filter(r => r && r.source !== 'sk_import' && r.request_type !== 'directory');
        filtered.forEach((req) => {
          objectRequestRows.push({
            engineer: u.engineer_name || u.inspector_name || 'Без имени',
            inspectorId: u.inspector_id || '',
            cloudStatus: u.cloud_status || 'pending',
            raw: req.raw_name || req.display_name || 'Без названия',
            type: req.request_type || 'assign'
          });
        });
      });

      let summaryHtml = '';
      if (objectRequestRows.length > 0) {
        summaryHtml = `
            <div class="mb-3 bg-orange-50 border border-orange-200 rounded-xl p-3 shadow-sm">
              <div class="text-rbi-caption font-black text-orange-800 uppercase tracking-wide mb-2">
                Заявки на объекты (${objectRequestRows.length}) — откройте карточку инженера ниже и обработайте
              </div>
              <div class="space-y-1 max-h-40 overflow-y-auto">
                ${objectRequestRows.map(r => `
                  <div class="text-rbi-caption text-ink flex gap-2 items-start">
                    <span class="font-black shrink-0">${esc(r.engineer)}</span>
                    <span class="text-muted">${r.type === 'unassign' ? '⬅️ снять' : '➡️ доступ'}</span>
                    <span class="font-bold">${esc(r.raw)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
      }

      if (accessContainer) {
        if (pendingUsers.length > 0) {
          accessContainer.innerHTML = summaryHtml + pendingUsers.map(u => renderUserRow(u, 'pending')).join('');
        } else {
          accessContainer.innerHTML = summaryHtml
            || '<div class="text-center py-4 text-rbi-caption text-muted">Заявок на доступ нет</div>';
          if (summaryHtml && pendingUsers.length === 0) {
            accessContainer.innerHTML = summaryHtml
              + '<div class="text-center py-2 text-rbi-caption text-muted">Заявок на доступ в облако нет — есть заявки на объекты у активных (см. Команда)</div>';
          }
        }
      }

      if (teamContainer) {
        if (activeUsers.length > 0) {
          teamContainer.innerHTML = summaryHtml + activeUsers.map(u => renderUserRow(u, 'active')).join('');
        } else {
          teamContainer.innerHTML = summaryHtml
            || '<div class="text-center py-4 text-rbi-caption text-muted">Активных пользователей нет</div>';
        }
      }

      users.forEach(user => {
        const domId = safeId(user.inspector_id || '');
        if (typeof gameRenderAssignedProjectChips === 'function') {
          gameRenderAssignedProjectChips(domId);
        }
      });

    } catch (e) {
      console.error('[gameLoadRoles]', e);

      if (accessContainer) {
        accessContainer.innerHTML = '<div class="text-center py-4 text-xs text-danger font-bold">' + _t('quality.game.roles.err_req', 'Ошибка загрузки заявок') + '</div>';
      }

      if (teamContainer && teamContainer !== accessContainer) {
        teamContainer.innerHTML = '<div class="text-center py-4 text-xs text-danger font-bold">' + _t('quality.game.roles.err_team', 'Ошибка загрузки команды') + '</div>';
      }
    }
  };

  // Перенесено из js/game.js (строка 3869).
  async function gameHandleUserAccessRemove(inspectorId, engineerName, cloudStatus, role) {
    if (!window.supabaseClient) return showToast(_t('quality.game.toast.cloud_off', '❌ Облако не подключено'));

    const status = String(cloudStatus || '').toLowerCase();
    const userRole = String(role || '').toLowerCase();

    // Если пользователь уже подтвержден — не удаляем, а блокируем.
    // Это важно для истории, RLS и связи с auth_user_id.
    if (status === 'approved') {
      return gameBlockUserAccess(inspectorId, engineerName);
    }

    // Pending / guest / blocked можно удалить из списка заявок.
    return gameDeleteUserAccess(inspectorId, engineerName);
  };

  // Перенесено из js/game.js (строка 3885).
  async function gameBlockUserAccess(inspectorId, engineerName) {
    if (!window.supabaseClient) return showToast(_t('quality.game.toast.cloud_off', '❌ Облако не подключено'));

    if (!confirm(_t('quality.game.confirm.block_user', 'Заблокировать доступ пользователя "{name}"? Пользователь останется в базе, но не сможет получать рабочие данные.', { name: engineerName }))) return;

    try {
      const nowIso = new Date().toISOString();

      // Единая точка записи (permission.service.js) — обновляет ОБА поля
      // профиля (assigned_projects + settings.assignedProjects) синхронно,
      // здесь всегда в []. Раньше settings.assignedProjects при блокировке
      // не трогалось и оставалось со старым значением (см. current_plan.md §2).
      var _permSvcBlock = (GameActions._ctx && GameActions._ctx.permissions) || window.RBI.services.permissions;
      const { error } = await _permSvcBlock.writeUserProjectAssignment(
        inspectorId,
        [],
        {
          role: 'guest',
          cloud_status: 'blocked',
          assigned_contractor: '',
          contractor_name: '',
          last_seen_at: nowIso
        },
        {
          blocked_at: nowIso,
          blocked_reason: 'blocked_by_admin'
        }
      );

      if (error) throw error;

      showToast(_t('quality.game.toast.user_blocked', '⛔ Пользователь заблокирован'));

      if (typeof gameLoadRoles === 'function') {
        gameLoadRoles();
      }
    } catch (e) {
      console.error('[gameBlockUserAccess]', e);
      showToast(_t('quality.game.toast.block_fail', '❌ Не удалось заблокировать пользователя'));
    }
  };

  // Перенесено из js/game.js (строка 3938).
  async function gameDeleteUserAccess(inspectorId, engineerName) {
    if (!window.supabaseClient) return showToast(_t('quality.game.toast.cloud_off', '❌ Облако не подключено'));

    if (!confirm(_t('quality.game.confirm.delete_user', 'Удалить заявку/профиль "{name}" из списка? Если пользователь снова войдёт в приложение, заявка создастся заново.', { name: engineerName }))) return;

    try {
      const { error } = await window.supabaseClient
        .from('rbi_engineer_profiles')
        .delete()
        .eq('inspector_id', inspectorId);

      if (error) throw error;

      showToast(_t('quality.game.toast.user_req_deleted', '🗑️ Заявка удалена'));

      if (typeof gameLoadRoles === 'function') {
        gameLoadRoles();
      }
    } catch (e) {
      console.error('[gameDeleteUserAccess]', e);
      showToast(_t('quality.game.toast.req_delete_fail', '❌ Не удалось удалить заявку'));
    }
  };

  // Перенесено из js/game.js (строка 3964).
  async function gameSaveUserAccess(inspectorId, engineerName) {
    if (!window.supabaseClient) return showToast(_t('quality.game.toast.cloud_off', '❌ Облако не подключено'));

    const domId = gameDomIdFromInspectorId(inspectorId);

    const role = document.getElementById(`role_select_${domId}`)?.value || 'guest';
    const cloudStatus = document.getElementById(`status_select_${domId}`)?.value || 'pending';
    const contrSelect = document.getElementById(`contr_input_${domId}`);
    const contr = contrSelect?.value?.trim() || '';
    const contrDisplay = contrSelect?.selectedOptions?.[0]?.dataset?.display || contr;
    const inputEl = document.getElementById(`proj_input_${domId}`);
    let projectsArray = [];

    if (inputEl) {
      try {
        projectsArray = JSON.parse(inputEl.value || '[]');
      } catch (e) {
        projectsArray = [];
      }
    }

    // Если роль не требует объектов, очищаем массив
    var _permSvc4 = (GameActions._ctx && GameActions._ctx.permissions) || window.RBI.services.permissions;
    const isNoObjectsRole = _permSvc4 ? _permSvc4.hasNoOwnObjects(role) : ['guest', 'director', 'deputy_manager', 'manager'].includes(role);
    if (isNoObjectsRole) projectsArray = [];

    if (role === 'contractor' && !contr) {
      return showToast(_t('quality.game.toast.contr_org_required', '⚠️ Для подрядчика обязательно укажите организацию!'));
    }

    showToast(_t('quality.game.toast.saving_cloud', '⏳ Сохранение в облако...'));

    try {
      const { data: userData, error: userError } = await window.supabaseClient
        .from('rbi_engineer_profiles')
        .select('settings, project_code')
        .eq('inspector_id', inspectorId)
        .single();

      if (userError) throw userError;

      let currentSettings = userData?.settings || {};
      const projectCode = userData?.project_code || window.syncConfig?.projectCode || 'RBI';

      let requestedProjects = Array.isArray(currentSettings.requestedProjects)
        ? currentSettings.requestedProjects.filter(r =>
          r.source !== 'sk_import' &&
          r.request_type !== 'directory'
        )
        : [];
      let remainingRequests = [];

      for (let i = 0; i < requestedProjects.length; i++) {
        const req = requestedProjects[i];
        const actionSelect = document.getElementById(`req_action_${domId}_${i}`);
        const action = actionSelect ? actionSelect.value : 'ignore';

        if (action === 'ignore') {
          remainingRequests.push(req);
          continue;
        }

        if (action === 'reject') {
          continue; // Просто пропускаем, она не попадет в remainingRequests
        }

        if (req.request_type === 'unassign' && action === 'unassign_confirm') {
          // Подтверждение заявки на снятие объекта (self-service снятие
          // запрещено — current_plan.md §8): реально убираем id/canonical
          // из массива, который ниже пойдёт в writeUserProjectAssignment.
          const keyToRemove = req.canonical_key || req.raw_name;
          var odUnassign = _objects();
          const idToRemove = (odUnassign && typeof odUnassign.resolveProjectId === 'function')
            ? (odUnassign.resolveProjectId(req.projectId || keyToRemove) || keyToRemove)
            : keyToRemove;
          projectsArray = projectsArray.filter(p => {
            const s = String(p || '');
            if (s === keyToRemove || s === idToRemove) return false;
            if (odUnassign && odUnassign.cleanString
                && odUnassign.cleanString(s) === odUnassign.cleanString(keyToRemove)) return false;
            return true;
          });
          continue;
        }

        if (action.startsWith('link_')) {
          // Привязка к существующему объекту (UUID или canonical)
          const linkRef = action.replace('link_', '');
          let projectId = linkRef;
          var odLink = _objects();
          if (odLink && typeof odLink.resolveProjectId === 'function') {
            projectId = odLink.resolveProjectId(linkRef) || linkRef;
          }
          if (!projectsArray.includes(projectId)) projectsArray.push(projectId);

          // Сохраняем как синоним + merge spelling
          if (req.raw_name && odLink
              && typeof odLink.mergeRawNameIntoObject === 'function') {
            try {
              await odLink.mergeRawNameIntoObject(req.raw_name, projectId);
            } catch (mergeErr) {
              console.warn('[gameSaveUserAccess] merge synonym', mergeErr);
            }
          } else if (req.raw_name && req.raw_name !== linkRef) {
            const localObjs = await _storage().getAll('project_objects') || [];
            const targetObj = localObjs.find(o =>
              (o.id === projectId || o.canonical_key === linkRef) && o.project_code === projectCode
            );

            if (targetObj) {
              const oldSynonyms = Array.isArray(targetObj.synonyms) ? targetObj.synonyms : [];
              if (!oldSynonyms.includes(req.raw_name)) {
                targetObj.synonyms.push(req.raw_name);
                targetObj.updated_at = new Date().toISOString();
                targetObj.sync_status = 'not_synced';
                targetObj.source = 'local';
                await _storage().put('project_objects', targetObj);
              }
            }
          }
          continue;
        }

        if (action === 'create') {
          // Создание нового объекта через locations (UUID) + synonym из raw
          let createdId = '';
          var odCreate = _objects();
          if (odCreate && typeof odCreate.createFromLocation === 'function') {
            const created = await odCreate.createFromLocation({
              displayName: req.raw_name,
              canonical_key: (typeof odCreate.cleanString === 'function')
                ? odCreate.cleanString(req.raw_name)
                : String(req.raw_name || '').toLowerCase().trim()
            });
            createdId = created && created.id ? String(created.id) : '';
            if (req.raw_name && createdId && typeof odCreate.mergeRawNameIntoObject === 'function') {
              try { await odCreate.mergeRawNameIntoObject(req.raw_name, createdId); } catch (_e) { /* ignore */ }
            }
          }
          if (!createdId) {
            const newKey = odCreate && typeof odCreate.cleanString === 'function'
              ? odCreate.cleanString(req.raw_name)
              : req.raw_name.toLowerCase().replace(/\s+/g, '_');
            createdId = newKey;
          }
          if (!projectsArray.includes(createdId)) projectsArray.push(createdId);
        }
      }

      var odNorm = _objects();
      if (odNorm && typeof odNorm.normalizeAssignedProjectsList === 'function') {
        projectsArray = odNorm.normalizeAssignedProjectsList(projectsArray);
      }

      // Единая точка записи (permission.service.js) — обновляет ОБА поля
      // профиля (assigned_projects + settings.assignedProjects) синхронно,
      // вместо прежнего прямого update(), который писал колонку и settings
      // раздельно, но был единственным путём, где оба поля совпадали (см.
      // current_plan.md §2 — здесь расхождения не было, но теперь это одна
      // точка правды на все 3 пути записи: gameSaveUserAccess/gameBlockUserAccess/
      // resolveRequest).
      var _permSvcSave = (GameActions._ctx && GameActions._ctx.permissions) || window.RBI.services.permissions;
      const { error } = await _permSvcSave.writeUserProjectAssignment(
        inspectorId,
        projectsArray,
        {
          role: role,
          cloud_status: cloudStatus,
          assigned_contractor: contr,
          contractor_name: contrDisplay
        },
        {
          requestedProjects: remainingRequests,
          role: role,
          cloudStatus: cloudStatus,
          assignedContractor: contr,
          contractorName: contr
        }
      );

      if (error) throw error;

      // Если правим текущего пользователя на этом устройстве — сразу чистим локаль
      // от объектов вне нового списка assigned.
      try {
        const myId = window.syncConfig && window.syncConfig.projectCode && window.syncConfig.engineerName
          ? `${window.syncConfig.projectCode}_${window.syncConfig.engineerName}`.replace(/\s+/g, '_')
          : '';
        if (myId && myId === inspectorId && typeof window.purgeDataOutsideAssignedProjects === 'function') {
          if (typeof appSettings !== 'undefined') {
            appSettings.assignedProjects = projectsArray;
            appSettings.assigned_projects = projectsArray;
          }
          await window.purgeDataOutsideAssignedProjects(projectsArray);
        }
      } catch (purgeErr) {
        console.warn('[gameSaveUserAccess] purge', purgeErr);
      }

      showToast(_t('quality.game.toast.rights_saved', '✅ Права успешно сохранены!'));
      localStorage.setItem('rbi_cloud_dirty', '1');
      _triggerSync('silent');
      if (typeof gameLoadRoles === 'function') {
        gameLoadRoles(); // Полностью перерисовываем список в новом дизайне
      }

    } catch (e) {
      console.error('[gameSaveUserAccess]', e);
      showToast(_t('quality.game.toast.rights_err', '❌ Ошибка сохранения прав'));
    }
  };

  // ==========================================
  // УПРАВЛЕНИЕ БАЗОЙ ЗНАНИЙ AI-ПОМОЩНИКА
  // ==========================================

  // Перенесено из js/game.js (строка 4125).
  async function gameLoadAiKb() {
    const container = document.getElementById('manager-ai-kb-list');
    const searchInput = document.getElementById('admin-ai-search')?.value.toLowerCase() || '';
    if (!container) return;

    try {
      const kbItems = await _storage().getAll('app_assistant_kb') || window.appAssistantData || [];
      let activeItems = kbItems.filter(i => !i._deleted && !i.is_deleted);

      // Фильтрация поиска
      if (searchInput) {
        activeItems = activeItems.filter(i =>
          (i.question && i.question.toLowerCase().includes(searchInput)) ||
          (i.answer && i.answer.toLowerCase().includes(searchInput))
        );
      }

      if (activeItems.length === 0) {
        container.innerHTML = '<div class="text-center py-6 text-muted text-rbi-caption font-bold uppercase bg-surface rounded-xl border border-dashed border-surface">' + _t('quality.game.aikb.empty', 'База знаний пуста или ничего не найдено') + '</div>';
        return;
      }

      // Сортировка: новые сверху
      activeItems.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      container.innerHTML = activeItems.map(item => {
        // Обрезаем длинный текст для превью (ОПТИМИЗАЦИЯ!)
        const shortAnswer = item.answer.length > 120 ? item.answer.substring(0, 120) + '...' : item.answer;
        return `
            <div class="bg-surface border border-surface rounded-xl p-3 shadow-sm mb-3">
                <div class="flex justify-between items-start mb-2 border-b border-surface pb-2">
                    <div class="font-black text-rbi-body text-ink dark:text-white leading-tight pr-2 flex-1">📌 ${item.question}</div>
                    <div class="flex gap-1.5 shrink-0">
                        <button onclick="gameOpenAiKbModal('${item.id}')" class="text-rbi-caption font-bold text-brand bg-brand-soft px-2 py-1 rounded border border-brand-soft active:scale-95 shadow-sm">${_t('quality.game.aikb.edit_btn', 'Изменить')}</button>
                        <button onclick="gameDeleteAiKb('${item.id}')" class="text-rbi-caption font-bold text-danger bg-danger-soft px-2 py-1 rounded border border-danger-soft active:scale-95 shadow-sm">${_t('quality.game.aikb.del_btn', 'Удалить')}</button>
                    </div>
                </div>
                <div class="text-rbi-label text-muted leading-relaxed font-medium">${shortAnswer}</div>
                ${item.tags && item.tags.length > 0 ? `<div class="mt-2 flex gap-1 flex-wrap">${item.tags.map(t => `<span class="bg-surface text-muted px-1.5 py-0.5 rounded text-rbi-caption font-black uppercase">${t}</span>`).join('')}</div>` : ''}
            </div>
            `;
      }).join('');
    } catch (e) {
      container.innerHTML = '<div class="text-center py-4 text-danger font-bold text-xs">' + _t('quality.game.aikb.load_err', 'Ошибка загрузки базы') + '</div>';
    }
  };

  // Перенесено из js/game.js (строка 4218).
  async function gameSaveAiKb(editId) {
    const q = document.getElementById('ai-kb-q').value.trim();
    const a = document.getElementById('ai-kb-a').value.trim();
    const tagsStr = document.getElementById('ai-kb-tags').value.trim();

    if (!q || !a) return showToast(_t('quality.game.toast.aikb_fill', '⚠️ Заполните вопрос и ответ!'));

    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    const record = {
      id: editId || 'kb_' + Date.now().toString(36),
      project_code: window.syncConfig?.projectCode || 'local',
      question: q,
      answer: a,
      tags: tags,
      enabled: true,
      created_by: window.syncConfig?.engineerName || 'Admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _deleted: false,
      source: 'local',
      sync_status: 'not_synced'
    };

    // Сохраняем локально и даем флаг синхронизатору
    await _storage().put('app_assistant_kb', record);
    localStorage.setItem('rbi_cloud_dirty', '1');
    _triggerSync('silent');

    document.getElementById('ai-kb-modal').remove();
    showToast(_t('quality.game.toast.aikb_updated', '✅ База знаний обновлена'));
    gameLoadAiKb();
  };

  // Перенесено из js/game.js (строка 4252).
  async function gameDeleteAiKb(id) {
    if (!confirm(_t('quality.game.confirm.aikb_delete', 'Удалить эту запись из базы ИИ?'))) return;

    const record = await _storage().get('app_assistant_kb', id);
    if (record) {
      record._deleted = true;
      record.is_deleted = true;
      record.updated_at = new Date().toISOString();
      record.sync_status = 'not_synced';
      await _storage().put('app_assistant_kb', record);

      localStorage.setItem('rbi_cloud_dirty', '1');
      _triggerSync('silent');

      showToast(_t('quality.game.toast.aikb_deleted', '🗑️ Запись удалена'));
      gameLoadAiKb();
    }
  };

  // === ПАНЕЛЬ РУКОВОДИТЕЛЯ: Умный поиск дубликатов подрядчиков ===
  // Перенесено из js/game.js (строка 4272).
  async function gameFindContractorDuplicates() {
    if (!window.supabaseClient) return showToast(_t('quality.game.toast.cloud_off', '❌ Облако не подключено'));

    showToast(_t('quality.game.toast.searching_dups', '⏳ Нейросеть ищет дубликаты...'));

    try {
      const pCode = window.syncConfig?.projectCode || 'RBI';

      // 1. Загружаем весь справочник
      const { data: directory, error } = await window.supabaseClient
        .from('contractor_directory')
        .select('*')
        .eq('project_code', pCode)
        .or('is_deleted.is.null,is_deleted.eq.false');

      if (error) throw error;

      if (!directory || directory.length < 2) {
        return showToast(_t('quality.game.toast.too_few_for_dups', 'В справочнике слишком мало записей для поиска дублей'));
      }

      // 2. Функция расчета схожести (Левенштейн)
      const getSimilarity = (s1, s2) => {
        if (!s1 || !s2) return 0;
        let longer = s1.toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
        let shorter = s2.toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
        if (longer.length < shorter.length) { [longer, shorter] = [shorter, longer]; }
        if (longer.length === 0) return 1.0;

        let costs = [];
        for (let i = 0; i <= shorter.length; i++) costs[i] = i;
        for (let i = 1; i <= longer.length; i++) {
          let costsTemp = costs[0]; costs[0] = i; let nw = i - 1;
          for (let j = 1; j <= shorter.length; j++) {
            let cj = Math.min(1 + Math.min(costs[j], costs[j - 1]), shorter[j - 1] === longer[i - 1] ? nw : nw + 1);
            nw = costs[j]; costs[j] = cj;
          }
        }
        return (longer.length - costs[shorter.length]) / parseFloat(longer.length);
      };

      const duplicates = [];
      const processedPairs = new Set();

      // 3. Сравниваем всех со всеми
      for (let i = 0; i < directory.length; i++) {
        for (let j = i + 1; j < directory.length; j++) {
          const c1 = directory[i];
          const c2 = directory[j];

          const score = getSimilarity(c1.display_name, c2.display_name);

          // Если сходство больше 80%
          if (score > 0.80) {
            const pairKey = `${c1.canonical_key}_${c2.canonical_key}`;
            if (!processedPairs.has(pairKey)) {
              processedPairs.add(pairKey);
              duplicates.push({ c1, c2, score: Math.round(score * 100) });
            }
          }
        }
      }

      if (duplicates.length === 0) {
        return showToast(_t('quality.game.toast.no_dups', '✅ Дубликатов не найдено! База чистая.'));
      }

      // 4. Отрисовываем модалку с результатами
      let html = duplicates.map((d, idx) => {
        // ОЧИСТКА: Убираем любые кавычки из названий, чтобы они не ломали код кнопок
        const safeName1 = d.c1.display_name.replace(/['"«»]/g, '');
        const safeName2 = d.c2.display_name.replace(/['"«»]/g, '');

        return `
            <div id="dup-row-${idx}" class="bg-surface border border-surface p-3 rounded-xl mb-3 shadow-sm">
                <div class="text-rbi-caption text-center font-black text-brand uppercase mb-2">${_t('quality.game.dups.match', 'Совпадение: {n}%', { n: d.score })}</div>
                <div class="flex items-center gap-2 mb-3">
                    <div class="flex-1 bg-surface p-2 rounded-lg border border-surface text-center">
                        <div class="text-rbi-label font-black text-ink dark:text-white leading-tight">${d.c1.display_name}</div>
                    </div>
                    <div class="text-muted font-bold">VS</div>
                    <div class="flex-1 bg-surface p-2 rounded-lg border border-surface text-center">
                        <div class="text-rbi-label font-black text-ink dark:text-white leading-tight">${d.c2.display_name}</div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="gameExecuteContractorMerge('${d.c1.canonical_key}', '${d.c2.canonical_key}', '${safeName2}', 'dup-row-${idx}')" class="flex-1 bg-brand-soft text-brand border border-brand-soft py-2 rounded-lg text-rbi-caption font-black uppercase active:scale-95 transition-colors">Влить правое в Левое ⬅️</button>
                    <button onclick="gameExecuteContractorMerge('${d.c2.canonical_key}', '${d.c1.canonical_key}', '${safeName1}', 'dup-row-${idx}')" class="flex-1 bg-brand-soft text-brand border border-brand-soft py-2 rounded-lg text-rbi-caption font-black uppercase active:scale-95 transition-colors">➡️ Влить левое в Правое</button>
                </div>
            </div>
            `;
      }).join('');

      const modalHtml = `
            <div id="dup-modal-overlay" class="fixed inset-0 bg-slate-900/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
                <div class="bg-[var(--card-bg)] w-full max-w-md rounded-2xl shadow-2xl border border-[var(--card-border)] overflow-hidden flex flex-col max-h-[85vh]">
                    <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center bg-[var(--hover-bg)] shrink-0">
                        <h3 class="font-black text-rbi-body uppercase tracking-tight text-ink dark:text-white flex items-center gap-2">${_t('quality.game.dups.title', '🤖 Слияние дубликатов')}</h3>
                        <button onclick="document.getElementById('dup-modal-overlay').remove(); document.body.classList.remove('modal-open');" class="w-8 h-8 bg-surface rounded-full flex items-center justify-center text-muted active:scale-90 shadow-sm border border-surface">✕</button>
                    </div>
                    <div class="p-4 overflow-y-auto custom-scrollbar flex-1 bg-surface/50">
                        <div class="text-rbi-caption text-muted mb-4 text-center leading-relaxed">
                            ${_t('quality.game.dups.desc', 'Выберите, какое название правильное. Неправильное будет удалено, а его имя добавится как синоним к правильному. История объединится автоматически.')}
                        </div>
                        ${html}
                    </div>
                </div>
            </div>
        `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      document.body.classList.add('modal-open');

    } catch (e) {
      console.error(e);
      showToast(_t('quality.game.toast.dups_err', '❌ Ошибка при поиске дубликатов'));
    }
  };

  // === Логика объединения двух записей ===
  // Перенесено из js/game.js (строка 4391).
  async function gameExecuteContractorMerge(primaryKey, secondaryKey, secondaryName, rowId) {
    if (!confirm(_t('quality.game.confirm.merge', 'Точно объединить?\n\nПодрядчик "{name}" исчезнет, став синонимом. Это необратимо.', { name: secondaryName }))) return;

    showToast(_t('quality.game.toast.merging', '⏳ Слияние баз данных...'));
    try {
      const pCode = window.syncConfig?.projectCode || 'RBI';
      const currentUser = window.syncConfig?.engineerName || 'Админ';
      const nowIso = new Date().toISOString();

      // 1. Получаем основного подрядчика, чтобы добавить к нему синоним
      const { data: primaryData } = await window.supabaseClient
        .from('contractor_directory')
        .select('synonyms, display_name')
        .eq('project_code', pCode)
        .eq('canonical_key', primaryKey)
        .single();

      let newSynonyms = Array.isArray(primaryData?.synonyms) ? primaryData.synonyms : [];
      if (!newSynonyms.includes(secondaryName)) newSynonyms.push(secondaryName);

      // 2. Обновляем Основного (добавляем синоним)
      await window.supabaseClient
        .from('contractor_directory')
        .update({ synonyms: newSynonyms, updated_at: nowIso })
        .eq('project_code', pCode)
        .eq('canonical_key', primaryKey);

      // 3. Удаляем Второстепенного (Мягкое удаление)
      await window.supabaseClient
        .from('contractor_directory')
        .update({ is_deleted: true, updated_at: nowIso })
        .eq('project_code', pCode)
        .eq('canonical_key', secondaryKey);

      // 4. Добавляем Второстепенное имя в таблицу Алиасов, чтобы он переадресовывал на Основного
      await window.supabaseClient.from('contractor_aliases').upsert({
        project_code: pCode, raw_name: secondaryName, canonical_key: primaryKey, created_by: currentUser, created_at: nowIso, updated_at: nowIso
      }, { onConflict: 'project_code,raw_name' });

      // 5. Обновляем историю ПК СК (переписываем все старые дефекты на новое имя)
      await window.supabaseClient.from('sk_records')
        .update({ contractor_name: primaryData.display_name, contractor_canonical_key: primaryKey, contractor_normalization_status: 'matched', updated_at: nowIso })
        .eq('project_code', pCode).eq('contractor_canonical_key', secondaryKey);

      showToast(_t('quality.game.toast.merged', '✅ Успешно объединено!'));

      // Скрываем блок в модалке
      document.getElementById(rowId).style.display = 'none';

      // Обновляем список на фоне
      gameLoadContractorDirectory();

      // Заставляем локальный кэш обновиться
      localStorage.setItem('rbi_cloud_dirty', '1');
      _triggerSync('silent');
      var contrEditSvc = _contractors();
      if (contrEditSvc && typeof contrEditSvc.init === 'function') await contrEditSvc.init();
      if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('sk:renderRequested', { view: 'banner' });

    } catch (e) {
      console.error(e);
      showToast(_t('quality.game.toast.merge_err', '❌ Ошибка при слиянии'));
    }
  };

  // Перенесено из js/game.js (строка 4456).
  function rbi_exportFmeaExcel(fmeaId) {
    const record = _getFmea().find(f => f.id === fmeaId);
    if (!record) return showToast(_t('quality.game.fmea.not_found', 'Запись не найдена'));

    showToast(_t('quality.game.toast.excel_building', '⏳ Формируем Excel файл...'));

    const dataToExport = record.defects.map((d, index) => ({
      "№ п/п": index + 1,
      "Подрядчик": d.contractor,
      "Вид работ": d.workTitle,
      "Дефект": d.defectName,
      "Кол-во повторов": d.count,
      "Этап возникновения": d.stage || '-',
      "Коренная причина": d.cause || '-',
      "Последствия (Риски)": d.effect || '-',
      "Устранение (Fix)": d.fix || '-',
      "Предотвращение": d.prevent || '-',
      "RPN (Приоритет риска)": d.rpn || 0
    }));

    try {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "FMEA Анализ");

      XLSX.writeFile(workbook, `FMEA_${record.periodName}_${new Date().toLocaleDateString('ru-RU')}.xlsx`);
      showToast(_t('quality.game.toast.excel_ok', '✅ FMEA успешно выгружен в Excel!'));
    } catch (e) {
      console.error(e);
      showToast(_t('quality.game.toast.excel_err', '❌ Ошибка при формировании Excel'));
    }
  };

  const GameActions = {

    _ctx: null,
    bindCtx(ctx) { this._ctx = ctx; },
    logAction(actionType, targetId, inspectorOverride) {
      if (typeof gameLogAction === 'function') {
        gameLogAction(actionType, targetId, inspectorOverride);
        emit('game:action:logged', { actionType, targetId });
      } else {
        console.warn('[GameActions] gameLogAction not found');
      }
    },

    updatePlanProgress() {
      if (typeof gameUpdatePlanProgress === 'function') {
        gameUpdatePlanProgress();
        emit('game:plan:updated');
      } else {
        console.warn('[GameActions] gameUpdatePlanProgress not found');
      }
    },

    generateAuditPlan() {
      if (typeof gameGenerateAuditPlan === 'function') {
        gameGenerateAuditPlan();
      } else {
        console.warn('[GameActions] gameGenerateAuditPlan not found');
      }
    },

    toggleAbsence() {
      if (typeof gameToggleAbsence === 'function') {
        gameToggleAbsence();
      } else {
        console.warn('[GameActions] gameToggleAbsence not found');
      }
    },

    updateEngineerName(name) {
      if (typeof gameUpdateEngineerName === 'function') {
        gameUpdateEngineerName(name);
      } else {
        console.warn('[GameActions] gameUpdateEngineerName not found');
      }
    },

    syncFromLegacy() {
      if (GameState) {
        GameState.syncFromLegacy();
      }
    }
  };

// =========================================================================
// РАЗМЕТКА МОДАЛКИ «task-status-modal» (перенос из index.html:1420-1435,
// перенос 30 modal/overlay-блоков #app-modals в JS-рендер). HTML-строка 1:1
// идентична прежней статичной разметке.
// =========================================================================
(function mountTaskStatusModalMarkup() {
    if (document.getElementById('task-status-modal')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', `
    <div id="task-status-modal"
        class="fixed inset-0 bg-slate-900/70 z-[6000] hidden items-center justify-center p-4 backdrop-blur-sm"
        onclick="this.style.display='none'">
        <div class="bg-[var(--card-bg)] w-full max-w-xs p-5 rounded-2xl shadow-2xl transition-transform border border-[var(--card-border)]"
            onclick="event.stopPropagation()">
            <div
                class="font-black text-rbi-body uppercase tracking-tight mb-4 border-b border-surface pb-3 text-ink dark:text-white flex justify-between items-center">
                ${_t('quality.game.contr.status_title', '⚙️ Статус подрядчика')}
                <button onclick="document.getElementById('task-status-modal').style.display='none'"
                    class="text-muted font-black px-2">✕</button>
            </div>
            <div id="task-status-actions" class="space-y-2">
                <!-- Кнопки вставляются через JS -->
            </div>
        </div>
    </div>
`);
}());

export {
  gameLogAction, calculateImpactScore, saveWeeklyPlan, gameUpdatePlanProgress, gameToggleAbsence,
  saveAbsencePeriod, checkAutoExpireAbsence, saveEngineerNameForce, gameVerifyManagerPin,
  gameGenerateAuditPlan, startInspectionWithValues, gameChangeTaskStatus, gameStartTask,
  gameUpdateEngineerName, rbi_executeQualityDayReport, rbi_deleteFmea, rbi_loadFmeaToWorkspace,
  rbi_saveFmea, rbi_handleFmeaPhotoUpload, rbi_removeFmeaPhoto, rbi_createEmptyFmea,
  gameLoadContractorDirectory, gameEditContractor, gameDeleteContractor, gameLoadContractorRequests,
  gameResolveContractorRequest, gameDeleteContractorRequest, gameAddAssignedProjectFromSelect,
  gameRemoveAssignedProjectChip, gameLoadRoles, gameHandleUserAccessRemove, gameBlockUserAccess,
  gameDeleteUserAccess, gameSaveUserAccess, gameLoadAiKb, gameSaveAiKb, gameDeleteAiKb,
  gameFindContractorDuplicates, gameExecuteContractorMerge, rbi_exportFmeaExcel, GameActions
};
