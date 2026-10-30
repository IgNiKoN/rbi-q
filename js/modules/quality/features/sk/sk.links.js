/**
 * sk.links.js
 * P2-0076: внешний СК по номерам «Компании». Фирма, категория и место из Excel один раз сопоставляются с записью ядра
 * (контрагент, вид работ, место — по id); соответствия хранит сервер (quality.sk_links, миграция 056), id замечаниям ставит
 * сторож сервера. Здесь: шаг сопоставления при загрузке, вид «Разобрать» (выбор / «Отменить» / «Создать контрагента» — только
 * с правом «Компании»), подписи и фильтр по месту для Аналитики. Похожие записи — sk_similarity (тот же подбор, что у импорта).
 * Ничего в ядре само не создаётся; права экрана приходят с сервера (sk_links_list), проверяет — сервер.
 */

var KINDS = ['contractor', 'category', 'place'];
var CHOICES_KEY = 'rbi_sk_core_choices:';
var _choices = null;        // { counterparties, work_types, places } текущего проекта
var _choicesProject = '';
var _pendingCount = null;   // число текстов в «Разобрать» (счётчик подвкладки)
var _undo = null;           // последний выбор — для «Отменить»
var _createFor = '';        // текст, для которого открыта форма «Создать контрагента»

function _t(key, fallback, vars) {
    try {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var s = vars ? i18n.t(key, vars) : i18n.t(key);
            if (s && s !== key) return s;
        }
    } catch (e) {}
    if (vars && fallback) {
        return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) { return vars[k] != null ? String(vars[k]) : ''; });
    }
    return fallback;
}

function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// =========================================================================
// Чистые функции (тесты — analytics/__tests__/sk-links.test.js)
// =========================================================================

