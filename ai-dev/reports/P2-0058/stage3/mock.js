// Макет «предлагаю» (этап 3, P2-0058): поверх настоящего экрана без сети. Состояние — window.__mockState:
// start (плашка + значок, не отправлено 0) · unsent (значок, 1) · company / planfact («Нужен интернет») · device («Данные на устройстве») · rescue (лист).
(function () {
  var st = window.__mockState || 'start';
  var phone = window.innerWidth < 768;
  var n = st === 'start' || st === 'rescue' ? 0 : 1;
  var css = document.getElementById('p2-mock-css');
  if (!css) {
    css = document.createElement('style'); css.id = 'p2-mock-css';
    css.textContent = [
      '.p2-net{display:inline-flex;align-items:center;gap:6px;margin-left:6px;height:26px;padding:0 10px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;cursor:pointer;',
      'color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent);border:1px solid color-mix(in srgb,var(--warning,#b8844a) 35%,transparent)}',
      '.p2-net svg{flex:none}.p2-net b{font-weight:800}',
      '.p2-net__sep{opacity:.5}',
      '.p2-banner{position:fixed;left:50%;transform:translateX(-50%);z-index:900;display:flex;align-items:center;gap:10px;max-width:min(560px,calc(100vw - 32px));width:max-content;',
      'padding:10px 12px 10px 14px;border-radius:14px;font-size:13.5px;font-weight:600;color:var(--text-main);background:var(--card-bg);border:1px solid color-mix(in srgb,var(--warning,#b8844a) 45%,transparent);box-shadow:0 8px 24px rgba(0,0,0,.14)}',
      '.p2-banner svg{color:var(--warning,#b8844a);flex:none}.p2-banner button{border:0;background:none;color:var(--text-muted);font-size:18px;line-height:1;width:32px;height:32px;cursor:pointer;flex:none}',
      '.p2-need{max-width:520px;margin:24px auto;padding:28px 24px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:20px}',
      '.p2-need__ico{width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent)}',
      '.p2-need h2{margin:0;font-size:19px;font-weight:700}.p2-need p{margin:0;font-size:14px;line-height:1.45;color:var(--text-muted);max-width:420px}',
      '.p2-need__btns{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:6px;width:100%}',
      '.p2-btn{min-height:44px;padding:0 18px;border-radius:12px;font-size:14px;font-weight:600;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);cursor:pointer}',
      '.p2-btn--primary{border:0;background:var(--accent,var(--primary));color:#fff}',
      '@media (max-width:767px){.p2-need{margin:16px;padding:24px 16px}.p2-need__btns .p2-btn{flex:1 1 100%}}',
      '.p2-dev-unsent{display:flex;gap:12px;align-items:center;padding:14px 16px;margin:0 0 14px;border-radius:16px;background:var(--card-bg);color:var(--text-main);border:1px solid color-mix(in srgb,var(--warning,#b8844a) 45%,transparent)}',
      '.p2-dev-unsent b{display:block;font-size:15px}.p2-dev-unsent span{font-size:13px;color:var(--text-muted)}',
      '.p2-rs-wrap{position:fixed;inset:0;z-index:1300}.p2-rs-back{position:absolute;inset:0;background:rgba(0,0,0,.35)}',
      '.p2-rs{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:14px;max-height:88vh;overflow-y:auto;padding:18px 16px calc(16px + env(safe-area-inset-bottom,0px));background:var(--card-bg);color:var(--text-main);border-radius:20px 20px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.25)}',
      '.p2-rs__grip{width:40px;height:4px;border-radius:4px;background:var(--card-border);align-self:center;margin-top:-6px}',
      '.p2-rs__head{display:flex;gap:12px;align-items:flex-start}.p2-rs__head .p2-need__ico{width:44px;height:44px;border-radius:12px;flex:none}',
      '.p2-rs__head b{display:block;font-size:17px;font-weight:700;line-height:1.3}.p2-rs__head span{display:block;margin-top:4px;font-size:13.5px;color:var(--text-muted);line-height:1.4}',
      '.p2-rs ul{margin:0;padding:0;list-style:none;border:1px solid var(--card-border);border-radius:14px;overflow:hidden}',
      '.p2-rs li{display:grid;grid-template-columns:92px 1fr;gap:2px 10px;padding:10px 12px;font-size:13.5px;border-top:1px solid var(--card-border)}.p2-rs li:first-child{border-top:0}',
      '.p2-rs li i{font-style:normal;color:var(--text-muted);grid-row:span 2;font-size:12.5px;line-height:1.35}.p2-rs li strong{font-weight:700}.p2-rs li em{font-style:normal;color:var(--text-muted);font-size:12.5px}',
      '.p2-rs__note{margin:0;font-size:12.5px;color:var(--text-muted)}',
      '.p2-rs__foot{display:flex;gap:8px;justify-content:flex-end}.p2-rs__foot .p2-btn{flex:1 1 0}',
      '@media (min-width:768px){.p2-rs{left:50%;right:auto;bottom:auto;top:50%;transform:translate(-50%,-50%);width:540px;border-radius:20px}.p2-rs__grip{display:none}.p2-rs__foot .p2-btn{flex:0 0 auto}}'
    ].join('');
    document.head.appendChild(css);
  }
  var OFF = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l20 20"/><path d="M5.8 10.1A5 5 0 0 0 7 18h10.5"/><path d="M20.9 16.6A4 4 0 0 0 19 10a5 5 0 0 0-7.6-4.3"/></svg>';
  var OFF_BIG = OFF.replace(/15/g, '26');
  // значок в шапке: за облачком синхронизации (без связи — вместо него: оно рисует «всё отправлено» и без сети);
  // на телефоне в разделах шапка своя (кнопка модулей + название) — значок справа в ней, только число
  function placeChip() {
    var sync = [document.getElementById('desk-sync-status'), document.getElementById('header-sync-status')].filter(function (e) { return e && (e.offsetParent || e.dataset.p2off); })[0] || null;
    var wrap = document.querySelector('.mobile-module-menu-wrap');
    var row = sync ? null : wrap && wrap.offsetParent ? wrap.parentElement : null;
    var chip = document.querySelector('.p2-net');
    if (chip && ((row && chip.parentElement === row) || (!row && sync && chip.previousElementSibling === sync))) return;
    if (chip) chip.remove();
    chip = document.createElement('span'); chip.className = 'p2-net'; chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', 'Нет связи, не отправлено: ' + n);
    chip.innerHTML = phone ? OFF + '<b>' + n + '</b>' : OFF + '<span>Нет связи</span><span class="p2-net__sep">·</span><span>не отправлено: <b>' + n + '</b></span>';
    if (row) { chip.style.marginLeft = 'auto'; row.appendChild(chip); }
    else if (sync) { sync.dataset.p2off = '1'; sync.style.display = 'none'; sync.insertAdjacentElement('afterend', chip); }
  }
  placeChip();
  clearInterval(window.__p2MockTimer); window.__p2MockTimer = setInterval(placeChip, 150);
  var sync = document.querySelector('.p2-net');
  document.querySelectorAll('.p2-banner,.p2-rs-wrap' + (st === 'rescue' ? ',[data-testid=p2-rescue]' : '')).forEach(function (e) { e.remove(); });
  if (st === 'start') {
    var hdr = sync && sync.closest('header, #main-header, [id$=header]');
    var top = hdr ? Math.max(Math.round(hdr.getBoundingClientRect().bottom), 56) + 8 : 80;
    var b = document.createElement('div'); b.className = 'p2-banner'; b.setAttribute('role', 'status'); b.style.top = top + 'px';
    b.innerHTML = OFF + '<span>Нет связи — данные сохраняются на телефоне</span><button aria-label="Закрыть">×</button>';
    document.body.appendChild(b);
  }
  function host() {
    return document.getElementById('app-content') || document.querySelector('main') || document.body;
  }
  if (st === 'company' || st === 'planfact') {
    var name = st === 'company' ? '«Компания»' : '«План/Факт»';
    host().innerHTML = '<div class="p2-need" role="status"><div class="p2-need__ico">' + OFF_BIG + '</div><h2>Нужен интернет</h2>' +
      '<p>Раздел ' + name + ' работает только онлайн. Данные Качества и Стройконтроля доступны без связи — осмотры сохраняются на телефоне и отправятся сами.</p>' +
      '<div class="p2-need__btns"><button class="p2-btn p2-btn--primary">Открыть Качество</button><button class="p2-btn">Повторить</button></div></div>';
  }
  if (st === 'device') {
    var card = document.querySelector('.p2-dev-unsent');
    var anchor = Array.prototype.slice.call(document.querySelectorAll('h1,h2,div,span')).filter(function (e) {
      return e.children.length === 0 && e.offsetParent && e.textContent.trim() === 'Данные на устройстве' && parseFloat(getComputedStyle(e).fontSize) >= 20; })[0];
    if (!card) {
      card = document.createElement('div'); card.className = 'p2-dev-unsent';
      card.innerHTML = '<div class="p2-need__ico" style="width:44px;height:44px;border-radius:12px;flex:none">' + OFF + '</div><div><b>Нет связи · не отправлено: 1</b>' +
        '<span>Записи сохранены на этом телефоне и уйдут на сервер сами, когда появится связь.</span></div>';
      if (anchor && anchor.parentElement) anchor.insertAdjacentElement('afterend', card); else host().prepend(card);
    }
  }
  if (st === 'rescue') {
    var w = document.createElement('div'); w.className = 'p2-rs-wrap';
    w.innerHTML = '<div class="p2-rs-back"></div><div class="p2-rs" role="dialog" aria-modal="true"><div class="p2-rs__grip"></div>' +
      '<div class="p2-rs__head"><div class="p2-need__ico">' + OFF + '</div><div><b>Найдено 3 записи, сделанные без связи</b>' +
      '<span>Они остались на этом телефоне и не отправлены. Перенести в «Тест-Строй» и отправить?</span></div></div>' +
      '<ul><li><i>27.10.2026<br>09:14</i><strong>Осмотр</strong><em>ЖК Тестовый · Секция 1, этаж 3</em></li>' +
      '<li><i>27.10.2026<br>11:40</i><strong>Осмотр</strong><em>ЖК Тестовый · Секция 2, этаж 5</em></li>' +
      '<li><i>27.10.2026<br>15:02</i><strong>Замечание</strong><em>ЖК Тестовый · Трещина в стяжке</em></li></ul>' +
      '<p class="p2-rs__note">Фото переносятся вместе с записями. Демо-данные и задачи, созданные системой, не переносятся.</p>' +
      '<div class="p2-rs__foot"><button class="p2-btn">Позже</button><button class="p2-btn p2-btn--primary">Перенести и отправить</button></div></div>';
    document.body.appendChild(w);
  }
})();
