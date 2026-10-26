/**
 * reports.pptx-export.js
 * Профессиональный PPTX-экспорт отчётов (третья кнопка FAB).
 * Библиотека PptxGenJS — напрямую; PDF-пайплайн не затрагивается.
 */

import { reportKindFromTitle } from './report-kind.js';

const root = typeof globalThis !== 'undefined' ? globalThis : window;

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const COLOR = {
    text: '0f172a',
    muted: '64748b',
    indigo: '4338ca',
    indigoSoft: 'eef2ff',
    header: 'e2e8f0',
    border: 'cbd5e1',
    card: 'f8fafc',
    white: 'ffffff',
    red: 'dc2626',
    redSoft: 'fef2f2',
    green: '15803d',
    greenSoft: 'f0fdf4',
    orange: 'c2410c',
    orangeSoft: 'fff7ed',
    amber: 'd97706',
    slate: '334155'
};

/** Δ к предыдущему периоду (как в OP2 PDF). inverse=true: рост = плохо (ИКО). */
function _deltaMeta(curr, prev, inverse) {
    if (prev === undefined || prev === null || prev === '' || Number.isNaN(Number(prev))) {
        return { text: 'нет базы', color: COLOR.muted, arrow: '' };
    }
    var diff = Number(curr) - Number(prev);
    if (!Number.isFinite(diff)) return { text: 'нет базы', color: COLOR.muted, arrow: '' };
    var abs = Math.abs(diff);
    var round = abs >= 10 ? Math.round(abs) : (abs >= 1 ? Math.round(abs * 10) / 10 : Math.round(abs * 100) / 100);
    if (round === 0) return { text: '▬ 0', color: COLOR.muted, arrow: '' };
    var good = inverse ? (diff < 0) : (diff > 0);
    return {
        text: (diff > 0 ? '▲' : '▼') + String(round),
        color: good ? COLOR.green : COLOR.red,
        arrow: diff > 0 ? '▲' : '▼'
    };
}

function _allInspectionsForTrend() {
    try {
        if (root.RBI && root.RBI.services && root.RBI.services.inspections
            && typeof root.RBI.services.inspections.getAllForAnalyticsSync === 'function') {
            return root.RBI.services.inspections.getAllForAnalyticsSync() || [];
        }
    } catch (_) { /* ignore */ }
    return Array.isArray(root.contractorArray) ? root.contractorArray : [];
}

function _prevPeriodSlice(currData) {
    var all = _allInspectionsForTrend();
    var sel = 'D30';
    try {
        var el = document.getElementById('global-filter-period');
        if (el && el.value) sel = el.value;
    } catch (_) { /* ignore */ }
    var now = new Date();
    if (typeof root.getAnalyticsPrevPeriodBounds === 'function') {
        var bounds = root.getAnalyticsPrevPeriodBounds(sel, now);
        if (bounds && bounds.startPrev && bounds.endPrev) {
            var prevData = (all || []).filter(function (i) {
                var d = new Date(i.date);
                return d >= bounds.startPrev && d < bounds.endPrev;
            });
            return { prevData: prevData, trendLabel: bounds.trendLabel || 'к пред. периоду' };
        }
    }
    var sorted = (currData || []).slice().sort(function (a, b) {
        return new Date(a.date) - new Date(b.date);
    });
    return {
        prevData: sorted.slice(0, Math.floor(sorted.length / 2)),
        trendLabel: 'к 1-й пол.'
    };
}

function _avgFromChecks(checks) {
    var grouped = {};
    (checks || []).forEach(function (item) {
        var k = _groupKey(item);
        (grouped[k] = grouped[k] || []).push(item);
    });
    var sumUrk = 0, urkN = 0, contr = 0;
    Object.keys(grouped).forEach(function (name) {
        var m = _metrics(grouped[name]);
        if (!m) return;
        contr++;
        if (m.count >= 7) { sumUrk += m.baseUrkContrPerc; urkN++; }
        else { sumUrk += m.baseUrkContrPerc; urkN++; }
    });
    return {
        avgUrk: urkN > 0 ? Math.round(sumUrk / urkN) : 0,
        contrCount: contr,
        checks: (checks || []).length
    };
}

function _toast(msg) {
    if (typeof root.showToast === 'function') root.showToast(msg);
    else console.warn('[pptx]', msg);
}

function _pptxCtor() {
    if (typeof root.PptxGenJS === 'function') return root.PptxGenJS;
    if (typeof root.pptxgenjs === 'function') return root.pptxgenjs;
    return null;
}

function _templates() {
    return root.RBI && root.RBI.services && root.RBI.services.templates
        ? root.RBI.services.templates
        : {
            getUserTemplates: () => (root.userTemplates || {}),
            getSystemTemplates: () => (root.SYSTEM_TEMPLATES || {})
        };
}

function _userTemplates() {
    try { return _templates().getUserTemplates() || {}; } catch (_) { return {}; }
}

function _groupKey(item) {
    if (typeof root.trendContractorKey === 'function') return root.trendContractorKey(item);
    return (item.contractorName || 'Неизвестно') + ' [' + (item.project_display_name || item.projectName || 'Без объекта') + ']';
}

function _projectKey(item) {
    return item.project_display_name || item.projectName || item.project_name || 'Без объекта';
}

function _periodText() {
    var el = document.getElementById('btn-ana-period-label');
    var t = el ? String(el.innerText || '').trim() : '';
    if (document.getElementById('global-filter-period')?.value === 'CUSTOM') {
        var dFrom = document.getElementById('filter-date-from')?.value;
        var dTo = document.getElementById('filter-date-to')?.value;
        if (dFrom || dTo) {
            var fmt = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '...';
            return 'с ' + fmt(dFrom) + ' по ' + fmt(dTo);
        }
    }
    return t || 'За 30 дней';
}

function _filterProjectLabel(data) {
    var filters = (root.activeMultiFilters && root.activeMultiFilters.analytics) || {};
    var projects = Array.isArray(filters.project) ? filters.project.filter(Boolean) : [];
    if (projects.length === 1) return String(projects[0]);
    if (projects.length > 1) return projects.length + ' объектов';
    if (data && data.length) {
        var set = new Set(data.map(_projectKey));
        if (set.size === 1) return [...set][0];
        if (set.size > 1) return set.size + ' объектов';
    }
    return 'фильтр';
}

function _author() {
    try {
        if (root.RBI && root.RBI.services && root.RBI.services.settings) {
            return root.RBI.services.settings.get('engineerName') || 'Инженер';
        }
    } catch (_) { /* ignore */ }
    return 'Инженер';
}

function _safeFile(s) {
    return String(s || 'report')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 80) || 'report';
}

function _metrics(cData) {
    if (typeof root.getContractorMetrics === 'function') {
        return root.getContractorMetrics(cData, _userTemplates());
    }
    return null;
}

function _iko(data) {
    if (typeof root.getObjectIntegralMetrics === 'function') {
        return root.getObjectIntegralMetrics(data, _userTemplates());
    }
    return null;
}

function _withTimeout(promise, ms) {
    return new Promise(function (resolve) {
        var done = false;
        var t = setTimeout(function () {
            if (done) return;
            done = true;
            resolve(null);
        }, ms);
        Promise.resolve(promise).then(function (v) {
            if (done) return;
            done = true;
            clearTimeout(t);
            resolve(v);
        }, function () {
            if (done) return;
            done = true;
            clearTimeout(t);
            resolve(null);
        });
    });
}

