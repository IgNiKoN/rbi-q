/**
 * Слоты приёмки construction-v2 — чистые хелперы + HTML-фрагменты.
 */

export const SLOT_HOURS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00'
] as const;

export type SlotHour = (typeof SLOT_HOURS)[number];

export type SlotAcceptanceLite = {
  id?: string;
  locationId?: string;
  requested_date?: string | null;
  requested_time?: string | null;
  status?: string | null;
  is_deleted?: boolean;
  _deleted?: boolean;
  work_type?: string | null;
};

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

function _escape(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _normTime(t: string | null | undefined): string {
  const s = String(t || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function _isActive(a: SlotAcceptanceLite): boolean {
  if (a.is_deleted || a._deleted) return false;
  const st = String(a.status || 'pending').toLowerCase();
  return st === 'pending' || st === 'accepted';
}

export type SlotOccupancy = {
  time: string;
  taken: boolean;
  count: number;
  items: SlotAcceptanceLite[];
};

/** Занятость окон дня; опционально сузить к locationId. */
export function listSlotOccupancy(
  acceptances: SlotAcceptanceLite[],
  opts: { date: string; locationId?: string | null }
): SlotOccupancy[] {
  const date = String(opts.date || '').trim();
  const loc = opts.locationId != null ? String(opts.locationId).trim() : '';
  const dayItems = (acceptances || []).filter((a) => {
    if (!_isActive(a)) return false;
    if (String(a.requested_date || '').trim() !== date) return false;
    if (loc && String(a.locationId || '').trim() !== loc) return false;
    return true;
  });

  return SLOT_HOURS.map((time) => {
    const items = dayItems.filter((a) => _normTime(a.requested_time) === time);
    return { time, taken: items.length > 0, count: items.length, items };
  });
}

export function isSlotTaken(
  acceptances: SlotAcceptanceLite[],
  opts: {
    date: string;
    time: string;
    locationId: string;
    excludeId?: string | null;
  }
): boolean {
  const date = String(opts.date || '').trim();
  const time = _normTime(opts.time);
  const loc = String(opts.locationId || '').trim();
  const exclude = String(opts.excludeId || '').trim();
  if (!date || !time || !loc) return false;
  return (acceptances || []).some((a) => {
    if (!_isActive(a)) return false;
    if (exclude && String(a.id || '') === exclude) return false;
    if (String(a.requested_date || '').trim() !== date) return false;
    if (_normTime(a.requested_time) !== time) return false;
    return String(a.locationId || '').trim() === loc;
  });
}

/** `<option>` для select времени. */
export function slotTimeOptionsHtml(selected?: string | null): string {
  const sel = _normTime(selected) || '14:00';
  return SLOT_HOURS.map((h) => {
    const nextH = Number(h.slice(0, 2)) + 1;
    const end = `${String(nextH).padStart(2, '0')}:00`;
    const isSel = h === sel ? ' selected' : '';
    return `<option value="${h}"${isSel}>${h} - ${end}</option>`;
  }).join('');
}

/** Сетка занятости дня (для канбана). */
export function slotBoardHtml(
  occupancy: SlotOccupancy[],
  opts?: { title?: string }
): string {
  const title = opts?.title || _t('construction.v2.slots.day_title', 'Слоты дня');
  const cells = occupancy
    .map((o) => {
      const cls = o.taken
        ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
        : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300';
      const label = o.taken
        ? _t('construction.v2.slots.taken', 'занято{suffix}', { suffix: o.count > 1 ? ` ×${o.count}` : '' })
        : _t('construction.v2.slots.free', 'свободно');
      const tip = o.items
        .map((i) => String(i.work_type || i.id || '').slice(0, 40))
        .filter(Boolean)
        .join('; ');
      return `<div class="rounded-xl border px-2 py-1.5 text-center ${cls}" title="${_escape(tip)}">
        <div class="text-rbi-caption font-black">${o.time}</div>
        <div class="text-rbi-caption font-bold uppercase tracking-wide">${_escape(label)}</div>
      </div>`;
    })
    .join('');
  return `
    <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3">
      <div class="text-rbi-caption font-black uppercase tracking-widest text-brand mb-2">${_escape(title)}</div>
      <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5">${cells}</div>
    </div>`;
}
