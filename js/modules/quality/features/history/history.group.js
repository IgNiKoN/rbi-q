/**
 * history.group.js
 * P2-0026: общие правила группировки «Истории» (телефон — history.render.js, ПК — history.desktop.content.js):
 * имена подрядчика / вида работ, средний УрК и его цвет, раскладка Подрядчик → Вид работ.
 */

function _t(key, fallback) {
    try {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var out = i18n.t(key);
            if (out && out !== key) return out;
        }
    } catch (e) {}
    return fallback;
}

export function histCollator() {
    return new Intl.Collator('ru');
}

export function contractorNameOf(item) {
    return (item && item.contractorName) || _t('quality.history.fallback.unspecified', 'Не указан');
}

export function workTypeNameOf(item) {
    return (item && item.templateTitle) || _t('quality.history.fallback.unknown_work', 'Неизвестный вид работ');
}

/** Средний итоговый УрК по записям (округлённый) или null, если УрК нет ни у одной. */
export function avgFinalUrk(items) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < items.length; i++) {
        const m = items[i] && items[i].metrics;
        if (m && m.final !== undefined && m.final !== null) {
            sum += Number(m.final) || 0;
            n++;
        }
    }
    if (!n) return null;
    return Math.round(sum / n);
}

/** Цвет метки среднего УрК: < 70 — красный, ≥ 85 — зелёный, иначе жёлтый; нет данных — синий. */
export function avgUrkStatusCls(avg) {
    if (avg === null || avg === undefined) return 'tag-blue';
    if (avg < 70) return 'tag-red';
    if (avg >= 85) return 'tag-green';
    return 'tag-yellow';
}

/**
 * Подрядчик → Вид работ (по алфавиту), порядок записей внутри вида работ сохраняется.
 * @returns {{ name: string, items: object[], works: { name: string, items: object[] }[] }[]}
 */
export function groupByContractorWork(items) {
    const byContr = new Map();
    (items || []).forEach((item) => {
        const c = contractorNameOf(item);
        const w = workTypeNameOf(item);
        if (!byContr.has(c)) byContr.set(c, new Map());
        const byWork = byContr.get(c);
        if (!byWork.has(w)) byWork.set(w, []);
        byWork.get(w).push(item);
    });
    const cmp = histCollator().compare;
    return Array.from(byContr.keys()).sort(cmp).map((c) => {
        const byWork = byContr.get(c);
        const works = Array.from(byWork.keys()).sort(cmp).map((w) => ({ name: w, items: byWork.get(w) }));
        return { name: c, items: works.reduce((acc, w) => acc.concat(w.items), []), works };
    });
}
