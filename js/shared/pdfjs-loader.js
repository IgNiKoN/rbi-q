/* js/shared/pdfjs-loader.js — P2-0057 этап 0: pdf.js 5 (ES-модуль) загружается по требованию.
 * window.rbiPdfjs() → Promise<pdfjsLib>; после первой загрузки — и window.pdfjsLib.
 * getDocument дополняется wasmUrl (JBIG2 / JPEG2000 сканов) и isEvalSupported: false. */
(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    var BASE = './libs/pdfjs/';
    var pending = null;

    function abs(path) {
        return new URL(path, document.baseURI).href;
    }

    function withDefaults(src) {
        var opts;
        if (typeof src === 'string' || src instanceof URL) opts = { url: String(src) };
        else if (src instanceof ArrayBuffer || ArrayBuffer.isView(src)) opts = { data: src };
        else opts = Object.assign({}, src);
        if (!opts.wasmUrl) opts.wasmUrl = abs(BASE + 'wasm/');
        opts.isEvalSupported = false;
        return opts;
    }

    function wrap(mod) {
        mod.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js';
        var lib = Object.assign({}, mod);
        lib.getDocument = function (src) { return mod.getDocument(withDefaults(src)); };
        return lib;
    }

    window.rbiPdfjs = function () {
        if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
        if (!pending) {
            pending = import(abs(BASE + 'pdf.min.js')).then(function (mod) {
                window.pdfjsLib = wrap(mod);
                return window.pdfjsLib;
            }, function (err) {
                pending = null;
                throw err;
            });
        }
        return pending;
    };
})();
