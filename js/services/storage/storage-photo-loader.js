/* Файл: js/services/storage/storage-photo-loader.js — P2-0023 этап 1.
 * Единая ленивая загрузка фото в <img> (раньше: IntersectionObserver в bootstrap.js
 * + последовательный обход всех img в rbiHydrateLocalImages — две копии).
 *
 * Правила:
 * - грузятся только видимые (и чуть ниже экрана) фото, не больше MAX_CONCURRENT разом;
 * - адрес blob: отзывается только когда его нет на странице (sweep в PhotoManager),
 *   а не по счётчику; фото дальше 2500 px от экрана отдаёт адрес (unloadFar) и догрузится при возврате;
 * - «ошибка» ≠ «нет файла»: ошибка → «нажмите, чтобы повторить», нет сети → «загрузится
 *   при подключении», нет нигде → «фото не найдено».
 * Чистые функции экспортируются для unit-тестов (js/shared/__tests__/photo-loader.test.js).
 */
'use strict';

export const PHOTO_STATE = Object.freeze({
    LOADING: 'loading',
    OK: 'ok',
    ERROR: 'error',
    OFFLINE: 'offline',
    MISSING: 'missing'
});

/**
 * Какие ключи кэша можно отозвать. Никогда не трогает адреса, которые сейчас
 * на странице, и адреса, выданные недавно (graceMs: их ещё не успели вставить в DOM).
 * Отзывает самые давние, пока размер не станет <= targetSize.
 *
 * @param {{ entries: Array<{key: string, url: string, touchedAt: number}>,
 *           inUse: Set<string>, now: number, graceMs: number, targetSize: number }} p
 * @returns {string[]} ключи к отзыву
 */
export function selectUrlsToRelease(p) {
    const entries = (p && p.entries) || [];
    const inUse = (p && p.inUse) || new Set();
    const now = Number(p && p.now) || 0;
    const graceMs = Number(p && p.graceMs) || 0;
    const targetSize = Math.max(0, Number(p && p.targetSize) || 0);
    let size = entries.length;
    if (size <= targetSize) return [];
    const candidates = entries
        .filter(e => e && e.key && !inUse.has(e.url) && (now - (Number(e.touchedAt) || 0)) >= graceMs)
        .sort((a, b) => (Number(a.touchedAt) || 0) - (Number(b.touchedAt) || 0));
    const out = [];
    for (const c of candidates) {
        if (size <= targetSize) break;
        out.push(c.key);
        size--;
    }
    return out;
}

/**
 * Итог попытки загрузить фото, когда локальной копии нет.
 * @param {{ cloudUrl?: string, online: boolean }} p
 * @returns {'fetch'|'offline'|'missing'}
 */
