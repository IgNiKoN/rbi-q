// P2-0053. Системные чек-листы Качества (data/system_templates.js — источник один, его читает и приложение) для засева «ЖК Демо».
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const src = readFileSync(new URL('../../../data/system_templates.js', import.meta.url), 'utf8');
const box = { window: { formatNorms: (s) => s } };
runInNewContext(src + '\n;this.__T = SYSTEM_TEMPLATES;', box);

/** ключ шаблона → { title, items: [{ id, n, w }] } */
export const TEMPLATES = Object.fromEntries(Object.entries(box.__T).map(([k, v]) => [k, {
  title: v.title, items: (v.groups || []).flatMap((g) => g.items || []).map((i) => ({ id: i.id, n: i.n, w: i.w || 1 }))
}]));
