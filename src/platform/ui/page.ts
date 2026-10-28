/**
 * Детали экрана дизайн-системы Platform 2.0 (P2-0047, раздел «Детали» DESIGN_SYSTEM.md; каждая — на странице «Образцы»):
 * вкладки подчёркиванием (из План/Факта, P2-0046), лист снизу на телефоне / панель справа на ПК, меню «⋯», карточка записи
 * («подпись — значение»), метка стадии (цвет + слово, на StatusBadge). Данных не грузят; тексты и действия даёт экран.
 */
import { createElement as h, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { StatusBadge } from './primitives.ts';
import type { Status } from './primitives.ts';

/** Вкладки раздела — подчёркиванием, обычными буквами; на телефоне листаются вбок внутри строки. */
export function PageTabs(props: { testId: string; items: { id: string; label: ReactNode[] }[]; active: string; onPick: (id: string) => void }): ReactElement {
  return h('div', { className: 'pf-tabs', role: 'tablist', 'data-testid': props.testId },
    props.items.map((t) => h('button', { key: t.id, type: 'button', role: 'tab', 'aria-selected': props.active === t.id, 'data-sub': t.id,
      className: 'pf-tab' + (props.active === t.id ? ' pf-tab--active' : ''), onClick: () => props.onPick(t.id) }, ...t.label)));
}

/** Лист снизу (телефон) / панель справа (ПК от 900 px): заголовок, «Закрыть», Esc и нажатие мимо — закрывают. */
export function Sheet(props: { title: string; sub?: string; testId: string; onClose: () => void; children?: ReactNode; footer?: ReactNode }): ReactElement {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return h('div', { className: 'p2-sheet-wrap' },
    h('div', { className: 'p2-sheet-backdrop', onClick: onClose, 'aria-hidden': 'true' }),
    h('div', { className: 'p2-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': props.title, 'data-testid': props.testId },
      h('div', { className: 'p2-sheet__head' },
        h('div', { className: 'p2-sheet__title' }, h('b', null, props.title), props.sub ? h('span', null, props.sub) : null),
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': props.testId + '-close', onClick: onClose }, 'Закрыть')),
      h('div', { className: 'p2-sheet__body' }, props.children),
      props.footer ? h('div', { className: 'p2-sheet__foot' }, props.footer) : null));
}

export interface MoreItem { id: string; label: string; hint?: string; danger?: boolean; onClick: () => void; /** P2-0055: пункт виден, но неактивен (причина — в hint). */ disabled?: boolean }
/** Меню «⋯»: редкие действия экрана или строки; закрывается после выбора, нажатием мимо и Esc. */
export function MoreMenu(props: { testId: string; items: MoreItem[]; label?: string }): ReactElement | null {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); window.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', key); };
  }, [open]);
  if (!props.items.length) return null;
  const label = props.label || 'Ещё действия';
  return h('div', { className: 'p2-more', ref },
    h('button', { type: 'button', className: 'pf-btn pf-btn--ghost p2-more__btn', 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-label': label, title: label,
      'data-testid': props.testId, onClick: () => setOpen(!open) }, '⋯'),
    open ? h('div', { className: 'p2-more__menu', role: 'menu', 'data-testid': props.testId + '-menu' },
      props.items.map((it) => h('button', { key: it.id, type: 'button', role: 'menuitem', 'data-item': it.id, className: 'p2-more__item' + (it.danger ? ' p2-more__item--danger' : ''),
        disabled: it.disabled || undefined, 'aria-disabled': it.disabled || undefined,
        onClick: () => { if (it.disabled) return; setOpen(false); it.onClick(); } }, h('span', null, it.label), it.hint ? h('small', null, it.hint) : null))) : null);
}

/** Карточка записи: поля «подпись — значение» сеткой (ПК — cols колонок, планшет — 2, телефон — 1); пустое — «—». */
export function RecordFields(props: { testId: string; cols?: number; fields: { id: string; label: string; value: ReactNode }[] }): ReactElement {
  return h('div', { className: 'p2-rec', style: { ['--p2-rec-cols' as string]: String(props.cols || 4) }, 'data-testid': props.testId },
    props.fields.map((f) => h('div', { key: f.id, className: 'p2-rec__f', 'data-field': f.id },
      h('span', { className: 'p2-rec__l' }, f.label),
      h('b', { className: 'p2-rec__v' }, f.value === null || f.value === undefined || f.value === '' ? '—' : f.value))));
}

/** Метка стадии / вида: цвет и слово (цвет не единственный признак — слово всегда есть). */
export function StageBadge(props: { label: string; tone: Status; testId?: string }): ReactElement {
  return h(StatusBadge, { status: props.tone, label: props.label, testId: props.testId || 'p2-stage' });
}

