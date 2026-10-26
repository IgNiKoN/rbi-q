/* Файл: js/services/sync/sync-connection.actions.js — перенесено из js/sync.js без изменения логики */
window.pushObjectRequestToCloud = async function (requestedProject) {
    if (
        !requestedProject ||
        !window.supabaseClient ||
        !window.syncConfig ||
        !window.syncConfig.enabled ||
        !window.syncConfig.projectCode ||
        !window.syncConfig.engineerName
    ) {
        return false;
    }

    const pCode = window.syncConfig.projectCode;
    const iName = window.syncConfig.engineerName;
    const nowIso = new Date().toISOString();

    // 1. ЗАЯВКИ ИЗ ПК СК (На пополнение глобального справочника объектов)
    if (requestedProject.source === 'sk_import' || requestedProject.request_type === 'directory') {
        const rawNameStr = String(requestedProject.raw_name || requestedProject.display_name || '').trim();
        if (!rawNameStr) return false;

        // КРИТИЧЕСКИЙ ФИКС: Делаем ID постоянным на основе имени. 
        // Теперь при повторной загрузке локальная база просто перезапишет старую заявку, а не создаст дубль!
        const safeIdPart = rawNameStr.toLowerCase().replace(/[^a-zа-я0-9]/gi, '').substring(0, 20);
        const deterministicId = 'req_obj_' + pCode + '_' + safeIdPart;

        const payload = {
            id: deterministicId,
            project_code: pCode,
            raw_name: rawNameStr,
            suggested_canonical_key: requestedProject.canonical_key || '',
            source_table: 'sk_records',
            source_record_id: requestedProject.source_record_id || '',
            created_by: iName,
            status: 'pending',
            admin_comment: 'Новый объект найден при загрузке ПК СК',
            created_at: requestedProject.created_at || nowIso,
            updated_at: nowIso
        };

        if (!payload.raw_name) return false;

        // СНАЧАЛА Отправляем в облако (чтобы локальная БД не добавила лишние поля _deleted)
        const { error } = await window.supabaseClient.from('object_normalization_queue').upsert(payload, { onConflict: 'project_code,raw_name' });
        if (error) console.warn('Ошибка отправки заявки на объект:', error);

        // ПОСЛЕ отправки сохраняем локально
        if (typeof dbPut === 'function') {
            const localPayload = { ...payload }; // Клонируем от греха подальше
            await dbPut('object_normalization_queue', localPayload);
        }

        return true;
    }

    // 2. ЗАЯВКИ ОТ ИНЖЕНЕРА (На привязку инженера к объекту)
    const stableInspectorId = `${pCode}_${iName}`.replace(/\s+/g, '_');

    const { data: profileRows } = await window.supabaseClient
        .from('rbi_engineer_profiles')
        .select('inspector_id, inspector_name, engineer_name, project_code, settings, assigned_projects, role, cloud_status')
        .eq('inspector_id', stableInspectorId)
        .limit(1);

    const existingProfile = profileRows && profileRows.length > 0 ? profileRows[0] : null;
    const currentSettings = existingProfile?.settings || {};
    const oldRequests = Array.isArray(currentSettings.requestedProjects) ? currentSettings.requestedProjects : [];

    const existsCloud = oldRequests.some(p => {
        if (!p) return false;
        if (requestedProject.canonical_key && p.canonical_key
            && String(p.canonical_key) === String(requestedProject.canonical_key)) return true;
        if (requestedProject.projectId && p.projectId
            && String(p.projectId) === String(requestedProject.projectId)) return true;
        const cleanFn = (typeof ObjectDirectory !== 'undefined' && typeof ObjectDirectory.cleanString === 'function')
            ? ObjectDirectory.cleanString.bind(ObjectDirectory)
            : (s) => String(s || '').trim().toLowerCase();
        const a = cleanFn(p.raw_name || p.display_name || p.canonical_key || '');
        const b = cleanFn(requestedProject.raw_name || requestedProject.display_name || requestedProject.canonical_key || '');
        return !!(a && b && a === b);
    });

    const newRequests = existsCloud ? oldRequests : [...oldRequests, requestedProject];
    const newSettings = { ...currentSettings, requestedProjects: newRequests };

    const payload = {
        inspector_id: stableInspectorId,
        inspector_name: existingProfile?.inspector_name || iName,
        engineer_name: existingProfile?.engineer_name || iName,
        project_code: pCode,
        role: existingProfile?.role || appSettings?.userRole || 'guest',
        cloud_status: existingProfile?.cloud_status || appSettings?.cloudStatus || 'pending',
        assigned_projects: existingProfile?.assigned_projects || appSettings?.assignedProjects || [],
        settings: newSettings,
        updated_at: nowIso,
        last_seen_at: nowIso
    };

    await window.supabaseClient.from('rbi_engineer_profiles').upsert(payload, { onConflict: 'inspector_id' });
    return true;
};

