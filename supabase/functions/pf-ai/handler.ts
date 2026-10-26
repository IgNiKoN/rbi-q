// pf-ai — ИИ-помощник Качества Platform 2.0 (P2-0034, ADR-070 п. 5).
// Кто может — решает сервер: токен входа (Authorization: Bearer) → учётка; компания — заголовок x-company-id,
// проверяется членством и правом роли через quality.* (тот же источник прав, что у RLS), модуль «ИИ-помощник» у компании —
// через pf_my_platform (P2-0031, миграция 038: выключатель в «Админ платформы»). Имя инженера и код
// объекта не принимаются и не используются. Ключ DeepSeek — только в окружении службы функций.
// Выкладка и откат — docs/EDGE_FUNCTIONS.md.
// Логика — здесь (тестируется в Node: supabase/functions/__tests__/pf-ai.test.ts); index.ts — только запуск.

export type Env = (name: string) => string | undefined;
type Fetch = typeof fetch;

const MODEL = 'deepseek-chat';
const MAX_TOKENS = 2000;
const MAX_MESSAGES = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Версия функции — в каждом ответе (заголовок x-pf-ai-version): проверка, что сервер подхватил выложенный файл. */
export const VERSION = '3';

export const corsHeaders = {
  'x-pf-ai-version': VERSION,
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-company-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Обработчик запроса; env и fetch подставляются (на сервере — Deno.env и fetch). */
export function createHandler(env: Env, doFetch: Fetch = fetch): (req: Request) => Promise<Response> {
  const SUPABASE_URL = env('SUPABASE_URL');
  const SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY');
  const DEEPSEEK_API_KEY = env('DEEPSEEK_API_KEY');

  /** Вызов функции раздела quality от имени пользователя (его токен, его компания). */
  async function qualityRpc(fn: string, args: Record<string, unknown>, token: string, company: string): Promise<unknown> {
    const r = await doFetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'quality',
        'Accept-Profile': 'quality',
        'x-company-id': company,
      },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`rpc ${fn}: ${r.status}`);
    return await r.json();
  }

  /** Есть ли у учётки право «ИИ-помощник» (quality.ai, миграция 034) в компании запроса — тот же quality.can, что у RLS. */
  async function canUseAi(token: string, company: string): Promise<boolean> {
    return (await qualityRpc('can', { p_company: company, p_project: null, p_actions: ['quality.ai'] }, token, company)) === true;
  }

  /** Включён ли у компании модуль «ИИ-помощник» и положен ли он учётке — ответ pf_my_platform (тот же, что строит меню; 038). */
  async function aiModuleOn(token: string, company: string): Promise<boolean> {
    const r = await doFetch(`${SUPABASE_URL}/rest/v1/rpc/pf_my_platform`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) throw new Error(`rpc pf_my_platform: ${r.status}`);
    const d = (await r.json()) as { companies?: Array<{ id?: string; modules?: unknown }> };
    const c = (Array.isArray(d?.companies) ? d.companies : []).find((x) => x && x.id === company);
    return !!c && Array.isArray(c.modules) && c.modules.includes('ai');
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return reply(405, { error: 'Метод не поддерживается' });

    try {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !DEEPSEEK_API_KEY) {
        return reply(500, { error: 'ИИ-помощник на сервере не настроен' });
      }

      const auth = req.headers.get('Authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (!token) return reply(401, { error: 'Войдите в Платформу 2.0' });

      // Учётка — по токену на сервере Auth (просроченный/поддельный токен → 401).
      const who = await doFetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });
      if (!who.ok) return reply(401, { error: 'Сеанс входа истёк — войдите снова' });
      const user = await who.json();
      if (!user || !user.id) return reply(401, { error: 'Войдите в Платформу 2.0' });

      const company = (req.headers.get('x-company-id') || '').trim();
      if (!UUID_RE.test(company)) return reply(403, { error: 'Не выбрана компания' });

      if (!(await canUseAi(token, company))) {
        return reply(403, { error: 'У вашей роли нет права «ИИ-помощник». Обратитесь к администратору компании.' });
      }
      if (!(await aiModuleOn(token, company))) {
        return reply(403, { error: 'ИИ-помощник выключен для вашей компании. Включает администратор платформы.' });
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch (_) {
        return reply(400, { error: 'Неверный запрос' });
      }
      const messages = Array.isArray(body.messages) ? body.messages.slice(0, MAX_MESSAGES) : null;
      if (!messages || !messages.length) return reply(400, { error: 'Пустой запрос к ИИ' });
      const temperature = typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1.5) : 0.7;
      const maxTokens = typeof body.max_tokens === 'number' ? Math.min(Math.max(Math.floor(body.max_tokens), 1), MAX_TOKENS) : MAX_TOKENS;

      const ds = await doFetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens: maxTokens }),
      });
      const data = await ds.json().catch(() => ({ error: 'ИИ вернул неверный ответ' }));
      if (!ds.ok) return reply(502, { error: 'ИИ временно недоступен', status: ds.status });
      return reply(200, data);
    } catch (e) {
      console.error('[pf-ai]', e);
      return reply(500, { error: 'Ошибка ИИ-помощника на сервере' });
    }
  };
}
