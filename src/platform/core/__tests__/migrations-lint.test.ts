/// <reference types="node" />
/**
 * Тест-линтер миграций (P2-0015, specs/2026-10-23-platform-data-architecture.md): новая таблица в схеме core / planfact
 * должна иметь UUID-ключ `id uuid primary key` и `company_id` (граница данных компании). Исключения — только таблицы,
 * созданные до правила (каталоги, связки с составным ключом, журнал, дочерние строки), каждая с причиной.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('../../../../supabase/migrations/', import.meta.url);

/** Таблицы до правила (миграции 001–014) — причина, почему без UUID-ключа или без company_id. */
const LEGACY: Record<string, string> = {
  companies: 'сама компания',
  company_members: 'связка компания–пользователь, составной ключ',
  project_members: 'удалена в 002',
  permission_catalog: 'каталог платформы',
  role_templates: 'каталог платформы',
  role_template_permissions: 'каталог платформы, составной ключ',
  company_role_permissions: 'связка роль–право, составной ключ',
  company_modules: 'связка компания–модуль, составной ключ',
  audit_log: 'журнал, ключ bigint по порядку',
  vor_source_rows: 'строки загрузки ВОР — компания через загрузку',
  vor_links: 'связи позиций ВОР — компания через загрузку',
  price_history: 'история цены, ключ bigint',
  estimate_rows: 'строки сметы — компания через смету',
  estimate_overheads: 'надбавки сметы — компания через смету',
  ks2_settings: 'настройки КС-2, ключ — объект',
  platform_admins: 'администраторы платформы, ключ — пользователь',
  module_catalog: 'каталог платформы',
  // P2-0028 (032) — не «до правила»: исключение вынесено Архитектору на приёмку (отчёт P2-0028).
  user_profiles: 'профиль учётки: одно ФИО на человека во всех компаниях, ключ — пользователь; компания-владелец учётки — managed_company_id'
};

export interface TableDef { file: string; schema: string; name: string; hasUuidId: boolean; hasCompany: boolean }

/** Все `create table core|planfact.X (…)` из миграций (без файлов отката). */
export function scanMigrations(files: { name: string; sql: string }[]): TableDef[] {
  const out: TableDef[] = [];
  for (const f of files) {
    const re = /create table (?:if not exists )?(core|planfact)\.(\w+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.sql))) {
      let i = re.lastIndex, depth = 1;
      while (depth && i < f.sql.length) { const c = f.sql[i++]; if (c === '(') depth++; else if (c === ')') depth--; }
      const body = f.sql.slice(re.lastIndex, i - 1);
      out.push({ file: f.name, schema: m[1], name: m[2],
        hasUuidId: /\bid\s+uuid\s+primary\s+key/i.test(body), hasCompany: /^\s*company_id\s/im.test(body) });
    }
  }
  return out;
}

export const lintProblems = (tables: TableDef[]): string[] => tables
  .filter((t) => !(t.name in LEGACY) && (!t.hasUuidId || !t.hasCompany))
  .map((t) => `${t.file}: ${t.schema}.${t.name} — ${[!t.hasUuidId ? 'нет id uuid primary key' : '', !t.hasCompany ? 'нет company_id' : ''].filter(Boolean).join(', ')}`);

const files = readdirSync(DIR).filter((n) => n.endsWith('.sql') && !n.includes('down')).sort()
  .map((name) => ({ name, sql: readFileSync(new URL(name, DIR), 'utf8') }));

test('линтер миграций: каждая таблица core/planfact — с UUID-ключом и company_id (кроме перечня до правила)', () => {
  const tables = scanMigrations(files);
  assert.ok(tables.some((t) => t.schema === 'core' && t.name === 'counterparties'), 'контрагенты найдены линтером');
  assert.deepEqual(lintProblems(tables), []);
});

test('линтер миграций: новая таблица без company_id или без UUID-ключа — FAIL', () => {
  const bad = scanMigrations([{ name: '099_x_up.sql', sql: 'create table if not exists core.things (code text primary key, name text);\ncreate table planfact.rows (id uuid primary key, name text);' }]);
  assert.deepEqual(lintProblems(bad), [
    '099_x_up.sql: core.things — нет id uuid primary key, нет company_id',
    '099_x_up.sql: planfact.rows — нет company_id'
  ]);
});
