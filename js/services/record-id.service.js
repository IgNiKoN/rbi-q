/* Файл: js/services/record-id.service.js — P2-0072 «Номера записей по стандарту» (standards/DATA_TABLES.md п. 1, MODULES §9 п. 1).
 * Сервис номеров платформы — один на все модули: своих генераторов `prefix_ + Date.now()` в модулях нет.
 *  newId()              — новый номер записи: uuid v4 (crypto.randomUUID; запасной путь — crypto.getRandomValues, iOS < 15.4).
 *  stableId(...части)   — устойчивый номер: uuid v5 от частей («родитель + ключ»), тот же вход → тот же номер (повторная отправка без дублей).
 *  childId(родитель, старыйНомер, ...части) — номер строки-ребёнка: родитель с uuid-номером → stableId(родитель, ...части);
 *                         родитель со старым номером (создан до P2-0072) → прежний составной номер, чтобы досылка не создала дубль.
 *  isUuid(s)            — номер имеет вид uuid.
 * Без библиотек: SHA-1 для v5 — ниже (синхронно, работает и без crypto.subtle). Unit — js/shared/__tests__/record-id.service.test.js.
 * Подключение: модули Качества и синхронизация (обычные скрипты) — window.RbiIds; код платформы (src/) — import.
 */
'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Пространство устойчивых номеров платформы = uuid v5 (NAMESPACE_URL, 'https://app.rbi-q.ru/records'); проверка — в unit. */
export const RECORDS_NAMESPACE = 'e1dedaa8-c700-505e-9ece-74a12c8f3664';

export function isUuid(s) {
    return typeof s === 'string' && UUID_RE.test(s);
}

function hex(bytes) {
    let x = '';
    for (let i = 0; i < 16; i++) x += bytes[i].toString(16).padStart(2, '0');
    return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20, 32);
}

function randomBytes16() {
    const b = new Uint8Array(16);
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
}

/** Новый номер записи (uuid v4). opts.noNative — только запасной путь (для unit). */
export function newId(opts) {
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (!(opts && opts.noNative) && c && typeof c.randomUUID === 'function') return c.randomUUID();
    const b = randomBytes16();
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    return hex(b);
}

function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    const out = [];
    const e = unescape(encodeURIComponent(s));
    for (let i = 0; i < e.length; i++) out.push(e.charCodeAt(i));
    return new Uint8Array(out);
}

function sha1(bytes) {
    const ml = bytes.length;
    const words = new Uint32Array((((ml + 8) >> 6) + 1) * 16);
    for (let i = 0; i < ml; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
    words[ml >> 2] |= 0x80 << (24 - (ml % 4) * 8);
    words[words.length - 1] = ml * 8;
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    const w = new Uint32Array(80);
    for (let j = 0; j < words.length; j += 16) {
        for (let t = 0; t < 16; t++) w[t] = words[j + t];
        for (let t = 16; t < 80; t++) { const v = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]; w[t] = (v << 1) | (v >>> 31); }
        let a = h0, b = h1, c = h2, d = h3, e = h4;
        for (let t = 0; t < 80; t++) {
            const f = t < 20 ? ((b & c) | (~b & d)) + 0x5a827999
                : t < 40 ? (b ^ c ^ d) + 0x6ed9eba1
                    : t < 60 ? ((b & c) | (b & d) | (c & d)) + 0x8f1bbcdc
                        : (b ^ c ^ d) + 0xca62c1d6;
            const tmp = (((a << 5) | (a >>> 27)) + f + e + w[t]) >>> 0;
            e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = tmp;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    const out = new Uint8Array(20);
    [h0, h1, h2, h3, h4].forEach((h, i) => { out[i * 4] = h >>> 24; out[i * 4 + 1] = (h >>> 16) & 255; out[i * 4 + 2] = (h >>> 8) & 255; out[i * 4 + 3] = h & 255; });
    return out;
}

/** uuid v5 (RFC 4122): SHA-1 от байтов пространства + имени. */
export function uuidV5(name, namespace) {
    const ns = String(namespace).replace(/-/g, '');
    const nb = utf8(String(name));
    const buf = new Uint8Array(16 + nb.length);
    for (let i = 0; i < 16; i++) buf[i] = parseInt(ns.slice(i * 2, i * 2 + 2), 16);
    buf.set(nb, 16);
    const h = sha1(buf);
    h[6] = (h[6] & 0x0f) | 0x50;
    h[8] = (h[8] & 0x3f) | 0x80;
    return hex(h);
}

/** Устойчивый номер от частей («родитель + ключ»): части — строками, без склейки «a_b» (иначе «a_b»+«c» = «a»+«b_c»). */
export function stableId(...parts) {
    return uuidV5(JSON.stringify(parts.map((p) => String(p == null ? '' : p))), RECORDS_NAMESPACE);
}

/** Номер строки-ребёнка: от uuid-родителя — устойчивый, от старого родителя — прежний составной номер. */
export function childId(parentId, legacyId, ...parts) {
    return isUuid(String(parentId || '')) ? stableId(parentId, ...parts) : String(legacyId);
}

export const RbiIds = { newId, stableId, childId, isUuid, uuidV5, RECORDS_NAMESPACE };
if (typeof window !== 'undefined') window.RbiIds = RbiIds;
