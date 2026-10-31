/**
 * P2-0078: права План/Факта по всем моим объектам — одним вызовом (pf_my_permissions_all) вместо pf_my_permissions на каждый объект
 * подряд (экраны «Факт», «КС-2», «Сметы», вход в раздел и «заранее» спрашивали права всех объектов по одному). Ответ живёт 30 с;
 * смена прав или компании — сброс. Нет связи, нет функции на сервере (до 059) или объекта нет в ответе — null: вызывающий берёт
 * права объекта прежним вызовом (без сети — его копия).
 */
export interface PermsBatchDeps {
  now(): number;
  offline(): boolean;
  /** Мои объекты (id) — тот же список, что у экранов (pf_my_projects). */
  myProjects(): Promise<string[]>;
  /** pf_my_permissions_all; ошибка или нет функции — null. */
  fetchAll(ids: string[]): Promise<Array<{ project_id: string; actions: string[] | null }> | null>;
}

export const PERMS_TTL_MS = 30_000;

export interface PermsBatch {
  get(projectId: string): Promise<string[] | null>;
  reset(): void;
}

export function createPermsBatch(d: PermsBatchDeps, ttlMs = PERMS_TTL_MS): PermsBatch {
  let cur: { at: number; p: Promise<Map<string, string[]> | null> } | null = null;
  async function load(): Promise<Map<string, string[]> | null> {
    const ids = await d.myProjects();
    if (!ids.length) return new Map();
    const rows = await d.fetchAll(ids);
    if (!rows) return null;
    // объект без модуля План/Факта сервер не возвращает — прав нет (как «{}» у pf_my_permissions)
    const m = new Map<string, string[]>(ids.map((id) => [id, []]));
    for (const r of rows) m.set(String(r.project_id), Array.isArray(r.actions) ? r.actions : []);
    return m;
  }
  return {
    async get(projectId) {
      if (d.offline()) return null;
      if (!cur || d.now() - cur.at > ttlMs) cur = { at: d.now(), p: load().catch(() => null) };
      const m = await cur.p;
      return m && m.has(projectId) ? m.get(projectId)! : null;
    },
    reset() { cur = null; }
  };
}
