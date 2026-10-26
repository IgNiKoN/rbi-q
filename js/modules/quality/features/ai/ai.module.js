// === AI Module — Фаза 19 ===
// Контракт платформы. ES-модуль (type="module").
// Загружает сторонние файлы как side-effect imports, затем регистрирует модуль.

import { AIState } from './ai.state.js';
import {
  AIActions, changeAiMode, callAI, generateSmartComment, generateOnePagerForecastAi,
  generatePulseAi, generateHeatmapAi, openHeatmapAiModal, closeHeatmapAiModal, copyHeatmapAiText, reopenHeatmapAiModal,
  generateContractorForecastAi, generateCultureAi,
  generateTwiDraftAi, generatePrescriptionAi, generateTaskRiskAi, generateAiRoutePlan,
  generateAiTutorAdvice, generateAiHintForDefect, extractTextFromPdf, rbi_normalizeFeedbackAi,
  openAiDocChat, closeAiDocChat, askAiDocQuestion, copyAiDocAnswer, applyAiDocChip, rbi_generateMeetingMemo,
  rbi_generatePracticeTitleAi, rbi_beautifyPracticeAi, rbi_fillFmeaWithAi, generateDefectRemediationTexts, rbi_generateWorkshop,
  openWorkshopAiModal, closeWorkshopAiModal, copyWorkshopAiText, reopenWorkshopAiModal,
  rbi_generateIntroBriefing, rbi_generateFinalAcceptance, sk_aiMapColumns, sk_autoMapCategories,
  sk_generateContractorAiSummary, sk_predictRisksAi, rbi_generateGlobalAi, runSelfLearningAi,
  sk_auditTemplatesAi, openSkTutorAiModal, closeSkTutorAiModal, copySkTutorAiText, reopenSkTutorAiModal,
  gameAddContractorAliasInline, gameGenerateContractorSynonymsAI
} from './ai.actions.js';
import { AIRender } from './ai.render.js';

window.AIState = AIState;
window.AIActions = AIActions;
window.AIRender = AIRender;
window.changeAiMode = changeAiMode;
window.callAI = callAI;
window.generateSmartComment = generateSmartComment;
window.generateOnePagerForecastAi = generateOnePagerForecastAi;
window.generatePulseAi = generatePulseAi;
window.generateHeatmapAi = generateHeatmapAi;
window.openHeatmapAiModal = openHeatmapAiModal;
window.closeHeatmapAiModal = closeHeatmapAiModal;
window.copyHeatmapAiText = copyHeatmapAiText;
window.reopenHeatmapAiModal = reopenHeatmapAiModal;
window.generateContractorForecastAi = generateContractorForecastAi;
window.generateCultureAi = generateCultureAi;
window.generateTwiDraftAi = generateTwiDraftAi;
window.generatePrescriptionAi = generatePrescriptionAi;
window.generateTaskRiskAi = generateTaskRiskAi;
window.generateAiRoutePlan = generateAiRoutePlan;
window.generateAiTutorAdvice = generateAiTutorAdvice;
window.generateAiHintForDefect = generateAiHintForDefect;
window.extractTextFromPdf = extractTextFromPdf;
window.rbi_normalizeFeedbackAi = rbi_normalizeFeedbackAi;
window.openAiDocChat = openAiDocChat;
window.closeAiDocChat = closeAiDocChat;
window.askAiDocQuestion = askAiDocQuestion;
window.copyAiDocAnswer = copyAiDocAnswer;
window.applyAiDocChip = applyAiDocChip;
window.rbi_generateMeetingMemo = rbi_generateMeetingMemo;
window.rbi_generatePracticeTitleAi = rbi_generatePracticeTitleAi;
window.rbi_beautifyPracticeAi = rbi_beautifyPracticeAi;
window.rbi_fillFmeaWithAi = rbi_fillFmeaWithAi;
window.generateDefectRemediationTexts = generateDefectRemediationTexts;
window.rbi_generateWorkshop = rbi_generateWorkshop;
window.openWorkshopAiModal = openWorkshopAiModal;
window.closeWorkshopAiModal = closeWorkshopAiModal;
window.copyWorkshopAiText = copyWorkshopAiText;
window.reopenWorkshopAiModal = reopenWorkshopAiModal;
window.rbi_generateIntroBriefing = rbi_generateIntroBriefing;
window.rbi_generateFinalAcceptance = rbi_generateFinalAcceptance;
window.sk_aiMapColumns = sk_aiMapColumns;
window.sk_autoMapCategories = sk_autoMapCategories;
window.sk_generateContractorAiSummary = sk_generateContractorAiSummary;
window.sk_predictRisksAi = sk_predictRisksAi;
window.rbi_generateGlobalAi = rbi_generateGlobalAi;
window.runSelfLearningAi = runSelfLearningAi;
window.sk_auditTemplatesAi = sk_auditTemplatesAi;
window.openSkTutorAiModal = openSkTutorAiModal;
window.closeSkTutorAiModal = closeSkTutorAiModal;
window.copySkTutorAiText = copySkTutorAiText;
window.reopenSkTutorAiModal = reopenSkTutorAiModal;
window.gameAddContractorAliasInline = gameAddContractorAliasInline;
window.gameGenerateContractorSynonymsAI = gameGenerateContractorSynonymsAI;

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