async function _thumb(photoRef) {
    if (!photoRef) return null;
    var pm = root.PhotoManager;
    if (!pm || typeof pm.getAsyncUrl !== 'function') return null;
    return _withTimeout((async function () {
        var url = await pm.getAsyncUrl(photoRef, { preferThumb: true });
        if (!url) return null;
        if (String(url).startsWith('data:image')) return url;
        var resp = await fetch(url);
        if (!resp || !resp.ok) return null;
        var blob = await resp.blob();
        if (!blob || !String(blob.type || '').startsWith('image/')) return null;
        return await new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result || null); };
            reader.onerror = function () { resolve(null); };
            reader.readAsDataURL(blob);
        });
    })(), 4000);
}

function _collectOp2Payload(data) {
    var mData = _iko(data) || { IKO: '0.00' };
    var grouped = {};
    data.forEach(function (item) {
        var k = _groupKey(item);
        (grouped[k] = grouped[k] || []).push(item);
    });
    var rating = [];
    var sumRel = 0, relN = 0, sumUrk = 0, urkN = 0, sumDoc = 0, docN = 0;
    var sumUrkAll = 0, urkAllN = 0, sumDocAll = 0, docAllN = 0;
    Object.keys(grouped).forEach(function (name) {
        var m = _metrics(grouped[name]);
        if (!m) return;
        rating.push({
            name: name,
            val: m.finalC,
            urk: m.baseUrkContrPerc,
            count: m.count,
            doc: m.documentaryC != null ? m.documentaryC : null,
            b3: m.n_изделий_с_B3 || 0,
            workType: (grouped[name][0] && (grouped[name][0].templateTitle || grouped[name][0].workTitle)) || '—'
        });
        sumUrkAll += m.baseUrkContrPerc; urkAllN++;
        if (m.documentaryC != null) { sumDocAll += m.documentaryC; docAllN++; }
        if (m.count >= 7) {
            sumRel += m.finalC; relN++;
            sumUrk += m.baseUrkContrPerc; urkN++;
            if (m.documentaryC != null) { sumDoc += m.documentaryC; docN++; }
        }
    });
    rating.sort(function (a, b) { return b.val - a.val; });
    var avgReliability = relN > 0 ? Math.round(sumRel / relN) : null;
    var currAvgUrk = urkN > 0 ? Math.round(sumUrk / urkN) : (urkAllN > 0 ? Math.round(sumUrkAll / urkAllN) : 0);
    var currAvgDoc = docN > 0 ? Math.round(sumDoc / docN) : (docAllN > 0 ? Math.round(sumDocAll / docAllN) : null);
    var redContrCount = rating.filter(function (r) { return r.count >= 7 && r.val < 70; }).length;
    var redContrPerc = relN > 0 ? Math.round((redContrCount / relN) * 100) : null;

    // Топ B3
    var b3Map = {};
    var flatFn = typeof root.getFlatList === 'function' ? root.getFlatList : null;
    var sysT = (typeof _templates().getSystemTemplates === 'function') ? _templates().getSystemTemplates() : (root.SYSTEM_TEMPLATES || {});
    var userT = _userTemplates();
    data.forEach(function (i) {
        if (!i.state || !i.templateKey) return;
        Object.keys(i.state).forEach(function (id) {
            var s = i.state[id];
            if (s !== 'fail' && s !== 'fail_escalated') return;
            var tType = i.templateKey.split('_')[0];
            var tKey = i.templateKey.replace(tType + '_', '');
            var cl = tType === 'sys' && sysT[tKey] ? sysT[tKey].groups
                : (userT[tKey] ? userT[tKey].groups : []);
            var found = flatFn ? flatFn(cl).find(function (x) { return x.id == id; }) : null;
            var isB3 = (s === 'fail_escalated') || (found && found.w === 3);
            if (!isB3) return;
            var defName = found ? found.n : 'Дефект';
            var photo = (i.photos && i.photos[id])
                ? (root.normalizeItemPhotos ? root.normalizeItemPhotos(i.photos[id])[0] : [].concat(i.photos[id])[0])
                : null;
            if (!b3Map[defName]) b3Map[defName] = { name: defName, count: 0, photo: null, contr: i.contractorName || '—' };
            b3Map[defName].count++;
            if (photo) b3Map[defName].photo = photo;
        });
    });
    var topB3 = Object.values(b3Map).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);

    var sumB3 = 0;
    data.forEach(function (i) {
        if (i.metrics) sumB3 += Number(i.metrics.n_B3_fail) || 0;
    });

    // SK mini (best-effort via sk service)
    var skStats = { total: 0, open: 0, closed: 0, overdue: 0 };
    try {
        var skSvc = root.RBI && root.RBI.services && root.RBI.services.sk;
        var skRecords = skSvc && typeof skSvc.getRecordsSync === 'function' ? (skSvc.getRecordsSync() || []) : (root.skRecords || []);
        var projSet = new Set(data.map(_projectKey));
        var filtered = skRecords.filter(function (r) {
            if (r && r._deleted) return false;
            var p = r.project_display_name || r.project || r.object_name || '';
            return !projSet.size || projSet.has(p) || projSet.size > 8;
        });
        skStats.total = filtered.length;
        filtered.forEach(function (r) {
            var open = !(r.date_resolved || r.status === 'closed' || r.is_closed);
            if (open) skStats.open++;
            else skStats.closed++;
            var dl = r.deadline ? new Date(r.deadline) : null;
            if (open && dl && !Number.isNaN(dl.getTime()) && dl < new Date()) skStats.overdue++;
        });
    } catch (_) { /* ignore */ }

    // Динамика к предыдущему окну (тот же расчёт, что OP2 PDF).
    var slice = _prevPeriodSlice(data);
    var prevAvg = _avgFromChecks(slice.prevData);
    var prevIko = null;
    if (slice.prevData && slice.prevData.length) {
        var pInt = _iko(slice.prevData);
        if (pInt && pInt.IKO != null) prevIko = pInt.IKO;
    }
    var currContrCount = Object.keys(grouped).length;
    var redZonePerc = (mData.redZonePerc != null) ? Number(mData.redZonePerc) : redContrPerc;

    return {
        checks: data.length,
        periodText: _periodText(),
        projectLabel: _filterProjectLabel(data),
        author: _author(),
        IKO: mData.IKO,
        ikoStatus: mData.ikoStatus || '',
        avgUrk: currAvgUrk,
        avgDoc: currAvgDoc,
        avgReliability: avgReliability,
        contractors: currContrCount,
        redContrCount: redContrCount,
        redContrPerc: redContrPerc,
        redZonePerc: redZonePerc,
        relN: relN,
        sumB3: sumB3,
        rating: rating,
        topB3: topB3,
        skStats: skStats,
        trendLabel: slice.trendLabel || 'к пред. периоду',
        prev: {
            avgUrk: prevAvg.avgUrk,
            IKO: prevIko,
            checks: prevAvg.checks,
            contractors: prevAvg.contrCount
        },
        delta: {
            urk: _deltaMeta(currAvgUrk, prevAvg.avgUrk, false),
            iko: _deltaMeta(mData.IKO, prevIko, true),
            checks: _deltaMeta(data.length, prevAvg.checks, false),
            contractors: _deltaMeta(currContrCount, prevAvg.contrCount, false)
        },
        auditRows: rating.slice(0, 20).map(function (r) {
            return {
                name: r.name,
                workType: r.workType,
                n: r.count,
                urk: r.urk,
                iurk: r.count >= 7 ? r.val : null,
                b3: r.b3
            };
        })
    };
}

function _addTitleSlide(pptx, title, subtitleLines) {
    var s = pptx.addSlide();
    s.addText(title, { x: 0.5, y: 1.4, w: 9, h: 0.7, fontSize: 26, bold: true, color: COLOR.text });
    (subtitleLines || []).forEach(function (line, idx) {
        s.addText(String(line), {
            x: 0.5, y: 2.3 + idx * 0.35, w: 9, h: 0.35,
            fontSize: 14, color: COLOR.muted
        });
    });
    return s;
}

