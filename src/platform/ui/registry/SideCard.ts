/**
 * Боковая карточка реестра (P2-0019): поверх списка, «пред. / след.» по отфильтрованному списку (1.8), шаги процесса в шапке (1.13),
 * лента «История» с переходом статуса «было → стало» цветными бейджами (1.9). Содержимое (числа, действия) даёт модуль.
 */
import { createElement as h, useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { StatusBadge } from '../primitives.ts';
import type { Status } from '../primitives.ts';

export interface Step { id: string; label: string }
/** Шаги «Не начато → В работе → Выполнено»: пройденные, текущий; side — отдельная отметка вне цепочки («Ждёт РП»). */
export function Steps(props: { steps: Step[]; current: string; side?: { label: string; tone: Status } | null }): ReactElement {
  const { steps, current, side } = props;
  const at = Math.max(0, steps.findIndex((s) => s.id === current));
  return h('div', { className: 'p2-steps', 'data-testid': 'p2-steps' },
    h('ol', { className: 'p2-steps__list' }, steps.map((s, i) => h('li', {
      key: s.id, 'data-step': s.id, 'aria-current': i === at ? 'step' : undefined,
      className: 'p2-steps__item' + (i < at ? ' p2-steps__item--done' : i === at ? ' p2-steps__item--cur' : '') }, s.label))),
    side ? h(StatusBadge, { status: side.tone, label: side.label, testId: 'p2-steps-side' }) : null);
}

export interface HistoryItem {
  id: string; when: string; who: string | null; text: string;
  from?: { label: string; tone: Status } | null; to: { label: string; tone: Status };
  note?: string | null;
}
/** Лента истории: новые сверху (порядок — как пришёл). */
export function HistoryFeed(props: { items: HistoryItem[]; empty?: string }): ReactElement {
  const { items, empty } = props;
  if (!items.length) return h('div', { className: 'p2-reg__muted', 'data-testid': 'p2-history-empty' }, empty || 'Записей пока нет');
  return h('ol', { className: 'p2-history', 'data-testid': 'p2-history' }, items.map((it) => h('li', { key: it.id, className: 'p2-history__item', 'data-id': it.id },
    h('div', { className: 'p2-history__head' }, h('span', { className: 'p2-num' }, it.when), it.who ? h('span', { className: 'p2-reg__muted' }, it.who) : null),
    h('div', { className: 'p2-history__text' }, it.text),
    h('div', { className: 'p2-history__status' },
      it.from ? h(StatusBadge, { status: it.from.tone, label: it.from.label, testId: 'p2-history-from' }) : null,
      it.from ? h('span', { 'aria-label': 'стало', className: 'p2-reg__muted' }, '→') : null,
      h(StatusBadge, { status: it.to.tone, label: it.to.label, testId: 'p2-history-to' })),
    it.note ? h('div', { className: 'p2-reg__muted p2-history__note' }, it.note) : null)));
}

export function SideCard(props: {
  title: string; subtitle?: string; index: number; total: number;
  onPrev: () => void; onNext: () => void; onClose: () => void;
  head?: ReactNode; children?: ReactNode;
}): ReactElement {
  const { title, subtitle, index, total, onPrev, onNext, onClose, head, children } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return h('aside', { className: 'p2-side', role: 'dialog', 'aria-label': title, 'data-testid': 'p2-side' },
    h('div', { className: 'p2-side__bar' },
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'p2-side-prev', disabled: index <= 0, 'aria-label': 'Предыдущая', onClick: onPrev }, '‹ Пред.'),
      h('span', { className: 'p2-num p2-reg__muted', 'data-testid': 'p2-side-pos' }, `${index + 1} из ${total}`),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost', 'data-testid': 'p2-side-next', disabled: index >= total - 1, 'aria-label': 'Следующая', onClick: onNext }, 'След. ›'),
      h('button', { type: 'button', className: 'pf-btn pf-btn--ghost p2-side__close', 'data-testid': 'p2-side-close', onClick: onClose }, 'Закрыть')),
    h('div', { className: 'p2-side__head' }, h('h3', { className: 'p2-side__title' }, title), subtitle ? h('div', { className: 'p2-reg__muted' }, subtitle) : null, head),
    h('div', { className: 'p2-side__body' }, children));
}