window.addAssignedProject = async function () {
    const input = document.getElementById('new-assigned-project');
    const rawValue = input?.value?.trim() || '';
    if (!rawValue) return;

    if (typeof appSettings === 'undefined') return;

    if (!Array.isArray(appSettings.assignedProjects)) {
        appSettings.assignedProjects = [];
    }

    if (!Array.isArray(appSettings.pendingAssignedProjects)) {
        appSettings.pendingAssignedProjects = [];
    }

    let canonicalKey = '';
    let displayName = rawValue;
    let requestStatus = 'pending';
    let projectId = '';

    // Пытаемся сразу сопоставить объект со справочником
    if (typeof ObjectDirectory !== 'undefined' && typeof ObjectDirectory.normalizeProjectName === 'function') {
        try {
            const normalized = await ObjectDirectory.normalizeProjectName(rawValue);

            if (
                normalized &&
                (
                    normalized.status === 'matched' ||
                    normalized.status === 'multiple_matched_auto_best'
                )
            ) {
                canonicalKey = normalized.canonical_key || '';
                displayName = normalized.display_name || rawValue;
                requestStatus = 'matched_pending_approval';
                if (typeof ObjectDirectory.resolveProjectId === 'function') {
                    projectId = ObjectDirectory.resolveProjectId(canonicalKey || displayName) || '';
                }
            }
        } catch (e) {
            console.warn('[Objects] Не удалось нормализовать объект:', e);
        }
    }

    const requestedProject = {
        raw_name: rawValue,
        canonical_key: canonicalKey,
        display_name: displayName,
        projectId: projectId,
        status: requestStatus,
        created_at: new Date().toISOString()
    };

    const existsLocal = appSettings.pendingAssignedProjects.some(p => {
        if (!p) return false;
        if (canonicalKey && p.canonical_key && String(p.canonical_key) === String(canonicalKey)) return true;
        if (projectId && p.projectId && String(p.projectId) === String(projectId)) return true;
        const cleanFn = (typeof ObjectDirectory !== 'undefined' && typeof ObjectDirectory.cleanString === 'function')
            ? ObjectDirectory.cleanString.bind(ObjectDirectory)
            : (s) => String(s || '').trim().toLowerCase();
        const a = cleanFn(p.raw_name || p.display_name || '');
        const b = cleanFn(rawValue);
        return !!(a && b && a === b);
    });

    if (!existsLocal) {
        appSettings.pendingAssignedProjects.push(requestedProject);
    }

    // ВАЖНО:
    // Пока пользователь pending/guest, это НЕ подтверждённое право.
    // Поэтому в assignedProjects не кладём, если статус не approved.
    const cloudStatus = appSettings.cloudStatus || 'offline';

    // Убрано автоматическое добавление в зеленый список (assignedProjects).
    // Теперь любой добавленный объект будет оранжевым, пока его не подтвердит Администратор.

    if (typeof dbPut === 'function') {
        await dbPut('app_settings', { key: 'user_prefs', ...appSettings });
    }

    // Если облако подключено — записываем заявку в профиль пользователя.
    // ИСПРАВЛЕНИЕ (см. current_plan.md §9): раньше немэтченный объект уходил
    // с request_type='directory', который pushObjectRequestToCloud() маршрутизирует
    // в общий object_normalization_queue (обновление справочника), а не в
    // settings.requestedProjects профиля — из-за этого заявка на привязку
    // конкретного инженера не попадала в панель «Команда» и админ её не видел.
    // Теперь ЛЮБОЙ запрос из настроек инженера (matched или не matched) идёт
    // как 'profile_only' — привязка к конкретному пользователю, видимая в
    // панели «Команда»; создание нового объекта в справочнике при отсутствии
    // совпадения делает сам админ через resolveRequest(action='create').
    try {
        if (typeof window.pushObjectRequestToCloud === 'function') {
            requestedProject.request_type = 'profile_only';
            await window.pushObjectRequestToCloud(requestedProject);
        }
    } catch (e) {
        console.warn('[Objects] Не удалось отправить заявку на объект в профиль:', e);
        localStorage.setItem('rbi_cloud_dirty', '1');
    }

    input.value = '';

    if (typeof ObjectDirectory !== 'undefined') {
        ObjectDirectory.initUI();
    }

    if (typeof window.renderSyncUI === 'function') {
        window.renderSyncUI();
    }

    if (typeof showToast === 'function') {
        showToast('🏢 Объект запрошен: ' + displayName);
    }
};

