/**
 * reports.pptx-viewer.js
 * In-app просмотр PPTX через PptxViewJS (libs/pptxviewjs.min.js).
 */
(function (root) {
    'use strict';

    var MODAL_ID = 'pptx-viewer-modal';
    var _viewer = null;
    var _blob = null;
    var _downloadName = 'report.pptx';
    var _bound = false;

    function _toast(msg) {
        if (typeof root.showToast === 'function') root.showToast(msg);
        else console.warn('[pptx-viewer]', msg);
    }

    function _Ctor() {
        var ns = root.PptxViewJS;
        if (!ns) return null;
        if (typeof ns.PPTXViewer === 'function') return ns.PPTXViewer;
        if (typeof ns.default === 'object' && typeof ns.default.PPTXViewer === 'function') {
            return ns.default.PPTXViewer;
        }
        return null;
    }

    function _markup() {
        return ''
            + '<div id="' + MODAL_ID + '" class="fixed inset-0 bg-slate-900/95 z-[9999] hidden flex-col opacity-0 transition-opacity duration-200">'
            + '  <div class="bg-slate-800 text-white px-4 py-3 flex items-center gap-3 shadow-md z-20 shrink-0">'
            + '    <div class="font-bold text-sm truncate flex-1" id="pptx-viewer-title">Презентация</div>'
            + '    <div class="text-xs text-slate-300 tabular-nums shrink-0" id="pptx-viewer-status">—</div>'
            + '    <button type="button" data-pptx-viewer-action="download" class="px-3 py-1.5 rounded-lg bg-orange-500/90 hover:bg-orange-500 text-white text-xs font-semibold shrink-0">Скачать</button>'
            + '    <button type="button" data-pptx-viewer-action="close" class="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center shrink-0 font-bold" aria-label="Закрыть">✕</button>'
            + '  </div>'
            + '  <div class="flex-1 min-h-0 flex items-center justify-center p-3 sm:p-6 overflow-hidden">'
            + '    <canvas id="pptx-viewer-canvas" class="max-w-full max-h-full bg-white shadow-2xl rounded-sm"></canvas>'
            + '  </div>'
            + '  <div class="bg-slate-800/95 border-t border-slate-700 px-4 py-3 flex items-center justify-center gap-3 shrink-0">'
            + '    <button type="button" data-pptx-viewer-action="prev" class="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold">← Назад</button>'
            + '    <button type="button" data-pptx-viewer-action="next" class="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold">Вперёд →</button>'
            + '  </div>'
            + '</div>';
    }

    function _ensureModal() {
        if (document.getElementById(MODAL_ID)) return;
        var host = document.getElementById('app-modals') || document.body;
        host.insertAdjacentHTML('beforeend', _markup());
        if (!_bound) {
            _bound = true;
            document.addEventListener('click', function (e) {
                var el = e.target && e.target.closest ? e.target.closest('[data-pptx-viewer-action]') : null;
                if (!el || !document.getElementById(MODAL_ID) || !document.getElementById(MODAL_ID).contains(el)) return;
                var action = el.getAttribute('data-pptx-viewer-action');
                if (action === 'close') closePptxViewer();
                else if (action === 'prev') _nav(-1);
                else if (action === 'next') _nav(1);
                else if (action === 'download') _download();
            }, true);
            document.addEventListener('keydown', function (e) {
                var modal = document.getElementById(MODAL_ID);
                if (!modal || modal.classList.contains('hidden')) return;
                if (e.key === 'Escape') closePptxViewer();
                else if (e.key === 'ArrowLeft') _nav(-1);
                else if (e.key === 'ArrowRight') _nav(1);
            });
        }
    }

    function _setStatus() {
        var el = document.getElementById('pptx-viewer-status');
        if (!el || !_viewer) return;
        var cur = (typeof _viewer.getCurrentSlideIndex === 'function' ? _viewer.getCurrentSlideIndex() : 0) + 1;
        var total = typeof _viewer.getSlideCount === 'function' ? _viewer.getSlideCount() : 0;
        el.textContent = total ? (cur + ' / ' + total) : '—';
    }

    async function _nav(delta) {
        if (!_viewer) return;
        try {
            if (delta < 0 && typeof _viewer.previousSlide === 'function') await _viewer.previousSlide();
            else if (delta > 0 && typeof _viewer.nextSlide === 'function') await _viewer.nextSlide();
            _setStatus();
        } catch (e) {
            console.warn('[pptx-viewer] nav failed', e);
        }
    }

    function _download() {
        if (!_blob) return _toast('Файл недоступен');
        var url = URL.createObjectURL(_blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = _downloadName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
    }

    function closePptxViewer() {
        var modal = document.getElementById(MODAL_ID);
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.style.opacity = '0';
        }
        if (_viewer && typeof _viewer.destroy === 'function') {
            try { _viewer.destroy(); } catch (_) { /* ignore */ }
        }
        _viewer = null;
        _blob = null;
    }

    async function openPptxViewer(blob, opts) {
        opts = opts || {};
        if (!blob) {
            _toast('Нет файла PPTX');
            return false;
        }
        var Ctor = _Ctor();
        if (!Ctor) {
            _toast('Библиотека просмотра PPTX не загружена');
            return false;
        }

        _ensureModal();
        var modal = document.getElementById(MODAL_ID);
        var canvas = document.getElementById('pptx-viewer-canvas');
        var titleEl = document.getElementById('pptx-viewer-title');
        if (!modal || !canvas) return false;

        _blob = blob;
        _downloadName = opts.downloadName || 'report.pptx';
        if (titleEl) titleEl.textContent = opts.title || 'Презентация';

        if (_viewer && typeof _viewer.destroy === 'function') {
            try { _viewer.destroy(); } catch (_) { /* ignore */ }
        }
        _viewer = null;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        requestAnimationFrame(function () { modal.style.opacity = '1'; });

        var statusEl = document.getElementById('pptx-viewer-status');
        if (statusEl) statusEl.textContent = 'Загрузка…';

        try {
            // Подгоняем canvas под доступную область до render.
            var host = canvas.parentElement;
            var maxW = Math.max(320, (host && host.clientWidth) || window.innerWidth) - 24;
            var maxH = Math.max(240, (host && host.clientHeight) || window.innerHeight) - 24;
            canvas.width = Math.min(1280, maxW);
            canvas.height = Math.min(720, maxH);

            _viewer = new Ctor({
                canvas: canvas,
                slideSizeMode: 'fit',
                backgroundColor: '#ffffff'
            });
            var ab = await blob.arrayBuffer();
            await _viewer.loadFile(ab);
            await _viewer.render();
            _setStatus();
            return true;
        } catch (e) {
            console.error('[pptx-viewer] open failed', e);
            closePptxViewer();
            _toast('Не удалось открыть PPTX в приложении');
            return false;
        }
    }

    root['openPptxViewer'] = openPptxViewer;
    root['closePptxViewer'] = closePptxViewer;
})(typeof window !== 'undefined' ? window : globalThis);