// =========================================================================
// Full-screen «База знаний (AI)» — паттерн TWI-конструктора.
// Legacy #ai-chat-modal не монтируем (strangler: вход только через view).
// =========================================================================
function mountAiDocChatView() {
  if (document.getElementById('ai-doc-chat-view')) return;
  var root = document.body;
  if (!root) return;
  root.insertAdjacentHTML('beforeend', `
    <div id="ai-doc-chat-view"
        class="hidden bg-[var(--bg-main)] fixed inset-0 z-[2100] h-[100dvh] max-h-[100dvh] flex flex-col">
        <div
            class="bg-white/95 backdrop-blur-md border-b border-surface px-3 py-3 shadow-sm shrink-0 flex items-center gap-2">
            <button type="button" data-action="closeAiDocChat"
                class="text-rbi-label font-bold text-muted flex items-center gap-1 active:scale-95 bg-surface px-3 py-2 rounded-lg shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path>
                </svg> ${_t('quality.ai.btn.back', 'Назад')}
            </button>
            <div class="min-w-0 flex-1">
                <div class="font-black text-rbi-body uppercase tracking-tight text-ink truncate">${_t('quality.ai.title.doc_chat', 'База знаний (AI)')}</div>
                <div id="ai-doc-chat-status" class="text-rbi-caption text-brand font-bold truncate">${_t('quality.ai.status.search_norms', 'Поиск по загруженным нормативам')}</div>
            </div>
        </div>
        <div class="px-3 pt-2 shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
                <label class="text-rbi-caption font-black text-[var(--text-muted)] uppercase tracking-widest block mb-1">${_t('quality.ai.label.work_type', 'Вид работ (чек-лист)')}</label>
                <select id="ai-doc-template-filter" class="input-base text-rbi-label w-full !py-2.5">
                    <option value="">${_t('quality.ai.option.all_work_types', 'Все виды работ')}</option>
                </select>
            </div>
            <div>
                <label class="text-rbi-caption font-black text-[var(--text-muted)] uppercase tracking-widest block mb-1">${_t('quality.ai.label.pdf_doc', 'Документ PDF')}</label>
                <select id="ai-doc-filter" class="input-base text-rbi-label w-full !py-2.5">
                    <option value="">${_t('quality.ai.option.all_docs', 'Все документы')}</option>
                </select>
            </div>
        </div>
        <div id="ai-doc-chips" class="px-3 pt-2 shrink-0 flex flex-wrap gap-1.5 hidden"></div>
        <div id="ai-chat-history"
            class="flex-1 min-h-0 overflow-y-auto p-3 custom-scrollbar bg-surface space-y-3">
            <div class="flex gap-2 w-full max-w-[95%]">
                <div class="w-7 h-7 bg-brand-soft rounded-full flex items-center justify-center text-rbi-label shrink-0">🤖</div>
                <div class="bg-surface border border-surface p-3 rounded-2xl rounded-tl-none text-rbi-body text-ink shadow-sm leading-relaxed">
                    ${_t('quality.ai.welcome.doc_chat', 'Можно простым языком: «стены кривые по монолиту», «сколько мм можно». Сначала чек-листы, потом PDF; ниже ответа — источники.')}
                </div>
            </div>
        </div>
        <div class="shrink-0 border-t border-[var(--card-border)] bg-surface p-3 flex gap-2"
            style="padding-bottom: max(12px, env(safe-area-inset-bottom));">
            <textarea id="ai-chat-input"
                class="flex-1 bg-[var(--hover-bg)] border border-[var(--card-border)] rounded-xl p-3 text-rbi-body outline-none resize-none min-h-[64px] max-h-32 text-ink"
                placeholder="${_t('quality.ai.placeholder.chat', 'Например: стены кривые по монолиту…')}"
                rows="2"></textarea>
            <button type="button" data-action="askAiDocQuestion" id="ai-chat-send-btn"
                class="w-12 min-h-[64px] bg-brand text-white rounded-xl flex items-center justify-center shadow-md active:scale-95 shrink-0 self-end">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                </svg>
            </button>
        </div>
    </div>
`);
}
if (document.body) mountAiDocChatView();
else document.addEventListener('DOMContentLoaded', mountAiDocChatView);

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md). Разметка задаёт `data-action="<id>"`
// (+ опционально `data-action-arg` и `data-action-event` для onchange-случаев),
// один глобальный listener на document резолвит это в вызов window[id](arg?).
// Повторно используется последующими блоками той же инициативы для других групп владения.
function bindAiActionDelegation() {
  if (window.__aiActionDelegationBound) return;
  window.__aiActionDelegationBound = true;

  const dispatch = (el) => {
    const action = el.dataset.action;
    const fn = window[action];
    if (typeof fn !== 'function') return;
    const arg = el.dataset.actionArg;
    arg === undefined ? fn() : fn(arg);
  };

  // Ищем элемент с data-action вручную (не через closest()), воспроизводя
  // семантику реального bubble-распространения: подъём от target вверх
  // останавливается на узле с существующим inline `onclick="event.stopPropagation()"`
  // (напр. вложенный контейнер модалки ai-chat-modal, строка 4202 index.html —
  // задокументированное исключение карты, не трогается этим блоком), если
  // на этом узле не встречен свой data-action раньше. Это нужно, т.к. сам
  // делегированный listener всегда работает в capture-фазе (см. ниже) —
  // без ручной остановки на stopPropagation-узле клик внутри модалки
  // ошибочно матчился бы на data-action="closeAiDocChat" фонового бекдропа.
  const resolveActionElement = (target, wantsChange) => {
    let el = target;
    while (el && el.nodeType === 1) {
      if (el.dataset && el.dataset.action) {
        if (!!(el.dataset.actionEvent === 'change') === wantsChange) return el;
      }
      const inlineOnclick = el.getAttribute && el.getAttribute('onclick');
      if (!wantsChange && inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
      el = el.parentElement;
    }
    return null;
  };

  // Capture-фаза: гарантирует срабатывание до момента, когда реальный
  // inline `event.stopPropagation()` внутри модалки остановил бы bubble
  // (иначе делегированный listener на document, привязанный в bubble-фазе,
  // не получил бы событие для кнопок внутри такого контейнера).
  document.addEventListener('click', (e) => {
    const el = resolveActionElement(e.target, false);
    if (el) dispatch(el);
  }, true);

  document.addEventListener('change', (e) => {
    const el = resolveActionElement(e.target, true);
    if (el) dispatch(el);
  }, true);
}

const AIModule = {
  id: 'ai',
  routes: [],
  dependencies: ['storage', 'settings'],

  async init(ctx) {
    ctx.math      = window.RBI && window.RBI.utils && window.RBI.utils.math;
    ctx.toast     = window.RBI && window.RBI.utils && window.RBI.utils.toast;
    ctx.templates = window.RBI && window.RBI.utils && window.RBI.utils.templates;
    if (window.AIActions) window.AIActions.bindCtx(ctx);
    if (window.AIState) window.AIState.bindCtx(ctx);

    window.AIState.syncFromLegacy();

    mountAiDocChatView();
    bindAiActionDelegation();

    if (!window.__aiLocaleChangedBound && ctx.events && typeof ctx.events.on === 'function') {
      window.__aiLocaleChangedBound = true;
      ctx.events.on('i18n:localeChanged', function () {
        var el = document.getElementById('ai-doc-chat-view');
        var wasHidden = el && el.classList.contains('hidden');
        if (el) el.remove();
        // Remount scenario modals so chrome picks up new locale next open
        ['heatmap-ai-modal', 'workshop-ai-modal', 'sk-tutor-ai-modal'].forEach(function (id) {
          var m = document.getElementById(id);
          if (m) m.remove();
        });
        mountAiDocChatView();
        var neu = document.getElementById('ai-doc-chat-view');
        if (neu && !wasHidden) neu.classList.remove('hidden');
      });
    }

    document.addEventListener('settings:changed', (e) => {
      if (e.detail?.key === 'aiEnabled' || e.detail?.key === 'aiAuthMode') {
        window.AIState.syncFromLegacy();
      }
    });

    ctx.events?.emit('ai:initialized', { enabled: window.AIState.isEnabled() });
  },

  mount(container, ctx) {
    // AI-модуль не монтирует собственный UI
  },

  unmount() {
    // Нет подписок для очистки
  }
};

window.RBI.registry.register('module.ai', AIModule);
export { AIModule };
