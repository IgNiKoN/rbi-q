const ConstructionV2Manifest = {
  id: "construction-v2",
  role: "module",
  title: "Стройконтроль (новый)",
  icon: "hard-hat",
  version: "0.1.0",
  status: "active",
  entry: "./index.js",
  menu: { section: "construction", label: "СК (новый)", order: 11 },
  company: { enabledByDefault: true },
  routes: ["/construction-v2", "/construction-v2/:subTab"],
  defaultRoute: "/construction-v2"
};
const DEFECT_CATEGORIES_V2 = ["B1", "B2", "B3"];
function isContractorRole() {
  var _a, _b, _c;
  const perms = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.permissions;
  return (((_c = perms == null ? void 0 : perms.getCurrentRole) == null ? void 0 : _c.call(perms)) || "") === "contractor";
}
function resolveMyContractorId() {
  var _a, _b, _c, _d, _e;
  const perms = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.permissions;
  const name = String(((_c = perms == null ? void 0 : perms.getAssignedContractor) == null ? void 0 : _c.call(perms)) || "").trim();
  if (!name) return null;
  const contractors = (_e = (_d = window.RBI) == null ? void 0 : _d.services) == null ? void 0 : _e.contractors;
  if (!(contractors == null ? void 0 : contractors.resolveIdFromNormalized)) return null;
  const id = String(
    contractors.resolveIdFromNormalized({
      display_name: name,
      contractor_name: name
    }) || ""
  ).trim();
  if (!id || id === "pending") return null;
  return id;
}
function filterDefectsForRole(list) {
  if (!isContractorRole()) return list;
  const myId = resolveMyContractorId();
  if (!myId) return [];
  return (list || []).filter((d) => String(d.contractorId || "").trim() === myId);
}
function filterAcceptancesForRole(list) {
  if (!isContractorRole()) return list;
  const myId = resolveMyContractorId();
  if (!myId) return [];
  return (list || []).filter((a) => String(a.contractorId || "").trim() === myId);
}
function _knowledgeSvc() {
  var _a, _b;
  return (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.knowledge;
}
function _helpButtonsHtml() {
  return `<div class="flex gap-2 mt-2" data-c2-help-actions>
      <button type="button" data-c2-item-help
        class="flex-1 px-2 py-1.5 rounded-lg text-rbi-caption font-black uppercase tracking-wide bg-brand-soft text-brand border border-brand-soft">
        ${_escape$h(_t$k("construction.form.btn_help", "Справка"))}
      </button>
      <button type="button" data-c2-item-norm
        class="flex-1 px-2 py-1.5 rounded-lg text-rbi-caption font-black uppercase tracking-wide bg-slate-100 text-ink border border-surface">
        ${_escape$h(_t$k("construction.form.btn_norm", "Норматив"))}
      </button>
    </div>`;
}
function _openDefectItemHelp(panel, event) {
  var _a, _b, _c, _d, _e;
  const itemId = ((_b = (_a = panel.querySelector("[data-c2-item-id]")) == null ? void 0 : _a.value) == null ? void 0 : _b.trim()) || "";
  if (!itemId) {
    (_c = window.showToast) == null ? void 0 : _c.call(
      window,
      _t$k("construction.form.toast_select_item_help", "Выберите пункт чек-листа")
    );
    return;
  }
  const templateKey = ((_d = panel.querySelector("[data-c2-template]")) == null ? void 0 : _d.value) || "";
  const groups = _resolveTemplateGroups(templateKey);
  const helpCtx = { templateKey: templateKey || void 0, checklist: groups };
  const svc = _knowledgeSvc();
  if (svc && typeof svc.openItemHelp === "function") {
    svc.openItemHelp(itemId, event, helpCtx);
    return;
  }
  const openMenu = window.openItemHelpMenu;
  if (typeof openMenu === "function") {
    openMenu(itemId, event, helpCtx);
    return;
  }
  (_e = window.showToast) == null ? void 0 : _e.call(
    window,
    _t$k("construction.v2.acc.knowledge_unavailable", "База знаний недоступна")
  );
}
function _openDefectNorm(panel) {
  var _a, _b, _c, _d, _e, _f, _g;
  const templateKey = ((_a = panel.querySelector("[data-c2-template]")) == null ? void 0 : _a.value) || "";
  const itemId = ((_c = (_b = panel.querySelector("[data-c2-item-id]")) == null ? void 0 : _b.value) == null ? void 0 : _c.trim()) || "";
  const normText = ((_e = (_d = panel.querySelector("[data-c2-norm-text]")) == null ? void 0 : _d.textContent) == null ? void 0 : _e.trim()) || "";
  const flat = _flatItems(_resolveTemplateGroups(templateKey));
  const item = flat.find((i) => String(i.id) === String(itemId));
  const ndId = (item == null ? void 0 : item.ndId) ? String(item.ndId) : "";
  const svc = _knowledgeSvc();
  if (ndId && svc && typeof svc.openDocViewer === "function") {
    svc.openDocViewer(ndId);
    return;
  }
  if (!normText) {
    (_f = window.showToast) == null ? void 0 : _f.call(
      window,
      _t$k("construction.form.toast_no_norm", "Норматив не указан")
    );
    return;
  }
  if (svc && typeof svc.findAndOpenND === "function") {
    svc.findAndOpenND(normText);
    return;
  }
  const findNd = window.findAndOpenND;
  if (typeof findNd === "function") {
    findNd(normText);
    return;
  }
  (_g = window.showToast) == null ? void 0 : _g.call(
    window,
    _t$k("construction.v2.acc.knowledge_unavailable", "База знаний недоступна")
  );
}
function _bindHelpActions(panel) {
  var _a, _b;
  (_a = panel.querySelector("[data-c2-item-help]")) == null ? void 0 : _a.addEventListener("click", (ev) => {
    _openDefectItemHelp(panel, ev);
  });
  (_b = panel.querySelector("[data-c2-item-norm]")) == null ? void 0 : _b.addEventListener("click", () => {
    _openDefectNorm(panel);
  });
}
function _t$k(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$h(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _defaultDeadline$1() {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + 14);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function _stripHtml$3(html) {
  return String(html || "").replace(/<br\s*\/?>/gi, " ").replace(/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
function _setNormDisplay(el, raw) {
  if (!el) return;
  const s = String(raw || "");
  if (/<[a-z][\s\S]*>/i.test(s)) el.innerHTML = s;
  else el.textContent = s;
}
function _autoDescription(name, normRaw) {
  let auto = _t$k("construction.form.violation_prefix", "Нарушение: {name}.", { name });
  const cleanNorm = _stripHtml$3(normRaw);
  const noNorm = _t$k("construction.form.no_norm", "Без норматива");
  if (cleanNorm && cleanNorm !== noNorm) {
    auto += _t$k("construction.form.requirements_prefix", " Требования: {norm}", { norm: cleanNorm });
  }
  return auto;
}
function _contractors() {
  var _a, _b;
  const svc = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.contractors;
  const rows = typeof (svc == null ? void 0 : svc.list) === "function" ? svc.list() : [];
  return (rows || []).filter((r) => r && r.id).map((r) => ({
    id: String(r.id),
    label: String(r.display_name || r.displayName || r.id)
  })).sort((a, b) => a.label.localeCompare(b.label, "ru"));
}
function _sysTemplates$2() {
  return window.SYSTEM_TEMPLATES || {};
}
function _userTemplates$2() {
  return window.userTemplates || {};
}
function _flatItems(groups) {
  const items = [];
  (groups || []).forEach((g) => {
    if (g == null ? void 0 : g.items) items.push(...g.items);
  });
  return items;
}
function _resolveTemplateGroups(tmplKey) {
  var _a, _b;
  if (!tmplKey) return [];
  const type = tmplKey.split("_")[0];
  const key = tmplKey.replace(type + "_", "");
  if (type === "sys") return ((_a = _sysTemplates$2()[key]) == null ? void 0 : _a.groups) || [];
  if (type === "user") return ((_b = _userTemplates$2()[key]) == null ? void 0 : _b.groups) || [];
  return [];
}
function _catLabel(c) {
  if (c === "B1" || c === "minor") return _t$k("construction.form.cat_b1", "B1 (Мелкий)");
  if (c === "B3" || c === "critical") return _t$k("construction.form.cat_b3", "B3 (Критика)");
  return _t$k("construction.form.cat_b2", "B2 (Значимый)");
}
function _statusLabel$5(s) {
  const map = {
    issued: ["construction.status.issued", "Выдано"],
    in_progress: ["construction.status.in_progress", "В работе"],
    fixed: ["construction.form.status_fixed", "Устранено"],
    closed: ["construction.status.closed", "Закрыто"],
    rejected: ["construction.status.rejected", "Отклонено"],
    open: ["construction.status.issued", "Выдано"],
    cancelled: ["construction.status.rejected", "Отклонено"]
  };
  const entry = map[s];
  return entry ? _t$k(entry[0], entry[1]) : s;
}
function _deadlineInputValue(v) {
  if (v == null || v === "") return "";
  const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}
function _roleInfo$1() {
  var _a, _b, _c, _d;
  const perms = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.permissions;
  const role = ((_c = perms == null ? void 0 : perms.getCurrentRole) == null ? void 0 : _c.call(perms)) || "guest";
  const isEngineer = ((_d = perms == null ? void 0 : perms.isEngineerOrAdmin) == null ? void 0 : _d.call(perms)) ?? ["engineer", "manager", "deputy_manager", "admin"].includes(role);
  const isContractor = role === "contractor";
  return { role, isEngineer, isContractor };
}
function _photoSrc(ref) {
  if (!ref) return "";
  const pm = window.PhotoManager;
  if (pm == null ? void 0 : pm.getDisplaySrc) return pm.getDisplaySrc(ref) || ref;
  if (pm == null ? void 0 : pm.getSrc) return pm.getSrc(ref) || ref;
  const g = window.getPhotoThumbSrc || window.getPhotoSrc;
  return (typeof g === "function" ? g(ref) : null) || ref;
}
function _openPhoto(ref) {
  const fn = window.openPhotoViewer;
  if (typeof fn === "function") fn(ref);
}
async function _fileToDataUrl$1(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error(_t$k("construction.form.file_read_error", "Не удалось прочитать файл")));
    r.readAsDataURL(file);
  });
}
async function _savePhotoFiles(files) {
  const list = Array.from(files || []).filter((f) => f && f.type && f.type.startsWith("image/"));
  if (!list.length) return [];
  const pm = window.PhotoManager;
  const out = [];
  for (const file of list) {
    const dataUrl = await _fileToDataUrl$1(file);
    if (!dataUrl.startsWith("data:")) continue;
    if (pm == null ? void 0 : pm.saveLocal) {
      const id = await pm.saveLocal(dataUrl, "cdef", { entityType: "construction_defect_v2" });
      if (id) out.push(id);
    } else {
      out.push(dataUrl);
    }
  }
  return out;
}
function _ensureOverlay() {
  let el = document.getElementById("c2-defect-modal");
  if (el) {
    el.style.zIndex = "1200";
    return el;
  }
  el = document.createElement("div");
  el.id = "c2-defect-modal";
  el.className = "fixed inset-0 hidden items-center justify-center bg-black/40 p-3";
  el.style.zIndex = "1200";
  el.innerHTML = `<div class="w-full max-w-md max-h-[92vh] overflow-y-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-xl p-4" data-c2-defect-panel></div>`;
  document.body.appendChild(el);
  return el;
}
function closeDefectForm() {
  const el = document.getElementById("c2-defect-modal");
  if (!el) return;
  el.classList.add("hidden");
  el.classList.remove("flex");
}
function _templateOptionsHtml(selected) {
  let html = `<option value="">${_escape$h(_t$k("construction.form.work_type_select", "— вид работ —"))}</option>`;
  const st = _sysTemplates$2();
  Object.keys(st).sort().forEach((k) => {
    const sel = selected === `sys_${k}` ? " selected" : "";
    html += `<option value="sys_${_escape$h(k)}"${sel}>[СИС] ${_escape$h(st[k].title || k)}</option>`;
  });
  const ut = _userTemplates$2();
  Object.keys(ut).sort().forEach((k) => {
    const sel = selected === `user_${k}` ? " selected" : "";
    html += `<option value="user_${_escape$h(k)}"${sel}>[МОЙ] ${_escape$h(ut[k].title || k)}</option>`;
  });
  return html;
}
function _contractorOptionsHtml(selected) {
  const opts = _contractors();
  return `<option value="">${_escape$h(_t$k("construction.form.no_contractor", "— без подрядчика —"))}</option>` + opts.map((o) => {
    const sel = selected === o.id ? " selected" : "";
    return `<option value="${_escape$h(o.id)}"${sel}>${_escape$h(o.label)}</option>`;
  }).join("");
}
function _renderGallery(photos) {
  if (!photos.length) {
    return `<div class="text-rbi-caption text-muted mb-2" data-c2-photo-empty>${_escape$h(_t$k("construction.form.no_photos", "Нет фото"))}</div>`;
  }
  return `<div class="grid grid-cols-3 gap-2 mb-2" data-c2-photo-grid>
    ${photos.map(
    (p, i) => `<div class="relative aspect-square rounded-xl overflow-hidden border border-surface" data-c2-photo-idx="${i}">
      <img src="${_escape$h(_photoSrc(p))}" alt="" class="w-full h-full object-cover cursor-pointer" data-c2-photo-view="${_escape$h(p)}" />
      <button type="button" data-c2-photo-remove="${i}"
        class="absolute top-1 right-1 w-6 h-6 rounded-full bg-danger text-white text-rbi-label font-black">✕</button>
    </div>`
  ).join("")}
  </div>`;
}
function _bindGallery(panel, photosRef, onChange) {
  const refresh = () => {
    const host = panel.querySelector("[data-c2-photo-host]");
    if (host) host.innerHTML = _renderGallery(photosRef.current);
    _bindGallery(panel, photosRef, onChange);
  };
  panel.querySelectorAll("[data-c2-photo-view]").forEach((el) => {
    el.addEventListener("click", () => {
      const ref = el.getAttribute("data-c2-photo-view") || "";
      if (ref) _openPhoto(ref);
    });
  });
  panel.querySelectorAll("[data-c2-photo-remove]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      const idx = Number(el.getAttribute("data-c2-photo-remove"));
      if (!Number.isFinite(idx)) return;
      photosRef.current = photosRef.current.filter((_, i) => i !== idx);
      refresh();
      onChange();
    });
  });
  const input = panel.querySelector("[data-c2-photo-input]");
  if (input && !input._c2Bound) {
    input._c2Bound = true;
    input.addEventListener("change", async () => {
      var _a;
      try {
        const added = await _savePhotoFiles(input.files || []);
        if (added.length) {
          photosRef.current = photosRef.current.concat(added);
          refresh();
          onChange();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        (_a = window.showToast) == null ? void 0 : _a.call(window, "❌ " + msg);
      } finally {
        input.value = "";
      }
    });
  }
}
function _bindItemSearch(panel) {
  const search = panel.querySelector("[data-c2-item-search]");
  const dd = panel.querySelector("[data-c2-item-dd]");
  const tmpl = panel.querySelector("[data-c2-template]");
  const itemIdEl = panel.querySelector("[data-c2-item-id]");
  const itemNameEl = panel.querySelector("[data-c2-item-name]");
  const normBlock = panel.querySelector("[data-c2-norm-block]");
  const normText = panel.querySelector("[data-c2-norm-text]");
  const desc = panel.querySelector("[data-c2-defect-desc]");
  const cat = panel.querySelector("[data-c2-defect-cat]");
  const hideDd = () => dd == null ? void 0 : dd.classList.add("hidden");
  tmpl == null ? void 0 : tmpl.addEventListener("change", () => {
    if (itemIdEl) itemIdEl.value = "";
    if (itemNameEl) itemNameEl.value = "";
    if (search) search.value = "";
    normBlock == null ? void 0 : normBlock.classList.add("hidden");
    hideDd();
  });
  const runSearch = (query) => {
    if (!dd) return;
    const tmplKey = (tmpl == null ? void 0 : tmpl.value) || "";
    if (!tmplKey) {
      dd.innerHTML = `<div class="p-3 text-rbi-caption text-muted font-bold text-center">${_escape$h(_t$k("construction.form.select_work_first", "Сначала выберите вид работ"))}</div>`;
      dd.classList.remove("hidden");
      return;
    }
    const flat = _flatItems(_resolveTemplateGroups(tmplKey));
    const q = query.toLowerCase().trim();
    const matched = flat.filter(
      (i) => {
        var _a;
        return ((_a = i.n) == null ? void 0 : _a.toLowerCase().includes(q)) || i.t && i.t.toLowerCase().includes(q);
      }
    );
    if (!matched.length) {
      dd.innerHTML = `<div class="p-3 text-rbi-caption text-muted font-bold text-center">${_escape$h(_t$k("construction.form.search_empty", "Ничего не найдено"))}</div>`;
      dd.classList.remove("hidden");
      return;
    }
    dd.innerHTML = matched.map((i) => {
      const w = Number(i.w) || 2;
      return `<button type="button" class="w-full text-left p-2 border-b border-slate-100 dark:border-slate-700 hover:bg-brand-soft"
          data-c2-pick-item data-id="${_escape$h(i.id)}" data-name="${_escape$h(i.n)}" data-w="${w}" data-norm="${_escape$h(i.t || "")}">
          <div class="text-rbi-label font-bold text-ink leading-tight">
            <span class="text-rbi-caption font-black text-white bg-slate-400 px-1 rounded mr-1">B${w}</span>${_escape$h(i.n)}
          </div>
        </button>`;
    }).join("");
    dd.classList.remove("hidden");
    dd.querySelectorAll("[data-c2-pick-item]").forEach((btn) => {
      btn.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        const el = btn;
        const id = el.getAttribute("data-id") || "";
        const name = el.getAttribute("data-name") || "";
        const w = Number(el.getAttribute("data-w") || 2);
        const norm = el.getAttribute("data-norm") || "";
        if (itemIdEl) itemIdEl.value = id;
        if (itemNameEl) itemNameEl.value = name;
        if (search) search.value = name;
        if (normBlock) {
          _setNormDisplay(normText, norm || "");
          normBlock.classList.remove("hidden");
        }
        if (desc) desc.value = _autoDescription(name, norm || "");
        if (cat) {
          if (w === 1) cat.value = "B1";
          else if (w === 3) cat.value = "B3";
          else cat.value = "B2";
        }
        hideDd();
      });
    });
  };
  search == null ? void 0 : search.addEventListener("input", () => runSearch(search.value));
  search == null ? void 0 : search.addEventListener("focus", () => runSearch(search.value));
  search == null ? void 0 : search.addEventListener("blur", () => setTimeout(hideDd, 150));
}
function _readCommonFields(panel) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const description = ((_b = (_a = panel.querySelector("[data-c2-defect-desc]")) == null ? void 0 : _a.value) == null ? void 0 : _b.trim()) || "";
  const category = ((_c = panel.querySelector("[data-c2-defect-cat]")) == null ? void 0 : _c.value) || "B2";
  const contractorId = ((_d = panel.querySelector("[data-c2-defect-contractor]")) == null ? void 0 : _d.value) || "";
  const deadlineRaw = ((_e = panel.querySelector("[data-c2-defect-deadline]")) == null ? void 0 : _e.value) || "";
  const template_key = ((_f = panel.querySelector("[data-c2-template]")) == null ? void 0 : _f.value) || "";
  const item_id = ((_g = panel.querySelector("[data-c2-item-id]")) == null ? void 0 : _g.value) || "";
  const item_name = ((_h = panel.querySelector("[data-c2-item-name]")) == null ? void 0 : _h.value) || ((_i = panel.querySelector("[data-c2-item-search]")) == null ? void 0 : _i.value) || "";
  const normEl = panel.querySelector("[data-c2-norm-text]");
  const norm_text = _stripHtml$3((normEl == null ? void 0 : normEl.textContent) || (normEl == null ? void 0 : normEl.innerHTML) || "");
  return {
    description: _stripHtml$3(description) || description,
    category,
    contractorId: contractorId || null,
    deadline: deadlineRaw || null,
    template_key: template_key || null,
    item_id: item_id || null,
    item_name: item_name || null,
    norm_text: norm_text || null
  };
}
function _historyHtml(history) {
  const list = Array.isArray(history) ? history : [];
  if (!list.length) return "";
  const rows = [...list].reverse().map((h) => {
    const stName = _statusLabel$5(String(h.status || ""));
    let dDate = "";
    try {
      dDate = new Date(h.date).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      dDate = String(h.date || "");
    }
    const photos = Array.isArray(h.photos) && h.photos.length ? h.photos : h.photo ? [h.photo] : [];
    const photosHtml = photos.map(
      (p) => `<img src="${_escape$h(_photoSrc(String(p)))}" class="w-10 h-10 object-cover rounded border cursor-pointer mt-1" data-c2-photo-view="${_escape$h(String(p))}" alt="" />`
    ).join("");
    return `<div class="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800 text-rbi-caption">
      <div class="flex justify-between font-bold mb-1"><span class="text-brand">${_escape$h(stName)}</span><span class="text-muted">${_escape$h(dDate)}</span></div>
      <div class="text-ink">${_escape$h(h.user || "")}${h.comment ? ` — <i>${_escape$h(String(h.comment))}</i>` : ""}</div>
      <div class="flex gap-1 flex-wrap">${photosHtml}</div>
    </div>`;
  });
  return `<div class="w-full mt-3 pt-3 border-t border-surface flex flex-col gap-2 max-h-36 overflow-y-auto" data-c2-history>
    ${rows.join("")}
  </div>`;
}
function openCreateDefectForm(coords, onSave, onCancel, prefill) {
  var _a, _b;
  const root = _ensureOverlay();
  const panel = root.querySelector("[data-c2-defect-panel]");
  const photosRef = { current: [] };
  const catOpts = DEFECT_CATEGORIES_V2.map(
    (c) => `<option value="${c}"${c === "B2" ? " selected" : ""}>${_escape$h(_catLabel(c))}</option>`
  ).join("");
  const deadlineDefault = _defaultDeadline$1();
  const prefillNormRaw = (prefill == null ? void 0 : prefill.norm_text) || "";
  const prefillDesc = (prefill == null ? void 0 : prefill.description) != null && String(prefill.description).trim() ? _stripHtml$3(String(prefill.description)) : (prefill == null ? void 0 : prefill.item_name) ? _autoDescription(String(prefill.item_name), prefillNormRaw) : "";
  panel.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-rbi-body font-black uppercase tracking-tight">${_escape$h(_t$k("construction.form.new_defect", "Новое замечание"))}</h3>
      <button type="button" data-c2-defect-close class="text-muted text-rbi-label font-bold uppercase">${_escape$h(_t$k("construction.form.close", "Закрыть"))}</button>
    </div>
    <p class="text-rbi-caption text-muted mb-3">${_escape$h(_t$k("construction.form.coords", "Координаты: {x}% × {y}%", { x: coords.x.toFixed(1), y: coords.y.toFixed(1) }))}</p>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.work_type_label", "Вид работ (чек-лист) *"))}</label>
    <select data-c2-template class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3">
      ${_templateOptionsHtml(prefill == null ? void 0 : prefill.template_key)}
    </select>
    <div class="relative mb-3">
      <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.violation_label", "Нарушение *"))}</label>
      <input type="text" data-c2-item-search autocomplete="off" placeholder="${_escape$h(_t$k("construction.form.violation_placeholder", "Начните вводить нарушение..."))}"
        class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body"
        value="${_escape$h((prefill == null ? void 0 : prefill.item_name) || "")}" />
      <input type="hidden" data-c2-item-id value="${_escape$h((prefill == null ? void 0 : prefill.item_id) || "")}" />
      <input type="hidden" data-c2-item-name value="${_escape$h((prefill == null ? void 0 : prefill.item_name) || "")}" />
      <div data-c2-item-dd class="absolute top-[48px] left-0 right-0 bg-white dark:bg-slate-800 border border-surface shadow-2xl rounded-xl z-[150] hidden max-h-48 overflow-y-auto"></div>
    </div>
    <div data-c2-norm-block class="${prefillNormRaw || (prefill == null ? void 0 : prefill.item_id) ? "" : "hidden"} bg-slate-50 dark:bg-slate-900 border border-surface p-2.5 rounded-xl mb-3">
      <div class="text-rbi-caption font-black uppercase text-brand mb-1">${_escape$h(_t$k("construction.form.norm_ref", "Справочно (Норматив)"))}</div>
      <div data-c2-norm-text class="text-rbi-caption text-muted font-medium"></div>
      ${_helpButtonsHtml()}
    </div>
    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.category", "Категория"))}</label>
        <select data-c2-defect-cat class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body">
          ${catOpts}
        </select>
      </div>
      <div>
        <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.deadline", "Срок"))}</label>
        <input type="date" data-c2-defect-deadline value="${_escape$h(deadlineDefault)}"
          class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body" />
      </div>
    </div>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.contractor", "Подрядчик"))}</label>
    <select data-c2-defect-contractor class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3">
      ${_contractorOptionsHtml()}
    </select>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.description", "Описание"))}</label>
    <textarea data-c2-defect-desc rows="3"
      class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3">${_escape$h(prefillDesc)}</textarea>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.photos", "Фото"))}</label>
    <div data-c2-photo-host>${_renderGallery([])}</div>
    <input type="file" accept="image/*" multiple class="hidden" data-c2-photo-input />
    <button type="button" data-c2-photo-add
      class="w-full mb-4 bg-slate-50 dark:bg-slate-900 border border-dashed border-surface text-muted py-3 rounded-xl text-rbi-caption font-bold uppercase">
      + ${_escape$h(_t$k("construction.form.add_photo", "+ Добавить фото"))}
    </button>
    <div class="flex gap-2 justify-end">
      <button type="button" data-c2-defect-close class="px-3 py-2 rounded-xl text-rbi-label font-bold uppercase text-muted">${_escape$h(_t$k("construction.form.cancel", "Отмена"))}</button>
      <button type="button" data-c2-defect-save class="px-4 py-2 rounded-xl text-rbi-label font-black uppercase bg-brand text-white">${_escape$h(_t$k("construction.form.save", "Сохранить"))}</button>
    </div>`;
  root.classList.remove("hidden");
  root.classList.add("flex");
  if (prefillNormRaw) {
    _setNormDisplay(panel.querySelector("[data-c2-norm-text]"), prefillNormRaw);
  }
  _bindItemSearch(panel);
  _bindHelpActions(panel);
  _bindGallery(panel, photosRef, () => {
  });
  (_a = panel.querySelector("[data-c2-photo-add]")) == null ? void 0 : _a.addEventListener("click", () => {
    var _a2;
    (_a2 = panel.querySelector("[data-c2-photo-input]")) == null ? void 0 : _a2.click();
  });
  const cancel = () => {
    closeDefectForm();
    onCancel == null ? void 0 : onCancel();
  };
  panel.querySelectorAll("[data-c2-defect-close]").forEach((btn) => {
    btn.addEventListener("click", cancel);
  });
  root.onclick = (ev) => {
    if (ev.target === root) cancel();
  };
  (_b = panel.querySelector("[data-c2-defect-save]")) == null ? void 0 : _b.addEventListener("click", async () => {
    var _a2, _b2, _c, _d;
    const fields = _readCommonFields(panel);
    if (!fields.template_key) {
      (_a2 = window.showToast) == null ? void 0 : _a2.call(window, _t$k("construction.form.toast_select_work", "Выберите вид работ (чек-лист)"));
      return;
    }
    if (!fields.item_id && !fields.item_name) {
      (_b2 = window.showToast) == null ? void 0 : _b2.call(window, _t$k("construction.form.toast_select_violation", "Выберите нарушение из списка"));
      return;
    }
    const description = fields.description || fields.item_name || "";
    if (!description) {
      (_c = window.showToast) == null ? void 0 : _c.call(window, _t$k("construction.form.toast_desc_required", "Укажите описание замечания"));
      return;
    }
    try {
      await onSave({
        locationId: coords.locationId,
        x: coords.x,
        y: coords.y,
        description,
        category: fields.category,
        contractorId: fields.contractorId,
        deadline: fields.deadline,
        template_key: fields.template_key,
        item_id: fields.item_id,
        item_name: fields.item_name,
        norm_text: fields.norm_text,
        photos: photosRef.current.slice()
      });
      closeDefectForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      (_d = window.showToast) == null ? void 0 : _d.call(window, "❌ " + msg);
    }
  });
}
function _actionButtonsHtml(defect) {
  const { isEngineer, isContractor } = _roleInfo$1();
  const st = String(defect.status || "issued");
  if (st === "issued") {
    if (isContractor) {
      return `<button type="button" data-c2-status="in_progress" class="flex-1 bg-blue-50 text-blue-600 border border-blue-200 py-2.5 rounded-xl text-rbi-label font-bold uppercase">${_escape$h(_t$k("construction.form.action_in_progress", "В работу"))}</button>
        <button type="button" data-c2-status="fixed" class="flex-[1.5] bg-green-600 text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape$h(_t$k("construction.form.action_fixed_photo", "Устранено (Фото)"))}</button>`;
    }
    if (isEngineer) {
      return `<button type="button" data-c2-defect-delete class="bg-danger-soft text-danger py-2.5 px-3 rounded-xl text-rbi-label font-bold uppercase border border-danger-soft">🗑️</button>
        <button type="button" data-c2-defect-save class="flex-1 bg-brand text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape$h(_t$k("construction.form.action_update", "💾 Обновить"))}</button>`;
    }
  } else if (st === "in_progress") {
    if (isContractor) {
      return `<button type="button" data-c2-status="fixed" class="w-full bg-green-600 text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape$h(_t$k("construction.form.action_fixed_attach", "Устранено (Приложить фото)"))}</button>`;
    }
    return `<div class="text-center w-full text-rbi-label font-bold text-blue-500 py-2">${_escape$h(_t$k("construction.form.contractor_working", "Подрядчик взял в работу"))}</div>`;
  } else if (st === "fixed") {
    if (isEngineer) {
      return `<button type="button" data-c2-status="rejected" class="flex-1 bg-danger-soft text-danger border border-danger-soft py-2.5 rounded-xl text-rbi-label font-bold uppercase">${_escape$h(_t$k("construction.form.action_reject", "❌ Отклонить"))}</button>
        <button type="button" data-c2-status="closed" class="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape$h(_t$k("construction.form.action_accept", "✅ Принять"))}</button>`;
    }
    return `<div class="text-center w-full text-rbi-label font-bold text-green-500 py-2">${_escape$h(_t$k("construction.form.awaiting_review", "Ожидает проверки инженером"))}</div>`;
  } else if (st === "closed") {
    return `<div class="text-center w-full text-rbi-label font-black text-green-600 py-2">${_escape$h(_t$k("construction.form.defect_closed", "Дефект закрыт"))}</div>`;
  } else if (st === "rejected") {
    if (isContractor) {
      return `<button type="button" data-c2-status="fixed" class="w-full bg-orange-500 text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape$h(_t$k("construction.form.resubmit_photo", "Повторно предъявить (Фото)"))}</button>`;
    }
    if (isEngineer) {
      return `<button type="button" data-c2-defect-save class="flex-1 bg-brand text-white py-2.5 rounded-xl text-rbi-label font-black uppercase">${_escape$h(_t$k("construction.form.action_update", "💾 Обновить"))}</button>`;
    }
  }
  return `<button type="button" data-c2-defect-close class="px-3 py-2 rounded-xl text-rbi-label font-bold uppercase text-muted">${_escape$h(_t$k("construction.form.close", "Закрыть"))}</button>`;
}
function openViewDefectForm(defect, onDelete, onSave, onChangeStatus) {
  var _a, _b, _c, _d;
  if (isContractorRole()) {
    const myId = resolveMyContractorId();
    if (!myId || String(defect.contractorId || "").trim() !== myId) {
      (_a = window.showToast) == null ? void 0 : _a.call(window, _t$k("construction.form.no_access", "⚠️ Нет доступа к чужому замечанию"));
      return;
    }
  }
  const root = _ensureOverlay();
  const panel = root.querySelector("[data-c2-defect-panel]");
  const photosRef = {
    current: Array.isArray(defect.photos) ? defect.photos.slice() : defect.photo ? [String(defect.photo)] : []
  };
  const { isEngineer } = _roleInfo$1();
  const catOpts = DEFECT_CATEGORIES_V2.map((c) => {
    const sel = String(defect.category).toUpperCase() === c ? " selected" : "";
    return `<option value="${c}"${sel}>${_escape$h(_catLabel(c))}</option>`;
  }).join("");
  const deadlineVal = _deadlineInputValue(defect.deadline);
  const canEditFields = isEngineer;
  const disabled = canEditFields ? "" : " disabled";
  panel.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-rbi-body font-black uppercase tracking-tight">${_escape$h(_t$k("construction.form.defect_title", "Замечание"))}</h3>
      <button type="button" data-c2-defect-close class="text-muted text-rbi-label font-bold uppercase">${_escape$h(_t$k("construction.form.close", "Закрыть"))}</button>
    </div>
    <p class="text-rbi-caption text-muted mb-1">${_escape$h(_t$k("construction.form.status_line", "Статус: {status}", { status: _statusLabel$5(String(defect.status)) }))}</p>
    <p class="text-rbi-caption text-muted mb-3">${_escape$h(_t$k("construction.form.coords", "Координаты: {x}% × {y}%", { x: Number(defect.x).toFixed(1), y: Number(defect.y).toFixed(1) }))}</p>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.work_type_view", "Вид работ"))}</label>
    <select data-c2-template class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3"${disabled}>
      ${_templateOptionsHtml(defect.template_key)}
    </select>
    <div class="relative mb-3">
      <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.violation_view", "Нарушение"))}</label>
      <input type="text" data-c2-item-search autocomplete="off" value="${_escape$h(defect.item_name || "")}"
        class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body"${disabled} />
      <input type="hidden" data-c2-item-id value="${_escape$h(defect.item_id || "")}" />
      <input type="hidden" data-c2-item-name value="${_escape$h(defect.item_name || "")}" />
      <div data-c2-item-dd class="absolute top-[48px] left-0 right-0 bg-white dark:bg-slate-800 border border-surface shadow-2xl rounded-xl z-[150] hidden max-h-48 overflow-y-auto"></div>
    </div>
    <div data-c2-norm-block class="${defect.norm_text || defect.item_id ? "" : "hidden"} bg-slate-50 dark:bg-slate-900 border border-surface p-2.5 rounded-xl mb-3">
      <div class="text-rbi-caption font-black uppercase text-brand mb-1">${_escape$h(_t$k("construction.form.norm_ref", "Справочно (Норматив)"))}</div>
      <div data-c2-norm-text class="text-rbi-caption text-muted font-medium"></div>
      ${_helpButtonsHtml()}
    </div>
    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.category", "Категория"))}</label>
        <select data-c2-defect-cat class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body"${disabled}>
          ${catOpts}
        </select>
      </div>
      <div>
        <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.deadline", "Срок"))}</label>
        <input type="date" data-c2-defect-deadline value="${_escape$h(deadlineVal)}"
          class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body"${disabled} />
      </div>
    </div>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.contractor", "Подрядчик"))}</label>
    <select data-c2-defect-contractor class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3"${disabled}>
      ${_contractorOptionsHtml(defect.contractorId)}
    </select>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.description", "Описание"))}</label>
    <textarea data-c2-defect-desc rows="3"
      class="w-full rounded-xl border border-surface bg-transparent px-3 py-2 text-rbi-body mb-3"${disabled}>${_escape$h(_stripHtml$3(String(defect.description || "")))}</textarea>
    <label class="block text-rbi-caption font-bold uppercase text-muted mb-1">${_escape$h(_t$k("construction.form.photos", "Фото"))}</label>
    <div data-c2-photo-host>${_renderGallery(photosRef.current)}</div>
    ${canEditFields ? `<input type="file" accept="image/*" multiple class="hidden" data-c2-photo-input />
    <button type="button" data-c2-photo-add
      class="w-full mb-3 bg-slate-50 dark:bg-slate-900 border border-dashed border-surface text-muted py-3 rounded-xl text-rbi-caption font-bold uppercase">
      + ${_escape$h(_t$k("construction.form.add_photo", "+ Добавить фото"))}
    </button>` : `<div class="mb-3"></div>`}
    ${_historyHtml(defect.history)}
    <div class="flex gap-2 justify-between mt-3 flex-wrap" data-c2-actions>
      ${_actionButtonsHtml(defect)}
    </div>`;
  root.classList.remove("hidden");
  root.classList.add("flex");
  if (defect.norm_text) {
    _setNormDisplay(panel.querySelector("[data-c2-norm-text]"), String(defect.norm_text));
  }
  _bindHelpActions(panel);
  if (canEditFields) {
    _bindItemSearch(panel);
    _bindGallery(panel, photosRef, () => {
    });
    (_b = panel.querySelector("[data-c2-photo-add]")) == null ? void 0 : _b.addEventListener("click", () => {
      var _a2;
      (_a2 = panel.querySelector("[data-c2-photo-input]")) == null ? void 0 : _a2.click();
    });
  } else {
    panel.querySelectorAll("[data-c2-photo-view]").forEach((el) => {
      el.addEventListener("click", () => {
        const ref = el.getAttribute("data-c2-photo-view") || "";
        if (ref) _openPhoto(ref);
      });
    });
  }
  panel.querySelectorAll("[data-c2-history] [data-c2-photo-view]").forEach((el) => {
    el.addEventListener("click", () => {
      const ref = el.getAttribute("data-c2-photo-view") || "";
      if (ref) _openPhoto(ref);
    });
  });
  panel.querySelectorAll("[data-c2-defect-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeDefectForm());
  });
  root.onclick = (ev) => {
    if (ev.target === root) closeDefectForm();
  };
  (_c = panel.querySelector("[data-c2-defect-save]")) == null ? void 0 : _c.addEventListener("click", async () => {
    var _a2, _b2;
    if (!onSave) {
      closeDefectForm();
      return;
    }
    const fields = _readCommonFields(panel);
    const description = fields.description || fields.item_name || defect.description;
    if (!description) {
      (_a2 = window.showToast) == null ? void 0 : _a2.call(window, _t$k("construction.form.toast_desc_required", "Укажите описание замечания"));
      return;
    }
    try {
      await onSave(defect.id, {
        description,
        category: fields.category,
        contractorId: fields.contractorId,
        deadline: fields.deadline,
        template_key: fields.template_key,
        item_id: fields.item_id,
        item_name: fields.item_name,
        norm_text: fields.norm_text,
        photos: photosRef.current.slice()
      });
      closeDefectForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      (_b2 = window.showToast) == null ? void 0 : _b2.call(window, "❌ " + msg);
    }
  });
  (_d = panel.querySelector("[data-c2-defect-delete]")) == null ? void 0 : _d.addEventListener("click", async () => {
    var _a2;
    if (!confirm(_t$k("construction.form.confirm_delete", "Удалить замечание?"))) return;
    try {
      await onDelete(defect.id);
      closeDefectForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      (_a2 = window.showToast) == null ? void 0 : _a2.call(window, "❌ " + msg);
    }
  });
  panel.querySelectorAll("[data-c2-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      var _a2, _b2, _c2, _d2, _e;
      if (!onChangeStatus) return;
      const status = btn.getAttribute("data-c2-status");
      let comment = null;
      let fixPhotos = [];
      if (status === "rejected") {
        comment = prompt(_t$k("construction.form.prompt_reject", "Укажите причину отклонения:")) || "";
        if (!comment) {
          (_a2 = window.showToast) == null ? void 0 : _a2.call(window, _t$k("construction.form.toast_reject_comment", "⚠️ Для отклонения нужен комментарий"));
          return;
        }
      }
      if (status === "fixed") {
        comment = prompt(_t$k("construction.form.prompt_fixed", "Краткий комментарий об устранении:"));
        if (comment === null) return;
        const picker = document.createElement("input");
        picker.type = "file";
        picker.accept = "image/*";
        picker.multiple = true;
        const picked = await new Promise((resolve) => {
          picker.onchange = () => resolve(picker.files);
          picker.oncancel = () => resolve(null);
          picker.click();
        });
        if (!picked || !picked.length) {
          (_b2 = window.showToast) == null ? void 0 : _b2.call(window, _t$k("construction.form.toast_fixed_photo", "⚠️ Для статуса «Устранено» нужно фото"));
          return;
        }
        try {
          fixPhotos = await _savePhotoFiles(picked);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          (_c2 = window.showToast) == null ? void 0 : _c2.call(window, "❌ " + msg);
          return;
        }
        if (!fixPhotos.length) {
          (_d2 = window.showToast) == null ? void 0 : _d2.call(window, _t$k("construction.form.toast_photo_save_fail", "⚠️ Не удалось сохранить фото"));
          return;
        }
      }
      try {
        await onChangeStatus(defect.id, { status, comment, photos: fixPhotos });
        closeDefectForm();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        (_e = window.showToast) == null ? void 0 : _e.call(window, "❌ " + msg);
      }
    });
  });
}
function _xy(d) {
  const x = Number(d.x);
  const y = Number(d.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}
function clusterDefects(defects, thresholdPct = 2.5) {
  const indexed = [];
  defects.forEach((d, i) => {
    const p = _xy(d);
    if (!p) return;
    indexed.push({ d, num: i + 1, x: p.x, y: p.y });
  });
  const remaining = indexed.slice();
  const out = [];
  while (remaining.length > 0) {
    const base = remaining.shift();
    const group = [base];
    let i = 0;
    while (i < remaining.length) {
      const p = remaining[i];
      const dist = Math.hypot(base.x - p.x, base.y - p.y);
      if (dist < thresholdPct) {
        group.push(p);
        remaining.splice(i, 1);
      } else {
        i++;
      }
    }
    if (group.length === 1) {
      out.push({
        kind: "single",
        x: group[0].x,
        y: group[0].y,
        defects: [group[0].d],
        num: group[0].num
      });
    } else {
      const n = group.length;
      const avgX = group.reduce((s, g) => s + g.x, 0) / n;
      const avgY = group.reduce((s, g) => s + g.y, 0) / n;
      out.push({
        kind: "cluster",
        x: avgX,
        y: avgY,
        defects: group.map((g) => g.d),
        num: n
      });
    }
  }
  return out;
}
function spiderPositions(centerX, centerY, count, radiusPct = 5) {
  if (count <= 0) return [];
  if (count === 1) return [{ x: centerX, y: centerY }];
  const pts = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.PI * 2 * i / count - Math.PI / 2;
    const x = Math.min(98, Math.max(2, centerX + Math.cos(angle) * radiusPct));
    const y = Math.min(98, Math.max(2, centerY + Math.sin(angle) * radiusPct));
    pts.push({ x, y });
  }
  return pts;
}
const PZ_PINCH_STEP = 0.5;
const PZ_BTN_STEP = 0.28;
const PZ_MIN = 0.4;
const PZ_MAX = 8;
function _planPz() {
  return window.RbiPlanPanzoom || null;
}
function _pdfjs() {
  return window.pdfjsLib || null;
}
function _panzoomFactory() {
  return window.Panzoom || null;
}
function _pinBg(category, status) {
  const st = String(status || "").toLowerCase();
  if (st === "closed" || st === "fixed") return "bg-green-500";
  const c = String(category || "").toLowerCase();
  if (c === "critical" || c === "b3") return "bg-red-600";
  if (c === "major" || c === "b2") return "bg-orange-500";
  return "bg-blue-500";
}
function _zoneColors(status) {
  const st = String(status || "").toLowerCase();
  if (st === "rejected") return { box: "bg-red-500/20 border-red-500", label: "bg-red-600" };
  if (st === "accepted") return { box: "bg-green-500/20 border-green-500", label: "bg-green-600" };
  return { box: "bg-blue-500/20 border-blue-500", label: "bg-blue-600" };
}
function _t$j(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escapeAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
class PlanViewer {
  constructor(host, handlers = {}) {
    this.wrap = null;
    this.stage = null;
    this.canvas = null;
    this.pins = null;
    this.zonesEl = null;
    this.addMode = false;
    this.zoneMode = false;
    this.zoneClick1 = null;
    this.focusZoneId = null;
    this.highlightId = null;
    this.destroyed = false;
    this.pdfUrl = "";
    this.panzoom = null;
    this._onWheelBound = null;
    this._onPointerBound = null;
    this._lastPointerClient = null;
    this._lastMarkers = [];
    this._lastClusterThreshold = 2.5;
    this._expandedClusterKey = null;
    this.host = host;
    this.handlers = handlers;
  }
  setAddMode(on) {
    this.addMode = !!on;
    if (on) this.setZoneMode(false);
    this._syncCursor();
  }
  isAddMode() {
    return this.addMode;
  }
  setZoneMode(on) {
    this.zoneMode = !!on;
    if (on) {
      this.addMode = false;
      this.zoneClick1 = null;
      this.clearTempZone();
    } else {
      this.zoneClick1 = null;
      this.clearTempZone();
    }
    this._syncCursor();
  }
  isZoneMode() {
    return this.zoneMode;
  }
  setFocusZone(id) {
    var _a;
    this.focusZoneId = id;
    const zones = (_a = this.zonesEl) == null ? void 0 : _a.querySelectorAll("[data-c2-zone]");
    zones == null ? void 0 : zones.forEach((el) => {
      const hid = el;
      const match = hid.getAttribute("data-c2-zone") === id;
      hid.classList.toggle("ring-4", match);
      hid.classList.toggle("ring-indigo-400", match);
      hid.style.zIndex = match ? "25" : "10";
    });
  }
  getMarkerEl(id) {
    if (!this.pins || !id) return null;
    const pins = this.pins.querySelectorAll("[data-c2-pin]");
    for (const el of pins) {
      if (el.getAttribute("data-c2-pin") === id) return el;
    }
    return null;
  }
  /** Подсветка маркера (pulse/ring) + по возможности pan к пину. */
  highlightMarker(id) {
    this.highlightId = id;
    this._applyHighlight();
    if (id) this._panToMarker(id);
  }
  setScale(scale) {
    if (!this.panzoom) return;
    const s = Math.min(PZ_MAX, Math.max(PZ_MIN, Number(scale) || 1));
    this.panzoom.zoomToPoint(s, this._getZoomPoint());
  }
  zoomIn() {
    if (!this.panzoom) return;
    const next = Math.min(PZ_MAX, this.panzoom.getScale() * Math.exp(PZ_BTN_STEP));
    this.panzoom.zoomToPoint(next, this._getZoomPoint());
  }
  zoomOut() {
    if (!this.panzoom) return;
    const next = Math.max(PZ_MIN, this.panzoom.getScale() * Math.exp(-PZ_BTN_STEP));
    this.panzoom.zoomToPoint(next, this._getZoomPoint());
  }
  /**
   * Точка zoom в client coords: последний pointer над wrap, иначе центр viewport.
   * Важно: Panzoom.zoom({focal}) ждёт уже сконвертированные coords;
   * clientX/Y передаём через zoomToPoint (как zoomWithWheel).
   */
  _getZoomPoint() {
    if (this._lastPointerClient) {
      return { clientX: this._lastPointerClient.x, clientY: this._lastPointerClient.y };
    }
    if (!this.wrap) return { clientX: 0, clientY: 0 };
    const r = this.wrap.getBoundingClientRect();
    return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  }
  /** Сброс масштаба/пана к стартовому fit + центр в окне. */
  fit() {
    if (!this.panzoom || !this.wrap || !this.stage) return;
    this.panzoom.reset({ animate: false });
    const helper = _planPz();
    const doCenter = () => {
      if (!this.panzoom || !this.wrap || !this.stage) return;
      if (helper) helper.center(this.panzoom, this.wrap, this.stage);
    };
    requestAnimationFrame(() => requestAnimationFrame(doCenter));
  }
  getScale() {
    var _a;
    return ((_a = this.panzoom) == null ? void 0 : _a.getScale()) ?? 1;
  }
  destroy() {
    this.destroyed = true;
    this._destroyPanzoom();
    this.host.innerHTML = "";
    this.wrap = null;
    this.stage = null;
    this.canvas = null;
    this.pins = null;
    this.zonesEl = null;
  }
  async load(pdfUrl) {
    var _a;
    this.pdfUrl = pdfUrl;
    this.destroyed = false;
    this._destroyPanzoom();
    this.host.innerHTML = `
      <div class="absolute inset-0 overflow-hidden bg-slate-200 dark:bg-slate-900 touch-none" data-c2-plan-wrap>
        <div class="absolute top-0 left-0 shadow-lg bg-white" data-c2-plan-stage style="touch-action:none">
          <canvas data-c2-plan-canvas class="block max-w-none"></canvas>
          <div data-c2-plan-zones class="absolute inset-0 pointer-events-none"></div>
          <div data-c2-plan-pins class="absolute inset-0 pointer-events-none"></div>
        </div>
      </div>
      <div data-c2-plan-loader class="absolute inset-0 flex items-center justify-center bg-slate-100/80 dark:bg-slate-900/80 text-[11px] font-bold uppercase tracking-widest text-slate-500">
        ${_t$j("construction.v2.plan_loading", "Загрузка плана…")}
      </div>`;
    this.wrap = this.host.querySelector("[data-c2-plan-wrap]");
    this.stage = this.host.querySelector("[data-c2-plan-stage]");
    this.canvas = this.host.querySelector("[data-c2-plan-canvas]");
    this.pins = this.host.querySelector("[data-c2-plan-pins]");
    this.zonesEl = this.host.querySelector("[data-c2-plan-zones]");
    const loader = this.host.querySelector("[data-c2-plan-loader]");
    if (!this.canvas || !this.stage || !this.wrap) throw new Error("plan-viewer DOM broken");
    this.wrap.addEventListener("click", (ev) => this._onClick(ev));
    const pdfjs = _pdfjs();
    if (!(pdfjs == null ? void 0 : pdfjs.getDocument)) throw new Error("pdfjsLib недоступен");
    let buf = null;
    if (typeof window.rbiLoadCloudPdfArrayBuffer === "function") {
      buf = await window.rbiLoadCloudPdfArrayBuffer(pdfUrl);
    } else {
      if ((_a = window.PhotoManager) == null ? void 0 : _a.getAsyncUrl) {
        try {
          const cached = await window.PhotoManager.getAsyncUrl(pdfUrl);
          if (cached && cached.startsWith("blob:")) {
            const res = await fetch(cached);
            buf = await res.arrayBuffer();
          }
        } catch {
        }
      }
      if (!buf) {
        if (navigator.onLine === false) throw new Error("PDF не кэширован офлайн");
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error("Не удалось скачать PDF");
        buf = await res.arrayBuffer();
      }
    }
    if (this.destroyed) return;
    if (!buf) throw new Error("PDF данные недоступны");
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const hostW = Math.max(this.host.clientWidth || 640, 320);
    const hostH = Math.max(this.host.clientHeight || 400, 240);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, Math.max(0.8, Math.min((hostW - 24) / base.width, (hostH - 24) / base.height)));
    const viewport = page.getViewport({ scale });
    this.canvas.width = viewport.width;
    this.canvas.height = viewport.height;
    this.stage.style.width = `${viewport.width}px`;
    this.stage.style.height = `${viewport.height}px`;
    this.stage.style.left = "0";
    this.stage.style.top = "0";
    this.stage.style.marginLeft = "0";
    this.stage.style.marginTop = "0";
    this.stage.style.removeProperty("transform-origin");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d недоступен");
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (loader) loader.remove();
    this._initPanzoom();
    this._syncCursor();
  }
  setMarkers(defects, opts) {
    if (!this.pins) return;
    this._lastMarkers = defects.slice();
    const thr = (opts == null ? void 0 : opts.clusterThreshold) !== void 0 ? opts.clusterThreshold : this._lastClusterThreshold;
    this._lastClusterThreshold = thr;
    const items = thr <= 0 ? null : clusterDefects(defects, thr);
    const parts = [];
    if (!items) {
      defects.forEach((d, i) => {
        const pin = this._singlePinHtml(d, i + 1, Number(d.x), Number(d.y));
        if (pin) parts.push(pin);
      });
    } else {
      const expandKey = this._expandedClusterKey;
      for (const item of items) {
        if (item.kind === "single") {
          const pin = this._singlePinHtml(item.defects[0], item.num, item.x, item.y);
          if (pin) parts.push(pin);
          continue;
        }
        const key = item.defects.map((d) => d.id).sort().join(",");
        if (expandKey && expandKey === key) {
          const spider = spiderPositions(item.x, item.y, item.defects.length);
          item.defects.forEach((d, i) => {
            const pos = spider[i] || { x: item.x, y: item.y };
            const idx = defects.findIndex((x) => x.id === d.id);
            const num = idx >= 0 ? idx + 1 : i + 1;
            const pin = this._singlePinHtml(d, num, pos.x, pos.y);
            if (pin) parts.push(pin);
          });
          parts.push(`<button type="button" data-c2-cluster-collapse="${_escapeAttr(key)}"
            class="absolute w-5 h-5 rounded-full bg-slate-800/80 text-white text-[8px] font-black
                   border border-white shadow z-25 flex items-center justify-center
                   pointer-events-auto panzoom-exclude"
            style="left:${item.x}%;top:${item.y}%;transform:translate(-50%,-50%);transition:transform 150ms ease"
            title="${_escapeAttr(_t$j("construction.v2.collapse_cluster", "Свернуть"))}">×</button>`);
        } else {
          parts.push(this._clusterBubbleHtml(item.x, item.y, item.defects, key));
        }
      }
    }
    this.pins.innerHTML = parts.join("");
    this._bindPinHoverScale();
    this._applyHighlight();
  }
  /** Grow pin on hover without losing centering (inline transform beats style.css lift). */
  _bindPinHoverScale() {
    if (!this.pins) return;
    const rest = "translate(-50%,-50%)";
    const hover = "translate(-50%,-50%) scale(1.15)";
    this.pins.querySelectorAll("[data-c2-pin], [data-c2-cluster], [data-c2-cluster-collapse]").forEach((node) => {
      const el = node;
      el.addEventListener("pointerenter", () => {
        el.style.transform = hover;
      });
      el.addEventListener("pointerleave", () => {
        el.style.transform = rest;
      });
    });
  }
  _singlePinHtml(d, num, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
    const bg = _pinBg(String(d.category), String(d.status));
    const title = _escapeAttr(String(d.description || "").slice(0, 80));
    return `<button type="button" data-c2-pin="${_escapeAttr(d.id)}"
      class="absolute w-6 h-6 ${bg} rounded-full border-2 border-white shadow-md
             flex items-center justify-center text-white text-[10px] font-black
             z-20 pointer-events-auto panzoom-exclude"
      style="left:${x}%;top:${y}%;transform:translate(-50%,-50%);cursor:pointer;transition:transform 150ms ease" title="${title}">${num}</button>`;
  }
  _clusterBubbleHtml(x, y, defects, key) {
    const total = defects.length;
    let red = 0;
    let orange = 0;
    let blue = 0;
    for (const d of defects) {
      const st = String(d.status || "").toLowerCase();
      if (st === "closed" || st === "fixed") ;
      else {
        const c = String(d.category || "").toLowerCase();
        if (c === "critical" || c === "b3") red++;
        else if (c === "major" || c === "b2") orange++;
        else blue++;
      }
    }
    const cRed = red / total * 360;
    const cOrange = cRed + orange / total * 360;
    const cBlue = cOrange + blue / total * 360;
    const grad = `conic-gradient(from 0deg, #ef4444 0deg ${cRed}deg, #f97316 ${cRed}deg ${cOrange}deg, #3b82f6 ${cOrange}deg ${cBlue}deg, #22c55e ${cBlue}deg 360deg)`;
    const ids = defects.map((d) => d.id).join(",");
    return `<button type="button" data-c2-cluster="${_escapeAttr(key)}" data-c2-cluster-ids="${_escapeAttr(ids)}"
      class="absolute w-8 h-8 rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.3)] flex items-center justify-center
             z-30 pointer-events-auto panzoom-exclude"
      style="left:${x}%;top:${y}%;background:${grad};padding:3px;transform:translate(-50%,-50%);cursor:pointer;transition:transform 150ms ease" title="${_escapeAttr(_t$j("construction.v2.defects_count", "Замечаний: {count}", { count: total }))}">
      <span class="w-full h-full bg-white text-slate-800 rounded-full flex items-center justify-center
                   text-[11px] font-black border border-slate-200">${total}</span>
    </button>`;
  }
  collapseClusterExpand() {
    if (!this._expandedClusterKey) return;
    this._expandedClusterKey = null;
    this.setMarkers(this._lastMarkers, { clusterThreshold: this._lastClusterThreshold });
  }
  setZones(items) {
    if (!this.zonesEl) return;
    const html = items.map((a) => {
      const z = a.zone;
      if (!z) return "";
      const x = Number(z.x);
      const y = Number(z.y);
      const w = Number(z.w);
      const h = Number(z.h);
      if (![x, y, w, h].every(Number.isFinite)) return "";
      const colors = _zoneColors(String(a.status));
      const title = _escapeAttr(String(a.work_type || _t$j("construction.v2.acceptance_default", "Приёмка")).slice(0, 60));
      const focus = this.focusZoneId === a.id ? "ring-4 ring-indigo-400" : "";
      const zIndex = this.focusZoneId === a.id ? 25 : 10;
      return `<button type="button" data-c2-zone="${_escapeAttr(a.id)}"
          class="absolute border-2 ${colors.box} ${focus} shadow-inner flex items-center justify-center
                 cursor-pointer hover:bg-black/10 transition-colors pointer-events-auto panzoom-exclude"
          style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;z-index:${zIndex}" title="${title}">
          <span class="${colors.label} text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase">${_t$j("construction.v2.zone_label", "зона")}</span>
        </button>`;
    }).join("");
    this.zonesEl.innerHTML = html;
  }
  /** Временный пин «+» в режиме выдачи — как legacy drawTempPin. */
  drawTempPin(xPercent, yPercent) {
    if (!this.pins) return;
    this.clearTempPin();
    this.pins.insertAdjacentHTML(
      "beforeend",
      `<div id="c2-temp-pin"
        class="absolute w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg
               flex items-center justify-center text-white text-[10px] font-black z-30
               animate-bounce pointer-events-none"
        style="left:${xPercent}%;top:${yPercent}%;transform:translate(-50%,-50%)">+</div>`
    );
  }
  clearTempPin() {
    var _a, _b;
    (_b = (_a = this.pins) == null ? void 0 : _a.querySelector("#c2-temp-pin")) == null ? void 0 : _b.remove();
  }
  clearTempZone() {
    var _a, _b, _c, _d;
    (_b = (_a = this.zonesEl) == null ? void 0 : _a.querySelector("#c2-temp-zone")) == null ? void 0 : _b.remove();
    (_d = (_c = this.zonesEl) == null ? void 0 : _c.querySelector("#c2-temp-zone-dot")) == null ? void 0 : _d.remove();
  }
  _drawTempZone(zone) {
    if (!this.zonesEl) return;
    this.clearTempZone();
    this.zonesEl.insertAdjacentHTML(
      "beforeend",
      `<div id="c2-temp-zone"
        class="absolute border-2 border-dashed border-indigo-500 bg-indigo-500/20 z-30 pointer-events-none"
        style="left:${zone.x}%;top:${zone.y}%;width:${zone.w}%;height:${zone.h}%;"></div>`
    );
  }
  _initPanzoom() {
    this._destroyPanzoom();
    const factory = _panzoomFactory();
    if (!factory || !this.stage || !this.wrap) return;
    const helper = _planPz();
    const pinchStep = (helper == null ? void 0 : helper.PINCH_STEP) ?? PZ_PINCH_STEP;
    const opts = helper ? helper.baseOptions({
      maxScale: PZ_MAX,
      minScale: PZ_MIN,
      startScale: 1,
      startX: 0,
      startY: 0
    }) : {
      maxScale: PZ_MAX,
      minScale: PZ_MIN,
      step: pinchStep,
      startScale: 1,
      startX: 0,
      startY: 0,
      pinchAndPan: true,
      touchAction: "none",
      cursor: "grab",
      excludeClass: "panzoom-exclude"
    };
    this.panzoom = factory(this.stage, opts);
    const doCenter = () => {
      if (!this.panzoom || !this.wrap || !this.stage) return;
      if (helper) helper.center(this.panzoom, this.wrap, this.stage);
      else {
        const wr = this.wrap.getBoundingClientRect();
        const er = this.stage.getBoundingClientRect();
        const dx = wr.left + wr.width / 2 - (er.left + er.width / 2);
        const dy = wr.top + wr.height / 2 - (er.top + er.height / 2);
        const s = this.panzoom.getScale() || 1;
        const pan = this.panzoom.getPan();
        this.panzoom.pan(pan.x + dx / s, pan.y + dy / s, { animate: false, force: true });
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(doCenter));
    this._onWheelBound = (e) => {
      if (!this.panzoom) return;
      if (helper) helper.wheelZoom(this.panzoom, e, PZ_MIN, PZ_MAX);
      else {
        e.preventDefault();
        const cur = this.panzoom.getScale() || 1;
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;
        if (dy > 60) dy = 60;
        if (dy < -60) dy = -60;
        const next = Math.min(PZ_MAX, Math.max(PZ_MIN, cur * Math.exp(-dy * 16e-4)));
        this.panzoom.zoomToPoint(next, { clientX: e.clientX, clientY: e.clientY });
      }
    };
    this.wrap.addEventListener("wheel", this._onWheelBound, { passive: false });
    this._lastPointerClient = null;
    this._onPointerBound = (e) => {
      this._lastPointerClient = { x: e.clientX, y: e.clientY };
    };
    this.wrap.addEventListener("pointermove", this._onPointerBound);
    this.wrap.addEventListener("mousemove", this._onPointerBound);
  }
  _destroyPanzoom() {
    if (this.wrap && this._onWheelBound) {
      this.wrap.removeEventListener("wheel", this._onWheelBound);
    }
    this._onWheelBound = null;
    if (this.wrap && this._onPointerBound) {
      this.wrap.removeEventListener("pointermove", this._onPointerBound);
      this.wrap.removeEventListener("mousemove", this._onPointerBound);
    }
    this._onPointerBound = null;
    this._lastPointerClient = null;
    if (this.panzoom) {
      try {
        this.panzoom.destroy();
      } catch {
      }
      this.panzoom = null;
    }
  }
  _applyHighlight() {
    var _a;
    const pins = (_a = this.pins) == null ? void 0 : _a.querySelectorAll("[data-c2-pin]");
    pins == null ? void 0 : pins.forEach((el) => {
      const hid = el;
      const match = !!this.highlightId && hid.getAttribute("data-c2-pin") === this.highlightId;
      hid.classList.toggle("ring-4", match);
      hid.classList.toggle("ring-yellow-300", match);
      hid.classList.toggle("scale-150", match);
      hid.classList.toggle("animate-pulse", match);
      hid.style.zIndex = match ? "40" : "";
    });
  }
  _panToMarker(id) {
    if (!this.panzoom || !this.wrap) return;
    const el = this.getMarkerEl(id);
    if (!el) return;
    const run = () => {
      if (!this.panzoom || !this.wrap) return;
      const er = el.getBoundingClientRect();
      const wr = this.wrap.getBoundingClientRect();
      const dx = wr.left + wr.width / 2 - (er.left + er.width / 2);
      const dy = wr.top + wr.height / 2 - (er.top + er.height / 2);
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      const pan = this.panzoom.getPan();
      const s = this.panzoom.getScale() || 1;
      this.panzoom.pan(pan.x + dx / s, pan.y + dy / s, { animate: true });
    };
    if (this.panzoom.getScale() < 1.2) {
      const wr = this.wrap.getBoundingClientRect();
      this.panzoom.zoomToPoint(1.5, {
        clientX: wr.left + wr.width / 2,
        clientY: wr.top + wr.height / 2
      });
      setTimeout(run, 220);
    } else {
      requestAnimationFrame(run);
    }
  }
  _syncCursor() {
    if (!this.wrap) return;
    const cross = this.addMode || this.zoneMode;
    this.wrap.classList.toggle("cursor-crosshair", cross);
    this.wrap.classList.toggle("cursor-default", !cross);
    if (this.panzoom) {
      this.panzoom.setOptions({
        cursor: cross ? "crosshair" : "grab",
        disablePan: cross
      });
    }
  }
  _onClick(ev) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    const t = ev.target;
    const zoneBtn = (_a = t == null ? void 0 : t.closest) == null ? void 0 : _a.call(t, "[data-c2-zone]");
    if (zoneBtn && !this.zoneMode && !this.addMode) {
      const id = zoneBtn.getAttribute("data-c2-zone");
      if (id) (_c = (_b = this.handlers).onZoneClick) == null ? void 0 : _c.call(_b, id);
      return;
    }
    const collapseBtn = (_d = t == null ? void 0 : t.closest) == null ? void 0 : _d.call(t, "[data-c2-cluster-collapse]");
    if (collapseBtn && !this.zoneMode) {
      this.collapseClusterExpand();
      return;
    }
    const clusterBtn = (_e = t == null ? void 0 : t.closest) == null ? void 0 : _e.call(t, "[data-c2-cluster]");
    if (clusterBtn && !this.zoneMode && !this.addMode) {
      const key = clusterBtn.getAttribute("data-c2-cluster");
      if (key) {
        this._expandedClusterKey = key;
        this.setMarkers(this._lastMarkers, { clusterThreshold: this._lastClusterThreshold });
      }
      return;
    }
    const pin = (_f = t == null ? void 0 : t.closest) == null ? void 0 : _f.call(t, "[data-c2-pin]");
    if (pin && !this.zoneMode) {
      const id = pin.getAttribute("data-c2-pin");
      if (id) {
        this._expandedClusterKey = null;
        (_h = (_g = this.handlers).onMarkerClick) == null ? void 0 : _h.call(_g, id);
      }
      return;
    }
    if (this._expandedClusterKey && !this.addMode && !this.zoneMode) {
      this.collapseClusterExpand();
      return;
    }
    if (!this.stage) return;
    const rect = this.stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPercent = (ev.clientX - rect.left) / rect.width * 100;
    const yPercent = (ev.clientY - rect.top) / rect.height * 100;
    if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) return;
    if (this.zoneMode) {
      if (!this.zoneClick1) {
        this.zoneClick1 = { x: xPercent, y: yPercent };
        this.clearTempZone();
        (_i = this.zonesEl) == null ? void 0 : _i.insertAdjacentHTML(
          "beforeend",
          `<div id="c2-temp-zone-dot"
            class="absolute w-3 h-3 bg-indigo-600 rounded-full border-2 border-white z-30
                   pointer-events-none"
            style="left:${xPercent}%;top:${yPercent}%;transform:translate(-50%,-50%)"></div>`
        );
        return;
      }
      const x1 = this.zoneClick1.x;
      const y1 = this.zoneClick1.y;
      const x = Math.min(x1, xPercent);
      const y = Math.min(y1, yPercent);
      const w = Math.max(0.5, Math.abs(xPercent - x1));
      const h = Math.max(0.5, Math.abs(yPercent - y1));
      const zone = { x, y, w, h };
      this._drawTempZone(zone);
      this.zoneClick1 = null;
      (_k = (_j = this.handlers).onZoneDrawn) == null ? void 0 : _k.call(_j, zone);
      return;
    }
    if (!this.addMode) return;
    (_m = (_l = this.handlers).onPlanClick) == null ? void 0 : _m.call(_l, xPercent, yPercent);
  }
  getPdfUrl() {
    return this.pdfUrl;
  }
}
const ALL_PIN_STATUSES = [
  "issued",
  "in_progress",
  "fixed",
  "closed",
  "rejected"
];
const STATUS_LABEL_KEYS = {
  issued: { key: "construction.status.issued", fallback: "Выдано" },
  in_progress: { key: "construction.status.in_progress", fallback: "В работе" },
  fixed: { key: "construction.status.fixed", fallback: "На проверке" },
  closed: { key: "construction.status.closed", fallback: "Закрыто" },
  rejected: { key: "construction.status.rejected", fallback: "Отклонено" }
};
function _t$i(key, fallback) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  return fallback;
}
function _statusLabel$4(statusKey) {
  const meta = STATUS_LABEL_KEYS[statusKey];
  return _t$i(meta.key, meta.fallback);
}
const STATUS_STYLES = {
  issued: {
    active: "bg-danger-soft text-danger border-danger-soft",
    badgeActive: "bg-danger text-white"
  },
  in_progress: {
    active: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400",
    badgeActive: "bg-blue-600 text-white"
  },
  fixed: {
    active: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400",
    badgeActive: "bg-orange-500 text-white"
  },
  closed: {
    active: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400",
    badgeActive: "bg-green-600 text-white"
  },
  rejected: {
    active: "bg-slate-100 text-ink border-surface dark:bg-slate-800",
    badgeActive: "bg-slate-500 text-white"
  }
};
const pinFiltersState = {
  statuses: [],
  category: "ALL"
};
function normalizePinCategory(c) {
  const v = String(c || "").toLowerCase();
  if (v === "minor" || v === "b1") return "B1";
  if (v === "major" || v === "b2") return "B2";
  if (v === "critical" || v === "b3") return "B3";
  const up = String(c || "").toUpperCase();
  if (up === "B1" || up === "B2" || up === "B3") return up;
  return up || "";
}
function filterDefectsByPins(defects, filters = pinFiltersState) {
  let out = defects.slice();
  if (filters.statuses.length > 0) {
    const set = new Set(filters.statuses.map(String));
    out = out.filter((d) => set.has(String(d.status)));
  }
  if (filters.category && filters.category !== "ALL") {
    out = out.filter((d) => normalizePinCategory(String(d.category)) === filters.category);
  }
  return out;
}
function countByStatus(defects) {
  const counts = {
    issued: 0,
    in_progress: 0,
    fixed: 0,
    closed: 0,
    rejected: 0
  };
  for (const d of defects) {
    const st = String(d.status);
    if (st in counts) counts[st]++;
  }
  return counts;
}
function toggleStatusFilter(filters, statusKey) {
  const idx = filters.statuses.indexOf(statusKey);
  if (idx > -1) filters.statuses.splice(idx, 1);
  else filters.statuses.push(statusKey);
  if (filters.statuses.length === ALL_PIN_STATUSES.length) {
    filters.statuses = [];
  }
}
function setCategoryFilter(filters, category) {
  filters.category = category;
}
function renderPinFiltersHtml(baseDefects, filters = pinFiltersState, opts) {
  let forCounts = baseDefects;
  if (filters.category && filters.category !== "ALL") {
    forCounts = baseDefects.filter(
      (d) => normalizePinCategory(String(d.category)) === filters.category
    );
  }
  const counts = countByStatus(forCounts);
  const isAllMode = filters.statuses.length === 0;
  const compact = !!(opts == null ? void 0 : opts.compact);
  const darkFs = !!(opts == null ? void 0 : opts.darkFs);
  const inactiveClass = darkFs ? "bg-white/10 text-slate-300 border-white/20" : "bg-surface text-muted border-surface";
  const inactiveBadge = darkFs ? "bg-white/10 text-slate-400" : "bg-slate-100 text-muted dark:bg-slate-900 border border-surface";
  const chips = ALL_PIN_STATUSES.map((statusKey) => {
    const isActive = filters.statuses.includes(statusKey);
    const visuallyActive = isAllMode || isActive;
    const btnClass = visuallyActive ? STATUS_STYLES[statusKey].active : inactiveClass;
    const badgeClass = visuallyActive ? STATUS_STYLES[statusKey].badgeActive : inactiveBadge;
    const pad = compact ? "px-2 py-1" : "px-2.5 py-1.5";
    return `<button type="button" data-c2-pin-status="${statusKey}"
      class="shrink-0 ${pad} rounded-xl border text-rbi-caption font-bold uppercase transition-all flex items-center gap-1 active:scale-95 ${btnClass}">
      ${_statusLabel$4(statusKey)}
      <span class="${badgeClass} px-1.5 py-0.5 rounded-md text-rbi-caption font-black min-w-[18px] text-center">${counts[statusKey] || 0}</span>
    </button>`;
  }).join("");
  const cats = [
    { key: "ALL", label: _t$i("construction.pin.all", "Все") },
    { key: "B3", label: "B3" },
    { key: "B2", label: "B2" },
    { key: "B1", label: "B1" }
  ];
  const catBtns = cats.map(({ key, label }) => {
    const on = filters.category === key;
    const cls = on ? darkFs ? "bg-white text-slate-900" : "bg-brand text-white" : darkFs ? "bg-white/10 text-slate-300 hover:bg-white/20" : "bg-slate-100 text-ink dark:bg-slate-800";
    return `<button type="button" data-c2-pin-category="${key}"
        class="px-2 py-1 rounded-lg text-rbi-caption font-bold transition-colors ${cls}">${label}</button>`;
  }).join("");
  return `<div data-c2-pin-filters class="flex flex-col gap-1.5 w-full min-w-0">
    <div class="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">${chips}</div>
    <div class="flex gap-1 items-center">
      <span class="text-rbi-caption font-bold uppercase tracking-wider text-muted shrink-0">${_t$i("construction.pin.cat", "Кат.")}</span>
      <div class="flex gap-0.5">${catBtns}</div>
    </div>
  </div>`;
}
function paintPinFilterHosts(baseDefects, filters = pinFiltersState, opts) {
  document.querySelectorAll("[data-c2-pin-filters-host]").forEach((el) => {
    const host = el;
    const dark = host.getAttribute("data-c2-pin-filters-host") === "fs" || !!(opts == null ? void 0 : opts.darkFs);
    host.innerHTML = renderPinFiltersHtml(baseDefects, filters, {
      compact: opts == null ? void 0 : opts.compact,
      darkFs: dark
    });
  });
}
let _viewer$1 = null;
let _openUnitId = null;
let _apartmentId = null;
let _addMode$1 = false;
function _t$h(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$g(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _defects$2() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionDefects) || null;
}
function _units$2() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionUnits) || null;
}
function _loc$5() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.locations) || null;
}
function _listForApartment(dSvc, apartmentId) {
  if (typeof dSvc.listForLocation === "function") return dSvc.listForLocation(apartmentId);
  return dSvc.list({ locationId: apartmentId });
}
function _pathLabel$3(apartmentId) {
  const loc = _loc$5();
  if (!(loc == null ? void 0 : loc.getPath) || !apartmentId) return apartmentId || "—";
  try {
    const path = loc.getPath(apartmentId) || [];
    if (!path.length) return apartmentId;
    return path.map((n) => n.displayName || n.id).join(" / ");
  } catch {
    return apartmentId;
  }
}
function _syncAddBtn() {
  const btn = document.querySelector("[data-c2-apt-add-mode]");
  if (!btn) return;
  btn.textContent = _addMode$1 ? _t$h("construction.v2.add_picking", "Кликни…") : _t$h("construction.v2.add_defect", "+ Замечание");
  btn.className = _addMode$1 ? "px-3 py-1.5 rounded-xl border text-rbi-caption font-black uppercase bg-brand text-white border-brand" : "px-3 py-1.5 rounded-xl border text-rbi-caption font-black uppercase bg-transparent text-brand border-brand-soft";
}
async function _refreshPins() {
  const dSvc = _defects$2();
  if (!_viewer$1 || !_apartmentId || !dSvc) return;
  await dSvc.init();
  const all = _listForApartment(dSvc, _apartmentId);
  const filtered = filterDefectsByPins(all, pinFiltersState);
  const host = document.querySelector('#c2-apartment-plan [data-c2-pin-filters-host="apt"]');
  if (host) {
    host.innerHTML = renderPinFiltersHtml(all, pinFiltersState, { compact: true });
  }
  _viewer$1.setMarkers(filtered);
  const countEl = document.getElementById("c2-apt-overlay-count");
  if (countEl) countEl.textContent = _t$h("construction.v2.apt_overlay_count", "Показано {shown} из {total}", { shown: filtered.length, total: all.length });
}
async function _maybeMarkHasDefects(unitId) {
  const uSvc = _units$2();
  if (!uSvc) return;
  const u = uSvc.get(unitId);
  if (!u) return;
  const st = String(u.status || "not_inspected");
  if (st !== "not_inspected" && st !== "none") return;
  try {
    await uSvc.changeStatus(unitId, "has_defects");
  } catch (e) {
    console.warn("[apartment-plan] changeStatus has_defects", e);
  }
}
function closeApartmentPlan() {
  var _a;
  _viewer$1 == null ? void 0 : _viewer$1.destroy();
  _viewer$1 = null;
  _openUnitId = null;
  _apartmentId = null;
  _addMode$1 = false;
  (_a = document.getElementById("c2-apartment-plan")) == null ? void 0 : _a.remove();
}
async function refreshApartmentPlanMarkers() {
  if (!_openUnitId || !_apartmentId) return;
  await _refreshPins();
}
async function openApartmentPlan(unit, cb) {
  var _a, _b, _c, _d, _e, _f;
  closeApartmentPlan();
  const pdfUrl = String(unit.pdf_url || "");
  if (!pdfUrl.startsWith("http")) {
    cb.toast(_t$h("construction.v2.apt_upload_pdf", "Сначала загрузите PDF плана квартиры"));
    return;
  }
  const uSvc = _units$2();
  const dSvc = _defects$2();
  if (!dSvc) {
    cb.toast(_t$h("construction.v2.svc_defects_missing", "service.constructionDefects не загружен"));
    return;
  }
  if (!uSvc) {
    cb.toast(_t$h("construction.v2.svc_units_missing", "service.constructionUnits не загружен"));
    return;
  }
  let fresh = unit;
  try {
    if (typeof uSvc.ensureApartmentForUnit === "function") {
      fresh = await uSvc.ensureApartmentForUnit(unit.id);
    }
  } catch (e) {
    cb.toast(_t$h("construction.v2.apt_migration_needed", "Нужна миграция квартиры: {msg}", { msg: (e == null ? void 0 : e.message) || String(e) }));
    return;
  }
  const loc = _loc$5();
  const node = (_a = loc == null ? void 0 : loc.getNode) == null ? void 0 : _a.call(loc, fresh.locationId);
  if (node && node.nodeType && node.nodeType !== "apartment") {
    cb.toast(_t$h("construction.v2.apt_open_transfer", "Сначала откройте Передачу — нужна привязка к квартире"));
    return;
  }
  const apartmentId = fresh.locationId;
  if (!apartmentId) {
    cb.toast(_t$h("construction.v2.apt_no_location", "У помещения нет locationId"));
    return;
  }
  _openUnitId = fresh.id;
  _apartmentId = apartmentId;
  _addMode$1 = false;
  const guest = cb.isGuest();
  const title = `${fresh.type || "КВ"} ${fresh.name || ""}`.trim();
  const path = _pathLabel$3(apartmentId);
  const wrap = document.createElement("div");
  wrap.id = "c2-apartment-plan";
  wrap.className = "fixed inset-0 flex flex-col bg-slate-100 dark:bg-slate-900";
  wrap.style.zIndex = "1100";
  wrap.innerHTML = `
    <div class="shrink-0 flex flex-col gap-1.5 px-3 py-2.5 border-b border-surface bg-surface">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape$g(_t$h("construction.v2.apt_fs_title", "Замечания на плане · весь экран"))}</div>
          <div class="text-rbi-title font-black text-ink truncate">${_escape$g(title)}</div>
          <div class="text-rbi-caption font-bold text-muted truncate">${_escape$g(path)}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <span id="c2-apt-overlay-count" class="text-rbi-caption font-bold text-muted hidden sm:inline">${_escape$g(_t$h("construction.v2.apt_overlay_count", "Показано {shown} из {total}", { shown: 0, total: 0 }))}</span>
          <div class="flex gap-0.5 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-900/80">
            <button type="button" data-c2-apt-zoom-out
              class="w-8 h-8 rounded-lg text-[16px] font-black text-ink hover:bg-surface" title="${_escape$g(_t$h("construction.v2.zoom_out", "Уменьшить"))}">−</button>
            <button type="button" data-c2-apt-zoom-in
              class="w-8 h-8 rounded-lg text-[16px] font-black text-ink hover:bg-surface" title="${_escape$g(_t$h("construction.v2.zoom_in", "Увеличить"))}">+</button>
            <button type="button" data-c2-apt-zoom-fit
              class="px-2.5 h-8 rounded-lg text-rbi-caption font-bold uppercase text-ink hover:bg-surface" title="${_escape$g(_t$h("construction.v2.zoom_fit", "По размеру"))}">Fit</button>
          </div>
          ${guest ? "" : `<button type="button" data-c2-apt-add-mode
                  class="px-3 py-1.5 rounded-xl border text-rbi-caption font-black uppercase bg-transparent text-brand border-brand-soft">${_escape$g(_t$h("construction.v2.add_defect", "+ Замечание"))}</button>`}
          <button type="button" data-c2-apt-close
            class="px-3 py-1.5 rounded-xl border text-rbi-caption font-black uppercase bg-slate-50 text-ink border-surface dark:bg-slate-900">${_escape$g(_t$h("construction.v2.fs_close", "Закрыть"))}</button>
        </div>
      </div>
      <div data-c2-pin-filters-host="apt"></div>
    </div>
    <div id="c2-apt-plan-host" class="relative flex-1 min-h-0 overflow-hidden"></div>`;
  document.body.appendChild(wrap);
  (_b = wrap.querySelector("[data-c2-apt-close]")) == null ? void 0 : _b.addEventListener("click", (ev) => {
    var _a2;
    ev.preventDefault();
    closeApartmentPlan();
    void ((_a2 = cb.onChanged) == null ? void 0 : _a2.call(cb));
  });
  (_c = wrap.querySelector("[data-c2-apt-add-mode]")) == null ? void 0 : _c.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (guest) return;
    _addMode$1 = !_addMode$1;
    _viewer$1 == null ? void 0 : _viewer$1.setAddMode(_addMode$1);
    _syncAddBtn();
  });
  (_d = wrap.querySelector("[data-c2-apt-zoom-in]")) == null ? void 0 : _d.addEventListener("click", (ev) => {
    ev.preventDefault();
    _viewer$1 == null ? void 0 : _viewer$1.zoomIn();
  });
  (_e = wrap.querySelector("[data-c2-apt-zoom-out]")) == null ? void 0 : _e.addEventListener("click", (ev) => {
    ev.preventDefault();
    _viewer$1 == null ? void 0 : _viewer$1.zoomOut();
  });
  (_f = wrap.querySelector("[data-c2-apt-zoom-fit]")) == null ? void 0 : _f.addEventListener("click", (ev) => {
    ev.preventDefault();
    _viewer$1 == null ? void 0 : _viewer$1.fit();
  });
  wrap.addEventListener("click", (ev) => {
    var _a2, _b2;
    const t = ev.target;
    const statusChip = (_a2 = t == null ? void 0 : t.closest) == null ? void 0 : _a2.call(t, "[data-c2-pin-status]");
    if (statusChip && wrap.contains(statusChip)) {
      ev.preventDefault();
      const key = statusChip.getAttribute("data-c2-pin-status");
      if (!key) return;
      toggleStatusFilter(pinFiltersState, key);
      void _refreshPins();
      return;
    }
    const catBtn = (_b2 = t == null ? void 0 : t.closest) == null ? void 0 : _b2.call(t, "[data-c2-pin-category]");
    if (catBtn && wrap.contains(catBtn)) {
      ev.preventDefault();
      const key = catBtn.getAttribute("data-c2-pin-category");
      if (!key) return;
      setCategoryFilter(pinFiltersState, key);
      void _refreshPins();
    }
  });
  const host = wrap.querySelector("#c2-apt-plan-host");
  _viewer$1 = new PlanViewer(host, {
    onPlanClick: (x, y) => {
      if (!_apartmentId || guest) return;
      _viewer$1 == null ? void 0 : _viewer$1.drawTempPin(x, y);
      openCreateDefectForm(
        { locationId: _apartmentId, x, y },
        async (input) => {
          var _a2;
          await dSvc.create({
            locationId: input.locationId,
            x: input.x,
            y: input.y,
            description: input.description,
            category: input.category,
            contractorId: input.contractorId,
            deadline: input.deadline,
            template_key: input.template_key,
            item_id: input.item_id,
            item_name: input.item_name,
            norm_text: input.norm_text,
            photos: input.photos,
            status: "issued"
          });
          if (_openUnitId) await _maybeMarkHasDefects(_openUnitId);
          _addMode$1 = false;
          _viewer$1 == null ? void 0 : _viewer$1.setAddMode(false);
          _viewer$1 == null ? void 0 : _viewer$1.clearTempPin();
          _syncAddBtn();
          cb.toast(_t$h("construction.v2.defect_saved", "Замечание сохранено"));
          await _refreshPins();
          await ((_a2 = cb.onChanged) == null ? void 0 : _a2.call(cb));
        },
        () => _viewer$1 == null ? void 0 : _viewer$1.clearTempPin()
      );
    },
    onMarkerClick: (id) => {
      const d = dSvc.get(id);
      if (!d) return;
      openViewDefectForm(
        d,
        async (defectId) => {
          var _a2;
          await dSvc.softDelete(defectId);
          cb.toast(_t$h("construction.v2.defect_deleted", "Замечание удалено"));
          await _refreshPins();
          await ((_a2 = cb.onChanged) == null ? void 0 : _a2.call(cb));
        },
        async (defectId, patch) => {
          await dSvc.update(defectId, patch);
          cb.toast(_t$h("construction.v2.defect_updated", "Замечание обновлено"));
          await _refreshPins();
        },
        async (defectId, input) => {
          await dSvc.changeStatus(defectId, input.status, {
            comment: input.comment,
            photos: input.photos
          });
          cb.toast(_t$h("construction.v2.status_updated", "✅ Статус обновлён"));
          await _refreshPins();
        }
      );
    }
  });
  try {
    await dSvc.init();
    await _viewer$1.load(pdfUrl);
    await _refreshPins();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    host.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">${_escape$g(_t$h("construction.v2.plan_error", "Ошибка плана: {msg}", { msg }))}</div>`;
    _viewer$1 = null;
  }
}
const ACTIVE_DEFECT_STATUSES_FOR_BATCH = /* @__PURE__ */ new Set(["issued", "in_progress", "fixed"]);
function _t$g(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$f(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _sysTemplates$1() {
  return window.SYSTEM_TEMPLATES || {};
}
function _userTemplates$1() {
  return window.userTemplates || {};
}
function resolveTemplateGroups(tmplKey) {
  var _a, _b;
  if (!tmplKey) return [];
  const type = tmplKey.split("_")[0];
  const key = tmplKey.replace(type + "_", "");
  if (type === "sys") return ((_a = _sysTemplates$1()[key]) == null ? void 0 : _a.groups) || [];
  if (type === "user") return ((_b = _userTemplates$1()[key]) == null ? void 0 : _b.groups) || [];
  return [];
}
function listTemplateChecklistItems(tmplKey) {
  const out = [];
  resolveTemplateGroups(tmplKey).forEach((g, gi) => {
    const groupName = String(g.group || g.title || `Группа ${gi + 1}`);
    (g.items || []).forEach((it) => {
      if (!it) return;
      const id = String(it.id ?? "").trim();
      const name = String(it.n || "").trim();
      if (!id || !name) return;
      const w = it.w != null ? Number(it.w) : null;
      out.push({
        id,
        group: groupName,
        name,
        norm: it.t ? String(it.t) : void 0,
        weight: w != null && Number.isFinite(w) ? w : null
      });
    });
  });
  return out;
}
function categoryFromWeight(w, escalated) {
  if (escalated) return "B3";
  if (w === 1) return "B1";
  if (w === 3) return "B3";
  return "B2";
}
function computeChecklistProgress(tmplKey, results) {
  const templateItems = listTemplateChecklistItems(String(tmplKey || (results == null ? void 0 : results.template_key) || ""));
  const byId = new Map(
    ((results == null ? void 0 : results.items) || []).map((it) => [String(it.id), it.status])
  );
  const total = templateItems.length || ((results == null ? void 0 : results.items) || []).length;
  let ok = 0;
  let fail = 0;
  let na = 0;
  let done = 0;
  const sourceIds = templateItems.length > 0 ? templateItems.map((t) => t.id) : ((results == null ? void 0 : results.items) || []).map((it) => String(it.id));
  sourceIds.forEach((id) => {
    const st = byId.get(String(id));
    if (!st) return;
    done += 1;
    if (st === "ok") ok += 1;
    else if (st === "fail" || st === "fail_escalated") fail += 1;
    else if (st === "na") na += 1;
  });
  return {
    total,
    done,
    ok,
    fail,
    na,
    unset: Math.max(0, total - done)
  };
}
function progressLine(p) {
  if (!p.total) return "";
  return `${p.done}/${p.total}`;
}
function computeAcceptanceQualityB(tmplKey, results) {
  var _a, _b, _c;
  const key = String(tmplKey || (results == null ? void 0 : results.template_key) || "").trim();
  const groups = resolveTemplateGroups(key);
  if (!groups.length) return null;
  const getProductMetrics = window.getProductMetrics || ((_c = (_b = (_a = window.RBI) == null ? void 0 : _a.utils) == null ? void 0 : _b.math) == null ? void 0 : _c.getProductMetrics);
  if (typeof getProductMetrics !== "function") return null;
  const productState = {};
  for (const it of (results == null ? void 0 : results.items) || []) {
    if (!(it == null ? void 0 : it.id) || !it.status) continue;
    productState[String(it.id)] = String(it.status);
  }
  if (!Object.keys(productState).length) return null;
  const m = getProductMetrics(productState, groups);
  if (!m || m.final == null) return null;
  return {
    final: Number(m.final) || 0,
    statusTxt: String(m.statusTxt || ""),
    statusCls: String(m.statusCls || ""),
    isDanger: m.isDanger === true,
    reason: String(m.reason || ""),
    checkedCount: Number(m.checkedCount) || 0,
    n_B1_fail: Number(m.n_B1_fail) || 0,
    n_B2_fail: Number(m.n_B2_fail) || 0,
    n_B3_fail: Number(m.n_B3_fail) || 0
  };
}
function pickLatestAcceptanceForB(acceptances) {
  const list = (acceptances || []).filter((a) => a && !a.is_deleted && !a._deleted && String(a.status) !== "rejected").filter((a) => a.checklist_results && (a.checklist_results.items || []).length > 0).slice().sort(
    (a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""))
  );
  return list[0] || null;
}
function listFailBatchCandidates(acceptance, existingDefects) {
  var _a, _b;
  const tmplKey = String(acceptance.template_key || ((_a = acceptance.checklist_results) == null ? void 0 : _a.template_key) || "");
  const templateItems = listTemplateChecklistItems(tmplKey);
  const byId = new Map(templateItems.map((t) => [t.id, t]));
  const locationId = String(acceptance.locationId || "");
  const blockedIds = /* @__PURE__ */ new Set();
  for (const d of existingDefects || []) {
    if (!d || d.is_deleted || d._deleted) continue;
    if (String(d.locationId || "") !== locationId) continue;
    if (!ACTIVE_DEFECT_STATUSES_FOR_BATCH.has(String(d.status || ""))) continue;
    const iid = String(d.item_id || "").trim();
    if (iid) blockedIds.add(iid);
  }
  const out = [];
  for (const row of ((_b = acceptance.checklist_results) == null ? void 0 : _b.items) || []) {
    const st = row == null ? void 0 : row.status;
    if (st !== "fail" && st !== "fail_escalated") continue;
    const id = String(row.id || "").trim();
    if (!id || blockedIds.has(id)) continue;
    const tmpl = byId.get(id);
    const weight = (tmpl == null ? void 0 : tmpl.weight) ?? null;
    out.push({
      id,
      group: (tmpl == null ? void 0 : tmpl.group) || String(row.group || "") || "",
      name: (tmpl == null ? void 0 : tmpl.name) || String(row.name || id),
      norm: tmpl == null ? void 0 : tmpl.norm,
      weight,
      status: st,
      category: categoryFromWeight(weight, st === "fail_escalated")
    });
  }
  return out;
}
function acceptGateWarning(item) {
  var _a;
  const tmplKey = String(item.template_key || ((_a = item.checklist_results) == null ? void 0 : _a.template_key) || "");
  const progress = computeChecklistProgress(tmplKey, item.checklist_results);
  if (!tmplKey) return null;
  if (!item.checklist_results || progress.done === 0) {
    return _t$g("construction.v2.acc.gate_not_started", "Чек-лист ещё не начат. Принять заявку anyway?");
  }
  if (progress.fail > 0) {
    return _t$g("construction.v2.acc.gate_fail", "Есть {count} пункт(ов) FAIL. Принять заявку anyway?", { count: progress.fail });
  }
  if (progress.unset > 0) {
    return _t$g("construction.v2.acc.gate_unset", "Не пройдено {count} пункт(ов) чек-листа. Принять anyway?", { count: progress.unset });
  }
  return null;
}
function _bBadgeHtml(b) {
  if (!b) return "";
  const tone = b.final < 70 || b.isDanger ? "bg-danger-soft text-danger border-danger-soft" : b.final < 85 ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-green-50 text-green-700 border-green-200";
  return `<div class="mt-2 px-2.5 py-2 rounded-xl border ${tone}" data-c2-cl-b>
      <div class="flex items-center justify-between gap-2">
        <span class="text-rbi-caption font-black uppercase">${_escape$f(_t$g("construction.v2.acc.quality_b", "УрК B"))}</span>
        <span class="text-rbi-title font-black" data-c2-cl-b-final>${_escape$f(String(b.final))}%</span>
      </div>
      <div class="text-rbi-caption font-bold mt-0.5 opacity-80" data-c2-cl-b-status>${_escape$f(b.statusTxt || "")}</div>
    </div>`;
}
function renderChecklistSectionHtml(item, opts) {
  var _a;
  const editable = (opts == null ? void 0 : opts.editable) !== false;
  const tmplKey = String(item.template_key || ((_a = item.checklist_results) == null ? void 0 : _a.template_key) || "");
  if (!tmplKey) {
    return `<div class="mt-3 pt-3 border-t border-[var(--card-border)] text-rbi-caption font-bold text-muted">${_escape$f(_t$g("construction.v2.acc.checklist_no_work", "Чек-лист: вид работ не выбран"))}</div>`;
  }
  const templateItems = listTemplateChecklistItems(tmplKey);
  if (!templateItems.length) {
    return `<div class="mt-3 pt-3 border-t border-[var(--card-border)] text-rbi-caption font-bold text-amber-600">${_escape$f(_t$g("construction.v2.acc.checklist_empty", "Чек-лист шаблона пуст или не найден"))}</div>`;
  }
  const progress = computeChecklistProgress(tmplKey, item.checklist_results);
  const b = computeAcceptanceQualityB(tmplKey, item.checklist_results);
  const batchN = (opts == null ? void 0 : opts.batchFailCount) != null ? opts.batchFailCount : listFailBatchCandidates(item, []).length;
  const openBtn = editable ? `<button type="button" data-c2-cl-open
         class="w-full mt-2 bg-brand text-white py-2.5 rounded-xl text-rbi-label font-black uppercase shadow-md">
         ${_escape$f(_t$g("construction.v2.acc.run_checklist", "Пройти чек-лист"))}</button>` : "";
  const batchBtn = editable && batchN > 0 ? `<button type="button" data-c2-cl-batch-fail
           class="w-full mt-2 bg-danger-soft text-danger border border-danger-soft py-2.5 rounded-xl text-rbi-label font-black uppercase">
           ${_escape$f(_t$g("construction.v2.acc.batch_fail_btn", "Создать замечания по FAIL ({count})", { count: batchN }))}</button>` : "";
  return `
    <div class="mt-3 pt-3 border-t border-[var(--card-border)]" data-c2-cl-section>
      <div class="flex items-center justify-between gap-2 mb-1">
        <div class="text-rbi-caption font-black uppercase text-brand">${_escape$f(_t$g("construction.v2.acc.checklist", "Чек-лист"))}</div>
        <div class="text-rbi-caption font-bold text-muted" data-c2-cl-progress>
          ${progress.done}/${progress.total}
          · OK ${progress.ok} · FAIL ${progress.fail} · N/A ${progress.na}
        </div>
      </div>
      <div class="text-rbi-caption text-muted font-bold">
        ${_escape$f(_t$g("construction.v2.acc.checklist_summary", "{items} пункт(ов) · {groups} групп", {
    items: String(templateItems.length),
    groups: String(new Set(templateItems.map((t) => t.group)).size)
  }))}
      </div>
      ${_bBadgeHtml(b)}
      ${openBtn}
      ${batchBtn}
    </div>`;
}
const SLOT_HOURS = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00"
];
function _t$f(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$e(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _normTime(t) {
  const s = String(t || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}
function _isActive(a) {
  if (a.is_deleted || a._deleted) return false;
  const st = String(a.status || "pending").toLowerCase();
  return st === "pending" || st === "accepted";
}
function listSlotOccupancy(acceptances, opts) {
  const date = String(opts.date || "").trim();
  const loc = opts.locationId != null ? String(opts.locationId).trim() : "";
  const dayItems = (acceptances || []).filter((a) => {
    if (!_isActive(a)) return false;
    if (String(a.requested_date || "").trim() !== date) return false;
    if (loc && String(a.locationId || "").trim() !== loc) return false;
    return true;
  });
  return SLOT_HOURS.map((time) => {
    const items = dayItems.filter((a) => _normTime(a.requested_time) === time);
    return { time, taken: items.length > 0, count: items.length, items };
  });
}
function isSlotTaken(acceptances, opts) {
  const date = String(opts.date || "").trim();
  const time = _normTime(opts.time);
  const loc = String(opts.locationId || "").trim();
  const exclude = String(opts.excludeId || "").trim();
  if (!date || !time || !loc) return false;
  return (acceptances || []).some((a) => {
    if (!_isActive(a)) return false;
    if (exclude && String(a.id || "") === exclude) return false;
    if (String(a.requested_date || "").trim() !== date) return false;
    if (_normTime(a.requested_time) !== time) return false;
    return String(a.locationId || "").trim() === loc;
  });
}
function slotTimeOptionsHtml(selected) {
  const sel = _normTime(selected) || "14:00";
  return SLOT_HOURS.map((h) => {
    const nextH = Number(h.slice(0, 2)) + 1;
    const end = `${String(nextH).padStart(2, "0")}:00`;
    const isSel = h === sel ? " selected" : "";
    return `<option value="${h}"${isSel}>${h} - ${end}</option>`;
  }).join("");
}
function slotBoardHtml(occupancy, opts) {
  const title = (opts == null ? void 0 : opts.title) || _t$f("construction.v2.slots.day_title", "Слоты дня");
  const cells = occupancy.map((o) => {
    const cls = o.taken ? "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200" : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300";
    const label = o.taken ? _t$f("construction.v2.slots.taken", "занято{suffix}", { suffix: o.count > 1 ? ` ×${o.count}` : "" }) : _t$f("construction.v2.slots.free", "свободно");
    const tip = o.items.map((i) => String(i.work_type || i.id || "").slice(0, 40)).filter(Boolean).join("; ");
    return `<div class="rounded-xl border px-2 py-1.5 text-center ${cls}" title="${_escape$e(tip)}">
        <div class="text-rbi-caption font-black">${o.time}</div>
        <div class="text-rbi-caption font-bold uppercase tracking-wide">${_escape$e(label)}</div>
      </div>`;
  }).join("");
  return `
    <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3">
      <div class="text-rbi-caption font-black uppercase tracking-widest text-brand mb-2">${_escape$e(title)}</div>
      <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5">${cells}</div>
    </div>`;
}
const APARTMENT_FULL_ZONE = { x: 0, y: 0, w: 100, h: 100 };
function _checklistRunner() {
  var _a, _b;
  return window.ChecklistRunner || (((_b = (_a = window.RBI) == null ? void 0 : _a.shared) == null ? void 0 : _b.checklistRunner) ?? null);
}
function _t$e(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$d(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _defaultDeadline() {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + 14);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function _stripHtml$2(html) {
  return String(html || "").replace(/<br\s*\/?>/gi, " ").replace(/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
function _roleInfo() {
  var _a, _b, _c, _d;
  const perms = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.permissions;
  const role = ((_c = perms == null ? void 0 : perms.getCurrentRole) == null ? void 0 : _c.call(perms)) || "guest";
  const isEngineer = ((_d = perms == null ? void 0 : perms.isEngineerOrAdmin) == null ? void 0 : _d.call(perms)) ?? ["engineer", "manager", "deputy_manager", "admin"].includes(role);
  return { role, isEngineer };
}
function _sysTemplates() {
  return window.SYSTEM_TEMPLATES || {};
}
function _userTemplates() {
  return window.userTemplates || {};
}
async function _fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error(_t$e("construction.form.file_read_error", "Не удалось прочитать файл")));
    r.readAsDataURL(file);
  });
}
async function _pickAndSaveChecklistPhotos() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    const cleanup = () => {
      try {
        input.remove();
      } catch (_) {
      }
    };
    input.addEventListener("change", () => {
      void (async () => {
        try {
          const files = Array.from(input.files || []).filter(
            (f) => f && f.type && f.type.startsWith("image/")
          );
          if (!files.length) {
            cleanup();
            resolve([]);
            return;
          }
          const pm = window.PhotoManager;
          const out = [];
          for (const file of files) {
            const dataUrl = await _fileToDataUrl(file);
            if (!dataUrl.startsWith("data:")) continue;
            if (pm == null ? void 0 : pm.saveLocal) {
              const id = await pm.saveLocal(dataUrl, "cacc", {
                entityType: "construction_acceptance_checklist"
              });
              if (id) out.push(id);
            } else {
              out.push(dataUrl);
            }
          }
          cleanup();
          resolve(out);
        } catch (_) {
          cleanup();
          resolve([]);
        }
      })();
    });
    input.addEventListener("cancel", () => {
      cleanup();
      resolve([]);
    });
    input.click();
  });
}
function _tmplOptions(selected) {
  let html = `<option value="">${_escape$d(_t$e("construction.v2.acc.work_type_select", "-- Выберите вид работ --"))}</option>`;
  const st = _sysTemplates();
  Object.keys(st).sort().forEach((k) => {
    const v = `sys_${k}`;
    html += `<option value="${_escape$d(v)}" ${selected === v ? "selected" : ""}>[СИС] ${_escape$d(st[k].title || k)}</option>`;
  });
  const ut = _userTemplates();
  Object.keys(ut).sort().forEach((k) => {
    const v = `user_${k}`;
    html += `<option value="${_escape$d(v)}" ${selected === v ? "selected" : ""}>[МОЙ] ${_escape$d(ut[k].title || k)}</option>`;
  });
  return html;
}
function _workTitle(key) {
  var _a, _b;
  if (!key) return "";
  if (key.startsWith("sys_")) {
    const k = key.slice(4);
    return ((_a = _sysTemplates()[k]) == null ? void 0 : _a.title) || k;
  }
  if (key.startsWith("user_")) {
    const k = key.slice(5);
    return ((_b = _userTemplates()[k]) == null ? void 0 : _b.title) || k;
  }
  return key;
}
function _contractorSelectHtml(selectedId, opts) {
  var _a, _b;
  if (opts == null ? void 0 : opts.locked) {
    const id = String(opts.lockedId || "").trim();
    const label = id || _t$e("construction.v2.acc.contractor_unlinked", "не привязан");
    return `
      <div>
        <label class="text-rbi-caption font-black text-brand uppercase mb-1 block">${_escape$d(_t$e("construction.form.contractor", "Подрядчик"))}</label>
        <input type="hidden" id="c2-acc-contractor" value="${_escape$d(id)}">
        <div class="input-base text-rbi-body font-bold w-full bg-slate-50 dark:bg-slate-900 text-ink">${_escape$d(
      label
    )} <span class="text-rbi-caption font-bold uppercase text-muted">${_escape$d(_t$e("construction.v2.acc.contractor_yours", "(ваш)"))}</span></div>
      </div>`;
  }
  const svc = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.contractors;
  const rows = typeof (svc == null ? void 0 : svc.list) === "function" ? svc.list() : [];
  const optsHtml = `<option value="">${_escape$d(_t$e("construction.v2.acc.contractor_select", "— выберите подрядчика —"))}</option>` + (rows || []).filter((r) => r && r.id).map((r) => {
    const id = String(r.id);
    const label = String(r.display_name || r.displayName || id);
    const sel = "";
    return `<option value="${_escape$d(id)}"${sel}>${_escape$d(label)}</option>`;
  }).join("");
  return `
    <div>
      <label class="text-rbi-caption font-black text-brand uppercase mb-1 block">${_escape$d(_t$e("construction.form.contractor", "Подрядчик"))} *</label>
      <select id="c2-acc-contractor" class="input-base text-rbi-body font-bold w-full border-brand-soft">${optsHtml}</select>
    </div>`;
}
function _floorLabel(locationId) {
  var _a, _b, _c, _d;
  const loc = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.locations;
  if (loc == null ? void 0 : loc.getPath) {
    return loc.getPath(locationId).map((n) => n.displayName).join(" / ");
  }
  return ((_d = (_c = loc == null ? void 0 : loc.getNode) == null ? void 0 : _c.call(loc, locationId)) == null ? void 0 : _d.displayName) || locationId;
}
function _locationNodeType(locationId) {
  var _a, _b, _c, _d;
  const loc = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.locations;
  return String(((_d = (_c = loc == null ? void 0 : loc.getNode) == null ? void 0 : _c.call(loc, locationId)) == null ? void 0 : _d.nodeType) || "");
}
function _listDefectsForLocation(locationId) {
  const dSvc = _defects$1();
  if (!dSvc) return [];
  if (typeof dSvc.listForLocation === "function") return dSvc.listForLocation(locationId) || [];
  if (typeof dSvc.list === "function") return dSvc.list({ locationId }) || [];
  return [];
}
function _today$4() {
  const d = /* @__PURE__ */ new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function _acc$5() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionAcceptance) || null;
}
function _defects$1() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionDefects) || null;
}
function _zoneCenter(zone) {
  if (!zone) return { x: 50, y: 50 };
  return {
    x: Number(zone.x) + Number(zone.w) / 2,
    y: Number(zone.y) + Number(zone.h) / 2
  };
}
function openCreateAcceptanceForm(ctx, onSave, onCancel) {
  var _a, _b, _c, _d;
  const { role } = _roleInfo();
  if (role === "guest") {
    (_a = window.showToast) == null ? void 0 : _a.call(window, _t$e("construction.v2.acc.guest_blocked", "⚠️ Гости не могут предъявлять работы"));
    onCancel == null ? void 0 : onCancel();
    return;
  }
  const isContractor = role === "contractor" || isContractorRole();
  const myContractorId = isContractor ? resolveMyContractorId() : null;
  if (isContractor && !myContractorId) {
    (_b = window.showToast) == null ? void 0 : _b.call(window, _t$e("construction.v2.acc.contractor_unbound", "⚠️ Подрядчик не привязан к профилю — заявку создать нельзя"));
    onCancel == null ? void 0 : onCancel();
    return;
  }
  const isApartment = ctx.mode === "apartment" || _locationNodeType(ctx.locationId) === "apartment";
  const path = _floorLabel(ctx.locationId);
  const zoneBadge = isApartment ? `<span class="bg-brand-soft text-brand px-2 py-0.5 rounded text-rbi-caption font-black border border-brand-soft">${_escape$d(_t$e("construction.v2.acc.badge_apartment", "Квартира"))}</span>` : `<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-rbi-caption font-black border border-blue-200">${_escape$d(_t$e("construction.v2.acc.badge_zone", "✅ Зона выделена"))}</span>`;
  const roomVolHtml = isApartment ? `<div>
         <label class="text-rbi-caption font-bold text-muted uppercase mb-1 block">${_escape$d(_t$e("construction.v2.acc.volume", "Объем"))}</label>
         <input type="text" id="c2-acc-vol" class="input-base text-rbi-body w-full" placeholder="${_escape$d(_t$e("construction.v2.acc.volume_ph", "Напр: 45 м2"))}">
       </div>` : `<div class="grid grid-cols-2 gap-2">
         <div>
           <label class="text-rbi-caption font-bold text-muted uppercase mb-1 block">${_escape$d(_t$e("construction.v2.acc.axes", "Оси / Захватка"))}</label>
           <input type="text" id="c2-acc-room" class="input-base text-rbi-body w-full" placeholder="${_escape$d(_t$e("construction.v2.acc.axes_ph", "Напр: Оси А-Б"))}" value="${_escape$d(ctx.zone.room || "")}">
         </div>
         <div>
           <label class="text-rbi-caption font-bold text-muted uppercase mb-1 block">${_escape$d(_t$e("construction.v2.acc.volume", "Объем"))}</label>
           <input type="text" id="c2-acc-vol" class="input-base text-rbi-body w-full" placeholder="${_escape$d(_t$e("construction.v2.acc.volume_ph", "Напр: 45 м2"))}">
         </div>
       </div>`;
  const contractorHtml = _contractorSelectHtml(null, {
    locked: isContractor,
    lockedId: myContractorId
  });
  const html = `
    <div id="c2-acc-request-modal" class="fixed inset-0 bg-slate-900/80 z-[6000] flex items-center justify-center p-4 backdrop-blur-sm">
      <div class="bg-[var(--card-bg)] w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-[var(--card-border)]" data-c2-acc-panel>
        <div class="p-4 bg-brand border-b border-brand-hover flex justify-between items-center">
          <h3 class="font-black text-rbi-body uppercase text-white">${isApartment ? _escape$d(_t$e("construction.v2.acc.title_apartment", "📝 Приёмка квартиры (v2)")) : _escape$d(_t$e("construction.v2.acc.title_request", "📝 Заявка на приемку (v2)"))}</h3>
          <button type="button" data-c2-acc-close class="text-white/80 hover:text-white font-black text-lg leading-none">✕</button>
        </div>
        <div class="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div class="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-surface">
            <div class="text-rbi-caption font-black text-brand uppercase mb-1 flex justify-between">
              <span>${_escape$d(_t$e("construction.v2.acc.location", "Локация"))}</span>
              ${zoneBadge}
            </div>
            <div class="text-rbi-body font-bold text-ink">${_escape$d(path)}</div>
          </div>
          <div>
            <label class="text-rbi-caption font-black text-brand uppercase mb-1 block">${_escape$d(_t$e("construction.v2.acc.work_type", "Вид работ *"))}</label>
            <select id="c2-acc-work" class="input-base text-rbi-body font-bold mb-2 border-brand-soft w-full">
              ${_tmplOptions()}
            </select>
            ${roomVolHtml}
          </div>
          ${contractorHtml}
          <div class="pt-2 border-t border-surface">
            <label class="text-rbi-caption font-black text-brand uppercase mb-2 block">${_escape$d(_t$e("construction.v2.acc.when_ready", "Когда готовы сдать?"))}</label>
            <div class="grid grid-cols-2 gap-2">
              <input type="date" id="c2-acc-date" class="input-base text-rbi-body font-bold w-full" value="${_today$4()}">
              <select id="c2-acc-time" class="input-base text-rbi-body font-bold w-full">
                ${slotTimeOptionsHtml("14:00")}
              </select>
            </div>
          </div>
        </div>
        <div class="p-3 border-t border-[var(--card-border)] bg-slate-50 dark:bg-slate-900/50 flex gap-2">
          <button type="button" data-c2-acc-close class="flex-1 bg-slate-100 text-ink py-3 rounded-xl text-rbi-label font-bold uppercase border border-surface">${_escape$d(_t$e("construction.form.cancel", "Отмена"))}</button>
          <button type="button" data-c2-acc-save class="flex-[1.5] bg-brand text-white py-3 rounded-xl text-rbi-label font-black uppercase shadow-md">${_escape$d(_t$e("construction.v2.acc.submit", "Отправить"))}</button>
        </div>
      </div>
    </div>`;
  (_c = document.getElementById("c2-acc-request-modal")) == null ? void 0 : _c.remove();
  document.body.insertAdjacentHTML("beforeend", html);
  const modal = document.getElementById("c2-acc-request-modal");
  if (!modal) return;
  const close = () => {
    modal.remove();
    onCancel == null ? void 0 : onCancel();
  };
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) close();
  });
  modal.querySelectorAll("[data-c2-acc-close]").forEach((btn) => btn.addEventListener("click", close));
  (_d = modal.querySelector("[data-c2-acc-save]")) == null ? void 0 : _d.addEventListener("click", () => {
    var _a2, _b2, _c2, _d2, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
    const workKey = ((_a2 = document.getElementById("c2-acc-work")) == null ? void 0 : _a2.value) || "";
    const room = isApartment ? "" : ((_c2 = (_b2 = document.getElementById("c2-acc-room")) == null ? void 0 : _b2.value) == null ? void 0 : _c2.trim()) || "";
    const vol = ((_e = (_d2 = document.getElementById("c2-acc-vol")) == null ? void 0 : _d2.value) == null ? void 0 : _e.trim()) || "";
    const dateStr = ((_f = document.getElementById("c2-acc-date")) == null ? void 0 : _f.value) || "";
    const timeStr = ((_g = document.getElementById("c2-acc-time")) == null ? void 0 : _g.value) || "";
    let contractorId = isContractor ? myContractorId : ((_i = (_h = document.getElementById("c2-acc-contractor")) == null ? void 0 : _h.value) == null ? void 0 : _i.trim()) || null;
    if (!workKey || !dateStr) {
      (_j = window.showToast) == null ? void 0 : _j.call(window, _t$e("construction.v2.acc.toast_fill_work_date", "⚠️ Заполните вид работ и дату"));
      return;
    }
    if (!isContractor && !contractorId) {
      (_k = window.showToast) == null ? void 0 : _k.call(window, _t$e("construction.v2.acc.toast_select_contractor", "⚠️ Выберите подрядчика"));
      return;
    }
    const accListSvc = (_m = (_l = window.RBI) == null ? void 0 : _l.services) == null ? void 0 : _m.constructionAcceptance;
    const existing = ((_n = accListSvc == null ? void 0 : accListSvc.list) == null ? void 0 : _n.call(accListSvc)) || [];
    if (isSlotTaken(existing, {
      date: dateStr,
      time: timeStr,
      locationId: ctx.locationId
    })) {
      const ok = window.confirm(
        _t$e("construction.v2.acc.slot_conflict", "На это время уже есть активная заявка по этой локации. Всё равно отправить?")
      );
      if (!ok) return;
    }
    const baseZone = isApartment ? { ...APARTMENT_FULL_ZONE } : { ...ctx.zone };
    const zone = { ...baseZone, room: room || null };
    void Promise.resolve(
      onSave({
        locationId: ctx.locationId,
        zone,
        template_key: workKey,
        work_type: _workTitle(workKey),
        volume: vol || null,
        requested_date: dateStr,
        requested_time: timeStr || null,
        contractorId: contractorId || null
      })
    ).then(() => modal.remove());
  });
}
function openAcceptanceDetails(item, handlers) {
  var _a, _b, _c, _d, _e;
  const { isEngineer, role } = _roleInfo();
  const path = _floorLabel(item.locationId);
  const status = String(item.status || "pending");
  const editable = isEngineer && status === "pending";
  const defectsForLoc = _listDefectsForLocation(item.locationId);
  const batchCandidates = listFailBatchCandidates(item, defectsForLoc);
  let actions = "";
  if (status === "pending") {
    if (isEngineer) {
      actions = `
        <div class="flex flex-col gap-2 mt-4 pt-4 border-t border-[var(--card-border)]">
          <button type="button" data-c2-acc-focus class="w-full bg-slate-100 text-ink border border-surface py-3 rounded-xl font-black text-rbi-label uppercase">${_escape$d(_t$e("construction.v2.acc.show_on_plan", "🗺️ Показать на плане"))}</button>
          <div class="flex gap-2">
            <button type="button" data-c2-acc-status="accepted" class="flex-1 bg-green-50 text-green-600 border border-green-200 py-3 rounded-xl font-bold text-rbi-caption uppercase">${_escape$d(_t$e("construction.form.action_accept", "✅ Принять"))}</button>
            <button type="button" data-c2-acc-status="rejected" class="flex-1 bg-danger-soft text-danger border border-danger-soft py-3 rounded-xl font-bold text-rbi-caption uppercase">${_escape$d(_t$e("construction.form.action_reject", "❌ Отклонить"))}</button>
          </div>
        </div>`;
    } else if (role !== "guest") {
      actions = `
        <div class="mt-4 pt-4 border-t border-[var(--card-border)] text-center">
          <div class="text-rbi-label font-bold text-blue-500 uppercase tracking-widest mb-3">${_escape$d(_t$e("construction.v2.acc.engineer_reviewing", "⏳ Инженер проверяет заявку..."))}</div>
          <button type="button" data-c2-acc-revoke class="w-full bg-danger-soft text-danger py-3 rounded-xl font-bold text-rbi-caption uppercase border border-danger-soft">${_escape$d(_t$e("construction.v2.acc.revoke", "Отозвать заявку"))}</button>
        </div>`;
    }
  } else if (isEngineer) {
    actions = `
      <div class="mt-4 pt-4 border-t border-[var(--card-border)]">
        <button type="button" data-c2-acc-focus class="w-full bg-slate-100 text-ink border border-surface py-3 rounded-xl font-black text-rbi-label uppercase mb-2">${_escape$d(_t$e("construction.v2.acc.show_on_plan", "🗺️ Показать на плане"))}</button>
        <button type="button" data-c2-acc-status="pending" class="w-full bg-slate-100 text-ink py-3 rounded-xl font-bold text-rbi-caption uppercase border border-surface">${_escape$d(_t$e("construction.v2.acc.return_pending", "Вернуть в pending"))}</button>
      </div>`;
  } else {
    actions = `
      <div class="mt-4 pt-4 border-t border-[var(--card-border)]">
        <button type="button" data-c2-acc-focus class="w-full bg-slate-100 text-ink border border-surface py-3 rounded-xl font-black text-rbi-label uppercase">${_escape$d(_t$e("construction.v2.acc.show_on_plan", "🗺️ Показать на плане"))}</button>
      </div>`;
  }
  const html = `
    <div id="c2-acc-details-modal" class="fixed inset-0 bg-slate-900/80 z-[6000] flex items-center justify-center p-4 backdrop-blur-sm">
      <div class="bg-[var(--card-bg)] w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-[var(--card-border)]" data-c2-acc-panel>
        <div class="p-4 border-b border-[var(--card-border)] flex justify-between items-center">
          <h3 class="font-black text-rbi-body uppercase">${_escape$d(_t$e("construction.v2.acc.details_title", "Заявка · {status}", { status }))}</h3>
          <button type="button" data-c2-acc-dclose class="text-muted font-black text-lg">✕</button>
        </div>
        <div class="p-4 text-rbi-body space-y-2 max-h-[75vh] overflow-y-auto">
          <div><span class="text-rbi-caption font-black uppercase text-muted">${_escape$d(_t$e("construction.v2.acc.location", "Локация"))}</span><div class="font-bold">${_escape$d(path)}</div></div>
          <div><span class="text-rbi-caption font-black uppercase text-muted">${_escape$d(_t$e("construction.v2.acc.work_type_view", "Вид работ"))}</span><div class="font-bold">${_escape$d(item.work_type || "—")}</div></div>
          <div class="grid grid-cols-2 gap-2">
            <div><span class="text-rbi-caption font-black uppercase text-muted">${_escape$d(_t$e("construction.v2.acc.volume", "Объем"))}</span><div class="font-bold">${_escape$d(item.volume || "—")}</div></div>
            <div><span class="text-rbi-caption font-black uppercase text-muted">${_escape$d(_t$e("construction.v2.acc.axes_view", "Оси"))}</span><div class="font-bold">${_escape$d(((_a = item.zone) == null ? void 0 : _a.room) || "—")}</div></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><span class="text-rbi-caption font-black uppercase text-muted">${_escape$d(_t$e("construction.v2.acc.date", "Дата"))}</span><div class="font-bold">${_escape$d(item.requested_date || "—")}</div></div>
            <div><span class="text-rbi-caption font-black uppercase text-muted">${_escape$d(_t$e("construction.v2.acc.time", "Время"))}</span><div class="font-bold">${_escape$d(item.requested_time || "—")}</div></div>
          </div>
          ${renderChecklistSectionHtml(item, { editable, batchFailCount: batchCandidates.length })}
          ${actions}
        </div>
      </div>
    </div>`;
  (_b = document.getElementById("c2-acc-details-modal")) == null ? void 0 : _b.remove();
  document.body.insertAdjacentHTML("beforeend", html);
  const modal = document.getElementById("c2-acc-details-modal");
  if (!modal) return;
  let current = item;
  const close = () => modal.remove();
  const openDefectFromChecklist = (meta) => {
    var _a2;
    const dSvc = _defects$1();
    if (!dSvc) {
      (_a2 = window.showToast) == null ? void 0 : _a2.call(window, _t$e("construction.v2.svc_defects_missing", "service.constructionDefects не загружен"));
      return;
    }
    const center = _zoneCenter(current.zone);
    openCreateDefectForm(
      { locationId: current.locationId, x: center.x, y: center.y },
      async (input) => {
        var _a3, _b2;
        await dSvc.create({
          locationId: input.locationId,
          x: input.x,
          y: input.y,
          description: input.description,
          category: input.category,
          contractorId: input.contractorId,
          deadline: input.deadline,
          template_key: input.template_key,
          item_id: input.item_id,
          item_name: input.item_name,
          norm_text: input.norm_text,
          photos: input.photos,
          status: "issued"
        });
        (_a3 = window.showToast) == null ? void 0 : _a3.call(window, _t$e("construction.v2.acc.defect_created", "Замечание создано"));
        refreshChecklistUi(((_b2 = _acc$5()) == null ? void 0 : _b2.get(current.id)) || current);
      },
      void 0,
      {
        template_key: current.template_key || null,
        item_id: meta.id || null,
        item_name: meta.name || null,
        norm_text: meta.norm || null,
        description: meta.name || null
      }
    );
  };
  const createBatchFailDefects = async () => {
    var _a2, _b2, _c2, _d2, _e2, _f;
    const dSvc = _defects$1();
    if (!dSvc) {
      (_a2 = window.showToast) == null ? void 0 : _a2.call(window, _t$e("construction.v2.svc_defects_missing", "service.constructionDefects не загружен"));
      return;
    }
    const latest = ((_b2 = _acc$5()) == null ? void 0 : _b2.get(current.id)) || current;
    const candidates = listFailBatchCandidates(latest, _listDefectsForLocation(latest.locationId));
    if (!candidates.length) {
      (_c2 = window.showToast) == null ? void 0 : _c2.call(window, _t$e("construction.v2.acc.no_fail_without_defect", "Нет FAIL без активного замечания"));
      refreshChecklistUi(latest);
      return;
    }
    if (!window.confirm(_t$e("construction.v2.acc.batch_fail_confirm", "Создать {count} замечани(й) по FAIL без формы?", { count: candidates.length }))) return;
    const center = _zoneCenter(latest.zone);
    let created = 0;
    for (const c of candidates) {
      try {
        await dSvc.create({
          locationId: latest.locationId,
          x: center.x,
          y: center.y,
          description: c.name || c.id,
          category: c.category,
          contractorId: latest.contractorId || null,
          deadline: _defaultDeadline(),
          template_key: latest.template_key || null,
          item_id: c.id,
          item_name: c.name || null,
          norm_text: _stripHtml$2(c.norm || "") || null,
          photos: [],
          status: "issued"
        });
        created += 1;
      } catch (e) {
        console.warn("[acceptance-form] batch fail create", e);
      }
    }
    (_d2 = window.showToast) == null ? void 0 : _d2.call(window, created ? _t$e("construction.v2.acc.batch_created", "Создано замечаний: {count}", { count: created }) : _t$e("construction.v2.acc.batch_failed", "Не удалось создать замечания"));
    refreshChecklistUi(((_e2 = _acc$5()) == null ? void 0 : _e2.get(current.id)) || latest);
    await ((_f = handlers.onChecklistChanged) == null ? void 0 : _f.call(handlers, current.id));
  };
  const refreshChecklistUi = (next) => {
    current = next;
    const section = modal.querySelector("[data-c2-cl-section]");
    if (!section) return;
    const batchN = listFailBatchCandidates(next, _listDefectsForLocation(next.locationId)).length;
    const tmp = document.createElement("div");
    tmp.innerHTML = renderChecklistSectionHtml(next, { editable, batchFailCount: batchN });
    const fresh = tmp.firstElementChild;
    if (fresh) section.replaceWith(fresh);
    bindChecklistActions(modal);
  };
  const openChecklistRunner = () => {
    var _a2, _b2, _c2, _d2;
    const runner = _checklistRunner();
    if (!runner) {
      (_a2 = window.showToast) == null ? void 0 : _a2.call(window, _t$e("construction.v2.acc.checklist_runner_missing", "ChecklistRunner не загружен"));
      return;
    }
    const tmplKey = String(current.template_key || ((_b2 = current.checklist_results) == null ? void 0 : _b2.template_key) || "");
    if (!tmplKey) {
      (_c2 = window.showToast) == null ? void 0 : _c2.call(window, _t$e("construction.v2.acc.work_not_selected", "Вид работ не выбран"));
      return;
    }
    const groups = resolveTemplateGroups(tmplKey);
    if (!groups.length) {
      (_d2 = window.showToast) == null ? void 0 : _d2.call(window, _t$e("construction.v2.acc.checklist_empty", "Чек-лист шаблона пуст или не найден"));
      return;
    }
    const title = _workTitle(tmplKey) || current.work_type || _t$e("construction.v2.acc.checklist_title", "Чек-лист");
    const rowOf = (id) => {
      var _a3, _b3;
      const latest = ((_a3 = _acc$5()) == null ? void 0 : _a3.get(current.id)) || current;
      return (((_b3 = latest.checklist_results) == null ? void 0 : _b3.items) || []).find((it) => String(it.id) === String(id));
    };
    const persistItem = async (id, itemMeta, patch) => {
      var _a3;
      const acc = _acc$5();
      if (!acc) throw new Error(_t$e("construction.v2.svc_acc_missing", "service.constructionAcceptance не загружен"));
      const updated = await acc.setChecklistItem(current.id, {
        id,
        name: itemMeta.name || id,
        group: itemMeta.group || null,
        status: patch.status,
        comment: patch.comment,
        photos: patch.photos,
        clearExtras: patch.clearExtras
      });
      current = updated;
      await ((_a3 = handlers.onChecklistChanged) == null ? void 0 : _a3.call(handlers, current.id));
      return updated;
    };
    const clearItem = async (id) => {
      var _a3;
      const acc = _acc$5();
      if (!acc) throw new Error(_t$e("construction.v2.svc_acc_missing", "service.constructionAcceptance не загружен"));
      const latest = acc.get(current.id) || current;
      const prev = latest.checklist_results;
      if (!prev) return;
      const items = (prev.items || []).filter((it) => String(it.id) !== String(id));
      const updated = await acc.setChecklistResults(current.id, {
        template_key: prev.template_key,
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        items
      });
      current = updated;
      await ((_a3 = handlers.onChecklistChanged) == null ? void 0 : _a3.call(handlers, current.id));
    };
    runner.open({
      title,
      templateKey: tmplKey,
      groups,
      features: {
        na: true,
        failAction: true,
        batchFail: editable,
        norms: true,
        weightTag: true,
        photos: true,
        comments: true,
        help: true,
        escalate: true,
        swipe: true,
        collapse: true
      },
      getStatus: (id) => {
        var _a3;
        const st = (_a3 = rowOf(id)) == null ? void 0 : _a3.status;
        if (st === "ok" || st === "fail" || st === "na" || st === "fail_escalated") return st;
        return null;
      },
      getItemDetails: (id) => {
        const row = rowOf(id);
        return {
          comment: (row == null ? void 0 : row.comment) || "",
          photos: Array.isArray(row == null ? void 0 : row.photos) ? row.photos.slice() : []
        };
      },
      setStatus: async (id, status2, itemMeta) => {
        if (status2 == null || status2 === "") {
          await clearItem(id);
          return;
        }
        const st = status2;
        if (st !== "ok" && st !== "fail" && st !== "na" && st !== "fail_escalated") {
          throw new Error(_t$e("construction.v2.acc.invalid_item_status", "Некорректный статус пункта"));
        }
        const clearExtras = st === "ok" || st === "na";
        await persistItem(id, itemMeta, {
          status: st,
          clearExtras: clearExtras || void 0,
          // при переходе на fail сохраняем extras; при ok/na — clear
          photos: clearExtras ? null : void 0,
          comment: clearExtras ? null : void 0
        });
      },
      setItemComment: async (id, comment, itemMeta) => {
        const row = rowOf(id);
        const st = row == null ? void 0 : row.status;
        if (st !== "fail" && st !== "fail_escalated") {
          throw new Error(_t$e("construction.v2.acc.comment_fail_only", "Комментарий только для FAIL"));
        }
        await persistItem(id, itemMeta, {
          status: st,
          comment: comment || null
        });
      },
      addItemPhoto: async (id, itemMeta) => {
        const row = rowOf(id);
        const st = row == null ? void 0 : row.status;
        if (st !== "ok" && st !== "fail" && st !== "fail_escalated") {
          throw new Error(_t$e("construction.v2.acc.mark_item_first", "Сначала отметьте пункт OK или FAIL"));
        }
        const added = await _pickAndSaveChecklistPhotos();
        if (!added.length) return;
        const photos = (Array.isArray(row == null ? void 0 : row.photos) ? row.photos.slice() : []).concat(added);
        await persistItem(id, itemMeta, { status: st, photos });
      },
      removeItemPhoto: async (id, index2, itemMeta) => {
        const row = rowOf(id);
        const st = row == null ? void 0 : row.status;
        if (!st) throw new Error(_t$e("construction.v2.acc.item_no_status", "Пункт без статуса"));
        const photos = Array.isArray(row == null ? void 0 : row.photos) ? row.photos.slice() : [];
        if (index2 < 0 || index2 >= photos.length) return;
        photos.splice(index2, 1);
        await persistItem(id, itemMeta, {
          status: st,
          photos: photos.length ? photos : null
        });
      },
      onHelp: (id, event, itemMeta) => {
        var _a3, _b3, _c3;
        const helpCtx = { templateKey: tmplKey, checklist: groups };
        const svc = (_b3 = (_a3 = window.RBI) == null ? void 0 : _a3.services) == null ? void 0 : _b3.knowledge;
        if (svc && typeof svc.openItemHelp === "function") {
          svc.openItemHelp(id, event, helpCtx);
          return;
        }
        const openMenu = window.openItemHelpMenu;
        if (typeof openMenu === "function") {
          openMenu(id, event, helpCtx);
          return;
        }
        (_c3 = window.showToast) == null ? void 0 : _c3.call(window, _t$e("construction.v2.acc.knowledge_unavailable", "База знаний недоступна"));
      },
      onEscalate: async (id, itemMeta) => {
        const row = rowOf(id);
        const st = row == null ? void 0 : row.status;
        if (st === "fail_escalated") {
          await persistItem(id, itemMeta, { status: "fail" });
        } else if (st === "fail") {
          await persistItem(id, itemMeta, { status: "fail_escalated" });
        }
      },
      onFailAction: (meta) => {
        openDefectFromChecklist(meta);
      },
      onBatchFailAction: async () => {
        await createBatchFailDefects();
      },
      onClose: () => {
        var _a3;
        const latest = ((_a3 = _acc$5()) == null ? void 0 : _a3.get(current.id)) || current;
        refreshChecklistUi(latest);
      }
    });
  };
  const bindChecklistActions = (root) => {
    root.querySelectorAll("[data-c2-cl-open]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openChecklistRunner();
      });
    });
    root.querySelectorAll("[data-c2-cl-batch-fail]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void createBatchFailDefects();
      });
    });
  };
  bindChecklistActions(modal);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) close();
  });
  (_c = modal.querySelector("[data-c2-acc-dclose]")) == null ? void 0 : _c.addEventListener("click", close);
  (_d = modal.querySelector("[data-c2-acc-focus]")) == null ? void 0 : _d.addEventListener("click", () => {
    var _a2;
    close();
    (_a2 = handlers.onFocusPlan) == null ? void 0 : _a2.call(handlers, item.id);
  });
  modal.querySelectorAll("[data-c2-acc-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      var _a2, _b2;
      const st = btn.getAttribute("data-c2-acc-status");
      const latest = ((_a2 = _acc$5()) == null ? void 0 : _a2.get(current.id)) || current;
      if (st === "accepted") {
        const warn = acceptGateWarning(latest);
        if (warn && !window.confirm(warn)) return;
      }
      void Promise.resolve((_b2 = handlers.onChangeStatus) == null ? void 0 : _b2.call(handlers, item.id, st)).then(() => close());
    });
  });
  (_e = modal.querySelector("[data-c2-acc-revoke]")) == null ? void 0 : _e.addEventListener("click", () => {
    var _a2;
    void Promise.resolve((_a2 = handlers.onSoftDelete) == null ? void 0 : _a2.call(handlers, item.id)).then(() => close());
  });
}
function _t$d(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$c(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _acc$4() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionAcceptance) || null;
}
function _loc$4() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.locations) || null;
}
let _filterObjectId$1 = null;
let _slotsDate$1 = null;
let _bound$5 = false;
function _today$3() {
  const d = /* @__PURE__ */ new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function _objectIdForFloor$1(loc, floorId) {
  var _a;
  const path = loc.getPath(floorId);
  const obj = path.find((n) => n.nodeType === "object");
  return (obj == null ? void 0 : obj.id) || ((_a = path[0]) == null ? void 0 : _a.id) || null;
}
function _cardHtml$1(r, loc) {
  const path = loc.getPath(r.locationId).map((n) => n.displayName).join(" · ");
  const overdue = r.status === "pending" && r.requested_date && new Date(r.requested_date).setHours(0, 0, 0, 0) < (/* @__PURE__ */ new Date()).setHours(0, 0, 0, 0);
  const progress = computeChecklistProgress(r.template_key, r.checklist_results);
  const progressHtml = progress.total > 0 && (r.checklist_results || progress.done > 0) ? `<div class="mt-1.5 text-rbi-caption font-black uppercase tracking-wide text-brand">${_escape$c(progressLine(progress))}${progress.fail ? ` · FAIL ${progress.fail}` : ""}</div>` : progress.total > 0 ? `<div class="mt-1.5 text-rbi-caption font-bold text-muted">${_escape$c(_t$d("construction.v2.kanban.checklist_progress", "Чек-лист 0/{total}", { total: progress.total }))}</div>` : "";
  return `
    <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 mb-3 shadow-sm cursor-pointer hover:border-brand transition-colors"
         data-c2-acc-card="${_escape$c(r.id)}">
      <div class="flex justify-between items-start gap-2 mb-1">
        <div class="text-rbi-label font-black text-ink leading-tight">${_escape$c(r.work_type || _t$d("construction.v2.kanban.no_work_type", "Без вида работ"))}</div>
        ${overdue ? `<span class="text-rbi-caption font-black uppercase text-danger bg-danger-soft px-1.5 py-0.5 rounded">${_escape$c(_t$d("construction.v2.registry.overdue", "просрочено"))}</span>` : ""}
      </div>
      <div class="text-rbi-caption text-muted font-bold mb-2">${_escape$c(path || r.locationId)}</div>
      <div class="flex justify-between items-center text-rbi-caption">
        <span class="font-bold text-ink">${_escape$c(r.requested_date || "—")} ${_escape$c(r.requested_time || "")}</span>
        <button type="button" data-c2-acc-plan="${_escape$c(r.id)}"
          class="text-brand bg-white border border-brand-soft px-2 py-1 rounded text-rbi-caption font-bold">${_escape$c(_t$d("construction.v2.kanban.plan_btn", "План"))}</button>
      </div>
      ${r.volume ? `<div class="mt-1 text-rbi-caption text-muted font-bold">${_escape$c(r.volume)}</div>` : ""}
      ${progressHtml}
    </div>`;
}
function _column$1(title, color, items, loc) {
  return `
    <div class="flex-1 min-w-[220px] bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-surface p-2">
      <div class="flex items-center justify-between px-1 mb-2">
        <span class="text-rbi-caption font-black uppercase tracking-widest ${color}">${_escape$c(title)}</span>
        <span class="bg-surface text-ink px-1.5 py-0.5 rounded shadow-sm border border-surface text-rbi-caption font-bold">${items.length}</span>
      </div>
      <div class="max-h-[55vh] overflow-y-auto">
        ${items.length ? items.map((r) => _cardHtml$1(r, loc)).join("") : `<div class="text-center py-4 text-rbi-caption font-bold text-muted border border-dashed border-surface rounded-xl">${_escape$c(_t$d("construction.v2.kanban.no_requests", "Заявок нет"))}</div>`}
      </div>
    </div>`;
}
async function renderAcceptanceKanban(root) {
  const acc = _acc$4();
  const loc = _loc$4();
  if (!acc || !loc) {
    root.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">${_escape$c(_t$d("construction.v2.kanban.svc_missing", "constructionAcceptance / locations не загружены"))}</div>`;
    return;
  }
  await loc.init();
  await acc.init();
  const objects = loc.listNodes({ nodeType: "object", parentId: null });
  const objOpts = `<option value="">${_escape$c(_t$d("construction.v2.kanban.all_objects", "Все объекты"))}</option>` + objects.map(
    (o) => `<option value="${_escape$c(o.id)}" ${_filterObjectId$1 === o.id ? "selected" : ""}>${_escape$c(o.displayName)}</option>`
  ).join("");
  let all = filterAcceptancesForRole(acc.list());
  if (_filterObjectId$1) {
    all = all.filter((r) => _objectIdForFloor$1(loc, r.locationId) === _filterObjectId$1);
  }
  const pending = all.filter((r) => r.status === "pending");
  const rejected = all.filter((r) => r.status === "rejected");
  const accepted = all.filter((r) => r.status === "accepted");
  const slotsDate = _slotsDate$1 || _today$3();
  const occupancy = listSlotOccupancy(all, { date: slotsDate });
  root.innerHTML = `
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape$c(_t$d("construction.v2.kanban.title", "Канбан приёмки (v2)"))}</div>
        <select id="c2-acc-obj-filter" class="input-base text-rbi-label font-bold max-w-[220px]">${objOpts}</select>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <label class="text-rbi-caption font-black uppercase text-muted" for="c2-acc-slots-date">${_escape$c(_t$d("construction.v2.kanban.slots_day", "Слоты дня"))}</label>
        <input type="date" id="c2-acc-slots-date" class="input-base text-rbi-label font-bold max-w-[160px]" value="${_escape$c(
    slotsDate
  )}">
      </div>
      ${slotBoardHtml(occupancy, { title: _t$d("construction.v2.slots.occupancy", "Занятость {date}", { date: slotsDate }) })}
      <div class="flex flex-col lg:flex-row gap-3">
        ${_column$1(_t$d("construction.v2.kanban.col_pending", "Ожидают"), "text-blue-600", pending, loc)}
        ${_column$1(_t$d("construction.v2.kanban.col_rejected", "Отклонены"), "text-danger", rejected, loc)}
        ${_column$1(_t$d("construction.v2.kanban.col_accepted", "Приняты"), "text-green-600", accepted, loc)}
      </div>
    </div>`;
  _bindOnce$4();
}
function _bindOnce$4() {
  if (_bound$5) return;
  _bound$5 = true;
  document.addEventListener(
    "change",
    (ev) => {
      const t = ev.target;
      if ((t == null ? void 0 : t.id) === "c2-acc-obj-filter") {
        _filterObjectId$1 = t.value || null;
        const root = document.getElementById("construction-v2-root");
        if (root) renderAcceptanceKanban(root).catch(() => {
        });
      }
      if ((t == null ? void 0 : t.id) === "c2-acc-slots-date") {
        _slotsDate$1 = t.value || null;
        const root = document.getElementById("construction-v2-root");
        if (root) renderAcceptanceKanban(root).catch(() => {
        });
      }
    },
    true
  );
  document.addEventListener(
    "click",
    (ev) => {
      var _a, _b;
      const t = ev.target;
      const planBtn = (_a = t == null ? void 0 : t.closest) == null ? void 0 : _a.call(t, "[data-c2-acc-plan]");
      if (planBtn) {
        ev.stopPropagation();
        const id = planBtn.getAttribute("data-c2-acc-plan");
        if (id) focusAcceptanceOnPlan(id);
        return;
      }
      const card = (_b = t == null ? void 0 : t.closest) == null ? void 0 : _b.call(t, "[data-c2-acc-card]");
      if (card) {
        const id = card.getAttribute("data-c2-acc-card");
        if (!id) return;
        const acc = _acc$4();
        const item = acc == null ? void 0 : acc.get(id);
        if (!item || !acc) return;
        openAcceptanceDetails(item, {
          onFocusPlan: (rid) => focusAcceptanceOnPlan(rid),
          onChangeStatus: async (rid, status) => {
            var _a2;
            await acc.changeStatus(rid, status);
            (_a2 = window.showToast) == null ? void 0 : _a2.call(window, _t$d("construction.v2.status_updated", "✅ Статус обновлён"));
            const root = document.getElementById("construction-v2-root");
            if (root) await renderAcceptanceKanban(root);
          },
          onSoftDelete: async (rid) => {
            var _a2;
            await acc.softDelete(rid);
            (_a2 = window.showToast) == null ? void 0 : _a2.call(window, _t$d("construction.v2.acc_revoked", "Заявка отозвана"));
            const root = document.getElementById("construction-v2-root");
            if (root) await renderAcceptanceKanban(root);
          },
          onChecklistChanged: async () => {
            const root = document.getElementById("construction-v2-root");
            if (root) await renderAcceptanceKanban(root);
          }
        });
      }
    },
    true
  );
}
function focusAcceptanceOnPlan(id) {
  var _a, _b, _c, _d;
  const acc = _acc$4();
  const item = acc == null ? void 0 : acc.get(id);
  if (!(item == null ? void 0 : item.locationId) || !item.zone) {
    (_a = window.showToast) == null ? void 0 : _a.call(window, _t$d("construction.v2.kanban.no_zone", "⚠️ Для этой заявки не была выделена зона на плане"));
    return;
  }
  (_d = (_c = (_b = window.RBI) == null ? void 0 : _b.events) == null ? void 0 : _c.emit) == null ? void 0 : _d.call(_c, "construction-acceptance:focus", {
    id,
    locationId: item.locationId
  });
  if ((location.hash || "").replace(/^#/, "") !== "/construction-v2") {
    location.hash = "#/construction-v2";
  }
}
const UNIT_STATUSES_V2 = [
  "not_inspected",
  "finishing",
  "has_defects",
  "ready_for_transfer",
  "transferred",
  "shareholder_defects"
];
const UNIT_STATUS_LABELS_RU = {
  not_inspected: "Не осматривалась",
  finishing: "В отделке",
  has_defects: "Есть замечания",
  ready_for_transfer: "Готова к передаче",
  transferred: "Передана",
  shareholder_defects: "Замечания дольщика"
};
function _t$c(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _unitStatusLabel$2(st) {
  const key = `construction.v2.unit_status.${st}`;
  return _t$c(key, UNIT_STATUS_LABELS_RU[st]);
}
function _escape$b(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _pathLabel$2(loc, locationId) {
  if (!(loc == null ? void 0 : loc.getPath) || !locationId) return locationId || "—";
  try {
    const path = loc.getPath(locationId) || [];
    if (!path.length) return locationId;
    return path.map((n) => n.displayName || n.id).join(" / ");
  } catch {
    return locationId;
  }
}
function closeUnitCard() {
  var _a;
  (_a = document.getElementById("c2-unit-card")) == null ? void 0 : _a.remove();
}
function openUnitCard(unit, deps) {
  var _a, _b, _c;
  closeUnitCard();
  unit.id;
  const guest = deps.cb.isGuest();
  const canDel = !guest && deps.cb.canSoftDelete(unit);
  const path = _pathLabel$2(deps.loc, unit.locationId);
  const status = String(unit.status || "not_inspected");
  const hasPdf = !!(unit.pdf_url && String(unit.pdf_url).startsWith("http"));
  const statusOpts = UNIT_STATUSES_V2.map(
    (st) => `<option value="${st}" ${status === st ? "selected" : ""}>${_escape$b(_unitStatusLabel$2(st))}</option>`
  ).join("");
  const wrap = document.createElement("div");
  wrap.id = "c2-unit-card";
  wrap.className = "fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 p-3";
  wrap.style.zIndex = "1050";
  wrap.innerHTML = `
    <div data-c2-unit-card-panel class="w-full max-w-md bg-surface rounded-2xl shadow-2xl border border-surface overflow-hidden">
      <div class="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div>
          <div class="text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape$b(_t$c("construction.v2.unit.apartment", "Квартира"))}</div>
          <div class="text-[18px] font-black text-ink">${_escape$b(unit.type || "КВ")} ${_escape$b(
    unit.name
  )}</div>
          <div class="text-rbi-label font-bold text-muted mt-0.5">${_escape$b(path)}</div>
        </div>
        <button type="button" data-c2-unit-card-close class="text-muted hover:text-ink text-[20px] leading-none px-1" aria-label="${_escape$b(_t$c("construction.form.close", "Закрыть"))}">×</button>
      </div>
      <div class="px-4 pb-4 space-y-3">
        <label class="block">
          <span class="text-rbi-caption font-black uppercase tracking-widest text-muted">${_escape$b(_t$c("construction.v2.unit.transfer_status", "Статус передачи"))}</span>
          <select id="c2-unit-card-status" data-c2-unit-id="${_escape$b(unit.id)}"
            class="mt-1 w-full rounded-xl border border-surface bg-surface px-3 py-2.5 text-rbi-body font-bold"
            ${guest ? "disabled" : ""}>
            ${statusOpts}
          </select>
        </label>
        <div class="rounded-xl border border-surface p-3 space-y-2">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-muted">${_escape$b(_t$c("construction.v2.unit.plan_pdf", "План квартиры (PDF)"))}</div>
          ${hasPdf ? `<div class="text-rbi-label font-bold text-ink truncate">${_escape$b(
    unit.pdf_name || "plan.pdf"
  )}${unit.pdf_size ? ` · ${_escape$b(String(unit.pdf_size))} B` : ""}</div>
                 <div class="flex flex-wrap gap-2">
                   <a href="${_escape$b(String(unit.pdf_url))}" target="_blank" rel="noopener"
                     class="inline-flex items-center px-3 py-2 rounded-lg bg-brand-soft text-brand text-rbi-caption font-black uppercase border border-brand-soft">${_escape$b(_t$c("construction.v2.unit.open", "Открыть"))}</a>
                   <button type="button" data-c2-unit-apt-plan="${_escape$b(unit.id)}"
                     class="inline-flex items-center px-3 py-2 rounded-lg bg-brand text-white text-rbi-caption font-black uppercase border border-brand">${_escape$b(_t$c("construction.v2.unit.defects_on_plan", "Замечания на плане"))}</button>
                 </div>` : `<div class="text-rbi-label text-muted font-bold">${_escape$b(_t$c("construction.v2.unit.plan_missing", "План не загружен"))}</div>
                 <div class="text-rbi-caption text-muted font-bold">${_escape$b(_t$c("construction.v2.unit.plan_upload_hint", "Загрузка PDF — в Настройках → справочник локаций"))}</div>
                 <button type="button" disabled
                   class="inline-flex items-center px-3 py-2 rounded-lg bg-slate-100 text-muted text-rbi-caption font-black uppercase border border-surface cursor-not-allowed opacity-70">${_escape$b(_t$c("construction.v2.unit.defects_on_plan", "Замечания на плане"))}</button>`}
        </div>
        <button type="button" data-c2-unit-acceptance="${_escape$b(unit.id)}"
          class="w-full py-2.5 rounded-xl text-rbi-label font-black uppercase text-white bg-brand border border-brand ${guest ? "opacity-50 cursor-not-allowed" : ""}"
          ${guest ? "disabled" : ""}>${_escape$b(_t$c("construction.v2.unit.acceptance", "Приёмка"))}</button>
        ${canDel ? `<button type="button" data-c2-unit-delete="${_escape$b(unit.id)}"
                class="w-full py-2.5 rounded-xl text-rbi-label font-black uppercase text-danger border border-danger-soft bg-danger-soft">${_escape$b(_t$c("construction.v2.unit.delete_room", "Удалить помещение"))}</button>` : ""}
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener("click", (ev) => {
    var _a2;
    const t = ev.target;
    if (t === wrap || ((_a2 = t.closest) == null ? void 0 : _a2.call(t, "[data-c2-unit-card-close]"))) {
      closeUnitCard();
    }
  });
  const sel = wrap.querySelector("#c2-unit-card-status");
  sel == null ? void 0 : sel.addEventListener("change", () => {
    if (guest || !sel) return;
    const id = sel.getAttribute("data-c2-unit-id");
    const st = sel.value;
    if (!id || !st) return;
    void (async () => {
      try {
        await deps.units.changeStatus(id, st);
        deps.cb.toast(_t$c("construction.v2.unit.status_updated", "Статус обновлён"));
        await deps.cb.onChanged();
        const fresh = deps.units.get(id);
        if (fresh) openUnitCard(fresh, deps);
      } catch (e) {
        deps.cb.toast(_t$c("construction.v2.error_prefix", "Ошибка: {msg}", { msg: (e == null ? void 0 : e.message) || String(e) }));
      }
    })();
  });
  (_a = wrap.querySelector("[data-c2-unit-apt-plan]")) == null ? void 0 : _a.addEventListener("click", (ev) => {
    ev.preventDefault();
    const id = ev.currentTarget.getAttribute("data-c2-unit-apt-plan");
    if (!id) return;
    const fresh = deps.units.get(id) || unit;
    if (!deps.cb.onOpenApartmentPlan) {
      deps.cb.toast(_t$c("construction.v2.unit.plan_open_unavailable", "Открытие плана недоступно"));
      return;
    }
    void deps.cb.onOpenApartmentPlan(fresh);
  });
  (_b = wrap.querySelector("[data-c2-unit-acceptance]")) == null ? void 0 : _b.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (guest) return;
    const id = ev.currentTarget.getAttribute("data-c2-unit-acceptance");
    if (!id) return;
    const fresh = deps.units.get(id) || unit;
    if (!deps.cb.onOpenAcceptance) {
      deps.cb.toast(_t$c("construction.v2.unit.acceptance_unavailable", "Приёмка недоступна"));
      return;
    }
    void deps.cb.onOpenAcceptance(fresh);
  });
  (_c = wrap.querySelector("[data-c2-unit-delete]")) == null ? void 0 : _c.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (guest) return;
    const id = ev.currentTarget.getAttribute("data-c2-unit-delete");
    if (!id || !confirm(_t$c("construction.v2.unit.confirm_delete", "Удалить помещение?"))) return;
    void (async () => {
      try {
        await deps.units.softDelete(id);
        closeUnitCard();
        deps.cb.toast(_t$c("construction.v2.unit.deleted", "Удалено"));
        await deps.cb.onChanged();
      } catch (e) {
        deps.cb.toast(_t$c("construction.v2.error_prefix", "Ошибка: {msg}", { msg: (e == null ? void 0 : e.message) || String(e) }));
      }
    })();
  });
}
function _floorsForBuilding$1(buildingId, loc) {
  if (!buildingId) return [];
  const sections = loc.getChildren(buildingId) || [];
  const floors = [];
  for (const sec of sections) {
    if (!(sec == null ? void 0 : sec.id)) continue;
    for (const fl of loc.getChildren(sec.id) || []) {
      if (!(fl == null ? void 0 : fl.id)) continue;
      if (fl.nodeType && fl.nodeType !== "floor") continue;
      floors.push(fl);
    }
  }
  floors.sort((a, b) => Number(b.sort_order || 0) - Number(a.sort_order || 0));
  return floors;
}
function teardownTransferUi() {
  closeApartmentPlan();
  closeUnitCard();
}
function _loc$3() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.locations) || null;
}
function _units$1() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionUnits) || null;
}
function _acc$3() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionAcceptance) || null;
}
function _listAccForLocation$1(locationId) {
  const a = _acc$3();
  if (!a || !locationId) return [];
  if (typeof a.listForLocation === "function") return a.listForLocation(locationId) || [];
  return a.list({ locationId }) || [];
}
function _bForUnit$1(unit) {
  var _a;
  const latest = pickLatestAcceptanceForB(_listAccForLocation$1(unit.locationId));
  if (!latest) return null;
  const b = computeAcceptanceQualityB(
    latest.template_key || ((_a = latest.checklist_results) == null ? void 0 : _a.template_key),
    latest.checklist_results
  );
  if (!b) return null;
  return { final: b.final, statusTxt: b.statusTxt };
}
function _permissions$1() {
  var _a, _b;
  return (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.permissions;
}
function _t$b(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _unitStatusLabel$1(st) {
  const key = `construction.v2.unit_status.${st}`;
  return _t$b(key, UNIT_STATUS_LABELS_RU[st]);
}
function _escape$a(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _toast$1(msg) {
  const fn = window.showToast;
  if (typeof fn === "function") fn(msg);
  else console.info("[transfer-board]", msg);
}
function _isGuest$1() {
  var _a, _b;
  const role = ((_b = (_a = _permissions$1()) == null ? void 0 : _a.getCurrentRole) == null ? void 0 : _b.call(_a)) || "guest";
  return role === "guest";
}
function _canManage$1() {
  var _a;
  const p = _permissions$1();
  if (p == null ? void 0 : p.canManageHierarchy) return !!p.canManageHierarchy();
  const role = ((_a = p == null ? void 0 : p.getCurrentRole) == null ? void 0 : _a.call(p)) || "";
  return ["manager", "deputy_manager", "director", "admin"].includes(role);
}
function _canSoftDelete$1(u) {
  var _a, _b;
  if (_canManage$1()) return true;
  const me = ((_b = (_a = _permissions$1()) == null ? void 0 : _a.getCurrentEngineerName) == null ? void 0 : _b.call(_a)) || "";
  return !!(me && u.created_by && me === u.created_by);
}
function _cellBg$1(status) {
  const st = String(status || "not_inspected");
  if (st === "transferred" || st === "accepted") {
    return "bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:border-green-800";
  }
  if (st === "has_defects" || st === "defects") {
    return "bg-danger-soft text-danger border-danger-soft";
  }
  if (st === "shareholder_defects") {
    return "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:border-orange-800";
  }
  if (st === "ready_for_transfer") {
    return "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:border-amber-700";
  }
  if (st === "finishing" || st === "ready") {
    return "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:border-blue-800";
  }
  return "bg-surface text-ink border-surface";
}
let _objectId$3 = null;
let _buildingId$1 = null;
let _bound$4 = false;
function _renderLegend$1() {
  const items = [
    { st: "not_inspected", swatch: "bg-surface border border-surface" },
    { st: "finishing", swatch: "bg-blue-100 border border-blue-300" },
    { st: "has_defects", swatch: "bg-danger-soft border border-danger-soft" },
    { st: "ready_for_transfer", swatch: "bg-amber-100 border border-amber-300" },
    { st: "transferred", swatch: "bg-green-100 border border-green-300" },
    { st: "shareholder_defects", swatch: "bg-orange-100 border border-orange-300" }
  ];
  return `
    <div class="flex flex-wrap gap-3 mb-4 justify-center bg-surface p-2 rounded-xl border border-surface shadow-sm">
      ${items.map(
    (it) => `<div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded ${it.swatch}"></span><span class="text-rbi-caption font-bold text-muted uppercase">${_escape$a(
      _unitStatusLabel$1(it.st)
    )}</span></div>`
  ).join("")}
    </div>`;
}
function _renderGrid$1(uSvc, loc) {
  if (!_buildingId$1) {
    return `<div class="text-center py-10 text-muted font-bold text-rbi-label uppercase tracking-widest bg-surface rounded-xl border border-dashed border-surface shadow-sm">${_escape$a(_t$b("construction.v2.transfer.select_building", "Выберите корпус для просмотра шахматки"))}</div>`;
  }
  const floors = _floorsForBuilding$1(_buildingId$1, loc);
  if (!floors.length) {
    return `<div class="text-center py-10 text-muted font-bold text-rbi-label uppercase tracking-widest bg-surface rounded-xl border border-dashed border-surface shadow-sm">${_escape$a(_t$b("construction.v2.transfer.no_floors", "В этом корпусе ещё не созданы этажи"))}</div>`;
  }
  const bldUnits = uSvc.listForBuilding(_buildingId$1);
  let html = _renderLegend$1();
  html += `<div class="overflow-x-auto pb-4 custom-scrollbar"><div class="min-w-max flex flex-col gap-1.5">`;
  for (const floor of floors) {
    const floorUnits = uSvc.listForFloor(floor.id).slice().sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const floorLabel = floor.displayName || floor.id;
    html += `
      <div class="flex items-center gap-2">
        <div class="w-12 shrink-0 text-center font-black text-rbi-caption text-muted bg-[var(--hover-bg)] py-3 rounded-lg border border-[var(--card-border)] uppercase tracking-tight">${_escape$a(
      floorLabel
    )}</div>
        <div class="flex gap-1.5 flex-1">`;
    if (!floorUnits.length) {
      html += `<div class="text-rbi-caption text-muted italic py-3">${_escape$a(_t$b("construction.v2.transfer.no_rooms", "Помещений нет"))}</div>`;
    } else {
      for (const u of floorUnits) {
        const bg = _cellBg$1(String(u.status || "not_inspected"));
        const pdfDot = u.pdf_url ? `<span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand"></span>` : "";
        const b = _bForUnit$1(u);
        let bTint = "";
        let bBadge = "";
        if (b) {
          const ring = b.final < 70 ? "ring-2 ring-danger/70" : b.final < 85 ? "ring-2 ring-amber-400/70" : "ring-2 ring-emerald-400/60";
          bTint = ` ${ring}`;
          bBadge = `<span class="absolute bottom-0 left-0 right-0 text-rbi-caption font-black leading-none py-0.5 ${b.final < 70 ? "bg-danger/90 text-white" : b.final < 85 ? "bg-amber-500/90 text-white" : "bg-emerald-600/90 text-white"}" title="${_escape$a(b.statusTxt)}">${_escape$a(String(b.final))}</span>`;
        }
        html += `
          <button type="button" data-c2-unit-cell="${_escape$a(u.id)}"
            class="relative ${bg}${bTint} border rounded-lg w-[46px] h-[46px] flex flex-col items-center justify-center cursor-pointer shadow-sm hover:scale-105 transition-transform active:scale-95 overflow-hidden">
            ${pdfDot}
            ${bBadge}
            <span class="text-rbi-body font-black">${_escape$a(u.name)}</span>
            <span class="text-rbi-caption opacity-60 font-bold">${_escape$a(u.type || "КВ")}</span>
          </button>`;
      }
    }
    html += `</div></div>`;
  }
  html += `</div></div>`;
  if (_canManage$1() && bldUnits.length === 0) {
    html += `
      <button type="button" data-c2-generate-grid
        class="mt-4 w-full bg-brand-soft text-brand border border-brand-soft py-3.5 rounded-xl text-rbi-caption font-black uppercase shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2">
        ${_escape$a(_t$b("construction.v2.transfer.generate_grid", "Сгенерировать сетку квартир (8 на этаж)"))}
      </button>`;
  }
  return html;
}
function _selectorsHtml$1(loc) {
  const objects = loc.listNodes({ nodeType: "object", parentId: null });
  let objOpts = `<option value="">${_escape$a(_t$b("construction.v2.transfer.object_select", "— объект —"))}</option>`;
  for (const o of objects) {
    objOpts += `<option value="${_escape$a(o.id)}" ${_objectId$3 === o.id ? "selected" : ""}>${_escape$a(
      o.displayName
    )}</option>`;
  }
  let bldOpts = `<option value="">${_escape$a(_t$b("construction.v2.transfer.building_select", "— корпус —"))}</option>`;
  if (_objectId$3) {
    const buildings = loc.getChildren(_objectId$3).filter((b) => !b.nodeType || b.nodeType === "building");
    for (const b of buildings) {
      bldOpts += `<option value="${_escape$a(b.id)}" ${_buildingId$1 === b.id ? "selected" : ""}>${_escape$a(
        b.displayName
      )}</option>`;
    }
  }
  return `
    <div class="flex flex-col sm:flex-row gap-2 mb-4">
      <select id="c2-transfer-object" class="flex-1 rounded-xl border border-surface bg-surface px-3 py-2.5 text-rbi-body font-bold">
        ${objOpts}
      </select>
      <select id="c2-transfer-building" class="flex-1 rounded-xl border border-surface bg-surface px-3 py-2.5 text-rbi-body font-bold" ${_objectId$3 ? "" : "disabled"}>
        ${bldOpts}
      </select>
    </div>`;
}
async function _refreshBoard$1() {
  const root = document.getElementById("construction-v2-root");
  if (root) await renderTransferBoard(root);
}
async function renderTransferBoard(root) {
  const loc = _loc$3();
  const uSvc = _units$1();
  if (!loc) {
    root.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">${_escape$a(_t$b("construction.v2.svc_locations_missing", "service.locations не загружен"))}</div>`;
    return;
  }
  if (!uSvc) {
    root.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">${_escape$a(_t$b("construction.v2.svc_units_missing", "service.constructionUnits не загружен"))}</div>`;
    return;
  }
  await loc.init();
  await uSvc.init();
  const aSvc = _acc$3();
  if (aSvc == null ? void 0 : aSvc.init) {
    try {
      await aSvc.init();
    } catch (_) {
    }
  }
  if (_buildingId$1 && typeof uSvc.migrateUnitsToApartmentNodes === "function") {
    try {
      await uSvc.migrateUnitsToApartmentNodes(_buildingId$1);
    } catch (e) {
      console.warn("[transfer-board] migrateUnitsToApartmentNodes", e);
    }
  }
  closeUnitCard();
  root.innerHTML = `
    <div class="max-w-5xl mx-auto">
      <div class="mb-3">
        <div class="text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape$a(_t$b("construction.v2.transfer.title", "Передача · шахматка v2"))}</div>
        <p class="text-rbi-label text-muted font-bold mt-0.5">${_escape$a(_t$b("construction.v2.transfer.hint", "Клик по клетке — карточка квартиры{guest}", { guest: _isGuest$1() ? _t$b("construction.v2.transfer.guest_view", " (только просмотр)") : "" }))}</p>
      </div>
      ${_selectorsHtml$1(loc)}
      <div id="c2-transfer-grid">${_renderGrid$1(uSvc, loc)}</div>
    </div>`;
  _bindOnce$3();
}
function _bindOnce$3() {
  if (_bound$4) return;
  _bound$4 = true;
  document.addEventListener(
    "change",
    (ev) => {
      const t = ev.target;
      if (!t) return;
      if (t.id === "c2-transfer-object") {
        _objectId$3 = t.value || null;
        _buildingId$1 = null;
        void _refreshBoard$1();
        return;
      }
      if (t.id === "c2-transfer-building") {
        _buildingId$1 = t.value || null;
        void _refreshBoard$1();
      }
    },
    true
  );
  document.addEventListener(
    "click",
    (ev) => {
      var _a, _b;
      const t = ev.target;
      if (!t) return;
      const gen = (_a = t.closest) == null ? void 0 : _a.call(t, "[data-c2-generate-grid]");
      if (gen) {
        ev.preventDefault();
        void _onGenerate$1();
        return;
      }
      const cell = (_b = t.closest) == null ? void 0 : _b.call(t, "[data-c2-unit-cell]");
      if (cell) {
        ev.preventDefault();
        const id = cell.getAttribute("data-c2-unit-cell");
        const uSvc = _units$1();
        const loc = _loc$3();
        const u = id && uSvc ? uSvc.get(id) : null;
        if (u && uSvc) {
          openUnitCard(u, {
            loc,
            units: uSvc,
            cb: {
              onChanged: _refreshBoard$1,
              isGuest: _isGuest$1,
              canSoftDelete: _canSoftDelete$1,
              toast: _toast$1,
              onOpenApartmentPlan: async (unit) => {
                closeUnitCard();
                await openApartmentPlan(unit, {
                  isGuest: _isGuest$1,
                  toast: _toast$1,
                  onChanged: _refreshBoard$1
                });
              },
              onOpenAcceptance: async (unit) => {
                await _openUnitAcceptance$1(unit);
              }
            }
          });
        }
      }
    },
    true
  );
}
async function _openUnitAcceptance$1(unit) {
  if (_isGuest$1()) {
    _toast$1(_t$b("construction.v2.transfer.guest_acceptance", "Гости не могут открывать приёмку"));
    return;
  }
  const aSvc = _acc$3();
  const uSvc = _units$1();
  if (!aSvc) {
    _toast$1(_t$b("construction.v2.svc_acc_missing", "service.constructionAcceptance не загружен"));
    return;
  }
  let fresh = unit;
  if (uSvc == null ? void 0 : uSvc.ensureApartmentForUnit) {
    try {
      fresh = await uSvc.ensureApartmentForUnit(unit.id);
    } catch (e) {
      console.warn("[transfer-board] ensureApartmentForUnit", e);
    }
  }
  const locationId = String(fresh.locationId || "").trim();
  if (!locationId) {
    _toast$1(_t$b("construction.v2.transfer.no_location", "У квартиры нет locationId"));
    return;
  }
  const list = _listAccForLocation$1(locationId).filter((a) => String(a.status) !== "rejected").slice().sort(
    (a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""))
  );
  const pending = list.find((a) => String(a.status) === "pending");
  const openItem = pending || list[0] || null;
  const openDetails = (item) => {
    closeUnitCard();
    openAcceptanceDetails(item, {
      onChangeStatus: async (rid, status) => {
        await aSvc.changeStatus(rid, status);
        _toast$1(_t$b("construction.v2.status_updated", "✅ Статус обновлён"));
        await _refreshBoard$1();
      },
      onSoftDelete: async (rid) => {
        await aSvc.softDelete(rid);
        _toast$1(_t$b("construction.v2.acc_revoked", "Заявка отозвана"));
        await _refreshBoard$1();
      },
      onChecklistChanged: async () => {
        await _refreshBoard$1();
      }
    });
  };
  if (openItem) {
    openDetails(openItem);
    return;
  }
  closeUnitCard();
  openCreateAcceptanceForm(
    { locationId, zone: { ...APARTMENT_FULL_ZONE }, mode: "apartment" },
    async (input) => {
      const created = await aSvc.create(input);
      _toast$1(_t$b("construction.v2.acc_created", "✅ Приёмка создана"));
      await _refreshBoard$1();
      openDetails(created);
    }
  );
}
async function _onGenerate$1() {
  if (!_buildingId$1 || !_canManage$1()) return;
  if (!confirm(_t$b("construction.v2.transfer.generate_confirm", "Сгенерировать по 8 квартир на каждом этаже? (статус — не осматривалась)"))) return;
  const uSvc = _units$1();
  if (!uSvc) return;
  try {
    _toast$1(_t$b("construction.v2.transfer.generating", "⏳ Генерируем помещения…"));
    const created = await uSvc.generateGrid(_buildingId$1, 8);
    _toast$1(_t$b("construction.v2.transfer.generated", "✅ Создано: {count}", { count: created.length }));
    await _refreshBoard$1();
  } catch (e) {
    console.warn("[transfer-board] generateGrid", e);
    _toast$1(_t$b("construction.v2.error_prefix", "Ошибка: {msg}", { msg: (e == null ? void 0 : e.message) || String(e) }));
  }
}
function _floorsForBuilding(buildingId, loc) {
  if (!buildingId) return [];
  const sections = loc.getChildren(buildingId) || [];
  const floors = [];
  for (const sec of sections) {
    if (!(sec == null ? void 0 : sec.id)) continue;
    for (const fl of loc.getChildren(sec.id) || []) {
      if (!(fl == null ? void 0 : fl.id)) continue;
      if (fl.nodeType && fl.nodeType !== "floor") continue;
      floors.push(fl);
    }
  }
  floors.sort((a, b) => Number(b.sort_order || 0) - Number(a.sort_order || 0));
  return floors;
}
function _loc$2() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.locations) || null;
}
function _units() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionUnits) || null;
}
function _acc$2() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionAcceptance) || null;
}
function _listAccForLocation(locationId) {
  const a = _acc$2();
  if (!a || !locationId) return [];
  if (typeof a.listForLocation === "function") return a.listForLocation(locationId) || [];
  return a.list({ locationId }) || [];
}
function _bForUnit(unit) {
  var _a;
  const latest = pickLatestAcceptanceForB(_listAccForLocation(unit.locationId));
  if (!latest) return null;
  const b = computeAcceptanceQualityB(
    latest.template_key || ((_a = latest.checklist_results) == null ? void 0 : _a.template_key),
    latest.checklist_results
  );
  if (!b) return null;
  return { final: b.final, statusTxt: b.statusTxt };
}
function _permissions() {
  var _a, _b;
  return (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.permissions;
}
function _t$a(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _unitStatusLabel(st) {
  const key = `construction.v2.unit_status.${st}`;
  return _t$a(key, UNIT_STATUS_LABELS_RU[st]);
}
function _escape$9(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _toast(msg) {
  const fn = window.showToast;
  if (typeof fn === "function") fn(msg);
  else console.info("[transfer-board-desktop]", msg);
}
function _isGuest() {
  var _a, _b;
  const role = ((_b = (_a = _permissions()) == null ? void 0 : _a.getCurrentRole) == null ? void 0 : _b.call(_a)) || "guest";
  return role === "guest";
}
function _canManage() {
  var _a;
  const p = _permissions();
  if (p == null ? void 0 : p.canManageHierarchy) return !!p.canManageHierarchy();
  const role = ((_a = p == null ? void 0 : p.getCurrentRole) == null ? void 0 : _a.call(p)) || "";
  return ["manager", "deputy_manager", "director", "admin"].includes(role);
}
function _canSoftDelete(u) {
  var _a, _b;
  if (_canManage()) return true;
  const me = ((_b = (_a = _permissions()) == null ? void 0 : _a.getCurrentEngineerName) == null ? void 0 : _b.call(_a)) || "";
  return !!(me && u.created_by && me === u.created_by);
}
function _cellBg(status) {
  const st = String(status || "not_inspected");
  if (st === "transferred" || st === "accepted") {
    return "bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:border-green-800";
  }
  if (st === "has_defects" || st === "defects") {
    return "bg-danger-soft text-danger border-danger-soft";
  }
  if (st === "shareholder_defects") {
    return "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:border-orange-800";
  }
  if (st === "ready_for_transfer") {
    return "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:border-amber-700";
  }
  if (st === "finishing" || st === "ready") {
    return "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:border-blue-800";
  }
  return "bg-surface text-ink border-surface";
}
let _objectId$2 = null;
let _buildingId = null;
let _bound$3 = false;
function _renderLegend() {
  const items = [
    { st: "not_inspected", swatch: "bg-surface border border-surface" },
    { st: "finishing", swatch: "bg-blue-100 border border-blue-300" },
    { st: "has_defects", swatch: "bg-danger-soft border border-danger-soft" },
    { st: "ready_for_transfer", swatch: "bg-amber-100 border border-amber-300" },
    { st: "transferred", swatch: "bg-green-100 border border-green-300" },
    { st: "shareholder_defects", swatch: "bg-orange-100 border border-orange-300" }
  ];
  return `
    <div class="flex flex-wrap gap-3 mb-4 justify-center bg-surface p-2 rounded-xl border border-surface shadow-sm">
      ${items.map(
    (it) => `<div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded ${it.swatch}"></span><span class="text-rbi-caption font-bold text-muted uppercase">${_escape$9(
      _unitStatusLabel(it.st)
    )}</span></div>`
  ).join("")}
    </div>`;
}
function _renderGrid(uSvc, loc) {
  if (!_buildingId) {
    return `<div class="text-center py-10 text-muted font-bold text-rbi-label uppercase tracking-widest bg-surface rounded-xl border border-dashed border-surface shadow-sm">${_escape$9(_t$a("construction.v2.transfer.select_building", "Выберите корпус для просмотра шахматки"))}</div>`;
  }
  const floors = _floorsForBuilding(_buildingId, loc);
  if (!floors.length) {
    return `<div class="text-center py-10 text-muted font-bold text-rbi-label uppercase tracking-widest bg-surface rounded-xl border border-dashed border-surface shadow-sm">${_escape$9(_t$a("construction.v2.transfer.no_floors", "В этом корпусе ещё не созданы этажи"))}</div>`;
  }
  const bldUnits = uSvc.listForBuilding(_buildingId);
  let html = _renderLegend();
  html += `<div class="flex flex-col gap-1.5">`;
  for (const floor of floors) {
    const floorUnits = uSvc.listForFloor(floor.id).slice().sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const floorLabel = floor.displayName || floor.id;
    html += `
      <div class="flex items-center gap-2">
        <div class="w-14 shrink-0 text-center font-black text-rbi-caption text-muted bg-[var(--hover-bg)] py-3.5 rounded-lg border border-[var(--card-border)] uppercase tracking-tight">${_escape$9(
      floorLabel
    )}</div>
        <div class="flex gap-1.5 flex-wrap flex-1">`;
    if (!floorUnits.length) {
      html += `<div class="text-rbi-caption text-muted italic py-3">${_escape$9(_t$a("construction.v2.transfer.no_rooms", "Помещений нет"))}</div>`;
    } else {
      for (const u of floorUnits) {
        const bg = _cellBg(String(u.status || "not_inspected"));
        const pdfDot = u.pdf_url ? `<span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand"></span>` : "";
        const b = _bForUnit(u);
        let bTint = "";
        let bBadge = "";
        if (b) {
          const ring = b.final < 70 ? "ring-2 ring-danger/70" : b.final < 85 ? "ring-2 ring-amber-400/70" : "ring-2 ring-emerald-400/60";
          bTint = ` ${ring}`;
          bBadge = `<span class="absolute bottom-0 left-0 right-0 text-rbi-caption font-black leading-none py-0.5 ${b.final < 70 ? "bg-danger/90 text-white" : b.final < 85 ? "bg-amber-500/90 text-white" : "bg-emerald-600/90 text-white"}" title="${_escape$9(b.statusTxt)}">${_escape$9(String(b.final))}</span>`;
        }
        html += `
          <button type="button" data-c2-tr-desk-unit-cell="${_escape$9(u.id)}"
            class="relative ${bg}${bTint} border rounded-lg w-[54px] h-[54px] flex flex-col items-center justify-center cursor-pointer shadow-sm hover:scale-105 transition-transform active:scale-95 overflow-hidden">
            ${pdfDot}
            ${bBadge}
            <span class="text-rbi-body font-black">${_escape$9(u.name)}</span>
            <span class="text-rbi-caption opacity-60 font-bold">${_escape$9(u.type || "КВ")}</span>
          </button>`;
      }
    }
    html += `</div></div>`;
  }
  html += `</div>`;
  if (_canManage() && bldUnits.length === 0) {
    html += `
      <button type="button" data-c2-tr-desk-generate-grid
        class="mt-4 w-full bg-brand-soft text-brand border border-brand-soft py-3.5 rounded-xl text-rbi-caption font-black uppercase shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2">
        ${_escape$9(_t$a("construction.v2.transfer.generate_grid", "Сгенерировать сетку квартир (8 на этаж)"))}
      </button>`;
  }
  return html;
}
function _selectorsHtml(loc) {
  const objects = loc.listNodes({ nodeType: "object", parentId: null });
  let objOpts = `<option value="">${_escape$9(_t$a("construction.v2.transfer.object_select", "— объект —"))}</option>`;
  for (const o of objects) {
    objOpts += `<option value="${_escape$9(o.id)}" ${_objectId$2 === o.id ? "selected" : ""}>${_escape$9(
      o.displayName
    )}</option>`;
  }
  let bldOpts = `<option value="">${_escape$9(_t$a("construction.v2.transfer.building_select", "— корпус —"))}</option>`;
  if (_objectId$2) {
    const buildings = loc.getChildren(_objectId$2).filter((b) => !b.nodeType || b.nodeType === "building");
    for (const b of buildings) {
      bldOpts += `<option value="${_escape$9(b.id)}" ${_buildingId === b.id ? "selected" : ""}>${_escape$9(
        b.displayName
      )}</option>`;
    }
  }
  return `
    <div class="flex gap-2 mb-4 max-w-xl">
      <select id="c2-tr-desk-object" class="flex-1 rounded-xl border border-surface bg-surface px-3 py-2.5 text-rbi-body font-bold">
        ${objOpts}
      </select>
      <select id="c2-tr-desk-building" class="flex-1 rounded-xl border border-surface bg-surface px-3 py-2.5 text-rbi-body font-bold" ${_objectId$2 ? "" : "disabled"}>
        ${bldOpts}
      </select>
    </div>`;
}
async function _refreshBoard() {
  const root = document.getElementById("construction-v2-root");
  if (root) await renderTransferBoardDesktop(root);
}
async function renderTransferBoardDesktop(root) {
  const loc = _loc$2();
  const uSvc = _units();
  if (!loc) {
    root.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">${_escape$9(_t$a("construction.v2.svc_locations_missing", "service.locations не загружен"))}</div>`;
    return;
  }
  if (!uSvc) {
    root.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">${_escape$9(_t$a("construction.v2.svc_units_missing", "service.constructionUnits не загружен"))}</div>`;
    return;
  }
  await loc.init();
  await uSvc.init();
  const aSvc = _acc$2();
  if (aSvc == null ? void 0 : aSvc.init) {
    try {
      await aSvc.init();
    } catch (_) {
    }
  }
  if (_buildingId && typeof uSvc.migrateUnitsToApartmentNodes === "function") {
    try {
      await uSvc.migrateUnitsToApartmentNodes(_buildingId);
    } catch (e) {
      console.warn("[transfer-board-desktop] migrateUnitsToApartmentNodes", e);
    }
  }
  closeUnitCard();
  root.innerHTML = `
    <div class="w-full">
      <div class="mb-3">
        <div class="text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape$9(_t$a("construction.v2.transfer.title", "Передача · шахматка v2"))}</div>
        <p class="text-rbi-label text-muted font-bold mt-0.5">${_escape$9(_t$a("construction.v2.transfer.hint", "Клик по клетке — карточка квартиры{guest}", { guest: _isGuest() ? _t$a("construction.v2.transfer.guest_view", " (только просмотр)") : "" }))}</p>
      </div>
      ${_selectorsHtml(loc)}
      <div id="c2-tr-desk-grid">${_renderGrid(uSvc, loc)}</div>
    </div>`;
  _bindOnce$2();
}
function _bindOnce$2() {
  if (_bound$3) return;
  _bound$3 = true;
  document.addEventListener(
    "change",
    (ev) => {
      const t = ev.target;
      if (!t) return;
      if (t.id === "c2-tr-desk-object") {
        _objectId$2 = t.value || null;
        _buildingId = null;
        void _refreshBoard();
        return;
      }
      if (t.id === "c2-tr-desk-building") {
        _buildingId = t.value || null;
        void _refreshBoard();
      }
    },
    true
  );
  document.addEventListener(
    "click",
    (ev) => {
      var _a, _b;
      const t = ev.target;
      if (!t) return;
      const gen = (_a = t.closest) == null ? void 0 : _a.call(t, "[data-c2-tr-desk-generate-grid]");
      if (gen) {
        ev.preventDefault();
        void _onGenerate();
        return;
      }
      const cell = (_b = t.closest) == null ? void 0 : _b.call(t, "[data-c2-tr-desk-unit-cell]");
      if (cell) {
        ev.preventDefault();
        const id = cell.getAttribute("data-c2-tr-desk-unit-cell");
        const uSvc = _units();
        const loc = _loc$2();
        const u = id && uSvc ? uSvc.get(id) : null;
        if (u && uSvc) {
          openUnitCard(u, {
            loc,
            units: uSvc,
            cb: {
              onChanged: _refreshBoard,
              isGuest: _isGuest,
              canSoftDelete: _canSoftDelete,
              toast: _toast,
              onOpenApartmentPlan: async (unit) => {
                closeUnitCard();
                await openApartmentPlan(unit, {
                  isGuest: _isGuest,
                  toast: _toast,
                  onChanged: _refreshBoard
                });
              },
              onOpenAcceptance: async (unit) => {
                await _openUnitAcceptance(unit);
              }
            }
          });
        }
      }
    },
    true
  );
}
async function _openUnitAcceptance(unit) {
  if (_isGuest()) {
    _toast(_t$a("construction.v2.transfer.guest_acceptance", "Гости не могут открывать приёмку"));
    return;
  }
  const aSvc = _acc$2();
  const uSvc = _units();
  if (!aSvc) {
    _toast(_t$a("construction.v2.svc_acc_missing", "service.constructionAcceptance не загружен"));
    return;
  }
  let fresh = unit;
  if (uSvc == null ? void 0 : uSvc.ensureApartmentForUnit) {
    try {
      fresh = await uSvc.ensureApartmentForUnit(unit.id);
    } catch (e) {
      console.warn("[transfer-board-desktop] ensureApartmentForUnit", e);
    }
  }
  const locationId = String(fresh.locationId || "").trim();
  if (!locationId) {
    _toast(_t$a("construction.v2.transfer.no_location", "У квартиры нет locationId"));
    return;
  }
  const list = _listAccForLocation(locationId).filter((a) => String(a.status) !== "rejected").slice().sort(
    (a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""))
  );
  const pending = list.find((a) => String(a.status) === "pending");
  const openItem = pending || list[0] || null;
  const openDetails = (item) => {
    closeUnitCard();
    openAcceptanceDetails(item, {
      onChangeStatus: async (rid, status) => {
        await aSvc.changeStatus(rid, status);
        _toast(_t$a("construction.v2.status_updated", "✅ Статус обновлён"));
        await _refreshBoard();
      },
      onSoftDelete: async (rid) => {
        await aSvc.softDelete(rid);
        _toast(_t$a("construction.v2.acc_revoked", "Заявка отозвана"));
        await _refreshBoard();
      },
      onChecklistChanged: async () => {
        await _refreshBoard();
      }
    });
  };
  if (openItem) {
    openDetails(openItem);
    return;
  }
  closeUnitCard();
  openCreateAcceptanceForm(
    { locationId, zone: { ...APARTMENT_FULL_ZONE }, mode: "apartment" },
    async (input) => {
      const created = await aSvc.create(input);
      _toast(_t$a("construction.v2.acc_created", "✅ Приёмка создана"));
      await _refreshBoard();
      openDetails(created);
    }
  );
}
async function _onGenerate() {
  if (!_buildingId || !_canManage()) return;
  if (!confirm(_t$a("construction.v2.transfer.generate_confirm", "Сгенерировать по 8 квартир на каждом этаже? (статус — не осматривалась)"))) return;
  const uSvc = _units();
  if (!uSvc) return;
  try {
    _toast(_t$a("construction.v2.transfer.generating", "⏳ Генерируем помещения…"));
    const created = await uSvc.generateGrid(_buildingId, 8);
    _toast(_t$a("construction.v2.transfer.generated", "✅ Создано: {count}", { count: created.length }));
    await _refreshBoard();
  } catch (e) {
    console.warn("[transfer-board-desktop] generateGrid", e);
    _toast(_t$a("construction.v2.error_prefix", "Ошибка: {msg}", { msg: (e == null ? void 0 : e.message) || String(e) }));
  }
}
const MS_DAY = 24 * 60 * 60 * 1e3;
const NO_DESCRIPTION_FALLBACK = "Без описания";
function _t$9(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  return fallback;
}
function _noDescription() {
  return _t$9("construction.v2.no_description", NO_DESCRIPTION_FALLBACK);
}
function _asDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const d2 = /* @__PURE__ */ new Date(`${m[1]}T12:00:00`);
    return Number.isNaN(d2.getTime()) ? null : d2;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function deadlineEndOfDay(deadline) {
  const m = String(deadline || "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const end = /* @__PURE__ */ new Date(`${m[1]}T23:59:59.999`);
  return Number.isNaN(end.getTime()) ? null : end;
}
function _ceilDays(from, to) {
  const a = new Date(from);
  a.setHours(12, 0, 0, 0);
  const b = new Date(to);
  b.setHours(12, 0, 0, 0);
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / MS_DAY));
}
function _history(d) {
  const h = d.history;
  if (!Array.isArray(h)) return [];
  return h;
}
function _normStatus(s) {
  const st = String(s || "").toLowerCase();
  if (st === "open") return "issued";
  if (st === "cancelled") return "rejected";
  return st;
}
function normalizeCategory(c) {
  const v = String(c || "").toLowerCase();
  if (v === "minor" || v === "b1") return "B1";
  if (v === "major" || v === "b2") return "B2";
  if (v === "critical" || v === "b3") return "B3";
  const up = String(c || "").toUpperCase();
  if (up === "B1" || up === "B2" || up === "B3") return up;
  return up || "—";
}
function isOverdueNow(d, now = /* @__PURE__ */ new Date()) {
  const st = _normStatus(String(d.status));
  if (st !== "issued" && st !== "in_progress" && st !== "fixed") return false;
  const end = deadlineEndOfDay(d.deadline);
  if (!end) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return end < today;
}
function issueDate(d) {
  const fromCreated = _asDate(d.created_at);
  if (fromCreated) return fromCreated;
  for (const e of _history(d)) {
    const st = _normStatus(String(e.status));
    if (st === "issued") {
      const dt = _asDate(e.date);
      if (dt) return dt;
    }
  }
  return _asDate(d.updated_at);
}
function eliminateDate(d) {
  let best = null;
  for (const e of _history(d)) {
    const st = _normStatus(String(e.status));
    if (st !== "fixed" && st !== "closed") continue;
    const dt = _asDate(e.date);
    if (!dt) continue;
    if (!best || dt.getTime() < best.getTime()) best = dt;
  }
  return best;
}
function acceptedDate(d) {
  let best = null;
  for (const e of _history(d)) {
    if (_normStatus(String(e.status)) !== "closed") continue;
    const dt = _asDate(e.date);
    if (!dt) continue;
    if (!best || dt.getTime() < best.getTime()) best = dt;
  }
  return best;
}
function daysOpen(d, now = /* @__PURE__ */ new Date()) {
  const issued = issueDate(d);
  if (!issued) return null;
  return _ceilDays(issued, now);
}
function agingBucket(days) {
  if (days <= 3) return "0-3";
  if (days <= 7) return "4-7";
  if (days <= 14) return "8-14";
  return "15+";
}
function _avg(nums) {
  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round(sum / nums.length * 10) / 10;
}
function _inPeriod(d, period, now) {
  if (period === "all") return true;
  const days = period === "30" ? 30 : 90;
  const issued = issueDate(d);
  if (!issued) return false;
  const cut = new Date(now);
  cut.setHours(0, 0, 0, 0);
  cut.setDate(cut.getDate() - days);
  return issued.getTime() >= cut.getTime();
}
function _locOk(d, ids) {
  if (!ids || ids.size === 0) return true;
  return ids.has(String(d.locationId || ""));
}
function computeDefectSlaMetrics(defects, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now ?? Date.now());
  const period = opts.period || "all";
  const locSet = opts.locationIds == null ? null : opts.locationIds instanceof Set ? opts.locationIds : new Set(opts.locationIds.map(String));
  const list = (defects || []).filter(
    (d) => d && !d.is_deleted && !d._deleted && _inPeriod(d, period, now) && _locOk(d, locSet)
  );
  let open = 0;
  let overdueNow = 0;
  const elimDays = [];
  const reviewDays = [];
  let closedOnTime = 0;
  let closedLate = 0;
  const catMap = {
    B1: { open: 0, overdue: 0, elim: [] },
    B2: { open: 0, overdue: 0, elim: [] },
    B3: { open: 0, overdue: 0, elim: [] }
  };
  const contrMap = /* @__PURE__ */ new Map();
  const aging = { "0-3": 0, "4-7": 0, "8-14": 0, "15+": 0 };
  const overdueList = [];
  const ensureContr = (id) => {
    if (!contrMap.has(id)) contrMap.set(id, { open: 0, overdue: 0, elim: [] });
    return contrMap.get(id);
  };
  for (const d of list) {
    const st = _normStatus(String(d.status));
    const cat = normalizeCategory(d.category);
    const catKey = cat === "B1" || cat === "B2" || cat === "B3" ? cat : null;
    const cid = String(d.contractorId || "").trim() || "—";
    const contr = ensureContr(cid);
    const issued = issueDate(d);
    const elim = eliminateDate(d);
    const accepted = acceptedDate(d);
    if (elim && issued) {
      const days = _ceilDays(issued, elim);
      elimDays.push(days);
      if (catKey) catMap[catKey].elim.push(days);
      contr.elim.push(days);
    }
    if (accepted && elim) {
      const hist = _history(d);
      const hasFixed = hist.some((e) => _normStatus(String(e.status)) === "fixed");
      if (hasFixed && accepted.getTime() >= elim.getTime()) {
        reviewDays.push(_ceilDays(elim, accepted));
      }
    }
    if (st === "closed") {
      const end = deadlineEndOfDay(d.deadline);
      if (end && accepted) {
        if (accepted.getTime() <= end.getTime()) closedOnTime += 1;
        else closedLate += 1;
      }
    }
    const isOpenAging = st === "issued" || st === "in_progress" || st === "fixed";
    if (isOpenAging) {
      if (st === "issued" || st === "in_progress") {
        open += 1;
        if (catKey) catMap[catKey].open += 1;
        contr.open += 1;
      }
      if (issued) {
        aging[agingBucket(_ceilDays(issued, now))] += 1;
      }
      if (isOverdueNow(d, now)) {
        overdueNow += 1;
        if (catKey) catMap[catKey].overdue += 1;
        contr.overdue += 1;
        const end = deadlineEndOfDay(d.deadline);
        const daysOd = _ceilDays(end, now);
        overdueList.push({
          id: d.id,
          description: String(d.description || d.item_name || d.text || _noDescription()).slice(0, 120),
          status: st,
          category: String(cat),
          contractorId: d.contractorId || null,
          deadline: String(d.deadline || "").slice(0, 10),
          daysOverdue: daysOd,
          daysOpen: issued ? _ceilDays(issued, now) : 0,
          locationId: String(d.locationId || "")
        });
      }
    }
  }
  overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue || b.daysOpen - a.daysOpen);
  const closedWithDeadline = closedOnTime + closedLate;
  const onTimePct = closedWithDeadline > 0 ? Math.round(closedOnTime / closedWithDeadline * 1e3) / 10 : null;
  const byCategory = ["B1", "B2", "B3"].map((category) => ({
    category,
    open: catMap[category].open,
    overdue: catMap[category].overdue,
    avgEliminateDays: _avg(catMap[category].elim)
  }));
  const byContractor = [...contrMap.entries()].map(([contractorId, v]) => ({
    contractorId,
    open: v.open,
    overdue: v.overdue,
    avgEliminateDays: _avg(v.elim)
  })).sort((a, b) => b.overdue - a.overdue || b.open - a.open).slice(0, 10);
  return {
    open,
    overdueNow,
    avgEliminateDays: _avg(elimDays),
    avgReviewDays: _avg(reviewDays),
    onTimePct,
    closedOnTime,
    closedLate,
    closedWithDeadline,
    byCategory,
    byContractor,
    aging,
    overdueList: overdueList.slice(0, 20)
  };
}
let _overdueOnly$1 = false;
function _t$8(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$8(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _stripHtml$1(html) {
  return String(html || "").replace(/<br\s*\/?>/gi, " ").replace(/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
function _statusLabel$3(s) {
  const map = {
    issued: ["construction.status.issued", "Выдано"],
    in_progress: ["construction.status.in_progress", "В работе"],
    fixed: ["construction.form.status_fixed", "Устранено"],
    closed: ["construction.status.closed", "Закрыто"],
    rejected: ["construction.status.rejected", "Отклонено"],
    open: ["construction.status.issued", "Выдано"],
    cancelled: ["construction.status.rejected", "Отклонено"]
  };
  const entry = map[s];
  return entry ? _t$8(entry[0], entry[1]) : s || "—";
}
function _categoryLabel$1(c) {
  const v = String(c || "").toUpperCase();
  if (v === "B1" || v === "MINOR") return "B1";
  if (v === "B3" || v === "CRITICAL") return "B3";
  if (v === "B2" || v === "MAJOR") return "B2";
  return v || "—";
}
function _categoryBar$1(c) {
  const v = String(c || "").toUpperCase();
  if (v === "B1" || v === "MINOR") return "bg-blue-500";
  if (v === "B3" || v === "CRITICAL") return "bg-danger";
  return "bg-orange-500";
}
function _deadlineMeta$1(d) {
  if (d.deadline == null || d.deadline === "") return { label: _t$8("construction.v2.registry.no_deadline", "без срока"), overdue: false };
  const m = String(d.deadline).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return { label: String(d.deadline), overdue: false };
  const [y, mo, day] = m[1].split("-");
  const label = `${day}.${mo}.${y}`;
  return { label, overdue: isOverdueNow(d) };
}
function _statusChip$1(status) {
  const st = String(status || "").toLowerCase();
  let cls = "bg-slate-100 text-ink dark:bg-slate-800";
  if (st === "issued" || st === "open") cls = "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300";
  else if (st === "in_progress") cls = "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  else if (st === "fixed") cls = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  else if (st === "closed") cls = "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300";
  else if (st === "rejected" || st === "cancelled") cls = "bg-slate-100 text-muted dark:bg-slate-800";
  return `<span class="inline-block px-1.5 py-0.5 rounded-md text-rbi-caption font-bold ${cls}">${_escape$8(
    _statusLabel$3(st)
  )}</span>`;
}
function _deadlineSortKey$1(d) {
  const end = deadlineEndOfDay(d.deadline);
  return end ? end.getTime() : Number.POSITIVE_INFINITY;
}
function _sortRegistry$1(list) {
  return list.slice().sort((a, b) => {
    const ao = isOverdueNow(a) ? 0 : 1;
    const bo = isOverdueNow(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return _deadlineSortKey$1(a) - _deadlineSortKey$1(b);
  });
}
function filterDefects(list, filters = pinFiltersState) {
  return filterDefectsByPins(list, filters);
}
function renderDefectsRegistry(host, opts) {
  var _a;
  const { floorId, floorLabel, cb } = opts;
  const defects = filterDefectsForRole(opts.defects || []);
  const filters = opts.filters || pinFiltersState;
  if (!floorId) {
    host.innerHTML = `<div class="flex items-center justify-center h-full min-h-[240px] text-muted text-rbi-body font-medium px-6 text-center">
      ${_escape$8(_t$8("construction.v2.registry.select_floor", "Выберите этаж слева, чтобы увидеть реестр замечаний"))}
    </div>`;
    return;
  }
  let filtered = filterDefectsByPins(defects, filters);
  if (_overdueOnly$1) {
    filtered = filtered.filter((d) => isOverdueNow(d));
  }
  filtered = _sortRegistry$1(filtered);
  const overdueChipCls = _overdueOnly$1 ? "bg-danger text-white border-danger" : "bg-surface text-danger border-danger-soft hover:bg-danger-soft";
  const rows = filtered.length === 0 ? `<div class="p-8 text-center text-muted text-rbi-body font-medium">
          ${_escape$8(_t$8("construction.v2.registry.empty_filter", "Нет замечаний по выбранному фильтру"))}
        </div>` : `<ul class="divide-y divide-slate-100 dark:divide-slate-800">
          ${filtered.map((d, i) => {
    const desc = _stripHtml$1(
      String(d.description || d.item_name || d.text || _t$8("construction.v2.no_description", "Без описания"))
    ).slice(0, 140);
    const dl = _deadlineMeta$1(d);
    const openDays = daysOpen(d);
    const daysBadge = openDays != null ? `<span class="text-rbi-caption font-bold ${dl.overdue ? "text-danger" : "text-muted"}">${openDays} ${_escape$8(_t$8("construction.v2.registry.days_short", "дн."))}</span>` : "";
    const dlCls = dl.overdue ? "text-danger font-semibold" : "text-muted";
    const bar = _categoryBar$1(String(d.category));
    const rowBg = dl.overdue ? "bg-danger-soft" : "";
    return `<li class="${rowBg}">
                <div class="flex items-stretch hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <div class="w-1 shrink-0 ${bar}"></div>
                  <button type="button" data-c2-def-row="${_escape$8(d.id)}"
                    class="flex-1 min-w-0 text-left px-3 py-2.5 flex items-start gap-2.5">
                    <span class="shrink-0 w-6 h-6 mt-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-ink
                                 flex items-center justify-center text-rbi-caption font-bold">${i + 1}</span>
                    <span class="min-w-0 flex-1">
                      <span class="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span class="text-rbi-caption font-bold text-muted">${_escape$8(_categoryLabel$1(String(d.category)))}</span>
                        ${_statusChip$1(String(d.status))}
                        ${daysBadge}
                        <span class="text-rbi-caption ${dlCls}">${_escape$8(dl.label)}${dl.overdue ? ` · ${_escape$8(_t$8("construction.v2.registry.overdue", "просрочено"))}` : ""}</span>
                      </span>
                      <span class="block text-rbi-body font-medium text-ink line-clamp-2 leading-snug">${_escape$8(desc)}</span>
                    </span>
                  </button>
                  <button type="button" data-c2-def-on-plan="${_escape$8(d.id)}" data-c2-def-loc="${_escape$8(d.locationId)}"
                    class="shrink-0 self-center mr-2 px-2 py-1.5 rounded-lg text-rbi-caption font-bold text-brand hover:bg-brand-soft"
                    title="${_escape$8(_t$8("construction.v2.registry.show_on_plan", "Показать на плане"))}">${_escape$8(_t$8("construction.v2.registry.on_plan", "На плане"))}</button>
                </div>
              </li>`;
  }).join("")}
        </ul>`;
  host.innerHTML = `
    <div class="flex flex-col h-full min-h-[320px]">
      <div class="px-3 py-2.5 border-b border-surface flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <div class="text-rbi-body font-semibold text-ink min-w-0 truncate">
            ${_escape$8(floorLabel || _t$8("construction.v2.registry.floor", "Этаж"))}
          </div>
          <div class="text-rbi-caption text-muted shrink-0">${_escape$8(_t$8("construction.v2.registry.shown_count", "Показано {shown} из {total}", { shown: filtered.length, total: defects.length }))}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="min-w-0 flex-1" data-c2-pin-filters-host="registry">${renderPinFiltersHtml(defects, filters, { compact: true })}</div>
          <button type="button" data-c2-reg-overdue
            class="shrink-0 px-2 py-1 rounded-lg text-rbi-caption font-black uppercase tracking-wide border ${overdueChipCls}"
            title="${_escape$8(_t$8("construction.v2.registry.overdue_only_title", "Только просроченные (issued / в работе / на проверке)"))}">${_escape$8(_t$8("construction.v2.registry.overdue_chip", "Просроч."))}</button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto">${rows}</div>
    </div>`;
  (_a = host.querySelector("[data-c2-reg-overdue]")) == null ? void 0 : _a.addEventListener("click", (ev) => {
    var _a2;
    ev.preventDefault();
    ev.stopPropagation();
    _overdueOnly$1 = !_overdueOnly$1;
    renderDefectsRegistry(host, opts);
    (_a2 = cb.onFiltersChanged) == null ? void 0 : _a2.call(cb);
  });
  host.querySelectorAll("[data-c2-def-row]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = btn.getAttribute("data-c2-def-row");
      if (id) cb.onOpenDefect(id);
    });
  });
  host.querySelectorAll("[data-c2-def-on-plan]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const el = btn;
      const id = el.getAttribute("data-c2-def-on-plan");
      const loc = el.getAttribute("data-c2-def-loc");
      if (id && loc) cb.onShowOnPlan(id, loc);
    });
  });
}
let _overdueOnly = false;
function _t$7(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$7(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _stripHtml(html) {
  return String(html || "").replace(/<br\s*\/?>/gi, " ").replace(/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
function _statusLabel$2(s) {
  const map = {
    issued: ["construction.status.issued", "Выдано"],
    in_progress: ["construction.status.in_progress", "В работе"],
    fixed: ["construction.form.status_fixed", "Устранено"],
    closed: ["construction.status.closed", "Закрыто"],
    rejected: ["construction.status.rejected", "Отклонено"],
    open: ["construction.status.issued", "Выдано"],
    cancelled: ["construction.status.rejected", "Отклонено"]
  };
  const entry = map[s];
  return entry ? _t$7(entry[0], entry[1]) : s || "—";
}
function _categoryLabel(c) {
  const v = String(c || "").toUpperCase();
  if (v === "B1" || v === "MINOR") return "B1";
  if (v === "B3" || v === "CRITICAL") return "B3";
  if (v === "B2" || v === "MAJOR") return "B2";
  return v || "—";
}
function _categoryBar(c) {
  const v = String(c || "").toUpperCase();
  if (v === "B1" || v === "MINOR") return "bg-blue-500";
  if (v === "B3" || v === "CRITICAL") return "bg-danger";
  return "bg-orange-500";
}
function _statusChip(status) {
  const st = String(status || "").toLowerCase();
  let cls = "bg-slate-100 text-ink dark:bg-slate-800";
  if (st === "issued" || st === "open") cls = "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300";
  else if (st === "in_progress") cls = "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  else if (st === "fixed") cls = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  else if (st === "closed") cls = "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300";
  else if (st === "rejected" || st === "cancelled") cls = "bg-slate-100 text-muted dark:bg-slate-800";
  return `<span class="inline-block px-1.5 py-0.5 rounded-md text-rbi-caption font-bold ${cls}">${_escape$7(
    _statusLabel$2(st)
  )}</span>`;
}
function _deadlineMeta(d) {
  if (d.deadline == null || d.deadline === "") return { label: _t$7("construction.v2.registry.no_deadline", "без срока"), overdue: false };
  const m = String(d.deadline).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return { label: String(d.deadline), overdue: false };
  const [y, mo, day] = m[1].split("-");
  const label = `${day}.${mo}.${y}`;
  return { label, overdue: isOverdueNow(d) };
}
function _deadlineSortKey(d) {
  const end = deadlineEndOfDay(d.deadline);
  return end ? end.getTime() : Number.POSITIVE_INFINITY;
}
function _sortRegistry(list) {
  return list.slice().sort((a, b) => {
    const ao = isOverdueNow(a) ? 0 : 1;
    const bo = isOverdueNow(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return _deadlineSortKey(a) - _deadlineSortKey(b);
  });
}
function renderDefectsRegistryDesktop(host, opts) {
  var _a;
  const { floorId, floorLabel, cb } = opts;
  const defects = filterDefectsForRole(opts.defects || []);
  const filters = opts.filters || pinFiltersState;
  if (!floorId) {
    host.innerHTML = `<div class="flex items-center justify-center h-full min-h-[240px] text-muted text-rbi-body font-medium px-6 text-center">
      ${_escape$7(_t$7("construction.v2.registry.select_floor", "Выберите этаж слева, чтобы увидеть реестр замечаний"))}
    </div>`;
    return;
  }
  let filtered = filterDefects(defects, filters);
  if (_overdueOnly) {
    filtered = filtered.filter((d) => isOverdueNow(d));
  }
  filtered = _sortRegistry(filtered);
  const overdueChipCls = _overdueOnly ? "bg-danger text-white border-danger" : "bg-surface text-danger border-danger-soft hover:bg-danger-soft";
  const rows = filtered.length === 0 ? `<tr><td colspan="6" class="p-8 text-center text-muted text-rbi-body font-medium">
          ${_escape$7(_t$7("construction.v2.registry.empty_filter", "Нет замечаний по выбранному фильтру"))}
        </td></tr>` : filtered.map((d, i) => {
    const desc = _stripHtml(
      String(d.description || d.item_name || d.text || _t$7("construction.v2.no_description", "Без описания"))
    ).slice(0, 200);
    const dl = _deadlineMeta(d);
    const openDays = daysOpen(d);
    const dlCls = dl.overdue ? "text-danger font-semibold" : "text-muted";
    const bar = _categoryBar(String(d.category));
    const rowBg = dl.overdue ? "bg-danger-soft" : "";
    return `<tr class="${rowBg} hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors border-b border-surface">
              <td class="p-0 w-1"><div class="w-1 h-full ${bar}"></div></td>
              <td class="px-3 py-2.5 align-top">
                <button type="button" data-c2-def-row="${_escape$7(d.id)}" class="text-left w-full flex items-start gap-2.5">
                  <span class="shrink-0 w-6 h-6 mt-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-ink
                               flex items-center justify-center text-rbi-caption font-bold">${i + 1}</span>
                  <span class="min-w-0">
                    <span class="block text-rbi-caption font-bold text-muted mb-0.5">${_escape$7(_categoryLabel(String(d.category)))}</span>
                    ${_statusChip(String(d.status))}
                  </span>
                </button>
              </td>
              <td class="px-3 py-2.5 align-top">
                <button type="button" data-c2-def-row="${_escape$7(d.id)}" class="text-left w-full">
                  <span class="block text-rbi-body font-medium text-ink line-clamp-2 leading-snug">${_escape$7(desc)}</span>
                </button>
              </td>
              <td class="px-3 py-2.5 align-top whitespace-nowrap">
                <span class="text-rbi-body ${dlCls}">${_escape$7(dl.label)}</span>
                ${dl.overdue ? `<span class="block text-rbi-caption text-danger font-bold">${_escape$7(_t$7("construction.v2.registry.overdue", "просрочено"))}</span>` : ""}
              </td>
              <td class="px-3 py-2.5 align-top whitespace-nowrap text-rbi-body ${dl.overdue ? "text-danger font-bold" : "text-muted"}">
                ${openDays != null ? `${openDays} ${_escape$7(_t$7("construction.v2.registry.days_short", "дн."))}` : "—"}
              </td>
              <td class="px-3 py-2.5 align-top text-right">
                <button type="button" data-c2-def-on-plan="${_escape$7(d.id)}" data-c2-def-loc="${_escape$7(d.locationId)}"
                  class="shrink-0 px-2.5 py-1.5 rounded-lg text-rbi-caption font-bold text-brand hover:bg-brand-soft"
                  title="${_escape$7(_t$7("construction.v2.registry.show_on_plan", "Показать на плане"))}">${_escape$7(_t$7("construction.v2.registry.on_plan", "На плане"))}</button>
              </td>
            </tr>`;
  }).join("");
  host.innerHTML = `
    <div class="flex flex-col h-full min-h-[320px]">
      <div class="px-4 py-3 border-b border-surface flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <div class="text-rbi-body font-semibold text-ink min-w-0 truncate">
            ${_escape$7(floorLabel || _t$7("construction.v2.registry.floor", "Этаж"))}
          </div>
          <div class="text-rbi-label text-muted shrink-0">${_escape$7(_t$7("construction.v2.registry.shown_count", "Показано {shown} из {total}", { shown: filtered.length, total: defects.length }))}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="min-w-0 flex-1" data-c2-pin-filters-host="registry">${renderPinFiltersHtml(defects, filters, { compact: true })}</div>
          <button type="button" data-c2-reg-overdue
            class="shrink-0 px-2.5 py-1.5 rounded-lg text-rbi-caption font-black uppercase tracking-wide border ${overdueChipCls}"
            title="${_escape$7(_t$7("construction.v2.registry.overdue_only_title", "Только просроченные (issued / в работе / на проверке)"))}">${_escape$7(_t$7("construction.v2.registry.overdue_chip", "Просроч."))}</button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto">
        <table class="w-full border-collapse text-left">
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  (_a = host.querySelector("[data-c2-reg-overdue]")) == null ? void 0 : _a.addEventListener("click", (ev) => {
    var _a2;
    ev.preventDefault();
    ev.stopPropagation();
    _overdueOnly = !_overdueOnly;
    renderDefectsRegistryDesktop(host, opts);
    (_a2 = cb.onFiltersChanged) == null ? void 0 : _a2.call(cb);
  });
  host.querySelectorAll("[data-c2-def-row]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = btn.getAttribute("data-c2-def-row");
      if (id) cb.onOpenDefect(id);
    });
  });
  host.querySelectorAll("[data-c2-def-on-plan]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const el = btn;
      const id = el.getAttribute("data-c2-def-on-plan");
      const loc = el.getAttribute("data-c2-def-loc");
      if (id && loc) cb.onShowOnPlan(id, loc);
    });
  });
}
function _t$6(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$6(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _acc$1() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionAcceptance) || null;
}
function _loc$1() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.locations) || null;
}
let _filterObjectId = null;
let _slotsDate = null;
let _bound$2 = false;
function _today$2() {
  const d = /* @__PURE__ */ new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function _objectIdForFloor(loc, floorId) {
  var _a;
  const path = loc.getPath(floorId);
  const obj = path.find((n) => n.nodeType === "object");
  return (obj == null ? void 0 : obj.id) || ((_a = path[0]) == null ? void 0 : _a.id) || null;
}
function _cardHtml(r, loc) {
  const path = loc.getPath(r.locationId).map((n) => n.displayName).join(" · ");
  const overdue = r.status === "pending" && r.requested_date && new Date(r.requested_date).setHours(0, 0, 0, 0) < (/* @__PURE__ */ new Date()).setHours(0, 0, 0, 0);
  const progress = computeChecklistProgress(r.template_key, r.checklist_results);
  const progressHtml = progress.total > 0 && (r.checklist_results || progress.done > 0) ? `<div class="mt-2 text-rbi-caption font-black uppercase tracking-wide text-brand">${_escape$6(progressLine(progress))}${progress.fail ? ` · FAIL ${progress.fail}` : ""}</div>` : progress.total > 0 ? `<div class="mt-2 text-rbi-caption font-bold text-muted">${_escape$6(_t$6("construction.v2.kanban.checklist_progress", "Чек-лист 0/{total}", { total: progress.total }))}</div>` : "";
  return `
    <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3.5 mb-3 shadow-sm cursor-pointer hover:border-brand transition-colors"
         data-c2-acc-desk-card="${_escape$6(r.id)}">
      <div class="flex justify-between items-start gap-2 mb-1.5">
        <div class="text-rbi-body font-black text-ink leading-tight">${_escape$6(r.work_type || _t$6("construction.v2.kanban.no_work_type", "Без вида работ"))}</div>
        ${overdue ? `<span class="text-rbi-caption font-black uppercase text-danger bg-danger-soft px-1.5 py-0.5 rounded shrink-0">${_escape$6(_t$6("construction.v2.registry.overdue", "просрочено"))}</span>` : ""}
      </div>
      <div class="text-rbi-label text-muted font-bold mb-2">${_escape$6(path || r.locationId)}</div>
      <div class="flex justify-between items-center text-rbi-label">
        <span class="font-bold text-ink">${_escape$6(r.requested_date || "—")} ${_escape$6(r.requested_time || "")}</span>
        <button type="button" data-c2-acc-desk-plan="${_escape$6(r.id)}"
          class="text-brand bg-white border border-brand-soft px-2.5 py-1 rounded text-rbi-caption font-bold">${_escape$6(_t$6("construction.v2.kanban.plan_btn", "План"))}</button>
      </div>
      ${r.volume ? `<div class="mt-1.5 text-rbi-caption text-muted font-bold">${_escape$6(r.volume)}</div>` : ""}
      ${progressHtml}
    </div>`;
}
function _column(title, color, items, loc) {
  return `
    <div class="bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-surface p-3">
      <div class="flex items-center justify-between px-1 mb-2.5">
        <span class="text-rbi-label font-black uppercase tracking-widest ${color}">${_escape$6(title)}</span>
        <span class="bg-surface text-ink px-2 py-0.5 rounded shadow-sm border border-surface text-rbi-label font-bold">${items.length}</span>
      </div>
      <div class="max-h-[65vh] overflow-y-auto">
        ${items.length ? items.map((r) => _cardHtml(r, loc)).join("") : `<div class="text-center py-6 text-rbi-label font-bold text-muted border border-dashed border-surface rounded-xl">${_escape$6(_t$6("construction.v2.kanban.no_requests", "Заявок нет"))}</div>`}
      </div>
    </div>`;
}
async function renderAcceptanceKanbanDesktop(root) {
  const acc = _acc$1();
  const loc = _loc$1();
  if (!acc || !loc) {
    root.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">${_escape$6(_t$6("construction.v2.kanban.svc_missing", "constructionAcceptance / locations не загружены"))}</div>`;
    return;
  }
  await loc.init();
  await acc.init();
  const objects = loc.listNodes({ nodeType: "object", parentId: null });
  const objOpts = `<option value="">${_escape$6(_t$6("construction.v2.kanban.all_objects", "Все объекты"))}</option>` + objects.map(
    (o) => `<option value="${_escape$6(o.id)}" ${_filterObjectId === o.id ? "selected" : ""}>${_escape$6(o.displayName)}</option>`
  ).join("");
  let all = filterAcceptancesForRole(acc.list());
  if (_filterObjectId) {
    all = all.filter((r) => _objectIdForFloor(loc, r.locationId) === _filterObjectId);
  }
  const pending = all.filter((r) => r.status === "pending");
  const rejected = all.filter((r) => r.status === "rejected");
  const accepted = all.filter((r) => r.status === "accepted");
  const slotsDate = _slotsDate || _today$2();
  const occupancy = listSlotOccupancy(all, { date: slotsDate });
  root.innerHTML = `
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="text-rbi-label font-black uppercase tracking-widest text-brand">${_escape$6(_t$6("construction.v2.kanban.title", "Канбан приёмки (v2)"))}</div>
        <select id="c2-acc-desk-obj-filter" class="input-base text-rbi-body font-bold max-w-[240px]">${objOpts}</select>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <label class="text-rbi-label font-black uppercase text-muted" for="c2-acc-desk-slots-date">${_escape$6(_t$6("construction.v2.kanban.slots_day", "Слоты дня"))}</label>
        <input type="date" id="c2-acc-desk-slots-date" class="input-base text-rbi-body font-bold max-w-[170px]" value="${_escape$6(
    slotsDate
  )}">
      </div>
      ${slotBoardHtml(occupancy, { title: _t$6("construction.v2.slots.occupancy", "Занятость {date}", { date: slotsDate }) })}
      <div class="grid grid-cols-3 gap-3">
        ${_column(_t$6("construction.v2.kanban.col_pending", "Ожидают"), "text-blue-600", pending, loc)}
        ${_column(_t$6("construction.v2.kanban.col_rejected", "Отклонены"), "text-danger", rejected, loc)}
        ${_column(_t$6("construction.v2.kanban.col_accepted", "Приняты"), "text-green-600", accepted, loc)}
      </div>
    </div>`;
  _bindOnce$1();
}
function _bindOnce$1() {
  if (_bound$2) return;
  _bound$2 = true;
  document.addEventListener(
    "change",
    (ev) => {
      const t = ev.target;
      if ((t == null ? void 0 : t.id) === "c2-acc-desk-obj-filter") {
        _filterObjectId = t.value || null;
        const root = document.getElementById("construction-v2-root");
        if (root) renderAcceptanceKanbanDesktop(root).catch(() => {
        });
      }
      if ((t == null ? void 0 : t.id) === "c2-acc-desk-slots-date") {
        _slotsDate = t.value || null;
        const root = document.getElementById("construction-v2-root");
        if (root) renderAcceptanceKanbanDesktop(root).catch(() => {
        });
      }
    },
    true
  );
  document.addEventListener(
    "click",
    (ev) => {
      var _a, _b;
      const t = ev.target;
      const planBtn = (_a = t == null ? void 0 : t.closest) == null ? void 0 : _a.call(t, "[data-c2-acc-desk-plan]");
      if (planBtn) {
        ev.stopPropagation();
        const id = planBtn.getAttribute("data-c2-acc-desk-plan");
        if (id) focusAcceptanceOnPlan(id);
        return;
      }
      const card = (_b = t == null ? void 0 : t.closest) == null ? void 0 : _b.call(t, "[data-c2-acc-desk-card]");
      if (card) {
        const id = card.getAttribute("data-c2-acc-desk-card");
        if (!id) return;
        const acc = _acc$1();
        const item = acc == null ? void 0 : acc.get(id);
        if (!item || !acc) return;
        openAcceptanceDetails(item, {
          onFocusPlan: (rid) => focusAcceptanceOnPlan(rid),
          onChangeStatus: async (rid, status) => {
            var _a2;
            await acc.changeStatus(rid, status);
            (_a2 = window.showToast) == null ? void 0 : _a2.call(window, _t$6("construction.v2.status_updated", "✅ Статус обновлён"));
            const root = document.getElementById("construction-v2-root");
            if (root) await renderAcceptanceKanbanDesktop(root);
          },
          onSoftDelete: async (rid) => {
            var _a2;
            await acc.softDelete(rid);
            (_a2 = window.showToast) == null ? void 0 : _a2.call(window, _t$6("construction.v2.acc_revoked", "Заявка отозвана"));
            const root = document.getElementById("construction-v2-root");
            if (root) await renderAcceptanceKanbanDesktop(root);
          },
          onChecklistChanged: async () => {
            const root = document.getElementById("construction-v2-root");
            if (root) await renderAcceptanceKanbanDesktop(root);
          }
        });
      }
    },
    true
  );
}
const DESKTOP_MIN = 1280;
function isDesktopViewport() {
  return typeof window !== "undefined" && window.innerWidth >= DESKTOP_MIN;
}
let _bound$1 = false;
let _onCross = null;
function bindResizeWatcher(onCross) {
  _onCross = onCross;
  if (_bound$1) return;
  _bound$1 = true;
  let timer = null;
  let lastDesktop = isDesktopViewport();
  window.addEventListener("resize", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const nowDesktop = isDesktopViewport();
      if (nowDesktop === lastDesktop) return;
      lastDesktop = nowDesktop;
      _onCross == null ? void 0 : _onCross();
    }, 120);
  });
}
function _t$5(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  return fallback;
}
function _escape$5(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function renderPlanTreeDesktop(svc, selectedFloorId) {
  const objects = svc.listNodes({ nodeType: "object", parentId: null });
  if (!objects.length) {
    return `<div class="p-6 text-center text-muted text-rbi-label font-bold uppercase tracking-widest">
      ${_t$5("construction.v2.tree_empty", "Нет объектов. Создайте иерархию в Настройках → «Объекты и планы».")}
    </div>`;
  }
  let html = '<ul class="space-y-1.5 text-rbi-body">';
  for (const obj of objects) {
    html += `<li class="font-black text-ink">${_escape$5(obj.displayName)}`;
    const buildings = svc.getChildren(obj.id);
    html += '<ul class="ml-3 mt-1 space-y-1 border-l border-surface pl-3">';
    for (const b of buildings) {
      html += `<li><span class="font-bold text-ink">${_escape$5(b.displayName)}</span>`;
      const sections = svc.getChildren(b.id);
      html += '<ul class="ml-2 mt-0.5 space-y-0.5">';
      for (const sec of sections) {
        html += `<li class="text-muted">${_escape$5(sec.displayName)}`;
        const floors = svc.getChildren(sec.id);
        html += '<ul class="ml-2">';
        for (const fl of floors) {
          const plan = svc.getPlanForFloor(fl.id);
          const active = selectedFloorId === fl.id ? "bg-brand-soft text-brand" : "hover:bg-slate-100 dark:hover:bg-slate-800";
          const mark = (plan == null ? void 0 : plan.pdf_url) ? "📄" : "⚠️";
          html += `<li>
            <button type="button" data-c2-floor="${_escape$5(fl.id)}"
              class="w-full text-left px-2.5 py-1.5 rounded-lg ${active} transition-colors">
              ${mark} ${_escape$5(fl.displayName)}
            </button>
          </li>`;
        }
        html += "</ul></li>";
      }
      html += "</ul></li>";
    }
    html += "</ul></li>";
  }
  html += "</ul>";
  return html;
}
function _zoomToolbarDesktopHtml(prefix) {
  return `<div class="flex gap-1 shrink-0 items-center rounded-xl border border-surface p-0.5">
    <button type="button" data-c2-zoom-out="${prefix}"
      class="w-8 h-8 rounded-lg text-[16px] font-black text-ink hover:bg-slate-100 dark:hover:bg-slate-800" title="${_escape$5(_t$5("construction.v2.zoom_out", "Уменьшить"))}">−</button>
    <button type="button" data-c2-zoom-in="${prefix}"
      class="w-8 h-8 rounded-lg text-[16px] font-black text-ink hover:bg-slate-100 dark:hover:bg-slate-800" title="${_escape$5(_t$5("construction.v2.zoom_in", "Увеличить"))}">+</button>
    <button type="button" data-c2-zoom-fit="${prefix}"
      class="px-2.5 h-8 rounded-lg text-rbi-caption font-black uppercase text-ink hover:bg-slate-100 dark:hover:bg-slate-800" title="${_escape$5(_t$5("construction.v2.zoom_fit", "По размеру"))}">Fit</button>
  </div>`;
}
function _fullscreenIconBtnDesktop() {
  const fs = _escape$5(_t$5("construction.v2.fullscreen", "На весь экран"));
  return `<button type="button" data-c2-fullscreen
    class="w-9 h-9 rounded-xl border border-surface flex items-center justify-center shrink-0
           text-ink bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
    title="${fs}" aria-label="${fs}">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>
    </svg>
  </button>`;
}
function renderPlanChromeDesktop(svc, opts) {
  if (!opts.selectedFloorId) {
    return `<div class="flex items-center justify-center h-full min-h-[240px] text-muted text-rbi-body font-medium px-4 text-center">
      ${_t$5("construction.v2.select_floor", "Выберите этаж слева")}
    </div>`;
  }
  const floor = svc.getNode(opts.selectedFloorId);
  const plan = svc.getPlanForFloor(opts.selectedFloorId);
  const path = svc.getPath(opts.selectedFloorId).map((n) => n.displayName).join(" / ");
  if (!(plan == null ? void 0 : plan.pdf_url)) {
    return `<div class="p-6">
      <div class="text-rbi-label font-bold text-muted mb-2">${_escape$5(path)}</div>
      <div class="text-amber-600 font-bold text-rbi-body">${_t$5("construction.v2.no_pdf", "Нет PDF-плана на этом этаже")}</div>
      <p class="text-rbi-label text-muted mt-2">${_t$5("construction.v2.no_pdf_hint", "Загрузите план в Настройках → «Объекты и планы».")}</p>
    </div>`;
  }
  const addCls = opts.addMode ? "bg-brand text-white border-brand" : "bg-transparent text-brand border-brand-soft";
  const zoneCls = opts.zoneMode ? "bg-emerald-600 text-white border-emerald-600" : "bg-transparent text-emerald-700 border-emerald-200 dark:border-emerald-800";
  return `<div class="flex flex-col h-full min-h-[320px]" id="c2-plan-chrome">
    <div class="px-3 py-2 border-b border-surface flex items-center justify-between gap-2 flex-nowrap">
      <div class="text-rbi-body font-semibold text-ink min-w-0 truncate">
        ${_escape$5(path || (floor == null ? void 0 : floor.displayName) || "")}
      </div>
      <div class="flex gap-1.5 shrink-0 items-center flex-nowrap">
        ${_zoomToolbarDesktopHtml("desk")}
        <button type="button" data-c2-zone-mode
          class="px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold whitespace-nowrap ${zoneCls}">
          ${opts.zoneMode ? _t$5("construction.v2.zone_picking", "2 клика…") : _t$5("construction.v2.zone", "Зона")}
        </button>
        <button type="button" data-c2-add-mode
          class="px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold whitespace-nowrap ${addCls}">
          ${opts.addMode ? _t$5("construction.v2.add_picking", "Кликни…") : _t$5("construction.v2.add_defect", "+ Замечание")}
        </button>
        ${_fullscreenIconBtnDesktop()}
      </div>
    </div>
    <div class="px-3 py-1.5 border-b border-surface" data-c2-pin-filters-host="plan"></div>
    <div class="flex-1 relative bg-slate-100 dark:bg-slate-900 min-h-[280px]" id="c2-plan-host"></div>
    <div class="px-3 py-1.5 text-rbi-caption text-muted border-t border-surface flex justify-end">
      <span id="c2-overlay-count"></span>
    </div>
  </div>`;
}
let _period$1 = "all";
let _objectId$1 = null;
function _t$4(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$4(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _fmt$1(n, suffix = "") {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n}${suffix}`;
}
function _contractorLabel$1(id) {
  var _a, _b, _c;
  const cid = String(id || "").trim();
  if (!cid || cid === "—") return "—";
  try {
    const svc = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.contractors;
    const fromSvc = ((_c = svc == null ? void 0 : svc.list) == null ? void 0 : _c.call(svc)) || [];
    const hit = fromSvc.find((c) => String(c.id) === cid);
    if (hit) return String(hit.display_name || hit.name || cid);
  } catch {
  }
  return cid.length > 12 ? `${cid.slice(0, 8)}…` : cid;
}
function _locationIdsUnderObject$1(loc, objectId) {
  const ids = /* @__PURE__ */ new Set();
  const walk = (parentId) => {
    ids.add(parentId);
    for (const ch of loc.getChildren(parentId) || []) {
      walk(ch.id);
    }
  };
  walk(objectId);
  return ids;
}
function _kpiCard$1(label, value, tone = "") {
  const toneCls = tone === "danger" ? "border-danger-soft" : tone === "ok" ? "border-emerald-200 dark:border-emerald-900/40" : "border-[var(--card-border)]";
  return `<div class="min-w-[7.5rem] flex-1 bg-[var(--card-bg)] border ${toneCls} rounded-2xl px-3 py-2.5">
    <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-1">${_escape$4(label)}</div>
    <div class="text-[18px] font-black text-ink leading-none">${_escape$4(value)}</div>
  </div>`;
}
function _barRow$1(label, count, max, color) {
  const pct = max > 0 ? Math.round(count / max * 100) : 0;
  return `<div class="flex items-center gap-2 text-rbi-label mb-1.5">
    <span class="w-12 shrink-0 font-bold text-muted">${_escape$4(label)}</span>
    <div class="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div class="h-full ${color}" style="width:${pct}%"></div>
    </div>
    <span class="w-8 text-right font-bold text-ink">${count}</span>
  </div>`;
}
function _periodBtn$1(p, label) {
  const on = _period$1 === p;
  return `<button type="button" data-c2-metrics-period="${p}"
    class="px-2.5 py-1 rounded-lg text-rbi-caption font-bold border transition-colors ${on ? "bg-brand text-white border-brand" : "bg-transparent text-muted border-surface hover:border-brand-soft"}">${_escape$4(label)}</button>`;
}
function renderMetricsView(host, opts) {
  var _a;
  const { loc, defectsSvc, cb } = opts;
  const objects = loc.listNodes({ nodeType: "object", parentId: null }) || [];
  const allDefects = ((_a = defectsSvc == null ? void 0 : defectsSvc.list) == null ? void 0 : _a.call(defectsSvc, { includeDeleted: false })) || [];
  let locationIds = null;
  if (_objectId$1) {
    locationIds = _locationIdsUnderObject$1(loc, _objectId$1);
  }
  const m = computeDefectSlaMetrics(allDefects, {
    period: _period$1,
    locationIds
  });
  const agingMax = Math.max(1, ...Object.values(m.aging));
  const objectOptions = [
    `<option value="">${_escape$4(_t$4("construction.v2.metrics.all_objects", "Все объекты"))}</option>`,
    ...objects.map(
      (o) => `<option value="${_escape$4(o.id)}"${_objectId$1 === o.id ? " selected" : ""}>${_escape$4(
        o.displayName
      )}</option>`
    )
  ].join("");
  const catRows = m.byCategory.map(
    (r) => `<tr class="border-t border-slate-100 dark:border-slate-800">
      <td class="py-1.5 pr-2 font-bold">${_escape$4(r.category)}</td>
      <td class="py-1.5 pr-2 text-right">${r.open}</td>
      <td class="py-1.5 pr-2 text-right ${r.overdue ? "text-danger font-semibold" : ""}">${r.overdue}</td>
      <td class="py-1.5 text-right">${_fmt$1(r.avgEliminateDays)}</td>
    </tr>`
  ).join("");
  const contrRows = m.byContractor.length === 0 ? `<tr><td colspan="4" class="py-3 text-center text-muted text-rbi-body">${_escape$4(_t$4("construction.v2.metrics.no_data", "Нет данных"))}</td></tr>` : m.byContractor.map(
    (r) => `<tr class="border-t border-slate-100 dark:border-slate-800">
      <td class="py-1.5 pr-2 font-medium truncate max-w-[10rem]" title="${_escape$4(r.contractorId)}">${_escape$4(
      _contractorLabel$1(r.contractorId)
    )}</td>
      <td class="py-1.5 pr-2 text-right">${r.open}</td>
      <td class="py-1.5 pr-2 text-right ${r.overdue ? "text-danger font-semibold" : ""}">${r.overdue}</td>
      <td class="py-1.5 text-right">${_fmt$1(r.avgEliminateDays)}</td>
    </tr>`
  ).join("");
  const overdueRows = m.overdueList.length === 0 ? `<div class="p-4 text-center text-muted text-rbi-body">${_escape$4(_t$4("construction.v2.metrics.no_overdue", "Нет просроченных"))}</div>` : `<ul class="divide-y divide-slate-100 dark:divide-slate-800">
          ${m.overdueList.map(
    (r) => `<li>
            <button type="button" data-c2-metrics-def="${_escape$4(r.id)}"
              class="w-full text-left px-3 py-2.5 hover:bg-danger-soft transition-colors">
              <span class="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span class="text-rbi-caption font-bold text-muted">${_escape$4(r.category)}</span>
                <span class="text-rbi-caption font-bold uppercase text-danger">${_escape$4(_t$4("construction.v2.metrics.overdue_days", "+{days} дн. проср.", { days: r.daysOverdue }))}</span>
                <span class="text-rbi-caption text-muted">${_escape$4(_t$4("construction.v2.metrics.open_days", "{days} дн. открыто", { days: r.daysOpen }))}</span>
              </span>
              <span class="block text-rbi-body font-medium text-ink line-clamp-2">${_escape$4(
      r.description
    )}</span>
            </button>
          </li>`
  ).join("")}
        </ul>`;
  host.innerHTML = `
    <div class="flex flex-col gap-3 p-3 sm:p-4 overflow-y-auto max-h-[calc(100vh-8rem)]">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 class="text-rbi-title font-black text-ink tracking-tight">${_escape$4(_t$4("construction.v2.metrics.title", "Сроки замечаний"))}</h3>
          <p class="text-rbi-caption text-muted mt-0.5">${_escape$4(_t$4("construction.v2.metrics.subtitle", "Локальный расчёт по defects_v2 · без новой схемы БД"))}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex gap-1">${_periodBtn$1("30", _t$4("construction.v2.metrics.period_30", "30 дн."))}${_periodBtn$1("90", _t$4("construction.v2.metrics.period_90", "90 дн."))}${_periodBtn$1("all", _t$4("construction.v2.metrics.period_all", "Все"))}</div>
          <select data-c2-metrics-object
            class="text-rbi-label font-bold rounded-xl border border-surface bg-[var(--card-bg)] px-2 py-1.5 max-w-[12rem]">
            ${objectOptions}
          </select>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        ${_kpiCard$1(_t$4("construction.v2.metrics.kpi_open", "Открытые"), String(m.open))}
        ${_kpiCard$1(_t$4("construction.v2.metrics.kpi_overdue", "Просроченные"), String(m.overdueNow), m.overdueNow ? "danger" : "")}
        ${_kpiCard$1(_t$4("construction.v2.metrics.kpi_avg_fix", "Ср. устранение"), _fmt$1(m.avgEliminateDays, _t$4("construction.v2.metrics.days_suffix", " дн.")))}
        ${_kpiCard$1(_t$4("construction.v2.metrics.kpi_avg_review", "Ср. проверка СК"), _fmt$1(m.avgReviewDays, _t$4("construction.v2.metrics.days_suffix", " дн.")))}
        ${_kpiCard$1(_t$4("construction.v2.metrics.kpi_on_time", "% вовремя"), m.onTimePct == null ? "—" : `${m.onTimePct}%`, m.onTimePct != null && m.onTimePct >= 80 ? "ok" : "")}
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-2">${_escape$4(_t$4("construction.v2.metrics.by_category", "По категории"))}</div>
          <table class="w-full text-rbi-label text-ink">
            <thead><tr class="text-rbi-caption uppercase tracking-wider text-muted">
              <th class="text-left font-bold pb-1">${_escape$4(_t$4("construction.v2.metrics.th_cat", "Cat"))}</th>
              <th class="text-right font-bold pb-1">${_escape$4(_t$4("construction.v2.metrics.th_open", "Откр."))}</th>
              <th class="text-right font-bold pb-1">${_escape$4(_t$4("construction.v2.metrics.th_overdue", "Проср."))}</th>
              <th class="text-right font-bold pb-1">${_escape$4(_t$4("construction.v2.metrics.th_avg_days", "Ср. дн."))}</th>
            </tr></thead>
            <tbody>${catRows}</tbody>
          </table>
        </div>
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-2">${_escape$4(_t$4("construction.v2.metrics.aging_open", "Aging открытых"))}</div>
          ${_barRow$1(_t$4("construction.v2.metrics.aging_0_3", "0–3"), m.aging["0-3"], agingMax, "bg-emerald-500")}
          ${_barRow$1(_t$4("construction.v2.metrics.aging_4_7", "4–7"), m.aging["4-7"], agingMax, "bg-amber-400")}
          ${_barRow$1(_t$4("construction.v2.metrics.aging_8_14", "8–14"), m.aging["8-14"], agingMax, "bg-orange-500")}
          ${_barRow$1(_t$4("construction.v2.metrics.aging_15_plus", "15+"), m.aging["15+"], agingMax, "bg-danger")}
        </div>
      </div>

      <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3">
        <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-2">${_escape$4(_t$4("construction.v2.metrics.by_contractor", "По подрядчику (топ-10 по просрочке)"))}</div>
        <table class="w-full text-rbi-label text-ink">
          <thead><tr class="text-rbi-caption uppercase tracking-wider text-muted">
            <th class="text-left font-bold pb-1">${_escape$4(_t$4("construction.form.contractor", "Подрядчик"))}</th>
            <th class="text-right font-bold pb-1">${_escape$4(_t$4("construction.v2.metrics.th_open", "Откр."))}</th>
            <th class="text-right font-bold pb-1">${_escape$4(_t$4("construction.v2.metrics.th_overdue", "Проср."))}</th>
            <th class="text-right font-bold pb-1">${_escape$4(_t$4("construction.v2.metrics.th_avg_days", "Ср. дн."))}</th>
          </tr></thead>
          <tbody>${contrRows}</tbody>
        </table>
      </div>

      <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        <div class="px-3 py-2 border-b border-surface text-rbi-caption font-black uppercase tracking-widest text-danger">
          ${_escape$4(_t$4("construction.v2.metrics.overdue_now", "Просроченные сейчас · до 20"))}
        </div>
        ${overdueRows}
      </div>
    </div>`;
  host.querySelectorAll("[data-c2-metrics-period]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const p = btn.getAttribute("data-c2-metrics-period");
      if (!p || p === _period$1) return;
      _period$1 = p;
      renderMetricsView(host, opts);
    });
  });
  const sel = host.querySelector("[data-c2-metrics-object]");
  sel == null ? void 0 : sel.addEventListener("change", () => {
    _objectId$1 = sel.value || null;
    renderMetricsView(host, opts);
  });
  host.querySelectorAll("[data-c2-metrics-def]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = btn.getAttribute("data-c2-metrics-def");
      if (id) cb.onOpenDefect(id);
    });
  });
}
let _period = "all";
let _objectId = null;
function _t$3(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$3(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _fmt(n, suffix = "") {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n}${suffix}`;
}
function _contractorLabel(id) {
  var _a, _b, _c;
  const cid = String(id || "").trim();
  if (!cid || cid === "—") return "—";
  try {
    const svc = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.contractors;
    const fromSvc = ((_c = svc == null ? void 0 : svc.list) == null ? void 0 : _c.call(svc)) || [];
    const hit = fromSvc.find((c) => String(c.id) === cid);
    if (hit) return String(hit.display_name || hit.name || cid);
  } catch {
  }
  return cid.length > 12 ? `${cid.slice(0, 8)}…` : cid;
}
function _locationIdsUnderObject(loc, objectId) {
  const ids = /* @__PURE__ */ new Set();
  const walk = (parentId) => {
    ids.add(parentId);
    for (const ch of loc.getChildren(parentId) || []) {
      walk(ch.id);
    }
  };
  walk(objectId);
  return ids;
}
function _kpiCard(label, value, tone = "") {
  const toneCls = tone === "danger" ? "border-danger-soft" : tone === "ok" ? "border-emerald-200 dark:border-emerald-900/40" : "border-[var(--card-border)]";
  return `<div class="flex-1 bg-[var(--card-bg)] border ${toneCls} rounded-2xl px-4 py-3">
    <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-1.5">${_escape$3(label)}</div>
    <div class="text-[26px] font-black text-ink leading-none">${_escape$3(value)}</div>
  </div>`;
}
function _barRow(label, count, max, color) {
  const pct = max > 0 ? Math.round(count / max * 100) : 0;
  return `<div class="flex items-center gap-2 text-rbi-label mb-1.5">
    <span class="w-12 shrink-0 font-bold text-muted">${_escape$3(label)}</span>
    <div class="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div class="h-full ${color}" style="width:${pct}%"></div>
    </div>
    <span class="w-8 text-right font-bold text-ink">${count}</span>
  </div>`;
}
function _periodBtn(p, label) {
  const on = _period === p;
  return `<button type="button" data-c2-metrics-desk-period="${p}"
    class="px-3 py-1.5 rounded-lg text-rbi-label font-bold border transition-colors ${on ? "bg-brand text-white border-brand" : "bg-transparent text-muted border-surface hover:border-brand-soft"}">${_escape$3(label)}</button>`;
}
function renderMetricsViewDesktop(host, opts) {
  var _a;
  const { loc, defectsSvc, cb } = opts;
  const objects = loc.listNodes({ nodeType: "object", parentId: null }) || [];
  const allDefects = ((_a = defectsSvc == null ? void 0 : defectsSvc.list) == null ? void 0 : _a.call(defectsSvc, { includeDeleted: false })) || [];
  let locationIds = null;
  if (_objectId) {
    locationIds = _locationIdsUnderObject(loc, _objectId);
  }
  const m = computeDefectSlaMetrics(allDefects, {
    period: _period,
    locationIds
  });
  const agingMax = Math.max(1, ...Object.values(m.aging));
  const objectOptions = [
    `<option value="">${_escape$3(_t$3("construction.v2.metrics.all_objects", "Все объекты"))}</option>`,
    ...objects.map(
      (o) => `<option value="${_escape$3(o.id)}"${_objectId === o.id ? " selected" : ""}>${_escape$3(
        o.displayName
      )}</option>`
    )
  ].join("");
  const catRows = m.byCategory.map(
    (r) => `<tr class="border-t border-slate-100 dark:border-slate-800">
      <td class="py-1.5 pr-2 font-bold">${_escape$3(r.category)}</td>
      <td class="py-1.5 pr-2 text-right">${r.open}</td>
      <td class="py-1.5 pr-2 text-right ${r.overdue ? "text-danger font-semibold" : ""}">${r.overdue}</td>
      <td class="py-1.5 text-right">${_fmt(r.avgEliminateDays)}</td>
    </tr>`
  ).join("");
  const contrRows = m.byContractor.length === 0 ? `<tr><td colspan="4" class="py-3 text-center text-muted text-rbi-body">${_escape$3(_t$3("construction.v2.metrics.no_data", "Нет данных"))}</td></tr>` : m.byContractor.map(
    (r) => `<tr class="border-t border-slate-100 dark:border-slate-800">
      <td class="py-1.5 pr-2 font-medium truncate max-w-[10rem]" title="${_escape$3(r.contractorId)}">${_escape$3(
      _contractorLabel(r.contractorId)
    )}</td>
      <td class="py-1.5 pr-2 text-right">${r.open}</td>
      <td class="py-1.5 pr-2 text-right ${r.overdue ? "text-danger font-semibold" : ""}">${r.overdue}</td>
      <td class="py-1.5 text-right">${_fmt(r.avgEliminateDays)}</td>
    </tr>`
  ).join("");
  const overdueCards = m.overdueList.length === 0 ? `<div class="p-4 text-center text-muted text-rbi-body col-span-full">${_escape$3(_t$3("construction.v2.metrics.no_overdue", "Нет просроченных"))}</div>` : m.overdueList.map(
    (r) => `<button type="button" data-c2-metrics-desk-def="${_escape$3(r.id)}"
              class="text-left px-3 py-2.5 rounded-xl border border-[var(--card-border)] hover:bg-danger-soft transition-colors">
              <span class="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span class="text-rbi-caption font-bold text-muted">${_escape$3(r.category)}</span>
                <span class="text-rbi-caption font-bold uppercase text-danger">${_escape$3(_t$3("construction.v2.metrics.overdue_days", "+{days} дн. проср.", { days: r.daysOverdue }))}</span>
                <span class="text-rbi-caption text-muted">${_escape$3(_t$3("construction.v2.metrics.open_days", "{days} дн. открыто", { days: r.daysOpen }))}</span>
              </span>
              <span class="block text-rbi-body font-medium text-ink line-clamp-2">${_escape$3(
      r.description
    )}</span>
            </button>`
  ).join("");
  host.innerHTML = `
    <div class="flex flex-col gap-3 p-4">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-[16px] font-black text-ink tracking-tight">${_escape$3(_t$3("construction.v2.metrics.title", "Сроки замечаний"))}</h3>
          <p class="text-rbi-label text-muted mt-0.5">${_escape$3(_t$3("construction.v2.metrics.subtitle", "Локальный расчёт по defects_v2 · без новой схемы БД"))}</p>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex gap-1">${_periodBtn("30", _t$3("construction.v2.metrics.period_30", "30 дн."))}${_periodBtn("90", _t$3("construction.v2.metrics.period_90", "90 дн."))}${_periodBtn("all", _t$3("construction.v2.metrics.period_all", "Все"))}</div>
          <select data-c2-metrics-desk-object
            class="text-rbi-body font-bold rounded-xl border border-surface bg-[var(--card-bg)] px-3 py-2 max-w-[16rem]">
            ${objectOptions}
          </select>
        </div>
      </div>

      <div class="flex gap-3">
        ${_kpiCard(_t$3("construction.v2.metrics.kpi_open", "Открытые"), String(m.open))}
        ${_kpiCard(_t$3("construction.v2.metrics.kpi_overdue", "Просроченные"), String(m.overdueNow), m.overdueNow ? "danger" : "")}
        ${_kpiCard(_t$3("construction.v2.metrics.kpi_avg_fix", "Ср. устранение"), _fmt(m.avgEliminateDays, _t$3("construction.v2.metrics.days_suffix", " дн.")))}
        ${_kpiCard(_t$3("construction.v2.metrics.kpi_avg_review", "Ср. проверка СК"), _fmt(m.avgReviewDays, _t$3("construction.v2.metrics.days_suffix", " дн.")))}
        ${_kpiCard(_t$3("construction.v2.metrics.kpi_on_time", "% вовремя"), m.onTimePct == null ? "—" : `${m.onTimePct}%`, m.onTimePct != null && m.onTimePct >= 80 ? "ok" : "")}
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-2">${_escape$3(_t$3("construction.v2.metrics.by_category", "По категории"))}</div>
          <table class="w-full text-rbi-label text-ink">
            <thead><tr class="text-rbi-caption uppercase tracking-wider text-muted">
              <th class="text-left font-bold pb-1">${_escape$3(_t$3("construction.v2.metrics.th_cat", "Cat"))}</th>
              <th class="text-right font-bold pb-1">${_escape$3(_t$3("construction.v2.metrics.th_open", "Откр."))}</th>
              <th class="text-right font-bold pb-1">${_escape$3(_t$3("construction.v2.metrics.th_overdue", "Проср."))}</th>
              <th class="text-right font-bold pb-1">${_escape$3(_t$3("construction.v2.metrics.th_avg_days", "Ср. дн."))}</th>
            </tr></thead>
            <tbody>${catRows}</tbody>
          </table>
        </div>
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-2">${_escape$3(_t$3("construction.v2.metrics.aging_open", "Aging открытых"))}</div>
          ${_barRow(_t$3("construction.v2.metrics.aging_0_3", "0–3"), m.aging["0-3"], agingMax, "bg-emerald-500")}
          ${_barRow(_t$3("construction.v2.metrics.aging_4_7", "4–7"), m.aging["4-7"], agingMax, "bg-amber-400")}
          ${_barRow(_t$3("construction.v2.metrics.aging_8_14", "8–14"), m.aging["8-14"], agingMax, "bg-orange-500")}
          ${_barRow(_t$3("construction.v2.metrics.aging_15_plus", "15+"), m.aging["15+"], agingMax, "bg-danger")}
        </div>
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-2">${_escape$3(_t$3("construction.v2.metrics.by_contractor", "По подрядчику (топ-10 по просрочке)"))}</div>
          <table class="w-full text-rbi-label text-ink">
            <thead><tr class="text-rbi-caption uppercase tracking-wider text-muted">
              <th class="text-left font-bold pb-1">${_escape$3(_t$3("construction.form.contractor", "Подрядчик"))}</th>
              <th class="text-right font-bold pb-1">${_escape$3(_t$3("construction.v2.metrics.th_open", "Откр."))}</th>
              <th class="text-right font-bold pb-1">${_escape$3(_t$3("construction.v2.metrics.th_overdue", "Проср."))}</th>
              <th class="text-right font-bold pb-1">${_escape$3(_t$3("construction.v2.metrics.th_avg_days", "Ср. дн."))}</th>
            </tr></thead>
            <tbody>${contrRows}</tbody>
          </table>
        </div>
      </div>

      <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        <div class="px-3 py-2 border-b border-surface text-rbi-caption font-black uppercase tracking-widest text-danger">
          ${_escape$3(_t$3("construction.v2.metrics.overdue_now", "Просроченные сейчас · до 20"))}
        </div>
        <div class="grid grid-cols-3 gap-2 p-3">${overdueCards}</div>
      </div>
    </div>`;
  host.querySelectorAll("[data-c2-metrics-desk-period]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const p = btn.getAttribute("data-c2-metrics-desk-period");
      if (!p || p === _period) return;
      _period = p;
      renderMetricsViewDesktop(host, opts);
    });
  });
  const sel = host.querySelector("[data-c2-metrics-desk-object]");
  sel == null ? void 0 : sel.addEventListener("change", () => {
    _objectId = sel.value || null;
    renderMetricsViewDesktop(host, opts);
  });
  host.querySelectorAll("[data-c2-metrics-desk-def]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = btn.getAttribute("data-c2-metrics-desk-def");
      if (id) cb.onOpenDefect(id);
    });
  });
}
function _t$2(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$2(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _today$1() {
  const d = /* @__PURE__ */ new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function _pathLabel$1(locationId) {
  var _a, _b, _c, _d;
  const loc = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.locations;
  if (loc == null ? void 0 : loc.getPath) {
    return loc.getPath(locationId).map((n) => n.displayName).join(" · ");
  }
  return ((_d = (_c = loc == null ? void 0 : loc.getNode) == null ? void 0 : _c.call(loc, locationId)) == null ? void 0 : _d.displayName) || locationId;
}
function _statusLabel$1(s) {
  const map = {
    issued: ["construction.status.issued", "Выдано"],
    in_progress: ["construction.status.in_progress", "В работе"],
    fixed: ["construction.status.fixed", "На проверке"],
    closed: ["construction.status.closed", "Закрыто"],
    rejected: ["construction.status.rejected", "Отклонено"],
    pending: ["construction.v2.cabinet.status_pending", "Ожидает"],
    accepted: ["construction.v2.cabinet.status_accepted", "Принята"]
  };
  const entry = map[String(s || "").toLowerCase()];
  return entry ? _t$2(entry[0], entry[1]) : s || "—";
}
function _kpi(label, value, tone = "") {
  const toneCls = tone === "danger" ? "border-danger-soft" : tone === "warn" ? "border-amber-200 dark:border-amber-900/40" : "border-[var(--card-border)]";
  return `<div class="min-w-[6.5rem] flex-1 bg-[var(--card-bg)] border ${toneCls} rounded-2xl px-3 py-2.5">
    <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-1">${_escape$2(label)}</div>
    <div class="text-[18px] font-black text-ink leading-none">${value}</div>
  </div>`;
}
function _defectRow(d) {
  const desc = String(d.description || d.item_name || d.text || _t$2("construction.v2.no_description", "Без описания")).slice(0, 120);
  const overdue = isOverdueNow(d);
  return `<li>
    <button type="button" data-c2-cab-def="${_escape$2(d.id)}"
      class="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${overdue ? "bg-danger-soft" : ""}">
      <span class="flex flex-wrap items-center gap-1.5 mb-0.5">
        <span class="text-rbi-caption font-bold text-muted">${_escape$2(String(d.category || ""))}</span>
        <span class="text-rbi-caption font-bold uppercase text-brand">${_escape$2(_statusLabel$1(String(d.status)))}</span>
        ${overdue ? `<span class="text-rbi-caption font-bold uppercase text-danger">${_escape$2(_t$2("construction.v2.registry.overdue", "просрочено"))}</span>` : ""}
      </span>
      <span class="block text-rbi-body font-medium text-ink line-clamp-2">${_escape$2(desc)}</span>
      <span class="block text-rbi-caption text-muted mt-0.5">${_escape$2(_pathLabel$1(d.locationId))}</span>
    </button>
  </li>`;
}
function _accRow(a) {
  return `<li>
    <button type="button" data-c2-cab-acc="${_escape$2(a.id)}"
      class="w-full text-left px-3 py-2.5 hover:bg-brand-soft transition-colors">
      <span class="flex flex-wrap items-center gap-1.5 mb-0.5">
        <span class="text-rbi-caption font-bold uppercase text-brand">${_escape$2(_statusLabel$1(String(a.status)))}</span>
        <span class="text-rbi-caption font-bold text-muted">${_escape$2(a.requested_date || "—")} ${_escape$2(
    a.requested_time || ""
  )}</span>
      </span>
      <span class="block text-rbi-body font-medium text-ink">${_escape$2(
    a.work_type || _t$2("construction.v2.kanban.no_work_type", "Без вида работ")
  )}</span>
      <span class="block text-rbi-caption text-muted mt-0.5">${_escape$2(_pathLabel$1(a.locationId))}</span>
    </button>
  </li>`;
}
function _section(title, rows, empty) {
  return `
    <section class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
      <div class="px-3 py-2 border-b border-surface text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape$2(
    title
  )}</div>
      ${rows ? `<ul class="divide-y divide-slate-100 dark:divide-slate-800">${rows}</ul>` : `<div class="p-4 text-center text-muted text-rbi-body">${_escape$2(empty)}</div>`}
    </section>`;
}
function renderContractorCabinet(host, opts) {
  const myId = resolveMyContractorId();
  const defects = filterDefectsForRole(opts.defects || []);
  const acceptances = filterAcceptancesForRole(opts.acceptances || []);
  if (!myId) {
    host.innerHTML = `
      <div class="p-6 max-w-lg mx-auto">
        <div class="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 text-rbi-body font-medium text-amber-900 dark:text-amber-100">
          ${_escape$2(_t$2("construction.v2.cabinet.unbound", "Подрядчик не привязан к профилю. Обратитесь к администратору, чтобы назначить карточку подрядчика — иначе кабинет, реестр и пины будут пустыми."))}
        </div>
      </div>`;
    return;
  }
  const open = defects.filter((d) => {
    const st = String(d.status || "").toLowerCase();
    return st === "issued" || st === "in_progress" || st === "open" || st === "rejected";
  });
  const onReview = defects.filter((d) => String(d.status || "").toLowerCase() === "fixed");
  const overdue = defects.filter((d) => isOverdueNow(d));
  const upcoming = acceptances.filter((a) => {
    const st = String(a.status || "").toLowerCase();
    return st === "pending" || st === "accepted";
  }).slice().sort((a, b) => {
    const da = `${a.requested_date || ""} ${a.requested_time || ""}`;
    const db = `${b.requested_date || ""} ${b.requested_time || ""}`;
    return da.localeCompare(db);
  }).slice(0, 8);
  const occupancy = listSlotOccupancy(acceptances, { date: _today$1() });
  host.innerHTML = `
    <div class="space-y-3 p-1 sm:p-2">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape$2(_t$2("construction.v2.cabinet.title", "Кабинет подрядчика"))}</div>
        <div class="text-rbi-caption text-muted font-bold truncate max-w-[14rem]" title="${_escape$2(myId)}">${_escape$2(_t$2("construction.v2.cabinet.my_id", "мой id · {id}", { id: myId.length > 10 ? `${myId.slice(0, 8)}…` : myId }))}</div>
      </div>
      <div class="flex flex-wrap gap-2">
        ${_kpi(_t$2("construction.v2.cabinet.kpi_open", "Открытые"), open.length)}
        ${_kpi(_t$2("construction.v2.cabinet.kpi_review", "На проверке"), onReview.length, "warn")}
        ${_kpi(_t$2("construction.v2.cabinet.kpi_overdue", "Просроченные"), overdue.length, "danger")}
        ${_kpi(_t$2("construction.v2.cabinet.kpi_slots", "Слоты (скоро)"), upcoming.length)}
      </div>
      ${slotBoardHtml(occupancy, { title: _t$2("construction.v2.cabinet.slots_today", "Слоты сегодня ({date})", { date: _today$1() }) })}
      ${_section(_t$2("construction.v2.cabinet.sec_open", "Открытые замечания"), open.map(_defectRow).join(""), _t$2("construction.v2.cabinet.empty_open", "Нет открытых замечаний"))}
      ${_section(_t$2("construction.v2.cabinet.sec_review", "На проверке"), onReview.map(_defectRow).join(""), _t$2("construction.v2.cabinet.empty_review", "Нет замечаний на проверке"))}
      ${_section(_t$2("construction.v2.cabinet.sec_overdue", "Просроченные"), overdue.map(_defectRow).join(""), _t$2("construction.v2.cabinet.empty_overdue", "Нет просроченных"))}
      ${_section(_t$2("construction.v2.cabinet.sec_upcoming", "Ближайшие слоты приёмки"), upcoming.map(_accRow).join(""), _t$2("construction.v2.cabinet.empty_upcoming", "Нет заявок на приёмку"))}
    </div>`;
  host.querySelectorAll("[data-c2-cab-def]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = btn.getAttribute("data-c2-cab-def");
      if (id) opts.cb.onOpenDefect(id);
    });
  });
  host.querySelectorAll("[data-c2-cab-acc]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = btn.getAttribute("data-c2-cab-acc");
      if (id) opts.cb.onOpenAcceptance(id);
    });
  });
}
function _t$1(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _escape$1(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _today() {
  const d = /* @__PURE__ */ new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function _pathLabel(locationId) {
  var _a, _b, _c, _d;
  const loc = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.locations;
  if (loc == null ? void 0 : loc.getPath) {
    return loc.getPath(locationId).map((n) => n.displayName).join(" · ");
  }
  return ((_d = (_c = loc == null ? void 0 : loc.getNode) == null ? void 0 : _c.call(loc, locationId)) == null ? void 0 : _d.displayName) || locationId;
}
function _statusLabel(s) {
  const map = {
    issued: ["construction.status.issued", "Выдано"],
    in_progress: ["construction.status.in_progress", "В работе"],
    fixed: ["construction.status.fixed", "На проверке"],
    closed: ["construction.status.closed", "Закрыто"],
    rejected: ["construction.status.rejected", "Отклонено"],
    pending: ["construction.v2.cabinet.status_pending", "Ожидает"],
    accepted: ["construction.v2.cabinet.status_accepted", "Принята"]
  };
  const entry = map[String(s || "").toLowerCase()];
  return entry ? _t$1(entry[0], entry[1]) : s || "—";
}
function _kpiDesk(label, value, tone = "") {
  const toneCls = tone === "danger" ? "border-danger-soft" : tone === "warn" ? "border-amber-200 dark:border-amber-900/40" : "border-[var(--card-border)]";
  return `<div class="flex-1 bg-[var(--card-bg)] border ${toneCls} rounded-2xl px-4 py-3">
    <div class="text-rbi-caption font-black uppercase tracking-widest text-muted mb-1.5">${_escape$1(label)}</div>
    <div class="text-[26px] font-black text-ink leading-none">${value}</div>
  </div>`;
}
function _defectRowDesk(d) {
  const desc = String(d.description || d.item_name || d.text || _t$1("construction.v2.no_description", "Без описания")).slice(0, 120);
  const overdue = isOverdueNow(d);
  return `<li>
    <button type="button" data-c2-cab-desk-def="${_escape$1(d.id)}"
      class="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${overdue ? "bg-danger-soft" : ""}">
      <span class="flex flex-wrap items-center gap-1.5 mb-0.5">
        <span class="text-rbi-caption font-bold text-muted">${_escape$1(String(d.category || ""))}</span>
        <span class="text-rbi-caption font-bold uppercase text-brand">${_escape$1(_statusLabel(String(d.status)))}</span>
        ${overdue ? `<span class="text-rbi-caption font-bold uppercase text-danger">${_escape$1(_t$1("construction.v2.registry.overdue", "просрочено"))}</span>` : ""}
      </span>
      <span class="block text-rbi-body font-medium text-ink line-clamp-2">${_escape$1(desc)}</span>
      <span class="block text-rbi-caption text-muted mt-0.5">${_escape$1(_pathLabel(d.locationId))}</span>
    </button>
  </li>`;
}
function _accRowDesk(a) {
  return `<li>
    <button type="button" data-c2-cab-desk-acc="${_escape$1(a.id)}"
      class="w-full text-left px-3 py-2.5 hover:bg-brand-soft transition-colors">
      <span class="flex flex-wrap items-center gap-1.5 mb-0.5">
        <span class="text-rbi-caption font-bold uppercase text-brand">${_escape$1(_statusLabel(String(a.status)))}</span>
        <span class="text-rbi-caption font-bold text-muted">${_escape$1(a.requested_date || "—")} ${_escape$1(
    a.requested_time || ""
  )}</span>
      </span>
      <span class="block text-rbi-body font-medium text-ink">${_escape$1(
    a.work_type || _t$1("construction.v2.kanban.no_work_type", "Без вида работ")
  )}</span>
      <span class="block text-rbi-caption text-muted mt-0.5">${_escape$1(_pathLabel(a.locationId))}</span>
    </button>
  </li>`;
}
function _sectionDesk(title, rows, empty, gridColCls) {
  return `
    <section class="${gridColCls} bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
      <div class="px-3 py-2 border-b border-surface text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape$1(
    title
  )}</div>
      ${rows ? `<ul class="divide-y divide-slate-100 dark:divide-slate-800">${rows}</ul>` : `<div class="p-4 text-center text-muted text-rbi-body">${_escape$1(empty)}</div>`}
    </section>`;
}
function renderContractorCabinetDesktop(host, opts) {
  const myId = resolveMyContractorId();
  const defects = filterDefectsForRole(opts.defects || []);
  const acceptances = filterAcceptancesForRole(opts.acceptances || []);
  if (!myId) {
    host.innerHTML = `
      <div class="p-6 max-w-lg">
        <div class="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 text-rbi-body font-medium text-amber-900 dark:text-amber-100">
          ${_escape$1(_t$1("construction.v2.cabinet.unbound", "Подрядчик не привязан к профилю. Обратитесь к администратору, чтобы назначить карточку подрядчика — иначе кабинет, реестр и пины будут пустыми."))}
        </div>
      </div>`;
    return;
  }
  const open = defects.filter((d) => {
    const st = String(d.status || "").toLowerCase();
    return st === "issued" || st === "in_progress" || st === "open" || st === "rejected";
  });
  const onReview = defects.filter((d) => String(d.status || "").toLowerCase() === "fixed");
  const overdue = defects.filter((d) => isOverdueNow(d));
  const upcoming = acceptances.filter((a) => {
    const st = String(a.status || "").toLowerCase();
    return st === "pending" || st === "accepted";
  }).slice().sort((a, b) => {
    const da = `${a.requested_date || ""} ${a.requested_time || ""}`;
    const db = `${b.requested_date || ""} ${b.requested_time || ""}`;
    return da.localeCompare(db);
  }).slice(0, 8);
  const occupancy = listSlotOccupancy(acceptances, { date: _today() });
  host.innerHTML = `
    <div class="flex flex-col gap-3 p-4">
      <div class="flex items-center justify-between gap-2">
        <div class="text-rbi-caption font-black uppercase tracking-widest text-brand">${_escape$1(_t$1("construction.v2.cabinet.title", "Кабинет подрядчика"))}</div>
        <div class="text-rbi-caption text-muted font-bold truncate max-w-[14rem]" title="${_escape$1(myId)}">${_escape$1(_t$1("construction.v2.cabinet.my_id", "мой id · {id}", { id: myId.length > 10 ? `${myId.slice(0, 8)}…` : myId }))}</div>
      </div>
      <div class="flex gap-3">
        ${_kpiDesk(_t$1("construction.v2.cabinet.kpi_open", "Открытые"), open.length)}
        ${_kpiDesk(_t$1("construction.v2.cabinet.kpi_review", "На проверке"), onReview.length, "warn")}
        ${_kpiDesk(_t$1("construction.v2.cabinet.kpi_overdue", "Просроченные"), overdue.length, "danger")}
        ${_kpiDesk(_t$1("construction.v2.cabinet.kpi_slots", "Слоты (скоро)"), upcoming.length)}
      </div>
      ${slotBoardHtml(occupancy, { title: _t$1("construction.v2.cabinet.slots_today", "Слоты сегодня ({date})", { date: _today() }) })}
      <div class="grid grid-cols-2 gap-3">
        ${_sectionDesk(_t$1("construction.v2.cabinet.sec_open", "Открытые замечания"), open.map(_defectRowDesk).join(""), _t$1("construction.v2.cabinet.empty_open", "Нет открытых замечаний"), "")}
        ${_sectionDesk(_t$1("construction.v2.cabinet.sec_review", "На проверке"), onReview.map(_defectRowDesk).join(""), _t$1("construction.v2.cabinet.empty_review", "Нет замечаний на проверке"), "")}
        ${_sectionDesk(_t$1("construction.v2.cabinet.sec_overdue", "Просроченные"), overdue.map(_defectRowDesk).join(""), _t$1("construction.v2.cabinet.empty_overdue", "Нет просроченных"), "")}
        ${_sectionDesk(_t$1("construction.v2.cabinet.sec_upcoming", "Ближайшие слоты приёмки"), upcoming.map(_accRowDesk).join(""), _t$1("construction.v2.cabinet.empty_upcoming", "Нет заявок на приёмку"), "")}
      </div>
    </div>`;
  host.querySelectorAll("[data-c2-cab-desk-def]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = btn.getAttribute("data-c2-cab-desk-def");
      if (id) opts.cb.onOpenDefect(id);
    });
  });
  host.querySelectorAll("[data-c2-cab-desk-acc]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = btn.getAttribute("data-c2-cab-desk-acc");
      if (id) opts.cb.onOpenAcceptance(id);
    });
  });
}
function _loc() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.locations) || null;
}
function _defects() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionDefects) || null;
}
function _acc() {
  var _a, _b;
  return ((_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionAcceptance) || null;
}
function _escape(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
let _selectedFloorId = null;
let _bound = false;
let _i18nBound = false;
let _viewer = null;
let _addMode = false;
let _zoneMode = false;
let _mountedPdfUrl = null;
let _subview = "plan";
let _pendingFocusAccId = null;
let _pendingHighlightDefectId = null;
let _fsOpen = false;
let _fsPlaceholder = null;
let _fsEscHandler = null;
function _t(key, fallback, vars) {
  var _a, _b;
  try {
    const i18n = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.i18n;
    if (i18n && typeof i18n.t === "function") {
      const s = i18n.t(key, vars);
      if (s && s !== key) return s;
    }
  } catch (_e) {
  }
  if (!vars) return fallback;
  return String(fallback).replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}
function _bindI18nOnce() {
  var _a;
  if (_i18nBound) return;
  _i18nBound = true;
  const events = (_a = window.RBI) == null ? void 0 : _a.events;
  if (!events || typeof events.on !== "function") return;
  events.on("i18n:localeChanged", () => {
    const tab = document.getElementById("tab-construction-v2");
    if (!tab || tab.classList.contains("hidden")) return;
    renderConstructionV2().catch((e) => console.warn("[construction-v2] i18n refresh", e));
  });
}
function _root() {
  return document.getElementById("construction-v2-root");
}
function _renderTree(svc) {
  const objects = svc.listNodes({ nodeType: "object", parentId: null });
  if (!objects.length) {
    return `<div class="p-6 text-center text-muted text-rbi-label font-bold uppercase tracking-widest">
      ${_t("construction.v2.tree_empty", "Нет объектов. Создайте иерархию в Настройках → «Объекты и планы».")}
    </div>`;
  }
  let html = '<ul class="space-y-1 text-rbi-body">';
  for (const obj of objects) {
    html += `<li class="font-black text-ink">${_escape(obj.displayName)}`;
    const buildings = svc.getChildren(obj.id);
    html += '<ul class="ml-3 mt-1 space-y-1 border-l border-surface pl-2">';
    for (const b of buildings) {
      html += `<li><span class="font-bold text-ink">${_escape(b.displayName)}</span>`;
      const sections = svc.getChildren(b.id);
      html += '<ul class="ml-2 mt-0.5 space-y-0.5">';
      for (const sec of sections) {
        html += `<li class="text-muted">${_escape(sec.displayName)}`;
        const floors = svc.getChildren(sec.id);
        html += '<ul class="ml-2">';
        for (const fl of floors) {
          const plan = svc.getPlanForFloor(fl.id);
          const active = _selectedFloorId === fl.id ? "bg-brand-soft text-brand" : "hover:bg-slate-100 dark:hover:bg-slate-800";
          const mark = (plan == null ? void 0 : plan.pdf_url) ? "📄" : "⚠️";
          html += `<li>
            <button type="button" data-c2-floor="${_escape(fl.id)}"
              class="w-full text-left px-2 py-1 rounded-lg ${active} transition-colors">
              ${mark} ${_escape(fl.displayName)}
            </button>
          </li>`;
        }
        html += "</ul></li>";
      }
      html += "</ul></li>";
    }
    html += "</ul></li>";
  }
  html += "</ul>";
  return html;
}
function _zoomToolbarHtml(prefix) {
  return `<div class="flex gap-1 shrink-0 items-center rounded-xl bg-black/20 p-0.5">
    <button type="button" data-c2-zoom-out="${prefix}"
      class="w-8 h-8 rounded-lg text-[16px] font-black text-white/90 hover:bg-white/10" title="${_escape(_t("construction.v2.zoom_out", "Уменьшить"))}">−</button>
    <button type="button" data-c2-zoom-in="${prefix}"
      class="w-8 h-8 rounded-lg text-[16px] font-black text-white/90 hover:bg-white/10" title="${_escape(_t("construction.v2.zoom_in", "Увеличить"))}">+</button>
    <button type="button" data-c2-zoom-fit="${prefix}"
      class="px-2.5 h-8 rounded-lg text-rbi-caption font-black uppercase text-white/90 hover:bg-white/10" title="${_escape(_t("construction.v2.zoom_fit", "По размеру"))}">Fit</button>
  </div>`;
}
function _fullscreenIconBtn() {
  const fs = _escape(_t("construction.v2.fullscreen", "На весь экран"));
  return `<button type="button" data-c2-fullscreen
    class="w-9 h-9 rounded-xl border border-surface flex items-center justify-center
           text-ink bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
    title="${fs}" aria-label="${fs}">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>
    </svg>
  </button>`;
}
function _renderPlanChrome(svc) {
  if (!_selectedFloorId) {
    return `<div class="flex items-center justify-center h-full min-h-[240px] text-muted text-rbi-body font-medium px-4 text-center">
      ${_t("construction.v2.select_floor", "Выберите этаж слева")}
    </div>`;
  }
  const floor = svc.getNode(_selectedFloorId);
  const plan = svc.getPlanForFloor(_selectedFloorId);
  const path = svc.getPath(_selectedFloorId).map((n) => n.displayName).join(" / ");
  if (!(plan == null ? void 0 : plan.pdf_url)) {
    return `<div class="p-6">
      <div class="text-rbi-label font-bold text-muted mb-2">${_escape(path)}</div>
      <div class="text-amber-600 font-bold text-rbi-body">${_t("construction.v2.no_pdf", "Нет PDF-плана на этом этаже")}</div>
      <p class="text-rbi-label text-muted mt-2">${_t("construction.v2.no_pdf_hint", "Загрузите план в Настройках → «Объекты и планы».")}</p>
    </div>`;
  }
  const addCls = _addMode ? "bg-brand text-white border-brand" : "bg-transparent text-brand border-brand-soft";
  const zoneCls = _zoneMode ? "bg-emerald-600 text-white border-emerald-600" : "bg-transparent text-emerald-700 border-emerald-200 dark:border-emerald-800";
  return `<div class="flex flex-col h-full min-h-[320px]" id="c2-plan-chrome">
    <div class="px-3 py-2 border-b border-surface flex items-center justify-between gap-2 flex-wrap">
      <div class="text-rbi-body font-semibold text-ink min-w-0 truncate">
        ${_escape(path || (floor == null ? void 0 : floor.displayName) || "")}
      </div>
      <div class="flex gap-1.5 shrink-0 items-center">
        <button type="button" data-c2-zone-mode
          class="px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold ${zoneCls}">
          ${_zoneMode ? _t("construction.v2.zone_picking", "2 клика…") : _t("construction.v2.zone", "Зона")}
        </button>
        <button type="button" data-c2-add-mode
          class="px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold ${addCls}">
          ${_addMode ? _t("construction.v2.add_picking", "Кликни…") : _t("construction.v2.add_defect", "+ Замечание")}
        </button>
        ${_fullscreenIconBtn()}
      </div>
    </div>
    <div class="px-3 py-1.5 border-b border-surface" data-c2-pin-filters-host="plan"></div>
    <div class="flex-1 relative bg-slate-100 dark:bg-slate-900 min-h-[280px]" id="c2-plan-host"></div>
    <div class="px-3 py-1.5 text-rbi-caption text-muted border-t border-surface flex justify-end">
      <span id="c2-overlay-count"></span>
    </div>
  </div>`;
}
function _openViewDefect(id) {
  const dSvc = _defects();
  const d = dSvc == null ? void 0 : dSvc.get(id);
  if (!d || !dSvc) return;
  openViewDefectForm(
    d,
    async (defectId) => {
      var _a;
      await dSvc.softDelete(defectId);
      (_a = window.showToast) == null ? void 0 : _a.call(window, "Замечание удалено");
      await _afterDefectMutation();
    },
    async (defectId, patch) => {
      var _a;
      await dSvc.update(defectId, patch);
      (_a = window.showToast) == null ? void 0 : _a.call(window, "Замечание обновлено");
      await _afterDefectMutation();
    },
    async (defectId, input) => {
      var _a;
      await dSvc.changeStatus(defectId, input.status, {
        comment: input.comment,
        photos: input.photos
      });
      (_a = window.showToast) == null ? void 0 : _a.call(window, "✅ Статус обновлён");
      await _afterDefectMutation();
    }
  );
}
async function _afterDefectMutation() {
  if (_subview === "defects" || _subview === "cabinet" || _subview === "metrics") {
    await renderConstructionV2();
    return;
  }
  await _refreshOverlaysOnly();
}
function _setPlanPickerSheetVisible(open) {
  const sheet = document.getElementById("c2-plan-picker-sheet");
  if (!sheet) return;
  sheet.classList.toggle("hidden", !open);
  sheet.classList.toggle("flex", open);
}
async function _mountViewerIfNeeded(svc) {
  const host = document.getElementById("c2-plan-host");
  if (!host || !_selectedFloorId) {
    _viewer == null ? void 0 : _viewer.destroy();
    _viewer = null;
    _mountedPdfUrl = null;
    return;
  }
  const plan = svc.getPlanForFloor(_selectedFloorId);
  if (!(plan == null ? void 0 : plan.pdf_url)) {
    _viewer == null ? void 0 : _viewer.destroy();
    _viewer = null;
    _mountedPdfUrl = null;
    return;
  }
  const needReload = !_viewer || _mountedPdfUrl !== plan.pdf_url;
  if (needReload) {
    _viewer == null ? void 0 : _viewer.destroy();
    _viewer = new PlanViewer(host, {
      onPlanClick: (x, y) => {
        var _a;
        if (!_selectedFloorId) return;
        const dSvc = _defects();
        if (!dSvc) {
          (_a = window.showToast) == null ? void 0 : _a.call(window, "service.constructionDefects не загружен");
          return;
        }
        _viewer == null ? void 0 : _viewer.drawTempPin(x, y);
        openCreateDefectForm(
          { locationId: _selectedFloorId, x, y },
          async (input) => {
            var _a2;
            await dSvc.create({
              locationId: input.locationId,
              x: input.x,
              y: input.y,
              description: input.description,
              category: input.category,
              contractorId: input.contractorId,
              deadline: input.deadline,
              template_key: input.template_key,
              item_id: input.item_id,
              item_name: input.item_name,
              norm_text: input.norm_text,
              photos: input.photos,
              status: "issued"
            });
            _addMode = false;
            _viewer == null ? void 0 : _viewer.setAddMode(false);
            _viewer == null ? void 0 : _viewer.clearTempPin();
            (_a2 = window.showToast) == null ? void 0 : _a2.call(window, "Замечание сохранено");
            await _refreshOverlaysOnly();
            _syncModeButtons();
          },
          () => _viewer == null ? void 0 : _viewer.clearTempPin()
        );
      },
      onMarkerClick: (id) => {
        _openViewDefect(id);
      },
      onZoneDrawn: (zone) => {
        var _a;
        if (!_selectedFloorId) return;
        const aSvc = _acc();
        if (!aSvc) {
          (_a = window.showToast) == null ? void 0 : _a.call(window, "service.constructionAcceptance не загружен");
          return;
        }
        openCreateAcceptanceForm(
          { locationId: _selectedFloorId, zone },
          async (input) => {
            var _a2;
            await aSvc.create(input);
            _zoneMode = false;
            _viewer == null ? void 0 : _viewer.setZoneMode(false);
            (_a2 = window.showToast) == null ? void 0 : _a2.call(window, "✅ Заявка отправлена");
            await _refreshOverlaysOnly();
            _syncModeButtons();
          },
          () => {
            _viewer == null ? void 0 : _viewer.clearTempZone();
          }
        );
      },
      onZoneClick: (id) => {
        const aSvc = _acc();
        const item = aSvc == null ? void 0 : aSvc.get(id);
        if (!item || !aSvc) return;
        openAcceptanceDetails(item, {
          onFocusPlan: (rid) => {
            _viewer == null ? void 0 : _viewer.setFocusZone(rid);
          },
          onChangeStatus: async (rid, status) => {
            var _a;
            await aSvc.changeStatus(rid, status);
            (_a = window.showToast) == null ? void 0 : _a.call(window, "✅ Статус обновлён");
            await _refreshOverlaysOnly();
          },
          onSoftDelete: async (rid) => {
            var _a;
            await aSvc.softDelete(rid);
            (_a = window.showToast) == null ? void 0 : _a.call(window, "Заявка отозвана");
            await _refreshOverlaysOnly();
          }
        });
      }
    });
    try {
      await _viewer.load(plan.pdf_url);
      _mountedPdfUrl = plan.pdf_url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      host.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">Ошибка плана: ${_escape(msg)}</div>`;
      _viewer = null;
      _mountedPdfUrl = null;
      return;
    }
  }
  if (_viewer) {
    _viewer.setAddMode(_addMode);
    _viewer.setZoneMode(_zoneMode);
  }
  await _refreshOverlaysOnly();
  if (_pendingFocusAccId && _viewer) {
    _viewer.setFocusZone(_pendingFocusAccId);
    _pendingFocusAccId = null;
  }
  if (_pendingHighlightDefectId && _viewer) {
    _viewer.highlightMarker(_pendingHighlightDefectId);
    _pendingHighlightDefectId = null;
  }
}
function _syncModeButtons() {
  const inFs = !!document.getElementById("c2-plan-fs");
  document.querySelectorAll("[data-c2-add-mode]").forEach((el) => {
    const btn = el;
    btn.textContent = _addMode ? _t("construction.v2.add_picking", "Кликни…") : _t("construction.v2.add_defect", "+ Замечание");
    if (inFs && btn.closest("#c2-plan-fs")) {
      btn.className = _addMode ? "px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold bg-brand text-white border-brand" : "px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold bg-white/10 text-white border-white/30";
    } else {
      btn.className = _addMode ? "px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold bg-brand text-white border-brand" : "px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold bg-transparent text-brand border-brand-soft";
    }
  });
  document.querySelectorAll("[data-c2-zone-mode]").forEach((el) => {
    const btn = el;
    btn.textContent = _zoneMode ? _t("construction.v2.zone_picking", "2 клика…") : _t("construction.v2.zone", "Зона");
    if (inFs && btn.closest("#c2-plan-fs")) {
      btn.className = _zoneMode ? "px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold bg-emerald-600 text-white border-emerald-600" : "px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold bg-white/10 text-white border-white/30";
    } else {
      btn.className = _zoneMode ? "px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold bg-emerald-600 text-white border-emerald-600" : "px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold bg-transparent text-emerald-700 border-emerald-200 dark:border-emerald-800";
    }
  });
}
async function _refreshOverlaysOnly() {
  const dSvc = _defects();
  const aSvc = _acc();
  if (!_viewer || !_selectedFloorId) return;
  if (dSvc) await dSvc.init();
  if (aSvc) await aSvc.init();
  const allDefects = filterDefectsForRole(dSvc ? dSvc.listForFloor(_selectedFloorId) : []);
  const filtered = filterDefectsByPins(allDefects, pinFiltersState);
  const zones = filterAcceptancesForRole(aSvc ? aSvc.listForFloor(_selectedFloorId) : []);
  paintPinFilterHosts(allDefects, pinFiltersState, { compact: true });
  _viewer.setMarkers(filtered);
  _viewer.setZones(zones);
  const label = _t("construction.v2.overlay_count", "Показано {shown} из {total} · Зон: {zones}", {
    shown: filtered.length,
    total: allDefects.length,
    zones: zones.length
  });
  const countEl = document.getElementById("c2-overlay-count");
  if (countEl) countEl.textContent = label;
  const fsCount = document.getElementById("c2-fs-overlay-count");
  if (fsCount) fsCount.textContent = label;
}
async function _onPinFiltersChanged() {
  if (_subview === "defects") {
    await renderConstructionV2();
    return;
  }
  await _refreshOverlaysOnly();
}
function _closePlanFullscreen() {
  if (!_fsOpen) return;
  const overlay = document.getElementById("c2-plan-fs");
  const host = document.getElementById("c2-plan-host");
  if (host && (_fsPlaceholder == null ? void 0 : _fsPlaceholder.parentNode)) {
    _fsPlaceholder.parentNode.insertBefore(host, _fsPlaceholder);
    _fsPlaceholder.remove();
  }
  _fsPlaceholder = null;
  overlay == null ? void 0 : overlay.remove();
  if (_fsEscHandler) {
    document.removeEventListener("keydown", _fsEscHandler);
    _fsEscHandler = null;
  }
  _fsOpen = false;
}
function _openPlanFullscreen() {
  var _a, _b;
  if (_fsOpen) return;
  const host = document.getElementById("c2-plan-host");
  if (!host || !_viewer) {
    (_a = window.showToast) == null ? void 0 : _a.call(window, "Сначала откройте план этажа");
    return;
  }
  const parent = host.parentNode;
  if (!parent) return;
  _fsPlaceholder = document.createComment("c2-plan-host-slot");
  parent.insertBefore(_fsPlaceholder, host);
  const overlay = document.createElement("div");
  overlay.id = "c2-plan-fs";
  overlay.className = "fixed inset-0 flex flex-col bg-slate-900";
  overlay.style.zIndex = "1100";
  const addCls = _addMode ? "bg-brand text-white border-brand" : "bg-white/10 text-white border-white/30";
  const zoneCls = _zoneMode ? "bg-emerald-600 text-white border-emerald-600" : "bg-white/10 text-white border-white/30";
  overlay.innerHTML = `
    <div class="shrink-0 flex flex-col gap-1.5 px-3 py-2.5 border-b border-white/10 bg-slate-950/90">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="text-rbi-label font-bold tracking-wide text-indigo-300">${_t("construction.v2.fs_title", "План · весь экран")}</div>
        <div class="flex items-center gap-2 flex-wrap">
          <span id="c2-fs-overlay-count" class="text-rbi-caption font-medium text-muted hidden sm:inline"></span>
          ${_zoomToolbarHtml("fs")}
          <button type="button" data-c2-zone-mode
            class="px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold ${zoneCls}">
            ${_zoneMode ? _t("construction.v2.zone_picking", "2 клика…") : _t("construction.v2.zone", "Зона")}
          </button>
          <button type="button" data-c2-add-mode
            class="px-2.5 py-1.5 rounded-xl border text-rbi-caption font-bold ${addCls}">
            ${_addMode ? _t("construction.v2.add_picking", "Кликни…") : _t("construction.v2.add_defect", "+ Замечание")}
          </button>
          <button type="button" data-c2-fs-close
            class="px-3 py-1.5 rounded-xl border text-rbi-caption font-bold bg-white text-ink border-white">${_t("construction.v2.fs_close", "Закрыть")}</button>
        </div>
      </div>
      <div data-c2-pin-filters-host="fs"></div>
    </div>
    <div id="c2-plan-fs-host" class="relative flex-1 min-h-0 overflow-hidden"></div>`;
  const fsHost = overlay.querySelector("#c2-plan-fs-host");
  host.classList.add("h-full", "min-h-0");
  fsHost.appendChild(host);
  document.body.appendChild(overlay);
  _fsOpen = true;
  (_b = overlay.querySelector("[data-c2-fs-close]")) == null ? void 0 : _b.addEventListener("click", (ev) => {
    ev.preventDefault();
    _closePlanFullscreen();
  });
  _fsEscHandler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      _closePlanFullscreen();
    }
  };
  document.addEventListener("keydown", _fsEscHandler);
  void _refreshOverlaysOnly();
}
function setConstructionV2Subview(view) {
  if (view !== "plan") _closePlanFullscreen();
  _subview = view;
}
function requestFocusAcceptance(id, locationId) {
  _subview = "plan";
  _selectedFloorId = locationId;
  _pendingFocusAccId = id;
  if ((location.hash || "").replace(/^#/, "") !== "/construction-v2") {
    location.hash = "#/construction-v2";
  }
  renderConstructionV2().catch(() => {
  });
}
function focusDefectOnPlan(id, locationId) {
  _closePlanFullscreen();
  _subview = "plan";
  _selectedFloorId = locationId;
  _pendingHighlightDefectId = id;
  if ((location.hash || "").replace(/^#/, "") !== "/construction-v2") {
    location.hash = "#/construction-v2";
  } else {
    renderConstructionV2().catch(() => {
    });
  }
}
async function renderConstructionV2() {
  var _a, _b;
  const root = _root();
  if (!root) return;
  _bindI18nOnce();
  if (_subview === "acceptance") {
    _closePlanFullscreen();
    teardownTransferUi();
    _viewer == null ? void 0 : _viewer.destroy();
    _viewer = null;
    _mountedPdfUrl = null;
    bindResizeWatcher(() => {
      if (_subview === "acceptance") renderConstructionV2().catch(() => {
      });
    });
    if (isDesktopViewport()) {
      await renderAcceptanceKanbanDesktop(root);
    } else {
      await renderAcceptanceKanban(root);
    }
    return;
  }
  if (_subview === "cabinet") {
    _closePlanFullscreen();
    teardownTransferUi();
    _viewer == null ? void 0 : _viewer.destroy();
    _viewer = null;
    _mountedPdfUrl = null;
    bindResizeWatcher(() => {
      if (_subview === "cabinet") renderConstructionV2().catch(() => {
      });
    });
    const dSvcCab = _defects();
    const aSvcCab = _acc();
    if (dSvcCab) await dSvcCab.init();
    if (aSvcCab) await aSvcCab.init();
    root.innerHTML = `<div id="c2-cabinet-host" class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden min-h-[420px]"></div>`;
    const host = document.getElementById("c2-cabinet-host");
    if (!host) return;
    const defects = ((_a = dSvcCab == null ? void 0 : dSvcCab.list) == null ? void 0 : _a.call(dSvcCab, { includeDeleted: false })) || [];
    const acceptances = ((_b = aSvcCab == null ? void 0 : aSvcCab.list) == null ? void 0 : _b.call(aSvcCab, { includeDeleted: false })) || [];
    const cabinetOpts = {
      defects,
      acceptances,
      cb: {
        onOpenDefect: (id) => _openViewDefect(id),
        onOpenAcceptance: (id) => {
          const item = aSvcCab == null ? void 0 : aSvcCab.get(id);
          if (!item || !aSvcCab) return;
          openAcceptanceDetails(item, {
            onFocusPlan: (rid) => focusAcceptanceOnPlan(rid),
            onChangeStatus: async (rid, status) => {
              var _a2;
              await aSvcCab.changeStatus(rid, status);
              (_a2 = window.showToast) == null ? void 0 : _a2.call(window, "✅ Статус обновлён");
              await renderConstructionV2();
            },
            onSoftDelete: async (rid) => {
              var _a2;
              await aSvcCab.softDelete(rid);
              (_a2 = window.showToast) == null ? void 0 : _a2.call(window, "Заявка отозвана");
              await renderConstructionV2();
            },
            onChecklistChanged: async () => {
              await renderConstructionV2();
            }
          });
        }
      }
    };
    if (isDesktopViewport()) {
      renderContractorCabinetDesktop(host, cabinetOpts);
    } else {
      renderContractorCabinet(host, cabinetOpts);
    }
    return;
  }
  if (_subview === "transfer") {
    _closePlanFullscreen();
    _viewer == null ? void 0 : _viewer.destroy();
    _viewer = null;
    _mountedPdfUrl = null;
    bindResizeWatcher(() => {
      if (_subview === "transfer") renderConstructionV2().catch(() => {
      });
    });
    if (isDesktopViewport()) {
      await renderTransferBoardDesktop(root);
    } else {
      await renderTransferBoard(root);
    }
    return;
  }
  teardownTransferUi();
  const svc = _loc();
  if (!svc) {
    root.innerHTML = `<div class="p-6 text-danger text-rbi-body font-bold">service.locations не загружен</div>`;
    return;
  }
  const dSvc = _defects();
  const aSvc = _acc();
  await svc.init();
  if (dSvc) await dSvc.init();
  if (aSvc) await aSvc.init();
  const prevFloor = _selectedFloorId;
  _closePlanFullscreen();
  _viewer == null ? void 0 : _viewer.destroy();
  _viewer = null;
  _mountedPdfUrl = null;
  if (_subview === "metrics") {
    bindResizeWatcher(() => {
      if (_subview === "metrics") renderConstructionV2().catch(() => {
      });
    });
    root.innerHTML = `<div id="c2-metrics-host" class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden min-h-[420px]"></div>`;
    const host = document.getElementById("c2-metrics-host");
    if (!host) return;
    const scopedDefectsSvc = dSvc ? {
      list: (opts) => filterDefectsForRole(dSvc.list(opts) || [])
    } : null;
    const metricsOpts = {
      loc: svc,
      defectsSvc: scopedDefectsSvc,
      cb: { onOpenDefect: (id) => _openViewDefect(id) }
    };
    if (isDesktopViewport()) {
      renderMetricsViewDesktop(host, metricsOpts);
    } else {
      renderMetricsView(host, metricsOpts);
    }
    return;
  }
  if (_subview === "defects") {
    bindResizeWatcher(() => {
      if (_subview === "defects") renderConstructionV2().catch(() => {
      });
    });
    root.innerHTML = `
      <div class="flex flex-col md:flex-row gap-3 h-full min-h-[420px]">
        <aside class="md:w-72 shrink-0 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3 overflow-y-auto max-h-[70vh]">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-brand mb-2">${_t("construction.v2.hierarchy", "Иерархия (v2)")}</div>
          <div id="c2-tree">${_renderTree(svc)}</div>
          ${!dSvc ? `<div class="mt-3 text-rbi-caption text-amber-600 font-bold">${_t("construction.v2.svc_defects_missing", "constructionDefects не загружен")}</div>` : ""}
        </aside>
        <main class="flex-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden relative" id="c2-defects-host"></main>
      </div>`;
    _bindOnce();
    if (prevFloor) _selectedFloorId = prevFloor;
    const host = document.getElementById("c2-defects-host");
    if (!host) return;
    const floor = _selectedFloorId ? svc.getNode(_selectedFloorId) : null;
    const path = _selectedFloorId ? svc.getPath(_selectedFloorId).map((n) => n.displayName).join(" / ") : "";
    const list = _selectedFloorId && dSvc ? dSvc.listForFloor(_selectedFloorId) : [];
    const registryOpts = {
      floorId: _selectedFloorId,
      floorLabel: path || (floor == null ? void 0 : floor.displayName) || "",
      defects: list,
      filters: pinFiltersState,
      cb: {
        onOpenDefect: (id) => _openViewDefect(id),
        onShowOnPlan: (id, locationId) => focusDefectOnPlan(id, locationId)
      }
    };
    if (isDesktopViewport()) {
      renderDefectsRegistryDesktop(host, registryOpts);
    } else {
      renderDefectsRegistry(host, registryOpts);
    }
    return;
  }
  bindResizeWatcher(() => {
    if (_subview === "plan") renderConstructionV2().catch(() => {
    });
  });
  const svcMissingHtml = `
    ${!dSvc ? `<div class="mt-3 text-rbi-caption text-amber-600 font-bold">${_t("construction.v2.svc_defects_missing", "constructionDefects не загружен")}</div>` : ""}
    ${!aSvc ? `<div class="mt-1 text-rbi-caption text-amber-600 font-bold">${_t("construction.v2.svc_acc_missing", "constructionAcceptance не загружен")}</div>` : ""}`;
  if (isDesktopViewport()) {
    root.innerHTML = `
      <div class="flex flex-col md:flex-row gap-3 h-full min-h-[420px]">
        <aside class="md:w-72 shrink-0 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3 overflow-y-auto max-h-[70vh]">
          <div class="text-rbi-caption font-black uppercase tracking-widest text-brand mb-2">${_t("construction.v2.hierarchy", "Иерархия (v2)")}</div>
          <div id="c2-tree">${renderPlanTreeDesktop(svc, _selectedFloorId)}</div>
          ${svcMissingHtml}
        </aside>
        <main class="flex-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden relative" id="c2-plan">
          ${renderPlanChromeDesktop(svc, { selectedFloorId: _selectedFloorId, addMode: _addMode, zoneMode: _zoneMode })}
        </main>
      </div>`;
  } else {
    const path = _selectedFloorId ? svc.getPath(_selectedFloorId).map((n) => n.displayName).join(" / ") : "";
    root.innerHTML = `
      <div class="flex flex-col h-full min-h-[420px]">
        <button type="button" data-c2-plan-picker-open
          class="flex items-center gap-2 px-3 py-2.5 mb-2 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-left shrink-0">
          <span class="text-rbi-caption font-black uppercase tracking-widest text-brand shrink-0">${_t("construction.v2.hierarchy", "Иерархия (v2)")}</span>
          <span class="flex-1 min-w-0 truncate text-rbi-body font-semibold text-ink">
            ${path ? _escape(path) : _t("construction.v2.select_floor_cta", "Выбрать этаж")}
          </span>
          <span class="text-rbi-caption font-black uppercase text-brand shrink-0">${_t("construction.v2.change", "Изменить")}</span>
        </button>
        <main class="flex-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden relative" id="c2-plan">
          ${_renderPlanChrome(svc)}
        </main>
      </div>
      <div id="c2-plan-picker-sheet" data-c2-plan-picker-backdrop
        class="fixed inset-0 z-[6000] hidden items-end bg-black/40 p-3">
        <div class="w-full max-h-[75vh] bg-[var(--card-bg)] rounded-t-2xl shadow-2xl border border-[var(--card-border)] overflow-hidden flex flex-col">
          <div class="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between shrink-0">
            <div class="text-rbi-label font-black uppercase tracking-widest text-brand">${_t("construction.v2.hierarchy", "Иерархия (v2)")}</div>
            <button type="button" data-c2-plan-picker-close
              class="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
          </div>
          <div class="p-3 overflow-y-auto">
            <div id="c2-tree">${_renderTree(svc)}</div>
            ${svcMissingHtml}
          </div>
        </div>
      </div>`;
  }
  _bindOnce();
  _bindI18nOnce();
  if (prevFloor) _selectedFloorId = prevFloor;
  await _mountViewerIfNeeded(svc);
}
function _bindOnce() {
  if (_bound) return;
  _bound = true;
  document.addEventListener(
    "click",
    (ev) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
      const t = ev.target;
      const floorBtn = (_a = t == null ? void 0 : t.closest) == null ? void 0 : _a.call(t, "[data-c2-floor]");
      if (floorBtn) {
        const id = floorBtn.getAttribute("data-c2-floor");
        if (!id) return;
        _selectedFloorId = id;
        _addMode = false;
        _zoneMode = false;
        _setPlanPickerSheetVisible(false);
        renderConstructionV2().catch((e) => console.warn("[construction-v2] render", e));
        return;
      }
      const planPickerOpenBtn = (_b = t == null ? void 0 : t.closest) == null ? void 0 : _b.call(t, "[data-c2-plan-picker-open]");
      if (planPickerOpenBtn) {
        _setPlanPickerSheetVisible(true);
        return;
      }
      const planPickerCloseBtn = (_c = t == null ? void 0 : t.closest) == null ? void 0 : _c.call(t, "[data-c2-plan-picker-close]");
      if (planPickerCloseBtn) {
        _setPlanPickerSheetVisible(false);
        return;
      }
      if (t && t.hasAttribute("data-c2-plan-picker-backdrop")) {
        _setPlanPickerSheetVisible(false);
        return;
      }
      const addBtn = (_d = t == null ? void 0 : t.closest) == null ? void 0 : _d.call(t, "[data-c2-add-mode]");
      if (addBtn) {
        _addMode = !_addMode;
        if (_addMode) _zoneMode = false;
        _viewer == null ? void 0 : _viewer.setAddMode(_addMode);
        _viewer == null ? void 0 : _viewer.setZoneMode(_zoneMode);
        _syncModeButtons();
        return;
      }
      const zoneBtn = (_e = t == null ? void 0 : t.closest) == null ? void 0 : _e.call(t, "[data-c2-zone-mode]");
      if (zoneBtn) {
        _zoneMode = !_zoneMode;
        if (_zoneMode) _addMode = false;
        _viewer == null ? void 0 : _viewer.setZoneMode(_zoneMode);
        _viewer == null ? void 0 : _viewer.setAddMode(_addMode);
        _syncModeButtons();
        return;
      }
      const fsBtn = (_f = t == null ? void 0 : t.closest) == null ? void 0 : _f.call(t, "[data-c2-fullscreen]");
      if (fsBtn) {
        ev.preventDefault();
        _openPlanFullscreen();
        return;
      }
      const zIn = (_g = t == null ? void 0 : t.closest) == null ? void 0 : _g.call(t, "[data-c2-zoom-in]");
      if (zIn) {
        ev.preventDefault();
        _viewer == null ? void 0 : _viewer.zoomIn();
        return;
      }
      const zOut = (_h = t == null ? void 0 : t.closest) == null ? void 0 : _h.call(t, "[data-c2-zoom-out]");
      if (zOut) {
        ev.preventDefault();
        _viewer == null ? void 0 : _viewer.zoomOut();
        return;
      }
      const zFit = (_i = t == null ? void 0 : t.closest) == null ? void 0 : _i.call(t, "[data-c2-zoom-fit]");
      if (zFit) {
        ev.preventDefault();
        _viewer == null ? void 0 : _viewer.fit();
        return;
      }
      const statusChip = (_j = t == null ? void 0 : t.closest) == null ? void 0 : _j.call(t, "[data-c2-pin-status]");
      if (statusChip) {
        if ((_k = t == null ? void 0 : t.closest) == null ? void 0 : _k.call(t, "#c2-apartment-plan")) return;
        ev.preventDefault();
        const key = statusChip.getAttribute("data-c2-pin-status");
        if (!key) return;
        toggleStatusFilter(pinFiltersState, key);
        void _onPinFiltersChanged();
        return;
      }
      const catBtn = (_l = t == null ? void 0 : t.closest) == null ? void 0 : _l.call(t, "[data-c2-pin-category]");
      if (catBtn) {
        if ((_m = t == null ? void 0 : t.closest) == null ? void 0 : _m.call(t, "#c2-apartment-plan")) return;
        ev.preventDefault();
        const key = catBtn.getAttribute("data-c2-pin-category");
        if (!key) return;
        setCategoryFilter(pinFiltersState, key);
        void _onPinFiltersChanged();
      }
    },
    true
  );
}
function mountConstructionV2Shell() {
  var _a, _b, _c, _d;
  const content = ((_d = (_c = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.shell) == null ? void 0 : _c.getContentRoot) == null ? void 0 : _d.call(_c)) || document.getElementById("app-content") || document.getElementById("app-root");
  if (!content) return;
  if (document.getElementById("tab-construction-v2")) return;
  const section = document.createElement("div");
  section.id = "tab-construction-v2";
  section.className = "view-section hidden";
  section.innerHTML = `
    <div class="p-3 sm:p-4">
      <div class="flex items-center justify-between mb-3 gap-2">
        <div class="min-w-0">
          <h2 class="text-rbi-title font-bold tracking-tight text-ink">Стройконтроль в2</h2>
          <p class="text-rbi-caption text-muted mt-0.5">Тестовый контур · основной СК не затронут</p>
        </div>
        <a href="#/construction/defects"
          class="shrink-0 text-rbi-caption font-bold text-brand border border-brand-soft px-2.5 py-1.5 rounded-xl">Старый СК</a>
      </div>
      <div id="construction-v2-root"></div>
    </div>`;
  content.appendChild(section);
}
async function refreshConstructionV2Markers() {
  const tab = document.getElementById("tab-construction-v2");
  if (!tab || tab.classList.contains("hidden")) return;
  if (_subview === "acceptance") {
    const root = _root();
    if (root) {
      if (isDesktopViewport()) await renderAcceptanceKanbanDesktop(root);
      else await renderAcceptanceKanban(root);
    }
    return;
  }
  if (_subview === "transfer") {
    const root = _root();
    if (root) {
      if (isDesktopViewport()) await renderTransferBoardDesktop(root);
      else await renderTransferBoard(root);
    }
    return;
  }
  if (_subview === "defects" || _subview === "metrics") {
    await renderConstructionV2();
    return;
  }
  await _refreshOverlaysOnly();
}
let _inited = false;
async function _syncChecklistOnDefectClosed(payload) {
  var _a, _b, _c, _d, _e;
  if ((payload == null ? void 0 : payload.reason) !== "changeStatus") return;
  if (String(payload.status || "") !== "closed") return;
  const defectId = String(payload.id || "").trim();
  if (!defectId) return;
  const dSvc = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.constructionDefects;
  const aSvc = (_d = (_c = window.RBI) == null ? void 0 : _c.services) == null ? void 0 : _d.constructionAcceptance;
  if (!(dSvc == null ? void 0 : dSvc.get) || !(aSvc == null ? void 0 : aSvc.setChecklistItem)) return;
  const defect = dSvc.get(defectId);
  if (!defect || defect.is_deleted || defect._deleted) return;
  const itemId = String(defect.item_id || "").trim();
  const locationId = String(defect.locationId || payload.locationId || "").trim();
  if (!itemId || !locationId) return;
  const acceptances = (typeof aSvc.listForLocation === "function" ? aSvc.listForLocation(locationId) : aSvc.list({ locationId })) || [];
  for (const acc of acceptances) {
    if (!acc || acc.is_deleted || acc._deleted) continue;
    if (String(acc.status) === "rejected") continue;
    const row = (((_e = acc.checklist_results) == null ? void 0 : _e.items) || []).find((it) => String(it.id) === itemId);
    if (!row) continue;
    if (row.status !== "fail" && row.status !== "fail_escalated") continue;
    try {
      await aSvc.setChecklistItem(acc.id, {
        id: itemId,
        name: String(row.name || defect.item_name || itemId),
        group: row.group ?? null,
        status: "ok"
      });
    } catch (e) {
      console.warn("[construction-v2] auto checklist OK on defect closed", e);
    }
  }
}
function _hashPath() {
  return (location.hash || "").replace(/^#/, "");
}
function _applyHashSubview() {
  const h = _hashPath();
  if (h.startsWith("/construction-v2/acceptance")) {
    setConstructionV2Subview("acceptance");
  } else if (h.startsWith("/construction-v2/transfer")) {
    setConstructionV2Subview("transfer");
  } else if (h.startsWith("/construction-v2/defects")) {
    setConstructionV2Subview("defects");
  } else if (h.startsWith("/construction-v2/metrics")) {
    setConstructionV2Subview("metrics");
  } else if (h.startsWith("/construction-v2/cabinet")) {
    setConstructionV2Subview("cabinet");
  } else if (h === "/construction-v2" || h === "/construction-v2/") {
    setConstructionV2Subview(isContractorRole() ? "cabinet" : "plan");
  } else if (h.startsWith("/construction-v2")) {
    setConstructionV2Subview(isContractorRole() ? "cabinet" : "plan");
  }
}
async function init(_ctx) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
  if (_inited) {
    _applyHashSubview();
    await renderConstructionV2();
    return { ok: true, reentered: true };
  }
  mountConstructionV2Shell();
  _applyHashSubview();
  await renderConstructionV2();
  (_c = (_b = (_a = window.RBI) == null ? void 0 : _a.events) == null ? void 0 : _b.on) == null ? void 0 : _c.call(_b, "locations:changed", () => {
    const tab = document.getElementById("tab-construction-v2");
    if (tab && !tab.classList.contains("hidden")) {
      renderConstructionV2().catch(() => {
      });
    }
  });
  (_f = (_e = (_d = window.RBI) == null ? void 0 : _d.events) == null ? void 0 : _e.on) == null ? void 0 : _f.call(_e, "construction-defects:changed", (payload) => {
    refreshConstructionV2Markers().catch(() => {
    });
    refreshApartmentPlanMarkers().catch(() => {
    });
    const p = payload || {};
    void _syncChecklistOnDefectClosed(p);
  });
  (_i = (_h = (_g = window.RBI) == null ? void 0 : _g.events) == null ? void 0 : _h.on) == null ? void 0 : _i.call(_h, "construction-acceptance:changed", () => {
    refreshConstructionV2Markers().catch(() => {
    });
    const tab = document.getElementById("tab-construction-v2");
    if (tab && !tab.classList.contains("hidden")) {
      const transferRoot = document.getElementById("c2-transfer-grid");
      if (transferRoot) {
        renderConstructionV2().catch(() => {
        });
      }
    }
  });
  (_l = (_k = (_j = window.RBI) == null ? void 0 : _j.events) == null ? void 0 : _k.on) == null ? void 0 : _l.call(_k, "construction-units:changed", () => {
    refreshConstructionV2Markers().catch(() => {
    });
  });
  (_o = (_n = (_m = window.RBI) == null ? void 0 : _m.events) == null ? void 0 : _n.on) == null ? void 0 : _o.call(_n, "construction-acceptance:focus", (payload) => {
    const p = payload || {};
    if (p.id && p.locationId) requestFocusAcceptance(p.id, p.locationId);
  });
  _registerAppRouter();
  if (_hashPath().startsWith("/construction-v2")) {
    showTab();
  }
  _inited = true;
  console.info("[construction-v2] init ok");
  return { ok: true };
}
function showTab() {
  document.querySelectorAll(".view-section").forEach((el) => {
    el.classList.remove("active");
  });
  const tab = document.getElementById("tab-construction-v2");
  if (tab) {
    tab.classList.remove("hidden");
    tab.classList.add("active");
  }
  const modeMgr = window.AppModeManager;
  if (modeMgr == null ? void 0 : modeMgr.updateHeaderVisibility) {
    modeMgr.updateHeaderVisibility(true);
  } else {
    const header = document.getElementById("main-header");
    if (header) header.style.display = "block";
  }
  if ((modeMgr == null ? void 0 : modeMgr.currentMode) === "construction-v2" && typeof modeMgr.renderBottomNav === "function") {
    modeMgr.renderBottomNav();
  } else {
    const navEl = document.getElementById("main-bottom-nav");
    if (navEl && (modeMgr == null ? void 0 : modeMgr.currentMode) === "construction-v2") navEl.style.display = "flex";
  }
  if (typeof window.updateBodyPadding === "function") {
    setTimeout(() => {
      var _a;
      return (_a = window.updateBodyPadding) == null ? void 0 : _a.call(window);
    }, 50);
  }
  _applyHashSubview();
  renderConstructionV2().catch(() => {
  });
}
function _registerAppRouter() {
  const router = window.AppRouter;
  if (router && typeof router.addRoute === "function") {
    router.addRoute("#/construction-v2", () => showTab());
    router.addRoute("#/construction-v2/acceptance", () => showTab());
    router.addRoute("#/construction-v2/transfer", () => showTab());
    router.addRoute("#/construction-v2/defects", () => showTab());
    router.addRoute("#/construction-v2/metrics", () => showTab());
    router.addRoute("#/construction-v2/cabinet", () => showTab());
  }
}
function registerModule() {
  var _a;
  window.RBI = window.RBI || { services: {} };
  const mod = { init, showTab, manifest: ConstructionV2Manifest, render: renderConstructionV2 };
  if ((_a = window.RBI.registry) == null ? void 0 : _a.register) {
    window.RBI.registry.register("module.construction-v2", mod);
  }
  window.ConstructionV2Module = mod;
  _registerAppRouter();
  window.addEventListener("hashchange", () => {
    const h = _hashPath();
    if (h.startsWith("/construction-v2")) showTab();
  });
  if (_hashPath().startsWith("/construction-v2")) {
    setTimeout(() => showTab(), 0);
  }
}
registerModule();
const index = { init, showTab, manifest: ConstructionV2Manifest };
export {
  ConstructionV2Manifest,
  index as default,
  init,
  showTab
};
//# sourceMappingURL=construction-v2.js.map
