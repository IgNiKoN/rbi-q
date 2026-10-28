/* Файл: js/shared/app-update.policy.js */
// P2-0066: чистые правила строки версии и переключения на новую версию (без DOM; unit — __tests__/app-update.policy.test.js).
// Решения владельца 29.10.2026: «Запуск + возврат» — новая версия включается при запуске, а если приложение не закрывают —
// при возврате из фона ≥ 30 мин, когда всё отправлено и ничего не вводится; «Тихо + строка» — плашки нет, строка в настройках.

/** Сколько приложение должно пробыть в фоне, чтобы при возврате включить новую версию и проверить обновление. */
export const RETURN_AFTER_MS = 30 * 60 * 1000;

/** Включать ли скачанную версию при возврате из фона. */
export function shouldSwitchOnReturn(s) {
    return !!s && s.waiting === true && s.hiddenMs >= RETURN_AFTER_MS && s.unsent === 0 && !s.syncing && !s.busy;
}

const fmtDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : '');
const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
};
const REASON = { network: 'Нет связи', mismatch: 'На сервере идёт выкладка', space: 'Мало места на устройстве' };

/**
 * Что показать в строке версии. s: { version, date, state: 'idle'|'downloading'|'ready'|'failed', done, total, newVersion, reason }.
 * → { tone: 'ok'|'info'|'warn', title, sub, foot, restart, progress } (progress — 0…1 или null).
 */
export function versionView(s) {
    const cur = s.version ? s.version + (fmtDate(s.date) ? ' от ' + fmtDate(s.date) : '') : '';
    const foot = cur ? 'Сейчас работает: ' + cur : '';
    if (s.state === 'ready') {
        return { tone: 'warn', title: 'Новая версия скачана', sub: (s.newVersion ? s.newVersion + ' — ' : '') + 'включится при следующем запуске',
            foot: foot + (foot ? ' · неотправленное не пропадёт' : ''), restart: true, progress: null };
    }
    if (s.state === 'downloading') {
        const total = s.total || 0, done = Math.min(s.done || 0, total);
        return { tone: 'info', title: 'Скачивается новая версия',
            sub: (total ? done + ' из ' + total + ' ' + plural(total, 'файла', 'файлов', 'файлов') + ' · ' : '') + 'можно работать дальше, ничего не перезагрузится',
            foot, restart: false, progress: total ? done / total : 0 };
    }
    if (s.state === 'failed') {
        return { tone: 'warn', title: 'Новая версия не скачалась', sub: (REASON[s.reason] || 'Нет связи') + ' — работает текущая версия, повторим позже сами',
            foot, restart: false, progress: null };
    }
    return { tone: 'ok', title: s.version ? 'Версия ' + s.version : 'Версия приложения', sub: fmtDate(s.date) ? 'от ' + fmtDate(s.date) + ' · это последняя версия' : 'это последняя версия',
        foot: '', restart: false, progress: null };
}
