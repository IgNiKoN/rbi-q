/* Файл: js/services/sync/sync-progress.ui.js
 * Прогресс-тост синхронизации (#mini-sync-toast).
 * Только 1-я полная / manual (решает sync-engine). Автокэш сюда не входит.
 */

(function () {
    'use strict';

    // Порядок = setStep(1..7) в sync-engine.core.js; 8-й — финал.
    const STEPS = [
        'Подготовка',
        'Получение проверок',
        'Получение задач',
        'Справочники',
        'Стройконтроль',
        'Отправка на сервер',
        'Сохранение',
        'Готово'
    ];

    let active = false;
    let stepIndex = 0;
    let pulled = 0;
    let pushed = 0;
    let statusOverride = null;
    let detailOverride = null;
    let hideTimer = null;

    function ensureToast() {
        let root = document.getElementById('mini-sync-toast');
        if (root && root.dataset.syncUi === 'v2') return root;

        if (root) root.remove();
        root = document.createElement('div');
        root.id = 'mini-sync-toast';
        root.dataset.syncUi = 'v2';
        root.className =
            'fixed left-1/2 bottom-24 z-[9000] w-[min(320px,calc(100vw-24px))] ' +
            'bg-slate-900/95 text-white rounded-2xl shadow-xl px-4 py-3.5 text-[11px] font-bold ' +
            'hidden border border-white/10 backdrop-blur-md -translate-x-1/2 ' +
            'transition-transform duration-300 ease-out';
        root.innerHTML = `
            <div class="flex items-center gap-2.5 mb-2">
                <span id="mini-sync-toast-icon" class="relative w-7 h-7 shrink-0 flex items-center justify-center">
                    <span id="mini-sync-toast-spin" class="absolute inset-0 m-auto w-5 h-5 rounded-full border-2 border-white/25 border-t-emerald-400 animate-spin"></span>
                    <span id="mini-sync-toast-check" class="hidden absolute inset-0 flex items-center justify-center">
                        <svg class="w-7 h-7 text-emerald-400" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                            <circle cx="14" cy="14" r="12" stroke="currentColor" stroke-width="2" opacity="0.35"/>
                            <path id="mini-sync-toast-check-path" d="M8 14.5L12.2 18.5L20 9.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="24" stroke-dashoffset="24"/>
                        </svg>
                    </span>
                </span>
                <div class="flex-1 min-w-0">
                    <div id="mini-sync-toast-status" class="text-[12px] font-black text-white leading-tight truncate">Синхронизация</div>
                    <div id="mini-sync-toast-stage" class="text-[10px] font-semibold text-white/55 mt-0.5 tabular-nums">Этап 1 из 7</div>
                </div>
            </div>
            <div id="mini-sync-toast-body">
                <div class="h-1.5 w-full rounded-full bg-white/15 overflow-hidden mb-2.5">
                    <div id="mini-sync-toast-bar" class="h-full bg-emerald-400 rounded-full transition-[width] duration-300 ease-out" style="width:0%"></div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[10px] font-semibold">
                    <div class="rounded-xl bg-white/5 px-2.5 py-1.5 border border-white/5">
                        <div class="text-white/50 uppercase tracking-wide text-[9px] mb-0.5">Получено</div>
                        <div class="text-white tabular-nums text-[12px] font-black"><span id="mini-sync-toast-dl">0</span> <span class="text-white/45 font-semibold">проверок</span></div>
                    </div>
                    <div class="rounded-xl bg-white/5 px-2.5 py-1.5 border border-white/5">
                        <div class="text-white/50 uppercase tracking-wide text-[9px] mb-0.5">Отправлено</div>
                        <div class="text-white tabular-nums text-[12px] font-black"><span id="mini-sync-toast-up">0</span> <span class="text-white/45 font-semibold">записей</span></div>
                    </div>
                </div>
                <div id="mini-sync-toast-detail" class="hidden mt-2 text-[10px] font-semibold text-emerald-300/95 leading-snug"></div>
            </div>
        `;

        if (!document.getElementById('mini-sync-toast-anim-style')) {
            const style = document.createElement('style');
            style.id = 'mini-sync-toast-anim-style';
            style.textContent = `
                @keyframes rbiSyncToastIn {
                    from { opacity: 0; transform: translate(-50%, 12px) scale(0.96); }
                    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
                }
                @keyframes rbiSyncToastSuccess {
                    0% { transform: translate(-50%, 0) scale(1); }
                    40% { transform: translate(-50%, 0) scale(1.04); }
                    100% { transform: translate(-50%, 0) scale(1); }
                }
                @keyframes rbiSyncCheckDraw {
                    to { stroke-dashoffset: 0; }
                }
                #mini-sync-toast.rbi-sync-enter {
                    animation: rbiSyncToastIn 0.35s ease-out both;
                }
                #mini-sync-toast.rbi-sync-success {
                    animation: rbiSyncToastSuccess 0.55s ease-out both;
                    border-color: rgba(52, 211, 153, 0.45);
                    box-shadow: 0 12px 40px rgba(16, 185, 129, 0.25);
                }
                #mini-sync-toast.rbi-sync-success #mini-sync-toast-check-path {
                    animation: rbiSyncCheckDraw 0.45s ease-out forwards;
                }
                #mini-sync-toast.rbi-sync-fail {
                    border-color: rgba(248, 113, 113, 0.45);
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(root);
        return root;
    }

    function workStepsCount() {
        // «Готово» не считаем рабочим этапом в «Этап N из M»
        return Math.max(1, STEPS.length - 1);
    }

    function paint(phase) {
        const root = ensureToast();
        const workTotal = workStepsCount();
        const workN = Math.min(workTotal, Math.max(1, stepIndex + 1));
        const pct = phase === 'done'
            ? 100
            : Math.min(99, Math.round((Math.min(stepIndex, workTotal - 1) / workTotal) * 100));

        const statusEl = root.querySelector('#mini-sync-toast-status');
        const stageEl = root.querySelector('#mini-sync-toast-stage');
        const barEl = root.querySelector('#mini-sync-toast-bar');
        const spinEl = root.querySelector('#mini-sync-toast-spin');
        const checkEl = root.querySelector('#mini-sync-toast-check');
        const dlEl = root.querySelector('#mini-sync-toast-dl');
        const upEl = root.querySelector('#mini-sync-toast-up');
        const detailEl = root.querySelector('#mini-sync-toast-detail');

        if (dlEl) dlEl.textContent = String(pulled);
        if (upEl) upEl.textContent = String(pushed);

        if (detailEl) {
            if (detailOverride) {
                detailEl.textContent = detailOverride;
                detailEl.classList.remove('hidden');
            } else {
                detailEl.textContent = '';
                detailEl.classList.add('hidden');
            }
        }

        root.classList.remove('rbi-sync-success', 'rbi-sync-fail');

        if (phase === 'fail') {
            if (statusEl) statusEl.textContent = statusOverride || 'Ошибка синхронизации';
            if (stageEl) stageEl.textContent = 'Не завершена';
            if (barEl) {
                barEl.style.width = pct + '%';
                barEl.className = 'h-full bg-rose-400 rounded-full transition-[width] duration-300 ease-out';
            }
            if (spinEl) spinEl.classList.add('hidden');
            if (checkEl) checkEl.classList.add('hidden');
            root.classList.add('rbi-sync-fail');
            return;
        }

        if (phase === 'done') {
            if (statusEl) statusEl.textContent = statusOverride || 'Синхронизация завершена';
            if (stageEl) stageEl.textContent = 'Все этапы выполнены';
            if (barEl) {
                barEl.style.width = '100%';
                barEl.className = 'h-full bg-emerald-400 rounded-full transition-[width] duration-300 ease-out';
            }
            if (spinEl) spinEl.classList.add('hidden');
            if (checkEl) {
                checkEl.classList.remove('hidden');
                const path = root.querySelector('#mini-sync-toast-check-path');
                if (path) {
                    path.style.strokeDashoffset = '24';
                    // restart draw
                    void path.getBoundingClientRect();
                    path.style.strokeDashoffset = '';
                }
            }
            root.classList.add('rbi-sync-success');
            return;
        }

        const label = STEPS[stepIndex] || 'Синхронизация';
        if (statusEl) statusEl.textContent = label;
        if (stageEl) stageEl.textContent = 'Этап ' + workN + ' из ' + workTotal;
        if (barEl) {
            barEl.style.width = pct + '%';
            barEl.className = 'h-full bg-emerald-400 rounded-full transition-[width] duration-300 ease-out';
        }
        if (spinEl) spinEl.classList.remove('hidden');
        if (checkEl) checkEl.classList.add('hidden');
    }

    function clearHideTimer() {
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
    }

    const api = {
        STEPS: STEPS,

        isActive: function () {
            return active;
        },

        begin: function () {
            clearHideTimer();
            active = true;
            stepIndex = 0;
            pulled = 0;
            pushed = 0;
            statusOverride = null;
            detailOverride = null;
            const root = ensureToast();
            root.classList.remove('hidden', 'rbi-sync-success', 'rbi-sync-fail');
            root.classList.remove('rbi-sync-enter');
            void root.offsetWidth;
            root.classList.add('rbi-sync-enter');
            paint();
        },

        /** @param {number|string} step — 1-based index или подпись */
        setStep: function (step) {
            if (!active) return;
            if (typeof step === 'number') {
                stepIndex = Math.max(0, Math.min(STEPS.length - 1, step - 1));
            } else if (typeof step === 'string') {
                const idx = STEPS.findIndex(function (s) {
                    return s === step || s.toLowerCase() === String(step).toLowerCase();
                });
                if (idx >= 0) stepIndex = idx;
            }
            paint();
        },

        addPulled: function (n) {
            if (!active) return;
            pulled += Math.max(0, Number(n) || 0);
            paint();
        },

        /** P2-0024: строка подробностей во время работы (например «Загрузка истории: 45%»); null — убрать. */
        setDetail: function (text) {
            if (!active) return;
            detailOverride = text ? String(text) : null;
            paint();
        },

        addPushed: function (n) {
            if (!active) return;
            pushed += Math.max(0, Number(n) || 0);
            paint();
        },

        setCounts: function (down, up) {
            if (!active) return;
            if (down != null) pulled = Math.max(0, Number(down) || 0);
            if (up != null) pushed = Math.max(0, Number(up) || 0);
            paint();
        },

        done: function (opts) {
            const root = document.getElementById('mini-sync-toast') || ensureToast();
            if (!active && !root) return;
            if (opts && (opts.pulled != null || opts.pushed != null)) {
                if (opts.pulled != null) pulled = Math.max(0, Number(opts.pulled) || 0);
                if (opts.pushed != null) pushed = Math.max(0, Number(opts.pushed) || 0);
            }
            statusOverride = (opts && opts.summary) ? String(opts.summary) : 'Синхронизация завершена';
            detailOverride = (opts && opts.detail) ? String(opts.detail) : null;
            stepIndex = STEPS.length - 1;
            active = false;
            root.classList.remove('hidden');
            paint('done');
            clearHideTimer();
            hideTimer = setTimeout(function () {
                api.hide();
            }, (opts && opts.hideAfterMs) || 3400);
        },

        /** Ждёт скрытия тоста sync — чтобы кэш-тост не перекрывал. */
        whenHidden: function (timeoutMs) {
            const limit = typeof timeoutMs === 'number' ? timeoutMs : 8000;
            const started = Date.now();
            return new Promise(function (resolve) {
                function tick() {
                    const root = document.getElementById('mini-sync-toast');
                    const visible = !!(root && !root.classList.contains('hidden'));
                    if (!active && !visible) {
                        resolve();
                        return;
                    }
                    if (Date.now() - started > limit) {
                        resolve();
                        return;
                    }
                    setTimeout(tick, 120);
                }
                tick();
            });
        },

        fail: function (opts) {
            const root = document.getElementById('mini-sync-toast') || ensureToast();
            if (!active && !root) return;
            statusOverride = (opts && opts.summary) ? String(opts.summary) : 'Ошибка синхронизации';
            detailOverride = (opts && opts.detail) ? String(opts.detail) : null;
            active = false;
            root.classList.remove('hidden');
            paint('fail');
            clearHideTimer();
            hideTimer = setTimeout(function () {
                api.hide();
            }, (opts && opts.hideAfterMs) || 3500);
        },

        hide: function () {
            clearHideTimer();
            active = false;
            statusOverride = null;
            detailOverride = null;
            const root = document.getElementById('mini-sync-toast');
            if (root) {
                root.classList.add('hidden');
                root.classList.remove('rbi-sync-success', 'rbi-sync-fail', 'rbi-sync-enter');
            }
        }
    };

    window.rbiSyncProgress = api;
})();
