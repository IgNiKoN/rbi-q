/* Файл: js/services/storage/storage-offline-cache.utils.js
 * Сбор URL по scope автокэша + форматирование прогресса (N/M + МБ).
 */

const RBI_OFFLINE_CACHE_CONCURRENCY = 8;
const RBI_OFFLINE_CACHE_BATCH_PAUSE_MS = 30;
/** Оценка размера одного файла, если в FILE_REGISTRY ещё нет size_bytes (типичное фото ~200 КБ). */
const RBI_OFFLINE_CACHE_DEFAULT_FILE_BYTES = 200 * 1024;

function rbiFormatBytesMb(bytes) {
    const mb = Math.max(0, Number(bytes) || 0) / (1024 * 1024);
    // Всегда одна десятичная — чтобы ширина текста не прыгала (0.0 / 12.3 / 120.0).
    return mb.toFixed(1);
}

/**
 * Обновляет DOM тоста без смены длины строки целиком.
 * Ожидает узлы: #mini-cache-toast-count, #mini-cache-toast-dl, #mini-cache-toast-left, #mini-cache-toast-bar, #mini-cache-toast-status
 */
function rbiApplyCacheProgressToDom(root, { done, total, downloadedBytes, remainingBytes, phase, fetchedCount, skippedCount }) {
    if (!root) return;
    const n = Number(done) || 0;
    const m = Number(total) || 0;
    const dl = rbiFormatBytesMb(downloadedBytes);
    const left = rbiFormatBytesMb(remainingBytes);
    const pct = m > 0 ? Math.min(100, Math.round((n / m) * 100)) : 0;
    const fetched = Number(fetchedCount) || 0;
    const skipped = Number(skippedCount) || 0;

    const countEl = root.querySelector('#mini-cache-toast-count');
    const dlEl = root.querySelector('#mini-cache-toast-dl');
    const leftEl = root.querySelector('#mini-cache-toast-left');
    const barEl = root.querySelector('#mini-cache-toast-bar');
    const statusEl = root.querySelector('#mini-cache-toast-status');
    const spinEl = root.querySelector('#mini-cache-toast-spin');

    if (phase === 'prepare') {
        if (statusEl) statusEl.textContent = 'Подготовка…';
        if (countEl) countEl.textContent = '— / —';
        if (dlEl) dlEl.textContent = '0.0';
        if (leftEl) leftEl.textContent = '—';
        if (barEl) barEl.style.width = '0%';
        if (spinEl) spinEl.classList.remove('hidden');
        return;
    }
    if (phase === 'empty') {
        if (statusEl) statusEl.textContent = 'Нет файлов';
        if (countEl) countEl.textContent = '0 / 0';
        if (dlEl) dlEl.textContent = '0.0';
        if (leftEl) leftEl.textContent = '0.0';
        if (barEl) barEl.style.width = '0%';
        if (spinEl) spinEl.classList.add('hidden');
        return;
    }
    if (phase === 'done_skip') {
        if (statusEl) statusEl.textContent = 'Уже сохранено';
        if (countEl) countEl.textContent = `${m} / ${m}`;
        if (dlEl) dlEl.textContent = dl;
        if (leftEl) leftEl.textContent = '0.0';
        if (barEl) barEl.style.width = '100%';
        if (spinEl) spinEl.classList.add('hidden');
        return;
    }
    if (phase === 'done_ok' || phase === 'done_fail') {
        if (statusEl) {
            statusEl.textContent = phase === 'done_fail'
                ? `Готово · новых ${fetched}`
                : (fetched > 0 ? `Готово · новых ${fetched}` : 'Уже сохранено');
        }
        if (countEl) countEl.textContent = `${n} / ${m || n}`;
        if (dlEl) dlEl.textContent = dl;
        if (leftEl) leftEl.textContent = '0.0';
        if (barEl) barEl.style.width = '100%';
        if (spinEl) spinEl.classList.add('hidden');
        return;
    }

    // В процессе: явно разделяем сеть vs уже на устройстве.
    if (statusEl) {
        statusEl.textContent = fetched > 0
            ? `Новых ${fetched} · уже ${skipped}`
            : (skipped > 0 ? `Проверка · уже ${skipped}` : 'Кэширование');
    }
    if (countEl) countEl.textContent = `${n} / ${m}`;
    if (dlEl) dlEl.textContent = dl;
    if (leftEl) leftEl.textContent = left;
    if (barEl) barEl.style.width = pct + '%';
    if (spinEl) spinEl.classList.remove('hidden');
}

