/* Файл: js/modules/knowledge/features/reference.js */
/* Internal feature knowledge/reference — «Справочник → Чек-листы»: рендер, конструктор пользовательских
   чек-листов, Excel импорт/экспорт, открытие связанного НД. Classic-script (не ES-модуль) — перенесено
   1:1 из js/app.js, чтобы inline onclick/onchange из index.html продолжили работать без изменений. */

// =========================================================================
// РАЗМЕТКА ВКЛАДКИ «СПРАВОЧНИК» (перенос из index.html:442-1210, Блок 3
// инициативы «Перенос статичной разметки quality в JS-рендер»). По
// прецеденту Блоков 1/N (audit), 2/N (engineer/analytics) — HTML-строка
// 1:1 идентична прежней статичной разметке, монтаж на верхнем уровне
// файла, до остального кода.
// =========================================================================
function renderReferenceMarkup() {
    return `
        <div id="tab-reference" class="view-section">

            <!-- БЛОК ПОДВКЛАДОК СПРАВОЧНИКА (Липкий сверху) -->
            <div id="reference-subtabs-block" class="z-[45] transition-all duration-300 w-full max-w-4xl mx-auto py-2">
                <div
                    class="flex gap-1 p-1 bg-[var(--card-border)]/80 backdrop-blur-md rounded-xl overflow-x-auto no-scrollbar whitespace-nowrap text-center shadow-sm border border-[var(--card-border)]">
                    <button data-reference-action="switchReferenceSubTab" data-action-arg="ref-sub-checklists" data-reference-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-[9px] sm:text-[10px] font-bold uppercase rounded-md bg-white shadow-sm text-indigo-600 flex flex-col items-center gap-1 active">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2">
                            </path>
                        </svg><span data-i18n="quality.sub.reference.checklists">Ч/л</span>
                    </button>
                    <button data-reference-action="switchReferenceSubTab" data-action-arg="ref-sub-docs" data-reference-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-[9px] sm:text-[10px] font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253">
                            </path>
                        </svg><span data-i18n="quality.sub.reference.docs">НД</span>
                    </button>
                    <button data-reference-action="switchReferenceSubTab" data-action-arg="ref-sub-twi" data-reference-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-[9px] sm:text-[10px] font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z">
                            </path>
                        </svg><span data-i18n="quality.sub.reference.twi">TWI</span>
                    </button>
                    <button data-reference-action="switchReferenceSubTab" data-action-arg="ref-sub-nodes" data-reference-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-[9px] sm:text-[10px] font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10">
                            </path>
                        </svg><span data-i18n="quality.sub.reference.nodes">Узлы</span>
                    </button>
                    <button data-reference-action="switchReferenceSubTab" data-action-arg="ref-sub-practices" data-reference-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-[9px] sm:text-[10px] font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z">
                            </path>
                        </svg><span data-i18n="quality.sub.reference.practices">Практики</span>
                    </button>
                </div>
            </div>

            <!-- ПОДВКЛАДКА 1: ЧЕК-ЛИСТЫ -->
            <div id="ref-sub-checklists" class="ref-sub-section">

                <!-- ЕДИНАЯ ЛИПКАЯ ПАНЕЛЬ (Поиск + Управление) -->
                <div id="ref-filters-block"
                    class="sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-4 mt-2">

                    <!-- СТРОКА 1: Выбор чек-листа (Всегда виден) -->
                    <div
                        class="relative flex items-center bg-indigo-50 dark:bg-indigo-900/30 px-3 py-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800 cursor-pointer mb-2">
                        <span
                            class="text-[11px] font-black text-indigo-700 dark:text-indigo-400 uppercase w-full flex justify-between"
                            id="ref-selector-label">Выберите чек-лист... <span>▼</span></span>
                        <select id="ref-checklist-selector"
                            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            data-reference-action="changeRefTemplate" data-reference-action-val-type="element" data-action-event="change">
                            <option value="" disabled selected>Выбрать...</option>
                            <optgroup label="Системные" id="ref-system-group"></optgroup>
                            <optgroup label="Загруженные" id="ref-user-group"></optgroup>
                        </select>
                    </div>

                    <!-- СТРОКА 2: Поиск (Всегда виден) -->
                    <div class="relative mb-2">
                        <span class="absolute left-3 top-3 text-slate-400"><svg class="w-4 h-4" fill="none"
                                stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                            </svg></span>
                        <input type="text" id="ref-search" class="input-base pl-9 text-[11px] !py-2.5"
                            placeholder="Поиск пункта, ГОСТ, СП..." oninput="renderReferenceTab()">
                    </div>

                    <!-- ЗАГОЛОВОК-КНОПКА СВОРАЧИВАНИЯ УПРАВЛЕНИЯ -->
                    <div data-knowledge-action="toggleManagePanel"
                        class="text-[10px] font-black text-[var(--text-muted)] uppercase mt-3 pt-3 border-t border-[var(--card-border)] flex justify-between items-center cursor-pointer active:opacity-70 transition-opacity">
                        <span class="flex items-center gap-1.5">⚙️ Управление шаблонами</span>
                        <span id="ref-manage-toggle-icon"
                            class="text-lg leading-none transform -rotate-90 transition-transform duration-300">▾</span>
                    </div>

                    <!-- ТЕЛО УПРАВЛЕНИЯ (Компактное) -->
                    <div id="ref-manage-body"
                        style="transition: max-height 0.4s ease, opacity 0.3s ease, margin-top 0.3s ease; max-height: 0px; opacity: 0; overflow: hidden; margin-top: 0px;">
                        <div class="grid grid-cols-4 gap-2 mt-3 mb-2">
                            <button data-reference-action="openTemplateBuilder"
                                class="bg-indigo-50 text-indigo-700 border border-indigo-200 py-2 rounded-lg text-[9px] font-bold uppercase active:scale-95 shadow-sm">+
                                Создать</button>
                            <button data-reference-action="triggerExcelImport"
                                class="bg-slate-50 text-slate-700 border border-slate-200 py-2 rounded-lg text-[9px] font-bold uppercase active:scale-95 shadow-sm">↑
                                Excel</button>
                            <button data-reference-action="exportAllTemplatesJson"
                                class="bg-slate-50 text-slate-700 border border-slate-200 py-2 rounded-lg text-[9px] font-bold uppercase active:scale-95 shadow-sm">↓
                                В код</button>
                            <button data-reference-action="showExcelHelp"
                                class="bg-slate-100 text-slate-500 border border-slate-200 py-2 rounded-lg text-[9px] font-bold uppercase active:scale-95 shadow-sm">Формат?</button>
                        </div>
                        <div id="settings-user-templates-list"
                            class="space-y-1.5 mt-2 border-t border-slate-100 dark:border-slate-700 pt-2 max-h-[150px] overflow-y-auto custom-scrollbar">
                        </div>
                    </div>

                </div>

                <!-- СПИСОК ПУНКТОВ -->
                <div id="reference-items" class="mt-2 pb-6">
                    <div
                        class="text-center py-8 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm">
                        <div class="text-3xl mb-2">📖</div>
                        <div class="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wide">Выберите
                            чек-лист выше</div>
                    </div>
                </div>
            </div>

            <!-- ПОДВКЛАДКА 2: НОРМАТИВЫ (НД) -->
            <div id="ref-sub-docs" class="ref-sub-section hidden">
                <!-- ЛИПКАЯ ПАНЕЛЬ ФИЛЬТРОВ НД (ДОБАВЛЕН ID) -->
                <div id="ref-docs-filters"
                    class="sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-4 mt-2">
                    <div class="flex justify-between items-center mb-2">
                        <div class="relative flex-1 mr-2">
                            <span class="absolute left-3 top-2.5 text-slate-400"><svg class="w-4 h-4" fill="none"
                                    stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg></span>
                            <input type="text" id="doc-search-input" class="input-base pl-9 text-[11px]"
                                placeholder="Поиск ГОСТ, СП..." oninput="renderDocsList()">
                        </div>
                        <button data-action="openAiDocChat"
                            class="bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/40 dark:border-indigo-800 dark:text-indigo-400 px-3 py-2 rounded-lg shadow-sm active:scale-95 text-[10px] font-black uppercase whitespace-nowrap mr-2 flex items-center gap-1">
                            🤖 Спросить ИИ
                        </button>
                        <button data-knowledge-action="openAddDocModal"
                            class="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg shadow-sm active:scale-95 text-[10px] font-bold uppercase whitespace-nowrap">➕
                            Свой НД</button>
                        <button data-knowledge-action="exportDocsJsCode"
                            class="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg shadow-sm active:scale-95 text-[10px] font-bold uppercase whitespace-nowrap ml-2">
                            <svg class="w-4 h-4 inline-block -mt-0.5 mr-1" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                            </svg>
                            В код (JS)
                        </button>
                    </div>
                    <div class="flex gap-2 overflow-x-auto no-scrollbar pb-1 border-t border-[var(--card-border)] pt-2"
                        id="doc-filters-container">
                        <button data-knowledge-action="filterDocs" data-action-arg="ALL" data-knowledge-action-arg2-type="element"
                            class="doc-filter-btn px-3 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-600 text-white shadow-sm active:scale-95 whitespace-nowrap border border-indigo-600">Все</button>
                        <button data-knowledge-action="filterDocs" data-action-arg="СП" data-knowledge-action-arg2-type="element"
                            class="doc-filter-btn px-3 py-1.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 active:scale-95 whitespace-nowrap border border-slate-200 dark:border-slate-700">СП</button>
                        <button data-knowledge-action="filterDocs" data-action-arg="ГОСТ" data-knowledge-action-arg2-type="element"
                            class="doc-filter-btn px-3 py-1.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 active:scale-95 whitespace-nowrap border border-slate-200 dark:border-slate-700">ГОСТ</button>
                        <button data-knowledge-action="filterDocs" data-action-arg="ПРОЕКТ" data-knowledge-action-arg2-type="element"
                            class="doc-filter-btn px-3 py-1.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 active:scale-95 whitespace-nowrap border border-slate-200 dark:border-slate-700">Проект
                            / РД</button>
                    </div>
                </div>

                <!-- СПИСОК НД -->
                <div id="docs-list-container" class="space-y-3 pb-8"></div>
            </div>

            <!-- ПОДВКЛАДКА 3: TWI КАРТЫ И ТЕХКАРТЫ -->
            <div id="ref-sub-twi" class="ref-sub-section hidden mt-2 relative">
                <!-- ЭКРАН 1: СПИСОК КАРТ -->
                <div id="twi-list-view">
                    <div id="twi-filters-block"
                        class="sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md border border-[var(--card-border)] rounded-xl p-3 shadow-sm mb-4 mt-2">

                        <div class="flex flex-col gap-2">
                            <div id="twi-type-filters" class="flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2 flex-wrap">
                                <button type="button" id="twi-show-inspector" role="switch" aria-pressed="true"
                                    onclick="window.kbShowTwiInspector=!window.kbShowTwiInspector; renderTwiList()"
                                    class="kb-type-chip px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all bg-indigo-600 text-white shadow-sm active:scale-95">Технадзор</button>
                                <button type="button" id="twi-show-worker" role="switch" aria-pressed="true"
                                    onclick="window.kbShowTwiWorker=!window.kbShowTwiWorker; renderTwiList()"
                                    class="kb-type-chip px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all bg-indigo-600 text-white shadow-sm active:scale-95">Инструкция</button>
                                <button type="button" id="twi-show-pdf" role="switch" aria-pressed="true"
                                    onclick="window.kbShowTwiPdf=!window.kbShowTwiPdf; renderTwiList()"
                                    class="kb-type-chip px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all bg-indigo-600 text-white shadow-sm active:scale-95">Регламент</button>
                            </div>

                            <div class="flex justify-between items-center gap-2">
                                <label class="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform">
                                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-400"
                                        id="twi-toggle-label">Только мои</span>
                                    <div class="relative">
                                        <input type="checkbox" id="twi-owner-toggle" class="sr-only peer"
                                            onchange="window.twiOwnerFilter = this.checked ? 'MY' : 'ALL'; document.getElementById('twi-toggle-label').className = this.checked ? 'text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400' : 'text-[10px] font-black uppercase tracking-widest text-slate-400';"
                                            data-knowledge-action="renderTwiList" data-action-event="change">
                                        <div
                                            class="w-8 h-4 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500">
                                        </div>
                                    </div>
                                </label>
                                <div class="flex items-center gap-2 shrink-0">
                                    <div id="twi-view-mode-toggle" class="shrink-0"></div>
                                    <button type="button" onclick="downloadMissingCloudFiles()"
                                        class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-500 active:scale-95 shadow-sm"
                                        title="Скачать всё для офлайна" aria-label="Скачать всё для офлайна">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            stroke-width="2" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div class="flex justify-between items-center gap-2">
                                <div class="relative flex-1">
                                    <span class="absolute left-3 top-2.5 text-slate-400"><svg class="w-5 h-5" fill="none"
                                            stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                        </svg></span>
                                    <input type="text" id="twi-search-input" class="input-base pl-9 text-[12px] !py-2.5"
                                        placeholder="Поиск инструкций..." oninput="renderTwiList()">
                                </div>
                                <button data-knowledge-action="openTwiConstructor"
                                    class="bg-indigo-600 text-white px-4 py-2.5 rounded-xl shadow-sm active:scale-95 text-[11px] font-bold uppercase flex items-center gap-1">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                        stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path>
                                    </svg> Создать
                                </button>
                            </div>
                        </div>
                        <div data-knowledge-action="toggleTwiManagePanel"
                            class="text-[10px] font-bold text-[var(--text-muted)] uppercase pt-2 border-t border-[var(--card-border)] flex justify-between items-center cursor-pointer active:opacity-70 transition-opacity">
                            <span class="flex items-center gap-1.5"><svg class="w-4 h-4" fill="none"
                                    stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z">
                                    </path>
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                </svg> Управление базой TWI</span>
                            <span id="twi-manage-toggle-icon" class="transition-transform duration-300"><svg
                                    class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                                </svg></span>
                        </div>
                        <div id="twi-manage-body"
                            style="max-height: 0px; opacity: 0; overflow: hidden; transition: all 0.3s ease;">
                            <div class="flex gap-2 mt-3">
                                <button onclick="document.getElementById('twi-import-input').click()"
                                    class="flex-1 flex justify-center items-center py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 active:scale-95 border border-[var(--card-border)] shadow-sm font-bold text-[10px] uppercase gap-1.5">
                                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5">
                                        </path>
                                    </svg> Импорт
                                </button>
                                <button data-knowledge-action="exportTwiJson"
                                    class="flex-1 flex justify-center items-center py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 active:scale-95 border border-[var(--card-border)] shadow-sm font-bold text-[10px] uppercase gap-1.5">
                                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3">
                                        </path>
                                    </svg> Экспорт
                                </button>
                            </div>
                        </div>
                    </div>
                    <div id="twi-cards-container" class="pb-8"></div>
                </div>

                <!-- ЭКРАН 2: КОНСТРУКТОР TWI -->
                <div id="twi-constructor-view"
                    class="hidden bg-[var(--bg-main)] fixed inset-0 z-[2000] h-screen pb-32 overflow-y-auto custom-scrollbar">
                    <div
                        class="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 p-4 mb-4 shadow-sm sticky top-0 z-40 flex justify-between items-center">
                        <button data-knowledge-action="closeTwiConstructor"
                            class="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 active:scale-95 bg-slate-100 dark:bg-slate-700 px-3 py-2 rounded-lg transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path>
                            </svg> Назад
                        </button>
                        <div class="text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-widest">
                            Конструктор TWI</div>
                        <button data-knowledge-action="saveTwiCard"
                            class="text-[11px] font-bold text-white bg-indigo-600 px-4 py-2 rounded-lg active:scale-95 shadow-md transition-colors">Сохранить</button>
                    </div>

                    <div class="space-y-4 px-3 max-w-2xl mx-auto">
                        <!-- ПЕРЕКЛЮЧАТЕЛЬ ТИПА КАРТЫ -->
                        <div
                            class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 shadow-sm flex gap-1">
                            <button id="twi-type-btn-inspector" data-knowledge-action="changeTwiType" data-action-arg="INSPECTOR"
                                class="flex-1 py-2.5 text-[10px] font-bold uppercase rounded-lg bg-indigo-50 shadow-sm text-indigo-600 border border-indigo-200 transition-all flex items-center justify-center gap-1.5">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z">
                                    </path>
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                </svg> Технадзор
                            </button>
                            <button id="twi-type-btn-worker" data-knowledge-action="changeTwiType" data-action-arg="WORKER"
                                class="flex-1 py-2.5 text-[10px] font-bold uppercase rounded-lg text-slate-500 hover:text-slate-700 transition-all flex items-center justify-center gap-1.5">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.827A2.54 2.54 0 1110.608 9.27l-5.32 5.32a2.652 2.652 0 003.748 3.747l2.384-2.383zM10.5 10.5L6 6">
                                    </path>
                                </svg> Инструкция
                            </button>
                            <button id="twi-type-btn-pdf" data-knowledge-action="changeTwiType" data-action-arg="PDF"
                                class="flex-1 py-2.5 text-[10px] font-bold uppercase rounded-lg text-slate-500 hover:text-slate-700 transition-all flex items-center justify-center gap-1.5">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z">
                                    </path>
                                </svg> PDF-Файл
                            </button>
                        </div>

                        <!-- ОБЩАЯ ИНФОРМАЦИЯ И ПРИВЯЗКИ ДЛЯ ВСЕХ ТИПОВ -->
                        <div
                            class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-4">
                            <div>
                                <label
                                    class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Название
                                    Карты / Документа *</label>
                                <input type="text" id="twi-title-input" class="input-base text-[13px]"
                                    placeholder="Например: Правильный монтаж кронштейна">
                            </div>
                            <div>
                                <label
                                    class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Привязка
                                    к чек-листу *</label>
                                <select id="twi-checklist-select" class="input-base text-[12px]"
                                    data-knowledge-action="populateTwiItemSelect" data-action-event="change"></select>
                            </div>
                            <div class="pt-4 border-t border-slate-100 dark:border-slate-700">
                                <label
                                    class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1 block">Привязка
                                    к пункту контроля *</label>
                                <select id="twi-item-select" class="input-base text-[12px] mb-3"
                                    data-knowledge-action="autoFillTwiNorm" data-action-event="change">
                                    <option value="" disabled selected>Сначала выберите чек-лист выше...</option>
                                </select>

                                <div class="flex gap-2">
                                    <div class="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-[11px] text-slate-600 dark:text-slate-400 min-h-[44px]"
                                        id="twi-auto-norm-text">Справочный норматив пункта...</div>
                                    <button data-knowledge-action="searchNormFromTwi"
                                        class="w-12 shrink-0 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-xl flex items-center justify-center border border-indigo-200 dark:border-indigo-800 active:scale-95 transition-transform"
                                        title="Искать в базе НД">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div
                                class="pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <div>
                                    <div class="text-[10px] font-bold text-[var(--text-muted)] uppercase">Технический
                                        узел</div>
                                    <div id="twi-linked-node-name"
                                        class="text-[12px] font-black text-slate-800 dark:text-white mt-0.5">Не привязан
                                    </div>
                                    <input type="hidden" id="twi-linked-node-id" value="">
                                </div>
                                <button data-knowledge-action="openNodeSelectorModal"
                                    class="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 px-3 py-2 rounded-xl text-[10px] font-bold uppercase flex items-center gap-1.5 active:scale-95 transition-colors shadow-sm border border-slate-200 dark:border-slate-600">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                        stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244">
                                        </path>
                                    </svg> Привязать
                                </button>
                            </div>
                            <div class="pt-4 border-t border-slate-100 dark:border-slate-700">
                                <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Связь
                                    со справочником НД</label>
                                <select id="twi-linked-doc-id" class="input-base text-[12px]"></select>
                            </div>
                            <div class="pt-4 border-t border-slate-100 dark:border-slate-700">
                                <label
                                    class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Ссылка
                                    на видео (YouTube / Облако)</label>
                                <input type="url" id="twi-video-link-input" class="input-base text-[12px]"
                                    placeholder="https://...">
                            </div>
                        </div>

                        <!-- БЛОК А: ТЕХНАДЗОР (ПРАВИЛЬНО/БРАК) -->
                        <div id="twi-block-inspector" class="space-y-4">
                            <button data-action="generateTwiDraftAi"
                                class="w-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 py-3 rounded-xl font-black text-[11px] uppercase active:scale-95 transition-transform flex justify-center items-center gap-2 shadow-sm">
                                🤖 Сгенерировать черновик (ИИ)
                            </button>
                            <div
                                class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-4">
                                <div>
                                    <label
                                        class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Почему
                                        это важно? (Риски нарушения)</label>
                                    <textarea id="twi-why-input" class="input-base text-[12px] h-16 resize-none"
                                        placeholder="Напр: Приведет к промерзанию стены..."></textarea>
                                </div>
                                <div class="pt-4 border-t border-slate-100 dark:border-slate-700">
                                    <label
                                        class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Условия
                                        приемки (Как подготовить)</label>
                                    <textarea id="twi-preparation-input" class="input-base text-[12px] h-16 resize-none"
                                        placeholder="Напр: Очистить поверхность, обеспечить освещение..."></textarea>
                                </div>
                                <div>
                                    <label
                                        class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Допуски
                                        и критерии (Что соблюсти)</label>
                                    <textarea id="twi-compliance-input" class="input-base text-[12px] h-16 resize-none"
                                        placeholder="Напр: Отклонение не более 2 мм на 1 метр..."></textarea>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div
                                    class="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-2xl p-3 shadow-sm text-center flex flex-col">
                                    <div
                                        class="text-[11px] font-black text-green-700 dark:text-green-500 uppercase mb-2 flex justify-center items-center gap-1.5">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            stroke-width="2.5">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7">
                                            </path>
                                        </svg> ЭТАЛОН
                                    </div>
                                    <div id="twi-photo-good-container" data-photo=""
                                        class="flex-1 flex flex-col justify-center">
                                        <button data-knowledge-action="triggerTwiMarkupUpload" data-action-arg="GOOD"
                                            class="w-full h-full min-h-[90px] bg-white dark:bg-slate-800 border border-dashed border-green-300 dark:border-green-700 py-4 rounded-xl text-[10px] font-bold text-green-600 dark:text-green-500 active:scale-95 transition-all flex flex-col items-center justify-center gap-2 shadow-sm">
                                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                stroke-width="1.5">
                                                <path stroke-linecap="round" stroke-linejoin="round"
                                                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z">
                                                </path>
                                            </svg> Добавить фото
                                        </button>
                                    </div>
                                </div>
                                <div
                                    class="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-2xl p-3 shadow-sm text-center flex flex-col">
                                    <div
                                        class="text-[11px] font-black text-red-700 dark:text-red-500 uppercase mb-2 flex justify-center items-center gap-1.5">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            stroke-width="2.5">
                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                d="M6 18L18 6M6 6l12 12"></path>
                                        </svg> БРАК
                                    </div>
                                    <div id="twi-photo-bad-container" data-photo=""
                                        class="flex-1 flex flex-col justify-center">
                                        <button data-knowledge-action="triggerTwiMarkupUpload" data-action-arg="BAD"
                                            class="w-full h-full min-h-[90px] bg-white dark:bg-slate-800 border border-dashed border-red-300 dark:border-red-700 py-4 rounded-xl text-[10px] font-bold text-red-600 dark:text-red-500 active:scale-95 transition-all flex flex-col items-center justify-center gap-2 shadow-sm">
                                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                stroke-width="1.5">
                                                <path stroke-linecap="round" stroke-linejoin="round"
                                                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z">
                                                </path>
                                            </svg> Добавить фото
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- БЛОК Б: TWI РАБОЧИЙ (ПОШАГОВЫЙ) -->
                        <div id="twi-block-worker" class="space-y-4 hidden">
                            <!-- КНОПКА ГЕНЕРАЦИИ ИИ ДЛЯ РАБОЧЕГО -->
                            <button data-action="generateTwiDraftAi"
                                class="w-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 py-3 rounded-xl font-black text-[11px] uppercase active:scale-95 transition-transform flex justify-center items-center gap-2 shadow-sm">
                                🤖 Сгенерировать шаги (ИИ)
                            </button>

                            <div>
                                <div
                                    class="text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-widest mb-3 px-1 flex items-center gap-2">
                                    <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2">
                                        </path>
                                    </svg> Пошаговый алгоритм
                                </div>
                                <div id="twi-steps-container" class="space-y-3"></div>
                            </div>
                            <button data-knowledge-action="addTwiStep"
                                class="w-full bg-emerald-50 border border-dashed border-emerald-300 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400 py-4 rounded-2xl font-bold text-[11px] uppercase active:scale-95 flex items-center justify-center gap-2 transition-colors">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path>
                                </svg> Добавить следующий шаг
                            </button>
                        </div>

                        <!-- БЛОК В: ЗАГРУЗКА PDF -->
                        <div id="twi-block-pdf" class="space-y-4 hidden">
                            <div
                                class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm text-center">
                                <div
                                    class="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
                                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                        stroke-width="1.5">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z">
                                        </path>
                                    </svg>
                                </div>
                                <div
                                    class="text-[12px] font-bold text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                                    Прикрепите готовый проектный регламент, техкарту или письмо.<br>
                                    <span class="text-red-500 font-black text-[10px] uppercase mt-1 block">Максимальный
                                        размер: 5 МБ</span>
                                </div>
                                <div id="twi-pdf-container" data-pdf=""
                                    class="hidden mb-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-xl text-left flex justify-between items-center shadow-inner">
                                    <div class="flex-1 min-w-0 pr-3">
                                        <div class="text-[13px] font-black text-slate-800 dark:text-white truncate"
                                            id="twi-pdf-name">doc.pdf</div>
                                        <div class="text-[10px] text-slate-500 font-bold" id="twi-pdf-size">1.2 MB</div>
                                    </div>
                                    <button data-knowledge-action="removeTwiPdf"
                                        class="w-10 h-10 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-red-500 font-black shadow-sm border border-slate-200 dark:border-slate-700 active:scale-90">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </button>
                                </div>
                                <button onclick="document.getElementById('twi-pdf-input').click()"
                                    class="bg-indigo-600 text-white px-4 py-3.5 rounded-xl font-black text-[12px] uppercase tracking-widest shadow-md active:scale-95 w-full flex justify-center items-center gap-2">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                        stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5">
                                        </path>
                                    </svg>
                                    Выбрать PDF файл
                                </button>
                            </div>
                        </div>
                        <button data-knowledge-action="closeTwiConstructor"
                            class="w-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 py-3 rounded-xl font-bold text-[11px] uppercase active:scale-95 border border-slate-200 dark:border-slate-700 mt-2">
                            Отменить и закрыть
                        </button>

                    </div>
                </div>
            </div>

            <!-- ПОДВКЛАДКА 4: ТЕХ. УЗЛЫ И КОНСТРУКТОР -->
            <div id="ref-sub-nodes" class="ref-sub-section hidden mt-2">
                <!-- СПИСОК УЗЛОВ -->
                <div id="nodes-main-view">
                    <div id="node-filters-block"
                        class="sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md border border-[var(--card-border)] rounded-xl p-3 shadow-sm mb-4 mt-2">
                        <div class="flex justify-between items-center gap-2 mb-2">
                            <div class="relative flex-1">
                                <span class="absolute left-3 top-2.5 text-slate-400"><svg class="w-5 h-5" fill="none"
                                        stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                    </svg></span>
                                <input type="text" id="node-search-input" class="input-base pl-9 text-[12px] !py-2.5"
                                    placeholder="Поиск узлов и деталей..." oninput="renderNodesList()">
                            </div>
                            <button data-knowledge-action="openNodeConstructor"
                                class="bg-indigo-600 text-white px-4 py-2.5 rounded-xl shadow-sm active:scale-95 text-[11px] font-bold uppercase flex items-center gap-1">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path>
                                </svg> Создать
                            </button>
                        </div>

                        <!-- НОВАЯ ПАНЕЛЬ УПРАВЛЕНИЯ УЗЛАМИ -->
                        <div data-knowledge-action="toggleNodeManagePanel"
                            class="text-[10px] font-bold text-[var(--text-muted)] uppercase pt-2 border-t border-[var(--card-border)] flex justify-between items-center cursor-pointer active:opacity-70 transition-opacity mt-2">
                            <span class="flex items-center gap-1.5"><svg class="w-4 h-4" fill="none"
                                    stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z">
                                    </path>
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                </svg> Управление базой Узлов</span>
                            <span id="node-manage-toggle-icon" class="transition-transform duration-300"><svg
                                    class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                                </svg></span>
                        </div>
                        <div id="node-manage-body"
                            style="max-height: 0px; opacity: 0; overflow: hidden; transition: all 0.3s ease;">
                            <div class="flex gap-2 mt-3">
                                <button onclick="document.getElementById('node-import-input').click()"
                                    class="flex-1 flex justify-center items-center py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 active:scale-95 border border-[var(--card-border)] shadow-sm font-bold text-[10px] uppercase gap-1.5">
                                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5">
                                        </path>
                                    </svg> Из JSON
                                </button>
                                <button data-knowledge-action="exportNodeJson"
                                    class="flex-1 flex justify-center items-center py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 active:scale-95 border border-[var(--card-border)] shadow-sm font-bold text-[10px] uppercase gap-1.5">
                                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3">
                                        </path>
                                    </svg> В JSON
                                </button>
                                <button data-knowledge-action="exportNodeJsCode"
                                    class="flex-1 flex justify-center items-center py-2.5 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 active:scale-95 border border-indigo-200 dark:border-indigo-800 shadow-sm font-bold text-[10px] uppercase gap-1.5">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                        stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                                    </svg> В Код (JS)
                                </button>
                            </div>
                        </div>
                    </div>
                    <div id="nodes-list-container" class="pb-8"></div>
                </div>

                <!-- КОНСТРУКТОР УЗЛОВ (ИСПРАВЛЕНО: fixed inset-0 z-[2000]) -->
                <div id="node-constructor-view"
                    class="hidden bg-[var(--bg-main)] fixed inset-0 z-[2000] h-screen pb-32 overflow-y-auto custom-scrollbar">
                    <div
                        class="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 p-4 mb-4 shadow-sm sticky top-0 z-40 flex justify-between items-center">
                        <button data-knowledge-action="closeNodeConstructor"
                            class="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 active:scale-95 bg-slate-100 dark:bg-slate-700 px-3 py-2 rounded-lg transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path>
                            </svg> Назад
                        </button>
                        <div class="text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-widest">
                            Конструктор Узла</div>
                        <button data-knowledge-action="saveNodeCard"
                            class="text-[11px] font-bold text-white bg-indigo-600 px-4 py-2 rounded-lg active:scale-95 shadow-md transition-colors">Сохранить</button>
                    </div>

                    <div class="space-y-4 px-4 max-w-2xl mx-auto">
                        <div
                            class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-4">
                            <div>
                                <label
                                    class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Название
                                    узла *</label>
                                <input type="text" id="node-title-input" class="input-base text-[13px]"
                                    placeholder="Напр: Примыкание окна к стене">
                            </div>
                            <div>
                                <label
                                    class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Категория
                                    *</label>
                                <select id="node-category-input" class="input-base text-[12px]">
                                    <option value="ФАСАД">ФАСАД</option>
                                    <option value="МОНОЛИТ">МОНОЛИТ</option>
                                    <option value="ОКНА / ВИТРАЖИ">ОКНА / ВИТРАЖИ</option>
                                    <option value="ДВЕРИ">ДВЕРИ</option>
                                    <option value="КРОВЛЯ">КРОВЛЯ</option>
                                    <option value="КИРПИЧ / СКЦ">КИРПИЧ / СКЦ</option>
                                    <option value="ОТДЕЛКА">ОТДЕЛКА</option>
                                    <option value="БЛАГОУСТРОЙСТВО">БЛАГОУСТРОЙСТВО</option>
                                    <option value="ЗЕМЛЯ / СВАИ">ЗЕМЛЯ / СВАИ</option>
                                    <option value="ИНЖЕНЕРИЯ">ИНЖЕНЕРИЯ</option>
                                    <option value="ДРУГОЕ">ДРУГОЕ</option>
                                </select>
                            </div>
                            <div>
                                <label
                                    class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Описание
                                    (Назначение)</label>
                                <textarea id="node-desc-input" class="input-base text-[12px] h-20 resize-none"
                                    placeholder="Опишите область применения узла..."></textarea>
                            </div>

                            <div class="pt-2 border-t border-slate-100 dark:border-slate-700">
                                <label
                                    class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-2 block">Вложения
                                    (Фото / PDF)</label>
                                <div id="node-attachments-list" class="space-y-2 mb-3"></div>
                                <button onclick="document.getElementById('node-file-input').click()"
                                    class="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-500 active:scale-95 transition-colors flex items-center justify-center gap-2">
                                    ➕ Добавить файл
                                </button>
                                <input type="file" id="node-file-input" accept="image/*, application/pdf"
                                    style="display:none;" data-knowledge-action="handleNodeFileUpload" data-knowledge-action-val-type="event" data-action-event="change">
                            </div>
                        </div>

                        <div
                            class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-4">
                            <div>
                                <div
                                    class="text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2">
                                        </path>
                                    </svg> Спецификация материалов
                                </div>
                                <div id="node-materials-container" class="space-y-2 mb-3"></div>
                                <button data-knowledge-action="addNodeMaterialRow"
                                    class="w-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 py-3 rounded-xl font-bold text-[11px] uppercase active:scale-95 flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-800">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                        stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path>
                                    </svg> Добавить материал
                                </button>
                            </div>
                        </div>

                        <div>
                            <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Связь со
                                справочником НД</label>
                            <select id="node-linked-doc" class="input-base text-[12px]"></select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Связь с
                                TWI-картой</label>
                            <select id="node-linked-twi" class="input-base text-[12px]"></select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Связь с
                                Чек-листом</label>
                            <select id="node-linked-checklist" class="input-base text-[12px]"></select>
                        </div>

                        <!-- Дублирующая кнопка отмены внизу для удобства на длинных экранах -->
                        <button data-knowledge-action="closeNodeConstructor"
                            class="w-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 py-3 rounded-xl font-bold text-[11px] uppercase active:scale-95 border border-slate-200 dark:border-slate-700 mt-2">
                            Отменить и закрыть
                        </button>
                    </div>
                </div>
            </div>

            <!-- ПОДВКЛАДКА 5: FAQ И ЛОГИКА РАСЧЕТОВ (ОБНОВЛЕННЫЙ БОЛЬШОЙ FAQ) -->

            <!-- ПОДВКЛАДКА 5: ПРАКТИКИ -->
            <div id="ref-sub-practices" class="ref-sub-section hidden mt-2">
                <div id="practices-auto-detector" class="mb-4"></div>
                <div class="flex justify-between items-center mb-3">
                    <h2 class="text-[14px] font-black uppercase text-slate-800 dark:text-white tracking-tight">
                        Библиотека
                        Практик</h2>
                </div>
                <div id="practices-list-container" class="space-y-4 pb-8">
                    <!-- Список карточек -->
                </div>
            </div>

        </div> <!-- ИСТИННЫЙ ЗАКРЫВАЮЩИЙ ТЕГ ВКЛАДКИ СПРАВОЧНИКА (id="tab-reference") -->
`;
}

