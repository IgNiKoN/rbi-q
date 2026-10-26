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

export const PAGE_HEAD_CSS = `
.pf-pagehead{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;min-width:0}
.pf-pagehead .pf-title{margin:0;flex:0 1 auto;min-width:0}
.pf-head-pick{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;flex:1 1 280px;min-width:0}
.pf-head-pick:empty,.pf-head-actions:empty{display:none}
.pf-head-pick .pj-input{width:auto;min-width:220px;max-width:min(420px,100%);min-height:40px}
.pf-head-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;margin-left:auto}
@media (max-width:760px){
  .pf-pagehead{flex-direction:column;align-items:stretch}
  .pf-head-pick{flex:1 1 auto}
  .pf-head-pick .pj-input{flex:1 1 100%;max-width:none;min-width:0}
  .pf-head-actions{margin-left:0;justify-content:stretch}
  .pf-head-actions>.pf-btn{flex:1 1 auto}
}
`;
