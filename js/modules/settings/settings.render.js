/**
 * settings.render.js
 * Рендер вкладки «Настройки» (owner-module). Реализация перенесена
 * 1:1 из settings.legacy.js. Источник настроек — SettingsService через
 * локальный fallback-helper (по образцу audit.render.js: render.js и
 * actions.js — независимые файлы без общего module-scope, поэтому
 * _getSetting здесь — собственная копия, не импорт из settings.actions.js).
 */

import { SettingsActions } from './settings.actions.js';
import { mountContractorDirectoryUI } from './features/contractor-directory-ui.js';
import { mountLocationDirectoryUI } from './features/location-directory-ui.js';
import { mountContractorIdBackfillUI } from './features/contractor-id-backfill-ui.js';
import { mountProjectIdBackfillUI } from './features/project-id-backfill-ui.js';
import { mountCloudDeletedPurgeUI } from './features/cloud-deleted-purge-ui.js';
import { mountCloudOrphanUrlsUI } from './features/cloud-orphan-urls-ui.js';
import { mountRoleMatrixUI } from './features/role-matrix-ui.js';
import { mountOfficialTemplatesUI } from './features/official-templates-ui.js';

var SettingsRender = {
    // =====================================================================
    // РАЗМЕТКА ВКЛАДКИ «НАСТРОЙКИ» (перенос из index.html:445-1529, JS-рендер).
    // Возвращает HTML-строку 1:1 идентичную прежней статичной разметке
    // #tab-settings.
    // =====================================================================
    renderMarkup: function () {
        return `
        <div id="tab-settings" class="view-section">
            <div
                class="sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-4 z-40 flex flex-col gap-2.5">
                <div class="flex justify-between items-center gap-2">
                    <h2
                        class="text-rbi-body font-black uppercase tracking-tight text-ink dark:text-white flex items-center gap-1.5 min-w-0">
                        <svg class="w-5 h-5 text-brand shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round"
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z">
                            </path>
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z">
                            </path>
                        </svg>
                        <span data-i18n="nav.settings">Настройки</span>
                    </h2>
                    <div class="flex items-center gap-2 shrink-0">
                        <button data-game-action="gameOpenManagerPanelAuth"
                            class="w-8 h-8 flex items-center justify-center bg-surface rounded-full text-muted active:scale-95 shadow-sm border border-surface"
                            title="Панель Руководителя" data-i18n="settings.chrome.manager_panel" data-i18n-attr="title">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z">
                                </path>
                            </svg>
                        </button>
                        <button data-settings-action="resetSettingsToDefault" data-i18n="settings.reset_defaults"
                            class="text-rbi-caption font-black text-danger bg-danger-soft px-3 py-2 rounded-lg uppercase tracking-widest border border-danger-soft shadow-sm active:scale-95 transition-colors">По умолчанию</button>
                    </div>
                </div>
                <div class="relative min-w-0">
                    <div id="settings-subnav" class="flex flex-nowrap gap-1 p-1 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-x-auto no-scrollbar" role="tablist" aria-label="Подразделы настроек" data-i18n="settings.subnav_aria" data-i18n-attr="aria-label">
                        <button type="button" data-settings-subsection="platform" role="tab" data-i18n="settings.section.platform"
                            class="settings-subnav-btn flex-1 min-w-[4.75rem] px-2.5 py-2 rounded-lg text-rbi-caption font-black uppercase tracking-widest transition-colors truncate">Платформа</button>
                        <button type="button" data-settings-subsection="company" role="tab" id="settings-subnav-company" hidden
                            class="settings-subnav-btn flex-1 min-w-[5.5rem] px-2.5 py-2 rounded-lg text-rbi-caption font-black uppercase tracking-widest transition-colors truncate">Компания</button>
                        <button type="button" data-settings-subsection="platform-admin" role="tab" id="settings-subnav-platform-admin" hidden
                            class="settings-subnav-btn flex-1 min-w-[7.5rem] px-2.5 py-2 rounded-lg text-rbi-caption font-black uppercase tracking-widest transition-colors truncate">Админ платформы</button>
                        <button type="button" data-settings-subsection="admin" role="tab" id="settings-subnav-admin"
                            class="settings-subnav-btn flex-1 min-w-[5.5rem] px-2.5 py-2 rounded-lg text-rbi-caption font-black uppercase tracking-widest transition-colors truncate inline-flex items-center justify-center gap-1">
                            <svg class="w-3 h-3 shrink-0 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                            <span data-i18n="settings.section.admin">Админ Качества</span>
                        </button>
                        <button type="button" data-settings-subsection="quality" role="tab" data-i18n="settings.section.quality"
                            class="settings-subnav-btn flex-1 min-w-[4.75rem] px-2.5 py-2 rounded-lg text-rbi-caption font-black uppercase tracking-widest transition-colors truncate">Качество</button>
                        <button type="button" data-settings-subsection="construction" role="tab" data-i18n="settings.section.construction"
                            class="settings-subnav-btn flex-1 min-w-[4.75rem] px-2.5 py-2 rounded-lg text-rbi-caption font-black uppercase tracking-widest transition-colors truncate">Стройконтроль</button>
                    </div>
                    <!-- Подсказка скролла (только визуал, не кликабельна; на md+ скрыта) -->
                    <div class="settings-subnav-scroll-hint pointer-events-none absolute inset-y-1 right-1 w-7 rounded-r-lg bg-gradient-to-l from-[var(--card-bg)] via-[var(--card-bg)]/80 to-transparent flex items-center justify-end pr-0.5 md:hidden" aria-hidden="true">
                        <svg class="w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </div>
                </div>
            </div>

            <div class="settings-panels">
            <div id="settings-panel-platform" data-settings-panel="platform" class="space-y-3">
                <!-- P2-0013: кто вошёл в Platform 2.0 (почта) и «Выйти»; рисует _syncP2Account по состоянию входа платформы -->
                <div id="settings-p2-account"
                    class="hidden bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm p-4 flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0">
                        <div id="settings-p2-account-title" class="text-rbi-caption font-black uppercase tracking-widest text-muted">Как вы вошли</div>
                        <div id="settings-p2-account-who" class="text-rbi-body font-bold truncate"></div>
                        <div id="settings-p2-company" class="mt-2"></div>
                    </div>
                    <button type="button" id="settings-p2-signout"
                        class="min-h-[40px] px-4 rounded-xl border border-[var(--card-border)] font-black text-rbi-caption uppercase tracking-widest active:scale-95">Выйти</button>
                    <button type="button" id="settings-p2-login"
                        class="hidden min-h-[40px] px-4 rounded-xl border border-[var(--card-border)] font-black text-rbi-caption uppercase tracking-widest active:scale-95">Войти по почте</button>
                </div>
                <!-- P2-0028: «Мой профиль» (ФИО, «Сменить пароль») — рисует platform2.renderMyProfile при входе по почте -->
                <div id="settings-p2-profile"></div>
                <!-- СИНХРОНИЗАЦИЯ КОМАНДЫ -->
                <details
                    class="bg-[var(--card-bg)] border border-brand-soft rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden"
                    open>
                    <summary
                        class="p-4 font-black text-rbi-body text-brand uppercase tracking-tight cursor-pointer flex justify-between items-center bg-brand-soft transition-colors select-none group-open:border-b border-brand-soft rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.sync">Синхронизация Команды</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-brand">▼</span>
                    </summary>
                    <div id="sync-settings-block"></div>
                </details>

                <!-- AI АССИСТЕНТ -->
                <details
                    class="bg-[var(--card-bg)] border border-brand-soft rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3">
                    <summary
                        class="p-4 font-black text-rbi-body text-brand uppercase tracking-tight cursor-pointer flex justify-between items-center bg-brand-soft transition-colors select-none group-open:border-b border-brand-soft rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.ai">AI-ассистент (DeepSeek)</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-brand">▼</span>
                    </summary>
                    <div class="rounded-b-2xl overflow-hidden">
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.ai.enable">Включить AI</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.ai.enable_hint">Интеллектуальные подсказки и аналитика</div>
                                <div id="set-ai-company-off" class="text-rbi-caption text-[var(--text-muted)] mt-1 hidden" data-i18n="settings.body.ai.company_off">ИИ-помощник выключен для вашей компании. Включает администратор платформы.</div>
                            </div>
                            <label class="toggle-switch"><input type="checkbox" id="set-ai-enabled"
                                    data-settings-action="toggleSetting" data-settings-action-key="aiEnabled" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                        <div id="ai-settings-body" class="transition-all duration-300 hidden">
                            <div class="p-4 bg-[var(--hover-bg)]">
                                <div class="font-bold text-sm mb-3" data-i18n="settings.body.ai.mode_title">Способ вызова нейросети</div>
                                <div class="flex flex-col gap-3">
                                    <!-- Режим 1: По учётке (P2-0034: сервер решает по входу и галочке «ИИ-помощник» в роли) -->
                                    <label
                                        class="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform">
                                        <input type="radio" name="ai-mode" value="account"
                                            class="w-4 h-4 accent-indigo-600" data-action="changeAiMode" data-action-arg="account" data-action-event="change">
                                        <span
                                            class="text-rbi-body font-bold text-ink flex items-center gap-1">
                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor"
                                                viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z">
                                                </path>
                                            </svg> <span data-i18n="settings.body.ai.mode_account">По учётке</span>
                                        </span>
                                    </label>

                                    <!-- Режим 2: Личный ключ -->
                                    <label
                                        class="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform">
                                        <input type="radio" name="ai-mode" value="personal"
                                            class="w-4 h-4 accent-indigo-600"
                                            data-action="changeAiMode" data-action-arg="personal" data-action-event="change">
                                        <span
                                            class="text-rbi-body font-bold text-ink flex items-center gap-1">
                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor"
                                                viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z">
                                                </path>
                                            </svg> <span data-i18n="settings.body.ai.mode_personal">Мой персональный API-ключ</span>
                                        </span>
                                    </label>
                                    
                                    <div id="personal-key-field"
                                        class="hidden bg-surface p-3 rounded-xl border border-surface shadow-inner ml-6">
                                        <form onsubmit="event.preventDefault();">
                                            <!-- ВСТАВКА: Скрытый логин -->
                                            <input type="text" autocomplete="username" style="display:none;" value="admin">
                                            
                                            <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block" data-i18n="settings.body.ai.api_key_label">API-ключ DeepSeek</label>
                                            <input type="password" id="set-ai-key" autocomplete="new-password" class="input-base font-mono text-rbi-caption bg-surface" placeholder="sk-..." data-i18n="settings.body.ai.api_key_ph" data-i18n-attr="placeholder" data-settings-action="toggleSetting" data-settings-action-key="apiKey" data-settings-action-val-type="element" data-action-event="change">
                                            <div class="text-rbi-caption text-muted mt-1.5 leading-snug" data-i18n="settings.body.ai.device_only">Сохраняется только на вашем устройстве.</div>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </details>

                <!-- БРЕНДИРОВАНИЕ -->
                <details
                    class="bg-[var(--card-bg)] border border-brand-soft rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3">
                    <summary
                        class="p-4 font-black text-rbi-body text-brand uppercase tracking-tight cursor-pointer flex justify-between items-center bg-brand-soft transition-colors select-none group-open:border-b border-brand-soft rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.branding">Брендирование (PRO)</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-brand">▼</span>
                    </summary>
                    <div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.branding.color">Фирменный цвет</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.branding.color_hint">Цвет акцентов в PDF</div>
                            </div>
                            <input type="color" id="set-brand-color"
                                class="w-10 h-10 p-0 border-0 rounded cursor-pointer"
                                data-settings-action="toggleSetting" data-settings-action-key="brandColor" data-settings-action-val-type="element" data-action-event="change">
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)]">
                            <div class="flex justify-between items-center mb-2">
                                <div>
                                    <div class="font-bold text-sm" data-i18n="settings.body.branding.logo">Логотип компании</div>
                                    <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.branding.logo_hint">Отобразится в шапке отчетов</div>
                                </div>
                                <button onclick="document.getElementById('brand-logo-upload').click()"
                                    class="bg-brand-soft text-brand px-3 py-1.5 rounded-lg text-rbi-caption font-bold active:scale-95 border border-brand-soft" data-i18n="settings.body.branding.upload">Загрузить</button>
                                <input type="file" id="brand-logo-upload" accept="image/png, image/jpeg" class="hidden"
                                    data-settings-action="handleLogoUpload" data-settings-action-val-type="event" data-action-event="change">
                            </div>
                            <div id="brand-logo-preview"
                                class="hidden mt-3 border border-[var(--card-border)] rounded-lg p-2 bg-[var(--card-bg)] flex justify-between items-center shadow-inner">
                                <img id="brand-logo-img" src="" class="h-10 max-w-[60%] object-contain bg-transparent">
                                <button data-settings-action="removeBrandLogo"
                                    class="text-danger text-rbi-caption font-bold px-3 py-1.5 bg-[var(--card-bg)] rounded border border-danger-soft shadow-sm active:scale-90" data-i18n="settings.body.branding.remove">Удалить</button>
                            </div>
                            <!-- УПРАВЛЕНИЕ КОРПОРАТИВНЫМ СТИЛЕМ -->
                            <div id="corp-branding-controls" class="mt-3"></div>
                        </div>
                    </div>
                </details>

                <!-- ИНТЕРФЕЙС И ОФОРМЛЕНИЕ -->
                <details
                    class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3">
                    <summary
                        class="p-4 font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight cursor-pointer flex justify-between items-center bg-surface transition-colors select-none group-open:border-b border-[var(--card-border)] rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.interface">Интерфейс и управление</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-muted">▼</span>
                    </summary>
                    <div>
                        <!-- Настройки внешнего вида -->
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.theme">Тема приложения</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.theme_hint">Цветовая схема</div>
                            </div>
                            <select id="set-theme" class="input-base w-52" data-settings-action="toggleSetting" data-settings-action-key="theme" data-settings-action-val-type="element" data-action-event="change">
                                <option value="rbi-auto-v3" data-i18n="settings.opt.theme.rbi_auto_v3">RBI · Авто</option>
                                <option value="rbi-light-v3" data-i18n="settings.opt.theme.rbi_light_v3">RBI · Светлая</option>
                                <option value="rbi-dark-v3" data-i18n="settings.opt.theme.rbi_dark_v3">RBI · Тёмная</option>
                                <option value="auto" data-i18n="settings.opt.theme.auto">Системная · индиго</option>
                                <option value="light" data-i18n="settings.opt.theme.light">Светлая · индиго</option>
                                <option value="dark" data-i18n="settings.opt.theme.dark">Тёмная · индиго</option>
                                <option value="rbi-auto" data-i18n="settings.opt.theme.rbi_auto">RBI v1 · Авто</option>
                                <option value="rbi-light" data-i18n="settings.opt.theme.rbi_light">RBI v1 · Светлая</option>
                                <option value="rbi-dark" data-i18n="settings.opt.theme.rbi_dark">RBI v1 · Тёмная</option>
                                <option value="rbi-auto-v2" data-i18n="settings.opt.theme.rbi_auto_v2">RBI v2 · Авто</option>
                                <option value="rbi-light-v2" data-i18n="settings.opt.theme.rbi_light_v2">RBI v2 · Светлая</option>
                                <option value="rbi-dark-v2" data-i18n="settings.opt.theme.rbi_dark_v2">RBI v2 · Тёмная</option>
                            </select>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.language">Язык интерфейса</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.language_hint">Оболочка и панели настроек. Чек-листы и контент data/* пока без перевода</div>
                            </div>
                            <select id="set-locale" class="input-base w-40">
                                <option value="ru" data-i18n="settings.locale.ru">Русский</option>
                                <option value="en" data-i18n="settings.locale.en">English</option>
                                <option value="sr-Latn" data-i18n="settings.locale.sr-Latn">Srpski (latinica)</option>
                                <option value="ka" data-i18n="settings.locale.ka">ქართული</option>
                            </select>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.font_size">Масштаб интерфейса</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.font_size_hint">Размер шрифта и кнопок</div>
                            </div>
                            <select id="set-fontsize" class="input-base w-32"
                                data-settings-action="toggleSetting" data-settings-action-key="fontSize" data-settings-action-val-type="element" data-action-event="change">
                                <option value="small" data-i18n="settings.opt.font.small">Мелкий</option>
                                <option value="medium" data-i18n="settings.opt.font.medium">Средний</option>
                                <option value="large" data-i18n="settings.opt.font.large">Крупный</option>
                                <option value="xlarge" data-i18n="settings.opt.font.xlarge">Очень крупный</option>
                            </select>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.nav_pos">Позиция меню</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.nav_pos_hint">Где отображать кнопки вкладок</div>
                            </div>
                            <select id="set-navpos" class="input-base w-32"
                                data-settings-action="toggleSetting" data-settings-action-key="navPosition" data-settings-action-val-type="element" data-action-event="change">
                                <option value="auto" data-i18n="settings.opt.nav.auto">Авто (ПК-Верх)</option>
                                <option value="top" data-i18n="settings.opt.nav.top">Всегда сверху</option>
                                <option value="bottom" data-i18n="settings.opt.nav.bottom">Всегда снизу</option>
                            </select>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.dashboard">Мини-дашборд</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.dashboard_hint">Отображение в шапке осмотра</div>
                            </div>
                            <select id="set-dashmode" class="input-base w-32"
                                data-settings-action="toggleSetting" data-settings-action-key="dashboardMode" data-settings-action-val-type="element" data-action-event="change">
                                <option value="compact" data-i18n="settings.opt.dash.compact">Компактный</option>
                                <option value="expanded" data-i18n="settings.opt.dash.expanded">Развернутый</option>
                                <option value="hidden" data-i18n="settings.opt.dash.hidden">Отключить</option>
                            </select>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center gap-3">
                            <div class="min-w-0">
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.filters_scroll">Фильтры при скролле</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.filters_scroll_hint">Авто: как шапка Осмотра — свернуть при скролле вниз, развернуть у верха. Ручное — только по клику</div>
                            </div>
                            <select id="set-auto-collapse-filters" class="input-base w-36 shrink-0"
                                data-settings-action="toggleSetting" data-settings-action-key="autoCollapseFilters" data-settings-action-val-type="element" data-action-event="change">
                                <option value="manual" selected data-i18n="settings.opt.collapse.manual">Ручное</option>
                                <option value="auto" data-i18n="settings.opt.collapse.auto">Авто</option>
                            </select>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center gap-3">
                            <div class="min-w-0">
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.motion">Анимации интерфейса</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.motion_hint">Hover, пружины тостов/модалок, скелетоны. Система «уменьшить движение» тоже учитывается</div>
                            </div>
                            <label class="toggle-switch shrink-0"><input type="checkbox" id="set-ui-motion"
                                    data-settings-action="toggleSetting" data-settings-action-key="uiMotionEnabled" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center gap-3">
                            <div class="min-w-0">
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.overscroll">Блокировка обновления свайпом</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.overscroll_hint">Для Android: жёстко режет pull-to-refresh у верхнего края. Пружина/свечение по краям пропадёт</div>
                            </div>
                            <label class="toggle-switch shrink-0"><input type="checkbox" id="set-hard-overscroll"
                                    data-settings-action="toggleSetting" data-settings-action-key="hardOverscrollLock" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>

                        <!-- Настройки поведения -->
                        <!-- Настройки уведомлений -->
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.push">Push-уведомления</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.push_hint">Оповещения о новых задачах СК</div>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="set-push-notifications"
                                    data-settings-action="togglePushSettings" data-settings-action-val-type="element" data-action-event="change">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.swipe">Свайпы (Вправо/Влево)</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.swipe_hint">Управление жестами в Осмотре</div>
                            </div>
                            <label class="toggle-switch"><input type="checkbox" id="set-swipe"
                                    data-settings-action="toggleSetting" data-settings-action-key="swipeEnabled" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.collapse_ok">Схлопывать OK</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.collapse_ok_hint">Сворачивать пройденные карточки</div>
                            </div>
                            <label class="toggle-switch"><input type="checkbox" id="set-collapse"
                                    data-settings-action="toggleSetting" data-settings-action-key="autoCollapseOk" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.groups_collapsed">Группы свернуты</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.groups_collapsed_hint">Изначально скрывать пункты этапов</div>
                            </div>
                            <label class="toggle-switch"><input type="checkbox" id="set-groups-col"
                                    data-settings-action="toggleSetting" data-settings-action-key="defaultGroupsCollapsed" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                        <div class="p-4 flex justify-between items-center rounded-b-2xl">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.interface.fast_mode">Быстрый режим</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.interface.fast_mode_hint">Скрыть тексты нормативов</div>
                            </div>
                            <label class="toggle-switch"><input type="checkbox" id="set-fast"
                                    data-settings-action="toggleSetting" data-settings-action-key="fastMode" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                    </div>
                </details>

                <!-- УПРАВЛЕНИЕ ДАННЫМИ И БЭКАПЫ -->
                <details
                    class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3">
                    <summary
                        class="p-4 font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight cursor-pointer flex justify-between items-center bg-surface transition-colors select-none group-open:border-b border-[var(--card-border)] rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.storage">Хранилище и Резервные копии</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-muted">▼</span>
                    </summary>
                    <div class="bg-surface rounded-b-2xl">

                        <!-- Память устройства -->
                        <div class="p-4 border-b border-[var(--card-border)]">
                            <div class="flex justify-between items-center mb-3">
                                <div class="font-bold text-sm" data-i18n="settings.body.storage.indexeddb">Хранилище (IndexedDB)</div>
                                <div class="text-xs font-black text-brand"
                                    id="storage-percent">--%</div>
                            </div>
                            <div class="w-full h-3 bg-surface rounded-full overflow-hidden mb-2">
                                <div id="storage-bar" class="h-full bg-brand transition-all" style="width: 0%">
                                </div>
                            </div>
                            <div class="flex justify-between text-rbi-caption text-[var(--text-muted)] font-bold mb-4">
                                <span><span data-i18n="settings.body.storage.used_prefix">Исп:</span> <span id="storage-used">--</span> <span data-i18n="settings.opt.mb">МБ</span></span>
                                <span><span data-i18n="settings.body.storage.free_prefix">Свободно:</span> <span id="storage-free">--</span> <span data-i18n="settings.opt.mb">МБ</span></span>
                            </div>

                            <div class="flex justify-between items-center mb-4">
                                <div>
                                    <div class="font-bold text-sm" data-i18n="settings.body.storage.auto_cache">Авто-кэш облачных файлов</div>
                                    <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.storage.auto_cache_hint">Сохранять фото и PDF для офлайна</div>
                                </div>
                                <label class="toggle-switch"><input type="checkbox" id="set-autocache"
                                        data-settings-action="toggleSetting" data-settings-action-key="autoCacheCloudFiles" data-settings-action-val-type="element" data-action-event="change"><span
                                        class="toggle-slider"></span></label>
                            </div>

                            <div id="offline-cache-progress" class="hidden mb-3 text-rbi-caption font-bold text-muted"></div>

                            <div class="grid grid-cols-1 gap-2 mb-3">
                                <button type="button" data-settings-action="downloadOfflineCacheScope" data-action-arg="days30"
                                    class="w-full bg-surface text-ink border border-surface py-2.5 rounded-xl font-black text-rbi-caption uppercase active:scale-95 transition-colors">
                                    <span data-i18n="settings.body.storage.dl_30d">Скачать последние 30 дней</span>
                                </button>
                                <button type="button" data-settings-action="downloadOfflineCacheScope" data-action-arg="knowledge"
                                    class="w-full bg-surface text-ink border border-surface py-2.5 rounded-xl font-black text-rbi-caption uppercase active:scale-95 transition-colors">
                                    <span data-i18n="settings.body.storage.dl_knowledge">Скачать только базу знаний</span>
                                </button>
                                <button type="button" data-settings-action="downloadOfflineCacheScope" data-action-arg="reports"
                                    class="w-full bg-surface text-ink border border-surface py-2.5 rounded-xl font-black text-rbi-caption uppercase active:scale-95 transition-colors">
                                    <span data-i18n="settings.body.storage.dl_reports">Скачать отчёты на устройство</span>
                                </button>
                            </div>

                            <div class="grid grid-cols-3 gap-2 mb-3">
                                <button data-settings-action="clearPdfCache"
                                    class="bg-surface text-muted py-3 rounded-xl font-bold text-rbi-caption uppercase border border-surface active:scale-95 transition-colors flex items-center justify-center gap-2">
                                    <span data-i18n="settings.body.storage.clear_cache">Очистить кэш</span>
                                </button>
                                <button data-settings-action="previewStorageCleanup"
                                    class="w-full mt-2 bg-surface text-ink border border-surface rounded-xl py-2.5 text-rbi-label font-black uppercase active:scale-95 transition-transform">
                                    <span data-i18n="settings.body.storage.preview_cleanup">Проверить автоочистку</span>
                                </button>
                                <button onclick="emptyTrashBin()"
                                    class="bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 py-3 rounded-xl font-bold text-rbi-caption uppercase border border-orange-200 dark:border-orange-800/50 active:scale-95 transition-colors flex items-center justify-center gap-2">
                                    <span data-i18n="settings.body.storage.empty_trash">Очистить мусор</span>
                                </button>
                            </div>

                            <!-- RBI NEW: управление файловым кэшем -->
                            <div
                                class="mt-3 p-3 rounded-xl border border-surface bg-surface">
                                <div class="flex items-center justify-between gap-3 mb-3">
                                    <div>
                                        <div
                                            class="text-rbi-label font-black text-ink uppercase tracking-wider">
                                            <span data-i18n="settings.body.storage.auto_cleanup">Автоочистка файлового кэша</span>
                                        </div>
                                        <div class="text-rbi-caption text-muted leading-snug mt-1" data-i18n="settings.body.storage.auto_cleanup_hint">
                                            Удаляет только локальные копии файлов, которые уже есть в облаке. Проверки и несинхронизированные фото не удаляются.
                                        </div>
                                    </div>

                                    <label class="relative inline-flex items-center cursor-pointer shrink-0">
                                        <input type="checkbox" id="set-storage-auto-cleanup" class="sr-only peer"
                                            data-settings-action="saveSettings" data-settings-action-key="storageAutoCleanupEnabled" data-settings-action-val-type="checked" data-action-event="change">
                                        <div
                                            class="w-11 h-6 bg-surface peer-focus:outline-none rounded-full peer peer-checked:bg-brand after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5">
                                        </div>
                                    </label>
                                </div>

                                <label class="text-rbi-caption font-black text-muted uppercase block mb-1">
                                    <span data-i18n="settings.body.storage.cleanup_threshold">Порог автоочистки</span>
                                </label>
                                <select id="set-storage-cleanup-threshold" class="input-base text-rbi-label mb-3"
                                    data-settings-action="saveSettings" data-settings-action-key="storageCleanupThresholdPercent" data-settings-action-val-type="int" data-action-event="change">
                                    <option value="60" data-i18n="settings.opt.cleanup.soft">Мягко: при заполнении 60%</option>
                                    <option value="80" data-i18n="settings.opt.cleanup.std">Стандарт: при заполнении 80%</option>
                                    <option value="90" data-i18n="settings.opt.cleanup.eco">Экономно: при заполнении 90%</option>
                                </select>

                                <label class="text-rbi-caption font-black text-muted uppercase block mb-1">
                                    <span data-i18n="settings.body.storage.ttl_photos">Хранить локальные копии фото проверок</span>
                                </label>

                                <select id="set-storage-photo-ttl" class="input-base text-rbi-label"
                                    data-settings-action="saveSettings" data-settings-action-key="storageInspectionPhotoTtlDays" data-settings-action-val-type="int" data-action-event="change">
                                    <option value="30" data-i18n="settings.opt.days.30">30 дней</option>
                                    <option value="60" data-i18n="settings.opt.days.60">60 дней</option>
                                    <option value="90" data-i18n="settings.opt.days.90">90 дней</option>
                                    <option value="180" data-i18n="settings.opt.days.180">180 дней</option>
                                </select>
                                <div class="grid grid-cols-1 gap-2 mt-3">
                                    <label class="text-rbi-caption font-black text-muted uppercase block">
                                        <span data-i18n="settings.body.storage.ttl_reports">Хранить PDF-отчеты локально</span>
                                    </label>
                                    <select id="set-storage-report-ttl" class="input-base text-rbi-label"
                                        data-settings-action="saveSettings" data-settings-action-key="storageReportTtlDays" data-settings-action-val-type="int" data-action-event="change">
                                        <option value="7" data-i18n="settings.opt.days.7">7 дней</option>
                                        <option value="30" data-i18n="settings.opt.days.30">30 дней</option>
                                        <option value="60" data-i18n="settings.opt.days.60">60 дней</option>
                                    </select>

                                    <label class="text-rbi-caption font-black text-muted uppercase block">
                                        <span data-i18n="settings.body.storage.ttl_docs">Хранить документы базы знаний</span>
                                    </label>
                                    <select id="set-storage-doc-ttl" class="input-base text-rbi-label"
                                        data-settings-action="saveSettings" data-settings-action-key="storageDocTtlDays,storageKnowledgeFileTtlDays" data-settings-action-val-type="int" data-action-event="change">
                                        <option value="30" data-i18n="settings.opt.days.30">30 дней</option>
                                        <option value="60" data-i18n="settings.opt.days.60">60 дней</option>
                                        <option value="90" data-i18n="settings.opt.days.90">90 дней</option>
                                    </select>

                                    <label class="text-rbi-caption font-black text-muted uppercase block">
                                        <span data-i18n="settings.body.storage.ttl_twi">Хранить TWI и тех. узлы</span>
                                    </label>
                                    <select id="set-storage-twi-node-ttl" class="input-base text-rbi-label"
                                        data-settings-action="saveSettings" data-settings-action-key="storageTwiTtlDays,storageNodeTtlDays" data-settings-action-val-type="int" data-action-event="change">
                                        <option value="60" data-i18n="settings.opt.days.60">60 дней</option>
                                        <option value="90" data-i18n="settings.opt.days.90">90 дней</option>
                                        <option value="180" data-i18n="settings.opt.days.180">180 дней</option>
                                    </select>

                                    <label class="text-rbi-caption font-black text-muted uppercase block">
                                        <span data-i18n="settings.body.storage.ttl_practices">Хранить практики локально</span>
                                    </label>
                                    <select id="set-storage-practice-ttl" class="input-base text-rbi-label"
                                        data-settings-action="saveSettings" data-settings-action-key="storagePracticeTtlDays" data-settings-action-val-type="int" data-action-event="change">
                                        <option value="30" data-i18n="settings.opt.days.30">30 дней</option>
                                        <option value="60" data-i18n="settings.opt.days.60">60 дней</option>
                                        <option value="90" data-i18n="settings.opt.days.90">90 дней</option>
                                    </select>
                                </div>
                            </div>

                            <button data-settings-action="downloadOfflineCacheScope" data-action-arg="all"
                                class="w-full bg-brand-soft text-brand border border-brand-soft py-3 rounded-xl font-black text-rbi-label uppercase active:scale-95 transition-colors flex items-center justify-center gap-2 mb-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 11v6m0 0l-3-3m3 3l3-3">
                                    </path>
                                </svg>
                                <span data-i18n="settings.body.storage.dl_all">Скачать всё для Офлайна</span>
                            </button>


                            <button data-interventions-action="exportLibraryToJsCode"
                                class="w-full bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 py-3 rounded-xl font-black text-[11px] uppercase active:scale-95 transition-colors flex items-center justify-center gap-2 shadow-sm">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                                </svg>
                                <span data-i18n="settings.body.storage.export_library">Выгрузить Библиотеку в код</span>
                            </button>
                        </div>

                        <!-- Ручной экспорт -->
                        <div class="p-4 border-b border-[var(--card-border)] bg-surface">
                            <div class="font-bold text-sm mb-3" data-i18n="settings.body.storage.backups_title">Резервные копии (Ручная выгрузка)</div>
                            <div class="grid grid-cols-2 gap-2 mb-3">
                                <div data-reports-action="handleDataExport" data-action-arg="json" data-reports-action-arg2="incremental"
                                    class="bg-surface border border-surface rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-transform cursor-pointer hover:border-brand-soft">
                                    <svg class="w-5 h-5 text-brand" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15">
                                        </path>
                                    </svg>
                                    <div
                                        class="text-rbi-caption font-black text-ink dark:text-white uppercase text-center leading-tight whitespace-pre-line" data-i18n="settings.body.storage.export_incremental">Только
Новое</div>
                                </div>
                                <div data-reports-action="handleDataExport" data-action-arg="json" data-reports-action-arg2="full"
                                    class="bg-surface border border-surface rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-transform cursor-pointer hover:border-brand-soft">
                                    <svg class="w-5 h-5 text-brand" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z">
                                        </path>
                                    </svg>
                                    <div
                                        class="text-rbi-caption font-black text-ink dark:text-white uppercase text-center leading-tight whitespace-pre-line" data-i18n="settings.body.storage.export_full">Вся
База</div>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <button data-reports-action="triggerDataImport"
                                    class="flex-1 bg-surface border border-surface py-3 rounded-xl font-bold text-rbi-caption uppercase shadow-sm active:scale-95 flex items-center justify-center gap-1.5 transition-colors hover:bg-surface">
                                    <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5">
                                        </path>
                                    </svg> <span data-i18n="settings.body.storage.import_file">Загрузить файл</span>
                                </button>
                                <button data-reports-action="openShareModal"
                                    class="flex-1 bg-brand text-white py-3 rounded-xl font-bold text-rbi-caption uppercase shadow-sm active:scale-95 flex items-center justify-center gap-1.5 transition-colors hover:bg-brand">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                        stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z">
                                        </path>
                                    </svg> <span data-i18n="settings.body.storage.share">Поделиться</span>
                                </button>
                            </div>
                        </div>

                        <!-- Реестр бэкапов -->
                        <div class="p-4 border-b border-[var(--card-border)]">
                            <div class="flex justify-between items-center mb-3">
                                <div class="font-bold text-sm" data-i18n="settings.body.storage.backup_history">История выгрузок</div>
                                <button data-reports-action="clearBackupRegistry"
                                    class="text-rbi-caption font-bold text-danger bg-danger-soft px-2 py-1 rounded border border-danger-soft active:scale-95" data-i18n="settings.body.storage.clear_history">Очистить</button>
                            </div>
                            <div
                                class="overflow-x-auto custom-scrollbar max-h-32 border border-surface rounded-lg">
                                <table class="w-full text-left text-rbi-caption">
                                    <tbody id="rbi-backup-registry-list"
                                        class="divide-y divide-slate-100 dark:divide-slate-700"></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Автоматизация -->
                        <div class="p-4 border-b border-[var(--card-border)] bg-[var(--hover-bg)]">
                            <div class="flex justify-between items-center mb-3">
                                <div>
                                    <div class="font-bold text-sm text-brand" data-i18n="settings.body.storage.auto_backup">Автоматический бэкап</div>
                                    <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.storage.auto_backup_hint">Регулярно сохранять базу устройства</div>
                                </div>
                                <label class="toggle-switch"><input type="checkbox" id="set-autobackup"
                                        data-settings-action="toggleSetting" data-settings-action-key="autoBackupEnabled" data-settings-action-val-type="element" data-action-event="change"><span
                                        class="toggle-slider"></span></label>
                            </div>
                            <div class="flex justify-between items-center mb-1">
                                <div class="font-bold text-sm" data-i18n="settings.body.storage.auto_backup_day">День автобэкапа</div>
                                <select id="set-autobackup-day" class="input-base w-32 !py-1.5"
                                    data-settings-action="toggleSetting" data-settings-action-key="autoBackupDay" data-settings-action-val-type="element" data-action-event="change">
                                    <option value="1" data-i18n="settings.opt.weekday.1">Понедельник</option>
                                    <option value="2" data-i18n="settings.opt.weekday.2">Вторник</option>
                                    <option value="3" data-i18n="settings.opt.weekday.3">Среда</option>
                                    <option value="4" data-i18n="settings.opt.weekday.4">Четверг</option>
                                    <option value="5" selected data-i18n="settings.opt.weekday.5">Пятница</option>
                                    <option value="6" data-i18n="settings.opt.weekday.6">Суббота</option>
                                    <option value="0" data-i18n="settings.opt.weekday.0">Воскресенье</option>
                                </select>
                            </div>
                        </div>

                        <!-- Отправка руководителю -->
                        <div
                            class="p-4 border-b border-orange-100 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10">
                            <div class="flex justify-between items-center mb-3">
                                <div>
                                    <div class="font-bold text-sm text-orange-700 dark:text-orange-400" data-i18n="settings.body.storage.manager_send">Отправка руководителю</div>
                                    <div class="text-rbi-caption text-orange-600 dark:text-orange-500 mt-1" data-i18n="settings.body.storage.manager_send_hint">Авто-вызов меню «Поделиться» с инкрементом</div>
                                </div>
                                <label class="toggle-switch"><input type="checkbox" id="set-automanager"
                                        data-settings-action="toggleSetting" data-settings-action-key="autoManagerEnabled" data-settings-action-val-type="element" data-action-event="change"><span
                                        class="toggle-slider"></span></label>
                            </div>
                            <div class="flex justify-between items-center mb-3">
                                <div class="font-bold text-sm text-orange-800 dark:text-orange-300" data-i18n="settings.body.storage.manager_day">День отправки</div>
                                <select id="set-automanager-day"
                                    class="input-base w-32 !py-1.5 border-orange-200 dark:border-orange-800"
                                    data-settings-action="toggleSetting" data-settings-action-key="autoManagerDay" data-settings-action-val-type="element" data-action-event="change">
                                    <option value="1" data-i18n="settings.opt.weekday.1">Понедельник</option>
                                    <option value="2" data-i18n="settings.opt.weekday.2">Вторник</option>
                                    <option value="3" data-i18n="settings.opt.weekday.3">Среда</option>
                                    <option value="4" data-i18n="settings.opt.weekday.4">Четверг</option>
                                    <option value="5" selected data-i18n="settings.opt.weekday.5">Пятница</option>
                                    <option value="6" data-i18n="settings.opt.weekday.6">Суббота</option>
                                    <option value="0" data-i18n="settings.opt.weekday.0">Воскресенье</option>
                                </select>
                            </div>
                            <button data-reports-action="triggerManagerShareManual"
                                class="w-full bg-orange-500 text-white py-3 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-sm active:scale-95 transition-transform flex justify-center items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                                </svg>
                                <span data-i18n="settings.body.storage.manager_send_now">Отправить руководителю сейчас</span>
                            </button>
                        </div>
                    </div>
                </details>

                <!-- ОБРАТНАЯ СВЯЗЬ (ФИДБЕК И ИДЕИ) -->
                <details
                    class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3">
                    <summary
                        class="p-4 font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight cursor-pointer flex justify-between items-center bg-surface transition-colors select-none group-open:border-b border-[var(--card-border)] rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.feedback">Обратная связь (Идеи)</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-muted">▼</span>
                    </summary>
                    <div class="p-4 bg-surface rounded-b-2xl">
                        <div class="mb-4 border-b border-[var(--card-border)] pb-4">
                            <label
                                class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-2 block" data-i18n="settings.body.feedback.label">Предложить улучшение / Сообщить об ошибке</label>
                            <textarea id="feedback-input-text" class="input-base text-rbi-body h-20 resize-none mb-2"
                                placeholder="Опишите, чего не хватает или что работает не так..." data-i18n="settings.body.feedback.ph" data-i18n-attr="placeholder"></textarea>
                            <button id="feedback-submit-btn" data-settings-action="rbi_submitFeedback"
                                class="w-full bg-emerald-600 text-white py-3 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                                </svg> <span data-i18n="settings.body.feedback.submit">Отправить разработчику</span>
                            </button>
                        </div>
                        <div class="text-rbi-caption font-black text-[var(--text-muted)] uppercase tracking-widest mb-3" data-i18n="settings.body.feedback.backlog">
                            Бэклог команды</div>
                        <div id="feedback-list-container"
                            class="space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                            <!-- Карточки фидбека будут здесь -->
                        </div>
                    </div>
                </details>

                <!-- ОНБОРДИНГ ПЛАТФОРМЫ -->
                <div class="bg-[var(--card-bg)] border border-emerald-200 dark:border-emerald-800 rounded-2xl shadow-sm p-4 flex justify-between items-center gap-3 mb-3">
                    <div class="min-w-0">
                        <div class="font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight" data-i18n="settings.body.feedback.onboarding">Онбординг платформы</div>
                        <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.feedback.onboarding_hint">Полный интерактивный тур по RBI Platform · Construction OS (Осмотр, Инженер, Аналитика, БЗ, СК, настройки)</div>
                    </div>
                    <button type="button" data-settings-action="startInteractiveTutorial"
                        class="shrink-0 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-rbi-caption font-black uppercase active:scale-95 transition-transform shadow-sm" data-i18n="settings.body.feedback.onboarding_start">
                        Старт
                    </button>
                </div>

                 <!-- ИСТОРИЯ ИЗМЕНЕНИЙ (CHANGELOG) -->
                <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm p-4 flex justify-between items-center mb-3">
                    <div>
                        <div class="font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight" data-i18n="settings.body.feedback.changelog">История обновлений</div>
                        <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.feedback.changelog_hint">Что нового в версиях (Changelog)</div>
                    </div>
                    <button data-settings-action="rbi_openChangelogModal" class="bg-brand-soft text-brand border border-brand-soft px-4 py-2.5 rounded-xl text-rbi-caption font-black uppercase active:scale-95 transition-transform shadow-sm" data-i18n="settings.body.feedback.changelog_read">
                        Читать
                    </button>
                </div>

                <!-- САМООБУЧЕНИЕ СИСТЕМЫ (AI) -->
                <details id="ai-optimizer-settings"
                    class="bg-[var(--card-bg)] border border-purple-200 dark:border-purple-800 rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3">
                    <summary
                        class="p-4 font-black text-rbi-body text-purple-700 dark:text-purple-400 uppercase tracking-tight cursor-pointer flex justify-between items-center bg-purple-50 dark:bg-purple-900/20 transition-colors select-none group-open:border-b border-purple-200 dark:border-purple-800 rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.ai_optimizer">AI-Оптимизатор Системы</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-purple-400">▼</span>
                    </summary>
                    <div class="p-4 bg-surface rounded-b-2xl">
                        <div class="text-rbi-label text-muted leading-relaxed mb-3" data-i18n="settings.body.ai_optimizer.body">
                            Система проанализирует весь накопленный массив проверок и предложит корректировку математической модели: жесткость порогов (Красная/Зеленая зоны), веса рисков и правило «Стеклянного потолка».
                        </div>
                        <button data-action="runSelfLearningAi"
                            class="w-full bg-purple-600 text-white py-3 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z">
                                </path>
                            </svg> <span data-i18n="settings.body.ai_optimizer.run">Запустить анализ базы</span>
                        </button>
                        <div id="ai-self-learning-result"
                            class="hidden mt-4 p-3 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-xl text-rbi-label text-ink leading-relaxed font-medium whitespace-pre-wrap shadow-inner">
                        </div>
                    </div>
                </details>

                <!-- БАЗА ЗНАНИЙ (FAQ) -->
                <div
                    class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm p-4 flex justify-between items-center mb-3">
                    <div>
                        <div class="font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight">
                            <span data-i18n="settings.body.feedback.methodology">Методология RBI</span></div>
                        <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.feedback.methodology_hint">Формулы, логика ИКО и ответы на вопросы</div>
                    </div>
                    <button data-knowledge-action="openFaqModal"
                        class="bg-brand-soft text-brand border border-brand-soft px-4 py-2.5 rounded-xl text-rbi-caption font-black uppercase active:scale-95 transition-transform shadow-sm" data-i18n="settings.body.feedback.open_faq">
                        Открыть FAQ
                    </button>
                </div>

                <!-- Миграция перенесена в Настройки → Администрирование -->

                <div class="flex flex-col gap-3 items-center mt-4 mb-6">
                    <button data-shell-action="checkForUpdates"
                        class="text-rbi-caption font-bold text-brand bg-brand-soft px-4 py-2 rounded-lg hover:bg-brand-soft border border-brand-soft transition-colors uppercase shadow-sm flex items-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        <span data-i18n="settings.body.feedback.check_updates">Проверить обновления</span>
                    </button>
                    <button data-settings-action="fullFactoryReset"
                        class="text-rbi-caption font-bold text-danger bg-danger-soft px-4 py-2 rounded-lg hover:bg-danger-soft border border-danger-soft transition-colors uppercase shadow-sm" data-i18n="settings.body.feedback.factory_reset">⚠️ Полный сброс (Удалить всё)</button>
                </div>

                <div class="text-center text-rbi-caption text-[var(--text-muted)] pb-10">
                    <button data-settings-action="showAboutApp"
                        class="font-bold text-brand mb-2 flex items-center justify-center gap-1 mx-auto"><svg
                            class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round"
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg> <span data-i18n="settings.body.feedback.about">О платформе</span></button><br>
                    <span class="font-black text-muted tracking-wide">RBI Platform</span><br>
                    <span data-i18n="settings.body.feedback.about_tagline">Construction OS · ОС управления строительством</span><br>
                    Developed by Igor Kondratiev
                </div>
            </div>
            <div id="settings-panel-company" data-settings-panel="company" hidden></div>
            <div id="settings-panel-platform-admin" data-settings-panel="platform-admin" hidden></div>
            <div id="settings-panel-admin" data-settings-panel="admin" class="space-y-3" hidden>
                <p class="text-rbi-caption text-[var(--text-muted)] leading-snug px-1" data-i18n="settings.admin.intro">
                    Единая админка платформы: справочники, очереди заявок, команда и права.
                    Объекты — SoT в «Объекты и планы»; инженеры привязываются к UUID этих объектов.
                </p>

                <!-- СПРАВОЧНИК ЛОКАЦИЙ / ПЛАНОВ -->
                <details id="location-directory-section"
                    class="bg-[var(--card-bg)] border border-teal-200 dark:border-teal-800 rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3 hidden">
                    <summary
                        class="p-4 font-black text-rbi-body text-teal-700 dark:text-teal-400 uppercase tracking-tight cursor-pointer flex justify-between items-center bg-teal-50 dark:bg-teal-900/20 transition-colors select-none group-open:border-b border-teal-200 dark:border-teal-800 rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.locations">Объекты и планы</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-teal-400">▼</span>
                    </summary>
                    <div id="location-directory-root"></div>
                </details>

                <!-- ОЧЕРЕДЬ ЗАЯВОК НА ОБЪЕКТЫ -->
                <details id="admin-object-requests-section"
                    class="bg-[var(--card-bg)] border border-orange-200 dark:border-orange-800 rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3">
                    <summary
                        class="p-4 font-black text-rbi-body text-orange-700 dark:text-orange-400 uppercase tracking-tight cursor-pointer flex justify-between items-center bg-orange-50 dark:bg-orange-900/20 transition-colors select-none group-open:border-b border-orange-200 dark:border-orange-800 rounded-2xl group-open:rounded-b-none">
                        <span data-i18n="settings.accordion.object_requests">Заявки на объекты</span>
                        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); (window.RBI&&window.RBI.services&&window.RBI.services.objects&&window.RBI.services.objects.loadRequests());"
                            class="bg-surface text-orange-600 border border-orange-200 dark:border-orange-700 px-3 py-1.5 rounded-lg text-rbi-caption font-black uppercase active:scale-95 shadow-sm" data-i18n="settings.action.refresh">Обновить</button>
                    </summary>
                    <div id="obj-requests-list" class="p-3 max-h-[40vh] overflow-y-auto custom-scrollbar bg-[var(--hover-bg)] rounded-b-2xl">
                        <div class="text-center py-4 text-xs text-[var(--text-muted)]" data-i18n="settings.admin.loading">Загрузка...</div>
                    </div>
                </details>

                <!-- СПРАВОЧНИК ПОДРЯДЧИКОВ -->
                <details id="contractor-directory-section"
                    class="bg-[var(--card-bg)] border border-brand-soft rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3 hidden">
                    <summary
                        class="p-4 font-black text-rbi-body text-brand uppercase tracking-tight cursor-pointer flex justify-between items-center bg-brand-soft transition-colors select-none group-open:border-b border-brand-soft rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.contractors">Справочник подрядчиков</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-brand">▼</span>
                    </summary>
                    <div id="contractor-directory-root"></div>
                </details>

                <!-- ОЧЕРЕДЬ ЗАЯВОК НА ПОДРЯДЧИКОВ -->
                <details id="admin-contractor-requests-section"
                    class="bg-[var(--card-bg)] border border-yellow-200 dark:border-yellow-800 rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3">
                    <summary
                        class="p-4 font-black text-rbi-body text-yellow-700 dark:text-yellow-400 uppercase tracking-tight cursor-pointer flex justify-between items-center bg-yellow-50 dark:bg-yellow-900/20 transition-colors select-none group-open:border-b border-yellow-200 dark:border-yellow-800 rounded-2xl group-open:rounded-b-none">
                        <span data-i18n="settings.accordion.contractor_requests">Заявки на подрядчиков</span>
                        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); if (typeof gameLoadContractorRequests === 'function') gameLoadContractorRequests();"
                            class="bg-surface text-yellow-600 border border-yellow-200 dark:border-yellow-700 px-3 py-1.5 rounded-lg text-rbi-caption font-black uppercase active:scale-95 shadow-sm" data-i18n="settings.action.refresh">Обновить</button>
                    </summary>
                    <div id="manager-contractor-requests-list" class="p-3 max-h-[40vh] overflow-y-auto custom-scrollbar bg-[var(--hover-bg)] rounded-b-2xl">
                        <div class="text-center py-4 text-xs text-[var(--text-muted)]" data-i18n="settings.admin.loading">Загрузка...</div>
                    </div>
                </details>

                <!-- КОМАНДА -->
                <details id="admin-team-section"
                    class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3">
                    <summary
                        class="p-4 font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight cursor-pointer flex justify-between items-center bg-surface transition-colors select-none group-open:border-b border-[var(--card-border)] rounded-2xl group-open:rounded-b-none">
                        <span data-i18n="settings.accordion.team">Команда (доступы и объекты)</span>
                        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); if (typeof gameLoadRoles === 'function') gameLoadRoles();"
                            class="bg-surface text-brand border border-[var(--card-border)] px-3 py-1.5 rounded-lg text-rbi-caption font-black uppercase active:scale-95 shadow-sm" data-i18n="settings.action.refresh">Обновить</button>
                    </summary>
                    <div class="p-3 bg-[var(--hover-bg)] rounded-b-2xl space-y-3">
                        <details class="group/sub [&_summary::-webkit-details-marker]:hidden">
                            <summary class="text-rbi-caption font-black uppercase text-orange-500 mb-2 cursor-pointer flex justify-between items-center select-none bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg border border-orange-100 dark:border-orange-800">
                                <span data-i18n="settings.accordion.access_requests">Заявки на доступ</span>
                                <span class="text-orange-400">▼</span>
                            </summary>
                            <div id="manager-access-requests-list" class="space-y-2">
                                <div class="text-center py-4 text-xs text-[var(--text-muted)]" data-i18n="settings.admin.loading">Загрузка...</div>
                            </div>
                        </details>
                        <details class="group/sub [&_summary::-webkit-details-marker]:hidden">
                            <summary class="text-rbi-caption font-black uppercase text-muted mb-2 cursor-pointer flex justify-between items-center select-none bg-surface p-2 rounded-lg border border-surface">
                                <span data-i18n="settings.accordion.active_users">Активные пользователи</span>
                                <span class="text-muted">▼</span>
                            </summary>
                            <div id="manager-team-list" class="space-y-2">
                                <div class="text-center py-4 text-xs text-[var(--text-muted)]" data-i18n="settings.admin.loading">Загрузка...</div>
                            </div>
                        </details>
                        <div id="manager-roles-list" class="hidden"></div>
                    </div>
                </details>

                <!-- РОЛИ И ПРАВА -->
                <details id="settings-role-matrix-section"
                    class="bg-[var(--card-bg)] border border-brand-soft rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3 hidden">
                    <summary
                        class="p-4 font-black text-rbi-body text-brand uppercase tracking-tight cursor-pointer flex justify-between items-center bg-brand-soft transition-colors select-none group-open:border-b border-brand-soft rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.roles">Роли и права</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-brand">▼</span>
                    </summary>
                    <div id="settings-role-matrix-root"></div>
                </details>

                <!-- ОБЛАКО: HARD-DELETE soft-deleted -->
                <details id="cloud-deleted-purge-section"
                    class="bg-[var(--card-bg)] border border-rose-200 dark:border-rose-800 rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3 hidden">
                    <summary
                        class="p-4 font-black text-rbi-body text-rose-800 dark:text-rose-300 uppercase tracking-tight cursor-pointer flex justify-between items-center bg-rose-50 dark:bg-rose-900/20 transition-colors select-none group-open:border-b border-rose-200 dark:border-rose-800 rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.cloud_deleted">Облако · удалённые</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-rose-400">▼</span>
                    </summary>
                    <div id="cloud-deleted-purge-root"></div>
                </details>

                <!-- ОБЛАКО: битые Storage URL у живых записей -->
                <details id="cloud-orphan-urls-section"
                    class="bg-[var(--card-bg)] border border-amber-200 dark:border-amber-800 rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3 hidden">
                    <summary
                        class="p-4 font-black text-rbi-body text-amber-800 dark:text-amber-300 uppercase tracking-tight cursor-pointer flex justify-between items-center bg-amber-50 dark:bg-amber-900/20 transition-colors select-none group-open:border-b border-amber-200 dark:border-amber-800 rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.cloud_orphan">Облако · битые ссылки</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-amber-400">▼</span>
                    </summary>
                    <div id="cloud-orphan-urls-root"></div>
                </details>

                <!-- МИГРАЦИЯ ДАННЫХ -->
                <details id="contractor-id-backfill-section"
                    class="bg-[var(--card-bg)] border border-amber-200 dark:border-amber-800 rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3 hidden">
                    <summary
                        class="p-4 font-black text-rbi-body text-amber-800 dark:text-amber-300 uppercase tracking-tight cursor-pointer flex justify-between items-center bg-amber-50 dark:bg-amber-900/20 transition-colors select-none group-open:border-b border-amber-200 dark:border-amber-800 rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.migration">Миграция данных</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-amber-400">▼</span>
                    </summary>
                    <div id="contractor-id-backfill-root"></div>
                    <div id="project-id-backfill-root" class="border-t border-amber-200 dark:border-amber-800"></div>
                </details>

                <!-- РЕДАКТОР СИСТЕМНЫХ ЧЕК-ЛИСТОВ: ОФИЦИАЛЬНЫЕ ВЕРСИИ (Блок 1) -->
                <details id="settings-official-templates-section"
                    class="bg-[var(--card-bg)] border border-amber-200 dark:border-amber-800 rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3 hidden">
                    <summary
                        class="p-4 font-black text-rbi-body text-amber-700 dark:text-amber-400 uppercase tracking-tight cursor-pointer flex justify-between items-center bg-amber-50 dark:bg-amber-900/20 transition-colors select-none group-open:border-b border-amber-200 dark:border-amber-800 rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.official_templates">Официальные версии чек-листов</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-amber-400">▼</span>
                    </summary>
                    <div class="p-3">
                        <p class="text-rbi-caption text-[var(--text-muted)] leading-relaxed mb-2" data-i18n="settings.official_templates.intro">
                            Назначьте команде официальную (изменённую компанией) версию системного вида работ — синхронизируется на все устройства.
                        </p>
                        <div id="settings-official-templates-root"></div>
                    </div>
                </details>
            </div>
            <div id="settings-panel-quality" data-settings-panel="quality" class="space-y-3" hidden>
                <!-- БАЗА ЗНАНИЙ -->
                <details
                    class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                    <summary
                        class="p-4 font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight cursor-pointer flex justify-between items-center bg-surface transition-colors select-none group-open:border-b border-[var(--card-border)] rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                            </svg>
                            <span data-i18n="settings.accordion.knowledge">База знаний</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-muted">▼</span>
                    </summary>
                    <div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.knowledge.twi">TWI</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.knowledge.view_hint">Карточки или список</div>
                            </div>
                            <select id="set-kb-view-twi" class="input-base w-36"
                                data-settings-action="toggleSetting" data-settings-action-key="knowledgeViewModeTwi" data-settings-action-val-type="element" data-action-event="change">
                                <option value="cards" data-i18n="settings.opt.view.cards">Карточки</option>
                                <option value="list" data-i18n="settings.opt.view.list">Список</option>
                            </select>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.knowledge.docs">Нормативы (НД)</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.knowledge.view_hint">Карточки или список</div>
                            </div>
                            <select id="set-kb-view-docs" class="input-base w-36"
                                data-settings-action="toggleSetting" data-settings-action-key="knowledgeViewModeDocs" data-settings-action-val-type="element" data-action-event="change">
                                <option value="cards" data-i18n="settings.opt.view.cards">Карточки</option>
                                <option value="list" data-i18n="settings.opt.view.list">Список</option>
                            </select>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.knowledge.nodes">Узлы</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.knowledge.view_hint">Карточки или список</div>
                            </div>
                            <select id="set-kb-view-nodes" class="input-base w-36"
                                data-settings-action="toggleSetting" data-settings-action-key="knowledgeViewModeNodes" data-settings-action-val-type="element" data-action-event="change">
                                <option value="cards" data-i18n="settings.opt.view.cards">Карточки</option>
                                <option value="list" data-i18n="settings.opt.view.list">Список</option>
                            </select>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.knowledge.practices">Практики</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.knowledge.view_hint">Карточки или список</div>
                            </div>
                            <select id="set-kb-view-practices" class="input-base w-36"
                                data-settings-action="toggleSetting" data-settings-action-key="knowledgeViewModePractices" data-settings-action-val-type="element" data-action-event="change">
                                <option value="cards" data-i18n="settings.opt.view.cards">Карточки</option>
                                <option value="list" data-i18n="settings.opt.view.list">Список</option>
                            </select>
                        </div>
                        <div class="p-4 flex justify-between items-center rounded-b-2xl">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.knowledge.reports">Отчёты</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.knowledge.view_hint">Карточки или список</div>
                            </div>
                            <select id="set-kb-view-reports" class="input-base w-36"
                                data-settings-action="toggleSetting" data-settings-action-key="knowledgeViewModeReports" data-settings-action-val-type="element" data-action-event="change">
                                <option value="cards" data-i18n="settings.opt.view.cards">Карточки</option>
                                <option value="list" data-i18n="settings.opt.view.list">Список</option>
                            </select>
                        </div>
                    </div>
                </details>

                <!-- ОТОБРАЖЕНИЕ АРХИВОВ (Совещания / FMEA) -->
                <details
                    class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                    <summary
                        class="p-4 font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight cursor-pointer flex justify-between items-center bg-surface transition-colors select-none group-open:border-b border-[var(--card-border)] rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M4 6h16M4 10h16M4 14h10M4 18h10"></path>
                            </svg>
                            <span data-i18n="settings.accordion.archives">Отображение архивов</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-muted">▼</span>
                    </summary>
                    <div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center gap-3">
                            <div class="min-w-0">
                                <div class="font-bold text-sm" data-i18n="settings.body.archives.meetings">Совещания</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.archives.view_hint">Карточки или список по умолчанию</div>
                            </div>
                            <select id="set-kb-view-meetings" class="input-base w-36 shrink-0"
                                data-settings-action="toggleSetting" data-settings-action-key="knowledgeViewModeMeetings" data-settings-action-val-type="element" data-action-event="change">
                                <option value="cards" data-i18n="settings.opt.view.cards">Карточки</option>
                                <option value="list" data-i18n="settings.opt.view.list">Список</option>
                            </select>
                        </div>
                        <div class="p-4 flex justify-between items-center gap-3 rounded-b-2xl">
                            <div class="min-w-0">
                                <div class="font-bold text-sm" data-i18n="settings.body.archives.fmea">FMEA</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.archives.view_hint">Карточки или список по умолчанию</div>
                            </div>
                            <select id="set-kb-view-fmea" class="input-base w-36 shrink-0"
                                data-settings-action="toggleSetting" data-settings-action-key="knowledgeViewModeFmea" data-settings-action-val-type="element" data-action-event="change">
                                <option value="cards" data-i18n="settings.opt.view.cards">Карточки</option>
                                <option value="list" data-i18n="settings.opt.view.list">Список</option>
                            </select>
                        </div>
                    </div>
                </details>

                <!-- АНАЛИТИКА И ОТЧЕТЫ -->
                <details
                    class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                    <summary
                        class="p-4 font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight cursor-pointer flex justify-between items-center bg-surface transition-colors select-none group-open:border-b border-[var(--card-border)] rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.analytics_viz">Визуализация Аналитики</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-muted">▼</span>
                    </summary>
                    <div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.analytics_viz.ai">AI-Анализ (Детализация)</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.analytics_viz.ai_hint">Отображать смарт-заключение</div>
                            </div>
                            <label class="toggle-switch"><input type="checkbox" id="set-ana-ai"
                                    data-settings-action="toggleSetting" data-settings-action-key="anaEngAi" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.analytics_viz.photos">Галереи фото (Детализация)</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.analytics_viz.photos_hint">Ленты эталонов и брака</div>
                            </div>
                            <label class="toggle-switch"><input type="checkbox" id="set-ana-photos"
                                    data-settings-action="toggleSetting" data-settings-action-key="anaEngPhotos" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.analytics_viz.pareto">Графики Парето</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.analytics_viz.pareto_hint">Причины брака и структура</div>
                            </div>
                            <label class="toggle-switch"><input type="checkbox" id="set-ana-pareto"
                                    data-settings-action="toggleSetting" data-settings-action-key="anaEngPareto" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.analytics_viz.top5">Топ-5 Дефектов (Сводка)</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.analytics_viz.top5_hint">Антирейтинг нарушений B2 и B3</div>
                            </div>
                            <label class="toggle-switch"><input type="checkbox" id="set-ana-top"
                                    data-settings-action="toggleSetting" data-settings-action-key="anaOpTopDefects" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.analytics_viz.trend">Тренд объекта (Сводка)</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.analytics_viz.trend_hint">Глобальный график УрК</div>
                            </div>
                            <label class="toggle-switch"><input type="checkbox" id="set-ana-trend"
                                    data-settings-action="toggleSetting" data-settings-action-key="anaOpTrend" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                        <div class="p-4 flex justify-between items-center">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.analytics_viz.leaders">Лидеры / Аутсайдеры (Сводка)</div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.analytics_viz.leaders_hint">Блоки зон риска и качества</div>
                            </div>
                            <label class="toggle-switch"><input type="checkbox" id="set-ana-leader"
                                    data-settings-action="toggleSetting" data-settings-action-key="anaOpLeader" data-settings-action-val-type="element" data-action-event="change"><span
                                    class="toggle-slider"></span></label>
                        </div>
                    </div>
                </details>

                <!-- РАСПИСАНИЕ ЗАДАЧ -->
                <details
                    class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3">
                    <summary
                        class="p-4 font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight cursor-pointer flex justify-between items-center bg-surface transition-colors select-none group-open:border-b border-[var(--card-border)] rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z">
                                </path>
                            </svg>
                            <span data-i18n="settings.accordion.schedule">Расписание рутинных задач</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-muted">▼</span>
                    </summary>
                    <div>
                        <div
                            class="p-4 border-b border-[var(--card-border)] flex justify-between items-center bg-[var(--hover-bg)]">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.schedule.meeting">Совещание (Мемо)</div>
                            </div>
                            <select id="set-task-meeting" class="input-base w-32"
                                data-settings-action="toggleSetting" data-settings-action-key="taskMeetingDay" data-settings-action-val-type="element" data-action-event="change">
                                <option value="1" data-i18n="settings.opt.weekday.1">Понедельник</option>
                                <option value="2" data-i18n="settings.opt.weekday.2">Вторник</option>
                                <option value="3" data-i18n="settings.opt.weekday.3">Среда</option>
                                <option value="4" data-i18n="settings.opt.weekday.4">Четверг</option>
                                <option value="5" data-i18n="settings.opt.weekday.5">Пятница</option>
                            </select>
                        </div>
                        <div
                            class="p-4 border-b border-[var(--card-border)] flex justify-between items-center bg-[var(--hover-bg)]">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.schedule.fmea">FMEA и Плакаты</div>
                            </div>
                            <select id="set-task-fmea" class="input-base w-32"
                                data-settings-action="toggleSetting" data-settings-action-key="taskFmeaDay" data-settings-action-val-type="element" data-action-event="change">
                                <option value="1" data-i18n="settings.opt.weekday.1">Понедельник</option>
                                <option value="4" data-i18n="settings.opt.weekday.4">Четверг</option>
                                <option value="5" data-i18n="settings.opt.weekday.5">Пятница</option>
                            </select>
                        </div>
                        <div class="p-4 flex justify-between items-center bg-[var(--hover-bg)] rounded-b-2xl">
                            <div>
                                <div class="font-bold text-sm" data-i18n="settings.body.schedule.monthly">Ежемесячный отчет</div>
                            </div>
                            <select id="set-task-month" class="input-base w-32"
                                data-settings-action="toggleSetting" data-settings-action-key="taskMonthReportDay" data-settings-action-val-type="element" data-action-event="change">
                                <option value="1" data-i18n="settings.opt.monthday.1">1-е число</option>
                                <option value="5" data-i18n="settings.opt.monthday.5">5-е число</option>
                                <option value="10" data-i18n="settings.opt.monthday.10">10-е число</option>
                            </select>
                        </div>
                    </div>
                </details>

                <!-- АВТО-ОТЧЕТЫ (Качество) -->
                <details
                    class="bg-[var(--card-bg)] border border-brand-soft rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden mb-3">
                    <summary
                        class="p-4 font-black text-rbi-body text-brand uppercase tracking-tight cursor-pointer flex justify-between items-center bg-brand-soft transition-colors select-none group-open:border-b border-brand-soft rounded-2xl group-open:rounded-b-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            <span data-i18n="settings.accordion.auto_reports">Авто-отчеты (PRO)</span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 text-brand">▼</span>
                    </summary>
                        <div class="p-4 bg-[var(--hover-bg)] rounded-b-2xl">
                            <div class="flex justify-between items-center mb-3">
                                <div>
                                    <div class="font-bold text-sm text-brand" data-i18n="settings.body.auto_reports.enable">Фоновые отчеты</div>
                                    <div class="text-rbi-caption text-[var(--text-muted)] mt-1" data-i18n="settings.body.auto_reports.enable_hint">Авто-генерация без зависаний</div>
                                </div>
                                <label class="toggle-switch"><input type="checkbox" id="set-auto-report"
                                        data-settings-action="toggleSetting" data-settings-action-key="autoReportEnabled" data-settings-action-val-type="element" data-action-event="change"><span
                                        class="toggle-slider"></span></label>
                            </div>
                            <div class="grid grid-cols-2 gap-3 mt-3">
                                <div>
                                    <div class="text-rbi-caption font-bold text-muted uppercase mb-1" data-i18n="settings.body.auto_reports.day">День месяца</div>
                                    <input type="number" id="set-auto-report-day" class="input-base text-center !py-2"
                                        min="1" max="28" data-settings-action="toggleSetting" data-settings-action-key="autoReportDay" data-settings-action-val-type="element" data-action-event="change">
                                </div>
                                <div>
                                    <div class="text-rbi-caption font-bold text-muted uppercase mb-1" data-i18n="settings.body.auto_reports.type">Тип отчета</div>
                                    <select id="set-auto-report-type" class="input-base !py-2 text-rbi-label"
                                        data-settings-action="toggleSetting" data-settings-action-key="autoReportType" data-settings-action-val-type="element" data-action-event="change">
                                        <option value="global_onepager" data-i18n="settings.opt.report.company">По Компании</option>
                                        <option value="onepager" data-i18n="settings.opt.report.objects">По Объектам</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                </details>

                <!-- КНОПКА КОНСТРУКТОРА PDF (Качество) -->
                <div class="bg-[var(--card-bg)] border border-brand-soft rounded-2xl shadow-sm mb-3 overflow-hidden">
                    <!-- НОВАЯ КНОПКА: КОНСТРУКТОР ШАБЛОНОВ -->
                    <div
                        class="p-4 flex justify-between items-center bg-brand-soft">
                        <div>
                            <div class="font-bold text-sm text-brand" data-i18n="settings.body.auto_reports.pdf_templates">Шаблоны отчетов (PDF)</div>
                            <div class="text-rbi-caption text-brand mt-1" data-i18n="settings.body.auto_reports.pdf_templates_hint">Настройка блоков и дизайна</div>
                        </div>

                        <button data-reports-action="openPdfTemplateModal"
                            class="bg-brand text-white px-4 py-2 rounded-lg text-rbi-caption font-black uppercase active:scale-95 shadow-md flex items-center gap-1.5">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                                </path>
                            </svg> <span data-i18n="settings.body.auto_reports.configure">Настроить</span>
                        </button>
                    </div>

                </div>
            </div>
            <div id="settings-panel-construction" data-settings-panel="construction" class="space-y-3" hidden>
                <!-- СТРОЙКОНТРОЛЬ: пока нет отдельных настроек -->
                <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm p-5 mb-3">
                    <div class="font-black text-rbi-body text-ink dark:text-white uppercase tracking-tight mb-2" data-i18n="settings.construction.empty_title">Стройконтроль</div>
                    <p class="text-rbi-body text-[var(--text-muted)] leading-relaxed mb-4" data-i18n="settings.construction.empty_body">
                        Отдельных настроек модуля стройконтроля пока нет. Справочник объектов и планов — общий для платформы.
                    </p>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" data-settings-subsection-goto="admin"
                            class="text-rbi-caption font-black uppercase tracking-widest text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 px-3 py-2 rounded-lg active:scale-95 transition-transform" data-i18n="settings.construction.goto_locations">
                            Объекты и планы →
                        </button>
                        <a href="#/construction-v2"
                            class="text-rbi-caption font-black uppercase tracking-widest text-brand bg-brand-soft border border-brand-soft px-3 py-2 rounded-lg active:scale-95 transition-transform" data-i18n="settings.construction.open_module">
                            Открыть стройконтроль
                        </a>
                    </div>
                </div>
            </div>
            </div>
            </div>
            <!-- === КОНСТРУКТОР PDF-ШАБЛОНОВ (PRO) === -->
            <div id="pdf-template-modal"
                class="fixed inset-0 bg-surface z-[7000] hidden items-start justify-center p-2 sm:p-4 backdrop-blur-sm overflow-y-auto"
                data-reports-action="closePdfTemplateModal">
                <div class="bg-[var(--bg-main)] w-full max-w-3xl mt-4 mb-10 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--card-border)]"
                    onclick="event.stopPropagation()">

                    <!-- Шапка -->
                    <div
                        class="p-4 bg-brand border-b border-brand flex justify-between items-center sticky top-0 z-20 shadow-md">
                        <h3 class="font-black text-rbi-title uppercase tracking-tight text-white flex items-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                            </svg>
                            <span data-i18n="settings.pdf.title">Конструктор PDF отчетов</span>
                        </h3>
                        <button data-reports-action="closePdfTemplateModal"
                            class="w-8 h-8 bg-brand rounded-full flex items-center justify-center text-white shadow-sm border border-brand active:scale-90 transition-transform">✕</button>
                    </div>

                    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">

                        <!-- Список сохраненных шаблонов -->
                        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 shadow-sm">
                            <div class="flex justify-between items-center mb-3">
                                <div class="text-rbi-label font-black uppercase text-muted" data-i18n="settings.pdf.your_templates">Ваши шаблоны</div>
                                <button data-reports-action="createNewPdfTemplate"
                                    class="text-rbi-caption font-bold bg-brand-soft text-brand border border-brand-soft px-3 py-1.5 rounded-lg active:scale-95 transition-colors" data-i18n="settings.pdf.create_new">+
                                    Создать новый</button>
                            </div>
                            <div id="pdf-templates-list"
                                class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                <!-- Список рендерится через JS -->
                            </div>
                        </div>

                        <!-- Редактор (Изначально скрыт) -->
                        <div id="pdf-template-editor"
                            class="hidden space-y-4 border-t border-[var(--card-border)] pt-4">
                            <div class="text-rbi-body font-black uppercase text-brand" data-i18n="settings.pdf.editor_title">Настройка
                                шаблона</div>

                            <!-- Базовые настройки -->
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label
                                        class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block" data-i18n="settings.pdf.name_label">Название
                                        шаблона *</label>
                                    <input type="text" id="pdf-tmpl-name" class="input-base"
                                        placeholder="Например: Стандартный One-Pager" data-i18n="settings.pdf.name_ph" data-i18n-attr="placeholder">
                                </div>
                                <div>
                                    <label
                                        class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block" data-i18n="settings.pdf.type_label">Тип
                                        отчета</label>
                                    <select id="pdf-tmpl-type" class="input-base">
                                        <option value="onepager" data-i18n="settings.pdf.type_onepager">Сводка по Объекту</option>
                                        <option value="global_onepager" data-i18n="settings.pdf.type_global">Глобальная сводка Компании</option>
                                    </select>
                                </div>
                            </div>

                            <!-- Дизайн -->
                            <div
                                class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[var(--hover-bg)] p-3 rounded-xl border border-[var(--card-border)]">
                                <div>
                                    <label
                                        class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block" data-i18n="settings.pdf.columns">Колонки</label>
                                    <select id="pdf-tmpl-layout" class="input-base text-rbi-label !py-1.5">
                                        <option value="two_uneven" data-i18n="settings.pdf.layout_uneven">Две (40% / 60%)</option>
                                        <option value="two_even" data-i18n="settings.pdf.layout_even">Две (50% / 50%)</option>
                                        <option value="one" data-i18n="settings.pdf.layout_one">Одна колонка (100%)</option>
                                    </select>
                                </div>
                                <div class="flex flex-col justify-center">
                                    <label class="flex items-center gap-2 cursor-pointer mt-3">
                                        <input type="checkbox" id="pdf-tmpl-logo"
                                            class="w-4 h-4 accent-indigo-600 rounded">
                                        <span
                                            class="text-rbi-label font-bold text-ink" data-i18n="settings.pdf.show_logo">Показывать
                                            логотип</span>
                                    </label>
                                </div>
                                <div class="flex flex-col justify-center">
                                    <label class="flex items-center gap-2 cursor-pointer mt-3">
                                        <input type="checkbox" id="pdf-tmpl-qr"
                                            class="w-4 h-4 accent-indigo-600 rounded" checked>
                                        <span class="text-rbi-label font-bold text-ink" data-i18n="settings.pdf.insert_qr">Вставить
                                            QR-код</span>
                                    </label>
                                </div>
                            </div>

                            <!-- Текст в подвале -->
                            <div>
                                <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block" data-i18n="settings.pdf.footer_label">Текст
                                    в подвале (Footer)</label>
                                <input type="text" id="pdf-tmpl-footer" class="input-base text-rbi-label"
                                    placeholder="Например: Конфиденциально. Только для внутреннего использования." data-i18n="settings.pdf.footer_ph" data-i18n-attr="placeholder">
                            </div>

                            <!-- DRAG AND DROP БЛОКИ -->
                            <div
                                class="text-rbi-caption text-muted bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-100 dark:border-blue-800 leading-snug" data-i18n="settings.pdf.dnd_hint">
                                💡 Перетаскивайте блоки из левой колонки в правую, чтобы добавить их в отчет.
                                Выстраивайте нужный порядок.
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <!-- Доступные блоки -->
                                <div
                                    class="bg-surface p-3 rounded-xl border border-dashed border-surface flex flex-col h-64">
                                    <div class="text-rbi-caption font-black uppercase text-muted mb-2 text-center" data-i18n="settings.pdf.hidden_blocks">
                                        Скрытые блоки</div>
                                    <div id="pdf-blocks-available"
                                        class="flex-1 overflow-y-auto space-y-2 custom-scrollbar p-1 min-h-[50px]">
                                        <!-- Рендерится через JS -->
                                    </div>
                                </div>

                                <!-- Активные блоки -->
                                <div
                                    class="bg-brand-soft p-3 rounded-xl border border-brand-soft flex flex-col h-64 shadow-inner">
                                    <div class="text-rbi-caption font-black uppercase text-brand mb-2 text-center" data-i18n="settings.pdf.active_blocks">
                                        Активные (В отчете)</div>
                                    <div id="pdf-blocks-active"
                                        class="flex-1 overflow-y-auto space-y-2 custom-scrollbar p-1 min-h-[50px]">
                                        <!-- Рендерится через JS -->
                                    </div>
                                </div>
                            </div>

                            <!-- Сохранение -->
                            <div class="flex gap-2 pt-4 border-t border-[var(--card-border)]">
                                <button data-reports-action="cancelPdfTemplateEdit"
                                    class="flex-1 bg-surface text-muted py-3.5 rounded-xl font-bold text-rbi-label uppercase shadow-sm active:scale-95 border border-[var(--card-border)]" data-i18n="settings.pdf.cancel">Отмена</button>
                                <button data-reports-action="savePdfTemplate"
                                    class="flex-[2] bg-brand text-white py-3.5 rounded-xl font-black text-rbi-label uppercase shadow-md active:scale-95 flex justify-center items-center gap-2">💾
                                    <span data-i18n="settings.pdf.save">Сохранить шаблон</span></button>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
`;
    }
};