(function mountReferenceMarkup() {
    if (typeof window.rbiEnsureTabMarkup === 'function') {
        window.rbiEnsureTabMarkup('tab-reference', function () {
            return renderReferenceMarkup();
        }, '#reference-subtabs-block');
        return;
    }
    if (document.getElementById('tab-reference')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getContentRoot()
        : document.getElementById('app-content');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', renderReferenceMarkup());
}());

window.ensureReferenceMarkup = function () {
    if (typeof window.rbiEnsureTabMarkup === 'function') {
        return window.rbiEnsureTabMarkup('tab-reference', function () {
            return renderReferenceMarkup();
        }, '#reference-subtabs-block');
    }
    return !!document.getElementById('tab-reference');
};

// =========================================================================
// РАЗМЕТКА МОДАЛКИ «КОНСТРУКТОР ШАБЛОНОВ» (перенос из index.html:682-734,
// перенос 30 modal/overlay-блоков #app-modals в JS-рендер). HTML-строка 1:1
// идентична прежней статичной разметке.
// =========================================================================
function renderTemplateBuilderMarkup() {
    return `
    <div id="template-builder-overlay"
        class="fixed inset-0 bg-slate-900/80 z-[2000] hidden items-start justify-center p-2 sm:p-4 backdrop-blur-sm overflow-y-auto"
        data-reference-action="closeTemplateBuilder">
        <div class="bg-[var(--card-bg)] w-full max-w-2xl mt-4 mb-10 rounded-2xl shadow-2xl transition-transform flex flex-col overflow-hidden border border-[var(--card-border)]"
            onclick="event.stopPropagation()">
            <div
                class="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center sticky top-0 z-10 dark:bg-indigo-900/30 dark:border-indigo-800">
                <h3
                    class="font-black text-[13px] uppercase tracking-tight text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z">
                        </path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z">
                        </path>
                    </svg>
                    Конструктор чек-листа
                </h3>
                <div class="w-8 h-8 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center cursor-pointer shadow-sm text-slate-500"
                    data-reference-action="closeTemplateBuilder"><svg class="w-4 h-4" fill="none" stroke="currentColor"
                        viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                    </svg></div>
            </div>
            <div class="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar" id="builder-container">
                <div>
                    <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Название
                        чек-листа *</label>
                    <input type="text" id="builder-title" class="input-base text-sm"
                        placeholder="Например: Монтаж окон ПВХ">
                </div>
                <div id="builder-groups" class="space-y-4"></div>
                <button data-reference-action="addBuilderGroup"
                    class="w-full bg-[var(--hover-bg)] border border-dashed border-[var(--card-border)] text-[var(--text-muted)] py-4 rounded-xl font-bold text-[11px] uppercase active:scale-95 flex items-center justify-center gap-2 transition-colors hover:border-indigo-300 hover:text-indigo-600">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path>
                    </svg> Добавить этап контроля (Группу)
                </button>
            </div>
            <div class="p-4 border-t border-[var(--card-border)] bg-slate-50 dark:bg-slate-900 flex gap-2">
                <button data-reference-action="closeTemplateBuilder"
                    class="flex-1 bg-white border border-[var(--card-border)] text-slate-600 py-3.5 rounded-xl font-bold text-[11px] uppercase shadow-sm active:scale-95 dark:bg-slate-800 dark:text-slate-300">Отмена</button>
                <button data-reference-action="saveCustomTemplate"
                    class="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-[11px] uppercase shadow-md active:scale-95 flex justify-center items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4">
                        </path>
                    </svg> Сохранить шаблон
                </button>
            </div>
        </div>
    </div>
`;
}

(function mountTemplateBuilderMarkup() {
    if (document.getElementById('template-builder-overlay')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', renderTemplateBuilderMarkup());
}());

let _ctx = null;
function bindCtx(ctx) {
    _ctx = ctx;
    bindReferenceActionDelegation();
}
window.ReferenceShared = { bindCtx: bindCtx };

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-reference-action).
function bindReferenceActionDelegation() {
    if (window.__referenceActionDelegationBound) return;
    window.__referenceActionDelegationBound = true;

    var readArg = function (el, valType, evt) {
        switch (valType) {
            case 'element': return el;
            case 'event': return evt;
            case 'checked': return el.checked;
            case 'int': return parseInt(el.value, 10);
            case 'value': return el.value;
            default: return undefined;
        }
    };

    var dispatch = function (el, evt) {
        var action = el.dataset.referenceAction;
        var fn = window[action];
        if (typeof fn !== 'function') return;
        var valType = el.dataset.referenceActionValType;
        var arg = valType ? readArg(el, valType, evt) : el.dataset.actionArg;
        var arg2Type = el.dataset.referenceActionArg2Type;
        if (arg2Type) {
            fn(arg, readArg(el, arg2Type, evt));
        } else if (arg === undefined) {
            fn();
        } else {
            fn(arg);
        }
    };

    var resolveActionElement = function (target, wantsChange) {
        var el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.referenceAction) {
                if (!!(el.dataset.actionEvent === 'change') === wantsChange) return el;
            }
            var inlineOnclick = el.getAttribute && el.getAttribute('onclick');
            if (!wantsChange && inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
            el = el.parentElement;
        }
        return null;
    };

    document.addEventListener('click', function (e) {
        var el = resolveActionElement(e.target, false);
        if (el) dispatch(el, e);
    }, true);

    document.addEventListener('change', function (e) {
        var el = resolveActionElement(e.target, true);
        if (el) dispatch(el, e);
    }, true);
}

