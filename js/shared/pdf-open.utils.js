/* js/shared/pdf-open.utils.js — предпросмотр PDF + «Открыть в браузере» (OOM-safe lazy pages) */
(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    var MODAL_ID = 'rbi-pdf-open-sheet';

    function toast(msg) {
        if (typeof window.showToast === 'function') window.showToast(msg);
    }

    function isOnline() {
        return navigator.onLine !== false;
    }

    function ensurePdfBlob(blob) {
        if (!blob) return null;
        if (blob.type === 'application/pdf') return blob;
        return new Blob([blob], { type: 'application/pdf' });
    }

    function openUrlSync(url) {
        if (!url) return false;
        try {
            var a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
            return true;
        } catch (_) {
            try {
                var win = window.open(url, '_blank');
                return !!(win && !win.closed);
            } catch (e2) {
                return false;
            }
        }
    }

    function triggerDownload(url, fileName) {
        var a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'document.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async function shareFile(file, title) {
        if (!file) return false;
        try {
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: title || file.name,
                    files: [file]
                });
                return true;
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return true;
            console.warn('[rbiOpenPdfDocument] share failed', e);
        }
        return false;
    }

    function isSheetOpen() {
        var modal = document.getElementById(MODAL_ID);
        return !!(modal && !modal.classList.contains('hidden'));
    }

    function destroyPreview(modal) {
        if (!modal) return;
        modal._rbiPdfGen = (modal._rbiPdfGen || 0) + 1;
        if (modal._rbiPdfIo) {
            try { modal._rbiPdfIo.disconnect(); } catch (_) { /* ignore */ }
            modal._rbiPdfIo = null;
        }
        if (modal._rbiPdfDoc) {
            try {
                if (typeof modal._rbiPdfDoc.destroy === 'function') {
                    modal._rbiPdfDoc.destroy();
                }
            } catch (_) { /* ignore */ }
            modal._rbiPdfDoc = null;
        }
        var pages = document.getElementById('rbi-pdf-preview-pages');
        if (pages) {
            // Сбрасываем bitmap canvas до удаления DOM — иначе iOS долго держит GPU/RAM.
            try {
                var canvases = pages.querySelectorAll('canvas');
                for (var i = 0; i < canvases.length; i++) {
                    var c = canvases[i];
                    try {
                        var ctx = c.getContext('2d');
                        if (ctx) ctx.clearRect(0, 0, c.width || 0, c.height || 0);
                    } catch (_) { /* ignore */ }
                    c.width = 0;
                    c.height = 0;
                }
            } catch (_) { /* ignore */ }
            pages.innerHTML = '';
        }
        var scrollEl = document.getElementById('rbi-pdf-preview-scroll');
        if (scrollEl) scrollEl.scrollTop = 0;
    }

    function revokeOwnedUrl(modal) {
        if (!modal) return;
        var url = modal.dataset.blobUrl;
        if (url && url.indexOf('blob:') === 0) {
            try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
        }
        delete modal.dataset.blobUrl;
        delete modal.dataset.openUrl;
        delete modal.dataset.title;
        delete modal.dataset.fileName;
        modal._rbiPdfFile = null;
        modal._rbiPdfBuffer = null;
    }

    /** Полный purge: PDF.js + canvas + IO + blob: + буферы. Идемпотентно. */
    function closeSheet() {
        var modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        destroyPreview(modal);
        revokeOwnedUrl(modal);
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.classList.remove('modal-open');
    }

    if (!window.__rbiPdfEscBound) {
        window.__rbiPdfEscBound = true;
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isSheetOpen()) {
                closeSheet();
            }
        });
    }

    function ensureSheet() {
        var modal = document.getElementById(MODAL_ID);
        if (modal && modal.dataset.pdfUi === 'preview-v2') return modal;
        if (modal) {
            try {
                destroyPreview(modal);
                revokeOwnedUrl(modal);
                modal.remove();
            } catch (_) { /* ignore */ }
        }

        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.dataset.pdfUi = 'preview-v2';
        modal.className = 'fixed inset-0 z-[9999] hidden flex-col bg-slate-900/95';
        modal.innerHTML =
            '<div class="bg-slate-800 text-white px-3 py-2.5 flex items-center gap-2 shadow-md shrink-0 z-10">' +
            '  <div id="rbi-pdf-open-title" class="font-bold text-sm truncate flex-1 min-w-0">PDF</div>' +
            '  <button type="button" data-pdf-open-action="open" class="px-2.5 py-1.5 rounded-lg bg-indigo-500 text-[10px] font-black uppercase tracking-wide shrink-0">В браузере</button>' +
            '  <button type="button" data-pdf-open-action="share" class="px-2.5 py-1.5 rounded-lg bg-slate-700 text-[10px] font-bold shrink-0">Поделиться</button>' +
            '  <button type="button" data-pdf-open-action="download" class="px-2.5 py-1.5 rounded-lg bg-orange-500/90 text-[10px] font-semibold shrink-0">Скачать</button>' +
            '  <button type="button" data-pdf-open-action="close" class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0 font-bold" aria-label="Закрыть">✕</button>' +
            '</div>' +
            '<div id="rbi-pdf-open-hint" class="shrink-0 px-3 py-2.5 text-center text-[12px] font-bold leading-snug bg-amber-400 text-slate-900 border-b border-amber-500"></div>' +
            '<div id="rbi-pdf-preview-scroll" class="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-slate-700">' +
            '  <div id="rbi-pdf-preview-pages" class="p-3 space-y-3 max-w-3xl mx-auto"></div>' +
            '</div>';

        (document.getElementById('app-modals') || document.body).appendChild(modal);

        modal.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('[data-pdf-open-action]') : null;
            if (!btn || !modal.contains(btn)) return;
            var action = btn.getAttribute('data-pdf-open-action');
            var openUrl = modal.dataset.openUrl || modal.dataset.blobUrl || '';
            var fileName = modal.dataset.fileName || 'document.pdf';

            if (action === 'close') {
                closeSheet();
                return;
            }
            if (action === 'open') {
                // Sync на клике — нативный viewer Safari/Chrome.
                if (!openUrlSync(openUrl)) {
                    toast('Не удалось открыть вкладку. Попробуйте «Скачать».');
                }
                return;
            }
            if (action === 'download') {
                if (!openUrl) {
                    toast('Файл недоступен');
                    return;
                }
                triggerDownload(openUrl, fileName);
                toast('Файл сохранён');
                return;
            }
            if (action === 'share') {
                var file = modal._rbiPdfFile;
                if (!file) {
                    toast('Нечего отправить — скачайте файл');
                    return;
                }
                shareFile(file, modal.dataset.title || fileName);
            }
        });

        return modal;
    }

    async function renderLazyPreview(modal, arrayBuffer) {
        var pagesRoot = document.getElementById('rbi-pdf-preview-pages');
        if (!pagesRoot) return;

        destroyPreview(modal);
        pagesRoot.innerHTML = '<div class="text-white/90 text-center p-8 text-sm font-semibold">Загрузка предпросмотра…</div>';

        var pdfjs = null;
        try { pdfjs = window.rbiPdfjs ? await window.rbiPdfjs() : window.pdfjsLib; } catch (_) { pdfjs = null; }
        if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
            pagesRoot.innerHTML =
                '<div class="text-amber-200 text-center p-6 text-sm font-semibold">' +
                'Предпросмотр недоступен. Нажмите «В браузере».</div>';
            return;
        }

        var gen = modal._rbiPdfGen;
        try {
            var dataCopy = arrayBuffer.slice ? arrayBuffer.slice(0) : arrayBuffer;
            var pdf = await pdfjs.getDocument({ data: dataCopy }).promise;
            if (gen !== modal._rbiPdfGen) {
                try { pdf.destroy(); } catch (_) { /* ignore */ }
                return;
            }
            modal._rbiPdfDoc = pdf;
            pagesRoot.innerHTML = '';

            var scrollEl = document.getElementById('rbi-pdf-preview-scroll');
            var maxW = Math.max(280, Math.min((scrollEl && scrollEl.clientWidth) || window.innerWidth, 900) - 24);

            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    var slot = entry.target;
                    if (!slot || slot.dataset.rendered === '1') return;
                    slot.dataset.rendered = '1';
                    io.unobserve(slot);
                    renderOnePage(modal, pdf, slot, gen, maxW);
                });
            }, {
                root: scrollEl || null,
                rootMargin: '200px 0px',
                threshold: 0.01
            });
            modal._rbiPdfIo = io;

            for (var pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                var slot = document.createElement('div');
                slot.className = 'bg-white rounded-lg shadow overflow-hidden';
                slot.style.minHeight = Math.round(maxW * 1.35) + 'px';
                slot.dataset.pageNum = String(pageNum);
                slot.innerHTML =
                    '<div class="text-slate-400 text-center text-[11px] font-semibold py-10">Стр. ' +
                    pageNum + '…</div>';
                pagesRoot.appendChild(slot);
                io.observe(slot);
            }
        } catch (e) {
            console.error('[rbiOpenPdfDocument] preview', e);
            pagesRoot.innerHTML =
                '<div class="text-red-300 text-center p-6 text-sm font-semibold">' +
                'Не удалось построить предпросмотр. Откройте в браузере.</div>';
        }
    }

    async function renderOnePage(modal, pdf, slot, gen, maxW) {
        if (!slot || gen !== modal._rbiPdfGen) return;
        var pageNum = parseInt(slot.dataset.pageNum || '0', 10);
        if (!pageNum) return;
        try {
            var page = await pdf.getPage(pageNum);
            if (gen !== modal._rbiPdfGen) return;
            var base = page.getViewport({ scale: 1 });
            // Превью лёгкое: dpr=1, без HiDPI — меньше RAM, зум — в браузере.
            var fit = maxW / base.width;
            var viewport = page.getViewport({ scale: fit });
            var canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
            canvas.style.display = 'block';
            var ctx = canvas.getContext('2d', { alpha: false });
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            if (gen !== modal._rbiPdfGen) return;
            slot.innerHTML = '';
            slot.style.minHeight = '';
            slot.appendChild(canvas);
        } catch (e) {
            if (gen !== modal._rbiPdfGen) return;
            slot.innerHTML =
                '<div class="text-red-500 text-center text-[11px] font-semibold py-8">Стр. ' +
                pageNum + ': ошибка</div>';
        }
    }

    function showViewer(opts) {
        var modal = ensureSheet();
        destroyPreview(modal);
        revokeOwnedUrl(modal);

        var title = opts.title || 'PDF';
        var fileName = opts.fileName || 'document.pdf';
        var httpsUrl = opts.httpsUrl || '';
        var blobUrl = opts.blobUrl || '';
        var fromLocal = !!blobUrl;
        var openUrl = blobUrl || httpsUrl || '';

        modal.dataset.title = title;
        modal.dataset.fileName = fileName;
        modal.dataset.openUrl = openUrl || '';
        if (blobUrl) modal.dataset.blobUrl = blobUrl;
        modal._rbiPdfFile = opts.file || null;
        modal._rbiPdfBuffer = opts.arrayBuffer || null;

        var titleEl = document.getElementById('rbi-pdf-open-title');
        if (titleEl) titleEl.textContent = title;

        var hintEl = document.getElementById('rbi-pdf-open-hint');
        if (hintEl) {
            hintEl.textContent = fromLocal
                ? 'Для масштабирования откройте файл по кнопке «В браузере».'
                : 'Локальной копии нет. Для просмотра и масштабирования нажмите «В браузере».';
        }

        var shareBtn = modal.querySelector('[data-pdf-open-action="share"]');
        if (shareBtn) shareBtn.classList.toggle('hidden', !modal._rbiPdfFile);

        var pagesRoot = document.getElementById('rbi-pdf-preview-pages');
        if (!opts.arrayBuffer) {
            if (pagesRoot) {
                pagesRoot.innerHTML =
                    '<div class="text-white/90 text-center p-8 text-sm font-semibold">' +
                    'Нет локального файла для предпросмотра.<br>Нажмите «В браузере».</div>';
            }
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.classList.add('modal-open');

        if (opts.arrayBuffer) {
            renderLazyPreview(modal, opts.arrayBuffer);
        }
    }

    /**
     * @param {{ title?: string, fileName?: string, httpsUrl?: string, blob?: Blob, arrayBuffer?: ArrayBuffer }} opts
     */
    window.rbiOpenPdfDocument = async function rbiOpenPdfDocument(opts) {
        opts = opts || {};
        var title = opts.title || 'PDF';
        var fileName = opts.fileName || 'document.pdf';
        if (!/\.pdf$/i.test(fileName)) fileName = fileName + '.pdf';

        var httpsUrl = (opts.httpsUrl && String(opts.httpsUrl).indexOf('http') === 0)
            ? String(opts.httpsUrl)
            : '';

        var blob = ensurePdfBlob(opts.blob || null);
        var arrayBuffer = opts.arrayBuffer || null;
        if (!blob && arrayBuffer) {
            blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        }
        if (blob && !arrayBuffer) {
            try {
                arrayBuffer = await blob.arrayBuffer();
            } catch (_) {
                arrayBuffer = null;
            }
        }

        if (!blob && !httpsUrl) {
            toast('PDF не найден');
            return { ok: false, mode: 'empty' };
        }

        var blobUrl = blob ? URL.createObjectURL(blob) : '';
        var file = blob
            ? new File([blob], fileName, { type: 'application/pdf' })
            : null;

        // Всегда сначала предпросмотр; браузер — по кнопке (живой жест).
        // https только если нет локального blob.
        showViewer({
            title: title,
            fileName: fileName,
            httpsUrl: blobUrl ? '' : httpsUrl,
            blobUrl: blobUrl,
            file: file,
            arrayBuffer: arrayBuffer
        });

        return {
            ok: true,
            mode: arrayBuffer ? 'preview-local' : 'preview-network'
        };
    };

    window.rbiClosePdfDocumentSheet = closeSheet;
    window.rbiIsPdfDocumentSheetOpen = isSheetOpen;

    /**
     * Единое сохранение/докачка облачного PDF в офлайн-стор (PhotoManager → app_photos ArrayBuffer).
     * Фото осмотров и прочие не-PDF по-прежнему через PhotoManager.downloadForOffline напрямую.
     * @param {string} url
     * @param {{ skipMemoryCache?: boolean }} [opts]
     * @returns {Promise<{ ok: boolean, bytes: number, fetched: boolean }>}
     */
    window.rbiCacheCloudPdf = async function rbiCacheCloudPdf(url, opts) {
        opts = opts || {};
        if (!url || typeof url !== 'string' || url.indexOf('http') !== 0) {
            return { ok: false, bytes: 0, fetched: false };
        }
        if (typeof window.rbiIsOfflineCacheableUrl === 'function' && !window.rbiIsOfflineCacheableUrl(url)) {
            return { ok: false, bytes: 0, fetched: false };
        }
        if (typeof PhotoManager === 'undefined' || typeof PhotoManager.downloadForOffline !== 'function') {
            console.warn('[rbiCacheCloudPdf] PhotoManager недоступен');
            return { ok: false, bytes: 0, fetched: false };
        }
        try {
            var dl = await PhotoManager.downloadForOffline(url, {
                skipMemoryCache: opts.skipMemoryCache !== false
            });
            return {
                ok: !!(dl && dl.ok),
                bytes: (dl && dl.bytes) || 0,
                fetched: !!(dl && dl.fetched)
            };
        } catch (e) {
            console.warn('[rbiCacheCloudPdf]', e);
            return { ok: false, bytes: 0, fetched: false };
        }
    };

    /** URL похож на PDF (для очереди кэша: PDF → rbiCacheCloudPdf, остальное → PhotoManager). */
    window.rbiIsCloudPdfUrl = function rbiIsCloudPdfUrl(url) {
        var s = String(url || '').toLowerCase();
        if (!s || s.indexOf('http') !== 0) return false;
        if (/\.pdf(\?|#|$)/.test(s)) return true;
        if (s.indexOf('/reports/') !== -1) return true;
        if (s.indexOf('construction-plans') !== -1) return true;
        if (s.indexOf('library-docs') !== -1) return true;
        return false;
    };

    /**
     * Единая загрузка облачного PDF: IDB/PhotoManager → (online) rbiCacheCloudPdf → fetch.
     * @param {string} url
     * @returns {Promise<ArrayBuffer>}
     */
    window.rbiLoadCloudPdfArrayBuffer = async function rbiLoadCloudPdfArrayBuffer(url) {
        if (!url || typeof url !== 'string') {
            throw new Error('Нет ссылки на PDF');
        }

        async function fromPhotoCache(key) {
            if (!key) return null;
            try {
                if (typeof PhotoManager !== 'undefined' && typeof PhotoManager.getAsyncUrl === 'function') {
                    const localU = await PhotoManager.getAsyncUrl(key);
                    if (localU && String(localU).indexOf('blob:') === 0) {
                        const res = await fetch(localU);
                        if (res.ok) return await res.arrayBuffer();
                    }
                }
            } catch (_) { /* ignore */ }
            try {
                if (typeof dbGet === 'function' && window.STORES && STORES.PHOTOS) {
                    const row = await dbGet(STORES.PHOTOS, key);
                    if (row && row.data) {
                        if (row.data instanceof ArrayBuffer) return row.data.slice(0);
                        if (typeof Blob !== 'undefined' && row.data instanceof Blob) {
                            return await row.data.arrayBuffer();
                        }
                        if (ArrayBuffer.isView && ArrayBuffer.isView(row.data)) {
                            return row.data.buffer.slice(
                                row.data.byteOffset,
                                row.data.byteOffset + row.data.byteLength
                            );
                        }
                    }
                }
            } catch (_) { /* ignore */ }
            return null;
        }

        var buf = await fromPhotoCache(url);
        if (buf) return buf;

        if (navigator.onLine === false) {
            throw new Error('PDF не кэширован офлайн. Нужен интернет или «Скачать всё».');
        }

        try {
            await window.rbiCacheCloudPdf(url, { skipMemoryCache: true });
            buf = await fromPhotoCache(url);
            if (buf) return buf;
        } catch (_) { /* ignore */ }

        var res = typeof rbiFetchCloudFileNoBrowserCache === 'function'
            ? await rbiFetchCloudFileNoBrowserCache(url)
            : await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('Не удалось скачать PDF');
        buf = await res.arrayBuffer();
        // После network fetch — положить в стандартный стор (best-effort).
        try {
            if (typeof PhotoManager !== 'undefined' && typeof PhotoManager.downloadForOffline === 'function') {
                // Уже скачали: повторный downloadForOffline найдёт сеть снова —
                // пишем напрямую в IDB если есть buffer API через cache call after put.
                // Проще: rbiCacheCloudPdf снова сходит в сеть; skip — put buffer manually.
                if (typeof dbPut === 'function' && window.STORES && STORES.PHOTOS && buf) {
                    var now = new Date().toISOString();
                    await dbPut(STORES.PHOTOS, {
                        id: url,
                        data: buf.slice ? buf.slice(0) : buf,
                        mimeType: 'application/pdf',
                        mime_type: 'application/pdf',
                        sizeBytes: buf.byteLength,
                        size_bytes: buf.byteLength,
                        createdAt: now,
                        created_at: now,
                        cachedAt: now,
                        cached_at: now,
                        lastAccessedAt: now,
                        last_accessed_at: now,
                        sourceUrl: url,
                        source_url: url,
                        cacheStatus: 'cached_cloud',
                        cache_status: 'cached_cloud',
                        entityType: 'cloud_pdf',
                        entity_type: 'cloud_pdf'
                    });
                    if (window.RbiStorageManager && typeof window.RbiStorageManager.markCloudFileCached === 'function') {
                        await window.RbiStorageManager.markCloudFileCached(url, buf.byteLength, 'application/pdf');
                    }
                }
            }
        } catch (_) { /* ignore */ }
        return buf;
    };

    window.RBI = window.RBI || {};
    window.RBI.utils = window.RBI.utils || {};
    window.RBI.utils.pdfOpen = {
        open: window.rbiOpenPdfDocument,
        close: closeSheet,
        isOpen: isSheetOpen,
        cacheCloud: window.rbiCacheCloudPdf,
        loadCloudArrayBuffer: window.rbiLoadCloudPdfArrayBuffer,
        isCloudPdfUrl: window.rbiIsCloudPdfUrl
    };
}());
