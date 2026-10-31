/* Файл: js/services/sync/sync-engine.core.js — перенесено из js/sync.js без изменения логики */
// ============================================================================
// ГЛАВНЫЙ БЛОК СИНХРОНИЗАЦИИ (ИСПРАВЛЕНО СОХРАНЕНИЕ ОБЪЕКТОВ)
// ==========================================

/** assigned UUID/key → canonical_key[] для `.in('project_canonical_key', …)`. */
function _syncAssignedCanonicalKeys(assignedProjects) {
    const list = Array.isArray(assignedProjects) ? assignedProjects : [];
    if (typeof ObjectDirectory !== 'undefined'
        && typeof ObjectDirectory.canonicalKeysForAssignedProjects === 'function') {
        return ObjectDirectory.canonicalKeysForAssignedProjects(list);
    }
    if (window.RBI && window.RBI.services && window.RBI.services.objects
        && typeof window.RBI.services.objects.canonicalKeysForAssignedProjects === 'function') {
        return window.RBI.services.objects.canonicalKeysForAssignedProjects(list);
    }
    return list;
}

// P2-0023: пауза перед автоповтором после неудачной синхронизации (2 → 5 → 10 мин; P2-0059 — не дольше 10).
// P2-0059 (С6): вид сбоя — 'net' (нет связи / нет ответа: таймер проверяет связь каждую минуту и отправляет сразу)
// или 'server' (сервер ответил ошибкой: ждём паузу).
function rbiScheduleSyncRetry(kind) {
    try {
        const n = (parseInt(localStorage.getItem('rbi_sync_fail_count') || '0', 10) || 0) + 1;
        localStorage.setItem('rbi_sync_fail_count', String(n));
        const delay = window.RbiSyncRetryPolicy ? window.RbiSyncRetryPolicy.retryDelayMs(n) : 120000;
        localStorage.setItem('rbi_sync_retry_after', String(Date.now() + delay));
        localStorage.setItem('rbi_sync_retry_kind', kind === 'server' ? 'server' : 'net');
    } catch (_e) { /* ignore */ }
}

// Доработка 2: когда повторить записи «нужно внимание» — таймер автосинхронизации (sync-auth.js) смотрит сюда.
function rbiNoteAttentionRetry(at) {
    try {
        const t = Number(at) || 0;
        if (!t) return;
        const cur = parseInt(localStorage.getItem('rbi_sync_attention_retry_at') || '0', 10) || 0;
        if (!cur || t < cur) localStorage.setItem('rbi_sync_attention_retry_at', String(t));
    } catch (_e) { /* ignore */ }
}

// P2-0059: перед проходом — проверка связи по делу (С1); один проход за раз на всё устройство, в том числе в двух вкладках (С3).
window.triggerSync = async function (mode = 'silent') {
    const NP = window.RbiSyncNetPolicy;
    const net = window.RbiSyncNet;
    // прежние ветки (демо, облако выключено, «нет интернета», «уже идёт» — запрос не теряется) — в самом проходе
    // P2-0059 доработка (З2): запуск, пока эта вкладка уже входит в проход (проверка связи, замок), — как «уже идёт»:
    // запрос не теряется (отложенный повтор после прохода), второй вход в замок не начинается
    if (window._rbiSyncEntering && !window.isSyncing) {
        window._rbiPendingSyncRetryMode = (mode === 'manual' || window._rbiPendingSyncRetryMode === 'manual') ? 'manual' : 'silent';
        if (mode === 'manual') safeToast("🔄 Синхронизация уже идет...");
        return;
    }
    if (!NP || !net || (typeof isDemoMode !== 'undefined' && isDemoMode) || !window.isSyncEnabled() || !window.supabaseClient
        || !navigator.onLine || window.isSyncing) {
        if (NP && net && !navigator.onLine && window.isSyncEnabled() && window.supabaseClient) {
            if (window.RbiSyncJournal) window.RbiSyncJournal.add({ k: 'skip', net: 'no_network', why: 'no_network', mode });
        }
        return rbiSyncPass(mode);
    }
    window._rbiSyncEntering = true;
    try {
        return await rbiProbeAndRun(mode);
    } finally {
        window._rbiSyncEntering = false;
    }
};

/**
 * P2-0061 (З5, повторное ревью): один раз после обновления — задачам и замечаниям Стройконтроля 2.0, которые уже есть на сервере
 * (отправлены или скачаны: статус synced / source cloud), ставится признак cloudKnown: их правки не уходят в начале прохода раньше
 * скачивания (не отменят удаление с сервера). Запись, правленная до обновления и ещё не отправленная, признака не получит (ТД 351).
 */
async function rbiMarkCloudKnownOnce() {
    const FLAG = 'p2_0061_cloud_known_v1';
    try { if (localStorage.getItem(FLAG) === '1' || typeof dbGetAll !== 'function' || typeof dbPut !== 'function') return; } catch (e) { return; }
    for (const store of ['rbi_tasks', 'construction_defects_v2']) {
        try {
            for (const r of (await dbGetAll(store)) || []) {
                const st = r && (r.syncStatus || r.sync_status);
                if (r && !r.cloudKnown && (st === 'synced' || r.source === 'cloud')) { r.cloudKnown = true; await dbPut(store, r); }
            }
        } catch (e) { return; }   // хранилища нет / ошибка — попробуем в следующем проходе
    }
    try { localStorage.setItem(FLAG, '1'); } catch (e) { /* приватный режим */ }
}

/**
 * P2-0061: общее правило перед отправкой записи (js/services/sync/sync-access.policy.js — зеркало сервера, standards/SYNC_AND_ACCESS.md).
 * Можно — моей записи без id автора дописывается мой id. Нельзя — запись помечается «Не отправлено» (blocked) с причиной, подсказкой
 * и отпечатком доступа (ТД 313: доступ изменится — перепроверится); та же причина при том же доступе — запись не переписывается.
 * changed — запись изменилась и её надо сохранить. Вид без описания `sync` — как раньше (решает вызывающий код).
 */
function rbiAccessGate(kindName, rec, canPushRole = true) {
    const SA = window.RbiSyncAccess;
    const kind = SA && rec ? SA.kindOf(kindName) : null;
    if (!kind) return { ok: true, changed: false, described: false };
    const me = SA.deviceMe();
    // З4: права с сервера ещё не пришли (пустые действия) — не решать и не помечать: следующий проход
    if (me && !me.actions.length) return { ok: false, changed: false, described: true };
    // ТД 313: отклонённое сервером — снова, только если мой доступ изменился (или нажали «Отправить снова» — отпечаток сброшен)
    if (rec.syncServerRejected && rec.syncAccessStamp && rec.syncAccessStamp === SA.accessStamp(me)) return { ok: false, changed: false, described: true };
    const dec = !canPushRole ? { ok: false, reason: 'Не отправлено: роль не подтверждена для отправки', hint: 'Войдите заново или обратитесь к администратору' }
        : SA.canSend(rec, kind, me);
    if (dec.ok) {
        const was = !!rec.syncServerRejected;
        if (was) { delete rec.syncServerRejected; rec.syncAccessStamp = ''; }
        return { ok: true, changed: SA.stampAuthor(rec, kind, me) || was, described: true };
    }
    const stamp = SA.accessStamp(me);
    const was = rec.syncStatus || rec.sync_status;
    if (was === 'blocked' && rec.syncBlockReason === dec.reason && rec.syncAccessStamp === stamp) return { ok: false, changed: false, described: true };
    rec.syncStatus = 'blocked'; rec.sync_status = 'blocked';
    rec.syncBlockReason = dec.reason || 'Не отправлено'; rec.sync_block_reason = rec.syncBlockReason;
    rec.syncBlockHint = dec.hint || '';
    rec.syncAccessStamp = stamp;
    rec.syncBlockedAt = new Date().toISOString();   // З7: время пометки — отдельно, updatedAt записи не трогаем
    return { ok: false, changed: true, described: true };
}

async function rbiProbeAndRun(mode) {
    const NP = window.RbiSyncNetPolicy;
    const net = window.RbiSyncNet;
    const probe = await net.probe();
    const go = NP.shouldStartSync({ onLine: navigator.onLine, probe });
    if (!go.start) {
        window._rbiPendingSyncRetryMode = null; // связи нет — отложенный повтор не нужен, таймер проверит снова
        console.log('[Sync] Связи с сервером нет — проход не начат:', go.reason);
        if (window.RbiSyncJournal) window.RbiSyncJournal.add({ k: 'skip', net: probe, why: go.reason, mode });
        if (mode === 'manual') {
            safeToast(go.reason === 'server_error'
                ? 'Сервер временно не отвечает. Данные сохранены на устройстве — отправим позже.'
                : 'Нет связи с сервером. Данные сохранены на устройстве — отправим, как только связь появится.');
        }
        return;
    }
    return rbiWithSyncLock(mode, () => rbiSyncPass(mode));
}

// P2-0059 (С3): замок прохода — Web Locks (все вкладки); без них — аренда в localStorage. Замок держится, пока проход
// действительно не закончился; остановленный проход, который не закончился за 60 с, отпускает замок.
async function rbiWithSyncLock(mode, run) {
    const NP = window.RbiSyncNetPolicy;
    const net = window.RbiSyncNet;
    const busy = () => {
        if (window.RbiSyncJournal) window.RbiSyncJournal.add({ k: 'skip', why: 'busy', mode });
        if (mode === 'manual') safeToast('🔄 Синхронизация уже идёт (в другой вкладке)…');
        if (!window._rbiSyncBusyRetry) {
            window._rbiSyncBusyRetry = setTimeout(() => { window._rbiSyncBusyRetry = null; window.triggerSync('silent'); }, 30000);
        }
    };
    const guarded = async () => {
        const ctl = new AbortController();
        net.pass = ctl;
        let abandon = null;
        const stuck = new Promise((r) => { abandon = r; });
        ctl.signal.addEventListener('abort', () => setTimeout(() => abandon('abandoned'), 60000), { once: true });
        try {
            const r = await Promise.race([run(), stuck]);
            if (r === 'abandoned') {
                // брошенный проход больше не «текущий»: его finally не тронет следующий (rbiSyncPass, __rbiSyncPassId)
                window.__rbiSyncPassId = null;
                window.isSyncing = false;
                if (typeof window.renderSyncUI === 'function') window.renderSyncUI();
                console.warn('[Sync] Остановленный проход не закончился за 60 с — замок снят.');
            }
            return r;
        } finally {
            if (net.pass === ctl) net.pass = null;
        }
    };
    if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
        return navigator.locks.request('rbi-sync-pass', { ifAvailable: true }, (lock) => (lock ? guarded() : busy()));
    }
    const owner = window.__rbiSyncTabId || (window.__rbiSyncTabId = Math.random().toString(36).slice(2));
    const read = () => { try { return JSON.parse(localStorage.getItem('rbi_sync_lease') || 'null'); } catch (_e) { return null; } };
    const write = () => { try { localStorage.setItem('rbi_sync_lease', JSON.stringify({ owner, until: Date.now() + NP.LEASE_MS })); } catch (_e) { /* ignore */ } };
    if (!NP.leaseFree(read(), Date.now(), owner)) return busy();
    write();
    const hb = setInterval(write, NP.LEASE_MS / 3);
    try {
        return await guarded();
    } finally {
        clearInterval(hb);
        const l = read();
        if (l && l.owner === owner) { try { localStorage.removeItem('rbi_sync_lease'); } catch (_e) { /* ignore */ } }
    }
}

