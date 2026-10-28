// Макет «предлагаю» (этап 4, P2-0059): поверх настоящего экрана «Данные на устройстве». Состояние — window.__mockState:
// unsent — нет связи, 3 не отправлено (нет связи ×2, нет фото) + 1 отклонено; retry — связь есть, ждёт повтора; ok — всё отправлено.
// Журнал открыт, если window.__mockJournal.
(function () {
  var st = window.__mockState || 'unsent';
  var panel = document.getElementById('settings-panel-my-device');
  if (!panel) return;
  if (!document.getElementById('p2-mock59-css')) {
    var css = document.createElement('style'); css.id = 'p2-mock59-css';
    css.textContent = [
      '.p2s{background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:16px;overflow:hidden}',
      '.p2s__head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 16px}.p2s__head>div:nth-child(2){flex:1 1 200px;min-width:0}',
      '.p2s__ico{width:44px;height:44px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center}',
      '.p2s__ico--warn{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent)}',
      '.p2s__ico--ok{color:var(--success,#3f8f5e);background:color-mix(in srgb,var(--success,#3f8f5e) 14%,transparent)}',
      '.p2s__title{font-size:16px;font-weight:800;line-height:1.25}.p2s__sub{font-size:13px;color:var(--text-muted);margin-top:2px}',
      '.p2s__btn{flex:1 1 100%;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);font-weight:700;font-size:13px;cursor:pointer}',
      '.p2s__list{list-style:none;margin:0;padding:0;border-top:1px solid var(--card-border)}',
      '.p2s__row{display:grid;grid-template-columns:1fr;gap:4px 12px;padding:12px 16px;border-bottom:1px solid var(--card-border)}',
      '.p2s__row:last-child{border-bottom:0}',
      '.p2s__name{font-size:14px;font-weight:700;min-width:0}',
      '.p2s__when{font-size:12px;color:var(--text-muted)}',
      '.p2s__why{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px}',
      '.p2s__chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-weight:700;font-size:12px}',
      '.p2s__chip--net{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 13%,transparent)}',
      '.p2s__chip--photo{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 13%,transparent)}',
      '.p2s__chip--bad{color:var(--danger,#b24a43);background:color-mix(in srgb,var(--danger,#b24a43) 12%,transparent)}',
      '.p2s__chip--wait{color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 14%,transparent)}',
      '.p2s__hint{color:var(--text-muted);font-size:12.5px}',
      '.p2s__act{min-height:36px;padding:0 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--warning,#b8844a) 45%,transparent);background:transparent;color:var(--text-main);font-weight:700;font-size:12.5px;cursor:pointer}',
      '.p2s__group{padding:8px 16px;font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 6%,transparent);border-top:1px solid var(--card-border)}',
      '.p2s__foot{display:flex;flex-wrap:wrap;gap:6px 16px;padding:10px 16px;border-top:1px solid var(--card-border);font-size:12.5px;color:var(--text-muted)}',
      '.p2j summary{list-style:none}.p2j summary::-webkit-details-marker{display:none}',
      '.p2j__sum{display:flex;align-items:center;gap:10px;padding:14px 16px;cursor:pointer;font-weight:800;font-size:14px}',
      '.p2j__sum small{font-weight:600;color:var(--text-muted);font-size:12.5px}',
      '.p2j__sum .p2j__chev{margin-left:auto;color:var(--text-muted);transition:transform .2s}.p2j[open] .p2j__chev{transform:rotate(180deg)}',
      '.p2j__tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid var(--card-border)}',
      '.p2j__copy{min-height:40px;padding:0 14px;border-radius:12px;border:0;background:var(--brand,#c49a5f);color:#fff;font-weight:800;font-size:13px;cursor:pointer}',
      '.p2j__ev{list-style:none;margin:0;padding:0;border-top:1px solid var(--card-border);font-size:12.5px}',
      '.p2j__ev li{display:grid;grid-template-columns:62px 1fr;gap:10px;padding:8px 16px;border-bottom:1px solid var(--card-border)}',
      '.p2j__ev li:last-child{border-bottom:0}',
      '.p2j__t{color:var(--text-muted);font-variant-numeric:tabular-nums}',
      '.p2j__k{font-weight:700}.p2j__k--bad{color:var(--danger,#b24a43)}.p2j__k--warn{color:var(--warning,#b8844a)}.p2j__k--ok{color:var(--success,#3f8f5e)}',
      '.p2j__more{padding:10px 16px;font-size:12.5px;color:var(--text-muted);border-top:1px solid var(--card-border)}',
      '@media (min-width:768px){.p2s__btn{flex:none;margin-left:auto}}','@media (min-width:1024px){.p2s__row{grid-template-columns:minmax(0,1fr) 150px minmax(0,1.1fr);align-items:center}.p2s__why{grid-column:auto}}'
    ].join('');
    document.head.appendChild(css);
  }
  var ICON_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l20 20"/><path d="M5.8 10.1A5 5 0 0 0 7 18h10.5"/><path d="M20.9 16.6A4 4 0 0 0 19 10a5 5 0 0 0-7.6-4.3"/></svg>';
  var ICON_OK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var ICON_UP = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  var rows = {
    unsent: [
      { name: 'Осмотр · Кладка · Секция 2, этаж 5', when: 'сегодня 14:05', chip: 'net', why: 'Нет связи', hint: 'отправим сами, как появится' },
      { name: 'Осмотр · Земляные работы · Секция 1', when: 'сегодня 13:40', chip: 'net', why: 'Нет связи', hint: 'отправим сами, как появится' },
      { name: 'Осмотр · Монолит · Секция 3, этаж 2', when: 'вчера 17:12', chip: 'photo', why: 'Нет фото пункта «Армирование»', hint: 'фото удалено с телефона', act: 'Отправить без этого фото' }
    ],
    retry: [
      { name: 'Осмотр · Кладка · Секция 2, этаж 5', when: 'сегодня 14:05', chip: 'wait', why: 'Сервер не ответил', hint: 'повтор в 14:42' },
      { name: 'Осмотр · Земляные работы · Секция 1', when: 'сегодня 13:40', chip: 'wait', why: 'Сервер не ответил', hint: 'повтор в 14:42' }
    ],
    ok: []
  }[st] || [];
  var rejected = st === 'unsent' ? [{ name: 'Замечание СК · Фасад · Секция 4', when: 'вчера 16:20', chip: 'bad', why: 'Сервер отклонил: нет прав на объект', hint: 'запись осталась на телефоне; обратитесь к руководителю' }] : [];

  var head;
  if (st === 'ok') {
    head = '<div class="p2s__head"><div class="p2s__ico p2s__ico--ok">' + ICON_OK + '</div><div><div class="p2s__title">Всё отправлено</div>' +
      '<div class="p2s__sub">Последняя успешная отправка: сегодня 14:32</div></div></div>';
  } else {
    head = '<div class="p2s__head"><div class="p2s__ico p2s__ico--warn">' + (st === 'unsent' ? ICON_OFF : ICON_UP) + '</div><div><div class="p2s__title">' +
      (st === 'unsent' ? 'Нет связи · не отправлено: ' : 'Не отправлено: ') + rows.length + '</div>' +
      '<div class="p2s__sub">' + (st === 'unsent' ? 'Всё сохранено на телефоне и уйдёт само, когда появится связь.' : 'Связь есть, сервер не ответил — отправим сами в 14:42.') + '</div></div>' +
      '<button class="p2s__btn" type="button">Отправить сейчас</button></div>';
  }
  var row = function (r) {
    return '<li class="p2s__row"><div class="p2s__name">' + esc(r.name) + '</div><div class="p2s__when">записано ' + esc(r.when) + '</div>' +
      '<div class="p2s__why"><span class="p2s__chip p2s__chip--' + r.chip + '">' + esc(r.why) + '</span><span class="p2s__hint">' + esc(r.hint) + '</span>' +
      (r.act ? '<button class="p2s__act" type="button">' + esc(r.act) + '</button>' : '') + '</div></li>';
  };
  var list = rows.length ? '<ul class="p2s__list">' + rows.map(row).join('') + '</ul>' : '';
  var rej = rejected.length ? '<div class="p2s__group">Отклонено сервером: ' + rejected.length + '</div><ul class="p2s__list">' + rejected.map(row).join('') + '</ul>' : '';
  var foot = st === 'ok' ? '' : '<div class="p2s__foot"><span>Последняя успешная отправка: сегодня 11:58</span><span>Проверка связи: ' + (st === 'unsent' ? 'нет ответа, 14:31' : 'есть, 14:31') + '</span></div>';
  var card = '<section class="p2s" data-mock="p2-0059-status">' + head + list + rej + foot + '</section>';

  var ev = [
    ['14:31', 'warn', 'не начат · нет ответа сервера (4 с)'],
    ['14:30', 'warn', 'не начат · нет сети у телефона'],
    ['14:12', 'bad', 'остановлен · 90 с без ответа · отправлено 0'],
    ['14:10', '', 'начало · связь есть · не отправлено 3'],
    ['11:58', 'ok', 'конец · отправлено 5 · получено 12 · 6,4 с'],
    ['11:58', '', 'порция 1 · отправлено 5'],
    ['11:57', '', 'начало · связь есть · не отправлено 5'],
    ['10:03', 'ok', 'конец · отправлено 0 · получено 3 · 2,1 с']
  ];
  var journal = '<details class="p2s p2j" data-mock="p2-0059-journal"' + (window.__mockJournal ? ' open' : '') + '><summary class="p2j__sum">Журнал синхронизации <small>· 137 событий</small><span class="p2j__chev">▼</span></summary>' +
    '<div class="p2j__tools"><button class="p2j__copy" type="button">Скопировать отчёт для разработчика</button><span class="p2s__hint">В отчёте нет содержимого записей и имён — только время, счётчики и ошибки.</span></div>' +
    '<ul class="p2j__ev">' + ev.map(function (e) { return '<li><span class="p2j__t">' + e[0] + '</span><span class="p2j__k' + (e[1] ? ' p2j__k--' + e[1] : '') + '">' + esc(e[2]) + '</span></li>'; }).join('') + '</ul>' +
    '<div class="p2j__more">Показаны последние 8 · хранится до 500 событий на этом телефоне</div></details>';

  var old = panel.querySelectorAll('[data-mock^="p2-0059"]'); for (var i = 0; i < old.length; i++) old[i].remove();
  var slot = document.getElementById('p2-net-status-slot');
  if (slot) slot.style.display = 'none';
  var box = document.createElement('div'); box.setAttribute('data-mock', 'p2-0059-box'); box.className = 'space-y-3';
  box.innerHTML = card + journal;
  if (slot && slot.parentNode) slot.parentNode.insertBefore(box, slot.nextSibling); else panel.insertBefore(box, panel.firstChild);
}());
