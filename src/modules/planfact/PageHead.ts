/**
 * P2-0041: шапка раздела План/Факта — одна строка «заголовок · объект · главное действие» над подвкладками.
 * Экран (ВОР, Факт, Смета, КС-2, Сводка) рисует выбор объекта и главную кнопку у себя, а InHead переносит их в шапку
 * (React-портал в места, которые дала PlanfactApp). Без шапки (экран открыт отдельно, тесты) — остаются на месте.
 * Объект общий для разделов: выбранный запоминается на устройстве; адрес (?p=…) важнее памяти.
 */
import { createContext, createElement as h, Fragment, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface HeadSlots { picker: HTMLElement | null; actions: HTMLElement | null }
export const HeadSlotsContext = createContext<HeadSlots>({ picker: null, actions: null });

/** Перенести содержимое в шапку раздела: slot «picker» — выбор объекта, «actions» — главное действие экрана. */
export function InHead(props: { slot: keyof HeadSlots; children?: ReactNode }): ReactElement {
  const el = useContext(HeadSlotsContext)[props.slot];
  return el ? createPortal(props.children, el) as ReactElement : h(Fragment, null, props.children);
}

const PROJECT_KEY = 'platform2_pf_project';

/** Объект, выбранный последним в любом разделе План/Факта (память устройства; недоступна — пусто). */
export function rememberedProject(): string {
  try { return window.localStorage.getItem(PROJECT_KEY) || ''; } catch { return ''; }
}
export function rememberProject(id: string): void {
  try { if (id) window.localStorage.setItem(PROJECT_KEY, id); } catch { /* память недоступна — выбор действует до перехода */ }
}

/**
 * P2-0046: на телефоне главное действие экрана (кнопка без «--ghost» в шапке) — закреплённая кнопка внизу, над нижней панелью,
 * с учётом выреза; страница получает отступ снизу, чтобы кнопка не закрывала последние строки. Выбор объекта — «плашка».
 */
export const PAGE_HEAD_CSS = `
.pf-pagehead{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;min-width:0}
.pf-pagehead .pf-title{margin:0;flex:0 1 auto;min-width:0}
.pf-head-pick{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;flex:1 1 280px;min-width:0}
.pf-head-pick:empty,.pf-head-actions:empty{display:none}
.pf-head-pick .pj-input{width:auto;min-width:220px;max-width:min(420px,100%);min-height:40px;font-weight:600;border-radius:10px;background-color:var(--card-bg)}
.pf-head-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;margin-left:auto}
@media (max-width:760px){
  /* телефон: заголовок — строкой, ниже объект и главное действие в одну строку (длинная подпись — переносится ниже) */
  .pf-pagehead{gap:8px}
  .pf-pagehead .pf-title{flex:1 1 100%}
  .pf-pagehead:has(.pf-head-pick:empty) .pf-title{flex:1 1 auto}   /* без выбора объекта — кнопка в строке заголовка */
  .pf-head-pick{flex:1 1 140px}
  .pf-head-pick .pj-input{flex:1 1 100%;max-width:none;min-width:0}
  .pf-head-actions{margin-left:auto;flex:0 1 auto}
  .pf-head-actions>.pf-btn{min-height:44px;white-space:nowrap}
}
@media (max-width:767.98px){
  .pf-head-actions>.pf-btn:not(.pf-btn--ghost){position:fixed;z-index:900;left:max(16px,env(safe-area-inset-left,0px));right:max(16px,env(safe-area-inset-right,0px));
    bottom:calc(65px + env(safe-area-inset-bottom,0px) + 12px);min-height:50px;font-size:16px;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.22)}
  .pf-page:has(.pf-head-actions>.pf-btn:not(.pf-btn--ghost)){padding-bottom:84px}
}
`;