function _addKpiSlide(pptx, payload, title) {
    var s = pptx.addSlide();
    s.addText(title || 'KPI', { x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 20, bold: true, color: COLOR.text });
    var redLabel = payload.relN > 0
        ? (payload.redContrCount + ' из ' + payload.relN + (payload.redContrPerc != null ? ' (' + payload.redContrPerc + '%)' : ''))
        : 'СБОР (нужен N≥7)';
    var rows = [
        [
            { text: 'Показатель', options: { bold: true, fill: { color: COLOR.header } } },
            { text: 'Значение', options: { bold: true, fill: { color: COLOR.header } } }
        ],
        ['ср. УрК (физика), %', String(payload.avgUrk) + '%'],
        ['ср. УрК (докум.), %', payload.avgDoc != null ? (payload.avgDoc + '%') : '—'],
        ['ср. надёжность (ИУрК), %', payload.avgReliability != null ? (payload.avgReliability + '%') : 'СБОР'],
        ['ИКО', String(payload.IKO)],
        ['Подрядчиков', String(payload.contractors)],
        ['Проверок', String(payload.checks)],
        ['ИУрК ниже 70% (N≥7)', redLabel],
        ['B3 (сумма)', String(payload.sumB3)]
    ];
    s.addTable(rows, {
        x: 0.5, y: 0.85, w: 9, colW: [5.5, 3.5],
        border: { pt: 0.5, color: COLOR.border },
        fontSize: 12, color: COLOR.text, valign: 'middle'
    });
}

function _addRatingChartSlides(pptx, rating) {
    var top = (rating || []).slice(0, 15);
    var s = pptx.addSlide();
    s.addText('Рейтинг подрядчиков (ИУрК)', { x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 20, bold: true, color: COLOR.text });
    if (!top.length) {
        s.addText('Недостаточно данных (N≥3)', { x: 0.5, y: 1.2, w: 9, h: 0.4, fontSize: 14, color: COLOR.muted });
        return;
    }
    var rows = [[
        { text: 'Подрядчик', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'УрК %', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'ИУрК %', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'N', options: { bold: true, fill: { color: COLOR.header } } }
    ]];
    top.forEach(function (r) {
        rows.push([
            r.name,
            String(r.urk != null ? r.urk : '—'),
            r.count >= 7 ? (String(r.val) + '%') : 'СБОР',
            String(r.count)
        ]);
    });
    s.addTable(rows, {
        x: 0.35, y: 0.8, w: 9.3, colW: [5.3, 1.3, 1.4, 1.3],
        border: { pt: 0.5, color: COLOR.border },
        fontSize: 10, color: COLOR.text, valign: 'middle'
    });

    var chartSrc = top.slice(0, 12);
    var s2 = pptx.addSlide();
    s2.addText('Сравнение ИУрК', { x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 20, bold: true, color: COLOR.text });
    s2.addChart(pptx.charts.BAR, [{
        name: 'ИУрК %',
        labels: chartSrc.map(function (r) {
            var n = String(r.name || '');
            return n.length > 26 ? n.slice(0, 25) + '…' : n;
        }),
        values: chartSrc.map(function (r) { return Number(r.count >= 7 ? r.val : r.urk) || 0; })
    }], {
        x: 0.35, y: 0.8, w: 9.3, h: 4.3,
        showTitle: false, showLegend: false, showValue: true,
        chartColors: [COLOR.indigo],
        valAxisMaxValue: 100, valAxisMinValue: 0
    });

    var s3 = pptx.addSlide();
    s3.addText('Сравнение УрК (физика)', { x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 20, bold: true, color: COLOR.text });
    s3.addChart(pptx.charts.BAR, [{
        name: 'УрК %',
        labels: chartSrc.map(function (r) {
            var n = String(r.name || '');
            return n.length > 26 ? n.slice(0, 25) + '…' : n;
        }),
        values: chartSrc.map(function (r) { return Number(r.urk) || 0; })
    }], {
        x: 0.35, y: 0.8, w: 9.3, h: 4.3,
        showTitle: false, showLegend: false, showValue: true,
        chartColors: [COLOR.green],
        valAxisMaxValue: 100, valAxisMinValue: 0
    });
}

function _addAuditSlide(pptx, auditRows) {
    var s = pptx.addSlide();
    s.addText('Таблица аудита (top)', { x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 20, bold: true, color: COLOR.text });
    var rows = [[
        { text: 'Подрядчик', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'Вид работ', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'N', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'УрК', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'ИУрК', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'B3', options: { bold: true, fill: { color: COLOR.header } } }
    ]];
    (auditRows || []).slice(0, 14).forEach(function (r) {
        rows.push([
            String(r.name || '').slice(0, 40),
            String(r.workType || '—').slice(0, 24),
            String(r.n),
            String(r.urk) + '%',
            r.iurk != null ? (r.iurk + '%') : 'СБОР',
            String(r.b3 || 0)
        ]);
    });
    s.addTable(rows, {
        x: 0.25, y: 0.75, w: 9.5, colW: [2.8, 2.2, 0.8, 1.1, 1.2, 0.8],
        border: { pt: 0.4, color: COLOR.border },
        fontSize: 9, color: COLOR.text, valign: 'middle'
    });
}

function _addSkSlide(pptx, sk) {
    var s = pptx.addSlide();
    s.addText('ПК СК (мини)', { x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 20, bold: true, color: COLOR.text });
    var rows = [
        [
            { text: 'Метрика', options: { bold: true, fill: { color: COLOR.header } } },
            { text: 'Значение', options: { bold: true, fill: { color: COLOR.header } } }
        ],
        ['Всего замечаний', String(sk.total || 0)],
        ['Открытых', String(sk.open || 0)],
        ['Закрытых', String(sk.closed || 0)],
        ['Просроченных открытых', String(sk.overdue || 0)]
    ];
    s.addTable(rows, {
        x: 0.5, y: 1.0, w: 9, colW: [5.5, 3.5],
        border: { pt: 0.5, color: COLOR.border },
        fontSize: 13, color: COLOR.text, valign: 'middle'
    });
}

async function _addTopB3Slide(pptx, topB3) {
    var s = pptx.addSlide();
    s.addText('Топ дефектов B3', { x: 0.4, y: 0.2, w: 9.2, h: 0.4, fontSize: 20, bold: true, color: COLOR.text });
    if (!topB3 || !topB3.length) {
        s.addText('Критических дефектов B3 не зафиксировано', { x: 0.5, y: 1.2, w: 9, h: 0.4, fontSize: 14, color: COLOR.muted });
        return;
    }
    var colW = 1.7, gap = 0.15, startX = 0.4;
    for (var i = 0; i < topB3.length; i++) {
        var d = topB3[i];
        var x = startX + i * (colW + gap);
        var thumb = await _thumb(d.photo);
        if (thumb) {
            try { s.addImage({ data: thumb, x: x, y: 0.75, w: colW, h: 1.45 }); }
            catch (_) { /* skip */ }
        } else {
            s.addShape(pptx.shapes.RECTANGLE, {
                x: x, y: 0.75, w: colW, h: 1.45,
                fill: { color: 'f1f5f9' }, line: { color: COLOR.border, pt: 0.5 }
            });
            s.addText('нет превью', { x: x, y: 1.3, w: colW, h: 0.3, fontSize: 9, color: COLOR.muted, align: 'center' });
        }
        s.addText(String(d.name || 'Дефект'), { x: x, y: 2.35, w: colW, h: 0.7, fontSize: 10, bold: true, color: COLOR.text, valign: 'top' });
        s.addText(String(d.count) + ' шт · ' + String(d.contr || ''), { x: x, y: 3.1, w: colW, h: 0.7, fontSize: 9, color: COLOR.muted, valign: 'top' });
    }
}

