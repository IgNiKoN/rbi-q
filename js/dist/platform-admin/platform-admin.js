function V(m) {
  return m.code === "42501" ? "Только для администратора платформы" : /failed to fetch|network|load failed/i.test(m.message) ? "Нет связи с сервером. Попробуйте позже" : /[а-яё]/i.test(m.message) ? m.message : "Не удалось выполнить. Попробуйте ещё раз";
}
function se(m) {
  const f = async (r, u, p) => {
    try {
      const { data: h, error: y } = await m(r, u);
      return y ? { ok: !1, message: V(y) } : { ok: !0, value: p(h) };
    } catch (h) {
      return { ok: !1, message: V({ message: h instanceof Error ? h.message : "" }) };
    }
  };
  return {
    companies: () => f("pf_platform_companies", {}, (r) => (Array.isArray(r) ? r : []).map((u) => ({
      id: String(u.id),
      name: String(u.name || ""),
      is_test: u.is_test === !0,
      created_at: String(u.created_at || ""),
      people: Number(u.people) || 0,
      modules: (Array.isArray(u.modules) ? u.modules : []).map((p) => ({
        code: String(p.code),
        name: String(p.name || p.code),
        managed: p.managed === !0,
        enabled: p.enabled === null || p.enabled === void 0 ? null : p.enabled === !0
      }))
    }))),
    createCompany: (r, u) => f("pf_platform_create_company", { p_name: r, p_is_test: u }, (p) => String(p)),
    setModule: (r, u, p) => f("pf_platform_set_module", { p_company: r, p_module: u, p_enabled: p }, () => {
    }),
    setCompanyAdmin: (r, u) => f("pf_platform_set_company_admin", { p_company: r, p_email: u }, () => {
    })
  };
}
var W = { exports: {} }, i = {};
/**
 * @license React
 * react.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var F;
function ae() {
  if (F) return i;
  F = 1;
  var m = Symbol.for("react.transitional.element"), f = Symbol.for("react.portal"), r = Symbol.for("react.fragment"), u = Symbol.for("react.strict_mode"), p = Symbol.for("react.profiler"), h = Symbol.for("react.consumer"), y = Symbol.for("react.context"), P = Symbol.for("react.forward_ref"), M = Symbol.for("react.suspense"), U = Symbol.for("react.memo"), j = Symbol.for("react.lazy"), O = Symbol.for("react.activity"), q = Symbol.for("react.view_transition"), k = Symbol.iterator;
  function N(e) {
    return e === null || typeof e != "object" ? null : (e = k && e[k] || e["@@iterator"], typeof e == "function" ? e : null);
  }
  var I = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, B = Object.assign, x = {};
  function b(e, t, n) {
    this.props = e, this.context = t, this.refs = x, this.updater = n || I;
  }
  b.prototype.isReactComponent = {}, b.prototype.setState = function(e, t) {
    if (typeof e != "object" && typeof e != "function" && e != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, e, t, "setState");
  }, b.prototype.forceUpdate = function(e) {
    this.updater.enqueueForceUpdate(this, e, "forceUpdate");
  };
  function R() {
  }
  R.prototype = b.prototype;
  function A(e, t, n) {
    this.props = e, this.context = t, this.refs = x, this.updater = n || I;
  }
  var C = A.prototype = new R();
  C.constructor = A, B(C, b.prototype), C.isPureReactComponent = !0;
  var L = Array.isArray;
  function z() {
  }
  var d = { H: null, A: null, T: null, S: null }, $ = Object.prototype.hasOwnProperty;
  function g(e, t, n) {
    var o = n.ref;
    return {
      $$typeof: m,
      type: e,
      key: t,
      ref: o !== void 0 ? o : null,
      props: n
    };
  }
  function _(e, t) {
    return g(e.type, t, e.props);
  }
  function T(e) {
    return typeof e == "object" && e !== null && e.$$typeof === m;
  }
  function w(e) {
    var t = { "=": "=0", ":": "=2" };
    return "$" + e.replace(/[=:]/g, function(n) {
      return t[n];
    });
  }
  var Y = /\/+/g;
  function S(e, t) {
    return typeof e == "object" && e !== null && e.key != null ? w("" + e.key) : t.toString(36);
  }
  function G(e) {
    switch (e.status) {
      case "fulfilled":
        return e.value;
      case "rejected":
        throw e.reason;
      default:
        switch (typeof e.status == "string" ? e.then(z, z) : (e.status = "pending", e.then(
          function(t) {
            e.status === "pending" && (e.status = "fulfilled", e.value = t);
          },
          function(t) {
            e.status === "pending" && (e.status = "rejected", e.reason = t);
          }
        )), e.status) {
          case "fulfilled":
            return e.value;
          case "rejected":
            throw e.reason;
        }
    }
    throw e;
  }
  function H(e, t, n, o, s) {
    var c = typeof e;
    (c === "undefined" || c === "boolean") && (e = null);
    var l = !1;
    if (e === null) l = !0;
    else
      switch (c) {
        case "bigint":
        case "string":
        case "number":
          l = !0;
          break;
        case "object":
          switch (e.$$typeof) {
            case m:
            case f:
              l = !0;
              break;
            case j:
              return l = e._init, H(
                l(e._payload),
                t,
                n,
                o,
                s
              );
          }
      }
    if (l)
      return s = s(e), l = o === "" ? "." + S(e, 0) : o, L(s) ? (n = "", l != null && (n = l.replace(Y, "$&/") + "/"), H(s, t, n, "", function(ie) {
        return ie;
      })) : s != null && (T(s) && (s = _(
        s,
        n + (s.key == null || e && e.key === s.key ? "" : ("" + s.key).replace(
          Y,
          "$&/"
        ) + "/") + l
      )), t.push(s)), 1;
    l = 0;
    var E = o === "" ? "." : o + ":";
    if (L(e))
      for (var v = 0; v < e.length; v++)
        o = e[v], c = E + S(o, v), l += H(
          o,
          t,
          n,
          c,
          s
        );
    else if (v = N(e), typeof v == "function")
      for (e = v.call(e), v = 0; !(o = e.next()).done; )
        o = o.value, c = E + S(o, v++), l += H(
          o,
          t,
          n,
          c,
          s
        );
    else if (c === "object") {
      if (typeof e.then == "function")
        return H(
          G(e),
          t,
          n,
          o,
          s
        );
      throw t = String(e), Error(
        "Objects are not valid as a React child (found: " + (t === "[object Object]" ? "object with keys {" + Object.keys(e).join(", ") + "}" : t) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return l;
  }
  function K(e, t, n) {
    if (e == null) return e;
    var o = [], s = 0;
    return H(e, o, "", "", function(c) {
      return t.call(n, c, s++);
    }), o;
  }
  function ne(e) {
    if (e._status === -1) {
      var t = e._result, n = t();
      n.then(
        function(o) {
          (e._status === 0 || e._status === -1) && (e._status = 1, e._result = o, n.status === void 0 && (n.status = "fulfilled", n.value = o));
        },
        function(o) {
          (e._status === 0 || e._status === -1) && (e._status = 2, e._result = o, n.status === void 0 && (n.status = "rejected", n.reason = o));
        }
      ), e._status === -1 && (e._status = 0, e._result = n);
    }
    if (e._status === 1) return e._result.default;
    throw e._result;
  }
  var X = typeof reportError == "function" ? reportError : function(e) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var t = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof e == "object" && e !== null && typeof e.message == "string" ? String(e.message) : String(e),
        error: e
      });
      if (!window.dispatchEvent(t)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", e);
      return;
    }
    console.error(e);
  };
  function Z(e) {
    var t = d.T, n = {};
    n.types = t !== null ? t.types : null, d.T = n;
    try {
      var o = e(), s = d.S;
      s !== null && s(n, o), typeof o == "object" && o !== null && typeof o.then == "function" && o.then(z, X);
    } catch (c) {
      X(c);
    } finally {
      t !== null && n.types !== null && (t.types = n.types), d.T = t;
    }
  }
  function J(e) {
    var t = d.T;
    if (t !== null) {
      var n = t.types;
      n === null ? t.types = [e] : n.indexOf(e) === -1 && n.push(e);
    } else Z(J.bind(null, e));
  }
  var oe = {
    map: K,
    forEach: function(e, t, n) {
      K(
        e,
        function() {
          t.apply(this, arguments);
        },
        n
      );
    },
    count: function(e) {
      var t = 0;
      return K(e, function() {
        t++;
      }), t;
    },
    toArray: function(e) {
      return K(e, function(t) {
        return t;
      }) || [];
    },
    only: function(e) {
      if (!T(e))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return e;
    }
  };
  return i.Activity = O, i.Children = oe, i.Component = b, i.Fragment = r, i.Profiler = p, i.PureComponent = A, i.StrictMode = u, i.Suspense = M, i.ViewTransition = q, i.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = d, i.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(e) {
      return d.H.useMemoCache(e);
    }
  }, i.addTransitionType = J, i.cache = function(e) {
    return function() {
      return e.apply(null, arguments);
    };
  }, i.cacheSignal = function() {
    return null;
  }, i.cloneElement = function(e, t, n) {
    if (e == null)
      throw Error(
        "The argument must be a React element, but you passed " + e + "."
      );
    var o = B({}, e.props), s = e.key;
    if (t != null)
      for (c in t.key !== void 0 && (s = "" + t.key), t)
        !$.call(t, c) || c === "key" || c === "__self" || c === "__source" || c === "ref" && t.ref === void 0 || (o[c] = t[c]);
    var c = arguments.length - 2;
    if (c === 1) o.children = n;
    else if (1 < c) {
      for (var l = Array(c), E = 0; E < c; E++)
        l[E] = arguments[E + 2];
      o.children = l;
    }
    return g(e.type, s, o);
  }, i.createContext = function(e) {
    return e = {
      $$typeof: y,
      _currentValue: e,
      _currentValue2: e,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, e.Provider = e, e.Consumer = {
      $$typeof: h,
      _context: e
    }, e;
  }, i.createElement = function(e, t, n) {
    var o, s = {}, c = null;
    if (t != null)
      for (o in t.key !== void 0 && (c = "" + t.key), t)
        $.call(t, o) && o !== "key" && o !== "__self" && o !== "__source" && (s[o] = t[o]);
    var l = arguments.length - 2;
    if (l === 1) s.children = n;
    else if (1 < l) {
      for (var E = Array(l), v = 0; v < l; v++)
        E[v] = arguments[v + 2];
      s.children = E;
    }
    if (e && e.defaultProps)
      for (o in l = e.defaultProps, l)
        s[o] === void 0 && (s[o] = l[o]);
    return g(e, c, s);
  }, i.createRef = function() {
    return { current: null };
  }, i.forwardRef = function(e) {
    return { $$typeof: P, render: e };
  }, i.isValidElement = T, i.lazy = function(e) {
    return {
      $$typeof: j,
      _payload: { _status: -1, _result: e },
      _init: ne
    };
  }, i.memo = function(e, t) {
    return {
      $$typeof: U,
      type: e,
      compare: t === void 0 ? null : t
    };
  }, i.startTransition = Z, i.unstable_useCacheRefresh = function() {
    return d.H.useCacheRefresh();
  }, i.use = function(e) {
    return d.H.use(e);
  }, i.useActionState = function(e, t, n) {
    return d.H.useActionState(e, t, n);
  }, i.useCallback = function(e, t) {
    return d.H.useCallback(e, t);
  }, i.useContext = function(e) {
    return d.H.useContext(e);
  }, i.useDebugValue = function() {
  }, i.useDeferredValue = function(e, t) {
    return d.H.useDeferredValue(e, t);
  }, i.useEffect = function(e, t) {
    return d.H.useEffect(e, t);
  }, i.useEffectEvent = function(e) {
    return d.H.useEffectEvent(e);
  }, i.useId = function() {
    return d.H.useId();
  }, i.useImperativeHandle = function(e, t, n) {
    return d.H.useImperativeHandle(e, t, n);
  }, i.useInsertionEffect = function(e, t) {
    return d.H.useInsertionEffect(e, t);
  }, i.useLayoutEffect = function(e, t) {
    return d.H.useLayoutEffect(e, t);
  }, i.useMemo = function(e, t) {
    return d.H.useMemo(e, t);
  }, i.useOptimistic = function(e, t) {
    return d.H.useOptimistic(e, t);
  }, i.useReducer = function(e, t, n) {
    return d.H.useReducer(e, t, n);
  }, i.useRef = function(e) {
    return d.H.useRef(e);
  }, i.useState = function(e) {
    return d.H.useState(e);
  }, i.useSyncExternalStore = function(e, t, n) {
    return d.H.useSyncExternalStore(
      e,
      t,
      n
    );
  }, i.useTransition = function() {
    return d.H.useTransition();
  }, i.version = "19.3.1", i;
}
var ee;
function ue() {
  return ee || (ee = 1, W.exports = ae()), W.exports;
}
ue();
const de = `
.sui-menu{position:relative;display:inline-flex;flex:none}
.sui-menu-btn{min-width:40px;min-height:40px;padding:0 10px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main);font-size:18px;font-weight:900;line-height:1;cursor:pointer}
.sui-menu-btn:hover,.sui-menu-btn[aria-expanded=true]{background:var(--hover-bg)}
.sui-menu-list{position:absolute;right:0;top:calc(100% + 4px);z-index:50;min-width:200px;max-width:min(280px,calc(100vw - 32px));display:flex;flex-direction:column;padding:4px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;box-shadow:var(--shadow-card,0 8px 24px rgba(0,0,0,.18))}
.sui-menu-item{min-height:44px;padding:8px 12px;border:0;border-radius:8px;background:transparent;color:var(--text-main);font-size:14px;text-align:left;cursor:pointer}
.sui-menu-item:hover{background:var(--hover-bg)}
.sui-menu-item:disabled{color:var(--text-muted);cursor:default}
.sui-menu-item--danger{color:var(--color-red)}
.sui-dialog-back{position:fixed;inset:0;z-index:8000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.45)}
.sui-dialog{width:100%;max-width:420px;display:flex;flex-direction:column;gap:12px;padding:20px;background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow-card,0 12px 32px rgba(0,0,0,.3))}
.sui-dialog-title{font-size:16px;font-weight:800}
.sui-dialog-text{font-size:14px;color:var(--text-muted);overflow-wrap:anywhere}
.sui-dialog-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.sui-dialog-actions .pf-btn{min-height:44px}
.sui-danger{background:var(--color-red);border-color:var(--color-red)}
.sui-cards{display:flex;flex-direction:column;gap:10px}
.sui-stack{display:flex;flex-direction:column;gap:12px;color:var(--text-main)}
.sui-section-title{margin:0;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.02em}
.sui-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.sui-input{flex:1 1 200px;min-width:0;max-width:100%;font-size:16px;min-height:44px;padding:8px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main);box-sizing:border-box}
.sui-check{display:inline-flex;align-items:center;gap:8px;font-size:13px;min-height:44px;cursor:pointer}
.sui-check input{width:20px;height:20px;accent-color:var(--primary)}
.sui-badge{display:inline-block;font-size:10px;font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--card-border);color:var(--text-muted)}
.sui-badge--on{color:var(--color-green);border-color:var(--color-green)}
.sui-list{display:flex;flex-direction:column}
.sui-list-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;min-height:44px;padding:8px 0;border-top:1px solid var(--card-border)}
.sui-list-row:first-child{border-top:0}
.sui-list-row .sui-hint{flex:1 1 100%;margin-top:-4px}
.sui-msg{font-size:13px}
.sui-msg[data-kind="error"]{color:var(--color-red,#dc2626)}
.sui-msg[data-kind="ok"]{color:var(--color-green,#16a34a)}
.sui-stack [hidden]{display:none!important}
.sui-hint{font-size:12px;color:var(--text-muted)}
.sui-notice{font-size:12px;color:var(--color-green)}
.sui-title{font-weight:700;color:var(--text-main);overflow-wrap:anywhere}
.sui-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow-card);padding:12px 14px;min-width:0}
.sui-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.sui-card-main{min-width:0;flex:1 1 auto}
.sui-sub{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0 0;margin-top:10px;border-top:1px solid var(--card-border)}
.sui-sub-main{min-width:0;flex:1 1 auto;font-size:13px}
.sui-sub-meta{font-size:12px;color:var(--text-muted);overflow-wrap:anywhere}
.sui-panel{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow-card);padding:12px 14px;min-width:0}
.sui-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end}
.sui-filters .pf-field{min-width:0}
.sui-filters .co-input,.sui-filters input,.sui-filters select{width:100%;min-width:0;box-sizing:border-box}
.sui-more{align-self:center}
.sui-table{width:100%;border-collapse:collapse;font-size:13px}
.sui-table th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);padding:10px 14px;border-bottom:1px solid var(--card-border);white-space:nowrap}
.sui-table td{padding:8px 14px;border-bottom:1px solid var(--card-border);vertical-align:top;overflow-wrap:anywhere}
.sui-table tbody tr:last-child td{border-bottom:0}
@media (max-width:760px){
.sui-table thead{display:none}
.sui-table,.sui-table tbody,.sui-table tr,.sui-table td{display:block;width:100%}
.sui-table tr{padding:10px 12px;border-bottom:1px solid var(--card-border)}
.sui-table tbody tr:last-child{border-bottom:0}
.sui-table td{padding:2px 0;border:0}
.sui-table td[data-label]::before{content:attr(data-label) ': ';font-size:11px;color:var(--text-muted)}
}
`, ce = `
.pf-login{max-width:380px;margin:24px auto;padding:20px;display:flex;flex-direction:column;gap:12px}
.pf-field{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--text-muted)}
.pf-field input{font-size:14px;padding:9px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main)}
.pf-btn{font-size:13px;font-weight:700;padding:10px 14px;border-radius:10px;border:1px solid var(--primary);background:var(--primary);color:var(--card-bg);cursor:pointer}
.pf-btn:disabled{opacity:.6;cursor:default}
.pf-btn--ghost{background:transparent;color:var(--text-main);border-color:var(--card-border)}
.pf-error{font-size:12px;color:var(--color-red)}
.pf-bar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 24px;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--card-border)}
.pf-bar b{color:var(--text-main)}
.pf-muted{color:var(--text-muted);font-size:13px}
`, pe = de + ce + `
.sui-stack .pf-btn{min-height:44px}
`, te = {
  knowledge: "Работает вместе с «Качеством»: документы и чек-листы компании, видят все с доступом к Качеству.",
  ai: "Работает вместе с «Качеством». Кому именно — галочка «ИИ-помощник» в роли (Компания → Роли)."
};
function a(m, f, r = {}, u) {
  const p = m.createElement(f);
  for (const [h, y] of Object.entries(r)) p.setAttribute(h, y);
  return u !== void 0 && (p.textContent = u), p;
}
function Q(m) {
  const f = a(m, "div", { class: "sui-msg", role: "status", hidden: "" });
  return f.show = (r, u) => {
    f.dataset.kind = r, f.textContent = u, f.hidden = !1;
  }, f;
}
function le(m, f) {
  const r = m.ownerDocument, { api: u } = f;
  let p = !0;
  const h = a(r, "div", { class: "sui-stack", "data-testid": "pa-root" });
  m.replaceChildren(h);
  const y = a(r, "form", { class: "sui-card sui-stack", "data-testid": "pa-create", novalidate: "" }), P = a(r, "input", { class: "sui-input", name: "name", placeholder: "Название компании", "aria-label": "Название компании" }), M = a(r, "input", { type: "checkbox", name: "is_test" }), U = a(r, "label", { class: "sui-check" });
  U.append(M, r.createTextNode("тестовая"));
  const j = a(r, "button", { type: "submit", class: "pf-btn" }, "Создать компанию"), O = Q(r), q = a(r, "div", { class: "sui-row" });
  q.append(P, U, j), y.append(
    a(r, "h3", { class: "sui-section-title" }, "Новая компания"),
    a(r, "div", { class: "sui-hint" }, "При создании у компании появляются 9 ролей-шаблонов и включается «План/Факт». Людей заводит администратор компании."),
    q,
    O
  );
  const k = a(r, "div", { class: "sui-stack", "data-testid": "pa-list" }), N = Q(r);
  h.append(
    a(r, "div", { class: "sui-hint" }, "Компании платформы и их модули. Раздел видит только администратор платформы; каждое изменение пишется в журнал."),
    y,
    N,
    k
  );
  async function I() {
    const x = await u.companies();
    if (p) {
      if (!x.ok) {
        k.replaceChildren(), N.show("error", x.message);
        return;
      }
      k.replaceChildren(...x.value.map(B)), x.value.length || k.appendChild(a(r, "div", { class: "sui-hint" }, "Компаний пока нет."));
    }
  }
  function B(x) {
    const b = a(r, "section", { class: "sui-card sui-stack", "data-company": x.id }), R = a(r, "div", { class: "sui-card-head" }), A = a(r, "div", { class: "sui-row" });
    A.appendChild(a(r, "span", { class: "sui-title" }, x.name)), x.is_test && A.appendChild(a(r, "span", { class: "sui-badge" }, "тестовая")), R.append(A, a(r, "span", { class: "sui-hint" }, "людей: " + x.people));
    const C = Q(r), L = a(r, "div", { class: "sui-list" });
    for (const g of x.modules) {
      const _ = a(r, "div", { class: "sui-list-row", "data-module": g.code });
      if (_.appendChild(a(r, "span", { class: "sui-title" }, g.name)), g.managed) {
        const T = a(r, "label", { class: "sui-check" }), w = a(r, "input", { type: "checkbox", "aria-label": `${g.name} у компании ${x.name}` });
        w.checked = g.enabled === !0;
        const Y = a(r, "span", {}, w.checked ? "включён" : "выключен");
        w.addEventListener("change", () => {
          const S = w.checked;
          w.disabled = !0, u.setModule(x.id, g.code, S).then((G) => {
            if (w.disabled = !1, !G.ok) {
              w.checked = !S, C.show("error", G.message);
              return;
            }
            Y.textContent = S ? "включён" : "выключен", C.show("ok", `«${g.name}» ${S ? "включён" : "выключен"}. Люди компании увидят изменение после обновления страницы.`), f.onChanged && f.onChanged();
          });
        }), T.append(w, Y), _.appendChild(T);
      }
      te[g.code] && _.appendChild(a(r, "div", { class: "sui-hint", "data-testid": "pa-mod-hint" }, te[g.code])), L.appendChild(_);
    }
    const z = a(r, "form", { class: "sui-row", "data-testid": "pa-admin", novalidate: "" }), d = a(r, "input", { class: "sui-input", type: "email", name: "email", inputmode: "email", placeholder: "почта существующей учётки", "aria-label": `Почта администратора компании ${x.name}` }), $ = a(r, "button", { type: "submit", class: "pf-btn" }, "Назначить администратора");
    return z.append(d, $), z.addEventListener("submit", (g) => {
      g.preventDefault();
      const _ = d.value.trim();
      if (!_) {
        C.show("error", "Введите почту");
        return;
      }
      $.disabled = !0, u.setCompanyAdmin(x.id, _).then((T) => {
        if ($.disabled = !1, !T.ok) {
          C.show("error", T.message);
          return;
        }
        d.value = "", I().then(() => N.show("ok", `${_} — администратор компании «${x.name}».`));
      });
    }), b.append(R, L, a(r, "div", { class: "sui-hint" }, "Администратор компании"), z, C), b;
  }
  return y.addEventListener("submit", (x) => {
    x.preventDefault();
    const b = P.value.trim();
    if (!b) {
      O.show("error", "Введите название компании");
      return;
    }
    j.disabled = !0, u.createCompany(b, M.checked).then((R) => {
      if (j.disabled = !1, !R.ok) {
        O.show("error", R.message);
        return;
      }
      P.value = "", M.checked = !1, O.show("ok", `Компания «${b}» создана.`), f.onChanged && f.onChanged(), I();
    });
  }), k.appendChild(a(r, "div", { class: "sui-hint" }, "Загрузка…")), I(), () => {
    p = !1, m.replaceChildren();
  };
}
const re = "platform-admin-style";
let D = null;
function me(m) {
  var u;
  fe();
  const f = m.ownerDocument;
  if (!f.getElementById(re)) {
    const p = f.createElement("style");
    p.id = re, p.textContent = pe, f.head.appendChild(p);
  }
  const r = (u = window.RBI) == null ? void 0 : u.platform2;
  if (!r || typeof r.rpc != "function") {
    m.textContent = "Вход платформы не загружен.";
    return;
  }
  D = le(m, { api: se(r.rpc), onChanged: () => {
    r.refresh && r.refresh();
  } });
}
function fe() {
  D && D(), D = null;
}
function xe() {
  return D !== null;
}
export {
  xe as isMounted,
  me as mount,
  fe as unmount
};
//# sourceMappingURL=platform-admin.js.map