/** Text fallback — предпочтительно rbiApplyCacheProgressToDom */
function rbiFormatCacheProgress({ done, total, downloadedBytes, remainingBytes, phase }) {
    const n = Number(done) || 0;
    const m = Number(total) || 0;
    const dl = rbiFormatBytesMb(downloadedBytes);
    const left = remainingBytes != null ? rbiFormatBytesMb(remainingBytes) : null;
    if (phase === 'prepare') return 'Подготовка файлов...';
    if (phase === 'done_fail') return `Готово: ${n} загружено, часть пропущена · ${dl} МБ`;
    if (phase === 'done_ok') return `Готово: загружено ${n} · ${dl} МБ`;
    if (phase === 'done_skip') return 'Все файлы уже сохранены';
    if (phase === 'empty') return 'Нет файлов для загрузки';
    if (left != null) return `Кэширование: ${n}/${m} · ${dl} МБ / осталось ~${left} МБ`;
    return `Кэширование: ${n}/${m} · ${dl} МБ`;
}

function rbiNormalizeCloudUrlList(value) {
    const list = typeof window.normalizeItemPhotos === 'function'
        ? window.normalizeItemPhotos(value)
        : (Array.isArray(value) ? value : (value != null && value !== '' ? [value] : []));
    return list.filter((url) => typeof url === 'string' && (url.startsWith('http') || url.startsWith('cloud://')));
}

/**
 * В офлайн-кэш берём только наш Storage (Supabase).
 * Внешние URL (w3.org dummy.pdf и т.п.) дают CORS и только шумят в консоли.
 */
function rbiIsOfflineCacheableUrl(url) {
    const s = String(url || '');
    if (!s) return false;
    if (s.startsWith('cloud://') || s.startsWith('local://')) return true;
    if (!s.startsWith('http')) return false;
    return s.includes('/storage/v1/object/');
}

function rbiRecordDateMs(record) {
    if (!record || typeof record !== 'object') return 0;
    const raw = record.date || record.updatedAt || record.updated_at || record.createdAt || record.created_at || 0;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
}

/**
 * Собирает URL для офлайн-кэша.
 * P2-0060: охват «Фото и PDF заранее» — mine30 (мои объекты за 30 дней + фото открытых замечаний моих объектов, отбор —
 * window.RBI.offlineFiles.select сервиса офлайна), all30 (= days30), none (заранее ничего).
 * @param {'all'|'days30'|'all30'|'mine30'|'none'|'knowledge'|'reports'} scope
 * @returns {{ url: string, sortTs: number, kind: string }[]}
 */
