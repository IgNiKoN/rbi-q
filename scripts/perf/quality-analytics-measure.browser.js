// P2-0024 — замер Аналитики Качества (стенд, без сети).
// Запуск: открыть Качество 2.0 → Аналитика → консоль → вставить файл → await rbiMeasureAnalytics();
// память и объём базы — await rbiMeasureMemoryAndDb(); снимок цифр — await rbiAnalyticsDigest(результат замера).
// Меряет для периода «Всё время» и каждой подвкладки: самое долгое подвисание главного потока (мс),
// всю работу (сумма задержек > 4 мс), число DOM-узлов на вкладке и «снимок цифр» (все числа видимой секции)
// для сравнения «до = после». Подвисание ловится пингом MessageChannel (видны задачи короче 50 мс).
(function () {
  function lagMonitor() {
    const ch = new MessageChannel();
    let last = performance.now(), max = 0, total = 0, on = true;
    ch.port1.onmessage = () => {
      const now = performance.now();
      const gap = now - last;
      if (gap > max) max = gap;
      if (gap > 4) total += gap;
      last = now;
      if (on) ch.port2.postMessage(0);
    };
    ch.port2.postMessage(0);
    return { stop: () => { on = false; return { max: Math.round(max), total: Math.round(total) }; } };
  }
  const idle = (ms) => new Promise(r => setTimeout(r, ms));
  async function settle(quietMs = 700, capMs = 8000) {
    // ждём, пока не будет задач длиннее 16 мс в течение quietMs
    const t0 = performance.now();
    let lastBusy = performance.now();
    await new Promise(res => {
      let prev = performance.now();
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        const now = performance.now();
        if (now - prev > 16) lastBusy = now;
        prev = now;
        if (now - lastBusy > quietMs || now - t0 > capMs) res(); else ch.port2.postMessage(0);
      };
      ch.port2.postMessage(0);
    });
  }
  function numbers(el) {
    if (!el) return '';
    return (el.innerText || '').replace(/\s+/g, ' ').match(/-?\d+(?:[.,]\d+)?%?/g)?.join(' ') || '';
  }
  async function step(label, fn, sectionId) {
    await settle();
    const m = lagMonitor();
    fn();
    await settle();
    const r = m.stop();
    const tab = document.getElementById('tab-analytics');
    const sec = sectionId ? document.getElementById(sectionId) : null;
    return { label, maxMs: r.max, workMs: r.total, nodes: tab ? tab.getElementsByTagName('*').length : 0, nums: numbers(sec) };
  }
  /** Память JS (минимум за ≈ 22 с — браузер успевает убрать мусор; performance.memory — Chrome) и объём истории в базе (МБ JSON). */
  window.rbiMeasureMemoryAndDb = async function (opts) {
    const n = (opts && opts.samples) || 15;
    const mb = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : NaN);
    const s = [];
    for (let i = 0; i < n; i++) { s.push(mb()); await idle(1500); }
    const hist = (await dbGetAll('app_history')) || [];
    let snaps = [];
    try { snaps = (await dbGetAll('checklist_snapshots')) || []; } catch (_e) { snaps = []; }
    return {
      history: hist.length,
      heapMB: +Math.min(...s).toFixed(1),
      dbMB: +((JSON.stringify(hist).length + JSON.stringify(snaps).length) / 1e6).toFixed(2),
      domNodes: document.getElementsByTagName('*').length
    };
  };

  /**
   * «Снимок цифр» для сверки «до = после» (после rbiMeasureAnalytics, период «Всё время»): хэши чисел
   * «Подрядчиков» и «Сводки», заголовков объектов «Истории», автотекста «Аналитики качества», тепловой карты
   * и данных графиков «Динамика»/«Причины». Одинаковые данные на двух версиях → одинаковые хэши.
   */
  window.rbiAnalyticsDigest = async function (measured) {
    const h = (str) => { let x = 0; for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) | 0; return x; };
    const S = (measured && measured.summary) || [];
    const nums = (label) => { const r = S.find(x => x.label === label); return r ? r.nums : ''; };
    const out = { contractors: h(nums('sub-contractors')), onepager: h(nums('sub-onepager')) };
    out.heads = h([...document.querySelectorAll('#history-list [data-hist-project]')].map(c => [
      c.getAttribute('data-hist-project'), c.querySelector('[data-hist-count-obj]')?.textContent || '',
      c.querySelector('[data-hist-urk-obj]')?.textContent || '', c.querySelector('[data-hist-contractor-count]')?.textContent || ''
    ].join(':')).join('|'));
    window.switchAnalyticsSubTab('sub-onepager'); await idle(2000);
    out.pdca = h((document.getElementById('hidden_pdca_text') || {}).value || '');
    const hd = document.getElementById('op-heatmap-details')
      || [...document.querySelectorAll('#sub-onepager details')].find(d => /тепловая/i.test(d.querySelector('summary').textContent));
    if (hd) { hd.open = true; await idle(300); out.heat = h((hd.querySelector('table') || hd).textContent); }
    window.switchAnalyticsSubTab('sub-contractors'); await idle(2000);
    [...document.querySelectorAll('#sub-contractors details')].filter(d => /динамика|причины/i.test(d.querySelector('summary').textContent)).forEach(d => { d.open = true; });
    await idle(800);
    const ch = (window.AnalyticsState && window.AnalyticsState.chartInstances) || {};
    out.charts = ['chart_eng_trend_contrs', 'chart_eng_causes', 'chart_eng_compare']
      .map(k => ch[k] ? h(JSON.stringify(ch[k].data.labels) + JSON.stringify(ch[k].data.datasets.map(d => d.data))) : 'none').join(',');
    out.period = (document.getElementById('global-filter-period') || {}).value;
    return out;
  };

  window.rbiMeasureAnalytics = async function (opts) {
    // Скрытая вкладка/панель не даёт кадров (requestAnimationFrame молчит) — подменяем на таймер 16 мс.
    if (!window.__rbiRafShim) { window.__rbiRafShim = true; window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16); }
    const o = Object.assign({ tabs: ['sub-contractors', 'sub-onepager', 'sub-history'], rounds: 4 }, opts || {});
    const sel = document.getElementById('global-filter-period');
    const setPeriod = (v) => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); };
    const raw = [];
    for (let r = 0; r < o.rounds; r++) {
      // каждый круг: «30 дней» → «Всё время» (кэш вкладок сброшен) → обход вкладок
      window.switchAnalyticsSubTab('sub-contractors');
      await settle();
      if (sel) { setPeriod('D30'); await idle(600); await settle(); }
      if (sel) raw.push({ round: r, ...(await step('period D30→ALL', () => setPeriod('ALL'), 'sub-contractors')) });
      for (const t of o.tabs) raw.push({ round: r, ...(await step(t, () => window.switchAnalyticsSubTab(t), t)) });
    }
    // итог: медиана по кругам без первого (прогрев)
    const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
    const labels = [...new Set(raw.map(x => x.label))];
    const summary = labels.map(label => {
      const rs = raw.filter(x => x.label === label && (o.rounds < 2 || x.round > 0));
      const sec = document.getElementById(label.startsWith('period') ? 'sub-contractors' : label);
      return { label, maxMs: med(rs.map(x => x.maxMs)), maxMsWorst: Math.max(...rs.map(x => x.maxMs)), workMs: med(rs.map(x => x.workMs)),
        tabNodes: rs[rs.length - 1].nodes, sectionNodes: sec ? sec.getElementsByTagName('*').length : 0, nums: rs[rs.length - 1].nums };
    });
    return { summary, raw: raw.map(({ nums, ...x }) => x) };
  };
})();
