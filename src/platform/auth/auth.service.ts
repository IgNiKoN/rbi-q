/**
 * Вход Platform 2.0 (почта + пароль, Supabase Auth). Отдельно от старого облачного входа Quality:
 * свои ключи конфигурации (P2_*), своё хранилище сессии, старый sync не трогаем.
 * Права проверяет сервер; здесь только вход и «кто вошёл».
 */
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AccessEntry {
  company: string;
  role: string;
  projectId: string | null;
}

export type SignInResult = { ok: true } | { ok: false; message: string };

/** P2-0058: кто вошёл на устройстве. offline — сервер не подтвердил вход (нет связи), но сохранённый вход не отозван;
 *  issuedAt — когда сервер последний раз выдал вход (сек), для правила «без связи не дольше 14 дней». */
export interface SessionState { email: string | null; offline: boolean; issuedAt: number | null }

export interface AuthApi {
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  getEmail(): Promise<string | null>;
  /** P2-0058: как getEmail, но различает «нет входа» и «вход есть, сервер недоступен» (без долгого ожидания без сети). */
  getSessionState?(): Promise<SessionState>;
  getAccess(): Promise<AccessEntry[]>;
  /** P2-0028: сменить пароль вошедшего (GoTrue PUT /user). */
  changePassword?(password: string): Promise<SignInResult>;
  /** Вход/выход в любом разделе Platform 2.0 (сессия общая). Возвращает отписку. */
  onAuthChange?(cb: () => void): () => void;
}

export interface AuthConfig {
  url: string;
  anonKey: string;
}

/** Единственное место настройки — js/services/config.service.js (ключи P2_*). Нет ключей → null (локальный демо-режим). */
export function readAuthConfig(): AuthConfig | null {
  const cfg = (globalThis as unknown as { APP_CONFIG?: Record<string, string> }).APP_CONFIG
    || (typeof window !== 'undefined' ? (window as unknown as { APP_CONFIG?: Record<string, string> }).APP_CONFIG : undefined);
  const url = cfg && cfg.P2_SUPABASE_URL;
  const anonKey = cfg && cfg.P2_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function mapAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Неверная почта или пароль';
  if (/email not confirmed/i.test(message)) return 'Почта не подтверждена';
  if (/banned/i.test(message)) return 'Доступ отключён администратором компании';
  if (/failed to fetch|network|load failed/i.test(message)) return 'Нет связи с сервером. Попробуйте позже';
  return 'Не удалось войти. Попробуйте ещё раз';
}

/** P2-0028: ошибка смены пароля → понятный текст. */
export function mapPasswordError(message: string): string {
  if (/same_password|should be different/i.test(message)) return 'Новый пароль должен отличаться от прежнего';
  if (/weak|at least|too short|characters/i.test(message)) return 'Пароль слишком короткий или простой';
  if (/failed to fetch|network|load failed/i.test(message)) return 'Нет связи с сервером. Попробуйте позже';
  return 'Не удалось сменить пароль. Попробуйте ещё раз';
}

/** P2-0028: правило нового пароля на экране (сервер проверяет своё): не короче 8 знаков, два поля совпадают. */
export function checkNewPassword(password: string, repeat: string): string | null {
  if (password.length < 8) return 'Пароль — не короче 8 знаков';
  if (password !== repeat) return 'Пароли не совпадают';
  return null;
}

const STORAGE_KEY = 'platform2-auth';
/** Сколько ждать обновления устаревшего входа, прежде чем работать «без связи» (обновление продолжается в фоне). */
export const REFRESH_WAIT_MS = 8000;

interface StoredSession { email: string | null; expiresAt: number; issuedAt: number | null }
/** Сохранённый вход на устройстве (без сети, без обновления). */
export function readStoredSession(store: Pick<Storage, 'getItem'> | null): StoredSession | null {
  try {
    const s = JSON.parse((store && store.getItem(STORAGE_KEY)) || 'null') as { expires_at?: unknown; expires_in?: unknown; user?: { email?: unknown } } | null;
    if (!s || typeof s.expires_at !== 'number') return null;
    const email = s.user && typeof s.user.email === 'string' ? s.user.email : null;
    return { email, expiresAt: s.expires_at, issuedAt: typeof s.expires_in === 'number' ? s.expires_at - s.expires_in : null };
  } catch { return null; }
}

