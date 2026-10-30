/* Файл: js/modules/construction/features/admin.js */

// ============================================================================
// === МОДУЛЬ АДМИНИСТРИРОВАНИЯ ИЕРАРХИИ СК ===
// ============================================================================

var _ctx = null;
function bindCtx(ctx) { _ctx = ctx; }

function _getSetting(key) {
    if (_ctx && _ctx.settings) return _ctx.settings.get(key);
    return window.RBI.services.settings.get(key);
}

function _setSetting(key, value) {
    if (_ctx && _ctx.settings) return _ctx.settings.set(key, value);
    return window.RBI.services.settings.set(key, value);
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

function _permissions() {
    if (_ctx && _ctx.permissions) return _ctx.permissions;
    return window.RBI.services.permissions;
}

function _objects() {
    try {
        if (_ctx && _ctx.services && _ctx.services.objects) return _ctx.services.objects;
        if (_ctx && _ctx.objects) return _ctx.objects;
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

function _sync() {
    if (_ctx && _ctx.sync) return _ctx.sync;
    if (window.RBI && window.RBI.services && window.RBI.services.sync) return window.RBI.services.sync;
    return null;
}

window.ConstAdmin = {
    bindCtx: bindCtx,
    openModal() {
        let html = `
        <div id="const-admin-modal" class="fixed inset-0 bg-slate-900/80 z-[6000] hidden items-start justify-center p-2 sm:p-4 backdrop-blur-sm overflow-y-auto" onclick="window.ConstAdmin.closeModal()">
            <div class="bg-[var(--bg-main)] w-full max-w-3xl mt-4 mb-10 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--card-border)] min-h-[60vh]" onclick="event.stopPropagation()">
                
                <!-- Шапка модалки -->
                <div class="p-4 bg-indigo-600 border-b border-indigo-700 flex justify-between items-center sticky top-0 z-20 shadow-md">
                    <h3 class="font-black text-[14px] uppercase tracking-tight text-white flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        Редактор иерархии объектов
                    </h3>
                    <button onclick="window.ConstAdmin.closeModal()" class="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white shadow-sm border border-indigo-400 active:scale-90 transition-transform">✕</button>
                </div>

                <div class="flex flex-col md:flex-row flex-1 p-4 gap-4">
                    <!-- Левая колонка: Дерево -->
                    <div class="w-full md:w-1/3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 shadow-sm h-fit max-h-[50vh] overflow-y-auto custom-scrollbar">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Дерево</span>
                            <button onclick="window.ConstAdmin.createObject()" class="text-indigo-600 font-black text-lg active:scale-90" title="Добавить Объект">+</button>
                        </div>
                        <div id="const-admin-tree" class="space-y-1">
                            <!-- Дерево рендерится здесь -->
                        </div>
                    </div>

                    <!-- Правая колонка: Редактор выбранного элемента -->
                    <div class="w-full md:w-2/3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 shadow-sm" id="const-admin-editor">
                        <div class="text-center py-10 text-slate-400 font-bold text-xs uppercase tracking-widest">
                            Выберите элемент в дереве слева
                        </div>
                    </div>
                </div>

            </div>
        </div>`;

        // Удаляем старую модалку, если она залипла
        const oldModal = document.getElementById('const-admin-modal');
        if (oldModal) oldModal.remove();

        document.body.insertAdjacentHTML('beforeend', html);

        this.renderTree();

        const modal = document.getElementById('const-admin-modal');
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    },

    closeModal() {
        const modal = document.getElementById('const-admin-modal');
        if (modal) modal.remove();
        document.body.classList.remove('modal-open');

        // После закрытия админки - перерисовываем главные селекторы на экране
        if (window.ConstManager) window.ConstManager.renderSelectors();
    },

    // ==========================================
    // 1. Отрисовка Дерева
    // ==========================================
    renderTree() {
        const treeContainer = document.getElementById('const-admin-tree');
        if (!treeContainer) return;

        let html = '';
        const objects = window.ConstManager.objects;
        const buildings = window.ConstManager.buildings;
        const floors = window.ConstManager.floors;

        if (objects.length === 0) {
            treeContainer.innerHTML = `<div class="text-[9px] text-slate-400 italic text-center">Пусто. Нажмите +</div>`;
            return;
        }

        // Сортируем объекты по алфавиту
        objects.sort((a, b) => a.name.localeCompare(b.name)).forEach(obj => {
            html += `
                <div class="border-l-2 border-indigo-200 ml-1 pl-2 pb-2">
                    <div class="flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1.5 rounded cursor-pointer hover:bg-indigo-100" onclick="window.ConstAdmin.editElement('object', '${obj.id}')">
                        <span class="text-[11px] font-black text-indigo-700 dark:text-indigo-400 truncate w-32" title="${obj.name}">${obj.name}</span>
                        <button onclick="event.stopPropagation(); window.ConstAdmin.createBuilding('${obj.id}')" class="text-[9px] text-indigo-600 font-bold bg-white px-1.5 rounded shadow-sm">+ К</button>
                    </div>
            `;

            const objBlds = buildings.filter(b => b.object_id === obj.id).sort((a, b) => a.sort_order - b.sort_order);
            objBlds.forEach(bld => {
                html += `
                    <div class="border-l border-emerald-200 ml-3 pl-2 mt-1 pb-1">
                        <div class="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded cursor-pointer hover:bg-emerald-100" onclick="window.ConstAdmin.editElement('building', '${bld.id}')">
                            <span class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 truncate w-24" title="${bld.name}">${bld.name}</span>
                            <button onclick="event.stopPropagation(); window.ConstAdmin.createFloor('${bld.id}')" class="text-[9px] text-emerald-600 font-bold bg-white px-1.5 rounded shadow-sm">+ Э</button>
                        </div>
                `;

                const bldFlrs = floors.filter(f => f.building_id === bld.id).sort((a, b) => a.sort_order - b.sort_order);
                bldFlrs.forEach(flr => {
                    const hasPdf = flr.pdf_url ? '📄' : '⚠️';
                    html += `
                        <div class="ml-3 mt-1 px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded text-[9px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-100 flex justify-between" onclick="window.ConstAdmin.editElement('floor', '${flr.id}')">
                            <span>${flr.name}</span>
                            <span>${hasPdf}</span>
                        </div>
                    `;
                });
                html += `</div>`; // Конец Корпуса
            });
            html += `</div>`; // Конец Объекта
        });

        treeContainer.innerHTML = html;
    },

    // ==========================================
    // 2. Редактор элементов
    // ==========================================
    editElement(type, id) {
        const editor = document.getElementById('const-admin-editor');
        if (!editor) return;

        let el = null;
        let titleHtml = '';
        let formHtml = '';

        if (type === 'object') {
            el = window.ConstManager.objects.find(x => x.id === id);
            titleHtml = `🏢 Объект: ${el.name}`;
            formHtml = `
                <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Название объекта</label>
                <input type="text" id="edit-name" class="input-base mb-3" value="${el.name.replace(/"/g, '&quot;')}">
                
                <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Описание (опционально)</label>
                <textarea id="edit-desc" class="input-base h-20 mb-4">${el.description || ''}</textarea>
            `;
        }
        else if (type === 'building') {
            el = window.ConstManager.buildings.find(x => x.id === id);
            titleHtml = `🏗️ Корпус: ${el.name}`;
            formHtml = `
                <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Название Корпуса / Секции</label>
                <input type="text" id="edit-name" class="input-base mb-3" value="${el.name.replace(/"/g, '&quot;')}">
                
                <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Порядок сортировки (Число)</label>
                <input type="number" id="edit-sort" class="input-base mb-4" value="${el.sort_order || 0}">
            `;
        }
        else if (type === 'floor') {
            el = window.ConstManager.floors.find(x => x.id === id);
            titleHtml = `🪜 Этаж: ${el.name}`;

            const pdfStatus = el.pdf_url
                ? `<div class="bg-green-50 text-green-700 p-2 rounded-lg text-[10px] font-bold mb-3 border border-green-200">✅ План загружен (${el.pdf_size || 'Размер неизвестен'})</div>`
                : `<div class="bg-red-50 text-red-600 p-2 rounded-lg text-[10px] font-bold mb-3 border border-red-200">❌ PDF план не загружен</div>`;

            formHtml = `
                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Название этажа</label>
                        <input type="text" id="edit-name" class="input-base" value="${el.name.replace(/"/g, '&quot;')}">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Порядок сортировки</label>
                        <input type="number" id="edit-sort" class="input-base" value="${el.sort_order || 0}">
                    </div>
                </div>

                ${pdfStatus}

                <div class="border-t border-slate-200 dark:border-slate-700 pt-3 mt-2">
                    <label class="text-[10px] font-bold text-indigo-600 uppercase mb-2 block">Загрузка чертежа (PDF)</label>
                    <input type="file" id="edit-pdf-file" accept="application/pdf" class="hidden" onchange="window.ConstAdmin.handlePdfSelect(event, '${id}')">
                    <button onclick="document.getElementById('edit-pdf-file').click()" class="w-full bg-slate-100 text-slate-700 border border-slate-300 py-3 rounded-lg text-[11px] font-bold uppercase active:scale-95 transition-colors shadow-sm flex items-center justify-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"></path></svg>
                        Выбрать новый PDF (До 20 МБ)
                    </button>
                    <div id="pdf-upload-progress" class="text-[10px] font-bold text-indigo-600 mt-2 text-center hidden animate-pulse">Загрузка в облако... Пожалуйста, подождите.</div>
                </div>
            `;
        }

        if (!el) return;

        editor.innerHTML = `
            <div class="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
                <div class="font-black text-[13px] text-slate-800 dark:text-white">${titleHtml}</div>
                <button onclick="window.ConstAdmin.deleteElement('${type}', '${id}')" class="text-red-500 font-black text-sm px-2" title="Удалить">🗑️</button>
            </div>
            
            ${formHtml}
            
            <button onclick="window.ConstAdmin.saveElement('${type}', '${id}')" class="w-full mt-4 bg-indigo-600 text-white py-3.5 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2">
                💾 Сохранить изменения
            </button>
        `;
    },

    // ==========================================
    // 3. Создание базовых элементов
    // ==========================================
    async createObject() {
        const name = prompt('Введите название нового Объекта:');
        if (!name || name.trim() === '') return;

        const role = _permissions() ? _permissions().getCurrentRole() : 'guest';
        const isManager = _permissions() ? _permissions().canManageHierarchy() : ['manager', 'deputy_manager', 'director'].includes(role);

        if (isManager) {
            // Прямое добавление для администраторов
            var od = _objects();
            if (od) {
                const canonical = od.cleanString(name);
                if (_objectList().find(o => o.canonical_key === canonical)) {
                    return showToast("⚠️ Объект с таким названием уже существует!");
                }
                const newObj = {
                    id: window.RbiIds.newId(),
                    canonical_key: canonical,
                    display_name: name.trim(),
                    synonyms: [],
                    project_code: window.syncConfig?.projectCode || '',
                    created_by: _getSetting('engineerName') || 'Админ',
                    updated_at: new Date().toISOString(),
                    _deleted: false,
                    source: 'local',
                    sync_status: 'not_synced'
                };
                _objectList().push(newObj);
                _storage().put('project_objects', newObj);

                localStorage.setItem('rbi_cloud_dirty', '1');
                this.triggerSync();

                window.ConstManager.objects.push({ id: canonical, name: name.trim() });
                this.renderTree();
                showToast("✅ Объект добавлен в общий Справочник!");
            }
        } else {
            // Создание заявки для инженера (Как в основном приложении)
            if (typeof appSettings !== 'undefined') {
                if (!_getSetting('pendingAssignedProjects')) _setSetting('pendingAssignedProjects', []);

                const requestedProject = {
                    raw_name: name.trim(),
                    canonical_key: (function () {
                        var o = _objects();
                        return o && typeof o.cleanString === 'function' ? o.cleanString(name) : name.trim().toLowerCase();
                    })(),
                    display_name: name.trim(),
                    status: 'pending',
                    // request_type НЕ 'directory': заявки с этим типом уходят в
                    // object_normalization_queue и обрабатываются через
                    // resolveDirectoryRequest(), которая пополняет ОБЩИЙ справочник,
                    // но НЕ привязывает конкретного инженера к объекту — заявка
                    // "теряется" для этого пользователя (плашка никогда не появится,
                    // даже после обработки админом). 'profile_only' идёт в панель
                    // «Команда» (settings.requestedProjects), где resolveRequest()
                    // при action='create'/'link_*' создаёт объект И привязывает
                    // именно этого инженера — см. current_plan.md §2.2.
                    request_type: 'profile_only',
                    created_at: new Date().toISOString()
                };

                const _pap = _getSetting('pendingAssignedProjects') || [];
                _pap.push(requestedProject);
                _setSetting('pendingAssignedProjects', _pap);

                if (typeof window.pushObjectRequestToCloud === 'function') {
                    window.pushObjectRequestToCloud(requestedProject).catch(function (e) {
                        console.warn('[ConstAdmin] Не удалось отправить заявку на объект:', e);
                        localStorage.setItem('rbi_cloud_dirty', '1');
                    });
                }
                showToast("📨 Заявка на создание объекта отправлена руководителю!");
            }
        }
    },

    async createBuilding(objId) {
        const name = prompt('Введите название Корпуса/Секции:');
        if (!name) return;

        const newBld = {
            id: window.RbiIds.newId(),
            object_id: objId,
            name: name,
            sort_order: window.ConstManager.buildings.filter(b => b.object_id === objId).length + 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            _deleted: false,
            source: 'local',
            sync_status: 'not_synced',
            syncStatus: 'not_synced'
        };

        window.ConstManager.buildings.push(newBld);
        await _storage().put(_storage().stores().CONST_BUILDINGS, newBld);
        this.triggerSync();
        this.renderTree();
    },

    async createFloor(bldId) {
        const name = prompt('Введите номер или название Этажа (например: 5 этаж):');
        if (!name) return;

        const newFlr = {
            id: window.RbiIds.newId(),
            building_id: bldId,
            name: name,
            sort_order: window.ConstManager.floors.filter(f => f.building_id === bldId).length + 1,
            pdf_url: '',
            pdf_name: '',
            pdf_size: '',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            _deleted: false,
            source: 'local',
            sync_status: 'not_synced',
            syncStatus: 'not_synced'
        };

        window.ConstManager.floors.push(newFlr);
        await _storage().put(_storage().stores().CONST_FLOORS, newFlr);
        this.triggerSync();
        this.renderTree();
    },

    // ==========================================
    // 4. Сохранение и Удаление
    // ==========================================
    async saveElement(type, id) {
        const nameInput = document.getElementById('edit-name');
        if (!nameInput || !nameInput.value.trim()) return alert("Имя не может быть пустым!");

        if (type === 'object') {
            const obj = window.ConstManager.objects.find(x => x.id === id);
            obj.name = nameInput.value.trim();
            obj.description = document.getElementById('edit-desc').value.trim();
            obj.updated_at = new Date().toISOString();
            obj.sync_status = 'not_synced';
            await _storage().put(_storage().stores().CONST_OBJECTS, obj);
        }
        else if (type === 'building') {
            const bld = window.ConstManager.buildings.find(x => x.id === id);
            bld.name = nameInput.value.trim();
            bld.sort_order = parseInt(document.getElementById('edit-sort').value) || 0;
            bld.updated_at = new Date().toISOString();
            bld.sync_status = 'not_synced';
            await _storage().put(_storage().stores().CONST_BUILDINGS, bld);
        }
        else if (type === 'floor') {
            const flr = window.ConstManager.floors.find(x => x.id === id);
            flr.name = nameInput.value.trim();
            flr.sort_order = parseInt(document.getElementById('edit-sort').value) || 0;
            flr.updated_at = new Date().toISOString();
            flr.sync_status = 'not_synced';
            await _storage().put(_storage().stores().CONST_FLOORS, flr);
        }

        this.triggerSync();
        this.renderTree();
        if (typeof showToast === 'function') showToast("✅ Сохранено!");
    },

    async deleteElement(type, id) {
        if (!confirm('Удалить элемент? Внимание: каскадное удаление.')) return;

        const now = new Date().toISOString();

        if (type === 'object') {
            const obj = window.ConstManager.objects.find(x => x.id === id);
            obj._deleted = true; obj.sync_status = 'not_synced'; obj.updated_at = now;
            await _storage().put(_storage().stores().CONST_OBJECTS, obj);

            // Каскад
            window.ConstManager.buildings.filter(b => b.object_id === id).forEach(async b => {
                b._deleted = true; b.sync_status = 'not_synced'; b.updated_at = now;
                await _storage().put(_storage().stores().CONST_BUILDINGS, b);

                window.ConstManager.floors.filter(f => f.building_id === b.id).forEach(async f => {
                    f._deleted = true; f.sync_status = 'not_synced'; f.updated_at = now;
                    await _storage().put(_storage().stores().CONST_FLOORS, f);
                });
            });
        }
        else if (type === 'building') {
            const bld = window.ConstManager.buildings.find(x => x.id === id);
            bld._deleted = true; bld.sync_status = 'not_synced'; bld.updated_at = now;
            await _storage().put(_storage().stores().CONST_BUILDINGS, bld);

            // Каскад
            window.ConstManager.floors.filter(f => f.building_id === id).forEach(async f => {
                f._deleted = true; f.sync_status = 'not_synced'; f.updated_at = now;
                await _storage().put(_storage().stores().CONST_FLOORS, f);
            });
        }
        else if (type === 'floor') {
            // В будущем здесь будет проверка: "Есть ли на этаже дефекты?"
            const flr = window.ConstManager.floors.find(x => x.id === id);
            flr._deleted = true; flr.sync_status = 'not_synced'; flr.updated_at = now;
            await _storage().put(_storage().stores().CONST_FLOORS, flr);
        }

        // Обновляем ОЗУ массивы (убираем удаленные)
        window.ConstManager.objects = window.ConstManager.objects.filter(x => !x._deleted);
        window.ConstManager.buildings = window.ConstManager.buildings.filter(x => !x._deleted);
        window.ConstManager.floors = window.ConstManager.floors.filter(x => !x._deleted);

        this.triggerSync();
        this.renderTree();
        document.getElementById('const-admin-editor').innerHTML = '<div class="text-center py-10 text-slate-400">Удалено</div>';
    },

    triggerSync() {
        localStorage.setItem('rbi_cloud_dirty', '1');
        if (_sync()) { _sync().trigger('silent'); return; }
        if (typeof triggerSync === 'function') triggerSync('silent');
    },

    // ==========================================
    // 5. Загрузка PDF в облако (Supabase)
    // ==========================================
    async handlePdfSelect(event, floorId) {
        const file = event.target.files[0];
        if (!file) return;

        // Лимит 20 МБ
        if (file.size > 20 * 1024 * 1024) {
            alert('Файл слишком большой! Максимум 20 МБ.');
            event.target.value = '';
            return;
        }

        if (!window.supabaseClient) {
            alert('Нет подключения к облаку! Загрузка файлов невозможна.');
            return;
        }

        const progressEl = document.getElementById('pdf-upload-progress');
        if (progressEl) progressEl.classList.remove('hidden');

        try {
            // 1. Формируем путь в бакете `construction-plans`
            // Папка: projectCode / objectId / buildingId / floor_xxx.pdf
            const pCode = window.syncConfig?.projectCode || 'local';
            const floor = window.ConstManager.floors.find(x => x.id === floorId);
            const bld = window.ConstManager.buildings.find(x => x.id === floor.building_id);

            // Чтобы браузер не кэшировал старые планы, добавляем timestamp к имени файла
            const safeName = `plan_${Date.now()}.pdf`;
            const rawFilePath = `${pCode}/${bld.object_id}/${bld.id}/${floorId}/${safeName}`;

            // ОЧИСТКА ПУТИ: переводим кириллицу в латиницу, убираем скобки и пробелы
            let filePath = rawFilePath;
            if (typeof window.sanitizeStoragePath === 'function') {
                filePath = window.sanitizeStoragePath(rawFilePath);
            } else {
                // Если глобальная функция недоступна, делаем жесткую очистку
                filePath = rawFilePath.replace(/[^a-zA-Z0-9.\-_/]/g, '_');
            }

            // 2. Отправляем в Supabase
            const { data, error } = await window.supabaseClient.storage
                .from('construction-plans')
                .upload(filePath, file, {
                    cacheControl: '31536000',
                    upsert: true,
                    contentType: 'application/pdf'
                });

            if (error) throw error;

            // 3. Получаем публичную ссылку
            const { data: urlData } = window.supabaseClient.storage
                .from('construction-plans')
                .getPublicUrl(filePath);

            const publicUrl = urlData.publicUrl;

            // 4. Локально кэшируем PDF (единый путь rbiCacheCloudPdf → PhotoManager)
            if (typeof window.rbiCacheCloudPdf === 'function') {
                await window.rbiCacheCloudPdf(publicUrl);
            } else if (typeof PhotoManager !== 'undefined') {
                await PhotoManager.downloadForOffline(publicUrl);
            }

            // 5. Сохраняем ссылку в БД этажа
            floor.pdf_url = publicUrl;
            floor.pdf_name = file.name;
            floor.pdf_size = (file.size / 1024 / 1024).toFixed(1) + ' МБ';
            floor.updated_at = new Date().toISOString();
            floor.sync_status = 'not_synced';

            await _storage().put(_storage().stores().CONST_FLOORS, floor);
            this.triggerSync();

            if (typeof showToast === 'function') showToast("✅ План успешно загружен!");

            // Обновляем редактор, чтобы показать успех
            this.editElement('floor', floorId);

        } catch (e) {
            console.error('[ConstAdmin] Ошибка загрузки PDF:', e);
            alert('Ошибка загрузки файла в облако. Проверьте консоль.');
        } finally {
            if (progressEl) progressEl.classList.add('hidden');
            event.target.value = '';
        }
    }
};
