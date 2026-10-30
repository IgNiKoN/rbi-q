// Макет «предлагаю» P2-0070: вкладка «Кто что может» в «Сотрудники и доступ» (рядом с «Роли и права»). Только чтение:
// объект и место (весь объект / корпус / секция) → люди × действия по модулям на едином механизме прав (Стройконтроль,
// План/Факт). Колонки — группы и подписи каталога сервера (не код); люди — по участию (вся компания, объект, место и выше;
// участие на часть внутри выбранного места — с пометкой «только …»). Данные — window.__P70_DATA (data.mjs). Подключается в
// оболочку на стенде (shots.mjs); настоящий экран (этап 5) берёт то же одним запросом к серверу.
(function () {
  var MODS = ['construction', 'planfact'];
  var SKIP = { 'Прежний доступ': 1 };
  var css = '\
  .wk{display:flex;flex-direction:column;gap:12px;min-width:0}\
  .wk-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:8px 12px;max-width:760px}\
  .wk-bar label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--text-muted)}\
  .wk-bar select{width:100%}\
  .wk-mods{display:flex;flex-wrap:wrap;gap:6px}\
  .wk-note{font-size:13px;color:var(--text-muted);max-width:80ch}\
  .wk-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow-card);overflow:hidden}\
  .wk-scroll{overflow-x:auto}\
  .wk-t{border-collapse:separate;border-spacing:0;font-size:13px;width:100%}\
  .wk-t th,.wk-t td{padding:6px 0;border-bottom:1px solid var(--card-border);text-align:center;vertical-align:middle}\
  .wk-t thead tr:first-child th{font-size:12px;font-weight:700;color:var(--text-main);border-bottom:0;padding:10px 4px 2px}\
  .wk-t thead tr+tr th{font-size:11.5px;font-weight:500;color:var(--text-muted);vertical-align:bottom;height:200px;width:34px;min-width:34px;padding:6px 0}\
  .wk-v{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;display:inline-block;max-height:195px;overflow:hidden;text-overflow:ellipsis}\
  .wk-t .wk-g{border-left:1px solid var(--card-border)}\
  .wk-t .wk-who{text-align:left;width:230px;min-width:200px;padding:8px 10px 8px 14px}\
  .wk-who b{display:block;font-size:14px;font-weight:600;color:var(--text-main)}\
  .wk-who span{display:block;font-size:12px;color:var(--text-muted)}\
  .wk-yes{display:inline-flex;width:20px;height:20px;border-radius:7px;align-items:center;justify-content:center;background:var(--accent,var(--primary));color:#fff;font-size:12px;font-weight:700}\
  .wk-no{color:var(--text-muted);opacity:.45}\
  .wk-tag{display:inline-block;margin-top:3px;font-size:11.5px;padding:1px 6px;border-radius:6px;background:var(--hover-bg);color:var(--text-main)}\
  .wk-list{display:none;flex-direction:column;gap:10px}\
  .wk-p{background:var(--card-bg);border:1px solid var(--card-border);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px}\
  .wk-p b{font-size:15px}.wk-p .m{font-size:12.5px;color:var(--text-muted)}\
  .wk-p .g{display:flex;flex-direction:column;gap:5px}.wk-p .g i{font-style:normal;font-size:12px;font-weight:600;color:var(--text-muted)}\
  .wk-chips{display:flex;flex-wrap:wrap;gap:6px}\
  .wk-chip{font-size:12.5px;padding:5px 8px;border-radius:8px;border:1px solid var(--card-border);line-height:1.2}\
  .wk-chip.on{background:var(--accent,var(--primary));border-color:var(--accent,var(--primary));color:#fff}\
  .wk-chip.off{color:var(--text-muted);opacity:.6}\
  .wk-empty{padding:16px;color:var(--text-muted);font-size:13px}\
  @media (max-width:760px){.wk-card{display:none}.wk-list{display:flex}}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function groupsOf(d, mod) {
    var gs = [], by = {};
    d.catalog.slice().sort(function (a, b) { return a.sort - b.sort; }).forEach(function (c) {
      if (c.module !== mod || SKIP[c.group_name]) return;
      if (!by[c.group_name]) { by[c.group_name] = { title: c.group_name, items: [] }; gs.push(by[c.group_name]); }
      by[c.group_name].items.push(c);
    });
    return gs;
  }
  function parents(d) { var p = {}; d.places.forEach(function (x) { p[x.id] = x.parent_id; }); return p; }
  function upOf(par, id) { var out = []; while (id) { out.push(id); id = par[id]; } return out; }
  function rows(d, proj, place, mod) {
    var acts = {}, area = {}, par = parents(d);
    d.roles.forEach(function (r) { acts[r.id] = r.actions || []; });
    d.catalog.forEach(function (c) { area[c.action] = c.area_scoped; });
    var people = {};
    d.members.forEach(function (m) {
      if (!m.is_active || m.disabled_at || !m.role_id) return;
      if (m.project_id && m.project_id !== proj.id) return;
      var partial = '';
      if (m.location_id && place) {
        var up = upOf(par, place), down = upOf(par, m.location_id);
        if (up.indexOf(m.location_id) < 0) { if (down.indexOf(place) < 0) return; partial = m.location_path; }
      } else if (m.location_id) partial = m.location_path;
      var a = (acts[m.role_id] || []).filter(function (x) { return x.indexOf(mod + '.') === 0 && (!m.location_id || area[x]); });
      if (!a.length) return;
      var p = people[m.user_id] || (people[m.user_id] = { name: m.full_name || m.email, roles: [], where: [], firm: '', acts: {} });
      p.roles.push(m.role_name);
      p.where.push(partial ? 'только ' + partial : m.project_id ? 'весь объект' : 'вся компания');
      if ((acts[m.role_id] || []).indexOf('quality.scope.contractor') >= 0) p.firm = m.counterparty_name || 'своя фирма';
      a.forEach(function (x) { p.acts[x] = 1; });
    });
    return Object.keys(people).map(function (k) { return people[k]; }).sort(function (x, y) { return x.name.localeCompare(y.name, 'ru'); });
  }
  var st = { proj: 0, place: '', mod: '' };
  function render(host, d) {
    var proj = d.projects[st.proj];
    var mods = MODS.filter(function (m) { return d.modules.indexOf(m) >= 0 && groupsOf(d, m).length; });
    if (!st.mod || mods.indexOf(st.mod) < 0) st.mod = mods[0];
    var gs = groupsOf(d, st.mod), list = rows(d, proj, st.place, st.mod);
    var mname = (d.catalog.find(function (c) { return c.module === st.mod; }) || {}).module_name;
    var places = d.places.filter(function (x) { return x.project_id === proj.id; });
    var head1 = '<tr><th class="wk-who" rowspan="2" style="vertical-align:bottom;font-size:12px;color:var(--text-muted);font-weight:600">Сотрудник · роль · где</th>'
      + gs.map(function (g) { return '<th class="wk-g" colspan="' + g.items.length + '">' + esc(g.title) + '</th>'; }).join('') + '</tr>';
    var head2 = '<tr>' + gs.map(function (g) { return g.items.map(function (c, i) {
      return '<th' + (i === 0 ? ' class="wk-g"' : '') + ' title="' + esc(c.label) + '"><span class="wk-v">' + esc(c.label) + '</span></th>'; }).join(''); }).join('') + '</tr>';
    var who = function (p) { return '<b>' + esc(p.name) + '</b><span>' + esc(p.roles.join(', ')) + ' · ' + esc(p.where.join(', ')) + '</span>'
      + (p.firm ? '<span class="wk-tag">только записи фирмы ' + esc(p.firm) + '</span>' : ''); };
    var body = list.map(function (p) {
      return '<tr><td class="wk-who">' + who(p) + '</td>' + gs.map(function (g) { return g.items.map(function (c, i) {
        return '<td' + (i === 0 ? ' class="wk-g"' : '') + '>' + (p.acts[c.action] ? '<span class="wk-yes" title="' + esc(c.label) + '">✓</span>' : '<span class="wk-no">—</span>') + '</td>'; }).join(''); }).join('') + '</tr>';
    }).join('');
    var cards = list.map(function (p) {
      return '<div class="wk-p"><div class="wk-who">' + who(p) + '</div>' + gs.map(function (g) {
        return '<div class="g"><i>' + esc(g.title) + '</i><div class="wk-chips">' + g.items.map(function (c) {
          return '<span class="wk-chip ' + (p.acts[c.action] ? 'on' : 'off') + '">' + (p.acts[c.action] ? '✓ ' : '') + esc(c.label) + '</span>'; }).join('') + '</div></div>'; }).join('') + '</div>';
    }).join('');
    host.innerHTML = '<style>' + css + '</style><div class="wk" data-testid="co-who">'
      + '<div class="wk-bar"><label>Объект<select class="co-select" data-k="proj">' + d.projects.map(function (x, i) {
        return '<option value="' + i + '"' + (i === st.proj ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>'
      + '<label>Место<select class="co-select" data-k="place"><option value="">Весь объект</option>' + places.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === st.place ? ' selected' : '') + '>' + (x.depth > 1 ? '— ' : '') + esc(x.name) + '</option>'; }).join('') + '</select></label></div>'
      + '<div class="wk-mods co-tabs" role="tablist">' + mods.map(function (m) {
        var n = (d.catalog.find(function (c) { return c.module === m; }) || {}).module_name;
        return '<button type="button" class="co-tab' + (m === st.mod ? ' co-tab--active' : '') + '" data-mod="' + m + '">' + esc(n) + '</button>'; }).join('') + '</div>'
      + '<div class="wk-note">Только просмотр: кто здесь что может в модуле «' + esc(mname) + '» — по галочкам роли («Роли и права») и участию («Сотрудники»: вся компания, объект, корпус, секция). Изменить — там же. Сервер проверяет то же самое.</div>'
      + (list.length ? '<div class="wk-card"><div class="wk-scroll"><table class="wk-t"><thead>' + head1 + head2 + '</thead><tbody>' + body + '</tbody></table></div></div>'
        + '<div class="wk-list">' + cards + '</div>' : '<div class="wk-card wk-empty" style="display:block">Здесь никто не может ничего в этом модуле.</div>') + '</div>';
    host.querySelector('[data-k=proj]').addEventListener('change', function (e) { st.proj = +e.target.value; st.place = ''; render(host, d); });
    host.querySelector('[data-k=place]').addEventListener('change', function (e) { st.place = e.target.value; render(host, d); });
    host.querySelectorAll('[data-mod]').forEach(function (b) { b.addEventListener('click', function () { st.mod = b.getAttribute('data-mod'); render(host, d); }); });
  }
  window.__P70_SET = function (o) { Object.assign(st, o); var h = document.querySelector('[data-testid=co-who]'); if (h) render(h.parentNode, window.__P70_DATA); };
  function mount() {
    var tabs = document.querySelector('[data-testid=co-tabs]');
    if (!tabs) return;
    if (!tabs.querySelector('[data-tab=who]')) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'co-tab'; b.setAttribute('data-tab', 'who'); b.textContent = 'Кто что может';
      b.addEventListener('click', function () { window.__P70_WHO = true; });
      tabs.querySelectorAll('.co-tab').forEach(function (t) { if (t !== b) t.addEventListener('click', function () { window.__P70_WHO = false; }); });
      tabs.appendChild(b);
    }
    if (window.__P70_WHO) {
      tabs.querySelectorAll(':scope > .co-tab').forEach(function (t) { t.classList.toggle('co-tab--active', t.getAttribute('data-tab') === 'who'); });
      var root = tabs.closest('.co-root');
      var body = root && root.lastElementChild;
      if (body && !body.querySelector('[data-testid=co-who]')) render(body, window.__P70_DATA);
    }
  }
  setInterval(mount, 300);
})();