/** Решение по сохранённому входу без запроса к серверу: свежий вход — getSession (без сети); устарел и сети нет — «без связи». */
export async function resolveSession(o: { stored: StoredSession | null; online: boolean; nowSec: number;
  getSession: () => Promise<string | null>; stillStored: () => boolean; waitMs?: number }): Promise<SessionState> {
  const st = o.stored;
  if (!st) return { email: await o.getSession(), offline: false, issuedAt: null };
  const issuedAt = st.issuedAt;
  if (st.expiresAt > o.nowSec + 10) return { email: await o.getSession(), offline: false, issuedAt };
  if (!o.online) return { email: st.email, offline: true, issuedAt };
  // устарел, сеть «есть»: обновление входа; не дождались или сеть подвела — вход сохранён → работа без связи;
  // сервер отозвал вход (invalid_grant) — supabase-js сам стирает сохранённый вход → «нет входа»
  const TIMEOUT = Symbol('timeout');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMEOUT>((r) => { timer = setTimeout(() => r(TIMEOUT), o.waitMs ?? REFRESH_WAIT_MS); });
  const res = await Promise.race([o.getSession().catch(() => null), timeout]);
  clearTimeout(timer);
  if (typeof res === 'string') return { email: res, offline: false, issuedAt };
  return o.stillStored() ? { email: st.email, offline: true, issuedAt } : { email: null, offline: false, issuedAt: null };
}

/** Один клиент на страницу: разделы Platform 2.0 (отдельные бандлы) делят сессию и не плодят клиентов Auth. */
const GLOBAL_KEY = '__platform2SupabaseClient';
const holder = globalThis as unknown as Record<string, SupabaseClient | undefined>;

export function createAuthService(cfg: AuthConfig): AuthApi {
  const c = holder[GLOBAL_KEY] || (holder[GLOBAL_KEY] = createClient(cfg.url, cfg.anonKey, {
    auth: { storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  }));
  return {
    async signIn(email, password) {
      try {
        const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
        return error ? { ok: false, message: mapAuthError(error.message) } : { ok: true };
      } catch (e) {
        return { ok: false, message: mapAuthError(e instanceof Error ? e.message : '') };
      }
    },
    async signOut() {
      await c.auth.signOut();
    },
    async changePassword(password) {
      try {
        const { error } = await c.auth.updateUser({ password });
        return error ? { ok: false, message: mapPasswordError(error.message) } : { ok: true };
      } catch (e) {
        return { ok: false, message: mapPasswordError(e instanceof Error ? e.message : '') };
      }
    },
    async getEmail() {
      const { data } = await c.auth.getSession();
      return data.session ? data.session.user.email || null : null;
    },
    async getSessionState() {
      let store: Storage | null = null;
      try { store = window.localStorage; } catch { store = null; }
      return resolveSession({
        stored: readStoredSession(store),
        online: typeof navigator === 'undefined' || navigator.onLine !== false,
        nowSec: Math.floor(Date.now() / 1000),
        getSession: async () => { const { data } = await c.auth.getSession(); return data.session ? data.session.user.email || null : null; },
        stillStored: () => readStoredSession(store) !== null
      });
    },
    async getAccess() {
      const { data, error } = await c.rpc('pf_my_context');
      if (error || !Array.isArray(data)) return [];
      return (data as { company_name: string; role_name: string; project_id: string | null }[]).map((r) => ({
        company: r.company_name, role: r.role_name, projectId: r.project_id
      }));
    },
    onAuthChange(cb) {
      const { data } = c.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') setTimeout(cb, 0);
      });
      return () => data.subscription.unsubscribe();
    }
  };
}

/** Клиент для данных разделов. Только после createAuthService. */
export function getClient(): SupabaseClient | null {
  return holder[GLOBAL_KEY] || null;
}
