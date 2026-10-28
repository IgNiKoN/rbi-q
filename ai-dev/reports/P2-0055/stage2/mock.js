// Макет «предлагаю» P2-0055: подменяет содержимое «Объекты и места» на стенде (те же данные: Репин, Корпус 1/2, Секция 1, 5 этажей × 4 кв.).
// window.__mock(state, phone) — state: tree | rename | plus | menu | paste | drag | chess | sheet | menu-phone
window.__mock = function (state, phone) {
  var css = `
  .mk{display:flex;flex-direction:column;gap:12px;min-width:0;font-size:14px;color:var(--text-main)}
  .mk-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .mk-head__t{display:flex;align-items:center;gap:8px;font-size:15px}
  .mk-objs{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
  .mk-obj{display:flex;flex-direction:column;gap:2px;padding:10px 12px;min-height:64px;border:1px solid var(--card-border);border-radius:12px;background:var(--card-bg);position:relative}
  .mk-obj b{font-size:14px;font-weight:600}.mk-obj span{font-size:12.5px;color:var(--text-muted)}
  .mk-obj.is-on{border-color:var(--accent,#c49a5f);box-shadow:inset 0 0 0 1px var(--accent,#c49a5f)}
  .mk-obj.is-no{border-style:dashed;border-color:var(--color-red,#9f4c45)}
  .mk-no{position:absolute;left:8px;right:8px;top:calc(100% + 6px);z-index:5;background:var(--text-main);color:var(--card-bg);font-size:12.5px;border-radius:10px;padding:8px 10px;box-shadow:0 6px 18px rgba(0,0,0,.2)}
  .mk-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
  .mk-bar__t{display:flex;align-items:baseline;gap:8px}.mk-bar__t b{font-size:16px}.mk-bar__t span{font-size:13px;color:var(--text-muted)}
  .mk-seg{display:inline-flex;border:1px solid var(--card-border);border-radius:10px;overflow:hidden;background:var(--card-bg)}
  .mk-seg button{font:inherit;font-size:13px;border:0;background:transparent;color:var(--text-muted);padding:7px 14px;min-height:36px}
  .mk-seg button.on{background:var(--sel-bg,rgba(196,154,95,.1));color:var(--text-main);font-weight:600}
  .mk-split{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
  .mk-split.side{grid-template-columns:minmax(0,1fr) 340px}
  .mk-box{border:1px solid var(--card-border);border-radius:14px;background:var(--card-bg);padding:6px}
  .mk-clip{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 12px;border-radius:12px;background:var(--card-bg-2,#fbf9f5);border:1px dashed var(--line-strong,rgba(28,43,57,.24));font-size:13px}
  .mk-clip b{font-weight:600}.mk-clip .mk-sp{flex:1}
  .mk-row{display:flex;align-items:center;gap:6px;min-height:44px;padding:0 6px 0 calc(6px + var(--l,0) * 22px);border-radius:10px;position:relative}
  .mk-row:hover,.mk-row.hov{background:var(--hover-bg,rgba(28,43,57,.055))}
  .mk-row.sel{background:var(--sel-bg,rgba(196,154,95,.1));box-shadow:inset 3px 0 0 var(--accent,#c49a5f)}
  .mk-row.cut{opacity:.5}.mk-row.cut b{text-decoration:line-through dotted}
  .mk-row.ghost{opacity:.35}
  .mk-grip{width:14px;color:var(--text-muted);opacity:0;font-size:13px;letter-spacing:-2px;cursor:grab;user-select:none}
  .mk-row:hover .mk-grip,.mk-row.sel .mk-grip,.mk-row.hov .mk-grip{opacity:1}
  .mk-tog{width:22px;color:var(--text-muted);text-align:center;font-size:12px}
  .mk-name{display:flex;align-items:baseline;gap:8px;min-width:0;flex:1}
  .mk-name b{font-weight:600;white-space:nowrap}.mk-name span{font-size:12.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mk-act{display:flex;align-items:center;gap:4px;opacity:0}
  .mk-row:hover .mk-act,.mk-row.sel .mk-act,.mk-row.hov .mk-act,.ph .mk-act{opacity:1}
  .mk-ib{font:inherit;font-size:13px;min-width:32px;height:32px;padding:0 8px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--text-main);display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap}
  .mk-ib:hover,.mk-ib.on{border-color:var(--card-border);background:var(--card-bg)}
  .mk-ib.plus{color:var(--accent-text,#8a6a35);font-weight:600}
  .ph .mk-ib{min-width:44px;height:44px}
  .mk-tip{position:absolute;right:46px;bottom:calc(100% - 2px);background:var(--text-main);color:var(--card-bg);font-size:12px;padding:5px 9px;border-radius:8px;white-space:nowrap;z-index:6}
  .mk-edit{flex:1;display:flex;flex-direction:column;gap:3px;padding:4px 0}
  .mk-edit input{font:inherit;font-size:15px;font-weight:600;min-height:36px;padding:0 10px;border-radius:8px;border:2px solid var(--accent,#c49a5f);background:var(--card-bg);color:var(--text-main);max-width:320px}
  .mk-edit small{font-size:12px;color:var(--bad-text,#9f4c45)}.mk-edit em{font-style:normal;font-size:12px;color:var(--text-muted)}
  .mk-line{height:0;border-top:2px solid var(--accent,#c49a5f);margin:0 6px 0 calc(28px + var(--l,0) * 22px);position:relative}
  .mk-line:before{content:"";position:absolute;left:-5px;top:-5px;width:8px;height:8px;border-radius:50%;background:var(--accent,#c49a5f)}
  .mk-drag{position:absolute;z-index:7;left:auto;right:24px;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:var(--card-bg);border:1px solid var(--accent,#c49a5f);box-shadow:0 10px 24px rgba(0,0,0,.18);font-size:13.5px;transform:rotate(-1.5deg)}
  .mk-menu{position:absolute;right:6px;top:calc(100% - 4px);z-index:8;width:300px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.18);padding:6px}
  .mk-mi{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:8px;font-size:13.5px;min-height:36px}
  .mk-mi:hover,.mk-mi.hov{background:var(--hover-bg,rgba(28,43,57,.055))}
  .mk-mi kbd{font:inherit;font-size:11.5px;color:var(--text-muted)}.mk-mi small{display:block;font-size:12px;color:var(--text-muted)}
  .mk-mi.off{color:var(--text-muted)}.mk-mi.bad{color:var(--bad-text,#9f4c45)}
  .mk-sep{height:1px;background:var(--card-border);margin:4px 2px}
  .mk-card{border:1px solid var(--card-border);border-radius:14px;background:var(--card-bg);padding:14px;display:flex;flex-direction:column;gap:12px;position:sticky;top:80px}
  .mk-card h4{margin:0;font-size:17px;display:flex;align-items:center;gap:8px}.mk-card h4 span{font-size:12px;font-weight:500;color:var(--text-muted);border:1px solid var(--card-border);border-radius:999px;padding:1px 8px}
  .mk-card--sheet{border:0;padding:0;position:static}
  .mk-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:13.5px}.mk-kv dt{color:var(--text-muted)}.mk-kv dd{margin:0}
  .mk-in{font:inherit;min-height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--card-border);background:var(--card-bg-2,#fbf9f5);color:var(--text-main);width:100%;box-sizing:border-box}
  .mk-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mk-btns .pf-btn{min-height:40px;justify-content:center}
  .mk-btns .wide{grid-column:1/-1}
  .mk-gold{background:var(--btn-primary,#c49a5f)!important;color:var(--btn-primary-text,#172330)!important;border-color:var(--btn-primary,#c49a5f)!important}
  .mk-hint{font-size:12px;color:var(--text-muted);line-height:1.45}
  .mk-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:24px;z-index:950;display:flex;align-items:center;gap:16px;background:#172330;color:#f7f4ee;border-radius:12px;padding:10px 10px 10px 16px;box-shadow:0 10px 30px rgba(0,0,0,.28);font-size:14px;min-width:320px;max-width:calc(100vw - 32px);box-sizing:border-box}
  .mk-toast button{font:inherit;font-weight:700;color:#d8bd91;background:transparent;border:0;padding:8px 10px;border-radius:8px;min-height:40px}
  .mk-toast i{position:absolute;left:12px;right:12px;bottom:4px;height:2px;background:rgba(216,189,145,.35);border-radius:2px}
  .mk-toast i:after{content:"";display:block;width:62%;height:100%;background:#d8bd91;border-radius:2px}
  .ph .mk-toast{bottom:calc(65px + 16px)}
  .mk-chess{overflow-x:auto;border:1px solid var(--card-border);border-radius:14px;background:var(--card-bg);padding:10px}
  .mk-ch{display:grid;gap:6px;min-width:max-content}
  .mk-ch .h{font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 6px;border-bottom:1px solid var(--card-border)}
  .mk-ch .fl{font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;justify-content:flex-end;padding-right:6px;white-space:nowrap}
  .mk-cells{display:flex;gap:4px}
  .mk-cell{width:54px;min-height:44px;border:1px solid var(--card-border);border-radius:8px;background:var(--card-bg-2,#fbf9f5);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12.5px;line-height:1.2}
  .mk-cell small{font-size:11px;color:var(--text-muted)}
  .mk-cell.sel{border-color:var(--accent,#c49a5f);box-shadow:inset 0 0 0 1px var(--accent,#c49a5f);background:var(--sel-bg,rgba(196,154,95,.1))}
  .mk-cell.add{border-style:dashed;color:var(--accent-text,#8a6a35);background:transparent;width:44px}
  .mk-cell.empty{border-style:dashed;background:transparent;color:var(--text-muted);width:auto;padding:0 10px}
  .mk-legend{font-size:12px;color:var(--text-muted);margin-top:8px}
  .mk-sheet-bg{position:fixed;inset:0;background:rgba(16,25,35,.45);z-index:1100}
  .mk-sheet{position:fixed;left:0;right:0;bottom:0;z-index:1101;background:var(--card-bg);border-radius:18px 18px 0 0;padding:10px 16px calc(16px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 30px rgba(0,0,0,.2);display:flex;flex-direction:column;gap:12px;max-height:85vh;overflow:auto}
  .mk-sheet .grab{width:40px;height:4px;border-radius:2px;background:var(--line-strong,rgba(28,43,57,.24));margin:0 auto}
  .mk-sheet .mk-btns .pf-btn{min-height:48px;font-size:15px}
  .mk-sheet .mk-mi{min-height:48px;font-size:15px}
  `;
  var root = document.querySelector('[data-testid=op-root]');
  var host = root.parentElement;
  var st = document.getElementById('mk-css') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'mk-css' }));
  st.textContent = css;
  var floors = [1, 2, 3, 4, 5];
  var apt = function (f, k) { return (f - 1) * 4 + k; };
  var row = function (o) {
    var acts = o.acts === false ? '' : `<div class="mk-act">${o.plus ? `<button class="mk-ib plus" title="Добавить: ${o.plus}">${o.plusText ? '+ ' + o.plus : '+'}</button>` : ''}<button class="mk-ib${o.menuOn ? ' on' : ''}" aria-label="Действия">⋯</button></div>`;
    return `<div class="mk-row${o.cls ? ' ' + o.cls : ''}" style="--l:${o.l}">${phone ? '' : '<span class="mk-grip">⋮⋮</span>'}<span class="mk-tog">${o.tog || ''}</span>${o.edit ? o.edit : `<span class="mk-name"><b>${o.n}</b><span>${o.m}</span></span>`}${acts}${o.extra || ''}</div>`;
  };
  function tree(opt) {
    opt = opt || {};
    var h = '';
    h += row({ l: 0, tog: '▾', n: 'Секция 1', m: 'секция · 5 эт. · 20 кв.', plus: '6 этаж', cls: opt.secCls, extra: opt.secExtra, menuOn: opt.secMenu, plusText: opt.secPlusText });
    floors.forEach(function (f) {
      var isOpen = f === 1 || f === 2 || (opt.open3 && f === 3);
      var fcls = opt.sel === 'f' + f ? 'sel' : opt.hov === 'f' + f ? 'hov' : '';
      if (opt.cutFloor === f) fcls += ' cut';
      if (opt.editFloor === f) {
        h += row({ l: 1, tog: '▸', edit: `<div class="mk-edit"><input value="${opt.editVal}" aria-label="Название"><${opt.editErr ? 'small' : 'em'}>${opt.editErr || 'Enter — сохранить · Esc — отмена'}</${opt.editErr ? 'small' : 'em'}></div>`, acts: false });
        return;
      }
      h += row({ l: 1, tog: isOpen ? '▾' : '▸', n: f + ' этаж', m: 'этаж · кв. ' + apt(f, 1) + '–' + apt(f, 4), plus: 'Кв. 21', cls: fcls, extra: opt.floorExtra && opt.floorExtra[f], menuOn: opt.floorMenu === f });
      if (!isOpen) return;
      for (var k = 1; k <= 4; k++) {
        var n = apt(f, k), acls = opt.sel === 'a' + n ? 'sel' : '';
        if (opt.ghost === n) acls += ' ghost';
        if (opt.lineBefore === n) h += '<div class="mk-line" style="--l:2"></div>';
        h += row({ l: 2, n: 'Кв. ' + n, m: 'квартира · стр. № ' + n, cls: acls, extra: opt.aptExtra && opt.aptExtra[n] });
      }
      if (opt.added && f === 6) h += '';
    });
    if (opt.added) h += row({ l: 1, tog: '▸', n: '6 этаж', m: 'этаж · пока пусто', plus: 'Кв. 21', cls: 'sel' });
    return `<div class="mk-box" style="position:relative" role="tree">${h}</div>`;
  }
  function card(kind) {
    var c = {
      floor: { t: '2 этаж', k: 'этаж', path: 'Корпус 1 › Секция 1', kv: '<dt>Помещений</dt><dd>4 · стр. № 5–8</dd>', plus: '+ Кв. 21' },
      apt: { t: 'Кв. 6', k: 'квартира', path: 'Корпус 1 › Секция 1 › 2 этаж', kv: '<dt>Строит. №</dt><dd><input class="mk-in" value="6"></dd><dt>Номер БТИ</dt><dd><input class="mk-in" placeholder="не указан"></dd>', plus: null },
      section: { t: 'Секция 1', k: 'секция', path: 'Корпус 1', kv: '<dt>Этажей</dt><dd>5</dd><dt>Помещений</dt><dd>20 · стр. № 1–20</dd>', plus: '+ 6 этаж' }
    }[kind];
    return `<aside class="mk-card"><h4>${c.t} <span>${c.k}</span></h4>
      <dl class="mk-kv"><dt>Где</dt><dd>${c.path}</dd>${c.kv}</dl>
      <div class="mk-btns">${c.plus ? `<button class="pf-btn mk-gold wide">${c.plus}</button>` : ''}
        <button class="pf-btn pf-btn--ghost">Переименовать</button><button class="pf-btn pf-btn--ghost">Копировать</button>
        <button class="pf-btn pf-btn--ghost">Вырезать</button><button class="pf-btn pf-btn--ghost">Вставить сюда</button>
        <button class="pf-btn pf-btn--ghost">↑ Выше</button><button class="pf-btn pf-btn--ghost">↓ Ниже</button>
        ${kind === 'section' ? '<button class="pf-btn pf-btn--ghost wide">Добавить этажи…</button>' : ''}
        <button class="pf-btn pf-btn--ghost wide" style="color:var(--bad-text,#9f4c45)">Удалить</button></div>
      ${phone ? '' : '<div class="mk-hint">На выбранной строке: Ctrl/⌘ + C — копировать, X — вырезать, V — вставить, Z — отменить, F2 — переименовать. Строку можно перетащить мышью — внутри корпуса.</div>'}</aside>`;
  }
  var menu = `<div class="mk-menu" role="menu">
    <div class="mk-mi hov">Переименовать<kbd>F2</kbd></div>
    <div class="mk-mi">+ 6 этаж<kbd>следующий по номеру</kbd></div>
    <div class="mk-mi"><span>Добавить другое…<small>этаж, помещение, прочее — с названием и номерами</small></span></div>
    <div class="mk-mi">Добавить этажи…<kbd>в несколько секций</kbd></div>
    <div class="mk-sep"></div>
    <div class="mk-mi">Копировать<kbd>Ctrl+C</kbd></div><div class="mk-mi">Вырезать<kbd>Ctrl+X</kbd></div>
    <div class="mk-mi off"><span>Вставить сюда<small>буфер пуст — сначала «Копировать» или «Вырезать»</small></span><kbd>Ctrl+V</kbd></div>
    <div class="mk-mi">Дублировать рядом<kbd>«Секция 2»</kbd></div>
    <div class="mk-sep"></div>
    <div class="mk-mi off">↑ Выше<kbd>первая</kbd></div><div class="mk-mi">↓ Ниже</div>
    <div class="mk-sep"></div>
    <div class="mk-mi bad">Удалить<kbd>можно отменить</kbd></div></div>`;
  var objs = function (no) {
    return `<div class="mk-objs"><div class="mk-obj is-on"><b>Корпус 1</b><span>Здание</span><span>квартир 20</span></div>
      <div class="mk-obj${no ? ' is-no' : ''}"><b>Корпус 2</b><span>Здание</span><span>квартир 20</span>${no ? '<div class="mk-no">⦸ Перенести в другой корпус нельзя — в другой корпус: «Копировать», затем «Вставить сюда»</div>' : ''}</div></div>`;
  };
  var bar = function (mode) {
    return `<div class="mk-bar"><div class="mk-bar__t"><b>Корпус 1</b><span>Здание · 1 секция · 5 этажей · 20 кв.</span></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div class="mk-seg"><button class="${mode === 'chess' ? '' : 'on'}">Дерево</button><button class="${mode === 'chess' ? 'on' : ''}">Шахматка</button></div>
      <button class="pf-btn pf-btn--ghost">+ Секция 2</button><button class="mk-ib" style="border-color:var(--card-border)" aria-label="Действия с объектом">⋯</button></div></div>`;
  };
  var head = `<div class="mk-head op-head"><div class="mk-head__t"><b>Объекты</b><span class="pf-tab-n">2</span></div><button class="pf-btn op-main">+ Объект</button></div>`;
  var toast = function (t) { return `<div class="mk-toast" role="status"><span>${t}</span><button>Отменить</button><i></i></div>`; };
  var body = '', side = '', after = '';
  var wrap = function (main, sideHtml) { return `<div class="mk-split${sideHtml && !phone ? ' side' : ''}"><div style="display:flex;flex-direction:column;gap:8px;min-width:0">${main}</div>${sideHtml && !phone ? sideHtml : ''}</div>`; };
  if (state === 'tree') body = wrap(tree({ sel: 'f2', hov: 'f2' }), card('floor'));
  if (state === 'apt') body = wrap(tree({ sel: 'a6' }), card('apt'));
  if (state === 'rename') body = wrap(tree({ editFloor: 3, editVal: '2 этаж', editErr: 'Место с таким названием уже есть на этом уровне — введите другое', sel: 'f3' }), card('floor'));
  if (state === 'plus') { body = wrap(tree({ added: true, secExtra: '' }), card('floor').replace('2 этаж', '6 этаж').replace('4 · стр. № 5–8', 'пока пусто')); after = toast('Добавлен «6 этаж»'); }
  if (state === 'plushover') body = wrap(tree({ hov: 'x', secCls: 'hov', secExtra: '<span class="mk-tip">Добавить «6 этаж» — сразу, без окна</span>' }), card('section'));
  if (state === 'menu') body = wrap(tree({ sel: 'x', secCls: 'sel', secMenu: true, secExtra: menu }), card('section'));
  if (state === 'paste') {
    body = wrap(`<div class="mk-clip"><span>📋 Скопировано: <b>Секция 1</b> — 5 этажей, 20 кв.</span><span class="mk-sp"></span><span>Выберите корпус или секцию и нажмите «Вставить сюда» (Ctrl+V)</span><button class="mk-ib" aria-label="Очистить">✕</button></div>` + tree({ sel: 'x', secCls: 'sel' }),
      card('section').replace('Вставить сюда</button>', 'Вставить сюда</button>'));
    body = body.replace('<div class="mk-objs">', '<div class="mk-objs">');
  }
  if (state === 'paste2') { body = wrap(tree({ sel: 'x' }), ''); after = toast('Вставлено в «Корпус 2»: «Секция 2» — 5 этажей, 20 кв. (№ 21–40)'); }
  if (state === 'drag') body = wrap(tree({ open3: true, ghost: 6, lineBefore: 11, aptExtra: { 11: '<div class="mk-drag" style="--l:2;top:-30px">⋮⋮ <b>Кв. 6</b> → 3 этаж, перед «Кв. 11»</div>' } }), '');
  if (state === 'cut') body = wrap(`<div class="mk-clip"><span>✂ Вырезано: <b>3 этаж</b> — 4 кв.</span><span class="mk-sp"></span><span>Вставить можно только внутри «Корпус 1»</span><button class="mk-ib" aria-label="Очистить">✕</button></div>` + tree({ cutFloor: 3, sel: 'x', secCls: 'sel' }), card('section'));
  if (state === 'chess') {
    var colH = function (s, n) { return `<div class="h">Секция ${s}<button class="mk-ib plus">+ эт.</button></div>`; };
    var g = `<div class="mk-ch" style="grid-template-columns:auto repeat(2, max-content)"><div></div>${colH(1)}${colH(2)}`;
    [6, 5, 4, 3, 2, 1].forEach(function (f) {
      g += `<div class="fl">${f} эт.</div>`;
      [1, 2].forEach(function (s) {
        if (f === 6 && s === 1) { g += '<div class="mk-cells"><div class="mk-cell empty">пусто</div><div class="mk-cell add">+</div></div>'; return; }
        if (f === 6) { g += '<div></div>'; return; }
        var cells = '';
        for (var k = 1; k <= 4; k++) { var n = apt(f, k) + (s === 2 ? 20 : 0); cells += `<div class="mk-cell${s === 1 && n === 6 ? ' sel' : ''}">кв. ${n}<small>стр. ${n}</small></div>`; }
        g += `<div class="mk-cells">${cells}<div class="mk-cell add">+</div></div>`;
      });
    });
    g += '</div>';
    body = wrap(`<div class="mk-chess">${g}<div class="mk-legend">Столбцы — секции, строки — этажи (верхний сверху), клетки — помещения: номер и строительный №. Щелчок по клетке — карточка места (на телефоне — снизу); «+» — следующее помещение или этаж, как в дереве.</div></div>`, card('apt'));
  }
  if (state === 'sheet') {
    body = wrap(tree({ sel: 'f2' }), '');
    after = `<div class="mk-sheet-bg"></div><div class="mk-sheet"><div class="grab"></div>${card('floor').replace('<aside class="mk-card">', '<div class="mk-card mk-card--sheet">').replace('</aside>', '</div>')}</div>`;
  }
  if (state === 'menu-phone') {
    body = wrap(tree({ sel: 'x', secCls: 'sel' }), '');
    after = `<div class="mk-sheet-bg"></div><div class="mk-sheet"><div class="grab"></div><b style="font-size:16px">Секция 1</b>${menu.replace('<div class="mk-menu" role="menu">', '<div>').replace(/<kbd>Ctrl\+.<\/kbd>|<kbd>F2<\/kbd>/g, '')}</div>`;
  }
  var main = head + objs(state === 'drag2') + (state === 'chess' ? bar('chess') : bar('tree')) + body;
  if (state === 'drag2') main = head + objs(true) + bar('tree') + wrap(tree({ ghost: 6, sel: 'x' }), '');
  var div = document.createElement('div');
  div.className = 'mk' + (phone ? ' ph' : '');
  div.setAttribute('data-testid', 'op-root');
  div.innerHTML = main + after;
  host.replaceChild(div, root);
};
