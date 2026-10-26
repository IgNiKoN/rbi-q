/**
 * Unit: analytics.risk-insight — зоны УрК и автотекст оценки качества.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyContractorZone,
  buildRiskZonesInsight,
  formatRiskInsightDisplayHtml,
  isAutoRiskInsightText
} from '../analytics.risk-insight.js';

describe('classifyContractorZone', () => {
  it('lowN when count < 7', () => {
    assert.equal(classifyContractorZone({ count: 3, finalC: 90 }), 'lowN');
  });
  it('red / yellow / green by base UrK (fallback finalC)', () => {
    assert.equal(classifyContractorZone({ count: 10, finalC: 65 }), 'red');
    assert.equal(classifyContractorZone({ count: 10, finalC: 80 }), 'yellow');
    assert.equal(classifyContractorZone({ count: 10, finalC: 90 }), 'green');
  });
  it('prefers baseUrkContrPerc over finalC (не ИУрК/надёжность)', () => {
    assert.equal(
      classifyContractorZone({ count: 10, baseUrkContrPerc: 90, finalC: 62 }),
      'green'
    );
    assert.equal(
      classifyContractorZone({ count: 10, baseUrkContrPerc: 62, finalC: 90 }),
      'red'
    );
  });
});

describe('buildRiskZonesInsight', () => {
  it('uses avgUrk thresholds: 70–84 acceptable even if red zone exists', () => {
    const r = buildRiskZonesInsight({
      rows: [
        { name: 'Bad Co [Obj]', metrics: { count: 12, baseUrkContrPerc: 62, finalC: 50, n_изделий_с_B3: 2 } },
        { name: 'Good Co [Obj]', metrics: { count: 12, baseUrkContrPerc: 92, finalC: 88, n_изделий_с_B3: 0 } }
      ],
      avgUrk: 82,
      avgQuality: 50,
      avgReliability: 50,
      qualityN: 2,
      sumB1: 1,
      sumB2: 2,
      sumB3: 2,
      checks: 20
    });
    assert.equal(r.qualityKey, 'medium');
    assert.equal(r.avgUrk, 82);
    assert.match(r.text, /ПРИЕМЛЕМ|ACCEPTABLE|PRIHVATLJIV/i);
    assert.doesNotMatch(r.text, /НИЗК|LOW|NIZAK/i);
    assert.match(r.html, /82%/);
    assert.match(r.html, /ana-risk-level--mid/);
    assert.match(r.html, /Bad Co/);
    assert.equal(r.zones.red.length, 1);
  });

  it('low only when avgUrk < 70', () => {
    const r = buildRiskZonesInsight({
      rows: [{ name: 'Bad [X]', metrics: { count: 10, baseUrkContrPerc: 55 } }],
      avgUrk: 55,
      qualityN: 1,
      checks: 10
    });
    assert.equal(r.qualityKey, 'critical');
    assert.match(r.html, /ana-risk-level--low/);
  });

  it('high when avgUrk >= 85', () => {
    const r = buildRiskZonesInsight({
      rows: [{ name: 'Good [X]', metrics: { count: 10, baseUrkContrPerc: 90 } }],
      avgUrk: 90,
      qualityN: 1,
      checks: 10
    });
    assert.equal(r.qualityKey, 'good');
    assert.match(r.html, /ana-risk-level--high/);
  });

  it('formats AI prose into sections', () => {
    const html = formatRiskInsightDisplayHtml(
      '1) Уровень качества: НИЗКИЙ (62%).\n\n2) Красная зона: Bad Co.\n\n3) Риски по B3.\n\n4) Действия:\n- усилить контроль\n- повторная проверка'
    );
    assert.match(html, /ana-risk-sec/);
    assert.match(html, /ana-risk-num/);
    assert.match(html, /ana-risk-ul/);
  });

  it('detects auto insight wall text', () => {
    assert.equal(isAutoRiskInsightText(
      'Уровень качества: ПРИЕМЛЕМЫЙ (ср. УрК 82%) (по 17 подр. с N≥7).\n\nСредний уровень качества (ср. УрК): 82%. Проверок: 207.\n\nЗоны качества (N≥7): зелёная 7, жёлтая 2, красная 8; сбор данных (N<7): 4.\n\nКрасная зона: ООО «Проектные двери» (45%).\n\nДействие: Красная зона: разбор B3/B2, усилить проверки.'
    ), true);
    assert.equal(isAutoRiskInsightText('1) Оценка уровня качества НИЗКИЙ по фактам объекта.'), false);
  });
});
