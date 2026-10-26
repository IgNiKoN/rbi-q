/**
 * Unit: report-kind — единые правила типа отчёта (P2-0039).
 * Названия — из трёх прежних копий правил и из отчётов RBI после P2-0036.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  reportKindFromTitle,
  reportKindOf,
  reportKindLabel,
  orderKindGroups,
  REPORT_KIND_OTHER
} from '../report-kind.js';

const CASES = [
  ['Протокол от 12.10.2026', 'Протокол совещания'],
  ['Черновик протокола 12.10', 'Протокол совещания'],
  ['FMEA Анализ', 'FMEA'],
  ['TWI: Геометрия', 'TWI'],
  ['Практика: Исправление замечаний', 'Практика'],
  ['Воркшоп по качеству', 'Воркшоп'],
  ['Инструктаж бригады', 'Инструктаж'],
  ['КС-2 за октябрь', 'КС-2'],
  ['Акт-Эталон: ООО "Баумен"', 'Акт-эталон'],
  ['Акт осмотра от 01.10.2026', 'Акт осмотра'],
  ['Акты осмотра (3 шт.)', 'Акт осмотра'],
  ['Дашборд СК', 'Дашборд СК'],
  ['График СМР', 'График СМР'],
  ['День Качества', 'День качества'],
  ['Плакат Качества — Лиговский 9', 'Плакат качества'],
  ['Повторяющиеся дефекты — Лиговский 9', 'Повторяющиеся дефекты'],
  ['Паспорта Подрядчиков | Парашютная', 'Отчёт по подрядчику'],
  ['Список подрядчиков', 'Отчёт по подрядчику'],
  ['Срез: ГласСтрой [Лиговский]', 'Отчёт по подрядчику'],
  ['Отчет для ООО "Каркас"', 'Отчёт по подрядчику'],
  ['One-Pager 4.0 · по всем объектам', 'One-Pager'],
  ['One-Pager 2.0 — Лиговский 9', 'One-Pager'],
  ['Отчёт по объекту 2.0 | по объекту «Лиговский 9»', 'Отчёт по объекту'],
  ['Отчет по объекту 2.0 — Шостаковича', 'Отчёт по объекту'],
  ['Планерка | Сводный отчет по объекту «Лиговский 9»', 'Планёрка'],
  ['Планерка | ООО «Форум»', 'Планёрка'],
  ['Сводка для Руководства', 'Сводный отчёт'],
  ['Сводный отчет по всем объектам', 'Сводный отчёт'],
  ['Сводный отчет по объекту «Лиговский 9»', 'Сводный отчёт'],
  ['Сводный Отчет Компании', 'Сводный отчёт'],
  ['Полный отчет по объекту', 'Сводный отчёт'],
  ['База проверок', 'Сводный отчёт']
];

describe('reportKindFromTitle', () => {
  for (const [title, kind] of CASES) {
    it(`${title} → ${kind}`, () => assert.equal(reportKindFromTitle(title), kind));
  }
  it('нераспознанное и пустое → Прочее', () => {
    assert.equal(reportKindFromTitle('Что-то своё'), REPORT_KIND_OTHER);
    assert.equal(reportKindFromTitle(''), REPORT_KIND_OTHER);
    assert.equal(reportKindFromTitle(null), REPORT_KIND_OTHER);
  });
});

describe('reportKindOf', () => {
  it('название важнее сохранённого doc_kind (одинаково на всех устройствах)', () => {
    assert.equal(reportKindOf({ title: 'One-Pager 4.0 · по всем', doc_kind: 'Сводный отчёт' }), 'One-Pager');
    assert.equal(reportKindOf({ title: 'One-Pager 4.0 · по всем' }), 'One-Pager');
  });
  it('нераспознанное название → сохранённый doc_kind с приведением старых значений', () => {
    assert.equal(reportKindOf({ title: 'X', doc_kind: 'One-Pager 4.0' }), 'One-Pager');
    assert.equal(reportKindOf({ title: 'X', doc_kind: 'Отчёт по объекту 2.0' }), 'Отчёт по объекту');
    assert.equal(reportKindOf({ title: 'X', doc_kind: 'Лучшая практика' }), 'Практика');
    assert.equal(reportKindOf({ title: 'X', doc_kind: 'Прочее' }), REPORT_KIND_OTHER);
    assert.equal(reportKindOf({ title: 'X' }), REPORT_KIND_OTHER);
    assert.equal(reportKindOf(null), REPORT_KIND_OTHER);
  });
  it('новый отчёт: записанный doc_kind = группа', () => {
    for (const [title] of CASES) {
      const docKind = reportKindFromTitle(title);
      assert.equal(reportKindOf({ title, doc_kind: docKind }), docKind);
    }
  });
});

describe('orderKindGroups', () => {
  it('по количеству, при равенстве — по имени (кириллица раньше латиницы), «Прочее» последней', () => {
    const c = new Map([['Прочее', 50], ['Плакат качества', 3], ['Акт осмотра', 9], ['FMEA', 3]]);
    assert.deepEqual(orderKindGroups(c), ['Акт осмотра', 'Плакат качества', 'FMEA', 'Прочее']);
  });
  it('пустые группы не показываются; объект тоже принимается', () => {
    assert.deepEqual(orderKindGroups({ 'Прочее': 0, 'TWI': 1 }), ['TWI']);
    assert.deepEqual(orderKindGroups(new Map()), []);
  });
});

describe('reportKindLabel', () => {
  it('ключ перевода с запасным текстом', () => {
    const t = (k, f) => `${k}|${f}`;
    assert.equal(reportKindLabel('One-Pager', t), 'quality.history.report.kind_onepager|One-Pager');
    assert.equal(reportKindLabel('Неизвестный', t), 'Неизвестный');
    assert.equal(reportKindLabel('Акт осмотра'), 'Акт осмотра');
  });
});
