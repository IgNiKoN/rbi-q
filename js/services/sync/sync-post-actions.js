/* Файл: js/services/sync/sync-post-actions.js — перенесено из js/sync.js без изменения логики */

window.mergeCloudData = async function (newInspections, newProfiles, newTasks, newEtalons) {
    let dbUpdated = false;

    // 1. ИСПРАВЛЕНИЕ РАСПАКОВКИ ПРОВЕРОК
    if (newInspections && newInspections.length > 0) {
        let historyMap = new Map();
        if (typeof contractorArray !== 'undefined') contractorArray.forEach(c => historyMap.set(c.id, c));

        newInspections.forEach(row => {
            // ИСПРАВЛЕНИЕ: Вытягиваем projectName и metrics из inspection_data
            const item = {
                id: row.id,
                date: row.date,
                // Если в data есть projectName - берем его, иначе fallback на код проекта
                projectName: (row.inspection_data && row.inspection_data.projectName) ? row.inspection_data.projectName : row.project_code,
                inspectorName: row.inspector_name,
                contractorName: row.contractor_name,
                templateKey: row.template_key,
                location: row.location,

                // Распаковываем все вложенные данные (включая metrics)
                ...(row.inspection_data || {}),

                photos: row.photos,
                _deleted: row._deleted,
                _deletedAt: row._deleted_at
            };

            const existing = historyMap.get(item.id);
            if (!existing || item._deleted) {
                historyMap.set(item.id, item);
            }
        });
        window.contractorArray = Array.from(historyMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
        dbUpdated = true;
    }

    // 2. Слияние профиля (Черновик)
    if (newProfiles && newProfiles.length > 0) {
        const myProfile = newProfiles.find(p => p.inspector_name === window.syncConfig.engineerName);
        if (myProfile) {
            const data = myProfile.profile_data;

            if (data.session && typeof dbPut !== 'undefined' && typeof dbGet !== 'undefined') {
                const localSession = await dbGet('app_state', 'current_session');
                const localTime = localSession ? (localSession.timestamp || 0) : 0;
                const cloudTime = data.session.timestamp || 0;

                if (cloudTime > localTime) {
                    // Как sync-engine draft pull: на активном Осмотре облако не трогает UI.
                    const isAuditActive = document.getElementById('tab-audit')?.classList.contains('active');
                    if (isAuditActive) {
                        console.log('[Sync] 🛡️ Осмотр активен — mergeCloudData не вызывает restoreSession');
                    } else {
                        await dbPut('app_state', data.session);
                        if (typeof restoreSession === 'function') {
                            setTimeout(() => {
                                if (!document.getElementById('tab-audit')?.classList.contains('active')) {
                                    restoreSession();
                                    safeToast("📥 Черновик подтянут из облака!");
                                }
                            }, 500);
                        }
                    }
                }
            }
            dbUpdated = true;
        }
    }

    // Сохранение в базу телефона
    if (dbUpdated && typeof dbPut !== 'undefined') {
        if (typeof contractorArray !== 'undefined') {
            for (const item of contractorArray) {
                if (item._deleted) await dbDelete('app_history', item.id);
                else await dbPut('app_history', item);
            }
            window.contractorArray = contractorArray.filter(i => !i._deleted);
        }
    }
};

// Принудительная отправка всех локальных объектов справочника в облако
// C2b: no-op — SoT = locations; project_objects sync disabled
window.forceSyncObjects = async function () {
    if (typeof showToast === 'function') {
        showToast('ℹ️ C2b: sync project_objects отключён — объекты в справочнике локаций');
    }
    console.log('[Sync] C2b: forceSyncObjects skipped');
};

// ============================================================================
// === МЕНЕДЖЕР ОЧЕРЕДИ СИНХРОНИЗАЦИИ (БЕЗОПАСНЫЙ РЕЖИМ) ===
// ============================================================================

window.SyncQueueManager = {
    isProcessing: false,
    pendingTimer: null,

    // 1. Положить действие в локальную очередь (Без блокировки UI)
    enqueue(actionType, payload) {
        try {
            // Если демо-режим или облако выключено - ничего не делаем
            if (typeof isDemoMode !== 'undefined' && isDemoMode) return;
            if (!window.syncConfig || !window.syncConfig.enabled) return;

            const queueItem = {
                id: window.RbiIds.newId(),
                action_type: actionType,
                payload: payload,
                project_code: window.syncConfig?.projectCode || 'LOCAL',
                engineer_name: window.syncConfig?.engineerName || 'Инженер',
                device_id: window.syncConfig?.deviceId || 'unknown',
                created_at: new Date().toISOString()
            };

            // Fire-and-forget: сохраняем в БД, не дожидаясь ответа (чтобы не вешать интерфейс)
            if (typeof window.dbPut === 'function') {
                window.dbPut('sync_queue', queueItem).catch(e => console.warn('[Queue] Игнор ошибки БД', e));
            }

            // Откладываем сетевой запрос на 3 секунды (Дебаунс)
            // Если юзер быстро сохраняет 5 задач, мы подождем, пока он закончит, и отправим разом
            clearTimeout(this.pendingTimer);
            this.pendingTimer = setTimeout(() => {
                this.process();
            }, 3000);

        } catch (e) {
            console.warn('[Queue] Ошибка добавления в очередь:', e);
        }
    },

    // 2. Обработать очередь (Бережная отправка)
    async process() {
        if (this.isProcessing || !navigator.onLine || !window.supabaseClient) return;

        try {
            this.isProcessing = true;

            // Берем задачи из локальной очереди
            const queueItems = await window.dbGetAll('sync_queue') || [];
            if (queueItems.length === 0) return;

            // Сортируем от старых к новым (FIFO)
            queueItems.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            // Защита сети: отправляем не больше 10 записей за один проход!
            const batch = queueItems.slice(0, 10);

            for (const item of batch) {
                const { error } = await window.supabaseClient
                    .from('rbi_sync_queue')
                    .insert([{
                        project_code: item.project_code,
                        engineer_name: item.engineer_name,
                        action_type: item.action_type,
                        payload: item.payload,
                        device_id: item.device_id,
                        created_at: item.created_at
                    }]);

                // Если Supabase завис или выдал ошибку — прерываем цикл, попробуем в следующий раз
                if (error) {
                    console.warn('[Queue] Ошибка отправки в облако (Возможен блок провайдера). Тормозим.', error.message);
                    break;
                }

                // Успешно — удаляем из памяти телефона
                await window.dbDelete('sync_queue', item.id);

                // ДАЕМ БРАУЗЕРУ ПОДЫШАТЬ: микро-пауза между запросами
                await new Promise(r => setTimeout(r, 150));
            }

            // Если в очереди осталось больше 10 записей, планируем следующий заход через 2 секунды
            if (queueItems.length > 10) {
                setTimeout(() => this.process(), 2000);
            }

        } catch (e) {
            console.error('[Queue] Ошибка обработки очереди:', e);
        } finally {
            this.isProcessing = false;
        }
    }
};

// Привязываем обработку очереди к восстановлению интернета
window.addEventListener('online', () => {
    if (window.SyncQueueManager) {
        setTimeout(() => window.SyncQueueManager.process(), 2000);
    }

    // После восстановления интернета: если просили полное копирование — докачиваем всё;
    // иначе только лёгкая очередь.
    setTimeout(() => {
        if (typeof window.rbiIsAutoCacheEnabled !== 'function' || !window.rbiIsAutoCacheEnabled()) {
            return;
        }

        if (
            localStorage.getItem('rbi_need_full_offline_cache') === '1' &&
            typeof window.rbiScheduleFullOfflineCacheIfEnabled === 'function'
        ) {
            window.rbiScheduleFullOfflineCacheIfEnabled(0);
            return;
        }

        if (typeof window.rbiProcessBgCacheQueue === 'function') {
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent || '');
            const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '');

            window.rbiProcessBgCacheQueue({
                maxPerRun: isSafari || isIOS ? 30 : 100,
                concurrency: isSafari || isIOS ? 2 : 5,
                pauseBetweenRounds: isSafari || isIOS ? 1200 : 500
            });
        }
    }, 5000);
});