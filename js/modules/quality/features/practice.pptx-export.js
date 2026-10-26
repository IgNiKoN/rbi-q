/**
 * practice.pptx-export.js
 * PPTX лучшей практики — тот же состав, что PDF/печать (meta → было/стало → процесс → вывод).
 */

const root = typeof globalThis !== 'undefined' ? globalThis : window;
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const C = {
    text: '0f172a',
    muted: '4b5563',
    soft: '6b7280',
    border: '9ca3af',
    header: 'f8fafc',
    white: 'ffffff',
    green: '166534',
    greenSoft: 'f0fdf4',
    greenBorder: '16a34a'
};

function _toast(msg) {
    if (typeof root.showToast === 'function') root.showToast(msg);
    else console.warn('[practice-pptx]', msg);
}

function _pptxCtor() {
    if (typeof root.PptxGenJS === 'function') return root.PptxGenJS;
    if (typeof root.pptxgenjs === 'function') return root.pptxgenjs;
    return null;
}

function _safeFile(s) {
    return String(s || 'practice')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 80) || 'practice';
}

function _authorFallback() {
    try {
        if (root.RBI && root.RBI.services && root.RBI.services.settings) {
            return root.RBI.services.settings.get('engineerName') || 'Инженер';
        }
    } catch (_) { /* ignore */ }
    return 'Инженер';
}

function _probeImageSize(dataUrl) {
    return new Promise((resolve) => {
        if (!dataUrl) return resolve({ w: 0, h: 0 });
        const img = new Image();
        img.onload = () => resolve({
            w: Number(img.naturalWidth) || 0,
            h: Number(img.naturalHeight) || 0
        });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = dataUrl;
    });
}

/** Вписать фото в ячейку без растягивания (portrait / landscape). */
function _fitContain(boxX, boxY, boxW, boxH, imgW, imgH) {
    const pad = 0.06;
    const maxW = Math.max(0.2, boxW - pad * 2);
    const maxH = Math.max(0.2, boxH - pad * 2);
    const ratio = (imgW > 0 && imgH > 0) ? (imgW / imgH) : (maxW / maxH);
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
        h = maxH;
        w = h * ratio;
    }
    return {
        x: boxX + (boxW - w) / 2,
        y: boxY + (boxH - h) / 2,
        w,
        h
    };
}

/** @returns {Promise<{data:string,w:number,h:number}|null>} */
async function _imgData(photoRef) {
    if (!photoRef) return null;
    const pm = root.PhotoManager;
    if (!pm || typeof pm.getAsyncUrl !== 'function') return null;
    try {
        const url = await pm.getAsyncUrl(photoRef);
        if (!url) return null;
        let data = null;
        if (String(url).startsWith('data:image')) {
            data = url;
        } else {
            const resp = await fetch(url);
            if (!resp || !resp.ok) return null;
            const blob = await resp.blob();
            if (!blob || !String(blob.type || '').startsWith('image/')) return null;
            data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result || null);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        }
        if (!data) return null;
        const size = await _probeImageSize(data);
        return { data, w: size.w, h: size.h };
    } catch (_) {
        return null;
    }
}

function _urls(p) {
    const before = (p.photosBefore && p.photosBefore.length)
        ? p.photosBefore.filter(Boolean)
        : (p.photoBefore ? [p.photoBefore] : []);
    const process = (p.photosProcess || []).filter(Boolean);
    const after = (p.photosAfter && p.photosAfter.length)
        ? p.photosAfter.filter(Boolean)
        : (p.photoAfter ? [p.photoAfter] : []);
    return { before, process, after };
}

/**
 * Крупная сетка фото в заданной области (акцент на снимках).
 * @param {number} areaH — высота всей фотозоны
 * @param {number} maxPhotos — сколько кадров показать (1–2 на главном слайде)
 */