async function _downloadAndSave(pptx, title, project, period) {
    var fileName = _safeFile(title) + '_' + new Date().toISOString().slice(0, 10) + '.pptx';
    var blob = null;
    try {
        if (typeof pptx.write === 'function') {
            var out = await pptx.write({ outputType: 'blob' });
            blob = out instanceof Blob ? out : new Blob([out], { type: PPTX_MIME });
        }
    } catch (e) {
        console.warn('[pptx] write(blob) failed', e);
    }
    if (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
    } else if (typeof pptx.writeFile === 'function') {
        await pptx.writeFile({ fileName: fileName });
    } else {
        return _toast('Не удалось сформировать PPTX');
    }
    if (typeof root.saveReportToLocal === 'function' && blob) {
        try {
            await root.saveReportToLocal({
                type: 'pptx',
                mimeType: PPTX_MIME,
                docKind: reportKindFromTitle(title),
                title: title,
                blob: blob,
                project: project || '—',
                period: period || _periodText(),
                author: _author()
            }, '<div>PPTX: ' + String(title).replace(/</g, '') + '</div>');
            if (typeof root.renderReportsList === 'function') root.renderReportsList();
        } catch (e) {
            console.warn('[pptx] saveReportToLocal failed', e);
            _toast('PPTX скачан, но не удалось сохранить в Отчёты');
            return;
        }
    }
    _toast('PPTX сохранён: ' + fileName);
}

/**
 * One-Pager 2.0 → один executive-слайд 16:9 для руководства.
 * Источник цифр — тот же calc, что PDF OP2; акцент на KPI + Δ + инфографика.
 */
function _addOp2ExecutiveSlide(pptx, payload) {
    var W = 13.333;
    var H = 7.5;
    var s = pptx.addSlide();
    s.addShape(pptx.shapes.RECTANGLE, {
        x: 0, y: 0, w: W, h: H,
        fill: { color: 'f1f5f9' }, line: { color: 'f1f5f9' }
    });

    // —— Шапка ——
    s.addShape(pptx.shapes.RECTANGLE, {
        x: 0, y: 0, w: W, h: 0.72,
        fill: { color: COLOR.indigo }, line: { color: COLOR.indigo }
    });
    s.addText('ONE-PAGER 2.0  ·  СВОДКА ДЛЯ РУКОВОДСТВА', {
        x: 0.35, y: 0.14, w: 7.2, h: 0.22,
        fontSize: 9, bold: true, color: 'c7d2fe', margin: 0
    });
    s.addText(String(payload.projectLabel || 'Объект'), {
        x: 0.35, y: 0.34, w: 7.2, h: 0.28,
        fontSize: 16, bold: true, color: COLOR.white, margin: 0
    });
    s.addText([
        payload.periodText || 'Период',
        'Автор: ' + (payload.author || '—'),
        new Date().toLocaleDateString('ru-RU')
    ].join('  ·  '), {
        x: 7.6, y: 0.28, w: 5.3, h: 0.28,
        fontSize: 10, color: 'e0e7ff', align: 'right', margin: 0
    });

    // —— KPI-карточки с динамикой ——
    var ikoNum = parseFloat(payload.IKO);
    var ikoHot = Number.isFinite(ikoNum) && ikoNum >= 0.6;
    var d = payload.delta || {};
    var cards = [
        {
            label: 'УрК (физика)',
            value: String(payload.avgUrk) + '%',
            sub: payload.avgDoc != null ? ('док. ' + payload.avgDoc + '%') : 'докум. —',
            delta: d.urk, fill: COLOR.white, accent: COLOR.indigo
        },
        {
            label: 'Индекс риска ИКО',
            value: String(payload.IKO),
            sub: payload.ikoStatus || (ikoHot ? 'зона внимания' : 'под контролем'),
            delta: d.iko, fill: ikoHot ? COLOR.redSoft : COLOR.white, accent: ikoHot ? COLOR.red : COLOR.indigo
        },
        {
            label: 'Проверок',
            value: String(payload.checks),
            sub: 'объём контроля',
            delta: d.checks, fill: COLOR.white, accent: COLOR.indigo
        },
        {
            label: 'Подрядчиков',
            value: String(payload.contractors),
            sub: 'в срезе',
            delta: d.contractors, fill: COLOR.white, accent: COLOR.indigo
        },
        {
            label: 'Красная зона',
            value: payload.relN > 0
                ? (String(payload.redContrCount) + '/' + String(payload.relN))
                : 'СБОР',
            sub: payload.redContrPerc != null ? (payload.redContrPerc + '% с ИУрК<70%') : 'нужен N≥7',
            delta: null, fill: COLOR.redSoft, accent: COLOR.red
        }
    ];
    var cardW = 2.4;
    var gap = 0.12;
    var startX = 0.3;
    cards.forEach(function (c, i) {
        var x = startX + i * (cardW + gap);
        s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: x, y: 0.9, w: cardW, h: 1.35,
            fill: { color: c.fill },
            line: { color: COLOR.border, pt: 0.75 },
            rectRadius: 0.08
        });
        s.addShape(pptx.shapes.RECTANGLE, {
            x: x, y: 0.9, w: 0.08, h: 1.35,
            fill: { color: c.accent }, line: { color: c.accent }
        });
        s.addText(c.label, {
            x: x + 0.18, y: 0.98, w: cardW - 0.28, h: 0.22,
            fontSize: 9, bold: true, color: COLOR.muted, margin: 0
        });
        s.addText(c.value, {
            x: x + 0.18, y: 1.22, w: cardW - 0.9, h: 0.45,
            fontSize: 26, bold: true, color: COLOR.text, margin: 0
        });
        if (c.delta) {
            s.addText(c.delta.text, {
                x: x + cardW - 0.95, y: 1.3, w: 0.8, h: 0.28,
                fontSize: 11, bold: true, color: c.delta.color, align: 'right', margin: 0
            });
        }
        s.addText(c.sub, {
            x: x + 0.18, y: 1.85, w: cardW - 0.28, h: 0.28,
            fontSize: 9, color: COLOR.slate, margin: 0
        });
    });

    // Подпись периода сравнения
    s.addText('Динамика: ' + (payload.trendLabel || 'к пред. периоду'), {
        x: 0.3, y: 2.32, w: 6, h: 0.22,
        fontSize: 9, color: COLOR.muted, margin: 0
    });

    // —— Левая панель: рейтинг (bar chart) ——
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 0.3, y: 2.6, w: 7.7, h: 4.45,
        fill: { color: COLOR.white },
        line: { color: COLOR.border, pt: 0.75 },
        rectRadius: 0.08
    });
    s.addText('Рейтинг надёжности (ИУрК) — топ подрядчиков', {
        x: 0.5, y: 2.72, w: 7.3, h: 0.3,
        fontSize: 12, bold: true, color: COLOR.text, margin: 0
    });
    var chartSrc = (payload.rating || []).filter(function (r) { return r.count >= 3; }).slice(0, 10);
    if (!chartSrc.length) chartSrc = (payload.rating || []).slice(0, 10);
    if (chartSrc.length) {
        s.addChart(pptx.charts.BAR, [{
            name: 'ИУрК %',
            labels: chartSrc.map(function (r) {
                var n = String(r.name || '');
                return n.length > 28 ? n.slice(0, 27) + '…' : n;
            }),
            values: chartSrc.map(function (r) { return Number(r.val) || 0; })
        }], {
            x: 0.45, y: 3.05, w: 7.4, h: 3.75,
            showTitle: false, showLegend: false, showValue: true,
            chartColors: [COLOR.indigo],
            valAxisMaxValue: 100, valAxisMinValue: 0,
            chartDataBorder: { pt: 0 },
            chartArea: { fill: { color: COLOR.white } }
        });
    } else {
        s.addText('Недостаточно данных для рейтинга', {
            x: 0.6, y: 4.2, w: 7, h: 0.4,
            fontSize: 12, color: COLOR.muted
        });
    }

    // —— Правая панель: статус / B3 / СК ——
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 8.2, y: 2.6, w: 4.85, h: 4.45,
        fill: { color: COLOR.white },
        line: { color: COLOR.border, pt: 0.75 },
        rectRadius: 0.08
    });

    var statusFill = ikoHot || (payload.sumB3 > 0) ? COLOR.orangeSoft : COLOR.greenSoft;
    var statusBorder = ikoHot || (payload.sumB3 > 0) ? COLOR.amber : COLOR.green;
    var statusTitle = ikoHot || (payload.sumB3 > 0) ? 'ТРЕБУЕТ ВНИМАНИЯ' : 'ПОД КОНТРОЛЕМ';
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 8.4, y: 2.78, w: 4.45, h: 0.7,
        fill: { color: statusFill },
        line: { color: statusBorder, pt: 1 },
        rectRadius: 0.06
    });
    s.addText(statusTitle, {
        x: 8.55, y: 2.88, w: 4.15, h: 0.25,
        fontSize: 11, bold: true, color: statusBorder, align: 'center', margin: 0
    });
    s.addText(
        'ИКО ' + payload.IKO
        + (payload.avgReliability != null ? ('  ·  ср. ИУрК ' + payload.avgReliability + '%') : '  ·  ИУрК СБОР')
        + '  ·  B3 ' + payload.sumB3,
        {
            x: 8.55, y: 3.15, w: 4.15, h: 0.22,
            fontSize: 9, color: COLOR.slate, align: 'center', margin: 0
        }
    );

    // Красная зона — полоса-прогресс
    var redPct = Math.max(0, Math.min(100, Number(payload.redZonePerc) || Number(payload.redContrPerc) || 0));
    s.addText('Доля подрядчиков в красной зоне (ИУрК < 70%)', {
        x: 8.4, y: 3.65, w: 4.45, h: 0.22,
        fontSize: 9, bold: true, color: COLOR.muted, margin: 0
    });
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 8.4, y: 3.92, w: 4.45, h: 0.28,
        fill: { color: 'e2e8f0' }, line: { color: 'e2e8f0' }, rectRadius: 0.04
    });
    if (redPct > 0) {
        s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 8.4, y: 3.92, w: Math.max(0.12, 4.45 * redPct / 100), h: 0.28,
            fill: { color: COLOR.red }, line: { color: COLOR.red }, rectRadius: 0.04
        });
    }
    s.addText(redPct + '%', {
        x: 8.4, y: 4.22, w: 4.45, h: 0.22,
        fontSize: 11, bold: true, color: COLOR.red, margin: 0
    });

    // Топ B3 (текст — компактно, без тяжёлых thumb на executive)
    s.addText('Критические дефекты B3 (топ)', {
        x: 8.4, y: 4.55, w: 4.45, h: 0.24,
        fontSize: 10, bold: true, color: COLOR.text, margin: 0
    });
    var b3 = (payload.topB3 || []).slice(0, 4);
    if (!b3.length) {
        s.addText('Критических B3 в срезе нет', {
            x: 8.4, y: 4.85, w: 4.45, h: 0.28,
            fontSize: 11, color: COLOR.green, margin: 0
        });
    } else {
        b3.forEach(function (item, idx) {
            var y = 4.82 + idx * 0.38;
            s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
                x: 8.4, y: y, w: 4.45, h: 0.34,
                fill: { color: COLOR.redSoft },
                line: { color: 'fecaca', pt: 0.5 },
                rectRadius: 0.04
            });
            s.addText(String(item.name || 'Дефект'), {
                x: 8.5, y: y + 0.05, w: 3.2, h: 0.24,
                fontSize: 10, color: COLOR.text, margin: 0
            });
            s.addText(String(item.count) + '×', {
                x: 11.7, y: y + 0.05, w: 1.0, h: 0.24,
                fontSize: 11, bold: true, color: COLOR.red, align: 'right', margin: 0
            });
        });
    }

    // ПК СК мини
    var sk = payload.skStats || {};
    s.addText(
        'ПК СК: откр. ' + (sk.open || 0)
        + '  ·  просроч. ' + (sk.overdue || 0)
        + '  ·  закр. ' + (sk.closed || 0),
        {
            x: 8.4, y: 6.55, w: 4.45, h: 0.28,
            fontSize: 9, color: COLOR.muted, margin: 0
        }
    );

    // Футер
    s.addText('Источник: One-Pager 2.0 · RBI Platform · не для внешней рассылки без согласования', {
        x: 0.3, y: 7.15, w: 12.7, h: 0.22,
        fontSize: 8, color: '94a3b8', margin: 0
    });
}

