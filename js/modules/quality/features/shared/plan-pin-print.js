/**
 * Print helper: floor plan sheet (raster + single pin) for inspection acts.
 * Pure ES module — no window.* assignments.
 */

import {
  planPinOf,
  assignFloorPointNumbers,
  formatPlanPinPlaceLabel
} from './plan-pin-label.js';

const PIN_PALETTE = [
  '#4f46e5', '#059669', '#d97706', '#dc2626',
  '#0891b2', '#7c3aed', '#db2777', '#65a30d'
];

function _hashKey(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function colorForTemplate(templateKey) {
  return PIN_PALETTE[_hashKey(templateKey) % PIN_PALETTE.length];
}

function _pinCoordsOk(pin) {
  if (!pin) return false;
  const x = Number(pin.x);
  const y = Number(pin.y);
  return Number.isFinite(x) && Number.isFinite(y) && pin.locationId != null;
}

function _escape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function _locations() {
  try {
    return (window.RBI && window.RBI.services && window.RBI.services.locations) || null;
  } catch (_e) {
    return null;
  }
}

async function _pdfjs() {
  try {
    return (window.rbiPdfjs ? await window.rbiPdfjs() : window.pdfjsLib) || null;
  } catch (_e) {
    return null;
  }
}

async function _loadPdfArrayBuffer(pdfUrl) {
  const loadCloudPdf = window['rbiLoadCloudPdfArrayBuffer'];
  if (typeof loadCloudPdf === 'function') {
    return await loadCloudPdf(pdfUrl);
  }
  const pm = window['PhotoManager'];
  if (pm && typeof pm.getAsyncUrl === 'function') {
    try {
      const cached = await pm.getAsyncUrl(pdfUrl);
      if (cached && String(cached).startsWith('blob:')) {
        const res = await fetch(cached);
        return await res.arrayBuffer();
      }
    } catch (_e) { /* fall through */ }
  }
  if (navigator.onLine === false) throw new Error('PDF не кэширован офлайн');
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error('Не удалось скачать PDF');
  return await res.arrayBuffer();
}

/**
 * Rasterize page 1 of floor PDF → data URL (JPEG).
 * @returns {Promise<string|null>}
 */
async function _pdfPage1DataUrl(pdfUrl) {
  const pdfjs = await _pdfjs();
  if (!pdfjs || typeof pdfjs.getDocument !== 'function') return null;
  const buf = await _loadPdfArrayBuffer(pdfUrl);
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.0, Math.max(1.0, 900 / base.width));
  const viewport = page.getViewport({ scale: scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  await page.render({ canvasContext: ctx, viewport: viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.88);
}

/**
 * Build HTML for a single-pin plan sheet after an inspection act.
 * Returns null if no valid pin, no PDF, or load/render failed.
 *
 * @param {object} item inspection record
 * @param {object[]} [allInspections] for point numbering A
 * @param {{ toastOnce?: function }} [opts]
 * @returns {Promise<string|null>}
 */
export async function buildInspectionPlanSheetHtml(item, allInspections, opts) {
  opts = opts || {};
  const pin = planPinOf(item);
  if (!_pinCoordsOk(pin)) return null;

  const loc = _locations();
  if (!loc || typeof loc.getPlanForFloor !== 'function') return null;
  let plan = null;
  try {
    plan = loc.getPlanForFloor(pin.locationId);
  } catch (_e) {
    return null;
  }
  if (!plan || !plan.pdf_url) return null;

  let dataUrl = null;
  try {
    dataUrl = await _pdfPage1DataUrl(plan.pdf_url);
  } catch (e) {
    if (typeof opts.toastOnce === 'function') {
      opts.toastOnce('⚠️ Лист плана пропущен — PDF недоступен');
    }
    return null;
  }
  if (!dataUrl) {
    if (typeof opts.toastOnce === 'function') {
      opts.toastOnce('⚠️ Лист плана пропущен — PDF недоступен');
    }
    return null;
  }

  const inspections = allInspections || [];
  const numMap = assignFloorPointNumbers(inspections, pin.locationId);
  const pointNo = numMap.get(String(item.id));
  const color = colorForTemplate(item.templateKey);
  const label = formatPlanPinPlaceLabel(item, {
    locations: loc,
    numberMap: numMap,
    inspections: inspections
  });
  const x = Number(pin.x);
  const y = Number(pin.y);
  const numLabel = pointNo != null ? String(pointNo) : '?';

  return (
    '<div class="insp-plan-sheet" style="position:relative;width:100%;box-sizing:border-box;padding:8mm 10mm;">' +
      '<div style="font-size:11pt;font-weight:700;margin-bottom:4mm;color:#1e293b;">' +
        'План этажа · ' + _escape(label) +
      '</div>' +
      '<div style="position:relative;width:100%;line-height:0;border:1px solid #cbd5e1;">' +
        '<img src="' + dataUrl + '" alt="План этажа" style="width:100%;height:auto;display:block;" />' +
        '<div style="position:absolute;left:' + x + '%;top:' + y + '%;' +
          'transform:translate(-50%,-50%);width:22px;height:22px;border-radius:9999px;' +
          'background:' + color + ';border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);' +
          'color:#fff;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;' +
          'line-height:1;">' + _escape(numLabel) + '</div>' +
      '</div>' +
    '</div>'
  );
}