function rbiCollectOfflineCacheUrls(scope = 'all') {
    let scoped = scope === 'all30' ? 'days30' : (scope || 'all');
    if (scoped === 'none') return [];
    const offlineFiles = window.RBI && window.RBI.offlineFiles;
    // без сервиса офлайна (старое приложение) «мои за 30 дней» — как «все за 30 дней»
    if (scoped === 'mine30' && !(offlineFiles && typeof offlineFiles.select === 'function')) scoped = 'days30';
    const mine = scoped === 'mine30' && typeof contractorArray !== 'undefined' && Array.isArray(contractorArray)
        ? offlineFiles.select(contractorArray) : null;
    const items = [];
    const seen = new Set();

    const add = (url, sortTs, kind) => {
        if (!url || seen.has(url)) return;
        if (!(url.startsWith('http') || url.startsWith('cloud://'))) return;
        if (url.startsWith('http') && !rbiIsOfflineCacheableUrl(url)) return;
        seen.add(url);
        items.push({ url, sortTs: sortTs || 0, kind: kind || 'file' });
    };

    const addMany = (value, sortTs, kind) => {
        rbiNormalizeCloudUrlList(value).forEach((url) => add(url, sortTs, kind));
    };

    const wantInspections = scoped === 'all' || scoped === 'days30' || scoped === 'mine30';
    const wantKnowledge = scoped === 'all' || scoped === 'knowledge';
    const wantReports = scoped === 'all' || scoped === 'reports';
    const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;

    if (wantInspections && typeof contractorArray !== 'undefined' && Array.isArray(contractorArray)) {
        contractorArray.forEach((check) => {
            const ts = rbiRecordDateMs(check);
            if (scoped === 'days30' && ts < cutoff30) return;
            if (mine) {
                // P2-0060: мой объект за 30 дней — все фото; старше — только фото открытых замечаний (пункты из отбора)
                const pick = check ? mine.get(check.id) : null;
                if (!pick || !check.photos) return;
                if (pick === 'all') Object.values(check.photos).forEach((v) => addMany(v, ts, 'inspection_photo'));
                else pick.forEach((item) => addMany(check.photos[item], ts, 'inspection_photo'));
                return;
            }
            if (check && check.photos) {
                Object.values(check.photos).forEach((v) => addMany(v, ts, 'inspection_photo'));
            }
        });
    }

    // Логотип бренда — любой scope офлайн-пакета (маленький файл, нужен в настройках/отчётах).
    {
        const brandLogo = (typeof window.appSettings !== 'undefined' && window.appSettings && window.appSettings.brandLogo)
            ? window.appSettings.brandLogo
            : ((typeof appSettings !== 'undefined' && appSettings && appSettings.brandLogo) ? appSettings.brandLogo : '');
        if (brandLogo) addMany(brandLogo, Date.now(), 'brand_logo');
    }

    // FMEA: фото дефектов в архиве (раньше не попадали в «Скачать всё»).
    if (wantInspections) {
        const fmeaList = (typeof window.rbi_fmeaRecords !== 'undefined' && Array.isArray(window.rbi_fmeaRecords))
            ? window.rbi_fmeaRecords
            : [];
        fmeaList.forEach((f) => {
            if (!f || f._deleted === true || f.is_deleted === true) return;
            const ts = rbiRecordDateMs(f);
            if ((scoped === 'days30' || scoped === 'mine30') && ts < cutoff30) return;
            const defects = Array.isArray(f.defects) ? f.defects : [];
            defects.forEach((d) => {
                if (d && d.photo) addMany(d.photo, ts, 'fmea_photo');
            });
        });
    }

    if (wantInspections && scoped === 'all') {
        if (typeof window.rbi_meetingsData !== 'undefined' && Array.isArray(window.rbi_meetingsData)) {
            window.rbi_meetingsData.forEach((m) => {
                addMany(m && m.qDayPhoto, rbiRecordDateMs(m), 'meeting_photo');
            });
        }
        if (typeof window.rbi_practicesData !== 'undefined' && Array.isArray(window.rbi_practicesData)) {
            window.rbi_practicesData.forEach((p) => {
                const ts = rbiRecordDateMs(p);
                addMany(p && p.photoBefore, ts, 'practice_file');
                addMany(p && p.photoAfter, ts, 'practice_file');
            });
        }
    }

    if (wantKnowledge) {
        if (typeof customTwiCards !== 'undefined' && Array.isArray(customTwiCards)) {
            customTwiCards.forEach((twi) => {
                const ts = rbiRecordDateMs(twi);
                addMany(twi && twi.photoGood, ts, 'twi_photo');
                addMany(twi && twi.photoBad, ts, 'twi_photo');
                addMany(twi && twi.pdfData, ts, 'twi_pdf');
                if (Array.isArray(twi && twi.steps)) {
                    twi.steps.forEach((step) => {
                        if (!step) return;
                        addMany(step.photo, ts, 'twi_photo');
                        addMany(step.photoGood, ts, 'twi_photo');
                        addMany(step.photoBad, ts, 'twi_photo');
                    });
                }
            });
        }
        if (typeof customNodes !== 'undefined' && Array.isArray(customNodes)) {
            customNodes.forEach((node) => {
                const ts = rbiRecordDateMs(node);
                addMany(node && node.img, ts, 'node_file');
                if (Array.isArray(node && node.attachments)) {
                    node.attachments.forEach((att) => {
                        addMany(att && (att.url || att.data || att.file_url || ''), ts, 'node_file');
                    });
                }
            });
        }
        if (typeof customDocs !== 'undefined' && Array.isArray(customDocs)) {
            customDocs.forEach((doc) => {
                addMany(doc && doc.pdfData, rbiRecordDateMs(doc), 'custom_doc_pdf');
            });
        }
        const kb = (typeof window.appAssistantData !== 'undefined' && Array.isArray(window.appAssistantData))
            ? window.appAssistantData
            : [];
        kb.forEach((row) => {
            const ts = rbiRecordDateMs(row);
            addMany(row && (row.file_url || row.fileUrl || row.url || row.pdfData || row.content_url), ts, 'assistant_kb_file');
            if (row && row.attachments) addMany(row.attachments, ts, 'assistant_kb_file');
            if (row && row.photos) Object.values(row.photos).forEach((v) => addMany(v, ts, 'assistant_kb_file'));
        });

        // Эталоны: вложенный PDF + фото узлов / v18 — раньше не попадали в «Скачать всё».
        const etalonActs = (typeof window.etalonActsArray !== 'undefined' && Array.isArray(window.etalonActsArray))
            ? window.etalonActsArray
            : [];
        etalonActs.forEach((act) => {
            if (!act || act._deleted === true || act.is_deleted === true) return;
            const ts = rbiRecordDateMs(act);
            const d = act.details || {};
            addMany(d.pdfData, ts, 'etalon_file');
            if (Array.isArray(d.elements)) {
                d.elements.forEach((el) => {
                    if (!el) return;
                    addMany(el.photo, ts, 'etalon_file');
                    addMany(el.photos, ts, 'etalon_file');
                });
            }
            const v18 = d.actV18 || d.v18 || null;
            if (v18 && Array.isArray(v18.photos)) {
                v18.photos.forEach((p) => addMany(p && p.photo, ts, 'etalon_file'));
            }
            // Любые другие storage-URL внутри акта (лимит выше — у эталона много вложений).
            if (typeof window.rbiCollectCloudStorageUrls === 'function') {
                window.rbiCollectCloudStorageUrls(act, 120).forEach((url) => add(url, ts, 'etalon_file'));
            }
        });
    }

    if (wantReports && typeof reportsArray !== 'undefined' && Array.isArray(reportsArray)) {
        reportsArray.forEach((rep) => {
            // В очередь — облачные URL; наличие blob проверяет download (RAM или IDB).
            if (rep && rep.file_url && typeof rep.file_url === 'string' && rep.file_url.startsWith('http')) {
                add(rep.file_url, rbiRecordDateMs(rep), 'report_pdf');
            }
        });
    }

    // Планы СК (legacy ConstManager) — в sync-collect; v2 floors/units добирает async в downloadMissingCloudFiles.
    if (scoped === 'all') {
        const floors = (window.ConstManager && Array.isArray(window.ConstManager.floors))
            ? window.ConstManager.floors
            : [];
        floors.forEach((flr) => {
            if (!flr || flr._deleted === true || flr.is_deleted === true) return;
            addMany(flr.pdf_url || flr.pdfUrl, rbiRecordDateMs(flr), 'construction_plan_pdf');
        });
    }

    if (scoped === 'all' || scoped === 'days30' || scoped === 'mine30') {
        items.sort((a, b) => (b.sortTs || 0) - (a.sortTs || 0));
    }

    return items;
}

