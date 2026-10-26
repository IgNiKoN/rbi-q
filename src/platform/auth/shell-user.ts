/**
 * Шапка оболочки показывает того, кто вошёл в Platform 2.0 (P2-0009, находка К4): без этого в шапке оставался
 * локальный пользователь Quality («Инженер»), а в разделе — прораб. Рисует общая функция оболочки
 * window.RBI.services.shell.renderUserBlock (второй шапки нет); при выходе — прежние надписи возвращаются.
 */
type ShellUser = { name: string; role: string };
type RbiShell = { RBI?: { services?: { shell?: { renderUserBlock?: (u: ShellUser) => void } } } };

const IDS = ['desk-user-name', 'desk-user-avatar', 'header-user-block'];
let saved: Record<string, string> | null = null;

/** Показать в шапке оболочки почту и роль вошедшего. Без оболочки (тесты, отдельная страница) — ничего не делает. */
export function showShellUser(email: string, role: string): void {
  if (typeof document === 'undefined') return;
  const shell = (window as unknown as RbiShell).RBI?.services?.shell;
  if (!shell || typeof shell.renderUserBlock !== 'function') return;
  if (!saved) {
    saved = {};
    for (const id of IDS) { const el = document.getElementById(id); if (el) saved[id] = el.textContent || ''; }
  }
  shell.renderUserBlock({ name: email, role: role || 'нет роли' });
}

/** Вернуть шапку оболочки, как была до входа. */
export function restoreShellUser(): void {
  if (!saved || typeof document === 'undefined') return;
  for (const id of IDS) { const el = document.getElementById(id); if (el && id in saved) el.textContent = saved[id]; }
  saved = null;
}

type Platform2 = { RBI?: { platform2?: { showLogin?: () => void; signOut?: () => Promise<void> } } };

/** Показать общий экран «Вход» (P2-0013): внутри разделов своей формы входа нет. */
export function openPlatformLogin(): void {
  if (typeof window === 'undefined') return;
  const p = (window as unknown as Platform2).RBI?.platform2;
  if (p && typeof p.showLogin === 'function') p.showLogin();
}

/** «Выйти» в разделе — общий выход платформы (сессия одна); без оболочки — выход сервиса входа. */
export async function platformSignOut(fallback: (() => Promise<void>) | null): Promise<void> {
  const p = typeof window === 'undefined' ? undefined : (window as unknown as Platform2).RBI?.platform2;
  if (p && typeof p.signOut === 'function') await p.signOut();
  else if (fallback) await fallback();
}

/** Событие оболочки: вход платформы обновил состояние (кто вошёл, компания, модули). */
export const PLATFORM_ACCESS_EVENT = 'rbi:platform-access';

export interface PlatformView {
  email: string;
  isPlatformAdmin: boolean;
  companies: { id: string; name: string; roles: string[] }[];
  companyId: string | null;
}
type Platform2State = { RBI?: { platform2?: { getState?: () => PlatformView & { mode: string }; setCompany?: (id: string) => void } } };

/** Кто вошёл почтой — по состоянию входа платформы (один источник); без оболочки или не почтой — null. */
export function readPlatformView(): PlatformView | null {
  if (typeof window === 'undefined') return null;
  const st = (window as unknown as Platform2State).RBI?.platform2?.getState?.();
  return st && st.mode === 'email' && st.email ? st : null;
}

/** Переключатель «Компания: …» — выбор запоминает вход платформы, меню перестраивается по модулям выбранной компании. */
export function setPlatformCompany(id: string): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Platform2State).RBI?.platform2?.setCompany?.(id);
}

/** «Компания · роль» для полосы раздела: роль в выбранной компании; без роли у администратора платформы — так и пишем. */
export function platformRoleLabel(v: PlatformView): string {
  const cur = v.companies.find((c) => c.id === v.companyId);
  return (cur && cur.roles[0]) || (v.isPlatformAdmin ? 'администратор платформы' : 'нет назначенных ролей');
}
