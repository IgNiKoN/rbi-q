/**
 * «Администрирование платформы» (P2-0013, ADR-064 п. 2, 6): только функции сервера pf_platform_* — сервер проверяет каждый вызов
 * (не администратор платформы → отказ) и пишет каждое изменение в журнал. Соединение — общее, входа платформы.
 */
export type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

export interface AdminModule { code: string; name: string; managed: boolean; enabled: boolean | null }
export interface AdminCompany { id: string; name: string; is_test: boolean; created_at: string; people: number; modules: AdminModule[] }
export type Result<T = void> = { ok: true; value: T } | { ok: false; message: string };

export interface AdminApi {
  companies(): Promise<Result<AdminCompany[]>>;
  createCompany(name: string, isTest: boolean): Promise<Result<string>>;
  setModule(company: string, module: string, enabled: boolean): Promise<Result>;
  setCompanyAdmin(company: string, email: string): Promise<Result>;
}

/** Сообщение сервера — человеку: отказ в праве и сеть — своими словами, проверки сервера (по-русски) — как есть. */
export function adminError(e: { message: string; code?: string }): string {
  if (e.code === '42501') return 'Только для администратора платформы';
  if (/failed to fetch|network|load failed/i.test(e.message)) return 'Нет связи с сервером. Попробуйте позже';
  return /[а-яё]/i.test(e.message) ? e.message : 'Не удалось выполнить. Попробуйте ещё раз';
}

export function createAdminService(rpc: Rpc): AdminApi {
  const call = async <T>(fn: string, args: Record<string, unknown>, map: (d: unknown) => T): Promise<Result<T>> => {
    try {
      const { data, error } = await rpc(fn, args);
      return error ? { ok: false, message: adminError(error) } : { ok: true, value: map(data) };
    } catch (e) {
      return { ok: false, message: adminError({ message: e instanceof Error ? e.message : '' }) };
    }
  };
  return {
    companies: () => call('pf_platform_companies', {}, (d) => (Array.isArray(d) ? d : []).map((c: Record<string, unknown>) => ({
      id: String(c.id), name: String(c.name || ''), is_test: c.is_test === true, created_at: String(c.created_at || ''),
      people: Number(c.people) || 0,
      modules: (Array.isArray(c.modules) ? c.modules : []).map((m: Record<string, unknown>) => ({
        code: String(m.code), name: String(m.name || m.code), managed: m.managed === true, enabled: m.enabled === null || m.enabled === undefined ? null : m.enabled === true
      }))
    }))),
    createCompany: (name, isTest) => call('pf_platform_create_company', { p_name: name, p_is_test: isTest }, (d) => String(d)),
    setModule: (company, module, enabled) => call('pf_platform_set_module', { p_company: company, p_module: module, p_enabled: enabled }, () => undefined),
    setCompanyAdmin: (company, email) => call('pf_platform_set_company_admin', { p_company: company, p_email: email }, () => undefined)
  };
}
