// P2-0057: мутации миграции 055 — каждая ломает одно правило; тест tests/server/055_place_plans.sql должен упасть (FAIL > 0).
// P2_PGLITE=<папка> node scripts/p2-0057/mutate.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const UP = readFileSync(join(ROOT, 'supabase/migrations/055_place_plans_up.sql'), 'utf8');
const MUTANTS = [
  ['бакет открыт', "values ('core-place-plans', 'core-place-plans', false", "values ('core-place-plans', 'core-place-plans', true"],
  ['файл кладёт любой участник', 'if p_write then return core.can_manage_places(v_project); end if;', ''],
  ['файл без проверки проекта в пути', 'and l.project_id = v_parts[2]::uuid ', ''],
  ['нет ограничивающего запрета удаления', "using (bucket_id <> 'core-place-plans');", 'using (true);'],
  ['чтение без участия в проекте', 'return core.can_manage_projects(v_company) or core.is_project_participant(v_project);', 'return true;'],
  ['RPC без права вести места', 'perform core.require_places_manage(l.project_id);', ''],
  ['RPC без сверки ссылки', "raise exception 'Ссылка не на файл плана этого места' using errcode = '22023';", 'null;'],
  ['RPC без проверки размера', 'or p_size > 52428800', ''],
  ['прежняя версия остаётся текущей', "update core.place_documents set is_current = false, updated_at = now() where id = v_prev.id;\n  insert", 'insert'],
  ['копия этажа не пишется', 'update quality.construction_floors_v2\n       set pdf_url = v_url', 'update quality.construction_floors_v2\n       set pdf_url = pdf_url'],
  ['помещение СК не заводится', "if v_url is not null and not exists (select 1 from quality.construction_units_v2", 'if false and not exists (select 1 from quality.construction_units_v2'],
  ['копия без проверки модуля', "and cm.module = 'construction' and cm.enabled) then", "and cm.module = 'construction' and false) then"],
  ['сторож пропускает чужую ссылку', "      raise exception 'Планы этого объекта ведутся в «Компания → Объекты и места»' using errcode = '42501';\n    end if;\n  end if;\n  return new;", '    end if;\n  end if;\n  return new;'],
  ['сторож отклоняет старую копию', "if coalesce(new.pdf_url, '') = '' or quality.plan_core_url(v_loc, new.pdf_url) then", 'if false then'],
  ['проект «Качество» не отклоняется', "raise exception 'Места этого проекта ведутся в Качестве' using errcode = '42501';", 'null;'],
  ['список без проверки доступа', "if v_company is null or auth.uid() is null or not (core.can_manage_projects(v_company) or core.is_project_participant(p_project)) then\n    raise exception 'Нет доступа к проекту'", "if v_company is null then\n    raise exception 'Нет доступа к проекту'"],
];
const dir = mkdtempSync(join(tmpdir(), 'p2-0057-mut-'));
let caught = 0;
for (const [name, from, to] of MUTANTS) {
  if (!UP.includes(from)) { console.log(`НЕ ПРИМЕНИЛАСЬ: ${name}`); continue; }
  const file = join(dir, 'mutant.sql');
  writeFileSync(file, UP.replace(from, to));
  let out = '';
  try {
    out = execFileSync('node', [join(ROOT, 'tests/server/run-pglite.mjs'), '--upto', '054', '--then', file, '055_place_plans.sql'],
      { encoding: 'utf8', env: process.env });
  } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
  const m = out.match(/FAIL всего: (\d+)/);
  const bad = m ? Number(m[1]) : (/\bERR\b/.test(out) ? 'ERR' : 0);
  const ok = bad === 'ERR' || bad > 0;
  if (ok) caught++;
  console.log(`${ok ? 'ПОЙМАНА' : 'НЕ ПОЙМАНА'}: ${name} — ${bad === 'ERR' ? 'ошибка' : 'FAIL ' + bad}`);
}
console.log(`ИТОГ: поймано ${caught} из ${MUTANTS.length}`);
process.exit(caught === MUTANTS.length ? 0 : 1);
