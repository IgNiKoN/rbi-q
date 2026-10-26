// P2-0024 — сидер истории Качества для замеров (3000 / 10 000 проверок).
// Запуск ТОЛЬКО на локальном стенде (localhost / 127.0.0.1): открыть Качество 2.0 → консоль →
// вставить файл целиком → await rbiSeedQualityHistory({ count: 3000 }).
// Что делает: собирает проверки из системных чек-листов (статусы пунктов, замечания с причинами,
// фото-ссылки, метрики через getProductMetrics, снимок чек-листа — как пишет audit.actions.js),
// кладёт их в базу устройства (app_history) как «уже отправленные» (source: 'cloud', syncStatus: 'synced'),
// поэтому на сервер они не уходят. Детерминированно (одинаковые данные при одинаковом seed).
// clear: true (по умолчанию) — сначала очистить историю устройства; now — точка отсчёта дат (мс).
(function () {
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const CAUSES = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C00'];
  const CONTRACTORS = ['СтройМонтаж', 'ГлавФасад', 'БетонСервис', 'ОтделкаПро', 'ИнжСети', 'КровляГрупп', 'МонолитСтрой', 'ЭлектроЛюкс', 'АкваТерм', 'ПолИмпульс', 'Стальконструкция', 'ГеоФундамент'];
  const INSPECTORS = ['Иванов И.И.', 'Петров П.П.', 'Сидорова А.В.', 'Кузнецов Д.С.', 'Смирнова Е.Н.', 'Попов А.А.'];
  const PROJECTS = ['ЖК Северный', 'ЖК Южный парк', 'БЦ Центр'];

  function snapshot(groups) {
    return groups.map(g => ({ group: g && g.group, items: (g.items || []).map(it => ({ id: it.id, n: it.n, w: it.w })) }));
  }

  window.rbiSeedQualityHistory = async function (opts) {
    const o = Object.assign({ count: 3000, seed: 24, clear: true, days: 365, now: Date.now() }, opts || {});
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) throw new Error('Сидер — только на локальном стенде');
    const sys = window.SYSTEM_TEMPLATES || {};
    const keys = Object.keys(sys).filter(k => k !== 'etalon_act' && sys[k] && Array.isArray(sys[k].groups) && sys[k].groups.length);
    if (!keys.length) throw new Error('Нет системных чек-листов');
    const R = rng(o.seed);
    const now = Number(o.now) || Date.now(); // общий «сейчас» — одинаковые даты на двух стендах (до/после)
    const out = [];
    for (let i = 0; i < o.count; i++) {
      const key = keys[Math.floor(R() * keys.length)];
      const tpl = sys[key];
      const groups = tpl.groups;
      // ≈ 18 пунктов на проверку, как в замерах (53 325 пунктов на 3000): полная — если чек-лист короткий
      const total = groups.reduce((n, g) => n + ((g.items || []).length), 0);
      const full = total <= 22 && R() < 0.8;
      let usedGroups = full ? groups : [];
      if (!full) {
        const order = groups.map((g, k) => k).sort(() => R() - 0.5);
        let n = 0;
        for (const k of order) { if (n >= 14 + Math.floor(R() * 8)) break; usedGroups.push(groups[k]); n += (groups[k].items || []).length; }
        usedGroups = groups.filter(g => usedGroups.includes(g));
      }
      const state = {}, details = {}, photos = {};
      usedGroups.forEach(g => (g.items || []).forEach(it => {
        const r = R();
        const st = r < 0.78 ? 'ok' : r < 0.95 ? 'fail' : r < 0.97 ? 'fail_escalated' : 'na';
        state[it.id] = st;
        if (st === 'fail' || st === 'fail_escalated') {
          details[it.id] = { comment: 'Замечание по пункту ' + it.id, causeCode: CAUSES[Math.floor(R() * CAUSES.length)], fact: '', tolerance: '' };
          if (R() < 0.35) photos[it.id] = ['https://api.rbi-q.ru/storage/v1/object/public/stand/' + i + '_' + it.id + '.jpg'];
        }
      }));
      const metrics = (typeof getProductMetrics === 'function' ? getProductMetrics(state, usedGroups) : null) || {};
      const date = new Date(now - Math.floor(R() * o.days * 86400e3)).toISOString();
      const project = PROJECTS[i % PROJECTS.length];
      const contractor = CONTRACTORS[Math.floor(R() * CONTRACTORS.length)];
      out.push({
        id: String(1700000000000 + i * 13),
        date,
        projectName: project, project_canonical_key: project, project_display_name: project, projectId: '',
        inspectorName: INSPECTORS[Math.floor(R() * INSPECTORS.length)],
        contractorName: contractor, contractor_name: contractor, contractor_raw_name: contractor, contractor_canonical_key: contractor.toLowerCase(), contractorId: '',
        templateKey: 'sys_' + key, templateTitle: tpl.title || key,
        checklistSnapshot: snapshot(groups), // как audit.actions.js: весь текущий чек-лист, не только заполненное
        section: 'С' + (1 + (i % 4)), floor: String(1 + (i % 25)), room: '', location: 'Корпус ' + (1 + (i % 3)) + ' / этаж ' + (1 + (i % 25)),
        stageId: 0, stageName: full ? 'Полная проверка' : 'Частичная проверка', checkedStagesInfo: usedGroups.map(g => g.group || g.title),
        isCompleted: full, state, details, photos, metrics, planPin: null,
        inspection_type: 'rbi_audit', source: 'cloud', syncStatus: 'synced', sync_status: 'synced', syncBlockReason: '',
        createdAt: date, updatedAt: date
      });
    }
    if (o.clear) {
      const all = (await dbGetAll('app_history')) || [];
      for (const r of all) await dbDelete('app_history', r.id);
    }
    for (let i = 0; i < out.length; i += 500) await dbPutBatch('app_history', out.slice(i, i + 500));
    window.contractorArray = ((await dbGetAll('app_history')) || []).filter(x => !x._deleted);
    return { seeded: out.length, total: window.contractorArray.length };
  };
})();
