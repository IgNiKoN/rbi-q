// P2-0060 этап 5: макет «Данные на устройстве → Офлайн по модулям» — вставляется в настоящую оболочку на стенде (shots.mjs).
// Состояние — window.__mockState: 'field' (инженер качества, по роли), 'manager' (руководитель, по роли), 'confirm-clear', 'confirm-off'.
// Только для показа владельцу: код экрана — этап 6. Токены и вид — как у карточек «Данные на устройстве» (.p2s, sync-status.ts).
(function () {
  var S = window.__mockState || 'field';
  var mgr = S === 'manager';
  var old = document.getElementById('p2o-mock'); if (old) old.remove();
  var oldDlg = document.getElementById('p2o-dlg'); if (oldDlg) oldDlg.remove();
  if (!document.getElementById('p2o-css')) {
    var st = document.createElement('style'); st.id = 'p2o-css';
    st.textContent = [
      '.p2o{background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:16px;overflow:hidden;margin:12px 0}',
      '.p2o__head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 16px}',
      '.p2o__ico{width:44px;height:44px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--accent,var(--primary,#c49a5f));background:color-mix(in srgb,var(--accent,var(--primary,#c49a5f)) 14%,transparent)}',
      '.p2o__title{display:block;font-size:16px;font-weight:800;line-height:1.25}',
      '.p2o__sub{display:block;font-size:13px;color:var(--text-muted);margin-top:2px}',
      '.p2o__total{margin-left:auto;font-size:12.5px;color:var(--text-muted);text-align:right}.p2o__total b{color:var(--text-main);font-size:14px}',
      '.p2o__bar{height:6px;border-radius:999px;background:color-mix(in srgb,var(--text-muted) 16%,transparent);overflow:hidden;margin-top:6px;min-width:160px}',
      '.p2o__bar i{display:block;height:100%;background:var(--accent,var(--primary,#c49a5f))}',
      '.p2o__mod{border-top:1px solid var(--card-border);padding:14px 16px;display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:start}',
      '.p2o__name{font-size:15px;font-weight:800}.p2o__what{display:block;font-size:12.5px;color:var(--text-muted);margin-top:2px}',
      '.p2o__chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-weight:700;font-size:12px;margin-top:6px}',
      '.p2o__chip--rw{color:var(--success,#3f8f5e);background:color-mix(in srgb,var(--success,#3f8f5e) 13%,transparent)}',
      '.p2o__chip--ro{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 13%,transparent)}',
      '.p2o__chip--on{color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 14%,transparent)}',
      '.p2o__sw{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;white-space:nowrap}',
      '.p2o__sw span{width:44px;height:26px;border-radius:999px;background:var(--accent,var(--primary,#c49a5f));position:relative;display:inline-block}',
      '.p2o__sw span::after{content:"";position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:#fff}',
      '.p2o__sw--off span{background:color-mix(in srgb,var(--text-muted) 35%,transparent)}.p2o__sw--off span::after{right:auto;left:3px}',
      '.p2o__body{grid-column:1/-1;display:flex;flex-direction:column;gap:10px}',
      '.p2o__size{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--text-muted)}.p2o__size b{color:var(--text-main)}',
      '.p2o__field{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:700;color:var(--text-muted)}',
      '.p2o__sel{min-height:44px;border-radius:12px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);font-size:14px;font-weight:600;padding:0 12px;max-width:420px}',
      '.p2o__role{font-weight:600;color:var(--text-muted)}',
      '.p2o__last{font-size:12.5px;color:var(--text-muted)}',
      '.p2o__btns{display:flex;flex-wrap:wrap;gap:8px}',
      '.p2o__btn{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);font-weight:700;font-size:13px}',
      '.p2o__btn--main{background:var(--accent,var(--primary,#c49a5f));border-color:transparent;color:#fff}',
      '.p2o__btn--danger{color:var(--danger,#b24a43);border-color:color-mix(in srgb,var(--danger,#b24a43) 40%,transparent)}',
      '.p2o__mod--online .p2o__name{color:var(--text-muted)}',
      '.p2o__foot{border-top:1px solid var(--card-border);padding:12px 16px;font-size:12.5px;color:var(--text-muted);display:flex;gap:8px;align-items:flex-start}',
      '.p2o__moved{margin:8px 0;padding:10px 12px;border-radius:12px;border:1px dashed var(--card-border);font-size:12.5px;color:var(--text-muted)}',
      '.p2o-dlg{position:fixed;inset:0;z-index:12000;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.45);padding:16px}',
      '.p2o-dlg__box{width:100%;max-width:440px;background:var(--card-bg);color:var(--text-main);border-radius:18px;border:1px solid var(--card-border);padding:18px;display:flex;flex-direction:column;gap:10px}',
      '.p2o-dlg__t{font-size:17px;font-weight:800}.p2o-dlg__p{font-size:14px;color:var(--text-muted);line-height:1.45}',
      '@media (min-width:768px){.p2o-dlg{align-items:center}.p2o__body{grid-column:1/2}}',
      '@media (max-width:599px){.p2o__total{margin-left:0;text-align:left;flex:1 1 100%}.p2o__sel{max-width:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function mod(o) {
    return '<div class="p2o__mod' + (o.online ? ' p2o__mod--online' : '') + '" data-mod="' + o.id + '">' +
      '<div><span class="p2o__name">' + o.name + '</span><span class="p2o__what">' + o.what + '</span>' +
      '<span class="p2o__chip p2o__chip--' + o.chipKind + '">' + o.chip + '</span></div>' +
      (o.online ? '' : '<label class="p2o__sw' + (o.keep ? '' : ' p2o__sw--off') + '"><span aria-hidden="true"></span>Держать без сети</label>') +
      (o.online ? '' : '<div class="p2o__body">' +
        '<div class="p2o__size">' + o.size + '</div>' +
        (o.files ? '<label class="p2o__field">' + o.filesLabel + '<select class="p2o__sel">' + o.files + '</select></label>' : '') +
        '<div class="p2o__last">' + o.last + '</div>' +
        '<div class="p2o__btns"><button type="button" class="p2o__btn p2o__btn--main">Скачать сейчас</button>' + (o.extra || '') +
        '<button type="button" class="p2o__btn p2o__btn--danger">Очистить скачанное</button></div></div>') +
    '</div>';
  }
  var photos = mgr
    ? '<option>Не скачивать заранее · по роли</option><option>Мои объекты за 30 дней</option><option>Все за 30 дней</option><option>Все</option>'
    : '<option>Мои объекты за 30 дней · по роли</option><option>Все за 30 дней</option><option>Все</option><option>Не скачивать заранее</option>';
  var html = '<section class="p2o" id="p2o-mock" data-testid="p2-offline-modules">' +
    '<div class="p2o__head"><div class="p2o__ico" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/></svg></div>' +
      '<div style="flex:1 1 220px;min-width:0"><span class="p2o__title">Офлайн по модулям</span><span class="p2o__sub">Что телефон держит без сети. Сейчас — по вашей роли: ' +
      (mgr ? 'руководитель качества' : 'инженер качества') + '. Можно поменять у каждого модуля.</span></div>' +
      '<div class="p2o__total">На телефоне <b>' + (mgr ? '46' : '418') + ' МБ</b> · свободно 2,1 ГБ<div class="p2o__bar"><i style="width:' + (mgr ? '3' : '17') + '%"></i></div></div></div>' +
    mod({ id: 'quality', name: 'Качество и Стройконтроль', what: 'Осмотры, замечания, планы СК — одна база на телефоне', chip: 'Без сети: смотреть и вносить', chipKind: 'rw', keep: true,
      size: '<span>Записи <b>' + (mgr ? '31' : '24') + ' МБ</b></span><span>Фото и PDF <b>' + (mgr ? '9' : '386') + ' МБ</b></span>',
      filesLabel: 'Фото и PDF заранее', files: photos,
      last: mgr ? 'Фото заранее не скачиваются — открытые остаются на телефоне' : 'Скачано заранее: сегодня 09:12 · 1 240 фото · свои объекты за 30 дней и открытые замечания',
      extra: '<button type="button" class="p2o__btn">Отчёты на телефон</button>' }) +
    mod({ id: 'planfact', name: 'План/Факт', what: 'Сводка, ВОР, Факт, шахматка, журнал, КС-2 и сметы — по моим проектам', chip: 'Без сети: смотреть', chipKind: 'ro', keep: S !== 'confirm-off',
      size: '<span>Код <b>1,7 МБ</b></span><span>Данные <b>2,3 МБ</b></span>', last: 'Скачано заранее: сегодня 09:12 · 3 проекта' }) +
    mod({ id: 'company', name: 'Компания', what: 'Проекты и объекты, места, сотрудники и роли, контрагенты', chip: 'Без сети: смотреть', chipKind: 'ro', keep: true,
      size: '<span>Данные <b>0,6 МБ</b></span>', last: 'Скачано заранее: сегодня 09:12' }) +
    mod({ id: 'knowledge', name: 'База знаний', what: 'Документы, TWI, тех. узлы, эталоны', chip: 'Без сети: смотреть', chipKind: 'ro', keep: true,
      size: '<span>Документы и TWI <b>' + (mgr ? '6' : '54') + ' МБ</b></span>', filesLabel: 'Документы заранее',
      files: mgr ? '<option>Не скачивать заранее · по роли</option><option>Все</option>' : '<option>Все · по роли</option><option>Не скачивать заранее</option>',
      last: mgr ? 'Открытые документы остаются на телефоне' : 'Скачано заранее: вчера 18:40 · 212 файлов' }) +
    mod({ id: 'ai', name: 'ИИ-помощник', what: 'Вопросы к базе знаний', chip: 'Только онлайн', chipKind: 'on', online: true }) +
    '<div class="p2o__foot"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex:none;margin-top:1px"><path d="M12 9v4m0 4h.01M10.3 3.9L2.4 17.6A2 2 0 004.1 20.6h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>' +
      '<span>Неотправленное («не отправлено: N») не удаляется никогда — ни очисткой, ни правилом по роли. Без сети раздел покажет то, что скачано заранее или открывалось.</span></div>' +
    '</section>';
  var anchor = document.querySelector('details.p2j') || document.querySelector('[data-testid=p2-net-device]');
  if (anchor) anchor.insertAdjacentHTML('afterend', html);
  // в «Хранилище и резервные копии» — перенесённое: авто-кэш и «Скачать …» (остальное на месте)
  var auto = document.getElementById('set-autocache');
  var autoRow = auto ? auto.closest('div.flex, div') : null;
  var dl = document.querySelector('[data-settings-action=downloadOfflineCacheScope][data-action-arg=days30]');
  var dlRow = dl ? dl.parentElement : null;
  if (autoRow && autoRow.parentElement) {
    var box = autoRow.closest('.p-3, .p-4, div') || autoRow;
    autoRow.style.display = 'none';
    if (!document.getElementById('p2o-moved')) autoRow.insertAdjacentHTML('beforebegin', '<div class="p2o__moved" id="p2o-moved">«Авто-кэш облачных файлов», «Скачать последние 30 дней», «Скачать только базу знаний», «Скачать отчёты», «Скачать всё для офлайна» — перенесены в «Офлайн по модулям» выше.</div>');
  }
  if (dlRow) dlRow.style.display = 'none';
  var all = document.querySelector('[data-settings-action=downloadOfflineCacheScope][data-action-arg=all]');
  if (all) all.style.display = 'none';
  if (S === 'confirm-clear' || S === 'confirm-off') {
    var t = S === 'confirm-clear'
      ? '<div class="p2o-dlg__t">Очистить скачанное Качества?</div><div class="p2o-dlg__p">Освободится 386 МБ. Неотправленные осмотры и фото (2) останутся на телефоне и уйдут, когда будет связь. Открытое снова скачается, когда понадобится.</div>' +
        '<div class="p2o__btns"><button type="button" class="p2o__btn p2o__btn--danger" style="flex:1">Очистить 386 МБ</button><button type="button" class="p2o__btn" style="flex:1">Отмена</button></div>'
      : '<div class="p2o-dlg__t">Не держать План/Факт без сети?</div><div class="p2o-dlg__p">Заранее ничего не будет скачиваться. Без сети раздел покажет только то, что вы открывали с интернетом.</div>' +
        '<div class="p2o__btns"><button type="button" class="p2o__btn p2o__btn--main" style="flex:1">Выключить</button><button type="button" class="p2o__btn" style="flex:1">Оставить</button></div>';
    document.body.insertAdjacentHTML('beforeend', '<div class="p2o-dlg" id="p2o-dlg" role="dialog" aria-modal="true"><div class="p2o-dlg__box">' + t + '</div></div>');
  }
})();
