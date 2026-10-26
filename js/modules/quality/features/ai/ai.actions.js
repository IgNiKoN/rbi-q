// === AI Actions — Фаза 19 ===
// Реальные реализации 33 AI-функций (перенесены 1:1 из js/ai.js, удалён 2026-07-06).
// Module-scope declarations, экспортируются через ES export; публикацию в window.*
// для обратной совместимости с потребителями и inline onclick делает ai.module.js (entry).
// AIActions — делегат, вызывающий <name> напрямую (module-scope, без window.).

import { meetingRichToPlain, meetingRichToSafeHtml } from '../meetings/meetings.protocol.js';
import { buildRiskZonesInsightFromChecks } from '../analytics/analytics.risk-insight.js';

function _getSetting(key) {
    return ((AIActions._ctx && AIActions._ctx.settings) || window.RBI.services.settings).get(key);
}

function _triggerSync(mode) {
    var m = mode || 'silent';
    if (AIActions._ctx && AIActions._ctx.sync) return AIActions._ctx.sync.trigger(m);
    if (window.RBI && window.RBI.services && window.RBI.services.sync) return window.RBI.services.sync.trigger(m);
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
}

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

function _storage() {
    if (AIActions._ctx && AIActions._ctx.storage) {
        return AIActions._ctx.storage;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.storage) {
        return window.RBI.services.storage;
    }
    return {
        stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
        get: function (store, key) { return dbGet(store, key); },
        getAll: function (store) { return dbGetAll(store); },
        put: function (store, data) { return dbPut(store, data); },
        putBatch: function (store, items) {
            if (typeof dbPutBatch === 'function') return dbPutBatch(store, items);
            return Promise.all(items.map(function (item) { return dbPut(store, item); }));
        },
        delete: function (store, key) { return dbDelete(store, key); }
    };
}

function _gameLogAction(actionType, targetId) {
    if (AIActions._ctx && AIActions._ctx.game) {
        return AIActions._ctx.game.logAction(actionType, targetId);
    }
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
        return window.RBI.services.game.logAction(actionType, targetId);
    }
    if (typeof gameLogAction === 'function') return gameLogAction(actionType, targetId);
}

/**
 * Рендер ответа ИИ в безопасный HTML.
 * Важно: callAI по умолчанию уже меняет ** на <b> — нельзя просто экранировать весь HTML,
 * иначе на экране остаются буквальные теги <b>...</b>.
 */
function _formatAiRichText(raw) {
    let text = String(raw || '').replace(/\r\n/g, '\n').trim();
    text = text.replace(/^```[\w]*\n?/i, '').replace(/\n?```$/i, '').trim();

    // Нормализация разметки → маркеры (и от callAI <b>, и от сырого markdown)
    text = text.replace(/<\s*br\s*\/?\s*>/gi, '\n');
    text = text.replace(/<\s*\/\s*p\s*>/gi, '\n').replace(/<\s*p[^>]*>/gi, '');
    text = text.replace(/<\s*\/\s*li\s*>/gi, '\n').replace(/<\s*li[^>]*>/gi, '- ');
    text = text.replace(/<\s*\/\s*(ul|ol)\s*>/gi, '\n').replace(/<\s*(ul|ol)[^>]*>/gi, '\n');
    text = text.replace(/<\s*\/?\s*(div|span|h[1-6])[^>]*>/gi, '\n');
    text = text.replace(/<\s*\/?\s*(b|strong)\s*>/gi, (m) => (/^\<\s*\//i.test(m) ? '§/B§' : '§B§'));
    text = text.replace(/<[^>]+>/g, '');
    text = text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '§B§$1§/B§');
    text = text.replace(/\*\*(.+?)\*\*/g, '§B§$1§/B§');
    text = text.replace(/__(.+?)__/g, '§B§$1§/B§');
    text = text.replace(/^#{1,4}\s+(.+)$/gm, '§H§$1§/H§');

    // Экранирование остатка
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const applyInline = (s) => s
        .replace(/§B§([\s\S]+?)§\/B§/g, '<b class="font-bold text-ink">$1</b>')
        .replace(/§B§|§\/B§/g, '');

    const lines = text.split('\n');
    const out = [];
    let listType = null;

    const closeList = () => {
        if (!listType) return;
        out.push(listType === 'ul' ? '</ul>' : '</ol>');
        listType = null;
    };

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) {
            closeList();
            continue;
        }

        const hMatch = trimmed.match(/^§H§(.+)§\/H§$/);
        if (hMatch) {
            closeList();
            out.push(`<p class="font-black text-rbi-body mt-3 mb-1.5 text-ink">${applyInline(hMatch[1])}</p>`);
            continue;
        }

        const ul = trimmed.match(/^[-•–]\s+(.+)$/);
        if (ul) {
            if (listType !== 'ul') {
                closeList();
                out.push('<ul class="list-disc pl-4 my-1.5 space-y-1">');
                listType = 'ul';
            }
            out.push(`<li class="mb-0.5">${applyInline(ul[1])}</li>`);
            continue;
        }

        const sec = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
        if (sec) {
            const body = sec[2];
            const looksLikeSection = /:$/.test(body) || body.length <= 90;
            if (looksLikeSection) {
                closeList();
                out.push(`<p class="font-black text-rbi-body mt-3 mb-1.5 text-ink">${sec[1]}. ${applyInline(body.replace(/:$/, ''))}</p>`);
                continue;
            }
            if (listType !== 'ol') {
                closeList();
                out.push('<ol class="list-decimal pl-4 my-1.5 space-y-1">');
                listType = 'ol';
            }
            out.push(`<li class="mb-0.5">${applyInline(body)}</li>`);
            continue;
        }

        closeList();
        out.push(`<p class="mb-2">${applyInline(trimmed)}</p>`);
    }
    closeList();
    return out.join('') || '<p class="mb-0">—</p>';
}

function _reports() {
    if (AIActions._ctx && AIActions._ctx.reports) {
        return AIActions._ctx.reports;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.reports) {
        return window.RBI.services.reports;
    }
    return {
        setExpertConclusion: function (key, val) {
            if (typeof customExpertConclusions !== 'undefined') customExpertConclusions[key] = val;
        }
    };
}

function _defectCauses() {
    if (AIActions._ctx && AIActions._ctx.inspections) {
        return AIActions._ctx.inspections.getDefectCausesSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
        return window.RBI.services.inspections.getDefectCausesSync();
    }
    return typeof DEFECT_CAUSES !== 'undefined' ? DEFECT_CAUSES : [];
}

function _getAllInspections() {
    return ((AIActions._ctx && AIActions._ctx.inspections) || window.RBI.services.inspections).getAllSync();
}

function _getSkRecords() {
    return ((AIActions._ctx && AIActions._ctx.sk) || window.RBI.services.sk).getRecordsSync();
}

function _getTasks() {
    return ((AIActions._ctx && AIActions._ctx.tasks) || window.RBI.services.tasks).getTasksSync();
}

function _getTwiCards() {
    return ((AIActions._ctx && AIActions._ctx.knowledge) || window.RBI.services.knowledge).getTwiCardsSync();
}

function _getCustomDocs() {
    return ((AIActions._ctx && AIActions._ctx.knowledge) || window.RBI.services.knowledge).getCustomDocsSync();
}

/** Full CUSTOM_DOCS from IDB (includes extractedText). Local var only — do not cache on module. */
async function _getCustomDocsAsync() {
    var svc = (AIActions._ctx && AIActions._ctx.knowledge) || (window.RBI && window.RBI.services && window.RBI.services.knowledge);
    if (svc && typeof svc.getCustomDocs === 'function') {
        var rows = await svc.getCustomDocs();
        return Array.isArray(rows) ? rows.filter(function (d) { return d && !d._deleted; }) : [];
    }
    return _getCustomDocs();
}

function _getGameActionLogs() {
    return ((AIActions._ctx && AIActions._ctx.game) || window.RBI.services.game).getGameActionLogsSync();
}

function _templates() {
    return (AIActions._ctx && AIActions._ctx.templates) || window.RBI.services.templates;
}

// === ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМА AI ===
function changeAiMode(mode) {
    var settingsSvc = (AIActions._ctx && AIActions._ctx.settings) || window.RBI.services.settings;
    settingsSvc.set('aiAuthMode', mode);

    // P2-0034: «account» (по учётке) или «personal» (свой ключ DeepSeek)
    const personalKeyBlock = document.getElementById('personal-key-field');
    if (personalKeyBlock) personalKeyBlock.classList.toggle('hidden', mode !== 'personal');
};

// === ГЛОБАЛЬНАЯ ФУНКЦИЯ ВЫЗОВА DEEPSEEK AI ===
// P2-0034: «свой ключ» (personal) — прямой запрос к DeepSeek; иначе — «по учётке»: серверная функция pf-ai
// через клиент Качества (токен входа и x-company-id подставляет он сам), право решает сервер.
function _aiText(data, options) {
    let aiText = data.choices[0].message.content;
    // raw:true — для JSON-ответов (FMEA / отчёты): не превращать ** в <b>, иначе парсер ломается
    if (!options.raw) {
        aiText = aiText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    }
    return aiText;
}

async function _callAiByAccount(messages, temperature, max_tokens, options) {
    const client = window.supabaseClient;
    if (!client || !client.functions) {
        throw new Error(_t('quality.ai.error.login', 'Войдите в Платформу 2.0, чтобы пользоваться ИИ-помощником.'));
    }
    const { data, error } = await client.functions.invoke('pf-ai', { body: { messages, temperature, max_tokens } });
    if (error) {
        let msg = _t('quality.ai.error.unavailable', 'ИИ-помощник недоступен. Попробуйте позже.');
        try {
            const errData = error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
            if (errData && errData.error) msg = errData.error;
        } catch (e) { }
        throw new Error(msg);
    }
    return _aiText(data, options);
}

async function callAI(messages, options = {}) {
    const { temperature = 0.7, max_tokens = 2000 } = options;
    const mode = _getSetting('aiAuthMode');

    try {
        if (mode !== 'personal') return await _callAiByAccount(messages, temperature, max_tokens, options);

        if (!_getSetting('apiKey')) throw new Error(_t('quality.ai.error.api_key', 'Введите ваш API-ключ в Настройках!'));
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_getSetting('apiKey')}` },
            body: JSON.stringify({ model: 'deepseek-chat', messages, temperature, max_tokens })
        });

        if (!response.ok) {
            let errorMsg = _t('quality.ai.error.server', 'Ошибка сервера: {status}', { status: response.status });
            try {
                const errData = await response.json();
                if (errData.error) errorMsg = errData.error.message || errData.error;
            } catch (e) { }
            if (response.status === 401) throw new Error(_t('quality.ai.error.bad_key', 'Неверный персональный API-ключ.'));
            throw new Error(errorMsg);
        }

        return _aiText(await response.json(), options);
    } catch (e) {
        console.error("[AI Error]:", e);
        throw e;
    }
};

/** Снять HTML-теги и лишние сущности из текста ИИ / пункта чек-листа. */
function stripAiHtml(str) {
    return String(str || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}
// === 1. ГЕНЕРАТОР УМНЫХ КОММЕНТАРИЕВ ИИ ===
async function generateSmartComment(scenario) {
    const _allInspections = _getAllInspections();
    if (!currentEditingExpertKey) return;
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_settings', '⚠️ Сначала включите AI в Настройках!'));

    const inputField = document.getElementById('modal-expert-input');
    const originalText = inputField.value;

    // Сценарий "Улучшить мой текст": стилистическая правка черновика инженера, без обращения к аналитике
    if (scenario === 'improve') {
        if (!originalText || !originalText.trim()) return showToast(_t('quality.ai.toast.draft_first', '⚠️ Сначала напишите черновик текста!'));
        inputField.value = _t('quality.ai.loading.improve_text', 'Нейросеть улучшает ваш текст...');
        try {
            const promptSystem = `Ты — редактор технических текстов стройконтроля. Стилистически улучши текст инженера: убери воду, сделай формулировки четче и профессиональнее, сохрани структуру и все факты/цифры без изменений. Не добавляй новых утверждений. Верни только исправленный текст без пояснений.`;
            const aiResponse = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: originalText }], { temperature: 0.3, max_tokens: 600 });
            inputField.value = aiResponse;
            showToast(_t('quality.ai.toast.text_improved', '✅ Текст улучшен ИИ!'));
            _gameLogAction('ai_generate', scenario);
        } catch (error) {
            inputField.value = originalText;
            showToast(_t('quality.ai.error.prefix', '❌ Ошибка: {message}', { message: error.message }));
        }
        return;
    }

    inputField.value = _t('quality.ai.loading.deepseek_data', 'Нейросеть DeepSeek анализирует данные...');

    const toneDescMap = {
        strict: 'Тон: жёсткий, официально-претензионный, с указанием на риски для приемки.',
        boss: 'Тон: сжатый управленческий доклад для руководства, только суть и решения.',
        action_plan: 'Тон: структурированный план действий с конкретными шагами и сроками.',
        tech: 'Тон: технический аудит, ссылки на нормативы (СП/ГОСТ), без эмоций.',
        standard: 'Тон: нейтральный, деловой, фактологический.'
    };
    const toneDesc = toneDescMap[scenario] || toneDescMap.standard;

    try {
        let promptSystem = ""; let promptUser = "";

        if (currentEditingExpertKey === 'global_main_analysis' || currentEditingExpertKey.startsWith('onepager_') || currentEditingExpertKey === 'global_onepager_pdca') {
            const data = getFilteredAnalyticsData();
            if (data.length === 0) throw new Error(_t('quality.ai.error.no_data_analysis', 'Нет данных для анализа'));

            let sumB3 = 0; data.forEach(i => { if (i.metrics && i.metrics.n_B3_fail > 0) sumB3++; });
            const currIntMetrics = typeof getObjectIntegralMetrics === 'function' ? getObjectIntegralMetrics(data, _templates().getUserTemplates()) : null;
            const IKO = currIntMetrics ? currIntMetrics.IKO : "0.00";
            const redZone = currIntMetrics ? currIntMetrics.redZonePerc : 0;

            const defectsCountMap = {};
            data.forEach(i => {
                if (i.metrics && (i.metrics.n_B2_fail > 0 || i.metrics.n_B3_fail > 0)) {
                    const stage = i.templateTitle || i.templateKey || 'Неизвестный этап';
                    defectsCountMap[stage] = (defectsCountMap[stage] || 0) + i.metrics.n_B2_fail + i.metrics.n_B3_fail;
                }
            });
            const top3Defects = Object.keys(defectsCountMap).sort((a, b) => defectsCountMap[b] - defectsCountMap[a]).slice(0, 3)
                .map(s => `${s} (${defectsCountMap[s]})`).join(', ') || 'значимых дефектов нет';

            const risk = buildRiskZonesInsightFromChecks(data, {
                templates: _templates().getUserTemplates()
            });

            promptSystem = `Ты — эксперт стройконтроля по оценке уровня качества. На основе ФАКТОВ ниже напиши деловой анализ на русском (90–140 слов).
Структура строго — 4 коротких блока, между блоками пустая строка:
1) Оценка УРОВНЯ КАЧЕСТВА: НИЗКИЙ / ПРИЕМЛЕМЫЙ / ВЫСОКИЙ — опирайся на ср. УрК (KPI «Ср. УрК»). ЗАПРЕЩЕНО оценивать и упоминать «надёжность» / ИУрК.
2) Зоны по УрК: зелёная ≥85% / жёлтая 70–84% / красная <70%, кого держать на радаре.
3) Главные риски по дефектам/этапам (кратко).
4) 1–3 действия на неделю (список с "-").
Формат: короткие абзацы, без простыни; начинай блок с "1)"…"4)".
Правила: только факты из входа; не выдумывай цифры; ЗАПРЕЩЕНО слова "авария"/"аварийный" и "надёжность". ${toneDesc}`;
            promptUser = `СВОДКА УРОВНЯ КАЧЕСТВА И ЗОН:\n${risk.facts}\n\nДополнительно: ИКО объекта ${IKO}; доля работ в красной зоне (интегральный показатель): ${redZone}%; проверок с критическими дефектами (вес 3): ${sumB3}; ТОП этапов с B2/B3: ${top3Defects}.\nСценарий тона: ${scenario}`;
        } else {
            const parts = currentEditingExpertKey.split('_||_');
            const cKey = parts[0]; const tTitle = parts[1];
            const cDataAll = _allInspections.filter(i => (i.contractorName + ' [' + (i.projectName || 'Без объекта') + ']') === cKey && i.templateTitle === tTitle);
            const m = getContractorMetrics(cDataAll, _templates().getUserTemplates());

            promptSystem = `Ты — независимый эксперт. КРАТКИЙ отчет (до 70 слов). СТАТУС, ФАКТЫ, ПРОГНОЗ, РЕКОМЕНДАЦИИ. ${toneDesc} ЗАПРЕЩЕНО использовать слово "авария"/"аварийный" — используй формулировку "критический дефект вес 3".`;
            promptUser = `Подрядчик: ${cKey.split(' [')[0]}. УрК: ${m.finalC}%. Доля критических дефектов (вес 3): ${m.rateB3}%. Сценарий: ${scenario}`;
        }

        const aiResponse = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: promptUser }], {
            temperature: 0.35,
            max_tokens: (currentEditingExpertKey === 'global_main_analysis'
                || currentEditingExpertKey === 'global_onepager_pdca'
                || (currentEditingExpertKey && currentEditingExpertKey.startsWith('onepager_')))
                ? 550
                : 300
        });
        inputField.value = aiResponse;
        showToast(_t('quality.ai.toast.text_generated', '✅ Текст сгенерирован ИИ!'));
        _gameLogAction('ai_generate', scenario);
    } catch (error) {
        inputField.value = originalText;
        showToast(_t('quality.ai.error.prefix', '❌ Ошибка: {message}', { message: error.message }));
    }
};

// === 2. ONE-PAGER УПРАВЛЕНЧЕСКОЕ РЕШЕНИЕ ===
async function generateOnePagerForecastAi(pdcaKey) {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant', 'Включите AI-ассистента!'));
    const data = getFilteredAnalyticsData();
    if (data.length === 0) return showToast(_t('quality.ai.toast.no_data', '🔄 Нет данных'));
    showToast(_t('quality.ai.toast.forming_strategy', 'AI формирует стратегию...'));
    try {
        let sumB3 = 0; data.forEach(i => { if (i.metrics && i.metrics.n_B3_fail > 0) sumB3++; });
        const currIntMetrics = typeof getObjectIntegralMetrics === 'function' ? getObjectIntegralMetrics(data, _templates().getUserTemplates()) : null;
        const IKO = currIntMetrics ? currIntMetrics.IKO : "0.00";
        const redZone = currIntMetrics ? currIntMetrics.redZonePerc : 0;

        const contrGroups = {};
        data.forEach(i => {
            const cKey = (i.contractorName || 'Неизвестно') + ' [' + (i.projectName || 'Без объекта') + ']';
            (contrGroups[cKey] = contrGroups[cKey] || []).push(i);
        });
        const worstContrs = Object.keys(contrGroups)
            .filter(k => contrGroups[k].length >= 3)
            .map(k => ({ name: k, m: getContractorMetrics(contrGroups[k], _templates().getUserTemplates()) }))
            .filter(x => x.m && x.m.finalC < 85)
            .sort((a, b) => a.m.finalC - b.m.finalC)
            .slice(0, 3)
            .map(x => `${x.name} (${x.m.finalC}%)`)
            .join(', ') || 'нет';

        const promptSystem = 'Ты директор по качеству. Очень кратко, максимум 500 символов: ОЦЕНКА, РИСКИ, ПЛАН ИЗ 3 ПУНКТОВ. Без воды. ЗАПРЕЩЕНО использовать слово "авария"/"аварийный" — используй формулировку "критический дефект вес 3".';
        const promptUser = `Анализ ${data.length} проверок. ИКО: ${IKO}. В красной зоне: ${redZone}%. Критических дефектов (вес 3): ${sumB3}. Проблемные подрядчики: ${worstContrs}.`;

        let response = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: promptUser }], { temperature: 0.3, max_tokens: 220 });
        response = String(response || '').trim();
        if (response.length > 500) response = response.slice(0, 499).trimEnd() + '…';
        _reports().setExpertConclusion(pdcaKey, response);
        if (typeof scheduleSessionSave === 'function') scheduleSessionSave();
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('analytics:renderRequested', {});
        showToast(_t('quality.ai.toast.analytics_updated', '✅ Аналитика качества обновлена!'));
    } catch (e) { showToast(_t('quality.ai.error.prefix', '❌ Ошибка: {message}', { message: e.message })); }
};

async function generatePulseAi() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant', 'Включите AI-ассистента!'));
    const container = document.getElementById('pulse-ai-text');
    container.innerHTML = `<span class="animate-pulse">${_t('quality.ai.loading.pulse', '⏳ AI слушает пульс объекта...')}</span>`;

    const data = getFilteredAnalyticsData();
    const currIntMetrics = typeof getObjectIntegralMetrics === 'function' ? getObjectIntegralMetrics(data, _templates().getUserTemplates()) : null;

    const promptSystem = `Ты — AI-супервизор. Дай сжатую оценку 'здоровья' стройки (1 абзац, макс 40 слов). Тон: профессиональный.`;
    const promptUser = `ИКО: ${currIntMetrics ? currIntMetrics.IKO : '0'}. В красной зоне: ${currIntMetrics ? currIntMetrics.redZonePerc : '0'}%. Выявлено проблем: ${countPhotos(data)}.`;

    try {
        const res = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: promptUser }], { temperature: 0.3, max_tokens: 150 });
        container.innerHTML = res;
        _reports().setExpertConclusion('pulse_ai', res);
        scheduleSessionSave();
    } catch (e) { container.innerHTML = _t('quality.ai.error.ai', 'Ошибка AI'); }
};

// === AI: АНАЛИЗ ТЕПЛОВОЙ КАРТЫ — модалка (полный текст + копирование) ===
let _heatmapAiLast = { html: '', plain: '' };

function _heatmapAiPlainText(raw) {
    return String(raw || '')
        .replace(/\r\n/g, '\n')
        .replace(/\*\*/g, '')
        .replace(/^#{1,4}\s+/gm, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function closeHeatmapAiModal() {
    const modal = document.getElementById('heatmap-ai-modal');
    if (modal) modal.remove();
}

function copyHeatmapAiText() {
    const plain = _heatmapAiLast.plain || '';
    if (!plain) return showToast(_t('quality.ai.toast.nothing_to_copy', 'Нечего копировать'));
    const done = () => {
        showToast(_t('quality.ai.toast.analysis_copied', 'Анализ скопирован'));
        _gameLogAction('ai_copy', 'heatmap');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(plain).then(done).catch(() => {
            try {
                const ta = document.createElement('textarea');
                ta.value = plain;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                done();
            } catch (e) {
                showToast(_t('quality.ai.toast.copy_failed', 'Не удалось скопировать'));
            }
        });
        return;
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = plain;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        done();
    } catch (e) {
        showToast(_t('quality.ai.toast.copy_failed', 'Не удалось скопировать'));
    }
}

function reopenHeatmapAiModal() {
    if (!_heatmapAiLast.html) return showToast(_t('quality.ai.toast.generate_analysis_first', 'Сначала сгенерируйте анализ'));
    openHeatmapAiModal({ html: _heatmapAiLast.html, plain: _heatmapAiLast.plain });
}

function openHeatmapAiModal(opts) {
    const options = opts || {};
    const loading = !!options.loading;
    if (options.plain != null) _heatmapAiLast.plain = options.plain;
    if (options.html != null && !loading) _heatmapAiLast.html = options.html;

    let modal = document.getElementById('heatmap-ai-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
<div id="heatmap-ai-modal" class="fixed inset-0 bg-surface/80 z-[6000] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm" onclick="if(event.target===this)closeHeatmapAiModal()">
  <div class="bg-[var(--card-bg)] w-full max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl border border-[var(--card-border)] flex flex-col overflow-hidden" style="max-height:min(94vh,100dvh)" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="heatmap-ai-modal-title">
    <div class="flex items-center justify-between gap-2 px-4 sm:px-5 pt-4 pb-3 border-b border-[var(--card-border)] shrink-0">
      <h3 id="heatmap-ai-modal-title" class="font-black text-rbi-body uppercase tracking-tight text-ink">${_t('quality.ai.title.heatmap', 'Анализ матрицы рисков')}</h3>
      <button type="button" onclick="closeHeatmapAiModal()" class="text-muted hover:text-danger px-2 text-lg leading-none" aria-label="${_t('quality.ai.btn.close', 'Закрыть')}">❌</button>
    </div>
    <div id="heatmap-ai-modal-body" class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-5 py-4 text-rbi-body sm:text-rbi-title leading-relaxed text-ink" style="min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch"></div>
    <div class="flex gap-2 p-4 pt-3 border-t border-[var(--card-border)] shrink-0 bg-[var(--card-bg)]">
      <button type="button" id="heatmap-ai-modal-copy" onclick="copyHeatmapAiText()" class="flex-1 bg-brand text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-md active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
        ${_t('quality.ai.btn.copy', 'Копировать')}
      </button>
      <button type="button" onclick="closeHeatmapAiModal()" class="flex-1 bg-surface text-muted py-3.5 rounded-xl font-bold text-rbi-label uppercase border border-surface active:scale-95">${_t('quality.ai.btn.close', 'Закрыть')}</button>
    </div>
  </div>
</div>`);
        modal = document.getElementById('heatmap-ai-modal');
    }
    const panel = modal.querySelector('[role="dialog"]');
    if (panel) {
        panel.classList.remove('max-w-lg', 'max-w-xl', 'max-w-2xl');
        panel.classList.add('max-w-3xl');
        _constrainAiScenarioPanel(panel);
    }

    const body = document.getElementById('heatmap-ai-modal-body');
    const copyBtn = document.getElementById('heatmap-ai-modal-copy');
    if (body) {
        body.style.minHeight = '0';
        body.style.overflowY = 'auto';
        body.style.WebkitOverflowScrolling = 'touch';
        if (loading) {
            body.innerHTML = `<span class="animate-pulse text-brand font-bold">${_t('quality.ai.loading.heatmap_matrix', '⏳ AI разбирает матрицу этап × подрядчик...')}</span>`;
        } else {
            body.innerHTML = options.html || _heatmapAiLast.html || '—';
            body.scrollTop = 0;
        }
    }
    if (copyBtn) copyBtn.disabled = loading || !_heatmapAiLast.plain;
    modal.style.display = 'flex';
}

function _setHeatmapAiTeaser(state) {
    const teaser = document.getElementById('heatmap-ai-text');
    if (!teaser) return;
    teaser.classList.add('is-open');
    teaser.classList.remove('hidden');
    if (state === 'loading') {
        teaser.innerHTML = `<span class="text-brand font-bold animate-pulse">${_t('quality.ai.loading.analysis_window', '⏳ Анализ формируется в окне…')}</span>`;
        return;
    }
    if (state === 'empty') {
        teaser.innerHTML = `<span class="text-muted">${_t('quality.ai.empty.no_analysis', 'Нет данных для анализа.')}</span>`;
        return;
    }
    if (state === 'error') {
        teaser.innerHTML = `<span class="text-danger font-bold">${_t('quality.ai.error.ai_link_short', '❌ Ошибка связи с нейросетью')}</span>`;
        return;
    }
    teaser.innerHTML = `
        <div class="flex flex-col gap-2">
            <p class="text-rbi-body font-bold text-ink">${_t('quality.ai.teaser.analysis_ready', 'Анализ готов — полный текст в отдельном окне.')}</p>
            <button type="button" onclick="reopenHeatmapAiModal()" class="w-full bg-brand-soft text-brand border border-brand-soft py-2.5 rounded-xl font-bold text-rbi-caption uppercase active:scale-95">${_t('quality.ai.btn.open_analysis', 'Открыть анализ')}</button>
        </div>`;
}

