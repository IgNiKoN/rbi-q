/**
 * P2-0058 (З4): «Нужен интернет» — «Компания» и План/Факт работают только онлайн (их офлайн — этап В).
 * Вместо «нет прав» / «нет проектов», когда вошедший почтой без связи (сервер не ответил или браузер без сети).
 * Макет утверждён владельцем 28.10.2026 (reports/P2-0058/stage3/mockups/compare.html).
 */
import { createElement as h, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { ensureNetCss, ICON_OFF } from './net-status.ts';

type P2 = { getState?: () => { mode?: string; offline?: boolean }; access?: () => Record<string, boolean> };
function p2(): P2 | null {
  return (window as unknown as { RBI?: { platform2?: P2 } }).RBI?.platform2 || null;
}

/** Вошёл почтой, а связи нет. Демо и «не вошёл» сюда не относятся. */
export function isOfflineEntry(): boolean {
  const st = p2()?.getState?.();
  return !!st && st.mode === 'email' && (!!st.offline || (typeof navigator !== 'undefined' && navigator.onLine === false));
}

/** Перерисовать, когда меняется связь или состояние входа. */
export function useOfflineEntry(): boolean {
  const [off, setOff] = useState(isOfflineEntry);
  useEffect(() => {
    const upd = (): void => setOff(isOfflineEntry());
    for (const e of ['online', 'offline', 'rbi:platform-access']) window.addEventListener(e, upd);
    return () => { for (const e of ['online', 'offline', 'rbi:platform-access']) window.removeEventListener(e, upd); };
  }, []);
  return off;
}

export function NeedInternet(props: { section: string; testId: string }): ReactElement {
  useEffect(() => { ensureNetCss(document); }, []);
  const a = p2()?.access?.() || {};
  const quality = a.quality === true || a.construction === true;
  const go = (path: string): void => {
    const r = (window as unknown as { AppRouter?: { navigate?: (p: string) => void } }).AppRouter;
    if (r && typeof r.navigate === 'function') r.navigate(path); else window.location.hash = path;
  };
  return h('div', { className: 'p2-need', role: 'status', 'data-testid': props.testId },
    h('div', { className: 'p2-need__ico', dangerouslySetInnerHTML: { __html: ICON_OFF.replace(/15/g, '26') } }),
    h('h2', null, 'Нужен интернет'),
    h('p', null, 'Раздел ' + props.section + ' работает только онлайн. Данные Качества и Стройконтроля доступны без связи — осмотры сохраняются на телефоне и отправятся сами.'),
    h('div', { className: 'p2-need__btns' },
      quality ? h('button', { type: 'button', className: 'p2-nbtn p2-nbtn--primary', onClick: () => go('#/quality') }, 'Открыть Качество') : null,
      h('button', { type: 'button', className: 'p2-nbtn' + (quality ? '' : ' p2-nbtn--primary'), onClick: () => window.dispatchEvent(new Event('platform2:refresh')) }, 'Повторить')));
}