async function _buildOp2Pptx(data) {
    var Ctor = _pptxCtor();
    if (!Ctor) return _toast('Библиотека экспорта не загружена');
    var payload = _collectOp2Payload(data);
    var pptx = new Ctor();
    pptx.author = 'RBI Platform';
    pptx.title = 'One-Pager 2.0 — сводка для руководства';
    pptx.defineLayout({ name: 'LAYOUT_16x9_RBI', width: 13.333, height: 7.5 });
    pptx.layout = 'LAYOUT_16x9_RBI';
    var title = 'One-Pager 2.0 — ' + payload.projectLabel;
    _addOp2ExecutiveSlide(pptx, payload);
    await _downloadAndSave(pptx, title, payload.projectLabel, payload.periodText);
}

/** One-Pager 4.0 — те же цифры, что OP2, строгий Times / серые рамки. */
function _addOp4ExecutiveSlide(pptx, payload) {
    var W = 13.333;
    var H = 7.5;
    var s = pptx.addSlide();
    var FONT = 'Times New Roman';
    s.addShape(pptx.shapes.RECTANGLE, {
        x: 0, y: 0, w: W, h: H,
        fill: { color: COLOR.white }, line: { color: COLOR.white }
    });

    s.addText('ONE-PAGER 4.0  ·  СВОДКА ДЛЯ РУКОВОДСТВА', {
        x: 0.35, y: 0.18, w: 12.6, h: 0.22,
        fontSize: 10, bold: true, color: COLOR.muted, margin: 0, fontFace: FONT
    });
    s.addText(String(payload.projectLabel || 'Объект'), {
        x: 0.35, y: 0.4, w: 8.5, h: 0.32,
        fontSize: 18, bold: true, color: COLOR.text, margin: 0, fontFace: FONT
    });
    s.addText([
        payload.periodText || 'Период',
        'Автор: ' + (payload.author || '—'),
        new Date().toLocaleDateString('ru-RU')
    ].join('  ·  '), {
        x: 8.6, y: 0.44, w: 4.35, h: 0.28,
        fontSize: 10, color: COLOR.muted, align: 'right', margin: 0, fontFace: FONT
    });

    var metaY = 0.85;
    var metaRows = [
        ['УрК (физика)', String(payload.avgUrk) + '%' + (payload.avgDoc != null ? (' · док. ' + payload.avgDoc + '%') : '')],
        ['Индекс риска ИКО', String(payload.IKO) + (payload.ikoStatus ? (' · ' + payload.ikoStatus) : '')],
        ['Проверок / подрядчиков', String(payload.checks) + ' / ' + String(payload.contractors)],
        ['Красная зона (ИУрК<70%)', payload.relN > 0
            ? (String(payload.redContrCount) + '/' + String(payload.relN)
                + (payload.redContrPerc != null ? (' · ' + payload.redContrPerc + '%') : ''))
            : 'СБОР (нужен N≥7)']
    ];
    metaRows.forEach(function (row, idx) {
        var y = metaY + idx * 0.4;
        s.addShape(pptx.shapes.RECTANGLE, {
            x: 0.35, y: y, w: 3.4, h: 0.36,
            fill: { color: COLOR.card }, line: { color: '9ca3af', pt: 1 }
        });
        s.addText(row[0], {
            x: 0.45, y: y, w: 3.2, h: 0.36,
            fontSize: 11, bold: true, color: COLOR.muted, valign: 'middle', margin: 0, fontFace: FONT
        });
        s.addShape(pptx.shapes.RECTANGLE, {
            x: 3.75, y: y, w: 9.2, h: 0.36,
            fill: { color: COLOR.white }, line: { color: '9ca3af', pt: 1 }
        });
        s.addText(String(row[1] || '—'), {
            x: 3.85, y: y, w: 9.0, h: 0.36,
            fontSize: 12, bold: true, color: COLOR.text, valign: 'middle', margin: 0, fontFace: FONT
        });
    });

    s.addText('Рейтинг подрядчиков (окно ≤15)', {
        x: 0.35, y: 2.55, w: 7.8, h: 0.28,
        fontSize: 13, bold: true, color: COLOR.text, margin: 0, fontFace: FONT
    });

    var rating = (payload.rating || []).slice(0, 10);
    var tableRows = [[
        { text: 'Подрядчик', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'N', options: { bold: true, fill: { color: COLOR.header }, align: 'center' } },
        { text: 'УрК', options: { bold: true, fill: { color: COLOR.header }, align: 'center' } },
        { text: 'ИУрК', options: { bold: true, fill: { color: COLOR.header }, align: 'center' } },
        { text: 'B3', options: { bold: true, fill: { color: COLOR.header }, align: 'center' } }
    ]];
    rating.forEach(function (r) {
        tableRows.push([
            String(r.name || '—'),
            { text: String(r.count || 0), options: { align: 'center' } },
            { text: String(r.urk) + '%', options: { align: 'center' } },
            { text: r.count >= 7 ? (r.val + '%') : 'СБОР', options: { align: 'center' } },
            { text: String(r.b3 || 0), options: { align: 'center' } }
        ]);
    });
    if (tableRows.length === 1) {
        tableRows.push(['Нет подрядчиков в срезе', '—', '—', '—', '—']);
    }
    s.addTable(tableRows, {
        x: 0.35, y: 2.9, w: 7.9, colW: [3.5, 0.8, 1.2, 1.2, 1.2],
        border: [{ pt: 0.75, color: '9ca3af' }],
        fontFace: FONT,
        fontSize: 10,
        color: COLOR.text
    });

    s.addText('Критические дефекты B3 (топ)', {
        x: 8.5, y: 2.55, w: 4.45, h: 0.28,
        fontSize: 13, bold: true, color: COLOR.text, margin: 0, fontFace: FONT
    });
    var b3 = (payload.topB3 || []).slice(0, 6);
    if (!b3.length) {
        s.addShape(pptx.shapes.RECTANGLE, {
            x: 8.5, y: 2.95, w: 4.45, h: 0.7,
            fill: { color: COLOR.card }, line: { color: '9ca3af', pt: 1 }
        });
        s.addText('Критических B3 в срезе нет', {
            x: 8.65, y: 3.15, w: 4.15, h: 0.3,
            fontSize: 12, color: COLOR.green, margin: 0, fontFace: FONT
        });
    } else {
        b3.forEach(function (item, idx) {
            var y = 2.95 + idx * 0.48;
            s.addShape(pptx.shapes.RECTANGLE, {
                x: 8.5, y: y, w: 4.45, h: 0.42,
                fill: { color: COLOR.white }, line: { color: '9ca3af', pt: 1 }
            });
            s.addText(String(item.name || 'Дефект'), {
                x: 8.6, y: y + 0.08, w: 3.3, h: 0.26,
                fontSize: 11, color: COLOR.text, margin: 0, fontFace: FONT
            });
            s.addText(String(item.count) + '×', {
                x: 11.9, y: y + 0.08, w: 0.9, h: 0.26,
                fontSize: 12, bold: true, color: COLOR.red, align: 'right', margin: 0, fontFace: FONT
            });
        });
    }

    var sk = payload.skStats || {};
    s.addShape(pptx.shapes.RECTANGLE, {
        x: 0.35, y: 6.55, w: 12.6, h: 0.5,
        fill: { color: COLOR.card }, line: { color: '9ca3af', pt: 1 }
    });
    s.addText(
        'ПК СК: откр. ' + (sk.open || 0)
        + '  ·  просроч. ' + (sk.overdue || 0)
        + '  ·  закр. ' + (sk.closed || 0)
        + '     |     One-Pager 4.0 · RBI Platform',
        {
            x: 0.5, y: 6.65, w: 12.3, h: 0.3,
            fontSize: 11, bold: true, color: COLOR.muted, margin: 0, fontFace: FONT
        }
    );
}