// === AI: АНАЛИЗ ТЕПЛОВОЙ КАРТЫ (МАТРИЦА РИСКОВ) ===
async function generateHeatmapAi() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_warn', '⚠️ Включите AI-ассистента!'));
    _setHeatmapAiTeaser('loading');
    openHeatmapAiModal({ loading: true });

    const data = typeof getFilteredAnalyticsData === 'function' ? getFilteredAnalyticsData() : [];
    if (data.length === 0) {
        _setHeatmapAiTeaser('empty');
        openHeatmapAiModal({
            html: `<span class="text-muted">${_t('quality.ai.empty.no_analysis', 'Нет данных для анализа.')}</span>`,
            plain: _t('quality.ai.empty.no_analysis', 'Нет данных для анализа.')
        });
        return;
    }

    // Та же логика, что у тепловой карты: B2+B3 на ячейку этап×подрядчик
    const byStage = {};
    const byContr = {};
    const byCell = {};
    let totalChecks = 0;
    let totalDefects = 0;
    let totalB3 = 0;

    data.forEach(check => {
        if (!check.metrics) return;
        const stage = check.templateTitle || check.templateKey || 'Неизвестный этап';
        const contr = check.contractorName || 'Неизвестно';
        const b2 = Number(check.metrics.n_B2_fail) || 0;
        const b3 = Number(check.metrics.n_B3_fail) || 0;
        const defects = b2 + b3;
        const cellKey = stage + '\0' + contr;

        totalChecks++;
        totalDefects += defects;
        totalB3 += b3;

        if (!byStage[stage]) byStage[stage] = { defects: 0, checks: 0, b3: 0 };
        byStage[stage].defects += defects;
        byStage[stage].checks++;
        byStage[stage].b3 += b3;

        if (!byContr[contr]) byContr[contr] = { defects: 0, checks: 0, b3: 0 };
        byContr[contr].defects += defects;
        byContr[contr].checks++;
        byContr[contr].b3 += b3;

        if (!byCell[cellKey]) byCell[cellKey] = { stage, contr, defects: 0, checks: 0, b3: 0 };
        byCell[cellKey].defects += defects;
        byCell[cellKey].checks++;
        byCell[cellKey].b3 += b3;
    });
    const cells = Object.values(byCell);

    const rate = (d, c) => (c > 0 ? (d / c) : 0);
    const fmtRate = (d, c) => rate(d, c).toFixed(2);

    const topStages = Object.keys(byStage)
        .map(name => ({ name, ...byStage[name], intensity: rate(byStage[name].defects, byStage[name].checks) }))
        .sort((a, b) => b.defects - a.defects || b.intensity - a.intensity)
        .slice(0, 5);

    const topContrs = Object.keys(byContr)
        .map(name => ({ name, ...byContr[name], intensity: rate(byContr[name].defects, byContr[name].checks) }))
        .sort((a, b) => b.defects - a.defects || b.intensity - a.intensity)
        .slice(0, 5);

    // Пики матрицы: есть дефекты; приоритет объёму, затем интенсивности
    const topCells = cells
        .filter(c => c.defects > 0)
        .map(c => ({ ...c, intensity: rate(c.defects, c.checks) }))
        .sort((a, b) => b.defects - a.defects || b.intensity - a.intensity)
        .slice(0, 6);

    const stagesByIntensity = Object.keys(byStage)
        .map(name => ({ name, ...byStage[name], intensity: rate(byStage[name].defects, byStage[name].checks) }))
        .filter(s => s.checks >= 2 && s.defects > 0)
        .sort((a, b) => b.intensity - a.intensity)
        .slice(0, 3);

    const contrsByIntensity = Object.keys(byContr)
        .map(name => ({ name, ...byContr[name], intensity: rate(byContr[name].defects, byContr[name].checks) }))
        .filter(c => c.checks >= 2 && c.defects > 0)
        .sort((a, b) => b.intensity - a.intensity)
        .slice(0, 3);

    const lineStage = s => `• ${s.name}: ${s.defects} деф. (B3=${s.b3}) / ${s.checks} пр. → ${fmtRate(s.defects, s.checks)} деф/пр`;
    const lineContr = c => `• ${c.name}: ${c.defects} деф. (B3=${c.b3}) / ${c.checks} пр. → ${fmtRate(c.defects, c.checks)} деф/пр`;
    const lineCell = c => `• ${c.stage} × ${c.contr}: ${c.defects} деф. (B3=${c.b3}) / ${c.checks} пр. → ${fmtRate(c.defects, c.checks)} деф/пр`;

    let promptUser = `Матрица рисков качества (фильтрованная выборка сводки).
Метрика дефекта: B2+B3 (как в тепловой карте). «деф/пр» = дефектов на одну проверку (интенсивность).

Сводка: проверок=${totalChecks}, дефектов B2+B3=${totalDefects}, из них B3=${totalB3}, средняя интенсивность=${fmtRate(totalDefects, totalChecks)} деф/пр.
`;

    if (totalDefects === 0) {
        promptUser += `\nЗначимых дефектов B2/B3 в выборке нет.`;
    } else {
        promptUser += `
Топ видов работ по объёму дефектов:
${topStages.map(lineStage).join('\n') || '—'}

Топ видов работ по интенсивности (при ≥2 проверках):
${stagesByIntensity.map(lineStage).join('\n') || '—'}

Топ подрядчиков по объёму дефектов:
${topContrs.map(lineContr).join('\n') || '—'}

Топ подрядчиков по интенсивности (при ≥2 проверках):
${contrsByIntensity.map(lineContr).join('\n') || '—'}

Пиковые ячейки матрицы (этап × подрядчик):
${topCells.map(lineCell).join('\n') || '—'}
`;
    }

    const promptSystem = `Ты — старший аналитик строительного контроля. Пишешь развёрнутый разбор матрицы «вид работ × подрядчик» для инженера.

Правила содержания:
— опирайся ТОЛЬКО на переданные цифры; не выдумывай этапы, подрядчиков, причины и проценты;
— разделяй объём дефектов и интенсивность (деф/пр) — это разные риски, объясни разницу словами;
— B3 важнее B2: если B3 > 0, подчеркни явно;
— это АНАЛИЗ, а не перечень: в каждом блоке сначала 2–4 предложения связного текста (что происходит и почему это важно), затем при необходимости 2–3 коротких пункта с фактами;
— запрещено отвечать одним только списком названий без пояснений;
— без воды и лозунгов «усилить контроль»; без TWI как единственного вывода;
— НЕ пиши HTML-теги и код-блоки.

Оформление (интерфейс сам отрисует):
— заголовок блока отдельной строкой: «1) Виды работ»;
— поясняющий абзац обычным текстом;
— факты строками «- ...»;
— имена и ключевые цифры выделяй **двойными звёздочками**.

Структура (строго 4 блока):
1) Виды работ — где главный вклад в дефектность и за счёт чего (объём / интенсивность / B3).
2) Подрядчики в зоне риска — кого держать на радаре и почему (не путать «много проверок» с «плохое качество»).
3) Опасные пересечения — какие связки этап×подрядчик выделяются; если пиков нет — так и скажи и почему.
4) Фокус на неделю — 1–2 конкретных шага: кого/что проверить первым и какой эффект ожидаем.

Объём: 180–280 слов. Обязательно допиши все 4 блока до конца — не обрывай последнюю фразу.
Если дефектов нет — 3–5 предложений: что означает нулевая дефектность при данном объёме выборки и на что смотреть дальше.`;

    try {
        // raw:true — иначе callAI сам вставит <b>, а форматтер их экранирует в видимые теги
        // 1600 токенов: иначе развёрнутый RU-анализ часто обрывается на последнем блоке
        const res = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: promptUser }
        ], { temperature: 0.4, max_tokens: 1600, raw: true });

        const html = _formatAiRichText(res);
        const plain = _heatmapAiPlainText(res);
        openHeatmapAiModal({ html, plain });
        _setHeatmapAiTeaser('ready');
        _gameLogAction('ai_generate', 'heatmap');
    } catch (e) {
        _setHeatmapAiTeaser('error');
        openHeatmapAiModal({
            html: `<span class="text-danger font-bold">${_t('quality.ai.error.ai_link_short', '❌ Ошибка связи с нейросетью')}</span>`,
            plain: _t('quality.ai.error.ai_link_plain', 'Ошибка связи с нейросетью')
        });
    }
};

async function generateContractorForecastAi(contractorName) {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings', '⚠️ Включите AI-ассистента в Настройках!'));
    const container = document.getElementById('ai-forecast-container');
    if (!container) return;

    // Фильтр по старому формату
    const data = getFilteredAnalyticsData().filter(c => c.contractorName + ' [' + (c.projectName || 'Без объекта') + ']' === contractorName);

    if (data.length < 5) {
        container.innerHTML = `<div class="text-rbi-label text-muted font-bold bg-surface p-3 rounded-lg border border-dashed border-surface">${_t('quality.ai.empty.low_data_5', 'Слишком мало данных для нейросети (нужно от 5 проверок). Продолжайте инспекции.')}</div>`;
        return;
    }

    const m = getContractorMetrics(data, _templates().getUserTemplates());
 const trend = data.slice(-5).map(c => c.metrics.final).join('% ') + '%';

    container.innerHTML = `<span class="animate-pulse font-bold text-brand flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> ${_t('quality.ai.loading.trend', 'Нейросеть вычисляет тренд...')}</span>`;

    const promptSystem = `Ты — предиктивный AI-советник по строительству. Твоя задача — спрогнозировать рейтинг подрядчика через 2 недели и дать ОДИН главный совет инженеру.
    Ответь СТРОГО в 2 абзаца:
    1. Прогноз УрК через 2 недели: [XX]% (Укажи тренд: Рост/Падение/Стагнация).
    2. Фокус для инженера: [Что именно сделать, чтобы переломить тренд или удержать качество].`;

    const promptUser = `Подрядчик: ${contractorName}\nДинамика последних 5 оценок: ${trend}\nИндекс стабильности: ${m.stabilityIndex}/100\nЧастота критических B3: ${m.rateB3}%`;

    try {
        const res = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: promptUser }], { temperature: 0.3, max_tokens: 150 });
        container.innerHTML = `<div class="text-rbi-body leading-relaxed text-brand font-medium whitespace-pre-wrap">${res}</div>`;
        _gameLogAction('ai_generate', 'forecast');
    } catch (e) {
        container.innerHTML = `<span class="text-danger font-bold">${_t('quality.ai.error.ai_link_short', '❌ Ошибка связи с нейросетью')}</span>`;
    }
};

async function generateCultureAi(contractorName) {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_warn', '⚠️ Включите AI-ассистента!'));
    const container = document.getElementById('culture-ai-text');
    container.innerHTML = `<span class="animate-pulse text-brand font-bold">${_t('quality.ai.loading.culture', '⏳ AI оценивает культуру...')}</span>`;

    const cData = getFilteredAnalyticsData().filter(c => c.contractorName + ' [' + (c.projectName || 'Без объекта') + ']' === contractorName);
    if (cData.length === 0) return container.innerHTML = `<span class="text-danger">${_t('quality.ai.error.data', 'Ошибка данных')}</span>`;

    const m = getContractorMetrics(cData, _templates().getUserTemplates());
    const promptSystem = `Ты — эксперт по бережливому производству (Lean). Дай оценку 'Культуры качества' подрядчика. 
    Опирайся на то, как он исправляет ошибки (стабильность). Объем: СТРОГО 2 коротких предложения. Без markdown-звездочек.`;
    const promptUser = `Подрядчик: ${contractorName.split(' [')[0]}. Рейтинг: ${m.finalC}%. Стабильность: ${m.stabilityIndex}. Критических дефектов (вес 3): ${m.n_изделий_с_B3}.`;

    try {
        const res = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: promptUser }], { temperature: 0.4, max_tokens: 150 });
        container.innerHTML = res;
        _reports().setExpertConclusion(`culture_${contractorName}`, res);
        if (typeof scheduleSessionSave === 'function') scheduleSessionSave();
    } catch (e) { container.innerHTML = `<span class="text-danger">${_t('quality.ai.error.ai_link_plain2', 'Ошибка связи с AI')}</span>`; }
};

// === AI: ГЕНЕРАЦИЯ ЧЕРНОВИКА TWI КАРТЫ ===
async function generateTwiDraftAi() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings_lc', '⚠️ Включите AI-ассистента в настройках!'));

    const title = document.getElementById('twi-title-input').value.trim();
    const norm = document.getElementById('twi-auto-norm-text').innerText;

    if (!title) return showToast(_t('quality.ai.toast.twi_title_required', '⚠️ Сначала укажите Название Карты!'));

    showToast(_t('quality.ai.toast.twi_generating', '🔄 Нейросеть генерирует инструкцию...'));

    var knowledgeSvc = (AIActions._ctx && AIActions._ctx.knowledge) || window.RBI.services.knowledge;
    let promptSystem = "";
    let promptUser = `Вид работ/узел: ${title}. \nСправочный норматив: ${norm}`;

    if (knowledgeSvc.getTwiTypeSync() === 'INSPECTOR') {
        promptSystem = `Ты — инженер технадзора. Напиши ОЧЕНЬ КРАТКУЮ инструкцию для проверки качества (чтобы она влезла на 1 лист А4 при печати). 
        Верни ответ СТРОГО в формате:
        РИСКИ: [строго 1-2 коротких предложений - к чему приведет нарушение]
        ПОДГОТОВКА: [строго 1-2 короткое предложение - что обеспечить перед проверкой]
        КРИТЕРИИ: [строго 1-2 коротких предложения - допуски и как проверить]`;
    } else if (knowledgeSvc.getTwiTypeSync() === 'WORKER') {
        promptSystem = `Ты — бригадир. Напиши КРАТКУЮ пошаговую инструкцию (SOP) для рабочего.
        Разбей процесс на 3-4 лаконичных шага (чтобы влезло на 1 лист). 
        Верни ответ СТРОГО в таком формате, каждый шаг с новой строки:
        Шаг: [текст действия - максимум 10-15 слов] | Время: [минуты цифрой]`;
    }

    try {
        const response = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: promptUser }
        ], { temperature: 0.3, max_tokens: 300 }); // Уменьшен лимит токенов

        if (knowledgeSvc.getTwiTypeSync() === 'INSPECTOR') {
            const risksMatch = response.match(/РИСКИ:\s*(.*?)(?=ПОДГОТОВКА:|КРИТЕРИИ:|$)/is);
            const prepMatch = response.match(/ПОДГОТОВКА:\s*(.*?)(?=КРИТЕРИИ:|$)/is);
            const critMatch = response.match(/КРИТЕРИИ:\s*(.*?)$/is);

            if (risksMatch) document.getElementById('twi-why-input').value = risksMatch[1].trim();
            if (prepMatch) document.getElementById('twi-preparation-input').value = prepMatch[1].trim();
            if (critMatch) document.getElementById('twi-compliance-input').value = critMatch[1].trim();
        } else if (knowledgeSvc.getTwiTypeSync() === 'WORKER') {
            document.getElementById('twi-steps-container').innerHTML = '';
            knowledgeSvc.setTwiStepCountSync(0);

            const lines = response.split('\n').filter(l => l.includes('Шаг:'));
            lines.forEach(line => {
                const parts = line.split('| Время:');
                const text = parts[0].replace(/Шаг:\s*/, '').trim();
                const time = parts[1] ? parseInt(parts[1].replace(/\D/g, '')) : 0;
                addTwiStep({ text: text, time: isNaN(time) ? 0 : time, photo: null });
            });
            if (lines.length === 0) addTwiStep({ text: response, time: 0, photo: null });
        }

        showToast(_t('quality.ai.toast.twi_done', '✅ Инструкция успешно сгенерирована ИИ!'));
    } catch (e) {
        showToast(_t('quality.ai.error.network_prefix', '❌ Ошибка нейросети: {message}', { message: e.message }));
    }
};

// === AI: ГЕНЕРАЦИЯ ОФИЦИАЛЬНОГО ПРЕДПИСАНИЯ ===
async function generatePrescriptionAi(inspectionId) {
    const _allInspections = _getAllInspections();
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings_plain', 'Включите AI-ассистента в настройках!'));

    // Находим проверку
    const inspection = _allInspections.find(i => i.id === inspectionId);
    if (!inspection) return;

    // Собираем список дефектов
    let defectsList = [];
    const type = inspection.templateKey.split('_')[0];
    const key = inspection.templateKey.replace(type + '_', '');
    const checklist = type === 'sys' && _templates().getSystemTemplates()[key] ? _templates().getSystemTemplates()[key].groups : (_templates().getUserTemplates()[key] ? _templates().getUserTemplates()[key].groups : []);

    getFlatList(checklist).forEach(i => {
        if (inspection.state[i.id] === 'fail' || inspection.state[i.id] === 'fail_escalated') {
            const comment = inspection.details && inspection.details[i.id] ? inspection.details[i.id].comment : 'Без комментария';
            defectsList.push(`- Нарушение: ${i.n}. Норматив: ${i.t}. Уточнение: ${comment}`);
        }
    });

    if (defectsList.length === 0) return showToast(_t('quality.ai.toast.no_defects_prescription', '❌ В этой проверке нет дефектов для предписания.'));

    // Показываем окно ожидания
    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerHTML = ``;
    document.getElementById('modal-title').innerHTML = `<div class="text-center font-black uppercase text-lg">${_t('quality.ai.title.gen_doc', 'Генерация документа...')}</div>`;
    document.getElementById('modal-body').innerHTML = `
        <div class="flex flex-col items-center justify-center py-6">
            <div class="mb-4 animate-bounce text-brand flex justify-center">🤖</div>
            <div class="text-sm font-bold text-muted text-center">${_t('quality.ai.loading.prescription', 'Нейросеть составляет юридически грамотный текст предписания...')}</div>
        </div>
    `;
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';

    const promptSystem = `Ты — строгий инженер технического надзора. Составь официальное предписание об устранении нарушений.
    Используй классический деловой стиль. 
    Структура:
    1. ШАПКА: "Кому: Руководителю проекта от организации [Подрядчик]". "От кого: Инженер строительного контроля [Инспектор]".
    2. СУТЬ: "На объекте [Объект] в ходе проверки выявлены следующие нарушения:"
    3. ПЕРЕЧЕНЬ НАРУШЕНИЙ (перечисли их списком).
    4. ТРЕБОВАНИЯ: Устранить нарушения в срок до 3 рабочих дней. В случае невыполнения работы не будут приняты.
    5. ПОДПИСЬ.`;

    const promptUser = `Объект: ${inspection.location} (${inspection.projectName}).
    Подрядчик: ${inspection.contractorName}.
    Инспектор: ${inspection.inspectorName}.
    Список нарушений:
    ${defectsList.join('\n')}`;

    try {
        const response = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: promptUser }
        ], { temperature: 0.3, max_tokens: 800 });

        // Выводим готовый текст в текстовое поле с возможностью копирования
        document.getElementById('modal-title').innerHTML = `<div class="text-center font-black uppercase text-lg">${_t('quality.ai.title.prescription_ready', 'Предписание готовое')}</div>`;
        document.getElementById('modal-body').innerHTML = `
            <textarea id="ai-prescription-text" class="w-full h-[50vh] bg-[var(--hover-bg)] border border-[var(--card-border)] rounded-xl p-3 text-rbi-label outline-none resize-none text-ink mb-4">${response}</textarea>
            <button onclick="copyExpertText(this.id, 'ai-prescription-text')" id="btn-copy-presc" class="w-full bg-brand text-white py-3.5 rounded-xl font-black text-rbi-body uppercase tracking-widest shadow-md active:scale-95 flex items-center justify-center gap-2">
                ${_t('quality.ai.btn.copy_text', '📋 Скопировать текст')}
            </button>
        `;
    } catch (e) {
        closeModal();
        showToast(_t('quality.ai.error.network_plain', 'Ошибка нейросети: {message}', { message: e.message }));
    }
};

// === AI: ПРОГНОЗ РИСКОВ В КАРТОЧКЕ ЗАДАЧИ ===
async function generateTaskRiskAi(contractorName, templateKey, containerId) {
    const _allInspections = _getAllInspections();
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings_plain', 'Включите AI-ассистента в настройках!'));

    const container = document.getElementById(containerId);
    if (!container) return;

    const cData = _allInspections.filter(c => c.contractorName === contractorName && c.templateKey === templateKey).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (cData.length < 3) return showToast(_t('quality.ai.toast.low_data_forecast', '⚠️ Мало данных для прогноза (нужно хотя бы 3 проверки).'));

    container.innerHTML = `<div class="text-center text-rbi-caption text-brand font-bold animate-pulse py-3">${_t('quality.ai.loading.dynamics', 'Анализирую динамику...')}</div>`;

    const m = getContractorMetrics(cData, _templates().getUserTemplates());
    const urkHistory = cData.slice(-5).map(c => c.metrics.final).join('%, ') + '%';

    const promptSystem = `Ты — аналитик качества. Оцени риск ухудшения качества подрядчика. 
    Ответь строго в формате:
    Статус: [Риск растёт / Стабильно / Риск снижается]
    Обоснование: [1 короткое предложение, почему так]`;

    const promptUser = `Подрядчик: ${contractorName}
    УрК по последним 5 проверкам (в хронологии): ${urkHistory}
    Индекс стабильности: ${m.stabilityIndex}/100
    Доля критических дефектов (вес 3): ${m.rateB3}%`;

    try {
        const response = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: promptUser }
        ], { temperature: 0.3, max_tokens: 150 });

        const isBad = response.toLowerCase().includes('растёт') || m.finalC < 75;
        const isGood = response.toLowerCase().includes('снижается') || (m.finalC > 85 && m.stabilityIndex > 80);
        const bgColor = isBad ? 'bg-danger-soft border-danger-soft text-danger' : (isGood ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30' : 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/30');

        container.innerHTML = `
            <div class="${bgColor} border p-3 rounded-xl shadow-sm text-rbi-label leading-snug">
                <div class="font-black uppercase mb-1 flex items-center gap-1">🤖 AI-Прогноз</div>
                ${response.replace(/\n/g, '<br>')}
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<button onclick="generateTaskRiskAi('${contractorName}', '${templateKey}', '${containerId}')" class="w-full bg-danger-soft text-danger border border-danger-soft py-3 rounded-xl font-black text-rbi-caption uppercase active:scale-95 flex justify-center items-center gap-2">${_t('quality.ai.btn.retry', '❌ Ошибка. Повторить')}</button>`;
    }
};

// === AI: МАРШРУТИЗАТОР (ПЛАН НА ДЕНЬ) ===
// === AI: МАРШРУТИЗАТОР И ПРИОРИТЕТЫ (ПЛАН НА ДЕНЬ) ===
async function generateAiRoutePlan() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings_plain', 'Включите AI-ассистента в настройках!'));

    // Берем задачи из глобального массива, фильтруя те, что в статусе "pending"
    const activeTasks = _getTasks().filter(t => t.status === 'pending' && !t._deleted);

    if (activeTasks.length === 0) return showToast(_t('quality.ai.toast.no_active_tasks', '✅ Нет активных задач для маршрутизации.'));

    const container = document.getElementById('ai-route-container');
    if (!container) return;

    container.classList.remove('hidden');
    container.innerHTML = `<span class="animate-pulse text-brand font-bold flex items-center gap-2"><svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> ${_t('quality.ai.loading.route', 'Нейросеть прокладывает оптимальный маршрут...')}</span>`;

    // 1. Собираем умный контекст по каждой задаче для ИИ
    const tasksContext = activeTasks.map(t => {
        let riskFlag = t.priorityLvl === 4 ? " [КРИТИЧЕСКИЙ РИСК]" : "";
        let overdueFlag = new Date(t.date) < new Date() ? " [ПРОСРОЧЕНА]" : "";
 let debtFlag = t.carryOverCount > 0 ? ` [ Долг: ${t.carryOverCount} нед.]` : "";

        return `- ${t.taskType || t.title} | Подрядчик: ${t.contractor} | Объект: ${t.project_display_name || t.project || 'Общий'}${riskFlag}${overdueFlag}${debtFlag}. (Причина: ${t.prompt})`;
    }).join('\n');

    // 2. Инструктируем ИИ, как отвечать
    const promptSystem = `Ты — AI-шеф-инженер строительного контроля. Твоя задача — проанализировать пулл открытых задач инженера и составить оптимальный план действий на сегодня.
    
    Твои приоритеты:
    1. КРИТИЧЕСКИЙ РИСК (критические дефекты вес 3). Это нужно решать немедленно.
    2. ПРОСРОЧЕННЫЕ И ДОЛГОВЫЕ ЗАДАЧИ.
    3. Системные рутинные проверки (Сбор данных, Воркшопы).
    
    Верни ответ СТРОГО в таком формате:
    <b style="color:#b91c1c;">🚨 ПРИОРИТЕТ 1 (Сделать срочно):</b>
    [Перечисли 1-2 самые горящие задачи и 1 коротким предложением объясни ПОЧЕМУ они важны, опираясь на переданные риски].
    
    <b style="color:#d97706;">⚠️ ПРИОРИТЕТ 2 (В течение дня):</b>
    [Перечисли остальные важные задачи или долги, объяснив их влияние на процесс].
    
    <b style="color:#0f172a;">💡 СОВЕТ ИНЖЕНЕРУ:</b>
    [1 короткое, бодрое мотивационное предложение о том, как закрытие этого плана повлияет на Индекс Здоровья Объекта].`;

    try {
        const response = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: `Задачи инженера на сегодня:\n${tasksContext}` }
        ], { temperature: 0.3, max_tokens: 600 });

        container.innerHTML = `<div class="text-rbi-label leading-relaxed text-ink">${response.replace(/\n/g, '<br>')}</div>`;
        showToast(_t('quality.ai.toast.route_done', 'Маршрут и приоритеты расставлены!'));

        // Логируем в геймификацию
        _gameLogAction('ai_generate', 'route_plan');

    } catch (e) {
        container.innerHTML = `<span class="text-danger font-bold">${_t('quality.ai.error.ai_link', '❌ Ошибка связи с нейросетью: {message}', { message: e.message })}</span>`;
    }
};

// === AI: ТЬЮТОР (СОВЕТ ПО РАЗВИТИЮ) ===
async function generateAiTutorAdvice() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_warn', '⚠️ Включите AI-ассистента!'));
    const container = document.getElementById('ai-tutor-container');
    container.classList.remove('hidden');
    container.innerHTML = `<span class="animate-pulse">${_t('quality.ai.loading.profile', '⏳ Анализирую ваш профиль...')}</span>`;

    var gameSvc = (AIActions._ctx && AIActions._ctx.game) || window.RBI.services.game;
    const profile = gameSvc.getCurrentProfileDataSync();
    const logs = _getGameActionLogs().filter(l => l.inspector === profile.name).slice(-20); // Последние 20 действий
    const actionsMap = {};
    logs.forEach(l => { actionsMap[l.action] = (actionsMap[l.action] || 0) + 1; });

    const promptSystem = `Ты — наставник инженера. Дай 1 короткий, мотивирующий совет (максимум 2 предложения) по профессиональному росту. 
    Посмотри на статистику действий и подскажи, чего не хватает (например, мало используют TWI или мало генерируют AI-отчеты). 
    Без воды, сразу к делу.`;

    const promptUser = `XP инженера: ${profile.pi}. Последние действия: ${JSON.stringify(actionsMap)}. Навыки: ${JSON.stringify(profile.radarData)}.`;

    try {
        const response = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: promptUser }], { temperature: 0.5, max_tokens: 150 });
        container.innerHTML = `<b>${_t('quality.ai.label.advice', '💡 Наставление:')}</b> ${response}`;
    } catch (e) {
        container.innerHTML = `<span class="text-danger">${_t('quality.ai.error.ai', 'Ошибка AI')}</span>`;
    }
};

