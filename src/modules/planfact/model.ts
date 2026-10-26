/** Модель демо-таблицы План/Факт (P2-0002). Единицы разных работ не суммируются. */

export interface PlanfactWork {
  id: string;
  name: string;
  unit: string;
  plan: number;
  fact: number;
}

export interface PlanfactDemo {
  project: string;
  works: PlanfactWork[];
}

/** % выполнения = факт / план × 100, округление до 0,1. План ≤ 0 → null (не считается). */
export function completionPercent(plan: number, fact: number): number | null {
  if (!Number.isFinite(plan) || !Number.isFinite(fact) || plan <= 0) return null;
  return Math.round((fact / plan) * 1000) / 10;
}

const NUM = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return NUM.format(value);
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${NUM.format(value)} %`;
}