async function _buildOp4Pptx(data) {
    var Ctor = _pptxCtor();
    if (!Ctor) return _toast('Библиотека экспорта не загружена');
    var payload = _collectOp2Payload(data);
    var pptx = new Ctor();
    pptx.author = 'RBI Platform';
    pptx.title = 'One-Pager 4.0 — сводка для руководства';
    pptx.defineLayout({ name: 'LAYOUT_16x9_RBI', width: 13.333, height: 7.5 });
    pptx.layout = 'LAYOUT_16x9_RBI';
    var title = 'One-Pager 4.0 — ' + payload.projectLabel;
    _addOp4ExecutiveSlide(pptx, payload);
    await _downloadAndSave(pptx, title, payload.projectLabel, payload.periodText);
}

async function _buildFullReportV2Pptx(data) {
    var Ctor = _pptxCtor();
    if (!Ctor) return _toast('Библиотека экспорта не загружена');
    var payload = _collectOp2Payload(data);
    var pptx = new Ctor();
    var FONT = 'Times New Roman';
    pptx.author = 'RBI Platform';
    pptx.title = 'Отчёт по объекту 2.0';
    pptx.defineLayout({ name: 'LAYOUT_16x9_RBI', width: 13.333, height: 7.5 });
    pptx.layout = 'LAYOUT_16x9_RBI';

    _addOp4ExecutiveSlide(pptx, payload);

    var list = (payload.rating || []).slice(0, 24);
    for (var i = 0; i < list.length; i++) {
        var r = list[i];
        var s = pptx.addSlide();
        s.addText('ОТЧЁТ ПО ОБЪЕКТУ 2.0  ·  КАРТОЧКА ПОДРЯДЧИКА', {
            x: 0.35, y: 0.18, w: 12.6, h: 0.22,
            fontSize: 10, bold: true, color: COLOR.muted, margin: 0, fontFace: FONT
        });
        s.addText(String(r.name || 'Подрядчик'), {
            x: 0.35, y: 0.42, w: 12.6, h: 0.36,
            fontSize: 18, bold: true, color: COLOR.text, margin: 0, fontFace: FONT
        });
        var rows = [
            [
                { text: 'Показатель', options: { bold: true, fill: { color: COLOR.header } } },
                { text: 'Значение', options: { bold: true, fill: { color: COLOR.header } } }
            ],
            ['Вид работ', String(r.workType || '—')],
            ['Проверок (N)', String(r.count)],
            ['УрК физика', String(r.urk) + '%'],
            ['ИУрК (надёжность)', r.count >= 7 ? (r.val + '%') : 'СБОР (N<7)'],
            ['Докум. УрК', r.doc != null ? (r.doc + '%') : '—'],
            ['Критические B3', String(r.b3 || 0)]
        ];
        s.addTable(rows, {
            x: 0.35, y: 1.0, w: 12.6, colW: [5.5, 7.1],
            border: [{ pt: 0.75, color: '9ca3af' }],
            fontFace: FONT,
            fontSize: 13,
            color: COLOR.text
        });
        s.addText(payload.projectLabel + '  ·  ' + (payload.periodText || ''), {
            x: 0.35, y: 6.9, w: 12.6, h: 0.28,
            fontSize: 10, color: COLOR.muted, margin: 0, fontFace: FONT
        });
    }

    var title = 'Отчёт по объекту 2.0 — ' + payload.projectLabel;
    await _downloadAndSave(pptx, title, payload.projectLabel, payload.periodText);
}

