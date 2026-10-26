/**
 * Лёгкий PDF-просмотрщик этажа для construction-v2 (pdfjsLib + overlay маркеров/зон + Panzoom).
 * Не использует UniversalPdfViewer / pdf-viewer.js.
 */

import type { AcceptanceZoneV2, ConstructionAcceptanceV2 } from '../../services/construction-acceptance/types';
import type { ConstructionDefectV2 } from '../../services/construction-defects/types';
import { clusterDefects, spiderPositions } from './pin-clusters';

export type PlanViewerHandlers = {
  onPlanClick?: (xPercent: number, yPercent: number) => void;
  onMarkerClick?: (defectId: string) => void;
  /** Завершение zone-mode: 2 клика → прямоугольник %. */
  onZoneDrawn?: (zone: AcceptanceZoneV2) => void;
  onZoneClick?: (acceptanceId: string) => void;
};

export type SetMarkersOpts = {
  /** Порог кластеризации в % плана. 0 = без кластеров. Default 2.5. */
  clusterThreshold?: number;
};

type PdfjsLib = {
  getDocument: (src: { data: ArrayBuffer } | string) => { promise: Promise<PdfDoc> };
  GlobalWorkerOptions?: { workerSrc: string };
};

type PdfDoc = {
  getPage: (n: number) => Promise<PdfPage>;
};

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
    promise: Promise<void>;
  };
};

type ZoomOpts = { animate?: boolean; force?: boolean };
/** Point for Panzoom.zoomToPoint — client coords (как WheelEvent). */
type ZoomPoint = { clientX: number; clientY: number };

type PanzoomInstance = {
  zoom: (scale: number, opts?: ZoomOpts) => void;
  zoomIn: (opts?: ZoomOpts) => void;
  zoomOut: (opts?: ZoomOpts) => void;
  /** Масштаб к точке в client coords (корректный focal; zoom/zoomIn.focal — другая СК). */
  zoomToPoint: (scale: number, point: ZoomPoint, opts?: ZoomOpts) => void;
  zoomWithWheel: (event: WheelEvent) => void;
  pan: (x: number, y: number, opts?: { animate?: boolean; relative?: boolean; force?: boolean }) => void;
  getScale: () => number;
  getPan: () => { x: number; y: number };
  reset: (opts?: { animate?: boolean }) => void;
  destroy: () => void;
  setOptions: (opts: Record<string, unknown>) => void;
};

/** step Panzoom для pinch; wheel — отдельно через RbiPlanPanzoom.wheelZoom. */
const PZ_PINCH_STEP = 0.5;
const PZ_BTN_STEP = 0.28;
const PZ_MIN = 0.4;
const PZ_MAX = 8;

type RbiPlanPz = {
  PINCH_STEP: number;
  BTN_STEP: number;
  center: (pz: PanzoomInstance, wrap: HTMLElement, stage: HTMLElement) => void;
  wheelZoom: (pz: PanzoomInstance, e: WheelEvent, min: number, max: number) => void;
  baseOptions: (extra?: Record<string, unknown>) => Record<string, unknown>;
};

function _planPz(): RbiPlanPz | null {
  return (window as unknown as { RbiPlanPanzoom?: RbiPlanPz }).RbiPlanPanzoom || null;
}

type PanzoomFactory = (el: HTMLElement, opts?: Record<string, unknown>) => PanzoomInstance;

function _pdfjs(): PdfjsLib | null {
  return (window as unknown as { pdfjsLib?: PdfjsLib }).pdfjsLib || null;
}

function _panzoomFactory(): PanzoomFactory | null {
  return (window as unknown as { Panzoom?: PanzoomFactory }).Panzoom || null;
}

/** Цвета как в legacy ConstDefectForm: B1 blue / B2 orange / B3 red / closed green. */
function _pinBg(category: string, status: string): string {
  const st = String(status || '').toLowerCase();
  if (st === 'closed' || st === 'fixed') return 'bg-green-500';
  const c = String(category || '').toLowerCase();
  if (c === 'critical' || c === 'b3') return 'bg-red-600';
  if (c === 'major' || c === 'b2') return 'bg-orange-500';
  // minor / B1 / default
  return 'bg-blue-500';
}

