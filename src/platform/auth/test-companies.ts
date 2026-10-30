/**
 * P2-0075: тестовые компании (core.companies.is_test — «Альфа», «Бета», демо) у администратора платформы по умолчанию скрыты
 * в «Администрировании платформы» и в переключателях компании; галочка «Показать тестовые» — одна на устройство для всех списков.
 * Сервер списков не меняется: признак is_test уже приходит в pf_my_platform и pf_platform_companies. Права не решаются — только показ.
 * Маленький отдельный файл: его берут и вход платформы, и бандл «Администрирования» (без всего входа).
 */

/** Ключ устройства (platform2_* — как у прочих ключей входа платформы). */
export const SHOW_TEST_KEY = 'platform2_show_test_companies';
/** Событие окна: галочку переключили — списки компаний перерисовываются. */
export const SHOW_TEST_EVENT = 'rbi:platform-show-test';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;

export function readShowTest(s: Store): boolean {
  try { return !!s && s.getItem(SHOW_TEST_KEY) === '1'; } catch { return false; }
}

export function writeShowTest(s: Store, on: boolean): void {
  try { if (!s) return; if (on) s.setItem(SHOW_TEST_KEY, '1'); else s.removeItem(SHOW_TEST_KEY); } catch { /* приватный режим — без запоминания */ }
}

/** Скрыта ли компания: тестовая, смотрит администратор платформы, галочка снята, роли в ней нет (свою компанию человек видит всегда)
 *  и это не выбранная сейчас компания (выбор не «пропадает» из переключателя). */
export function hiddenTest(c: { id: string; is_test?: boolean; roles?: string[] },
  o: { isPlatformAdmin: boolean; showTest: boolean; keepId?: string | null }): boolean {
  return !!c.is_test && o.isPlatformAdmin && !o.showTest && !(c.roles && c.roles.length) && c.id !== o.keepId;
}

export function visibleCompanies<T extends { id: string; is_test?: boolean; roles?: string[] }>(list: T[],
  o: { isPlatformAdmin: boolean; showTest: boolean; keepId?: string | null }): T[] {
  return list.filter((c) => !hiddenTest(c, o));
}