async function _buildFullReportPptx(data) {
    var Ctor = _pptxCtor();
    if (!Ctor) return _toast('Библиотека экспорта не загружена');
    var payload = _collectOp2Payload(data);
    var pptx = new Ctor();
    pptx.author = 'RBI Platform';
    pptx.title = 'Отчёт по объекту';
    var title = 'Полный отчет по объекту — ' + payload.projectLabel;
    _addTitleSlide(pptx, 'Отчёт по объекту (планерка)', [
        'Объект / фильтр: ' + payload.projectLabel,
        'Период: ' + payload.periodText,
        'Подрядчиков: ' + payload.contractors + ' · Проверок: ' + payload.checks,
        'Дата: ' + new Date().toLocaleDateString('ru-RU')
    ]);
    _addKpiSlide(pptx, payload, 'KPI объекта');
    _addRatingChartSlides(pptx, payload.rating);
    // Слайды по подрядчикам (компактно)
    var list = (payload.rating || []).slice(0, 20);
    for (var i = 0; i < list.length; i++) {
        var r = list[i];
        var s = pptx.addSlide();
        s.addText(String(r.name), { x: 0.4, y: 0.3, w: 9.2, h: 0.5, fontSize: 18, bold: true, color: COLOR.text });
        var rows = [
            [
                { text: 'Метрика', options: { bold: true, fill: { color: COLOR.header } } },
                { text: 'Значение', options: { bold: true, fill: { color: COLOR.header } } }
            ],
            ['Вид работ', String(r.workType || '—')],
            ['Проверок (N)', String(r.count)],
            ['УрК физика', String(r.urk) + '%'],
            ['ИУрК', r.count >= 7 ? (r.val + '%') : 'СБОР'],
            ['Докум. УрК', r.doc != null ? (r.doc + '%') : '—'],
            ['B3', String(r.b3 || 0)]
        ];
        s.addTable(rows, {
            x: 0.5, y: 1.1, w: 9, colW: [4.5, 4.5],
            border: { pt: 0.5, color: COLOR.border },
            fontSize: 13, color: COLOR.text, valign: 'middle'
        });
    }
    await _addTopB3Slide(pptx, payload.topB3);
    await _downloadAndSave(pptx, title, payload.projectLabel, payload.periodText);
}

async function _buildGlobalPptx(data) {
    var Ctor = _pptxCtor();
    if (!Ctor) return _toast('Библиотека экспорта не загружена');
    var byProj = {};
    data.forEach(function (item) {
        var k = _projectKey(item);
        (byProj[k] = byProj[k] || []).push(item);
    });
    var projects = Object.keys(byProj).map(function (name) {
        return { name: name, data: byProj[name], n: byProj[name].length };
    }).sort(function (a, b) { return b.n - a.n; });

    var company = _collectOp2Payload(data);
    var pptx = new Ctor();
    pptx.author = 'RBI Platform';
    pptx.title = 'Сводный отчет по компании 2.0';
    var title = 'Сводный отчет по компании 2.0';
    _addTitleSlide(pptx, title, [
        'Период: ' + company.periodText,
        'Объектов: ' + projects.length + ' · Проверок: ' + company.checks,
        'ИКО: ' + company.IKO + ' · ср. УрК: ' + company.avgUrk + '%',
        'Дата: ' + new Date().toLocaleDateString('ru-RU')
    ]);
    _addKpiSlide(pptx, company, 'KPI компании');

    var toc = pptx.addSlide();
    toc.addText('Оглавление объектов', { x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 20, bold: true, color: COLOR.text });
    var tocRows = [[
        { text: '№', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'Объект', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'Проверок', options: { bold: true, fill: { color: COLOR.header } } }
    ]];
    projects.forEach(function (p, idx) {
        tocRows.push([String(idx + 1), p.name, String(p.n)]);
    });
    toc.addTable(tocRows.slice(0, 21), {
        x: 0.4, y: 0.8, w: 9.2, colW: [0.8, 6.8, 1.6],
        border: { pt: 0.4, color: COLOR.border },
        fontSize: 11, color: COLOR.text, valign: 'middle'
    });

    var limit = projects.length <= 12 ? projects.length : 12;
    for (var i = 0; i < limit; i++) {
        var p = projects[i];
        var pl = _collectOp2Payload(p.data);
        _addTitleSlide(pptx, p.name, [
            'Проверок: ' + pl.checks + ' · Подрядчиков: ' + pl.contractors,
            'ИКО: ' + pl.IKO + ' · ср. УрК: ' + pl.avgUrk + '%' +
                (pl.avgReliability != null ? (' · ИУрК: ' + pl.avgReliability + '%') : '')
        ]);
        _addKpiSlide(pptx, pl, 'KPI — ' + p.name);
        var s = pptx.addSlide();
        s.addText('Рейтинг — ' + p.name, { x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 18, bold: true, color: COLOR.text });
        var top = (pl.rating || []).slice(0, 10);
        if (top.length) {
            s.addChart(pptx.charts.BAR, [{
                name: 'ИУрК/УрК',
                labels: top.map(function (r) {
                    var n = String(r.name || '');
                    return n.length > 24 ? n.slice(0, 23) + '…' : n;
                }),
                values: top.map(function (r) { return Number(r.count >= 7 ? r.val : r.urk) || 0; })
            }], {
                x: 0.35, y: 0.8, w: 9.3, h: 4.2,
                showTitle: false, showLegend: false, showValue: true,
                chartColors: [COLOR.indigo],
                valAxisMaxValue: 100, valAxisMinValue: 0
            });
        } else {
            s.addText('Недостаточно данных', { x: 0.5, y: 1.2, w: 9, h: 0.4, fontSize: 14, color: COLOR.muted });
        }
    }
    if (projects.length > limit) {
        var rest = pptx.addSlide();
        rest.addText('Остальные объекты', { x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 20, bold: true, color: COLOR.text });
        var rrows = [[
            { text: 'Объект', options: { bold: true, fill: { color: COLOR.header } } },
            { text: 'N', options: { bold: true, fill: { color: COLOR.header } } }
        ]];
        projects.slice(limit).forEach(function (p) { rrows.push([p.name, String(p.n)]); });
        rest.addTable(rrows.slice(0, 20), {
            x: 0.5, y: 0.85, w: 9, colW: [7.5, 1.5],
            border: { pt: 0.4, color: COLOR.border },
            fontSize: 11, color: COLOR.text, valign: 'middle'
        });
    }
    await _downloadAndSave(pptx, title, 'Компания', company.periodText);
}