// === AI-ПОДСКАЗКА ДЛЯ ПРЕДОТВРАЩЕНИЯ ДЕФЕКТОВ ===
async function generateAiHintForDefect() {
    if (!_getSetting('aiEnabled') || !window._auditCurrentCommentId) return;

    const select = document.getElementById('modal-cause-select');
    const aiHint = document.getElementById('ai-hint-block');
    const causeCode = select.value;

    if (!causeCode) {
        aiHint.classList.add('hidden');
        return;
    }

    const causeName = _defectCauses().find(c => c.code === causeCode)?.name || 'Неизвестная причина';

    const flatList = getFlatList(window.AuditState.currentChecklist);
    const itemData = flatList.find(x => x.id === window._auditCurrentCommentId);
    if (!itemData) return;

    // Проверяем, есть ли для этого пункта TWI-карта
    const existingTwi = _getTwiCards().find(c => c.checklistKey === window.AuditState.currentTemplateKey && (String(c.itemId) === String(window._auditCurrentCommentId) || c.itemId === 'ALL'));
    const twiContext = existingTwi ? `В базе УЖЕ ЕСТЬ TWI-карта "${existingTwi.title}". Посоветуй инженеру показать её рабочим.` : `В базе НЕТ TWI-карты для этого узла. Посоветуй инженеру её создать.`;

    aiHint.classList.remove('hidden');
    aiHint.innerHTML = `<span class="animate-pulse text-muted">${_t('quality.ai.loading.hint', '⏳ AI формулирует совет...')}</span>`;

    const promptSystem = `Ты — старший наставник стройконтроля. Дай инспектору 1-2 коротких предложения: как предотвратить этот дефект прямо сейчас на площадке. 
    ОБЯЗАТЕЛЬНО учти контекст: ${twiContext}`;

    const promptUser = `Нарушение: ${itemData.n}. Норма: ${itemData.t}. Причина: ${causeName}.`;

    try {
        const response = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: promptUser }
        ], { temperature: 0.4, max_tokens: 150 });

        aiHint.innerHTML = `<b>${_t('quality.ai.label.ai_hint', '💡 AI-Совет:')}</b> ${response.replace(/\n/g, ' ')}`;
    } catch (e) {
        aiHint.classList.add('hidden');
    }
};

/**
 * Извлечение текстового слоя PDF (не OCR сканов).
 * @returns {Promise<{text:string,pageCount:number,totalPages:number,charCount:number,avgCharsPerPage:number}|null>}
 */
async function extractTextFromPdf(pdfDataUrl) {
    try {
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdfjs/pdf.worker.min.js';
        }

        let arrayBuffer;
        if (pdfDataUrl.startsWith('data:')) {
            const base64 = pdfDataUrl.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            arrayBuffer = bytes.buffer;
        } else {
            const res = await fetch(pdfDataUrl);
            if (!res.ok) throw new Error(_t('quality.ai.error.file_link', 'Не удалось загрузить файл по ссылке'));
            arrayBuffer = await res.arrayBuffer();
        }

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = '';

        const maxPages = Math.min(pdf.numPages, 300);

        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            // Сохраняем пробелы между glyph-runs — иначе слова слипаются и поиск ломается
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';

            if (i % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        fullText = fullText.replace(/[\0\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
        const charCount = fullText.replace(/\s+/g, ' ').trim().length;
        const avgCharsPerPage = maxPages > 0 ? Math.round(charCount / maxPages) : 0;

        return {
            text: fullText,
            pageCount: maxPages,
            totalPages: pdf.numPages,
            charCount,
            avgCharsPerPage
        };
    } catch (err) {
        console.error("Ошибка парсинга PDF:", err);
        if (typeof showToast === 'function') showToast(_t('quality.ai.error.pdf_parse', '⚠️ Ошибка парсинга PDF: {message}', { message: err.message }));
        return null;
    }
}

/** Нормализация ответа extractTextFromPdf (строка legacy → объект). */
function _normalizePdfExtract(extracted) {
    if (!extracted) return null;
    if (typeof extracted === 'string') {
        const text = extracted;
        const charCount = text.replace(/\s+/g, ' ').trim().length;
        return { text, pageCount: 0, totalPages: 0, charCount, avgCharsPerPage: 0 };
    }
    if (extracted.text != null) return extracted;
    return null;
}

// === ГЕНЕРАТОР ТЗ ИЗ ОБРАТНОЙ СВЯЗИ ===
async function rbi_normalizeFeedbackAi(rawText) {
    if (!_getSetting('aiEnabled')) return null;

    const promptSystem = `Ты — технический писатель (Product Manager). Перепиши эмоциональное или сбивчивое сообщение пользователя в формальное предложение по улучшению IT-приложения.
    Формат ответа СТРОГО:
    ПРОБЛЕМА: [одно предложение]
    ПРЕДЛОЖЕНИЕ: [одно предложение]
    РЕЗУЛЬТАТ: [одно предложение]`;

    try {
        const res = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: `Исходное сообщение: ${rawText}` }
        ], { temperature: 0.2, max_tokens: 300 });
        return res;
    } catch (e) {
        console.error("Ошибка AI нормализации:", e);
        return null;
    }
};

// ============================================================================
// === AI ЧАТ ПО НОРМАТИВАМ (RAG v1.5 + full-screen view) ===
// ============================================================================

const _AI_DOC_STOP = new Set(['этот', 'этой', 'какие', 'какой', 'какая', 'какое', 'можно', 'нужно', 'если', 'также', 'или', 'для', 'при', 'что', 'как', 'где', 'когда', 'есть', 'нет', 'по', 'из', 'на', 'от', 'до', 'со', 'во']);
const _AI_DOC_SYNONYMS = {
    арматур: ['армирован', 'армированн', 'стержн'],
    бетон: ['бетонн', 'железобетон'],
    монолитн: ['монолит', 'железобетон', 'жбк'],
    отклонен: ['допуск', 'допустим', 'неровност'],
    допу: ['отклонен', 'допуск', 'допустим', 'неровност'],
    стен: ['стены', 'стенов', 'колонн'],
    газобетон: ['газобетонн', 'ячеист'],
    кладк: ['кирпичн', 'каменн'],
    гидроизоляц: ['гидроизол', 'обмазочн'],
    сварк: ['сварн', 'шов'],
    опалубк: ['опалубочн'],
    фундамент: ['основан'],
    перекрыт: ['плит'],
    кровл: ['кровля', 'кровельн', 'крыш']
};
/** Домены работ: чтобы вопрос про монолит не «прилипал» к СП по НФС из‑за слова «стена». */
const _AI_DOC_DOMAIN = {
    mono: ['монолит', 'железобетон', 'жбк', 'опалуб', 'арматур', 'бетонн'],
    facade: ['фасад', 'навесн', 'кронштейн', 'облицов', 'вентфасад', 'нфс', 'утеплител', 'направляющ'],
    roof: ['кровл', 'крыш', 'кровельн', 'пароизоляц', 'инверсионн'],
    masonry: ['газобетон', 'пеноблок', 'ячеист', 'кладк', 'кирпич']
};

/**
 * Словарь площадки: простой язык → термины чек-листа/СП.
 * Паттерны без флага g (иначе lastIndex ломает повторные .test).
 */
const _AI_DOC_PHRASE_MAP = [
    { re: /крив|завалил|завал|уш[её]л\s+от\s+вертикал|не\s+по\s+отвесу/, add: 'отклонение вертикали плоскости стен' },
    { re: /пузыр|раковин|каверн|дырк\w*\s+в\s+бетон/, add: 'раковины сколы бетона' },
    { re: /защитн\w*\s+сло|слой\s+защит|оголен\w*\s+арматур|торчит\s+арматур/, add: 'защитный слой бетона арматура обнажение' },
    { re: /скольк\w*\s*мм|сколько\s+можно|какая\s+норма|по\s+норме|в\s+допуск|влезает\s+ли/, add: 'допуск мм табл отклонение' },
    { re: /неровн|волн\w*\s+стен|горбы|ямы\s+на\s+бетон/, add: 'неровности поверхности бетона рейкой' },
    { re: /соосн|не\s+по\s+оси|съехал\w*\s+оси/, add: 'отклонение соосности вертикальных конструкций' },
    { re: /толщин\w*\s+стен|сечени[ея]\s+стен|размер\s+сечен/, add: 'размер поперечного сечения допуск' },
    { re: /про[её]м|оконн|дверн/, add: 'размеры проёмов оконных дверных' },
    { re: /опалубк|щит\w*\s+опалуб/, add: 'опалубка монолит' },
    { re: /наплыв|цементн\w*\s+молоко/, add: 'наплывы поверхность бетона' },
    { re: /трещин/, add: 'трещины бетон конструкции' },
    { re: /влажност|мокр\w*\s+основан/, add: 'влажность основания' },
    { re: /ровност\w*\s+основан|основание\s+крив/, add: 'ровность основания неровности' },
    { re: /перевязк|разбежк/, add: 'перевязка швов кладки' },
    { re: /вертикал\w*\s+кладк|кладк\w*\s+крив/, add: 'отклонение плоскости стен кладки вертикали' },
    { re: /газобетон|пеноблок|ячеист/, add: 'газобетон кладка стен' },
    { re: /кровл|крыш|кровельн/, add: 'кровля пароизоляция гидроизоляция стяжка утеплитель' },
    { re: /принят\w*\s+кров|при[её]мк\w*\s+кров|сдат\w*\s+кров/, add: 'кровля контроль приемка' },
    { re: /принят|при[её]мк|приемк|сдат\w*\s+работ|принять\s+у\s+подрядчик/, add: 'контроль приемка проверка' },
    { re: /нфс|вентфасад|вентилируем\w*\s+фасад/, add: 'навесной вентилируемый фасад' },
    { re: /кронштейн/, add: 'кронштейны анкер фасад' },
    { re: /утеплител|минват|мин\s*плит/, add: 'утеплитель плиты фасад' },
    { re: /сварн\w*\s+шов|сварк/, add: 'сварка шов' },
    { re: /напуск|нахлест|анкеровк/, add: 'нахлестка анкеровка арматуры' },
    { re: /защитн\w*\s+слой/, add: 'защитный слой бетона' },
    { re: /журнал\s+входн|входной\s+контроль/, add: 'журнал входного контроля' },
    { re: /\bппр\b|проект\s+производств/, add: 'ППР согласованный' },
    { re: /исполнительн\w*\s+схем/, add: 'исполнительные схемы' }
];

const _AI_DOC_INTENT_EXTRA = {
    допуск: ['допуск', 'мм', 'отклонен', 'табл', 'не более'],
    как_проверить: ['проверк', 'контроль', 'рейк', 'измерен', 'методик'],
    документы: ['журнал', 'акт', 'исполнительн', 'ппр', 'паспорт'],
    общее: []
};

function _detectAiDocIntent(question) {
    const t = String(question || '').toLowerCase();
    if (/журнал|акт\b|исполнительн|ппр|паспорт|протокол|документац/.test(t)) return 'документы';
    if (/как\s+провер|чем\s+мер|как\s+измер|рейк|нивелир|методик|порядок\s+контрол/.test(t)) return 'как_проверить';
    if (/допу|мм\b|отклонен|крив|ровност|вертикал|сколько|норма|неровн|соосн/.test(t)) return 'допуск';
    return 'общее';
}

/** Простой язык → расширенный поисковый текст + intent. */
function _expandAiDocQuery(question) {
    const original = String(question || '').trim();
    const low = original.toLowerCase();
    const chunks = [];
    _AI_DOC_PHRASE_MAP.forEach(row => {
        if (row.re.test(low)) chunks.push(row.add);
    });
    const intent = _detectAiDocIntent(original);
    (_AI_DOC_INTENT_EXTRA[intent] || []).forEach(w => chunks.push(w));
    const expandedKeywords = [...new Set(
        chunks.join(' ').split(/\s+/).map(w => w.trim()).filter(w => w.length > 1)
    )];
    const searchText = expandedKeywords.length
        ? (original + ' ' + expandedKeywords.join(' ')).replace(/\s+/g, ' ').trim()
        : original;
    return { searchText, intent, expandedKeywords, original };
}

/**
 * Вид работ по названию чек-листа: «кровлю» → krovlya, не газобетон.
 * @returns {{ key: string, title: string, score: number }[]}
 */
function _detectWorkTemplateKeys(question) {
    const q = String(question || '').toLowerCase();
    if (!q.trim()) return [];
    const hits = [];
    const pushHit = (key, title, score) => {
        if (score < 16) return;
        hits.push({ key: String(key), title: title || key, score });
    };
    try {
        const sys = (_templates().getSystemTemplates && _templates().getSystemTemplates()) || {};
        const user = (_templates().getUserTemplates && _templates().getUserTemplates()) || {};
        const scan = (map) => {
            Object.keys(map || {}).forEach(key => {
                const title = String((map[key] && map[key].title) || key);
                const titleLow = title.toLowerCase();
                let score = 0;
                titleLow.replace(/[().,«»"']/g, ' ').split(/\s+/).forEach(tok => {
                    if (tok.length < 4) return;
                    const stem = tok.length > 5 ? tok.substring(0, tok.length - 2) : tok;
                    if (stem.length >= 4 && q.includes(stem)) score += stem.length >= 5 ? 28 : 16;
                    if (q.includes(tok)) score += 22;
                });
                // Явные алиасы ключей / тем
                if ((key === 'krovlya' || /кровл/.test(titleLow)) && /кровл|крыш|кровель/.test(q)) score += 55;
                if (/газобетон|пеноблок|ячеист/.test(titleLow) && /газобетон|пеноблок|ячеист/.test(q)) score += 55;
                if (/монолит/.test(titleLow) && /монолит|жбк|железобетон/.test(q)) score += 50;
                if (/фасад|нфс|навесн/.test(titleLow) && /фасад|нфс|вентфасад/.test(q)) score += 50;
                if (/кладк|кирпич/.test(titleLow) && /кладк|кирпич/.test(q) && !/газобетон/.test(q)) score += 40;
                pushHit(key, title, score);
            });
        };
        scan(sys);
        scan(user);
    } catch (e) { /* templates optional */ }
    hits.sort((a, b) => b.score - a.score);
    // Один явный лидер — остальные отстающие отсекаем
    if (hits.length && hits[0].score >= 40) {
        const top = hits[0].score;
        return hits.filter(h => h.score >= top * 0.75).slice(0, 3);
    }
    return hits.slice(0, 3);
}

/** Условный rewrite: бытовой вопрос → термины ТК/СП (одна строка). */
async function _rewriteAiDocQueryForSearch(question) {
    const promptSystem = `Перефразируй вопрос инженера стройплощадки в одну строку поисковых терминов контроля качества (чек-лист, СП, ГОСТ).
ОБЯЗАТЕЛЬНО сохрани вид работ из вопроса (кровля / монолит / газобетон / фасад и т.д.) — не подменяй другим видом работ.
Включи: вид работ, конструкцию, что проверяем, слова «допуск»/«мм»/«приемка» если уместно.
Не отвечай по сути нормы. Без пояснений и кавычек. Только одна строка на русском.`;
    const response = await _withTimeout(
        callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: String(question || '') }
        ], { temperature: 0.1, max_tokens: 80, raw: true }),
        10000,
        'Уточнение формулировки не удалось'
    );
    return String(response || '')
        .replace(/\*\*/g, '')
        .replace(/^[«"]|[»"]$/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 220);
}

function _aiDocDomainFlags(text) {
    const t = String(text || '').toLowerCase();
    return {
        mono: _AI_DOC_DOMAIN.mono.some(d => t.includes(d)),
        facade: _AI_DOC_DOMAIN.facade.some(d => t.includes(d)),
        roof: _AI_DOC_DOMAIN.roof.some(d => t.includes(d)),
        masonry: _AI_DOC_DOMAIN.masonry.some(d => t.includes(d))
    };
}

/** Вес термина: длинные/редкие важнее коротких вроде «стены». */
function _aiDocKwWeight(kw) {
    const len = String(kw || '').length;
    if (len >= 7) return 28;
    if (len >= 5) return 14;
    return 8;
}

/**
 * Совпадение термина в тексте. Короткие основы (≤4) — с границей слова,
 * чтобы «допу» не цепляло «не допускается», а «стен» — не середину длинных слов без основы.
 */
function _aiDocIncludesKw(hay, kw) {
    const h = String(hay || '');
    const k = String(kw || '');
    if (!h || !k) return false;
    if (k.length <= 4) {
        try {
            const re = new RegExp(
                '(?:^|[^а-яёa-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[а-яё]{0,4}(?:[^а-яёa-z0-9]|$)',
                'i'
            );
            return re.test(h);
        } catch (e) {
            return h.includes(k);
        }
    }
    return h.includes(k);
}

/** Бонус/штраф «похоже на норматив» vs «предисловие/обложка». */
function _aiDocNormativeDensity(chunkLow) {
    let n = 0;
    const preface = /предислови|введен[ао]\s+в\s+действие|сведения\s+о\s+стандарт|разработан\s+.*обществ|область\s+применения|настоящий\s+свод\s+правил\s+разработан/;
    const body = /табл\.|таблиц|не\s+более|не\s+менее|допуск|±|\d+\s*мм|пункт\s*\d|раздел\s*\d|должно\s+быть|не\s+допуска/;
    if (preface.test(chunkLow) && !body.test(chunkLow)) n -= 420;
    else if (preface.test(chunkLow)) n -= 120;
    const hits = chunkLow.match(/табл\.|таблиц|не\s+более|не\s+менее|допуск|\d+\s*мм|пункт\s*\d|раздел\s*\d/g);
    if (hits) n += Math.min(320, hits.length * 40);
    return n;
}