// Решение пользователя (current_plan.md §8): самостоятельное снятие объекта
// запрещено — кнопка ✕ у подтверждённого (зелёного) объекта больше не удаляет
// привязку напрямую (ни локально, ни в облаке), а создаёт заявку на снятие
// (request_type: 'unassign'), которую обрабатывает администратор в панели
// «Команда» (см. game.actions.js: requestedProjectsHtml/gameSaveUserAccess).
// Реальное удаление из assigned_projects/settings.assignedProjects выполняется
// только через permission.service.js:writeUserProjectAssignment при подтверждении.
window.removeAssignedProject = async function (val) {
    if (typeof appSettings === 'undefined' || !Array.isArray(appSettings.assignedProjects)) {
        return;
    }
    let projectRef = val;
    if (typeof ObjectDirectory !== 'undefined' && typeof ObjectDirectory.resolveProjectId === 'function') {
        projectRef = ObjectDirectory.resolveProjectId(val) || val;
    }
    const assigned = appSettings.assignedProjects;
    const hasMatch = assigned.some(function (a) {
        if (a === val || a === projectRef) return true;
        if (typeof ObjectDirectory !== 'undefined' && typeof ObjectDirectory.resolveProjectId === 'function') {
            return ObjectDirectory.resolveProjectId(a) === projectRef;
        }
        return false;
    });
    if (!hasMatch) return;

    if (!Array.isArray(appSettings.pendingUnassignProjects)) {
        appSettings.pendingUnassignProjects = [];
    }
    if (!appSettings.pendingUnassignProjects.includes(projectRef)
        && !appSettings.pendingUnassignProjects.includes(val)) {
        appSettings.pendingUnassignProjects.push(projectRef);
    }

    if (typeof dbPut === 'function') {
        await dbPut('app_settings', { key: 'user_prefs', ...appSettings });
    }

    try {
        let displayName = val;
        if (typeof ObjectDirectory !== 'undefined' && Array.isArray(ObjectDirectory.objects)) {
            const found = ObjectDirectory.objects.find(o => o.canonical_key === val);
            if (found && found.display_name) displayName = found.display_name;
        }

        if (typeof window.pushObjectRequestToCloud === 'function') {
            await window.pushObjectRequestToCloud({
                raw_name: val,
                canonical_key: val,
                display_name: displayName,
                request_type: 'unassign',
                status: 'pending_unassign',
                created_at: new Date().toISOString()
            });
        }
    } catch (e) {
        console.warn('[Objects] Не удалось отправить заявку на снятие объекта:', e);
        localStorage.setItem('rbi_cloud_dirty', '1');
    }

    window.renderSyncUI();

    if (typeof showToast === 'function') {
        showToast('📤 Заявка на снятие объекта отправлена администратору');
    }
};

// UI-фидбек на кнопку «Подключиться к облаку» (Auth Gate + Настройки).
// Раньше клик не давал никакого визуального отклика, а если сервер не
// отвечал (нет сети / упал Supabase) — весь экран просто "висел" до
// бесконечности без единого сообщения. Теперь: кнопка блокируется и
// показывает спиннер-текст на время запроса, а сам запрос ограничен
// таймаутом — если сервер молчит дольше CLOUD_CONNECT_TIMEOUT_MS,
// пользователь получает понятную ошибку вместо замороженного экрана.
const CLOUD_CONNECT_TIMEOUT_MS = 15000;

function setCloudConnectBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        if (btn.dataset.origLabel === undefined) btn.dataset.origLabel = btn.textContent;
        btn.disabled = true;
        btn.classList.add('opacity-70');
        btn.style.cursor = 'wait';
        btn.textContent = '⏳ Подключаемся…';
    } else {
        btn.disabled = false;
        btn.classList.remove('opacity-70');
        btn.style.cursor = '';
        if (btn.dataset.origLabel !== undefined) {
            btn.textContent = btn.dataset.origLabel;
            delete btn.dataset.origLabel;
        }
    }
}

function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

window.initCloudConnection = async function (btnEl) {
    setCloudConnectBtnLoading(btnEl, true);
    try {
        return await withTimeout(
            runCloudConnection(),
            CLOUD_CONNECT_TIMEOUT_MS,
            'Сервер не отвечает. Проверьте соединение и попробуйте снова.'
        );
    } catch (err) {
        console.error('[Sync] initCloudConnection:', err);
        safeToast('❌ ' + (err && err.message ? err.message : 'Не удалось подключиться к облаку'));
        throw err;
    } finally {
        setCloudConnectBtnLoading(btnEl, false);
    }
};

async function runCloudConnection() {
    const name = document.getElementById('sync-name').value.trim();
    const code = document.getElementById('sync-code').value.trim();
    const pin = document.getElementById('sync-pin').value.trim();

    if (!name || !code) return safeToast("⚠️ Имя и Код проекта обязательны!");
    if (!pin || pin.length < 4) return safeToast("⚠️ Укажите PIN минимум 4 цифры!");
    if (!window.supabaseClient) return safeToast("⚠️ " + ((window.APP_CONFIG && window.APP_CONFIG.CLOUD_DISABLED_MESSAGE) || "Ключи базы данных не настроены"));

    const { data: projData } = await window.supabaseClient
        .from('allowed_projects')
        .select('code')
        .eq('code', code)
        .limit(1);

    if (!projData || projData.length === 0) {
        return safeToast("❌ Ошибка: Такого кода проекта не существует!");
    }

    const hashedPin = await window.hashPin(pin);
    const stableInspectorId = `${code}_${name}`.replace(/\s+/g, '_');

    let authInfo = null;

    try {
        authInfo = await window.rbiEnsureAuthSession(code, name, pin);
    } catch (authError) {
        console.error('[Auth] Ошибка входа:', authError);
        return safeToast("❌ Ошибка входа в облако: " + authError.message);
    }

    const authUserId = authInfo.user.id;
    const authEmail = authInfo.email;
    const nowIso = new Date().toISOString();

    // Ищем профиль уже по project_code + inspector_id.
    // Это стабильнее, чем inspector_name.
    const { data, error } = await window.supabaseClient
        .from('rbi_engineer_profiles')
        .select('inspector_id, auth_user_id, auth_email, pin_hash, role, cloud_status, assigned_projects, contractor_name, assigned_contractor, settings')
        .eq('project_code', code)
        .eq('inspector_id', stableInspectorId)
        .limit(1);

    if (error) {
        console.error('[Sync] Ошибка проверки профиля:', error);
        return safeToast("❌ Ошибка проверки профиля пользователя");
    }

    // Если профиль есть и PIN не совпал — просим правильный PIN.
    // Это оставляем как дополнительную защиту внутри приложения.
    if (data && data.length > 0 && data[0].pin_hash && data[0].pin_hash !== hashedPin) {
        window.showPinPromptModal(name, code, data[0].pin_hash);
        return;
    }

    // Если профиля ещё нет — создаём заявку guest / pending.
    if (!data || data.length === 0) {
        const newProfile = {
            inspector_id: stableInspectorId,
            auth_user_id: authUserId,
            auth_email: authEmail,
            inspector_name: name,
            engineer_name: name,
            project_code: code,
            pin_hash: hashedPin || '',
            role: 'guest',
            cloud_status: 'pending',
            assigned_projects: [],
            contractor_name: '',
            assigned_contractor: '',
            settings: {
                assignedProjects: [],
                createdFromApp: true
            },
            last_auth_at: nowIso,
            last_seen_at: nowIso,
            updated_at: nowIso
        };

        const { error: insertError } = await window.supabaseClient
            .from('rbi_engineer_profiles')
            .upsert(newProfile, { onConflict: 'inspector_id' });

        if (insertError) {
            console.error('[Sync] Ошибка создания профиля:', insertError);
            return safeToast("❌ Не удалось создать заявку на доступ");
        }

        if (typeof appSettings !== 'undefined') {
            appSettings.userRole = 'guest';
            appSettings.cloudStatus = 'pending';
            appSettings.assignedProjects = [];
            appSettings.assignedContractor = '';
            appSettings.contractorName = '';

            if (typeof dbPut === 'function') {
                await dbPut('app_settings', { key: 'user_prefs', ...appSettings });
            }
        }

        safeToast("✅ Заявка отправлена. Ожидает подтверждения администратора.");
    }

    // Если профиль уже есть — связываем его с auth.uid(), если ещё не связан.
    if (data && data.length > 0) {
        const profile = data[0];

        const updatePayload = {
            auth_user_id: authUserId,
            auth_email: authEmail,
            last_auth_at: nowIso,
            last_seen_at: nowIso,
            updated_at: nowIso
        };

        const { error: updateAuthError } = await window.supabaseClient
            .from('rbi_engineer_profiles')
            .update(updatePayload)
            .eq('project_code', code)
            .eq('inspector_id', stableInspectorId);

        if (updateAuthError) {
            console.error('[Sync] Ошибка связи профиля с Auth:', updateAuthError);
            return safeToast("❌ Не удалось связать профиль с Auth");
        }

        if (typeof appSettings !== 'undefined') {
            appSettings.userRole = profile.role || 'guest';
            appSettings.cloudStatus = profile.cloud_status || 'pending';

            appSettings.assignedContractor =
                profile.contractor_name ||
                profile.assigned_contractor ||
                '';

            appSettings.contractorName = appSettings.assignedContractor;

            const profileCloudStatus = profile.cloud_status || 'pending';

            if (profileCloudStatus === 'approved') {
                let assigned = [];
                if (Array.isArray(profile.assigned_projects)) {
                    assigned = profile.assigned_projects;
                } else if (profile.settings && Array.isArray(profile.settings.assignedProjects)) {
                    assigned = profile.settings.assignedProjects;
                }
                if (typeof ObjectDirectory !== 'undefined'
                    && typeof ObjectDirectory.normalizeAssignedProjectsList === 'function') {
                    assigned = ObjectDirectory.normalizeAssignedProjectsList(assigned);
                }
                appSettings.assignedProjects = assigned;
                appSettings.assigned_projects = assigned;

                appSettings.pendingAssignedProjects = [];
            } else {
                if (!Array.isArray(appSettings.assignedProjects)) {
                    appSettings.assignedProjects = [];
                }

                if (profile.settings && Array.isArray(profile.settings.requestedProjects)) {
                    appSettings.pendingAssignedProjects = profile.settings.requestedProjects;
                } else if (!Array.isArray(appSettings.pendingAssignedProjects)) {
                    appSettings.pendingAssignedProjects = [];
                }
            }

            // Инженер с 1 объектом: закрепить в глобальном мультифильтре (не «Все объекты»).
            try {
                if (typeof window.ensureSingleAssignedProjectFilter === 'function') {
                    window.ensureSingleAssignedProjectFilter();
                }
                if (typeof window.updateFilterButtonLabels === 'function') {
                    window.updateFilterButtonLabels();
                }
            } catch (_) { /* ignore */ }

            if (typeof dbPut === 'function') {
                await dbPut('app_settings', { key: 'user_prefs', ...appSettings });
            }
        }
    }

    window.applySyncConnect(name, code, hashedPin);
}