export function decideCloudFallback(p) {
    const cloudUrl = String((p && p.cloudUrl) || '');
    if (!/^https?:\/\//i.test(cloudUrl)) return PHOTO_STATE.MISSING;
    if (!(p && p.online)) return PHOTO_STATE.OFFLINE;
    return 'fetch';
}

/**
 * Статус по HTTP-ответу облака: 400/404 — файла нет в облаке; прочее — временная ошибка.
 * @param {number} status
 */
export function stateForHttpStatus(status) {
    const s = Number(status) || 0;
    if (s >= 200 && s < 300) return PHOTO_STATE.OK;
    if (s === 400 || s === 404 || s === 410) return PHOTO_STATE.MISSING;
    return PHOTO_STATE.ERROR;
}

/** Облачный адрес для ссылки/записи IndexedDB (запись может быть «псевдонимом» без data). */
export function cloudUrlFor(ref, record) {
    const r = String(ref || '');
    if (/^https?:\/\//i.test(r)) return r;
    const rec = record || {};
    const candidates = [rec.aliasOf, rec.alias_of, rec.sourceUrl, rec.source_url, rec.publicUrl, rec.public_url];
    for (const c of candidates) {
        if (c && /^https?:\/\//i.test(String(c))) return String(c);
    }
    return '';
}

/**
 * Очередь «не больше max задач одновременно».
 * @param {number} max
 */
export function createConcurrencyQueue(max) {
    const limit = Math.max(1, Number(max) || 1);
    let active = 0;
    const waiting = [];
    const next = () => {
        while (active < limit && waiting.length) {
            const job = waiting.shift();
            active++;
            Promise.resolve()
                .then(job.fn)
                .then(job.resolve, job.reject)
                .finally(() => { active--; next(); });
        }
    };
    return {
        run(fn) {
            return new Promise((resolve, reject) => {
                waiting.push({ fn, resolve, reject });
                next();
            });
        },
        get active() { return active; },
        get pending() { return waiting.length; }
    };
}

/**
 * Ленивый загрузчик для <img data-local-src>. Зависимости передаются явно (тестируемо).
 * @param {{
 *   resolve: (ref: string, opts?: {preferThumb?: boolean}) => Promise<{state: string, url?: string}>,
 *   placeholderFor: (state: string) => string,
 *   IntersectionObserver: any, document: any,
 *   maxConcurrent?: number, rootMargin?: string,
 *   viewportHeight?: () => number
 * }} deps
 */
export function createPhotoLazyLoader(deps) {
    const queue = createConcurrencyQueue(deps.maxConcurrent || 4);
    const doc = deps.document;
    const pendingFirstPass = new Map(); // img → resolve() первого прохода (для hydrate())
    const inFlight = new WeakSet();

    const settleFirstPass = (img) => {
        const done = pendingFirstPass.get(img);
        if (done) { pendingFirstPass.delete(img); done(); }
    };

    const setState = (img, state) => {
        if (state === PHOTO_STATE.OK) img.removeAttribute('data-photo-state');
        else img.setAttribute('data-photo-state', state);
    };

    const load = (img) => {
        const ref = img.getAttribute('data-local-src');
        if (!ref || inFlight.has(img)) { settleFirstPass(img); return Promise.resolve(); }
        inFlight.add(img);
        const preferThumb = img.getAttribute('data-prefer-thumb') === '1';
        setState(img, PHOTO_STATE.LOADING);
        return queue.run(async () => {
            // Ушло со страницы, пока стояло в очереди — не грузим.
            if (img.isConnected === false || img.getAttribute('data-local-src') !== ref) return;
            let res;
            try {
                res = await deps.resolve(ref, preferThumb ? { preferThumb: true } : undefined);
            } catch (_e) {
                res = { state: PHOTO_STATE.ERROR };
            }
            if (img.getAttribute('data-local-src') !== ref) return; // ссылку заменили
            if (res && res.state === PHOTO_STATE.OK && res.url) {
                img.src = res.url;
                img.removeAttribute('data-local-src');
                if (!img.getAttribute('data-photo-ref')) img.setAttribute('data-photo-ref', ref);
                setState(img, PHOTO_STATE.OK);
                loaded.add(img);
            } else {
                const st = (res && res.state) || PHOTO_STATE.ERROR;
                img.src = deps.placeholderFor(st);
                setState(img, st);
            }
        }).finally(() => {
            inFlight.delete(img);
            settleFirstPass(img);
        });
    };

    const nearObserver = new deps.IntersectionObserver((entries) => {
        for (const entry of entries) {
            const img = entry.target;
            if (img.isConnected === false) { nearObserver.unobserve(img); settleFirstPass(img); continue; }
            if (!entry.isIntersecting) { settleFirstPass(img); continue; }
            nearObserver.unobserve(img);
            load(img);
        }
    }, { rootMargin: deps.rootMargin || '300px' });

    /** Загруженные img: из них выгружаются ушедшие далеко (unloadFar). */
    const loaded = new Set();

    const listImgs = (root) => {
        const scope = root || doc;
        const out = [];
        if (scope && scope.matches && scope.matches('img[data-local-src]')) out.push(scope);
        if (scope && scope.querySelectorAll) {
            const found = scope.querySelectorAll('img[data-local-src]');
            for (let i = 0; i < found.length; i++) out.push(found[i]);
        }
        return out.filter(img => !(img.closest && img.closest('[data-no-observe]')));
    };

    const observe = (img) => {
        if (!img || !img.getAttribute || !img.getAttribute('data-local-src')) return Promise.resolve();
        return new Promise((resolve) => {
            const prev = pendingFirstPass.get(img);
            pendingFirstPass.set(img, () => { if (prev) prev(); resolve(); });
            nearObserver.observe(img);
        });
    };

    return {
        observe,
        /** Поставить в очередь все img[data-local-src] внутри root. */
        observeAll(root) { listImgs(root).forEach(observe); },
        /** Как observeAll, но ждёт первого прохода: видимые загружены, невидимые отложены. */
        hydrate(root) { return Promise.all(listImgs(root).map(observe)).then(() => undefined); },
        /** Повторить одно фото (кнопка «повторить»). */
        retry(img) {
            if (!img) return Promise.resolve();
            const ref = img.getAttribute('data-local-src') || img.getAttribute('data-photo-ref');
            if (!ref) return Promise.resolve();
            img.setAttribute('data-local-src', ref);
            return load(img);
        },
        /** Повторить все фото в состоянии state (например, offline после появления сети). */
        retryState(state) {
            const list = doc.querySelectorAll('img[data-photo-state="' + state + '"]');
            for (let i = 0; i < list.length; i++) this.retry(list[i]);
        },
        /**
         * Фото дальше farPx от экрана отдают blob:-адрес (память телефона) и
         * догрузятся при возврате. Считается по расстоянию, а не по «не видно»:
         * в прокручиваемом окне фото за краем рядом с экраном не мигают.
         * @returns {number} сколько выгружено
         */
        unloadFar(farPx) {
            const far = Number(farPx) || 2500;
            const vh = deps.viewportHeight ? deps.viewportHeight() : 800;
            let n = 0;
            for (const img of Array.from(loaded)) {
                if (img.isConnected === false) { loaded.delete(img); continue; }
                const ref = img.getAttribute('data-photo-ref');
                if (!ref || !String(img.src || '').startsWith('blob:')) { loaded.delete(img); continue; }
                const r = img.getBoundingClientRect ? img.getBoundingClientRect() : null;
                if (!r) continue;
                const isFar = r.bottom < -far || r.top > vh + far;
                if (!isFar) continue;
                loaded.delete(img);
                img.src = deps.placeholderFor(PHOTO_STATE.LOADING);
                img.setAttribute('data-local-src', ref);
                nearObserver.observe(img);
                n++;
            }
            return n;
        },
        _queue: queue
    };
}
