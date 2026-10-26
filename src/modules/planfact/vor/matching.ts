/**
 * Светофор видов работ (P2-0006, этап 5). Чистые функции.
 *  🟢 green  — наименование заказчика (canon_name) + ЕИ уже есть в словаре компании → вид работ подставлен;
 *  🟡 yellow — похожий вид работ / запись словаря (сходство слов ≥ SIMILARITY, та же ЕИ) → предложение, ПТО подтверждает пачкой;
 *  🔴 red    — вариантов нет или ЕИ строки не найдена в справочнике ЕИ → ПТО выбирает / создаёт вид работ (или ЕИ).
 * Нормализация наименования — та же, что planfact.canon_name на сервере (одно правило; совпадение проверяется тестами).
 */

/** Как planfact.canon_name: lower(regexp_replace(btrim(name), '\s+', ' ', 'g')). */
export function canonName(name: string): string {
  return String(name || '').replace(/^ +| +$/g, '').replace(/\s+/g, ' ').toLowerCase();
}

/** Порог сходства для 🟡: коэффициент Дайса по основам слов с весами (редкость слова × место в наименовании) + запрет пар
 *  с разными предметами работы (distinctObjects). Подобран на образцах владельца (виды работ из «ФКП, 142» → строки
 *  «ФКП, 142 ЗЧР (2)», «ФКП, 141»; «себес 1.1» → «себес 1.2»): верные совпадения 0,84–1 («Монтаж ревизионных пластиковых
 *  лючков в с/у» → «Монтаж ревизионных лючков в с/у» 0,85), ложное «Оштукатуривание стен» → «…порогов балконов» отсекается
 *  запретом. Порог 0,8 — точность важнее полноты: 🟡 подтверждают пачкой, пограничные уходят в 🔴 и выбираются вручную. */
export const SIMILARITY = 0.8;

const UNIT_SYNONYMS: [RegExp, string][] = [
  [/^(м2|м²|кв\.?м|м\.?кв|квм)$/, 'м²'],
  [/^(м3|м³|куб\.?м|м\.?куб|кубм)$/, 'м³'],
  [/^(м\.?п|мп|пог\.?м|п\.?м|м\.?пог|пм|погм)$/, 'м.п.'],
  [/^(шт|штук[аи]?)$/, 'шт.'],
  [/^(компл|комплект|к-?т|кмпл)$/, 'компл.'],
  [/^(т|тн|тонн[аы]?)$/, 'т'],
  [/^(кг|килограмм)$/, 'кг'],
  [/^(л|литр)$/, 'л'],
  [/^(чел\.?-?ч|чел\.?час)$/, 'чел.-ч.']
];

/** Ключ ЕИ: «м2» = «м²» = «кв.м»; «м.п» = «м.п.» = «пог.м»; «шт.» = «шт». Неизвестная — как есть, без регистра и точки в конце. */
export function unitKey(text: string | null | undefined): string {
  const t = String(text || '').toLowerCase().replace(/[\s ]+/g, '').replace(/ё/g, 'е');
  if (!t) return '';
  const bare = t.replace(/\.$/, '');
  for (const [re, k] of UNIT_SYNONYMS) if (re.test(bare) || re.test(t)) return k;
  return bare;
}

export interface UnitRef { id: string; code: string }
/** ЕИ строки → единица справочника (общая или своя компании) по ключу. */
export function findUnit(text: string | null, units: UnitRef[]): UnitRef | null {
  const k = unitKey(text);
  if (!k) return null;
  return units.find((u) => unitKey(u.code) === k) || null;
}

const ENDINGS = /(ами|ями|ого|его|ому|ему|ыми|ими|ах|ях|ов|ев|ом|ем|ой|ей|ий|ый|ая|яя|ое|ее|ые|ие|ую|юю|а|я|ы|и|у|ю|е|о)$/;
/** Основы слов: без регистра, «ё», знаков; слова ≥ 2 букв; без типовых окончаний («полов» = «пола»), первые 6 знаков. */
export function stems(name: string): string[] {
  const words = String(name || '').toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}\d]+/u).filter((w) => w.length >= 2);
  return Array.from(new Set(words.map((w) => (w.length > 4 ? w.replace(ENDINGS, '') : w.length > 3 ? w.replace(/[аяыиуюео]$/, '') : w).slice(0, 6))));
}

/** Вес основы по редкости в наборе текстов (IDF): частые слова («поверхности», «смесями») весят мало, редкие («стен», «балконов») — много. */
export type Idf = Map<string, number>;
export function buildIdf(texts: string[]): Idf {
  // Уникальные наименования: одна и та же работа в каждой секции (и её запись в словаре) не должна «обесценивать» свои слова.
  const uniq = Array.from(new Set(texts.map(canonName)));
  const df = new Map<string, number>();
  for (const t of uniq) for (const s of stems(t)) df.set(s, (df.get(s) || 0) + 1);
  const n = Math.max(uniq.length, 1);
  const out: Idf = new Map();
  for (const [s, d] of df) out.set(s, Math.log(1 + n / d));
  return out;
}

