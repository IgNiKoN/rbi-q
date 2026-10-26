function j(r) {
  return r.code === "42501" ? "Только для администратора платформы" : /failed to fetch|network|load failed/i.test(r.message) ? "Нет связи с сервером. Попробуйте позже" : /[а-яё]/i.test(r.message) ? r.message : "Не удалось выполнить. Попробуйте ещё раз";
}
function H(r) {
  const o = async (e, t, n) => {
    try {
      const { data: d, error: p } = await r(e, t);
      return p ? { ok: !1, message: j(p) } : { ok: !0, value: n(d) };
    } catch (d) {
      return { ok: !1, message: j({ message: d instanceof Error ? d.message : "" }) };
    }
  };
  return {
    companies: () => o("pf_platform_companies", {}, (e) => (Array.isArray(e) ? e : []).map((t) => ({
      id: String(t.id),
      name: String(t.name || ""),
      is_test: t.is_test === !0,
      created_at: String(t.created_at || ""),
      people: Number(t.people) || 0,
      modules: (Array.isArray(t.modules) ? t.modules : []).map((n) => ({
        code: String(n.code),
        name: String(n.name || n.code),
        managed: n.managed === !0,
        enabled: n.enabled === null || n.enabled === void 0 ? null : n.enabled === !0
      }))
    }))),
    createCompany: (e, t) => o("pf_platform_create_company", { p_name: e, p_is_test: t }, (n) => String(n)),
    setModule: (e, t, n) => o("pf_platform_set_module", { p_company: e, p_module: t, p_enabled: n }, () => {
    }),
    setCompanyAdmin: (e, t) => o("pf_platform_set_company_admin", { p_company: e, p_email: t }, () => {
    })
  };
}
const R = `
.pa-root{display:flex;flex-direction:column;gap:12px;color:var(--text-main)}
.pa-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px}
.pa-title{margin:0;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.02em}
.pa-muted{font-size:12px;color:var(--text-muted);line-height:1.45}
.pa-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pa-input{flex:1 1 200px;min-width:0;font-size:16px;min-height:44px;padding:8px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main)}
.pa-btn{min-height:44px;padding:8px 16px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;border-radius:12px;border:0;background:var(--accent,var(--primary));color:#fff;cursor:pointer}
.pa-btn:disabled{opacity:.6;cursor:default}
.pa-check{display:inline-flex;align-items:center;gap:8px;font-size:13px;min-height:44px}
.pa-check input{width:20px;height:20px}
.pa-head{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;justify-content:space-between}
.pa-name{font-size:15px;font-weight:800}
.pa-badge{font-size:10px;font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--card-border);color:var(--text-muted)}
.pa-mods{display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--card-border);padding-top:10px}
.pa-mod{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;min-height:44px}
.pa-mod-name{font-size:14px;font-weight:700}
.pa-mod-hint{flex:1 1 100%;font-size:11px;color:var(--text-muted);margin-top:-6px}
.pa-switch{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;cursor:pointer;min-height:44px}
.pa-switch input{width:22px;height:22px}
.pa-msg{font-size:13px}
.pa-msg[data-kind="error"]{color:var(--color-red,#dc2626)}
.pa-msg[data-kind="ok"]{color:var(--color-green,#16a34a)}
.pa-root [hidden]{display:none!important}
`, B = {
  knowledge: "Работает вместе с «Качеством»: документы и чек-листы компании, видят все с доступом к Качеству.",
  ai: "Работает вместе с «Качеством». Кому именно — галочка «ИИ-помощник» в роли (Компания → Роли)."
};
function a(r, o, e = {}, t) {
  const n = r.createElement(o);
  for (const [d, p] of Object.entries(e)) n.setAttribute(d, p);
  return t !== void 0 && (n.textContent = t), n;
}
function M(r) {
  const o = a(r, "div", { class: "pa-msg", role: "status", hidden: "" });
  return o.show = (e, t) => {
    o.dataset.kind = e, o.textContent = t, o.hidden = !1;
  }, o;
}
function U(r, o) {
  const e = r.ownerDocument, { api: t } = o;
  let n = !0;
  const d = a(e, "div", { class: "pa-root", "data-testid": "pa-root" });
  r.replaceChildren(d);
  const p = a(e, "form", { class: "pa-card", "data-testid": "pa-create", novalidate: "" }), w = a(e, "input", { class: "pa-input", name: "name", placeholder: "Название компании", "aria-label": "Название компании" }), y = a(e, "input", { type: "checkbox", name: "is_test" }), $ = a(e, "label", { class: "pa-check" });
  $.append(y, e.createTextNode("тестовая"));
  const k = a(e, "button", { type: "submit", class: "pa-btn" }, "Создать компанию"), b = M(e), D = a(e, "div", { class: "pa-row" });
  D.append(w, $, k), p.append(
    a(e, "h3", { class: "pa-title" }, "Новая компания"),
    a(e, "div", { class: "pa-muted" }, "При создании у компании появляются 9 ролей-шаблонов и включается «План/Факт». Людей заводит администратор компании."),
    D,
    b
  );
  const u = a(e, "div", { class: "pa-root", "data-testid": "pa-list" }), C = M(e);
  d.append(
    a(e, "div", { class: "pa-muted" }, "Компании платформы и их модули. Раздел видит только администратор платформы; каждое изменение пишется в журнал."),
    p,
    C,
    u
  );
  async function _() {
    const s = await t.companies();
    if (n) {
      if (!s.ok) {
        u.replaceChildren(), C.show("error", s.message);
        return;
      }
      u.replaceChildren(...s.value.map(O)), s.value.length || u.appendChild(a(e, "div", { class: "pa-muted" }, "Компаний пока нет."));
    }
  }
  function O(s) {
    const m = a(e, "section", { class: "pa-card", "data-company": s.id }), f = a(e, "div", { class: "pa-head" }), S = a(e, "div", { class: "pa-row" });
    S.appendChild(a(e, "span", { class: "pa-name" }, s.name)), s.is_test && S.appendChild(a(e, "span", { class: "pa-badge" }, "тестовая")), f.append(S, a(e, "span", { class: "pa-muted" }, "людей: " + s.people));
    const h = M(e), I = a(e, "div", { class: "pa-mods" });
    for (const i of s.modules) {
      const l = a(e, "div", { class: "pa-mod", "data-module": i.code });
      if (l.appendChild(a(e, "span", { class: "pa-mod-name" }, i.name)), i.managed) {
        const g = a(e, "label", { class: "pa-switch" }), c = a(e, "input", { type: "checkbox", "aria-label": `${i.name} у компании ${s.name}` });
        c.checked = i.enabled === !0;
        const L = a(e, "span", {}, c.checked ? "включён" : "выключен");
        c.addEventListener("change", () => {
          const v = c.checked;
          c.disabled = !0, t.setModule(s.id, i.code, v).then((N) => {
            if (c.disabled = !1, !N.ok) {
              c.checked = !v, h.show("error", N.message);
              return;
            }
            L.textContent = v ? "включён" : "выключен", h.show("ok", `«${i.name}» ${v ? "включён" : "выключен"}. Люди компании увидят изменение после обновления страницы.`), o.onChanged && o.onChanged();
          });
        }), g.append(c, L), l.appendChild(g);
      }
      B[i.code] && l.appendChild(a(e, "div", { class: "pa-mod-hint" }, B[i.code])), I.appendChild(l);
    }
    const z = a(e, "form", { class: "pa-row", "data-testid": "pa-admin", novalidate: "" }), A = a(e, "input", { class: "pa-input", type: "email", name: "email", inputmode: "email", placeholder: "почта существующей учётки", "aria-label": `Почта администратора компании ${s.name}` }), E = a(e, "button", { type: "submit", class: "pa-btn" }, "Назначить администратора");
    return z.append(A, E), z.addEventListener("submit", (i) => {
      i.preventDefault();
      const l = A.value.trim();
      if (!l) {
        h.show("error", "Введите почту");
        return;
      }
      E.disabled = !0, t.setCompanyAdmin(s.id, l).then((g) => {
        if (E.disabled = !1, !g.ok) {
          h.show("error", g.message);
          return;
        }
        A.value = "", _().then(() => C.show("ok", `${l} — администратор компании «${s.name}».`));
      });
    }), m.append(f, I, a(e, "div", { class: "pa-muted" }, "Администратор компании"), z, h), m;
  }
  return p.addEventListener("submit", (s) => {
    s.preventDefault();
    const m = w.value.trim();
    if (!m) {
      b.show("error", "Введите название компании");
      return;
    }
    k.disabled = !0, t.createCompany(m, y.checked).then((f) => {
      if (k.disabled = !1, !f.ok) {
        b.show("error", f.message);
        return;
      }
      w.value = "", y.checked = !1, b.show("ok", `Компания «${m}» создана.`), o.onChanged && o.onChanged(), _();
    });
  }), u.appendChild(a(e, "div", { class: "pa-muted" }, "Загрузка…")), _(), () => {
    n = !1, r.replaceChildren();
  };
}
const T = "platform-admin-style";
let x = null;
function q(r) {
  var t;
  Y();
  const o = r.ownerDocument;
  if (!o.getElementById(T)) {
    const n = o.createElement("style");
    n.id = T, n.textContent = R, o.head.appendChild(n);
  }
  const e = (t = window.RBI) == null ? void 0 : t.platform2;
  if (!e || typeof e.rpc != "function") {
    r.textContent = "Вход платформы не загружен.";
    return;
  }
  x = U(r, { api: H(e.rpc), onChanged: () => {
    e.refresh && e.refresh();
  } });
}
function Y() {
  x && x(), x = null;
}
function F() {
  return x !== null;
}
export {
  F as isMounted,
  q as mount,
  Y as unmount
};
//# sourceMappingURL=platform-admin.js.map
