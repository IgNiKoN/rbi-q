/* Файл: js/services/sync/sync-push-pull.core.js — перенесено из js/sync.js без изменения логики */
window.uploadObjectFilesToCloud = async function (obj, bucketName, pathPrefix, type = 'file') {
    if (!obj || typeof obj !== 'object') return obj;

    const clone = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const key of Object.keys(clone)) {
        const val = clone[key];

        if (typeof val === 'string') {
            // УМНАЯ ПРОВЕРКА: Смотрим не на название ключа, а на само значение!
            // Если это локальная ссылка на фото - 100% грузим в бакет.
            const isLocalAsset = val.startsWith('local://') || val.startsWith('data:image');

            if (isLocalAsset && typeof window.rbiUploadAsset === 'function') {
                clone[key] = await window.rbiUploadAsset(
                    val,
                    bucketName,
                    pathPrefix,
                    type
                );
            }
        } else if (val && typeof val === 'object') {
            // Рекурсия для вложенных массивов (как в FMEA)
            clone[key] = await window.uploadObjectFilesToCloud(
                val,
                bucketName,
                pathPrefix,
                type
            );
        }
    }

    return clone;
};

window.pushCloudObject = async function (objectType, id, data, bucketName = 'custom-assets') {
    if (!data || !id) return null;

    // C2b: OD flat catalog sync disabled — SoT = locations; keep case branches for rollback
    if (objectType === 'project_object' || objectType === 'object_alias') {
        console.log('[Sync] C2b: skip pushCloudObject', objectType);
        return null;
    }

    const pCode = window.syncConfig.projectCode;
    const iName = window.syncConfig.engineerName;

    // ИСПРАВЛЕНИЕ: Учим синхронизатор понимать метки удаленных отчетов
    const isDeleted = data._deleted === true || data.is_deleted === true;
    const deletedAt = isDeleted ? (data._deletedAt || data.deleted_at || data.updatedAt || data.updated_at || new Date().toISOString()) : null;
    const updatedAt = data.updatedAt || data.updated_at || new Date().toISOString();

    // МАППИНГ НОВЫХ ТАБЛИЦ И БАКЕТОВ
    let tableName = ''; let isShared = false; let targetBucket = bucketName;
    switch (objectType) {
        case 'custom_twi_card': tableName = 'shared_twi_cards'; isShared = true; targetBucket = 'library-twi'; break;
        case 'custom_node': tableName = 'shared_nodes'; isShared = true; targetBucket = 'library-nodes'; break;
        case 'custom_doc': tableName = 'shared_docs'; isShared = true; targetBucket = 'library-docs'; break;
        case 'user_template': tableName = 'shared_checklists'; isShared = true; targetBucket = 'library-checklists'; break;
        case 'practice': tableName = 'shared_practices'; isShared = true; targetBucket = 'library-practices'; break;
        case 'feedback': tableName = 'shared_feedback'; isShared = true; break;
        case 'etalon': tableName = 'shared_etalons'; isShared = true; targetBucket = 'library-etalons'; break;
        case 'meeting': tableName = 'project_meetings'; targetBucket = 'inspection-photos'; break;
        case 'intervention': tableName = 'project_interventions'; targetBucket = 'inspection-photos'; break;
        case 'fmea': tableName = 'project_fmea'; targetBucket = 'inspection-photos'; break;
        case 'schedule': tableName = 'project_schedule_stages'; targetBucket = 'inspection-photos'; break;
        case 'sk_data_bundle': tableName = 'sk_data_bundles'; targetBucket = 'inspection-photos'; break;
        case 'project_object': tableName = 'project_objects'; isShared = true; break;
        case 'object_alias': tableName = 'object_aliases'; isShared = true; break;
        case 'report': tableName = 'shared_reports'; isShared = false; targetBucket = 'reports'; break;
        case 'report_template': tableName = 'shared_report_templates'; isShared = true; break;
        case 'snapshot': tableName = 'shared_report_snapshots'; isShared = false; break;
        case 'assistant_kb': tableName = 'app_assistant_kb'; isShared = true; break;
        case 'const_object': tableName = 'construction_objects'; isShared = true; break;
        case 'const_building': tableName = 'construction_buildings'; isShared = true; break;
        case 'const_floor': tableName = 'construction_floors'; isShared = true; break;
        case 'const_defect': tableName = 'construction_defects'; targetBucket = 'construction-defects'; break;
        case 'const_unit': tableName = 'construction_units'; isShared = true; break;
        case 'const_acceptance': tableName = 'construction_acceptance'; isShared = true; break;
        case 'object_queue': tableName = 'object_normalization_queue'; isShared = true; break;
        default: return;
    }

    let uploadedData = data;

    if (isDeleted) {
        // Мягкое удаление: мы не удаляем файлы физически, чтобы не сломать чужие кэши
    } else {
        // ИСКЛЮЧАЕМ огромные массивы (Стройконтроль) из рекурсивного сканера фото, чтобы не повесить браузер!
        if (objectType !== 'sk_data_bundle') {
            const storagePrefix = isShared ? `hashed_assets` : `${pCode}/${objectType}/${id}`;
            uploadedData = await window.uploadObjectFilesToCloud(data, targetBucket, storagePrefix, objectType);
        }
    }

    let payload = {};

    if (objectType === 'report') {
        // Специфичный формат для таблицы отчетов
        payload = {
            id: id,
            project_code: pCode, // Гарантируем наличие кода проекта
            project_canonical_key: data.project_canonical_key || data.metadata?.project || '',
            project_display_name: data.project_display_name || data.metadata?.project || '',
            engineer_name: data.engineer_name || data.created_by || iName,
            contractor_canonical_key: data.contractor_canonical_key || '',
            report_type: data.report_type || 'unknown',
            title: data.title || 'Отчет',
            generated_at: data.generated_at || new Date().toISOString(),
            file_url: data.file_url || '',
            file_size: data.file_size || 0,
            metadata: data.metadata || {},
            created_by: data.created_by || iName,
            created_by_name: data.created_by || iName,
            is_deleted: isDeleted,
            deleted_at: deletedAt,
            created_at: data.created_at || new Date().toISOString(),
            updated_at: updatedAt,
            is_public: data.is_public !== false,
            public_token: data.public_token || ''
        };
    } else if (objectType === 'snapshot') {
        payload = {
            id: id,
            report_id: data.report_id,
            public_token: data.public_token || data.token || data.report_id || id,
            html_content: data.html_content,
            is_public: data.is_public !== false,
            is_deleted: data.is_deleted === true || data._deleted === true,
            created_at: data.created_at || new Date().toISOString(),
            updated_at: updatedAt,
            expires_at: data.expires_at || null
        };
    } else if (objectType === 'const_defect') {
        payload = {
            id: id,
            project_code: pCode,
            floor_id: data.floorId || data.floor_id || '',
            x: data.x || 0,
            y: data.y || 0,
            template_key: data.templateKey || '',
            item_id: data.itemId || '',
            item_name: data.itemName || '',
            norm_text: data.normText || '',
            text: data.text || '',
            category: data.category || '',
            deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
            contractor: data.contractor || '',
            description: data.description || '',
            photo: uploadedData.photo || null,
            status: data.status || 'issued',
            history: data.history || [],
            created_by: data.created_by || iName,
            is_deleted: isDeleted,
            created_at: data.created_at || new Date().toISOString(),
            updated_at: updatedAt
        };
        {
            const cid = String(data.contractorId || data.contractor_id || '').trim();
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cid)) {
                payload.contractorId = cid;
            }
        }
    } else if (objectType === 'const_acceptance') {
        payload = {
            id: id,
            project_code: pCode,
            object_id: data.objectId || '',
            floor_id: data.floorId || '',
            zone: data.zone || null,
            template_key: data.templateKey || '',
            work_type: data.workType || '',
            location: data.location || '',
            section: data.section || '',
            floor: data.floor || '',
            room: data.room || '',
            volume: data.volume || '',
            requested_date: data.requestedDate ? new Date(data.requestedDate).toISOString() : null,
            requested_time: data.requestedTime || '',
            contractor: data.contractor || '',
            status: data.status || 'pending',
            is_deleted: isDeleted,
            created_at: data.created_at || new Date().toISOString(),
            updated_at: updatedAt
        };
        {
            const cid = String(data.contractorId || data.contractor_id || '').trim();
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cid)) {
                payload.contractorId = cid;
            }
        }
    } else if (objectType === 'const_unit') {
        payload = {
            id: id,
            project_code: pCode,
            building_id: data.building_id || '',
            floor_id: data.floor_id || '',
            name: data.name || '',
            type: data.type || '',
            sort_order: data.sort_order || 0,
            status: data.status || 'none',
            is_deleted: isDeleted,
            created_at: data.created_at || new Date().toISOString(),
            updated_at: updatedAt
        };
    } else if (objectType === 'const_building') {
        payload = {
            id: id,
            project_code: pCode,
            object_id: data.object_id || '',
            name: data.name || '',
            sort_order: data.sort_order || 0,
            owner: data.owner || iName,
            created_by: data.created_by || iName,
            source: 'cloud',
            sync_status: 'synced',
            is_deleted: isDeleted,
            created_at: data.created_at || new Date().toISOString(),
            updated_at: updatedAt
        };
    } else if (objectType === 'const_floor') {
        payload = {
            id: id,
            project_code: pCode,
            building_id: data.building_id || '',
            name: data.name || '',
            sort_order: data.sort_order || 0,
            pdf_url: data.pdf_url || '',
            pdf_name: data.pdf_name || '',
            pdf_size: data.pdf_size || '',
            is_active: data.is_active !== false,
            owner: data.owner || iName,
            created_by: data.created_by || iName,
            source: 'cloud',
            sync_status: 'synced',
            is_deleted: isDeleted,
            created_at: data.created_at || new Date().toISOString(),
            updated_at: updatedAt
        };
    } else if (objectType === 'assistant_kb') {
        payload = {
            id: id,
            project_code: pCode, // Гарантируем наличие кода проекта
            question: data.question || '',
            answer: data.answer || '',
            tags: data.tags || [],
            enabled: data.enabled !== false,
            created_by: data.created_by || iName,
            is_deleted: isDeleted,
            created_at: data.created_at || new Date().toISOString(),
            updated_at: updatedAt
        };
    } else if (objectType === 'project_object') {
        payload = {
            id: id,
            project_code: pCode,
            canonical_key: data.canonical_key || '',
            display_name: data.display_name || '',
            synonyms: data.synonyms || [],
            created_by: data.created_by || iName,
            _deleted: isDeleted,
            is_deleted: isDeleted,
            created_at: data.created_at || new Date().toISOString(),
            updated_at: updatedAt
        };
    } else if (objectType === 'object_alias') {
        payload = {
            id: id,
            project_code: pCode,
            raw_name: data.raw_name || '',
            canonical_key: data.canonical_key || '',
            created_at: data.created_at || new Date().toISOString(),
            updated_at: updatedAt
        };
    } else {
        // Стандартный формат (всё складываем в JSONB колонку 'data')
        payload = {
            id: id,
            data: uploadedData,
            is_deleted: isDeleted,
            deleted_at: deletedAt,
            updated_at: updatedAt
        };
    }

    // Заполнение специфичных полей для shared_* и project_* таблиц
    if (!['report', 'snapshot', 'assistant_kb', 'project_object', 'object_alias', 'const_defect', 'const_acceptance', 'const_unit', 'const_building', 'const_floor', 'const_object'].includes(objectType)) {
        if (isShared) {
            payload.owner = data.owner || iName;
            payload.project_code = pCode; // Гарантируем наличие кода проекта
            payload.created_at = data.createdAt || data.created_at || new Date().toISOString();
            payload.created_by_name = data.owner || data.author || iName;
            payload.source = 'cloud';
            payload.sync_status = 'synced';
            payload.sync_block_reason = '';
        } else {
            payload.project_code = pCode; // Гарантируем наличие кода проекта

            payload.project_canonical_key =
                data.project_canonical_key ||
                data.projectCanonicalKey ||
                data.project ||
                data.projectName ||
                '';

            payload.project_display_name =
                data.project_display_name ||
                data.projectDisplayName ||
                data.project ||
                data.projectName ||
                '';

            payload.engineer_name =
                data.engineer_name ||
                data.engineerName ||
                data.inspector_name ||
                data.inspectorName ||
                data.author ||
                iName;

            payload.inspector_name =
                data.inspector_name ||
                data.inspectorName ||
                data.engineer_name ||
                data.engineerName ||
                data.author ||
                iName;

            payload.contractor_name =
                data.contractor_name ||
                data.contractorName ||
                data.contractor ||
                '';

            payload.source = 'cloud';
            payload.sync_status = 'synced';
            payload.sync_block_reason = '';
        }
    }

    // Для project_object и object_alias используем логику "обновить или вставить" без onConflict
    if (objectType === 'project_object') {
        // Проверяем, существует ли запись с таким canonical_key
        const { data: existing, error: findErr } = await window.supabaseClient
            .from(tableName)
            .select('id')
            .eq('project_code', pCode)
            .eq('canonical_key', payload.canonical_key)
            .maybeSingle();
        if (findErr) throw findErr;

        if (existing) {
            // Обновляем существующую запись (сбрасываем is_deleted)
            const { error: updateErr } = await window.supabaseClient
                .from(tableName)
                .update({
                    display_name: payload.display_name,
                    synonyms: payload.synonyms,
                    created_by: payload.created_by,
                    is_deleted: false,
                    updated_at: payload.updated_at
                })
                .eq('id', existing.id);
            if (updateErr) throw updateErr;
            // Сохраняем существующий id для возврата
            uploadedData.id = existing.id;
        } else {
            // Вставляем новую запись
            const { error: insertErr } = await window.supabaseClient
                .from(tableName)
                .insert(payload);
            if (insertErr) throw insertErr;
        }
    }
    else if (objectType === 'object_alias') {
        // Проверяем, существует ли алиас с таким raw_name
        const { data: existing, error: findErr } = await window.supabaseClient
            .from(tableName)
            .select('id')
            .eq('project_code', pCode)
            .eq('raw_name', payload.raw_name)
            .maybeSingle();
        if (findErr) throw findErr;

        if (existing) {
            // Обновляем существующий алиас (canonical_key мог измениться)
            const { error: updateErr } = await window.supabaseClient
                .from(tableName)
                .update({
                    canonical_key: payload.canonical_key,
                    updated_at: payload.updated_at
                })
                .eq('id', existing.id);
            if (updateErr) throw updateErr;
            uploadedData.id = existing.id;
        } else {
            const { error: insertErr } = await window.supabaseClient
                .from(tableName)
                .insert(payload);
            if (insertErr) throw insertErr;
        }
    }
    else {
        // Для всех остальных типов оставляем старый upsert
        const { error } = await window.supabaseClient.from(tableName).upsert(payload, { onConflict: 'id' });
        if (error) throw error;
    }

    // ВАЖНО: Возвращаем обновленный объект (с замененными ссылками на http://)
    return uploadedData;
};