async function _addPhotoGrid(slide, pptx, urls, prefix, x0, y0, totalW, areaH, maxPhotos = 2) {
    const list = (urls || []).slice(0, Math.max(1, Math.min(6, maxPhotos)));
    if (!list.length) {
        slide.addShape(pptx.shapes.RECTANGLE, {
            x: x0, y: y0, w: totalW, h: areaH,
            fill: { color: C.header }, line: { color: C.border, pt: 1 }
        });
        slide.addText('Нет фото', {
            x: x0, y: y0 + areaH / 2 - 0.15, w: totalW, h: 0.3,
            fontSize: 12, bold: true, color: C.soft, align: 'center', fontFace: 'Times New Roman'
        });
        return;
    }

    const captionH = 0.22;
    const gap = 0.1;
    // 1 фото — на всю ширину; 2+ — в 2 колонки, высота ряда заполняет areaH
    const cols = list.length === 1 ? 1 : 2;
    const rows = Math.ceil(list.length / cols);
    const colW = (totalW - gap * (cols - 1)) / cols;
    const rowH = (areaH - gap * (rows - 1)) / rows;
    const imgBoxH = Math.max(0.8, rowH - captionH - 0.08);

    for (let i = 0; i < list.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = x0 + col * (colW + gap);
        const y = y0 + row * (rowH + gap);
        const img = await _imgData(list[i]);

        slide.addShape(pptx.shapes.RECTANGLE, {
            x, y, w: colW, h: rowH,
            fill: { color: C.header }, line: { color: C.border, pt: 1 }
        });
        slide.addShape(pptx.shapes.RECTANGLE, {
            x: x + 0.05, y: y + 0.05, w: colW - 0.1, h: imgBoxH,
            fill: { color: C.white }, line: { color: 'e5e7eb', pt: 0.5 }
        });

        if (img && img.data) {
            try {
                const fit = _fitContain(x + 0.05, y + 0.05, colW - 0.1, imgBoxH, img.w, img.h);
                slide.addImage({
                    data: img.data,
                    x: fit.x,
                    y: fit.y,
                    w: fit.w,
                    h: fit.h,
                    sizing: { type: 'contain', w: fit.w, h: fit.h }
                });
            } catch (_) {
                slide.addText('нет превью', {
                    x, y: y + imgBoxH / 2, w: colW, h: 0.25,
                    fontSize: 11, color: C.soft, align: 'center', fontFace: 'Times New Roman'
                });
            }
        } else {
            slide.addText('нет превью', {
                x, y: y + imgBoxH / 2, w: colW, h: 0.25,
                fontSize: 11, color: C.soft, align: 'center', fontFace: 'Times New Roman'
            });
        }

        slide.addText(`Рис. ${prefix}.${i + 1}`, {
            x, y: y + rowH - captionH, w: colW, h: captionH,
            fontSize: 10, bold: true, color: C.muted, align: 'center', fontFace: 'Times New Roman'
        });
    }
}

/**
 * @param {string} id
 */