function _escAiDoc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _stripNormHtml(t) {
    return String(t || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function _extractCodesFromText(t) {
    const codeRe = /(?:гост|сп|снип)\s*[\d]+(?:\.[\d]+)*/gi;
    const raw = String(t || '').match(codeRe) || [];
    return [...new Set(raw.map(c => c.toLowerCase().replace(/\s+/g, ' ').trim()))];
}

/** Нормализация шифра для сопоставления «СП 70.13330.2012» ↔ «СП70.13330». */
function _normalizeNormCodeKey(code) {
    let s = String(code || '').toLowerCase().replace(/\s+/g, '');
    s = s.replace(/[^a-zа-яё0-9.]/g, '');
    s = s.replace(/\.(19|20)\d{2}$/g, '');
    return s;
}

function _normCodesMatch(a, b) {
    const ka = _normalizeNormCodeKey(a);
    const kb = _normalizeNormCodeKey(b);
    if (!ka || !kb) return false;
    if (ka === kb || ka.includes(kb) || kb.includes(ka)) return true;
    const typeRe = /^(гост|сп|снип)/;
    const ta = (ka.match(typeRe) || [])[1];
    const tb = (kb.match(typeRe) || [])[1];
    if (!ta || ta !== tb) return false;
    const na = ka.replace(typeRe, '');
    const nb = kb.replace(typeRe, '');
    return !!(na && nb && (na.startsWith(nb) || nb.startsWith(na)));
}

function _extractClauseHints(normText) {
    const t = String(normText || '');
    const hints = [];
    const tables = t.match(/табл\.?\s*[\d]+(?:\.[\d]+)*/gi) || [];
    tables.forEach(x => {
        const num = x.replace(/табл\.?\s*/i, '').replace(/\s+/g, '').trim();
        if (!num) return;
        hints.push('табл. ' + num);
        hints.push('табл.' + num);
        hints.push('таблица ' + num);
        hints.push('таблице ' + num);
        hints.push('таблицы ' + num);
    });
    // Приложения СП: «Л.8», «Л.10», «Л.2.3.5» (кириллица Л / латиница L)
    const apps = t.match(/(?:^|[^а-яёa-z0-9])([лl])\.?\s*(\d+(?:\.\d+)*)/gi) || [];
    apps.forEach(x => {
        const m = String(x).match(/([лl])\.?\s*(\d+(?:\.\d+)*)/i);
        if (!m) return;
        const num = m[2];
        hints.push('л.' + num);
        hints.push('л. ' + num);
        hints.push('l.' + num);
        hints.push('l. ' + num);
        hints.push('приложение л.' + num);
        hints.push('приложении л ' + num);
        hints.push('таблица л.' + num);
    });
    const points = t.match(/(?:^|[^а-яёa-z])п\.?\s*[\d]+(?:\.[\d]+)*/gi) || [];
    points.forEach(x => {
        const num = String(x).replace(/^[^\d]*п\.?\s*/i, '').replace(/\s+/g, '').trim();
        if (!num || num.length < 2) return;
        hints.push('п. ' + num);
        hints.push('п.' + num);
        hints.push('пункт ' + num);
    });
    return [...new Set(hints.filter(h => h && h.length >= 3))];
}

function _extractMmHints(normText) {
    const t = String(normText || '');
    const raw = t.match(/\d+\s*мм|\d+мм|±\s*\d+\s*мм/gi) || [];
    return [...new Set(raw.map(x => x
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/(\d+)мм/g, '$1 мм')
        .replace(/±\s*/g, '±')
        .trim()
    ))];
}

/** Штраф за предисловие / КонсультантПлюс / оглавление / пожарный раздел без допусков. */
function _aiDocPrefacePenalty(chunkLow) {
    const low = String(chunkLow || '');
    let p = 0;
    if (/консультантплюс|гарант\.ru|техэксперт|система\s+гарант/.test(low)) p += 550;
    if (/предислови|сведения\s+о\s+стандарт|введен[ао]\s+в\s+действие|официальное\s+издание|дата\s+введения/.test(low)) p += 480;
    if (/настоящий\s+свод\s+правил\s+разработан|область\s+применения/.test(low) && !/\d+\s*мм/.test(low)) p += 280;
    if (/(содержание|перечень\s+таблиц)/.test(low) && !/\d+\s*мм/.test(low)) p += 320;
    if (/табл/.test(low) && /\.{3,}|…/.test(low) && !/\d+\s*мм/.test(low)) p += 250;
    if (/пожар|гост\s*31251|класс\s+пожарной|пожарной\s+безопасн/.test(low) && !/\d+\s*мм/.test(low)) p += 700;
    return p;
}

function _aiDocFindAllIndexes(hay, needle) {
    const out = [];
    const h = String(hay || '');
    const n = String(needle || '');
    if (!h || !n) return out;
    let from = 0;
    while (from < h.length) {
        const i = h.indexOf(n, from);
        if (i < 0) break;
        out.push(i);
        from = i + Math.max(1, n.length);
        if (out.length > 40) break;
    }
    return out;
}

function _tableNumsFromHints(hints) {
    const nums = [];
    (hints || []).forEach(h => {
        const m = String(h).match(/табл(?:ица|ице|ицы)?\.?\s*([\d]+(?:\.[\d]+)*)/i);
        if (m && m[1]) nums.push(m[1]);
    });
    return [...new Set(nums)];
}

function _quoteHasExactTable(low, tableNum) {
    if (!tableNum) return true;
    const esc = String(tableNum).replace(/\./g, '\\.');
    // 5.12 не должно матчить 5.11 или 5.120
    try {
        return new RegExp('табл(?:ица|ице|ицы)?\\.?\\s*' + esc + '(?!\\d)', 'i').test(low);
    } catch (e) {
        return low.includes(String(tableNum));
    }
}

function _quoteHasAppendixRef(low, ref) {
    const r = String(ref || '').toLowerCase().replace(/\s+/g, '');
    const m = r.match(/^[лl]\.?(\d+(?:\.\d+)*)$/);
    if (!m) return low.replace(/\s+/g, '').includes(r);
    const num = m[1].replace(/\./g, '\\.');
    try {
        return new RegExp('(?:^|[^а-яёa-z0-9])[лl]\\.\\s*' + num + '(?!\\d)', 'i').test(low);
    } catch (e) {
        return low.includes('л.' + m[1]) || low.includes('l.' + m[1]);
    }
}

function _scoreNormQuoteWindow(chunk, keywords, mmHints, tableNums, appendixRefs) {
    const low = String(chunk || '').toLowerCase();
    let score = _aiDocNormativeDensity(low);
    score -= _aiDocPrefacePenalty(low);
    const requiredTables = tableNums || [];
    const apps = appendixRefs || [];
    if (requiredTables.length) {
        const ok = requiredTables.some(n => _quoteHasExactTable(low, n));
        if (!ok) return -9999;
        score += 220;
    }
    if (apps.length) {
        const okApp = apps.some(a => _quoteHasAppendixRef(low, a));
        if (okApp) score += 240;
        else if (!(mmHints || []).length) return -9999;
        else score -= 60; // запасной путь: есть мм из CL, в PDF нет явного «Л.8»
    }
    (keywords || []).forEach(kw => {
        if (_aiDocIncludesKw(low, kw)) score += _aiDocKwWeight(kw);
    });
    let mmHit = false;
    (mmHints || []).forEach(mm => {
        const mmNorm = String(mm).toLowerCase().replace(/\s+/g, ' ');
        if (mmNorm && low.includes(mmNorm)) {
            score += 160;
            mmHit = true;
        }
        const digits = String(mm).replace(/[^\d]/g, '');
        if (digits && new RegExp('(?:^|[^\\d])' + digits + '\\s*мм').test(low)) {
            score += 120;
            mmHit = true;
        }
    });
    if (/\d+\s*мм|±\s*\d/.test(low)) score += 80;
    if (/отклонен|вертикал|плоскост|неровн|допуск/.test(low)) score += 50;
    if (/утеплител|направляющ|облицов/.test(low)) score += 25;
    if (/консультантплюс|гарант\.ru/.test(low) && !/\d+\s*мм/.test(low)) score -= 900;
    // Без мм при известных допусках из CL — почти всегда мусор (пожарка и т.п.)
    if ((mmHints || []).length && !mmHit) score -= 500;
    return score;
}

async function _allNormDocs() {
    const custom = await _getCustomDocsAsync();
    return [
        ...(typeof window.SYSTEM_DOCS !== 'undefined' ? window.SYSTEM_DOCS : []),
        ...custom
    ].filter(d => d && !d._deleted);
}

async function _findDocsForNormCode(code) {
    const all = await _allNormDocs();
    return all.filter(doc => {
        if (!doc.extractedText || String(doc.extractedText).trim().length < 80) return false;
        return _normCodesMatch(doc.code, code) || _normCodesMatch(doc.title, code);
    });
}

/** Нормализация текста для сопоставления формулировки CL ↔ PDF. */
function _normalizeQuoteMatchText(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[«»"'„“]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Формулировка пункта чек-листа без шифров/якорей — её ищем в PDF.
 */
function _checklistFormulationForPdfMatch(itemName, normText) {
    const name = _normalizeQuoteMatchText(itemName);
    let body = _normalizeQuoteMatchText(normText);
    body = body
        .replace(/(?:гост|сп|снип)\s*[\d]+(?:\.[\d]+)*/gi, ' ')
        // без \b — для кириллицы «Л.8» границы слова ненадёжны
        .replace(/[лl]\.?\s*[\d]+(?:\.[\d]+)*/gi, ' ')
        .replace(/табл\.?\s*[\d]+(?:\.[\d]+)*/gi, ' ')
        .replace(/(?:^|[^а-яёa-z])п\.?\s*[\d]+(?:\.[\d]+)*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return {
        name,
        body,
        combined: [name, body].filter(Boolean).join('. ').trim()
    };
}

/** Фразы из формулировки: сначала длинные (точное совпадение), потом n-граммы. */
function _formulationPhrases(combined) {
    const t = _normalizeQuoteMatchText(combined);
    if (!t) return [];
    const phrases = [];
    t.split(/[.;!?]+/).forEach(line => {
        const L = line.trim();
        if (L.length >= 16) phrases.push(L);
    });
    const words = t.split(' ').filter(w => {
        if (w.length < 3) return false;
        if (_AI_DOC_STOP.has(w)) return false;
        if (/^(гост|сп|снип|мм|табл)$/.test(w)) return false;
        return true;
    });
    for (let n = 7; n >= 3; n--) {
        for (let i = 0; i + n <= words.length; i++) {
            const ph = words.slice(i, i + n).join(' ');
            if (ph.length >= 16) phrases.push(ph);
        }
    }
    return [...new Set(phrases)].sort((a, b) => b.length - a.length).slice(0, 48);
}

function _findPhraseIndexInHay(hay, phrase) {
    if (!hay || !phrase) return -1;
    const direct = hay.indexOf(phrase);
    if (direct >= 0) return direct;
    try {
        const parts = phrase.split(/\s+/).filter(Boolean).map(w =>
            w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        );
        if (parts.length < 2) return -1;
        const re = new RegExp(parts.join('\\s+'), 'i');
        const m = re.exec(hay);
        return m ? m.index : -1;
    } catch (e) {
        return -1;
    }
}

/**
 * Цитата из PDF: максимальное совпадение с полной формулировкой пункта чек-листа
 * (название + текст нормы), а не поиск «табл./Л.N».
 * @returns {{ quote: string, anchor: string, score: number }|null}
 */
function _extractNormQuoteFromPdf(doc, opts) {
    const options = opts || {};
    const full = String(doc.extractedText || '');
    if (full.length < 80) return null;
    const QUOTE_LEN = 1200;
    const form = _checklistFormulationForPdfMatch(
        options.itemName || '',
        options.checklistText || options.normText || ''
    );
    if (!form.combined || form.combined.length < 12) return null;

    const hay = full.toLowerCase();
    const phrases = _formulationPhrases(form.combined);
    const tokens = [...new Set(
        form.combined.split(' ')
            .map(w => w.replace(/[^а-яёa-z0-9±%]/gi, ''))
            .filter(w => w.length > 3 && !_AI_DOC_STOP.has(w))
    )];
    const mmHints = _extractMmHints(form.body || options.checklistText || '');
    let best = null;

    const considerSlice = (idx, score, anchor) => {
        if (idx < 0) return;
        const start = Math.max(0, idx - 60);
        const quote = full.slice(start, start + QUOTE_LEN).replace(/\s+/g, ' ').trim();
        if (quote.length < 50) return;
        let s = score - _aiDocPrefacePenalty(quote.toLowerCase());
        if (!best || s > best.score) {
            best = { quote, anchor: anchor || 'формулировка чек-листа', score: s };
        }
    };

    // 1) Максимально длинная фраза из формулировки — точное/гибкое вхождение
    for (let pi = 0; pi < phrases.length; pi++) {
        const ph = phrases[pi];
        const idx = _findPhraseIndexInHay(hay, ph);
        if (idx < 0) continue;
        considerSlice(idx, 800 + ph.length * 3 - pi * 2, 'фраза CL');
        if (ph.length >= 28) break; // достаточно сильное попадание
    }

    // 2) Окна с макс. пересечением токенов формулировки
    if (tokens.length >= 2) {
        const needHits = Math.max(2, Math.ceil(tokens.length * 0.4));
        const step = 320;
        for (let i = 0; i < full.length; i += step) {
            const chunk = full.slice(i, i + QUOTE_LEN);
            const low = chunk.toLowerCase();
            let hits = 0;
            let weight = 0;
            tokens.forEach(tok => {
                if (low.includes(tok)) {
                    hits++;
                    weight += tok.length >= 7 ? 14 : (tok.length >= 5 ? 9 : 5);
                }
            });
            if (hits < needHits) continue;
            let score = weight + hits * 18;
            // бонус за название пункта
            form.name.split(' ').filter(w => w.length > 4).forEach(w => {
                if (low.includes(w.slice(0, Math.min(6, w.length)))) score += 35;
            });
            mmHints.forEach(mm => {
                const d = String(mm).replace(/[^\d]/g, '');
                if (d && new RegExp('(?:^|[^\\d])' + d + '\\s*мм').test(low)) score += 90;
            });
            score -= _aiDocPrefacePenalty(low);
            if (!best || score > best.score) {
                best = {
                    quote: chunk.replace(/\s+/g, ' ').trim(),
                    anchor: 'совпадение формулировки',
                    score
                };
            }
        }
    }

    if (!best || best.score < 90) return null;

    const low = best.quote.toLowerCase();
    // Должно быть хоть какое-то пересечение с формулировкой (не пожарка «про НФС»)
    const overlap = tokens.filter(t => low.includes(t)).length;
    if (overlap < Math.min(2, tokens.length)) return null;
    if (/пожар|гост\s*31251|консультантплюс|предислови|сведения\s+о\s+стандарт/.test(low)) {
        const nameHit = form.name.split(' ').filter(w => w.length > 4)
            .some(w => low.includes(w.slice(0, Math.min(6, w.length))));
        if (!nameHit && overlap < 3) return null;
    }
    return best;
}

/** Укоротить выдачу: топ CL + 1 цитата; без чужих PDF/TWI при сильном CL. */
function _finalizeAiDocSources(enriched) {
    const list = enriched || [];
    const clAll = list.filter(c => c.type === 'Чек-лист').sort((a, b) => (b.score || 0) - (a.score || 0));
    const quotes = list.filter(c => c.isNormQuote || c.type === 'Цитата СП/ГОСТ')
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    const docs = list.filter(c => c.type === 'Документ');
    const twi = list.filter(c => c.type === 'TWI-карта');

    const seen = new Set();
    const clTop = [];
    clAll.forEach(c => {
        const k = String(c.itemName || c.title || '').replace(/\s+/g, ' ').trim().slice(0, 96);
        if (!k || seen.has(k)) return;
        seen.add(k);
        clTop.push(c);
    });
    const clKeep = clTop.slice(0, 3);
    const out = clKeep.slice();
    if (quotes.length) out.push(quotes[0]);

    if (clKeep.length < 2) {
        docs.slice(0, 2).forEach(d => out.push(d));
        if (!clKeep.length) twi.slice(0, 1).forEach(t => out.push(t));
    }
    return out;
}

/** После выбора CL — подтянуть цитаты из PDF по шифрам пунктов. */
async function _enrichPickedWithNormQuotes(picked, keywords) {
    if (!picked || !picked.length) return picked || [];
    const quotes = [];
    const seenDoc = new Set();
    const MAX_QUOTES = 1;
    const clItems = picked.filter(c => c.type === 'Чек-лист');

    for (let ci = 0; ci < clItems.length && quotes.length < MAX_QUOTES; ci++) {
        const cl = clItems[ci];
        const codeList = (cl.codes && cl.codes.length)
            ? cl.codes
            : (cl.code ? [cl.code] : []);
        if (!codeList.length) continue;
        const normBlob = cl.normText || cl.snippet || '';
        for (let bi = 0; bi < codeList.length && quotes.length < MAX_QUOTES; bi++) {
            const code = codeList[bi];
            const docs = await _findDocsForNormCode(code);
            for (let di = 0; di < docs.length && quotes.length < MAX_QUOTES; di++) {
                const doc = docs[di];
                const dk = String(doc.id);
                if (seenDoc.has(dk)) continue;
                // Ищем в PDF полную формулировку пункта CL (макс. совпадение), не «Л.8/табл.»
                const extracted = _extractNormQuoteFromPdf(doc, {
                    itemName: cl.itemName || '',
                    checklistText: normBlob
                });
                if (!extracted || !extracted.quote) continue;
                seenDoc.add(dk);
                const docCode = doc.code || code;
                quotes.push({
                    type: 'Цитата СП/ГОСТ',
                    title: `${docCode} ← ${cl.itemName || cl.title || 'пункт'}`,
                    code: docCode,
                    docId: doc.id,
                    templateTitle: cl.templateTitle || '',
                    itemName: cl.itemName || '',
                    score: (cl.score || 0) + 80,
                    snippet: extracted.quote.slice(0, 520),
                    text: `Перепроверка по ${docCode}`
                        + ` — кусок PDF с макс. совпадением формулировки пункта «${cl.itemName || cl.title || ''}»`
                        + (extracted.anchor ? ` (${extracted.anchor})` : '')
                        + `.\nЦитата из документа:\n«${extracted.quote}»`,
                    matchesCount: 1,
                    isNormQuote: true,
                    codes: [String(code).toLowerCase()]
                });
            }
        }
    }

    if (!quotes.length) return picked;

    const out = [];
    const used = new Set();
    picked.forEach(c => {
        out.push(c);
        if (c.type !== 'Чек-лист') return;
        quotes.forEach((q, qi) => {
            if (used.has(qi)) return;
            const sameItem = q.itemName && q.itemName === c.itemName;
            const sameCode = (c.codes || []).some(code => _normCodesMatch(code, q.code))
                || (c.code && _normCodesMatch(c.code, q.code));
            if (sameItem || sameCode) {
                out.push(q);
                used.add(qi);
            }
        });
    });
    quotes.forEach((q, qi) => {
        if (!used.has(qi)) out.push(q);
    });
    return out;
}

/** Индекс пунктов всех чек-листов (system + user) для RAG. */
let _checklistNormIndexCache = null;
function _invalidateChecklistNormIndex() {
    _checklistNormIndexCache = null;
}
function _getChecklistNormIndex() {
    if (_checklistNormIndexCache) return _checklistNormIndexCache;
    const items = [];
    const addTmpl = (key, tmpl, source) => {
        if (!tmpl || !Array.isArray(tmpl.groups)) return;
        const templateTitle = tmpl.title || key;
        tmpl.groups.forEach(g => {
            (g.items || []).forEach(item => {
                if (!item) return;
                const normText = _stripNormHtml(item.t);
                const itemName = String(item.n || '').trim();
                if (!itemName && !normText) return;
                const hay = (itemName + ' ' + normText).toLowerCase();
                items.push({
                    templateKey: String(key),
                    templateTitle,
                    source,
                    group: String(g.group || ''),
                    itemId: item.id,
                    itemName,
                    normText,
                    hay,
                    codes: _extractCodesFromText(normText + ' ' + itemName)
                });
            });
        });
    };
    try {
        const sys = (_templates().getSystemTemplates && _templates().getSystemTemplates()) || {};
        Object.keys(sys).forEach(k => addTmpl(k, sys[k], 'sys'));
        const user = (_templates().getUserTemplates && _templates().getUserTemplates()) || {};
        Object.keys(user).forEach(k => addTmpl(k, user[k], 'user'));
    } catch (e) { /* templates optional at boot */ }
    _checklistNormIndexCache = items;
    return items;
}

function _fillAiDocFilter() {
    const sel = document.getElementById('ai-doc-filter');
    if (!sel) return;
    const prev = sel.value;
    const allDocs = [
        ...(typeof window.SYSTEM_DOCS !== 'undefined' ? window.SYSTEM_DOCS : []),
        ..._getCustomDocs()
    ].slice().sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'ru'));
    let opts = '<option value="">' + _t('quality.ai.option.all_docs', 'Все документы') + '</option>';
    allDocs.forEach(doc => {
        if (!doc || doc.id == null) return;
        const title = String(doc.title || '').length > 48 ? String(doc.title).slice(0, 48) + '…' : (doc.title || '');
        opts += `<option value="${_escAiDoc(String(doc.id))}">${_escAiDoc(doc.code || '—')} — ${_escAiDoc(title)}</option>`;
    });
    sel.innerHTML = opts;
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function _fillAiDocTemplateFilter() {
    const sel = document.getElementById('ai-doc-template-filter');
    if (!sel) return;
    const prev = sel.value;
    let opts = '<option value="">' + _t('quality.ai.option.all_work_types', 'Все виды работ') + '</option>';
    const safeKey = (k) => String(k || '').replace(/"/g, '');
    try {
        const sys = (_templates().getSystemTemplates && _templates().getSystemTemplates()) || {};
        Object.keys(sys).sort((a, b) => String(sys[a].title || a).localeCompare(String(sys[b].title || b), 'ru'))
            .forEach(k => {
                const title = sys[k].title || k;
                opts += `<option value="sys:${safeKey(k)}">${_escAiDoc(title)}</option>`;
            });
        const user = (_templates().getUserTemplates && _templates().getUserTemplates()) || {};
        Object.keys(user).sort((a, b) => String(user[a].title || a).localeCompare(String(user[b].title || b), 'ru'))
            .forEach(k => {
                const title = user[k].title || k;
 opts += `<option value="user:${safeKey(k)}"> ${_escAiDoc(title)}</option>`;
            });
    } catch (e) { /* ignore */ }
    sel.innerHTML = opts;
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function _aiDocDefaultChips() {
    return [
        _t('quality.ai.chip.monolith_tolerance', 'допуск монолитных стен'),
        _t('quality.ai.chip.floor_flatness', 'ровность бетонного основания'),
        _t('quality.ai.chip.wall_vertical', 'отклонение вертикали стен')
    ];
}

function _renderAiDocChips(suggestions) {
    const el = document.getElementById('ai-doc-chips');
    if (!el) return;
    const list = (suggestions && suggestions.length) ? suggestions.slice(0, 5) : _aiDocDefaultChips();
    el.classList.remove('hidden');
    el.innerHTML = list.map(s => {
        const label = String(s || '').trim();
        if (!label) return '';
        const short = label.length > 42 ? label.slice(0, 40) + '…' : label;
        return `<button type="button" data-action="applyAiDocChip" data-action-arg="${_escAiDoc(label)}"
            class="text-rbi-caption font-bold px-2.5 py-1.5 rounded-full bg-brand-soft text-brand border border-brand-soft active:scale-95 max-w-full truncate">${_escAiDoc(short)}</button>`;
    }).join('');
}

function applyAiDocChip(text) {
    const input = document.getElementById('ai-chat-input');
    if (!input) return;
    input.value = String(text || '');
    askAiDocQuestion();
}

function _setAiDocStatus(text) {
    const el = document.getElementById('ai-doc-chat-status');
    if (el) el.textContent = text || _t('quality.ai.status.default', 'Чек-листы + загруженные нормативы');
}

/** Вопрос про состав базы (список НД) — отвечаем локально, без RAG/DeepSeek. */
function _isAiDocCatalogQuestion(question) {
    const t = String(question || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t) return false;
    return /(какие|список|что есть|что загружен|покажи).{0,48}(норматив|документ|гост|баз[еаыу]|нд\b|файл)/i.test(t)
        || /(норматив|документ|гост|нд).{0,24}(в базе|загружен|есть у нас|в приложении)/i.test(t);
}

function _buildAiDocCatalogAnswer() {
    const allDocs = [
        ...(typeof window.SYSTEM_DOCS !== 'undefined' ? window.SYSTEM_DOCS : []),
        ..._getCustomDocs()
    ].filter(d => d && !d._deleted);

    if (!allDocs.length) {
        const empty = _t('quality.ai.catalog.empty', 'В базе сейчас нет загруженных нормативных документов.');
        return {
            plain: empty,
            html: '<p class="mb-0">' + empty + '</p>'
        };
    }

    const sorted = allDocs.slice().sort((a, b) =>
        String(a.code || '').localeCompare(String(b.code || ''), 'ru')
        || String(a.title || '').localeCompare(String(b.title || ''), 'ru')
    );

    const _docIndexMeta = (d) => {
        if (d.extractedText && String(d.extractedText).trim().length > 80) {
            const chars = String(d.extractedText).replace(/\s+/g, ' ').trim().length;
            return { indexed: true, chars: chars };
        }
        // slim memory projection: hasExtractedText / extractedTextChars
        const chars = Number(d.extractedTextChars) || 0;
        const indexed = !!(d.hasExtractedText && chars > 80) || (!!d.hasExtractedText && !d.extractedTextChars);
        return { indexed: indexed, chars: chars };
    };

    const untitled = _t('quality.ai.catalog.untitled', 'Без названия');
    const lines = sorted.map((d, i) => {
        const code = d.code || '—';
        const title = d.title || untitled;
        const meta = _docIndexMeta(d);
        const idxLabel = meta.indexed
            ? (meta.chars ? _t('quality.ai.catalog.indexed_chars', 'индекс ~{k}k симв.', { k: Math.round(meta.chars / 1000) }) : _t('quality.ai.catalog.indexed', 'текст проиндексирован'))
            : _t('quality.ai.catalog.not_indexed', 'текст для ИИ не проиндексирован');
        return `${i + 1}. ${code} — ${title} (${idxLabel})`;
    });

    const plain = _t('quality.ai.catalog.plain_header', 'В базе {count} документ(ов):\n', { count: sorted.length }) + lines.join('\n')
        + _t('quality.ai.catalog.plain_footer', '\n\nЧтобы ответить по содержанию — укажите шифр или тему (например: допуски монолитных стен по СП 70).');

    const htmlItems = sorted.map(d => {
        const meta = _docIndexMeta(d);
        const badge = meta.indexed
            ? (meta.chars
                ? `<span class="text-green-700 dark:text-green-400">~${Math.round(meta.chars / 1000)}k</span>`
                : `<span class="text-green-700 dark:text-green-400">${_t('quality.ai.catalog.index_badge', 'индекс')}</span>`)
            : `<span class="text-amber-600 dark:text-amber-400">${_t('quality.ai.catalog.no_index_badge', 'нет индекса')}</span>`;
        return `<li class="mb-1"><b>${_escAiDoc(d.code || '—')}</b> — ${_escAiDoc(d.title || untitled)} · ${badge}</li>`;
    }).join('');

    const html = `<p class="mb-2"><b>${_t('quality.ai.catalog.html_header', 'В базе {count} документ(ов)', { count: sorted.length })}</b>${_t('quality.ai.catalog.html_header_note', ' (системные + загруженные):')}</p>`
        + `<ul class="list-disc pl-4 mb-2">${htmlItems}</ul>`
        + `<p class="mb-0 text-rbi-body text-muted">${_t('quality.ai.catalog.html_footer', 'Для ответа по содержанию укажите шифр или тему — например: «допуски монолитных стен по СП 70».')}</p>`;

    return { plain, html };
}

function _withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label || _t('quality.ai.error.timeout_ms', 'Таймаут {ms} мс', { ms: ms }))), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function openAiDocChat() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings_first', 'Сначала включите AI-ассистента в Настройках!'));
    const view = document.getElementById('ai-doc-chat-view');
    if (!view) return showToast(_t('quality.ai.toast.chat_missing', 'Экран чата не найден'));
    _invalidateChecklistNormIndex();
    _fillAiDocFilter();
    _fillAiDocTemplateFilter();
    _renderAiDocChips(_aiDocDefaultChips());
    _setAiDocStatus(_t('quality.ai.status.default', 'Чек-листы + загруженные нормативы'));
    view.classList.remove('hidden');
    document.body.classList.add('modal-open');
    const legacy = document.getElementById('ai-chat-modal');
    if (legacy) legacy.style.display = 'none';
    const input = document.getElementById('ai-chat-input');
    if (input && !input._aiDocEnterBound) {
        input._aiDocEnterBound = true;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                askAiDocQuestion();
            }
        });
    }
    setTimeout(() => input && input.focus(), 50);
}

const _aiDocPlainById = Object.create(null);

function closeAiDocChat() {
    const view = document.getElementById('ai-doc-chat-view');
    if (view) view.classList.add('hidden');
    const legacy = document.getElementById('ai-chat-modal');
    if (legacy) legacy.style.display = 'none';
    document.body.classList.remove('modal-open');
    // Не держим историю чата и plain-тексты в RAM после закрытия
    Object.keys(_aiDocPlainById).forEach(function (k) { delete _aiDocPlainById[k]; });
    const chatHistory = document.getElementById('ai-chat-history');
    if (chatHistory) chatHistory.innerHTML = '';
}

