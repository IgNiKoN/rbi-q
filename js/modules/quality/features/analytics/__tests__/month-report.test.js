/**
 * Unit: P2-0049 этап 5 — ежемесячный отчёт: страницы для печати / PDF и PowerPoint берут
 * числа из того же расчёта, что экран.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { computeMonthDynamics, computeSkMonth } from '../month-dynamics.calc.js';
import { buildMonthReportHtml, buildMonthReportPrintDocument, buildMonthReportPptx } from '../month-dynamics.report.js';
import { skDisciplineMetrics } from '../sk.desktop.content.js';

let seq = 0;
function chk(date, c, final, b3) {
  return {
    id: 'r' + (++seq), date, contractorName: c, projectName: 'ЖК 1', inspectorName: 'Орлов', templateKey: 'sys_mono', templateTitle: 'Монолит',
    metrics: { final, baseUrkPerc: final, checkedCount: 10, n_B1_fail: 1, n_B2_fail: 0, n_B3_fail: b3 ? 1 : 0, b3_found: !!b3 }
  };
}

/** Запоминает вызовы PptxGenJS. */
class FakePptx {
  constructor() { this.slides = []; this.ChartType = { line: 'line', bar: 'bar' }; }
  addSlide() { const s = { texts: [], tables: [], charts: [] }; this.slides.push(s); return { addText: (t) => s.texts.push(t), addTable: (t) => s.tables.push(t), addChart: (type, data) => s.charts.push({ type, data }) }; }
}

describe('ежемесячный отчёт', () => {
  let r;
  before(async () => {
    globalThis.window = globalThis;
    globalThis.SYSTEM_TEMPLATES = {};
    await import('../../../../../shared/math.utils.js');
    const data = [];
    for (let i = 1; i <= 9; i++) data.push(chk(`2026-09-${String(i).padStart(2, '0')}T10:00:00`, 'А', 80 + i, i === 1));
    for (let i = 1; i <= 8; i++) data.push(chk(`2026-08-${String(i).padStart(2, '0')}T10:00:00`, 'А', 70));
    r = computeMonthDynamics(data, { month: '2026-09' });
    r.sk = computeSkMonth([{ contractor: 'А', status: 'Не устранено', date_issued: '2026-09-02', deadline: '2026-09-10' }], '2026-09', { skDiscipline: skDisciplineMetrics });
  });

  it('страницы: 6 листов со стройконтролем, «стр. N из 6», числа экрана', () => {
    const html = buildMonthReportHtml(r, { scope: 'ЖК 1', generated: '28.10.2026' });
    assert.equal((html.match(/class="mdr-page"/g) || []).length, 6);
    assert.match(html, /стр\. 6 из 6/);
    assert.match(html, /Сентябрь 2026/);
    assert.ok(html.includes('<b>9</b> проверок'));
    assert.ok(html.includes(r.cur.base.mean.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })));
    assert.match(html, /ИУрК \(надёжность\)/);
    assert.match(html, /Стройконтроль \(замечания ПК СК\)/);
  });
  it('без замечаний СК — 5 листов', () => {
    const html = buildMonthReportHtml(Object.assign({}, r, { sk: { total: 0 } }), {});
    assert.equal((html.match(/class="mdr-page"/g) || []).length, 5);
    assert.match(html, /стр\. 5 из 5/);
  });
  it('документ для системной печати — A4 без полей браузера', () => {
    const doc = buildMonthReportPrintDocument(r, {});
    assert.match(doc, /@page\{size:A4;margin:0\}/);
    assert.match(doc, /<title>Ежемесячный отчёт качества · Сентябрь 2026<\/title>/);
  });
  it('PowerPoint: те же числа (плитки, подрядчики, стройконтроль), графики тренда и зон', () => {
    const p = buildMonthReportPptx(FakePptx, r, { scope: 'ЖК 1' });
    assert.equal(p.slides.length, 8);
    const kpi = p.slides[1].tables[0];
    assert.equal(kpi[1][0].text, 'Базовый УрК');
    assert.ok(kpi[1][1].text.startsWith(r.cur.base.mean.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })));
    assert.equal(kpi[2][0].text, 'ИУрК (надёжность)');
    const cons = p.slides[3].tables[0];
    assert.equal(cons[1][0].text, 'А');
    assert.ok(cons[1][1].text.startsWith(String(r.cons[0].m.U)));
    assert.equal(p.slides[2].charts.length, 2);
    assert.equal(p.slides[2].charts[0].data[0].values.length, 12);
    const sk = p.slides[6].tables[0];
    assert.equal(sk[1][3].text, '1'); // открыто на конец месяца
  });
});
