/* Файл: js/services/contractor-directory.service.js */
/* Contractor Directory Service v0.2 — справочник подрядчиков и нормализация названий (перенесено из js/contractorDirectory.js) */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    const LEGAL_FIELDS = [
        'legal_name', 'legal_form', 'legal_address',
        'contact_person', 'contact_phone', 'contact_email'
    ];

    const contractorDirectory = {
        contractors: [],
        aliases: {},
        contracts: [],

        // Загрузка эталонного справочника ТОЛЬКО из локальной базы (Offline-First)
        async init() {
            try {
                if (typeof dbGetAll === 'function' && typeof STORES !== 'undefined') {
                    const storedContractors = await dbGetAll(STORES.CONTRACTOR_DIRECTORY);
                    if (storedContractors) {
                        this.contractors = storedContractors.filter(c => !c._deleted && !c.is_deleted);
                    }

                    const storedAliases = await dbGetAll(STORES.CONTRACTOR_ALIASES);
                    if (storedAliases) {
                        this.aliases = {};
                        storedAliases.forEach(a => {
                            if (a.raw_name && a.canonical_key) {
                                this.aliases[this.cleanString(a.raw_name)] = a.canonical_key;
                            }
                        });
                    }

                    if (STORES.CONTRACTS) {
                        const storedContracts = await dbGetAll(STORES.CONTRACTS);
                        this.contracts = Array.isArray(storedContracts)
                            ? storedContracts.filter(c => c && !c._deleted && !c.is_deleted)
                            : [];
                    }
                }
            } catch (e) {
                console.warn('[ContractorDirectory] Ошибка инициализации:', e);
            }
        },

        cleanString(str) {
            if (!str) return '';

            return String(str)
                .toLowerCase()
                .replace(/ё/g, 'е')
                .replace(/["'«»„“”]/g, '')
                .replace(/\b(ооо|оао|зао|пао|ао|ип|общество с ограниченной ответственностью)\b/gi, '')
                .replace(/[.,;:()№]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        },

        makeCanonicalKey(str) {
            const clean = this.cleanString(str);

            return clean
                .replace(/[^a-zа-я0-9]+/gi, '_')
                .replace(/^_+|_+$/g, '') || 'unknown_contractor';
        },

        getSimilarity(s1, s2) {
            if (!s1 || !s2) return 0;

            let longer = s1;
            let shorter = s2;

            if (s1.length < s2.length) {
                longer = s2;
                shorter = s1;
            }

            const longerLength = longer.length;
            if (longerLength === 0) return 1.0;

            const costs = [];
            for (let i = 0; i <= shorter.length; i++) costs[i] = i;

            for (let i = 1; i <= longer.length; i++) {
                let costsTemp = costs[0];
                costs[0] = i;
                let nw = i - 1;

                for (let j = 1; j <= shorter.length; j++) {
                    const cj = Math.min(
                        1 + Math.min(costs[j], costs[j - 1]),
                        shorter[j - 1] === longer[i - 1] ? nw : nw + 1
                    );

                    nw = costs[j];
                    costs[j] = cj;
                }
            }

            return (longerLength - costs[shorter.length]) / parseFloat(longerLength);
        },

        async normalizeContractorName(rawName) {
            const raw = String(rawName || '').trim();

            if (!raw) {
                return {
                    status: 'empty',
                    raw_name: '',
                    canonical_key: '',
                    display_name: 'Не указан',
                    cleaned_name: ''
                };
            }

            const clean = this.cleanString(raw);

            // 1. Алиасы
            if (this.aliases[clean]) {
                const found = this.contractors.find(c => c.canonical_key === this.aliases[clean]);

                if (found) {
                    return {
                        status: 'matched',
                        raw_name: raw,
                        canonical_key: found.canonical_key,
                        display_name: found.display_name,
                        cleaned_name: clean,
                        match_type: 'alias',
                        score: 1
                    };
                }
            }

            // 2. Точное совпадение
            for (const c of this.contractors) {
                const displayClean = this.cleanString(c.display_name || '');
                const keyClean = this.cleanString(c.canonical_key || '');

                if (displayClean === clean || keyClean === clean) {
                    return {
                        status: 'matched',
                        raw_name: raw,
                        canonical_key: c.canonical_key,
                        display_name: c.display_name,
                        cleaned_name: clean,
                        match_type: 'exact',
                        score: 1
                    };
                }

                if (Array.isArray(c.synonyms)) {
                    const synMatch = c.synonyms.some(s => this.cleanString(s) === clean);

                    if (synMatch) {
                        return {
                            status: 'matched',
                            raw_name: raw,
                            canonical_key: c.canonical_key,
                            display_name: c.display_name,
                            cleaned_name: clean,
                            match_type: 'synonym',
                            score: 1
                        };
                    }
                }
            }

            // 3. Нечёткое совпадение
            let matches = [];

            for (const c of this.contractors) {
                const scores = [];

                scores.push(this.getSimilarity(clean, this.cleanString(c.display_name || '')));
                scores.push(this.getSimilarity(clean, this.cleanString(c.canonical_key || '')));

                if (Array.isArray(c.synonyms)) {
                    c.synonyms.forEach(s => scores.push(this.getSimilarity(clean, this.cleanString(s || ''))));
                }

                const best = Math.max(...scores);

                if (best >= 0.82) {
                    matches.push({
                        contractor: c,
                        score: best
                    });
                }
            }

            matches.sort((a, b) => b.score - a.score);

            if (matches.length > 0) {
                const best = matches[0].contractor;

                // Автоматически сохраняем алиас, если совпадение достаточно уверенное
                if (matches[0].score >= 0.90) {
                    await this.saveAlias(raw, best.canonical_key);
                }

                return {
                    status: matches.length > 1 ? 'multiple_matched_auto_best' : 'matched',
                    raw_name: raw,
                    canonical_key: best.canonical_key,
                    display_name: best.display_name,
                    cleaned_name: clean,
                    match_type: 'fuzzy',
                    score: matches[0].score,
                    alternatives: matches.slice(1, 5).map(m => ({
                        canonical_key: m.contractor.canonical_key,
                        display_name: m.contractor.display_name,
                        score: m.score
                    }))
                };
            }

            // 4. Не нашли — создаём кандидата в очередь
            const suggestedKey = this.makeCanonicalKey(raw);

            await this.createQueueItem(raw, suggestedKey);

            return {
                status: 'pending',
                raw_name: raw,
                canonical_key: '',
                suggested_canonical_key: suggestedKey,
                display_name: raw,
                cleaned_name: clean,
                match_type: 'none',
                score: 0
            };
        },

        _randomUuid() {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
                const r = Math.random() * 16 | 0;
                const v = ch === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        _emitChanged(id, contractId) {
            try {
                if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
                    const payload = { id: id || null };
                    if (contractId) payload.contractId = contractId;
                    window.RBI.events.emit('contractors:changed', payload);
                }
            } catch (e) { /* ignore */ }
        },

        _applyLegalFields(target, source) {
            if (!target || !source) return;
            for (const field of LEGAL_FIELDS) {
                if (source[field] !== undefined) {
                    target[field] = String(source[field] || '').trim();
                }
            }
        },

        _markDirtyAndSync() {
            localStorage.setItem('rbi_cloud_dirty', '1');
            if (typeof triggerSync === 'function') triggerSync('silent');
            else if (window.RBI && window.RBI.services && window.RBI.services.sync && typeof window.RBI.services.sync.trigger === 'function') {
                window.RBI.services.sync.trigger('silent');
            }
        },

        getById(id) {
            if (!id) return null;
            return this.contractors.find(c => c && c.id === id) || null;
        },

        getByCanonicalKey(key) {
            const k = String(key || '').trim();
            if (!k) return null;
            return this.contractors.find(c => c && c.canonical_key === k) || null;
        },

        /**
         * UUID карточки по результату нормализации (matched).
         * Pending/empty → '' (не выдумывать id).
         */
        resolveIdFromNormalized(normalized) {
            const n = normalized || {};
            const key = String(n.canonical_key || '').trim();
            if (key) {
                const byKey = this.getByCanonicalKey(key);
                if (byKey && byKey.id) return String(byKey.id);
            }
            const name = String(n.display_name || n.contractor_name || '').trim();
            if (name) {
                const clean = this.cleanString(name);
                const byName = this.contractors.find(c =>
                    c && this.cleanString(c.display_name || '') === clean
                );
                if (byName && byName.id) return String(byName.id);
            }
            return '';
        },

        _isUuidLike(value) {
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
        },

        _emptyCounters() {
            return { updated: 0, skipped: 0, already: 0, errors: 0 };
        },

        _legacyBackfillTables() {
            // rbi_inspections в облаке: contractor_name + contractorId (без normalization_* колонок).
            const inspSelect = 'id, contractorId, contractor_name, is_deleted';
            const skSelect = 'id, contractorId, contractor_name, contractor_raw, contractor_canonical_key, contractor_normalization_status, is_deleted';
            const constSelect = 'id, contractorId, contractor, is_deleted';
            return [
                {
                    key: 'rbi_inspections',
                    cloudTable: 'rbi_inspections',
                    localStore: (typeof STORES !== 'undefined' && STORES.HISTORY) ? STORES.HISTORY : 'app_history',
                    cloudSelect: inspSelect,
                    skipPendingInCloud: false,
                    requireContractorNameInCloud: true,
                    contractorNameCloudField: 'contractor_name'
                },
                {
                    key: 'sk_records',
                    cloudTable: 'sk_records',
                    localStore: (typeof STORES !== 'undefined' && STORES.SK_RECORDS) ? STORES.SK_RECORDS : 'sk_records',
                    cloudSelect: skSelect,
                    // pending заведомо skipped — не тянем их страницами из облака.
                    skipPendingInCloud: true,
                    requireContractorNameInCloud: true,
                    contractorNameCloudField: 'contractor_name'
                },
                {
                    key: 'construction_defects',
                    cloudTable: 'construction_defects',
                    localStore: (typeof STORES !== 'undefined' && STORES.CONST_DEFECTS) ? STORES.CONST_DEFECTS : 'construction_defects',
                    cloudSelect: constSelect,
                    skipPendingInCloud: false,
                    requireContractorNameInCloud: true,
                    contractorNameCloudField: 'contractor'
                },
                {
                    key: 'construction_acceptance',
                    cloudTable: 'construction_acceptance',
                    localStore: (typeof STORES !== 'undefined' && STORES.CONST_ACCEPTANCE) ? STORES.CONST_ACCEPTANCE : 'construction_acceptance',
                    cloudSelect: constSelect,
                    skipPendingInCloud: false,
                    requireContractorNameInCloud: true,
                    contractorNameCloudField: 'contractor'
                }
            ];
        },

        /**
         * Резолв UUID для legacy-записи. Только contractorId; имя/даты/автора не трогаем.
         * already | update | skipped
         */
        _classifyLegacyContractorId(rec) {
            const existing = String(rec && (rec.contractorId || rec.contractor_id) || '').trim();
            if (this._isUuidLike(existing)) {
                return { status: 'already', id: existing };
            }

            const normStatus = String(rec && rec.contractor_normalization_status || '').trim().toLowerCase();
            if (normStatus === 'pending') {
                return { status: 'skipped', id: '' };
            }

            const key = String(rec && rec.contractor_canonical_key || '').trim();
            const name = String(
                (rec && (rec.contractor_name || rec.contractorName || rec.contractor || rec.contractor_raw)) || ''
            ).trim();

            if (!key && !name) {
                return { status: 'skipped', id: '' };
            }

            const resolved = this.resolveIdFromNormalized({
                canonical_key: key,
                display_name: name,
                contractor_name: name
            });
            if (!resolved) {
                return { status: 'skipped', id: '' };
            }
            return { status: 'update', id: resolved };
        },

        async _patchLocalContractorId(storeName, rec, contractorId) {
            if (!rec || !rec.id || typeof dbPut !== 'function') return false;
            // Только поле contractorId — без dirty/full-upsert синка и без смены дат/автора/имени.
            rec.contractorId = contractorId;
            if (Object.prototype.hasOwnProperty.call(rec, 'contractor_id')) {
                rec.contractor_id = contractorId;
            }
            await dbPut(storeName, rec);

            // Живой кэш осмотров (если запись уже в памяти).
            if (storeName === ((typeof STORES !== 'undefined' && STORES.HISTORY) ? STORES.HISTORY : 'app_history')
                && Array.isArray(window.contractorArray)) {
                const mem = window.contractorArray.find(x => x && x.id === rec.id);
                if (mem) {
                    mem.contractorId = contractorId;
                    if (Object.prototype.hasOwnProperty.call(mem, 'contractor_id')) {
                        mem.contractor_id = contractorId;
                    }
                }
            }
            return true;
        },

        async _updateCloudContractorId(cloudTable, id, contractorId) {
            if (!window.supabaseClient || !id || !this._isUuidLike(contractorId)) {
                throw new Error('cloud update unavailable');
            }
            const { error } = await window.supabaseClient
                .from(cloudTable)
                .update({ contractorId: contractorId })
                .eq('id', id);
            if (error) throw error;
        },

        async _emitBackfillProgress(onProgress, payload) {
            if (typeof onProgress === 'function') {
                try { onProgress(payload); } catch (_) { /* UI callback */ }
            }
            // Дать UI отрисовать прогресс между порциями.
            await new Promise(resolve => setTimeout(resolve, 0));
        },

        /**
         * Admin backfill: дописать contractorId в историю 4 legacy-контуров
         * (локально + column-only cloud update). Идемпотентно.
         * @param {{ batchSize?: number, onProgress?: function }} opts
         * @returns {Promise<{tables: Object, totals: Object, cloudAvailable: boolean}>}
         */
        async backfillContractorIdsOnLegacyRecords(opts) {
            const options = opts || {};
            const batchSize = Math.max(1, Math.min(200, Number(options.batchSize) || 50));
            const onProgress = options.onProgress;

            await this.init();

            const tables = {};
            const totals = this._emptyCounters();
            const cloudAvailable = !!(window.supabaseClient && window.syncConfig && window.syncConfig.enabled);
            const pCode = String(window.syncConfig?.projectCode || '').trim();
            const processedCloudIds = new Set();

            const bump = (counters, field) => {
                counters[field] = (counters[field] || 0) + 1;
                totals[field] = (totals[field] || 0) + 1;
            };

            for (const table of this._legacyBackfillTables()) {
                const counters = this._emptyCounters();
                tables[table.key] = counters;

                // --- Local ---
                let localRows = [];
                try {
                    if (typeof dbGetAll === 'function') {
                        localRows = await dbGetAll(table.localStore) || [];
                    }
                } catch (e) {
                    console.warn('[contractors.backfill] local read failed', table.key, e);
                    bump(counters, 'errors');
                }

                for (let i = 0; i < localRows.length; i++) {
                    const rec = localRows[i];
                    if (!rec || rec._deleted === true || rec.is_deleted === true) continue;

                    const decision = this._classifyLegacyContractorId(rec);
                    if (decision.status === 'already') {
                        bump(counters, 'already');
                        if (rec.id) processedCloudIds.add(String(rec.id));
                        continue;
                    }
                    if (decision.status === 'skipped') {
                        bump(counters, 'skipped');
                        continue;
                    }

                    try {
                        await this._patchLocalContractorId(table.localStore, rec, decision.id);
                        if (cloudAvailable && rec.id) {
                            try {
                                await this._updateCloudContractorId(table.cloudTable, rec.id, decision.id);
                                processedCloudIds.add(String(rec.id));
                            } catch (cloudErr) {
                                console.warn('[contractors.backfill] cloud patch after local', table.key, rec.id, cloudErr);
                                bump(counters, 'errors');
                                // Локальный патч уже применён — считаем updated, ошибка cloud отдельно.
                            }
                        }
                        bump(counters, 'updated');
                    } catch (e) {
                        console.warn('[contractors.backfill] local patch failed', table.key, rec && rec.id, e);
                        bump(counters, 'errors');
                    }

                    if ((i + 1) % batchSize === 0) {
                        await this._emitBackfillProgress(onProgress, {
                            phase: 'local',
                            table: table.key,
                            tables: Object.assign({}, tables),
                            totals: Object.assign({}, totals),
                            cloudAvailable
                        });
                    }
                }

                await this._emitBackfillProgress(onProgress, {
                    phase: 'local_done',
                    table: table.key,
                    tables: Object.assign({}, tables),
                    totals: Object.assign({}, totals),
                    cloudAvailable
                });

                // --- Cloud-only rows (история, которой нет на этом устройстве) ---
                if (!cloudAvailable) continue;

                // Cloud: по одному display_name через .eq() — НЕ .in([...]).
                // Имена вида ООО "…" / «…» ломают PostgREST in.(...) → 502 + ложный CORS.
                const knownNames = Array.from(new Set(
                    (this.contractors || [])
                        .filter(c => c && !c._deleted && !c.is_deleted)
                        .map(c => String(c.display_name || '').trim())
                        .filter(Boolean)
                ));
                const namePasses = table.requireContractorNameInCloud
                    ? (knownNames.length ? knownNames : [])
                    : [null];

                for (const nameFilter of namePasses) {
                    if (table.requireContractorNameInCloud && !nameFilter) continue;

                    let cloudOffset = 0;
                    let hasMore = true;
                    let failStreak = 0;
                    while (hasMore) {
                        try {
                            let query = window.supabaseClient
                                .from(table.cloudTable)
                                .select(table.cloudSelect)
                                .or('contractorId.is.null,contractorId.eq.')
                                .range(cloudOffset, cloudOffset + batchSize - 1);

                            if (pCode) query = query.eq('project_code', pCode);
                            if (table.skipPendingInCloud) {
                                query = query.not('contractor_normalization_status', 'eq', 'pending');
                            }
                            if (table.requireContractorNameInCloud && nameFilter) {
                                const nameField = table.contractorNameCloudField || 'contractor_name';
                                query = query.eq(nameField, nameFilter);
                            }

                            const { data, error } = await query;
                            if (error) throw error;
                            failStreak = 0;

                            const rows = Array.isArray(data) ? data : [];
                            if (rows.length === 0) {
                                hasMore = false;
                                break;
                            }

                            let updatedInPage = 0;

                            for (const row of rows) {
                                if (!row || !row.id) continue;
                                const rowId = String(row.id);
                                if (processedCloudIds.has(rowId)) continue;
                                if (row.is_deleted === true) {
                                    processedCloudIds.add(rowId);
                                    continue;
                                }

                                const decision = this._classifyLegacyContractorId(row);
                                if (decision.status === 'already') {
                                    bump(counters, 'already');
                                    processedCloudIds.add(rowId);
                                    continue;
                                }
                                if (decision.status === 'skipped') {
                                    bump(counters, 'skipped');
                                    processedCloudIds.add(rowId);
                                    continue;
                                }

                                try {
                                    await this._updateCloudContractorId(table.cloudTable, rowId, decision.id);

                                    if (typeof dbGet === 'function') {
                                        try {
                                            const local = await dbGet(table.localStore, rowId);
                                            if (local && !local._deleted && !local.is_deleted
                                                && !this._isUuidLike(local.contractorId || local.contractor_id)) {
                                                await this._patchLocalContractorId(table.localStore, local, decision.id);
                                            }
                                        } catch (_) { /* optional local mirror */ }
                                    }

                                    processedCloudIds.add(rowId);
                                    bump(counters, 'updated');
                                    updatedInPage++;
                                } catch (e) {
                                    console.warn('[contractors.backfill] cloud patch failed', table.key, rowId, e);
                                    bump(counters, 'errors');
                                    processedCloudIds.add(rowId);
                                }
                            }

                            if (updatedInPage === 0) {
                                cloudOffset += rows.length;
                            }
                            if (rows.length < batchSize && updatedInPage === 0) {
                                hasMore = false;
                            }

                            await this._emitBackfillProgress(onProgress, {
                                phase: 'cloud',
                                table: table.key,
                                name: nameFilter || '',
                                tables: Object.assign({}, tables),
                                totals: Object.assign({}, totals),
                                cloudAvailable
                            });
                        } catch (e) {
                            failStreak++;
                            console.warn('[contractors.backfill] cloud page failed', table.key, nameFilter || '', e);
                            bump(counters, 'errors');
                            // Краткий 502/сеть: один retry; иначе следующий подрядчик.
                            if (failStreak < 2) {
                                await new Promise(r => setTimeout(r, 800));
                                continue;
                            }
                            hasMore = false;
                        }
                    }
                }
            }

            const report = { tables, totals, cloudAvailable };
            await this._emitBackfillProgress(onProgress, {
                phase: 'done',
                tables: Object.assign({}, tables),
                totals: Object.assign({}, totals),
                cloudAvailable
            });
            return report;
        },

        async create(input) {
            const displayName = String(input && input.display_name || '').trim();
            if (!displayName) {
                throw new Error('display_name обязателен');
            }

            const canonicalKey = String(input && input.canonical_key || this.makeCanonicalKey(displayName)).trim();
            if (!canonicalKey) {
                throw new Error('canonical_key обязателен');
            }

            const existing = this.getByCanonicalKey(canonicalKey);
            if (existing) {
                throw new Error('Подрядчик с таким ключом уже существует');
            }

            const nowIso = new Date().toISOString();
            const pCode = window.syncConfig?.projectCode || '';
            const createdBy = window.RBI?.services?.permissions?.getCurrentEngineerName?.()
                || window.syncConfig?.engineerName || '';
            const synonyms = Array.isArray(input && input.synonyms)
                ? input.synonyms.map(s => String(s || '').trim()).filter(Boolean)
                : [];

            const contractor = {
                id: this._randomUuid(),
                project_code: pCode,
                companyId: 'rbi',
                canonical_key: canonicalKey,
                display_name: displayName,
                synonyms: synonyms.slice(),
                inn: String(input && input.inn || '').trim(),
                legal_name: '',
                legal_form: '',
                legal_address: '',
                contact_person: '',
                contact_phone: '',
                contact_email: '',
                created_by: createdBy,
                is_deleted: false,
                _deleted: false,
                created_at: nowIso,
                updated_at: nowIso,
                updatedAt: nowIso,
                version: 1,
                source: 'local',
                syncStatus: 'not_synced',
                sync_status: 'not_synced',
                syncBlockReason: '',
                sync_block_reason: ''
            };
            this._applyLegalFields(contractor, input || {});

            if (typeof dbPut === 'function' && typeof STORES !== 'undefined') {
                await dbPut(STORES.CONTRACTOR_DIRECTORY, contractor);
            }

            this.contractors.push(contractor);

            for (const syn of synonyms) {
                await this.saveAlias(syn, canonicalKey, { skipSync: true });
            }

            this._markDirtyAndSync();
            this._emitChanged(contractor.id);
            return contractor;
        },

        async update(id, patch) {
            const contractor = this.getById(id);
            if (!contractor) {
                throw new Error('Подрядчик не найден');
            }

            const p = patch || {};
            if (p.display_name !== undefined) {
                const name = String(p.display_name || '').trim();
                if (!name) throw new Error('display_name не может быть пустым');
                contractor.display_name = name;
            }
            if (p.inn !== undefined) {
                contractor.inn = String(p.inn || '').trim();
            }
            if (p.canonical_key !== undefined) {
                const key = String(p.canonical_key || '').trim();
                if (!key) throw new Error('canonical_key не может быть пустым');
                const clash = this.getByCanonicalKey(key);
                if (clash && clash.id !== contractor.id) {
                    throw new Error('Подрядчик с таким ключом уже существует');
                }
                contractor.canonical_key = key;
            }
            if (Array.isArray(p.synonyms)) {
                const nextSynonyms = p.synonyms.map(s => String(s || '').trim()).filter(Boolean);
                const prev = Array.isArray(contractor.synonyms) ? contractor.synonyms : [];
                contractor.synonyms = nextSynonyms;
                for (const syn of nextSynonyms) {
                    if (!prev.some(s => this.cleanString(s) === this.cleanString(syn))) {
                        await this.saveAlias(syn, contractor.canonical_key);
                    }
                }
            }
            this._applyLegalFields(contractor, p);

            const nowIso = new Date().toISOString();
            contractor.updated_at = nowIso;
            contractor.updatedAt = nowIso;
            contractor.source = 'local';
            contractor.syncStatus = 'not_synced';
            contractor.sync_status = 'not_synced';
            contractor.syncBlockReason = '';
            contractor.sync_block_reason = '';

            if (typeof dbPut === 'function' && typeof STORES !== 'undefined') {
                await dbPut(STORES.CONTRACTOR_DIRECTORY, contractor);
            }

            this._markDirtyAndSync();
            this._emitChanged(contractor.id);
            return contractor;
        },

        listContracts(contractorId) {
            const cid = String(contractorId || '').trim();
            if (!cid) return [];
            return this.contracts
                .filter(c => c && String(c.contractorId || '') === cid && !c._deleted && !c.is_deleted)
                .slice()
                .sort((a, b) => String(b.contract_date || '').localeCompare(String(a.contract_date || '')));
        },

        getContract(id) {
            if (!id) return null;
            return this.contracts.find(c => c && c.id === id) || null;
        },

        async createContract(input) {
            const contractorId = String(input && input.contractorId || '').trim();
            if (!contractorId) throw new Error('contractorId обязателен');
            if (!this.getById(contractorId)) throw new Error('Подрядчик не найден');

            const nowIso = new Date().toISOString();
            const createdBy = window.RBI?.services?.permissions?.getCurrentEngineerName?.()
                || window.syncConfig?.engineerName || '';
            const contract = {
                id: this._randomUuid(),
                companyId: 'rbi',
                contractorId: contractorId,
                contract_number: String(input && input.contract_number || '').trim(),
                contract_date: String(input && input.contract_date || '').trim() || null,
                work_type: String(input && input.work_type || '').trim(),
                status: String(input && input.status || 'active').trim() || 'active',
                created_by: createdBy,
                is_deleted: false,
                _deleted: false,
                created_at: nowIso,
                updated_at: nowIso,
                updatedAt: nowIso,
                version: 1,
                source: 'local',
                syncStatus: 'not_synced',
                sync_status: 'not_synced',
                syncBlockReason: '',
                sync_block_reason: ''
            };

            if (typeof dbPut === 'function' && typeof STORES !== 'undefined' && STORES.CONTRACTS) {
                await dbPut(STORES.CONTRACTS, contract);
            }
            this.contracts.push(contract);
            this._markDirtyAndSync();
            this._emitChanged(contractorId, contract.id);
            return contract;
        },

        async updateContract(id, patch) {
            const contract = this.getContract(id);
            if (!contract) throw new Error('Договор не найден');

            const p = patch || {};
            if (p.contract_number !== undefined) {
                contract.contract_number = String(p.contract_number || '').trim();
            }
            if (p.contract_date !== undefined) {
                contract.contract_date = String(p.contract_date || '').trim() || null;
            }
            if (p.work_type !== undefined) {
                contract.work_type = String(p.work_type || '').trim();
            }
            if (p.status !== undefined) {
                contract.status = String(p.status || '').trim();
            }

            const nowIso = new Date().toISOString();
            contract.updated_at = nowIso;
            contract.updatedAt = nowIso;
            contract.source = 'local';
            contract.syncStatus = 'not_synced';
            contract.sync_status = 'not_synced';
            contract.syncBlockReason = '';
            contract.sync_block_reason = '';

            if (typeof dbPut === 'function' && typeof STORES !== 'undefined' && STORES.CONTRACTS) {
                await dbPut(STORES.CONTRACTS, contract);
            }
            this._markDirtyAndSync();
            this._emitChanged(contract.contractorId, contract.id);
            return contract;
        },

        async softDeleteContract(id) {
            const idx = this.contracts.findIndex(c => c && c.id === id);
            let contract = idx > -1 ? this.contracts[idx] : null;

            if (!contract && typeof dbGet === 'function' && typeof STORES !== 'undefined' && STORES.CONTRACTS) {
                contract = await dbGet(STORES.CONTRACTS, id);
            }
            if (!contract) throw new Error('Договор не найден');

            const nowIso = new Date().toISOString();
            contract.is_deleted = true;
            contract._deleted = true;
            contract.deleted_at = nowIso;
            contract.updated_at = nowIso;
            contract.updatedAt = nowIso;
            contract.source = 'local';
            contract.syncStatus = 'not_synced';
            contract.sync_status = 'not_synced';
            contract.syncBlockReason = '';
            contract.sync_block_reason = '';

            if (typeof dbPut === 'function' && typeof STORES !== 'undefined' && STORES.CONTRACTS) {
                await dbPut(STORES.CONTRACTS, contract);
            }
            if (idx > -1) this.contracts.splice(idx, 1);

            this._markDirtyAndSync();
            this._emitChanged(contract.contractorId, contract.id);
            return contract;
        },

        async softDelete(id) {
            const idx = this.contractors.findIndex(c => c && c.id === id);
            let contractor = idx > -1 ? this.contractors[idx] : null;

            if (!contractor && typeof dbGet === 'function' && typeof STORES !== 'undefined') {
                contractor = await dbGet(STORES.CONTRACTOR_DIRECTORY, id);
            }
            if (!contractor) {
                throw new Error('Подрядчик не найден');
            }

            const nowIso = new Date().toISOString();
            contractor.is_deleted = true;
            contractor._deleted = true;
            contractor.deleted_at = nowIso;
            contractor.updated_at = nowIso;
            contractor.updatedAt = nowIso;
            contractor.source = 'local';
            contractor.syncStatus = 'not_synced';
            contractor.sync_status = 'not_synced';
            contractor.syncBlockReason = '';
            contractor.sync_block_reason = '';

            if (typeof dbPut === 'function' && typeof STORES !== 'undefined') {
                await dbPut(STORES.CONTRACTOR_DIRECTORY, contractor);
            }

            if (idx > -1) this.contractors.splice(idx, 1);

            const childContracts = this.contracts.filter(c => c && String(c.contractorId || '') === String(id));
            for (const child of childContracts) {
                try {
                    await this.softDeleteContract(child.id);
                } catch (e) {
                    console.warn('[ContractorDirectory] softDelete child contract:', e);
                }
            }

            this._markDirtyAndSync();
            this._emitChanged(contractor.id);
            return contractor;
        },

        async saveAlias(rawName, canonicalKey, opts) {
            if (!rawName || !canonicalKey) return false;

            const pCode = window.syncConfig?.projectCode || '';
            const cleanRaw = this.cleanString(rawName);

            this.aliases[cleanRaw] = canonicalKey;

            const nowIso = new Date().toISOString();
            const alias = {
                id: this._randomUuid(),
                project_code: pCode,
                raw_name: rawName,
                canonical_key: canonicalKey,
                created_by: window.RBI.services.permissions?.getCurrentEngineerName?.() || window.syncConfig?.engineerName || '',
                created_at: nowIso,
                updated_at: nowIso,
                updatedAt: nowIso,
                source: 'local',
                syncStatus: 'not_synced',
                sync_status: 'not_synced',
                syncBlockReason: '',
                sync_block_reason: ''
            };

            if (typeof dbPut === 'function') {
                await dbPut(STORES.CONTRACTOR_ALIASES, alias);
                if (!(opts && opts.skipSync)) this._markDirtyAndSync();
                else localStorage.setItem('rbi_cloud_dirty', '1');
            }

            return true;
        },

        async createQueueItem(rawName, suggestedKey = '') {
            if (!rawName) return false;

            const pCode = window.syncConfig?.projectCode || '';
            const clean = this.cleanString(rawName);
            const rawTrimmed = String(rawName || '').trim();

            // 1. Проверяем, нет ли уже такой заявки локально
            if (typeof dbGetAll === 'function' && typeof STORES !== 'undefined' && STORES.CONTRACTOR_QUEUE) {
                const existingQueue = await dbGetAll(STORES.CONTRACTOR_QUEUE) || [];

                const existing = existingQueue.find(q =>
                    String(q.project_code || '') === String(pCode || '') &&
                    this.cleanString(q.raw_name || '') === clean &&
                    q.status !== 'resolved' &&
                    q.status !== 'rejected'
                );

                if (existing) {
                    return false;
                }
            }

            const queueItem = {
                id: window.RbiIds.newId(),
                project_code: pCode,
                raw_name: rawTrimmed,
                cleaned_name: clean,
                suggested_canonical_key: suggestedKey || this.makeCanonicalKey(rawTrimmed),
                source_table: 'sk_records',
                source_record_id: '',
                created_by: window.RBI.services.permissions?.getCurrentEngineerName?.() || window.syncConfig?.engineerName || '',
                status: 'pending',
                admin_comment: '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                updatedAt: new Date().toISOString(),

                source: 'local',
                syncStatus: 'not_synced',
                sync_status: 'not_synced',
                syncBlockReason: '',
                sync_block_reason: ''
            };

            if (typeof dbPut === 'function') {
                await dbPut(STORES.CONTRACTOR_QUEUE, queueItem);
            }

            localStorage.setItem('rbi_cloud_dirty', '1');

            return true;
        }
    };

    window.ContractorDirectory = contractorDirectory;

    window.RBI.services.contractors = {

        init: async function () {
            return contractorDirectory.init();
        },

        list: function () {
            return contractorDirectory.contractors;
        },

        aliases: function () {
            return contractorDirectory.aliases;
        },

        makeCanonicalKey: function (str) {
            return contractorDirectory.makeCanonicalKey(str);
        },

        getById: function (id) {
            return contractorDirectory.getById(id);
        },

        getByCanonicalKey: function (key) {
            return contractorDirectory.getByCanonicalKey(key);
        },

        resolveIdFromNormalized: function (normalized) {
            return contractorDirectory.resolveIdFromNormalized(normalized);
        },

        create: async function (input) {
            return contractorDirectory.create(input);
        },

        update: async function (id, patch) {
            return contractorDirectory.update(id, patch);
        },

        softDelete: async function (id) {
            return contractorDirectory.softDelete(id);
        },

        listContracts: function (contractorId) {
            return contractorDirectory.listContracts(contractorId);
        },

        getContract: function (id) {
            return contractorDirectory.getContract(id);
        },

        createContract: async function (input) {
            return contractorDirectory.createContract(input);
        },

        updateContract: async function (id, patch) {
            return contractorDirectory.updateContract(id, patch);
        },

        softDeleteContract: async function (id) {
            return contractorDirectory.softDeleteContract(id);
        },

        saveAlias: async function (rawName, canonicalKey) {
            return contractorDirectory.saveAlias(rawName, canonicalKey);
        },

        normalize: async function (rawName) {
            if (window.ContractorDirectory && typeof window.ContractorDirectory.normalizeContractorName === 'function') {
                return window.ContractorDirectory.normalizeContractorName(rawName);
            }
            return {
                status: rawName ? 'unmapped' : 'empty',
                raw_name: rawName || '',
                canonical_key: '',
                display_name: rawName || 'Не указан'
            };
        },

        backfillContractorIdsOnLegacyRecords: async function (opts) {
            return contractorDirectory.backfillContractorIdsOnLegacyRecords(opts);
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.contractors', window.RBI.services.contractors);
    }

    console.log('[RBI Service] contractors loaded');
}());
