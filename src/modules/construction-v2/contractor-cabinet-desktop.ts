/**
 * Desktop-вид subview «Кабинет» подрядчика construction-v2 (≥1280px).
 * Тот же контракт вызова, что у mobile `renderContractorCabinet` — переиспользует бизнес-логику
 * (`isOverdueNow`, `filterAcceptancesForRole`/`filterDefectsForRole`/`resolveMyContractorId`,
 * `listSlotOccupancy`/`slotBoardHtml`), не копирует и не импортирует приватные view-хелперы
 * `contractor-cabinet.ts` (не экспортированы). Без собственного module-state — чистая
 * презентационная функция, как mobile-версия. Отличие от mobile: 4 секции (открытые/на
 * проверке/просроченные/ближайшие слоты) — 2-колоночная сетка вместо вертикального стека.
 */

import type { ConstructionAcceptanceV2 } from '../../services/construction-acceptance/types';
import type { ConstructionDefectV2 } from '../../services/construction-defects/types';
import { isOverdueNow } from './defect-sla-metrics';
import {
  filterAcceptancesForRole,
  filterDefectsForRole,
  resolveMyContractorId
} from './contractor-scope';
import { listSlotOccupancy, slotBoardHtml } from './acceptance-slots';
import type { CabinetCallbacks } from './contractor-cabinet';

type LocNode = { id: string; displayName: string };

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

function _today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function _pathLabel(locationId: string): string {
  const loc = window.RBI?.services?.locations as
    | { getPath?: (id: string) => LocNode[]; getNode?: (id: string) => LocNode | null }
    | undefined;
  if (loc?.getPath) {
    return loc
      .getPath(locationId)
      .map((n) => n.displayName)
      .join(' · ');
  }
  return loc?.getNode?.(locationId)?.displayName || locationId;
}

function _statusLabel(s: string): string {
  const map: Record<string, [string, string]> = {
    issued: ['construction.status.issued', 'Выдано'],
    in_progress: ['construction.status.in_progress', 'В работе'],
    fixed: ['construction.status.fixed', 'На проверке'],
    closed: ['construction.status.closed', 'Закрыто'],
    rejected: ['construction.status.rejected', 'Отклонено'],
    pending: ['construction.v2.cabinet.status_pending', 'Ожидает'],
    accepted: ['construction.v2.cabinet.status_accepted', 'Принята']
  };
  const entry = map[String(s || '').toLowerCase()];
  return entry ? _t(entry[0], entry[1]) : s || '—';
}

function _kpiDesk(label: string, value: number, tone = ''): string {
  const toneCls =
    tone === 'danger'
      ? 'border-danger-soft'
      : tone === 'warn'
        ? 'border-amber-200 dark:border-amber-900/40'
        : 'border-[var(--card-border)]';
  return `<div class="flex-1 bg-[var(--card-bg)] border ${toneCls} rounded-2xl px-4 py-3">
    <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-1.5">${_escape(label)}</div>
    <div class="text-[26px] font-black text-ink leading-none">${value}</div>
  </div>`;
}

function _defectRowDesk(d: ConstructionDefectV2): string {
  const desc = String(d.description || d.item_name || d.text || _t('construction.v2.no_description', 'Без описания')).slice(0, 120);
  const overdue = isOverdueNow(d);
  return `<li>
    <button type="button" data-c2-cab-desk-def="${_escape(d.id)}"
      class="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
        overdue ? 'bg-danger-soft' : ''
      }">
      <span class="flex flex-wrap items-center gap-1.5 mb-0.5">
        <span class="text-rbi-caption font-bold text-muted">${_escape(String(d.category || ''))}</span>
        <span class="text-rbi-caption font-bold uppercase text-brand">${_escape(_statusLabel(String(d.status)))}</span>
        ${overdue ? `<span class="text-rbi-caption font-bold uppercase text-danger">${_escape(_t('construction.v2.registry.overdue', 'просрочено'))}</span>` : ''}
      </span>
      <span class="block text-rbi-body font-medium text-ink line-clamp-2">${_escape(desc)}</span>
      <span class="block text-rbi-caption text-muted mt-0.5">${_escape(_pathLabel(d.locationId))}</span>
    </button>
  </li>`;
}

function _accRowDesk(a: ConstructionAcceptanceV2): string {
  return `<li>
    <button type="button" data-c2-cab-desk-acc="${_escape(a.id)}"
      class="w-full text-left px-3 py-2.5 hover:bg-brand-soft transition-colors">
      <span class="flex flex-wrap items-center gap-1.5 mb-0.5">
        <span class="text-rbi-caption font-bold uppercase text-brand">${_escape(_statusLabel(String(a.status)))}</span>
        <span class="text-rbi-caption font-bold text-muted">${_escape(a.requested_date || '—')} ${_escape(
          a.requested_time || ''
        )}</span>
      </span>
      <span class="block text-rbi-body font-medium text-ink">${_escape(
        a.work_type || _t('construction.v2.kanban.no_work_type', 'Без вида работ')
      )}</span>
      <span class="block text-rbi-caption text-muted mt-0.5">${_escape(_pathLabel(a.locationId))}</span>
    </button>
  </li>`;
}

