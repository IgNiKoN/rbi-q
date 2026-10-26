/**
 * Тип отчёта (группа в «Истории → Отчеты») — единственный источник правил (P2-0039).
 *
 * Используют: ПК (`history.desktop.content.js`), телефон (`analytics.render.js`)
 * и запись при сохранении (`reports.actions.js` classifyDocKind,
 * `reports.pptx-export.js`). Поле `doc_kind` живёт только в локальной базе
 * устройства и на сервер не синхронизируется, поэтому главное — название:
 * один и тот же отчёт попадает в одну группу на любом устройстве.
 * Сохранённый `doc_kind` — только запасной вариант, когда название не распознано.
 */

export const REPORT_KIND_OTHER = 'Прочее';

// Порядок важен: более частные правила — раньше общих
// («Планерка | Сводный отчет…» — планёрка, «One-Pager · по объекту» — One-Pager).
const TITLE_RULES = [
  ['Повторяющиеся дефекты', /повторяющиеся дефекты/i],
  ['Акт-эталон', /акт[\s-]*эталон/i],
  ['Акт осмотра', /акт[ыа]?\s+осмотра/i],
  ['Планёрка', /^\s*планерк|^\s*планёрк/i],
  ['Протокол совещания', /протокол/i],
  ['FMEA', /fmea/i],
  ['TWI', /\btwi\b/i],
  ['Практика', /практика/i],
  ['Воркшоп', /воркшоп/i],
  ['Инструктаж', /инструктаж/i],
  ['КС-2', /кс-2/i],
  ['Дашборд СК', /дашборд ск/i],
  ['График СМР', /график смр/i],
  ['День качества', /день качества|quality day/i],
  ['Плакат качества', /плакат/i],
  ['One-Pager', /one.?pager/i],
  ['Отчёт по объекту', /^\s*отч[её]т по объекту/i],
  ['Отчёт по подрядчику', /паспорта подрядчиков|список подрядчиков|^\s*срез:|^\s*отч[её]т для/i],
  ['Сводный отчёт', /сводн|сводка для руководства|полный отч[её]т|база проверок/i]
];

// Старые сохранённые значения doc_kind → название группы.
const STORED_ALIASES = {
  'One-Pager 4.0': 'One-Pager',
  'One-Pager 2.0': 'One-Pager',
  'Отчёт по объекту 2.0': 'Отчёт по объекту',
  'Лучшая практика': 'Практика'
};

const KIND_I18N = {
  'Повторяющиеся дефекты': 'quality.history.report.kind_repeat_defects',
  'Акт-эталон': 'quality.history.report.kind_act_etalon',
  'Акт осмотра': 'quality.history.report.kind_act_inspection',
  'Планёрка': 'quality.history.report.kind_planning',
  'Протокол совещания': 'quality.history.report.kind_protocol',
  'FMEA': 'quality.history.report.kind_fmea',
  'TWI': 'quality.history.report.kind_twi',
  'Практика': 'quality.history.report.kind_practice',
  'Воркшоп': 'quality.history.report.kind_workshop',
  'Инструктаж': 'quality.history.report.kind_briefing',
  'КС-2': 'quality.history.report.kind_ks2',
  'Дашборд СК': 'quality.history.report.kind_sk_dash',
  'График СМР': 'quality.history.report.kind_smr',
  'День качества': 'quality.history.report.kind_day',
  'Плакат качества': 'quality.history.report.kind_poster',
  'One-Pager': 'quality.history.report.kind_onepager',
  'Отчёт по объекту': 'quality.history.report.kind_object',
  'Отчёт по подрядчику': 'quality.history.report.kind_contractor',
  'Сводный отчёт': 'quality.history.report.kind_summary',
  'Прочее': 'quality.history.report.kind_other'
};

/** Группа по названию отчёта; нераспознанное — «Прочее». */
export function reportKindFromTitle(title) {
  const t = String(title || '');
  for (const [kind, re] of TITLE_RULES) {
    if (re.test(t)) return kind;
  }
  return REPORT_KIND_OTHER;
}

/** Группа отчёта: по названию, иначе — по сохранённому doc_kind. */
export function reportKindOf(r) {
  const byTitle = reportKindFromTitle(r && r.title);
  if (byTitle !== REPORT_KIND_OTHER) return byTitle;
  const stored = String((r && r.doc_kind) || '').trim();
  if (!stored || stored === REPORT_KIND_OTHER) return REPORT_KIND_OTHER;
  return STORED_ALIASES[stored] || stored;
}

/** Подпись группы; `t(key, fallback)` — переводчик экрана. */
export function reportKindLabel(kind, t) {
  const key = KIND_I18N[kind];
  return key && typeof t === 'function' ? t(key, kind) : kind;
}

/** Порядок групп: по количеству (больше — выше), при равенстве — по имени; «Прочее» последней. */
export function orderKindGroups(counts) {
  const entries = counts instanceof Map ? [...counts.entries()] : Object.entries(counts || {});
  return entries
    .filter(([k, n]) => k !== REPORT_KIND_OTHER && n > 0)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'ru'))
    .map(([k]) => k)
    .concat(entries.some(([k, n]) => k === REPORT_KIND_OTHER && n > 0) ? [REPORT_KIND_OTHER] : []);
}
