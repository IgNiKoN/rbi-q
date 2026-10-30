/* Файл: js/services/template.service.js */
/* Template Service v0.1 — единая точка доступа к шаблонам проверок */
/* Паттерн ленивых ссылок: каждый метод читает актуальное window.* в момент вызова */
/* CRUD для пользовательских шаблонов с делегированием в app.js + эмит events */

(function () {
    'use strict';

    if (typeof window === 'undefined') { return; }

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    /* Владение userTemplates (Реальная изоляция модулей, часть 3, Группа A):
       перенесено 1:1 из js/core/bootstrap.js — сервис теперь единственный
       владелец объявления, window.userTemplates остаётся синхронизированной
       живой ссылкой для обратной совместимости со всеми потребителями. */
    var _userTemplates = {};
    window.userTemplates = _userTemplates;

    window.RBI.services.templates = {

        /* ── Геттеры (read-only, ленивые ссылки) ── */

        getUserTemplates: function () {
            return (window.userTemplates && typeof window.userTemplates === 'object') ? window.userTemplates : {};
        },

        /* Заменить весь объект пользовательских шаблонов целиком (используется
           при первичной загрузке из IndexedDB/localStorage в bootstrap.js —
           заменяет bare `userTemplates = {...}` физическим владением сервиса). */
        replaceUserTemplates: function (obj) {
            _userTemplates = (obj && typeof obj === 'object') ? obj : {};
            window.userTemplates = _userTemplates;
            return _userTemplates;
        },

        getSystemTemplates: function () {
            return (typeof window.SYSTEM_TEMPLATES !== 'undefined') ? window.SYSTEM_TEMPLATES : {};
        },

        getByKey: function (key) {
            var sys = (typeof window.SYSTEM_TEMPLATES !== 'undefined') ? window.SYSTEM_TEMPLATES : {};
            if (sys[key] !== undefined) { return sys[key]; }
            var user = (window.userTemplates && typeof window.userTemplates === 'object') ? window.userTemplates : {};
            return user[key] !== undefined ? user[key] : null;
        },

        getAll: function () {
            var sys = (typeof window.SYSTEM_TEMPLATES !== 'undefined') ? window.SYSTEM_TEMPLATES : {};
            var sysArr = Object.keys(sys).map(function (k) { return sys[k]; });
            var user = (window.userTemplates && typeof window.userTemplates === 'object') ? window.userTemplates : {};
            return sysArr.concat(Object.keys(user).map(function (k) { return user[k]; }));
        },

        isSystemTemplate: function (key) {
            var sys = (typeof window.SYSTEM_TEMPLATES !== 'undefined') ? window.SYSTEM_TEMPLATES : {};
            return Object.prototype.hasOwnProperty.call(sys, key);
        },

        /* Редактор системных чек-листов Блок 1: резолвер «поставка либо
           официальная пользовательская копия по указателю компании».
           Использовать во всех местах, где чек-лист реально загружается для
           работы (Осмотр/База знаний) — не для админского списка поставки.
           @returns {{groups:Array, title:string, isOfficialOverride:boolean,
             officialVersion?:number, officialUpdatedAt?:string,
             officialUpdatedBy?:string, officialRef?:string}|null} */
        getEffectiveTemplate: function (systemKey) {
            var sys = (typeof window.SYSTEM_TEMPLATES !== 'undefined') ? window.SYSTEM_TEMPLATES : {};
            var base = sys[systemKey];
            if (!base) return null;
            var companySvc = window.RBI && window.RBI.services && window.RBI.services.company;
            var pointer = (companySvc && typeof companySvc.getOfficialTemplates === 'function')
                ? companySvc.getOfficialTemplates()[systemKey]
                : null;
            if (pointer && pointer.type === 'user' && pointer.ref) {
                var user = (window.userTemplates && typeof window.userTemplates === 'object') ? window.userTemplates : {};
                var override = user[pointer.ref];
                if (override && !override._deleted && !override.is_deleted && Array.isArray(override.groups)) {
                    return {
                        groups: override.groups,
                        title: base.title,
                        isOfficialOverride: true,
                        officialVersion: pointer.version,
                        officialUpdatedAt: pointer.updatedAt,
                        officialUpdatedBy: pointer.updatedBy,
                        officialRef: pointer.ref
                    };
                }
            }
            return { groups: base.groups, title: base.title, isOfficialOverride: false };
        },

        /* ── CRUD (пользовательские шаблоны) ── */

        saveUserTemplate: function (data) {
            /* Сохраняем самостоятельно в объектную модель userTemplates (slug -> data) */
            if (!window.userTemplates || typeof window.userTemplates !== 'object') {
                window.userTemplates = {};
            }

            var slug = data.slug || data.key || data.id || window.RbiIds.newId();
            data.slug = slug;
            data.id = slug;

            window.userTemplates[slug] = data;

            if (typeof window.dbPut === 'function' && window.STORES && window.STORES.TEMPLATES) {
                window.dbPut(window.STORES.TEMPLATES, { slug: slug, data: data })
                    .then(function () {
                        this._emitChanged({ slug: slug });
                    }.bind(this))
                    .catch(function (e) {
                        console.error('[TemplateService] ошибка сохранения:', e);
                    });
            } else {
                this._emitChanged({ slug: slug });
            }
        },

        deleteUserTemplate: function (key) {
            /* Мягкое удаление в объектной модели userTemplates (slug -> data) */
            if (!window.userTemplates || typeof window.userTemplates !== 'object' || !window.userTemplates[key]) {
                return;
            }

            var record = window.userTemplates[key];
            record._deleted = true;
            record.is_deleted = true;
            record._deletedAt = new Date().toISOString();
            record.updatedAt = record._deletedAt;
            record.source = 'local';
            record.syncStatus = 'not_synced';
            record.sync_status = 'not_synced';

            var finalize = function () {
                delete window.userTemplates[key];
                this._emitChanged({ slug: key, deleted: true });
            }.bind(this);

            if (typeof window.dbPut === 'function' && window.STORES && window.STORES.TEMPLATES) {
                window.dbPut(window.STORES.TEMPLATES, { slug: key, data: record })
                    .then(finalize)
                    .catch(function (e) {
                        console.error('[TemplateService] ошибка удаления:', e);
                        finalize();
                    });
            } else {
                finalize();
            }
        },

        /* ── Внутренний хелпер ── */

        _emitChanged: function (payload) {
            var events = window.RBI && window.RBI.events;
            if (events && typeof events.emit === 'function') {
                events.emit('templates:changed', payload || {});
            }
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.templates', window.RBI.services.templates);
    }

    console.log('[RBI Service] template.service loaded');
}());