function _sectionDesk(title: string, rows: string, empty: string, gridColCls: string): string {
  return `
    <section class="${gridColCls} bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
      <div class="px-3 py-2 border-b border-surface text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape(
        title
      )}</div>
      ${
        rows
          ? `<ul class="divide-y divide-slate-100 dark:divide-slate-800">${rows}</ul>`
          : `<div class="p-4 text-center text-muted text-rbi-body">${_escape(empty)}</div>`
      }
    </section>`;
}

export function renderContractorCabinetDesktop(
  host: HTMLElement,
  opts: {
    defects: ConstructionDefectV2[];
    acceptances: ConstructionAcceptanceV2[];
    cb: CabinetCallbacks;
  }
): void {
  const myId = resolveMyContractorId();
  const defects = filterDefectsForRole(opts.defects || []);
  const acceptances = filterAcceptancesForRole(opts.acceptances || []);

  if (!myId) {
    host.innerHTML = `
      <div class="p-6 max-w-lg">
        <div class="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 text-rbi-body font-medium text-amber-900 dark:text-amber-100">
          ${_escape(_t('construction.v2.cabinet.unbound', 'Подрядчик не привязан к профилю. Обратитесь к администратору, чтобы назначить карточку подрядчика — иначе кабинет, реестр и пины будут пустыми.'))}
        </div>
      </div>`;
    return;
  }

  const open = defects.filter((d) => {
    const st = String(d.status || '').toLowerCase();
    return st === 'issued' || st === 'in_progress' || st === 'open' || st === 'rejected';
  });
  const onReview = defects.filter((d) => String(d.status || '').toLowerCase() === 'fixed');
  const overdue = defects.filter((d) => isOverdueNow(d));
  const upcoming = acceptances
    .filter((a) => {
      const st = String(a.status || '').toLowerCase();
      return st === 'pending' || st === 'accepted';
    })
    .slice()
    .sort((a, b) => {
      const da = `${a.requested_date || ''} ${a.requested_time || ''}`;
      const db = `${b.requested_date || ''} ${b.requested_time || ''}`;
      return da.localeCompare(db);
    })
    .slice(0, 8);

  const occupancy = listSlotOccupancy(acceptances, { date: _today() });

  host.innerHTML = `
    <div class="flex flex-col gap-3 p-4">
      <div class="flex items-center justify-between gap-2">
        <div class="text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape(_t('construction.v2.cabinet.title', 'Кабинет подрядчика'))}</div>
        <div class="text-rbi-caption text-muted font-bold truncate max-w-[14rem]" title="${_escape(myId)}">${_escape(_t('construction.v2.cabinet.my_id', 'мой id · {id}', { id: myId.length > 10 ? `${myId.slice(0, 8)}…` : myId }))}</div>
      </div>
      <div class="flex gap-3">
        ${_kpiDesk(_t('construction.v2.cabinet.kpi_open', 'Открытые'), open.length)}
        ${_kpiDesk(_t('construction.v2.cabinet.kpi_review', 'На проверке'), onReview.length, 'warn')}
        ${_kpiDesk(_t('construction.v2.cabinet.kpi_overdue', 'Просроченные'), overdue.length, 'danger')}
        ${_kpiDesk(_t('construction.v2.cabinet.kpi_slots', 'Слоты (скоро)'), upcoming.length)}
      </div>
      ${slotBoardHtml(occupancy, { title: _t('construction.v2.cabinet.slots_today', 'Слоты сегодня ({date})', { date: _today() }) })}
      <div class="grid grid-cols-2 gap-3">
        ${_sectionDesk(_t('construction.v2.cabinet.sec_open', 'Открытые замечания'), open.map(_defectRowDesk).join(''), _t('construction.v2.cabinet.empty_open', 'Нет открытых замечаний'), '')}
        ${_sectionDesk(_t('construction.v2.cabinet.sec_review', 'На проверке'), onReview.map(_defectRowDesk).join(''), _t('construction.v2.cabinet.empty_review', 'Нет замечаний на проверке'), '')}
        ${_sectionDesk(_t('construction.v2.cabinet.sec_overdue', 'Просроченные'), overdue.map(_defectRowDesk).join(''), _t('construction.v2.cabinet.empty_overdue', 'Нет просроченных'), '')}
        ${_sectionDesk(_t('construction.v2.cabinet.sec_upcoming', 'Ближайшие слоты приёмки'), upcoming.map(_accRowDesk).join(''), _t('construction.v2.cabinet.empty_upcoming', 'Нет заявок на приёмку'), '')}
      </div>
    </div>`;

  host.querySelectorAll('[data-c2-cab-desk-def]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const id = (btn as HTMLElement).getAttribute('data-c2-cab-desk-def');
      if (id) opts.cb.onOpenDefect(id);
    });
  });
  host.querySelectorAll('[data-c2-cab-desk-acc]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const id = (btn as HTMLElement).getAttribute('data-c2-cab-desk-acc');
      if (id) opts.cb.onOpenAcceptance(id);
    });
  });
}