export async function exportPracticePptx(id) {
    const list = Array.isArray(root.rbi_practicesData) ? root.rbi_practicesData : [];
    const p = list.find((x) => x && String(x.id) === String(id));
    if (!p) return _toast('Практика не найдена');

    const PptxCtor = _pptxCtor();
    if (!PptxCtor) return _toast('Библиотека PPTX не загружена');

    _toast('Формируем PPTX практики…');

    const { before, process, after } = _urls(p);
    const docs = Array.isArray(p.docs) ? p.docs : [];
    const takeaway = String(p.takeaway || '').trim() || String(p.solution || '').trim();
    const author = p.author || p.owner || _authorFallback();
    const dateLabel = p.date
        ? new Date(p.date).toLocaleDateString('ru-RU')
        : new Date().toLocaleDateString('ru-RU');
    const deltaLabel = Number(p.deltaUrk) > 0
        ? `+${Number(p.deltaUrk)}% УрК`
        : 'Опыт с площадки';
    const title = String(p.title || 'Лучшая практика');

    const pptx = new PptxCtor();
    pptx.defineLayout({ name: 'LAYOUT_16x9_RBI', width: 13.333, height: 7.5 });
    pptx.layout = 'LAYOUT_16x9_RBI';
    pptx.author = author;
    pptx.title = title;

    // Слайд 1: компактный заголовок + крупные фото Было/Стало (акцент на снимках)
    const s1 = pptx.addSlide();
    s1.addShape(pptx.shapes.RECTANGLE, {
        x: 0, y: 0, w: 13.333, h: 7.5,
        fill: { color: C.white }, line: { color: C.white }
    });

    s1.addText(title.toUpperCase(), {
        x: 0.3, y: 0.18, w: 12.7, h: 0.38,
        fontSize: 18, bold: true, color: C.text, fontFace: 'Times New Roman'
    });
    s1.addText(
        `${p.templateTitle || 'Практика'}  ·  ${p.projectName || '—'}  ·  ${author}  ·  ${deltaLabel}  ·  ${dateLabel}`,
        {
            x: 0.3, y: 0.52, w: 12.7, h: 0.26,
            fontSize: 11, bold: true, color: C.muted, fontFace: 'Times New Roman'
        }
    );

    const colTop = 0.9;
    const colH = 6.35;
    const colW = 6.25;
    const photoAreaH = 5.15; // основная высота под фото
    const textH = 0.55;

    // Было
    s1.addShape(pptx.shapes.RECTANGLE, {
        x: 0.3, y: colTop, w: colW, h: colH,
        fill: { color: C.header }, line: { color: C.border, pt: 1.5 }
    });
    s1.addText('БЫЛО · проблема', {
        x: 0.42, y: colTop + 0.08, w: colW - 0.24, h: 0.26,
        fontSize: 12, bold: true, color: C.muted, fontFace: 'Times New Roman'
    });
    await _addPhotoGrid(s1, pptx, before, 'Б', 0.42, colTop + 0.38, colW - 0.24, photoAreaH, 2);
    s1.addText(String(p.problem || '—'), {
        x: 0.42, y: colTop + 0.38 + photoAreaH + 0.08, w: colW - 0.24, h: textH,
        fontSize: 11, color: C.text, valign: 'top', fontFace: 'Times New Roman'
    });

    // Стало
    s1.addShape(pptx.shapes.RECTANGLE, {
        x: 6.8, y: colTop, w: colW, h: colH,
        fill: { color: C.greenSoft }, line: { color: C.greenBorder, pt: 1.5 }
    });
    s1.addText('СТАЛО · решение', {
        x: 6.92, y: colTop + 0.08, w: colW - 0.24, h: 0.26,
        fontSize: 12, bold: true, color: C.green, fontFace: 'Times New Roman'
    });
    await _addPhotoGrid(s1, pptx, after, 'С', 6.92, colTop + 0.38, colW - 0.24, photoAreaH, 2);
    s1.addText(String(p.solution || '—'), {
        x: 6.92, y: colTop + 0.38 + photoAreaH + 0.08, w: colW - 0.24, h: textH,
        fontSize: 11, color: C.text, valign: 'top', fontFace: 'Times New Roman'
    });

    // Слайд 2: процесс — почти весь слайд под фото
    if (process.length) {
        const s2 = pptx.addSlide();
        s2.addText(title.toUpperCase(), {
            x: 0.3, y: 0.15, w: 12.7, h: 0.32,
            fontSize: 16, bold: true, color: C.text, fontFace: 'Times New Roman'
        });
        s2.addText('Ход работ · процесс на площадке', {
            x: 0.3, y: 0.48, w: 12.7, h: 0.26,
            fontSize: 13, bold: true, color: C.muted, fontFace: 'Times New Roman'
        });
        const procMax = process.length <= 2 ? process.length : (process.length <= 4 ? 4 : 6);
        await _addPhotoGrid(s2, pptx, process, 'П', 0.3, 0.85, 12.7, 6.3, procMax);
    }

    // Слайд 3: вывод + материалы
    if (takeaway || docs.length) {
        const s3 = pptx.addSlide();
        const n = process.length ? '3' : '2';
        s3.addText(title.toUpperCase(), {
            x: 0.35, y: 0.25, w: 12.6, h: 0.35,
            fontSize: 16, bold: true, color: C.text, fontFace: 'Times New Roman'
        });
        s3.addText(`${n}. Ключевой вывод и материалы`, {
            x: 0.35, y: 0.7, w: 12.6, h: 0.3,
            fontSize: 14, bold: true, color: C.text, fontFace: 'Times New Roman'
        });
        s3.addShape(pptx.shapes.RECTANGLE, {
            x: 0.35, y: 1.15, w: 7.5, h: 5.6,
            fill: { color: C.header }, line: { color: C.border, pt: 1 }
        });
        s3.addText('Ключевой вывод', {
            x: 0.55, y: 1.3, w: 7.1, h: 0.3,
            fontSize: 12, bold: true, color: C.muted, fontFace: 'Times New Roman'
        });
        s3.addText(takeaway || '—', {
            x: 0.55, y: 1.75, w: 7.1, h: 4.7,
            fontSize: 16, bold: true, color: C.text, valign: 'top', fontFace: 'Times New Roman'
        });
        s3.addShape(pptx.shapes.RECTANGLE, {
            x: 8.05, y: 1.15, w: 4.9, h: 5.6,
            fill: { color: C.white }, line: { color: C.border, pt: 1 }
        });
        s3.addText('Материалы', {
            x: 8.25, y: 1.3, w: 4.5, h: 0.3,
            fontSize: 12, bold: true, color: C.muted, fontFace: 'Times New Roman'
        });
        const docsText = docs.length
            ? docs.map((d) => `• ${d.name || 'Документ'}${d.desc ? ` — ${d.desc}` : ''}`).join('\n')
            : 'Документы не прикреплены';
        s3.addText(docsText, {
            x: 8.25, y: 1.75, w: 4.5, h: 4.7,
            fontSize: 12, color: C.text, valign: 'top', fontFace: 'Times New Roman'
        });
    }

    const fileName = _safeFile(`Практика_${title}`) + '_' + new Date().toISOString().slice(0, 10) + '.pptx';
    let blob = null;
    try {
        if (typeof pptx.write === 'function') {
            const out = await pptx.write({ outputType: 'blob' });
            blob = out instanceof Blob ? out : new Blob([out], { type: PPTX_MIME });
        }
    } catch (e) {
        console.warn('[practice-pptx] write failed', e);
    }

    if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 20000);
    } else if (typeof pptx.writeFile === 'function') {
        await pptx.writeFile({ fileName });
    } else {
        return _toast('Не удалось сформировать PPTX');
    }

    if (typeof root.saveReportToLocal === 'function' && blob) {
        try {
            await root.saveReportToLocal({
                type: 'pptx',
                mimeType: PPTX_MIME,
                docKind: 'Практика',
                title: `Практика: ${title}`,
                blob,
                project: p.projectName || '—',
                period: `с ${dateLabel} по ${dateLabel}`,
                author
            }, `<div>PPTX практики: ${String(title).replace(/</g, '')}</div>`);
            if (typeof root.renderReportsList === 'function') root.renderReportsList();
        } catch (e) {
            console.warn('[practice-pptx] saveReportToLocal failed', e);
        }
    }

    _toast('PPTX практики сохранён');
}

root.exportPracticePptx = exportPracticePptx;
root.rbi_exportPracticePptx = exportPracticePptx;