async function rbiSyncPass(mode = 'silent') {
    // ЖЕСТКАЯ ЗАЩИТА: Запрещаем синхронизацию в демо-режиме
    if (typeof isDemoMode !== 'undefined' && isDemoMode) {
        if (mode === 'manual') safeToast("⚠️ В демо-режиме синхронизация отключена!");
        return;
    }
    if (!window.isSyncEnabled() || !window.supabaseClient) return;
    // --- НОВОЕ: Проверка интернета ---
    if (!navigator.onLine) {
        if (mode === 'manual') safeToast("Нет подключения к интернету. Данные сохранены локально.");
        return;
    }
    // ---------------------------------
    // --- НОВОЕ: Проверка прав на синхронизацию (Push) ---
    // Если пользователь - гость, подрядчик или просто читатель,
    // мы разрешаем ему синхронизацию (чтобы он стянул свежие данные - Pull),
    // но мы должны запомнить, что ему НЕЛЬЗЯ делать Push (отправлять данные).
    let canPush = window.RBI.services.permissions ? window.RBI.services.permissions.canPush() : false;
    // -----------------------------------------------------

    if (window.isSyncing) {
        if (mode === 'manual') safeToast("🔄 Синхронизация уже идет...");
        // Не теряем запрос: например, OCR норматива мог обновить данные ровно во время
        // уже идущего push. Запоминаем самый "сильный" режим и перезапустим sync
        // в finally-блоке текущего цикла, когда isSyncing снова станет false.
        window._rbiPendingSyncRetryMode = (mode === 'manual' || window._rbiPendingSyncRetryMode === 'manual') ? 'manual' : 'silent';
        return;
    }

    // Экономия Supabase: тихую синхронизацию не запускаем без изменений
    const hasNeverPulled = !localStorage.getItem('rbi_sync_last_pull_at');
    const forcePullRequested = localStorage.getItem('rbi_force_full_pull') === '1';
    const forceRemotePollRequested = localStorage.getItem('rbi_force_remote_poll') === '1';
    const remotePollDue = typeof window.rbiIsRemotePollDue === 'function' && window.rbiIsRemotePollDue();

    if (
        mode === 'silent' &&
        localStorage.getItem('rbi_cloud_dirty') !== '1' &&
        !hasNeverPulled &&
        !forcePullRequested &&
        !forceRemotePollRequested &&
        !remotePollDue
    ) {
        return;
    }

    // Полный автокэш / «скачать всё»: не стартуем второй круг sync параллельно.
    // Запрос откладываем и подхватим в rbiEndOfflineCacheSyncPause.
    if (typeof window.rbiIsOfflineCacheBlockingSync === 'function' && window.rbiIsOfflineCacheBlockingSync()) {
        if (mode === 'manual') {
            safeToast('⏳ Идёт докачка файлов для офлайна. Синхронизация запустится после…');
        }
        if (typeof window.rbiDeferSyncForOfflineCache === 'function') {
            window.rbiDeferSyncForOfflineCache(mode);
        } else {
            window._rbiPendingSyncRetryMode =
                (mode === 'manual' || window._rbiPendingSyncRetryMode === 'manual') ? 'manual' : (window._rbiPendingSyncRetryMode || 'silent');
        }
        return;
    }

    let pushErrors = 0;
    let pullErrors = 0;
    let syncAttentionCount = 0; // P2-0023: объекты «нужно внимание» за этот проход
    let referencePullErrors = 0;
    // Доработка 5: пауза автосинхронизации — только при сетевых/серверных ошибках отправки;
    // запись, которую сервер отклонил (права, данные), не останавливает синхронизацию остальных.
    let transientPushErrors = 0;
    let passOk = false; // P2-0059: для журнала — проход без ошибок
    let serverErrSeen = false; // P2-0059 (С6): сервер ответил ошибкой (5xx) — пауза, а не проверка связи каждую минуту
    const rbiNoteErr = (err) => {
        if (!window.RbiSyncRetryPolicy || window.RbiSyncRetryPolicy.isTransientSyncError(err)) transientPushErrors++;
        if (window.RbiSyncNetPolicy && window.RbiSyncNetPolicy.retryKindOf(err) === 'server') serverErrSeen = true;
    };
    let retryScheduled = false; // пауза ставится не больше одного раза за проход
    const rbiScheduleSyncRetryOnce = () => { if (!retryScheduled) { retryScheduled = true; rbiScheduleSyncRetry(serverErrSeen ? 'server' : 'net'); } };

    window.isSyncing = true;
    const syncStartedAt = Date.now(); // P2-0025: черновик, изменённый после начала, снова «к отправке»
    // P2-0059 доработка (З2): свой признак прохода и своя отмена — проход, брошенный после «стопа», в finally
    // не снимает «идёт синхронизация» и «стоп» у следующего
    const passId = {};
    window.__rbiSyncPassId = passId;
    const myPass = window.RbiSyncNet ? window.RbiSyncNet.pass : null;
    if (window.RbiSyncJournal) window.RbiSyncJournal.add({ k: 'start', net: 'online', mode });
    // Доработка 2: подошедшие повторы «нужно внимание» уходят в этом проходе; неудача поставит новое время.
    try {
        const attAt = parseInt(localStorage.getItem('rbi_sync_attention_retry_at') || '0', 10) || 0;
        if (attAt && Date.now() >= attAt) localStorage.removeItem('rbi_sync_attention_retry_at');
    } catch (_e) { /* ignore */ }
    // §5: единый defer full-render активного экрана (js/shared/sync-ui-defer.utils.js).
    if (typeof window.rbiBeginSyncUiDefer === 'function') window.rbiBeginSyncUiDefer();
    else window._rbiDeferActiveViewFullRender = true;
    window.syncChannel.postMessage('sync_started');

    // Прогресс-тост: только 1-я полная или ручной запуск (silent после первой — без UI).
    const showSyncProgress =
        mode === 'manual' ||
        hasNeverPulled ||
        forcePullRequested === true;
    const _syncProg = () => (showSyncProgress && window.rbiSyncProgress) ? window.rbiSyncProgress : null;
    if (_syncProg()) _syncProg().begin();

    // RBI FIX: отслеживаем, что из облака пришли практики/эталоны,
    // чтобы обновить интерфейс без перезагрузки страницы.
    let pulledPracticesChanged = false;
    let pulledEtalonsChanged = false;

    window.renderSyncUI();

    // P2-0059 (С3): «стоп» — только если 90 с ничего не происходит (ни запроса в пути, ни ответа). Проход прерывается
    // через AbortController; «идёт синхронизация» и замок снимаются, когда проход действительно закончился (раньше —
    // сразу по 90 с, а проход шёл дальше: следующий таймер начинал второй).
    if (window.syncTimeout) clearInterval(window.syncTimeout);
    const myWatchdog = setInterval(() => {
        const NPw = window.RbiSyncNetPolicy;
        const netw = window.RbiSyncNet;
        if (!NPw || !netw || !myPass || myPass.signal.aborted) return;
        if (!NPw.passIdleTooLong(netw.activity, Date.now(), syncStartedAt)) return;
        myPass.abort();
        if (window.RbiSyncJournal) window.RbiSyncJournal.add({ k: 'stop', ms: Date.now() - syncStartedAt });
        if (_syncProg()) _syncProg().fail();
        safeToast("⚠️ Синхронизация прервана (слабый интернет). Повторим, как только появится связь.");
        console.log("[Sync] 90 с без ответа — проход остановлен.");
    }, 5000);
    window.syncTimeout = myWatchdog;

    const pCode = window.syncConfig.projectCode;
    const iName = window.syncConfig.engineerName;
    const stableInspectorId = `${pCode}_${iName}`.replace(/\s+/g, '_');
    // P2-0035b (ADR-070): «своё» (проверки, черновик, задачи, профиль, рейтинг) — по номеру учётки; ФИО — только подпись
    let myAuthId = null;
    // P2-0059: номер учётки — из сохранённого входа (без запроса); сеть — только если входа на устройстве нет, с ограничением времени
    try {
        const upTo = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
        const ses = await upTo(window.supabaseClient.auth.getSession(), 10000);
        myAuthId = (ses && ses.data && ses.data.session && ses.data.session.user && ses.data.session.user.id) || null;
        if (!myAuthId) {
            const got = await upTo(window.supabaseClient.auth.getUser(), 15000);
            myAuthId = (got && got.data && got.data.user && got.data.user.id) || null;
        }
    } catch (e) { myAuthId = null; }
    const own = (q, col) => (myAuthId ? q.eq(col, myAuthId) : q.eq('engineer_name', iName));   // без входа — как раньше
    // P2-0023: догрузка «с прошлого раза» — с запасом 15 мин назад (запись, отправленная во время
    // прошлой синхронизации или с отстающими часами, иначе не приходила никогда).
    let lastPullAt = window.RbiSyncPullPolicy
        ? window.RbiSyncPullPolicy.pullSinceWithOverlap(localStorage.getItem('rbi_sync_last_pull_at') || '')
        : (localStorage.getItem('rbi_sync_last_pull_at') || '');
    const lastPushAt = localStorage.getItem('rbi_sync_last_push_at') || '';
    // P2-0078: таблицы, которые раньше каждый проход читались целиком, — только изменения: у каждой своя метка
    // (sync-pull.policy tablePullSince / tablePullDone); полный проход (lastPullAt пуст) — целиком.
    const pullStartedAt = new Date().toISOString();
    const pullPol = window.RbiSyncPullPolicy && window.RbiSyncPullPolicy.tablePullSince ? window.RbiSyncPullPolicy : null;
    const tableSince = (t) => (pullPol ? pullPol.tablePullSince(localStorage, t, lastPullAt) : '');
    const tableDone = (t) => { if (pullPol) pullPol.tablePullDone(localStorage, t, pullStartedAt); };
    const changedSince = (q, since) => (since ? q.gt('updated_at', since) : q);

    const forceFullPullRequested = localStorage.getItem('rbi_force_full_pull') === '1';

    let localReferenceCount = 0;
    try {
        const countAlive = (arr) => (arr || []).filter(x => {
            const obj = x && x.data && typeof x.data === 'object' ? x.data : x;
            return obj && obj._deleted !== true && obj.is_deleted !== true;
        }).length;

        const localDocs = await dbGetAll('custom_docs') || [];
        const localNodes = await dbGetAll('custom_nodes') || [];
        const localTwi = await dbGetAll('twi_cards') || [];
        const localKb = await dbGetAll('app_assistant_kb') || [];
        const localUserTemplates = await dbGetAll('user_templates') || [];
        const localPractices = await dbGetAll('rbi_practices') || [];
        const localEtalons = await dbGetAll('rbi_etalon_acts') || [];
        const localReportTemplates = await dbGetAll('report_templates') || [];

        localReferenceCount =
            countAlive(localDocs) +
            countAlive(localNodes) +
            countAlive(localTwi) +
            countAlive(localKb) +
            countAlive(localUserTemplates) +
            countAlive(localPractices) +
            countAlive(localEtalons) +
            countAlive(localReportTemplates);
    } catch (e) {
        localReferenceCount = 0;
    }

    let needFullReferencePull = forceFullPullRequested || localReferenceCount === 0;

    if (needFullReferencePull) {
        console.log('[Sync] Полный pull справочников: локальная база знаний пустая или запрошен полный pull');
        lastPullAt = '';
    }
    // Счётчики реально отправленных данных.
    // Обязательно объявляем заранее, чтобы не было ReferenceError при первой синхронизации.

    let actuallyPushedChecks = 0;
    let actuallyPushedTasks = 0;
    let actuallyPushedProfiles = 0;
    // --- НОВОЕ: Проверка роли при синхронизации ---
    // --- НОВОЕ: Проверка роли при синхронизации ---
    // --- Проверка серверного профиля перед синхронизацией ---
    // P2-0016: при входе почтой роль и допуск — из прав компании (quality-bridge.ts), профиль PIN не читается.
    if (!(window.RBI && window.RBI.qualitySync)) try {
        const { data: roleData, error: roleError } = await window.supabaseClient
            .from('rbi_engineer_profiles')
            .select('role, cloud_status, assigned_contractor, contractor_name, assigned_projects, settings')
            .eq('inspector_id', stableInspectorId)
            .limit(1);

        if (roleError) throw roleError;

        if (roleData && roleData.length > 0) {
            const serverProfile = roleData[0];

            if (typeof appSettings !== 'undefined') {
                const fetchedRole = serverProfile.role || 'guest';
                const fetchedCloudStatus = serverProfile.cloud_status || 'pending';

                const fetchedContr =
                    serverProfile.contractor_name ||
                    serverProfile.assigned_contractor ||
                    '';

                // Читаем оба поля профиля и берём непустой источник (симметрично
                // permission.service.js:getAssignedProjects()) — пустой массив в
                // колонке assigned_projects больше не блокирует fallback на
                // settings.assignedProjects, если тот реально содержит данные.
                let fetchedProjects = [];
                const columnProjects = Array.isArray(serverProfile.assigned_projects) ? serverProfile.assigned_projects : null;
                const settingsProjects = (serverProfile.settings && Array.isArray(serverProfile.settings.assignedProjects))
                    ? serverProfile.settings.assignedProjects
                    : null;

                if (columnProjects && columnProjects.length > 0) {
                    fetchedProjects = columnProjects;
                } else if (settingsProjects && settingsProjects.length > 0) {
                    fetchedProjects = settingsProjects;
                } else {
                    fetchedProjects = columnProjects || settingsProjects || [];
                }

                let needUiUpdate = false;
                let roleOrModeChanged = false; // <-- Флаг для сброса кэша времени

                if (appSettings.userRole !== fetchedRole) {
                    appSettings.userRole = fetchedRole;
                    needUiUpdate = true;
                    roleOrModeChanged = true; // Роль изменилась -> нужен полный pull
                }

                if (appSettings.cloudStatus !== fetchedCloudStatus) {
                    appSettings.cloudStatus = fetchedCloudStatus;
                    needUiUpdate = true;
                }

                if (appSettings.assignedContractor !== fetchedContr) {
                    appSettings.assignedContractor = fetchedContr;
                    appSettings.contractorName = fetchedContr;
                    needUiUpdate = true;
                }

                if (Array.isArray(fetchedProjects)) {
                    if (typeof ObjectDirectory !== 'undefined'
                        && typeof ObjectDirectory.normalizeAssignedProjectsList === 'function') {
                        fetchedProjects = ObjectDirectory.normalizeAssignedProjectsList(fetchedProjects);
                    }
                    // Только approved-профиль имеет право заменить локальные подтверждённые объекты.
                    // pending/guest не должен стирать заявки пользователя.
                    if (fetchedCloudStatus === 'approved') {
                        if (localStorage.getItem('rbi_last_approved_pull_done') !== '1') {
                            localStorage.setItem('rbi_force_full_pull', '1');
                            localStorage.setItem('rbi_cloud_dirty', '1');
                            localStorage.setItem('rbi_last_approved_pull_done', '1');

                            // Разовая сверка офлайн-истории со справочником объектов при
                            // первом approve (current_plan.md §8/§9, решение пользователя:
                            // запускать после approve, не сразу при подключении) — отправляет
                            // админу заявки на объекты из локальной истории, не совпадающие
                            // со справочником, через уже существующий экран «Заявки из ПК СК».
                            if (window.ObjectDirectory && typeof window.ObjectDirectory.scanOfflineHistoryForNewUser === 'function') {
                                window.ObjectDirectory.scanOfflineHistoryForNewUser().catch(function (e) {
                                    console.warn('[Sync] scanOfflineHistoryForNewUser не выполнена:', e);
                                });
                            }
                        }
                        // Сортируем перед сравнением: сервер может отдавать тот же
                        // набор объектов в другом порядке — иначе needUiUpdate
                        // срабатывает на каждом sync и full-render схлопывает UI.
                        const normProjects = (arr) => JSON.stringify([...(arr || [])].map(String).sort());
                        const oldProjects = normProjects(appSettings.assignedProjects);
                        const newProjects = normProjects(fetchedProjects);

                        if (oldProjects !== newProjects) {
                            appSettings.assignedProjects = fetchedProjects;
                            appSettings.pendingAssignedProjects = [];
                            // Заявки на снятие, которые сервер уже применил (объект
                            // реально пропал из fetchedProjects) — больше не "в ожидании".
                            if (Array.isArray(appSettings.pendingUnassignProjects)) {
                                const fetchedSet = new Set(
                                    (fetchedProjects || []).map(function (p) {
                                        if (typeof ObjectDirectory !== 'undefined'
                                            && typeof ObjectDirectory.resolveProjectId === 'function') {
                                            return ObjectDirectory.resolveProjectId(p) || String(p);
                                        }
                                        return String(p);
                                    })
                                );
                                appSettings.pendingUnassignProjects = appSettings.pendingUnassignProjects.filter(function (key) {
                                    let id = key;
                                    if (typeof ObjectDirectory !== 'undefined'
                                        && typeof ObjectDirectory.resolveProjectId === 'function') {
                                        id = ObjectDirectory.resolveProjectId(key) || key;
                                    }
                                    return fetchedSet.has(String(id)) || fetchedProjects.includes(key);
                                });
                            }
                            needUiUpdate = true;

                            // 1. Команды для синхронизатора (качаем заново данные + файлы)
                            localStorage.setItem('rbi_force_full_pull', '1');
                            localStorage.setItem('rbi_cloud_dirty', '1');
                            localStorage.removeItem('rbi_sync_last_pull_at');
                            // Задумано: новый набор объектов → полный офлайн-пакет заново
                            // (чужие записи чистит purge; недостающие/новые URL докачает очередь).
                            // Permanent 404 в queue — fail-fast, без тройных ретраев.
                            localStorage.removeItem('rbi_first_full_offline_cache_done');
                            localStorage.removeItem('rbi_first_full_offline_cache_started_at');
                            localStorage.setItem('rbi_need_full_offline_cache', '1');
                            // 2. Запускаем физическую чистку телефона от чужих объектов
                            if (typeof window.purgeDataOutsideAssignedProjects === 'function') {
                                window.purgeDataOutsideAssignedProjects(fetchedProjects);
                            }
                        }
                    } else {
                        if (!Array.isArray(appSettings.assignedProjects)) {
                            appSettings.assignedProjects = [];
                        }

                        if (!Array.isArray(appSettings.pendingAssignedProjects)) {
                            appSettings.pendingAssignedProjects = [];
                        }

                        if (!Array.isArray(appSettings.pendingUnassignProjects)) {
                            appSettings.pendingUnassignProjects = [];
                        }
                    }
                }

                // Руководящим ролям автоматически включаем режим "Вся команда"
                if (window.RBI.services.permissions && window.RBI.services.permissions.isLeadership()) {
                    if (window.syncConfig.syncMode !== 'full') {
                        window.syncConfig.syncMode = 'full';
                        localStorage.setItem('rbi_sync_config', JSON.stringify(window.syncConfig));
                        needUiUpdate = true;
                        roleOrModeChanged = true; // Права расширились -> нужен полный pull
                    }
                }

                // СБРОС КЭША: права расширились → полный pull данных + полный офлайн-пакет.
                // (Задумано пользователем: смена роли/режима = перекачка под новый scope.)
                // Ложный цикл «Роль изменилась» на каждом reload был из-за cloudSettingsBuf
                // (роль не сохранялась в IDB) — тот баг уже починен; 404 в очереди — fail-fast.
                if (roleOrModeChanged) {
                    localStorage.setItem('rbi_force_full_pull', '1');
                    localStorage.removeItem('rbi_sync_last_pull_at');
                    localStorage.removeItem('rbi_first_full_offline_cache_done');
                    localStorage.removeItem('rbi_first_full_offline_cache_started_at');
                    localStorage.setItem('rbi_need_full_offline_cache', '1');
                    console.log('[Sync] Роль изменилась. Запрошен полный PULL базы + офлайн-кэш.');
                }

                // АВТОМАТИЧЕСКИ Включаем ИИ для штатных сотрудников
                if (fetchedRole !== 'guest' && fetchedRole !== 'contractor') {
                    if (typeof appSettings !== 'undefined' && !appSettings.aiEnabled) {
                        appSettings.aiEnabled = true;
                        appSettings.aiAuthMode = 'role'; // Используем корпоративный пароль
                        needUiUpdate = true;
                        console.log("[Sync] Корпоративный AI активирован автоматически.");
                    }
                }

                // UI-prefs из облака (fontSize, theme, motion…) — только если
                // cloud settingsUpdatedAt новее локального. Роль/объекты не трогаем:
                // они уже применены из колонок профиля выше.
                const cloudSettingsBag = (serverProfile.settings && typeof serverProfile.settings === 'object')
                    ? serverProfile.settings
                    : null;
                if (cloudSettingsBag) {
                    const localPrefsTs = Number(appSettings.settingsUpdatedAt || 0);
                    const cloudPrefsTs = Number(cloudSettingsBag.settingsUpdatedAt || 0);
                    if (cloudPrefsTs > localPrefsTs) {
                        const AUTH_PREF_KEYS = {
                            userRole: 1,
                            cloudStatus: 1,
                            assignedProjects: 1,
                            pendingAssignedProjects: 1,
                            pendingUnassignProjects: 1,
                            assignedContractor: 1,
                            contractorName: 1,
                            engineerName: 1,
                            key: 1
                        };
                        Object.keys(cloudSettingsBag).forEach((k) => {
                            if (AUTH_PREF_KEYS[k]) return;
                            appSettings[k] = cloudSettingsBag[k];
                        });
                        appSettings.settingsUpdatedAt = cloudPrefsTs;
                        // Зеркало темы в localStorage — иначе reload перетирает облачную тему
                        try {
                            // P2-0051: облачная «rbi-auto-v3» старше переноса на устройстве = прежняя тема по умолчанию → «Стандартная · Авто»
                            if (typeof window.rbiMigrateTheme === 'function' && appSettings.theme) {
                                appSettings.theme = window.rbiMigrateTheme(appSettings.theme, cloudPrefsTs);
                            }
                            const t = appSettings.theme;
                            if (typeof window.rbiSaveThemePreference === 'function') {
                                window.rbiSaveThemePreference(t || 'std-auto');
                            } else if (t) {
                                localStorage.setItem('rbi_theme_preference', t);
                            }
                        } catch (_) { /* ignore */ }
                        needUiUpdate = true;
                        console.log('[Sync] UI-настройки профиля подтянуты из облака.');
                    }
                }

                if (typeof dbPut === 'function') {
                    await dbPut('app_settings', { key: 'user_prefs', ...appSettings });
                }

                if (needUiUpdate && window.RBI.services.permissions) {
                    window.RBI.services.permissions.applyUIConstraints();

                    if (typeof applySettingsToUI === 'function') applySettingsToUI();
                    if (typeof renderSyncUI === 'function') renderSyncUI();
                    if (typeof ObjectDirectory !== 'undefined') ObjectDirectory.initUI();

                    // --- НОВОЕ: Очистка кэша при смене роли; UI — только dirty (§5) ---
                    if (typeof window.clearMetricsCache === 'function') window.clearMetricsCache();
                    if (typeof gameGenerateWeeklyPlan === 'function') gameGenerateWeeklyPlan(true);
                    if (window.RBI?.utils?.syncUi?.markDirty) {
                        window.RBI.utils.syncUi.markDirty(['analytics', 'history', 'sk', 'tasks', 'reference']);
                    } else if (window.syncDirtyFlags) {
                        window.syncDirtyFlags.analytics = true;
                        window.syncDirtyFlags.history = true;
                        window.syncDirtyFlags.sk = true;
                    }
                    // ------------------------------------------------------------------
                }
            }
        } else {
            // Профиля ещё нет: считаем пользователя неподтверждённым.
            if (typeof appSettings !== 'undefined') {
                appSettings.userRole = 'guest';
                appSettings.cloudStatus = 'pending';

                if (typeof dbPut === 'function') {
                    await dbPut('app_settings', { key: 'user_prefs', ...appSettings });
                }

                if (window.RBI.services.permissions) window.RBI.services.permissions.applyUIConstraints();
            }
        }

        // После получения серверной роли пересчитываем право push.
        canPush = window.RBI.services.permissions ? window.RBI.services.permissions.canPush() : false;

        if (!canPush) {
            console.log('[Sync] Push заблокирован. Роль:', appSettings?.userRole, 'Статус:', appSettings?.cloudStatus);
        }

    } catch (e) {
        console.warn("[Sync] Не удалось обновить роль:", e.message);

        // Если профиль не удалось проверить — запрещаем отправку,
        // но не запрещаем pull и локальную работу.
        canPush = false;
    }
    // RBI FIX: если в ходе проверки роли появился запрос полного pull,
    // применяем его сразу в этой же синхронизации, а не на следующий запуск.
    if (localStorage.getItem('rbi_force_full_pull') === '1') {
        needFullReferencePull = true;
        lastPullAt = '';
        console.log('[Sync] Полный pull применён после обновления роли.');
    }
    // ==============================================
    // ==============================================
    // ==============================================
    // === ГЛОБАЛЬНЫЕ ФУНКЦИИ ЗАГРУЗКИ ФОТО ===
    window.isHttpUrl = function (v) { return typeof v === 'string' && /^https?:\/\//i.test(v); };
    window.isLocalUrl = function (v) { return typeof v === 'string' && v.startsWith('local://'); };
    window.isDataUrl = function (v) { return typeof v === 'string' && v.startsWith('data:'); };

    window.getStoragePathFromPublicUrl = function (url, bucketName) {
        if (!url || !bucketName) return '';
        const marker = `/storage/v1/object/public/${bucketName}/`;
        let idx = url.indexOf(marker);
        let len = marker.length;
        if (idx === -1) {
            // P2-0016: файлы компании — в бакете quality-<бакет>, путь <компания>/… (обёртка Storage моста не удвоит компанию)
            const companyMarker = `/storage/v1/object/public/quality-${bucketName}/`;
            idx = url.indexOf(companyMarker);
            len = companyMarker.length;
        }
        if (idx === -1) return '';
        return decodeURIComponent(url.slice(idx + len));
    };

    window.dataUrlToBlob = function (dataUrl) {
        const parts = dataUrl.split(',');
        const mime = (parts[0].match(/data:(.*?);base64/) || [])[1] || 'image/jpeg';
        const binary = atob(parts[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return { blob: new Blob([bytes], { type: mime }), mime };
    };

    window.extFromMime = function (mime) {
        if (!mime) return 'bin';
        if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
        if (mime.includes('png')) return 'png';
        if (mime.includes('webp')) return 'webp';
        if (mime.includes('pdf')) return 'pdf';
        return 'bin';
    };

    // Supabase Storage: только ASCII в ключах (кириллица в имени инженера ломает upload)
    const _ruStorageTranslit = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z',
        'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
        'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh',
        'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };

    window.sanitizeStorageKeySegment = function (segment) {
        const raw = String(segment || '').trim();
        if (!raw) return 'unknown';

        let latin = '';
        for (const ch of raw) {
            const lower = ch.toLowerCase();
            if (_ruStorageTranslit[lower] !== undefined) {
                latin += _ruStorageTranslit[lower];
            } else {
                latin += ch;
            }
        }

        const safe = latin
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');

        return safe || 'unknown';
    };

    window.sanitizeStoragePath = function (path) {
        return String(path || '')
            .replace(/^\/+|\/+$/g, '')
            .split('/')
            .map(seg => window.sanitizeStorageKeySegment(seg))
            .filter(Boolean)
            .join('/');
    };

    window.localPhotoToBlob = async function (localUrl) {
        if (!window.isLocalUrl(localUrl) || typeof dbGet !== 'function') return null;
        const rec = await dbGet('app_photos', localUrl);
        if (!rec || !rec.data) return null;
        const mime = rec.mimeType || 'image/jpeg';
        return { blob: new Blob([rec.data], { type: mime }), mime };
    };

    window.rbiUploadAsset = async function (value, bucketName, pathPrefix, filePrefix) {
        if (!value) return value;
        if (window.isHttpUrl(value)) return value;

        let blobData = null;
        const wasLocalUrl = window.isLocalUrl(value);

        if (wasLocalUrl) {
            // P2-0023: local:// уже отправленного фото — псевдоним на облачный адрес, грузить нечего.
            try {
                const aliasRec = typeof dbGet === 'function' ? await dbGet('app_photos', value) : null;
                const aliasUrl = aliasRec && !aliasRec.data
                    ? (aliasRec.aliasOf || aliasRec.alias_of || aliasRec.sourceUrl || aliasRec.source_url || '')
                    : '';
                if (aliasUrl && window.isHttpUrl(aliasUrl)) return aliasUrl;
            } catch (_e) { /* идём обычным путём */ }
            blobData = await window.localPhotoToBlob(value);
        }
        else if (window.isDataUrl(value)) blobData = window.dataUrlToBlob(value);
        else return value;

        if (!blobData || !blobData.blob) {
            if (wasLocalUrl) {
                // RBI FIX (гонка "PDF/фото не синхронизируется"): файл ещё не успел
                // записаться в IndexedDB к моменту запуска синхронизации. Раньше здесь
                // молча возвращалась исходная ссылка local://..., она уходила в облако
                // как обычная строка, а запись сразу помечалась synced — повторной
                // попытки отправки уже никогда не происходило. Теперь бросаем ошибку,
                // чтобы pushCloudObject для этого объекта прервался, запись осталась
                // not_synced и была отправлена повторно на следующем цикле синхронизации.
                // P2-0023: ошибка с кодом — вызывающий помечает объект «нужно внимание» и идёт дальше,
                // а не роняет всю синхронизацию каждую минуту.
                if (window.RbiSyncRetryPolicy) throw window.RbiSyncRetryPolicy.makeMissingFileError(value);
                throw new Error(`[Sync] Локальный файл не найден в IndexedDB (возможна гонка записи): ${value}`);
            }
            return value;
        }

        const ext = window.extFromMime(blobData.mime);
        const arrayBuffer = await blobData.blob.arrayBuffer();

        // 1. УМНАЯ ДЕДУПЛИКАЦИЯ: Вычисляем SHA-256 хеш файла
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashStr = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // 2. Формируем путь (только ASCII — иначе StorageApiError: Invalid key)
        const cleanPrefix = window.sanitizeStoragePath(pathPrefix || 'hashed_assets');

        const cleanFilePrefix = window.sanitizeStorageKeySegment(filePrefix || 'file');

        const storagePath = `${cleanPrefix}/${cleanFilePrefix}_${hashStr}.${ext}`;

        // 3. Получаем публичный URL
        const { data: urlData } = window.supabaseClient.storage.from(bucketName).getPublicUrl(storagePath);
        const publicUrl = urlData.publicUrl;
        const fileSizeBytes = blobData.blob.size || arrayBuffer.byteLength || 0;

        // 4. Проверяем наличие файла именно в той папке, куда собираемся вернуть ссылку.
        // Раньше всегда проверялась папка hashed_assets, из-за чего можно было вернуть URL на файл,
        // который фактически не был загружен в нужный путь inspection/practice/etalon.
        const storageSlashIndex = storagePath.lastIndexOf('/');
        const storageDir = storageSlashIndex >= 0 ? storagePath.slice(0, storageSlashIndex) : '';
        const storageFileName = storageSlashIndex >= 0 ? storagePath.slice(storageSlashIndex + 1) : storagePath;

        // P2-0078: «есть ли файл» — запрос одного файла (exists, HEAD), а не список папки (storage.search по всей папке на сервере —
        // до 10 с). Список — только запасной путь: сервер не умеет exists или файл после загрузки «ещё не виден».
        const objectExistsInBucket = async function (afterUpload) {
            try {
                const bucket = window.supabaseClient.storage.from(bucketName);
                if (typeof bucket.exists === 'function') {
                    const { data } = await bucket.exists(storagePath);
                    if (data === true) return true;
                    if (!afterUpload) return false;
                }
            } catch (_e) { /* запасной путь — список */ }
            // После upload Storage иногда отвечает с лагом — 2–3 попытки list.
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const { data: listed, error: listErr } = await window.supabaseClient.storage
                        .from(bucketName)
                        .list(storageDir, { search: storageFileName });
                    if (!listErr && Array.isArray(listed) && listed.some((f) => f && f.name === storageFileName)) {
                        return true;
                    }
                } catch (_e) { /* retry */ }
                if (attempt < 2) {
                    await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
                }
            }
            return false;
        };

        if (await objectExistsInBucket()) {
            console.log('[Sync] Дедупликация сработала (файл уже есть):', publicUrl);
            return publicUrl;
        }

        // 5. Если файла нет - загружаем
        const { error } = await window.supabaseClient.storage
            .from(bucketName)
            .upload(storagePath, blobData.blob, {
                upsert: true,
                cacheControl: '31536000',
                contentType: blobData.mime
            });

        if (error) {
            console.error('[Sync] Ошибка загрузки файла:', error);
            throw error;
        }

        // 6. Не возвращаем publicUrl, пока объект реально не виден в бакете
        // (иначе в записи остаётся сирота → offline-cache 404).
        if (!(await objectExistsInBucket(true))) {
            console.error('[Sync] Upload OK, но объект не найден в Storage:', bucketName, storagePath);
            throw new Error(`[Sync] Файл не подтверждён в Storage после upload: ${bucketName}/${storagePath}`);
        }

        return publicUrl;
    };

    // RBI NEW: регистрация облачных файлов внутри проектных объектов.
    // Не регистрирует inspection_photo, потому что фото проверок уже пишутся отдельно.
    window.rbiRegisterObjectFilesToRegistry = async function (objectType, objectId, obj, bucketName) {
        try {
            if (!window.RbiStorageManager || typeof window.RbiStorageManager.registerUploadedFile !== 'function') return;
            if (!obj || !bucketName) return;

            const pCode = window.syncConfig?.projectCode || obj.project_code || 'LOCAL';
            const owner = obj.owner || obj.author || obj.created_by || obj.uploaded_by || window.syncConfig?.engineerName || '';

            const typeMap = {
                custom_twi_card: 'twi_file',
                custom_doc: 'custom_doc_pdf',
                custom_node: 'node_file',
                practice: 'practice_file',
                etalon: 'etalon_file',
                report: 'report_pdf',
                assistant_kb: 'assistant_kb_file'
            };

            const entityType = typeMap[objectType] || `${objectType}_file`;

            const walk = async (value, path) => {
                if (!value) return;

                if (typeof value === 'string' && value.startsWith('http') && value.includes('/storage/v1/object/')) {
                    const storagePath = getStoragePathFromPublicUrl(value, bucketName);

                    if (storagePath) {
                        const registeredFile = await window.RbiStorageManager.registerUploadedFile({
                            project_code: pCode,
                            entity_type: entityType,
                            entity_id: String(objectId || obj.id || ''),
                            field_path: path,
                            bucket: bucketName,
                            storage_path: storagePath,
                            public_url: value,
                            original_name: `${objectType}_${objectId || obj.id || ''}`,
                            mime_type: '',
                            size_bytes: 0,
                            uploaded_by: owner,
                            cache_policy: 'auto',
                            cache_status: 'cached_cloud'
                        });

                        if (
                            registeredFile &&
                            window.RbiStorageManager &&
                            typeof window.RbiStorageManager.updateRegistryFileSizeByUrl === 'function'
                        ) {
                            await window.RbiStorageManager.updateRegistryFileSizeByUrl(value);
                        }
                    }
                }

                if (Array.isArray(value)) {
                    for (let i = 0; i < value.length; i++) {
                        await walk(value[i], `${path}.${i}`);
                    }
                    return;
                }

                if (typeof value === 'object') {
                    for (const key of Object.keys(value)) {
                        await walk(value[key], path ? `${path}.${key}` : key);
                    }
                }
            };

            await walk(obj, '');

        } catch (e) {
            console.warn('[FileRegistry] Не удалось зарегистрировать файлы объекта:', objectType, objectId, e);
        }
    };

    function getChecklistItem(templateKey, itemId) {
        try {
            if (!templateKey) return null;

            const type = templateKey.split('_')[0];
            const key = templateKey.replace(type + '_', '');

            let groups = [];

            if (type === 'sys' && typeof window.SYSTEM_TEMPLATES !== 'undefined' && window.SYSTEM_TEMPLATES[key]) {
                groups = window.SYSTEM_TEMPLATES[key].groups || [];
            }

            if (type === 'user' && window.userTemplates && window.userTemplates[key]) {
                groups = window.userTemplates[key].groups || [];
            }

            const flat = groups.flatMap(g => g.items || []);
            return flat.find(x => String(x.id) === String(itemId)) || null;
        } catch (e) {
            return null;
        }
    }

    async function pullEngineerRatingAlways() {
        try {
            const { data } = await window.supabaseClient
                .from('rbi_engineer_ratings')
                .select('*')
                .eq('project_code', pCode)
                .or('is_deleted.is.null,is_deleted.eq.false')   // P2-0035b: скрытые (тестовые учётки старого РБИ) — не в рейтинге
                .order('pi', { ascending: false });

            window.serverGlobalRating = (data || []).map(row => ({
                ...(row.rating_data || {}),
                name: row.rating_data?.name || row.engineer_name,
                pi: row.pi || row.rating_data?.pi || 0,
                checksCount: row.checks_count || row.rating_data?.checksCount || 0,
                levelObj: row.rating_data?.levelObj || { name: row.level_name || 'Инженер' }
            }));
        } catch (e) {
            console.warn("[Sync] Рейтинг инженеров не подтянут:", e.message);
        }
    }

    // profile_data.gameLogs пушится каждый sync (см. ниже, "8. PUSH: рейтинг
    // инженера" / профиль), но раньше никогда не читался обратно — при
    // первом заходе с нового устройства/после очистки локальных данных
    // лог-бонусы (TWI/AI/встречи и т.п.) не восстанавливались. Мерж —
    // строго аддитивный (concat + дедуп той же функцией, что и локальный
    // restore), не меняет остальную логику pull/push.
    async function pullOwnGameLogsFromCloud() {
        try {
            const { data, error } = await window.supabaseClient
                .from('rbi_engineer_profiles')
                .select('profile_data')
                .eq(myAuthId ? 'auth_user_id' : 'inspector_id', myAuthId || stableInspectorId)   // P2-0035b: свой профиль — по номеру учётки
                .limit(1);
            if (error) throw error;
            const cloudLogs = data && data[0] && data[0].profile_data && Array.isArray(data[0].profile_data.gameLogs)
                ? data[0].profile_data.gameLogs
                : [];
            if (cloudLogs.length === 0) return;
            const current = (typeof window.gameActionLogs !== 'undefined' && Array.isArray(window.gameActionLogs)) ? window.gameActionLogs : [];
            const merged = current.concat(cloudLogs);
            if (typeof gameNormalizeActionLogs === 'function') {
                const norm = gameNormalizeActionLogs(merged);
                window.gameActionLogs = norm.logs;
            } else {
                window.gameActionLogs = merged;
            }
            if (typeof gameSaveLogs === 'function') gameSaveLogs();
        } catch (e) {
            console.warn('[Sync] XP-логи из облака не подтянуты:', e.message);
        }
    }

    // P2-0059 (С4, С5): свои осмотры уходят первыми в проходе — до скачивания чужого — и порциями по PUSH_CHUNK:
    // после каждой порции — отметка «отправлено»; обрыв — следующий проход продолжает с неотправленных.
    // Второй вызов на прежнем месте отправляет то, что записали за время загрузки (отправленное не повторяется).
    // P2-0059 доработка (З1): id → updatedAt после первого вызова; второй вызов берёт новые записи и изменённые за время прохода
    const ownSeenThisPass = new Map();
    const recStamp = (r) => String((r && (r.updatedAt || r.updated_at)) || '');
    async function rbiPushOwnInspections() {
        if (!canPush) return;
        let currentHistory = [];
        if (typeof dbForEachCursor === 'function') {
            currentHistory = [];
            await dbForEachCursor('app_history', (x) => { if (x) currentHistory.push(x); });
        } else {
            currentHistory = typeof dbGetAll === 'function' ? (await dbGetAll('app_history') || []) : [];
        }

        // P2-0061: «чьё и можно ли» решает общее правило (sync-access.policy.js) ниже, у каждой записи — с причиной;
        // раньше здесь чужие по ФИО молча отсеивались и навсегда оставались «не отправлено».

        // Блокируем "эхо" облачных проверок, но не теряем старые несинхронизированные записи
        currentHistory = currentHistory.filter(i => {
            if (!i) return false;

            const status = i.syncStatus || i.sync_status || '';
            const source = i.source || '';

            // P2-0023: «нужно внимание» (фото нет на устройстве) — доработка 2: повтор по расписанию 2/5/10 мин;
            // после ATTENTION_ASK_USER_AFTER неудач ждём решения пользователя («Отправить без этого фото» в Истории).
            if (window.RbiSyncRetryPolicy && window.RbiSyncRetryPolicy.isAttention(i)) {
                const rpA = window.RbiSyncRetryPolicy;
                if (rpA.attentionNeedsUser(i)) return false;
                if (!rpA.attentionRetryDue(i, Date.now())) { rbiNoteAttentionRetry(i.syncAttentionRetryAt); return false; }
            }

            // Уже синхронизированное облачное эхо не отправляем обратно. P2-0061 (ТД 313): отклонённая сервером («blocked») —
            // не эхо, даже если до P2-0061 ей поставили source 'cloud': её перепроверяет правило
            if (status === 'synced' || (source === 'cloud' && status !== 'blocked')) return false;

            // Любые несинхронизированные / заблокированные / локальные проверки отправляем всегда,
            // даже если они старше последней синхронизации.
            if (status !== 'synced') return true;
            if (source === 'local') return true;

            if (!lastPushAt) return true;

            const lastPushTime = new Date(lastPushAt).getTime();
            const t = new Date(i.updatedAt || i.updated_at || i.date || 0).getTime();

            return !t || Number.isNaN(t) || t >= lastPushTime;
        });

        currentHistory = currentHistory.filter(i => {
            const seen = ownSeenThisPass.get(String(i.id));
            return seen === undefined || seen !== recStamp(i);
        });
        currentHistory.forEach(i => ownSeenThisPass.set(String(i.id), recStamp(i)));
        const NPc = window.RbiSyncNetPolicy;
        // P2-0061 (З6): осмотры из порции, которую сервер отклонил целиком, уходят по одной — отказ получает только виновная запись
        const splitOnes = currentHistory.filter(i => i && i.syncSplit);
        const restHist = currentHistory.filter(i => !(i && i.syncSplit));
        const histChunks = splitOnes.map(i => [i]).concat(NPc ? NPc.chunks(restHist, NPc.PUSH_CHUNK) : (restHist.length ? [restHist] : []));
        for (const chunkHist of histChunks) {
            // остановленный проход (90 с без ответа) — следующие порции не начинаем
            if (myPass && myPass.signal.aborted) {
                // ТД №317: остановка — сбой связи: отметка «есть что отправить» и пауза-проверка, а не «всё ок»
                pushErrors++; rbiNoteErr(window.RbiSyncNetPolicy ? window.RbiSyncNetPolicy.makeTimeoutError(window.RbiSyncNetPolicy.PASS_IDLE_LIMIT_MS) : new Error('aborted'));
                break;
            }
            let chunkFailed = false;
            let chunkError = null;
            const inspectionsBatch = [];
            const itemsBatch = [];
            const photosBatch = [];
            const localHistoryToUpdate = [];

            // Собираем пакеты данных
            for (const c of chunkHist) {
                const inspectionId = String(c.id);
                const isDeleted = c._deleted === true;

                // Ретроактивная нормализация объекта
                if (typeof ObjectDirectory !== 'undefined' && (!c.project_canonical_key || c.project_canonical_key === c.projectName || c.project_canonical_key === c.project_display_name)) {
                    try {
                        const match = await ObjectDirectory.normalizeProjectName(c.projectName || c.project_display_name);
                        if (match && match.status === 'matched') {
                            c.project_canonical_key = match.canonical_key;
                            c.project_display_name = match.display_name;
                            c.projectName = match.display_name;
                        }
                    } catch (err) { }
                }

                // Проверка прав на отправку — P2-0061: общее правило устройства, зеркало серверного (по id автора, объекта, фирмы)
                {
                    const gate = rbiAccessGate('inspection', c, canPush);
                    if (!gate.ok) { if (gate.changed) localHistoryToUpdate.push(c); continue; }
                }

                const uploadedPhotos = {};
                const storagePathsToRemove = [];

                // ПАРАЛЛЕЛЬНАЯ отправка фото для одной инспекции.
                // Множественные фото к пункту чек-листа (B1): c.photos[itemId] —
                // массив (window.normalizeItemPhotos покрывает и старые записи
                // со строкой). Каждый элемент массива грузится и пишется отдельной
                // строкой rbi_inspection_photos с собственным photo_index — id
                // строки теперь `${inspectionId}_${itemId}_${photoIndex}` (было
                // `..._main`, всегда photoIndex=0 для единственного фото).
                const photoItemIds = Object.keys(c.photos || {});
                const photoPromises = photoItemIds.map(async (itemId) => {
                    const oldPhotosArr = window.normalizeItemPhotos(c.photos[itemId]);
                    const uploadedArr = [];

                    if (isDeleted) {
                        oldPhotosArr.forEach((oldPhoto, photoIndex) => {
                            const path = getStoragePathFromPublicUrl(oldPhoto, 'inspection-photos');
                            if (path) storagePathsToRemove.push(path);
                            if (oldPhoto && isHttpUrl(oldPhoto)) {
                                photosBatch.push({
                                    id: window.RbiIds.childId(inspectionId, `${inspectionId}_${itemId}_${photoIndex}`, 'photo', itemId, photoIndex), inspection_id: inspectionId, project_code: pCode, project_canonical_key: c.project_canonical_key || c.projectName || '',
                                    source: 'cloud', sync_status: 'synced', sync_block_reason: '', item_id: String(itemId), photo_index: photoIndex, photo_type: 'inspection',
                                    bucket_name: 'inspection-photos', storage_path: path, public_url: oldPhoto, updated_at: new Date().toISOString()
                                });
                            }
                        });
                        return;
                    }

                    for (let photoIndex = 0; photoIndex < oldPhotosArr.length; photoIndex++) {
                        const oldPhoto = oldPhotosArr[photoIndex];
                        let localPhotoSizeBytes = 0; let localPhotoMimeType = '';
                        try {
                            if (oldPhoto && oldPhoto.startsWith('local://') && typeof dbGet === 'function') {
                                const localPhotoRecord = await dbGet('app_photos', oldPhoto);
                                if (localPhotoRecord && localPhotoRecord.data) {
                                    localPhotoSizeBytes = localPhotoRecord.data.byteLength || localPhotoRecord.sizeBytes || 0;
                                    localPhotoMimeType = localPhotoRecord.mimeType || localPhotoRecord.mime_type || '';
                                }
                            }
                        } catch (e) { }

                        const publicUrl = await window.rbiUploadAsset(oldPhoto, 'inspection-photos', `${pCode}/inspections/${inspectionId}/${itemId}_${photoIndex}`, 'photo');
                        uploadedArr[photoIndex] = publicUrl;

                        if (publicUrl && isHttpUrl(publicUrl)) {
                            const photoStoragePath = getStoragePathFromPublicUrl(publicUrl, 'inspection-photos');
                            photosBatch.push({
                                id: window.RbiIds.childId(inspectionId, `${inspectionId}_${itemId}_${photoIndex}`, 'photo', itemId, photoIndex), inspection_id: inspectionId, project_code: pCode, project_canonical_key: c.project_canonical_key || c.projectName || '',
                                source: 'cloud', sync_status: 'synced', sync_block_reason: '', item_id: String(itemId), photo_index: photoIndex, photo_type: 'inspection',
                                bucket_name: 'inspection-photos', storage_path: photoStoragePath, public_url: publicUrl, updated_at: new Date().toISOString()
                            });

                            if (oldPhoto && oldPhoto.startsWith('local://') && typeof PhotoManager !== 'undefined') {
                                await PhotoManager.linkCloudToLocal(oldPhoto, publicUrl);
                            }
                            if (window.RbiStorageManager && typeof window.RbiStorageManager.registerUploadedFile === 'function') {
                                await window.RbiStorageManager.registerUploadedFile({
                                    project_code: pCode, entity_type: 'inspection_photo', entity_id: inspectionId, field_path: `photos.${itemId}.${photoIndex}`,
                                    bucket: 'inspection-photos', storage_path: photoStoragePath, public_url: publicUrl, original_name: `inspection_${inspectionId}_${itemId}_${photoIndex}`,
                                    mime_type: localPhotoMimeType, size_bytes: localPhotoSizeBytes, uploaded_by: iName, cache_policy: 'auto', cache_status: 'cached_cloud'
                                });
                            }
                        }
                    }

                    uploadedPhotos[itemId] = uploadedArr;
                });

                // P2-0023: ошибка фото одной проверки не роняет всю синхронизацию.
                // Доработка 3: allSettled — обрезаем строки фото только после завершения ВСЕХ загрузок,
                // иначе опоздавшие загрузки допишут строки «удержанной» проверки (Promise.all отклоняется на первой ошибке).
                const photosBatchBefore = photosBatch.length;
                const photoResults = await Promise.allSettled(photoPromises); // Дожидаемся фоток
                const photoFails = photoResults.filter(r => r.status === 'rejected').map(r => r.reason);
                if (photoFails.length) {
                    photosBatch.length = photosBatchBefore; // строки фото этой проверки — не отправляем
                    const rp = window.RbiSyncRetryPolicy;
                    // сеть/сервер важнее «нет файла»: такая ошибка — просто повтор позже
                    const photoErr = photoFails.find(e => !(rp && rp.isMissingFileError(e))) || photoFails[0];
                    if (rp && rp.isMissingFileError(photoErr)) {
                        console.warn('[Sync] Проверка помечена «нужно внимание» (фото нет на устройстве):', inspectionId, photoErr.message);
                        // Доработка 2: запоминаем, каких фото нет (для «Отправить без этого фото»), и время повтора.
                        const missing = [];
                        photoResults.forEach((r, idx) => {
                            if (r.status === 'rejected' && rp.isMissingFileError(r.reason)) {
                                missing.push({ itemId: String(photoItemIds[idx]), ref: String(r.reason.ref || '') });
                            }
                        });
                        const missingNames = missing.map(m => {
                            const info = typeof getChecklistItem === 'function' ? getChecklistItem(c.templateKey || '', m.itemId) : null;
                            return (info && info.n) || ((c.details || {})[m.itemId] || {}).name || ('№ ' + m.itemId);
                        });
                        rp.markAttention(c, rp.missingPhotoReason(missingNames));
                        c.syncMissingPhotos = missing;
                        rbiNoteAttentionRetry(c.syncAttentionRetryAt);
                        localHistoryToUpdate.push(c);
                        syncAttentionCount++;
                    } else {
                        console.warn('[Sync] Фото проверки не отправлены, повторим позже:', inspectionId, photoErr && photoErr.message);
                        pushErrors++; rbiNoteErr(photoErr);
                    }
                    continue;
                }

                if (storagePathsToRemove.length > 0) {
                    await window.supabaseClient.storage.from('inspection-photos').remove(storagePathsToRemove);
                }

                // Формируем пакет самой проверки
                const inspContractorId = String(c.contractorId || '').trim();
                const inspProjectId = String(c.projectId || c.project_id || '').trim();
                const inspPayload = {
                    id: inspectionId, project_code: pCode,
                    project_name: c.project_display_name || c.projectName || '', project_canonical_key: c.project_canonical_key || c.projectName || '', project_display_name: c.project_display_name || c.projectName || '',
                    engineer_name: c.inspectorName || iName, inspector_name: c.inspectorName || iName, contractor_name: c.contractorName || '',
                    template_key: c.templateKey || '', template_title: c.templateTitle || '', location: c.location || '',
                    section: c.section || '', floor: c.floor || '', room: c.room || '', inspection_date: c.date || new Date().toISOString(),
                    metrics: c.metrics || {}, is_completed: c.isCompleted !== false, is_deleted: isDeleted, deleted_at: isDeleted ? (c._deletedAt || new Date().toISOString()) : null,
                    inspection_type: c.inspection_type || 'rbi_audit',
                    source: 'cloud', sync_status: 'synced', sync_block_reason: '', updated_at: new Date().toISOString()
                };
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inspContractorId)) {
                    inspPayload.contractorId = inspContractorId;
                }
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inspProjectId)) {
                    inspPayload.projectId = inspProjectId;
                }
                inspectionsBatch.push(inspPayload);

                // Формируем пакет нарушений
                for (const itemId of Object.keys(c.state || {})) {
                    const info = getChecklistItem(c.templateKey || '', itemId);
                    const d = (c.details || {})[itemId] || {};
                    itemsBatch.push({
                        id: window.RbiIds.childId(inspectionId, `${inspectionId}_${itemId}`, 'item', itemId), inspection_id: inspectionId, project_code: pCode, project_canonical_key: c.project_canonical_key || c.projectName || '',
                        source: 'cloud', sync_status: 'synced', sync_block_reason: '', item_id: String(itemId), item_name: info?.n || d.name || '', item_weight: info?.w || d.weight || null,
                        status: c.state[itemId], comment: d.comment || d.text || '', cause_code: d.causeCode || '', fact_value: d.fact || d.factValue || '', tolerance_value: d.tolerance || d.toleranceValue || '',
                        details: d, updated_at: new Date().toISOString()
                    });
                }

                // Помечаем, что всё ок (и для живых, и для удаленных!)
                if (window.RbiSyncRetryPolicy) window.RbiSyncRetryPolicy.clearAttention(c);
                c.source = 'cloud'; c.syncStatus = 'synced'; c.sync_status = 'synced';
                c.syncBlockReason = ''; c.sync_block_reason = ''; c.importedFromBackup = false;
                delete c.syncSplit; delete c.syncServerRejected; c.syncBlockHint = '';   // P2-0061: отказ снят
                c.__prevUpdatedAt = c.updatedAt || c.updated_at || '';   // З7: не дошло — время записи вернуть как было
                c.updatedAt = new Date().toISOString(); c.updated_at = c.updatedAt;

                if (!isDeleted) {
                    c.photos = uploadedPhotos;
                }
                // ВСТАВКА: Обязательно сохраняем локально, чтобы статус стал synced и перестал спамить облако
                localHistoryToUpdate.push(c);
            }

            // 🚀 ПАКЕТНАЯ ОТПРАВКА В БАЗУ (Вжух и готово!)
            if (inspectionsBatch.length > 0) {
                const { error } = await window.supabaseClient.from('rbi_inspections').upsert(inspectionsBatch, { onConflict: 'id' });
                if (error && (!window.RbiSyncRetryPolicy || window.RbiSyncRetryPolicy.isTransientSyncError(error))) {
                    // P2-0059: сбой связи или сервера — не «нет прав»: осмотры остаются «не отправлено» и уйдут повтором
                    // (фото уже на сервере — их ссылки сохраняются, повторно не грузятся)
                    console.warn('[Sync] Осмотры не отправлены (связь/сервер), повторим:', error.message);
                    pushErrors++; rbiNoteErr(error);
                    chunkError = error;
                    const sentIds = new Set(inspectionsBatch.map(x => String(x.id)));
                    localHistoryToUpdate.forEach(c => {
                        if (!sentIds.has(String(c.id))) return;
                        c.source = 'local'; c.syncStatus = 'not_synced'; c.sync_status = 'not_synced';
                        if (c.__prevUpdatedAt !== undefined) { c.updatedAt = c.__prevUpdatedAt; c.updated_at = c.__prevUpdatedAt; }   // З7
                    });
                    itemsBatch.length = 0;
                    photosBatch.length = 0;
                    chunkFailed = true;
                } else if (error) {
                    console.warn('[Sync] Ошибка RLS: нет прав на отправку некоторых проверок', error.message);
                    chunkError = error;
                    // Помечаем их локально как заблокированные — только отправленные в этой пачке
                    // (P2-0059: «нужно внимание» и уже отклонённые по роли в пачку не входили — их статус не трогаем)
                    const rejIds = new Set(inspectionsBatch.map(x => String(x.id)));
                    itemsBatch.length = 0;
                    photosBatch.length = 0;
                    // P2-0061 (ТД 313, З6): порция из нескольких осмотров — не метить всю: следующий проход пошлёт их по одной
                    // (syncSplit); один осмотр — «Сервер отклонил» с отпечатком доступа: уйдёт сам, когда доступ изменится,
                    // или по «Отправить снова»; повтор — upsert по id, без дубля
                    const meRej = window.RbiSyncAccess ? window.RbiSyncAccess.deviceMe() : null;
                    const single = inspectionsBatch.length === 1;
                    // «нет прав» — только код 42501 / текст RLS сервера; иное (данные, истёкший вход) — повтор на следующем проходе
                    const noRight = String(error.code || '') === '42501' || /row-level security/i.test(String(error.message || ''));
                    localHistoryToUpdate.forEach(c => {
                        if (!rejIds.has(String(c.id))) return;
                        c.source = 'local';
                        if (c.__prevUpdatedAt !== undefined) { c.updatedAt = c.__prevUpdatedAt; c.updated_at = c.__prevUpdatedAt; }   // З7
                        if (!single) {
                            c.syncSplit = true; c.syncStatus = 'not_synced'; c.sync_status = 'not_synced';
                            return;
                        }
                        delete c.syncSplit;
                        c.syncStatus = 'blocked';
                        c.sync_status = 'blocked';
                        c.syncBlockReason = noRight ? 'Сервер отклонил: нет прав на эту запись'
                            : 'Сервер отклонил: ' + String(error.message || 'ошибка данных').slice(0, 120);
                        c.sync_block_reason = c.syncBlockReason;
                        c.syncBlockHint = noRight ? 'Уйдёт сама, когда вам дадут права, или нажмите «Отправить снова»'
                            : 'Сообщите администратору; после исправления нажмите «Отправить снова»';
                        c.syncServerRejected = true;
                        // отпечаток — только при «нет прав»: такая запись ждёт смены доступа; иная ошибка — пробуется снова на следующем проходе
                        c.syncAccessStamp = noRight && window.RbiSyncAccess ? window.RbiSyncAccess.accessStamp(meRej) : '';
                    });
                } else {
                    actuallyPushedChecks += inspectionsBatch.length;
                }
            }

            // Бьем на куски по 1000 строк (лимит Supabase)
            // RBI FIX: отправляем пункты и фото пачками с обязательной проверкой error.
            // Раньше ошибки upsert могли теряться, а локальная проверка помечалась как synced.
            try {
                await rbiUpsertBatches('rbi_inspection_items', itemsBatch, 500, { onConflict: 'id' });
                await rbiUpsertBatches('rbi_inspection_photos', photosBatch, 500, { onConflict: 'id' });
            } catch (chunkErr) {
                // P2-0059: пункты или фото порции не дошли — её осмотры остаются «не отправлено» (повтор без дубля: по id)
                console.warn('[Sync] Порция осмотров не дошла целиком, повторим:', chunkErr && chunkErr.message);
                pushErrors++; rbiNoteErr(chunkErr);
                chunkError = chunkErr;
                const sentIds = new Set(inspectionsBatch.map(x => String(x.id)));
                localHistoryToUpdate.forEach(c => {
                    if (!sentIds.has(String(c.id))) return;
                    c.source = 'local'; c.syncStatus = 'not_synced'; c.sync_status = 'not_synced';
                });
                chunkFailed = true;
            }

            // Обновляем локальную базу
            localHistoryToUpdate.forEach(c => { delete c.__prevUpdatedAt; });
            if (localHistoryToUpdate.length > 0 && typeof dbPutBatch === 'function') {
                await dbPutBatch('app_history', localHistoryToUpdate);
                if (Array.isArray(contractorArray)) {
                    localHistoryToUpdate.forEach(updatedC => {
                        const idx = contractorArray.findIndex(x => String(x.id) === String(updatedC.id));
                        if (idx >= 0) contractorArray[idx] = window.RbiHistoryMemory ? window.RbiHistoryMemory.lighten(updatedC) : updatedC;
                    });
                }
            }
            chunkHist.forEach(c => ownSeenThisPass.set(String(c.id), recStamp(c))); // отметка после записи на устройство
            if (window.RbiSyncJournal && inspectionsBatch.length) {
                window.RbiSyncJournal.add(chunkError
                    ? { k: 'error', err: chunkError, rejected: chunkFailed ? 0 : inspectionsBatch.length, ids: inspectionsBatch.map(x => ({ type: 'inspection', id: x.id })) }
                    : { k: 'chunk', pushed: inspectionsBatch.length, ids: inspectionsBatch.map(x => ({ type: 'inspection', id: x.id })) });
            }
            if (chunkFailed) break;
        }
    }

    try {
        // P2-0059 (С5): своё — до скачивания чужого; P2-0061 (ТД 315): и задачи, и замечания Стройконтроля 2.0 (ownFirst в описании `sync`)
        if (canPush) {
            await rbiPushOwnInspections();
            // З5: в начале прохода — только новые записи (сервера ещё нет): правка существующей уходит после скачивания, как раньше,
            // чтобы не отменить удаление или более новую правку с сервера
            await rbiMarkCloudKnownOnce();
            await rbiPushTasks(true);
            if (typeof dbGetAll === 'function' && window.supabaseClient && typeof STORES !== 'undefined') await pushConstructionDefectsV2(true);
        }
        if (showSyncProgress) {
            if (_syncProg()) _syncProg().setStep(1);
        } else if (mode === 'manual') {
            safeToast('🔄 Синхронизация...');
        }

        // =====================================================
        // 1. ВСЕГДА ТЯНЕМ РЕЙТИНГ ИНЖЕНЕРОВ
        // =====================================================
        await pullEngineerRatingAlways();
        await pullOwnGameLogsFromCloud();
        // =====================================================
        // 1.5. PULL: КОРПОРАТИВНЫЙ СТИЛЬ (Логотип и Цвет)
        // =====================================================
        try {
            // P2-0037: при входе по почте оформление — одно на компанию (ключ — id компании входа, как при публикации)
            const qsBrand = window.RBI && window.RBI.qualitySync;
            const brandCode = (qsBrand && qsBrand.active && qsBrand.companyId) ? qsBrand.companyId : pCode;
            const { data: pSet, error: pSetErr } = await window.supabaseClient
                .from('project_settings')
                .select('*')
                .eq('project_code', brandCode)
                .maybeSingle();

            if (!pSetErr && pSet) {
                // Если пользователь не кастомизировал стиль вручную, применяем корпоративный
                if (typeof appSettings !== 'undefined' && !appSettings.isBrandingCustomized) {
                    let changed = false;
                    if (pSet.brand_color && appSettings.brandColor !== pSet.brand_color) {
                        appSettings.brandColor = pSet.brand_color;
                        changed = true;
                    }
                    if (pSet.logo_url !== undefined && appSettings.brandLogo !== pSet.logo_url) {
                        appSettings.brandLogo = pSet.logo_url;
                        changed = true;
                        // Кэшируем логотип для офлайна
                        if (pSet.logo_url.startsWith('http') && typeof PhotoManager !== 'undefined') {
                            PhotoManager.downloadForOffline(pSet.logo_url);
                        }
                    }
                    if (changed) {
                        if (typeof dbPut === 'function') await dbPut('app_settings', { key: 'user_prefs', ...appSettings });
                        if (document.getElementById('tab-settings')?.classList.contains('active')) {
                            if (typeof renderSettingsTab === 'function') renderSettingsTab();
                        }
                        if (typeof window.updateHeaderBrandLogo === 'function') window.updateHeaderBrandLogo();
                    }
                }
            }
        } catch (e) {
            console.warn("[Sync] Корпоративные настройки проекта не найдены.");
        }

        // =====================================================
        // 1.6. PULL: company role-matrix overrides (§23 Блок 2)
        // =====================================================
        try {
            const companySvc = window.RBI && window.RBI.services && window.RBI.services.company;
            const companyId = (companySvc && typeof companySvc.getCompanyId === 'function')
                ? companySvc.getCompanyId()
                : 'rbi';
            // P2-0037: при входе по почте строка настроек — компании входа (сервер пишет company_id = id компании, 018 bind_company)
            const qs = window.RBI && window.RBI.qualitySync;
            const settingsCompanyId = (qs && qs.active && qs.companyId) ? qs.companyId : companyId;
            const { data: cSet, error: cSetErr } = await window.supabaseClient
                .from('rbi_company_settings')
                .select('company_id, role_matrix_overrides, official_templates, updated_at')
                .eq('company_id', settingsCompanyId)
                .maybeSingle();

            if (cSetErr) {
                // Таблица ещё не создана (012 не применён) — не ломаем sync.
                console.warn('[Sync] rbi_company_settings pull:', cSetErr.message || cSetErr);
            } else {
                if (companySvc && typeof companySvc.applyRoleMatrixOverridesFromCloud === 'function') {
                    const overrides = (cSet && cSet.role_matrix_overrides && typeof cSet.role_matrix_overrides === 'object')
                        ? cSet.role_matrix_overrides
                        : {};
                    const applied = companySvc.applyRoleMatrixOverridesFromCloud(
                        overrides,
                        cSet && cSet.updated_at ? cSet.updated_at : null
                    );
                    if (applied && applied.skippedDirty) {
                        console.log('[Sync] company role-matrix: skip pull (local dirty)');
                    } else {
                        console.log('[Sync] company role-matrix overrides applied',
                            Object.keys(overrides || {}).length);
                    }
                }
                // Редактор системных чек-листов Блок 1: указатель официальной версии
                // (колонка sql/013 — та же строка, отдельный dirty/apply-путь).
                if (companySvc && typeof companySvc.applyOfficialTemplatesFromCloud === 'function') {
                    const officialTemplates = (cSet && cSet.official_templates && typeof cSet.official_templates === 'object')
                        ? cSet.official_templates
                        : {};
                    const appliedOfficial = companySvc.applyOfficialTemplatesFromCloud(
                        officialTemplates,
                        cSet && cSet.updated_at ? cSet.updated_at : null
                    );
                    if (appliedOfficial && appliedOfficial.skippedDirty) {
                        console.log('[Sync] official templates: skip pull (local dirty)');
                    } else {
                        console.log('[Sync] official templates applied',
                            Object.keys(officialTemplates || {}).length);
                    }
                }
            }
        } catch (e) {
            console.warn('[Sync] company role-matrix pull failed:', e && e.message ? e.message : e);
        }

        // 🛡️ САМОЛЕЧЕНИЕ БАЗЫ ДАННЫХ (Для PWA на iOS)
        // Проверяем: если локальная база пуста, но время lastPullAt стоит - это глюк PWA.
        // Нужно принудительно сбросить время и скачать всё с нуля!
        let localHistoryCount = 0;
        try {
            // Нужен только count — dbCount не поднимает записи в RAM (в отличие от dbGetAll).
            if (typeof dbCount === 'function') {
                localHistoryCount = await dbCount('app_history');
            } else if (typeof dbGetAll === 'function') {
                const hist = await dbGetAll('app_history');
                localHistoryCount = hist ? hist.length : 0;
            }
        } catch (e) { }

        if (localHistoryCount === 0 || forceFullPullRequested) {
            console.log('[Sync] ⚠️ База пуста или запрошен полный сброс. Игнорируем время, качаем всё!');
            lastPullAt = ''; // Обнуляем время, чтобы Supabase отдал все данные
        }

        // =====================================================
        // 2. PULL: проверки из новой нормальной архитектуры
        // =====================================================
        // =====================================================
        // 2. PULL: проверки из новой нормальной архитектуры
        // =====================================================
        if (_syncProg()) _syncProg().setStep(2);

        // --- НОВОЕ: Фильтрация PULL по ролям (по dataScope, не по буквальной роли) ---
        const role = window.RBI.services.permissions ? window.RBI.services.permissions.getCurrentRole() : 'guest';
        const cloudStatus = window.RBI.services.permissions ? window.RBI.services.permissions.getCloudStatus() : 'pending';
        const dataScope = window.RBI.services.permissions ? window.RBI.services.permissions.getDataScope(role) : 'none';

        // ИСПРАВЛЕНИЕ "Пропажи старых проверок": раньше здесь был единичный запрос
        // с .limit(500) — при 500+ живых проверках в проекте старые (за пределами
        // топ-500 по дате) физически никогда не скачивались на устройство ни при
        // первой, ни при последующих синхронизациях (см. отчёт "566 в базе / 500
        // у клиента"). buildInspectionsQuery — фабрика, пересобирающая ту же цепочку
        // фильтров заново на каждой странице (сам объект запроса одноразовый после
        // await), rbiPullAllRows докачивает страницы по .range() пока не заберёт всё.
        const buildInspectionsQuery = (from, to) => {
            let q = window.supabaseClient
                .from('rbi_inspections')
                .select('*')
                .eq('project_code', pCode)
                .order('inspection_date', { ascending: false })
                .order('id', { ascending: false })
                .range(from, to);

            // ИСПРАВЛЕНИЕ "Воскрешения" файлов:
            // Если это первая полная синхронизация (нет lastPullAt), скачиваем ТОЛЬКО живые проверки.
            if (!lastPullAt) {
                q = q.eq('is_deleted', false);
            }

            // P2-0023: через сервер Platform 2.0 видимость решает сервер (quality.row_visible, P2-0018),
            // клиентское «ФИО И объект» отбрасывало свои же проверки. Гость/неподтверждённый — режется всегда.
            const scopeMode = window.RbiSyncPullPolicy
                ? window.RbiSyncPullPolicy.clientScopeMode({ serverScoped: !!(window.RBI && window.RBI.qualitySync), dataScope, approved: cloudStatus === 'approved' })
                : 'client';

            if (scopeMode === 'block') {
                // БЕЗОПАСНОСТЬ: Гостям и неподтвержденным пользователям запрещено качать чужие проверки
                q = q.eq('id', 'impossible_id');
            }
            else if (scopeMode === 'none') {
                // сервер уже отдал ровно видимое этому пользователю
            }
            else if (dataScope === 'ownContractor') {
                const myContrName =
                    typeof appSettings !== 'undefined'
                        ? (appSettings.contractorName || appSettings.assignedContractor || '')
                        : '';

                if (myContrName) {
                    q = q.eq('contractor_name', myContrName);
                } else {
                    q = q.eq('id', 'impossible_id');
                }
            }
            else if (dataScope === 'ownProject') {
                const assignedProjects = window.RBI.services.permissions ? window.RBI.services.permissions.getAssignedProjects() : [];
                const assignedKeys = _syncAssignedCanonicalKeys(assignedProjects);

                if (assignedKeys && assignedKeys.length > 0) {
                    q = q.in('project_canonical_key', assignedKeys);
                } else {
                    q = q.eq('id', 'impossible_id');
                }
            }
            else if (dataScope === 'ownProjectOrOwnRecords') {
                const assignedProjects = window.RBI.services.permissions ? window.RBI.services.permissions.getAssignedProjects() : [];
                const assignedKeys = _syncAssignedCanonicalKeys(assignedProjects);

                q = own(q, 'core_created_by');

                if (assignedKeys && assignedKeys.length > 0) {
                    q = q.in('project_canonical_key', assignedKeys);
                }
            }
            else if (window.syncConfig.syncMode === 'personal') {
                q = own(q, 'core_created_by');
            }
            // dataScope === 'all' (директор/менеджер/зам) качают всё (условий не добавляем)
            // ---------------------------------------

            if (lastPullAt) {
                q = q.gt('updated_at', lastPullAt);
            }

            return q;
        };

        const cloudInspections = await rbiPullAllRows(buildInspectionsQuery, 500);
        if (_syncProg() && cloudInspections) _syncProg().addPulled(cloudInspections.length);

        if (cloudInspections && cloudInspections.length > 0) {
            const ids = cloudInspections.map(x => x.id);

            // RBI FIX: не грузим все inspection_items/photos одним огромным GET-запросом.
            // Иначе URL становится слишком длинным, API может вернуть 502 Bad Gateway.
            // P2-0024: пачки по 200, до 3 запросов одновременно, страница до 5000 строк (хвост при лимите
            // сервера не теряется — см. pullPagedByIds); прогресс в процентах для большой загрузки.
            const _pol = window.RbiSyncPullPolicy || {};
            const _bs = _pol.PULL_BATCH_SIZE || 40;
            let _conc = _pol.PULL_CONCURRENCY || 1;
            const _onThrottle = () => { _conc = 1; }; // сервер перегружен — до конца загрузки по одному запросу
            const _batchesPerTable = Math.ceil(ids.length / _bs);
            const _pct = (offset) => (doneN, total) => {
                if (!_syncProg() || _batchesPerTable < 3 || typeof _syncProg().setDetail !== 'function') return;
                _syncProg().setDetail('Загрузка истории: ' + Math.min(99, Math.round(((offset + doneN) / (2 * total)) * 100)) + '%');
            };
            const cloudItems = await rbiPullRowsByInspectionIds('rbi_inspection_items', ids, _bs, 5000, { concurrency: _conc, onBatchDone: _pct(0), onThrottle: _onThrottle });
            const cloudPhotos = await rbiPullRowsByInspectionIds('rbi_inspection_photos', ids, _bs, 5000, { concurrency: _conc, onBatchDone: _pct(_batchesPerTable), onThrottle: _onThrottle });
            if (_syncProg() && typeof _syncProg().setDetail === 'function') _syncProg().setDetail(null);

            const itemsMap = {};
            const photosMap = {};

            (cloudItems || []).forEach(row => {
                if (!itemsMap[row.inspection_id]) itemsMap[row.inspection_id] = [];
                itemsMap[row.inspection_id].push(row);
            });

            const pulledInspectionPhotoUrls = new Set();

            // Множественные фото к пункту чек-листа (B1): группируем по item_id в
            // массив, отсортированный по photo_index (старые строки без
            // photo_index — по умолчанию 0, оказываются первыми).
            (cloudPhotos || []).forEach(row => {
                if (!photosMap[row.inspection_id]) photosMap[row.inspection_id] = {};
                if (row.item_id && row.public_url) {
                    if (!photosMap[row.inspection_id][row.item_id]) photosMap[row.inspection_id][row.item_id] = [];
                    photosMap[row.inspection_id][row.item_id].push({ idx: row.photo_index || 0, url: row.public_url });
                    pulledInspectionPhotoUrls.add(row.public_url);
                }
            });
            Object.keys(photosMap).forEach(insId => {
                Object.keys(photosMap[insId]).forEach(itemId => {
                    photosMap[insId][itemId] = photosMap[insId][itemId]
                        .sort((a, b) => a.idx - b.idx)
                        .map(entry => entry.url);
                });
            });

            // RBI FIX: готовим фото проверок к офлайн-просмотру, но не блокируем синхронизацию.
            if (
                pulledInspectionPhotoUrls.size > 0 &&
                typeof PhotoManager !== 'undefined' &&
                typeof PhotoManager.downloadForOffline === 'function'
            ) {
                if (pulledInspectionPhotoUrls.size > 0) {
                    rbiEnqueueCloudFilesForCache(
                        Array.from(pulledInspectionPhotoUrls).slice(0, 300),
                        'inspection_photo'
                    );
                }
            }

            // P2-0024: при большой загрузке локальные записи читаются одной выборкой, а не dbGet на каждую.
            // P2-0025: одна выборка — только при полной загрузке; обычная синхронизация — по нужным id.
            const _bulk = _pol.useBulkLocalLookup ? _pol.useBulkLocalLookup(!lastPullAt, cloudInspections.length) : cloudInspections.length > 50;
            const _localLookup = (_bulk && typeof dbGetAll === 'function' && _pol.indexLocalHistory)
                ? _pol.indexLocalHistory(await dbGetAll('app_history') || [])
                : null;

            for (const h of cloudInspections) {
                // --- ЗАЩИТА ОТ ПЕРЕЗАПИСИ УДАЛЕННЫХ ИЛИ ОФЛАЙН ИЗМЕНЕНИЙ ---
                let existingLocal = null;
                if (_localLookup) {
                    const hit = _localLookup(h.id);
                    if (hit) {
                        existingLocal = hit.record;
                        // Авто-лечение дубликатов (старый ID в виде числа)
                        if (hit.numericDup) await dbDelete('app_history', Number(h.id));
                    }
                } else {
                    existingLocal = typeof dbGet === 'function' ? await dbGet('app_history', String(h.id)) : null;

                    // Авто-лечение дубликатов (если в базе телефона остался старый ID в виде числа)
                    if (!existingLocal && !isNaN(Number(h.id))) {
                        const numExisting = await dbGet('app_history', Number(h.id));
                        if (numExisting) {
                            existingLocal = numExisting;
                            await dbDelete('app_history', Number(h.id)); // Стираем числовой дубль
                        }
                    }
                }

                if (_pol.keepLocalOverCloud ? _pol.keepLocalOverCloud(existingLocal, h)
                    : (existingLocal && new Date(existingLocal.updatedAt || existingLocal._deletedAt || 0).getTime() >= new Date(h.updated_at || 0).getTime())) {
                    // Наша локальная версия новее (например, мы её только что удалили). Пропускаем облачную!
                    continue;
                }

                // <-- ВСТАВКА: Если из облака прилетела метка "Удалено", стираем локально
                if (h.is_deleted) {
                    if (existingLocal) {
                        await dbDelete('app_history', String(h.id));
                    }
                    continue;
                }
                // -----------------------------------------------------------

                const state = {};
                const details = {};

                (itemsMap[h.id] || []).forEach(r => {
                    state[r.item_id] = r.status;
                    details[r.item_id] = {
                        ...(r.details || {}),
                        comment: r.comment || r.details?.comment || '',
                        causeCode: r.cause_code || r.details?.causeCode || '',
                        fact: r.fact_value || r.details?.fact || '',
                        tolerance: r.tolerance_value || r.details?.tolerance || ''
                    };
                });

                const localItem = {
                    id: String(h.id),

                    // Старое поле для совместимости
                    projectName: h.project_display_name || h.project_name || '',

                    // Новые поля объекта
                    project_canonical_key: h.project_canonical_key || h.project_name || '',
                    project_display_name: h.project_display_name || h.project_name || '',
                    projectId: h.projectId || h.project_id || '',

                    inspectorName: h.engineer_name || '',
                    authorId: h.core_created_by || '',   // P2-0061: автор — id учётной записи (сервер ставит сам)
                    core_counterparty_id: h.core_counterparty_id || '',   // P2-0061 (Б2): фирма — id контрагента ядра (сервер)
                    core_id: h.core_id || (existingLocal && existingLocal.core_id) || '',   // P2-0072: номер по стандарту (ставит сервер, не отправляется)
                    contractorName: h.contractor_name || '',
                    contractorId: h.contractorId || h.contractor_id || '',
                    templateKey: h.template_key || '',
                    templateTitle: h.template_title || '',
                    location: h.location || '',
                    section: h.section || '',
                    floor: h.floor || '',
                    room: h.room || '',
                    date: h.inspection_date || h.created_at || new Date().toISOString(),
                    isCompleted: h.is_completed !== false,
                    state,
                    details,
                    photos: photosMap[h.id] || {},
                    metrics: h.metrics || {},
                    updatedAt: h.updated_at || new Date().toISOString(),

                    // Всё, что пришло из Supabase, считается облачным и синхронизированным.
                    source: 'cloud',
                    syncStatus: 'synced',
                    syncBlockReason: ''
                };

                // Собираем элементы в массив для пакетного сохранения
                if (!window._tempHistoryBatch) window._tempHistoryBatch = [];
                window._tempHistoryBatch.push(localItem);

            }

            // МАССОВОЕ СОХРАНЕНИЕ ПРОВЕРОК
            let pulledHistoryBatch = [];
            if (window._tempHistoryBatch && window._tempHistoryBatch.length > 0 && typeof dbPutBatch === 'function') {
                pulledHistoryBatch = window._tempHistoryBatch;
                await dbPutBatch('app_history', window._tempHistoryBatch);
                window._tempHistoryBatch = []; // очищаем
            }

            if (typeof dbForEachCursor === 'function') {
                const historyList = [];
                // P2-0024: история в памяти — облегчённая (повторяющиеся строки общим экземпляром, содержимое то же)
                const _lightH = window.RbiHistoryMemory ? window.RbiHistoryMemory.lighten : (x) => x;
                await dbForEachCursor('app_history', (x) => { if (x && !x._deleted) historyList.push(_lightH(x)); });
                window.contractorArray = historyList;

                // <-- ОЧЕНЬ ВАЖНО: обновляем и эталоны
                const etalonsList = [];
                await dbForEachCursor('rbi_etalon_acts', (x) => { if (x && !x._deleted) etalonsList.push(x); });
                window.etalonActsArray = etalonsList;
            } else if (typeof dbGetAll === 'function') {
                window.contractorArray = (await dbGetAll('app_history') || []).filter(x => !x._deleted)
                    .map(window.RbiHistoryMemory ? window.RbiHistoryMemory.lighten : (x) => x);
                window.etalonActsArray = (await dbGetAll('rbi_etalon_acts') || []).filter(x => !x._deleted);
            }

            // Точечный пересчёт агрегатов подрядчика (contractor-metrics.service.js) —
            // только для подрядчиков/объектов, чьи записи реально пришли в этом pull,
            // а не полный пересчёт всей базы (см. отчёт по оптимизации журнала/аналитики).
            if (pulledHistoryBatch.length > 0 && window.RBI.services.contractorMetrics) {
                window.RBI.services.contractorMetrics.recalcTouched(pulledHistoryBatch);
            }
        }

        // =====================================================
        // 3. PULL: черновик текущей проверки
        // =====================================================
        // =====================================================
        // 3. PULL: черновик текущей проверки
        // =====================================================
        try {
            let draftQuery = window.supabaseClient
                .from('rbi_draft_sessions')
                .select('*')
                .eq('project_code', pCode);
            // P2-0035b: свой черновик — по номеру учётки (автор, ставит сервер; старые — владелец по привязке 040a)
            draftQuery = myAuthId ? draftQuery.or(`core_created_by.eq.${myAuthId},owner_auth_user_id.eq.${myAuthId}`) : draftQuery.eq('engineer_name', iName);

            // ИСПРАВЛЕНИЕ: Тянем черновик только если он обновился с прошлой синхронизации
            if (lastPullAt) {
                draftQuery = draftQuery.gt('updated_at', lastPullAt);
            }

            // P2-0072: у инженера рядом может лежать прежний черновик `draft_…` (старая версия) — берём самый свежий
            draftQuery = draftQuery.order('updated_at', { ascending: false }).limit(1);
            const { data: draftRows } = await draftQuery;

            if (draftRows && draftRows.length > 0 && typeof dbGet === 'function' && typeof dbPut === 'function') {
                const cloudDraft = draftRows[0];
                const localSession = await dbGet('app_state', 'current_session');

                const cloudTime = new Date(cloudDraft.updated_at || 0).getTime();
                const localTime = localSession ? (localSession.timestamp || 0) : 0;

                if (cloudTime > localTime) {
                    // ЖЕЛЕЗНЫЙ ЩИТ: Если инженер сейчас на вкладке "Осмотр" - ЗАПРЕЩАЕМ облаку трогать его экран!
                    // Это решает проблему пропадающих фоток и сброса данных прямо во время работы.
                    const isAuditActive = document.getElementById('tab-audit')?.classList.contains('active');

                    if (isAuditActive) {
                        console.log('[Sync] 🛡️ Инженер заполняет чек-лист. Облачный черновик проигнорирован, чтобы не стереть данные.');
                    } else {
                        // Обновляем локальный черновик только если инженер гуляет по другим вкладкам (Аналитика, Настройки)
                        await dbPut('app_state', {
                            key: 'current_session',
                            timestamp: cloudTime,
                            templateKey: cloudDraft.template_key || '',
                            project: localSession?.project || '',
                            inspector: iName,
                            contractor: cloudDraft.contractor_name || '',
                            location: cloudDraft.location || '',
                            section: cloudDraft.section || '',
                            floor: cloudDraft.floor || '',
                            room: cloudDraft.room || '',
                            state: cloudDraft.state || {},
                            details: cloudDraft.details || {},
                            photos: cloudDraft.photos || {},
                            customExpertConclusions: cloudDraft.custom_expert_conclusions || {}
                        });

                        if (typeof restoreSession === 'function') {
                            setTimeout(() => {
                                if (!document.getElementById('tab-audit')?.classList.contains('active')) {
                                    restoreSession();
                                }
                            }, 500);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("[Sync] Черновик не подтянут:", e.message);
        }

        // =====================================================
        // 4. PULL: задачи и эталоны
        // =====================================================
        if (_syncProg()) _syncProg().setStep(3);
        try {
            // auto + manual: единый план инженера на телефоне/ПК/у админа
            let taskQuery = window.supabaseClient
                .from('rbi_tasks')
                .select('*')
                .eq('project_code', pCode);

            const role = window.RBI.services.permissions ? window.RBI.services.permissions.getCurrentRole() : 'guest';
            const taskDataScope = window.RBI.services.permissions ? window.RBI.services.permissions.getDataScope(role) : 'none';
            // P2-0061 (ТД 149): вход почтой — охват задач решает сервер (record_visible: автор и исполнитель по id, объекты, фирма по id),
            // телефон не сужает запрос по роли экрана и названию фирмы; «Только мои» — по id (автор или исполнитель)
            const meTasks = window.RbiSyncAccess ? window.RbiSyncAccess.deviceMe() : null;

            if (meTasks) {
                if (window.syncConfig.syncMode === 'personal') taskQuery = own(taskQuery, 'assigned_to_auth_user_id');
            }
            else if (taskDataScope === 'none') {
                taskQuery = taskQuery.eq('id', 'impossible_id');
            }
            else if (taskDataScope === 'ownContractor') {
                const myContrName =
                    typeof appSettings !== 'undefined'
                        ? (appSettings.contractorName || appSettings.assignedContractor || '')
                        : '';

                if (myContrName) {
                    taskQuery = taskQuery.eq('contractor_name', myContrName);
                } else {
                    taskQuery = taskQuery.eq('id', 'impossible_id');
                }
            }
            else if (taskDataScope === 'ownProject') {
                const assignedProjects = window.RBI.services.permissions ? window.RBI.services.permissions.getAssignedProjects() : [];
                const assignedKeys = _syncAssignedCanonicalKeys(assignedProjects);

                if (assignedKeys && assignedKeys.length > 0) {
                    taskQuery = taskQuery.in('project_canonical_key', assignedKeys);
                } else {
                    taskQuery = taskQuery.eq('id', 'impossible_id');
                }
            }
            else if (taskDataScope === 'ownProjectOrOwnRecords') {
                const assignedProjects = window.RBI.services.permissions ? window.RBI.services.permissions.getAssignedProjects() : [];
                const assignedKeys = _syncAssignedCanonicalKeys(assignedProjects);

                taskQuery = own(taskQuery, 'assigned_to_auth_user_id');   // «Мои задачи» — кому задача (сервер по ФИО исполнителя)

                if (assignedKeys && assignedKeys.length > 0) {
                    taskQuery = taskQuery.in('project_canonical_key', assignedKeys);
                }
            }
            else if (window.syncConfig.syncMode === 'personal') {
                taskQuery = own(taskQuery, 'assigned_to_auth_user_id');
            }
            // Если это полная синхронизация - берем только живые. 
            // Если быстрая - берем все измененные (включая удаленные)
            if (!lastPullAt) {
                taskQuery = taskQuery.eq('is_deleted', false);
            } else {
                taskQuery = taskQuery.gt('updated_at', lastPullAt);
            }
            const { data: taskRows } = await taskQuery;

            if (taskRows && typeof dbPut === 'function') {
                window.rbi_tasksData = window.rbi_tasksData || [];

                for (const row of taskRows) {
                    // ИСПРАВЛЕНИЕ: Ищем задачу прямо в базе IndexedDB, а не в оперативной памяти!
                    // Потому что в RAM мы уже скрыли удаленные задачи, и система думает, что их нет.
                    const existingLocal = await dbGet('rbi_tasks', row.id);
                    const localTime = existingLocal ? new Date(existingLocal.updatedAt || existingLocal.updated_at || 0).getTime() : 0;
                    const cloudTime = new Date(row.updated_at || 0).getTime();
                    // --- ВСТАВКА: ЕСЛИ ОБЛАКО ГОВОРИТ, ЧТО ЗАДАЧА УДАЛЕНА ---
                    if (row.is_deleted === true) {
                        if (existingLocal) {
                            existingLocal._deleted = true;
                            existingLocal.is_deleted = true;
                            existingLocal.deleted_at = row.deleted_at || row.updated_at;
                            existingLocal._deletedAt = existingLocal.deleted_at;
                            existingLocal.source = 'cloud';
                            existingLocal.syncStatus = 'synced';
                            existingLocal.sync_status = 'synced';
                            await dbPut('rbi_tasks', existingLocal);
                        }
                        // Удаляем из оперативной памяти
                        window.rbi_tasksData = window.rbi_tasksData.filter(t => String(t.id) !== String(row.id));
                        continue; // Переходим к следующей задаче
                    }
                    // ---------------------------------------------------------

                    // Если локально мы удалили задачу, а облако пытается ее вернуть - игнорируем!
                    if (!existingLocal || cloudTime > localTime) {
                        const t = row.task_data || {};
                        t.id = row.id;
                        t.assignedToId = row.assigned_to_auth_user_id || null;   // P2-0035b: кому задача — номер учётки (сервер)
                        // P2-0061 (Б3): автор — id, который поставил сервер (core_created_by), а не присланный клиентом в task_data
                        t.authorId = row.core_created_by || '';
                        t.core_counterparty_id = row.core_counterparty_id || '';   // Б2: фирма — id контрагента ядра
                        t.core_id = row.core_id || t.core_id || '';   // P2-0072: номер по стандарту (ставит сервер, не отправляется)
                        t.cloudKnown = true;   // З5: сервер уже знает задачу — в начале прохода её правку не слать
                        t.status = row.status || t.status;
                        t.updatedAt = row.updated_at;
                        t.project_canonical_key = row.project_canonical_key || t.project_canonical_key || t.project || t.projectName || '';
                        t.project_display_name = row.project_display_name || t.project_display_name || t.project || t.projectName || '';

                        t.source = 'cloud';
                        t.syncStatus = 'synced';
                        t.sync_status = 'synced';
                        t.syncBlockReason = '';
                        t.sync_block_reason = '';
                        // --- НОВОЕ: Кэшируем фото закрытия задачи ---
                        if (t.completionPhoto && t.completionPhoto.startsWith('http')) {
                            t.completionPhoto = await window.cacheCloudPhotoToIndexedDB(t.completionPhoto);
                        }
                        // --------------------------------------------

                        await dbPut('rbi_tasks', t);

                        const idx = window.rbi_tasksData.findIndex(x => String(x.id) === String(t.id));
                        if (idx >= 0) window.rbi_tasksData[idx] = t;
                        else window.rbi_tasksData.push(t);
                    }
                }
            }
        } catch (e) {
            console.warn("[Sync] Задачи не подтянуты:", e.message);
        }


        // Вспомогательная функция для фоновой загрузки всех фото эталона в кеш
        async function downloadAllActPhotosForOffline(act) {
            if (!act?.details?.elements) return;

            for (const el of act.details.elements) {
                if (el.photo && el.photo.startsWith('http')) {
                    // PhotoManager.downloadForOffline сохранит фото в IndexedDB,
                    // но сам el.photo останется публичным URL
                    await PhotoManager.downloadForOffline(el.photo);
                }
            }
        }
        // =====================================================
        // 4.1. PULL: прочие модули через rbi_cloud_objects
        // =====================================================
        if (_syncProg()) _syncProg().setStep(4);
        try {
            // Единый массив всех независимых таблиц (И проектные, и общие справочники)
            const cloudTypes = [
                { type: 'meeting', store: 'rbi_meetings', memory: 'rbi_meetingsData' },
                { type: 'intervention', store: 'rbi_interventions', memory: 'rbi_interventionsData' },
                { type: 'practice', store: 'rbi_practices', memory: 'rbi_practicesData' },
                { type: 'schedule', store: 'rbi_schedule_stages', memory: 'rbi_scheduleData' },
                { type: 'fmea', store: 'rbi_fmea', memory: 'rbi_fmeaRecords' },
                { type: 'etalon', store: 'rbi_etalon_acts', memory: 'etalonActsArray' },
                // --- СТРОЙКОНТРОЛЬ ---
                { type: 'const_object', store: 'construction_objects', memory: '_sys_dummy' },
                { type: 'const_building', store: 'construction_buildings', memory: '_sys_dummy' },
                { type: 'const_floor', store: 'construction_floors', memory: '_sys_dummy' },
                { type: 'const_defect', store: 'construction_defects', memory: '_sys_dummy' },
                { type: 'const_unit', store: 'construction_units', memory: '_sys_dummy' },
                { type: 'const_acceptance', store: 'construction_acceptance', memory: '_sys_dummy' },
                // ---------------------
                // НОВЫЕ БЫСТРЫЕ ТАБЛИЦЫ СПРАВОЧНИКОВ:
                { type: 'custom_doc', store: 'custom_docs', memory: 'customDocs' },
                { type: 'custom_node', store: 'custom_nodes', memory: 'customNodes' },
                { type: 'custom_twi_card', store: 'twi_cards', memory: 'customTwiCards' },
                { type: 'feedback', store: 'feedback_list', memory: 'rbi_feedbackData' },
                // C2b: project_object / object_alias sync disabled — SoT = locations.object
                // { type: 'project_object', store: 'project_objects', memory: '_sys_obj_dummy' },
                // { type: 'object_alias', store: 'object_aliases', memory: '_sys_alias_dummy' },
                { type: 'report', store: 'app_reports', memory: 'reportsArray' },
                { type: 'report_template', store: 'report_templates', memory: 'userReportTemplates' },
                { type: 'assistant_kb', store: 'app_assistant_kb', memory: 'appAssistantData' }
            ];

            for (const cType of cloudTypes) {
                try {
                    const isReferenceType = [
                        'custom_doc',
                        'custom_node',
                        'custom_twi_card',
                        'assistant_kb',
                        'user_template'
                        // C2b: project_object / object_alias removed from pull
                    ].includes(cType.type);

                    const pullSince = isReferenceType && needFullReferencePull ? '' : lastPullAt;

                    const objects = await window.pullCloudObjects(cType.type, pullSince, mode);

                    window[cType.memory] = window[cType.memory] || [];

                    if (!objects || objects.length === 0) {
                        console.log(`[Sync] ${cType.type}: новых данных нет`);
                        continue;
                    }

                    console.log(`[Sync] ${cType.type}: получено ${objects.length}`);
                    if (cType.type === 'practice') pulledPracticesChanged = true;
                    if (cType.type === 'etalon') pulledEtalonsChanged = true;
                    for (const obj of objects) {
                        const localExisting = await dbGet(cType.store, obj.id);
                        const localTime = localExisting
                            ? new Date(localExisting.updatedAt || localExisting.updated_at || localExisting.date || localExisting.createdAt || 0).getTime()
                            : 0;

                        const cloudTime = new Date(obj.updatedAt || obj.updated_at || 0).getTime();

                        // P2-0023: неотправленная местная правка (или удаление) главнее облака — уйдёт следующей
                        // отправкой. Раньше облако затирало её при cloudTime >= localTime.
                        const mayOverwrite = window.RbiSyncMergePolicy
                            ? window.RbiSyncMergePolicy.cloudMayOverwrite({ local: localExisting, cloudTime, localTime, forceReference: needFullReferencePull })
                            : (!localExisting || cloudTime >= localTime || needFullReferencePull);
                        if (!mayOverwrite && localExisting && (cloudTime >= localTime || needFullReferencePull)) {
                            console.log(`[Sync] ${cType.type} ${obj.id}: есть неотправленная правка на устройстве — облако не затирает`);
                        }
                        if (mayOverwrite) {
                            if (obj._deleted || obj.is_deleted) {
                                await dbDelete(cType.store, obj.id);
                                window[cType.memory] = window[cType.memory].filter(x => String(x.id) !== String(obj.id));
                            } else {
                                // Отчёты: облако без file_blob — не затираем локальный офлайн-кэш PDF.
                                if (
                                    cType.type === 'report' &&
                                    localExisting &&
                                    (typeof window.rbiHasReportPayload === 'function'
                                        ? window.rbiHasReportPayload(localExisting.file_blob)
                                        : !!localExisting.file_blob)
                                ) {
                                    obj.file_blob = localExisting.file_blob;
                                    obj.file_size = localExisting.file_size || obj.file_size || 0;
                                    obj.mime_type = localExisting.mime_type || localExisting.mimeType || obj.mime_type || 'application/pdf';
                                    obj.mimeType = obj.mime_type;
                                    const localCache = localExisting.cache_status || localExisting.cacheStatus;
                                    if (localCache === 'cached_cloud' || localCache === 'local_only') {
                                        obj.cache_status = localCache;
                                        obj.cacheStatus = localCache;
                                    } else {
                                        obj.cache_status = 'cached_cloud';
                                        obj.cacheStatus = 'cached_cloud';
                                    }
                                }

                                await dbPut(cType.store, obj);

                                // RBI FIX: не скачиваем файлы прямо во время синхронизации.
                                // Только ставим ссылки в лёгкую фоновую очередь.
                                if (['practice', 'etalon', 'custom_twi_card', 'custom_node', 'custom_doc', 'user_template', 'const_floor'].includes(cType.type)) {
                                    const urls = rbiCollectCloudStorageUrls(obj, cType.type === 'etalon' ? 120 : 60);
                                    rbiEnqueueCloudFilesForCache(urls, cType.type);
                                }
                                if (cType.type === 'report' && obj.file_url && String(obj.file_url).startsWith('http')) {
                                    rbiEnqueueCloudFilesForCache([obj.file_url], 'report');
                                }

                                const idx = window[cType.memory].findIndex(x => String(x.id) === String(obj.id));
                                if (idx >= 0) window[cType.memory][idx] = obj;
                                else window[cType.memory].push(obj);
                            }
                        }
                    }

                } catch (e) {
                    pullErrors++;
                    console.warn(`[Sync] Ошибка pull ${cType.type}:`, e.message || e);

                    if ([
                        'custom_doc',
                        'custom_node',
                        'custom_twi_card',
                        'assistant_kb',
                        'user_template'
                        // C2b: project_object / object_alias no longer reference-pull
                    ].includes(cType.type)) {
                        referencePullErrors++;
                    }
                }
            } // конец цикла cloudTypes
            // Перезагружаем Справочник объектов в память, если он прилетел из облака
            if (typeof ObjectDirectory !== 'undefined') await ObjectDirectory.init();
            // ИСПРАВЛЕНИЕ: ЖЕСТКАЯ СИНХРОНИЗАЦИЯ ПАМЯТИ ОТЧЕТОВ, ПРАКТИК И ЭТАЛОНОВ
            // Достаем свежие данные из БД в оперативную память, чтобы экран их увидел без перезагрузки.
            if (typeof dbGetAll === 'function') {
                if (typeof reportsArray !== 'undefined') {
                    const reportsList = [];
                    await dbForEachCursor('app_reports', (r) => {
                        if (!r || r._deleted || r.is_deleted) return;
                        const url = r.file_url || r.fileUrl || '';
                        if (r.file_blob && typeof url === 'string' && url.indexOf('http') === 0) {
                            reportsList.push({ ...r, file_blob: null });
                        } else {
                            reportsList.push(r);
                        }
                    });
                    window.reportsArray = reportsList;
                    if (window.RBI?.services?.reports?.detachCloudBlobsInMemory) {
                        window.RBI.services.reports.detachCloudBlobsInMemory(window.reportsArray);
                    } else {
                        (window.reportsArray || []).forEach((r) => {
                            if (r && r.file_blob && r.file_url && String(r.file_url).startsWith('http')) r.file_blob = null;
                        });
                    }
                }

                if (typeof userReportTemplates !== 'undefined') {
                    userReportTemplates = (await dbGetAll('report_templates') || []).filter(x => !x._deleted && !x.is_deleted);
                }

                if (pulledPracticesChanged) {
                    window.rbi_practicesData = (await dbGetAll('rbi_practices') || [])
                        .filter(x => !x._deleted && !x.is_deleted);

                    if (typeof rbi_practicesData !== 'undefined') {
                        rbi_practicesData = window.rbi_practicesData;
                    }
                }

                if (pulledEtalonsChanged) {
                    window.etalonActsArray = (await dbGetAll('rbi_etalon_acts') || [])
                        .filter(x => !x._deleted && !x.is_deleted);
                }
            }

            // =====================================================
            // PULL ПК СК: новая модель через public.sk_records
            // =====================================================
            if (_syncProg()) _syncProg().setStep(5);
            if (window.supabaseClient && typeof dbGetAll === 'function') {
                try {
                    const pCode = window.syncConfig.projectCode;

                    // P2-0078: постранично (по 1000, порядок по id) и только изменения со своей метки — раньше один запрос
                    // limit(25000) на все замечания (≈ 12 000 строк, 5 с на сервере); сбой не сдвигает метку.
                    const skSince = tableSince('sk_records');
                    const cloudSkRows = await rbiPullAllRows((from, to) => changedSince(window.supabaseClient
                        .from('sk_records')
                        .select('*')
                        .eq('project_code', pCode), skSince)
                        .order('id', { ascending: true })
                        .range(from, to), 1000);

                    if (cloudSkRows && cloudSkRows.length > 0) {
                        const localRecords = await dbGetAll(STORES.SK_RECORDS) || [];
                        const localMap = new Map();
                        const skRecordsToSaveBatch = []; // <-- ДОБАВИЛИ МАССИВ ДЛЯ ПАКЕТА
                        localRecords.forEach(r => {
                            const key = r.sk_unique_key || r.id;
                            if (key) localMap.set(String(key), r);
                        });

                        for (const row of cloudSkRows) {
                            const cloudRecord = window.normalizeCloudSkRecordForLocal(row);
                            if (!cloudRecord) continue;

                            const cloudKey = String(cloudRecord.sk_unique_key || cloudRecord.id);
                            const localRecord = localMap.get(cloudKey);

                            const cloudTime = new Date(cloudRecord.updated_at || cloudRecord.updatedAt || 0).getTime();
                            const localTime = localRecord
                                ? new Date(localRecord.updated_at || localRecord.updatedAt || localRecord._updatedAt || 0).getTime()
                                : 0;

                            // КРИТИЧЕСКОЕ ПРАВИЛО:
                            // Если локально запись удалена и это удаление ещё не синхронизировано,
                            // не подтягиваем старую активную запись из облака обратно.
                            const localDeletePending =
                                localRecord &&
                                (localRecord._deleted === true || localRecord.is_deleted === true) &&
                                (localRecord.syncStatus === 'not_synced' || localRecord.sync_status === 'not_synced');

                            const cloudIsDeleted =
                                cloudRecord._deleted === true || cloudRecord.is_deleted === true;

                            if (localDeletePending && !cloudIsDeleted) {
                                console.log('[Sync][ПК СК] Пропущен pull: локальное удаление ожидает отправки', cloudKey);
                                continue;
                            }

                            // Если облако говорит, что запись удалена — сохраняем tombstone локально,
                            // чтобы она не отображалась и не прилетала заново.
                            if (cloudIsDeleted) {
                                const tombstone = {
                                    ...(localRecord || cloudRecord),
                                    ...cloudRecord,
                                    _deleted: true,
                                    is_deleted: true,
                                    source: 'cloud',
                                    syncStatus: 'synced',
                                    sync_status: 'synced',
                                    syncBlockReason: '',
                                    sync_block_reason: ''
                                };

                                await dbPut(STORES.SK_RECORDS, tombstone);
                                localMap.set(cloudKey, tombstone);
                                continue;
                            }

                            // Обычное обновление: облачная запись новее локальной
                            if (!localRecord || cloudTime > localTime) {
                                skRecordsToSaveBatch.push(cloudRecord); // <-- КЛАДЕМ В МАССИВ ВМЕСТО МЕДЛЕННОГО СОХРАНЕНИЯ
                                localMap.set(cloudKey, cloudRecord);
                            }
                        }

                        // --- ПАКЕТНОЕ СОХРАНЕНИЕ ---
                        if (skRecordsToSaveBatch.length > 0 && typeof dbPutBatch === 'function') {
                            await dbPutBatch(STORES.SK_RECORDS, skRecordsToSaveBatch);
                        }
                        // ---------------------------


                        const allPulledSkRecords = Array.from(localMap.values()).filter(r => !r._deleted && !r.is_deleted);

                        if (typeof sk_filterRecordsByAccess === 'function') {
                            window.skRecords = sk_filterRecordsByAccess(allPulledSkRecords);
                        } else {
                            window.skRecords = allPulledSkRecords;
                        }

                        if (
                            document.getElementById('tab-analytics')?.classList.contains('active') &&
                            typeof currentActiveAnalyticsTab !== 'undefined' &&
                            currentActiveAnalyticsTab === 'sub-sk'
                        ) {
                            if (typeof sk_renderMainTab === 'function') sk_renderMainTab();
                        }
                    }
                    tableDone('sk_records');   // строки записаны на устройство — метка таблицы
                } catch (e) {
                    console.warn('[Sync][ПК СК] Не удалось подтянуть sk_records:', e.message);
                }
            }
            // =====================================================
            // PULL справочника подрядчиков ПК СК
            // =====================================================
            if (window.supabaseClient && typeof dbPut === 'function' && typeof STORES !== 'undefined') {
                try {
                    const pCode = window.syncConfig.projectCode;

                    // 1. Справочник подрядчиков
                    const { data: cloudContractors, error: contractorsErr } = await changedSince(window.supabaseClient
                        .from('contractor_directory')
                        .select('*')
                        .eq('project_code', pCode), tableSince('contractor_directory'));

                    if (contractorsErr) throw contractorsErr;

                    if (Array.isArray(cloudContractors)) {
                        for (const c of cloudContractors) {
                            await dbPut(STORES.CONTRACTOR_DIRECTORY, {
                                ...c,
                                _deleted: c.is_deleted === true,
                                source: 'cloud',
                                syncStatus: 'synced',
                                sync_status: 'synced',
                                syncBlockReason: '',
                                sync_block_reason: '',
                                updatedAt: c.updated_at || new Date().toISOString()
                            });
                        }
                    }
                    tableDone('contractor_directory');   // строки записаны на устройство — метка таблицы

                    // 2. Алиасы подрядчиков
                    const { data: cloudAliases, error: aliasesErr } = await changedSince(window.supabaseClient
                        .from('contractor_aliases')
                        .select('*')
                        .eq('project_code', pCode), tableSince('contractor_aliases'));

                    if (aliasesErr) throw aliasesErr;

                    if (Array.isArray(cloudAliases)) {
                        for (const a of cloudAliases) {
                            await dbPut(STORES.CONTRACTOR_ALIASES, {
                                ...a,
                                source: 'cloud',
                                syncStatus: 'synced',
                                sync_status: 'synced',
                                syncBlockReason: '',
                                sync_block_reason: '',
                                updatedAt: a.updated_at || new Date().toISOString()
                            });
                        }
                    }
                    tableDone('contractor_aliases');   // строки записаны на устройство — метка таблицы

                    // 3. Очередь нормализации подрядчиков
                    const { data: cloudQueue, error: queueErr } = await changedSince(window.supabaseClient
                        .from('contractor_normalization_queue')
                        .select('*')
                        .eq('project_code', pCode), tableSince('contractor_normalization_queue'));

                    if (queueErr) throw queueErr;

                    if (Array.isArray(cloudQueue)) {
                        for (const q of cloudQueue) {
                            await dbPut(STORES.CONTRACTOR_QUEUE, {
                                ...q,
                                source: 'cloud',
                                syncStatus: 'synced',
                                sync_status: 'synced',
                                syncBlockReason: '',
                                sync_block_reason: '',
                                updatedAt: q.updated_at || new Date().toISOString()
                            });
                        }
                    }
                    tableDone('contractor_normalization_queue');   // строки записаны на устройство — метка таблицы

                    // 4. Платформенная таблица contractors → merge legal_* в локальный directory (тот же UUID)
                    try {
                        // реквизиты дописываются в карточки справочника: пришли новые карточки — подрядчики целиком
                        const contractorsSince = Array.isArray(cloudContractors) && cloudContractors.length > 0 ? '' : tableSince('contractors');
                        const { data: platformContractors, error: platformContrErr } = await changedSince(window.supabaseClient
                            .from('contractors')
                            .select('*'), contractorsSince);

                        if (platformContrErr) throw platformContrErr;

                        if (Array.isArray(platformContractors)) {
                            for (const pc of platformContractors) {
                                if (!pc || !pc.id) continue;
                                const local = await dbGet(STORES.CONTRACTOR_DIRECTORY, pc.id);
                                if (!local) continue; // identity остаётся за pull contractor_directory

                                const legalFields = [
                                    'legal_name', 'legal_form', 'legal_address',
                                    'contact_person', 'contact_phone', 'contact_email'
                                ];
                                let changed = false;
                                for (const field of legalFields) {
                                    if (pc[field] !== undefined && pc[field] !== null && String(local[field] || '') !== String(pc[field] || '')) {
                                        local[field] = pc[field] || '';
                                        changed = true;
                                    }
                                }
                                if (pc.inn !== undefined && pc.inn !== null && String(local.inn || '') !== String(pc.inn || '')) {
                                    local.inn = pc.inn || '';
                                    changed = true;
                                }
                                if (pc.displayName && String(local.display_name || '') !== String(pc.displayName || '')) {
                                    // Не перетираем локально грязную карточку
                                    const localDirty = (local.syncStatus || local.sync_status) === 'not_synced' || local.source === 'local';
                                    if (!localDirty) {
                                        local.display_name = pc.displayName;
                                        changed = true;
                                    }
                                }
                                if (changed) {
                                    local.updatedAt = pc.updated_at || new Date().toISOString();
                                    local.updated_at = local.updatedAt;
                                    await dbPut(STORES.CONTRACTOR_DIRECTORY, local);
                                }
                            }
                        }
                        tableDone('contractors');   // строки записаны на устройство — метка таблицы
                    } catch (e) {
                        console.warn('[Sync][Подрядчики] Не удалось подтянуть platform contractors:', e.message || e);
                    }

                    // 5. Платформенная таблица contracts → IDB + память сервиса
                    if (STORES.CONTRACTS) {
                        try {
                            const { data: cloudContracts, error: contractsErr } = await changedSince(window.supabaseClient
                                .from('contracts')
                                .select('*'), tableSince('contracts'));

                            if (contractsErr) throw contractsErr;

                            if (Array.isArray(cloudContracts)) {
                                for (const c of cloudContracts) {
                                    if (!c || !c.id) continue;
                                    await dbPut(STORES.CONTRACTS, {
                                        ...c,
                                        contractorId: c.contractorId || c.contractor_id,
                                        _deleted: c.is_deleted === true,
                                        source: 'cloud',
                                        syncStatus: 'synced',
                                        sync_status: 'synced',
                                        syncBlockReason: '',
                                        sync_block_reason: '',
                                        updatedAt: c.updated_at || new Date().toISOString()
                                    });
                                }
                            }
                            tableDone('contracts');   // строки записаны на устройство — метка таблицы
                        } catch (e) {
                            console.warn('[Sync][Подрядчики] Не удалось подтянуть contracts:', e.message || e);
                        }
                    }

                    // Обновляем кэш ContractorDirectory после pull
                    if (window.ContractorDirectory && typeof window.ContractorDirectory.init === 'function') {
                        await window.ContractorDirectory.init();
                    }
                } catch (e) {
                    console.warn('[Sync][Подрядчики] Не удалось подтянуть справочник подрядчиков:', e.message || e);
                }
            }

            // --- Справочник локаций v2 (location_nodes + construction_floors_v2) ---
            if (STORES.LOCATION_NODES && window.supabaseClient) {
                try {
                    const { data: cloudNodes, error: locErr } = await changedSince(window.supabaseClient
                        .from('location_nodes')
                        .select('*'), tableSince('location_nodes'));
                    if (locErr) throw locErr;
                    if (Array.isArray(cloudNodes)) {
                        for (const n of cloudNodes) {
                            if (!n || !n.id) continue;
                            // Как у ПК СК: локальное soft-delete ещё не запушено — не откатывать pull'ом.
                            const localNode = await dbGet(STORES.LOCATION_NODES, n.id);
                            const localDeletePending =
                                localNode &&
                                (localNode._deleted === true || localNode.is_deleted === true) &&
                                ((localNode.syncStatus || localNode.sync_status) === 'not_synced' ||
                                    localNode.source === 'local');
                            const cloudIsDeleted = n.is_deleted === true;
                            if (localDeletePending && !cloudIsDeleted) {
                                console.log(
                                    '[Sync][Локации] Пропущен pull: локальное удаление узла ожидает отправки',
                                    n.id
                                );
                                continue;
                            }
                            // Локально грязный create/update — не затирать облачной копией до push.
                            const localDirty =
                                localNode &&
                                ((localNode.syncStatus || localNode.sync_status) === 'not_synced' ||
                                    localNode.source === 'local');
                            if (localDirty && !cloudIsDeleted) {
                                const localTime = new Date(
                                    localNode.updated_at || localNode.updatedAt || 0
                                ).getTime();
                                const cloudTime = new Date(n.updated_at || 0).getTime();
                                if (localTime >= cloudTime) {
                                    console.log(
                                        '[Sync][Локации] Пропущен pull: локальная правка узла новее/ожидает push',
                                        n.id
                                    );
                                    continue;
                                }
                            }
                            await dbPut(STORES.LOCATION_NODES, {
                                ...n,
                                nodeType: n.nodeType || n.node_type || null,
                                parentId: n.parentId !== undefined ? n.parentId : (n.parent_id ?? null),
                                displayName: n.displayName || n.display_name || '',
                                _deleted: n.is_deleted === true,
                                source: 'cloud',
                                syncStatus: 'synced',
                                sync_status: 'synced',
                                updatedAt: n.updated_at || new Date().toISOString()
                            });
                        }
                    }
                    tableDone('location_nodes');   // строки записаны на устройство — метка таблицы
                    // P2-0054: ЖК, места которых ведёт «Компания» (там структура мест — только просмотр). До 048 на сервере — пропуск.
                    try {
                        const { data: coreRoots, error: coreErr } = await window.supabaseClient.rpc('core_led_roots');
                        const locCore = window.RBI && window.RBI.services && window.RBI.services.locations;
                        if (!coreErr && Array.isArray(coreRoots) && locCore && typeof locCore.setCoreLedRoots === 'function') {
                            locCore.setCoreLedRoots(coreRoots);
                        }
                    } catch (e) {
                        console.warn('[Sync][Локации] Не удалось узнать ЖК «Компании»:', e.message || e);
                    }
                    if (STORES.CONST_FLOORS_V2) {
                        const { data: cloudPlans, error: planErr } = await changedSince(window.supabaseClient
                            .from('construction_floors_v2')
                            .select('*'), tableSince('construction_floors_v2'));
                        if (planErr) throw planErr;
                        if (Array.isArray(cloudPlans)) {
                            for (const p of cloudPlans) {
                                if (!p || !p.id) continue;
                                const localPlan = await dbGet(STORES.CONST_FLOORS_V2, p.id);
                                const localDeletePending =
                                    localPlan &&
                                    (localPlan._deleted === true || localPlan.is_deleted === true) &&
                                    ((localPlan.syncStatus || localPlan.sync_status) === 'not_synced' ||
                                        localPlan.source === 'local');
                                const cloudIsDeleted = p.is_deleted === true;
                                if (localDeletePending && !cloudIsDeleted) {
                                    console.log(
                                        '[Sync][Локации] Пропущен pull: локальное удаление плана ожидает отправки',
                                        p.id
                                    );
                                    continue;
                                }
                                await dbPut(STORES.CONST_FLOORS_V2, {
                                    ...p,
                                    locationId: p.locationId || p.location_id,
                                    _deleted: p.is_deleted === true,
                                    source: 'cloud',
                                    syncStatus: 'synced',
                                    sync_status: 'synced',
                                    updatedAt: p.updated_at || new Date().toISOString()
                                });
                                const planPdf = p.pdf_url || p.pdfUrl;
                                if (planPdf && String(planPdf).startsWith('http') && typeof window.rbiEnqueueCloudFilesForCache === 'function') {
                                    rbiEnqueueCloudFilesForCache([planPdf], 'construction_plan');
                                }
                            }
                        }
                        tableDone('construction_floors_v2');   // строки записаны на устройство — метка таблицы
                    }
                    if (STORES.CONST_DEFECTS_V2) {
                        const { data: cloudDefects, error: defErr } = await changedSince(window.supabaseClient
                            .from('construction_defects_v2')
                            .select('*'), tableSince('construction_defects_v2'));
                        if (defErr) throw defErr;
                        if (Array.isArray(cloudDefects)) {
                            for (const d of cloudDefects) {
                                if (!d || !d.id) continue;
                                // Как у location_nodes: не затирать локальный soft-delete / dirty до push.
                                const localDefect = await dbGet(STORES.CONST_DEFECTS_V2, d.id);
                                const cloudIsDeleted = d.is_deleted === true;
                                const localDeletePending =
                                    localDefect &&
                                    (localDefect._deleted === true || localDefect.is_deleted === true) &&
                                    ((localDefect.syncStatus || localDefect.sync_status) === 'not_synced' ||
                                        localDefect.source === 'local');
                                if (localDeletePending && !cloudIsDeleted) {
                                    console.log(
                                        '[Sync][Стройконтроль v2] Пропущен pull: локальное удаление дефекта ожидает отправки',
                                        d.id
                                    );
                                    continue;
                                }
                                const localDirty =
                                    localDefect &&
                                    ((localDefect.syncStatus || localDefect.sync_status) === 'not_synced' ||
                                        localDefect.source === 'local');
                                if (localDirty && !cloudIsDeleted) {
                                    const localTime = new Date(
                                        localDefect.updated_at || localDefect.updatedAt || 0
                                    ).getTime();
                                    const cloudTime = new Date(d.updated_at || 0).getTime();
                                    if (localTime >= cloudTime) {
                                        console.log(
                                            '[Sync][Стройконтроль v2] Пропущен pull: локальная правка дефекта новее/ожидает push',
                                            d.id
                                        );
                                        continue;
                                    }
                                }
                                // photo (text) → photos[]; open/cancelled → issued/rejected
                                let photos = [];
                                if (Array.isArray(d.photos) && d.photos.length) {
                                    photos = d.photos.filter(function (p) { return typeof p === 'string' && p.trim(); });
                                } else if (typeof d.photo === 'string' && d.photo.trim()) {
                                    const rawPhoto = d.photo.trim();
                                    if (rawPhoto.charAt(0) === '[') {
                                        try {
                                            const parsedPhoto = JSON.parse(rawPhoto);
                                            if (Array.isArray(parsedPhoto)) {
                                                photos = parsedPhoto.filter(function (p) {
                                                    return typeof p === 'string' && p.trim();
                                                });
                                            } else {
                                                photos = [rawPhoto];
                                            }
                                        } catch (_) {
                                            photos = [rawPhoto];
                                        }
                                    } else {
                                        photos = [rawPhoto];
                                    }
                                }
                                let st = String(d.status || '').toLowerCase();
                                if (st === 'open') st = 'issued';
                                if (st === 'cancelled') st = 'rejected';
                                await dbPut(STORES.CONST_DEFECTS_V2, {
                                    ...d,
                                    locationId: d.locationId || d.location_id,
                                    contractorId: d.contractorId || d.contractor_id || null,
                                    authorId: d.core_created_by || '',   // P2-0061: автор — id учётной записи (сервер)
                                    photos,
                                    photo: photos[0] || d.photo || null,
                                    status: st || 'issued',
                                    _deleted: d.is_deleted === true,
                                    source: 'cloud',
                                    cloudKnown: true,   // P2-0061 (З5): сервер уже знает запись — в начале прохода её правку не слать
                                    syncStatus: 'synced',
                                    sync_status: 'synced',
                                    updatedAt: d.updated_at || new Date().toISOString()
                                });
                            }
                        }
                        tableDone('construction_defects_v2');   // строки записаны на устройство — метка таблицы
                    }
                    if (STORES.CONST_ACCEPTANCE_V2) {
                        const { data: cloudAcc, error: accErr } = await changedSince(window.supabaseClient
                            .from('construction_acceptance_v2')
                            .select('*'), tableSince('construction_acceptance_v2'));
                        if (accErr) throw accErr;
                        if (Array.isArray(cloudAcc)) {
                            for (const a of cloudAcc) {
                                if (!a || !a.id) continue;
                                // Как у location_nodes / defects_v2: не затирать delete-pending / dirty.
                                const localAcc = await dbGet(STORES.CONST_ACCEPTANCE_V2, a.id);
                                const cloudIsDeleted = a.is_deleted === true;
                                const localDeletePending =
                                    localAcc &&
                                    (localAcc._deleted === true || localAcc.is_deleted === true) &&
                                    ((localAcc.syncStatus || localAcc.sync_status) === 'not_synced' ||
                                        localAcc.source === 'local');
                                if (localDeletePending && !cloudIsDeleted) {
                                    console.log(
                                        '[Sync][Стройконтроль v2] Пропущен pull: локальное удаление приёмки ожидает отправки',
                                        a.id
                                    );
                                    continue;
                                }
                                const localDirty =
                                    localAcc &&
                                    ((localAcc.syncStatus || localAcc.sync_status) === 'not_synced' ||
                                        localAcc.source === 'local');
                                if (localDirty && !cloudIsDeleted) {
                                    const localTime = new Date(
                                        localAcc.updated_at || localAcc.updatedAt || 0
                                    ).getTime();
                                    const cloudTime = new Date(a.updated_at || 0).getTime();
                                    if (localTime >= cloudTime) {
                                        console.log(
                                            '[Sync][Стройконтроль v2] Пропущен pull: локальная правка приёмки новее/ожидает push',
                                            a.id
                                        );
                                        continue;
                                    }
                                }
                                let st = String(a.status || '').toLowerCase();
                                if (st !== 'pending' && st !== 'rejected' && st !== 'accepted') st = 'pending';
                                await dbPut(STORES.CONST_ACCEPTANCE_V2, {
                                    ...a,
                                    locationId: a.locationId || a.location_id,
                                    contractorId: a.contractorId || a.contractor_id || null,
                                    zone: a.zone && typeof a.zone === 'object' ? a.zone : null,
                                    status: st,
                                    _deleted: a.is_deleted === true,
                                    source: 'cloud',
                                    authorId: a.core_created_by || '',   // P2-0061: автор — id учётной записи (сервер)
                                    syncStatus: 'synced',
                                    sync_status: 'synced',
                                    updatedAt: a.updated_at || new Date().toISOString()
                                });
                            }
                        }
                        tableDone('construction_acceptance_v2');   // строки записаны на устройство — метка таблицы
                    }
                    // Pull помещений construction-v2 (шахматка; без фото)
                    if (STORES.CONST_UNITS_V2) {
                        const { data: cloudUnits, error: unitsErr } = await changedSince(window.supabaseClient
                            .from('construction_units_v2')
                            .select('*'), tableSince('construction_units_v2'));
                        if (unitsErr) throw unitsErr;
                        if (Array.isArray(cloudUnits)) {
                            for (const u of cloudUnits) {
                                if (!u || !u.id) continue;
                                let st = String(u.status || '').toLowerCase();
                                if (st !== 'none' && st !== 'ready' && st !== 'defects' && st !== 'accepted') st = 'none';
                                const sortRaw = Number(u.sort_order);
                                await dbPut(STORES.CONST_UNITS_V2, {
                                    ...u,
                                    locationId: u.locationId || u.location_id,
                                    name: u.name != null ? String(u.name) : '',
                                    type: u.type != null ? String(u.type) : 'КВ',
                                    sort_order: Number.isFinite(sortRaw) ? sortRaw : 0,
                                    status: st,
                                    _deleted: u.is_deleted === true,
                                    source: 'cloud',
                                    syncStatus: 'synced',
                                    sync_status: 'synced',
                                    updatedAt: u.updated_at || new Date().toISOString()
                                });
                                const unitPdf = u.pdf_url || u.pdfUrl;
                                if (unitPdf && String(unitPdf).startsWith('http') && typeof window.rbiEnqueueCloudFilesForCache === 'function') {
                                    rbiEnqueueCloudFilesForCache([unitPdf], 'construction_plan');
                                }
                            }
                        }
                        tableDone('construction_units_v2');   // строки записаны на устройство — метка таблицы
                    }
                    const locSvc = window.RBI && window.RBI.services && window.RBI.services.locations;
                    if (locSvc && typeof locSvc.init === 'function') {
                        await locSvc.init();
                    }
                    const defSvc = window.RBI && window.RBI.services && window.RBI.services.constructionDefects;
                    if (defSvc && typeof defSvc.init === 'function') {
                        await defSvc.init();
                    }
                    const accSvc = window.RBI && window.RBI.services && window.RBI.services.constructionAcceptance;
                    if (accSvc && typeof accSvc.init === 'function') {
                        await accSvc.init();
                    }
                    const unitsSvc = window.RBI && window.RBI.services && window.RBI.services.constructionUnits;
                    if (unitsSvc && typeof unitsSvc.init === 'function') {
                        await unitsSvc.init();
                    }
                } catch (e) {
                    console.warn('[Sync][Локации] Не удалось подтянуть location_nodes/floors_v2/defects_v2/acceptance_v2/units_v2:', e.message || e);
                }
            }
            // Пользовательские Чек-листы (Объекты)
            const templatePullSince = needFullReferencePull ? '' : lastPullAt;
            const templateObjects = await window.pullCloudObjects('user_template', templatePullSince, mode);
            if (templateObjects && templateObjects.length > 0) {
                if (!window.userTemplates || typeof window.userTemplates !== 'object') {
                    const templatesSvc = window.RBI && window.RBI.services && window.RBI.services.templates;
                    if (templatesSvc && typeof templatesSvc.replaceUserTemplates === 'function') {
                        templatesSvc.replaceUserTemplates({});
                    } else {
                        window.userTemplates = {};
                    }
                }
                let templatesChanged = false;
                for (const obj of templateObjects) {
                    const localExisting = await dbGet('user_templates', obj.id);
                    const localTime = localExisting?.data ? new Date(localExisting.data.updatedAt || 0).getTime() : 0;
                    const cloudTime = new Date(obj.updatedAt || 0).getTime();

                    if (!localExisting || cloudTime > localTime) {
                        if (obj._deleted) {
                            delete window.userTemplates[obj.id];
                            await dbDelete('user_templates', obj.id);
                        } else {
                            window.userTemplates[obj.id] = obj;
                            await dbPut('user_templates', { slug: obj.id, data: obj });
                        }
                        templatesChanged = true;
                    }
                }
                if (templatesChanged && window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
                    window.RBI.events.emit('templates:changed', {});
                }
            }
        } catch (e) {
            console.warn("[Sync] Прочие модули не подтянуты:", e.message);
        }
        // =====================================================
        // 5. PUSH: локальная история в новую архитектуру (ОПТИМИЗИРОВАНО)
        // =====================================================
        if (_syncProg()) _syncProg().setStep(6);
        if (canPush) {
            // =====================================================
            // 4.9. PUSH: company role-matrix overrides (§23 Блок 2)
            // Только isAdmin / canManageRoles; sparse jsonb; dirty-only.
            // =====================================================
            try {
                const companySvcPush = window.RBI && window.RBI.services && window.RBI.services.company;
                const permsPush = window.RBI && window.RBI.services && window.RBI.services.permissions;
                const canManageMatrix = !!(permsPush && (
                    (typeof permsPush.isAdmin === 'function' && permsPush.isAdmin()) ||
                    (typeof permsPush.canManageRoles === 'function' && permsPush.canManageRoles())
                ));
                if (companySvcPush && canManageMatrix &&
                    typeof companySvcPush.isRoleMatrixDirty === 'function' &&
                    companySvcPush.isRoleMatrixDirty()) {
                    const companyIdPush = (typeof companySvcPush.getCompanyId === 'function')
                        ? companySvcPush.getCompanyId()
                        : 'rbi';
                    const overridesPush = (typeof companySvcPush.getRoleMatrixOverrides === 'function')
                        ? companySvcPush.getRoleMatrixOverrides()
                        : {};
                    const updatedAtPush = new Date().toISOString();
                    const { error: cPushErr } = await window.supabaseClient
                        .from('rbi_company_settings')
                        .upsert({
                            company_id: companyIdPush,
                            role_matrix_overrides: overridesPush,
                            updated_at: updatedAtPush
                        }, { onConflict: 'company_id' });
                    if (cPushErr) {
                        console.warn('[Sync] company role-matrix push:', cPushErr.message || cPushErr);
                        pushErrors++; rbiNoteErr(cPushErr);
                        localStorage.setItem('rbi_cloud_dirty', '1');
                    } else if (typeof companySvcPush.markRoleMatrixSynced === 'function') {
                        companySvcPush.markRoleMatrixSynced(updatedAtPush);
                        console.log('[Sync] company role-matrix overrides pushed');
                    }
                }
            } catch (e) {
                console.warn('[Sync] company role-matrix push failed:', e && e.message ? e.message : e);
                pushErrors++; rbiNoteErr(e);
            }

            // =====================================================
            // 4.9b. PUSH: official templates pointer (редактор системных
            // чек-листов Блок 1). Отдельный upsert — НЕ объединять с
            // role_matrix_overrides в одном вызове (риск затирания при
            // гонке двух функций одной строки, см. current_plan.md).
            // =====================================================
            try {
                const companySvcPush2 = window.RBI && window.RBI.services && window.RBI.services.company;
                const permsPush2 = window.RBI && window.RBI.services && window.RBI.services.permissions;
                const canManageOfficial = !!(permsPush2 && (
                    (typeof permsPush2.isAdmin === 'function' && permsPush2.isAdmin()) ||
                    (typeof permsPush2.canManageRoles === 'function' && permsPush2.canManageRoles())
                ));
                if (companySvcPush2 && canManageOfficial &&
                    typeof companySvcPush2.isOfficialTemplatesDirty === 'function' &&
                    companySvcPush2.isOfficialTemplatesDirty()) {
                    const companyIdPush2 = (typeof companySvcPush2.getCompanyId === 'function')
                        ? companySvcPush2.getCompanyId()
                        : 'rbi';
                    const officialPush = (typeof companySvcPush2.getOfficialTemplates === 'function')
                        ? companySvcPush2.getOfficialTemplates()
                        : {};
                    const updatedAtPush2 = new Date().toISOString();
                    const { error: cPushErr2 } = await window.supabaseClient
                        .from('rbi_company_settings')
                        .upsert({
                            company_id: companyIdPush2,
                            official_templates: officialPush,
                            updated_at: updatedAtPush2
                        }, { onConflict: 'company_id' });
                    if (cPushErr2) {
                        console.warn('[Sync] official templates push:', cPushErr2.message || cPushErr2);
                        pushErrors++; rbiNoteErr(cPushErr2);
                        localStorage.setItem('rbi_cloud_dirty', '1');
                    } else if (typeof companySvcPush2.markOfficialTemplatesSynced === 'function') {
                        companySvcPush2.markOfficialTemplatesSynced(updatedAtPush2);
                        console.log('[Sync] official templates pushed');
                    }
                }
            } catch (e) {
                console.warn('[Sync] official templates push failed:', e && e.message ? e.message : e);
                pushErrors++; rbiNoteErr(e);
            }

            // P2-0059: свои осмотры — функция rbiPushOwnInspections (первыми в проходе и здесь — то, что записали за время загрузки)
            await rbiPushOwnInspections();
        }
        // =====================================================
        // 6. PUSH: черновик
        // =====================================================
        if (canPush) {
            if (typeof dbGet === 'function') {
                const currentSession = await dbGet('app_state', 'current_session');

                if (currentSession) {
                    const draftPhotos = {};

                    for (const itemId of Object.keys(currentSession.photos || {})) {
                        // Фото стройконтроля (def_*) хранятся в CONST_DEFECTS, не в черновике осмотра
                        if (String(itemId).startsWith('def_')) {
                            continue;
                        }
                        // Множественные фото к пункту чек-листа (B1): каждый элемент
                        // массива грузится отдельно (защита: только реально локальные —
                        // не http — фото), обратная совместимость со старым форматом
                        // (строка) через normalizeItemPhotos.
                        const itemPhotosArr = window.normalizeItemPhotos(currentSession.photos[itemId]);
                        const draftArr = [];
                        for (let pIdx = 0; pIdx < itemPhotosArr.length; pIdx++) {
                            const srcPhoto = itemPhotosArr[pIdx];
                            if (srcPhoto && !srcPhoto.startsWith('http')) {
                                const inspectorPath = window.sanitizeStorageKeySegment(stableInspectorId);
                                draftArr.push(await window.rbiUploadAsset(
                                    srcPhoto,
                                    'inspection-photos',
                                    `${pCode}/drafts/${inspectorPath}/${itemId}_${pIdx}`,
                                    'photo'
                                ));
                            } else {
                                draftArr.push(srcPhoto);
                            }
                        }
                        draftPhotos[itemId] = draftArr;
                    }

                    await window.supabaseClient
                        .from('rbi_draft_sessions')
                        .upsert({
                            id: window.RbiIds.stableId('draft', stableInspectorId),   // P2-0072: устойчивый uuid v5 от инженера (было `draft_${stableInspectorId}`)
                            project_code: pCode,
                            engineer_name: iName,
                            template_key: currentSession.templateKey || '',
                            template_title: currentSession.templateTitle || '',
                            contractor_name: currentSession.contractor || '',
                            location: currentSession.location || '',
                            section: currentSession.section || '',
                            floor: currentSession.floor || '',
                            room: currentSession.room || '',
                            state: currentSession.state || {},
                            details: currentSession.details || {},
                            photos: draftPhotos,
                            custom_expert_conclusions: currentSession.customExpertConclusions || {},
                            device_id: window.syncConfig.deviceId,
                            updated_at: new Date(currentSession.timestamp || Date.now()).toISOString()
                        }, { onConflict: 'id' });
                }
            }
        }
        // =====================================================
        // 7. PUSH: профиль инженера для совместимости
        // =====================================================
        // =====================================================
        // 7. PUSH: профиль инженера для совместимости
        // =====================================================
        if (canPush) {
            try {
                const currentSession = (typeof dbGet !== 'undefined')
                    ? (await dbGet('app_state', 'current_session') || {})
                    : {};

                // ИСПРАВЛЕНИЕ: Пушим профиль если были действия ИЛИ смена UI-настроек
                const lastPushTime = lastPushAt ? new Date(lastPushAt).getTime() : 0;
                const settingsUpdatedAt = (typeof appSettings !== 'undefined' && appSettings.settingsUpdatedAt)
                    ? Number(appSettings.settingsUpdatedAt)
                    : 0;
                const profileLastUpdated = Math.max(
                    currentSession.timestamp || 0,
                    (typeof gameActionLogs !== 'undefined' && gameActionLogs.length > 0) ? new Date(gameActionLogs[gameActionLogs.length - 1].date).getTime() : 0,
                    (typeof weeklyPlanData !== 'undefined' && weeklyPlanData.tasks && weeklyPlanData.tasks.length > 0) ? new Date(weeklyPlanData.tasks[0].updatedAt || 0).getTime() : 0,
                    settingsUpdatedAt
                );

                // 🛡️ ЗАЩИТА 2: Строгая проверка свежести профиля
                // Устройство отправит свой XP в облако ТОЛЬКО если оно реально заработало новый опыт
                // ПОСЛЕ последней синхронизации.
                const isProfileReallyNewer = profileLastUpdated > lastPushTime;

                if (isProfileReallyNewer) {
                    let currentAuthUserId = null;
                    let currentAuthEmail = '';

                    try {
                        const { data: authData } = await window.supabaseClient.auth.getUser();
                        currentAuthUserId = authData?.user?.id || null;
                        currentAuthEmail = authData?.user?.email || '';
                    } catch (e) {
                        console.warn('[Sync] Не удалось получить auth user для профиля:', e);
                    }

                    // ИСПРАВЛЕНИЕ (403 42501): без валидного auth_user_id RLS-политика
                    // всегда отклонит upsert (проверено на реальной ошибке Supabase).
                    // Раньше сюда всё равно уходил payload с auth_user_id: null,
                    // что гарантированно триггерило "new row violates row-level security policy".
                    // Если сессия истекла/недоступна — не отправляем профиль в этой синхронизации,
                    // следующая успешная синхронизация с валидной сессией отправит его.
                    if (!currentAuthUserId) {
                        console.warn('[Sync] Профиль инженера не отправлен: невалидная auth-сессия (auth_user_id недоступен).');
                        throw new Error('Нет валидной auth-сессии для отправки профиля');
                    }

                    const profilePayload = {
                        inspector_id: stableInspectorId,

                        auth_user_id: currentAuthUserId,
                        auth_email: currentAuthEmail,
                        last_auth_at: new Date().toISOString(),

                        inspector_name: iName,
                        engineer_name: iName,
                        project_code: pCode,
                        pin_hash: window.syncConfig.pinHash || '',

                        profile_data: {
                            timestamp: Date.now(),
                            session: currentSession,

                            gameLogs: typeof gameActionLogs !== 'undefined' ? gameActionLogs : [],
                            plan: typeof weeklyPlanData !== 'undefined' ? weeklyPlanData : null,
                            absence: typeof engineerAbsence !== 'undefined' ? engineerAbsence : null,
                            statuses: typeof contractorStatuses !== 'undefined' ? contractorStatuses : {},
                            expertConclusions: typeof customExpertConclusions !== 'undefined' ? customExpertConclusions : {},

                            settings: typeof appSettings !== 'undefined' ? appSettings : {}
                        },

                        settings: typeof appSettings !== 'undefined' ? appSettings : {},
                        last_seen_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };

                    const { error: profileError } = await window.supabaseClient
                        .from('rbi_engineer_profiles')
                        .upsert(profilePayload, { onConflict: 'auth_user_id' });   // P2-0035b: один профиль на учётку в компании (040b)

                    if (profileError) {
                        console.error('[Sync] Ошибка записи профиля:', profileError);
                        throw profileError;
                    }

                    actuallyPushedProfiles = 1;
                    console.log('[Sync] Профиль инженера отправлен:', stableInspectorId);

                } // Закрываем if (profileLastUpdated >= lastPushTime)

            } catch (e) {
                console.warn('[Sync] Профиль инженера не отправлен:', e.message);
                if (mode === 'manual') safeToast('⚠️ Профиль не отправлен: ' + e.message.substring(0, 60));
            }
        }
        // =====================================================
        // 7.1. PUSH: задачи в rbi_tasks
        // =====================================================
        // P2-0061 (ТД 315): «своё первым» у задач — та же функция вызывается и в начале прохода, до скачивания чужого;
        // повтор в проходе отправленное не шлёт (задачи помечаются «отправлено»)
        async function rbiPushTasks(onlyNew = false) {
        if (canPush) {
            try {

                let tasks = typeof dbGetAll === 'function'
                    ? (await dbGetAll('rbi_tasks') || [])
                    : (typeof window.rbi_tasksData !== 'undefined' ? window.rbi_tasksData : []);
                if (onlyNew) tasks = tasks.filter(t => t && !t.cloudKnown);

                const lastPushTimeTasks = lastPushAt ? new Date(lastPushAt).getTime() : 0;

                // ИСПРАВЛЕНИЕ: Отправляем ручные локальные / несинхронизированные задачи,
                // даже если они старше последней синхронизации
                const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
                const nowPush = Date.now();
                tasks = tasks.filter(t => {
                    if (!t) return false;
                    // manual + auto (системный план); прочие типы не трогаем
                    if (t.type && t.type !== 'manual' && t.type !== 'auto') return false;

                    const syncSt = t.syncStatus || t.sync_status || '';
                    const taskStatus = t.status || '';

                    // Окно: открытые всегда; done/blocked — только за 2 недели
                    if (taskStatus === 'done' || taskStatus === 'blocked') {
                        const u = new Date(t.updatedAt || t.updated_at || t.date || t.createdAt || 0).getTime();
                        if (u > 0 && (nowPush - u) > twoWeeksMs) return false;
                    }

                    // Уже в облаке без локальных правок — не пушим
                    if (syncSt === 'synced') return false;

                    // pending / not_synced / пусто / ai — в облако
                    if (syncSt !== 'synced') return true;

                    const tTime = new Date(t.updatedAt || t.updated_at || t.date || t.createdAt || 0).getTime();
                    return tTime === 0 || Number.isNaN(tTime) || tTime >= lastPushTimeTasks;
                });
                // P2-0023: задачи «нужно внимание» не шлём, пока пользователь их не изменит.
                // Доработка 2: с повтором по расписанию (2/5/10 мин), как у проверок.
                if (window.RbiSyncRetryPolicy) tasks = tasks.filter(t => {
                    if (!window.RbiSyncRetryPolicy.isAttention(t) || window.RbiSyncRetryPolicy.attentionRetryDue(t, Date.now())) return true;
                    rbiNoteAttentionRetry(t.syncAttentionRetryAt);
                    return false;
                });
                // P2-0061: чьё и можно ли — общее правило (по id автора и исполнителя, объекту, фирме); отсеянное — «Не отправлено» с причиной
                {
                    const pass = [];
                    for (const t of tasks) {
                        const gate = rbiAccessGate('task', t);
                        if (gate.changed && typeof dbPut === 'function') await dbPut('rbi_tasks', t);
                        if (gate.ok) pass.push(t);
                    }
                    tasks = pass;
                }

                actuallyPushedTasks += tasks.length; // Запоминаем для честного счетчика (P2-0061: функция зовётся дважды за проход)

                if (tasks.length > 0) {
                    // ИСПРАВЛЕНИЕ: Пакетная отправка (Batch Upsert). 
                    // Решает проблему зависания, когда задач накопилось больше сотни.
                    for (let i = 0; i < tasks.length; i += 50) {
                        const batch = tasks.slice(i, i + 50);

                        // --- НОВОЕ: Загружаем фото закрытия задачи в облако ---
                        // P2-0023: задача без файла фото → «нужно внимание», остальные задачи уходят.
                        const attentionTasks = new Set();
                        for (let task of batch) {
                            if (task.completionPhoto && task.completionPhoto.startsWith('local://')) {
                                try {
                                    task.completionPhoto = await window.rbiUploadAsset(
                                        task.completionPhoto,
                                        'inspection-photos',
                                        `${pCode}/tasks/${task.id}`,
                                        'photo'
                                    );
                                } catch (upErr) {
                                    const rp = window.RbiSyncRetryPolicy;
                                    if (!(rp && rp.isMissingFileError(upErr))) throw upErr;
                                    rp.markAttention(task);
                                    rbiNoteAttentionRetry(task.syncAttentionRetryAt);
                                    attentionTasks.add(task);
                                    syncAttentionCount++;
                                }
                                if (typeof dbPut === 'function') await dbPut('rbi_tasks', task); // Обновляем локально, чтобы сохранить ссылку
                            }
                        }
                        const sendBatch = batch.filter(t => !attentionTasks.has(t));
                        // ------------------------------------------------------

                        const upsertData = sendBatch.map(task => ({
                            id: String(task.id),
                            project_code: pCode,
                            project_canonical_key: task.project_canonical_key || task.project || task.projectName || '',
                            project_display_name: task.project_display_name || task.project || task.projectName || '',
                            engineer_name: task.engineerName || task.inspectorName || iName,
                            inspector_name: task.engineerName || task.inspectorName || iName,
                            contractor_name: task.contractor || task.contractorName || '',
                            title: task.title || '',
                            task_data: {
                                ...task,
                                source: 'cloud',
                                sync_status: 'synced'
                            },
                            status: task.status || 'pending',
                            task_date: task.date || task.taskDate || null,
                            is_deleted: task._deleted || false,
                            deleted_at: task._deleted ? (task._deletedAt || new Date().toISOString()) : null,
                            updated_at: task.updatedAt || task.updated_at || new Date().toISOString(),
                            created_at: task.createdAt || task.created_at || new Date().toISOString()
                        }));

                        const { error: taskError } = upsertData.length === 0 ? { error: null } : await window.supabaseClient
                            .from('rbi_tasks')
                            .upsert(upsertData, { onConflict: 'id' });

                        if (taskError) throw taskError;
                        batch.length = 0; batch.push(...sendBatch);
                        // После успешной отправки задач помечаем локальные ручные задачи как синхронизированные
                        for (const task of batch) {
                            if (window.RbiSyncRetryPolicy) window.RbiSyncRetryPolicy.clearAttention(task);
                            task.source = 'cloud';
                            task.cloudKnown = true;
                            task.syncStatus = 'synced';
                            task.sync_status = 'synced';
                            task.syncBlockReason = '';
                            task.sync_block_reason = '';
                            task.importedFromBackup = false;
                            task.updatedAt = new Date().toISOString();

                            if (typeof dbPut === 'function') {
                                await dbPut('rbi_tasks', task);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("[Sync] Задачи не отправлены:", e.message);
                pushErrors++; rbiNoteErr(e);
                // P2-0023: одно и то же сообщение — один раз, с понятной причиной (а не на каждый круг).
                const rp = window.RbiSyncRetryPolicy;
                const reason = rp ? rp.humanSyncReason(e) : e.message.substring(0, 60);
                const key = 'tasks:' + reason;
                if (mode === 'manual' && (!rp || rp.shouldShowErrorOnce(localStorage.getItem('rbi_sync_error_shown'), key))) {
                    localStorage.setItem('rbi_sync_error_shown', key);
                    safeToast('⚠️ Задачи не отправлены: ' + reason);
                }
            }

        }
        }
        await rbiPushTasks();
        // =====================================================
        // 8. PUSH: рейтинг инженера
        // =====================================================
        if (canPush) {
            try {
                if (typeof gameCalculateAllProfiles === 'function') {
                    const profiles = gameCalculateAllProfiles();
                    const my = profiles[iName];

                    if (my) {
                        const rating = {
                            name: my.name || iName,
                            pi: my.pi || 0,
                            checksCount: my.checksCount || 0,
                            currentStreak: my.currentStreak || 0,
                            badgesData: my.badgesData || {},
                            monthlyPI: my.monthlyPI || {},
                            radarData: my.radarData || {},
                            levelObj: my.levelObj || null
                        };

                        const { data: authData } = await window.supabaseClient.auth.getUser();
                        const authUserId = authData?.user?.id || null;

                        await window.supabaseClient
                            .from('rbi_engineer_ratings')
                            .upsert({
                                id: stableInspectorId,
                                project_code: pCode,
                                engineer_name: iName,
                                auth_user_id: authUserId,
                                rating_data: rating,
                                pi: rating.pi,
                                checks_count: rating.checksCount,
                                level_name: rating.levelObj?.name || '',
                                is_deleted: false,
                                updated_at: new Date().toISOString()
                            }, { onConflict: authUserId ? 'auth_user_id' : 'project_code,engineer_name' });   // P2-0035b: рейтинг — по учётке (040b)
                    }
                }
            } catch (e) {
                console.warn("[Sync] Рейтинг не отправлен:", e.message);
            }
        }
        // P2-0044: отправка замечаний Стройконтроля 2.0 — отдельным шагом: подрядчику (без права «создавать»)
        // она тоже нужна («В работу», «Устранено»); что он может менять — решает сервер (043, сторож подрядчика).
        async function pushConstructionDefectsV2(onlyNew = false) {   // P2-0061 (ТД 315): объявление — чтобы вызвать и в начале прохода
            // Push замечаний construction-v2 (как legacy const_defect — любой авторизованный push-capable, не только admin)
            if (STORES.CONST_DEFECTS_V2 && typeof window.prepareConstructionDefectV2ForCloud === 'function') {
                try {
                    const defectItems = await dbGetAll(STORES.CONST_DEFECTS_V2) || [];
                    let defectsToPush = defectItems.filter(d => {
                        if (onlyNew && d && d.cloudKnown) return false;   // З5
                        const status = d.syncStatus || d.sync_status || '';
                        const source = d.source || '';
                        return status === 'not_synced' || status === 'blocked' || source === 'local';
                    });
                    // P2-0061: замечания — общее правило (как row_visible_id сервера: своя фирма по id контрагента, без объектов),
                    // отсеянное — «Не отправлено» с причиной; две копии отбора по названию фирмы и ФИО (замечания, приёмки) удалены
                    {
                        const pass = [];
                        for (const d of defectsToPush) {
                            const gate = rbiAccessGate('defect_v2', d);
                            if (gate.changed && typeof dbPut === 'function') await dbPut(STORES.CONST_DEFECTS_V2 || 'construction_defects_v2', d);
                            if (gate.ok) pass.push(d);
                        }
                        defectsToPush = pass;
                    }
                    for (const item of defectsToPush) {
                        // Upload local:// / data:image из photos + history (+ legacy photo)
                        // в bucket construction-defects до upsert (как const_defect).
                        if (
                            item.is_deleted !== true &&
                            item._deleted !== true &&
                            typeof window.uploadObjectFilesToCloud === 'function'
                        ) {
                            const pCode = (window.syncConfig && window.syncConfig.projectCode) || 'shared';
                            const uploaded = await window.uploadObjectFilesToCloud(
                                {
                                    photos: Array.isArray(item.photos) ? item.photos : [],
                                    history: item.history != null ? item.history : [],
                                    photo: item.photo || null
                                },
                                'construction-defects',
                                `${pCode}/const_defect_v2/${item.id}`,
                                'photo'
                            );
                            if (uploaded) {
                                if (Array.isArray(uploaded.photos)) item.photos = uploaded.photos;
                                if (uploaded.history != null) item.history = uploaded.history;
                                if (uploaded.photo != null) item.photo = uploaded.photo;
                                // если photos залиты, а photo остался local — синхронизируем mirror
                                if (Array.isArray(item.photos) && item.photos.length) {
                                    item.photo = item.photos[0];
                                }
                            }
                        }
                        const cloudItem = window.prepareConstructionDefectV2ForCloud(item);
                        if (!cloudItem) continue;
                        const { error } = await window.supabaseClient
                            .from('construction_defects_v2')
                            .upsert(cloudItem, { onConflict: 'id' });
                        if (error) throw error;
                        item.source = 'cloud';
                        item.cloudKnown = true;
                        item.syncStatus = 'synced';
                        item.sync_status = 'synced';
                        item.updatedAt = new Date().toISOString();
                        item.updated_at = item.updatedAt;
                        await dbPut(STORES.CONST_DEFECTS_V2, item);
                    }
                    const defSvcPush = window.RBI && window.RBI.services && window.RBI.services.constructionDefects;
                    if (defSvcPush && typeof defSvcPush.init === 'function') {
                        await defSvcPush.init();
                    }
                } catch (e) {
                    console.warn('[Sync][Стройконтроль v2] Ошибка отправки construction_defects_v2:', e);
                    pushErrors++; rbiNoteErr(e);
                    localStorage.setItem('rbi_cloud_dirty', '1');
                }
            }
        }

        // =====================================================
        // 8.1. PUSH: прочие модули через rbi_cloud_objects
        // =====================================================
        if (canPush) {
            try {
                // P2-0061: отправка проектных записей — по действиям с сервера (правка или управление любым модулем), не по названию
                // роли: у инженера только Стройконтроля роль экрана «Директор» — раньше он не отправлял ничего; каждую запись решает правило
                const meProj = window.RbiSyncAccess ? window.RbiSyncAccess.deviceMe() : null;
                const canCreatePush = meProj ? meProj.actions.some(a => /\.(edit|manage)$/.test(a))
                    : (window.RBI.services.permissions ? window.RBI.services.permissions.canCreate() : false);
                const projectObjectPushRole = window.RBI.services.permissions ? window.RBI.services.permissions.getCurrentRole() : 'guest'; // <-- ВОТ ЭТА СТРОКА

                if (!canCreatePush) {
                    console.log('[Sync] Push прочих проектных модулей пропущен из-за ограничений роли');
                    if (projectObjectPushRole === 'contractor' && typeof dbGetAll === 'function' && window.supabaseClient
                        && typeof STORES !== 'undefined') {
                        await pushConstructionDefectsV2();
                    }
                } else {
                    const lastPushTime = lastPushAt ? new Date(lastPushAt).getTime() : 0;
                    const filterNew = (arr) => arr.filter(i => {
                        if (!i) return false;

                        const status = i.syncStatus || i.sync_status || '';
                        const source = i.source || '';

                        // Явно грязные записи отправляем всегда.
                        if (status === 'not_synced') return true;
                        if (status === 'blocked') return true;
                        if (source === 'local') return true;

                        // Облачное эхо не отправляем обратно.
                        if (source === 'cloud' || status === 'synced') return false;

                        // Если это локальный объект без статуса — считаем его кандидатом на отправку.
                        // Это важно для шаблонов, практик и отчетов, если при создании им не поставили syncStatus.
                        if (!source && !status) return true;

                        if (!lastPushTime) return true;

                        const rawTime =
                            i.updatedAt ||
                            i.updated_at ||
                            i.modifiedAt ||
                            i.modified_at ||
                            i.createdAt ||
                            i.created_at ||
                            i.generated_at ||
                            i.date ||
                            i.timestamp ||
                            0;

                        const t = new Date(rawTime).getTime();

                        // Если даты нет, лучше один раз попробовать отправить, чем потерять объект.
                        if (!t || Number.isNaN(t)) return true;

                        // Небольшой запас 5 секунд на рассинхрон часов/округление времени.
                        return t >= (lastPushTime - 5000);
                    });
                    // Единая функция отправки для всех новых таблиц
                    const syncTableData = async (storeName, memoryArrayName, objectType) => {
                        if (typeof dbGetAll !== 'function') return;
                        let items = filterNew(await dbGetAll(storeName) || []);

                        // P2-0061: виды с описанием `sync` (совещания, FMEA, вмешательства, этапы, эталоны, практики, TWI, документы) — общее
                        // правило (как сервер: команда объекта / своя фирма / библиотека компании), отсеянное — «Не отправлено» с причиной.
                        // Служебные хранилища без описания (справочники, шаблоны, база ИИ) — как раньше: не админ — только свои по подписи.
                        const SAk = window.RbiSyncAccess ? window.RbiSyncAccess.kindOf(storeName) : null;
                        if (SAk) {
                            const pass = [];
                            for (const obj of items) {
                                const gate = rbiAccessGate(SAk.kind, obj);
                                if (gate.changed && typeof dbPut === 'function') await dbPut(storeName, obj);
                                if (gate.ok) pass.push(obj);
                            }
                            items = pass;
                        } else {
                            const isAdminPush = window.RBI.services.permissions ? window.RBI.services.permissions.isAdmin() : false;
                            if (!isAdminPush && objectType !== 'feedback') {
                                items = items.filter(obj => {
                                    const objOwner = obj.owner || obj.author || obj.inspectorName || obj.engineerName || '';
                                    return !objOwner || objOwner === iName;
                                });
                            }
                        }
                        // ---------------------------------------------------------------------------------

                        for (const obj of items) {
                            try {
                                // RBI FIX: страхуем объекты, созданные на разных браузерах.
                                // Если конструктор шаблона/практики/отчета не поставил служебные поля,
                                // синхронизатор сам доводит объект до отправляемого состояния.
                                if (!obj.id) {
                                    obj.id = window.RbiIds.newId();
                                }

                                if (!obj.updatedAt && !obj.updated_at) {
                                    obj.updatedAt = new Date().toISOString();
                                }

                                if (!obj.source) {
                                    obj.source = 'local';
                                }

                                if (!obj.syncStatus && !obj.sync_status) {
                                    obj.syncStatus = 'not_synced';
                                    obj.sync_status = 'not_synced';
                                }

                                // bucketName внутри функции pushCloudObject переопределится сам на правильный
                                const updated = await window.pushCloudObject(objectType, obj.id, obj, 'custom-assets');
                                const registryBucketMap = {
                                    custom_twi_card: 'library-twi',
                                    custom_doc: 'library-docs',
                                    custom_node: 'library-nodes',
                                    practice: 'library-practices',
                                    etalon: 'library-etalons',
                                    assistant_kb: 'library-docs'
                                };

                                const registryBucket = registryBucketMap[objectType] || 'custom-assets';

                                if (updated && typeof window.rbiRegisterObjectFilesToRegistry === 'function') {
                                    await window.rbiRegisterObjectFilesToRegistry(objectType, obj.id, updated, registryBucket);
                                }
                                if (updated) {
                                    updated.source = 'cloud';
                                    updated.syncStatus = 'synced';
                                    updated.sync_status = 'synced';
                                    updated.syncBlockReason = '';
                                    updated.sync_block_reason = '';
                                    updated.importedFromBackup = false;
                                    updated.updatedAt = new Date().toISOString();

                                    // ЗАЩИТА ОТ RACE: пока шел push, запись в IndexedDB могла обновиться
                                    // (например, фоновая индексация OCR норматива дописала extractedText).
                                    // Подтягиваем самую свежую версию и мержим в неё результат push,
                                    // а не затираем её напрямую — иначе такие поля будут потеряны.
                                    try {
                                        const freshRecord = typeof dbGet === 'function'
                                            ? await dbGet(storeName, updated.id)
                                            : (await dbGetAll(storeName) || []).find(x => String(x.id) === String(updated.id));
                                        if (freshRecord && freshRecord.updatedAt && new Date(freshRecord.updatedAt).getTime() > new Date(obj.updatedAt || obj.updated_at || 0).getTime()) {
                                            updated = Object.assign({}, freshRecord, updated);
                                        }
                                    } catch (mergeErr) {
                                        console.warn('[Sync] Не удалось смержить свежую запись перед сохранением:', mergeErr);
                                    }

                                    await dbPut(storeName, updated);

                                    if (window[memoryArrayName] && Array.isArray(window[memoryArrayName])) {
                                        // НОВОЕ: Если элемент удален, чистим его из ОЗУ. Иначе - обновляем/добавляем
                                        if (updated._deleted || updated.is_deleted) {
                                            window[memoryArrayName] = window[memoryArrayName].filter(x => String(x.id) !== String(updated.id));
                                        } else {
                                            const idx = window[memoryArrayName].findIndex(x => String(x.id) === String(updated.id));
                                            if (idx !== -1) {
                                                window[memoryArrayName][idx] = updated;
                                            } else {
                                                window[memoryArrayName].push(updated);
                                            }
                                        }
                                    }
                                }
                            } catch (objErr) {
                                // RBI FIX (гонка "PDF/фото не синхронизируется"): ошибка отправки ОДНОГО
                                // объекта (например, файл ещё не дозаписался в IndexedDB, см. rbiUploadAsset)
                                // больше не прерывает отправку всех остальных объектов этой и следующих таблиц.
                                // Проблемный объект остаётся not_synced/local и будет отправлен повторно
                                // на следующем цикле синхронизации, когда файл уже точно будет на месте.
                                console.warn(`[Sync] Не удалось отправить объект ${objectType}/${obj.id}, повтор на следующей синхронизации:`, objErr.message || objErr);
                                pushErrors++; rbiNoteErr(objErr);
                            }
                        }
                    };

                    // Синхронизация проектных модулей. P2-0061: виды с описанием `sync` и общей отправкой «объектов» — по описаниям
                    // манифестов (совещания, вмешательства, практики, этапы, FMEA, эталоны, документы, TWI; новый вид — одна строка)
                    const SAo = window.RbiSyncAccess;
                    const objKinds = SAo ? SAo.objectKinds(SAo.KINDS) : [];
                    const byDescription = new Set(objKinds.map(k => k.store));
                    for (const k of objKinds) await syncTableData(k.store, k.memory || '_sys_dummy', k.objectType);
                    if (!SAo) {   // правило не загрузилось — прежний список
                        await syncTableData('rbi_meetings', 'rbi_meetingsData', 'meeting');
                        await syncTableData('rbi_interventions', 'rbi_interventionsData', 'intervention');
                        await syncTableData('rbi_practices', 'rbi_practicesData', 'practice');
                        await syncTableData('rbi_schedule_stages', 'rbi_scheduleData', 'schedule');
                        await syncTableData('rbi_fmea', 'rbi_fmeaRecords', 'fmea');
                        await syncTableData('rbi_etalon_acts', 'etalonActsArray', 'etalon');
                    }
                    // Синхронизация модулей Стройконтроля (Иерархия, Дефекты на планах, Приемка)
                    await syncTableData('construction_buildings', '_sys_dummy', 'const_building');
                    await syncTableData('construction_floors', '_sys_dummy', 'const_floor');
                    await syncTableData('construction_defects', '_sys_dummy', 'const_defect');
                    await syncTableData('construction_units', '_sys_dummy', 'const_unit');
                    await syncTableData('construction_acceptance', '_sys_dummy', 'const_acceptance');

                    // Синхронизация новых таблиц Справочников
                    // Синхронизация новых таблиц Справочников
                    if (!byDescription.has('custom_docs')) await syncTableData('custom_docs', 'customDocs', 'custom_doc');
                    if (!byDescription.has('custom_nodes')) await syncTableData('custom_nodes', 'customNodes', 'custom_node');
                    if (!byDescription.has('twi_cards')) await syncTableData('twi_cards', 'customTwiCards', 'custom_twi_card');

                    // C2b: sync project_objects / object_aliases отключён — SoT = locations
                    // (case-ветки в push-pull сохранены для отката; сюда не заходим)
                    const C2B_OD_SYNC_DISABLED = true;
                    const canManageObjects = window.RBI.services.permissions && typeof window.RBI.services.permissions.canManageObjects === 'function'
                        ? window.RBI.services.permissions.canManageObjects()
                        : false;

                    // Отправка справочника объектов (только для Админов) — disabled C2b
                    if (!C2B_OD_SYNC_DISABLED && canManageObjects) {
                        await syncTableData('project_objects', '_sys_obj_dummy', 'project_object');
                        await syncTableData('object_aliases', '_sys_alias_dummy', 'object_alias');
                    } else if (C2B_OD_SYNC_DISABLED && canManageObjects) {
                        console.log('[Sync] C2b: skip push project_object / object_alias (SoT=locations)');
                    }

                    // Отправка заявок на новые объекты (могут все, кто может создавать проверки)
                    const canCreate = window.RBI.services.permissions ? window.RBI.services.permissions.canCreate() : false;
                    if (canCreate) {
                        await syncTableData('object_normalization_queue', '_sys_obj_queue_dummy', 'object_queue');
                    }

                    await syncTableData('feedback_list', 'rbi_feedbackData', 'feedback');
                    await syncTableData('report_templates', 'userReportTemplates', 'report_template');
                    await syncTableData('app_assistant_kb', 'appAssistantData', 'assistant_kb'); // <-- ОТПРАВКА БАЗЫ ИИ В ОБЛАКО
                    // --- АВТОМАТИЧЕСКАЯ ДЕДУПЛИКАЦИЯ TWI (РЕШЕНИЕ ОФЛАЙН-КОНФЛИКТОВ) ---
                    // Правило владельца (24.10.2026): на один пункт — одна карта, выживает более ранняя. Не убирать.
                    if (typeof customTwiCards !== 'undefined' && customTwiCards.length > 0) {
                        const twiMap = new Map();
                        for (let i = 0; i < customTwiCards.length; i++) {
                            const c = customTwiCards[i];
                            // Проверяем только живые карты Технадзора с привязкой к конкретному пункту
                            if (c._deleted || c.type !== 'INSPECTOR' || !c.itemId || c.itemId === 'ALL') continue;

                            const dupKey = `${c.checklistKey}_${c.itemId}`;
                            if (twiMap.has(dupKey)) {
                                // Конфликт! Два инженера создали карту в офлайне.
                                const existing = twiMap.get(dupKey);
                                const timeExisting = new Date(existing.createdAt || 0).getTime();
                                const timeCurrent = new Date(c.createdAt || 0).getTime();

                                // Выживает та, что создана раньше. Проигравшая удаляется.
                                let loser = timeCurrent > timeExisting ? c : existing;
                                let winner = timeCurrent > timeExisting ? existing : c;

                                // Мягко удаляем проигравшую карточку (она отправится в облако как удаленная)
                                loser._deleted = true;
                                loser.is_deleted = true;
                                loser.updatedAt = new Date().toISOString();
                                loser.source = 'local';
                                loser.syncStatus = 'not_synced';
                                await dbPut('twi_cards', loser);

                                twiMap.set(dupKey, winner); // Оставляем победителя
                            } else {
                                twiMap.set(dupKey, c);
                            }
                        }
                        // Очищаем оперативную память от "убитых" дубликатов
                        customTwiCards = customTwiCards.filter(c => !c._deleted);
                    }
                    // --- КОНЕЦ ДЕДУПЛИКАЦИИ ---
                    // --- НОВОЕ: ОТПРАВКА ОТЧЕТОВ И HTML СНИМКОВ ---
                    const reportIdsToPush = [];
                    await dbForEachCursor(STORES.REPORTS, (item) => {
                        if (!item) return;
                        // Только метаданные (без file_blob) — легкий предикат filterNew.
                        const meta = {
                            syncStatus: item.syncStatus,
                            sync_status: item.sync_status,
                            source: item.source,
                            updatedAt: item.updatedAt,
                            updated_at: item.updated_at,
                            modifiedAt: item.modifiedAt,
                            modified_at: item.modified_at,
                            createdAt: item.createdAt,
                            created_at: item.created_at,
                            generated_at: item.generated_at,
                            date: item.date,
                            timestamp: item.timestamp
                        };
                        if (filterNew([meta]).length) {
                            reportIdsToPush.push(item.id);
                        }
                    });

                    // P2-0061: чужие отчёты — по общему правилу (как сервер: команда объекта, своя фирма), отсеянное — с причиной

                    for (const repId of reportIdsToPush) {
                        // Точечная подгрузка (с file_blob) непосредственно перед отправкой —
                        // чтобы в память попадала только одна запись, а не все REPORTS сразу.
                        const rep = await dbGet(STORES.REPORTS, repId);
                        if (!rep) continue;
                        {
                            const gate = rbiAccessGate('report', rep);
                            if (gate.changed && typeof dbPut === 'function') await dbPut(STORES.REPORTS, rep);
                            if (!gate.ok) continue;
                        }
                        try {
                            // RBI FIX: отчеты, созданные в разных браузерах, должны гарантированно попадать в push.
                            if (!rep.updatedAt && !rep.updated_at) {
                                rep.updatedAt = new Date().toISOString();
                                rep.updated_at = rep.updatedAt;
                            }

                            if (!rep.source) {
                                rep.source = 'local';
                            }

                            if (!rep.syncStatus && !rep.sync_status) {
                                rep.syncStatus = 'not_synced';
                                rep.sync_status = 'not_synced';
                            }
                            if (!rep.is_deleted && rep.file_blob && (!rep.file_url || rep.sync_status !== 'synced')) {
                                // 1. Загружаем PDF в бакет
                                const fileName = `${rep.id}.pdf`;
                                const { data: fileData, error: fileErr } = await window.supabaseClient.storage
                                    .from('reports')
                                    .upload(fileName, rep.file_blob, { upsert: true, contentType: 'application/pdf' });

                                if (fileErr) throw fileErr;

                                // Получаем публичную ссылку
                                const { data: pubData } = window.supabaseClient.storage.from('reports').getPublicUrl(fileName);
                                rep.file_url = pubData.publicUrl;
                            }

                            // 2. Отправляем метаданные в таблицу
                            await window.pushCloudObject('report', rep.id, rep, 'reports');
                            if (rep.file_url && typeof window.rbiRegisterObjectFilesToRegistry === 'function') {
                                await window.rbiRegisterObjectFilesToRegistry('report', rep.id, rep, 'reports');
                            }

                            // 3. Отправляем HTML-снимок для QR-кода (берем надежно из базы)
                            if (rep.snapshot_html) {
                                const snap = {
                                    id: 'snap_' + rep.id,
                                    report_id: rep.id,
                                    public_token: rep.public_token || rep.metadata?.public_token || rep.id,
                                    html_content: rep.snapshot_html,
                                    is_public: rep.is_public !== false,
                                    is_deleted: rep.is_deleted === true || rep._deleted === true,
                                    created_at: rep.created_at || new Date().toISOString(),
                                    updated_at: rep.updated_at || new Date().toISOString(),
                                    expires_at: null
                                };
                                await window.pushCloudObject('snapshot', snap.id, snap);

                                // После успешной отправки удаляем тяжелый HTML из базы телефона для экономии места
                                rep.snapshot_html = null;
                            } else if (window._tempSnapshots && window._tempSnapshots[rep.id]) {
                                // Резервный старый вариант из оперативной памяти
                                const snap = window._tempSnapshots[rep.id];
                                await window.pushCloudObject('snapshot', snap.id || ('snap_' + rep.id), snap);
                                delete window._tempSnapshots[rep.id];
                            }

                            // 4. ЖЕСТКО помечаем локально как синхронизированное (чтобы бейдж стал зеленым)
                            rep.source = 'cloud';
                            rep.sync_status = 'synced';
                            rep.syncStatus = 'synced';
                            rep.updated_at = new Date().toISOString();
                            rep.updatedAt = rep.updated_at; // Дублируем ключ для верности
                            await dbPut(STORES.REPORTS, rep);

                            // Обновляем массив в оперативной памяти (без PDF в RAM для облачных)
                            if (typeof reportsArray !== 'undefined') {
                                const idx = reportsArray.findIndex(x => x.id === rep.id);
                                if (idx !== -1) {
                                    const mem = { ...rep };
                                    if (mem.file_url && String(mem.file_url).startsWith('http')) mem.file_blob = null;
                                    reportsArray[idx] = mem;
                                }
                            }

                            // Заставляем интерфейс перерисовать экран отчетов мгновенно!
                            if (document.getElementById('tab-analytics')?.classList.contains('active') && window.currentHistoryViewMode === 'reports') {
                                if (typeof renderReportsList === 'function') renderReportsList();
                            }

                        } catch (err) {
                            console.error('[Sync] Ошибка выгрузки отчета:', err);
                        }
                    }
                    // ---------------------------------------------

                    // Отправка ПК СК: новая правильная модель.
                    // Больше НЕ отправляем bundle с массивом records.
                    // Каждое замечание уходит отдельной строкой в public.sk_records
                    // с защитой от дублей через unique(project_code, sk_number).
                    if (typeof dbGetAll === 'function' && window.supabaseClient) {
                        let skRecs = await dbGetAll(STORES.SK_RECORDS) || [];

                        // P2-0061: ПК СК — по общему правилу (право «Качество: правка», объект, своя фирма; как сервер), отсеянное — с причиной
                        {
                            const pass = [];
                            for (const r of skRecs.filter(window.isSkRecordDirtyForPush)) {
                                const gate = rbiAccessGate('sk_record', r);
                                if (gate.changed && typeof dbPut === 'function') await dbPut(STORES.SK_RECORDS, r);
                                if (gate.ok) pass.push(r);
                            }
                            skRecs = pass;
                        }

                        const skRecordsToPush = skRecs.filter(window.isSkRecordDirtyForPush);

                        if (skRecordsToPush.length > 0) {
                            let pushedSkCount = 0;
                            let blockedSkCount = 0;

                            const batchSize = 500;

                            for (let start = 0; start < skRecordsToPush.length; start += batchSize) {
                                const batch = skRecordsToPush.slice(start, start + batchSize);

                                const cloudBatch = [];
                                const localBatchMap = new Map();

                                for (const rec of batch) {
                                    const cloudRec = window.prepareSkRecordForCloud(rec, pCode);

                                    if (!cloudRec || !cloudRec.sk_number) {
                                        rec.syncStatus = 'blocked';
                                        rec.sync_status = 'blocked';
                                        rec.syncBlockReason = 'ПК СК: нет номера замечания';
                                        rec.sync_block_reason = rec.syncBlockReason;
                                        await dbPut(STORES.SK_RECORDS, rec);
                                        blockedSkCount++;
                                        continue;
                                    }

                                    const key = `${cloudRec.project_code}_${cloudRec.sk_number}`;
                                    cloudBatch.push(cloudRec);
                                    localBatchMap.set(key, rec);
                                }

                                if (cloudBatch.length === 0) continue;

                                try {
                                    const { data, error } = await window.supabaseClient
                                        .from('sk_records')
                                        .upsert(cloudBatch, {
                                            onConflict: 'project_code,sk_number'
                                        })
                                        .select('project_code,sk_number,id,updated_at');

                                    if (error) throw error;

                                    const nowIso = new Date().toISOString();
                                    const localBatchToUpdate = []; // <-- НОВЫЙ МАССИВ ДЛЯ ПАКЕТА

                                    for (const row of data || []) {
                                        const key = `${row.project_code}_${row.sk_number}`;
                                        const rec = localBatchMap.get(key);
                                        if (!rec) continue;

                                        rec.id = row.id || rec.id;
                                        rec.source = 'cloud';
                                        rec.syncStatus = 'synced';
                                        rec.sync_status = 'synced';
                                        rec.syncBlockReason = '';
                                        rec.sync_block_reason = '';
                                        rec._updatedAt = row.updated_at || nowIso;
                                        rec.updated_at = row.updated_at || nowIso;
                                        rec.updatedAt = row.updated_at || nowIso;

                                        localBatchToUpdate.push(rec); // <-- КЛАДЕМ В МАССИВ ВМЕСТО ОЖИДАНИЯ
                                        pushedSkCount++;
                                    }

                                    // СОХРАНЯЕМ ВСЮ ПАЧКУ СРАЗУ
                                    if (localBatchToUpdate.length > 0 && typeof dbPutBatch === 'function') {
                                        await dbPutBatch(STORES.SK_RECORDS, localBatchToUpdate);
                                    }
                                } catch (e) {
                                    console.warn('[Sync][ПК СК] Ошибка пакетной отправки:', e);

                                    for (const rec of batch) {
                                        rec.syncStatus = 'blocked';
                                        rec.sync_status = 'blocked';
                                        rec.syncBlockReason = e.message || 'Ошибка пакетной отправки ПК СК';
                                        rec.sync_block_reason = rec.syncBlockReason;
                                        rec._updatedAt = new Date().toISOString();
                                        rec.updated_at = rec._updatedAt;
                                        rec.updatedAt = rec._updatedAt;

                                        await dbPut(STORES.SK_RECORDS, rec);
                                        blockedSkCount++;
                                    }

                                    pushErrors++; rbiNoteErr(e);
                                    localStorage.setItem('rbi_cloud_dirty', '1');
                                }
                            }

                            console.log(`[Sync][ПК СК] Отправлено: ${pushedSkCount}, заблокировано: ${blockedSkCount}`);
                        }

                        // Отправка журнала загрузок ПК СК
                        if (STORES.SK_IMPORT_BATCHES) {
                            const importBatches = await dbGetAll(STORES.SK_IMPORT_BATCHES) || [];
                            const batchesToPush = importBatches.filter(b => {
                                const status = b.syncStatus || b.sync_status || '';
                                const source = b.source || '';
                                return status === 'not_synced' || status === 'blocked' || source === 'local';
                            });

                            for (const batch of batchesToPush) {
                                const cloudBatch = window.prepareSkImportBatchForCloud(batch, pCode);
                                if (!cloudBatch || !cloudBatch.id) continue;

                                try {
                                    const { error } = await window.supabaseClient
                                        .from('sk_import_batches')
                                        .upsert(cloudBatch, {
                                            onConflict: 'id'
                                        });

                                    if (error) throw error;

                                    batch.source = 'cloud';
                                    batch.syncStatus = 'synced';
                                    batch.sync_status = 'synced';
                                    batch.syncBlockReason = '';
                                    batch.sync_block_reason = '';
                                    batch.updatedAt = new Date().toISOString();
                                    batch.updated_at = batch.updatedAt;

                                    await dbPut(STORES.SK_IMPORT_BATCHES, batch);
                                } catch (e) {
                                    console.warn('[Sync][ПК СК] Не удалось отправить журнал импорта:', batch.id, e);
                                }
                            }
                        }
                    }
                    // =====================================================
                    // PUSH справочника подрядчиков ПК СК
                    // contractor_directory / contractor_aliases / contractor_normalization_queue
                    // =====================================================
                    if (typeof dbGetAll === 'function' && window.supabaseClient && typeof STORES !== 'undefined') {
                        const isAdminContractors = window.RBI.services.permissions ? window.RBI.services.permissions.isAdmin() : false;
                        const canPushQueue = window.RBI.services.permissions ? window.RBI.services.permissions.canCreate() : false;

                        // 1. Справочник и Алиасы отправляют ТОЛЬКО Админы
                        if (isAdminContractors) {
                            try {
                                const contractorItems = await dbGetAll(STORES.CONTRACTOR_DIRECTORY) || [];
                                const contractorsToPush = contractorItems.filter(c => {
                                    const status = c.syncStatus || c.sync_status || '';
                                    const source = c.source || '';
                                    return status === 'not_synced' || status === 'blocked' || source === 'local';
                                });

                                for (const item of contractorsToPush) {
                                    const cloudItem = window.prepareContractorForCloud(item, pCode);
                                    if (!cloudItem) continue;

                                    const { error } = await window.supabaseClient
                                        .from('contractor_directory')
                                        .upsert(cloudItem, {
                                            onConflict: 'project_code,canonical_key'
                                        });

                                    if (error) throw error;

                                    // Dual-write в платформенную таблицу contractors (тот же UUID)
                                    if (typeof window.preparePlatformContractorForCloud === 'function') {
                                        const platformItem = window.preparePlatformContractorForCloud(item);
                                        if (platformItem) {
                                            const { error: platformErr } = await window.supabaseClient
                                                .from('contractors')
                                                .upsert(platformItem, { onConflict: 'id' });
                                            if (platformErr) throw platformErr;
                                        }
                                    }

                                    item.source = 'cloud';
                                    item.syncStatus = 'synced';
                                    item.sync_status = 'synced';
                                    item.syncBlockReason = '';
                                    item.sync_block_reason = '';
                                    item.updatedAt = new Date().toISOString();
                                    item.updated_at = item.updatedAt;

                                    await dbPut(STORES.CONTRACTOR_DIRECTORY, item);
                                }
                            } catch (e) {
                                console.warn('[Sync][Подрядчики] Ошибка отправки contractor_directory:', e);
                                pushErrors++; rbiNoteErr(e);
                                localStorage.setItem('rbi_cloud_dirty', '1');
                            }

                            // Push договоров (после contractors — FK contractorId → contractors.id)
                            if (STORES.CONTRACTS && typeof window.prepareContractForCloud === 'function') {
                                try {
                                    const contractItems = await dbGetAll(STORES.CONTRACTS) || [];
                                    const contractsToPush = contractItems.filter(c => {
                                        const status = c.syncStatus || c.sync_status || '';
                                        const source = c.source || '';
                                        return status === 'not_synced' || status === 'blocked' || source === 'local';
                                    });

                                    for (const item of contractsToPush) {
                                        const cloudItem = window.prepareContractForCloud(item);
                                        if (!cloudItem) continue;

                                        const { error } = await window.supabaseClient
                                            .from('contracts')
                                            .upsert(cloudItem, { onConflict: 'id' });

                                        if (error) throw error;

                                        item.source = 'cloud';
                                        item.syncStatus = 'synced';
                                        item.sync_status = 'synced';
                                        item.syncBlockReason = '';
                                        item.sync_block_reason = '';
                                        item.updatedAt = new Date().toISOString();
                                        item.updated_at = item.updatedAt;

                                        await dbPut(STORES.CONTRACTS, item);
                                    }
                                } catch (e) {
                                    console.warn('[Sync][Подрядчики] Ошибка отправки contracts:', e);
                                    pushErrors++; rbiNoteErr(e);
                                    localStorage.setItem('rbi_cloud_dirty', '1');
                                }
                            }

                            try {
                                const aliasItems = await dbGetAll(STORES.CONTRACTOR_ALIASES) || [];
                                const aliasesToPush = aliasItems.filter(a => {
                                    const status = a.syncStatus || a.sync_status || '';
                                    const source = a.source || '';
                                    return status === 'not_synced' || status === 'blocked' || source === 'local';
                                });

                                for (const item of aliasesToPush) {
                                    const cloudItem = window.prepareContractorAliasForCloud(item, pCode);
                                    if (!cloudItem) continue;

                                    const { error } = await window.supabaseClient
                                        .from('contractor_aliases')
                                        .upsert(cloudItem, {
                                            onConflict: 'project_code,raw_name'
                                        });

                                    if (error) throw error;

                                    item.source = 'cloud';
                                    item.syncStatus = 'synced';
                                    item.sync_status = 'synced';
                                    item.syncBlockReason = '';
                                    item.sync_block_reason = '';
                                    item.updatedAt = new Date().toISOString();
                                    item.updated_at = item.updatedAt;

                                    await dbPut(STORES.CONTRACTOR_ALIASES, item);
                                }
                            } catch (e) {
                                console.warn('[Sync][Подрядчики] Ошибка отправки contractor_aliases:', e);
                                pushErrors++; rbiNoteErr(e);
                                localStorage.setItem('rbi_cloud_dirty', '1');
                            }

                            // Push справочника локаций v2 + планов этажей — только admin (как contractor_directory).
                            // P2-0037 (ТД №194): при входе по почте — только роль со справочником объектов (033c); иначе сервер
                            // отклоняет узел, ошибка повторяется каждый обмен и останавливает отправку следующих узлов.
                            const qsLoc = window.RBI && window.RBI.qualitySync;
                            const locActions = qsLoc && qsLoc.active && Array.isArray(qsLoc.actions) ? qsLoc.actions : null;
                            const canPushLocations = !locActions || locActions.indexOf('quality.objects.manage') !== -1
                                || locActions.indexOf('construction.objects.manage') !== -1;
                            if (canPushLocations && STORES.LOCATION_NODES && typeof window.prepareLocationNodeForCloud === 'function') {
                                try {
                                    const nodeItems = await dbGetAll(STORES.LOCATION_NODES) || [];
                                    const nodesToPush = nodeItems.filter(n => {
                                        const status = n.syncStatus || n.sync_status || '';
                                        const source = n.source || '';
                                        return status === 'not_synced' || status === 'blocked' || source === 'local';
                                    });
                                    const coreRefused = [];
                                    for (const item of nodesToPush) {
                                        const cloudItem = window.prepareLocationNodeForCloud(item);
                                        if (!cloudItem) continue;
                                        const { error } = await window.supabaseClient
                                            .from('location_nodes')
                                            .upsert(cloudItem, { onConflict: 'id' });
                                        // P2-0054: места ЖК ведёт «Компания» — старая правка с телефона снимается (узел — как на сервере,
                                        // новый — убирается), остальные узлы и планы этажей отправляются дальше.
                                        if (error && String(error.message || '').indexOf('Компания → Объекты и места') >= 0) {
                                            const { data: srv } = await window.supabaseClient
                                                .from('location_nodes').select('*').eq('id', item.id).maybeSingle();
                                            if (srv && srv.id) {
                                                await dbPut(STORES.LOCATION_NODES, { ...srv, _deleted: srv.is_deleted === true, source: 'cloud',
                                                    syncStatus: 'synced', sync_status: 'synced', updatedAt: srv.updated_at || new Date().toISOString() });
                                            } else {
                                                await dbDelete(STORES.LOCATION_NODES, item.id);
                                            }
                                            coreRefused.push(item.displayName || item.id);
                                            continue;
                                        }
                                        if (error) throw error;
                                        item.source = 'cloud';
                                        item.syncStatus = 'synced';
                                        item.sync_status = 'synced';
                                        item.updatedAt = new Date().toISOString();
                                        item.updated_at = item.updatedAt;
                                        await dbPut(STORES.LOCATION_NODES, item);
                                    }
                                    if (STORES.CONST_FLOORS_V2 && typeof window.prepareFloorPlanForCloud === 'function') {
                                        const planItems = await dbGetAll(STORES.CONST_FLOORS_V2) || [];
                                        const plansToPush = planItems.filter(p => {
                                            const status = p.syncStatus || p.sync_status || '';
                                            const source = p.source || '';
                                            return status === 'not_synced' || status === 'blocked' || source === 'local';
                                        });
                                        for (const item of plansToPush) {
                                            const cloudItem = window.prepareFloorPlanForCloud(item);
                                            if (!cloudItem) continue;
                                            const { error } = await window.supabaseClient
                                                .from('construction_floors_v2')
                                                .upsert(cloudItem, { onConflict: 'id' });
                                            if (error) throw error;
                                            item.source = 'cloud';
                                            item.syncStatus = 'synced';
                                            item.sync_status = 'synced';
                                            item.updatedAt = new Date().toISOString();
                                            item.updated_at = item.updatedAt;
                                            await dbPut(STORES.CONST_FLOORS_V2, item);
                                        }
                                    }
                                    const locSvc = window.RBI && window.RBI.services && window.RBI.services.locations;
                                    if (locSvc && typeof locSvc.init === 'function') {
                                        await locSvc.init();
                                    }
                                    if (coreRefused.length) {
                                        safeToast('Места этого проекта ведутся в «Компания → Объекты и места». Не отправлено и снято на телефоне: '
                                            + coreRefused.slice(0, 3).join(', ') + (coreRefused.length > 3 ? ' и ещё ' + (coreRefused.length - 3) : '')
                                            + '. Остальные данные отправлены.');
                                    }
                                } catch (e) {
                                    console.warn('[Sync][Локации] Ошибка отправки location_nodes/floors_v2:', e);
                                    pushErrors++; rbiNoteErr(e);
                                    localStorage.setItem('rbi_cloud_dirty', '1');
                                }
                            }
                        } // <-- ЗАКРЫЛИ БЛОК АДМИНА

                        // 2. Очередь заявок отправляют все Инженеры
                        if (canPushQueue) {
                            try {
                                const queueItems = await dbGetAll(STORES.CONTRACTOR_QUEUE) || [];

                                // Берём только реально грязные элементы, даже при ручной синхронизации.
                                const dirtyQueue = queueItems.filter(q => {
                                    const status = q.syncStatus || q.sync_status || '';
                                    const source = q.source || '';
                                    return status === 'not_synced' || status === 'blocked' || source === 'local';
                                });

                                // Убираем дубли по project_code + raw_name
                                const dedupMap = new Map();

                                for (const item of dirtyQueue) {
                                    const raw = String(item.raw_name || '').trim();
                                    if (!raw) continue;

                                    const key = `${item.project_code || pCode}__${raw.toLowerCase()}`;

                                    if (!dedupMap.has(key)) {
                                        dedupMap.set(key, item);
                                    }
                                }

                                const queueToPush = Array.from(dedupMap.values());
                                const cloudItems = [];

                                for (const item of queueToPush) {
                                    const cloudItem = window.prepareContractorQueueForCloud(item, pCode);
                                    if (cloudItem) cloudItems.push(cloudItem);
                                }

                                if (cloudItems.length > 0) {
                                    const { error } = await window.supabaseClient
                                        .from('contractor_normalization_queue')
                                        .upsert(cloudItems, {
                                            onConflict: 'project_code,raw_name'
                                        });

                                    if (error) throw error;

                                    const nowIso = new Date().toISOString();

                                    for (const item of queueToPush) {
                                        item.source = 'cloud';
                                        item.syncStatus = 'synced';
                                        item.sync_status = 'synced';
                                        item.syncBlockReason = '';
                                        item.sync_block_reason = '';
                                        item.updatedAt = nowIso;
                                        item.updated_at = nowIso;

                                        await dbPut(STORES.CONTRACTOR_QUEUE, item);
                                    }
                                }
                            } catch (e) {
                                console.warn('[Sync][Подрядчики] Ошибка отправки contractor_normalization_queue:', e);
                                pushErrors++; rbiNoteErr(e);
                                localStorage.setItem('rbi_cloud_dirty', '1');
                            }
                        }

                        await pushConstructionDefectsV2();

                        // Push заявок на приёмку construction-v2 (без upload фото — zone jsonb)
                        if (STORES.CONST_ACCEPTANCE_V2 && typeof window.prepareConstructionAcceptanceV2ForCloud === 'function') {
                            try {
                                const accItems = await dbGetAll(STORES.CONST_ACCEPTANCE_V2) || [];
                                let accToPush = accItems.filter(d => {
                                    const status = d.syncStatus || d.sync_status || '';
                                    const source = d.source || '';
                                    return status === 'not_synced' || status === 'blocked' || source === 'local';
                                });
                                // P2-0061: приёмки — общее правило (как замечания), отсеянное — с причиной
                                {
                                    const pass = [];
                                    for (const d of accToPush) {
                                        const gate = rbiAccessGate('acceptance_v2', d);
                                        if (gate.changed && typeof dbPut === 'function') await dbPut(STORES.CONST_ACCEPTANCE_V2 || 'construction_acceptance_v2', d);
                                        if (gate.ok) pass.push(d);
                                    }
                                    accToPush = pass;
                                }
                                for (const item of accToPush) {
                                    // Upload local:// / data:image из checklist_results.items[].photos
                                    // в bucket construction-defects до upsert (паритет defects_v2).
                                    if (
                                        item.is_deleted !== true &&
                                        item._deleted !== true &&
                                        item.checklist_results &&
                                        typeof item.checklist_results === 'object' &&
                                        Array.isArray(item.checklist_results.items) &&
                                        typeof window.uploadObjectFilesToCloud === 'function'
                                    ) {
                                        const pCode = (window.syncConfig && window.syncConfig.projectCode) || 'shared';
                                        const cr = item.checklist_results;
                                        const nextItems = [];
                                        for (const row of cr.items) {
                                            if (!row || typeof row !== 'object') {
                                                nextItems.push(row);
                                                continue;
                                            }
                                            const photos = Array.isArray(row.photos) ? row.photos : [];
                                            if (!photos.length) {
                                                nextItems.push(row);
                                                continue;
                                            }
                                            const uploaded = await window.uploadObjectFilesToCloud(
                                                { photos },
                                                'construction-defects',
                                                `${pCode}/const_acceptance_v2/${item.id}/checklist/${row.id || 'item'}`,
                                                'photo'
                                            );
                                            const nextPhotos =
                                                uploaded && Array.isArray(uploaded.photos)
                                                    ? uploaded.photos
                                                    : photos;
                                            nextItems.push({ ...row, photos: nextPhotos });
                                        }
                                        if (nextItems.length) {
                                            item.checklist_results = {
                                                ...cr,
                                                items: nextItems
                                            };
                                            // Persist https refs locally before cloud upsert
                                            try {
                                                await dbPut(STORES.CONST_ACCEPTANCE_V2, item);
                                            } catch (_ePersist) { /* ignore */ }
                                        }
                                    }
                                    const cloudItem = window.prepareConstructionAcceptanceV2ForCloud(item);
                                    if (!cloudItem) continue;
                                    const { error } = await window.supabaseClient
                                        .from('construction_acceptance_v2')
                                        .upsert(cloudItem, { onConflict: 'id' });
                                    if (error) throw error;
                                    item.source = 'cloud';
                                    item.syncStatus = 'synced';
                                    item.sync_status = 'synced';
                                    item.updatedAt = new Date().toISOString();
                                    item.updated_at = item.updatedAt;
                                    await dbPut(STORES.CONST_ACCEPTANCE_V2, item);
                                }
                                const accSvcPush = window.RBI && window.RBI.services && window.RBI.services.constructionAcceptance;
                                if (accSvcPush && typeof accSvcPush.init === 'function') {
                                    await accSvcPush.init();
                                }
                            } catch (e) {
                                console.warn('[Sync][Стройконтроль v2] Ошибка отправки construction_acceptance_v2:', e);
                                pushErrors++; rbiNoteErr(e);
                                localStorage.setItem('rbi_cloud_dirty', '1');
                            }
                        }

                        // Push помещений construction-v2 (шахматка; без фото)
                        if (STORES.CONST_UNITS_V2 && typeof window.prepareConstructionUnitV2ForCloud === 'function') {
                            try {
                                const unitItems = await dbGetAll(STORES.CONST_UNITS_V2) || [];
                                let unitsToPush = unitItems.filter(d => {
                                    const status = d.syncStatus || d.sync_status || '';
                                    const source = d.source || '';
                                    return status === 'not_synced' || status === 'blocked' || source === 'local';
                                });
                                // P2-0061: помещения — общее правило (право «Стройконтроль: правка», как quality.can сервера), отсеянное — с причиной
                                {
                                    const pass = [];
                                    for (const d of unitsToPush) {
                                        const gate = rbiAccessGate('unit_v2', d);
                                        if (gate.changed && typeof dbPut === 'function') await dbPut(STORES.CONST_UNITS_V2, d);
                                        if (gate.ok) pass.push(d);
                                    }
                                    unitsToPush = pass;
                                }
                                for (const item of unitsToPush) {
                                    const cloudItem = window.prepareConstructionUnitV2ForCloud(item);
                                    if (!cloudItem) continue;
                                    const { error } = await window.supabaseClient
                                        .from('construction_units_v2')
                                        .upsert(cloudItem, { onConflict: 'id' });
                                    if (error) throw error;
                                    item.source = 'cloud';
                                    item.syncStatus = 'synced';
                                    item.sync_status = 'synced';
                                    item.updatedAt = new Date().toISOString();
                                    item.updated_at = item.updatedAt;
                                    await dbPut(STORES.CONST_UNITS_V2, item);
                                }
                                const unitsSvcPush = window.RBI && window.RBI.services && window.RBI.services.constructionUnits;
                                if (unitsSvcPush && typeof unitsSvcPush.init === 'function') {
                                    await unitsSvcPush.init();
                                }
                            } catch (e) {
                                console.warn('[Sync][Стройконтроль v2] Ошибка отправки construction_units_v2:', e);
                                pushErrors++; rbiNoteErr(e);
                                localStorage.setItem('rbi_cloud_dirty', '1');
                            }
                        }
                    }
                    // Отправка Чек-листов (Это объект-словарь, а не массив)
                    if (typeof dbGetAll === 'function') {
                        const storedTmpls = await dbGetAll('user_templates') || [];
                        const tmplArray = storedTmpls.map(t => t.data);

                        for (const obj of filterNew(tmplArray)) {
                            const updated = await window.pushCloudObject('user_template', obj.id, obj, 'library-checklists');
                            if (updated) {
                                updated.syncStatus = 'synced';
                                updated.sync_status = 'synced';
                                await dbPut('user_templates', { slug: updated.id, data: updated });

                                if (window.userTemplates && typeof window.userTemplates === 'object') {
                                    if (updated._deleted || updated.is_deleted) {
                                        delete window.userTemplates[updated.id];
                                    } else {
                                        window.userTemplates[updated.id] = updated;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("[Sync] Прочие модули не отправлены:", e.message);
            }
        } // <-- Идеально закрытая скобка if(canPush)
        // =====================================================
        // 9. ЗАВЕРШЕНИЕ СИНХРОНИЗАЦИИ И ОБНОВЛЕНИЕ UI
        // =====================================================
        if (_syncProg()) _syncProg().setStep(7);
        const doneAt = new Date().toISOString();

        const wasFirstFullPullForOfflineCache =
            localStorage.getItem('rbi_force_full_pull') === '1' ||
            !localStorage.getItem('rbi_sync_last_pull_at') ||
            forceFullPullRequested === true ||
            needFullReferencePull === true;

        localStorage.setItem('rbi_sync_last_push_at', doneAt);
        let referenceOk = true;
        try {
            const countAlive = (arr) => (arr || []).filter(x => {
                const obj = x && x.data && typeof x.data === 'object' ? x.data : x;
                return obj && obj._deleted !== true && obj.is_deleted !== true;
            }).length;

            const checkDocs = await dbGetAll('custom_docs') || [];
            const checkNodes = await dbGetAll('custom_nodes') || [];
            const checkTwi = await dbGetAll('twi_cards') || [];
            const checkKb = await dbGetAll('app_assistant_kb') || [];
            const checkUserTemplates = await dbGetAll('user_templates') || [];
            const checkPractices = await dbGetAll('rbi_practices') || [];
            const checkEtalons = await dbGetAll('rbi_etalon_acts') || [];
            const checkReportTemplates = await dbGetAll('report_templates') || [];

            const checkReferenceCount =
                countAlive(checkDocs) +
                countAlive(checkNodes) +
                countAlive(checkTwi) +
                countAlive(checkKb) +
                countAlive(checkUserTemplates) +
                countAlive(checkPractices) +
                countAlive(checkEtalons) +
                countAlive(checkReportTemplates);

            console.log('[Sync] Проверка справочников после pull:', {
                needFullReferencePull,
                checkReferenceCount
            });

            // ВАЖНО:
            // Ноль справочников сам по себе не ошибка.
            // Проект может быть пустым или без TWI/документов/шаблонов.
            referenceOk = true;
        } catch (e) {
            console.warn('[Sync] Не удалось проверить локальные справочники после pull:', e);
            referenceOk = false;
        }

        // P2-0023: загрузка и отправка — раздельно. Раньше любая ошибка ставила полную загрузку
        // и не ставила метку последней загрузки → полный круг каждую минуту и «первый запуск» навсегда.
        const flags = window.RbiSyncRetryPolicy
            ? window.RbiSyncRetryPolicy.completionFlags({ pushErrors, transientPushErrors, pullErrors, referencePullErrors, referenceOk })
            : { pullOk: false, pushOk: false, setLastPull: false, clearForceFullPull: false, dirty: true, pause: true };
        if (flags.setLastPull) {
            localStorage.setItem('rbi_sync_last_pull_at', doneAt);
            localStorage.setItem('rbi_sync_last_remote_check_at', String(Date.now()));
            localStorage.removeItem('rbi_force_full_pull');
            localStorage.removeItem('rbi_force_remote_poll');
        }
        passOk = !!(flags.pullOk && flags.pushOk);
        if (flags.pullOk && flags.pushOk) {
            localStorage.setItem('rbi_cloud_dirty', '0');
            localStorage.removeItem('rbi_sync_fail_count');
            localStorage.removeItem('rbi_sync_retry_after');
            localStorage.removeItem('rbi_sync_retry_kind');
            localStorage.removeItem('rbi_sync_error_shown');
        } else if (flags.pause) {
            if (flags.dirty) localStorage.setItem('rbi_cloud_dirty', '1');
            rbiScheduleSyncRetryOnce();
            console.log('[Sync] Есть ошибки — повтор с паузой, без полной загрузки.', {
                pushErrors,
                transientPushErrors,
                pullErrors,
                referencePullErrors,
                referenceOk
            });
        } else {
            // Сервер отклонил отдельные записи (права/данные): они остаются неотправленными/«нет прав»
            // и уйдут со следующей обычной синхронизацией; паузы и круга каждую минуту нет.
            localStorage.setItem('rbi_cloud_dirty', '0');
            localStorage.removeItem('rbi_sync_fail_count');
            localStorage.removeItem('rbi_sync_retry_after');
            console.log('[Sync] Сервер отклонил отдельные записи — без паузы для остальных.', { pushErrors });
        }
        if (syncAttentionCount > 0) console.warn('[Sync] Записей «нужно внимание»:', syncAttentionCount);
        // =====================================================
        // 10. АВТО-ОЧИСТКА УДАЛЕННЫХ ЗАПИСЕЙ И ФАЙЛОВ ИЗ ПАМЯТИ
        // =====================================================
        try {
            const storesToClean = [
                'app_history', 'rbi_etalon_acts', 'rbi_tasks', 'rbi_meetings',
                'rbi_practices', 'rbi_interventions', 'rbi_fmea', 'sk_records',
                'user_templates', 'custom_docs', 'custom_nodes', 'twi_cards',
                'feedback_list', 'app_reports', 'project_objects', 'object_aliases'
            ];

            let hardDeletedCount = 0;
            // 1. Физическое удаление "мертвых" карточек
            for (let store of storesToClean) {
                const items = await dbGetAll(store);
                if (items) {
                    for (let item of items) {
                        const isDel = item._deleted === true || item.is_deleted === true || (item.data && item.data._deleted === true);
                        const isSynced = item.syncStatus === 'synced' || item.sync_status === 'synced';

                        if (isDel && isSynced) {
                            const key = item.id || item.slug;
                            if (key) {
                                await dbDelete(store, key);
                                hardDeletedCount++;
                            }
                        }
                    }
                }
            }

            // 2. Тихая зачистка осиротевших фото (если карточка удалена, её фото больше не нужны)
            if (hardDeletedCount > 0) {
                const usedPhotos = new Set();
                const extractFiles = (obj) => {
                    if (!obj) return;
                    if (typeof obj === 'string') {
                        if (obj.startsWith('local://') || obj.startsWith('http')) usedPhotos.add(obj);
                        return;
                    }
                    if (Array.isArray(obj)) {
                        obj.forEach(extractFiles);
                        return;
                    }
                    if (typeof obj === 'object') {
                        // Не обходим бинарные payload'ы фото/отчётов
                        if (
                            (typeof ArrayBuffer !== 'undefined' && obj instanceof ArrayBuffer) ||
                            (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(obj)) ||
                            (typeof Blob !== 'undefined' && obj instanceof Blob)
                        ) {
                            return;
                        }
                        Object.values(obj).forEach(extractFiles);
                    }
                };

                // Важно: раньше не сканировали twi/docs/nodes/templates/reports из IDB —
                // после hard-delete «мёртвых» карточек автоочистка могла снести живой офлайн-кэш БЗ.
                const allStores = [
                    'app_history', 'rbi_etalon_acts', 'rbi_tasks', 'rbi_meetings',
                    'rbi_practices', 'rbi_interventions', 'rbi_fmea', 'sk_records',
                    'user_templates', 'custom_docs', 'custom_nodes', 'twi_cards',
                    'app_reports', 'app_assistant_kb'
                ];
                for (let store of allStores) {
                    try {
                        const items = await dbGetAll(store);
                        if (items) items.forEach(extractFiles);
                    } catch (e) { /* store может отсутствовать на старых БД */ }
                }
                if (typeof customTwiCards !== 'undefined') extractFiles(customTwiCards);
                if (typeof customNodes !== 'undefined') extractFiles(customNodes);
                if (typeof customDocs !== 'undefined') extractFiles(customDocs);
                if (typeof window.rbi_practicesData !== 'undefined') extractFiles(window.rbi_practicesData);
                if (typeof window.rbi_meetingsData !== 'undefined') extractFiles(window.rbi_meetingsData);
                if (typeof reportsArray !== 'undefined') extractFiles(reportsArray);
                // P2-0023: фото черновика текущей проверки ещё не в истории — не мусор.
                if (typeof PhotoManager !== 'undefined' && typeof PhotoManager.collectDraftPhotoRefs === 'function') {
                    (await PhotoManager.collectDraftPhotoRefs()).forEach((r) => usedPhotos.add(r));
                }

                let orphanPhotosDeleted = 0;
                // Лёгкие дескрипторы (только id) — dbDelete идёт после закрытия курсора,
                // см. предупреждение в dbForEachCursor (storage-db.core.js).
                const orphanPhotoIdsToDelete = [];
                await dbForEachCursor('app_photos', (p) => {
                    if (!p || !p.id) return;
                    const alt =
                        p.sourceUrl || p.source_url || p.public_url || p.publicUrl || '';
                    if (usedPhotos.has(p.id) || (alt && usedPhotos.has(alt))) return;
                    orphanPhotoIdsToDelete.push(p.id);
                });

                for (const photoId of orphanPhotoIdsToDelete) {
                    await dbDelete('app_photos', photoId);
                    orphanPhotosDeleted++;
                    if (PhotoManager.cache && PhotoManager.cache[photoId]) {
                        URL.revokeObjectURL(PhotoManager.cache[photoId]);
                        delete PhotoManager.cache[photoId];
                    }
                }
                console.log(
                    `[Sync] Авто-очистка: навсегда удалено ${hardDeletedCount} записей` +
                    (orphanPhotosDeleted ? `, осиротевших фото: ${orphanPhotosDeleted}` : '') + '.'
                );
            }
        } catch (e) {
            console.warn('[Sync] Ошибка авто-очистки удаленных записей:', e);
        }
        // --- Фоновое кэширование облачных файлов (не чаще раза в 5 мин) ---
        // --- Лёгкое фоновое кэширование облачных файлов ---
        // --- RBI FIX: офлайн-кэш после синхронизации ---
        if (typeof window.rbiIsAutoCacheEnabled === 'function' && window.rbiIsAutoCacheEnabled()) {
            const syncWasSuccessful =
                pushErrors === 0 &&
                pullErrors === 0 &&
                referencePullErrors === 0 &&
                referenceOk === true;

            const firstFullOfflineCacheDone =
                localStorage.getItem('rbi_first_full_offline_cache_done') === '1';
            const needFullOfflineCache =
                localStorage.getItem('rbi_need_full_offline_cache') === '1';

            // Полное копирование: после первого full-pull ИЛИ после очистки кэша
            // (флаг rbi_need_full_offline_cache) — иначе после «Очистить кэш»
            // остаётся done=1 и файлы больше не докачиваются.
            const shouldRunFirstFullOfflineCache =
                !firstFullOfflineCacheDone &&
                typeof window.downloadMissingCloudFiles === 'function' &&
                (
                    (wasFirstFullPullForOfflineCache === true && syncWasSuccessful) ||
                    needFullOfflineCache === true
                );

            if (shouldRunFirstFullOfflineCache) {
                // ВАЖНО:
                // После первой полной синхронизации нужно кэшировать ВСЁ,
                // а не только лёгкую очередь из 12-30 файлов.
                // Старт ПОСЛЕ sync (setTimeout) — не блокирует UI завершения sync / pull таблиц.
                // Сразу ставим паузу sync, чтобы за 1.5s delay не ушёл второй круг.
                localStorage.setItem('rbi_first_full_offline_cache_started_at', String(Date.now()));
                if (typeof window.rbiBeginOfflineCacheSyncPause === 'function') {
                    window.rbiBeginOfflineCacheSyncPause('post_sync_full_offline_cache');
                }

                setTimeout(async () => {
                    try {
                        if (window.rbiFullOfflineCacheProcessing) return;

                        window.rbiFullOfflineCacheProcessing = true;

                        try {
                            console.log(
                                needFullOfflineCache
                                    ? '[OfflineCache] Запрошено повторное полное копирование для офлайна.'
                                    : '[OfflineCache] Первая полная синхронизация завершена. Запускаем полное копирование файлов для офлайна.'
                            );

                            // Прогресс N/M+МБ в mini-toast; не await внутри pull.
                            await window.downloadMissingCloudFiles(false, 'auto');   // P2-0060: охват этого человека (роль / выбор)

                            window.rbiBgCacheQueue = [];

                            localStorage.setItem('rbi_first_full_offline_cache_done', '1');
                            localStorage.setItem('rbi_last_bg_cache_at', String(Date.now()));
                            localStorage.removeItem('rbi_need_full_offline_cache');

                            if (typeof window.rbi_reloadReferenceMemory === 'function') {
                                await window.rbi_reloadReferenceMemory();
                            }

                            if (window.syncDirtyFlags) {
                                window.syncDirtyFlags.reference = true;
                                window.syncDirtyFlags.history = true;
                                window.syncDirtyFlags.analytics = true;
                                window.syncDirtyFlags.tasks = true;
                            }

                            console.log('[OfflineCache] Первичное полное копирование для офлайна завершено.');
                        } catch (e) {
                            console.warn('[OfflineCache] Ошибка первичного полного копирования:', e);
                            localStorage.removeItem('rbi_first_full_offline_cache_done');
                        } finally {
                            window.rbiFullOfflineCacheProcessing = false;
                        }
                    } finally {
                        if (typeof window.rbiEndOfflineCacheSyncPause === 'function') {
                            window.rbiEndOfflineCacheSyncPause();
                        }
                    }
                }, 800);
            } else {
                // Обычный режим после следующих синхронизаций:
                // не копируем всё заново, а обрабатываем только лёгкую очередь.
                const now = Date.now();
                const lastCacheAt = Number(localStorage.getItem('rbi_last_bg_cache_at') || 0);

                const hasCacheQueue = Array.isArray(window.rbiBgCacheQueue) && window.rbiBgCacheQueue.length > 0;

                if (hasCacheQueue || !lastCacheAt || (now - lastCacheAt) > 3 * 60 * 1000 || mode === 'manual') {
                    localStorage.setItem('rbi_last_bg_cache_at', String(now));

                    setTimeout(() => {
                        if (typeof window.rbiProcessBgCacheQueue === 'function') {
                            const concurrency = window.RBI_OFFLINE_CACHE_CONCURRENCY || 4;
                            const pause = window.RBI_OFFLINE_CACHE_BATCH_PAUSE_MS ?? 60;
                            window.rbiProcessBgCacheQueue({
                                maxPerRun: mode === 'manual' ? 120 : 80,
                                concurrency,
                                pauseBetweenRounds: pause
                            });
                        }
                    }, 1000);
                }
            }
        }
        // ИСПРАВЛЕНИЕ: Честный подсчет реально отправленных и полученных объектов
        const pulledChecks = cloudInspections ? cloudInspections.length : 0;
        const pushedChecks = actuallyPushedChecks;

        const totalPushed = pushedChecks + actuallyPushedTasks + actuallyPushedProfiles;
        const hasChanges = pulledChecks > 0 || totalPushed > 0;
        if (window.RbiSyncJournal) window.RbiSyncJournal.add({ k: 'end', ok: passOk, pushed: totalPushed, pulled: pulledChecks, attention: syncAttentionCount, ms: Date.now() - syncStartedAt, mode });

        // Включаем флаги "Грязных данных", чтобы вкладки обновились при переходе на них
        window.syncDirtyFlags.templates = true;
        window.syncDirtyFlags.history = true;
        window.syncDirtyFlags.analytics = true;
        window.syncDirtyFlags.tasks = true;
        window.syncDirtyFlags.session = true;
        window.syncDirtyFlags.reference = true; // <-- ДОБАВИЛИ ФЛАГ СПРАВОЧНИКА
        // Справочник объектов: данные в память всегда; initUI (поля Осмотра +
        // updateBodyPadding) — НЕ на активной вкладке Осмотр: иначе тихий sync
        // через несколько секунд даёт скачок шапки/списка (регресс §5).
        if (typeof ObjectDirectory !== 'undefined') {
            const auditLive = !!(document.getElementById('tab-audit')?.classList.contains('active'));
            if (auditLive && typeof ObjectDirectory.rebuildFromLocations === 'function') {
                try { await ObjectDirectory.rebuildFromLocations(); } catch (e) {
                    console.warn('[Sync] ObjectDirectory rebuild skipped UI:', e);
                }
            } else {
                await ObjectDirectory.init();
            }
        }

        // === АВТОГЕНЕРАЦИЯ И СИНХРОНИЗАЦИЯ ЗАДАЧ ===
        // Запускаем пересчет только если не открыто модальное окно
        const isModalOpen = document.body.classList.contains('modal-open');

        // Смотрит ли юзер на Задачи / Инженер (единый хелпер §5)?
        const isTasksTabActive = (typeof window.shouldDeferFullRender === 'function')
            ? window.shouldDeferFullRender(['tasks', 'engineer'])
            : !!(document.getElementById('tab-engineer')?.classList.contains('active'));

        // Если открыта модалка ИЛИ открыта вкладка Задач — запрещаем перерисовку!
        if (!isModalOpen && !isTasksTabActive) {
            if (typeof dbGetAll === 'function') {
                const freshTasks = await dbGetAll('rbi_tasks');
                if (freshTasks) window.rbi_tasksData = freshTasks.filter(t => !t._deleted);
            }

            if (typeof window.rbi_generateAutoTasks === 'function') await window.rbi_generateAutoTasks(true);
            if (typeof window.sk_generateAnomalyTasks === 'function') await window.sk_generateAnomalyTasks();
            if (typeof gameForceUpdatePlan === 'function') await gameForceUpdatePlan(true);
        } else {
            // Откладываем обновление на потом, чтобы не сбрасывать экран пользователю
            window.syncDirtyFlags.tasks = true;
            window.syncDirtyFlags.history = true;
        }
        // RBI NEW: мягкая автоочистка после полного успешного цикла синхронизации.
        // Ставим здесь, а не после профиля, чтобы сначала завершились проверки, задачи, справочники и интерфейсные флаги.
        try {
            if (
                window.RbiStorageManager &&
                typeof appSettings !== 'undefined' &&
                appSettings.storageAutoCleanupEnabled !== false &&
                typeof window.RbiStorageManager.syncFileRegistryFromCloud === 'function' &&
                typeof window.RbiStorageManager.runAdaptiveStorageCleanup === 'function'
            ) {
                await window.RbiStorageManager.syncFileRegistryFromCloud({ passSince: lastPullAt });
                if (typeof window.RbiStorageManager.backfillLocalFileRegistryCache === 'function') {
                    await window.RbiStorageManager.backfillLocalFileRegistryCache();
                }

                // Без await: очистка фоновая, не блокирует финальное сообщение синхронизации
                window.RbiStorageManager.runAdaptiveStorageCleanup('after_sync');
            }
        } catch (storageCleanupError) {
            console.warn('[StorageManager] Ошибка автоочистки после полной синхронизации:', storageCleanupError);
        }
        // <-- ВСТАВКА: Тихо обновляем Бэклог и в ручном, и в фоновом режиме (если вкладка открыта)
        // <-- ВСТАВКА: Тихо обновляем Бэклог и в ручном, и в фоновом режиме (если вкладка открыта)
        if (typeof rbi_renderFeedbackTab === 'function') rbi_renderFeedbackTab();
        if (typeof rbi_renderDevFeedbackTab === 'function') rbi_renderDevFeedbackTab();

        // RBI FIX: практики и эталоны после pull — paint только если Справочник не на экране (§5).
        if ((pulledPracticesChanged || pulledEtalonsChanged) && !document.body.classList.contains('modal-open')) {
            setTimeout(async () => {
                try {
                    const deferRef = (typeof window.shouldDeferFullRender === 'function')
                        ? window.shouldDeferFullRender('reference')
                        : false;

                    if (pulledPracticesChanged) {
                        if (typeof rbi_loadPractices === 'function') {
                            await rbi_loadPractices();
                        }
                        if (!deferRef && typeof rbi_renderPracticesTab === 'function') {
                            await rbi_renderPracticesTab();
                        }
                    }

                    if (pulledEtalonsChanged) {
                        if (typeof dbGetAll === 'function') {
                            window.etalonActsArray = (await dbGetAll('rbi_etalon_acts') || [])
                                .filter(x => !x._deleted && !x.is_deleted);
                        }

                        if (!deferRef) {
                            if (typeof renderEtalonActs === 'function') renderEtalonActs();
                            if (typeof renderEtalonsList === 'function') renderEtalonsList();
                            if (typeof renderEtalonList === 'function') renderEtalonList();
                            if (typeof renderEtalons === 'function') renderEtalons();
                            if (typeof renderReferenceTab === 'function') renderReferenceTab();
                        }
                    }

                    if (deferRef) {
                        if (window.RBI?.utils?.syncUi?.markDirty) {
                            window.RBI.utils.syncUi.markDirty(['reference', 'analytics']);
                        } else if (window.syncDirtyFlags) {
                            window.syncDirtyFlags.reference = true;
                            window.syncDirtyFlags.analytics = true;
                        }
                    } else if (window.syncDirtyFlags) {
                        window.syncDirtyFlags.reference = false;
                        window.syncDirtyFlags.analytics = true;
                    }

                    console.log('[Sync] Практики/эталоны обновлены в интерфейсе без перезагрузки.');
                } catch (e) {
                    console.warn('[Sync] Не удалось мягко обновить практики/эталоны:', e);
                    if (window.syncDirtyFlags) {
                        window.syncDirtyFlags.reference = true;
                        window.syncDirtyFlags.analytics = true;
                    }
                }
            }, 300);
        }

        if (mode === 'manual') {
            if (typeof updateAllDynamicFilters === 'function') updateAllDynamicFilters();
            if (typeof renderSelector === 'function') renderSelector();

            // Память справочника обновляем всегда; full-render — только если
            // Справочник НЕ на экране (единый хелпер §5).
            const refDeferred = (typeof window.shouldDeferFullRender === 'function')
                ? window.shouldDeferFullRender('reference')
                : !!(document.getElementById('tab-reference')?.classList.contains('active'));
            if (typeof window.rbi_reloadReferenceMemory === 'function') {
                await window.rbi_reloadReferenceMemory();
            }
            if (refDeferred) {
                if (window.RBI?.utils?.syncUi?.markDirty) window.RBI.utils.syncUi.markDirty('reference');
                else if (window.syncDirtyFlags) window.syncDirtyFlags.reference = true;
            } else {
                if (typeof renderTwiList === 'function') renderTwiList();
                if (typeof renderDocsList === 'function') renderDocsList();
                if (typeof renderNodesList === 'function') renderNodesList();
                if (window.syncDirtyFlags) window.syncDirtyFlags.reference = false;
            }

            if (!pulledPracticesChanged && typeof rbi_loadPractices === 'function') {
                await rbi_loadPractices();
                if (!refDeferred && typeof rbi_renderPracticesTab === 'function') {
                    await rbi_renderPracticesTab();
                } else if (window.syncDirtyFlags) {
                    window.syncDirtyFlags.reference = true;
                }
            }

            // dirty для аналитики/истории — paint при следующем заходе
            if (window.RBI?.utils?.syncUi?.markDirty) {
                window.RBI.utils.syncUi.markDirty(['analytics', 'history']);
            } else if (window.syncDirtyFlags) {
                window.syncDirtyFlags.analytics = true;
                window.syncDirtyFlags.history = true;
            }

        }
        // Итог только в #mini-sync-toast (manual / 1-я полная). Отдельный safeToast и B3 — нет.
        if (_syncProg()) {
            const detail = hasChanges
                ? ('Получено проверок: ' + pulledChecks + ' · Отправлено записей: ' + totalPushed)
                : 'Новых изменений не было';
            _syncProg().done({
                summary: 'Синхронизация завершена',
                detail: detail,
                pulled: pulledChecks,
                pushed: totalPushed,
                hideAfterMs: 3400
            });
        }

        // sync:completed — оба канала (EventBus + document). Payload включает
        // activeTabId и счётчики; модули обязаны НЕ делать full-render активного
        // view (см. PLATFORM_TARGET_ARCHITECTURE.md §5).
        const activeSection = document.querySelector('.view-section.active');
        const syncCompletedPayload = {
            mode: mode,
            hasChanges: hasChanges,
            pulledChecks: pulledChecks,
            totalPushed: totalPushed,
            startedAt: syncStartedAt,
            activeTabId: activeSection ? activeSection.id : null
        };
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
            window.RBI.events.emit('sync:completed', syncCompletedPayload);
        }
        document.dispatchEvent(new CustomEvent('sync:completed', { detail: syncCompletedPayload }));

    } catch (e) {
        console.error("[Sync] Ошибка:", e);
        pushErrors++;
        if (window.RbiSyncNetPolicy && window.RbiSyncNetPolicy.retryKindOf(e) === 'server') serverErrSeen = true;
        rbiScheduleSyncRetryOnce();
        if (window.RbiSyncJournal) window.RbiSyncJournal.add({ k: 'error', err: e, ms: Date.now() - syncStartedAt, mode }); // P2-0023: не повторять каждую минуту (доработка 5: не дважды за проход)
        const errMsg = e.message ? e.message.substring(0, 80) : 'Сбой сети';
        if (_syncProg()) {
            _syncProg().fail({ summary: 'Ошибка синхронизации', detail: errMsg, hideAfterMs: 3500 });
        } else if (mode === 'manual') {
            safeToast('❌ Ошибка: ' + errMsg);
        } // <-- ВОТ ЭТОЙ СКОБКИ НЕ ХВАТАЛО
    } finally {
        clearInterval(myWatchdog);
        if (window.syncTimeout === myWatchdog) window.syncTimeout = null;
        const stillCurrent = window.__rbiSyncPassId === passId;
        if (stillCurrent) { window.__rbiSyncPassId = null; window.isSyncing = false; }
        window.syncChannel.postMessage('sync_done');
        window.renderSyncUI();

        // Safety: если done/fail не вызвали (ранний выход) — спрятать тост.
        if (stillCurrent && _syncProg() && _syncProg().isActive && _syncProg().isActive()) {
            _syncProg().hide();
        }

        // Снимаем defer после тика: sync:completed-хендлеры и late UI уже отработали.
        if (!stillCurrent) { /* брошенный проход: отрисовкой и повтором управляет текущий */ }
        else if (typeof window.rbiEndSyncUiDefer === 'function') window.rbiEndSyncUiDefer(400);
        else {
            setTimeout(function () { window._rbiDeferActiveViewFullRender = false; }, 400);
        }

        // Если во время этого цикла sync был запрошен повторно (и отброшен из-за isSyncing),
        // не теряем его — запускаем отложенный повторный проход.
        // Но не во время полного автокэша: иначе второй sync уйдёт параллельно с докачкой.
        if (stillCurrent && window._rbiPendingSyncRetryMode) {
            const cacheBlocks = typeof window.rbiIsOfflineCacheBlockingSync === 'function'
                && window.rbiIsOfflineCacheBlockingSync();
            if (cacheBlocks) {
                console.log('[Sync] Отложенный sync ждёт конца автокэша:', window._rbiPendingSyncRetryMode);
            } else {
                const retryMode = window._rbiPendingSyncRetryMode;
                window._rbiPendingSyncRetryMode = null;
                setTimeout(() => window.triggerSync(retryMode), 300);
            }
        }
    }
}
// === КОНЕЦ ФУНКЦИИ rbiSyncPass (triggerSync) ===