function _zoneColors(status: string): { box: string; label: string } {
  const st = String(status || '').toLowerCase();
  if (st === 'rejected') return { box: 'bg-red-500/20 border-red-500', label: 'bg-red-600' };
  if (st === 'accepted') return { box: 'bg-green-500/20 border-green-500', label: 'bg-green-600' };
  return { box: 'bg-blue-500/20 border-blue-500', label: 'bg-blue-600' };
}

function _t(key: string, fallback: string, vars?: Record<string, string | number>): string {
  try {
    const i18n = window.RBI?.services?.i18n as
      | { t?: (k: string, v?: Record<string, string | number>) => string }
      | undefined;
    if (i18n && typeof i18n.t === 'function') {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
    /* ignore */
  }
  if (!vars) return fallback;
  return String(fallback).replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}

function _escapeAttr(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export class PlanViewer {
  private host: HTMLElement;
  private handlers: PlanViewerHandlers;
  private wrap: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private pins: HTMLElement | null = null;
  private zonesEl: HTMLElement | null = null;
  private addMode = false;
  private zoneMode = false;
  private zoneClick1: { x: number; y: number } | null = null;
  private focusZoneId: string | null = null;
  private highlightId: string | null = null;
  private destroyed = false;
  private pdfUrl = '';
  private panzoom: PanzoomInstance | null = null;
  private _onWheelBound: ((e: WheelEvent) => void) | null = null;
  private _onPointerBound: ((e: PointerEvent | MouseEvent) => void) | null = null;
  /** Последняя позиция указателя над wrap (client coords) — для focal кнопок ±. */
  private _lastPointerClient: { x: number; y: number } | null = null;
  /** Последний набор дефектов для setMarkers (для collapse expand). */
  private _lastMarkers: ConstructionDefectV2[] = [];
  private _lastClusterThreshold = 2.5;
  private _expandedClusterKey: string | null = null;

  constructor(host: HTMLElement, handlers: PlanViewerHandlers = {}) {
    this.host = host;
    this.handlers = handlers;
  }

  setAddMode(on: boolean) {
    this.addMode = !!on;
    if (on) this.setZoneMode(false);
    this._syncCursor();
  }

  isAddMode(): boolean {
    return this.addMode;
  }

  setZoneMode(on: boolean) {
    this.zoneMode = !!on;
    if (on) {
      this.addMode = false;
      this.zoneClick1 = null;
      this.clearTempZone();
    } else {
      this.zoneClick1 = null;
      this.clearTempZone();
    }
    this._syncCursor();
  }

  isZoneMode(): boolean {
    return this.zoneMode;
  }

  setFocusZone(id: string | null) {
    this.focusZoneId = id;
    const zones = this.zonesEl?.querySelectorAll('[data-c2-zone]');
    zones?.forEach((el) => {
      const hid = el as HTMLElement;
      const match = hid.getAttribute('data-c2-zone') === id;
      hid.classList.toggle('ring-4', match);
      hid.classList.toggle('ring-indigo-400', match);
      hid.style.zIndex = match ? '25' : '10';
    });
  }

  getMarkerEl(id: string): HTMLElement | null {
    if (!this.pins || !id) return null;
    const pins = this.pins.querySelectorAll('[data-c2-pin]');
    for (const el of pins) {
      if ((el as HTMLElement).getAttribute('data-c2-pin') === id) return el as HTMLElement;
    }
    return null;
  }

  /** Подсветка маркера (pulse/ring) + по возможности pan к пину. */
  highlightMarker(id: string | null) {
    this.highlightId = id;
    this._applyHighlight();
    if (id) this._panToMarker(id);
  }

  setScale(scale: number) {
    if (!this.panzoom) return;
    const s = Math.min(PZ_MAX, Math.max(PZ_MIN, Number(scale) || 1));
    this.panzoom.zoomToPoint(s, this._getZoomPoint());
  }

  zoomIn() {
    if (!this.panzoom) return;
    const next = Math.min(PZ_MAX, this.panzoom.getScale() * Math.exp(PZ_BTN_STEP));
    this.panzoom.zoomToPoint(next, this._getZoomPoint());
  }

  zoomOut() {
    if (!this.panzoom) return;
    const next = Math.max(PZ_MIN, this.panzoom.getScale() * Math.exp(-PZ_BTN_STEP));
    this.panzoom.zoomToPoint(next, this._getZoomPoint());
  }

  /**
   * Точка zoom в client coords: последний pointer над wrap, иначе центр viewport.
   * Важно: Panzoom.zoom({focal}) ждёт уже сконвертированные coords;
   * clientX/Y передаём через zoomToPoint (как zoomWithWheel).
   */
  private _getZoomPoint(): ZoomPoint {
    if (this._lastPointerClient) {
      return { clientX: this._lastPointerClient.x, clientY: this._lastPointerClient.y };
    }
    if (!this.wrap) return { clientX: 0, clientY: 0 };
    const r = this.wrap.getBoundingClientRect();
    return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  }

  /** Сброс масштаба/пана к стартовому fit + центр в окне. */
  fit() {
    if (!this.panzoom || !this.wrap || !this.stage) return;
    this.panzoom.reset({ animate: false });
    const helper = _planPz();
    const doCenter = () => {
      if (!this.panzoom || !this.wrap || !this.stage) return;
      if (helper) helper.center(this.panzoom, this.wrap, this.stage);
    };
    requestAnimationFrame(() => requestAnimationFrame(doCenter));
  }

  getScale(): number {
    return this.panzoom?.getScale() ?? 1;
  }

  destroy() {
    this.destroyed = true;
    this._destroyPanzoom();
    this.host.innerHTML = '';
    this.wrap = null;
    this.stage = null;
    this.canvas = null;
    this.pins = null;
    this.zonesEl = null;
  }

  async load(pdfUrl: string): Promise<void> {
    this.pdfUrl = pdfUrl;
    this.destroyed = false;
    this._destroyPanzoom();
    this.host.innerHTML = `
      <div class="absolute inset-0 overflow-hidden bg-slate-200 dark:bg-slate-900 touch-none" data-c2-plan-wrap>
        <div class="absolute top-0 left-0 shadow-lg bg-white" data-c2-plan-stage style="touch-action:none">
          <canvas data-c2-plan-canvas class="block max-w-none"></canvas>
          <div data-c2-plan-zones class="absolute inset-0 pointer-events-none"></div>
          <div data-c2-plan-pins class="absolute inset-0 pointer-events-none"></div>
        </div>
      </div>
      <div data-c2-plan-loader class="absolute inset-0 flex items-center justify-center bg-slate-100/80 dark:bg-slate-900/80 text-[11px] font-bold uppercase tracking-widest text-slate-500">
        ${_t('construction.v2.plan_loading', 'Загрузка плана…')}
      </div>`;

    this.wrap = this.host.querySelector('[data-c2-plan-wrap]');
    this.stage = this.host.querySelector('[data-c2-plan-stage]');
    this.canvas = this.host.querySelector('[data-c2-plan-canvas]');
    this.pins = this.host.querySelector('[data-c2-plan-pins]');
    this.zonesEl = this.host.querySelector('[data-c2-plan-zones]');
    const loader = this.host.querySelector('[data-c2-plan-loader]') as HTMLElement | null;

    if (!this.canvas || !this.stage || !this.wrap) throw new Error('plan-viewer DOM broken');

    this.wrap.addEventListener('click', (ev) => this._onClick(ev));

    const pdfjs = _pdfjs();
    if (!pdfjs?.getDocument) throw new Error('pdfjsLib недоступен');

    let buf: ArrayBuffer | null = null;
    if (typeof window.rbiLoadCloudPdfArrayBuffer === 'function') {
      buf = await window.rbiLoadCloudPdfArrayBuffer(pdfUrl);
    } else {
      if (window.PhotoManager?.getAsyncUrl) {
        try {
          const cached = await window.PhotoManager.getAsyncUrl(pdfUrl);
          if (cached && cached.startsWith('blob:')) {
            const res = await fetch(cached);
            buf = await res.arrayBuffer();
          }
        } catch {
          /* fall through */
        }
      }
      if (!buf) {
        if (navigator.onLine === false) throw new Error('PDF не кэширован офлайн');
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error('Не удалось скачать PDF');
        buf = await res.arrayBuffer();
      }
    }

    if (this.destroyed) return;
    if (!buf) throw new Error('PDF данные недоступны');

    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const hostW = Math.max(this.host.clientWidth || 640, 320);
    const hostH = Math.max(this.host.clientHeight || 400, 240);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, Math.max(0.8, Math.min((hostW - 24) / base.width, (hostH - 24) / base.height)));
    const viewport = page.getViewport({ scale });

    this.canvas.width = viewport.width;
    this.canvas.height = viewport.height;
    this.stage.style.width = `${viewport.width}px`;
    this.stage.style.height = `${viewport.height}px`;
    this.stage.style.left = '0';
    this.stage.style.top = '0';
    this.stage.style.marginLeft = '0';
    this.stage.style.marginTop = '0';
    this.stage.style.removeProperty('transform-origin');

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d недоступен');
    await page.render({ canvasContext: ctx, viewport }).promise;

    if (loader) loader.remove();
    this._initPanzoom();
    this._syncCursor();
  }

  setMarkers(defects: ConstructionDefectV2[], opts?: SetMarkersOpts) {
    if (!this.pins) return;
    this._lastMarkers = defects.slice();
    const thr =
      opts?.clusterThreshold !== undefined ? opts.clusterThreshold : this._lastClusterThreshold;
    this._lastClusterThreshold = thr;

    const items = thr <= 0 ? null : clusterDefects(defects, thr);
    const parts: string[] = [];

    if (!items) {
      defects.forEach((d, i) => {
        const pin = this._singlePinHtml(d, i + 1, Number(d.x), Number(d.y));
        if (pin) parts.push(pin);
      });
    } else {
      const expandKey = this._expandedClusterKey;
      for (const item of items) {
        if (item.kind === 'single') {
          const pin = this._singlePinHtml(item.defects[0], item.num, item.x, item.y);
          if (pin) parts.push(pin);
          continue;
        }
        const key = item.defects
          .map((d) => d.id)
          .sort()
          .join(',');
        if (expandKey && expandKey === key) {
          const spider = spiderPositions(item.x, item.y, item.defects.length);
          item.defects.forEach((d, i) => {
            const pos = spider[i] || { x: item.x, y: item.y };
            const idx = defects.findIndex((x) => x.id === d.id);
            const num = idx >= 0 ? idx + 1 : i + 1;
            const pin = this._singlePinHtml(d, num, pos.x, pos.y);
            if (pin) parts.push(pin);
          });
          // Центр-кнопка «свернуть»
          parts.push(`<button type="button" data-c2-cluster-collapse="${_escapeAttr(key)}"
            class="absolute w-5 h-5 rounded-full bg-slate-800/80 text-white text-[8px] font-black
                   border border-white shadow z-25 flex items-center justify-center
                   pointer-events-auto panzoom-exclude"
            style="left:${item.x}%;top:${item.y}%;transform:translate(-50%,-50%);transition:transform 150ms ease"
            title="${_escapeAttr(_t('construction.v2.collapse_cluster', 'Свернуть'))}">×</button>`);
        } else {
          parts.push(this._clusterBubbleHtml(item.x, item.y, item.defects, key));
        }
      }
    }

    this.pins.innerHTML = parts.join('');
    this._bindPinHoverScale();
    this._applyHighlight();
  }

  /** Grow pin on hover without losing centering (inline transform beats style.css lift). */
  private _bindPinHoverScale() {
    if (!this.pins) return;
    const rest = 'translate(-50%,-50%)';
    const hover = 'translate(-50%,-50%) scale(1.15)';
    this.pins
      .querySelectorAll('[data-c2-pin], [data-c2-cluster], [data-c2-cluster-collapse]')
      .forEach((node) => {
        const el = node as HTMLElement;
        el.addEventListener('pointerenter', () => {
          el.style.transform = hover;
        });
        el.addEventListener('pointerleave', () => {
          el.style.transform = rest;
        });
      });
  }

  private _singlePinHtml(
    d: ConstructionDefectV2,
    num: number,
    x: number,
    y: number
  ): string {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
    const bg = _pinBg(String(d.category), String(d.status));
    const title = _escapeAttr(String(d.description || '').slice(0, 80));
    return `<button type="button" data-c2-pin="${_escapeAttr(d.id)}"
      class="absolute w-6 h-6 ${bg} rounded-full border-2 border-white shadow-md
             flex items-center justify-center text-white text-[10px] font-black
             z-20 pointer-events-auto panzoom-exclude"
      style="left:${x}%;top:${y}%;transform:translate(-50%,-50%);cursor:pointer;transition:transform 150ms ease" title="${title}">${num}</button>`;
  }

  private _clusterBubbleHtml(
    x: number,
    y: number,
    defects: ConstructionDefectV2[],
    key: string
  ): string {
    const total = defects.length;
    let red = 0;
    let orange = 0;
    let blue = 0;
    let green = 0;
    for (const d of defects) {
      const st = String(d.status || '').toLowerCase();
      if (st === 'closed' || st === 'fixed') green++;
      else {
        const c = String(d.category || '').toLowerCase();
        if (c === 'critical' || c === 'b3') red++;
        else if (c === 'major' || c === 'b2') orange++;
        else blue++;
      }
    }
    const cRed = (red / total) * 360;
    const cOrange = cRed + (orange / total) * 360;
    const cBlue = cOrange + (blue / total) * 360;
    const grad = `conic-gradient(from 0deg, #ef4444 0deg ${cRed}deg, #f97316 ${cRed}deg ${cOrange}deg, #3b82f6 ${cOrange}deg ${cBlue}deg, #22c55e ${cBlue}deg 360deg)`;
    const ids = defects.map((d) => d.id).join(',');
    return `<button type="button" data-c2-cluster="${_escapeAttr(key)}" data-c2-cluster-ids="${_escapeAttr(ids)}"
      class="absolute w-8 h-8 rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.3)] flex items-center justify-center
             z-30 pointer-events-auto panzoom-exclude"
      style="left:${x}%;top:${y}%;background:${grad};padding:3px;transform:translate(-50%,-50%);cursor:pointer;transition:transform 150ms ease" title="${_escapeAttr(_t('construction.v2.defects_count', 'Замечаний: {count}', { count: total }))}">
      <span class="w-full h-full bg-white text-slate-800 rounded-full flex items-center justify-center
                   text-[11px] font-black border border-slate-200">${total}</span>
    </button>`;
  }

  collapseClusterExpand() {
    if (!this._expandedClusterKey) return;
    this._expandedClusterKey = null;
    this.setMarkers(this._lastMarkers, { clusterThreshold: this._lastClusterThreshold });
  }

  setZones(items: ConstructionAcceptanceV2[]) {
    if (!this.zonesEl) return;
    const html = items
      .map((a) => {
        const z = a.zone;
        if (!z) return '';
        const x = Number(z.x);
        const y = Number(z.y);
        const w = Number(z.w);
        const h = Number(z.h);
        if (![x, y, w, h].every(Number.isFinite)) return '';
        const colors = _zoneColors(String(a.status));
        const title = _escapeAttr(String(a.work_type || _t('construction.v2.acceptance_default', 'Приёмка')).slice(0, 60));
        const focus = this.focusZoneId === a.id ? 'ring-4 ring-indigo-400' : '';
        const zIndex = this.focusZoneId === a.id ? 25 : 10;
        return `<button type="button" data-c2-zone="${_escapeAttr(a.id)}"
          class="absolute border-2 ${colors.box} ${focus} shadow-inner flex items-center justify-center
                 cursor-pointer hover:bg-black/10 transition-colors pointer-events-auto panzoom-exclude"
          style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;z-index:${zIndex}" title="${title}">
          <span class="${colors.label} text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase">${_t('construction.v2.zone_label', 'зона')}</span>
        </button>`;
      })
      .join('');
    this.zonesEl.innerHTML = html;
  }

  /** Временный пин «+» в режиме выдачи — как legacy drawTempPin. */
  drawTempPin(xPercent: number, yPercent: number) {
    if (!this.pins) return;
    this.clearTempPin();
    this.pins.insertAdjacentHTML(
      'beforeend',
      `<div id="c2-temp-pin"
        class="absolute w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg
               flex items-center justify-center text-white text-[10px] font-black z-30
               animate-bounce pointer-events-none"
        style="left:${xPercent}%;top:${yPercent}%;transform:translate(-50%,-50%)">+</div>`
    );
  }

  clearTempPin() {
    this.pins?.querySelector('#c2-temp-pin')?.remove();
  }

  clearTempZone() {
    this.zonesEl?.querySelector('#c2-temp-zone')?.remove();
    this.zonesEl?.querySelector('#c2-temp-zone-dot')?.remove();
  }

  private _drawTempZone(zone: AcceptanceZoneV2) {
    if (!this.zonesEl) return;
    this.clearTempZone();
    this.zonesEl.insertAdjacentHTML(
      'beforeend',
      `<div id="c2-temp-zone"
        class="absolute border-2 border-dashed border-indigo-500 bg-indigo-500/20 z-30 pointer-events-none"
        style="left:${zone.x}%;top:${zone.y}%;width:${zone.w}%;height:${zone.h}%;"></div>`
    );
  }

  private _initPanzoom() {
    this._destroyPanzoom();
    const factory = _panzoomFactory();
    if (!factory || !this.stage || !this.wrap) return;
    const helper = _planPz();
    const pinchStep = helper?.PINCH_STEP ?? PZ_PINCH_STEP;
    const opts = helper
      ? helper.baseOptions({
          maxScale: PZ_MAX,
          minScale: PZ_MIN,
          startScale: 1,
          startX: 0,
          startY: 0
        })
      : {
          maxScale: PZ_MAX,
          minScale: PZ_MIN,
          step: pinchStep,
          startScale: 1,
          startX: 0,
          startY: 0,
          pinchAndPan: true,
          touchAction: 'none',
          cursor: 'grab',
          excludeClass: 'panzoom-exclude'
        };
    this.panzoom = factory(this.stage, opts);
    // Центр после layout (origin 50% 50% по умолчанию)
    const doCenter = () => {
      if (!this.panzoom || !this.wrap || !this.stage) return;
      if (helper) helper.center(this.panzoom, this.wrap, this.stage);
      else {
        const wr = this.wrap.getBoundingClientRect();
        const er = this.stage.getBoundingClientRect();
        const dx = wr.left + wr.width / 2 - (er.left + er.width / 2);
        const dy = wr.top + wr.height / 2 - (er.top + er.height / 2);
        const s = this.panzoom.getScale() || 1;
        const pan = this.panzoom.getPan();
        this.panzoom.pan(pan.x + dx / s, pan.y + dy / s, { animate: false, force: true });
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(doCenter));

    this._onWheelBound = (e: WheelEvent) => {
      if (!this.panzoom) return;
      if (helper) helper.wheelZoom(this.panzoom, e, PZ_MIN, PZ_MAX);
      else {
        e.preventDefault();
        const cur = this.panzoom.getScale() || 1;
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;
        if (dy > 60) dy = 60;
        if (dy < -60) dy = -60;
        const next = Math.min(PZ_MAX, Math.max(PZ_MIN, cur * Math.exp(-dy * 0.0016)));
        this.panzoom.zoomToPoint(next, { clientX: e.clientX, clientY: e.clientY });
      }
    };
    this.wrap.addEventListener('wheel', this._onWheelBound, { passive: false });
    this._lastPointerClient = null;
    this._onPointerBound = (e: PointerEvent | MouseEvent) => {
      this._lastPointerClient = { x: e.clientX, y: e.clientY };
    };
    this.wrap.addEventListener('pointermove', this._onPointerBound);
    this.wrap.addEventListener('mousemove', this._onPointerBound);
  }

  private _destroyPanzoom() {
    if (this.wrap && this._onWheelBound) {
      this.wrap.removeEventListener('wheel', this._onWheelBound);
    }
    this._onWheelBound = null;
    if (this.wrap && this._onPointerBound) {
      this.wrap.removeEventListener('pointermove', this._onPointerBound);
      this.wrap.removeEventListener('mousemove', this._onPointerBound);
    }
    this._onPointerBound = null;
    this._lastPointerClient = null;
    if (this.panzoom) {
      try {
        this.panzoom.destroy();
      } catch {
        /* ignore */
      }
      this.panzoom = null;
    }
  }

  private _applyHighlight() {
    const pins = this.pins?.querySelectorAll('[data-c2-pin]');
    pins?.forEach((el) => {
      const hid = el as HTMLElement;
      const match = !!this.highlightId && hid.getAttribute('data-c2-pin') === this.highlightId;
      hid.classList.toggle('ring-4', match);
      hid.classList.toggle('ring-yellow-300', match);
      hid.classList.toggle('scale-150', match);
      hid.classList.toggle('animate-pulse', match);
      hid.style.zIndex = match ? '40' : '';
    });
  }

  private _panToMarker(id: string) {
    if (!this.panzoom || !this.wrap) return;
    const el = this.getMarkerEl(id);
    if (!el) return;
    const run = () => {
      if (!this.panzoom || !this.wrap) return;
      const er = el.getBoundingClientRect();
      const wr = this.wrap.getBoundingClientRect();
      const dx = wr.left + wr.width / 2 - (er.left + er.width / 2);
      const dy = wr.top + wr.height / 2 - (er.top + er.height / 2);
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      const pan = this.panzoom.getPan();
      const s = this.panzoom.getScale() || 1;
      this.panzoom.pan(pan.x + dx / s, pan.y + dy / s, { animate: true });
    };
    // Чуть увеличить, если слишком мелко (к центру wrap — без дёрганья к курсору)
    if (this.panzoom.getScale() < 1.2) {
      const wr = this.wrap.getBoundingClientRect();
      this.panzoom.zoomToPoint(1.5, {
        clientX: wr.left + wr.width / 2,
        clientY: wr.top + wr.height / 2
      });
      setTimeout(run, 220);
    } else {
      requestAnimationFrame(run);
    }
  }

  private _syncCursor() {
    if (!this.wrap) return;
    const cross = this.addMode || this.zoneMode;
    this.wrap.classList.toggle('cursor-crosshair', cross);
    this.wrap.classList.toggle('cursor-default', !cross);
    if (this.panzoom) {
      this.panzoom.setOptions({
        cursor: cross ? 'crosshair' : 'grab',
        disablePan: cross
      });
    }
  }

  private _onClick(ev: MouseEvent) {
    const t = ev.target as HTMLElement | null;
    const zoneBtn = t?.closest?.('[data-c2-zone]') as HTMLElement | null;
    if (zoneBtn && !this.zoneMode && !this.addMode) {
      const id = zoneBtn.getAttribute('data-c2-zone');
      if (id) this.handlers.onZoneClick?.(id);
      return;
    }
    const collapseBtn = t?.closest?.('[data-c2-cluster-collapse]') as HTMLElement | null;
    if (collapseBtn && !this.zoneMode) {
      this.collapseClusterExpand();
      return;
    }
    const clusterBtn = t?.closest?.('[data-c2-cluster]') as HTMLElement | null;
    if (clusterBtn && !this.zoneMode && !this.addMode) {
      const key = clusterBtn.getAttribute('data-c2-cluster');
      if (key) {
        this._expandedClusterKey = key;
        this.setMarkers(this._lastMarkers, { clusterThreshold: this._lastClusterThreshold });
      }
      return;
    }
    const pin = t?.closest?.('[data-c2-pin]') as HTMLElement | null;
    if (pin && !this.zoneMode) {
      const id = pin.getAttribute('data-c2-pin');
      if (id) {
        this._expandedClusterKey = null;
        this.handlers.onMarkerClick?.(id);
      }
      return;
    }
    // Клик мимо — свернуть spider (не запускать add/zone в том же клике)
    if (this._expandedClusterKey && !this.addMode && !this.zoneMode) {
      this.collapseClusterExpand();
      return;
    }
    if (!this.stage) return;
    const rect = this.stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPercent = ((ev.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((ev.clientY - rect.top) / rect.height) * 100;
    if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) return;

    if (this.zoneMode) {
      if (!this.zoneClick1) {
        this.zoneClick1 = { x: xPercent, y: yPercent };
        this.clearTempZone();
        this.zonesEl?.insertAdjacentHTML(
          'beforeend',
          `<div id="c2-temp-zone-dot"
            class="absolute w-3 h-3 bg-indigo-600 rounded-full border-2 border-white z-30
                   pointer-events-none"
            style="left:${xPercent}%;top:${yPercent}%;transform:translate(-50%,-50%)"></div>`
        );
        return;
      }
      const x1 = this.zoneClick1.x;
      const y1 = this.zoneClick1.y;
      const x = Math.min(x1, xPercent);
      const y = Math.min(y1, yPercent);
      const w = Math.max(0.5, Math.abs(xPercent - x1));
      const h = Math.max(0.5, Math.abs(yPercent - y1));
      const zone: AcceptanceZoneV2 = { x, y, w, h };
      this._drawTempZone(zone);
      this.zoneClick1 = null;
      this.handlers.onZoneDrawn?.(zone);
      return;
    }

    if (!this.addMode) return;
    this.handlers.onPlanClick?.(xPercent, yPercent);
  }

  getPdfUrl(): string {
    return this.pdfUrl;
  }
}