function _getSetting(key) {
    return ((_ctx && _ctx.settings) || window.RBI.services.settings).get(key);
}

/* CRUD пользовательских чек-листов — только RBI.services.templates.
   ctx.templates часто указывает на RBI.utils.templates (read-only helpers
   без saveUserTemplate) из-за перезаписи shared ctx под-модулями. */
function _templatesService() {
    var svc = window.RBI && window.RBI.services && window.RBI.services.templates;
    if (svc && typeof svc.saveUserTemplate === 'function') return svc;
    var ctxT = _ctx && _ctx.templates;
    if (ctxT && typeof ctxT.saveUserTemplate === 'function') return ctxT;
    return null;
}

function _triggerSync(mode) {
    var m = mode || 'silent';
    if (_ctx && _ctx.sync) return _ctx.sync.trigger(m);
    if (window.RBI && window.RBI.services && window.RBI.services.sync) return window.RBI.services.sync.trigger(m);
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
}

function _storage() {
    if (_ctx && _ctx.storage) return _ctx.storage;
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

function _getTwiCards() {
    if (_ctx && _ctx.knowledge) return _ctx.knowledge.getTwiCardsSync();
    if (window.RBI && window.RBI.services && window.RBI.services.knowledge) {
        return window.RBI.services.knowledge.getTwiCardsSync();
    }
    return Array.isArray(window.customTwiCards) ? window.customTwiCards : [];
}
function _getCustomDocs() {
    if (_ctx && _ctx.knowledge) return _ctx.knowledge.getCustomDocsSync();
    if (window.RBI && window.RBI.services && window.RBI.services.knowledge) {
        return window.RBI.services.knowledge.getCustomDocsSync();
    }
    return Array.isArray(window.customDocs) ? window.customDocs : [];
}
function _getTemplateKey() {
    if (_ctx && _ctx.session) return _ctx.session.getTemplateKey();
    if (window.RBI && window.RBI.services && window.RBI.services.session) {
        return window.RBI.services.session.getTemplateKey();
    }
    return currentTemplateKey;
}

// Вывод списка пользовательских шаблонов для управления (Удаления)
const templatesList = document.getElementById('settings-user-templates-list');
if (templatesList) {
    // ИСПРАВЛЕНИЕ: Сортировка своих шаблонов по алфавиту перед выводом
    const customKeys = Object.keys(userTemplates).sort((a, b) => userTemplates[a].title.localeCompare(userTemplates[b].title, 'ru'));

    if (customKeys.length === 0) {
        templatesList.innerHTML = `<div class="text-[10px] text-slate-400 italic py-2 text-center">Созданных чек-листов пока нет</div>`;
    } else {
        templatesList.innerHTML = customKeys.map(key => `
                <div class="flex justify-between items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg">
                    <div class="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate pr-2 flex-1">📋 ${userTemplates[key].title}</div>
                    <button onclick="deleteUserTemplate('${key}')" class="text-[10px] font-black text-red-500 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded border border-red-100 dark:border-red-900 shadow-sm active:scale-95">УДАЛИТЬ</button>
                </div>
            `).join('');
    }
}

// === ВКЛАДКА: СПРАВОЧНИК (ПОДВКЛАДКА 1 - ЧЕК-ЛИСТЫ И СВЯЗИ) ===
// === ВКЛАДКА: СПРАВОЧНИК (ПОДВКЛАДКА 1 - ЧЕК-ЛИСТЫ И СВЯЗИ) iOS STYLE ===
function renderReferenceTab() {
    const root = document.getElementById('reference-items');
    const refSelect = document.getElementById('ref-checklist-selector');
    if (!root || !refSelect) return;
    const expanded = (typeof window._kbCaptureExpandedGroups === 'function')
        ? window._kbCaptureExpandedGroups(root)
        : new Set();

    const selectedKey = refSelect.value;
    if (!selectedKey) return;

    let checklist = [];
    let officialInfo = null;
    const type = selectedKey.split('_')[0];
    const key = selectedKey.replace(type + '_', '');
    if (type === 'sys' && window.SYSTEM_TEMPLATES[key]) {
        var templatesSvcRef = _templatesService();
        var eff = templatesSvcRef && typeof templatesSvcRef.getEffectiveTemplate === 'function'
            ? templatesSvcRef.getEffectiveTemplate(key)
            : null;
        checklist = eff ? eff.groups : window.SYSTEM_TEMPLATES[key].groups;
        if (eff && eff.isOfficialOverride) officialInfo = eff;
    }
    else if (type === 'user' && userTemplates[key]) checklist = userTemplates[key].groups;

    const searchTerm = document.getElementById('ref-search')?.value.toLowerCase() || "";

    // СОРТИРОВКА ПРИВЯЗАННЫХ КАРТ
    const linkedTwiCards = _getTwiCards().filter(c => c.checklistKey === selectedKey);
    const globalCards = linkedTwiCards.filter(c => c.itemId === 'ALL' || !c.itemId);
    const itemCards = linkedTwiCards.filter(c => c.itemId && c.itemId !== 'ALL');

    let html = '';

    // Редактор системных чек-листов Блок 1: бейдж «изменён компанией»
    let officialBadgeHtml = '';
    if (officialInfo) {
        let dateStr = '';
        try { dateStr = officialInfo.officialUpdatedAt ? new Date(officialInfo.officialUpdatedAt).toLocaleDateString('ru') : ''; } catch (_e) { /* ignore */ }
        officialBadgeHtml = `<span class="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5 mb-2"
            title="изменён компанией, v${officialInfo.officialVersion} от ${dateStr}">
            ✎ v${officialInfo.officialVersion}</span>`;
    }

    // --- ШАПКА: СТАТИСТИКА И ОБЩИЕ ИНСТРУКЦИИ ---
    html += `
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm mb-4 relative overflow-hidden">
            <div class="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Требования по виду работ</div>
            <div class="text-[16px] font-black text-slate-800 dark:text-white leading-tight mb-1">${refSelect.options[refSelect.selectedIndex].text.replace('▼', '').trim()}</div>
            ${officialBadgeHtml ? `<div class="mb-3">${officialBadgeHtml}</div>` : ''}
            
            <div class="flex gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-700">
                <div class="text-[10px] font-bold text-slate-600 dark:text-slate-400"><span class="text-indigo-600 text-[14px] font-black mr-1">${globalCards.length}</span> общих инстр.</div>
                <div class="text-[10px] font-bold text-slate-600 dark:text-slate-400"><span class="text-emerald-600 text-[14px] font-black mr-1">${itemCards.length}</span> инстр. к пунктам</div>
            </div>
    `;

    if (globalCards.length > 0) {
        html += `<div class="space-y-2">`;
        globalCards.forEach(c => {
            const isPdf = c.type === 'PDF';
            const icon = isPdf ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"></path></svg>' : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>';
            const colorClass = isPdf ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
            const typeName = isPdf ? 'Регламент' : 'Алгоритм';

            html += `
                <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between cursor-pointer active:scale-95 transition-transform" onclick="window.RBI.services.knowledge.openTwiViewer('${c.id}')">
                    <div class="flex items-center gap-3 min-w-0 pr-2">
                        <div class="w-10 h-10 ${colorClass} rounded-lg flex items-center justify-center shrink-0">${icon}</div>
                        <div class="min-w-0">
                            <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">${typeName}</div>
                            <div class="text-[12px] font-bold text-slate-800 dark:text-white truncate">${c.title}</div>
                        </div>
                    </div>
                    <div class="text-slate-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path></svg></div>
                </div>
            `;
        });
        html += `</div>`;
    } else {
        html += `<div class="text-[11px] text-slate-400 font-bold bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-center">Общих инструкций к разделу пока нет</div>`;
    }
    html += `</div>`;

    // --- СПИСОК ПУНКТОВ (СВОРАЧИВАЕМЫЕ ГРУППЫ) ---
    checklist.forEach(g => {
        const filteredItems = g.items.filter(i =>
            i.n.toLowerCase().includes(searchTerm) ||
            (i.t && i.t.toLowerCase().includes(searchTerm))
        );

        if (filteredItems.length === 0) return;

        // Используем HTML <details> для нативного аккордеона в стиле iOS
        // Используем HTML <details> для нативного аккордеона в стиле iOS (Свернуты по умолчанию)
        html += `
        <details class="mb-3 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] overflow-hidden shadow-sm group [&_summary::-webkit-details-marker]:hidden">
            <summary class="p-4 text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-tight cursor-pointer flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 group-open:border-b border-[var(--card-border)] transition-colors select-none">
                <span class="pr-4 leading-snug">${g.group || g.title}</span>
                <span class="text-slate-400 shrink-0 transition-transform duration-300 group-open:rotate-180">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
                </span>
            </summary>
            <div class="p-2 space-y-2">`;

        filteredItems.forEach(i => {
            const safeNormText = (i.t || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
            const specificItemCards = itemCards.filter(c => String(c.itemId) === String(i.id));

            // Проверяем наличие TWI
            const hasTwi = specificItemCards.length > 0;
            const twiAction = hasTwi ? `window.RBI.services.knowledge.openTwiViewer('${specificItemCards[0].id}')` : `showToast('Для этого пункта пока нет TWI')`;

            // Умная кнопка норматива
            const docAction = i.ndId ? `window.RBI.services.knowledge.openDocViewer('${i.ndId}')` : `findAndOpenND('${safeNormText}')`;
            const docIconColor = i.ndId ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-blue-600 bg-blue-50 border-blue-200';

            html += `
                <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden mb-2 flex flex-col">
                    <div class="p-3">
                        <div class="flex items-start justify-between gap-3 mb-2">
                            <div class="text-[13px] font-bold text-slate-800 dark:text-white leading-tight">
                                <span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-500 mr-1">B${i.w}</span>
                                ${i.n}
                            </div>
                            <div class="flex gap-1 shrink-0">
                                <button onclick="${docAction}" class="w-8 h-8 rounded-lg ${docIconColor} flex items-center justify-center active:scale-90 border">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                                </button>
                                <button onclick="${twiAction}" class="w-8 h-8 rounded-lg ${hasTwi ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-300'} flex items-center justify-center active:scale-90">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                </button>
                            </div>
                        </div>
                        <div class="text-[11px] font-medium text-[var(--text-muted)] leading-relaxed border-t border-slate-50 dark:border-slate-800 pt-2">
                            ${i.t || 'Норматив не указан'}
                        </div>
                    </div>
                </div>`;
        });
        html += `</div></details>`;
    });

    root.innerHTML = html || `<div class="text-center py-10 text-slate-500 text-xs font-bold uppercase tracking-widest bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">Ничего не найдено</div>`;
    if (typeof window._kbRestoreExpandedGroups === 'function') {
        window._kbRestoreExpandedGroups(root, expanded);
    }
}
window.renderReferenceTab = renderReferenceTab;

// === ЛОГИКА ОТКРЫТИЯ СВЯЗАННЫХ ДОКУМЕНТОВ ===

// 1. Умный поиск Норматива
// Умный поиск Норматива (С промежуточным окном)
function findAndOpenND(normText) {
    if (!normText) return showToast('Норматив не указан');

    // Пытаемся вытащить ГОСТ или СП из текста для последующего поиска
    const match = normText.match(/(СП\s?\d+(\.\d+)*|ГОСТ\s?(Р\s)?\d+(-\d+)?)/i);
    const searchString = match ? match[0] : normText.substring(0, 15);

    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerHTML = `<div class="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-[14px] flex items-center justify-center border border-blue-100 dark:border-blue-800 mx-auto"><svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg></div>`;
    document.getElementById('modal-title').innerText = "Нормативное требование";

    document.getElementById('modal-body').innerHTML = `
        <div class="text-[12px] font-bold text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-4 whitespace-pre-wrap">
            ${normText}
        </div>
        
        <div class="text-[10px] text-slate-500 font-bold mb-2 uppercase text-center border-t border-slate-100 dark:border-slate-700 pt-3">Нужно больше информации?</div>
        
        <button onclick="closeModal(); switchToNdSearch('${searchString}')" class="w-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-sm flex items-center justify-center gap-2">
            🔍 Искать полный документ в Базе НД
        </button>
    `;

    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
}
window.findAndOpenND = findAndOpenND;

// Вспомогательная функция для перехода в Справочник -> База НД
function switchToNdSearch(searchString) {
    switchTab('tab-reference');
    setTimeout(() => {
        const btns = document.querySelectorAll('.sub-tab-btn');
        if (btns[1]) switchReferenceSubTab('ref-sub-docs', btns[1]);

        const searchInput = document.getElementById('doc-search-input');
        if (searchInput) {
            searchInput.value = searchString;
            window.currentDocFilter = 'ALL';
            var knowledgeSvc1 = (_ctx && _ctx.knowledge) || window.RBI.services.knowledge;
            knowledgeSvc1.renderDocsList();
            showToast(`🔍 Ищем в базе: ${searchString}`);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 150);
}
window.switchToNdSearch = switchToNdSearch;

// --- УМНОЕ ОБНОВЛЕНИЕ ФИЛЬТРОВ (ЧТОБЫ НЕ СБРАСЫВАЛСЯ ВЫБОР) ---
function populateSelect(id, values, defaultText) {
    const el = document.getElementById(id);
    if (!el) return;
    const currentVal = el.value; // Запоминаем, что выбрано сейчас
    el.innerHTML = `<option value="ALL">${defaultText}</option>` + values.map(v => `<option value="${v}">${v}</option>`).join('');
    if (values.includes(currentVal)) el.value = currentVal; // Восстанавливаем выбор
    else el.value = "ALL";
}

// Изменение селектора ТОЛЬКО в Справочнике
function changeRefTemplate(selectEl) {
    const label = document.getElementById('ref-selector-label');
    if (label) label.innerHTML = `${selectEl.options[selectEl.selectedIndex].text} <span>▼</span>`;
    renderReferenceTab();
}
window.changeRefTemplate = changeRefTemplate;

// === ПЕРЕКЛЮЧАТЕЛЬ ПОДВКЛАДОК СПРАВОЧНИКА ===
function switchReferenceSubTab(tabId, btnElement, opts) {
    var fromRouter = !!(opts && opts.fromRouter);
    document.querySelectorAll('.ref-sub-section').forEach(el => el.classList.add('hidden'));

    const btnContainer = document.getElementById('reference-subtabs-block');
    if (btnContainer) {
        btnContainer.querySelectorAll('.sub-tab-btn').forEach(el => {
            el.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600', 'dark:bg-slate-700', 'dark:text-indigo-400', 'active');
            el.classList.add('text-[var(--text-muted)]');
        });
    }

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.remove('hidden');

    if (!btnElement && btnContainer) {
        btnElement = btnContainer.querySelector('.sub-tab-btn[data-action-arg="' + tabId + '"]');
    }
    if (btnElement) {
        btnElement.classList.add('bg-white', 'shadow-sm', 'text-indigo-600', 'dark:bg-slate-700', 'dark:text-indigo-400', 'active');
        btnElement.classList.remove('text-[var(--text-muted)]');
    }

    // Инициализация контента при переключении (ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ ЭКРАНОВ)
    if (tabId === 'ref-sub-checklists') {
        if (typeof renderReferenceTab === 'function') renderReferenceTab();
    } else if (tabId === 'ref-sub-docs') {
        var knowledgeSvc2 = (_ctx && _ctx.knowledge) || window.RBI.services.knowledge;
        if (typeof knowledgeSvc2.renderDocsList === 'function') knowledgeSvc2.renderDocsList();
    } else if (tabId === 'ref-sub-nodes') {
        var knowledgeSvc3 = (_ctx && _ctx.knowledge) || window.RBI.services.knowledge;
        if (typeof knowledgeSvc3.renderNodesList === 'function') knowledgeSvc3.renderNodesList();
    } else if (tabId === 'ref-sub-twi') {
        // ВОТ ОНО: Теперь при входе в TWI мы заново ищем Магию!
        var knowledgeSvc4 = (_ctx && _ctx.knowledge) || window.RBI.services.knowledge;
        if (typeof knowledgeSvc4.renderTwiList === 'function') knowledgeSvc4.renderTwiList();
    } else if (tabId === 'ref-sub-practices') {
        if (typeof rbi_loadPractices === 'function') {
            rbi_loadPractices().then(() => {
                if (typeof rbi_renderPracticesTab === 'function') rbi_renderPracticesTab();
            });
        }
    }

    if (!fromRouter && window.AppRouter && typeof window.AppRouter.navigateSub === 'function') {
        var hash = String(window.location.hash || '');
        var refBase = '#/quality/reference';
        if (hash.indexOf('#/knowledge') === 0) refBase = '#/knowledge';
        else if (hash.indexOf('#/construction/reference') === 0) refBase = '#/construction/reference';
        window.AppRouter.navigateSub(refBase, tabId);
    }
}
window.switchReferenceSubTab = switchReferenceSubTab;

/**
 * Открыть связанный чек-лист внутри Базы знаний (не на вкладке Осмотр).
 * @param {string} checklistKey — значение как в #ref-checklist-selector (sys_* / user_*)
 */
function openKnowledgeLinkedChecklist(checklistKey) {
    if (!checklistKey || String(checklistKey).includes('|')) return;
    var key = String(checklistKey);

    if (typeof window.switchTab === 'function') {
        var refTab = document.getElementById('tab-reference');
        var onRef = refTab && !refTab.classList.contains('hidden');
        if (!onRef) window.switchTab('tab-reference');
    }

    if (typeof window.switchReferenceSubTab === 'function') {
        window.switchReferenceSubTab('ref-sub-checklists');
    }

    var apply = function () {
        var desk = window.__knowledgeDesktop;
        if (desk && typeof desk.selectChecklist === 'function') {
            desk.selectChecklist(key);
            return;
        }

        var refSelect = document.getElementById('ref-checklist-selector');
        if (!refSelect) return;

        var has = false;
        for (var i = 0; i < refSelect.options.length; i++) {
            if (refSelect.options[i].value === key) {
                has = true;
                break;
            }
        }
        if (!has) {
            var type = key.split('_')[0];
            var slug = key.replace(type + '_', '');
            var title = key;
            if (type === 'sys' && window.SYSTEM_TEMPLATES && window.SYSTEM_TEMPLATES[slug]) {
                title = window.SYSTEM_TEMPLATES[slug].title || slug;
            } else if (type === 'user' && window.userTemplates && window.userTemplates[slug]) {
                title = window.userTemplates[slug].title || slug;
            }
            var opt = document.createElement('option');
            opt.value = key;
            opt.textContent = title;
            var group = document.getElementById(
                type === 'user' ? 'ref-user-group' : 'ref-system-group'
            );
            if (group) group.appendChild(opt);
            else refSelect.appendChild(opt);
        }

        refSelect.value = key;
        if (typeof window.changeRefTemplate === 'function') {
            window.changeRefTemplate(refSelect);
        } else if (typeof window.renderReferenceTab === 'function') {
            window.renderReferenceTab();
        }
    };

    setTimeout(apply, 80);
}
window.openKnowledgeLinkedChecklist = openKnowledgeLinkedChecklist;

// === СВОРАЧИВАЕМЫЕ ПАНЕЛИ ФИЛЬТРОВ ===
// Режим: autoCollapseFilters = 'auto' | 'manual' (настройки интерфейса).
// Авто — как шапка Осмотра (header-collapsed):
//   • ушли вниз за порог — свернуть;
//   • развернуть снова только у верха страницы (не mid-page при скролле вверх);
//   • ручное раскрытие mid-page держим, пока снова не уйдут заметно вниз;
//   • короткий экран (мало контента) — авто НЕ трогает панель (иначе
//     collapse↔expand по высоте даёт дребезг).
// Анимация iOS spring. Панели: #analytics-filters-block и #hist-sticky-panel.

function _isAutoCollapseFiltersEnabled() {
    try {
        var v = window.appSettings && window.appSettings.autoCollapseFilters;
        // Явно auto/true — авто; иначе manual (в т.ч. дефолт и legacy false)
        return v === true || v === 'auto';
    } catch (_) {
        return false;
    }
}

function _collapsiblePanelIsOnScreen(panel) {
    if (!panel || !panel.isConnected) return false;
    var el = panel;
    while (el) {
        if (el.classList && el.classList.contains('hidden')) return false;
        el = el.parentElement;
    }
    var st = window.getComputedStyle(panel);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    var r = panel.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
}

function _truncateFilterLabel(text, maxLen) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (t.length <= maxLen) return t;
    return t.slice(0, Math.max(1, maxLen - 1)) + '…';
}

function _isDefaultFilterLabel(text) {
    const t = String(text || '').trim().toLowerCase();
    return !t
        || /^все\b/.test(t)
        || t === 'поиск...'
        || t === 'фильтры';
}

/** Краткая сводка для свёрнутого заголовка — чтобы не разворачивать «вспомнить фильтр». */
function buildCollapsibleFilterSummary(panelId) {
    const bits = [];
    const push = (elOrText, maxLen) => {
        const raw = typeof elOrText === 'string'
            ? elOrText
            : (elOrText && (elOrText.querySelector?.('.truncate')?.textContent || elOrText.textContent)) || '';
        const label = _truncateFilterLabel(raw, maxLen || 22);
        if (label && !_isDefaultFilterLabel(label)) bits.push(label);
    };

    if (panelId === 'analytics-filters-block') {
        push(document.getElementById('btn-ana-period-label'), 18);
        push(document.getElementById('btn-ana-project'), 20);
        push(document.getElementById('btn-ana-contractor'), 18);
        push(document.getElementById('btn-ana-inspector'), 16);
        push(document.getElementById('btn-ana-template'), 16);
        if (!bits.length) {
            const period = _truncateFilterLabel(
                document.querySelector('#btn-ana-period-label .truncate')?.textContent || 'За 30 дней',
                18
            );
            if (period) bits.push(period);
        }
    } else if (panelId === 'hist-sticky-panel') {
        const search = document.getElementById('hist-search-text')?.value;
        if (search && search.trim()) bits.push('«' + _truncateFilterLabel(search, 14) + '»');
        push(document.getElementById('btn-hist-period-label'), 18);
        push(document.getElementById('btn-hist-project'), 20);
        push(document.getElementById('btn-hist-contractor'), 18);
        push(document.getElementById('btn-hist-template'), 16);
        push(document.getElementById('btn-hist-inspector'), 16);
        if (!bits.length) {
            const period = _truncateFilterLabel(
                document.querySelector('#btn-hist-period-label .truncate')?.textContent || 'За 30 дней',
                18
            );
            if (period) bits.push(period);
        }
    }

    return bits.slice(0, 3).join(' · ');
}

function applyPanelState(bodyEl, collapsed) {
    const panel = bodyEl.closest('[id$="-sticky-panel"]') || bodyEl.parentElement;
    const icon = panel?.querySelector('[id$="-panel-toggle-icon"]');
    const summary = panel?.querySelector('[data-panel-filter-summary]');

    if (collapsed) {
        bodyEl.style.maxHeight = '0px';
        bodyEl.style.opacity = '0';
        bodyEl.style.overflow = 'hidden';
        bodyEl.style.marginBottom = '0';
        if (icon) icon.style.transform = 'rotate(-90deg)';
        if (summary) {
            const text = buildCollapsibleFilterSummary(panel?.id || '');
            summary.textContent = text;
            summary.classList.toggle('hidden', !text);
        }
    } else {
        bodyEl.style.maxHeight = '400px';
        bodyEl.style.opacity = '1';
        bodyEl.style.overflow = '';
        bodyEl.style.marginBottom = '';
        if (icon) icon.style.transform = 'rotate(0deg)';
        if (summary) {
            summary.textContent = '';
            summary.classList.add('hidden');
        }
    }
}

function initCollapsiblePanel(panelId, bodyId, headerId, iconId) {
    const panel = document.getElementById(panelId);
    const body = document.getElementById(bodyId);
    const header = document.getElementById(headerId);
    const icon = iconId ? document.getElementById(iconId) : panel?.querySelector('[id$="-panel-toggle-icon"]');
    if (!panel || !body) return;
    if (panel.dataset.inited) return;
    panel.dataset.inited = '1';

    let collapsed = false;
    let isAnimating = false;
    let pendingCollapsed = null;
    // Ручное раскрытие mid-page: не даём авто сразу свернуть
    // (и игнорируем скачок scrollY от изменения высоты панели).
    let userHoldOpen = false;
    let holdOpenFromY = 0;
    let ignoreAutoUntil = 0;
    // После авто-collapse высота документа падает → scrollY может уехать ≤ порога
    // разворота — без этого окна панель сразу снова раскрывается или «залипает».
    let ignoreExpandUntil = 0;
    let lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const SPRING_TRANSITION =
        'max-height 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1), margin-top 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    // Как шапка Осмотра (bootstrap.js): collapse >50 вниз, expand только <50 у верха.
    var COLLAPSE_AFTER_Y = 50;
    var EXPAND_AT_Y = 50;
    var HOLD_RELEASE_DELTA = 56;

    body.style.transition = SPRING_TRANSITION;

    function currentScrollY() {
        return window.scrollY || document.documentElement.scrollTop || 0;
    }

    function isVisuallyCollapsed() {
        return body.style.maxHeight === '0px' || body.style.opacity === '0';
    }

    function setCollapsed(val) {
        if (collapsed === val) {
            pendingCollapsed = null;
            // DOM мог разъехаться со стейтом (desktop max-height:none / teardown)
            if (val === false && isVisuallyCollapsed()) {
                /* fall through to re-apply expand styles */
            } else if (val === true && !isVisuallyCollapsed() && body.style.maxHeight && body.style.maxHeight !== '0px') {
                /* fall through to re-apply collapse styles */
            } else {
                return;
            }
        }
        if (isAnimating) {
            pendingCollapsed = val;
            return;
        }
        collapsed = val;
        isAnimating = true;

        // Пружина и при клике, и при скролле — transition не снимаем.
        body.style.transition = SPRING_TRANSITION;
        body.style.maxHeight = collapsed ? '0px' : '400px';
        body.style.opacity = collapsed ? '0' : '1';
        body.style.overflow = 'hidden'; // на время анимации, иначе spring «прыгает»
        body.style.marginTop = collapsed ? '0px' : '8px';
        if (icon) {
            icon.style.transition = 'transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            icon.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        }

        const summary = panel.querySelector('[data-panel-filter-summary]');
        if (summary) {
            if (collapsed) {
                const text = buildCollapsibleFilterSummary(panelId);
                summary.textContent = text;
                summary.classList.toggle('hidden', !text);
            } else {
                summary.textContent = '';
                summary.classList.add('hidden');
            }
        }

        if (collapsed) {
            // Блокируем ложный expand от скачка scrollY при ужатии панели
            ignoreExpandUntil = Date.now() + 650;
            // Только авто: после анти-дребезга у верха снова раскрыть.
            // В manual этот таймер ломал клик «свернуть» (сразу снова expand).
            setTimeout(function () {
                if (!_isAutoCollapseFiltersEnabled()) return;
                if (collapsed && currentScrollY() <= EXPAND_AT_Y) {
                    setCollapsed(false);
                }
            }, 680);
        }

        setTimeout(function () {
            if (!collapsed) body.style.overflow = 'visible';
            isAnimating = false;
            if (pendingCollapsed !== null && pendingCollapsed !== collapsed) {
                var next = pendingCollapsed;
                pendingCollapsed = null;
                // Не применяем отложенный collapse, если уже вернулись к верху
                if (next === true && currentScrollY() <= EXPAND_AT_Y) {
                    return;
                }
                setCollapsed(next);
            } else {
                pendingCollapsed = null;
            }
        }, 520);
    }

    function armManualHoldOpen() {
        userHoldOpen = true;
        holdOpenFromY = currentScrollY();
        // Пока панель анимируется/растёт, scrollY может прыгнуть сам —
        // не считаем это «ушли вниз», обновляем базу.
        ignoreAutoUntil = Date.now() + 550;
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                holdOpenFromY = Math.max(holdOpenFromY, currentScrollY());
            });
        });
    }

    if (header) {
        header.style.cursor = 'pointer';
        header.addEventListener('click', function (e) {
            if (e.target.closest('[data-no-panel-toggle], select, input, button, a, label')) return;
            var willCollapse = !collapsed;
            setCollapsed(willCollapse);
            if (willCollapse) {
                userHoldOpen = false;
                ignoreAutoUntil = 0;
            } else {
                armManualHoldOpen();
            }
        });
    }

    // Как шапка Осмотра: свернуть при уходе вниз, развернуть только у верха.
    window.addEventListener('scroll', function () {
        if (!_isAutoCollapseFiltersEnabled()) return;
        if (!_collapsiblePanelIsOnScreen(panel)) return;

        const y = currentScrollY();
        const viewH = window.innerHeight || 0;
        const docH = Math.max(
            document.documentElement ? document.documentElement.scrollHeight : 0,
            document.body ? document.body.scrollHeight : 0
        );

        // Мало контента: авто не дёргаем (раньше setCollapsed(false) на каждый
        // scroll → collapse менял высоту → снова expand → дребезг).
        if (docH <= viewH + 80) {
            lastScrollY = y;
            return;
        }

        const goingDown = y > lastScrollY + 2;
        lastScrollY = y;

        // У верха — всегда развернуть (как снятие header-collapsed при scrollY < 50).
        if (y <= EXPAND_AT_Y) {
            if (Date.now() < ignoreExpandUntil) {
                return;
            }
            userHoldOpen = false;
            ignoreAutoUntil = 0;
            if (collapsed || isVisuallyCollapsed()) {
                if (!collapsed) collapsed = true; // чтобы setCollapsed не early-return
                setCollapsed(false);
            }
            return;
        }

        if (userHoldOpen) {
            if (Date.now() < ignoreAutoUntil) {
                holdOpenFromY = Math.max(holdOpenFromY, y);
                return;
            }
            if (y >= holdOpenFromY + HOLD_RELEASE_DELTA) {
                userHoldOpen = false;
                if (!collapsed) setCollapsed(true);
            }
            return;
        }

        // Сворачиваем только при скролле ВНИЗ за порог (не при скролле вверх).
        if (goingDown && y >= COLLAPSE_AFTER_Y) {
            if (!collapsed) setCollapsed(true);
        }
    }, { passive: true });
}
window.initCollapsiblePanel = initCollapsiblePanel;
window.buildCollapsibleFilterSummary = buildCollapsibleFilterSummary;

