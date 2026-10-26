/**
 * Визуальная кластеризация пинов на плане (порог по % x/y).
 * Данные дефектов не мержатся — только группировка для отрисовки.
 */

import type { ConstructionDefectV2 } from '../../services/construction-defects/types';

export type PinClusterItem = {
  kind: 'single' | 'cluster';
  x: number;
  y: number;
  defects: ConstructionDefectV2[];
  /** Номер для single (из исходного порядка отфильтрованного списка). */
  num: number;
};

function _xy(d: ConstructionDefectV2): { x: number; y: number } | null {
  const x = Number(d.x);
  const y = Number(d.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/**
 * Жадная кластеризация: база + все точки в радиусе thresholdPct (% плана).
 * Single сохраняет num = 1-based индекс в исходном массиве; cluster.num = size.
 */
export function clusterDefects(
  defects: ConstructionDefectV2[],
  thresholdPct = 2.5
): PinClusterItem[] {
  const indexed: { d: ConstructionDefectV2; num: number; x: number; y: number }[] = [];
  defects.forEach((d, i) => {
    const p = _xy(d);
    if (!p) return;
    indexed.push({ d, num: i + 1, x: p.x, y: p.y });
  });

  const remaining = indexed.slice();
  const out: PinClusterItem[] = [];

  while (remaining.length > 0) {
    const base = remaining.shift()!;
    const group = [base];
    let i = 0;
    while (i < remaining.length) {
      const p = remaining[i];
      const dist = Math.hypot(base.x - p.x, base.y - p.y);
      if (dist < thresholdPct) {
        group.push(p);
        remaining.splice(i, 1);
      } else {
        i++;
      }
    }
    if (group.length === 1) {
      out.push({
        kind: 'single',
        x: group[0].x,
        y: group[0].y,
        defects: [group[0].d],
        num: group[0].num
      });
    } else {
      const n = group.length;
      const avgX = group.reduce((s, g) => s + g.x, 0) / n;
      const avgY = group.reduce((s, g) => s + g.y, 0) / n;
      out.push({
        kind: 'cluster',
        x: avgX,
        y: avgY,
        defects: group.map((g) => g.d),
        num: n
      });
    }
  }
  return out;
}

/** Позиции spider-разворота вокруг центра (в % плана). */
export function spiderPositions(
  centerX: number,
  centerY: number,
  count: number,
  radiusPct = 5
): { x: number; y: number }[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: centerX, y: centerY }];
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const x = Math.min(98, Math.max(2, centerX + Math.cos(angle) * radiusPct));
    const y = Math.min(98, Math.max(2, centerY + Math.sin(angle) * radiusPct));
    pts.push({ x, y });
  }
  return pts;
}