/**
 * Планы СК из IDB: construction_floors + floors_v2 + units_v2 (pdf_url).
 * Async — вызывается из downloadMissingCloudFiles и дополняет sync-collect.
 * @returns {Promise<{ url: string, sortTs: number, kind: string }[]>}
 */
async function rbiCollectConstructionPlanPdfUrls() {
    const items = [];
    const seen = new Set();
    const add = (url, sortTs) => {
        if (!url || typeof url !== 'string' || !url.startsWith('http') || seen.has(url)) return;
        if (!rbiIsOfflineCacheableUrl(url)) return;
        seen.add(url);
        items.push({ url, sortTs: sortTs || 0, kind: 'construction_plan_pdf' });
    };

    const pullStore = async (storeName) => {
        if (!storeName || typeof dbGetAll !== 'function') return;
        try {
            const rows = await dbGetAll(storeName) || [];
            rows.forEach((row) => {
                if (!row || row._deleted === true || row.is_deleted === true) return;
                add(row.pdf_url || row.pdfUrl || '', rbiRecordDateMs(row));
            });
        } catch (e) {
            console.warn('[OfflineCache] collect construction store failed', storeName, e);
        }
    };

    const stores = (typeof STORES !== 'undefined') ? STORES : {};
    await pullStore(stores.CONST_FLOORS || 'construction_floors');
    await pullStore(stores.CONST_FLOORS_V2 || 'construction_floors_v2');
    await pullStore(stores.CONST_UNITS_V2 || 'construction_units_v2');

    return items;
}