/** Сходство Дайса по основам с весами: вес = редкость слова (IDF, если передан) × место в наименовании (первые слова — предмет работы:
 *  «Оштукатуривание поверхности **стен**…» vs «…**порогов балконов**…»; общий хвост про смеси и основание весит меньше).
 *  2·Σ(wA+wB по общим) / (Σw(A)+Σw(B)). Неизвестная основа — вес наибольший. */
export function similarity(a: string, b: string, idf?: Idf): number {
  const A = stems(a), B = stems(b);
  if (!A.length || !B.length) return 0;
  let max = 1;
  if (idf) for (const v of idf.values()) if (v > max) max = v;
  const rare = (x: string): number => (idf ? idf.get(x) ?? max : 1);
  const pos = (i: number): number => 1 / (1 + POSITION_DECAY * i);
  const wa = new Map(A.map((x, i) => [x, rare(x) * pos(i)]));
  const wb = new Map(B.map((x, i) => [x, rare(x) * pos(i)]));
  let common = 0, total = 0;
  for (const [x, w] of wa) { total += w; if (wb.has(x)) common += w + (wb.get(x) as number); }
  for (const w of wb.values()) total += w;
  return total ? common / total : 0;
}

/** Разные предметы работы: у каждого наименования среди первых 5 слов есть своё слово, которого нет у другого
 *  («Оштукатуривание поверхности **стен**…» / «…**порогов балконов**…»). Такие пары не предлагаются как 🟡, даже при общем хвосте. */
export function distinctObjects(a: string, b: string): boolean {
  const A = stems(a).filter((x) => x.length >= 3 && !/^\d/.test(x));
  const B = stems(b).filter((x) => x.length >= 3 && !/^\d/.test(x));
  const sa = new Set(A), sb = new Set(B);
  return A.slice(0, 5).some((x) => !sb.has(x)) && B.slice(0, 5).some((x) => !sa.has(x));
}

/** Затухание веса слова по месту в наименовании (0 — все слова равны). */
export const POSITION_DECAY = 0.3;

export type Light = 'green' | 'yellow' | 'red';
export interface WorkTypeRef { id: string; name: string; unit_id: string | null }
export interface DictRef { canon_name: string; unit_text: string; work_type_id: string }
export interface Verdict { light: Light; workTypeId: string | null; unitId: string | null; score: number; reason: 'dictionary' | 'similar' | 'none' | 'unit' }

/** Светофор строки-работы. Словарь — по canon_name + ключу ЕИ; похожие — по видам работ и записям словаря с той же ЕИ. */
export function classify(name: string, unitText: string | null, units: UnitRef[], workTypes: WorkTypeRef[], dict: DictRef[], idf?: Idf): Verdict {
  const unit = findUnit(unitText, units);
  const c = canonName(name);
  if (!unit) {
    // ЕИ в файле пустая, но ПТО уже решал эту строку раньше (словарь «без ЕИ») — ЕИ берётся из вида работ.
    if (!unitKey(unitText)) {
      const d = dict.find((x) => x.canon_name === c && x.unit_text === '');
      const wt = d ? workTypes.find((w) => w.id === d.work_type_id && w.unit_id) : undefined;
      if (wt) return { light: 'green', workTypeId: wt.id, unitId: wt.unit_id, score: 1, reason: 'dictionary' };
    }
    return { light: 'red', workTypeId: null, unitId: null, score: 0, reason: 'unit' };
  }
  const uk = unitKey(unitText);
  const exact = dict.find((d) => d.canon_name === c && d.unit_text === uk && workTypes.some((w) => w.id === d.work_type_id));
  if (exact) return { light: 'green', workTypeId: exact.work_type_id, unitId: unit.id, score: 1, reason: 'dictionary' };
  let best: { id: string; score: number } | null = null;
  const consider = (id: string, text: string): void => {
    if (distinctObjects(name, text)) return;
    const s = similarity(name, text, idf);
    if (s >= SIMILARITY && (!best || s > best.score)) best = { id, score: s };
  };
  for (const w of workTypes) if (!w.unit_id || w.unit_id === unit.id) consider(w.id, w.name);
  for (const d of dict) if (d.unit_text === uk && workTypes.some((w) => w.id === d.work_type_id)) consider(d.work_type_id, d.canon_name);
  const b = best as { id: string; score: number } | null;
  return b ? { light: 'yellow', workTypeId: b.id, unitId: unit.id, score: Math.round(b.score * 100) / 100, reason: 'similar' }
    : { light: 'red', workTypeId: null, unitId: unit.id, score: 0, reason: 'none' };
}

/** Наименование нового вида работ из строки заказчика: без хвостового двоеточия, первые 300 знаков. */
export function workTypeName(name: string): string {
  return String(name || '').replace(/\s+/g, ' ').trim().replace(/[:;,.\s]+$/, '').slice(0, 300);
}