function copyAiDocAnswer(btn) {
    const wrap = btn && btn.closest ? btn.closest('[data-ai-doc-id]') : null;
    const id = wrap ? wrap.getAttribute('data-ai-doc-id') : '';
    const plain = id ? (_aiDocPlainById[id] || '') : '';
    if (!plain) return showToast(_t('quality.ai.toast.nothing_to_copy', 'Нечего копировать'));
    const done = () => showToast(_t('quality.ai.toast.answer_copied', 'Ответ скопирован'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(plain).then(done).catch(() => {
            try {
                const ta = document.createElement('textarea');
                ta.value = plain;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                done();
            } catch (e) { showToast(_t('quality.ai.toast.copy_failed', 'Не удалось скопировать')); }
        });
        return;
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = plain;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        done();
    } catch (e) { showToast(_t('quality.ai.toast.copy_failed', 'Не удалось скопировать')); }
}

/** Локальный keyword-RAG v1.5: коды норм, синонимы, дедуп по документу, фильтр docId. */
async function _retrieveNormContext(question, opts) {
    const options = opts || {};
    const filterDocId = options.docId ? String(options.docId) : '';
    const filterTemplateRaw = options.templateKey ? String(options.templateKey) : '';
    let filterTemplateSource = '';
    let filterTemplateKey = '';
    if (filterTemplateRaw) {
        const m = filterTemplateRaw.match(/^(sys|user):(.+)$/);
        if (m) {
            filterTemplateSource = m[1];
            filterTemplateKey = m[2];
        } else {
            filterTemplateKey = filterTemplateRaw;
        }
    }
    const CHUNK_SIZE = 1500;
    const CHUNK_OVERLAP = 300;

    const cleanQuestion = String(question || '').toLowerCase()
        .replace(/[.,?!;:()«»"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const codeRe = /(?:гост|сп|снип)\s*[\d]+(?:\.[\d]+)*/gi;
    const codesRaw = String(question || '').match(codeRe) || [];
    const codes = codesRaw.map(c => c.toLowerCase().replace(/\s+/g, ' ').trim());

    // Если в вопросе явный шифр — берём больше кусков и глубже по документу (не только предисловие)
    const codeQuery = codes.length > 0;
    const TOP_K = codeQuery ? 8 : 6;
    const MAX_PER_DOC = codeQuery ? 5 : 2;
    const toleranceBoost = /допу|отклонен|неровност|мм\b|вертикал|плоскост|ровност/.test(cleanQuestion);

    let keywords = cleanQuestion.split(' ')
        .map(w => w.trim())
        .filter(w => w.length > 3 && !_AI_DOC_STOP.has(w))
        .map(w => (w.length > 5 ? w.substring(0, w.length - 2) : w));

    Object.keys(_AI_DOC_SYNONYMS).forEach(root => {
        if (keywords.some(k => k.startsWith(root) || root.startsWith(k))) {
            _AI_DOC_SYNONYMS[root].forEach(syn => {
                if (!keywords.includes(syn)) keywords.push(syn);
            });
        }
    });
    const extraKw = Array.isArray(options.extraKeywords) ? options.extraKeywords : [];
    extraKw.forEach(w => {
        const raw = String(w || '').toLowerCase().trim();
        if (!raw || raw.length < 3 || _AI_DOC_STOP.has(raw)) return;
        const stem = raw.length > 5 ? raw.substring(0, raw.length - 2) : raw;
        if (!keywords.includes(stem)) keywords.push(stem);
        if (!keywords.includes(raw)) keywords.push(raw);
    });
    keywords = [...new Set(keywords)];
    const qDomain = _aiDocDomainFlags(cleanQuestion + ' ' + keywords.join(' '));
    const workHits = _detectWorkTemplateKeys(
        [cleanQuestion, options.originalQuestion || ''].join(' ')
    );
    const workLocked = !!(workHits.length && workHits[0].score >= 40);
    const lockedKeySet = workLocked ? new Set(workHits.map(h => h.key)) : null;

    const customDocsFull = await _getCustomDocsAsync();
    const allDocs = [
        ...(typeof window.SYSTEM_DOCS !== 'undefined' ? window.SYSTEM_DOCS : []),
        ...customDocsFull
    ].filter(doc => {
        if (!doc) return false;
        if (filterDocId && String(doc.id) !== filterDocId) return false;
        return true;
    });

    let contextArr = [];

    allDocs.forEach(doc => {
        const codeLow = String(doc.code || '').toLowerCase();
        const titleLow = String(doc.title || '').toLowerCase();
        const docMeta = (doc.code || '') + ' ' + (doc.title || '');
        const docDomain = _aiDocDomainFlags(docMeta);

        // Конфликт доменов: монолит≠фасад, кровля≠кладка/газобетон
        let domainFactor = 1;
        if (qDomain.mono && !qDomain.facade && docDomain.facade && !docDomain.mono) {
            domainFactor = 0.12;
        } else if (qDomain.facade && !qDomain.mono && docDomain.mono && !docDomain.facade) {
            domainFactor = 0.25;
        } else if (qDomain.mono && docDomain.mono) {
            domainFactor = 1.35;
        } else if (qDomain.roof && !qDomain.masonry && docDomain.masonry && !docDomain.roof) {
            domainFactor = 0.08;
        } else if (qDomain.roof && docDomain.roof) {
            domainFactor = 1.4;
        } else if (qDomain.masonry && !qDomain.roof && docDomain.roof && !docDomain.masonry) {
            domainFactor = 0.12;
        }

        let titleScore = 0;
        keywords.forEach(kw => {
            if (titleLow.includes(kw) || codeLow.includes(kw)) titleScore += _aiDocKwWeight(kw) * 3;
        });
        let codeBonus = 0;
        codes.forEach(code => {
            const compact = code.replace(/\s+/g, '');
            if (codeLow.replace(/\s+/g, '').includes(compact) || titleLow.replace(/\s+/g, '').includes(compact)) {
                codeBonus += 400;
            }
        });

        if (doc.extractedText) {
            const fullText = String(doc.extractedText);
            let chunkIdx = 0;
            const step = CHUNK_SIZE - CHUNK_OVERLAP;
            // Не раздувать память/CPU: на документ оставляем только лучшие куски
            const perDocBest = [];
            const keepPerDoc = codeBonus > 0 ? 14 : 8;
            const pushBest = (row) => {
                perDocBest.push(row);
                if (perDocBest.length > keepPerDoc * 2) {
                    perDocBest.sort((a, b) => b.score - a.score);
                    perDocBest.length = keepPerDoc;
                }
            };
            for (let i = 0; i < fullText.length; i += step, chunkIdx++) {
                const chunk = fullText.substring(i, i + CHUNK_SIZE);
                const chunkLow = chunk.toLowerCase();
                const chunkDomain = _aiDocDomainFlags(chunkLow);
                let score = titleScore + codeBonus + _aiDocNormativeDensity(chunkLow);
                let matchesCount = 0;
                let weightedHits = 0;
                keywords.forEach(kw => {
                    if (_aiDocIncludesKw(chunkLow, kw)) {
                        matchesCount++;
                        weightedHits += _aiDocKwWeight(kw);
                        score += _aiDocKwWeight(kw);
                    }
                });
                if (keywords.length >= 2 && matchesCount >= 2) score += 220;
                if (cleanQuestion && chunkLow.includes(cleanQuestion)) {
                    score += 500;
                    matchesCount = Math.max(matchesCount, keywords.length);
                }
                codes.forEach(code => {
                    if (chunkLow.replace(/\s+/g, ' ').includes(code)) score += 80;
                });
                // При запросе только по шифру: лёгкий разброс по документу (середина/хвост не проигрывают голове)
                if (codeBonus > 0 && matchesCount === 0 && keywords.length <= 2) {
                    const progress = fullText.length > 0 ? i / fullText.length : 0;
                    if (progress > 0.08 && progress < 0.92) score += 60;
                }
                let chunkFactor = domainFactor;
                if (qDomain.mono && !qDomain.facade && chunkDomain.facade && !chunkDomain.mono) {
                    chunkFactor = Math.min(chunkFactor, 0.1);
                }
                if (qDomain.mono && chunkDomain.mono) chunkFactor = Math.max(chunkFactor, 1.25);

                if (matchesCount > 0 || codeBonus > 0) {
                    const snippet = chunk.replace(/\s+/g, ' ').trim();
                    pushBest({
                        type: 'Документ',
                        title: doc.code || doc.title || 'Документ',
                        code: doc.code || '',
                        docId: doc.id,
                        score: Math.round((score + weightedHits) * chunkFactor),
                        snippet,
                        text: snippet,
                        matchesCount,
                        chunkIdx,
                        codeHit: codeBonus > 0
                    });
                }
            }
            perDocBest.sort((a, b) => b.score - a.score);
            contextArr.push(...perDocBest.slice(0, keepPerDoc));
        } else if (titleScore > 0 || codeBonus > 0) {
            contextArr.push({
                type: 'Документ',
                title: doc.code || doc.title || 'Документ',
                code: doc.code || '',
                docId: doc.id,
                score: Math.round((titleScore + codeBonus) * domainFactor),
                snippet: doc.title || '',
                text: doc.title || '',
                matchesCount: 0
            });
        }
    });

    // Чек-листы first: все system + user шаблоны (не только текущий аудит)
    if (!filterDocId) {
        try {
            const index = _getChecklistNormIndex();
            index.forEach(row => {
                if (filterTemplateKey) {
                    if (row.templateKey !== filterTemplateKey) return;
                    if (filterTemplateSource && row.source !== filterTemplateSource) return;
                }
                // Жёсткий lock вида работ: вопрос про кровлю → только чек-лист кровли
                if (lockedKeySet && !lockedKeySet.has(row.templateKey)) return;

                let score = 0;
                let matches = 0;
                const titleLow = String(row.templateTitle || '').toLowerCase();
                keywords.forEach(kw => {
                    if (_aiDocIncludesKw(row.hay, kw)) {
                        matches++;
                        score += _aiDocKwWeight(kw);
                    }
                    if (_aiDocIncludesKw(titleLow, kw)) {
                        score += _aiDocKwWeight(kw) * 3;
                    }
                });
                codes.forEach(code => {
                    const compact = code.replace(/\s+/g, '');
                    if (row.codes.some(c => c.replace(/\s+/g, '').includes(compact))) {
                        score += 220;
                        matches = Math.max(matches, 1);
                    }
                });
                if (workLocked && lockedKeySet && lockedKeySet.has(row.templateKey)) {
                    score += 420;
                    if (matches === 0) matches = 1; // обзор приёмки по виду работ
                }
                // Только заголовок шаблона без совпадения в пункте — шум (кроме lock вида работ)
                if (matches === 0) return;

                if (keywords.length >= 2 && matches >= 2) score += 120;
                // Реальный допуск/мм/таблица — не «не допускается»
                if (toleranceBoost && /(?:^|[^а-яё])допуск(?:[^а-яё]|$)|отклонен|\d+\s*мм|не более|не менее|табл/i.test(row.hay)) {
                    score += 160;
                }
                if (toleranceBoost && /стен|колонн|вертикал|плоскост|неровн/i.test(row.hay)
                    && /\d+\s*мм|табл/i.test(row.hay)) {
                    score += 100;
                }
                const tmplDomain = _aiDocDomainFlags(row.templateTitle + ' ' + row.hay);
                let factor = toleranceBoost ? 1.45 : 1.2;
                if (qDomain.mono && !qDomain.facade && tmplDomain.facade && !tmplDomain.mono) factor = 0.1;
                else if (qDomain.mono && tmplDomain.mono) factor = Math.max(factor, 1.65);
                else if (qDomain.facade && tmplDomain.facade) factor = Math.max(factor, 1.4);
                else if (qDomain.roof && !qDomain.masonry && tmplDomain.masonry && !tmplDomain.roof) factor = 0.08;
                else if (qDomain.roof && tmplDomain.roof) factor = Math.max(factor, 1.7);
                else if (qDomain.masonry && tmplDomain.masonry) factor = Math.max(factor, 1.55);
                if (workLocked) factor = Math.max(factor, 1.5);

                const pathTitle = `${row.templateTitle} → ${row.itemName}`;
                const body = row.normText || 'Нет текста нормы в пункте';
                const text = `Чек-лист «${row.templateTitle}» / ${row.group || '—'}\nПункт: ${row.itemName}\nНорма: ${body}`;
                contextArr.push({
                    type: 'Чек-лист',
                    title: pathTitle,
                    templateTitle: row.templateTitle,
                    itemName: row.itemName,
                    templateKey: row.templateKey,
                    code: row.codes[0] || '',
                    codes: row.codes || [],
                    normText: body,
                    docId: null,
                    score: Math.round(score * factor),
                    snippet: body.slice(0, 400),
                    text,
                    matchesCount: matches
                });
            });
        } catch (e) { /* checklist index optional */ }
    }

    // TWI при lock вида работ часто уводит в чужую тему — пропускаем
    if (!filterDocId && !workLocked) {
        _getTwiCards().forEach(twi => {
            const text = `${twi.title} ${twi.whyImportant || ''} ${twi.howToCheck || ''}`.toLowerCase();
            let score = 0;
            let matches = 0;
            keywords.forEach(kw => {
                if (text.includes(kw)) {
                    matches++;
                    score += _aiDocKwWeight(kw);
                }
            });
            if (matches > 0) {
                let twiContent = `Название: ${twi.title}. `;
                if (twi.whyImportant) twiContent += `Риски: ${twi.whyImportant}. `;
                if (twi.howToCheck) twiContent += `Методика проверки: ${twi.howToCheck}.`;
                contextArr.push({
                    type: 'TWI-карта',
                    title: twi.title,
                    code: '',
                    docId: twi.id || null,
                    score: Math.round(score * 0.7),
                    snippet: twiContent.slice(0, 400),
                    text: twiContent,
                    matchesCount: matches
                });
            }
        });
    }

    // При монолитном вопросе сначала отсекаем совсем слабые фасадные хиты
    if (qDomain.mono && !qDomain.facade) {
        const strong = contextArr.filter(c => c.score >= 40 || (c.matchesCount || 0) >= 2);
        if (strong.length >= 2) contextArr = strong;
    }

    // Чек-листы выше PDF при равном/близком score (особенно допуски)
    contextArr.sort((a, b) => {
        const boost = (x) => {
            if (x.type === 'Чек-лист') return toleranceBoost ? 1.28 : 1.15;
            if (x.type === 'Документ') return 1;
            return 0.92;
        };
        return (b.score * boost(b)) - (a.score * boost(a));
    });

    const strongClCount = contextArr.filter(c => c.type === 'Чек-лист' && c.score >= 80).length;
    // При сильном CL / lock вида работ чужие PDF не берём — цитату подтянет enrich
    const maxPdfChunks = (workLocked || strongClCount >= 2) ? 0 : (strongClCount >= 1 ? 1 : TOP_K);
    const MAX_CHECKLIST = 4;

    // Для документов с попаданием по шифру — берём куски из разных зон (не 2× предисловие подряд)
    const picked = [];
    const perDoc = {};
    const perDocZones = {};
    let pdfPicked = 0;
    let clPicked = 0;
    for (let i = 0; i < contextArr.length && picked.length < TOP_K; i++) {
        const c = contextArr[i];
        if (c.type === 'Документ' && pdfPicked >= maxPdfChunks) continue;
        if (c.type === 'Чек-лист' && clPicked >= MAX_CHECKLIST) continue;
        const key = c.type === 'Документ' ? ('doc:' + String(c.docId)) : (c.type + ':' + String(c.title));
        const n = perDoc[key] || 0;
        if (c.type === 'Документ' && n >= MAX_PER_DOC) continue;
        if (c.type === 'Документ' && c.codeHit && typeof c.chunkIdx === 'number') {
            const zone = c.chunkIdx < 2 ? 'head' : (c.chunkIdx < 8 ? 'early' : 'body');
            perDocZones[key] = perDocZones[key] || { head: 0, early: 0, body: 0 };
            if (zone === 'head' && perDocZones[key].head >= 1 && perDocZones[key].body + perDocZones[key].early === 0) {
                const alt = contextArr.slice(i + 1).find(x =>
                    x.type === 'Документ' && String(x.docId) === String(c.docId) && x.chunkIdx >= 2
                );
                if (alt) continue;
            }
            if (zone === 'head' && perDocZones[key].head >= 1) continue;
            perDocZones[key][zone]++;
        }
        perDoc[key] = n + 1;
        if (c.type === 'Документ') pdfPicked++;
        if (c.type === 'Чек-лист') clPicked++;
        picked.push(c);
    }

    const enriched = _finalizeAiDocSources(await _enrichPickedWithNormQuotes(picked, keywords));
    const quoteN = enriched.filter(c => c.isNormQuote || c.type === 'Цитата СП/ГОСТ').length;

    const sources = enriched.map(c => ({
        type: c.type,
        title: c.title,
        templateTitle: c.templateTitle || '',
        itemName: c.itemName || '',
        code: c.code || '',
        docId: c.docId,
        score: c.score,
        isNormQuote: !!(c.isNormQuote || c.type === 'Цитата СП/ГОСТ'),
        snippet: (c.snippet || c.text || '').slice(0, (c.isNormQuote || c.type === 'Цитата СП/ГОСТ') ? 520 : 280)
    }));

    const contextText = enriched
        .map(c => {
            if (c.type === 'Чек-лист') {
                return `[ИСТОЧНИК: Чек-лист — ${c.templateTitle || ''} → ${c.itemName || c.title}]\n${c.text}`;
            }
            if (c.isNormQuote || c.type === 'Цитата СП/ГОСТ') {
                return `[ИСТОЧНИК: Цитата СП/ГОСТ — ${c.code || c.title}]\n${c.text}`;
            }
            return `[ИСТОЧНИК: ${c.type} - ${c.title}]\n${c.text}`;
        })
        .join('\n\n');

    return {
        sources,
        contextText,
        empty: sources.length === 0,
        cleanQuestion,
        strongClCount,
        quoteN,
        workLocked,
        workTitle: workLocked && workHits[0] ? workHits[0].title : ''
    };
}

function _renderAiDocSourcesHtml(sources) {
    if (!sources || !sources.length) return '';
    const items = sources.map((s, i) => {
        let typeLabel = s.type;
        let label = s.title || '';
        const snipLimit = s.isNormQuote || s.type === 'Цитата СП/ГОСТ' ? 520 : 220;
        if (s.type === 'Чек-лист' && (s.templateTitle || s.itemName)) {
            typeLabel = _t('quality.ai.source.checklist', 'Чек-лист');
            label = `${s.templateTitle || '—'} → ${s.itemName || s.title || ''}`;
            if (s.code) label += ` · ${s.code}`;
        } else if (s.isNormQuote || s.type === 'Цитата СП/ГОСТ') {
            typeLabel = _t('quality.ai.source.pdf_quote', 'Цитата из PDF');
            label = s.code || s.title || _t('quality.ai.source.sp_gost', 'СП/ГОСТ');
            if (s.itemName) {
                const shortItem = s.itemName.length > 48 ? s.itemName.slice(0, 46) + '…' : s.itemName;
                label += ` · ${shortItem}`;
            }
        } else if (s.code) {
            label = s.code;
        }
        const snip = String(s.snippet || '');
        return `<div class="py-2 ${i ? 'border-t border-surface' : ''}">
            <div class="text-rbi-caption font-black uppercase text-brand">${_escAiDoc(typeLabel)}</div>
            <div class="text-rbi-label font-bold text-ink mt-0.5 leading-snug">${_escAiDoc(label)}</div>
            <div class="text-rbi-label text-muted mt-0.5 leading-snug">${_escAiDoc(snip)}${snip.length >= snipLimit ? '…' : ''}</div>
        </div>`;
    }).join('');
    return `<details class="mt-2 rounded-xl border border-surface bg-white/70 px-3 py-2">
        <summary class="cursor-pointer text-rbi-caption font-black uppercase tracking-widest text-muted select-none">${_t('quality.ai.sources.count', 'Источники ({count})', { count: sources.length })}</summary>
        <div class="mt-1">${items}</div>
    </details>`;
}

function _relatedMaterialsAppendix(cleanQuestion) {
    const strongKeywords = String(cleanQuestion || '').split(' ')
        .filter(w => w.length > 4)
        .map(w => (w.length > 6 ? w.substring(0, w.length - 2) : w));
    if (!strongKeywords.length) return { html: '', plain: '' };

    let tmplScores = [];
    const allTmpls = { ..._templates().getSystemTemplates(), ..._templates().getUserTemplates() };
    Object.values(allTmpls).forEach(tmpl => {
        let score = 0;
        const titleStr = String(tmpl.title || '').toLowerCase();
        strongKeywords.forEach(kw => { if (titleStr.includes(kw)) score += 10; });
        if (tmpl.groups) {
            tmpl.groups.forEach(g => {
                (g.items || []).forEach(item => {
                    const textToSearch = `${item.n} ${item.t}`.toLowerCase();
                    strongKeywords.forEach(kw => { if (textToSearch.includes(kw)) score += 1; });
                });
            });
        }
        if (score >= 2) tmplScores.push({ title: tmpl.title, score });
    });

    let twiScores = [];
    _getTwiCards().forEach(twi => {
        let score = 0;
        const textToSearch = `${twi.title} ${twi.whyImportant || ''} ${twi.howToCheck || ''}`.toLowerCase();
        strongKeywords.forEach(kw => { if (textToSearch.includes(kw)) score += 2; });
        if (score >= 2) twiScores.push({ title: twi.title, score });
    });

    tmplScores.sort((a, b) => b.score - a.score);
    twiScores.sort((a, b) => b.score - a.score);
    const topChecklists = tmplScores.slice(0, 2).map(t => t.title);
    const topTwis = twiScores.slice(0, 2).map(t => t.title);
    if (!topChecklists.length && !topTwis.length) return { html: '', plain: '' };

    let html = `<div class="mt-2 p-3 bg-brand-soft rounded-xl border border-brand-soft text-rbi-label text-brand leading-relaxed">`;
    html += `<b>${_t('quality.ai.related.title_html', 'Связанные материалы в приложении')}</b>`;
    if (topChecklists.length) html += `<span class="mt-1 block">${_t('quality.ai.related.checklists', '• Чек-листы: ')}<b>${_escAiDoc(topChecklists.join(', '))}</b></span>`;
    if (topTwis.length) html += `<span class="mt-1 block">${_t('quality.ai.related.twi', '• TWI-карты: ')}<b>${_escAiDoc(topTwis.join(', '))}</b></span>`;
    html += `</div>`;
    let plain = _t('quality.ai.related.plain_title', '\n\nСвязанные материалы:');
    if (topChecklists.length) plain += _t('quality.ai.related.plain_checklists', '\nЧек-листы: {list}', { list: topChecklists.join(', ') });
    if (topTwis.length) plain += _t('quality.ai.related.plain_twi', '\nTWI: {list}', { list: topTwis.join(', ') });
    return { html, plain };
}

async function askAiDocQuestion() {
    const inputEl = document.getElementById('ai-chat-input');
    const chatHistory = document.getElementById('ai-chat-history');
    const btn = document.getElementById('ai-chat-send-btn');
    if (!inputEl || !chatHistory || !btn) return;

    const question = inputEl.value.trim();
    if (!question) return;

    const filterEl = document.getElementById('ai-doc-filter');
    const docId = filterEl ? filterEl.value : '';
    const tmplEl = document.getElementById('ai-doc-template-filter');
    const templateKey = tmplEl ? tmplEl.value : '';

    chatHistory.insertAdjacentHTML('beforeend', `
        <div class="flex gap-2 w-full max-w-[92%] ml-auto justify-end">
            <div class="bg-brand text-white p-3 rounded-2xl rounded-tr-none text-rbi-body shadow-sm">${_escAiDoc(question)}</div>
        </div>`);
    inputEl.value = '';
    inputEl.focus();

    const loaderId = 'loader_' + Date.now();
    chatHistory.insertAdjacentHTML('beforeend', `
        <div id="${loaderId}" class="flex gap-2 w-full max-w-[95%]">
 <div class="w-7 h-7 bg-brand-soft rounded-full flex items-center justify-center text-rbi-label shrink-0"></div>
            <div class="bg-surface border border-surface p-3 rounded-2xl rounded-tl-none text-rbi-body text-muted shadow-sm animate-pulse">
                ${_t('quality.ai.status.searching_loader', 'Ищу в чек-листах и нормативах…')}
            </div>
        </div>`);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    const appendAnswer = (bodyHtml, plainText, sources, statusText, relatedExtra) => {
        const node = document.getElementById(loaderId);
        if (node) node.remove();
        const related = relatedExtra || { html: '', plain: '' };
        const sourcesHtml = _renderAiDocSourcesHtml(sources || []);
        const plainId = 'aidoc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        _aiDocPlainById[plainId] = String(plainText || '') + (related.plain || '');
        chatHistory.insertAdjacentHTML('beforeend', `
            <div class="flex gap-2 w-full max-w-[95%]" data-ai-doc-id="${plainId}">
                <div class="w-7 h-7 bg-brand text-white rounded-full flex items-center justify-center text-rbi-caption shrink-0 font-bold shadow-md">AI</div>
                <div class="min-w-0 flex-1 bg-brand-soft border border-brand-soft p-3 rounded-2xl rounded-tl-none text-rbi-body text-ink shadow-sm leading-relaxed font-medium">
                    <div class="ai-doc-answer-body">${bodyHtml}</div>
                    ${sourcesHtml}
                    ${related.html || ''}
                    <div class="mt-2 flex gap-2">
                        <button type="button" onclick="copyAiDocAnswer(this)" class="flex-1 bg-surface text-brand border border-brand-soft py-2 rounded-lg text-rbi-caption font-black uppercase active:scale-95">${_t('quality.ai.btn.copy', 'Копировать')}</button>
                    </div>
                </div>
            </div>`);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        _setAiDocStatus(statusText || '');
        const chipHints = (sources || [])
            .filter(s => s.type === 'Чек-лист' && (s.itemName || s.title))
            .map(s => s.itemName || s.title)
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 4);
        if (chipHints.length) _renderAiDocChips(chipHints);
    };

    // Каталог базы — мгновенно, без обхода PDF и без DeepSeek (иначе UI «зависает»)
    if (_isAiDocCatalogQuestion(question)) {
        const catalog = _buildAiDocCatalogAnswer();
        appendAnswer(catalog.html, catalog.plain, [], _t('quality.ai.status.catalog', 'Список документов из каталога'));
        return;
    }

    const expanded = _expandAiDocQuery(question);
    let usedRewrite = false;

    _setAiDocStatus(docId ? _t('quality.ai.status.search_doc', 'Поиск в выбранном документе…') : (templateKey ? _t('quality.ai.status.search_work', 'Поиск в выбранном виде работ…') : _t('quality.ai.status.search_all', 'Поиск по чек-листам и PDF…')));

    let retrieved;
    try {
        retrieved = await _retrieveNormContext(expanded.searchText, {
            docId,
            templateKey,
            extraKeywords: expanded.expandedKeywords,
            originalQuestion: question
        });
    } catch (e) {
        appendAnswer(
            `<p class="mb-0 text-danger">${_escAiDoc(_t('quality.ai.error.search_prefix', 'Ошибка поиска по базе: {message}', { message: e.message || e }))}</p>`,
            _t('quality.ai.error.search_plain', 'Ошибка поиска по базе'),
            [],
            _t('quality.ai.status.search_error', 'Ошибка поиска')
        );
        return;
    }

    // Rewrite только если вид работ неясен и хиты слабые (иначе «кровля» → rewrite → газобетон)
    const workLocked = !!(retrieved.workLocked || (_detectWorkTemplateKeys(question)[0] || {}).score >= 40);
    const weakFirst = !workLocked && (retrieved.strongClCount || 0) < 2;
    if (weakFirst) {
        try {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            _setAiDocStatus(_t('quality.ai.status.refine', 'Уточняю формулировку…'));
            const rewritten = await _rewriteAiDocQueryForSearch(question);
            if (rewritten && rewritten.length > 8 && rewritten.toLowerCase() !== question.toLowerCase()) {
                usedRewrite = true;
                const expanded2 = _expandAiDocQuery(rewritten);
                _setAiDocStatus(_t('quality.ai.status.search_norms_short', 'Ищу по нормам…'));
                const second = await _retrieveNormContext(expanded2.searchText, {
                    docId,
                    templateKey,
                    extraKeywords: [
                        ...expanded.expandedKeywords,
                        ...expanded2.expandedKeywords
                    ],
                    originalQuestion: question
                });
                const better = !second.empty && (
                    (second.strongClCount || 0) > (retrieved.strongClCount || 0)
                    || (retrieved.empty && !second.empty)
                    || ((second.sources || []).length > (retrieved.sources || []).length)
                );
                if (better) retrieved = second;
            }
        } catch (e) {
            // остаёмся на локальном результате
            console.warn('[askAiDocQuestion] rewrite skipped', e.message || e);
        }
    }

    // При уже найденных пунктах чек-листа блок «связанные» только шумит
    const hasClSrc = (retrieved.sources || []).some(s => s.type === 'Чек-лист');
    const related = hasClSrc
        ? { html: '', plain: '' }
        : _relatedMaterialsAppendix(retrieved.cleanQuestion || expanded.searchText);

    if (retrieved.empty) {
        const msg = _t('quality.ai.empty.no_answer', 'В загруженной базе нет точного ответа по этому запросу. Уточните формулировку, укажите шифр СП/ГОСТ, выберите вид работ или документ в фильтре.');
        appendAnswer(`<p class="mb-0">${_escAiDoc(msg)}</p>`, msg, [], _t('quality.ai.status.no_fragments', 'Нет фрагментов · {intent}', { intent: expanded.intent }), related);
        btn.disabled = false;
        btn.style.opacity = '1';
        return;
    }

    // Защита от гигантского промпта
    let contextText = retrieved.contextText || '';
    if (contextText.length > 14000) {
        contextText = contextText.slice(0, 14000) + '\n\n[…контекст обрезан…]';
    }

    const hasNumericInBase = /\d+\s*мм|[≤≥±]|не более|не менее|допуск/i.test(contextText);
    const hasNormQuote = /\[ИСТОЧНИК: Цитата СП\/ГОСТ/i.test(contextText)
        || (retrieved.quoteN || 0) > 0;

    const promptSystem = `Ты — главный эксперт технического надзора. Отвечаешь инженеру строго по переданной БАЗЕ ЗНАНИЙ.
Инженер спрашивает простым языком — отвечай коротко и по делу, но только фактами из базы.

ПРАВИЛА:
1. Опирайся ТОЛЬКО на фрагменты в блоке «БАЗА ЗНАНИЙ». Не используй внешние знания и не давай советов «из опыта».
2. Приоритет: пункт ЧЕК-ЛИСТА указывает норму; блок «Цитата СП/ГОСТ» — перепроверка по тексту документа. Цифры и формулировки бери из цитаты СП/ГОСТ, если она есть; чек-лист — для навигации (какой пункт/таблица).
3. Если есть «Цитата СП/ГОСТ» — в «Основании» приведи фрагмент с допуском/мм из цитаты. Если в блоке цитаты только предисловие/«КонсультантПлюс» без мм — не выдавай это за текст нормы; опирайся на чек-лист и скажи, что полный текст таблицы в выборке не найден.
4. Если в базе нет ответа — напиши дословно: «В загруженной базе нет точного ответа».
5. Указывай шифр (ГОСТ/СП/СНиП) и пункт чек-листа / таблицу из базы.
6. Учитывай вид работ СТРОГО. Кровля ≠ газобетон/кладка; монолит ≠ НФС/фасад. Если в базе чек-лист кровли — не отвечай про кладку стен и наоборот.
7. ${hasNumericInBase
        ? 'В БАЗЕ ЕСТЬ числа/мм/допуски — НАЧНИ ответ с конкретной цифры (или диапазона) из базы (предпочтительно из цитаты СП/ГОСТ). Запрещены общие фразы без числа.'
        : 'Если чисел в базе нет — так и скажи; не выдумывай мм.'}
8. Формат (обычный текст, можно **жирный** и списки «- »):
   1) Краткий ответ — сначала цифра/допуск, если есть в базе
   2) Основание: чек-лист → пункт + шифр${hasNormQuote ? ' + цитата из СП/ГОСТ' : ''}
   3) На что обратить внимание — только если следует из базы; иначе пропусти

БАЗА ЗНАНИЙ:
${contextText}`;

    try {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        _setAiDocStatus(_t('quality.ai.status.formulating', 'Формулирую ответ…'));
        const response = await _withTimeout(
            callAI([
                { role: 'system', content: promptSystem },
                { role: 'user', content: question }
            ], { temperature: 0.2, max_tokens: 2000, raw: true }),
            55000,
            _t('quality.ai.error.timeout_55', 'Нейросеть не ответила за 55 секунд. Попробуйте более узкий вопрос или проверьте сеть.')
        );

        const plain = String(response || '').replace(/\*\*/g, '').trim();
        const clN = (retrieved.sources || []).filter(s => s.type === 'Чек-лист').length;
        const qN = retrieved.quoteN || (retrieved.sources || []).filter(s => s.isNormQuote || s.type === 'Цитата СП/ГОСТ').length;
        const statusBits = [
            `intent:${expanded.intent}`,
            retrieved.workTitle ? `вид:${retrieved.workTitle}` : null,
            `ист:${retrieved.sources.length}`,
            clN ? `CL:${clN}` : null,
            qN ? `цит:${qN}` : null,
            usedRewrite ? 'rewrite' : null
        ].filter(Boolean);
        appendAnswer(
            _formatAiRichText(response),
            plain,
            retrieved.sources,
            statusBits.join(' · '),
            related
        );
        _gameLogAction('ai_generate', 'doc_chat');
    } catch (e) {
        const node = document.getElementById(loaderId);
        if (node) node.remove();
        chatHistory.insertAdjacentHTML('beforeend', `
            <div class="flex gap-2 w-full max-w-[95%]">
 <div class="w-7 h-7 bg-danger-soft rounded-full flex items-center justify-center text-rbi-label shrink-0"></div>
                <div class="bg-danger-soft text-danger border border-danger-soft p-3 rounded-2xl rounded-tl-none text-rbi-body shadow-sm">
                    ${_escAiDoc(e.message || e)}
                </div>
            </div>`);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        _setAiDocStatus(_t('quality.ai.status.timeout', 'Ошибка или таймаут'));
    } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

// ГЕНЕРАЦИЯ ПРОТОКОЛА ЧЕРЕЗ DEEPSEEK (Умный сбор данных)
async function rbi_generateMeetingMemo() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings', '⚠️ Включите AI-ассистента в Настройках!'));

    // СБОР ДАННЫХ ИЗ ИНТЕРАКТИВНЫХ БЛОКОВ С ЖЕСТКОЙ ГРУППИРОВКОЙ
    let agendaMap = {};
    let totalItems = 0;
    const rows = document.querySelectorAll('.meeting-agenda-row');

    rows.forEach(row => {
        const contr = row.querySelector('.agenda-meta-contr').value;
        const defect = row.querySelector('.agenda-meta-defect').value;
        const isDone = row.querySelector('.agenda-done-cb').checked;
        const date = row.querySelector('.agenda-date').value;
        const resp = row.querySelector('.agenda-resp').value.trim();
        const comment = row.querySelector('.agenda-comment').value.trim();

        if (isDone || date || resp || comment) {
            if (!agendaMap[contr]) agendaMap[contr] = [];
            agendaMap[contr].push(`- Проблема: ${defect}. Статус: ${isDone ? 'Решено' : 'В работе'}. Срок: ${date || 'Не указан'}. Отв: ${resp || 'Не назначен'}. Решение: ${comment || 'Не указано'}.`);
            totalItems++;
        }
    });

    let agendaContextString = "";
    for (let c in agendaMap) {
        agendaContextString += `ПОДРЯДЧИК: ${c}\n${agendaMap[c].join('\n')}\n\n`;
    }

    const extraNotes = document.getElementById('rbi-meeting-notes').value.trim();

    if (totalItems === 0 && !extraNotes) {
        return showToast(_t('quality.ai.toast.memo_need_items', '⚠️ Укажите решение хотя бы по одному дефекту или напишите дополнительные тезисы!'));
    }

    const btn = document.getElementById('btn-gen-memo');
    btn.innerHTML = `<span class="animate-pulse">${_t('quality.ai.loading.memo', '⏳ Нейросеть пишет протокол...')}</span>`;
    btn.disabled = true;

    const promptSystem = `Ты — секретарь-инженер. Составь итоговый протокол строительного совещания (Мемо).
    Я передам тебе уже сгруппированные по подрядчикам данные. Твоя задача — превратить это в красивый деловой текст без лишней воды.
    Формат ответа СТРОГО:
    **ПРОТОКОЛ СОВЕЩАНИЯ ПО КАЧЕСТВУ**
    
    [ИМЯ ПОДРЯДЧИКА 1]
    - [Кратко суть проблемы]. Решение: [Что делать]. Отв: [...]. Срок: [...].
    - [Следующая проблема]...
    
    [ИМЯ ПОДРЯДЧИКА 2]...
    `;

    const promptUser = `ДАННЫЕ ДЛЯ ПРОТОКОЛА:\n\n${agendaContextString}\nДОП. ВОПРОСЫ: ${extraNotes}`;

    try {
        const response = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: promptUser }
        ], { temperature: 0.2, max_tokens: 800 });

        // Вставляем результат и увеличиваем текстовое поле для удобства чтения
        // callAI превращает ** → <b>; в textarea нужны читаемые символы без тегов.
        const textArea = document.getElementById('rbi-meeting-memo-text');
        textArea.value = meetingRichToPlain(response);
        textArea.classList.remove('h-32');
        textArea.classList.add('h-64');

        // Скроллим вниз, чтобы юзер увидел результат
        setTimeout(() => {
            textArea.scrollIntoView({ behavior: "smooth", block: "end" });
        }, 100);

        _gameLogAction('ai_generate', 'meeting_memo');
        showToast(_t('quality.ai.toast.memo_done', '✅ Протокол успешно сформирован!'));
    } catch (e) {
        showToast(_t('quality.ai.error.ai_prefix_plain', '❌ Ошибка ИИ: {message}', { message: e.message }));
    } finally {
        btn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> ${_t('quality.ai.btn.gen_memo', 'Сформировать протокол (ИИ)')}`;
        btn.disabled = false;
    }
};

async function rbi_generatePracticeTitleAi() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_ai_settings', 'Включите AI в настройках!'));

    const prob = document.getElementById('rbi-prac-problem').value;
    const sol = document.getElementById('rbi-prac-solution').value;

    showToast(_t('quality.ai.toast.title_generating', '🔄 Нейросеть генерирует заголовок...'));
    try {
        const res = await callAI([
            { role: 'system', content: 'Ты редактор бизнес-кейсов. Сделай ОДИН короткий емкий заголовок (до 6 слов) описывающий суть улучшения. Без кавычек.' },
            { role: 'user', content: `Проблема: ${prob}. Решение: ${sol}` }
        ], { temperature: 0.4, max_tokens: 30 });
        document.getElementById('rbi-prac-title').value = meetingRichToPlain(res);
    } catch (e) { showToast(_t('quality.ai.toast.ai_error_retry_short', '🔄 Ошибка AI')); }
};

async function rbi_beautifyPracticeAi() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_ai_settings', 'Включите AI в настройках!'));

    const probEl = document.getElementById('man-prac-problem');
    const solEl = document.getElementById('man-prac-solution');
    const prob = probEl.value.trim();
    const sol = solEl.value.trim();

    if (!prob && !sol) return showToast(_t('quality.ai.toast.describe_something', 'Опишите хотя бы что-то, чтобы ИИ мог помочь!'));

    showToast(_t('quality.ai.toast.formulating_text', 'Нейросеть формулирует текст...'));

    const promptSystem = `Ты — эксперт-инженер. Твоя задача — красиво, технически грамотно и лаконично переписать текст пользователя для базы 'Лучших практик' компании.
    Верни ответ СТРОГО в таком формате:
    СУТЬ (ПРОБЛЕМА): [грамотное описание проблемы]
    РЕШЕНИЕ (РЕЗУЛЬТАТ): [грамотное описание решения]`;

    try {
        const res = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: `Исходник.\nЧто делали/Проблема: ${prob}\nРешение/Результат: ${sol}` }
        ], { temperature: 0.3, max_tokens: 300 });

        const pMatch = res.match(/СУТЬ \(ПРОБЛЕМА\):\s*(.*?)(?=РЕШЕНИЕ \(РЕЗУЛЬТАТ\):|$)/is);
        const sMatch = res.match(/РЕШЕНИЕ \(РЕЗУЛЬТАТ\):\s*(.*?)$/is);

        if (pMatch) probEl.value = meetingRichToPlain(pMatch[1].trim());
        if (sMatch) solEl.value = meetingRichToPlain(sMatch[1].trim());
        showToast(_t('quality.ai.toast.text_improved_short', '✅ Текст улучшен!'));
    } catch (e) { showToast(_t('quality.ai.error.ai_prefix', '⚠️ Ошибка AI: {message}', { message: e.message })); }
};

/**
 * Тексты для отчёта «Повторяющиеся дефекты».
 * opts.mode: 'draft' | 'improve'
 * opts.onProgress?: (batchNum, totalBatches) => void
 * Батчи по 3 карточки (как ПК СК — пакеты + пауза), иначе один большой JSON «захлёбывается».
 */
async function generateDefectRemediationTexts(cards, opts = {}) {
    const list = Array.isArray(cards) ? cards : [];
    if (!list.length) return {};

    if (!_getSetting('aiEnabled')) {
        throw new Error(_t('quality.ai.error.enable_assistant_settings', 'Включите AI-ассистента в Настройках'));
    }

    const mode = opts.mode === 'improve' ? 'improve' : 'draft';
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    // 3 карточки × ~6 полей — безопасный объём ответа; 200 как в SK здесь нельзя
    const BATCH_SIZE = 3;
    const FIELD_MAX = 280;
    const clip = (s) => {
        const t = stripAiHtml(s || '');
        return t.length > FIELD_MAX ? `${t.slice(0, FIELD_MAX)}…` : t;
    };

    const promptRules = `Правила содержания (обязательно):
- Опирайся на «Дефект (пункт)», «Норма/текст пункта», вид работ и комментарии — не выдумывай другие виды работ.
- ЗАПРЕЩЕНЫ пустые общие фразы: «усилить контроль», «усилить надзор», «повысить культуру качества», «провести обучение» без темы, «обратить внимание», «не допускать», «строго соблюдать технологию» без деталей.
- description: что именно не так на объекте (по пункту + комментарию), 1–2 предложения.
- causeRisk: типовая корневая причина ДЛЯ ЭТОГО пункта (материал/операция/оборудование/последовательность) + конкретный риск (переделка, протечка, отказ приёмки, безопасность) — не «снижение качества».
- fix: конкретные действия устранения (что переделать/демонтировать/заменить, чем проверить, критерий «готово»).
- prevention: конкретная профилактика (входной контроль чего, контрольная точка на каком этапе, шаблон/чек до закрытия, ответственный пост) — без «усилить контроль».
- deadline: реалистичный срок (напр. «3 дня», «до следующей приёмки»).
- responsible: роль/должность (прораб подрядчика, инженер качества РБИ…), без выдуманных ФИО.
- Поля короткие: description/causeRisk/fix/prevention до 2 предложений каждое.
Пиши по-русски, деловым языком отчёта.`;

    const promptSystem = mode === 'improve'
        ? `Ты — главный инженер качества. Улучши текст инженера по повторяющимся дефектам: сохрани смысл, сделай яснее и конкретнее для отчёта руководству.
${promptRules}
Верни ТОЛЬКО валидный JSON-массив (без markdown, без \`\`\`, без HTML-тегов).
Каждый объект: "index" (число из INDEX), "id" (строка ID), "description", "causeRisk", "fix", "prevention", "deadline", "responsible".`
        : `Ты — главный инженер качества на стройке. По списку повторяющихся дефектов заполни черновик отчёта.
${promptRules}
Верни ТОЛЬКО валидный JSON-массив (без markdown, без \`\`\`, без HTML-тегов).
Каждый объект: "index" (число из INDEX), "id" (строка ID), "description", "causeRisk", "fix", "prevention", "deadline", "responsible".`;

    const buildContextLine = (c, localIdx, globalIdx) => {
        const id = c.id || `idx_${globalIdx}`;
        const f = c.fields || {};
        return [
            `INDEX ${localIdx}`,
            `ID ${id}`,
            `Подрядчик: ${clip(c.contractor || '—')}`,
            `Вид работ: ${clip(c.workType || '—')}`,
            `Дефект (пункт): ${clip(c.defectName || '—')}`,
            `Норма/текст пункта: ${clip(c.itemText || '—')}`,
            `Повторов: ${c.count || 0}`,
            `Комментарий: ${clip(c.commentHint || '—')}`,
            `Текущее описание: ${clip(f.description || '—')}`,
            `Текущие причины/риски: ${clip(f.causeRisk || '—')}`,
            `Текущие меры устранения: ${clip(f.fix || '—')}`,
            `Текущие меры предотвращения: ${clip(f.prevention || '—')}`,
            `Срок: ${clip(f.deadline || '—')}`,
            `Ответственный: ${clip(f.responsible || '—')}`,
        ].join(' | ');
    };

    const mergeBatchRows = (map, aiData, batch, globalOffset) => {
        aiData.forEach((row, rowIdx) => {
            if (!row) return;
            const clean = {
                description: stripAiHtml(row.description),
                causeRisk: stripAiHtml(row.causeRisk || row.impact),
                impact: stripAiHtml(row.causeRisk || row.impact),
                fix: stripAiHtml(row.fix),
                prevention: stripAiHtml(row.prevention),
                deadline: stripAiHtml(row.deadline),
                responsible: stripAiHtml(row.responsible),
            };
            let globalIdx = globalOffset + rowIdx;
            if (row.id != null) {
                map[String(row.id)] = clean;
                const byIdPos = batch.findIndex((c) => String(c.id) === String(row.id));
                if (byIdPos >= 0) globalIdx = globalOffset + byIdPos;
            }
            const localIdx = row.index != null ? Number(row.index) : rowIdx;
            if (!Number.isNaN(localIdx) && localIdx >= 0 && localIdx < batch.length) {
                globalIdx = globalOffset + localIdx;
                const card = batch[localIdx];
                if (card && card.id != null) map[String(card.id)] = clean;
            }
            map[`idx_${globalIdx}`] = clean;
        });
        // fallback по порядку в пакете
        batch.forEach((c, localIdx) => {
            const gIdx = globalOffset + localIdx;
            const byId = c.id != null ? map[String(c.id)] : null;
            const byLocal = map[`idx_${gIdx}`];
            const picked = byId || byLocal;
            if (!picked) return;
            if (c.id != null) map[String(c.id)] = picked;
            map[`idx_${gIdx}`] = picked;
        });
    };

    const totalBatches = Math.ceil(list.length / BATCH_SIZE);
    const map = {};
    let okBatches = 0;
    let lastError = null;

    for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
        const start = (batchNum - 1) * BATCH_SIZE;
        const batch = list.slice(start, start + BATCH_SIZE);
        if (onProgress) onProgress(batchNum, totalBatches);
        else if (typeof showToast === 'function' && totalBatches > 1) {
            showToast(_t('quality.ai.toast.batch_progress', '🔄 ИИ: пакет {batch} из {total}…', { batch: batchNum, total: totalBatches }));
        }

        const contextLines = batch
            .map((c, localIdx) => buildContextLine(c, localIdx, start + localIdx))
            .join('\n');

        try {
            const responseText = await callAI([
                { role: 'system', content: promptSystem },
                {
                    role: 'user',
                    content: `${mode === 'improve' ? 'Улучши записи инженера' : 'Сформируй черновик'} (пакет ${batchNum}/${totalBatches}, ${batch.length} шт.; по каждому INDEX отдельно, без копипаста общих мер):\n${contextLines}`,
                },
            ], {
                temperature: 0.35,
                max_tokens: Math.min(3500, 700 + batch.length * 450),
                raw: true,
            });

            let raw = String(responseText || '').trim();
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
            const jsonMatch = raw.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.warn('[generateDefectRemediationTexts] no JSON in batch', batchNum, raw.slice(0, 300));
                throw new Error(_t('quality.ai.error.batch_no_json', 'Пакет {batch}: ИИ не вернул JSON-массив', { batch: batchNum }));
            }
            const aiData = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(aiData)) throw new Error(_t('quality.ai.error.batch_not_array', 'Пакет {batch}: ответ не массив', { batch: batchNum }));
            mergeBatchRows(map, aiData, batch, start);
            okBatches += 1;
        } catch (e) {
            lastError = e;
            console.warn('[generateDefectRemediationTexts] batch', batchNum, e);
            if (typeof showToast === 'function' && totalBatches > 1) {
                showToast(_t('quality.ai.toast.batch_error_continue', '⚠️ Ошибка ИИ на пакете {batch}. Продолжаем…', { batch: batchNum }));
            }
        }

        // Пауза между пакетами — как в sk_autoMapCategories, чтобы не упереться в rate limit
        if (batchNum < totalBatches) {
            await new Promise((r) => setTimeout(r, 2500));
        }
    }

    if (!okBatches) {
        throw lastError || new Error('ИИ не вернул данные ни по одному пакету');
    }
    return map;
}