/** Нормализованный текст соответствия — зеркало quality.sk_link_key (056): регистр, ё/е, кавычки, пробелы. */
function skLinkKey(text) {
    var s = String(text == null ? '' : text).toLowerCase().replace(/ё/g, 'е').replace(/["'«»„“”`]/g, '').replace(/\s+/g, ' ').trim();
    return s ? s.slice(0, 500) : null;
}

/** Текст замечания для вида — зеркало quality.sk_rec_text: фирма как в файле; категория — кроме «Без категории»; место — путь. */
function skRecordText(kind, r) {
    if (!r) return null;
    var s = '';
    if (kind === 'contractor') s = String(r.contractor_raw || r.raw_contractor || '').trim() || String(r.contractor_name || '').trim();
    else if (kind === 'category') s = skLinkKey(r.category) === 'без категории' ? '' : String(r.category || '').trim();
    else if (kind === 'place') s = String(r.project_raw_path || '').trim() || String(r.project_loc || '').trim();
    return s || null;
}

var ID_FIELD = { contractor: 'core_counterparty_id', category: 'core_work_type_id', place: 'core_location_id' };

/** Тексты файла для шага сопоставления: по одному на вид и нормализованный текст (как ключ на сервере). */
function skLinkItems(records) {
    var seen = {};
    var out = [];
    (records || []).forEach(function (r) {
        KINDS.forEach(function (kind) {
            var text = skRecordText(kind, r);
            var key = skLinkKey(text);
            if (!key || seen[kind + '|' + key]) return;
            seen[kind + '|' + key] = true;
            var it = { kind: kind, text: text };
            if (kind === 'contractor') { it.contractor_canonical_key = r.contractor_canonical_key || ''; it.contractor_name = r.contractor_name || ''; }
            if (kind === 'place') {
                it.project_raw_name = r.project_raw_name || ''; it.project_block = r.project_block || '';
                it.project_floor = r.project_floor || ''; it.project_canonical_key = r.project_canonical_key || '';
                it.project_display_name = r.project_display_name || '';
            }
            out.push(it);
        });
    });
    return out;
}

/** Ответ шага сопоставления → id записям файла (сервер поставит те же при отправке) и сводка «узнано / новых» по видам. */
function skApplyRegister(records, results) {
    var map = {};
    var summary = { contractor: { known: 0, fresh: 0 }, category: { known: 0, fresh: 0 }, place: { known: 0, fresh: 0 } };
    (results || []).forEach(function (x) {
        var key = skLinkKey(x && x.text);
        if (!key || !summary[x.kind]) return;
        map[x.kind + '|' + key] = x.target || null;
        if (x.target) summary[x.kind].known++; else summary[x.kind].fresh++;
    });
    (records || []).forEach(function (r) {
        KINDS.forEach(function (kind) {
            var key = skLinkKey(skRecordText(kind, r));
            if (key && Object.prototype.hasOwnProperty.call(map, kind + '|' + key)) r[ID_FIELD[kind]] = map[kind + '|' + key];
        });
    });
    summary.fresh = summary.contractor.fresh + summary.category.fresh + summary.place.fresh;
    return summary;
}

var FIRM_FORMS = { ооо: 1, оао: 1, ао: 1, зао: 1, пао: 1, нао: 1, ип: 1, ск: 1, гк: 1, ук: 1, llc: 1, ltd: 1 };

/** Слова названия без кавычек и знаков (для фирм — и без формы собственности «ООО», «ИП» …). */
function _words(text, firm) {
    return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim().split(' ')
        .filter(function (w) { return w && !(firm && FIRM_FORMS[w]); });
}

/**
 * До n похожих записей ядра для текста. Сходство — sk_similarity импорта (передаётся параметром), по трём написаниям:
 * как есть, слова по алфавиту («Ромашка ООО» = «ООО Ромашка»), последняя часть пути места; одно содержит другое — похоже.
 */
function skSuggest(text, list, similarity, n, firm) {
    var a = _words(text, firm);
    var aj = a.join(' '); var as = a.slice().sort().join(' ');
    return (list || []).map(function (x) {
        var nm = String(x.name || '');
        var score = 0;
        [nm, nm.split(' / ').pop()].forEach(function (v) {
            var b = _words(v, firm); var bj = b.join(' ');
            if (!aj || !bj) return;
            score = Math.max(score, similarity(aj, bj), similarity(as, b.slice().sort().join(' ')));
            if (Math.min(aj.length, bj.length) >= 3 && (aj.indexOf(bj) >= 0 || bj.indexOf(aj) >= 0)) score = Math.max(score, 0.9);
        });
        return { item: x, score: score };
    }).filter(function (x) { return x.score >= 0.45; })
      .sort(function (p, q) { return q.score - p.score || String(p.item.name).localeCompare(String(q.item.name), 'ru'); })
      .slice(0, n || 3).map(function (x) { return x.item; });
}

/** Справочники подписей: id → запись. */
function skChoiceMaps(ch) {
    var m = { cp: {}, wt: {}, pl: {} };
    ((ch && ch.counterparties) || []).forEach(function (x) { m.cp[x.id] = x; });
    ((ch && ch.work_types) || []).forEach(function (x) { m.wt[x.id] = x; });
    ((ch && ch.places) || []).forEach(function (x) { m.pl[x.id] = x; });
    return m;
}

/**
 * Копия замечания для Аналитики: подрядчик, вид работ, место — по id «Компании» (два написания фирмы → один подрядчик);
 * без соответствия — прежний текст с пометкой «не разобрано» (категория — прежний текст: по нему считаются объёмы ИСД).
 * Хранимые поля не трогаются — меняется только копия.
 */
function skCoreView(r, maps) {
    if (!r || !maps) return r;
    var v = Object.assign({}, r);
    var nr = _t('quality.sk.links.unresolved', 'не разобрано');
    var cp = r.core_counterparty_id && maps.cp[r.core_counterparty_id];
    if (cp) v.contractor = cp.name;
    else if (!r.core_counterparty_id && skRecordText('contractor', r)) v.contractor = (r.contractor || skRecordText('contractor', r)) + ' · ' + nr;
    var wt = r.core_work_type_id && maps.wt[r.core_work_type_id];
    if (wt) { v.category = wt.name; v.category_corrected = false; }
    var pl = r.core_location_id && maps.pl[r.core_location_id];
    if (pl) {
        var parts = String(pl.name || '').split(' / ');
        if (pl.type === 'floor') {
            var m = String(parts[parts.length - 1]).match(/(-?\d+)(\s+[^\d]*)?$/);
            v.floor = m ? m[1] : parts[parts.length - 1];
            v.block = parts.slice(0, -1).join(' · ');
        } else {
            v.block = parts.join(' · ');
            v.floor = '';
        }
    } else if (!r.core_location_id && skRecordText('place', r) && r.block) {
        v.block = r.block + ' · ' + nr;
    }
    return v;
}

/** Замечание в выбранном месте или ниже (секция → все её этажи). */
function skPlaceMatches(r, placeId, maps) {
    if (!placeId) return true;
    var id = r && r.core_location_id;
    var guard = 0;
    while (id && guard++ < 10) {
        if (id === placeId) return true;
        id = maps.pl[id] ? maps.pl[id].parent : null;
    }
    return false;
}

// =========================================================================
// Сервер (функции quality.* 056 через клиент Качества)
// =========================================================================

function _client() { return window.supabaseClient || null; }
function _project() { return String((window.syncConfig && window.syncConfig.projectCode) || ''); }
function _company() { return (window.RBI && window.RBI.qualitySync && window.RBI.qualitySync.companyId) || ''; }

function _rpc(fn, args, ms) {
    var c = _client();
    if (!c || !_project() || _project() === 'LOCAL') return Promise.reject(new Error('offline'));
    var call = Promise.resolve(c.rpc(fn, args)).then(function (r) {
        if (r && r.error) throw r.error;
        return r ? r.data : null;
    });
    if (!ms) return call;
    return Promise.race([call, new Promise(function (_res, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]);
}

function _errText(e) {
    var m = (e && (e.message || e.details)) || String(e || '');
    return m === 'offline' || m === 'timeout' || /fetch|network/i.test(m) ? _t('quality.sk.links.offline', 'Нет связи с сервером — сопоставление позже, в «Разобрать»') : m;
}

/** Записи «Компании» для выбора и подписей; без связи — копия последнего ответа. */
async function skLoadChoices(force) {
    var p = _project();
    var key = CHOICES_KEY + _company() + ':' + p;
    if (!force && _choices && _choicesProject === p) return _choices;
    try {
        _choices = await _rpc('sk_core_choices', { p_project: p }, 15000);
        _choicesProject = p;
        try { localStorage.setItem(key, JSON.stringify(_choices)); } catch (e) {}
    } catch (e) {
        try { _choices = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e2) { _choices = null; }
        _choicesProject = p;
    }
    return _choices;
}

function skCachedMaps() {
    if (!_choices || _choicesProject !== _project()) {
        try { _choices = JSON.parse(localStorage.getItem(CHOICES_KEY + _company() + ':' + _project()) || 'null'); } catch (e) { _choices = null; }
        _choicesProject = _project();
    }
    return _choices ? skChoiceMaps(_choices) : null;
}

/** Записи для Аналитики: копии с подписями по id и фильтром по месту (window.skPlaceFilter; opts.noPlace — без него). */
function skAnalyticRecords(records, opts) {
    var maps = skCachedMaps();
    var arr = Array.isArray(records) ? records : [];
    if (!maps) return arr.slice();
    var place = opts && opts.noPlace ? '' : window.skPlaceFilter || '';
    var out = [];
    for (var i = 0; i < arr.length; i++) {
        if (place && !skPlaceMatches(arr[i], place, maps)) continue;
        out.push(skCoreView(arr[i], maps));
    }
    return out;
}

/** Фильтр Аналитики по месту (корпус, секция, этаж — со всеми местами ниже). */
function sk_setPlaceFilter(id) {
    window.skPlaceFilter = id || '';
    var desk = document.getElementById('sub-sk');
    if (desk && desk.classList.contains('ana-desk-sk') && typeof window.__anaDeskPaintSk === 'function') window.__anaDeskPaintSk();
    else if (typeof window.sk_renderDashboard === 'function') window.sk_renderDashboard();
}

/** Выбор места для фильтра Аналитики — места, где есть замечания (и их родители). */
function skPlaceFilterHtml(records, attr) {
    var maps = skCachedMaps();
    if (!maps) return '';
    var used = {};
    (records || []).forEach(function (r) {
        var id = r.core_location_id; var guard = 0;
        while (id && guard++ < 10) { used[id] = true; id = maps.pl[id] ? maps.pl[id].parent : null; }
    });
    var opts = ((_choices && _choices.places) || []).filter(function (x) { return used[x.id]; });
    if (!opts.length) return '';
    var cur = window.skPlaceFilter || '';
    return '<label class="flex items-center gap-2 text-rbi-caption font-bold text-muted mb-3">'
        + _esc(_t('quality.sk.links.place_filter', 'Место:'))
        + ' <select ' + attr + ' class="input-base text-rbi-caption flex-1 min-w-0 max-w-full">'
        + '<option value="">' + _esc(_t('quality.sk.links.place_all', 'Все места')) + '</option>'
        + opts.map(function (x) { return '<option value="' + _esc(x.id) + '"' + (x.id === cur ? ' selected' : '') + '>' + _esc(x.name) + '</option>'; }).join('')
        + '</select></label>';
}

/**
 * Шаг сопоставления при загрузке Excel: известное подставляется в записи файла, новое заводится в «Разобрать».
 * Без связи / без права — пропуск (сервер поставит id при отправке, новое попадёт в «Разобрать»).
 */
async function skRegisterImport(records) {
    var items = skLinkItems(records);
    if (!items.length) return null;
    try {
        var res = await _rpc('sk_links_register', { p_project: _project(), p_items: items }, 20000);
        var summary = skApplyRegister(records, res);
        skLoadChoices(true).catch(function () {});
        return summary;
    } catch (e) {
        console.warn('[ПК СК] Шаг сопоставления пропущен:', e && e.message);
        return { error: _errText(e) };
    }
}

function skPendingCount() { return _pendingCount; }

function _setBadge(n) {
    _pendingCount = n;
    document.querySelectorAll('[data-sk-links-count]').forEach(function (el) {
        el.textContent = n ? String(n) : '';
        el.classList.toggle('hidden', !n);
    });
}

/** Счётчик «Разобрать» на подвкладке (тихо; без связи — прежний). */
async function skRefreshLinksCount() {
    try {
        var res = await _rpc('sk_links_list', { p_project: _project(), p_all: false }, 15000);
        _setBadge(((res && res.items) || []).length);
    } catch (e) { /* без связи — счётчик прежний */ }
    return _pendingCount;
}

// =========================================================================
// «Разобрать»
// =========================================================================

var KIND_TITLE = {
    contractor: ['quality.sk.links.kind.contractor', 'Фирмы → контрагенты «Компании»'],
    category: ['quality.sk.links.kind.category', 'Категории → виды работ «Компании»'],
    place: ['quality.sk.links.kind.place', 'Места → места «Компании» (до этажа)']
};

function _listOf(kind, ch) {
    if (!ch) return [];
    return kind === 'contractor' ? ch.counterparties || [] : kind === 'category' ? ch.work_types || [] : ch.places || [];
}

function _itemHtml(it, idx, ch, rights) {
    var list = _listOf(it.kind, ch);
    var sim = typeof window.sk_similarity === 'function' ? window.sk_similarity : function () { return 0; };
    var sugg = skSuggest(it.text, list, sim, 3, it.kind === 'contractor');
    var canEdit = it.kind === 'contractor' ? rights.can_edit_contractor : rights.can_edit;
    var html = '<div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 mb-2" data-sk-link-item="' + idx + '">'
        + '<div class="flex items-start justify-between gap-2 mb-2">'
        + '<div class="min-w-0"><div class="text-rbi-label font-black text-ink dark:text-white break-words">' + _esc(it.text) + '</div>'
        + '<div class="text-rbi-caption text-muted font-bold">' + _esc(_t('quality.sk.links.records', 'замечаний: {n}', { n: it.records })) + '</div></div>'
        + '</div>';
    if (!canEdit) return html + '<div class="text-rbi-caption text-muted">' + _esc(_t('quality.sk.links.view_only', 'Сопоставляет инженер с правом «Внешний СК: загрузка»')) + '</div></div>';
    if (sugg.length) {
        html += '<div class="text-rbi-caption font-bold text-muted uppercase mb-1">' + _esc(_t('quality.sk.links.similar', 'Похожие в «Компании»:')) + '</div>'
            + '<div class="flex flex-wrap gap-1.5 mb-2">'
            + sugg.map(function (x) {
                return '<button type="button" class="min-h-[40px] px-3 py-2 rounded-lg border border-brand-soft bg-brand-soft text-brand text-rbi-caption font-bold text-left active:scale-95"'
                    + ' data-sk-link-pick="' + idx + '" data-sk-link-target="' + _esc(x.id) + '">' + _esc(x.name) + '</button>';
            }).join('') + '</div>';
    } else {
        html += '<div class="text-rbi-caption text-muted mb-2">' + _esc(_t('quality.sk.links.no_similar', 'Похожих нет — выберите из списка')) + '</div>';
    }
    html += '<div class="flex flex-wrap sm:flex-nowrap gap-1.5">'
        + '<select class="input-base text-rbi-caption flex-1 min-w-0 min-h-[40px]" data-sk-link-select="' + idx + '">'
        + '<option value="">' + _esc(_t('quality.sk.links.choose', 'Другая запись «Компании»…')) + '</option>'
        + list.map(function (x) { return '<option value="' + _esc(x.id) + '">' + _esc(x.name) + '</option>'; }).join('')
        + '</select>'
        + '<button type="button" class="min-h-[40px] px-4 rounded-lg bg-brand text-white text-rbi-caption font-bold uppercase active:scale-95" data-sk-link-apply="' + idx + '">'
        + _esc(_t('quality.sk.links.apply', 'Сопоставить')) + '</button></div>';
    if (it.kind === 'contractor' && rights.can_create_counterparty) {
        if (_createFor === it.text) {
            html += '<div class="mt-2 p-2 rounded-lg border border-[var(--card-border)] bg-surface">'
                + '<div class="text-rbi-caption font-bold text-muted mb-1">' + _esc(_t('quality.sk.links.create_title', 'Новый контрагент «Компании»')) + '</div>'
                + '<div class="flex flex-wrap gap-1.5">'
                + '<input type="text" class="input-base text-rbi-caption flex-1 min-w-[160px] min-h-[40px]" data-sk-cp-name value="' + _esc(it.text) + '">'
                + '<input type="text" inputmode="numeric" class="input-base text-rbi-caption w-36 min-h-[40px]" data-sk-cp-inn placeholder="' + _esc(_t('quality.sk.links.inn', 'ИНН')) + '">'
                + '<button type="button" class="min-h-[40px] px-3 rounded-lg bg-brand text-white text-rbi-caption font-bold uppercase" data-sk-cp-save="' + idx + '">'
                + _esc(_t('quality.sk.links.create_save', 'Создать и сопоставить')) + '</button></div></div>';
        } else {
            html += '<button type="button" class="mt-2 text-rbi-caption font-bold text-brand underline min-h-[32px]" data-sk-cp-open="' + idx + '">'
                + _esc(_t('quality.sk.links.create', '+ Создать контрагента')) + '</button>';
        }
    }
    return html + '</div>';
}

function _undoHtml() {
    if (!_undo) return '';
    return '<div class="flex flex-wrap items-center justify-between gap-2 p-3 mb-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">'
        + '<div class="text-rbi-caption font-bold text-green-800 dark:text-green-300 min-w-0 break-words">'
        + _esc(_t('quality.sk.links.done', '«{text}» → {target}: замечаний {n}', { text: _undo.text, target: _undo.label, n: _undo.records })) + '</div>'
        + '<button type="button" class="min-h-[40px] px-4 rounded-lg border border-green-300 bg-white dark:bg-transparent text-green-800 dark:text-green-300 text-rbi-caption font-bold uppercase" data-sk-link-undo>'
        + _esc(_t('quality.sk.links.undo', 'Отменить')) + '</button></div>';
}

var _state = { items: [], rights: {}, container: null };

/** Вид «Разобрать»: тексты без записи «Компании», по видам; выбор применяется ко всем замечаниям проекта с этим текстом. */
async function sk_renderLinks(container, force) {
    var box = container || document.getElementById('sk-view-links');
    if (!box) return;
    // повторный вызов (синхронизация перерисовывает раздел) — список на месте до ответа сервера, ввод человека не сбрасывается
    var again = box === _state.container && box.__skLinksPainted;
    _state.container = box;
    if (!again) box.innerHTML = '<div class="text-center py-6 text-muted text-rbi-caption font-bold uppercase">' + _esc(_t('quality.sk.links.loading', 'Загружаем «Разобрать»…')) + '</div>';
    var res;
    try {
        var both = await Promise.all([_rpc('sk_links_list', { p_project: _project(), p_all: false }, 20000), skLoadChoices(true)]);
        res = both[0];
    } catch (e) {
        box.innerHTML = '<div class="text-center py-6 text-muted text-rbi-caption font-bold">' + _esc(_errText(e)) + '</div>';
        return;
    }
    var items = (res && res.items) || [];
    _setBadge(items.length);
    if (again && !force && (_createFor || box.contains(document.activeElement))) return;   // человек вводит — не мешать (своё действие — force)
    var keep = again ? _picked(box) : null;
    _state.items = items;
    _state.rights = res || {};
    _paint();
    if (keep) Object.keys(keep).forEach(function (text) {
        var i = _state.items.findIndex(function (it) { return it.text === text; });
        var sel = i >= 0 && box.querySelector('[data-sk-link-select="' + i + '"]');
        if (sel) sel.value = keep[text];
    });
}

/** Выбранное в списках «Другая запись…» — по тексту (перерисовка не сбрасывает выбор). */
function _picked(box) {
    var out = {};
    box.querySelectorAll('[data-sk-link-select]').forEach(function (sel) {
        var it = _state.items[+sel.getAttribute('data-sk-link-select')];
        if (it && sel.value) out[it.text] = sel.value;
    });
    return out;
}

function _paint() {
    var box = _state.container;
    if (!box) return;
    var items = _state.items;
    var html = _undoHtml()
        + '<div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 mb-3">'
        + '<div class="text-rbi-body font-bold uppercase text-ink dark:text-white">' + _esc(_t('quality.sk.links.title', 'Разобрать')) + '</div>'
        + '<div class="text-rbi-caption text-muted font-bold mt-1 leading-snug">'
        + _esc(_t('quality.sk.links.hint', 'Тексты из выгрузки, которых нет в «Компании». Выберите запись один раз — она применится ко всем замечаниям с этим текстом и к следующим загрузкам.'))
        + '</div></div>';
    if (!items.length) {
        html += '<div class="text-center py-6 text-muted text-rbi-caption font-bold uppercase border border-dashed border-[var(--card-border)] rounded-xl">'
            + _esc(_t('quality.sk.links.empty', 'Всё разобрано')) + '</div>';
    } else {
        KINDS.forEach(function (kind) {
            var group = items.map(function (it, i) { return { it: it, i: i }; }).filter(function (x) { return x.it.kind === kind; });
            if (!group.length) return;
            html += '<div class="text-rbi-caption font-black uppercase text-muted mt-3 mb-1.5">' + _esc(_t(KIND_TITLE[kind][0], KIND_TITLE[kind][1])) + ' · ' + group.length + '</div>'
                + group.map(function (x) { return _itemHtml(x.it, x.i, _choices, _state.rights); }).join('');
        });
    }
    box.innerHTML = html;
    box.__skLinksPainted = true;
    if (!box.__skLinksBound) { box.__skLinksBound = true; box.addEventListener('click', _onClick); }
}

function _labelOf(kind, id) {
    var x = _listOf(kind, _choices).find(function (y) { return y.id === id; });
    return x ? x.name : '';
}

async function _set(it, target, isUndo) {
    var toast = typeof window.showToast === 'function' ? window.showToast : function () {};
    try {
        var res = await _rpc('sk_link_set', { p_project: _project(), p_kind: it.kind, p_text: it.text, p_target: target || null }, 20000);
        _undo = isUndo ? null : { kind: it.kind, text: it.text, previous: res.previous || null, label: _labelOf(it.kind, target), records: res.records };
        _patchLocal(it.kind, it.text, res.target || null);
        if (isUndo) toast(_t('quality.sk.links.undone', 'Выбор отменён'));
        await sk_renderLinks(_state.container, true);
        if (typeof window.triggerSync === 'function') setTimeout(function () { window.triggerSync('silent'); }, 300);
        else if (window.RBI && window.RBI.services && window.RBI.services.sync) setTimeout(function () { window.RBI.services.sync.trigger('silent'); }, 300);
    } catch (e) {
        toast('❌ ' + _errText(e));
    }
}

/** Сразу на экране: id замечаниям с этим текстом (сервер уже поставил те же; устройство подтянет при синхронизации). */
function _patchLocal(kind, text, target) {
    var key = skLinkKey(text);
    (window.skRecords || []).forEach(function (r) {
        if (skLinkKey(skRecordText(kind, r)) === key) r[ID_FIELD[kind]] = target;
    });
}

function _onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var b;
    if ((b = t.closest('[data-sk-link-pick]'))) {
        _set(_state.items[+b.getAttribute('data-sk-link-pick')], b.getAttribute('data-sk-link-target'));
    } else if ((b = t.closest('[data-sk-link-apply]'))) {
        var idx = +b.getAttribute('data-sk-link-apply');
        var sel = _state.container.querySelector('[data-sk-link-select="' + idx + '"]');
        if (!sel || !sel.value) { if (typeof window.showToast === 'function') window.showToast(_t('quality.sk.links.choose_first', 'Выберите запись «Компании»')); return; }
        _set(_state.items[idx], sel.value);
    } else if ((b = t.closest('[data-sk-link-undo]'))) {
        if (_undo) _set({ kind: _undo.kind, text: _undo.text }, _undo.previous, true);
    } else if ((b = t.closest('[data-sk-cp-open]'))) {
        _createFor = _state.items[+b.getAttribute('data-sk-cp-open')].text;
        _paint();
    } else if ((b = t.closest('[data-sk-cp-save]'))) {
        _createCounterparty(_state.items[+b.getAttribute('data-sk-cp-save')]);
    }
}

/** «Создать контрагента» — функция «Компании» (право core.counterparties.manage проверяет сервер), затем — выбор. */
async function _createCounterparty(it) {
    var toast = typeof window.showToast === 'function' ? window.showToast : function () {};
    var box = _state.container;
    var name = ((box.querySelector('[data-sk-cp-name]') || {}).value || '').trim();
    var inn = ((box.querySelector('[data-sk-cp-inn]') || {}).value || '').replace(/\s/g, '');
    var c = _client();
    if (!c || !_company()) { toast('❌ ' + _errText(new Error('offline'))); return; }
    try {
        var pub = typeof c.schema === 'function' ? c.schema('public') : c;
        var r = await pub.rpc('pf_counterparties_save', { p_company: _company(), p_id: null, p_name: name, p_inn: inn, p_kpp: null,
            p_kinds: ['contractor'], p_requisites: {} });
        if (r && r.error) throw r.error;
        _createFor = '';
        await skLoadChoices(true);
        await _set(it, r.data);
    } catch (e) {
        toast('❌ ' + _errText(e));
    }
}

/** Итог шага сопоставления после загрузки: сколько узнано и сколько ушло в «Разобрать». */
function sk_showLinksSummary(summary) {
    if (!summary) return;
    var toast = typeof window.showToast === 'function' ? window.showToast : function () {};
    if (summary.error) { toast('⚠️ ' + summary.error); return; }
    if (!summary.fresh) { toast(_t('quality.sk.links.all_known', '✅ Фирмы, категории и места узнаны в «Компании»')); return; }
    var modal = document.getElementById('modal-overlay');
    if (!modal) return;
    var row = function (kind, label) {
        var s = summary[kind];
        return '<div class="flex justify-between gap-2 py-1.5 border-b border-[var(--card-border)] text-rbi-caption font-bold">'
            + '<span class="text-muted">' + _esc(label) + '</span><span>'
            + _esc(_t('quality.sk.links.summary_row', 'узнано {known} · новых {fresh}', { known: s.known, fresh: s.fresh })) + '</span></div>';
    };
    document.getElementById('modal-icon').innerHTML = '<div class="w-12 h-12 bg-brand-soft text-brand rounded-xl flex items-center justify-center text-2xl mx-auto mb-2 border border-brand-soft">🔗</div>';
    document.getElementById('modal-title').innerHTML = '<div class="text-center font-black uppercase text-lg">' + _esc(_t('quality.sk.links.summary_title', 'Сопоставление с «Компанией»')) + '</div>';
    document.getElementById('modal-body').innerHTML = ''
        + '<div class="text-center text-rbi-caption text-muted mb-3 leading-relaxed">'
        + _esc(_t('quality.sk.links.summary_hint', 'Известное подставлено само. Новое — в «Разобрать»: выберите запись «Компании» один раз.')) + '</div>'
        + row('contractor', _t('quality.sk.links.sum.contractor', 'Фирмы'))
        + row('category', _t('quality.sk.links.sum.category', 'Категории'))
        + row('place', _t('quality.sk.links.sum.place', 'Места'))
        + '<div class="flex gap-2 mt-4">'
        + '<button type="button" onclick="closeModal()" class="flex-1 min-h-[44px] bg-surface text-muted rounded-lg text-rbi-caption font-bold uppercase border border-[var(--card-border)]">'
        + _esc(_t('quality.sk.links.later', 'Позже')) + '</button>'
        + '<button type="button" onclick="closeModal(); sk_switchView(\'links\')" class="flex-1 min-h-[44px] bg-brand text-white rounded-lg text-rbi-caption font-bold uppercase">'
        + _esc(_t('quality.sk.links.open', 'Разобрать сейчас')) + '</button></div>';
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
}

export {
    skLinkKey,
    skRecordText,
    skLinkItems,
    skApplyRegister,
    skSuggest,
    skChoiceMaps,
    skCoreView,
    skPlaceMatches,
    skLoadChoices,
    skCachedMaps,
    skAnalyticRecords,
    skPlaceFilterHtml,
    skRegisterImport,
    skRefreshLinksCount,
    skPendingCount,
    sk_setPlaceFilter,
    sk_renderLinks,
    sk_showLinksSummary
};
