// P2-0023 этап 1 — сидер «проверка со 150+ фото» для проверки показа фото.
// Запуск: открыть Качество 2.0 → консоль браузера → вставить файл целиком → await rbiSeedDemoPhotos({ count: 160 }).
// Что делает: берёт самую свежую проверку из истории (или собирает из системного шаблона),
// копирует её как «Демо: 160 фото», рисует 160 пронумерованных фото (canvas), кладёт их
// на устройство (PhotoManager.saveLocal → local://), раскидывая по пунктам, и открывает карточку.
// ДЕМО-режим: база на устройстве там отключена — проверка и фото живут только в памяти до перезагрузки.
// Вне демо — отказ (запись уйдёт в облако при синхронизации), кроме явного
// rbiSeedDemoPhotos({ count, allowOutsideDemo: true }) — только на стенде без сети или с разрешения владельца.
(function () {
  async function makePhoto(n, total) {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 600;
    const g = c.getContext('2d');
    g.fillStyle = 'hsl(' + Math.round((n * 360) / total) + ',55%,45%)';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff';
    g.font = 'bold 160px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 400, 280);
    g.font = '36px Arial';
    g.fillText('P2-0023 демо-фото', 400, 470);
    return c.toDataURL('image/jpeg', 0.8);
  }

  // История пуста (демо в памяти) — собираем проверку из первого системного шаблона.
  function makeBaseFromTemplate() {
    const tpl = window.RBI && window.RBI.services && window.RBI.services.templates;
    const sys = tpl && typeof tpl.getSystemTemplates === 'function' ? tpl.getSystemTemplates() : {};
    const key = Object.keys(sys || {}).find(k => k !== 'etalon_act' && sys[k] && sys[k].groups);
    if (!key || typeof window.getFlatList !== 'function') return null;
    const items = window.getFlatList(sys[key].groups).slice(0, 20);
    const state = {};
    items.forEach((it, i) => { state[it.id] = i % 4 === 0 ? 'fail' : 'ok'; });
    return {
      templateKey: 'sys_' + key,
      state,
      projectName: 'Демо-объект',
      contractorName: 'Демо-подрядчик',
      templateTitle: sys[key].title || sys[key].name || key,
      metrics: { final: 90, totalCount: items.length, kc: 1, kcrit: 1, baseUrkPerc: 90, n_B1_fail: 0, n_B2_fail: 0, n_B3_fail: 0, statusCls: 'tag-blue' }
    };
  }

  window.rbiSeedDemoPhotos = async function (opts) {
    const count = Math.max(1, Number(opts && opts.count) || 160);
    const demo = window.isDemoMode === true;
    if (!demo && !(opts && opts.allowOutsideDemo)) {
      throw new Error('Сидер работает только в демо-режиме (вне демо фото уйдут в облако).');
    }
    const hs = window.HistoryState;
    const records = (hs && hs.allRecords) || [];
    const base = records.filter(r => r && r.state && r.templateKey && r.templateKey !== 'sys_etalon_act')
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || makeBaseFromTemplate();
    if (!base) throw new Error('Нет проверок и шаблонов чек-листа — сначала пройдите одну проверку.');

    const itemIds = Object.keys(base.state).filter(k => base.state[k]);
    if (!itemIds.length) throw new Error('В проверке нет отмеченных пунктов.');

    const photos = {};
    for (let i = 1; i <= count; i++) {
      const ref = await window.PhotoManager.saveLocal(await makePhoto(i, count), 'demo160', {
        entityType: 'inspection_photo'
      });
      const itemId = itemIds[(i - 1) % itemIds.length];
      (photos[itemId] = photos[itemId] || []).push(ref);
    }

    const id = 'demo_photos_' + count + '_' + Date.now().toString(36);
    const rec = JSON.parse(JSON.stringify(base));
    rec.id = id;
    rec.date = new Date().toISOString();
    rec.photos = photos;
    rec.comment = 'Демо: ' + count + ' фото (P2-0023)';
    rec.templateTitle = 'Демо: ' + count + ' фото — ' + (rec.templateTitle || '');
    rec.sync_status = 'local_only';

    // Демо-режим живёт в памяти: запись проверки только в RAM (рабочая история не меняется).
    // Фото — в IndexedDB как обычно; без ссылок их уберёт штатная чистка «мусорных» файлов.
    if (!demo) await window.dbPut(window.STORES.HISTORY, rec);
    hs.allRecords = [rec].concat(records);
    console.log('[P2-0023 сидер] создана проверка', id, 'фото:', count, 'пунктов:', itemIds.length);
    if (typeof window.showHistoryDetail === 'function') window.showHistoryDetail(id);
    return { id, count, items: itemIds.length };
  };
  console.log('Готово. Запуск: await rbiSeedDemoPhotos({ count: 160 })');
})();
