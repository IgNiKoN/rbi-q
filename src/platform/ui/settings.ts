/**
 * P2-0038: общие элементы разделов «Настроек» (Компания, Модули, Платформа): меню действий «⋯», диалог подтверждения,
 * классы карточки-строки и адаптивной таблицы (на узком экране строки — карточки). Цвета — только токены оболочки.
 * Выделено из «Компании» (co-*): действия по строке — в меню, подтверждение — диалог, а не «Да/Нет» внутри строки.
 */
import { createElement as h, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
}

/** Кнопка «⋯» и выпадающий список действий; закрывается выбором, Escape или нажатием вне меню. */
export function ActionsMenu(props: { label: string; items: MenuItem[]; testId?: string }): ReactElement | null {
  const { label, items, testId } = props;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: Event): void => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!items.length) return null;
  return h('div', { className: 'sui-menu', ref: box },
    h('button', { type: 'button', className: 'sui-menu-btn', 'aria-label': label, title: label, 'aria-haspopup': 'menu', 'aria-expanded': open,
      'data-testid': testId, onClick: () => setOpen(!open) }, '⋯'),
    open ? h('div', { className: 'sui-menu-list', role: 'menu' },
      items.map((it) => h('button', { key: it.key, type: 'button', role: 'menuitem', disabled: it.disabled, 'data-testid': it.testId,
        className: 'sui-menu-item' + (it.danger ? ' sui-menu-item--danger' : ''),
        onClick: () => { setOpen(false); it.onSelect(); } }, it.label))) : null);
}

/** Диалог подтверждения необратимого или заметного действия: заголовок, пояснение, «Да, …» и «Нет». */
export function ConfirmDialog(props: {
  title: string; text?: string; yes: string; onYes: () => void; onNo: () => void; danger?: boolean; busy?: boolean; yesTestId?: string;
}): ReactElement {
  const { title, text, yes, onYes, onNo, danger, busy, yesTestId } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onNo(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onNo]);
  return h('div', { className: 'sui-dialog-back', onClick: (e: { target: unknown; currentTarget: unknown }) => { if (e.target === e.currentTarget) onNo(); } },
    h('div', { className: 'sui-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': title, 'data-testid': 'sui-dialog' },
      h('div', { className: 'sui-dialog-title' }, title),
      text ? h('div', { className: 'sui-dialog-text' }, text) : null,
      h('div', { className: 'sui-dialog-actions' },
        h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', onClick: onNo }, 'Нет'),
        h('button', { type: 'button', className: 'pf-btn' + (danger ? ' sui-danger' : ''), disabled: busy, 'data-testid': yesTestId, onClick: onYes }, yes))));
}

export const SETTINGS_UI_CSS = `
.sui-menu{position:relative;display:inline-flex;flex:none}
.sui-menu-btn{min-width:40px;min-height:40px;padding:0 10px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main);font-size:18px;font-weight:900;line-height:1;cursor:pointer}
.sui-menu-btn:hover,.sui-menu-btn[aria-expanded=true]{background:var(--hover-bg)}
.sui-menu-list{position:absolute;right:0;top:calc(100% + 4px);z-index:50;min-width:200px;max-width:min(280px,calc(100vw - 32px));display:flex;flex-direction:column;padding:4px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;box-shadow:var(--shadow-card,0 8px 24px rgba(0,0,0,.18))}
.sui-menu-item{min-height:44px;padding:8px 12px;border:0;border-radius:8px;background:transparent;color:var(--text-main);font-size:14px;text-align:left;cursor:pointer}
.sui-menu-item:hover{background:var(--hover-bg)}
.sui-menu-item:disabled{color:var(--text-muted);cursor:default}
.sui-menu-item--danger{color:var(--color-red)}
.sui-dialog-back{position:fixed;inset:0;z-index:8000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.45)}
.sui-dialog{width:100%;max-width:420px;display:flex;flex-direction:column;gap:12px;padding:20px;background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow-card,0 12px 32px rgba(0,0,0,.3))}
.sui-dialog-title{font-size:16px;font-weight:800}
.sui-dialog-text{font-size:14px;color:var(--text-muted);overflow-wrap:anywhere}
.sui-dialog-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.sui-dialog-actions .pf-btn{min-height:44px}
.sui-danger{background:var(--color-red);border-color:var(--color-red)}
.sui-cards{display:flex;flex-direction:column;gap:10px}
.sui-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow-card);padding:12px 14px;min-width:0}
.sui-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.sui-card-main{min-width:0;flex:1 1 auto}
.sui-sub{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0 0;margin-top:10px;border-top:1px solid var(--card-border)}
.sui-sub-main{min-width:0;flex:1 1 auto;font-size:13px}
.sui-sub-meta{font-size:12px;color:var(--text-muted);overflow-wrap:anywhere}
.sui-panel{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow-card);padding:12px 14px;min-width:0}
.sui-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end}
.sui-filters .pf-field{min-width:0}
.sui-filters .co-input,.sui-filters input,.sui-filters select{width:100%;min-width:0;box-sizing:border-box}
.sui-more{align-self:center}
.sui-table{width:100%;border-collapse:collapse;font-size:13px}
.sui-table th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);padding:10px 14px;border-bottom:1px solid var(--card-border);white-space:nowrap}
.sui-table td{padding:8px 14px;border-bottom:1px solid var(--card-border);vertical-align:top;overflow-wrap:anywhere}
.sui-table tbody tr:last-child td{border-bottom:0}
@media (max-width:760px){
.sui-table thead{display:none}
.sui-table,.sui-table tbody,.sui-table tr,.sui-table td{display:block;width:100%}
.sui-table tr{padding:10px 12px;border-bottom:1px solid var(--card-border)}
.sui-table tbody tr:last-child{border-bottom:0}
.sui-table td{padding:2px 0;border:0}
.sui-table td[data-label]::before{content:attr(data-label) ': ';font-size:11px;color:var(--text-muted)}
}
`;
