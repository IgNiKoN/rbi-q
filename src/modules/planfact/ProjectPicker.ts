/**
 * P2-0011: выбор объекта в разделах План/Факт (ВОР, Факт, Смета, КС-2) — одно правило архива для всех.
 * Архивные объекты скрыты по умолчанию; «Показать архив (N)» — показать их с пометкой «(архив)»; выбран архивный — подпись
 * «Объект в архиве — только просмотр» (запись в архивный объект запрещает сервер; разделы дополнительно прячут кнопки ввода).
 * Признак архива — только projects.archived_at (pf_my_projects отдаёт его вместе со строкой проекта).
 */
import { createElement as h, Fragment, useState } from 'react';
import type { ReactElement } from 'react';

export interface PickProject { id: string; name: string; archived_at?: string | null }

export const isArchived = (p: PickProject | undefined | null): boolean => !!(p && p.archived_at);

/** Объект по умолчанию: первый действующий; если действующих нет — первый из списка (архивный, только просмотр). */
export function firstProjectId(list: PickProject[]): string {
  return (list.find((p) => !isArchived(p)) || list[0])?.id || '';
}

/** P2-0021: параметр перехода из адреса (#/planfact/…?p=<объект>&from=<дата>) — «Требует моего участия» открывает список с готовым
 *  объектом. Реестры параметр не хранят (вид в адресе перезаписывается), поэтому он действует один раз — при открытии. */
export function hashParam(hash: string, key: string): string {
  const q = String(hash || '').split('?')[1] || '';
  for (const part of q.split('&')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === key) { try { return decodeURIComponent(part.slice(i + 1)); } catch { return ''; } }
  }
  return '';
}

/** Объект при открытии раздела: из перехода (p=…), если он есть в списке; иначе — первый действующий. */
export function initialProjectId(list: PickProject[], hash: string): string {
  const want = hashParam(hash, 'p');
  return want && list.some((p) => p.id === want) ? want : firstProjectId(list);
}

/** Что показать в списке: действующие; архивные — при «Показать архив» (и всегда — выбранный сейчас). */
export function visibleProjects<T extends PickProject>(list: T[], showArchive: boolean, value: string): T[] {
  return list.filter((p) => !isArchived(p) || showArchive || p.id === value);
}

/** alwaysSelect — список даже из одного объекта (ВОР: так было до P2-0011). */
export function ProjectPicker(props: { list: PickProject[]; value: string; onChange: (id: string) => void; testId?: string; alwaysSelect?: boolean }): ReactElement {
  const { list, value, onChange, testId, alwaysSelect } = props;
  const [showArchive, setShowArchive] = useState(false);
  const archivedN = list.filter(isArchived).length;
  const shown = visibleProjects(list, showArchive, value);
  const current = list.find((p) => p.id === value);
  const label = (p: PickProject): string => p.name + (isArchived(p) ? ' (архив)' : '');
  const toggle = (): void => {
    const next = !showArchive;
    setShowArchive(next);
    if (!next && isArchived(current) && list.some((p) => !isArchived(p))) onChange(firstProjectId(list));
  };
  return h(Fragment, null,
    shown.length > 1 || (alwaysSelect && shown.length)
      ? h('select', { className: 'pj-input pj-company', 'aria-label': 'Проект', value, 'data-testid': testId, onChange: (e) => onChange((e.target as HTMLSelectElement).value) },
          shown.map((p) => h('option', { key: p.id, value: p.id }, label(p))))
      : h('div', { className: 'pf-muted' }, 'Проект: ', h('b', null, current ? label(current) : '—')),
    archivedN
      ? h('button', { type: 'button', className: 'pf-btn pf-btn--ghost pj-toggle', 'data-testid': 'pp-archive', onClick: toggle },
          showArchive ? 'Скрыть архив' : `Показать архив (${archivedN})`)
      : null,
    isArchived(current) ? h('div', { className: 'pf-muted', 'data-testid': 'pp-archived' }, 'Объект в архиве — только просмотр.') : null);
}