/** Полоса стадий: пройденные, текущая (выделена), будущие; подписи — из справочника. */
export function StageStrip(props: { testId: string; items: { code: string; name: string }[]; current: string }): ReactElement {
  const at = props.items.findIndex((s) => s.code === props.current);
  return h('ol', { className: 'p2-stages', 'data-testid': props.testId, 'aria-label': 'Стадия проекта' },
    props.items.map((s, i) => h('li', { key: s.code, className: 'p2-stages__s' + (i < at ? ' is-done' : i === at ? ' is-current' : ''), 'aria-current': i === at ? 'step' : undefined },
      h('i', { 'aria-hidden': 'true' }), h('span', null, s.name))));
}

export const P2_PAGE_CSS = `
/* вкладки раздела — подчёркиванием (P2-0046) */
.pf-tabs{display:flex;flex-wrap:nowrap;gap:20px;border-bottom:1px solid var(--card-border);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;min-width:0}
.pf-tabs::-webkit-scrollbar{display:none}
.pf-tab{font:inherit;font-size:14px;font-weight:500;color:var(--text-muted);background:transparent;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;padding:10px 0 9px;min-height:44px;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;gap:6px;flex:0 0 auto}
.pf-tab:hover{color:var(--text-main)}
.pf-tab--active{color:var(--text-main);font-weight:600;border-bottom-color:var(--accent,var(--primary))}
.pf-tab:focus-visible{outline:2px solid var(--accent,var(--primary));outline-offset:2px}
.pf-tab-n{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--hover-bg,var(--card-border));color:var(--text-main);font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
@media (max-width:767.98px){.pf-tabs{gap:16px}}
/* лист снизу / панель справа */
.p2-sheet-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:1190}
.p2-sheet{position:fixed;left:0;right:0;bottom:0;z-index:1200;display:flex;flex-direction:column;gap:12px;max-height:88vh;overflow-y:auto;padding:14px 16px calc(16px + env(safe-area-inset-bottom,0px));
  background:var(--card-bg);color:var(--text-main);border-radius:16px 16px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.25)}
.p2-sheet__head{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}
.p2-sheet__title{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.p2-sheet__title b{font-size:16px;font-weight:600}
.p2-sheet__title span{font-size:12.5px;color:var(--text-muted)}
.p2-sheet__body{display:flex;flex-direction:column;gap:12px}
.p2-sheet__foot{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;padding-top:4px}
.p2-sheet__foot .pf-btn{min-height:44px}
@media (min-width:900px){.p2-sheet{left:auto;top:0;bottom:0;width:460px;max-height:none;border-radius:16px 0 0 16px;box-shadow:-6px 0 24px rgba(0,0,0,.25)}}
/* меню «⋯» */
.p2-more{position:relative;display:inline-flex}
.p2-more__btn{min-width:44px;min-height:40px;font-size:18px;line-height:1;font-weight:700}
.p2-more__menu{position:absolute;right:0;top:calc(100% + 4px);z-index:1100;min-width:240px;display:flex;flex-direction:column;padding:6px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.18)}
.p2-more__item{font:inherit;text-align:left;display:flex;flex-direction:column;gap:2px;padding:10px 12px;min-height:44px;border:0;border-radius:8px;background:transparent;color:var(--text-main);cursor:pointer;font-size:14px;font-weight:500}
.p2-more__item small{font-size:12px;color:var(--text-muted);font-weight:400}
.p2-more__item:hover,.p2-more__item:focus-visible{background:var(--hover-bg,rgba(0,0,0,.05));outline:none}
.p2-more__item--danger{color:var(--p2-status-red-fg,#b5452b)}
.p2-more__item[disabled]{color:var(--text-muted);cursor:default;background:transparent}
/* карточка записи */
.p2-rec{display:grid;grid-template-columns:repeat(var(--p2-rec-cols,4),minmax(0,1fr));gap:12px 22px;padding:14px 16px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:14px}
.p2-rec__f{display:flex;flex-direction:column;gap:2px;min-width:0}
.p2-rec__l{font-size:12px;color:var(--text-muted)}
.p2-rec__v{font-size:14px;font-weight:600;overflow-wrap:anywhere}
@media (max-width:1023.98px){.p2-rec{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:599.98px){.p2-rec{grid-template-columns:1fr}}
/* полоса стадий */
.p2-stages{list-style:none;margin:0;padding:12px 14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:6px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:14px}
.p2-stages__s{display:flex;flex-direction:column;gap:5px;min-width:0}
.p2-stages__s i{display:block;height:6px;border-radius:3px;background:var(--card-border)}
.p2-stages__s span{font-size:11.5px;color:var(--text-muted);overflow-wrap:anywhere}
.p2-stages__s.is-done i{background:color-mix(in srgb,var(--p2-chart-fact,#2a6f9e) 45%,transparent)}
.p2-stages__s.is-current i{background:var(--p2-chart-fact,#2a6f9e)}
.p2-stages__s.is-current span{color:var(--text-main);font-weight:700}
`;
