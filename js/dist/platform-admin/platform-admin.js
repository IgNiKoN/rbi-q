function ee(s) {
  return s.code === "42501" ? "Только для администратора платформы" : /failed to fetch|network|load failed/i.test(s.message) ? "Нет связи с сервером. Попробуйте позже" : /[а-яё]/i.test(s.message) ? s.message : "Не удалось выполнить. Попробуйте ещё раз";
}
function ae(s) {
  const a = async (r, l, m) => {
    try {
      const { data: w, error: E } = await s(r, l);
      return E ? { ok: !1, message: ee(E) } : { ok: !0, value: m(w) };
    } catch (w) {
      return { ok: !1, message: ee({ message: w instanceof Error ? w.message : "" }) };
    }
  };
  return {
    companies: () => a("pf_platform_companies", {}, (r) => (Array.isArray(r) ? r : []).map((l) => ({
      id: String(l.id),
      name: String(l.name || ""),
      is_test: l.is_test === !0,
      created_at: String(l.created_at || ""),
      people: Number(l.people) || 0,
      modules: (Array.isArray(l.modules) ? l.modules : []).map((m) => ({
        code: String(m.code),
        name: String(m.name || m.code),
        managed: m.managed === !0,
        enabled: m.enabled === null || m.enabled === void 0 ? null : m.enabled === !0
      }))
    }))),
    createCompany: (r, l) => a("pf_platform_create_company", { p_name: r, p_is_test: l }, (m) => String(m)),
    setModule: (r, l, m) => a("pf_platform_set_module", { p_company: r, p_module: l, p_enabled: m }, () => {
    }),
    setCompanyAdmin: (r, l) => a("pf_platform_set_company_admin", { p_company: r, p_email: l }, () => {
    })
  };
}
var X = { exports: {} }, i = {};
/**
 * @license React
 * react.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var te;
function ue() {
  if (te) return i;
  te = 1;
  var s = Symbol.for("react.transitional.element"), a = Symbol.for("react.portal"), r = Symbol.for("react.fragment"), l = Symbol.for("react.strict_mode"), m = Symbol.for("react.profiler"), w = Symbol.for("react.consumer"), E = Symbol.for("react.context"), N = Symbol.for("react.forward_ref"), M = Symbol.for("react.suspense"), G = Symbol.for("react.memo"), j = Symbol.for("react.lazy"), H = Symbol.for("react.activity"), K = Symbol.for("react.view_transition"), k = Symbol.iterator;
  function L(e) {
    return e === null || typeof e != "object" ? null : (e = k && e[k] || e["@@iterator"], typeof e == "function" ? e : null);
  }
  var Y = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, S = Object.assign, A = {};
  function _(e, t, n) {
    this.props = e, this.context = t, this.refs = A, this.updater = n || Y;
  }
  _.prototype.isReactComponent = {}, _.prototype.setState = function(e, t) {
    if (typeof e != "object" && typeof e != "function" && e != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, e, t, "setState");
  }, _.prototype.forceUpdate = function(e) {
    this.updater.enqueueForceUpdate(this, e, "forceUpdate");
  };
  function D() {
  }
  D.prototype = _.prototype;
  function I(e, t, n) {
    this.props = e, this.context = t, this.refs = A, this.updater = n || Y;
  }
  var U = I.prototype = new D();
  U.constructor = I, S(U, _.prototype), U.isPureReactComponent = !0;
  var p = Array.isArray;
  function v() {
  }
  var u = { H: null, A: null, T: null, S: null }, P = Object.prototype.hasOwnProperty;
  function R(e, t, n) {
    var o = n.ref;
    return {
      $$typeof: s,
      type: e,
      key: t,
      ref: o !== void 0 ? o : null,
      props: n
    };
  }
  function V(e, t) {
    return R(e.type, t, e.props);
  }
  function z(e) {
    return typeof e == "object" && e !== null && e.$$typeof === s;
  }
  function q(e) {
    var t = { "=": "=0", ":": "=2" };
    return "$" + e.replace(/[=:]/g, function(n) {
      return t[n];
    });
  }
  var $ = /\/+/g;
  function g(e, t) {
    return typeof e == "object" && e !== null && e.key != null ? q("" + e.key) : t.toString(36);
  }
  function C(e) {
    switch (e.status) {
      case "fulfilled":
        return e.value;
      case "rejected":
        throw e.reason;
      default:
        switch (typeof e.status == "string" ? e.then(v, v) : (e.status = "pending", e.then(
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
  function y(e, t, n, o, c) {
    var f = typeof e;
    (f === "undefined" || f === "boolean") && (e = null);
    var x = !1;
    if (e === null) x = !0;
    else
      switch (f) {
        case "bigint":
        case "string":
        case "number":
          x = !0;
          break;
        case "object":
          switch (e.$$typeof) {
            case s:
            case a:
              x = !0;
              break;
            case j:
              return x = e._init, y(
                x(e._payload),
                t,
                n,
                o,
                c
              );
          }
      }
    if (x)
      return c = c(e), x = o === "" ? "." + g(e, 0) : o, p(c) ? (n = "", x != null && (n = x.replace($, "$&/") + "/"), y(c, t, n, "", function(se) {
        return se;
      })) : c != null && (z(c) && (c = V(
        c,
        n + (c.key == null || e && e.key === c.key ? "" : ("" + c.key).replace(
          $,
          "$&/"
        ) + "/") + x
      )), t.push(c)), 1;
    x = 0;
    var T = o === "" ? "." : o + ":";
    if (p(e))
      for (var h = 0; h < e.length; h++)
        o = e[h], f = T + g(o, h), x += y(
          o,
          t,
          n,
          f,
          c
        );
    else if (h = L(e), typeof h == "function")
      for (e = h.call(e), h = 0; !(o = e.next()).done; )
        o = o.value, f = T + g(o, h++), x += y(
          o,
          t,
          n,
          f,
          c
        );
    else if (f === "object") {
      if (typeof e.then == "function")
        return y(
          C(e),
          t,
          n,
          o,
          c
        );
      throw t = String(e), Error(
        "Objects are not valid as a React child (found: " + (t === "[object Object]" ? "object with keys {" + Object.keys(e).join(", ") + "}" : t) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return x;
  }
  function b(e, t, n) {
    if (e == null) return e;
    var o = [], c = 0;
    return y(e, o, "", "", function(f) {
      return t.call(n, f, c++);
    }), o;
  }
  function Q(e) {
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
  var O = typeof reportError == "function" ? reportError : function(e) {
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
  function B(e) {
    var t = u.T, n = {};
    n.types = t !== null ? t.types : null, u.T = n;
    try {
      var o = e(), c = u.S;
      c !== null && c(n, o), typeof o == "object" && o !== null && typeof o.then == "function" && o.then(v, O);
    } catch (f) {
      O(f);
    } finally {
      t !== null && n.types !== null && (t.types = n.types), u.T = t;
    }
  }
  function F(e) {
    var t = u.T;
    if (t !== null) {
      var n = t.types;
      n === null ? t.types = [e] : n.indexOf(e) === -1 && n.push(e);
    } else B(F.bind(null, e));
  }
  var ie = {
    map: b,
    forEach: function(e, t, n) {
      b(
        e,
        function() {
          t.apply(this, arguments);
        },
        n
      );
    },
    count: function(e) {
      var t = 0;
      return b(e, function() {
        t++;
      }), t;
    },
    toArray: function(e) {
      return b(e, function(t) {
        return t;
      }) || [];
    },
    only: function(e) {
      if (!z(e))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return e;
    }
  };
  return i.Activity = H, i.Children = ie, i.Component = _, i.Fragment = r, i.Profiler = m, i.PureComponent = I, i.StrictMode = l, i.Suspense = M, i.ViewTransition = K, i.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = u, i.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(e) {
      return u.H.useMemoCache(e);
    }
  }, i.addTransitionType = F, i.cache = function(e) {
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
    var o = S({}, e.props), c = e.key;
    if (t != null)
      for (f in t.key !== void 0 && (c = "" + t.key), t)
        !P.call(t, f) || f === "key" || f === "__self" || f === "__source" || f === "ref" && t.ref === void 0 || (o[f] = t[f]);
    var f = arguments.length - 2;
    if (f === 1) o.children = n;
    else if (1 < f) {
      for (var x = Array(f), T = 0; T < f; T++)
        x[T] = arguments[T + 2];
      o.children = x;
    }
    return R(e.type, c, o);
  }, i.createContext = function(e) {
    return e = {
      $$typeof: E,
      _currentValue: e,
      _currentValue2: e,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, e.Provider = e, e.Consumer = {
      $$typeof: w,
      _context: e
    }, e;
  }, i.createElement = function(e, t, n) {
    var o, c = {}, f = null;
    if (t != null)
      for (o in t.key !== void 0 && (f = "" + t.key), t)
        P.call(t, o) && o !== "key" && o !== "__self" && o !== "__source" && (c[o] = t[o]);
    var x = arguments.length - 2;
    if (x === 1) c.children = n;
    else if (1 < x) {
      for (var T = Array(x), h = 0; h < x; h++)
        T[h] = arguments[h + 2];
      c.children = T;
    }
    if (e && e.defaultProps)
      for (o in x = e.defaultProps, x)
        c[o] === void 0 && (c[o] = x[o]);
    return R(e, f, c);
  }, i.createRef = function() {
    return { current: null };
  }, i.forwardRef = function(e) {
    return { $$typeof: N, render: e };
  }, i.isValidElement = z, i.lazy = function(e) {
    return {
      $$typeof: j,
      _payload: { _status: -1, _result: e },
      _init: Q
    };
  }, i.memo = function(e, t) {
    return {
      $$typeof: G,
      type: e,
      compare: t === void 0 ? null : t
    };
  }, i.startTransition = B, i.unstable_useCacheRefresh = function() {
    return u.H.useCacheRefresh();
  }, i.use = function(e) {
    return u.H.use(e);
  }, i.useActionState = function(e, t, n) {
    return u.H.useActionState(e, t, n);
  }, i.useCallback = function(e, t) {
    return u.H.useCallback(e, t);
  }, i.useContext = function(e) {
    return u.H.useContext(e);
  }, i.useDebugValue = function() {
  }, i.useDeferredValue = function(e, t) {
    return u.H.useDeferredValue(e, t);
  }, i.useEffect = function(e, t) {
    return u.H.useEffect(e, t);
  }, i.useEffectEvent = function(e) {
    return u.H.useEffectEvent(e);
  }, i.useId = function() {
    return u.H.useId();
  }, i.useImperativeHandle = function(e, t, n) {
    return u.H.useImperativeHandle(e, t, n);
  }, i.useInsertionEffect = function(e, t) {
    return u.H.useInsertionEffect(e, t);
  }, i.useLayoutEffect = function(e, t) {
    return u.H.useLayoutEffect(e, t);
  }, i.useMemo = function(e, t) {
    return u.H.useMemo(e, t);
  }, i.useOptimistic = function(e, t) {
    return u.H.useOptimistic(e, t);
  }, i.useReducer = function(e, t, n) {
    return u.H.useReducer(e, t, n);
  }, i.useRef = function(e) {
    return u.H.useRef(e);
  }, i.useState = function(e) {
    return u.H.useState(e);
  }, i.useSyncExternalStore = function(e, t, n) {
    return u.H.useSyncExternalStore(
      e,
      t,
      n
    );
  }, i.useTransition = function() {
    return u.H.useTransition();
  }, i.version = "19.3.1", i;
}
var re;
function de() {
  return re || (re = 1, X.exports = ue()), X.exports;
}
de();
const ce = `
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
`, le = `
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
`, J = "platform2_show_test_companies", pe = "rbi:platform-show-test";
function fe(s) {
  try {
    return !!s && s.getItem(J) === "1";
  } catch {
    return !1;
  }
}
function me(s, a) {
  try {
    if (!s) return;
    a ? s.setItem(J, "1") : s.removeItem(J);
  } catch {
  }
}
function xe(s, a) {
  return !!s.is_test && a.isPlatformAdmin && !a.showTest && !(s.roles && s.roles.length) && s.id !== a.keepId;
}
function ge(s, a) {
  return s.filter((r) => !xe(r, a));
}
const he = ce + le + `
.sui-stack .pf-btn{min-height:44px}
`, ne = {
  knowledge: "Работает вместе с «Качеством»: документы и чек-листы компании, видят все с доступом к Качеству.",
  ai: "Работает вместе с «Качеством». Кому именно — галочка «ИИ-помощник» в роли (Компания → Роли)."
};
function d(s, a, r = {}, l) {
  const m = s.createElement(a);
  for (const [w, E] of Object.entries(r)) m.setAttribute(w, E);
  return l !== void 0 && (m.textContent = l), m;
}
function Z(s) {
  const a = d(s, "div", { class: "sui-msg", role: "status", hidden: "" });
  return a.show = (r, l) => {
    a.dataset.kind = r, a.textContent = l, a.hidden = !1;
  }, a;
}
function ve(s, a) {
  const r = s.ownerDocument, { api: l } = a;
  let m = !0;
  const w = d(r, "div", { class: "sui-stack", "data-testid": "pa-root" });
  s.replaceChildren(w);
  const E = d(r, "form", { class: "sui-card sui-stack", "data-testid": "pa-create", novalidate: "" }), N = d(r, "input", { class: "sui-input", name: "name", placeholder: "Название компании", "aria-label": "Название компании" }), M = d(r, "input", { type: "checkbox", name: "is_test" }), G = d(r, "label", { class: "sui-check" });
  G.append(M, r.createTextNode("тестовая"));
  const j = d(r, "button", { type: "submit", class: "pf-btn" }, "Создать компанию"), H = Z(r), K = d(r, "div", { class: "sui-row" });
  K.append(N, G, j), E.append(
    d(r, "h3", { class: "sui-section-title" }, "Новая компания"),
    d(r, "div", { class: "sui-hint" }, "При создании у компании появляются 9 ролей-шаблонов и включается «План/Факт». Людей заводит администратор компании."),
    K,
    H
  );
  const k = d(r, "div", { class: "sui-stack", "data-testid": "pa-list" }), L = Z(r), Y = a.storage !== void 0 ? a.storage : (() => {
    var p;
    try {
      return ((p = r.defaultView) == null ? void 0 : p.localStorage) ?? null;
    } catch {
      return null;
    }
  })(), S = d(r, "input", { type: "checkbox", "data-testid": "pa-show-test" });
  S.checked = fe(Y);
  const A = d(r, "label", { class: "sui-check", hidden: "" });
  A.append(S, r.createTextNode("Показать тестовые")), w.append(
    d(r, "div", { class: "sui-hint" }, "Компании платформы и их модули. Раздел видит только администратор платформы; каждое изменение пишется в журнал."),
    E,
    A,
    L,
    k
  );
  let _ = [];
  function D() {
    const p = _.filter((u) => u.is_test).length;
    A.hidden = p === 0, A.lastChild.textContent = `Показать тестовые (${p})`;
    const v = ge(_, { isPlatformAdmin: !0, showTest: S.checked });
    k.replaceChildren(...v.map(U)), _.length ? v.length || k.appendChild(d(r, "div", { class: "sui-hint" }, "Есть только тестовые компании — отметьте «Показать тестовые».")) : k.appendChild(d(r, "div", { class: "sui-hint" }, "Компаний пока нет."));
  }
  S.addEventListener("change", () => {
    me(Y, S.checked), D();
    const p = r.defaultView;
    p && p.dispatchEvent(new p.Event(pe));
  });
  async function I() {
    const p = await l.companies();
    if (m) {
      if (!p.ok) {
        k.replaceChildren(), L.show("error", p.message);
        return;
      }
      _ = p.value, D();
    }
  }
  function U(p) {
    const v = d(r, "section", { class: "sui-card sui-stack", "data-company": p.id }), u = d(r, "div", { class: "sui-card-head" }), P = d(r, "div", { class: "sui-row" });
    P.appendChild(d(r, "span", { class: "sui-title" }, p.name)), p.is_test && P.appendChild(d(r, "span", { class: "sui-badge" }, "тестовая")), u.append(P, d(r, "span", { class: "sui-hint" }, "людей: " + p.people));
    const R = Z(r), V = d(r, "div", { class: "sui-list" });
    for (const g of p.modules) {
      const C = d(r, "div", { class: "sui-list-row", "data-module": g.code });
      if (C.appendChild(d(r, "span", { class: "sui-title" }, g.name)), g.managed) {
        const y = d(r, "label", { class: "sui-check" }), b = d(r, "input", { type: "checkbox", "aria-label": `${g.name} у компании ${p.name}` });
        b.checked = g.enabled === !0;
        const Q = d(r, "span", {}, b.checked ? "включён" : "выключен");
        b.addEventListener("change", () => {
          const O = b.checked;
          b.disabled = !0, l.setModule(p.id, g.code, O).then((B) => {
            if (b.disabled = !1, !B.ok) {
              b.checked = !O, R.show("error", B.message);
              return;
            }
            Q.textContent = O ? "включён" : "выключен", R.show("ok", `«${g.name}» ${O ? "включён" : "выключен"}. Люди компании увидят изменение после обновления страницы.`), a.onChanged && a.onChanged();
          });
        }), y.append(b, Q), C.appendChild(y);
      }
      ne[g.code] && C.appendChild(d(r, "div", { class: "sui-hint", "data-testid": "pa-mod-hint" }, ne[g.code])), V.appendChild(C);
    }
    const z = d(r, "form", { class: "sui-row", "data-testid": "pa-admin", novalidate: "" }), q = d(r, "input", { class: "sui-input", type: "email", name: "email", inputmode: "email", placeholder: "почта существующей учётки", "aria-label": `Почта администратора компании ${p.name}` }), $ = d(r, "button", { type: "submit", class: "pf-btn" }, "Назначить администратора");
    return z.append(q, $), z.addEventListener("submit", (g) => {
      g.preventDefault();
      const C = q.value.trim();
      if (!C) {
        R.show("error", "Введите почту");
        return;
      }
      $.disabled = !0, l.setCompanyAdmin(p.id, C).then((y) => {
        if ($.disabled = !1, !y.ok) {
          R.show("error", y.message);
          return;
        }
        q.value = "", I().then(() => L.show("ok", `${C} — администратор компании «${p.name}».`));
      });
    }), v.append(u, V, d(r, "div", { class: "sui-hint" }, "Администратор компании"), z, R), v;
  }
  return E.addEventListener("submit", (p) => {
    p.preventDefault();
    const v = N.value.trim();
    if (!v) {
      H.show("error", "Введите название компании");
      return;
    }
    j.disabled = !0, l.createCompany(v, M.checked).then((u) => {
      if (j.disabled = !1, !u.ok) {
        H.show("error", u.message);
        return;
      }
      N.value = "", M.checked = !1, H.show("ok", `Компания «${v}» создана.`), a.onChanged && a.onChanged(), I();
    });
  }), k.appendChild(d(r, "div", { class: "sui-hint" }, "Загрузка…")), I(), () => {
    m = !1, s.replaceChildren();
  };
}
const oe = "platform-admin-style";
let W = null;
function ye(s) {
  var l;
  be();
  const a = s.ownerDocument;
  if (!a.getElementById(oe)) {
    const m = a.createElement("style");
    m.id = oe, m.textContent = he, a.head.appendChild(m);
  }
  const r = (l = window.RBI) == null ? void 0 : l.platform2;
  if (!r || typeof r.rpc != "function") {
    s.textContent = "Вход платформы не загружен.";
    return;
  }
  W = ve(s, { api: ae(r.rpc), onChanged: () => {
    r.refresh && r.refresh();
  } });
}
function be() {
  W && W(), W = null;
}
function we() {
  return W !== null;
}
export {
  we as isMounted,
  ye as mount,
  be as unmount
};
//# sourceMappingURL=platform-admin.js.map