// 3. АВТОЗАПОЛНЕНИЕ FMEA ЧЕРЕЗ DEEPSEEK
async function rbi_fillFmeaWithAi() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings_exact', 'Включите AI-ассистента в Настройках!'));

    const rows = document.querySelectorAll('.fmea-row');
    if (rows.length === 0) return;

    const btn = document.getElementById('btn-fmea-ai');
    btn.innerHTML = `<span class="animate-pulse">${_t('quality.ai.loading.thinking', '⏳ Нейросеть думает...')}</span>`;
    btn.disabled = true;

    let defectsContext = [];
    rows.forEach((row, idx) => {
        const contr = row.querySelector('.f-contr').value;
        const work = row.querySelector('.f-work').value;
        const defect = row.querySelector('.f-defect').value;
        defectsContext.push(`ID ${idx}: Подрядчик [${contr}], Работа [${work}], Дефект [${defect}].`);
    });

    const promptSystem = `Ты — Главный Инженер Качества. Проведи FMEA-анализ (Анализ видов и последствий отказов) списка частых дефектов.
    Твоя задача — вернуть строго JSON-массив. Для каждого дефекта (по его ID) сформируй объект с ключами:
    "stage" - этап возникновения (выбери одно: "Ошибки СМР", "Проект", "Материалы", "Условия").
    "cause" - коренная причина дефекта (почему рабочие так делают? 1 предложение).
    "effect" - последствия дефекта для здания (1 предложение).
    "fix" - предложение по устранению уже допущенного брака (1 предложение).
    "prevent" - системная мера по предотвращению в будущем (1 предложение).
    "rpn" - число Risk Priority Number от 1 до 1000 (Severity * Occurrence * Detection). Чем опаснее дефект, тем выше RPN.`;

    try {
        const responseText = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: `Анализируй эти дефекты и верни массив JSON (порядок как в списке):\n${defectsContext.join('\n')}` }
        ], { temperature: 0.3, max_tokens: 2000 });

        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error(_t('quality.ai.error.no_json', 'Нейросеть не вернула JSON'));

        const aiData = JSON.parse(jsonMatch[0]);

        rows.forEach((row, idx) => {
            if (aiData[idx]) {
                const data = aiData[idx];
                const stageSel = row.querySelector('.f-stage');
                if (Array.from(stageSel.options).some(opt => opt.value === data.stage)) {
                    stageSel.value = data.stage;
                }
                row.querySelector('.f-cause').value = data.cause || '';
                row.querySelector('.f-effect').value = data.effect || '';
                row.querySelector('.f-fix').value = data.fix || '';
                row.querySelector('.f-prevent').value = data.prevent || '';
                row.querySelector('.f-rpn').value = data.rpn || 0;
            }
        });

        _gameLogAction('fmea_master', 'fmea_' + Date.now().toString(36));
        showToast(_t('quality.ai.toast.fmea_filled', '✅ Мега-таблица FMEA заполнена нейросетью!'));
    } catch (e) {
        showToast(_t('quality.ai.error.ai_retry', '❌ Ошибка ИИ (попробуйте еще раз): {message}', { message: e.message }));
    } finally {
        btn.innerHTML = _t('quality.ai.btn.autofill', '🤖 Автозаполнение (ИИ)');
        btn.disabled = false;
    }
};

// 3. ВОРКШОП С БРИГАДОЙ — сценарий в отдельном окне (как heatmap AI)
let _workshopAiLast = { html: '', plain: '', taskId: '' };

function closeWorkshopAiModal() {
    const modal = document.getElementById('workshop-ai-modal');
    if (modal) modal.style.display = 'none';
}

