/**
 * Стили реестра оболочки (P2-0019). Только переменные оболочки (--card-*, --text-*, --primary) и токены дизайн-системы (--p2-*);
 * своих цветов нет (тест-сторож). На телефоне (≤ 760 px) строки — карточки, панель фильтров и карточка позиции — на весь экран.
 */
export const P2_REGISTRY_CSS = `
.p2-reg{display:flex;flex-direction:column;gap:10px;min-width:0}
.p2-reg__tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.p2-reg__tools .pf-btn{min-height:40px}
.p2-reg__muted{font-size:12px;color:var(--text-muted)}
.p2-reg__n{display:inline-block;margin-left:6px;min-width:18px;padding:0 6px;border-radius:999px;background:var(--p2-status-blue-bg);color:var(--p2-status-blue-fg);font-size:11px;font-variant-numeric:tabular-nums}
.p2-reg__toggle{font:inherit;font-size:13px;font-weight:700;min-height:40px;padding:8px 12px;border-radius:10px;border:1px solid var(--card-border);background:transparent;color:var(--text-main);cursor:pointer}
.p2-reg__toggle--on{background:var(--p2-status-red-bg);color:var(--p2-status-red-fg);border-color:var(--p2-status-red-line)}
.p2-reg__toggle:disabled{opacity:.55;cursor:not-allowed}
.p2-reg__wrap{position:relative;display:inline-flex}
.p2-reg__pop{position:absolute;z-index:30;top:calc(100% + 4px);left:0;min-width:240px;max-width:min(320px,calc(100vw - 32px));display:flex;flex-direction:column;gap:6px;padding:12px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:10px;box-shadow:var(--p2-shadow)}
.p2-reg__opt{display:flex;align-items:center;gap:8px;font-size:13px;min-height:36px;cursor:pointer}
.p2-reg__opt input{width:18px;height:18px;flex-shrink:0}
.p2-reg__opt>span:nth-child(2){flex:1 1 auto;overflow-wrap:anywhere}
.p2-reg__groupby{min-height:40px}
.p2-reg__chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.p2-reg__chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;padding:2px 2px 2px 10px;border-radius:999px;background:var(--p2-status-grey-bg);color:var(--p2-status-grey-fg);max-width:100%;overflow-wrap:anywhere}
.p2-reg__x{font:inherit;font-size:16px;line-height:1;width:28px;height:28px;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;flex-shrink:0}
.p2-reg__x:hover{background:var(--card-border)}
.p2-reg__link{font:inherit;font-size:12px;font-weight:700;border:0;background:transparent;color:var(--primary);cursor:pointer;min-height:32px;padding:0 6px}
.p2-reg__selbar{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 12px;border-radius:10px;background:var(--p2-status-blue-bg);color:var(--p2-status-blue-fg);border:1px solid var(--card-border)}
.p2-reg__selbar .pf-btn{min-height:38px}
.p2-reg__scroll{border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);overflow-x:auto;max-width:100%}
.p2-reg__table{width:100%;border-collapse:collapse;font-size:13px;color:var(--text-main)}
.p2-reg__table th{position:sticky;top:0;background:var(--card-bg);text-align:left;font-size:12px;font-weight:600;color:var(--text-muted);padding:4px 8px;border-bottom:1px solid var(--card-border);white-space:nowrap}
.p2-reg__table td{padding:8px;border-bottom:1px solid var(--card-border);vertical-align:top;overflow-wrap:anywhere}
.p2-reg__r{text-align:right}
.p2-reg__check{width:36px;text-align:center}
.p2-reg__check input{width:18px;height:18px}
.p2-reg__sort{font:inherit;font-weight:600;color:inherit;background:transparent;border:0;padding:6px 0;cursor:pointer;min-height:32px;text-align:inherit}
.p2-reg__row--sel td{background:var(--p2-status-blue-bg)}
.p2-reg__row--open td{box-shadow:inset 0 -2px 0 var(--primary)}
.p2-reg__open{font:inherit;font-weight:700;color:var(--text-main);background:transparent;border:0;padding:0;text-align:left;cursor:pointer;overflow-wrap:anywhere}
.p2-reg__open:hover{color:var(--primary);text-decoration:underline}
.p2-reg__group td{background:var(--p2-chart-track);padding:4px 8px}
.p2-reg__gbtn{font:inherit;font-size:13px;color:var(--text-main);background:transparent;border:0;display:inline-flex;align-items:center;gap:8px;min-height:36px;cursor:pointer;padding:0 4px}
.p2-reg__chev{width:12px}
.p2-reg__total{font-size:12px;color:var(--text-muted);font-variant-numeric:tabular-nums}
.p2-reg__counts{display:inline-flex;flex-wrap:wrap;gap:4px;margin-left:8px;vertical-align:middle}
.p2-reg__group td{white-space:normal}
.p2-reg__overlay{position:fixed;inset:0;z-index:10000;background:var(--p2-overlay);display:flex;justify-content:flex-end}
.p2-reg__panel{width:min(380px,100%);height:100%;background:var(--card-bg);color:var(--text-main);display:flex;flex-direction:column;box-shadow:var(--p2-shadow)}
.p2-reg__panel-head,.p2-reg__panel-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;border-bottom:1px solid var(--card-border)}
.p2-reg__panel-foot{border-bottom:0;border-top:1px solid var(--card-border);justify-content:flex-end}
.p2-reg__panel-body{flex:1 1 auto;overflow-y:auto;padding:8px 16px;display:flex;flex-direction:column;gap:12px}
.p2-reg__fs{border:0;margin:0;padding:0;display:flex;flex-direction:column}
.p2-reg__fs legend{font-size:12px;font-weight:700;color:var(--text-muted);padding:4px 0}
.p2-reg__view{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:36px}
.p2-reg__view-save{display:flex;gap:6px}
.p2-reg__view-save .pj-input{flex:1 1 auto;min-width:0}
.p2-side{position:fixed;top:0;right:0;bottom:0;z-index:9000;width:min(460px,100%);background:var(--card-bg);color:var(--text-main);border-left:1px solid var(--card-border);box-shadow:var(--p2-shadow);display:flex;flex-direction:column}
.p2-side__bar{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--card-border)}
.p2-side__bar .pf-btn{min-height:38px;padding:8px 10px}
.p2-side__close{margin-left:auto}
.p2-side__head{padding:12px 16px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--card-border)}
.p2-side__title{margin:0;font-size:16px;overflow-wrap:anywhere}
.p2-side__body{flex:1 1 auto;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:12px}
.p2-steps{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.p2-steps__list{display:flex;flex-wrap:wrap;gap:4px;margin:0;padding:0;list-style:none}
.p2-steps__item{font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--p2-status-grey-bg);color:var(--p2-status-grey-fg)}
.p2-steps__item+.p2-steps__item::before{content:"→ ";color:var(--text-muted)}
.p2-steps__item--done{background:var(--p2-status-green-bg);color:var(--p2-status-green-fg)}
.p2-steps__item--cur{background:var(--p2-status-yellow-bg);color:var(--p2-status-yellow-fg);outline:1px solid var(--p2-status-yellow-line)}
.p2-steps__item--cur[data-step="done"]{background:var(--p2-status-green-bg);color:var(--p2-status-green-fg);outline:0}
.p2-steps__item--cur[data-step="not_started"]{background:var(--p2-status-grey-bg);color:var(--p2-status-grey-fg)}
.p2-history{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.p2-history__item{border-left:2px solid var(--card-border);padding:2px 0 2px 10px;display:flex;flex-direction:column;gap:4px;font-size:13px}
.p2-history__head{display:flex;flex-wrap:wrap;gap:8px;font-size:12px}
.p2-history__status{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
@media (max-width:760px){
.p2-reg__scroll{border:0;background:transparent;overflow:visible}
.p2-reg__table,.p2-reg__table tbody,.p2-reg__table tr,.p2-reg__table td{display:block;width:100%;box-sizing:border-box}
.p2-reg__table thead{display:none}
.p2-reg__row{position:relative;background:var(--card-bg);border:1px solid var(--card-border);border-radius:10px;margin-bottom:8px;padding:8px 8px 8px 44px}
.p2-reg__row td{border:0;padding:2px 0;display:flex;justify-content:space-between;gap:12px;text-align:right}
.p2-reg__row--sel{background:var(--p2-status-blue-bg);border-color:var(--p2-status-blue-fg)}
.p2-reg__row--sel td{background:transparent}
.p2-reg__row td::before{content:attr(data-label);color:var(--text-muted);font-size:12px;text-align:left;flex-shrink:0}
.p2-reg__row td.p2-reg__main{display:block;text-align:left;font-size:14px;padding-bottom:4px}
.p2-reg__row td.p2-reg__main::before{content:none}
.p2-reg__row td.p2-reg__check{position:absolute;left:8px;top:8px;width:28px;padding:0;display:block}
.p2-reg__row td.p2-reg__check::before{content:none}
.p2-reg__group{margin:8px 0 6px}
.p2-reg__group td{background:transparent;padding:0}
.p2-reg__panel{width:100%}
.p2-reg__tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch}
.p2-reg__tools>*{width:100%;min-width:0;box-sizing:border-box}
.p2-reg__tools>.p2-reg__muted{grid-column:1/-1}
.p2-reg__wrap>.pf-btn{width:100%}
.p2-reg__groupby{justify-content:center;border:1px solid var(--card-border);border-radius:10px;padding:0 8px}
.p2-reg__pop{left:0;right:auto}
}
`;