window.pullCloudObjects = async function (objectType, lastPullTimeStr = '', mode = 'silent') {
    // C2b: OD flat catalog sync disabled — SoT = locations
    if (objectType === 'project_object' || objectType === 'object_alias') {
        console.log('[Sync] C2b: skip pullCloudObjects', objectType);
        return [];
    }

    const pCode = window.syncConfig.projectCode;
    const iName = window.syncConfig.engineerName || 'Инженер';

    let tableName = '';
    let isShared = false;

    switch (objectType) {
        case 'custom_twi_card': tableName = 'shared_twi_cards'; isShared = true; break;
        case 'custom_node': tableName = 'shared_nodes'; isShared = true; break;
        case 'custom_doc': tableName = 'shared_docs'; isShared = true; break;
        case 'user_template': tableName = 'shared_checklists'; isShared = true; break;
        case 'feedback': tableName = 'shared_feedback'; isShared = true; break;
        case 'practice': tableName = 'shared_practices'; isShared = true; break;
        case 'etalon': tableName = 'shared_etalons'; isShared = true; break;
        case 'meeting': tableName = 'project_meetings'; break;
        case 'intervention': tableName = 'project_interventions'; break;
        case 'fmea': tableName = 'project_fmea'; break;
        case 'schedule': tableName = 'project_schedule_stages'; break;
        case 'project_object': tableName = 'project_objects'; isShared = true; break;
        case 'object_alias': tableName = 'object_aliases'; isShared = true; break;
        case 'report': tableName = 'shared_reports'; isShared = false; break;
        case 'report_template': tableName = 'shared_report_templates'; isShared = true; break;
        case 'assistant_kb': tableName = 'app_assistant_kb'; isShared = true; break;
        case 'const_object': tableName = 'construction_objects'; isShared = true; break;
        case 'const_building': tableName = 'construction_buildings'; isShared = true; break;
        case 'const_floor': tableName = 'construction_floors'; isShared = true; break;
        case 'const_defect': tableName = 'construction_defects'; isShared = true; break;
        case 'const_unit': tableName = 'construction_units'; isShared = true; break;
        case 'const_acceptance': tableName = 'construction_acceptance'; isShared = true; break;
        default: return [];
    }

    const currentCloudStatus = window.RBI.services.permissions ? window.RBI.services.permissions.getCloudStatus() : 'pending';
    if (currentCloudStatus !== 'approved') return [];

    let query = window.supabaseClient.from(tableName).select('*').limit(2000);

    // ЖЕСТКАЯ ИЗОЛЯЦИЯ ПРОЕКТОВ (Главное правило!)
    query = query.eq('project_code', pCode);

    // ИСПРАВЛЕНИЕ: Не тянем мусор из базы при первой синхронизации
    if (!lastPullTimeStr) {
        query = query.eq('is_deleted', false);
    } else {
        query = query.gt('updated_at', lastPullTimeStr);
    }

    const { data, error } = await query;
    if (error) throw error;

    let result = [];
    const role = window.RBI.services.permissions ? window.RBI.services.permissions.getCurrentRole() : 'guest';
    const rowDataScope = window.RBI.services.permissions ? window.RBI.services.permissions.getDataScope(role) : 'none';
    const myProjects = window.RBI.services.permissions ? window.RBI.services.permissions.getAssignedProjects() : [];
    const myContrName = typeof appSettings !== 'undefined' ? (appSettings.contractorName || appSettings.assignedContractor || '') : '';
    const pullKind = window.RbiSyncAccess ? window.RbiSyncAccess.kindOf(tableName) : null;
    const pullMe = pullKind ? window.RbiSyncAccess.deviceMe() : null;

    for (const row of data || []) {
        let obj = {};

        // Распаковываем JSONB
        if (row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
            obj = { ...row.data };
        } else if (row.template_data) {
            obj = { ...row.template_data };
        }

        obj = { ...obj, ...row };

        // JSONB/template уже развёрнуты в flat — не держать nested mirror в IDB/memory
        // (иначе customDocs раздувается дублем payload после каждого pull).
        if (obj.data && typeof obj.data === 'object') delete obj.data;
        if (obj.template_data != null) delete obj.template_data;

        // Нормализуем системные ключи
        obj.id = row.id;
        obj.updatedAt = row.updated_at;
        obj.createdAt = row.created_at;
        obj.is_deleted = row.is_deleted === true;
        obj._deleted = obj.is_deleted;
        if (obj.is_deleted) obj._deletedAt = row.deleted_at || row.updated_at;
        if (row.owner || row.created_by) obj.owner = row.owner || row.created_by;
        if (row.core_created_by) obj.authorId = row.core_created_by;   // P2-0061: автор — id учётной записи (ставит сервер)

        // P2-0061 (ТД 149): вид с описанием `sync` — отбор общим правилом (по id автора, объекту, id фирмы; «Только мои» — по id),
        // без отбора по названию фирмы и ФИО; вид без описания — как раньше
        if (pullKind) {
            if (!window.RbiSyncAccess.keepPulled(obj, pullKind, pullMe, window.syncConfig && window.syncConfig.syncMode === 'personal')) continue;
        } else if (!isShared) {
            const itemProject = obj.project_canonical_key || obj.project || '';
            const itemContr = obj.contractor_name || obj.contractor || '';
            const itemEngineer = obj.engineer_name || obj.inspector_name || obj.created_by || '';

            if (rowDataScope === 'none') continue;
            if (rowDataScope === 'ownContractor') {
                if (!myContrName || (itemContr && itemContr !== myContrName)) continue;
                if (myProjects.length > 0 && itemProject && itemProject !== 'Все'
                    && !(window.RBI.services.permissions && typeof window.RBI.services.permissions.isRecordInAssignedProjects === 'function'
                        ? window.RBI.services.permissions.isRecordInAssignedProjects(obj, myProjects)
                        : myProjects.includes(itemProject))) continue;
            } else if (rowDataScope === 'ownProjectOrOwnRecords') {
                // Если включен режим "Только мои" - отсекаем чужое
                if (window.syncConfig.syncMode === 'personal' && itemEngineer && itemEngineer !== iName) continue;
                const isGlobal = !itemProject || itemProject.toLowerCase().includes('все ') || itemProject === 'all';
                if (myProjects.length > 0 && !isGlobal
                    && !(window.RBI.services.permissions && typeof window.RBI.services.permissions.isRecordInAssignedProjects === 'function'
                        ? window.RBI.services.permissions.isRecordInAssignedProjects(obj, myProjects)
                        : myProjects.includes(itemProject))) continue;
            } else if (rowDataScope === 'ownProject') {
                if (myProjects.length === 0) continue;
                if (itemProject && itemProject !== 'Все'
                    && !(window.RBI.services.permissions && typeof window.RBI.services.permissions.isRecordInAssignedProjects === 'function'
                        ? window.RBI.services.permissions.isRecordInAssignedProjects(obj, myProjects)
                        : myProjects.includes(itemProject))) continue;
            }
        }

        obj.source = 'cloud';
        obj.syncStatus = 'synced';
        obj.sync_status = 'synced';

        result.push(obj);
    }
    return result;
};

