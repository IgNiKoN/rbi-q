// P2-0066 этап 4: макет «предлагаю» — строка версии в «Настройки → Помощь и о программе» (вместо плашки «Доступно обновление»).
// Вставляется в живую страницу стенда; window.__mockState: 'current' | 'downloading' | 'ready' | 'failed'.
(function () {
  var S = window.__mockState || 'current';
  var CUR = '2026.10.29-9f5a8d91', NEW = '2026.11.02-1a2b3c4d';
  var css = '.p2v{background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:16px;overflow:hidden;margin-bottom:12px}' +
    '.p2v__head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 16px}.p2v__head>div:nth-child(2){flex:1 1 200px;min-width:0}' +
    '.p2v__ico{width:44px;height:44px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center}' +
    '.p2v__ico--ok{color:var(--success,#3f8f5e);background:color-mix(in srgb,var(--success,#3f8f5e) 14%,transparent)}' +
    '.p2v__ico--warn{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent)}' +
    '.p2v__ico--info{color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 14%,transparent)}' +
    '.p2v__title{display:block;font-size:16px;font-weight:800;line-height:1.25;overflow-wrap:anywhere}' +
    '.p2v__sub{display:block;font-size:13px;color:var(--text-muted);margin-top:2px;overflow-wrap:anywhere}' +
    '.p2v__btns{display:flex;flex-wrap:wrap;gap:8px;flex:1 1 100%}' +
    '.p2v__btn{flex:1 1 160px;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);font-weight:700;font-size:13px;cursor:pointer}' +
    '.p2v__btn--main{border:0;background:var(--accent,var(--primary,#c49a5f));color:#fff;font-weight:800}' +
    '.p2v__bar{height:6px;margin:0 16px 14px;border-radius:999px;background:color-mix(in srgb,var(--text-muted) 16%,transparent);overflow:hidden}' +
    '.p2v__bar>i{display:block;height:100%;width:60%;background:var(--accent,var(--primary,#c49a5f));border-radius:999px}' +
    '.p2v__foot{display:flex;flex-wrap:wrap;gap:6px 16px;padding:10px 16px;border-top:1px solid var(--card-border);font-size:12.5px;color:var(--text-muted)}' +
    '@media (min-width:768px){.p2v__btns{flex:none;margin-left:auto}.p2v__btn{flex:none}}';
  if (!document.getElementById('p2v-mock-css')) { var st = document.createElement('style'); st.id = 'p2v-mock-css'; st.textContent = css; document.head.appendChild(st); }
  var ICON = {
    ok: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    down: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>',
    new: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    off: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l20 20"/><path d="M5.8 10.1A5 5 0 0 0 7 18h10.5"/><path d="M20.9 16.6A4 4 0 0 0 19 10a5 5 0 0 0-7.6-4.3"/></svg>'
  };
  var check = '<button class="p2v__btn" type="button">Проверить обновления</button>';
  var V = {
    current: ['ok', ICON.ok, 'Версия ' + CUR, 'от 29.10.2026 · это последняя версия', check, '', ''],
    downloading: ['info', ICON.down, 'Скачивается новая версия', '120 из 201 файла · можно работать дальше, ничего не перезагрузится', check, '<div class="p2v__bar"><i></i></div>', 'Сейчас работает: ' + CUR + ' от 29.10.2026'],
    ready: ['warn', ICON.new, 'Новая версия скачана', NEW + ' — включится при следующем запуске', '<button class="p2v__btn p2v__btn--main" type="button">Перезапустить сейчас</button>' + check, '', 'Сейчас работает: ' + CUR + ' от 29.10.2026 · неотправленное не пропадёт'],
    failed: ['warn', ICON.off, 'Новая версия не скачалась', 'Нет связи — работает текущая версия, повторим позже сами', check, '', 'Сейчас работает: ' + CUR + ' от 29.10.2026']
  }[S];
  var html = '<section class="p2v" data-testid="p2-app-version" role="status"><div class="p2v__head"><div class="p2v__ico p2v__ico--' + V[0] + '">' + V[1] + '</div>' +
    '<div><b class="p2v__title">' + V[2] + '</b><span class="p2v__sub">' + V[3] + '</span></div><div class="p2v__btns">' + V[4] + '</div></div>' + V[5] +
    (V[6] ? '<div class="p2v__foot"><span>' + V[6] + '</span></div>' : '') + '</section>';
  var panel = document.querySelector('[data-settings-panel="my-help"]');
  if (!panel) return;
  var old = panel.querySelector('[data-testid=p2-app-version]'); if (old) old.remove();
  // «Проверить обновления» переезжает в строку версии; «Полный сброс» остаётся на месте
  var chk = panel.querySelector('[data-shell-action="checkForUpdates"]'); if (chk) chk.style.display = 'none';
  var fb = panel.querySelector('details') || panel.firstElementChild;
  var box = document.createElement('div'); box.innerHTML = html;
  panel.insertBefore(box.firstChild, panel.firstElementChild);
  var banner = document.getElementById('pwa-update-banner'); if (banner) banner.style.display = 'none';
})();
