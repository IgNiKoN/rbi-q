/* Файл: js/services/sync/sync-ui.render.js — перенесено из js/sync.js без изменения логики */
function _syncUiT(key, fallback, vars) {
    try {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var s = i18n.t(key, vars);
            if (s && s !== key) return s;
        }
    } catch (_e) { /* ignore */ }
    if (vars && typeof fallback === 'string') {
        return fallback.replace(/\{(\w+)\}/g, function (_, name) {
            return vars[name] != null ? String(vars[name]) : '{' + name + '}';
        });
    }
    return fallback;
}

window.renderSyncUI = function () {
    const container = document.getElementById('sync-settings-block');
    const headerIndicator = document.getElementById('header-sync-status');
    const deskIndicator = document.getElementById('desk-sync-status');
    const syncTargets = [headerIndicator, deskIndicator].filter(Boolean);
    const _t = _syncUiT;

    syncTargets.forEach(function (el) {
        el.ondblclick = () => {
            if (window.syncConfig.enabled && window.syncConfig.projectCode) {
                window.forceSyncObjects();
            }
        };
    });
    if (syncTargets.length) {
        const cloudSvg = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 18H7a4 4 0 1 1 1-7.9A5 5 0 0 1 19 10a4 4 0 0 1 0 8z"/>
    </svg>`;

        const loadingSvg = `
    <svg width="14" height="14" viewBox="0 0 24 24" class="animate-spin" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" opacity="0.2"/>
        <path d="M21 12a9 9 0 0 1-9 9"/>
    </svg>`;

        let html;
        if (window.syncConfig.enabled) {
            if (window.isSyncing) {
                html = `<div class="text-indigo-500 flex items-center justify-center">${loadingSvg}</div>`;
            } else {
                html = `<div class="text-green-500 flex items-center justify-center">${cloudSvg}</div>`;
            }
        } else {
            html = `<div class="text-slate-400 flex items-center justify-center">${cloudSvg}</div>`;
        }
        syncTargets.forEach(function (el) { el.innerHTML = html; });
    }

    if (!container) return;

    // P2-0016: вход почтой — облако = хранилище компании; вместо формы PIN — компания, объект из «Объектов», синхронизация.
    const qs = window.RBI && window.RBI.qualitySync;
    if (qs) {
        const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const opts = qs.projects.map((p) => `<option value="${esc(p.id)}" ${p.id === qs.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
        container.innerHTML = `
            <div class="p-4 border-b border-[var(--card-border)] bg-[var(--card-bg)] space-y-3" data-testid="quality-company-sync">
                <div class="text-[11px] text-[var(--text-muted)]">${_t('settings.sync.company', 'Компания')}: <b class="text-[var(--text-main)]">${esc(qs.companyName)}</b> · ${esc(qs.email)}</div>
                <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase block">${_t('settings.sync.object', 'Объект')}
                    <select id="quality-sync-project" class="input-base mt-1" data-testid="quality-sync-project">
                        ${qs.projectId ? '' : `<option value="" selected disabled>${_t('settings.sync.object_choose', 'Выберите объект')}</option>`}${opts}
                    </select>
                </label>
                ${qs.projects.length ? '' : `<div class="text-[11px] text-[var(--text-muted)]">${_t('settings.sync.no_objects', 'Объектов нет — их заводит администратор компании в «Справочники → Объекты».')}</div>`}
            </div>
            ${qs.projectId ? `<div class="p-4 bg-[var(--hover-bg)]">
                <button onclick="window.triggerSync('manual')" class="w-full bg-[var(--card-bg)] text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 py-3 rounded-xl font-bold text-[11px] uppercase shadow-sm active:scale-95 flex items-center justify-center gap-2 transition-colors hover:border-indigo-400">${_t('settings.sync.now', 'Синхронизировать')}</button>
            </div>` : ''}
        `;
        const sel = container.querySelector('#quality-sync-project');
        if (sel) sel.addEventListener('change', () => { void qs.selectProject(sel.value).then(() => window.renderSyncUI()); });
        return;
    }

    let engName = window.syncConfig.engineerName || (typeof appSettings !== 'undefined' ? appSettings.engineerName : '');

    if (window.syncConfig.enabled) {
        // Отрисовка "Моих объектов"
        const myProjects = (typeof appSettings !== 'undefined' && Array.isArray(appSettings.assignedProjects)) ? appSettings.assignedProjects : [];
        const pendingProjects = (typeof appSettings !== 'undefined' && Array.isArray(appSettings.pendingAssignedProjects)) ? appSettings.pendingAssignedProjects : [];
        // Объекты, на снятие которых уже отправлена заявка администратору
        // (см. window.removeAssignedProject — самостоятельное снятие запрещено,
        // current_plan.md §8) — показываем как «заявка на снятие», не даём
        // повторно нажать ✕.
        const pendingUnassign = (typeof appSettings !== 'undefined' && Array.isArray(appSettings.pendingUnassignProjects)) ? appSettings.pendingUnassignProjects : [];
        // Убираем из "Ожидающих" те объекты, которые уже есть в "Подтвержденных"
        const filteredPending = pendingProjects.filter(p => {
            const refs = [p.canonical_key, p.raw_name, p.display_name, p.id, p.projectId]
                .map(function (x) { return String(x || '').trim(); })
                .filter(Boolean);
            if (refs.some(function (r) { return myProjects.includes(r); })) return false;
            if (typeof ObjectDirectory !== 'undefined'
                && typeof ObjectDirectory.resolveProjectId === 'function') {
                const pendingId = ObjectDirectory.resolveProjectId(
                    p.id || p.projectId || p.canonical_key || p.raw_name || p.display_name
                );
                if (pendingId && myProjects.includes(pendingId)) return false;
            }
            return true;
        });
        let projectsHtml = '';

        if (myProjects.length === 0 && pendingProjects.length === 0) {
            projectsHtml = '<div class="text-[10px] text-slate-400 italic text-center mb-2 border border-dashed border-slate-300 rounded p-2">' +
                _t('settings.sync.projects_empty', 'Объекты не добавлены. Шапка осмотра разблокирована для ручного ввода.') +
                '</div>';
        } else {
            // Рисуем зеленые (Подтвержденные)
            projectsHtml += myProjects.map(p => {
                const unassignPending = pendingUnassign.includes(p)
                    || (typeof ObjectDirectory !== 'undefined'
                        && typeof ObjectDirectory.resolveProjectId === 'function'
                        && pendingUnassign.some(function (u) {
                            return ObjectDirectory.resolveProjectId(u) === ObjectDirectory.resolveProjectId(p)
                                || String(u) === String(p);
                        }));
                const displayName = (typeof ObjectDirectory !== 'undefined'
                    && typeof ObjectDirectory.getDisplayForAssignedRef === 'function')
                    ? ObjectDirectory.getDisplayForAssignedRef(p)
                    : String(p || '');
                const safeDisplay = String(displayName)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `
                <div class="flex justify-between items-center bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-2 rounded-lg mb-1.5 shadow-sm">
                    <div>
                        <div class="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">${safeDisplay}</div>
                        <div class="text-[8px] font-black uppercase ${unassignPending ? 'text-orange-600' : 'text-green-600'}">${unassignPending ? _t('settings.sync.unassign_pending', 'Заявка на снятие отправлена') : _t('settings.sync.confirmed', 'Подтверждён')}</div>
                    </div>
                    ${unassignPending
                        ? ''
                        : `<button onclick="window.removeAssignedProject('${String(p).replace(/'/g, "\\'")}')" class="text-red-500 font-black text-[12px] px-2 active:scale-90">✕</button>`}
                </div>
            `;
            }).join('');

            // Рисуем оранжевые (В ожидании)
            projectsHtml += filteredPending.map(p => `
                <div class="flex justify-between items-center bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-2 rounded-lg mb-1.5 shadow-sm">
                    <div>
                        <div class="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">${p.display_name || p.raw_name}</div>
                        <div class="text-[8px] font-black uppercase text-orange-600">${_t('settings.sync.pending_confirm', 'Ожидает подтверждения')}</div>
                    </div>
                </div>
            `).join('');
        }
        // --- НОВОЕ: Готовим блок выбора режима синхронизации в зависимости от роли ---
        const currentRole = window.RBI.services.permissions ? window.RBI.services.permissions.getCurrentRole() : 'guest';
        const isManagerRole = window.RBI.services.permissions ? window.RBI.services.permissions.isLeadership() : ['director', 'project_manager', 'deputy_manager', 'manager'].includes(currentRole);
        const cloudStatus = window.RBI.services.permissions ? window.RBI.services.permissions.getCloudStatus() : (appSettings?.cloudStatus || 'pending');

        const roleLabels = {
            guest: _t('settings.sync.role.guest', 'Гость'),
            contractor: _t('settings.sync.role.contractor', 'Подрядчик'),
            engineer: _t('settings.sync.role.engineer', 'Инженер'),
            project_manager: _t('settings.sync.role.project_manager', 'Руководитель проекта'),
            deputy_manager: _t('settings.sync.role.deputy_manager', 'Заместитель руководителя'),
            director: _t('settings.sync.role.director', 'Директор'),
            manager: _t('settings.sync.role.manager', 'Администратор')
        };

        let syncStatusTitle = _t('settings.sync.status.active_title', 'Синхронизация активна');
        let syncStatusText = _t('settings.sync.status.active_text', 'Данные могут синхронизироваться согласно вашей роли.');
        let syncStatusClass = 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400';

        if (cloudStatus === 'pending') {
            syncStatusTitle = _t('settings.sync.status.pending_title', 'Ожидает подтверждения');
            syncStatusText = _t('settings.sync.status.pending_text', 'Администратор должен подтвердить вашу роль и закрепить объекты. До подтверждения данные не отправляются в облако.');
            syncStatusClass = 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/50 text-yellow-700 dark:text-yellow-400';
        }

        if (cloudStatus === 'blocked') {
            syncStatusTitle = _t('settings.sync.status.blocked_title', 'Доступ ограничен');
            syncStatusText = _t('settings.sync.status.blocked_text', 'Отправка данных в облако недоступна. Новые данные сохраняются локально.');
            syncStatusClass = 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400';
        }

        if (cloudStatus === 'offline') {
            syncStatusTitle = _t('settings.sync.status.offline_title', 'Локальный режим');
            syncStatusText = _t('settings.sync.status.offline_text', 'Данные сохраняются только на устройстве.');
            syncStatusClass = 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800/50 text-slate-600 dark:text-slate-400';
        }

        const modeFullLabel = _t('settings.sync.mode_full', 'Вся команда');
        const modePersonalLabel = _t('settings.sync.mode_personal', 'Только мои');
        const dataExchangeLabel = _t('settings.sync.data_exchange', 'Обмен данными');
        const managerPanelLabel = _t('settings.chrome.manager_panel', 'Панель Руководителя');

        let syncModeHtml = '';
        if (isManagerRole) {
            syncModeHtml = `
            <button onclick="gameOpenManagerPanelAuth()" class="w-full bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border-b border-[var(--card-border)] py-3 font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-colors hover:bg-orange-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg> 
                ${managerPanelLabel}
                <span id="admin-badge-count" class="hidden bg-orange-500 text-white px-1.5 py-0.5 rounded-full text-[8px] animate-pulse shadow-sm ml-1"></span>
            </button>
            <div class="p-3 bg-[var(--card-bg)] border-b border-[var(--card-border)] flex justify-between items-center">
                <div>
                    <div class="font-bold text-[11px] uppercase text-slate-700 dark:text-slate-300">${dataExchangeLabel}</div>
                    <div class="text-[9px] text-indigo-500 mt-1 font-bold">${_t('settings.sync.auto_selected', 'Выбран автоматически')}</div>
                </div>
                <div class="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-200">
                    ${modeFullLabel}
                </div>
            </div>`;

            // Запускаем асинхронный подсчет заявок НАПРЯМУЮ из облака
            setTimeout(async () => {
                let totalReqs = 0;
                try {
                    if (window.supabaseClient) {
                        const pCode = window.syncConfig?.projectCode || 'RBI';

                        // 1. Считаем заявки на подрядчиков (статус pending)
                        const { count: contrCount } = await window.supabaseClient
                            .from('contractor_normalization_queue')
                            .select('*', { count: 'exact', head: true })
                            .eq('project_code', pCode)
                            .eq('status', 'pending');
                        if (contrCount) totalReqs += contrCount;

                        // 2. Считаем заявки на объекты из ПК СК (статус pending)
                        const { count: objCount } = await window.supabaseClient
                            .from('object_normalization_queue')
                            .select('*', { count: 'exact', head: true })
                            .eq('project_code', pCode)
                            .eq('status', 'pending');
                        if (objCount) totalReqs += objCount;

                        // 3. Считаем заявки на доступы от инженеров
                        const { data: profiles } = await window.supabaseClient
                            .from('rbi_engineer_profiles')
                            .select('cloud_status, settings')
                            .eq('project_code', pCode);

                        if (profiles) {
                            profiles.forEach(p => {
                                if (p.cloud_status === 'pending') {
                                    totalReqs++; // Заявка на доступ в систему
                                } else if (p.settings && Array.isArray(p.settings.requestedProjects)) {
                                    totalReqs += p.settings.requestedProjects.length; // Заявки на объекты
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.warn('[Sync] Ошибка подсчета заявок для бейджа', e);
                }

                // Отрисовываем бейдж
                const badge = document.getElementById('admin-badge-count');
                if (badge) {
                    if (totalReqs > 0) {
                        badge.innerText = `+${totalReqs}`;
                        badge.classList.remove('hidden');
                    } else {
                        badge.classList.add('hidden');
                    }
                }
            }, 500);
        } else {
            // Инженерам оставляем выпадающий список
            const modeLabel = window.syncConfig.syncMode === 'full' ? modeFullLabel : modePersonalLabel;
            syncModeHtml = `
            <div class="p-3 bg-[var(--card-bg)] border-b border-[var(--card-border)] flex justify-between items-center">
                <div>
                    <div class="font-bold text-[11px] uppercase text-slate-700 dark:text-slate-300 cursor-pointer" ondblclick="window.resetFullAccess()">${_t('settings.sync.data_exchange_mode', 'Обмен данными: {mode}', { mode: modeLabel })}</div>
                </div>
                <select id="sync-mode-select" class="input-base !w-auto !py-1.5 !text-[10px] font-bold" onchange="window.changeSyncMode(this.value)">
                    <option value="personal" ${window.syncConfig.syncMode === 'personal' ? 'selected' : ''}>${modePersonalLabel}</option>
                    <option value="full" ${window.syncConfig.syncMode === 'full' ? 'selected' : ''}>${modeFullLabel}</option>
                </select>
            </div>`;
        }
        // -----------------------------------------------------------------------------
        const syncBtnLabel = cloudStatus === 'pending'
            ? ('🔎 ' + _t('settings.sync.check_status', 'Проверить статус'))
            : (' ' + _t('settings.sync.sync_now', 'Синхронизировать сейчас'));
        container.innerHTML = `
            <div class="p-4 ${syncStatusClass} border-b text-center">
            <div class="text-[12px] font-black uppercase mb-1">${syncStatusTitle}</div>
            <div class="text-[10px] font-bold leading-snug max-w-sm mx-auto">${syncStatusText}</div>
             <div class="mt-3 grid grid-cols-1 gap-1 text-[10px] font-bold">
            <div>${_t('settings.sync.user_line', 'Пользователь: {name}', { name: window.syncConfig.engineerName })}</div>
        <div>${_t('settings.sync.company_code_line', 'Код компании: {code}', { code: window.syncConfig.projectCode })}</div>
        <div class="font-black uppercase">${_t('settings.sync.role_line', 'Роль: {role}', { role: roleLabels[currentRole] || currentRole })}</div>
        <div class="font-black uppercase">${_t('settings.sync.status_line', 'Статус: {status}', { status: cloudStatus })}</div>
    </div>
</div>
            
            <div class="p-4 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
                <h3 class="text-[11px] font-black uppercase text-indigo-700 dark:text-indigo-400 mb-2 flex items-center gap-1.5">🏢 ${_t('settings.sync.my_projects_title', 'Мои Объекты (Справочник)')}</h3>
                <div class="text-[10px] text-slate-500 mb-3 leading-snug">${_t('settings.sync.my_projects_hint', 'Добавьте объекты, на которых вы работаете. Они появятся в выпадающем списке в шапке осмотра.')}</div>
                
                ${projectsHtml}
                
                <div class="flex gap-2 mt-2 relative">
                    <input type="text" id="new-assigned-project" class="input-base text-[11px] !py-2" placeholder="${_t('settings.sync.project_ph', 'Название (или выберите из списка)...')}" autocomplete="off"
                        onfocus="document.getElementById('dd_new-assigned-project').classList.remove('hidden')"
                        oninput="
                            const val = this.value.toLowerCase();
                            const items = document.querySelectorAll('.dd-obj-item');
                            let hasVisible = false;
                            items.forEach(el => {
                                if(el.innerText.toLowerCase().includes(val)) { el.style.display = 'block'; hasVisible = true; }
                                else { el.style.display = 'none'; }
                            });
                            const dd = document.getElementById('dd_new-assigned-project');
                            if(hasVisible) dd.classList.remove('hidden'); else dd.classList.add('hidden');
                        "
                        onblur="setTimeout(() => { const dd = document.getElementById('dd_new-assigned-project'); if(dd) dd.classList.add('hidden'); }, 200)">
                    
                    <div id="dd_new-assigned-project" class="absolute top-full left-0 w-[calc(100%-80px)] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl mt-1 z-[5000] hidden max-h-48 overflow-y-auto custom-scrollbar text-left">
                        ${(typeof ObjectDirectory !== 'undefined' ? ObjectDirectory.objects : []).map(o => `
                            <div class="dd-obj-item p-3 text-[12px] font-bold border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors text-slate-800 dark:text-slate-200"
                                onmousedown="
                                    const inp = document.getElementById('new-assigned-project');
                                    inp.value = '${o.display_name.replace(/'/g, "\\'")}';
                                    inp.dataset.canonical = '${o.canonical_key}';
                                    document.getElementById('dd_new-assigned-project').classList.add('hidden');
                                ">
                                ${o.display_name}
                            </div>
                        `).join('')}
                    </div>

                    <button onclick="window.addAssignedProject()" class="bg-indigo-600 text-white px-3 py-2 rounded-lg font-bold text-[10px] uppercase shadow-sm active:scale-95 shrink-0 z-10">${_t('settings.sync.add', 'Добавить')}</button>
                </div>
            </div>

            ${syncModeHtml}

            <div class="p-4 bg-[var(--hover-bg)]">
                <button onclick="window.triggerSync('manual')" class="w-full bg-[var(--card-bg)] text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 py-3 rounded-xl font-bold text-[11px] uppercase shadow-sm active:scale-95 mb-2 flex items-center justify-center gap-2 transition-colors hover:border-indigo-400">
    ${syncBtnLabel}
</button>
                <button onclick="window.disconnectSync()" class="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 py-3 rounded-xl font-bold text-[11px] uppercase shadow-sm active:scale-95 transition-colors">${_t('settings.sync.disconnect', 'Отключить облако')}</button>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="p-4 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
                <div class="space-y-3">
                    <div>
                        <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">${_t('settings.sync.form.name_label', 'Имя (Фамилия И.О.) *')}</label>
                        <input type="text" id="sync-name" class="input-base" value="${engName}" ${engName ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">${_t('settings.sync.form.code_label', 'Код компании *')}</label>
                        <input type="text" id="sync-code" class="input-base" placeholder="${_t('settings.sync.form.code_ph', 'Например: RBI-COMPANY')}">
                    </div>
                    <form onsubmit="event.preventDefault();">
                        <!-- ВСТАВКА: Скрытый логин -->
                        <input type="text" autocomplete="username" style="display:none;" value="admin">
                        
                        <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">${_t('settings.sync.form.pin_label', 'ПИН-код (Опционально)')}</label>
                        <input type="password" id="sync-pin" autocomplete="new-password" class="input-base" placeholder="${_t('settings.sync.form.pin_ph', '4 цифры')}" maxlength="4" inputmode="numeric">
                    </form>
                </div>
            </div>
            <div class="p-4 bg-[var(--hover-bg)]">
                <button onclick="window.initCloudConnection(this)" class="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-black text-[11px] uppercase shadow-md active:scale-95 transition-transform">${_t('settings.sync.form.connect', 'Подключиться к облаку')}</button>
            </div>
        `;
    }
};
