/**
 * Дизайн-система Platform 2.0 (P2-0010): семантические токены графиков и статусов + классы общих компонентов `p2-*`.
 * Источник истины — этот файл и ai-dev/standards/DESIGN_SYSTEM.md («Токены графиков и статусов»). Модули цвета не вводят:
 * берут токены и компоненты из src/platform/ui/. Строку P2_UI_CSS вставляет модуль вместе со своими стилями (как PLATFORM_AUTH_CSS).
 * Серии графика: светлая пара #2a6f9e / #b9741f (поверхность #ffffff), тёмная #4f93c9 / #b98235 (поверхности #172331, #1e293b, #1c2b39) —
 * валидатор палитры: полоса светлоты, насыщенность, различимость при дальтонизме ΔE ≥ 19, контраст ≥ 3:1 — PASS в обеих темах.
 * Статус (светофор) — всегда слово + иконка + цвет, никогда только цвет.
 * P2-0019: синий статус («ждёт подтверждения»), затемнение и тень всплывающих панелей; стили реестра (registry/styles.ts) — в той же строке.
 */
import { P2_REGISTRY_CSS } from './registry/styles.ts';

export const P2_DARK_THEMES = ['dark', 'rbi-dark', 'rbi-dark-v2', 'rbi-dark-v3'] as const;

const dark = P2_DARK_THEMES.map((t) => `html[data-theme="${t}"]`).join(',');

export const P2_UI_CSS = `
:root{
--p2-chart-fact:#2a6f9e;--p2-chart-plan:#b9741f;--p2-chart-grid:rgba(28,43,57,.10);--p2-chart-reference:var(--text-main);
--p2-chart-muted:rgba(28,43,57,.30);--p2-chart-track:#e7e9ec;--p2-chart-surface:var(--card-bg);
--p2-status-green-bg:#dcefe2;--p2-status-green-fg:#1d5c30;--p2-status-yellow-bg:#f5e8d3;--p2-status-yellow-fg:#6b4710;
--p2-status-red-bg:#f6dcd5;--p2-status-red-fg:#7a2a17;--p2-status-grey-bg:#e7e9ec;--p2-status-grey-fg:#4a4a4a;
--p2-status-red-line:rgba(205,90,62,.55);--p2-status-yellow-line:rgba(196,154,95,.65);
--p2-status-blue-bg:#dde8f3;--p2-status-blue-fg:#1f4e79;--p2-overlay:rgba(0,0,0,.35);--p2-shadow:0 8px 24px rgba(0,0,0,.18);
}
${dark}{
--p2-chart-fact:#4f93c9;--p2-chart-plan:#b98235;--p2-chart-grid:rgba(255,255,255,.10);--p2-chart-muted:rgba(255,255,255,.30);
--p2-chart-track:rgba(255,255,255,.10);
--p2-status-green-bg:rgba(36,161,72,.20);--p2-status-green-fg:#9fdcb0;--p2-status-yellow-bg:rgba(196,154,95,.22);--p2-status-yellow-fg:#e8c995;
--p2-status-red-bg:rgba(205,90,62,.24);--p2-status-red-fg:#f3b3a0;--p2-status-grey-bg:rgba(255,255,255,.08);--p2-status-grey-fg:#c2cad3;
--p2-status-red-line:rgba(205,90,62,.70);--p2-status-yellow-line:rgba(196,154,95,.75);
--p2-status-blue-bg:rgba(79,147,201,.24);--p2-status-blue-fg:#b3d4ee;--p2-overlay:rgba(0,0,0,.55);--p2-shadow:0 8px 24px rgba(0,0,0,.45);
}
.p2-num{font-variant-numeric:tabular-nums}
.p2-kpi{background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--rbi-radius-md,8px);padding:14px 16px;display:flex;flex-direction:column;gap:6px;min-width:0}
.p2-kpi--red{border-color:var(--p2-status-red-line)}
.p2-kpi--yellow{border-color:var(--p2-status-yellow-line)}
.p2-kpi__label{font-size:12px;color:var(--text-muted)}
.p2-kpi__value{font-size:22px;font-weight:600;color:var(--text-main);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.p2-kpi__hint{font-size:12px;color:var(--text-muted);font-variant-numeric:tabular-nums}
.p2-progress{position:relative;height:8px;border-radius:999px;background:var(--p2-chart-track);overflow:visible}
.p2-progress__fill{height:100%;border-radius:999px;background:var(--p2-chart-fact);min-width:4px}
.p2-progress__fill--zero{background:var(--p2-chart-muted)}
.p2-progress__marker{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:var(--p2-chart-plan);border-radius:1px}
.p2-badge{display:inline-flex;align-items:center;align-self:flex-start;gap:5px;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap}
.p2-badge svg{flex-shrink:0}
.p2-badge--green{background:var(--p2-status-green-bg);color:var(--p2-status-green-fg)}
.p2-badge--yellow{background:var(--p2-status-yellow-bg);color:var(--p2-status-yellow-fg)}
.p2-badge--red{background:var(--p2-status-red-bg);color:var(--p2-status-red-fg)}
.p2-badge--grey{background:var(--p2-status-grey-bg);color:var(--p2-status-grey-fg)}
.p2-badge--blue{background:var(--p2-status-blue-bg);color:var(--p2-status-blue-fg)}
.p2-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--text-muted);margin:0;padding:0;list-style:none}
.p2-legend__item{display:inline-flex;align-items:center;gap:6px}
.p2-chart{background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--rbi-radius-md,8px);padding:16px 20px;display:flex;flex-direction:column;gap:10px;min-width:0}
.p2-chart__head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px}
.p2-chart__title{margin:0;font-size:15px;font-weight:600;color:var(--text-main)}
.p2-chart__tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}
.p2-chart__toggle{font:inherit;font-size:12px;font-weight:600;color:var(--text-main);background:transparent;border:1px solid var(--card-border);border-radius:var(--rbi-radius-sm,4px);padding:6px 10px;min-height:32px;cursor:pointer}
.p2-chart__toggle:focus-visible,.p2-chart__hit:focus-visible{outline:2px solid var(--p2-chart-fact);outline-offset:2px}
.p2-chart__body{overflow-x:auto}
.p2-chart__svg{display:block;max-width:100%;height:auto}
.p2-chart__svg text{fill:var(--text-muted);font-size:11px;font-family:inherit}
.p2-chart__svg .p2-chart__strong{fill:var(--text-main)}
.p2-chart__hit{fill:transparent;cursor:pointer}
.p2-chart__tip{min-height:18px;font-size:13px;color:var(--text-main);font-variant-numeric:tabular-nums}
.p2-chart__note{margin:0;font-size:12px;color:var(--text-muted)}
.p2-chart__table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.p2-chart__table th{text-align:left;font-size:12px;font-weight:600;color:var(--text-muted);padding:6px 8px;border-bottom:1px solid var(--card-border)}
.p2-chart__table td{padding:6px 8px;border-bottom:1px solid var(--card-border);color:var(--text-main)}
.p2-chart__table th:not(:first-child),.p2-chart__table td:not(:first-child){text-align:right}
@media (max-width:760px){
.p2-chart{padding:14px}
.p2-kpi__value{font-size:18px}
}
` + P2_REGISTRY_CSS;
