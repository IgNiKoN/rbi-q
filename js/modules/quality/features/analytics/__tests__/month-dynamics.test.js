/**
 * Unit: P2-0049 «Динамика за месяц» — расчёт месяца на ручных числах и единое правило
 * «открыто / просрочено» стройконтроля.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import {
  monthKeyOf, monthBounds, shiftMonth, lastMonths,
  meanWithMargin, shareWithMargin, compareMonths, aggregateChecks,
  computeMonthDynamics, checkZone, checkedOf, availableMonths
} from '../month-dynamics.calc.js';
import {
  isIssueOpen, isIssueVerified, isIssueAwaitingVerification,
  isIssueOverdueNow, isIssueClosedLate, skPeriodStats
} from '../sk.issue-rules.js';

before(async () => {
  globalThis.window = globalThis;
  globalThis.SYSTEM_TEMPLATES = {};
  await import('../../../../../shared/math.utils.js');
});

let seq = 0;
/** Проверка с готовыми метриками (как сохраняет getProductMetrics); id — для кэша метрик math.utils. */
function chk(date, o) {
  o = o || {};
  return {
    id: 'c' + (++seq),
    date: date,
    contractorName: o.c || 'Подрядчик А',
    projectName: o.obj || 'ЖК 1',
    inspectorName: o.ins || 'Орлов',
    templateKey: o.t || 'sys_mono',
    metrics: {
      final: o.final, baseUrkPerc: o.base != null ? o.base : o.final,
      checkedCount: o.k != null ? o.k : 10,
      n_B1_fail: o.b1 || 0, n_B2_fail: o.b2 || 0, n_B3_fail: o.b3 || 0, b3_found: (o.b3 || 0) > 0
    }
  };
}

describe('math.utils: вынесенные коэффициент Стьюдента и ступени надёжности', () => {
  it('studentTCrit и getConfidenceLevel — прежние значения', () => {
    assert.equal(window.studentTCrit(2), 12.7);
    assert.equal(window.studentTCrit(7), 2.3);
    assert.equal(window.studentTCrit(15), 2.1);
    assert.equal(window.studentTCrit(51), 1.96);
    assert.equal(window.getConfidenceLevel(6).name, 'Сбор данных (N<7)');
    assert.equal(window.getConfidenceLevel(7).name, 'Предварительный');
    assert.equal(window.getConfidenceLevel(51).name, 'Эталонный');
  });
  it('getContractorMetrics: разброс E = t·s/√N, как до выноса', () => {
    window.clearMetricsCache();
    const list = [80, 90, 70, 100, 60, 85, 75, 95].map((f, i) => ({
      date: `2026-09-0${i + 1}`, metrics: { final: f, b3_found: false }
    }));
    const m = window.getContractorMetrics(list, {}, false);
    const mean = 81.875;
    const s = Math.sqrt(list.reduce((a, x) => a + (x.metrics.final - mean) ** 2, 0) / 7);
    assert.equal(m.count, 8);
    assert.ok(Math.abs(m.ci95_margin - 2.3 * s / Math.sqrt(8)) < 1e-9);
    assert.equal(m.confStatus, 'Предварительный');
  });
});