// === КОНСТРУКТОР СВОИХ ЧЕК-ЛИСТОВ ===
let builderGroupCount = 0;
let builderItemCount = 0;

function openTemplateBuilder() {
    const overlay = document.getElementById('template-builder-overlay');
    document.getElementById('builder-title').value = '';
    document.getElementById('builder-groups').innerHTML = '';
    builderGroupCount = 0;
    builderItemCount = 0;

    addBuilderGroup(); // Добавляем первую пустую группу по умолчанию

    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
}
window.openTemplateBuilder = openTemplateBuilder;

function closeTemplateBuilder() {
    document.getElementById('template-builder-overlay').style.display = 'none';
    document.body.classList.remove('modal-open');
}
window.closeTemplateBuilder = closeTemplateBuilder;

function addBuilderGroup() {
    builderGroupCount++;
    const groupId = `builder-group-${builderGroupCount}`;
    const html = `
        <div id="${groupId}" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm relative">
            <button onclick="document.getElementById('${groupId}').remove()" class="absolute top-2 right-2 w-7 h-7 bg-red-50 text-red-500 rounded-lg flex items-center justify-center font-bold text-xs active:scale-95 border border-red-100">✕</button>
            <label class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1 block">Название этапа (Группы)</label>
            <input type="text" class="input-base text-xs mb-3 group-title-input" placeholder="Например: 1. Подготовительные работы" value="Этап ${builderGroupCount}">
            
            <div id="${groupId}-items" class="space-y-2 mb-3 pl-2 border-l-2 border-indigo-100 dark:border-indigo-800">
                <!-- Сюда будут падать пункты -->
            </div>
            
            <button onclick="addBuilderItem('${groupId}-items')" class="text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 px-3 py-2 rounded-lg active:scale-95 transition-colors uppercase dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400">
                + Добавить пункт контроля
            </button>
        </div>
    `;
    document.getElementById('builder-groups').insertAdjacentHTML('beforeend', html);
    addBuilderItem(`${groupId}-items`); // Сразу добавляем 1 пустой пункт
}
window.addBuilderGroup = addBuilderGroup;