async function _buildPosterPptx(data) {
    var Ctor = _pptxCtor();
    if (!Ctor) return _toast('Библиотека экспорта не загружена');
    // Используем текущий фильтр (не только «прошлая неделя» из generatePosterData).
    var payload = _collectOp2Payload(data);
    var rating = (payload.rating || []).slice();
    var leaders = rating.filter(function (r) { return r.val >= 85; }).slice(0, 5);
    var anti = rating.filter(function (r) { return r.b3 > 0 || r.val < 70; })
        .sort(function (a, b) { return (b.b3 - a.b3) || (a.val - b.val); })
        .slice(0, 5);
    var pptx = new Ctor();
    pptx.author = 'RBI Platform';
    pptx.title = 'Плакат Качества';
    var title = 'Плакат Качества — ' + payload.projectLabel;
    _addTitleSlide(pptx, 'Плакат Качества', [
        'Период: ' + payload.periodText,
        'Объект / фильтр: ' + payload.projectLabel,
        'ИКО: ' + payload.IKO + ' · ср. УрК: ' + payload.avgUrk + '% · B3: ' + payload.sumB3,
        'Дата: ' + new Date().toLocaleDateString('ru-RU')
    ]);
    _addKpiSlide(pptx, payload, 'KPI плаката');

    var sL = pptx.addSlide();
    sL.addText('Лидеры качества', { x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 20, bold: true, color: COLOR.green });
    var lrows = [[
        { text: 'Подрядчик', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'ИУрК', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'N', options: { bold: true, fill: { color: COLOR.header } } }
    ]];
    (leaders.length ? leaders : rating.slice(0, 5)).forEach(function (r) {
        lrows.push([r.name, (r.count >= 7 ? r.val : r.urk) + '%', String(r.count)]);
    });
    sL.addTable(lrows, {
        x: 0.5, y: 0.85, w: 9, colW: [6, 1.5, 1.5],
        border: { pt: 0.5, color: COLOR.border },
        fontSize: 12, color: COLOR.text, valign: 'middle'
    });

    var sA = pptx.addSlide();
    sA.addText('Зона риска', { x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 20, bold: true, color: COLOR.red });
    var arows = [[
        { text: 'Подрядчик', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'ИУрК', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'B3', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'N', options: { bold: true, fill: { color: COLOR.header } } }
    ]];
    (anti.length ? anti : rating.slice(-5).reverse()).forEach(function (r) {
        arows.push([r.name, (r.count >= 7 ? r.val : r.urk) + '%', String(r.b3 || 0), String(r.count)]);
    });
    sA.addTable(arows, {
        x: 0.5, y: 0.85, w: 9, colW: [5.2, 1.4, 1.2, 1.2],
        border: { pt: 0.5, color: COLOR.border },
        fontSize: 12, color: COLOR.text, valign: 'middle'
    });

    _addRatingChartSlides(pptx, rating);
    await _addTopB3Slide(pptx, payload.topB3);
    await _downloadAndSave(pptx, title, payload.projectLabel, payload.periodText);
}

async function _buildDefectRemediationPptx(data) {
    var Ctor = _pptxCtor();
    if (!Ctor) return _toast('Библиотека экспорта не загружена');
    var collect = root.collectRecurringDefectCards;
    if (typeof collect !== 'function') return _toast('Сборщик повторяющихся дефектов недоступен');
    var cards = collect(data) || [];
    if (!cards.length) return _toast('Нет дефектов с ≥3 повторениями по текущим фильтрам');

    var pptx = new Ctor();
    pptx.author = 'RBI Platform';
    pptx.title = 'Повторяющиеся дефекты';
    var projectLabel = _filterProjectLabel(data);
    var period = _periodText();
    var title = 'Повторяющиеся дефекты — ' + projectLabel;
    _addTitleSlide(pptx, 'Повторяющиеся дефекты', [
        'Порог: ≥3 повтора (B2/B3)',
        'Карточек: ' + cards.length + ' · Период: ' + period,
        'Объект / фильтр: ' + projectLabel,
        'Дата: ' + new Date().toLocaleDateString('ru-RU')
    ]);

    var listSlide = pptx.addSlide();
    listSlide.addText('Реестр', { x: 0.4, y: 0.25, w: 9.2, h: 0.35, fontSize: 18, bold: true, color: COLOR.text });
    var rows = [[
        { text: 'Дефект', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'Подрядчик', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'Объект', options: { bold: true, fill: { color: COLOR.header } } },
        { text: 'N', options: { bold: true, fill: { color: COLOR.header } } }
    ]];
    cards.slice(0, 18).forEach(function (c) {
        rows.push([
            String(c.defectName || 'Дефект').slice(0, 36),
            String(c.contractor || '—').slice(0, 28),
            String(c.project || '—').slice(0, 22),
            String((c.failEvents && c.failEvents.length) || c.failCount || '—')
        ]);
    });
    listSlide.addTable(rows, {
        x: 0.3, y: 0.7, w: 9.4, colW: [3.2, 2.8, 2.4, 1.0],
        border: { pt: 0.4, color: COLOR.border },
        fontSize: 10, color: COLOR.text, valign: 'middle'
    });

    var maxCards = Math.min(cards.length, 12);
    for (var i = 0; i < maxCards; i++) {
        var c = cards[i];
        var s = pptx.addSlide();
        s.addText(String(c.defectName || 'Дефект'), { x: 0.4, y: 0.25, w: 9.2, h: 0.45, fontSize: 16, bold: true, color: COLOR.text });
        s.addText([
            'Подрядчик: ' + (c.contractor || '—'),
            'Объект: ' + (c.project || '—'),
            'Вид работ: ' + (c.workType || '—'),
            'Повторов: ' + ((c.failEvents && c.failEvents.length) || '—')
        ].join('\n'), { x: 0.4, y: 0.8, w: 5.2, h: 1.6, fontSize: 12, color: COLOR.muted });

        var leftPhoto = null;
        var rightPhoto = null;
        try {
            if (c.failEvents && c.failEvents[0] && c.failEvents[0].photos && c.failEvents[0].photos[0]) {
                leftPhoto = c.failEvents[0].photos[0];
            }
            if (c.okEvents && c.okEvents.length) {
                var okWith = c.okEvents.find(function (e) { return e.photos && e.photos[0]; });
                if (okWith) rightPhoto = okWith.photos[0];
            }
            if (!rightPhoto && c.rightSrc) rightPhoto = c.rightSrc;
            if (!leftPhoto && c.leftSrc) leftPhoto = c.leftSrc;
        } catch (_) { /* ignore */ }

        var lt = await _thumb(leftPhoto);
        var rt = await _thumb(rightPhoto);
        if (lt) {
            try { s.addImage({ data: lt, x: 0.4, y: 2.6, w: 4.3, h: 2.4 }); } catch (_) { /* skip */ }
            s.addText('Брак', { x: 0.4, y: 5.05, w: 4.3, h: 0.25, fontSize: 10, color: COLOR.red, align: 'center' });
        }
        if (rt) {
            try { s.addImage({ data: rt, x: 5.3, y: 2.6, w: 4.3, h: 2.4 }); } catch (_) { /* skip */ }
            s.addText('Устранение / эталон', { x: 5.3, y: 5.05, w: 4.3, h: 0.25, fontSize: 10, color: COLOR.green, align: 'center' });
        }
    }
    await _downloadAndSave(pptx, title, projectLabel, period);
}

/**
 * Точка входа FAB: mode=pptx.
 */
export async function exportReportPptx(actionType, data) {
    var list = Array.isArray(data) ? data : [];
    if (!list.length) return _toast('Нет данных для выгрузки');
    switch (actionType) {
        case 'onepager_v2':
            return _buildOp2Pptx(list);
        case 'onepager_v4':
            return _buildOp4Pptx(list);
        case 'full_report':
            return _buildFullReportPptx(list);
        case 'full_report_v2':
            return _buildFullReportV2Pptx(list);
        case 'global_onepager_v2':
            return _buildGlobalPptx(list);
        case 'poster':
            return _buildPosterPptx(list);
        case 'defect_remediation':
            return _buildDefectRemediationPptx(list);
        default:
            return _toast('PPTX для этого отчёта пока не поддерживается');
    }
}

root['exportReportPptx'] = exportReportPptx;
