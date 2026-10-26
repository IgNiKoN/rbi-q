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

export interface AuthApi {
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  getEmail(): Promise<string | null>;
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

/** Один клиент на страницу: разделы Platform 2.0 (отдельные бандлы) делят сессию и не плодят клиентов Auth. */
const GLOBAL_KEY = '__platform2SupabaseClient';
const holder = globalThis as unknown as Record<string, SupabaseClient | undefined>;

export function createAuthService(cfg: AuthConfig): AuthApi {
  const c = holder[GLOBAL_KEY] || (holder[GLOBAL_KEY] = createClient(cfg.url, cfg.anonKey, {
    auth: { storageKey: 'platform2-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
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