window.showPinPromptModal = function (name, code, correctHash) {
    const html = `
    <div id="sync-pin-modal" class="fixed inset-0 bg-slate-900/80 z-[6000] flex items-center justify-center p-4">
        <div class="bg-white w-full max-w-xs p-6 rounded-2xl shadow-2xl text-center">
            <h3 class="font-black text-[13px] uppercase text-slate-800 mb-4">Введите PIN-код</h3>
            <input type="password" id="sync-pin-verify" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-center text-xl font-black mb-4" placeholder="••••" maxlength="4" inputmode="numeric">
            <div class="flex gap-2">
                <button onclick="document.getElementById('sync-pin-modal').remove()" class="flex-1 bg-slate-100 py-3 rounded-xl font-bold text-[10px] uppercase">Отмена</button>
                <button onclick="window.verifySyncPin('${name}', '${code}', '${correctHash}')" class="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black text-[10px] uppercase">Войти</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
};

window.verifySyncPin = async function (name, code, correctHash) {
    const input = document.getElementById('sync-pin-verify').value;
    const inputHash = await window.hashPin(input);
    if (inputHash === correctHash) {
        document.getElementById('sync-pin-modal').remove();
        window.applySyncConnect(name, code, inputHash);
    } else safeToast("❌ Неверный PIN-код!");
};

// Функция глубокой очистки проектных данных
window.clearProjectLocalData = async function () {
    if (typeof showToast === 'function') showToast("🧹 Очистка данных старого проекта...");

    // Очищаем таблицы проектных данных в IndexedDB
    await dbClear('app_history');
    await dbClear('rbi_tasks');
    await dbClear('rbi_schedule_stages');
    await dbClear('rbi_meetings');
    await dbClear('rbi_interventions');
    await dbClear('rbi_etalon_acts');
    await dbClear('rbi_fmea');
    await dbClear('sk_records');
    await dbClear('sk_imports');

    // Очищаем локальные массивы (ОЗУ)
    if (typeof contractorArray !== 'undefined') window.contractorArray = [];
    if (typeof etalonActsArray !== 'undefined') window.etalonActsArray = [];
    if (typeof window.rbi_tasksData !== 'undefined') window.rbi_tasksData = [];
    if (typeof window.rbi_scheduleData !== 'undefined') window.rbi_scheduleData = [];
    if (typeof window.rbi_meetingsData !== 'undefined') window.rbi_meetingsData = [];
    if (typeof window.rbi_interventionsData !== 'undefined') window.rbi_interventionsData = [];
    if (typeof window.rbi_fmeaRecords !== 'undefined') window.rbi_fmeaRecords = [];
    if (typeof window.skRecords !== 'undefined') window.skRecords = [];

    // Сброс плана и статусов
    if (typeof weeklyPlanData !== 'undefined') weeklyPlanData = { weekId: null, tasks: [], completed: false };
    if (typeof contractorStatuses !== 'undefined') contractorStatuses = {};

    // Очищаем кэш автозаполнения инпутов
    localStorage.removeItem('smart_input_cache');

    // Сброс мульти-фильтров (in-place через сервис — см. resetAnalyticsFilters / B1)
    if (window.RBI && window.RBI.services && window.RBI.services.analytics) {
        window.RBI.services.analytics.resetAnalyticsFilters();
    } else if (window.activeMultiFilters && typeof window.activeMultiFilters === 'object') {
        window.activeMultiFilters.history = { project: [], contractor: [], inspector: [] };
        window.activeMultiFilters.analytics = { project: [], contractor: [], inspector: [], template: [] };
    } else {
        window.activeMultiFilters = {
            history: { project: [], contractor: [], inspector: [] },
            analytics: { project: [], contractor: [], inspector: [], template: [] }
        };
    }

    if (typeof showToast === 'function') showToast("✅ Локальные данные очищены");
};

window.applySyncConnect = async function (name, code, hashedPin) {
    const oldCode = window.syncConfig.projectCode;

    // УМНАЯ ПРОВЕРКА: Если код объекта изменился
    if (oldCode && oldCode !== code) {
        if (confirm(`Вы меняете код проекта с "${oldCode}" на "${code}".\n\nОчистить локальные проектные данные (историю, задачи, встречи) предыдущего объекта?\n\nБиблиотека (TWI, Узлы, Справочники) останется нетронутой.`)) {
            await window.clearProjectLocalData();
        }
    }

    window.syncConfig.enabled = true;
    window.syncConfig.engineerName = name;
    window.syncConfig.projectCode = code;
    window.syncConfig.pinHash = hashedPin;

    // Не сбрасываем режим, если он уже был выбран
    if (!window.syncConfig.syncMode) window.syncConfig.syncMode = 'personal';

    localStorage.setItem('rbi_sync_config', JSON.stringify(window.syncConfig));
    localStorage.setItem('rbi_cloud_dirty', '1');

    // RBI FIX: при новом подключении/переподключении всегда делаем полный pull из облака
    localStorage.removeItem('rbi_sync_last_pull_at');
    localStorage.setItem('rbi_force_full_pull', '1');
    localStorage.removeItem('rbi_first_full_offline_cache_done');
    localStorage.removeItem('rbi_first_full_offline_cache_started_at');

    if (typeof appSettings !== 'undefined') {
        appSettings.engineerName = name;

        // ВАЖНО: не затираем AI-настройки при подключении облака
        const oldSettings = JSON.parse(localStorage.getItem('rbi_settings_backup') || '{}');

        appSettings.aiEnabled = appSettings.aiEnabled ?? oldSettings.aiEnabled ?? false;
        appSettings.aiCorpPwd = appSettings.aiCorpPwd || oldSettings.aiCorpPwd || '';
        appSettings.apiKey = appSettings.apiKey || oldSettings.apiKey || '';
        appSettings.usePersonalKey = appSettings.usePersonalKey ?? oldSettings.usePersonalKey ?? false;

        localStorage.setItem('rbi_settings_backup', JSON.stringify(appSettings));

        if (typeof dbPut === 'function') {
            dbPut('app_settings', { key: 'user_prefs', ...appSettings });
        }
    }

    const inpInspector = document.getElementById('inp-inspector');
    if (inpInspector && !inpInspector.value) {
        inpInspector.value = name;
    }

    window.renderSyncUI();
    window.triggerSync('manual');
};

window.disconnectSync = function () {
    if (!confirm("Отключить облако? Данные останутся на устройстве.")) return;
    window.syncConfig.enabled = false;
    localStorage.setItem('rbi_sync_config', JSON.stringify(window.syncConfig));
    window.renderSyncUI();
};

window.changeSyncMode = function (mode) {
    if (mode === 'full' && !window.syncConfig.fullAccessGranted) {
        document.getElementById('sync-mode-select').value = 'personal';
        const html = `
        <div id="sync-full-access-modal" class="fixed inset-0 bg-slate-900/80 z-[6000] flex items-center justify-center p-4">
            <div class="bg-white w-full max-w-xs p-6 rounded-2xl text-center">
                <h3 class="font-black text-[13px] uppercase mb-4">Пароль руководителя</h3>
                <input type="password" id="sync-full-access-pin" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-center text-xl font-black mb-4" placeholder="••••••" maxlength="6" inputmode="numeric">
                <div class="flex gap-2">
                    <button onclick="document.getElementById('sync-full-access-modal').remove()" class="flex-1 bg-slate-100 py-3 rounded-xl font-bold text-[10px] uppercase">Отмена</button>
                    <button onclick="window.verifyFullAccessPin()" class="flex-1 bg-red-600 text-white py-3 rounded-xl font-black text-[10px] uppercase">Далее</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        return;
    }
    window.syncConfig.syncMode = mode;
    localStorage.setItem('rbi_sync_config', JSON.stringify(window.syncConfig));
    if (mode === 'full') {
        localStorage.removeItem('rbi_sync_last_pull_at');
        localStorage.setItem('rbi_force_full_pull', '1');
        localStorage.setItem('rbi_cloud_dirty', '1');
        localStorage.removeItem('rbi_first_full_offline_cache_done');
        localStorage.removeItem('rbi_first_full_offline_cache_started_at');
    }
    window.triggerSync('manual');
};

window.verifyFullAccessPin = async function () {
    const input = document.getElementById('sync-full-access-pin').value.trim();
    const inputHash = simpleHash(input);
    if (inputHash === window.SYNC_FULL_ACCESS_HASH) {
        document.getElementById('sync-full-access-modal').remove();
        window.syncConfig.fullAccessGranted = true;
        window.changeSyncMode('full');

    } else {
        if (typeof showToast === 'function') showToast("❌ Неверный пароль!");
    }
};

window.resetFullAccess = function () {
    window.syncConfig.fullAccessGranted = false;
    window.syncConfig.syncMode = 'personal';
    localStorage.setItem('rbi_sync_config', JSON.stringify(window.syncConfig));
    window.renderSyncUI();
};