describe('месяцы', () => {
  it('ключ, границы, сдвиг через год', () => {
    assert.equal(monthKeyOf(new Date(2026, 0, 31, 23, 0)), '2026-01');
    assert.equal(shiftMonth('2026-01', -1), '2025-12');
    const b = monthBounds('2026-02');
    assert.equal(b.start.getDate(), 1);
    assert.equal(b.end.getDate(), 28);
    assert.deepEqual(lastMonths('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
  });
});

describe('разброс и сравнение «этот / прошлый»', () => {
  it('meanWithMargin: 4 значения 80/90/70/80 → среднее 80, E = 3.18·s/2', () => {
    const r = meanWithMargin([80, 90, 70, 80]);
    const s = Math.sqrt((0 + 100 + 100 + 0) / 3);
    assert.equal(r.mean, 80);
    assert.ok(Math.abs(r.E - 3.18 * s / 2) < 1e-9);
  });
  it('одна проверка — разброса нет', () => {
    assert.equal(meanWithMargin([75]).E, null);
  });
  it('shareWithMargin: 2 из 10 → 20 %', () => {
    const r = shareWithMargin(2, 10);
    assert.equal(r.mean, 20);
    const pa = 3 / 12;
    assert.ok(Math.abs(r.E - 2.3 * Math.sqrt(pa * (1 - pa) / 10) * 100) < 1e-9);
  });
  it('меньше 7 проверок → «мало данных», без стрелки', () => {
    assert.equal(compareMonths({ N: 3, mean: 90, E: 5 }, { N: 10, mean: 70, E: 4 }, true).kind, 'few');
  });
  it('изменение больше разброса обоих месяцев → заметно; меньше → в пределах разброса', () => {
    const notable = compareMonths({ N: 10, mean: 85, E: 4 }, { N: 10, mean: 75, E: 5 }, true);
    assert.equal(notable.kind, 'notable');
    assert.equal(notable.good, true);
    assert.equal(compareMonths({ N: 10, mean: 78, E: 4 }, { N: 10, mean: 75, E: 5 }, true).kind, 'within');
    assert.equal(compareMonths({ N: 10, mean: 10, E: 2 }, { N: 10, mean: 5, E: 2 }, false).good, false);
  });
});

describe('сводка месяца', () => {
  it('на 100 проверенных пунктов, а не на проверку (чек-листы разной длины)', () => {
    const r = aggregateChecks([
      chk('2026-09-03', { final: 90, k: 10, b1: 1 }),
      chk('2026-09-05', { final: 60, k: 30, b2: 2, b3: 1, t: 'sys_roof' })
    ]);
    assert.equal(r.N, 2);
    assert.equal(r.items, 40);
    assert.equal(r.fails, 4);
    assert.equal(r.per100.mean, 10);
    assert.equal(r.b3p, 2.5);
    assert.equal(r.critShare, 25);
    assert.equal(r.nB3Checks, 1);
    assert.equal(r.nRed, 1);
    assert.equal(r.nGreen, 1);
    assert.equal(r.nTypes, 2);
  });
  it('зона проверки: B3 → красная даже при высоком УрК', () => {
    assert.equal(checkZone({ final: 90, b3_found: true }), 'red');
    assert.equal(checkZone({ final: 84 }), 'yellow');
    assert.equal(checkZone({ final: 85 }), 'green');
  });
  it('старые записи без checkedCount — считаем отмеченные пункты', () => {
    assert.equal(checkedOf({ metrics: { final: 80 }, state: { a: 'ok', b: 'fail', c: 'na' } }), 2);
  });
  it('УрК с постоянным составом: доли видов работ за 12 месяцев', () => {
    const r = aggregateChecks([
      chk('2026-09-01', { final: 90, t: 'sys_a' }),
      chk('2026-09-02', { final: 90, t: 'sys_a' }),
      chk('2026-09-03', { final: 60, t: 'sys_b' })
    ], { sys_a: 0.5, sys_b: 0.5 });
    assert.equal(r.base.mean, 80);
    assert.equal(r.baseMix, 75);
  });
});

describe('computeMonthDynamics', () => {
  const data = [];
  for (let i = 1; i <= 8; i++) data.push(chk(`2026-09-${String(i).padStart(2, '0')}T10:00:00`, { final: 70 + i }));
  for (let i = 1; i <= 3; i++) data.push(chk(`2026-10-0${i}T10:00:00`, { final: 90 }));
  data.push(chk('2025-09-15T10:00:00', { final: 50 }));
  data.push({ date: '2026-10-04T10:00:00', contractorName: 'X' }); // без метрик

  it('календарный месяц, все проверки месяца (без «последних 15»), прошлый месяц и тренд 12', () => {
    const r = computeMonthDynamics(data, { month: '2026-10' });
    assert.equal(r.cur.N, 3);
    assert.equal(r.prev.N, 8);
    assert.equal(r.prevMonth, '2026-09');
    assert.equal(r.trend.length, 12);
    assert.equal(r.trend[0].key, '2025-11');
    assert.equal(r.trend[11].N, 3);
    assert.equal(r.skippedNoMetrics, 1);
    assert.equal(r.cur.conf.few, true);
    assert.equal(r.tiles[0].cmp.kind, 'few');
    assert.equal(r.prev.base.mean, 74.5);
  });
  it('ИУрК месяца — «Надёжность» как в Сводке: getContractorMetrics по серии проверок группы, без окна', () => {
    window.clearMetricsCache();
    const r = computeMonthDynamics(data, { month: '2026-09' });
    const sept = data.filter((c) => c.metrics && String(c.date).startsWith('2026-09'));
    const m = window.getContractorMetrics(sept, {}, false);
    assert.equal(r.cur.iurk.groups, 1);
    assert.equal(r.cur.iurk.mean, m.finalC);
    assert.ok(Math.abs(r.cur.iurk.E - m.ci95_margin) < 1e-9);
    assert.equal(r.tiles[1].key, 'iurk');
    assert.equal(r.tiles[1].title, 'ИУрК (надёжность)');
    // октябрь: 3 проверки — ни у кого нет 7 → «мало данных»
    const oct = computeMonthDynamics(data, { month: '2026-10' });
    assert.equal(oct.cur.iurk.few, true);
    assert.equal(oct.tiles[1].cmp.kind, 'few');
  });
  it('сходится с getContractorMetrics по тем же проверкам (без скользящего окна)', () => {
    window.clearMetricsCache();
    const r = computeMonthDynamics(data, { month: '2026-09' });
    const sept = data.filter((c) => c.metrics && String(c.date).startsWith('2026-09'));
    const m = window.getContractorMetrics(sept, {}, false);
    assert.equal(Math.round(r.cur.final.mean), m.baseUrkContrPerc);
    assert.ok(Math.abs(r.cur.final.E - m.ci95_margin) < 1e-9);
    assert.equal(r.cur.conf.name, m.confStatus);
  });
  it('20 проверок в месяце — все в расчёте', () => {
    const many = [];
    for (let i = 0; i < 20; i++) many.push(chk(`2026-08-${String(1 + (i % 28)).padStart(2, '0')}T09:00:00`, { final: 80 }));
    assert.equal(computeMonthDynamics(many, { month: '2026-08' }).cur.N, 20);
  });
  it('список месяцев — от новых к старым', () => {
    assert.deepEqual(availableMonths(data).slice(0, 2), ['2026-10', '2026-09']);
  });
});

describe('стройконтроль: одно правило «открыто / просрочено» (решения 28.10)', () => {
  const at = new Date('2026-10-20T12:00:00');
  const fixedNotVerified = { status: 'Устранено', status_normalized: 'fixed_claimed', deadline: '2026-10-10', date_issued: '2026-10-01', date_resolved: '2026-10-08' };
  const verifiedLate = { status: 'Проверено', status_normalized: 'verified', is_verified_closed: true, deadline: '2026-10-05', date_issued: '2026-10-01', date_resolved: '2026-10-09' };
  const verifiedOnTime = { status: 'Проверено', is_verified_closed: true, deadline: '2026-10-15', date_issued: '2026-10-02', date_resolved: '2026-10-12' };
  const openOverdue = { status: 'Не устранено', status_normalized: 'open', deadline: '2026-10-11', date_issued: '2026-10-03' };

  it('«Устранено» подрядчиком, но не проверено инженером — открыто и ждёт проверки', () => {
    assert.equal(isIssueOpen(fixedNotVerified), true);
    assert.equal(isIssueAwaitingVerification(fixedNotVerified), true);
    assert.equal(isIssueOverdueNow(fixedNotVerified, at), true);
  });
  it('«Проверено» — закрыто; устранено после срока — «закрыто с опозданием», не «просрочено сейчас»', () => {
    assert.equal(isIssueVerified(verifiedLate), true);
    assert.equal(isIssueOpen(verifiedLate), false);
    assert.equal(isIssueClosedLate(verifiedLate), true);
    assert.equal(isIssueOverdueNow(verifiedLate, at), false);
    assert.equal(isIssueClosedLate(verifiedOnTime), false);
  });
  it('сводка за октябрь: выдано 4, закрыто 2 (1 с опозданием), открыто 2 (1 ждёт проверки), просрочено сейчас 2', () => {
    const r = skPeriodStats([fixedNotVerified, verifiedLate, verifiedOnTime, openOverdue],
      new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59, 59));
    assert.equal(r.issued, 4);
    assert.equal(r.closed, 2);
    assert.equal(r.closedLate, 1);
    assert.equal(r.closedOnTime, 1);
    assert.equal(r.avgLateDays, 4);
    assert.equal(r.open, 2);
    assert.equal(r.awaiting, 1);
    assert.equal(r.overdueNow, 2);
    assert.equal(r.onTimePerc, 50);
  });
  it('на конец сентября октябрьские замечания не видны; закрытое позже — открыто на конец месяца', () => {
    const r = skPeriodStats([
      { status: 'Проверено', is_verified_closed: true, deadline: '2026-09-20', date_issued: '2026-09-10', date_resolved: '2026-10-03' },
      openOverdue
    ], new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59, 59));
    assert.equal(r.issued, 1);
    assert.equal(r.closed, 0);
    assert.equal(r.open, 1);
    assert.equal(r.overdueNow, 1);
  });
});

