/**
 * Unit: P2-0049 этап 4 — стройконтроль по единому правилу «открыто / просрочено»;
 * ИДЗ экрана Стройконтроля не меняется; блок месяца считает так же.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isIssueOpen } from '../sk.issue-rules.js';
import { buildContrMap, skDisciplineMetrics } from '../sk.desktop.content.js';
import { computeSkMonth } from '../month-dynamics.calc.js';

/** Правило «открыто», которое было в sk.desktop.content.js до P2-0049 (эталон для сравнения). */
function oldDeskIsOpen(record) {
  if (!record) return false;
  if (record.is_verified_closed === true) return false;
  if (record.status_normalized === 'verified') return false;
  const s = String(record.status || record.status_raw || '').toLowerCase().trim();
  return s !== 'проверено';
}

const REC = [
  { contractor: 'А', status: 'Проверено', status_normalized: 'verified', is_verified_closed: true, date_issued: '2026-09-02', deadline: '2026-09-10', date_resolved: '2026-09-08' },
  { contractor: 'А', status: 'Проверено', status_normalized: 'verified', is_verified_closed: true, date_issued: '2026-09-03', deadline: '2026-09-10', date_resolved: '2026-09-15' },
  { contractor: 'А', status: 'Устранено', status_normalized: 'fixed_claimed', date_issued: '2026-09-04', deadline: '2026-09-12', date_resolved: '2026-09-11' },
  { contractor: 'Б', status: 'Не устранено', status_normalized: 'open', date_issued: '2026-09-05', deadline: '2026-09-20' },
  { contractor: 'Б', status: 'проверено', date_issued: '2026-08-20', deadline: '2026-08-30', date_resolved: '2026-09-02' },
  { contractor: 'Б', status: '', date_issued: '2026-09-25' }
];

describe('стройконтроль: одно правило для всей Аналитики', () => {
  it('общее «открыто» = прежнему правилу экрана Стройконтроля (ИДЗ не меняется)', () => {
    REC.forEach((r) => assert.equal(isIssueOpen(r), oldDeskIsOpen(r), JSON.stringify(r)));
  });
  it('«Устранено» подрядчиком — открыто; раньше рейтинг инженеров считал его закрытым', () => {
    const r = REC[2];
    assert.equal(isIssueOpen(r), true);
    assert.equal(String(r.status).toLowerCase().includes('не устран'), false); // старое правило рейтинга
  });
  it('ИДЗ экрана Стройконтроля — ручной расчёт формулы', () => {
    const { map } = buildContrMap(REC.slice(0, 3));
    const m = skDisciplineMetrics(map['А']);
    // всего 3; закрыто 2 (в срок 1, с опозданием 1 на 5 дн.); открыто 1 («Устранено»), срок прошёл → просрочено (дни до «сейчас»)
    assert.equal(m.onTimePerc, 50);
    assert.equal(m.overduePerc, 67);
    const depth = m.avgOverdueDepth;
    assert.equal(m.cmi, Math.max(0, Math.min(100, Math.round(50 * 0.6 + 33 * 0.4 - Math.min(depth, 30)))));
  });
  it('месяц: выдано / закрыто / открыто на конец месяца, ждут проверки, просрочено сейчас, закрыто с опозданием', () => {
    const sk = computeSkMonth(REC, '2026-09', { skDiscipline: skDisciplineMetrics });
    const c = sk.cur;
    assert.equal(c.issued, 5);
    assert.equal(c.closed, 3); // два у «А» + августовское у «Б», проверено 02.09
    assert.equal(c.closedLate, 2);
    assert.equal(c.open, 3);
    assert.equal(c.awaiting, 1);
    assert.equal(c.overdueNow, 2);
    assert.equal(sk.series.length, 12);
    assert.equal(sk.prev.open, 1); // на конец августа августовское ещё не закрыто
    const a = sk.cons.find((x) => x.name === 'А');
    assert.equal(a.cur.issued, 3);
    // ИДЗ «А» за сентябрь — формула экрана на тех же замечаниях: всего 3 (закрыто 2, открыто 1),
    // просрочено 2 (открыто после срока 12.09 → 19 дн. к 30.09; закрыто на 5 дн. позже), в срок 1 из 2.
    assert.equal(a.cur.overdueNow, 1);
    assert.equal(a.cur.closedLate, 1);
    assert.equal(a.idz, Math.round(50 * 0.6 + (100 - 67) * 0.4 - 12));
  });
});
