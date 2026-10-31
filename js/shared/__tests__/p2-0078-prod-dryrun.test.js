/**
 * P2-0078 (доработка 1): пробный прогон 059 на боевых данных (tests/server/059_rls_fast_prod_dryrun.sql) собран из текущей
 * 059_rls_fast_up.sql — после правки миграции пересобрать: node scripts/p2-0078/prod-dryrun.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDryrun, migrationBody } from '../../../scripts/p2-0078/prod-dryrun.mjs';

const root = new URL('../../../', import.meta.url);
const up = readFileSync(new URL('supabase/migrations/059_rls_fast_up.sql', root), 'utf8');

describe('P2-0078: пробный прогон 059 на боевом', () => {
  it('файл совпадает с текущей 059 (иначе: node scripts/p2-0078/prod-dryrun.mjs)', () => {
    assert.equal(readFileSync(new URL('tests/server/059_rls_fast_prod_dryrun.sql', root), 'utf8'), buildDryrun(up));
  });
  it('тело 059 — без её begin / commit: транзакция одна и всегда откатывается', () => {
    const body = migrationBody(up);
    assert.ok(!/^\s*(begin|commit);\s*$/m.test(body));
    const dry = buildDryrun(up);
    assert.equal((dry.match(/^begin;$/gm) || []).length, 1);
    assert.ok(!/^commit;$/m.test(dry));
    assert.ok(/^rollback;$/m.test(dry) && /using errcode = 'P0001';\nend \$p59\$;\nrollback;\n$/.test(dry), 'отчёт исключением, затем rollback');
  });
});