describe('этап 3: подрядчики, дефекты, повторы, причины', () => {
  const items = [{ id: 'a', n: 'Защитный слой', w: 2 }, { id: 'b', n: 'Отметки', w: 1 }, { id: 'c', n: 'Анкеровка', w: 3 }];
  const itemsOf = () => items;
  const causeName = (code) => ({ C01: 'Нарушение технологии', C03: 'Материал' }[code] || code);
  /** Проверка с state и причинами; метрики — getProductMetrics по тому же чек-листу. */
  function st(date, con, state, details) {
    const m = window.getProductMetrics(state, [{ items }]);
    return { id: 's' + (++seq), date, contractorName: con, projectName: 'ЖК 1', inspectorName: 'Орлов', templateKey: 'sys_mono', templateTitle: 'Монолит', state, details: details || {}, metrics: m };
  }
  const data = [];
  let r;
  before(() => {
  // Август и сентябрь: у «А» пункт «a» не выполнен 2 раза → повтор 2 месяца подряд к сентябрю.
  ['2026-08-05', '2026-08-06'].forEach((d) => data.push(st(d + 'T10:00:00', 'А', { a: 'fail', b: 'ok', c: 'ok' })));
  ['2026-09-03', '2026-09-04'].forEach((d) => data.push(st(d + 'T10:00:00', 'А', { a: 'fail', b: 'ok', c: 'ok' }, { a: { causeCode: 'C01' } })));
  data.push(st('2026-09-05T10:00:00', 'А', { a: 'ok', b: 'fail', c: 'ok' }));
  for (let i = 1; i <= 8; i++) data.push(st(`2026-09-1${i % 10}T10:00:00`, 'Б', { a: 'ok', b: 'ok', c: i === 1 ? 'fail' : 'ok' }, i === 1 ? { c: { causeCode: 'C03' } } : {}));

  r = computeMonthDynamics(data, { month: '2026-09', itemsOf, causeName });
  });

  it('топ дефектов: «не выполнен k из N», имя пункта из чек-листа', () => {
    assert.equal(r.top[0].item.name, 'Защитный слой');
    assert.equal(r.top[0].fail, 2);
    assert.equal(r.top[0].chk, 11);
    assert.equal(r.top[0].mainCon, 'А');
    assert.equal(r.top[0].prate, null); // в августе пункт проверяли 2 раза (< 3) — без сравнения
  });
  it('повторяемость: тот же пункт у того же подрядчика 2 месяца подряд', () => {
    const rep = r.repeats.find((x) => x.name === 'А' && x.item.id === 'a');
    assert.ok(rep);
    assert.equal(rep.streak, 2);
    assert.deepEqual(rep.hist.map((h) => h.key), ['2026-08', '2026-09']);
  });
  it('Парето: причины по названию, «не указана» — отдельно (решение 7)', () => {
    assert.deepEqual(r.pareto.map((p) => [p.name, p.n]), [['Нарушение технологии', 2], ['Материал', 1]]);
    assert.equal(r.noCause, 1);
    assert.equal(r.failsAll, 4);
  });
  it('подрядчики: меньше 7 проверок — ниже всех; УрК — getContractorMetrics без окна', () => {
    assert.deepEqual(r.cons.map((c) => c.name), ['Б', 'А']);
    assert.equal(r.cons[0].m.N, 8);
    assert.equal(r.cons[1].m.conf.few, true);
    window.clearMetricsCache();
    const m = window.getContractorMetrics(data.filter((c) => c.contractorName === 'Б'), {}, false);
    assert.equal(r.cons[0].m.U, m.finalC);
  });
  it('системность B2: доля невыполнения пункта веса 2', () => {
    const a = r.sysB2.find((x) => x.name === 'А');
    assert.equal(a.item.name, 'Защитный слой');
    assert.ok(Math.abs(a.rate - 200 / 3) < 1e-9);
  });
  it('тепловая карта: на 100 проверенных по связке подрядчик × вид работ', () => {
    const h = r.heat1['А|sys_mono'];
    assert.equal(h.n, 3);
    assert.equal(h.items, 9);
    assert.ok(Math.abs(h.v - 300 / 9) < 1e-9);
    assert.equal(r.heat3['А|sys_mono'].n, 5);
  });
  it('выводы: «мало данных» не выдаются за изменение; есть самый частый дефект и повторы', () => {
    assert.ok(r.findings.main.some((t) => t.includes('Самый частый дефект — «Защитный слой»')));
    assert.ok(r.findings.main.some((t) => t.startsWith('Повторяются 1 дефект')));
    assert.ok(r.findings.recs.some((t) => t.includes('не указана причина')));
  });
});