function addBuilderItem(containerId, itemData = null) {
    builderItemCount++;
    const itemId = `builder-item-${builderItemCount}`;

    // Собираем список всех нормативных документов
    const allDocs = [...(typeof window.SYSTEM_DOCS !== 'undefined' ? window.SYSTEM_DOCS : []), ..._getCustomDocs()];
    let docOptions = '<option value="">-- Без привязки к документу --</option>';

    allDocs.sort((a, b) => a.code.localeCompare(b.code)).forEach(doc => {
        const shortTitle = doc.title.length > 30 ? doc.title.substring(0, 30) + '...' : doc.title;
        const isSelected = (itemData && itemData.ndId === doc.id) ? 'selected' : '';
        docOptions += `<option value="${doc.id}" ${isSelected}>${doc.code} - ${shortTitle}</option>`;
    });

    // Предзаполнение, если мы редактируем старый шаблон
    const nVal = itemData ? itemData.n.replace(/"/g, '&quot;') : '';
    const tVal = itemData && itemData.t ? itemData.t.replace(/<\/?[^>]+(>|$)/g, "").replace(/<br>/g, " ").replace(/"/g, '&quot;') : '';
    const wVal = itemData ? itemData.w : 2;

    const html = `
        <div id="${itemId}" class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)] relative mb-2">
            <button onclick="document.getElementById('${itemId}').remove()" class="absolute top-2 right-2 text-red-500 font-black text-sm px-2">✕</button>
            
            <div class="pr-8 mb-2">
                <input type="text" class="input-base text-xs item-name-input font-bold" placeholder="Текст нарушения (Напр: Отклонение от вертикали)" value="${nVal}">
            </div>
            
            <div class="grid grid-cols-1 gap-2 mb-2">
                <div class="flex gap-2">
                    <select class="input-base text-[10px] !py-1.5 item-weight-select bg-white dark:bg-slate-900 w-1/3 font-bold">
                        <option value="1" ${wVal === 1 ? 'selected' : ''}>B1 (Мелкий)</option>
                        <option value="2" ${wVal === 2 ? 'selected' : ''}>B2 (Значимый)</option>
                        <option value="3" ${wVal === 3 ? 'selected' : ''}>B3 (Критич.)</option>
                    </select>
                    <select class="input-base text-[10px] !py-1.5 item-nd-select bg-white dark:bg-slate-900 w-2/3 truncate">
                        ${docOptions}
                    </select>
                </div>
                <input type="text" class="input-base text-[10px] !py-1.5 item-norm-input" placeholder="Доп. текст / допуск (Напр: ±2 мм)" value="${tVal}">
            </div>
        </div>
    `;
    document.getElementById(containerId).insertAdjacentHTML('beforeend', html);
}
window.addBuilderItem = addBuilderItem;

async function saveCustomTemplate() {
    const titleInput = document.getElementById('builder-title').value.trim();
    if (!titleInput) return showToast("Введите название чек-листа!");

    const groupsEl = document.getElementById('builder-groups').children;
    if (groupsEl.length === 0) return showToast("Добавьте хотя бы один этап!");

    const newTemplate = {
        title: titleInput,
        templateVersion: "1.0",
        groups: []
    };

    let isValid = true;

    Array.from(groupsEl).forEach(groupEl => {
        const groupTitle = groupEl.querySelector('.group-title-input').value.trim();
        const itemsContainer = groupEl.querySelector('div[id$="-items"]');
        const itemsEl = itemsContainer.children;

        if (!groupTitle || itemsEl.length === 0) isValid = false;

        const groupData = { group: groupTitle || "Без названия", items: [] };

        Array.from(itemsEl).forEach(itemEl => {
            const name = itemEl.querySelector('.item-name-input').value.trim();
            const weight = parseInt(itemEl.querySelector('.item-weight-select').value);

            // <-- ВСТАВКА: Безопасное чтение селекта (защита от краша)
            const ndSelect = itemEl.querySelector('.item-nd-select');
            const ndId = ndSelect ? ndSelect.value : null;

            const norm = itemEl.querySelector('.item-norm-input').value.trim();

            if (!name) isValid = false;

            const uniqueId = Date.now() % 100000 + Math.floor(Math.random() * 1000);

            groupData.items.push({
                id: uniqueId,
                n: name || "Пустой пункт",
                w: weight,
                ndId: ndId || null, // <-- Сохраняем в объект шаблона
                t: formatNorms(norm || "Без норматива")
            });
        });

        newTemplate.groups.push(groupData);
    });

    if (!isValid) return showToast("Заполните все пустые поля и пункты!");

    // Если мы редактируем старый шаблон - берем его ключ, иначе создаем новый
    const slug = window.currentEditingTemplateSlug || window.RbiIds.newId();
    window.currentEditingTemplateSlug = null; // сбрасываем

    newTemplate.id = slug; // Дублируем ключ в id для синхронизатора
    newTemplate.owner = _getSetting('engineerName') || 'Инженер';
    newTemplate.createdAt = new Date().toISOString();
    newTemplate.updatedAt = new Date().toISOString();
    newTemplate.source = 'local';
    newTemplate.syncStatus = 'not_synced';
    newTemplate.sync_status = 'not_synced';
    newTemplate.is_deleted = false;

    // Сохраняем через сервис (мутация window.userTemplates + dbPut единой точкой)
    try {
        var templatesSvc1 = _templatesService();
        if (!templatesSvc1) throw new Error('Template service unavailable');
        await templatesSvc1.saveUserTemplate(newTemplate);
        showToast("✅ Шаблон успешно сохранен!");
        closeTemplateBuilder();

        // Обновляем списки селекторов и список в настройках
        window.renderSelector();
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('settings:renderRequested', {});

        // <-- ВСТАВКА: Мгновенное обновление списка шаблонов в панели
        const manageBody = document.getElementById('ref-manage-body');
        if (manageBody && manageBody.style.opacity === '1') {
            toggleManagePanel();
            setTimeout(() => toggleManagePanel(), 50);
        }

        localStorage.setItem('rbi_cloud_dirty', '1');
        _triggerSync('silent');
    } catch (e) {
        console.error(e);
        showToast("Ошибка сохранения шаблона!");
    }
}
window.saveCustomTemplate = saveCustomTemplate;
// === НОВАЯ ЛОГИКА: РЕДАКТИРОВАНИЕ ЧЕК-ЛИСТА ===
window.editUserTemplate = function (slug) {
    const tmpl = userTemplates[slug];
    if (!tmpl) return;

    // Глобально запоминаем, что мы редактируем
    window.currentEditingTemplateSlug = slug;

    const overlay = document.getElementById('template-builder-overlay');
    document.getElementById('builder-title').value = tmpl.title;
    document.getElementById('builder-groups').innerHTML = '';

    builderGroupCount = 0;
    builderItemCount = 0;

    // Восстанавливаем этапы и пункты
    tmpl.groups.forEach(g => {
        builderGroupCount++;
        const groupId = `builder-group-${builderGroupCount}`;
        const groupHtml = `
            <div id="${groupId}" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm relative">
                <button onclick="document.getElementById('${groupId}').remove()" class="absolute top-2 right-2 w-7 h-7 bg-red-50 text-red-500 rounded-lg flex items-center justify-center font-bold text-xs active:scale-95 border border-red-100">✕</button>
                <label class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1 block">Название этапа (Группы)</label>
                <input type="text" class="input-base text-xs mb-3 group-title-input" value="${g.group || g.title}">
                
                <div id="${groupId}-items" class="space-y-2 mb-3 pl-2 border-l-2 border-indigo-100 dark:border-indigo-800">
                </div>
                
                <button onclick="addBuilderItem('${groupId}-items')" class="text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 px-3 py-2 rounded-lg active:scale-95 transition-colors uppercase dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400">
                    + Добавить пункт
                </button>
            </div>
        `;
        document.getElementById('builder-groups').insertAdjacentHTML('beforeend', groupHtml);

        // Восстанавливаем пункты внутри этапа
        g.items.forEach(item => {
            builderItemCount++;
            const itemId = `builder-item-${builderItemCount}`;
            // Убираем HTML-теги из норматива для красивого отображения в инпуте
            const cleanNorm = item.t ? item.t.replace(/<\/?[^>]+(>|$)/g, "").replace(/<br>/g, " ") : "";
            const itemHtml = `
                <div id="${itemId}" class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)] relative">
                    <button onclick="document.getElementById('${itemId}').remove()" class="absolute top-2 right-2 text-red-500 font-black text-sm px-2">✕</button>
                    <div class="pr-8 mb-2">
                        <input type="text" class="input-base text-xs item-name-input" value="${item.n.replace(/"/g, '&quot;')}">
                    </div>
                    <div class="grid grid-cols-3 gap-2 mb-2">
                        <div class="col-span-1">
                            <select class="input-base text-[10px] !py-1 item-weight-select bg-white dark:bg-slate-900">
                                <option value="1" ${item.w === 1 ? 'selected' : ''}>B1 (Мелкий)</option>
                                <option value="2" ${item.w === 2 ? 'selected' : ''}>B2 (Значимый)</option>
                                <option value="3" ${item.w === 3 ? 'selected' : ''}>B3 (Критич.)</option>
                            </select>
                        </div>
                        <div class="col-span-2">
                            <input type="text" class="input-base text-[10px] !py-1 item-norm-input" value="${cleanNorm.replace(/"/g, '&quot;')}">
                        </div>
                    </div>
                </div>
            `;
            document.getElementById(`${groupId}-items`).insertAdjacentHTML('beforeend', itemHtml);
        });
    });

    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
};

// === НОВАЯ ЛОГИКА: КЛОНИРОВАНИЕ СИСТЕМНОГО ЧЕК-ЛИСТА ===
window.cloneSystemTemplateToCustom = function () {
    const select = document.getElementById('clone-sys-select');
    const key = select.value;
    if (!key || !window.SYSTEM_TEMPLATES[key]) return showToast('Выберите чек-лист для копирования!');

    const tmpl = window.SYSTEM_TEMPLATES[key];

    // Подменяем данные во временном объекте
    userTemplates['temp_clone'] = {
        title: tmpl.title + ' (Копия)',
        groups: JSON.parse(JSON.stringify(tmpl.groups))
    };

    // Запускаем режим редактирования для этой копии
    window.editUserTemplate('temp_clone');

    // Сразу очищаем, чтобы при сохранении сгенерировался новый уникальный ID
    window.currentEditingTemplateSlug = null;
    delete userTemplates['temp_clone'];
};
// Функция для удаления пользовательских шаблонов
async function deleteUserTemplate(slug) {
    if (!confirm("Удалить этот чек-лист? Вы не сможете проводить по нему новые проверки.")) return;

    // Удаление через сервис (мутация window.userTemplates + dbPut единой точкой)
    var templatesSvc2 = _templatesService();
    if (!templatesSvc2) {
        showToast("Ошибка удаления шаблона!");
        return;
    }
    await templatesSvc2.deleteUserTemplate(slug);

    try {
        showToast("🗑️ Чек-лист удален");
        window.renderSelector();
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('settings:renderRequested', {});

        // <-- ВСТАВКА: Мгновенное обновление списка шаблонов
        const manageBody = document.getElementById('ref-manage-body');
        if (manageBody && manageBody.style.opacity === '1') {
            toggleManagePanel();
            setTimeout(() => toggleManagePanel(), 50);
        }

        // Если удалили тот, что был выбран - сбрасываем на HOME
        if (_getTemplateKey() === `user_${slug}`) {
            window.changeTemplate('HOME');
        }

        localStorage.setItem('rbi_cloud_dirty', '1');
        _triggerSync('silent');
    } catch (e) {
        console.error(e);
        showToast("Ошибка при удалении");
    }
}
window.deleteUserTemplate = deleteUserTemplate;
// === АВТОМАТИЧЕСКАЯ ЗАГРУЗКА ШАБЛОНОВ ИЗ EXCEL ===

function triggerExcelImport() {
    document.getElementById('excel-template-input').click();
}
window.triggerExcelImport = triggerExcelImport;

function showExcelHelp() {
    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerHTML = `<div class="text-4xl mb-2">📊</div>`;
    document.getElementById('modal-title').innerText = "Как загрузить Excel";
    document.getElementById('modal-body').innerHTML = `
        <div class="text-sm leading-relaxed space-y-3">
            <p>Система автоматически превратит вашу таблицу в чек-лист. Файл должен быть формата <b>.xlsx</b>.</p>
            <p class="font-bold text-indigo-600 dark:text-indigo-400 mt-2">Структура таблицы (строго 4 столбца):</p>
            <table class="w-full text-left border-collapse border border-slate-300 mt-2 text-[10px] bg-white dark:bg-slate-800">
                <tr class="bg-slate-100 dark:bg-slate-700">
                    <th class="border border-slate-300 p-1">Столбец A</th>
                    <th class="border border-slate-300 p-1">Столбец B</th>
                    <th class="border border-slate-300 p-1">Столбец C</th>
                    <th class="border border-slate-300 p-1">Столбец D</th>
                </tr>
                <tr>
                    <td class="border border-slate-300 p-1"><b>Название этапа (Группы)</b></td>
                    <td class="border border-slate-300 p-1"><b>Название дефекта/пункта</b></td>
                    <td class="border border-slate-300 p-1"><b>Категория (1, 2 или 3)</b></td>
                    <td class="border border-slate-300 p-1"><b>Текст норматива / ГОСТ</b></td>
                </tr>
                <tr>
                    <td class="border border-slate-300 p-1 text-slate-500">Подготовка поверхности</td>
                    <td class="border border-slate-300 p-1 text-slate-500">Грязь, пыль на бетоне</td>
                    <td class="border border-slate-300 p-1 text-slate-500">2</td>
                    <td class="border border-slate-300 p-1 text-slate-500">СП 70.13330 очистить до основания</td>
                </tr>
            </table>
            <div class="bg-yellow-50 text-yellow-800 border border-yellow-200 p-3 rounded-lg text-[11px] mt-3">
                ⚠️ <b>Важно:</b> Первая строка таблицы (заголовки столбцов) игнорируется при загрузке. Данные должны начинаться со 2-й строки.
            </div>
        </div>
    `;
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
}
window.showExcelHelp = showExcelHelp;

async function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Показываем уведомление о начале загрузки
    showToast("⚙️ Обработка Excel файла...");

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            // Читаем Excel файл
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Берем первый лист
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Переводим в формат массива массивов
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (rows.length < 2) throw new Error("Файл пуст или не содержит данных со 2-й строки");

            // Имя файла становится названием чек-листа
            const templateTitle = file.name.replace(/\.[^/.]+$/, "");
            const newTemplate = {
                title: templateTitle,
                templateVersion: "1.0",
                groups: []
            };

            let currentGroupTitle = "";
            let currentGroupItems = [];

            // Пропускаем 1-ю строку (rows[0]), так как это заголовки
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue; // Пропуск пустых строк

                // Считываем ячейки (Колонка A, B, C, D)
                const groupCol = row[0] ? row[0].toString().trim() : null;
                const itemCol = row[1] ? row[1].toString().trim() : null;
                const weightCol = row[2];
                const normCol = row[3] ? row[3].toString().trim() : null;

                // Если есть название группы и оно отличается от предыдущего - создаем новый блок
                if (groupCol && groupCol !== currentGroupTitle) {
                    if (currentGroupTitle && currentGroupItems.length > 0) {
                        newTemplate.groups.push({ group: currentGroupTitle, items: currentGroupItems });
                    }
                    currentGroupTitle = groupCol;
                    currentGroupItems = [];
                }

                // Если есть название дефекта
                if (itemCol) {
                    // Проверка категории
                    let weight = parseInt(weightCol);
                    if (isNaN(weight) || weight < 1 || weight > 3) weight = 2; // По умолчанию B2

                    currentGroupItems.push({
                        id: Date.now() % 100000 + Math.floor(Math.random() * 10000) + i,
                        n: itemCol,
                        w: weight,
                        t: formatNorms(normCol ? normCol : "Без норматива")
                    });
                }
            }

            // Не забываем добавить последнюю группу после цикла
            if (currentGroupTitle && currentGroupItems.length > 0) {
                newTemplate.groups.push({ group: currentGroupTitle, items: currentGroupItems });
            }

            if (newTemplate.groups.length === 0) throw new Error("Не удалось найти данные в таблице. Проверьте формат по инструкции (Кнопка '?').");

            // Генерируем уникальный ключ
            const slug = window.RbiIds.newId();

            // Сохраняем через сервис (мутация window.userTemplates + dbPut единой точкой)
            var templatesSvc3 = _templatesService();
            if (!templatesSvc3) throw new Error('Template service unavailable');
            await templatesSvc3.saveUserTemplate(newTemplate);

            showToast(`✅ Чек-лист "${templateTitle}" успешно загружен!`);

            // Перерисовываем интерфейс, чтобы шаблон сразу появился в списках
            window.renderSelector();
            if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('settings:renderRequested', {});

        } catch (err) {
            console.error(err);
            alert("Ошибка загрузки: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);

    // Сбрасываем инпут, чтобы можно было выбрать тот же файл снова
    event.target.value = '';
}
window.handleExcelImport = handleExcelImport;
// === ЭКСПОРТ ЧЕК-ЛИСТОВ В EXCEL И JSON ===

// Вспомогательная функция очистки HTML-тегов для выгрузки
// (Убирает красные и синие подсветки нормативов, чтобы в Excel был чистый текст)
function stripHtmlTags(str) {
    if (!str) return "";
    // Заменяем <br> на реальные переносы строк для Excel
    let text = str.replace(/<br\s*[\/]?>/gi, "\n");
    // Удаляем все остальные HTML-теги
    return text.replace(/<\/?[^>]+(>|$)/g, "");
}

function exportAllTemplatesJson() {
    showToast("⚙️ Формирование кода для templates.js...");

    // Объединяем системные и пользовательские чек-листы
    const allTemplates = { ...window.SYSTEM_TEMPLATES, ...userTemplates };

    // Вспомогательная функция очистки HTML для формирования чистого кода
    function cleanForCode(str) {
        if (!str) return "";
        // Убираем HTML теги, но сохраняем переносы строк как \n
        let text = str.replace(/<br\s*[\/]?>/gi, "\\n");
        text = text.replace(/<\/?[^>]+(>|$)/g, "");
        // Экранируем двойные кавычки
        return text.replace(/"/g, '\\"');
    }

    // Начинаем собирать строку, которая выглядит в точности как файл templates.js
    let jsCode = "/* Сгенерировано из RBI Quality */\n\n";
    jsCode += "const SYSTEM_TEMPLATES = {\n";

    const templateKeys = Object.keys(allTemplates);

    templateKeys.forEach((tKey, tIndex) => {
        const tmpl = allTemplates[tKey];
        jsCode += `    "${tKey}": {\n`;
        jsCode += `        title: "${tmpl.title}",\n`;
        jsCode += `        templateVersion: "${tmpl.templateVersion || '1.0'}",\n`;
        jsCode += `        groups: [\n`;

        if (tmpl.groups && Array.isArray(tmpl.groups)) {
            tmpl.groups.forEach((g, gIdx) => {
                jsCode += `            { group: "${g.group || g.title}", items: [\n`;

                if (g.items && Array.isArray(g.items)) {
                    g.items.forEach((i, iIdx) => {
                        const comma = iIdx < g.items.length - 1 ? ',' : '';
                        const cleanT = cleanForCode(i.t);
                        const cleanN = (i.n || "").replace(/"/g, '\\"');

                        // Оборачиваем текст норматива обратно в функцию formatNorms!
                        jsCode += `                { id: ${i.id}, n: "${cleanN}", w: ${i.w}, t: formatNorms("${cleanT}") }${comma}\n`;
                    });
                }

                const gComma = gIdx < tmpl.groups.length - 1 ? ',' : '';
                jsCode += `            ]}${gComma}\n`;
            });
        }

        const tComma = tIndex < templateKeys.length - 1 ? ',' : '';
        jsCode += `        ]\n    }${tComma}\n`;
    });

    jsCode += "};\n";

    // Скачиваем файл как .js
    downloadFile(jsCode, `rbi_templates_code_${new Date().toLocaleDateString('ru-RU')}.js`, 'application/javascript');
    showToast("✅ Готовый код для templates.js скачан!");
}
window.exportAllTemplatesJson = exportAllTemplatesJson;

// ИМПОРТ ПОЛЬЗОВАТЕЛЬСКОГО ЧЕК-ЛИСТА ИЗ JSON (инпут "json-input", кнопка UPLOAD в селекторе чек-листа)
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parsedData = JSON.parse(e.target.result);

            if (!parsedData || typeof parsedData !== 'object' || !Array.isArray(parsedData.groups)) {
                throw new Error("Неверный формат чек-листа. Ожидается объект с полем groups.");
            }

            const slug = parsedData.key || parsedData.slug || window.RbiIds.newId();
            parsedData.id = parsedData.id || slug;

            // Вызываем owner-сервис (эмитит templates:changed для подписчиков).
            var templatesSvc4 = _templatesService();
            if (!templatesSvc4) throw new Error('Template service unavailable');
            await templatesSvc4.saveUserTemplate(parsedData);

            showToast(`✅ Чек-лист "${parsedData.title || parsedData.name || ''}" успешно загружен!`);

            if (typeof window.renderSelector === 'function') window.renderSelector();
            if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('settings:renderRequested', {});
        } catch (err) {
            console.error(err);
            showToast("Ошибка загрузки чек-листа: " + err.message);
        }
    };
    reader.readAsText(file);

    // Сбрасываем инпут, чтобы можно было выбрать тот же файл снова
    event.target.value = '';
}
window.handleFileUpload = handleFileUpload;

// templates:changed → перерисовать вкладку Справочник, если она смонтирована.
// Патч bindCtx в конце файла (без нового window.*= и без сдвига baseline-строк выше).
(function patchReferenceTemplatesChanged() {
    var shared = window.ReferenceShared;
    if (!shared || typeof shared.bindCtx !== 'function') return;
    var origBindCtx = shared.bindCtx;
    var bound = false;
    shared.bindCtx = function (ctx) {
        origBindCtx(ctx);
        if (bound) return;
        bound = true;
        var events = (ctx && ctx.events) || (window.RBI && window.RBI.events);
        if (!events || typeof events.on !== 'function') return;
        events.on('templates:changed', function () {
            var mounted = document.getElementById('reference-items')
                && document.getElementById('ref-checklist-selector');
            if (!mounted) return;
            if (typeof renderReferenceTab === 'function') renderReferenceTab();
        });
    };
}());