/**
 * Оценка байт URL: size_bytes из registry, иначе avgKnown, иначе дефолт ~200 КБ.
 */
function rbiEstimateUrlBytes(url, registryByUrl, avgKnownBytes) {
    const item = registryByUrl && registryByUrl.get(url);
    if (item) {
        const n = Number(item.size_bytes || item.sizeBytes || 0) || 0;
        if (n > 0) return n;
    }
    const avg = Number(avgKnownBytes) || 0;
    if (avg > 0) return avg;
    return RBI_OFFLINE_CACHE_DEFAULT_FILE_BYTES;
}

function rbiIsRegistryCached(url, registryByUrl) {
    const item = registryByUrl && registryByUrl.get(url);
    if (!item) return false;
    const status = item.cache_status || item.cacheStatus || '';
    return status === 'cached_cloud' || status === 'cached_local';
}

window.RBI_OFFLINE_CACHE_CONCURRENCY = RBI_OFFLINE_CACHE_CONCURRENCY;
window.RBI_OFFLINE_CACHE_BATCH_PAUSE_MS = RBI_OFFLINE_CACHE_BATCH_PAUSE_MS;
window.RBI_OFFLINE_CACHE_DEFAULT_FILE_BYTES = RBI_OFFLINE_CACHE_DEFAULT_FILE_BYTES;
window.rbiFormatBytesMb = rbiFormatBytesMb;
window.rbiFormatCacheProgress = rbiFormatCacheProgress;
window.rbiApplyCacheProgressToDom = rbiApplyCacheProgressToDom;
window.rbiCollectOfflineCacheUrls = rbiCollectOfflineCacheUrls;
window.rbiCollectConstructionPlanPdfUrls = rbiCollectConstructionPlanPdfUrls;
window.rbiIsOfflineCacheableUrl = rbiIsOfflineCacheableUrl;
window.rbiEstimateUrlBytes = rbiEstimateUrlBytes;
window.rbiIsRegistryCached = rbiIsRegistryCached;