function copyWorkshopAiText() {
    const plain = _workshopAiLast.plain || '';
    if (!plain) return showToast(_t('quality.ai.toast.nothing_to_copy', 'Нечего копировать'));
    const done = () => showToast(_t('quality.ai.toast.copied', 'Скопировано'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(plain).then(done).catch(() => {
            try {
                const ta = document.createElement('textarea');
                ta.value = plain;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                done();
            } catch (e) {
                showToast(_t('quality.ai.toast.copy_failed', 'Не удалось скопировать'));
            }
        });
        return;
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = plain;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        done();
    } catch (e) {
        showToast(_t('quality.ai.toast.copy_failed', 'Не удалось скопировать'));
    }
}

function reopenWorkshopAiModal() {
    if (!_workshopAiLast.html) return showToast(_t('quality.ai.toast.generate_scenario_first', 'Сначала сгенерируйте сценарий'));
    openWorkshopAiModal({ html: _workshopAiLast.html, plain: _workshopAiLast.plain });
}

function _constrainAiScenarioPanel(panel) {
    if (!panel) return;
    // Tailwind max-h-[94vh] из JS-строк часто не попадает в CSS → панель
    // растягивается под контент и текст «не влезает» без скролла.
    panel.style.maxHeight = 'min(94vh, 100dvh)';
    panel.style.height = 'auto';
    panel.style.overflow = 'hidden';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.width = '100%';
    panel.style.maxWidth = '48rem';
}

function openWorkshopAiModal(opts) {
    const options = opts || {};
    const loading = !!options.loading;
    if (options.plain != null) _workshopAiLast.plain = options.plain;
    if (options.html != null && !loading) _workshopAiLast.html = options.html;
    if (options.taskId) _workshopAiLast.taskId = options.taskId;

    let modal = document.getElementById('workshop-ai-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
<div id="workshop-ai-modal" class="fixed inset-0 bg-surface/80 z-[6000] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm" onclick="if(event.target===this)closeWorkshopAiModal()">
  <div class="bg-[var(--card-bg)] w-full max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl border border-[var(--card-border)] flex flex-col overflow-hidden" style="max-height:min(94vh,100dvh)" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="workshop-ai-modal-title">
    <div class="flex items-center justify-between gap-2 px-4 sm:px-5 pt-4 pb-3 border-b border-[var(--card-border)] shrink-0">
      <h3 id="workshop-ai-modal-title" class="font-black text-rbi-body uppercase tracking-tight text-ink">${_t('quality.ai.title.workshop', 'Разбор дефектов')}</h3>
      <button type="button" onclick="closeWorkshopAiModal()" class="text-muted hover:text-danger px-2 text-lg leading-none" aria-label="${_t('quality.ai.btn.close', 'Закрыть')}">✕</button>
    </div>
    <div id="workshop-ai-modal-body" class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-5 py-4 text-rbi-body sm:text-rbi-title leading-relaxed text-ink whitespace-pre-wrap" style="min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch"></div>
    <div class="flex gap-2 p-4 pt-3 border-t border-[var(--card-border)] shrink-0 bg-[var(--card-bg)]">
      <button type="button" id="workshop-ai-modal-copy" onclick="copyWorkshopAiText()" class="flex-1 bg-purple-600 text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-md active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
        ${_t('quality.ai.btn.copy', 'Копировать')}
      </button>
      <button type="button" onclick="closeWorkshopAiModal()" class="flex-1 bg-surface text-muted py-3.5 rounded-xl font-bold text-rbi-label uppercase border border-surface active:scale-95">${_t('quality.ai.btn.close', 'Закрыть')}</button>
    </div>
  </div>
</div>`);
        modal = document.getElementById('workshop-ai-modal');
    }

    const panel = modal.querySelector('[role="dialog"]');
    _constrainAiScenarioPanel(panel);

    const body = document.getElementById('workshop-ai-modal-body');
    const copyBtn = document.getElementById('workshop-ai-modal-copy');
    if (body) {
        body.style.minHeight = '0';
        body.style.overflowY = 'auto';
        body.style.WebkitOverflowScrolling = 'touch';
        if (loading) {
            body.innerHTML = `<span class="animate-pulse text-purple-500 dark:text-purple-300 font-bold">${_t('quality.ai.loading.workshop', 'Формируется разбор дефектов…')}</span>`;
        } else {
            body.innerHTML = options.html || _workshopAiLast.html || '—';
            body.scrollTop = 0;
        }
    }
    if (copyBtn) copyBtn.disabled = loading || !_workshopAiLast.plain;
    modal.style.display = 'flex';
}

function _setWorkshopAiTeaser(state) {
    const teaser = document.getElementById('workshop-ai-teaser');
    if (!teaser) return;
    teaser.classList.remove('hidden');
    if (state === 'loading') {
        teaser.innerHTML = `<span class="text-purple-600 dark:text-purple-300 font-bold animate-pulse text-rbi-body">${_t('quality.ai.loading.workshop_teaser', 'Разбор дефектов формируется…')}</span>`;
        return;
    }
    if (state === 'error') {
        teaser.innerHTML = `<span class="text-danger font-bold text-rbi-body">${_t('quality.ai.error.ai_link_plain', 'Ошибка связи с нейросетью')}</span>`;
        return;
    }
    teaser.innerHTML = `
        <div class="flex flex-col gap-2">
            <p class="text-rbi-body font-bold text-ink">${_t('quality.ai.teaser.review_ready', 'Разбор готов — полный текст в отдельном окне.')}</p>
            <button type="button" onclick="reopenWorkshopAiModal()" class="w-full bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 py-2.5 rounded-xl font-bold text-rbi-caption uppercase active:scale-95">${_t('quality.ai.btn.open_review', 'Открыть разбор')}</button>
        </div>`;
}

function _syncWorkshopScenarioField(plain) {
    const txtArea = document.getElementById('workshop-ai-scenario');
    if (txtArea) txtArea.value = plain || '';
    window._workshopAiLastPlain = plain || '';
}

async function rbi_generateWorkshop(taskId) {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant', 'Включите AI-ассистента!'));
    const task = _getTasks().find(t => t.id === taskId);
    if (!task) return;

    const btn = document.getElementById('btn-gen-workshop');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-60');
    }
    _setWorkshopAiTeaser('loading');
    openWorkshopAiModal({ loading: true, taskId: taskId });
    const actions = document.getElementById('workshop-actions');
    if (actions) actions.classList.remove('hidden');

    const relatedTwi = typeof customTwiCards !== 'undefined' ? _getTwiCards().find(c => c.checklistKey === task.templateKey) : null;
    let twiContext = relatedTwi
        ? `При необходимости сошлись на визуальный стандарт/TWI «${relatedTwi.title}» как на эталон правильного исполнения.`
        : '';
    const defectHint = task.prompt ? ` Контекст повтора: ${String(task.prompt).replace(/\s+/g, ' ').trim()}` : '';

    const workTitle = task.templateTitle || 'указанному виду работ';
    const promptSystem = `Ты — старший инженер строительного контроля. Подготовь краткий текст для 5–7-минутного разбора с бригадой подрядчика по виду работ «${workTitle}».

Назначение текста: инженер зачитывает или пересказывает его на объекте. Тон — деловой, спокойный, профессиональный. Пиши на русском, простыми полными предложениями.

Строго запрещено:
— жаргон, сленг, разговорные обороты («косяк», «завал», «жёстко», «toolbox talk» и т.п.);
— эмодзи и восклицательные лозунги;
— темы охраны труда, СИЗ, касок и техники безопасности;
— материалы, операции и инструменты, не относящиеся к виду работ «${workTitle}».

Структура ответа — ровно три раздела с такими заголовками (без нумерации эмодзи):

1. Почему возникает дефект
Кратко: типичная технологическая причина повторения брака именно на этом виде работ (что делают неверно в процессе).

2. На что обратить внимание
Конкретные контрольные точки при выполнении и приёмке: что проверить, какие допуски/требования учитывать (ГОСТ/СП/проект — только если уместно и по делу).

3. Что сделать, чтобы дефект не повторялся
Практические действия бригады и мастера на ближайшие смены: порядок работ, самоконтроль, фиксация результата. Без общих фраз вроде «усилить контроль».

Объём: 180–280 слов. Без вступления и заключения вне этих трёх разделов.`;

    try {
        const res = await callAI([{
            role: 'system',
            content: promptSystem
        }, {
            role: 'user',
            content: `Подрядчик: ${task.contractor}. Вид работ: ${workTitle}.${twiContext ? ' ' + twiContext : ''}${defectHint}`
        }], { temperature: 0.25, max_tokens: 700, raw: true });
        const plain = meetingRichToPlain(res);
        const html = meetingRichToSafeHtml(plain);
        _workshopAiLast = { html: html, plain: plain, taskId: taskId };
        _syncWorkshopScenarioField(plain);
        openWorkshopAiModal({ html: html, plain: plain, taskId: taskId });
        _setWorkshopAiTeaser('ready');
    } catch (e) {
        _setWorkshopAiTeaser('error');
        openWorkshopAiModal({
            html: `<span class="text-danger font-bold">Ошибка ИИ: ${(e && e.message) ? e.message : 'попробуйте ещё раз'}</span>`,
            plain: ''
        });
        _syncWorkshopScenarioField('');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-60');
        }
    }
}

/* ============================================================================ */
/* ИИ ГЕНЕРАТОРЫ ДЛЯ СПЕЦ-ЗАДАЧ (ИНСТРУКТАЖ, КС-2, ВОРКШОП)                     */
/* ============================================================================ */

// 1. ВВОДНЫЙ ИНСТРУКТАЖ (Сборка регламентов и TWI)
async function rbi_generateIntroBriefing(taskId) {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings_ok', '✅ Включите AI-ассистента в настройках!'));

    const task = _getTasks().find(t => t.id === taskId);
    const btn = document.getElementById('btn-gen-intro');
    btn.innerHTML = _t('quality.ai.btn.ai_writing', 'AI пишет...'); btn.disabled = true;

    // Достаем пункты чек-листа (требования)
    let checklistData = [];
    const tType = task.templateKey.split('_')[0];
    const key = task.templateKey.replace(tType + '_', '');
    const cl = tType === 'sys' && _templates().getSystemTemplates()[key] ? _templates().getSystemTemplates()[key].groups : (_templates().getUserTemplates()[key] ? _templates().getUserTemplates()[key].groups : []);
    const flatList = getFlatList(cl);

    // Формируем выжимку требований для ИИ
    const requirements = flatList.slice(0, 15).map(i => `- ${i.n}. Норматив: ${i.t.replace(/<\/?[^>]+(>|$)/g, "")}`).join('\n');

    const promptSystem = `Ты старший инженер по качеству. Напиши короткую и строгую приветственную речь-инструктаж (3 абзаца) для бригадиров подрядчика перед началом работ.
    Цель: обозначить, что контроль будет строгим, и перечислить главные точки внимания.
    Используй переданные требования. Без воды.`;

    try {
        const speech = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: `Вид работ: ${task.templateTitle}.\nТребования:\n${requirements}` }], { temperature: 0.3, max_tokens: 400 });

        // Сохраняем результат в задачу для последующей печати
        task.aiData = { speech: speech, checklist: flatList };
        await _storage().put(_storage().stores().TASKS, task);

        document.getElementById('intro-result-box').classList.remove('hidden');
        showToast(_t('quality.ai.toast.briefing_done', 'Инструктаж сформирован!'));
    } catch (e) {
        showToast(_t('quality.ai.toast.ai_error_short', '❌ Ошибка ИИ'));
    } finally {
        btn.innerHTML = _t('quality.ai.btn.build_base', 'Собрать базу (AI)'); btn.disabled = false;
    }
};


// 2. ФИНАЛЬНАЯ ПРИЕМКА (Анализ перед КС-2)
async function rbi_generateFinalAcceptance(taskId) {
    const _allInspections = _getAllInspections();
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings_ok', '✅ Включите AI-ассистента в настройках!'));

    const task = _getTasks().find(t => t.id === taskId);
    const btn = document.getElementById('btn-gen-final');
    btn.innerHTML = _t('quality.ai.btn.ai_writing', 'AI пишет...'); btn.disabled = true;

    // Собираем ВСЕ проверки по этому подрядчику и виду работ
    const cChecks = _allInspections.filter(c => c.contractorName === task.contractor && c.templateKey === task.templateKey).sort((a, b) => new Date(a.date) - new Date(b.date));

    if (cChecks.length === 0) {
        btn.innerHTML = _t('quality.ai.btn.analysis_ai', 'Анализ (AI)'); btn.disabled = false;
        return showToast(_t('quality.ai.toast.no_inspection_data', 'Нет данных проверок для анализа!'));
    }

    const m = getContractorMetrics(cChecks, _templates().getUserTemplates());

    // Собираем дефекты
    const defects = {};
    cChecks.forEach(c => {
        if (c.state) {
            Object.keys(c.state).forEach(id => {
                if (c.state[id] === 'fail' || c.state[id] === 'fail_escalated') {
                    const flat = getFlatList(_templates().getUserTemplates()[c.templateKey.replace('user_', '')]?.groups || _templates().getSystemTemplates()[c.templateKey.replace('sys_', '')]?.groups);
                    const item = flat.find(x => String(x.id) === String(id));
                    if (item) defects[item.n] = (defects[item.n] || 0) + 1;
                }
            });
        }
    });

    const defectStr = Object.keys(defects).sort((a, b) => defects[b] - defects[a]).map(k => `${k} (${defects[k]} раз)`).join(', ');

    const promptSystem = `Ты — Директор по строительству. Напиши официальную резолюцию для подписания КС-2 (Акта выполненных работ).
    Укажи:
    1. Итоговый УрК и надежность.
    2. Главные косяки за период.
    3. Вывод: Подписать в полном объеме, С удержанием % (за брак), или Отказать в приемке до устранения.`;

    const promptUser = `Подрядчик: ${task.contractor}. Работа: ${task.templateTitle}. Проверок: ${cChecks.length}. Финальный УрК: ${m.finalC}%. Критических дефектов (вес 3): ${m.n_изделий_с_B3}. Частые дефекты: ${defectStr}`;

    try {
        const text = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: promptUser }], { temperature: 0.3, max_tokens: 500 });
        document.getElementById('final-ai-text').value = text;
        document.getElementById('final-result-box').classList.remove('hidden');
        showToast(_t('quality.ai.toast.ks2_done', 'Справка КС-2 сформирована!'));
    } catch (e) {
        showToast(_t('quality.ai.toast.ai_error_short', '❌ Ошибка ИИ'));
    } finally {
        btn.innerHTML = _t('quality.ai.btn.analysis_ai', 'Анализ (AI)'); btn.disabled = false;
    }
};

// === 7. AI-МАППИНГ КОЛОНОК ===
async function sk_aiMapColumns() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings', '⚠️ Включите AI-ассистента в Настройках!'));

    const btn = document.getElementById('btn-ai-mapping');
    btn.innerHTML = `<span class="animate-pulse">${_t('quality.ai.loading.ai_thinking', '⏳ ИИ думает...')}</span>`;
    btn.disabled = true;

    var skSvc = (AIActions._ctx && AIActions._ctx.sk) || window.RBI.services.sk;
    const headersList = skSvc.getTempRawHeadersSync().map((h, i) => `${i}: "${h}"`).join(', ');

    const promptSystem = `Ты помощник интеграции данных. Тебе даны заголовки Excel-файла (с их индексами). Твоя задача — сопоставить их с системными полями: number, text, category, date_issued, contractor, deadline, status, date_resolved, structure.
    Верни СТРОГО JSON-объект, где ключ - это системное поле, а значение - индекс (число) колонки из Excel. Если колонки нет, верни -1. Без лишнего текста и комментариев.`;

    try {
        // Используем глобальную функцию callAI (которая у нас уже есть в ai.js)
        const res = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: headersList }], { temperature: 0.1, max_tokens: 300 });

        const jsonMatch = res.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const aiMap = JSON.parse(jsonMatch[0]);
            Object.keys(aiMap).forEach(key => {
                const select = document.querySelector(`.sk-mapping-select[data-field="${key}"]`);
                if (select) select.value = aiMap[key];
            });
            showToast(_t('quality.ai.toast.cols_recognized', '✅ ИИ успешно распознал колонки!'));
        }
    } catch (e) {
        showToast(_t('quality.ai.error.ai_prefix_plain', '❌ Ошибка ИИ: {message}', { message: e.message }));
    } finally {
        btn.innerHTML = _t('quality.ai.btn.guess_cols', '🤖 Угадать через ИИ (DeepSeek)');
        btn.disabled = false;
    }
};

// === 13. ИИ АВТО-МАППИНГ КАТЕГОРИЙ ПО ТЕКСТУ ЗАМЕЧАНИЯ ===
// === 13. ИИ АВТО-МАППИНГ КАТЕГОРИЙ ПО ТЕКСТУ ЗАМЕЧАНИЯ ===
// Добавили второй параметр forceAll
async function sk_autoMapCategories(silent = false, forceAll = false) {
    if (!_getSetting('aiEnabled')) {
        if (!silent) showToast(_t('quality.ai.toast.enable_categories', 'Включите AI для авто-распределения категорий!'));
        return 0;
    }

    if (forceAll && !silent) {
        if (!confirm(_t('quality.ai.confirm.remap_categories', 'Внимание! ИИ заново проанализирует ВСЕ замечания в базе (кроме тех, что вы привязали вручную). Это может занять около минуты. Продолжить?'))) return 0;
    }

    // skAiRunning живёт на window (ставит sk.actions при автозапуске после импорта)
    if (!silent && !window.skAiRunning) showToast(_t('quality.ai.toast.categories_running', '🔄 ИИ запускает анализ категорий...'));

    const allowedCleanCats = [];
    const _stClean = _templates().getSystemTemplates();
    Object.keys(_stClean).forEach(k => allowedCleanCats.push(_stClean[k].title));
    if (allowedCleanCats.length === 0) allowedCleanCats.push("Общестроительные работы");

    // Ищем записи для обработки
    let recordsToFix = [];
    if (forceAll) {
        // Если нажали "Перепроверить всё" - берем все живые записи, КРОМЕ тех, что инженер исправил руками (category_corrected)
        recordsToFix = _getSkRecords().filter(r => !r._deleted && !r.is_deleted && !r.category_corrected);
    } else {
        // Старая логика: берем только "Без категории" и мусорные
        recordsToFix = _getSkRecords().filter(r =>
            !r.category ||
            r.category === 'Без категории' ||
            r.category.trim() === '' ||
            /^\d+$/.test(r.category)
        );
    }

    // Собираем уникальные связки: Подрядчик + Локация + Текст
    const uniqueTexts = [...new Set(recordsToFix.map(r => {
        const loc = r.project_loc || r.structure || 'Локация не указана';
        return `${r.contractor} ||| ${loc} ||| ${r.text}`;
    }).filter(t => t && t.length > 10))];

    if (uniqueTexts.length === 0) {
        if (!silent) showToast(_t('quality.ai.toast.categories_done_all', '✅ Все замечания уже распределены по категориям.'));
        return 0;
    }

    const BATCH_SIZE = 200;
    let totalUpdated = 0;
    const totalBatches = Math.ceil(uniqueTexts.length / BATCH_SIZE);

    for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
        // Визуальный прогресс
        if (!silent) showToast(_t('quality.ai.toast.categories_batch', '🔄 ИИ обрабатывает пакет {batch} из {total}...', { batch: batchNum, total: totalBatches }));

        const startIndex = (batchNum - 1) * BATCH_SIZE;
        const batch = uniqueTexts.slice(startIndex, startIndex + BATCH_SIZE);
        const batchStr = batch.map((t, idx) => `${idx}: "${t.substring(0, 200)}"`).join('\n');

        const promptSystem = `Ты — Главный эксперт строительного контроля. Твоя задача — классифицировать дефекты строго по утвержденному списку видов работ.
Доступные виды работ (Категории): [${allowedCleanCats.join(', ')}].

Тебе передан список в формате: "Имя подрядчика ||| Локация ||| Текст замечания".
Верни ТОЛЬКО JSON-объект: ключ - индекс (0..${batch.length - 1}), значение - строго одно название из списка выше.

ПРАВИЛА ЖЕСТКОЙ ЛОГИКИ:
1. ИМЯ ПОДРЯДЧИКА — это ГЛАВНАЯ подсказка. Если подрядчик обычно ставит окна, то "мусор" или "пена" от него — это категория "Окна ПВХ".
2. ЛОКАЦИЯ — вторая подсказка. Если локация "Кровля", ищи кровельные категории. Если "Фасад" — фасадные.
3. АССОЦИАЦИИ: "Арматура, бетон, пилон" -> Монолитные работы. "Кронштейн, утеплитель, вата" -> Фасад. "Профиль, стекло, пена" -> Окна/Витражи. "Шпаклевка, краска, линолеум, обои" -> Отделка.
4. ЗАПРЕЩЕНО придумывать свои категории. Используй ТОЛЬКО названия из списка. Без пояснений и маркдауна.`;

        try {
            const res = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: batchStr }], { temperature: 0.1, max_tokens: 5000 });
            const jsonMatch = res.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const aiMap = JSON.parse(jsonMatch[0]);
                let batchRecordsToUpdate = [];

                for (let i = 0; i < batch.length; i++) {
                    const cleanVal = aiMap[i] || aiMap[String(i)];
                    if (cleanVal && allowedCleanCats.includes(cleanVal)) {
                        // Разбираем строку обратно
                        const parts = batch[i].split(' ||| ');
                        const cName = parts[0];
                        const locName = parts[1];
                        const tText = parts[2];

                        // Находим все записи и обновляем
                        const targetRecords = _getSkRecords().filter(r => 
                            r.contractor === cName && 
                            r.text === tText &&
                            (r.project_loc === locName || r.structure === locName || (locName === 'Локация не указана'))
                        );
                        targetRecords.forEach(rec => {
                            rec.ai_category = cleanVal;
                            // Жестко заменяем категорию
                            if (rec.category !== cleanVal) {
                                rec.category = cleanVal;
                                rec.category_corrected = true;
                            }
                            rec._updatedAt = new Date().toISOString();
                            rec.updated_at = rec._updatedAt;
                            rec.updatedAt = rec._updatedAt;
                            
                            // ВАЖНО: Сбрасываем статус, чтобы улетело в облако!
                            rec.source = 'local';
                            rec.syncStatus = 'not_synced';
                            rec.sync_status = 'not_synced';
                            
                            batchRecordsToUpdate.push(rec);
                        });
                    }
                }

                // Сохраняем пачку
                if (batchRecordsToUpdate.length > 0) {
                    await _storage().putBatch(_storage().stores().SK_RECORDS, batchRecordsToUpdate);
                    totalUpdated += batchRecordsToUpdate.length;
                }
            }
        } catch (e) {
            console.warn("Ошибка ИИ в пакете", batchNum, e);
            if (!silent) showToast(_t('quality.ai.toast.api_batch_retry', '⚠️ Ошибка API на пакете {batch}. Ждем и продолжаем...', { batch: batchNum }));
        }

        // ВАЖНО: Задержка 2.5 секунды между пакетами, чтобы API DeepSeek не забанил нас за спам
        if (batchNum < totalBatches) {
            await new Promise(r => setTimeout(r, 2500));
        }
    }

    if (!silent && totalUpdated > 0) {
        showToast(_t('quality.ai.toast.categories_assigned', '✅ ИИ успешно распределил {count} записей!', { count: totalUpdated }));
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('sk:renderRequested', { view: 'dashboard' }); // Перерисовываем экран

        localStorage.setItem('rbi_cloud_dirty', '1');
        _triggerSync('silent');
    }
    return totalUpdated;
};

// === 7. AI-СВЯЗКА ДЕФЕКТОВ EXCEL С ЧЕК-ЛИСТАМИ RBI И ГЕНЕРАЦИЯ ПИСЬМА ===
async function sk_generateContractorAiSummary(cName, safeId) {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings', '⚠️ Включите AI-ассистента в Настройках!'));

    const btn = document.getElementById(`btn-sk-ai-${safeId}`);
    const resBox = document.getElementById(`sk-ai-res-${safeId}`);

    btn.innerHTML = `<span class="animate-pulse">${_t('quality.ai.loading.sk_defects', '⏳ DeepSeek анализирует дефекты...')}</span>`;
    btn.disabled = true;
    resBox.classList.remove('hidden');
    resBox.innerHTML = `<div class="text-center text-brand font-bold animate-pulse">${_t('quality.ai.loading.sk_match', 'ИИ сопоставляет замечания с чек-листами RBI...')}</div>`;

    let total = 0, open = 0, overdue = 0;
    const defectsFreq = {};
    _getSkRecords().filter(r => r.contractor === cName).forEach(r => {
        total++;
        const isOpen = r.status && r.status.toLowerCase().includes('не устран');
        if (isOpen) open++;
        const deadline = r.deadline ? new Date(r.deadline) : null;
        if (deadline && isOpen && new Date() > deadline) overdue++;
        if (r.text) {
            const cleanText = r.text.trim().replace(/\s+/g, ' ').substring(0, 100);
            defectsFreq[cleanText] = (defectsFreq[cleanText] || 0) + 1;
        }
    });

    const topDefects = Object.keys(defectsFreq).sort((a, b) => defectsFreq[b] - defectsFreq[a]).slice(0, 5);
    const defectListStr = topDefects.map(d => `- ${d} (${defectsFreq[d]} раз)`).join('\n');

    const availableChecklists = [];
    const _stChecklists = _templates().getSystemTemplates();
    Object.keys(_stChecklists).forEach(k => availableChecklists.push(_stChecklists[k].title));
    const checklistsStr = availableChecklists.join(', ');

    const promptSystem = `Ты — Главный эксперт по качеству. Проанализируй открытые замечания подрядчика из системы "Стройконтроль".
    Верни ответ СТРОГО в формате:
    
    [ОЦЕНКА ФОРМУЛИРОВОК (KPI)]
    Оценка качества описания дефектов инженерами СК: [X/10]. 
    Комментарий: [Укажи 1 предложением, чего не хватает инженерам при выдаче предписаний: осей, конкретики, ссылок на ГОСТ].

    [ПРОГНОЗ РИСКА ПРОСРОЧКИ]
    [Выбери 1 самый сложный дефект из списка и оцени риск его просрочки: Высокий / Средний / Низкий. Объясни почему (технологическая сложность, поставка материалов и т.д.)].

    [СВЯЗЬ С ЧЕК-ЛИСТАМИ RBI]
    Рекомендуемые чек-листы для проверок: [Выбери 1-2 из: ${checklistsStr}].

    [СООБЩЕНИЕ ПРОРАБУ В WHATSAPP]
    [Короткое жесткое письмо прорабу. Укажи статистику просрочек и дефекты, которые нужно закрыть]`;

    const promptUser = `Подрядчик: ${cName}. Всего: ${total}. Открыто: ${open}. Просрочено: ${overdue}. Тексты дефектов:\n${defectListStr}`;

    try {
        const response = await callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: promptUser }], { temperature: 0.2, max_tokens: 800 });

        const formattedResponse = response
 .replace(/\[ОЦЕНКА ФОРМУЛИРОВОК \(KPI\)\]/g, '<div class="text-rbi-body font-black text-purple-700 uppercase mb-1 border-b border-purple-100 pb-1"> ' + _t('quality.ai.sk.kpi', 'Качество работы инженеров СК') + '</div>')
 .replace(/\[ПРОГНОЗ РИСКА ПРОСРОЧКИ\]/g, '<div class="text-rbi-body font-black text-danger uppercase mt-3 mb-1 border-b border-danger-soft pb-1"> ' + _t('quality.ai.sk.risk_forecast', 'AI-Прогноз рисков') + '</div>')
 .replace(/\[СВЯЗЬ С ЧЕК-ЛИСТАМИ RBI\]/g, '<div class="text-rbi-body font-black text-brand uppercase mt-3 mb-1 border-b border-brand-soft pb-1"> ' + _t('quality.ai.sk.rbi_focus', 'Фокус для RBI Аудита') + '</div>')
 .replace(/\[СООБЩЕНИЕ ПРОРАБУ В WHATSAPP\]/g, '<div class="text-rbi-body font-black text-green-700 uppercase mt-3 mb-1 border-b border-green-100 pb-1"> ' + _t('quality.ai.sk.foreman_msg', 'Сообщение прорабу (Копировать)') + '</div>');

        resBox.innerHTML = `
            ${formattedResponse}
            <button onclick="navigator.clipboard.writeText(this.parentElement.innerText); showToast(${JSON.stringify(_t('quality.ai.toast.text_copied', 'Текст скопирован!'))});" class="mt-3 w-full bg-surface text-muted border border-surface py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 shadow-sm">
                ${_t('quality.ai.btn.copy_all', '📋 Скопировать весь текст')}
            </button>
        `;
        _gameLogAction('ai_generate', 'sk_contractor_analysis');
        // Письмо прорабу сформировано → +10 XP (sk_message_sent)
        _gameLogAction('sk_message_sent', cName);
        // === АВТОЗАКРЫТИЕ ЗАДАЧИ ПРИ ФОРМИРОВАНИИ ПИСЬМА ===
        {
            const skTask = _getTasks().find(t => t.title === 'Анализ проблем ПК СК' && t.status === 'pending');
            if (skTask) {
                skTask.status = 'done';
                skTask.done = 1;
                skTask.resultComment = 'Письмо отправлено';
                skTask.updatedAt = new Date().toISOString();
                if (typeof dbPut === 'function') _storage().put(_storage().stores().TASKS, skTask);
                if (typeof window.gameLogAction === 'function') {
                    const logs = window.gameActionLogs || [];
                    if (!logs.some(l => l.action === 'task_completed_on_time' && l.target === skTask.id)) {
                        window.gameLogAction('task_completed_on_time', skTask.id);
                    }
                }
                window.RBI.events.emit('tasks:refresh', {});
            }
        }
    } catch (e) {
        resBox.innerHTML = `<span class="text-danger font-bold">${_t('quality.ai.error.ai_prefix_plain', '❌ Ошибка ИИ: {message}', { message: e.message })}</span>`;
    } finally {
        btn.innerHTML = _t('quality.ai.btn.sk_analysis', '🤖 AI-Анализ и Письмо прорабу');
        btn.disabled = false;
    }
};

// === ПРЕДИКТИВНЫЙ ИИ: ПРОГНОЗ СРЫВА СРОКОВ ===
async function sk_predictRisksAi(silent = false) {
    if (!_getSetting('aiEnabled')) {
        if (!silent) showToast(_t('quality.ai.toast.enable_assistant_settings', '⚠️ Включите AI-ассистента в Настройках!'));
        return;
    }

    // Ищем только открытые замечания, у которых еще нет прогноза
    const openRecords = _getSkRecords().filter(r => {
        const isResolved = !!r.date_resolved;
        const statusStr = r.status ? r.status.toLowerCase() : '';
        const isOpen = !isResolved && (!statusStr || statusStr.includes('не устран'));
        return isOpen && !r.predicted_risk;
    });

    if (openRecords.length === 0) {
        if (!silent) showToast(_t('quality.ai.toast.no_open_remarks', '✅ Нет новых открытых замечаний для прогноза!'));
        return;
    }

    if (!silent) showToast(_t('quality.ai.toast.risks_analyzing', '🔄 ИИ анализирует риски по {count} замечаниям...', { count: openRecords.length }));

    const BATCH_SIZE = 10; // Отправляем пачками по 10, чтобы ИИ не запутался
    let processed = 0;

    for (let i = 0; i < openRecords.length; i += BATCH_SIZE) {
        const batch = openRecords.slice(i, i + BATCH_SIZE);

        let batchContext = batch.map((r, idx) => {
            const daysLeft = r.deadline ? Math.ceil((new Date(r.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : 'Не указан';
            return `ID: ${idx} | Подрядчик: ${r.contractor} | Этап: ${r.category} | Дней до дедлайна: ${daysLeft} | Текст: ${r.text}`;
        }).join('\n');

        const promptSystem = `Ты — AI риск-менеджер на стройке. Оцени вероятность срыва дедлайна по каждому замечанию. 
Учитывай сложность дефекта, этап работ и оставшееся время.
Верни СТРОГО JSON-объект в формате:
{
  "0": { "risk": "High", "reason": "Короткое обоснование (до 10 слов)" },
  "1": { "risk": "Low", "reason": "Легко исправить" }
}
Возможные значения risk: "High" (Красный), "Medium" (Желтый), "Low" (Зеленый). Без лишнего текста.`;

        try {
            const res = await callAI([
                { role: 'system', content: promptSystem },
                { role: 'user', content: batchContext }
            ], { temperature: 0.2, max_tokens: 1000 });

            const jsonMatch = res.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const aiResult = JSON.parse(jsonMatch[0]);

                for (let j = 0; j < batch.length; j++) {
                    const ans = aiResult[j] || aiResult[String(j)];
                    if (ans && ans.risk) {
                        batch[j].predicted_risk = ans.risk;
                        batch[j].predicted_reason = ans.reason || '';
                        batch[j]._updatedAt = new Date().toISOString();
                        batch[j].updated_at = batch[j]._updatedAt;
                        batch[j].updatedAt = batch[j]._updatedAt;
                        
                        // ВАЖНО: Сбрасываем статус, чтобы улетело в облако!
                        batch[j].source = 'local';
                        batch[j].syncStatus = 'not_synced';
                        batch[j].sync_status = 'not_synced';
                        
                        await _storage().put(_storage().stores().SK_RECORDS, batch[j]);
                        processed++;
                    }
                }
            }
        } catch (e) {
            console.error("Ошибка ИИ прогноза:", e);
        }
    }

    if (processed > 0) {
        localStorage.setItem('rbi_cloud_dirty', '1');
        _triggerSync('silent');
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('sk:renderRequested', { view: 'dashboard' });
        if (!silent) showToast(_t('quality.ai.toast.risks_done', '✅ ИИ рассчитал риски для {count} замечаний!', { count: processed }));
    }
};

async function rbi_generateGlobalAi() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings', '⚠️ Включите AI-ассистента в Настройках!'));

    const container = document.getElementById('global-ai-text');
    if (!container) return;

    const data = getFilteredAnalyticsData();
    if (data.length === 0) return showToast(_t('quality.ai.toast.no_data_analysis', '⚠️ Нет данных для анализа'));

    container.innerHTML = `<span class="animate-pulse text-brand font-bold">${_t('quality.ai.loading.portfolio', '🤖 DeepSeek анализирует весь портфель объектов...')}</span>`;

    let sumB3 = 0;
    const projectsMap = {};
    data.forEach(item => {
        if (item.metrics) sumB3 += item.metrics.n_B3_fail;
        const pName = item.projectName || 'Без объекта';
        if (!projectsMap[pName]) projectsMap[pName] = [];
        projectsMap[pName].push(item);
    });

    const pStats = Object.keys(projectsMap).map(p => {
        const pData = projectsMap[p];
        const m = typeof getObjectIntegralMetrics === 'function' ? getObjectIntegralMetrics(pData, _templates().getUserTemplates()) : null;
        return `${p} (ИКО: ${m ? m.IKO : 0})`;
    }).join('; ');

    const promptSystem = `Ты — Директор по строительству. Сформируй КРАТКОЕ управленческое резюме по всему портфелю проектов компании.
    Структура: 
    1. Оценка ИКО по объектам (где всё хорошо, где катастрофа). 
    2. Главные риски.
    Отвечай СТРОГО в 2-3 коротких абзаца. Тон жесткий, деловой. Без воды.`;

    const promptUser = `Объекты: ${pStats}. Всего проверок: ${data.length}. Найдено критических дефектов (вес 3): ${sumB3}.`;

    try {
        const response = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: promptUser }
        ], { temperature: 0.3, max_tokens: 400 });

        container.innerHTML = response;
        _reports().setExpertConclusion('global_portfolio_ai', response);
        if (typeof scheduleSessionSave === 'function') scheduleSessionSave();
    } catch (e) {
        container.innerHTML = `<span class="text-danger">${_t('quality.ai.error.ai_short_prefix', '❌ Ошибка AI: {message}', { message: e.message })}</span>`;
    }
};


// === AI: САМООБУЧЕНИЕ СИСТЕМЫ (ОПТИМИЗАТОР ПАРАМЕТРОВ) ===
// Защита от двойного запуска (module-scope — раньше файл был classic-script
// с неявным window-глобалом, в ES-модуле strict-mode необъявленное
// присваивание бросает ReferenceError).
var _selfLearningRunning = false;

async function runSelfLearningAi() {
    const _allInspections = _getAllInspections();
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings_exact', 'Включите AI-ассистента в Настройках!'));
    var permSvc = (AIActions._ctx && AIActions._ctx.permissions) || window.RBI.services.permissions;
    if (permSvc && !permSvc.isAdmin()) {
        return showToast(_t('quality.ai.toast.admin_only', '❌ Доступно только Администратору'));
    }

    // Защита от двойного запуска
    if (_selfLearningRunning) return showToast(_t('quality.ai.toast.already_running', '🔄 Уже выполняется...'));
    _selfLearningRunning = true;

    const container = document.getElementById('ai-self-learning-result');
    if (!container) {
        _selfLearningRunning = false;
        return showToast(_t('quality.ai.toast.container_missing', '⚠️ Контейнер #ai-self-learning-result не найден'));
    }

    const data = _allInspections.filter(c => !c._deleted && c.metrics);
    if (data.length < 50) {
        _selfLearningRunning = false;
        return showToast(_t('quality.ai.toast.need_50', 'Слишком мало данных. Нужно хотя бы 50 проверок для машинного анализа.'));
    }

    container.classList.remove('hidden');
    container.innerHTML = `<span class="animate-pulse text-purple-600 font-bold">${_t('quality.ai.loading.self_learn', '🤖 ИИ сканирует массив данных и калибрует математическую модель...')}</span>`;

    try {
        // 1. Собираем расширенную статистику
        let sumUrk = 0, sumKc = 0, kcAppliedCount = 0, kcritAppliedCount = 0;
        let b1 = 0, b2 = 0, b3 = 0;
        let redCount = 0, greenCount = 0;
        let lastMonthRed = 0, lastMonthTotal = 0;
        const oneMonthAgo = new Date(); oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

        for (const c of data) {
            const m = c.metrics;
            sumUrk += m.final;
            if (m.final < 70) redCount++;
            if (m.final >= 85) greenCount++;
            b1 += m.n_B1_fail; b2 += m.n_B2_fail; b3 += m.n_B3_fail;

            if (m.kc < 1.0) {
                kcAppliedCount++;
                sumKc += m.kc;
            }
            if (m.kcrit < 1.0) kcritAppliedCount++;

            const cDate = new Date(c.date);
            if (cDate >= oneMonthAgo) {
                lastMonthTotal++;
                if (m.final < 70) lastMonthRed++;
            }
        }

        const avgUrk = (sumUrk / data.length).toFixed(1);
        const avgKc = kcAppliedCount ? (sumKc / kcAppliedCount).toFixed(2) : 1.0;
        const greenPerc = (greenCount / data.length * 100).toFixed(1);
        const redPerc = (redCount / data.length * 100).toFixed(1);
        const recentRedPerc = lastMonthTotal ? (lastMonthRed / lastMonthTotal * 100).toFixed(1) : "0";

        // 2. Промпт для ИИ (без требования JSON, просто текст)
        const promptSystem = `Ты — Архитектор систем управления качеством (QMS) и Data Scientist. Твоя задача: адаптировать и откалибровать математическую модель приложения под реальные условия стройки.
Текущие пороги: Зеленая зона > 85%, Красная зона < 70%. Правило Стеклянного потолка: при наличии системных дефектов балл режется до 84%.
Штрафные коэффициенты: за частоту B2 (Kc): при >20% повторений = 0.85, при >50% = 0.70; за наличие B3 (Kcrit) = 0.50.

Проанализируй полученные цифры:
- Если зеленой зоны слишком много (> 60%) — значит требования слишком мягкие, предложи поднять пороги.
- Если красной зоны в последний месяц выросла — модель недооценивает риск, предложи ужесточить.
- Если средний Kc < 0.9 при редких повторениях B2 — штраф избыточен, предложи повысить.
- Также оцени баланс дефектов B1/B2/B3.

Верни ответ СТРОГО в 3 абзаца:
1. ДИАГНОЗ: Оценка жесткости текущей модели и её адекватности.
2. АНОМАЛИИ: Дисбаланс между типами дефектов (B1/B2/B3) и динамика красной зоны.
3. РЕКОМЕНДАЦИЯ: Конкретные цифры. Какие пороги УрК изменить (новые значения green/red) и нужно ли изменить штрафные коэффициенты Kc и Kcrit.`;

        const promptUser = `Всего проверок: ${data.length}. Средний УрК: ${avgUrk}%. 
Попадание в зоны: Зеленая (≥85%): ${greenPerc}%, Красная (<70%): ${redPerc}% (за последний месяц красная зона: ${recentRedPerc}%).
Штраф Kc применялся в ${kcAppliedCount} проверках (${((kcAppliedCount / data.length) * 100).toFixed(1)}%), средний Kc = ${avgKc}.
Выявлено дефектов: B1 (${b1}), B2 (${b2}), B3 (${b3}).
Требуется: оценить, нужно ли поднять порог зеленой зоны, опустить порог красной, изменить Kc или Kcrit.`;

        const response = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: promptUser }
        ], { temperature: 0.2, max_tokens: 800 });

        // 3. Вывод результата
        container.innerHTML = `<div class="bg-surface p-3 rounded-xl border border-purple-200 shadow-sm mt-2">
            <div class="flex justify-between items-center mb-2">
                <b class="text-purple-700">🤖 Рекомендации ИИ (DeepSeek)</b>
                <button onclick="document.getElementById('ai-self-learning-result').innerHTML = ''; document.getElementById('ai-self-learning-result').classList.add('hidden')" class="text-muted hover:text-danger text-lg leading-none">❌</button>
            </div>
            <div class="text-sm leading-relaxed whitespace-pre-wrap">${response}</div>
 <div class="text-xs text-muted mt-3 pt-2 border-t border-surface">ℹ Рекомендации носят аналитический характер. Изменить пороги можно вручную в настройках проекта (будет добавлено позже).</div>
        </div>`;

        _gameLogAction('ai_generate', 'system_optimization');
    } catch (e) {
        console.error("[SelfLearning AI]", e);
        container.innerHTML = `<span class="text-danger">${_t('quality.ai.error.prefix', '❌ Ошибка: {message}', { message: e.message })}</span>`;
    } finally {
        _selfLearningRunning = false;
    }
};

// === ИИ-ТРЕНЕР: РАЗБОР ОШИБОК (модалка как у тепловой карты) ===
let _skTutorAiLast = { html: '', plain: '' };

function _skTutorHtmlToPlain(html) {
    try {
        const d = document.createElement('div');
        d.innerHTML = String(html || '');
        return String(d.innerText || d.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    } catch (e) {
        return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}

function closeSkTutorAiModal() {
    const modal = document.getElementById('sk-tutor-ai-modal');
    if (modal) modal.remove();
}

function copySkTutorAiText() {
    const plain = _skTutorAiLast.plain || '';
    if (!plain) return showToast(_t('quality.ai.toast.nothing_to_copy', 'Нечего копировать'));
    const done = () => {
        showToast(_t('quality.ai.toast.review_copied', 'Разбор скопирован'));
        _gameLogAction('ai_copy', 'sk_coaching');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(plain).then(done).catch(() => {
            try {
                const ta = document.createElement('textarea');
                ta.value = plain;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                done();
            } catch (e) {
                showToast(_t('quality.ai.toast.copy_failed', 'Не удалось скопировать'));
            }
        });
        return;
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = plain;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        done();
    } catch (e) {
        showToast(_t('quality.ai.toast.copy_failed', 'Не удалось скопировать'));
    }
}

function reopenSkTutorAiModal() {
    if (!_skTutorAiLast.html) return showToast(_t('quality.ai.toast.generate_review_first', 'Сначала сгенерируйте разбор'));
    openSkTutorAiModal({ html: _skTutorAiLast.html, plain: _skTutorAiLast.plain });
}

function openSkTutorAiModal(opts) {
    const options = opts || {};
    const loading = !!options.loading;
    if (options.plain != null) _skTutorAiLast.plain = options.plain;
    if (options.html != null && !loading) _skTutorAiLast.html = options.html;

    let modal = document.getElementById('sk-tutor-ai-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
<div id="sk-tutor-ai-modal" class="fixed inset-0 bg-surface/80 z-[6000] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm" onclick="if(event.target===this)closeSkTutorAiModal()">
  <div class="bg-[var(--card-bg)] w-full max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl border border-[var(--card-border)] flex flex-col overflow-hidden" style="max-height:min(94vh,100dvh)" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="sk-tutor-ai-modal-title">
    <div class="flex items-center justify-between gap-2 px-4 sm:px-5 pt-4 pb-3 border-b border-[var(--card-border)] shrink-0">
      <h3 id="sk-tutor-ai-modal-title" class="font-black text-rbi-body uppercase tracking-tight text-ink">${_t('quality.ai.title.sk_tutor', 'AI-Тренер: разбор формулировок')}</h3>
      <button type="button" onclick="closeSkTutorAiModal()" class="text-muted hover:text-danger px-2 text-lg leading-none" aria-label="${_t('quality.ai.btn.close', 'Закрыть')}">❌</button>
    </div>
    <div id="sk-tutor-ai-modal-body" class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-5 py-4 text-rbi-body sm:text-rbi-title leading-relaxed text-ink" style="min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch"></div>
    <div class="flex gap-2 p-4 pt-3 border-t border-[var(--card-border)] shrink-0 bg-[var(--card-bg)]">
      <button type="button" id="sk-tutor-ai-modal-copy" onclick="copySkTutorAiText()" class="flex-1 bg-brand text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-md active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
        ${_t('quality.ai.btn.copy', 'Копировать')}
      </button>
      <button type="button" onclick="closeSkTutorAiModal()" class="flex-1 bg-surface text-muted py-3.5 rounded-xl font-bold text-rbi-label uppercase border border-surface active:scale-95">${_t('quality.ai.btn.close', 'Закрыть')}</button>
    </div>
  </div>
</div>`);
        modal = document.getElementById('sk-tutor-ai-modal');
    }

    _constrainAiScenarioPanel(modal.querySelector('[role="dialog"]'));

    const body = document.getElementById('sk-tutor-ai-modal-body');
    const copyBtn = document.getElementById('sk-tutor-ai-modal-copy');
    if (body) {
        body.style.minHeight = '0';
        body.style.overflowY = 'auto';
        body.style.WebkitOverflowScrolling = 'touch';
        if (loading) {
            body.innerHTML = `<span class="animate-pulse text-brand font-bold">${_t('quality.ai.loading.sk_tutor', '⏳ DeepSeek готовит материал для планерки…')}</span>`;
        } else {
            body.innerHTML = options.html || _skTutorAiLast.html || '—';
            body.scrollTop = 0;
        }
    }
    if (copyBtn) copyBtn.disabled = loading || !_skTutorAiLast.plain;
    modal.style.display = 'flex';
}