window.SettingsRender = SettingsRender;

// =========================================================================
// МОНТАЖ РАЗМЕТКИ ВКЛАДКИ «НАСТРОЙКИ» (перенос из index.html:445-1529, Блок
// 4/N инициативы «Перенос статичной разметки quality в JS-рендер»). По
// прецеденту Блоков 1/N-3/N — на верхнем уровне модуля, до
// DOMContentLoaded. Grep подтвердил отсутствие top-level bootstrap:*-
// подписок в файлах фичи — тайминг здесь не критичен, но паттерн
// сохранён для консистентности.
// =========================================================================
(function mountSettingsMarkup() {
    if (typeof window.rbiEnsureTabMarkup === 'function') {
        window.rbiEnsureTabMarkup('tab-settings', function () {
            return SettingsRender.renderMarkup();
        }, '#settings-subnav');
        return;
    }
    if (document.getElementById('tab-settings')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getContentRoot()
        : document.getElementById('app-content');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', SettingsRender.renderMarkup());
}());

window.ensureSettingsMarkup = function () {
    if (typeof window.rbiEnsureTabMarkup === 'function') {
        return window.rbiEnsureTabMarkup('tab-settings', function () {
            return SettingsRender.renderMarkup();
        }, '#settings-subnav');
    }
    return !!document.getElementById('tab-settings');
};

console.log('[SettingsRender] settings.render.js markup mounted');

(function () {
    'use strict';

    // Фаза 141 (копия из settings.actions.js — см. комментарий в шапке файла):
    // единая точка чтения настроек через SettingsService или fallback.
    function _getSetting(key) {
        var svc = (SettingsActions._ctx && SettingsActions._ctx.settings) ||
                  (window.RBI && window.RBI.services && window.RBI.services.settings);
        if (svc) {
            return svc.get(key);
        }
        return window.appSettings ? window.appSettings[key] : undefined;
    }

    function _objects() {
        try {
            var ctx = SettingsActions._ctx;
            if (ctx && ctx.services && ctx.services.objects) return ctx.services.objects;
            if (ctx && ctx.objects) return ctx.objects;
        } catch (e) {}
        return (window.RBI && window.RBI.services && window.RBI.services.objects) || null;
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
    function _leftoverList() {
        var o = _objects();
        if (!o) return [];
        if (typeof o.leftoverList === 'function') {
            var l = o.leftoverList();
            return Array.isArray(l) ? l : [];
        }
        return Array.isArray(o.leftoverObjects) ? o.leftoverObjects : [];
    }

    /** Chrome Настроек (sticky title / reset / subnav / aria) — без remount панелей. */
    function _settingsT(key, fallback, vars) {
        try {
            var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
            if (i18n && typeof i18n.t === 'function') {
                var s = i18n.t(key, vars);
                if (s && s !== key) return s;
            }
        } catch (_e) { /* ignore */ }
        return fallback;
    }

    function _applySettingsChromeI18n() {
        var root = document.getElementById('tab-settings');
        if (!root) return;
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.applyDom === 'function') {
            i18n.applyDom(root);
        }
        if (window.__settingsDesktop && typeof window.__settingsDesktop.syncChrome === 'function') {
            try { window.__settingsDesktop.syncChrome(); } catch (_e) { /* ignore */ }
        }
    }

    function _fillCorpBrandingControls() {
        var brandControls = document.getElementById('corp-branding-controls');
        if (!brandControls) return;
        var _permSvc = (SettingsActions._ctx && SettingsActions._ctx.permissions) || window.RBI.services.permissions;
        var currentRole = _permSvc ? _permSvc.getCurrentRole() : 'guest';
        var isAdmin = _permSvc ? _permSvc.canManageHierarchy() : ['manager', 'deputy_manager', 'director'].includes(currentRole);
        var controlsHtml = '';

        if (isAdmin) {
            controlsHtml += '<div class="p-3 bg-brand-soft border border-brand-soft rounded-lg flex justify-between items-center mb-2 shadow-sm">' +
                '<div>' +
                '<div class="text-rbi-caption font-black text-brand uppercase">' +
                _settingsT('settings.body.branding.corp_team', 'Для всей команды') + '</div>' +
                '<div class="text-rbi-caption text-muted">' +
                _settingsT('settings.body.branding.corp_team_hint', 'Сделать стилем компании') + '</div>' +
                '</div>' +
                '<button onclick="window.publishCorporateBranding()" class="bg-brand text-white px-3 py-2 rounded-lg text-rbi-caption font-bold active:scale-95 shadow-md uppercase">' +
                _settingsT('settings.body.branding.corp_publish', 'Опубликовать') + '</button>' +
                '</div>';
        }

        if (_getSetting('isBrandingCustomized')) {
            controlsHtml += '<button onclick="window.resetToCorporateBranding()" class="w-full bg-surface text-muted border border-surface px-3 py-2.5 rounded-lg text-rbi-caption font-bold active:scale-95 shadow-sm uppercase flex items-center justify-center gap-2">' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>' +
                _settingsT('settings.body.branding.corp_reset', 'Вернуть корпоративный стиль') +
                '</button>';
        }

        brandControls.innerHTML = controlsHtml;
    }

    var SETTINGS_SUBSECTION_KEY = 'rbi.settings.subsection';
    var SETTINGS_SUBSECTIONS = ['platform', 'company', 'platform-admin', 'admin', 'quality', 'construction'];

    /** Platform 2.0: «Компания» (роли, сотрудники, журнал) — подраздел Настроек; виден, когда сервер подтвердил право (RBI.platformMenuAccess.company). */
    function _companyAllowed() {
        return !!(window.RBI && window.RBI.platformMenuAccess && window.RBI.platformMenuAccess.company === true);
    }
    /** P2-0013: «Администрирование платформы» — только администратору платформы (флаг по ответу сервера pf_my_platform; сервер проверяет каждый вызов). */
    function _platformAdminAllowed() {
        return !!(window.RBI && window.RBI.platformMenuAccess && window.RBI.platformMenuAccess.platformAdmin === true);
    }
    /** P2-0013: вошедшему почтой подразделы старого Quality (Админ, Качество, Стройконтроль) не показываются — они по старому входу. */
    function _legacyAllowed() {
        var sh = window.RBI && window.RBI.services && window.RBI.services.shell;
        return !(sh && typeof sh.platformEntryMode === 'function' && sh.platformEntryMode() === 'email');
    }
    function _subsectionAllowed(key) {
        if (key === 'company') return _companyAllowed();
        if (key === 'platform-admin') return _platformAdminAllowed();
        if (key === 'admin') return _legacyAllowed() || _isAdminGateOk();   // P2-0037: почта — по праву сервера (quality.manage)
        if (key === 'quality' || key === 'construction') {   // P2-0016: почта — если модуль включён у компании
            var sh = window.RBI && window.RBI.services && window.RBI.services.shell;
            return sh && typeof sh.legacyModuleAllowed === 'function' ? sh.legacyModuleAllowed(key) : _legacyAllowed();
        }
        return true;
    }
    function _syncCompanyTab() {
        var btn = document.getElementById('settings-subnav-company');
        if (btn) btn.hidden = !_companyAllowed();
        var pa = document.getElementById('settings-subnav-platform-admin');
        if (pa) pa.hidden = !_platformAdminAllowed();
        ['quality', 'construction'].forEach(function (k) {
            var b = document.querySelector('[data-settings-subsection="' + k + '"]');
            if (b) b.hidden = !_legacyAllowed();
        });
        var adm = document.getElementById('settings-subnav-admin');
        if (adm && !_legacyAllowed()) {
            adm.hidden = !_isAdminGateOk();
            adm.classList.toggle('hidden', adm.hidden);
            _syncAdminSectionsForEmail();
        }
        var cur = _getSettingsSubsection();
        var curPanel = document.getElementById('settings-panel-' + cur);
        if (curPanel && !curPanel.hidden && !_subsectionAllowed(cur)) _setSettingsSubsection('platform', { skipGate: true, fromRouter: true });
    }
    window.addEventListener('rbi:platform-access', _syncCompanyTab);
    window.addEventListener('rbi:quality-access', _syncCompanyTab);   // P2-0037: права компании в Качестве пришли / сменились

    /**
     * P2-0013: «Настройки → Платформа» — как вы вошли (до переноса «Качества» в Platform 2.0 это два разных входа и две админки):
     * почта — Platform 2.0 («План/Факт», «Админ платформы», «Компания»), «Выйти»; PIN — «Качество» / «Стройконтроль» («Админ Качества»),
     * «Войти по почте»; демо — «Войти».
     */
    function _syncP2Account() {
        var box = document.getElementById('settings-p2-account');
        if (!box) return;
        var p2 = window.RBI && window.RBI.platform2;
        var st = p2 && typeof p2.getState === 'function' ? p2.getState() : null;
        var mode = st ? st.mode : 'none';
        var on = mode === 'email' || mode === 'pin' || mode === 'demo';
        // класс, а не атрибут hidden: у блока раскладка flex, она перебивала hidden
        box.classList.toggle('hidden', !on);
        box.classList.toggle('flex', on);
        if (!on) return;
        var title = document.getElementById('settings-p2-account-title');
        var who = document.getElementById('settings-p2-account-who');
        var out = document.getElementById('settings-p2-signout');
        var login = document.getElementById('settings-p2-login');
        if (mode === 'email') {
            var cur = (st.companies || []).filter(function (c) { return c.id === st.companyId; })[0];
            var role = cur && cur.roles && cur.roles[0] ? cur.roles[0] : (st.isPlatformAdmin ? 'администратор платформы' : '');
            if (title) title.textContent = 'Вы вошли по почте — Platform 2.0';
            if (who) who.textContent = st.email + (cur ? ' \u00b7 ' + cur.name : '') + (role ? ' \u00b7 ' + role : '');
            if (typeof p2.renderCompanySwitch === 'function') p2.renderCompanySwitch(document.getElementById('settings-p2-company'));
        } else {
            var prof = document.getElementById('settings-p2-profile');
            if (prof) prof.replaceChildren();
            if (title) title.textContent = mode === 'pin' ? 'Вы вошли по PIN — «Качество» и «Стройконтроль»' : 'Вы смотрите без входа (демо)';
            if (who) who.textContent = mode === 'pin'
                ? '«План/Факт» и «Админ платформы» — при входе по почте. Админ «Качества» — подраздел «Админ Качества».'
                : 'Войдите, чтобы работать с данными.';
            var sw = document.querySelector('#settings-p2-company select');
            if (sw) sw.remove();
        }
        if (mode === 'email' && typeof p2.renderMyProfile === 'function') p2.renderMyProfile(document.getElementById('settings-p2-profile'));
        if (out) out.classList.toggle('hidden', mode !== 'email');
        if (login) {
            login.classList.toggle('hidden', mode === 'email');
            login.textContent = mode === 'pin' ? 'Войти по почте' : 'Войти';
        }
        if (out && !out.dataset.bound) {
            out.dataset.bound = '1';
            out.addEventListener('click', function () {
                var api = window.RBI && window.RBI.platform2;
                if (api && typeof api.signOut === 'function') api.signOut();
            });
        }
        if (login && !login.dataset.bound) {
            login.dataset.bound = '1';
            login.addEventListener('click', function () {
                var api = window.RBI && window.RBI.platform2;
                if (api && typeof api.showLogin === 'function') api.showLogin();
            });
        }
    }
    window.addEventListener('rbi:platform-access', _syncP2Account);
    /** P2-0031: модуль «ИИ-помощник» выключен у компании (вход по почте) — переключатель ИИ недоступен и выключен, пояснение вместо него. */
    function _syncAiCompanyOff() {
        var box = document.getElementById('set-ai-enabled');
        if (!box) return;
        var sh = window.RBI && window.RBI.services && window.RBI.services.shell;
        var off = !!(sh && typeof sh.legacyModuleAllowed === 'function' && !sh.legacyModuleAllowed('ai'));
        box.disabled = off;
        var note = document.getElementById('set-ai-company-off');
        if (note) note.classList.toggle('hidden', !off);
        box.checked = !!_getSetting('aiEnabled');
        var body = document.getElementById('ai-settings-body');
        if (body) body.style.display = _getSetting('aiEnabled') ? 'block' : 'none';
    }
    window.addEventListener('rbi:platform-access', _syncAiCompanyOff);
    /** «Администрирование платформы» — файл раздела скачивается только администратору платформы (js/dist/platform-admin/). */
    var _platformAdminBundle = null;
    function _mountPlatformAdminPanel(on) {
        var panel = document.getElementById('settings-panel-platform-admin');
        if (!panel) return;
        if (!on || !_platformAdminAllowed()) {
            if (_platformAdminBundle) _platformAdminBundle.then(function (m) { m.unmount(); }).catch(function () {});
            return;
        }
        if (!_platformAdminBundle) {
            _platformAdminBundle = import('../../dist/platform-admin/platform-admin.js').catch(function (e) { _platformAdminBundle = null; throw e; });
        }
        _platformAdminBundle.then(function (m) { if (_platformAdminAllowed() && panel.isConnected && !panel.hidden) m.mount(panel); })
            .catch(function (e) { console.error('[settings] администрирование платформы не загрузилось', e); });
    }
    function _mountCompanyPanel(on) {
        var host = window.RBI && window.RBI.platformPanels && window.RBI.platformPanels.company;
        var panel = document.getElementById('settings-panel-company');
        if (!host || !panel) return;
        if (on) host.mount(panel); else host.unmount();
    }

    function _normalizeSettingsSubsection(key) {
        if (key === 'directories') return 'admin';
        return key;
    }

    function _isAdminGateOk() {
        return typeof window.isAdminGateUnlocked === 'function'
            ? window.isAdminGateUnlocked()
            : false;
    }

    /**
     * P2-0037: «Админ Качества» при входе по почте — разделы по правам сервера (quality.my_access):
     * справочник объектов и заявки на объекты — quality.objects.manage / construction.objects.manage (033c: Админ, не Зам.);
     * «Команда» (→ «Компания → Сотрудники»), «Роли и права» (→ «Компания → Роли»), «Миграция данных» (разовые инструменты
     * старой базы) — при почте скрыты (решение владельца 25.10.2026, карточка P2-0037).
     */
    var ADMIN_EMAIL_OBJECTS_SECTIONS = ['location-directory-section', 'admin-object-requests-section'];
    var ADMIN_EMAIL_HIDDEN_SECTIONS = ['admin-team-section', 'settings-role-matrix-section', 'contractor-id-backfill-section'];
    function _syncAdminSectionsForEmail() {
        var has = typeof window.hasQualityServerAction === 'function' ? window.hasQualityServerAction : function () { return false; };
        var objects = has('quality.objects.manage') || has('construction.objects.manage');
        ADMIN_EMAIL_OBJECTS_SECTIONS.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.hidden = !objects;
        });
        ADMIN_EMAIL_HIDDEN_SECTIONS.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.hidden = true;
        });
    }

    function _canSeeAdminTab() {
        if (!_legacyAllowed()) return _isAdminGateOk();
        try {
            var p = (window.RBI && window.RBI.services && window.RBI.services.permissions) || null;
            if (!p) return true;
            if (typeof p.isAdmin === 'function' && p.isAdmin()) return true;
            if (typeof p.isLeadership === 'function' && p.isLeadership()) return true;
            if (typeof p.canManageHierarchy === 'function' && p.canManageHierarchy()) return true;
            return false;
        } catch (_e) {
            return true;
        }
    }

    function _mountAdminOpsContent() {
        var email = !_legacyAllowed();   // P2-0037: при почте — без «Команды», «Ролей и прав», «Миграции данных»
        if (email) _syncAdminSectionsForEmail();
        var od = _objects();
        if (od && typeof od.loadRequests === 'function') {
            od.loadRequests();
        }
        if (!email && typeof window.gameLoadRoles === 'function') {
            window.gameLoadRoles();
        }
        if (typeof window.gameLoadContractorRequests === 'function') {
            window.gameLoadContractorRequests();
        }
        if (typeof mountLocationDirectoryUI === 'function') {
            mountLocationDirectoryUI().catch(function () {});
        }
        if (typeof mountContractorDirectoryUI === 'function') {
            mountContractorDirectoryUI().catch(function () {});
        }
        if (!email && typeof mountContractorIdBackfillUI === 'function') {
            mountContractorIdBackfillUI().catch(function () {});
        }
        if (!email && typeof mountProjectIdBackfillUI === 'function') {
            try { mountProjectIdBackfillUI(); } catch (_e) { /* ignore */ }
        }
        if (typeof mountCloudDeletedPurgeUI === 'function') {
            try { mountCloudDeletedPurgeUI(); } catch (_e) { /* ignore */ }
        }
        if (typeof mountCloudOrphanUrlsUI === 'function') {
            try { mountCloudOrphanUrlsUI(); } catch (_e) { /* ignore */ }
        }
        if (!email && typeof mountRoleMatrixUI === 'function') {
            mountRoleMatrixUI().catch(function () {});
        }
    }

    function _getSettingsSubsection() {
        try {
            var v = _normalizeSettingsSubsection(sessionStorage.getItem(SETTINGS_SUBSECTION_KEY));
            if (SETTINGS_SUBSECTIONS.indexOf(v) !== -1) return v;
        } catch (e) { /* ignore */ }
        return 'platform';
    }

    function _setSettingsSubsection(key, opts) {
        opts = opts || {};
        key = _normalizeSettingsSubsection(key);
        if (SETTINGS_SUBSECTIONS.indexOf(key) === -1) key = 'platform';

        if (!_subsectionAllowed(key)) key = 'platform';

        if (key === 'admin' && !opts.skipGate) {
            if (!_isAdminGateOk()) {
                window._rbiAdminGatePending = 'settings-admin';
                if (typeof window.gameOpenManagerPanelAuth === 'function') {
                    window.gameOpenManagerPanelAuth();
                } else if (typeof gameOpenManagerPanelAuth === 'function') {
                    gameOpenManagerPanelAuth();
                } else {
                    if (typeof showToast === 'function') showToast('⚠️ Замок админки недоступен');
                }
                return;
            }
        }

        try { sessionStorage.setItem(SETTINGS_SUBSECTION_KEY, key); } catch (e) { /* ignore */ }
        var root = document.getElementById('tab-settings');
        if (!root) return;
        SETTINGS_SUBSECTIONS.forEach(function (id) {
            var panel = root.querySelector('[data-settings-panel="' + id + '"]');
            if (panel) panel.hidden = id !== key;
        });
        root.querySelectorAll('[data-settings-subsection]').forEach(function (btn) {
            var active = btn.getAttribute('data-settings-subsection') === key;
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
            btn.classList.toggle('bg-brand', active);
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('shadow-sm', active);
            btn.classList.toggle('bg-transparent', !active);
            btn.classList.toggle('text-muted', !active);
        });
        if (key === 'admin') {
            _mountAdminOpsContent();
        }
        _mountCompanyPanel(key === 'company');
        _mountPlatformAdminPanel(key === 'platform-admin');
        if (!opts.fromRouter && window.AppRouter && typeof window.AppRouter.navigateSub === 'function') {
            window.AppRouter.navigateSub('#/settings', key);
        }
    }

    window.setSettingsSubsection = _setSettingsSubsection;

    window.unlockSettingsAdminTab = function () {
        _setSettingsSubsection('admin', { skipGate: true });
    };

    window.openSettingsAdminTab = function () {
        if (window.AppRouter && typeof window.AppRouter.navigate === 'function') {
            window.AppRouter.navigate('#/settings/admin');
            return;
        }
        if (typeof window.switchTab === 'function') {
            try { window.switchTab('tab-settings'); } catch (_e) { /* ignore */ }
        } else if (window.location) {
            window.location.hash = '#/settings/admin';
        }
        setTimeout(function () {
            _setSettingsSubsection('admin', { fromRouter: true });
        }, 80);
    };

    function _bindSettingsSubsectionNav() {
        var root = document.getElementById('tab-settings');
        if (!root || root.dataset.subsectionNavBound === '1') return;
        root.dataset.subsectionNavBound = '1';
        root.addEventListener('click', function (ev) {
            var btn = ev.target.closest('[data-settings-subsection]');
            if (btn && root.contains(btn)) {
                ev.preventDefault();
                _setSettingsSubsection(btn.getAttribute('data-settings-subsection'));
                return;
            }
            var gotoBtn = ev.target.closest('[data-settings-subsection-goto]');
            if (gotoBtn && root.contains(gotoBtn)) {
                ev.preventDefault();
                _setSettingsSubsection(gotoBtn.getAttribute('data-settings-subsection-goto'));
            }
        });
    }

    function _renderSettingsTab() {
        _bindSettingsSubsectionNav();
        var adminBtn = document.getElementById('settings-subnav-admin');
        if (adminBtn) {
            adminBtn.classList.toggle('hidden', !_canSeeAdminTab());
        }
        var companyBtn = document.getElementById('settings-subnav-company');
        if (companyBtn) companyBtn.hidden = !_companyAllowed();
        _syncCompanyTab();
        _syncP2Account();
        var initial = null;
        if (window.AppRouter && typeof window.AppRouter.subTabIdFromPath === 'function') {
            var hash = window.location.hash || '';
            if (/#\/settings\//i.test(hash) || /#\/quality\/settings\//i.test(hash)) {
                initial = window.AppRouter.subTabIdFromPath(hash, '#/settings');
            }
        }
        if (!initial) initial = _getSettingsSubsection();
        if (initial === 'admin' && !_isAdminGateOk()) {
            initial = 'platform';
        }
        // fromRouter: true — только синхронизация панелей/тумблеров.
        // Иначе navigateSub('#/settings') уводит с Осмотра/Аналитики при
        // фоновом renderSettingsTab() из bootstrap (setTimeout после load).
        _setSettingsSubsection(initial, { skipGate: true, fromRouter: true });
        if (initial === 'admin') {
            _mountAdminOpsContent();
        }
        // 1. Базовые селекторы оформления
        if (document.getElementById('set-theme')) document.getElementById('set-theme').value = _getSetting('theme') || 'rbi-auto-v3';
        var localeSelect = document.getElementById('set-locale');
        if (localeSelect) {
            var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
            localeSelect.value = (i18n && typeof i18n.getLocale === 'function') ? i18n.getLocale() : 'ru';
            if (i18n && typeof i18n.applyDom === 'function') i18n.applyDom(localeSelect.parentElement || document);
            if (!localeSelect.dataset.i18nBound) {
                localeSelect.dataset.i18nBound = '1';
                localeSelect.addEventListener('change', function () {
                    if (window.SettingsActions && typeof window.SettingsActions.setAppLocale === 'function') {
                        window.SettingsActions.setAppLocale(localeSelect.value);
                    } else if (window.RBI && window.RBI.services && window.RBI.services.i18n &&
                        typeof window.RBI.services.i18n.setLocale === 'function') {
                        window.RBI.services.i18n.setLocale(localeSelect.value);
                    }
                });
            }
        }
        _applySettingsChromeI18n();
        if (document.getElementById('set-fontsize')) document.getElementById('set-fontsize').value = _getSetting('fontSize') || 'medium';
        if (document.getElementById('set-navpos')) document.getElementById('set-navpos').value = _getSetting('navPosition') || 'auto';
        if (document.getElementById('set-dashmode')) document.getElementById('set-dashmode').value = _getSetting('dashboardMode') || 'compact';
        if (document.getElementById('set-auto-collapse-filters')) {
            var acf = _getSetting('autoCollapseFilters');
            // Дефолт / неизвестное → manual (не auto)
            document.getElementById('set-auto-collapse-filters').value =
                (acf === true || acf === 'auto') ? 'auto' : 'manual';
        }
        var _kbViewGet = window.getKnowledgeViewMode;
        var _kbViewFallback = _getSetting('knowledgeViewMode') || 'cards';
        var _kbViewVal = function (scope, key) {
            if (typeof _kbViewGet === 'function') return _kbViewGet(scope);
            return _getSetting(key) || _kbViewFallback;
        };
        if (document.getElementById('set-kb-view-twi')) document.getElementById('set-kb-view-twi').value = _kbViewVal('twi', 'knowledgeViewModeTwi');
        if (document.getElementById('set-kb-view-docs')) document.getElementById('set-kb-view-docs').value = _kbViewVal('docs', 'knowledgeViewModeDocs');
        if (document.getElementById('set-kb-view-nodes')) document.getElementById('set-kb-view-nodes').value = _kbViewVal('nodes', 'knowledgeViewModeNodes');
        if (document.getElementById('set-kb-view-practices')) document.getElementById('set-kb-view-practices').value = _kbViewVal('practices', 'knowledgeViewModePractices');
        if (document.getElementById('set-kb-view-reports')) document.getElementById('set-kb-view-reports').value = _kbViewVal('reports', 'knowledgeViewModeReports');
        if (document.getElementById('set-kb-view-meetings')) document.getElementById('set-kb-view-meetings').value = _kbViewVal('meetings', 'knowledgeViewModeMeetings');
        if (document.getElementById('set-kb-view-fmea')) document.getElementById('set-kb-view-fmea').value = _kbViewVal('fmea', 'knowledgeViewModeFmea');

        // 2. Переключатели логики
        if (document.getElementById('set-swipe')) document.getElementById('set-swipe').checked = _getSetting('swipeEnabled');
        if (document.getElementById('set-collapse')) document.getElementById('set-collapse').checked = _getSetting('autoCollapseOk');
        if (document.getElementById('set-ui-motion')) document.getElementById('set-ui-motion').checked = _getSetting('uiMotionEnabled') !== false;
        if (document.getElementById('set-hard-overscroll')) document.getElementById('set-hard-overscroll').checked = !!_getSetting('hardOverscrollLock');
        if (document.getElementById('set-groups-col')) document.getElementById('set-groups-col').checked = _getSetting('defaultGroupsCollapsed');
        if (document.getElementById('set-fast')) document.getElementById('set-fast').checked = _getSetting('fastMode');

        if (document.getElementById('set-storage-auto-cleanup')) {
            document.getElementById('set-storage-auto-cleanup').checked = _getSetting('storageAutoCleanupEnabled') !== false;
        }
        if (document.getElementById('set-storage-cleanup-threshold')) {
            document.getElementById('set-storage-cleanup-threshold').value = String(_getSetting('storageCleanupThresholdPercent') || 80);
        }
        if (document.getElementById('set-storage-photo-ttl')) {
            document.getElementById('set-storage-photo-ttl').value = String(_getSetting('storageInspectionPhotoTtlDays') || 60);
        }
        if (document.getElementById('set-storage-report-ttl')) {
            document.getElementById('set-storage-report-ttl').value = String(_getSetting('storageReportTtlDays') || 30);
        }
        if (document.getElementById('set-storage-doc-ttl')) {
            document.getElementById('set-storage-doc-ttl').value = String(_getSetting('storageDocTtlDays') || _getSetting('storageKnowledgeFileTtlDays') || 60);
        }
        if (document.getElementById('set-storage-twi-node-ttl')) {
            document.getElementById('set-storage-twi-node-ttl').value = String(_getSetting('storageTwiTtlDays') || _getSetting('storageNodeTtlDays') || 90);
        }
        if (document.getElementById('set-storage-practice-ttl')) {
            document.getElementById('set-storage-practice-ttl').value = String(_getSetting('storagePracticeTtlDays') || 60);
        }

        // 3. Аналитика
        if (document.getElementById('set-ana-pareto')) document.getElementById('set-ana-pareto').checked = _getSetting('anaEngPareto');
        if (document.getElementById('set-ana-trend')) document.getElementById('set-ana-trend').checked = _getSetting('anaOpTrend');
        if (document.getElementById('set-ana-leader')) document.getElementById('set-ana-leader').checked = _getSetting('anaOpLeader');
        if (document.getElementById('set-ana-ai')) document.getElementById('set-ana-ai').checked = _getSetting('anaEngAi');
        if (document.getElementById('set-ana-photos')) document.getElementById('set-ana-photos').checked = _getSetting('anaEngPhotos');
        if (document.getElementById('set-ana-top')) document.getElementById('set-ana-top').checked = _getSetting('anaOpTopDefects');
        if (document.getElementById('set-task-meeting')) document.getElementById('set-task-meeting').value = _getSetting('taskMeetingDay') || '1';
        if (document.getElementById('set-task-fmea')) document.getElementById('set-task-fmea').value = _getSetting('taskFmeaDay') || '5';
        if (document.getElementById('set-task-month')) document.getElementById('set-task-month').value = _getSetting('taskMonthReportDay') || '1';

        // 3.5. AI-настройки
        if (document.getElementById('set-ai-enabled')) _syncAiCompanyOff();
        if (document.getElementById('set-ai-key')) document.getElementById('set-ai-key').value = _getSetting('apiKey') || '';

        var aiModes = document.getElementsByName('ai-mode');
        if (aiModes.length > 0) {
            // P2-0034: два способа — «по учётке» и «свой ключ»; старые «по роли» / «корпоративный пароль» → «по учётке»
            var isPersonal = _getSetting('aiAuthMode') === 'personal';
            aiModes[isPersonal ? 1 : 0].checked = true;
            document.getElementById('personal-key-field').classList.toggle('hidden', !isPersonal);
        }

        // 4. Автоматизация бэкапов
        if (document.getElementById('set-autocache')) document.getElementById('set-autocache').checked = _getSetting('autoCacheCloudFiles');
        if (document.getElementById('set-autobackup')) document.getElementById('set-autobackup').checked = _getSetting('autoBackupEnabled');
        if (document.getElementById('set-autobackup-day')) document.getElementById('set-autobackup-day').value = _getSetting('autoBackupDay') || '5';
        if (document.getElementById('set-autobackup-share')) document.getElementById('set-autobackup-share').checked = _getSetting('autoBackupShare');
        if (document.getElementById('set-automanager')) document.getElementById('set-automanager').checked = _getSetting('autoManagerEnabled');
        if (document.getElementById('set-automanager-day')) document.getElementById('set-automanager-day').value = _getSetting('autoManagerDay') || '5';

        // 5. Брендирование и Авто-отчёты
        if (document.getElementById('set-brand-color')) document.getElementById('set-brand-color').value = _getSetting('brandColor') || '#4f46e5';
        if (document.getElementById('set-auto-report')) document.getElementById('set-auto-report').checked = _getSetting('autoReportEnabled');
        if (document.getElementById('set-auto-report-day')) document.getElementById('set-auto-report-day').value = _getSetting('autoReportDay') || '1';
        if (document.getElementById('set-auto-report-type')) document.getElementById('set-auto-report-type').value = _getSetting('autoReportType') || 'global_onepager';

        var logoPreview = document.getElementById('brand-logo-preview');
        var logoImg = document.getElementById('brand-logo-img');
        if (logoPreview && logoImg) {
            var brandLogo = _getSetting('brandLogo');
            if (brandLogo) {
                logoPreview.classList.remove('hidden');
                _setBrandLogoImgSrc(logoImg, brandLogo);
            } else {
                logoPreview.classList.add('hidden');
                logoImg.removeAttribute('src');
                logoImg.removeAttribute('data-local-src');
                logoImg.removeAttribute('data-prefer-thumb');
            }
        }
        _updateHeaderBrandLogo();

        if (typeof window.renderSyncUI === 'function') window.renderSyncUI();
        if (typeof mountLocationDirectoryUI === 'function') {
            mountLocationDirectoryUI().catch(function (e) {
                console.warn('[settings] location-directory UI:', e);
            });
        }
        if (typeof mountContractorDirectoryUI === 'function') {
            mountContractorDirectoryUI().catch(function (e) {
                console.warn('[settings] contractor-directory UI:', e);
            });
        }
        if (typeof mountContractorIdBackfillUI === 'function') {
            mountContractorIdBackfillUI().catch(function (e) {
                console.warn('[settings] contractor-id-backfill UI:', e);
            });
        }
        if (typeof mountProjectIdBackfillUI === 'function') {
            try {
                mountProjectIdBackfillUI();
            } catch (e) {
                console.warn('[settings] project-id-backfill UI:', e);
            }
        }
        if (typeof mountCloudDeletedPurgeUI === 'function') {
            try {
                mountCloudDeletedPurgeUI();
            } catch (e) {
                console.warn('[settings] cloud-deleted-purge UI:', e);
            }
        }
        if (typeof mountCloudOrphanUrlsUI === 'function') {
            try {
                mountCloudOrphanUrlsUI();
            } catch (e) {
                console.warn('[settings] cloud-orphan-urls UI:', e);
            }
        }
        if (typeof mountRoleMatrixUI === 'function') {
            mountRoleMatrixUI().catch(function (e) {
                console.warn('[settings] role-matrix UI:', e);
            });
        }
        if (typeof mountOfficialTemplatesUI === 'function') {
            mountOfficialTemplatesUI().catch(function (e) {
                console.warn('[settings] official-templates UI:', e);
            });
        }

        var brandControls = document.getElementById('corp-branding-controls');
        if (brandControls) {
            _fillCorpBrandingControls();
        }
    }

    function _setBrandLogoImgSrc(imgEl, brandLogo) {
        if (!imgEl) return;
        imgEl.removeAttribute('data-local-src');
        imgEl.removeAttribute('data-prefer-thumb');
        var ref = String(brandLogo || '');
        // Логотип нельзя грузить через preferThumb: JPEG-thumb без белой подложки
        // запекает прозрачность PNG в чёрный фон.
        var needsHydrate = ref.indexOf('http') === 0
            || ref.indexOf('local://') === 0
            || ref.indexOf('cloud://') === 0;
        if (needsHydrate) {
            imgEl.src = window.rbiPhotoPlaceholder || '';
            imgEl.setAttribute('data-local-src', ref);
            if (typeof window.rbiHydrateLocalImages === 'function') {
                window.rbiHydrateLocalImages(imgEl.parentElement || imgEl);
            } else if (typeof PhotoManager !== 'undefined' && PhotoManager.getAsyncUrl) {
                PhotoManager.getAsyncUrl(ref).then(function (u) {
                    if (u) imgEl.src = u;
                });
            }
        } else {
            imgEl.src = ref;
        }
    }

    var _HEADER_ICON_SHIELD_CLS = 'w-9 h-9 bg-[var(--card-bg)] rounded-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] border border-[var(--card-border)] flex items-center justify-center shrink-0 overflow-hidden';
    // Та же цветовая логика, что превью в настройках: токены темы, без белой плашки
    var _HEADER_ICON_LOGO_CLS = 'h-9 w-auto max-w-[7.25rem] px-1.5 bg-[var(--card-bg)] rounded-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] border border-[var(--card-border)] flex items-center justify-center shrink-0 overflow-hidden';

    function _fitBrandLogoImg(logoImg, maxH, maxW) {
        if (!logoImg || !logoImg.naturalWidth || !logoImg.naturalHeight) return;
        var ratio = logoImg.naturalWidth / logoImg.naturalHeight;
        var w = Math.min(maxW, Math.max(28, Math.round(maxH * ratio)));
        var h = Math.min(maxH, Math.round(w / ratio));
        logoImg.style.height = h + 'px';
        logoImg.style.width = w + 'px';
        logoImg.style.maxWidth = maxW + 'px';
    }

    function _updateDeskBrandLogo(brandLogo) {
        var iconBox = document.getElementById('desk-brand-icon');
        var shield = document.getElementById('desk-brand-shield');
        var logoImg = document.getElementById('desk-brand-logo');
        if (!shield || !logoImg) return;
        if (brandLogo) {
            shield.classList.add('hidden');
            logoImg.classList.remove('hidden');
            if (iconBox) iconBox.classList.add('is-logo');
            var fit = function () { _fitBrandLogoImg(logoImg, 28, 108); };
            logoImg.onload = fit;
            _setBrandLogoImgSrc(logoImg, brandLogo);
            if (logoImg.complete && logoImg.naturalWidth) fit();
        } else {
            logoImg.classList.add('hidden');
            logoImg.removeAttribute('src');
            logoImg.removeAttribute('data-local-src');
            logoImg.removeAttribute('data-prefer-thumb');
            logoImg.removeAttribute('style');
            logoImg.onload = null;
            shield.classList.remove('hidden');
            if (iconBox) iconBox.classList.remove('is-logo');
        }
    }

    function _updateHeaderBrandLogo() {
        var iconBox = document.getElementById('header-brand-icon');
        var shield = document.getElementById('header-brand-shield');
        var logoImg = document.getElementById('header-brand-logo');
        var brandLogo = _getSetting('brandLogo');
        if (shield && logoImg) {
            if (brandLogo) {
                shield.classList.add('hidden');
                logoImg.classList.remove('hidden');
                logoImg.className = 'object-contain';
                if (iconBox) iconBox.className = _HEADER_ICON_LOGO_CLS;
                var fit = function () { _fitBrandLogoImg(logoImg, 28, 108); };
                logoImg.onload = fit;
                _setBrandLogoImgSrc(logoImg, brandLogo);
                if (logoImg.complete && logoImg.naturalWidth) fit();
            } else {
                logoImg.classList.add('hidden');
                logoImg.removeAttribute('src');
                logoImg.removeAttribute('data-local-src');
                logoImg.removeAttribute('data-prefer-thumb');
                logoImg.removeAttribute('style');
                logoImg.onload = null;
                logoImg.className = 'hidden h-7 w-auto max-w-[6.75rem] object-contain';
                shield.classList.remove('hidden');
                if (iconBox) iconBox.className = _HEADER_ICON_SHIELD_CLS;
            }
        }
        // ПК slim topbar — тот же логотип компании
        _updateDeskBrandLogo(brandLogo);
    }

    function _applySettingsToUI() {
        var theme = _getSetting('theme') || 'rbi-auto-v3';
        var prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

        if (theme === 'auto') {
            theme = prefersDark ? 'dark' : 'light';
        } else if (theme === 'rbi-auto') {
            theme = prefersDark ? 'rbi-dark' : 'rbi-light';
        } else if (theme === 'rbi-auto-v2') {
            theme = prefersDark ? 'rbi-dark-v2' : 'rbi-light-v2';
        } else if (theme === 'rbi-auto-v3') {
            theme = prefersDark ? 'rbi-dark-v3' : 'rbi-light-v3';
        }

        if (!['light', 'dark', 'rbi-light', 'rbi-dark', 'rbi-light-v2', 'rbi-dark-v2', 'rbi-light-v3', 'rbi-dark-v3'].includes(theme)) {
            theme = 'light';
        }

        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.remove('light', 'dark', 'rbi-light', 'rbi-dark', 'rbi-light-v2', 'rbi-dark-v2', 'rbi-light-v3', 'rbi-dark-v3');
        document.documentElement.classList.add(theme);

        if (theme === 'dark' || theme === 'rbi-dark' || theme === 'rbi-dark-v2' || theme === 'rbi-dark-v3') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
        } else {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
        }

        if (_getSetting('fastMode')) document.body.classList.add('fast-mode');
        else document.body.classList.remove('fast-mode');

        if (typeof window.rbiApplyUiMotionSetting === 'function') window.rbiApplyUiMotionSetting();
        else document.body.classList.toggle('ui-motion-off', _getSetting('uiMotionEnabled') === false);

        if (typeof window.rbiApplyHardOverscrollLock === 'function') window.rbiApplyHardOverscrollLock();
        else {
            var hol = !!_getSetting('hardOverscrollLock');
            document.documentElement.classList.toggle('hard-overscroll-lock', hol);
            document.body.classList.toggle('hard-overscroll-lock', hol);
        }

        document.documentElement.classList.remove('font-small', 'font-medium', 'font-large', 'font-xlarge');
        document.body.classList.remove('font-small', 'font-medium', 'font-large', 'font-xlarge');
        var fontSizeClass = 'font-' + (_getSetting('fontSize') || 'medium');
        document.documentElement.classList.add(fontSizeClass);
        document.body.classList.add(fontSizeClass);

        document.body.classList.remove('nav-pos-auto', 'nav-pos-top', 'nav-pos-bottom');
        document.body.classList.add('nav-pos-' + (_getSetting('navPosition') || 'auto'));

        var dash = document.getElementById('header-dashboard');
        var dashExp = document.getElementById('dash-expanded-view');
        var dashIcon = document.getElementById('dash-expand-icon');

        if (_getSetting('dashboardMode') === 'hidden') {
            if (dash) dash.style.display = 'none';
        } else if (_getSetting('dashboardMode') === 'expanded') {
            if (dash) dash.style.display = 'block';
            if (dashExp) dashExp.classList.remove('hidden');
            if (dashIcon) dashIcon.style.display = 'none';
        } else {
            if (dash) dash.style.display = 'block';
            if (dashExp) dashExp.classList.add('hidden');
            if (dashIcon) dashIcon.style.display = 'flex';
        }

        _updateHeaderBrandLogo();

        setTimeout(function () {
            if (typeof window.updateBodyPadding === 'function') window.updateBodyPadding();
        }, 150);

        var activeTab = document.querySelector('.view-section.active');
        if (activeTab && typeof window.updateFabButton === 'function') window.updateFabButton(activeTab.id);

        var aiBody = document.getElementById('ai-settings-body');
        if (aiBody) aiBody.style.display = _getSetting('aiEnabled') ? 'block' : 'none';

        var personalKeyBlock = document.getElementById('personal-key-field');
        if (personalKeyBlock) {
            if (_getSetting('aiAuthMode') === 'personal') personalKeyBlock.classList.remove('hidden');
            else personalKeyBlock.classList.add('hidden');
        }

        var _permSvc2 = (SettingsActions._ctx && SettingsActions._ctx.permissions) || window.RBI.services.permissions;
        if (typeof _permSvc2 !== 'undefined') _permSvc2.applyUIConstraints();
        var odInit = _objects();
        if (odInit && typeof odInit.initUI === 'function') {
            // C2b: initUI для suggestions/заявок; плоский OD CRUD скрыт в renderManagerPanel
            odInit.initUI();
        }

        var themeSelect = document.getElementById('set-theme');
        if (themeSelect && themeSelect.value !== (_getSetting('theme') || 'rbi-auto-v3')) {
            themeSelect.value = _getSetting('theme') || 'rbi-auto-v3';
        }
    }

    window.renderSettingsTab = _renderSettingsTab;
    window.applySettingsToUI = _applySettingsToUI;
    window.updateHeaderBrandLogo = _updateHeaderBrandLogo;

    // i18n — обновление chrome Настроек без remount панелей
    if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
        window.RBI.events.on('i18n:localeChanged', function () {
            try { _applySettingsChromeI18n(); } catch (_e) { /* ignore */ }
            try {
                if (typeof window.renderSyncUI === 'function') window.renderSyncUI();
            } catch (_e2) { /* ignore */ }
            try { _fillCorpBrandingControls(); } catch (_e3) { /* ignore */ }
            try {
                if (_getSettingsSubsection() === 'admin') _mountAdminOpsContent();
            } catch (_e4) { /* ignore */ }
        });
    }

    // auto / rbi-auto / rbi-auto-v2 / rbi-auto-v3 — следим за системной светлой/тёмной
    if (window.matchMedia) {
        try {
            var _schemeMq = window.matchMedia('(prefers-color-scheme: dark)');
            var _onSchemeChange = function () {
                var t = _getSetting('theme') || 'rbi-auto-v3';
                if (t === 'auto' || t === 'rbi-auto' || t === 'rbi-auto-v2' || t === 'rbi-auto-v3') {
                    _applySettingsToUI();
                }
            };
            if (typeof _schemeMq.addEventListener === 'function') {
                _schemeMq.addEventListener('change', _onSchemeChange);
            } else if (typeof _schemeMq.addListener === 'function') {
                _schemeMq.addListener(_onSchemeChange);
            }
        } catch (_eScheme) { /* ignore */ }
    }

    console.log('[settings.render.js] window-proxies installed (renderSettingsTab, applySettingsToUI)');

}());