function _setSkTutorAiTeaser(state) {
    const teaser = document.getElementById('sk-ai-templates-res');
    if (!teaser) return;
    teaser.classList.remove('hidden');
    if (state === 'loading') {
        teaser.innerHTML = `<span class="text-brand font-bold animate-pulse">${_t('quality.ai.loading.sk_tutor_teaser', '⏳ Разбор формируется в окне…')}</span>`;
        return;
    }
    if (state === 'empty') {
        teaser.innerHTML = `<div class="text-green-600 font-black flex items-center gap-2"><svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg> ${_t('quality.ai.teaser.perfect_wording', 'Ошибок в формулировках не найдено. Команда пишет предписания идеально!')}</div>`;
        return;
    }
    if (state === 'error') {
        teaser.innerHTML = `<span class="text-danger font-bold">${_t('quality.ai.error.ai_link_short', '❌ Ошибка связи с нейросетью')}</span>`;
        return;
    }
    teaser.innerHTML = `
        <div class="flex flex-col gap-2">
            <p class="text-rbi-body font-bold text-ink">${_t('quality.ai.teaser.review_ready', 'Разбор готов — полный текст в отдельном окне.')}</p>
            <button type="button" onclick="reopenSkTutorAiModal()" class="w-full bg-brand-soft text-brand border border-brand-soft py-2.5 rounded-xl font-bold text-rbi-caption uppercase active:scale-95">${_t('quality.ai.btn.open_review', 'Открыть разбор')}</button>
        </div>`;
}

async function sk_auditTemplatesAi() {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings_exact', 'Включите AI-ассистента в Настройках!'));

    const resBox = document.getElementById('sk-ai-templates-res');
    if (!resBox) return;

    var skSvc = (AIActions._ctx && AIActions._ctx.sk) || window.RBI.services.sk;
    if (skSvc.getBadRemarksSync().length === 0) {
        _setSkTutorAiTeaser('empty');
        openSkTutorAiModal({
            html: `<div class="text-green-600 font-black flex items-center gap-2"><svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg> ${_t('quality.ai.teaser.perfect_wording', 'Ошибок в формулировках не найдено. Команда пишет предписания идеально!')}</div>`,
            plain: _t('quality.ai.teaser.perfect_wording', 'Ошибок в формулировках не найдено. Команда пишет предписания идеально!')
        });
        return;
    }

    _setSkTutorAiTeaser('loading');
    openSkTutorAiModal({ loading: true });

    const sample = skSvc.getBadRemarksSync().sort(() => 0.5 - Math.random()).slice(0, 3).map(r => `- ${r.eng}: "${r.text}"`);

    const promptSystem = `Ты — Директор по качеству. Твоя задача — провести короткий, жесткий, но конструктивный мастер-класс для инженеров стройконтроля по правильному написанию предписаний.
    Замечание ОБЯЗАТЕЛЬНО должно содержать конкретный измеримый допуск (мм, см), либо ссылку на ГОСТ/СП/лист проекта. Общие фразы ("криво", "не по проекту") недопустимы, так как их легко оспорить в суде или при гарантийном случае через 3 года.

    Сформируй ответ строго в 3 блока (используй HTML-теги <b>, <ul>, <li>, <br> для красоты, не используй Markdown-звездочки):
    <b style="color:#b91c1c;">1. ГАРАНТИЙНЫЕ РИСКИ</b><br>[Объясни 1 абзацем, почему "отсебятина" и отсутствие цифр убьет позицию компании в суде с генподрядчиком или при жалобе дольщика.]<br><br>
    <b style="color:#0369a1;">2. РАЗБОР РЕАЛЬНЫХ ОШИБОК ИЗ БАЗЫ</b><br>[Возьми переданные примеры инженеров. Для каждого напиши "Как написано:" и "Как нужно писать:" (придумай реалистичные оси, листы РД и цифры допусков для примера).]<br><br>
    <b style="color:#15803d;">3. ПЛАН ДЕЙСТВИЙ</b><br>[Призыв к руководителю разобрать эти кейсы на ближайшей планерке.]`;

    const promptUser = `Вот реальные ошибки моих инженеров из Стройконтроля:\n${sample.join('\n')}`;

    try {
        const response = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: promptUser }
        ], { temperature: 0.3, max_tokens: 1600, raw: true });

        const html = String(response || '').trim() || '—';
        const plain = _skTutorHtmlToPlain(html);
        openSkTutorAiModal({ html, plain });
        _setSkTutorAiTeaser('ready');
        _gameLogAction('ai_generate', 'sk_coaching');
    } catch (e) {
        _setSkTutorAiTeaser('error');
        openSkTutorAiModal({
            html: `<span class="text-danger font-bold">❌ Ошибка ИИ: ${_escAiDoc(e.message || e)}</span>`,
            plain: 'Ошибка ИИ: ' + (e.message || e)
        });
    }
}

// === Панель руководителя: Добавить синоним подрядчику ВРУЧНУЮ ===
async function gameAddContractorAliasInline(canonicalKey, predefinedValue = null) {
    const inputEl = document.getElementById(`alias_contr_input_${canonicalKey}`);
    const aliasName = predefinedValue || (inputEl ? inputEl.value.trim() : '');

    if (!aliasName) return showToast(_t('quality.ai.toast.enter_alias', '⚠️ Введите синоним!'));

    showToast(_t('quality.ai.toast.saving_alias', '🔄 Сохранение синонима...'));

    try {
        const pCode = window.syncConfig?.projectCode || 'RBI';
        const currentUser = window.syncConfig?.engineerName || 'Админ';
        const nowIso = new Date().toISOString();

        // 1. Получаем текущие данные подрядчика
        const { data: primaryData } = await window.supabaseClient
            .from('contractor_directory')
            .select('synonyms')
            .eq('project_code', pCode)
            .eq('canonical_key', canonicalKey)
            .single();

        let newSynonyms = Array.isArray(primaryData?.synonyms) ? primaryData.synonyms : [];

        // Защита от дублей
        if (newSynonyms.includes(aliasName)) {
            if (!predefinedValue) showToast(_t('quality.ai.toast.alias_exists', '⚠️ Такой синоним уже есть'));
            return;
        }
        newSynonyms.push(aliasName);

        // 2. Обновляем массив синонимов у основного подрядчика
        await window.supabaseClient
            .from('contractor_directory')
            .update({ synonyms: newSynonyms, updated_at: nowIso })
            .eq('project_code', pCode)
            .eq('canonical_key', canonicalKey);

        // 3. Создаем запись в таблице алиасов
        await window.supabaseClient.from('contractor_aliases').upsert({
            project_code: pCode, raw_name: aliasName, canonical_key: canonicalKey, created_by: currentUser, created_at: nowIso, updated_at: nowIso
        }, { onConflict: 'project_code,raw_name' });

        // Если это ручной ввод, очищаем инпут и показываем тост
        if (!predefinedValue) {
            if (inputEl) inputEl.value = '';
            showToast(_t('quality.ai.toast.alias_added', '✅ Синоним добавлен!'));
            gameLoadContractorDirectory(); // Перерисовываем список
            localStorage.setItem('rbi_cloud_dirty', '1');
            _triggerSync('silent');
        }

    } catch (e) {
        console.error('[gameAddContractorAliasInline]', e);
        if (!predefinedValue) showToast(_t('quality.ai.toast.alias_add_error', '❌ Ошибка при добавлении синонима'));
    }
};

// === Панель руководителя: ИИ ГЕНЕРАЦИЯ СИНОНИМОВ ===
// === Панель руководителя: ИИ ГЕНЕРАЦИЯ СИНОНИМОВ (Пакетное сохранение) ===
async function gameGenerateContractorSynonymsAI(canonicalKey, displayName) {
    if (!_getSetting('aiEnabled')) return showToast(_t('quality.ai.toast.enable_assistant_settings_lc', '⚠️ Включите AI-ассистента в настройках!'));

    showToast(_t('quality.ai.toast.synonyms_thinking', '🔄 DeepSeek придумывает возможные опечатки...'));

    const promptSystem = `Ты — эксперт по строительному документообороту. Твоя задача — сгенерировать 5-6 самых вероятных вариантов, как инженеры могут написать название компании "${displayName}" в отчетах (сокращения, без кавычек, без формы собственности, частые опечатки).
    Верни СТРОГО список через запятую. Никаких других слов, нумерации или приветствий.`;

    try {
        const response = await callAI([
            { role: 'system', content: promptSystem },
            { role: 'user', content: `Сгенерируй синонимы для: ${displayName}` }
        ], { temperature: 0.4, max_tokens: 150 });

        const aiSynonyms = response.split(',').map(s => s.trim().replace(/['"«»]/g, '')).filter(Boolean);
        if (aiSynonyms.length === 0) throw new Error(_t('quality.ai.error.empty_synonyms', 'ИИ вернул пустой список'));

        showToast(_t('quality.ai.toast.synonyms_saving', '✅ ИИ придумал {count} синонимов. Сохраняем...', { count: aiSynonyms.length }));

        const pCode = window.syncConfig?.projectCode || 'RBI';
        const currentUser = window.syncConfig?.engineerName || 'Админ';
        const nowIso = new Date().toISOString();

        // 1. Получаем текущие данные подрядчика из облака
        const { data: primaryData } = await window.supabaseClient
            .from('contractor_directory')
            .select('synonyms')
            .eq('project_code', pCode)
            .eq('canonical_key', canonicalKey)
            .single();

        let newSynonyms = Array.isArray(primaryData?.synonyms) ? primaryData.synonyms : [];
        let addedCount = 0;

        for (let syn of aiSynonyms) {
            if (!newSynonyms.includes(syn)) {
                newSynonyms.push(syn);

                // Добавляем в облако алиас (без вызова тостов)
                await window.supabaseClient.from('contractor_aliases').upsert({
                    project_code: pCode, raw_name: syn, canonical_key: canonicalKey, created_by: currentUser, created_at: nowIso, updated_at: nowIso
                }, { onConflict: 'project_code,raw_name' });
                addedCount++;
            }
        }

        if (addedCount > 0) {
            // Обновляем массив синонимов у основного подрядчика
            await window.supabaseClient
                .from('contractor_directory')
                .update({ synonyms: newSynonyms, updated_at: nowIso })
                .eq('project_code', pCode)
                .eq('canonical_key', canonicalKey);
        }

        showToast(_t('quality.ai.toast.synonyms_linked', '✅ Синонимы от ИИ успешно привязаны!'));
        gameLoadContractorDirectory();

        localStorage.setItem('rbi_cloud_dirty', '1');
        _triggerSync('silent');

    } catch (e) {
        console.error('[gameGenerateContractorSynonymsAI]', e);
 showToast(_t('quality.ai.error.ai_prefix_plain', '❌ Ошибка ИИ: {message}', { message: e.message }));
    }
};

function _call(name, fn, args) {
  if (typeof fn !== 'function') {
    console.warn('[AIActions] функция не найдена: ' + name);
    return;
  }
  return fn.apply(window, args);
}

const AIActions = {

    _ctx: null,
    bindCtx(ctx) { this._ctx = ctx; },

    // ── Ядро ──────────────────────────────────────────────────────────────
    call(messages, options) {
      var aiSvc = this._ctx && this._ctx.ai;
      if (aiSvc) {
        return aiSvc.call(messages, options);
      }
      return _call('callAI', callAI, [messages, options]);
    },
    generateSmartComment(scenario) {
      return _call('generateSmartComment', generateSmartComment, [scenario]);
    },
    extractTextFromPdf(dataUrl) {
      return _call('extractTextFromPdf', extractTextFromPdf, [dataUrl]);
    },

    // ── Аналитика ─────────────────────────────────────────────────────────
    generatePulse() {
      return _call('generatePulseAi', generatePulseAi, []);
    },
    generateHeatmap() {
      return _call('generateHeatmapAi', generateHeatmapAi, []);
    },
    generateContractorForecast(contractorName) {
      return _call('generateContractorForecastAi', generateContractorForecastAi, [contractorName]);
    },
    generateOnePagerForecast(pdcaKey) {
      return _call('generateOnePagerForecastAi', generateOnePagerForecastAi, [pdcaKey]);
    },
    generateGlobal() {
      return _call('rbi_generateGlobalAi', rbi_generateGlobalAi, []);
    },

    // ── Задачи / FMEA / практики ──────────────────────────────────────────
    generatePrescription(inspectionId) {
      return _call('generatePrescriptionAi', generatePrescriptionAi, [inspectionId]);
    },
    generateTaskRisk(contractorName, templateKey, contains) {
      return _call('generateTaskRiskAi', generateTaskRiskAi, [contractorName, templateKey, contains]);
    },
    fillFmea() {
      return _call('rbi_fillFmeaWithAi', rbi_fillFmeaWithAi, []);
    },
    generateWorkshop(taskId) {
      return _call('rbi_generateWorkshop', rbi_generateWorkshop, [taskId]);
    },
    generateIntroBriefing(taskId) {
      return _call('rbi_generateIntroBriefing', rbi_generateIntroBriefing, [taskId]);
    },
    generateFinalAcceptance(taskId) {
      return _call('rbi_generateFinalAcceptance', rbi_generateFinalAcceptance, [taskId]);
    },
    generateMeetingMemo() {
      return _call('rbi_generateMeetingMemo', rbi_generateMeetingMemo, []);
    },
    generatePracticeTitle() {
      return _call('rbi_generatePracticeTitleAi', rbi_generatePracticeTitleAi, []);
    },
    beautifyPractice() {
      return _call('rbi_beautifyPracticeAi', rbi_beautifyPracticeAi, []);
    },

    // ── База знаний ───────────────────────────────────────────────────────
    generateTwiDraft() {
      return _call('generateTwiDraftAi', generateTwiDraftAi, []);
    },
    normalizeFeedback(rawText) {
      return _call('rbi_normalizeFeedbackAi', rbi_normalizeFeedbackAi, [rawText]);
    },

    // ── Чат с документом ─────────────────────────────────────────────────
    openDocChat() {
      return _call('openAiDocChat', openAiDocChat, []);
    },
    applyAiDocChip(...args) {
      return _call('applyAiDocChip', applyAiDocChip, args);
    },
    closeDocChat() {
      return _call('closeAiDocChat', closeAiDocChat, []);
    },
    askDocQuestion() {
      return _call('askAiDocQuestion', askAiDocQuestion, []);
    },

    // ── СК-специфичные ────────────────────────────────────────────────────
    skMapColumns() {
      return _call('sk_aiMapColumns', sk_aiMapColumns, []);
    },
    skAutoMapCategories(silent, forceAll) {
      return _call('sk_autoMapCategories', sk_autoMapCategories, [silent, forceAll]);
    },
    skContractorSummary(contractorName, safeId) {
      return _call('sk_generateContractorAiSummary', sk_generateContractorAiSummary, [contractorName, safeId]);
    },
    skPredictRisks(silent) {
      return _call('sk_predictRisksAi', sk_predictRisksAi, [silent]);
    },
    skAuditTemplates() {
      return _call('sk_auditTemplatesAi', sk_auditTemplatesAi, []);
    },
    openSkTutorAiModal(...args) {
      return _call('openSkTutorAiModal', openSkTutorAiModal, args);
    },
    closeSkTutorAiModal() {
      return _call('closeSkTutorAiModal', closeSkTutorAiModal, []);
    },
    copySkTutorAiText() {
      return _call('copySkTutorAiText', copySkTutorAiText, []);
    },
    reopenSkTutorAiModal() {
      return _call('reopenSkTutorAiModal', reopenSkTutorAiModal, []);
    },

    // ── Геймификация ──────────────────────────────────────────────────────
    gameAddContractorAlias(canonicalKey, predefinedValue) {
      return _call('gameAddContractorAliasInline', gameAddContractorAliasInline, [canonicalKey, predefinedValue]);
    },
    gameContractorSynonyms(canonicalKey, displayName) {
      return _call('gameGenerateContractorSynonymsAI', gameGenerateContractorSynonymsAI, [canonicalKey, displayName]);
    },

    // ── Утилиты ───────────────────────────────────────────────────────────
    runSelfLearning() {
      return _call('runSelfLearningAi', runSelfLearningAi, []);
    },
    generateRoutePlan() {
      return _call('generateAiRoutePlan', generateAiRoutePlan, []);
    },
    generateTutorAdvice() {
      return _call('generateAiTutorAdvice', generateAiTutorAdvice, []);
    },
    generateHintForDefect() {
      return _call('generateAiHintForDefect', generateAiHintForDefect, []);
    },
    generateCultureAnalysis(contractorName) {
      return _call('generateCultureAi', generateCultureAi, [contractorName]);
    }
};

export {
  changeAiMode, callAI, generateSmartComment, generateOnePagerForecastAi,
  generatePulseAi, generateHeatmapAi, openHeatmapAiModal, closeHeatmapAiModal, copyHeatmapAiText, reopenHeatmapAiModal,
  generateContractorForecastAi, generateCultureAi,
  generateTwiDraftAi, generatePrescriptionAi, generateTaskRiskAi, generateAiRoutePlan,
  generateAiTutorAdvice, generateAiHintForDefect, extractTextFromPdf, rbi_normalizeFeedbackAi,
  openAiDocChat, closeAiDocChat, askAiDocQuestion, copyAiDocAnswer, applyAiDocChip, rbi_generateMeetingMemo,
  rbi_generatePracticeTitleAi, rbi_beautifyPracticeAi,   rbi_fillFmeaWithAi, generateDefectRemediationTexts, rbi_generateWorkshop,
  openWorkshopAiModal, closeWorkshopAiModal, copyWorkshopAiText, reopenWorkshopAiModal,
  rbi_generateIntroBriefing, rbi_generateFinalAcceptance, sk_aiMapColumns, sk_autoMapCategories,
  sk_generateContractorAiSummary, sk_predictRisksAi, rbi_generateGlobalAi, runSelfLearningAi,
  sk_auditTemplatesAi, openSkTutorAiModal, closeSkTutorAiModal, copySkTutorAiText, reopenSkTutorAiModal,
  gameAddContractorAliasInline, gameGenerateContractorSynonymsAI,
  AIActions
};
