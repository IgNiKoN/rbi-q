const fo = Symbol.for("@supabase/supabase-js.traceContextExtractor");
function po() {
  return globalThis[fo];
}
function cr(t, e) {
  var r = {};
  for (var n in t) Object.prototype.hasOwnProperty.call(t, n) && e.indexOf(n) < 0 && (r[n] = t[n]);
  if (t != null && typeof Object.getOwnPropertySymbols == "function")
    for (var s = 0, n = Object.getOwnPropertySymbols(t); s < n.length; s++)
      e.indexOf(n[s]) < 0 && Object.prototype.propertyIsEnumerable.call(t, n[s]) && (r[n[s]] = t[n[s]]);
  return r;
}
function go(t, e, r, n) {
  function s(i) {
    return i instanceof r ? i : new r(function(o) {
      o(i);
    });
  }
  return new (r || (r = Promise))(function(i, o) {
    function a(u) {
      try {
        c(n.next(u));
      } catch (d) {
        o(d);
      }
    }
    function l(u) {
      try {
        c(n.throw(u));
      } catch (d) {
        o(d);
      }
    }
    function c(u) {
      u.done ? i(u.value) : s(u.value).then(a, l);
    }
    c((n = n.apply(t, e || [])).next());
  });
}
const mo = (t) => t ? (...e) => t(...e) : (...e) => fetch(...e);
class yn extends Error {
  constructor(e, r = "FunctionsError", n) {
    super(e), this.name = r, this.context = n;
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context
    };
  }
}
class yo extends yn {
  constructor(e) {
    super("Failed to send a request to the Edge Function", "FunctionsFetchError", e);
  }
}
class Pn extends yn {
  constructor(e) {
    super("Relay Error invoking the Edge Function", "FunctionsRelayError", e);
  }
}
class Nn extends yn {
  constructor(e) {
    super("Edge Function returned a non-2xx status code", "FunctionsHttpError", e);
  }
}
var qr;
(function(t) {
  t.Any = "any", t.ApNortheast1 = "ap-northeast-1", t.ApNortheast2 = "ap-northeast-2", t.ApSouth1 = "ap-south-1", t.ApSoutheast1 = "ap-southeast-1", t.ApSoutheast2 = "ap-southeast-2", t.CaCentral1 = "ca-central-1", t.EuCentral1 = "eu-central-1", t.EuWest1 = "eu-west-1", t.EuWest2 = "eu-west-2", t.EuWest3 = "eu-west-3", t.SaEast1 = "sa-east-1", t.UsEast1 = "us-east-1", t.UsWest1 = "us-west-1", t.UsWest2 = "us-west-2";
})(qr || (qr = {}));
class _o {
  /**
   * Creates a new Functions client bound to an Edge Functions URL.
   *
   * @example Using supabase-js (recommended)
   * ```ts
   * import { createClient } from '@supabase/supabase-js'
   *
   * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
   * const { data, error } = await supabase.functions.invoke('hello-world')
   * ```
   *
   * @category Edge Functions
   *
   * @example Standalone import for bundle-sensitive environments
   * ```ts
   * import { FunctionsClient, FunctionRegion } from '@supabase/functions-js'
   *
   * const functions = new FunctionsClient('https://xyzcompany.supabase.co/functions/v1', {
   *   headers: { apikey: 'your-publishable-key' },
   *   region: FunctionRegion.UsEast1,
   * })
   * ```
   */
  constructor(e, { headers: r = {}, customFetch: n, region: s = qr.Any } = {}) {
    this.url = e, this.headers = r, this.region = s, this.fetch = mo(n);
  }
  /**
   * Updates the authorization header
   * @param token - the new jwt token sent in the authorisation header
   *
   * @category Edge Functions
   *
   * @example Setting the authorization header
   * ```ts
   * functions.setAuth(session.access_token)
   * ```
   */
  setAuth(e) {
    this.headers.Authorization = `Bearer ${e}`;
  }
  /**
   * Invokes a function
   * @param functionName - The name of the Function to invoke.
   * @param options - Options for invoking the Function.
   * @example
   * ```ts
   * const { data, error } = await functions.invoke('hello-world', {
   *   body: { name: 'Ada' },
   * })
   * ```
   *
   * @category Edge Functions
   *
   * @remarks
   * - The API key is sent in the `apikey` header. The `Authorization` header is reserved
   *   for the signed-in user's JWT (or a custom auth token) — when there is no session, a
   *   new-format API key (`sb_publishable_…` / `sb_secret_…`) is not sent as a Bearer token.
   * - Invoke params generally match the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) spec.
   * - When you pass in a body to your function, we automatically attach the Content-Type header for `Blob`, `ArrayBuffer`, `File`, `FormData` and `String`. If it doesn't match any of these types we assume the payload is `json`, serialize it and attach the `Content-Type` header as `application/json`. You can override this behavior by passing in a `Content-Type` header of your own.
   * - Responses are automatically parsed as `json`, `blob` and `form-data` depending on the `Content-Type` header sent by your function. Responses are parsed as `text` by default.
   *
   * @example Basic invocation
   * ```js
   * const { data, error } = await supabase.functions.invoke('hello', {
   *   body: { foo: 'bar' }
   * })
   * ```
   *
   * @exampleDescription Error handling
   * A `FunctionsHttpError` error is returned if your function throws an error, `FunctionsRelayError` if the Supabase Relay has an error processing your function and `FunctionsFetchError` if there is a network error in calling your function. Log the full error object so fields like `name`, `context`, and any structured body aren't hidden.
   *
   * @example Error handling
   * ```js
   * import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from "@supabase/supabase-js";
   *
   * const { data, error } = await supabase.functions.invoke('hello', {
   *   headers: {
   *     "my-custom-header": 'my-custom-header-value'
   *   },
   *   body: { foo: 'bar' }
   * })
   *
   * if (error instanceof FunctionsHttpError) {
   *   const errorMessage = await error.context.json()
   *   console.error('Function returned an error', errorMessage)
   * } else if (error instanceof FunctionsRelayError) {
   *   console.error('Relay error:', error)
   * } else if (error instanceof FunctionsFetchError) {
   *   console.error('Fetch error:', error)
   * }
   * ```
   *
   * @exampleDescription Passing custom headers
   * You can pass custom headers to your function. Note: supabase-js automatically passes the `Authorization` header with the signed in user's JWT.
   *
   * @example Passing custom headers
   * ```js
   * const { data, error } = await supabase.functions.invoke('hello', {
   *   headers: {
   *     "my-custom-header": 'my-custom-header-value'
   *   },
   *   body: { foo: 'bar' }
   * })
   * ```
   *
   * @exampleDescription Calling with DELETE HTTP verb
   * You can also set the HTTP verb to `DELETE` when calling your Edge Function.
   *
   * @example Calling with DELETE HTTP verb
   * ```js
   * const { data, error } = await supabase.functions.invoke('hello', {
   *   headers: {
   *     "my-custom-header": 'my-custom-header-value'
   *   },
   *   body: { foo: 'bar' },
   *   method: 'DELETE'
   * })
   * ```
   *
   * @exampleDescription Invoking a Function in the UsEast1 region
   * Here are the available regions:
   * - `FunctionRegion.Any`
   * - `FunctionRegion.ApNortheast1`
   * - `FunctionRegion.ApNortheast2`
   * - `FunctionRegion.ApSouth1`
   * - `FunctionRegion.ApSoutheast1`
   * - `FunctionRegion.ApSoutheast2`
   * - `FunctionRegion.CaCentral1`
   * - `FunctionRegion.EuCentral1`
   * - `FunctionRegion.EuWest1`
   * - `FunctionRegion.EuWest2`
   * - `FunctionRegion.EuWest3`
   * - `FunctionRegion.SaEast1`
   * - `FunctionRegion.UsEast1`
   * - `FunctionRegion.UsWest1`
   * - `FunctionRegion.UsWest2`
   *
   * @example Invoking a Function in the UsEast1 region
   * ```js
   * import { createClient, FunctionRegion } from '@supabase/supabase-js'
   *
   * const { data, error } = await supabase.functions.invoke('hello', {
   *   body: { foo: 'bar' },
   *   region: FunctionRegion.UsEast1
   * })
   * ```
   *
   * @exampleDescription Calling with GET HTTP verb
   * You can also set the HTTP verb to `GET` when calling your Edge Function.
   *
   * @example Calling with GET HTTP verb
   * ```js
   * const { data, error } = await supabase.functions.invoke('hello', {
   *   headers: {
   *     "my-custom-header": 'my-custom-header-value'
   *   },
   *   method: 'GET'
   * })
   * ```
   *
   * @example Standalone client invoke
   * ```ts
   * const { data, error } = await functions.invoke('hello-world', {
   *   body: { name: 'Ada' },
   * })
   * ```
   */
  invoke(e) {
    return go(this, arguments, void 0, function* (r, n = {}) {
      var s, i;
      let o, a, l;
      try {
        const { headers: c, method: u, body: d, signal: p, timeout: h } = n;
        let f = {}, { region: g } = n;
        g || (g = this.region);
        const m = new URL(`${this.url}/${r}`);
        g && g !== "any" && (f["x-region"] = g, m.searchParams.set("forceFunctionRegion", g));
        let y;
        const _ = !!c && Object.keys(c).some((j) => j.toLowerCase() === "content-type");
        d && !_ ? typeof Blob < "u" && d instanceof Blob || d instanceof ArrayBuffer ? (f["Content-Type"] = d.type || "application/octet-stream", y = d) : typeof d == "string" ? (f["Content-Type"] = "text/plain", y = d) : typeof FormData < "u" && d instanceof FormData ? y = d : (f["Content-Type"] = "application/json", y = JSON.stringify(d)) : d && typeof d != "string" && !(typeof Blob < "u" && d instanceof Blob) && !(d instanceof ArrayBuffer) && !(typeof FormData < "u" && d instanceof FormData) ? y = JSON.stringify(d) : y = d;
        let w = p;
        h && (a = new AbortController(), o = setTimeout(() => a.abort(), h), p ? (w = a.signal, l = () => a.abort(), p.addEventListener("abort", l)) : w = a.signal);
        const E = yield this.fetch(m.toString(), {
          method: u || "POST",
          // headers priority is (high to low):
          // 1. invoke-level headers
          // 2. client-level headers
          // 3. default Content-Type header
          headers: Object.assign(Object.assign(Object.assign({}, f), this.headers), c),
          body: y,
          signal: w
        }).catch((j) => {
          throw new yo(j);
        }), R = E.headers.get("x-relay-error");
        if (R && R === "true")
          throw new Pn(E);
        if (!E.ok)
          throw new Nn(E);
        let A = ((s = E.headers.get("Content-Type")) !== null && s !== void 0 ? s : "text/plain").split(";")[0].trim().toLowerCase(), I;
        return A === "application/json" ? I = yield E.json() : A === "application/octet-stream" || A === "application/pdf" ? I = yield E.blob() : A === "text/event-stream" ? I = E : A === "multipart/form-data" ? I = yield E.formData() : I = yield E.text(), { data: I, error: null, response: E };
      } catch (c) {
        return {
          data: null,
          error: c,
          response: c instanceof Nn || c instanceof Pn ? c.context : void 0
        };
      } finally {
        o && clearTimeout(o), l && ((i = n.signal) === null || i === void 0 || i.removeEventListener("abort", l));
      }
    });
  }
}
var Xe = class extends Error {
  /**
  * @example
  * ```ts
  * import PostgrestError from '@supabase/postgrest-js'
  *
  * throw new PostgrestError({
  *   message: 'Row level security prevented the request',
  *   details: 'RLS denied the insert',
  *   hint: 'Check your policies',
  *   code: 'PGRST301',
  * })
  * ```
  */
  constructor(t) {
    super(t.message), this.name = "PostgrestError", this.details = t.details, this.hint = t.hint, this.code = t.code;
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      details: this.details,
      hint: this.hint,
      code: this.code
    };
  }
};
const li = 3, $n = (t) => Math.min(1e3 * 2 ** t, 3e4), wo = [520, 503], ci = [
  "GET",
  "HEAD",
  "OPTIONS"
];
function yt(t) {
  "@babel/helpers - typeof";
  return yt = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
    return typeof e;
  } : function(e) {
    return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
  }, yt(t);
}
function vo(t, e) {
  if (yt(t) != "object" || !t) return t;
  var r = t[Symbol.toPrimitive];
  if (r !== void 0) {
    var n = r.call(t, e);
    if (yt(n) != "object") return n;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (e === "string" ? String : Number)(t);
}
function bo(t) {
  var e = vo(t, "string");
  return yt(e) == "symbol" ? e : e + "";
}
function ko(t, e, r) {
  return (e = bo(e)) in t ? Object.defineProperty(t, e, {
    value: r,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : t[e] = r, t;
}
function Ln(t, e) {
  var r = Object.keys(t);
  if (Object.getOwnPropertySymbols) {
    var n = Object.getOwnPropertySymbols(t);
    e && (n = n.filter(function(s) {
      return Object.getOwnPropertyDescriptor(t, s).enumerable;
    })), r.push.apply(r, n);
  }
  return r;
}
function $e(t) {
  for (var e = 1; e < arguments.length; e++) {
    var r = arguments[e] != null ? arguments[e] : {};
    e % 2 ? Ln(Object(r), !0).forEach(function(n) {
      ko(t, n, r[n]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(r)) : Ln(Object(r)).forEach(function(n) {
      Object.defineProperty(t, n, Object.getOwnPropertyDescriptor(r, n));
    });
  }
  return t;
}
function Dn(t, e) {
  return new Promise((r) => {
    if (e != null && e.aborted) {
      r();
      return;
    }
    const n = setTimeout(() => {
      e == null || e.removeEventListener("abort", s), r();
    }, t);
    function s() {
      clearTimeout(n), r();
    }
    e == null || e.addEventListener("abort", s);
  });
}
function So(t, e, r, n) {
  return !(!n || r >= li || !ci.includes(t) || !wo.includes(e));
}
async function ui(t, e, r, n) {
  let s = 0;
  for (; ; ) {
    const l = $e({}, r.headers);
    s > 0 && (l["X-Retry-Count"] = String(s));
    let c;
    try {
      c = await t(e, {
        method: r.method,
        headers: l,
        body: r.body,
        signal: r.signal
      });
    } catch (u) {
      var i;
      if ((u == null ? void 0 : u.name) === "AbortError" || (u == null ? void 0 : u.code) === "ABORT_ERR" || (u == null ? void 0 : u.name) === "TimeoutError" && (!((i = r.signal) === null || i === void 0) && i.aborted) || !ci.includes(r.method)) throw u;
      if (n && s < li) {
        const d = $n(s);
        s++, await Dn(d, r.signal);
        continue;
      }
      throw u;
    }
    if (So(r.method, c.status, s, n)) {
      var o, a;
      const u = (o = (a = c.headers) === null || a === void 0 ? void 0 : a.get("Retry-After")) !== null && o !== void 0 ? o : null, d = u !== null ? Math.max(0, parseInt(u, 10) || 0) * 1e3 : $n(s);
      await c.text(), s++, await Dn(d, r.signal);
      continue;
    }
    return c;
  }
}
var Eo = class {
  /**
  * Creates a builder configured for a specific PostgREST request.
  *
  * @example Using supabase-js (recommended)
  * ```ts
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
  * const { data, error } = await supabase.from('users').select('*')
  * ```
  *
  * @category Database
  *
  * @example Standalone import for bundle-sensitive environments
  * ```ts
  * import { PostgrestQueryBuilder } from '@supabase/postgrest-js'
  *
  * const builder = new PostgrestQueryBuilder(
  *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
  *   { headers: new Headers({ apikey: 'your-publishable-key' }) }
  * )
  * ```
  */
  constructor(t) {
    var e, r, n, s, i;
    this.shouldThrowOnError = !1, this.retryEnabled = !0, this.method = t.method, this.url = t.url, this.headers = new Headers(t.headers), this.schema = t.schema, this.body = t.body, this.shouldThrowOnError = (e = t.shouldThrowOnError) !== null && e !== void 0 ? e : !1, this.signal = t.signal, this.isMaybeSingle = (r = t.isMaybeSingle) !== null && r !== void 0 ? r : !1, this.shouldStripNulls = (n = t.shouldStripNulls) !== null && n !== void 0 ? n : !1, this.urlLengthLimit = (s = t.urlLengthLimit) !== null && s !== void 0 ? s : 8e3, this.retryEnabled = (i = t.retry) !== null && i !== void 0 ? i : !0, t.fetch ? this.fetch = t.fetch : this.fetch = fetch;
  }
  /**
  * If there's an error with the query, throwOnError will reject the promise by
  * throwing the error instead of returning it as part of a successful response.
  *
  * {@link https://github.com/supabase/supabase-js/issues/92}
  *
  * @category Database
  * @subcategory Using modifiers
  */
  throwOnError() {
    return this.shouldThrowOnError = !0, this;
  }
  /**
  * Strip null values from the response data. Properties with `null` values
  * will be omitted from the returned JSON objects.
  *
  * Requires PostgREST 11.2.0+.
  *
  * {@link https://docs.postgrest.org/en/stable/references/api/resource_representation.html#stripped-nulls}
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @example With `select()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select()
  *   .stripNulls()
  * ```
  *
  * @exampleSql With `select()`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text, bio text);
  *
  * insert into
  *   characters (id, name, bio)
  * values
  *   (1, 'Luke', null),
  *   (2, 'Leia', 'Princess of Alderaan');
  * ```
  *
  * @exampleResponse With `select()`
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Luke"
  *     },
  *     {
  *       "id": 2,
  *       "name": "Leia",
  *       "bio": "Princess of Alderaan"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  stripNulls() {
    if (this.headers.get("Accept") === "text/csv") throw new Error("stripNulls() cannot be used with csv()");
    return this.shouldStripNulls = !0, this;
  }
  /**
  * Set an HTTP header on this single PostgREST request, overriding any header
  * with the same name set on the client.
  *
  * This is an advanced escape hatch for one-off needs (passing a custom
  * `Authorization` for a single query, attaching a tracing header, etc.).
  * Most callers do not need it: configure client-wide headers via the
  * `headers` option when constructing the client, and authentication via
  * Supabase Auth.
  *
  * @param name - HTTP header name
  * @param value - HTTP header value
  *
  * @category Database
  * @subcategory Using modifiers
  */
  setHeader(t, e) {
    return this.headers = new Headers(this.headers), this.headers.set(t, e), this;
  }
  /**
  * @category Database
  * @subcategory Using modifiers
  *
  * Configure retry behavior for this request.
  *
  * By default, retries are enabled for idempotent requests (GET, HEAD, OPTIONS)
  * that fail with network errors or specific HTTP status codes (503, 520).
  * Retries use exponential backoff (1s, 2s, 4s) with a maximum of 3 attempts.
  *
  * @param enabled - Whether to enable retries for this request
  *
  * @example
  * ```ts
  * // Disable retries for a specific query
  * const { data, error } = await supabase
  *   .from('users')
  *   .select()
  *   .retry(false)
  * ```
  */
  retry(t) {
    return this.retryEnabled = t, this;
  }
  then(t, e) {
    var r = this;
    if (this.schema === void 0 || (["GET", "HEAD"].includes(this.method) ? this.headers.set("Accept-Profile", this.schema) : this.headers.set("Content-Profile", this.schema)), this.method !== "GET" && this.method !== "HEAD" && this.headers.set("Content-Type", "application/json"), this.shouldStripNulls) {
      const o = this.headers.get("Accept");
      o === "application/vnd.pgrst.object+json" ? this.headers.set("Accept", "application/vnd.pgrst.object+json;nulls=stripped") : (!o || o === "application/json") && this.headers.set("Accept", "application/vnd.pgrst.array+json;nulls=stripped");
    }
    const n = this.fetch;
    let i = (async () => {
      const o = {};
      r.headers.forEach((l, c) => {
        o[c] = l;
      });
      const a = await ui(n, r.url.toString(), {
        method: r.method,
        headers: o,
        body: JSON.stringify(r.body, (l, c) => typeof c == "bigint" ? c.toString() : c),
        signal: r.signal
      }, r.retryEnabled);
      return await r.processResponse(a);
    })();
    return this.shouldThrowOnError || (i = i.catch((o) => {
      var a;
      let l = "", c = "", u = "";
      const d = o == null ? void 0 : o.cause;
      if (d) {
        var p, h, f, g;
        const _ = (p = d == null ? void 0 : d.message) !== null && p !== void 0 ? p : "", w = (h = d == null ? void 0 : d.code) !== null && h !== void 0 ? h : "";
        l = `${(f = o == null ? void 0 : o.name) !== null && f !== void 0 ? f : "FetchError"}: ${o == null ? void 0 : o.message}`, l += `

Caused by: ${(g = d == null ? void 0 : d.name) !== null && g !== void 0 ? g : "Error"}: ${_}`, w && (l += ` (${w})`), d != null && d.stack && (l += `
${d.stack}`);
      } else {
        var m;
        l = (m = o == null ? void 0 : o.stack) !== null && m !== void 0 ? m : "";
      }
      const y = this.url.toString().length;
      return (o == null ? void 0 : o.name) === "AbortError" || (o == null ? void 0 : o.code) === "ABORT_ERR" ? (u = "", c = "Request was aborted (timeout or manual cancellation)", y > this.urlLengthLimit && (c += `. Note: Your request URL is ${y} characters, which may exceed server limits. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [many IDs])), consider using an RPC function to pass values server-side.`)) : ((d == null ? void 0 : d.name) === "HeadersOverflowError" || (d == null ? void 0 : d.code) === "UND_ERR_HEADERS_OVERFLOW") && (u = "", c = "HTTP headers exceeded server limits (typically 16KB)", y > this.urlLengthLimit && (c += `. Your request URL is ${y} characters. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [200+ IDs])), consider using an RPC function instead.`)), {
        success: !1,
        error: {
          message: `${(a = o == null ? void 0 : o.name) !== null && a !== void 0 ? a : "FetchError"}: ${o == null ? void 0 : o.message}`,
          details: l,
          hint: c,
          code: u
        },
        data: null,
        count: null,
        status: 0,
        statusText: ""
      };
    })), i.then(t, e);
  }
  /**
  * Process a fetch response and return the standardized postgrest response.
  */
  async processResponse(t) {
    var e = this;
    let r = null, n = null, s = null, i = t.status, o = t.statusText;
    if (t.ok) {
      var a, l;
      if (e.method !== "HEAD") {
        var c;
        const h = await t.text();
        if (h !== "") if (e.headers.get("Accept") === "text/csv") n = h;
        else if (e.headers.get("Accept") && (!((c = e.headers.get("Accept")) === null || c === void 0) && c.includes("application/vnd.pgrst.plan+text"))) n = h;
        else try {
          n = JSON.parse(h);
        } catch {
          if (r = { message: h }, n = null, e.shouldThrowOnError) throw new Xe({
            message: h,
            details: "",
            hint: "",
            code: ""
          });
        }
      }
      const d = (a = e.headers.get("Prefer")) === null || a === void 0 ? void 0 : a.match(/count=(exact|planned|estimated)/), p = (l = t.headers.get("content-range")) === null || l === void 0 ? void 0 : l.split("/");
      if (d && p && p.length > 1 && (s = parseInt(p[1])), e.isMaybeSingle && Array.isArray(n)) if (n.length > 1) {
        if (r = {
          code: "PGRST116",
          details: `Results contain ${n.length} rows, application/vnd.pgrst.object+json requires 1 row`,
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned"
        }, n = null, s = null, i = 406, o = "Not Acceptable", e.shouldThrowOnError) {
          var u;
          throw new Xe($e($e({}, r), {}, { hint: (u = r.hint) !== null && u !== void 0 ? u : "" }));
        }
      } else n.length === 1 ? n = n[0] : n = null;
    } else {
      const d = await t.text();
      try {
        r = JSON.parse(d), Array.isArray(r) && t.status === 404 && (n = [], r = null, i = 200, o = "OK");
      } catch {
        t.status === 404 && d === "" ? (i = 204, o = "No Content") : r = { message: d };
      }
      if (r && e.shouldThrowOnError) throw new Xe(r);
    }
    return {
      success: r === null,
      error: r,
      data: n,
      count: s,
      status: i,
      statusText: o
    };
  }
  /**
  * Override the type of the returned `data`.
  *
  * @typeParam NewResult - The new result type to override with
  * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
  *
  * @category Database
  * @subcategory Using modifiers
  */
  returns() {
    return this;
  }
  /**
  * Override the type of the returned `data` field in the response.
  *
  * @typeParam NewResult - The new type to cast the response data to
  * @typeParam Options - Optional type configuration (defaults to { merge: true })
  * @typeParam Options.merge - When true, merges the new type with existing return type. When false, replaces the existing types entirely (defaults to true)
  * @example
  * ```typescript
  * // Merge with existing types (default behavior)
  * const query = supabase
  *   .from('users')
  *   .select()
  *   .overrideTypes<{ custom_field: string }>()
  *
  * // Replace existing types completely
  * const replaceQuery = supabase
  *   .from('users')
  *   .select()
  *   .overrideTypes<{ id: number; name: string }, { merge: false }>()
  * ```
  * @returns A PostgrestBuilder instance with the new type
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @example Complete Override type of successful response
  * ```ts
  * const { data } = await supabase
  *   .from('countries')
  *   .select()
  *   .overrideTypes<Array<MyType>, { merge: false }>()
  * ```
  *
  * @exampleResponse Complete Override type of successful response
  * ```ts
  * let x: typeof data // MyType[]
  * ```
  *
  * @example Complete Override type of object response
  * ```ts
  * const { data } = await supabase
  *   .from('countries')
  *   .select()
  *   .maybeSingle()
  *   .overrideTypes<MyType, { merge: false }>()
  * ```
  *
  * @exampleResponse Complete Override type of object response
  * ```ts
  * let x: typeof data // MyType | null
  * ```
  *
  * @example Partial Override type of successful response
  * ```ts
  * const { data } = await supabase
  *   .from('countries')
  *   .select()
  *   .overrideTypes<Array<{ status: "A" | "B" }>>()
  * ```
  *
  * @exampleResponse Partial Override type of successful response
  * ```ts
  * let x: typeof data // Array<CountryRowProperties & { status: "A" | "B" }>
  * ```
  *
  * @example Partial Override type of object response
  * ```ts
  * const { data } = await supabase
  *   .from('countries')
  *   .select()
  *   .maybeSingle()
  *   .overrideTypes<{ status: "A" | "B" }>()
  * ```
  *
  * @exampleResponse Partial Override type of object response
  * ```ts
  * let x: typeof data // CountryRowProperties & { status: "A" | "B" } | null
  * ```
  *
  * @example Merge vs replace existing types
  * ```typescript
  * // Merge with existing types (default behavior)
  * const query = supabase
  *   .from('users')
  *   .select()
  *   .overrideTypes<{ custom_field: string }>()
  *
  * // Replace existing types completely
  * const replaceQuery = supabase
  *   .from('users')
  *   .select()
  *   .overrideTypes<{ id: number; name: string }, { merge: false }>()
  * ```
  */
  overrideTypes() {
    return this;
  }
}, xo = class extends Eo {
  throwOnError() {
    return super.throwOnError();
  }
  /**
  * Perform a SELECT on the query result.
  *
  * By default, `.insert()`, `.update()`, `.upsert()`, and `.delete()` do not
  * return modified rows. By calling this method, modified rows are returned in
  * `data`.
  *
  * @param columns - The columns to retrieve, separated by commas
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @example With `upsert()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .upsert({ id: 1, name: 'Han Solo' })
  *   .select()
  * ```
  *
  * @exampleSql With `upsert()`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Han');
  * ```
  *
  * @exampleResponse With `upsert()`
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Han Solo"
  *     }
  *   ],
  *   "status": 201,
  *   "statusText": ""
  * }
  * ```
  */
  select(t) {
    let e = !1;
    const r = (t ?? "*").split("").map((n) => /\s/.test(n) && !e ? "" : (n === '"' && (e = !e), n)).join("");
    return this.url.searchParams.set("select", r), this.headers.append("Prefer", "return=representation"), this;
  }
  /**
  * Order the query result by `column`.
  *
  * You can call this method multiple times to order by multiple columns.
  *
  * You can order referenced tables, but it only affects the ordering of the
  * parent table if you use `!inner` in the query.
  *
  * @param column - The column to order by
  * @param options - Named parameters
  * @param options.ascending - If `true`, the result will be in ascending order
  * @param options.nullsFirst - If `true`, `null`s appear first. If `false`,
  * `null`s appear last.
  * @param options.referencedTable - Set this to order a referenced table by
  * its columns
  * @param options.foreignTable - Deprecated, use `options.referencedTable`
  * instead
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @example With `select()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select('id, name')
  *   .order('id', { ascending: false })
  * ```
  *
  * @exampleSql With `select()`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse With `select()`
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 3,
  *       "name": "Han"
  *     },
  *     {
  *       "id": 2,
  *       "name": "Leia"
  *     },
  *     {
  *       "id": 1,
  *       "name": "Luke"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription On a referenced table
  * Ordering with `referencedTable` doesn't affect the ordering of the
  * parent table.
  *
  * @example On a referenced table
  * ```ts
  *   const { data, error } = await supabase
  *     .from('orchestral_sections')
  *     .select(`
  *       name,
  *       instruments (
  *         name
  *       )
  *     `)
  *     .order('name', { referencedTable: 'instruments', ascending: false })
  *
  * ```
  *
  * @exampleSql On a referenced table
  * ```sql
  * create table
  *   orchestral_sections (id int8 primary key, name text);
  * create table
  *   instruments (
  *     id int8 primary key,
  *     section_id int8 not null references orchestral_sections,
  *     name text
  *   );
  *
  * insert into
  *   orchestral_sections (id, name)
  * values
  *   (1, 'strings'),
  *   (2, 'woodwinds');
  * insert into
  *   instruments (id, section_id, name)
  * values
  *   (1, 1, 'harp'),
  *   (2, 1, 'violin');
  * ```
  *
  * @exampleResponse On a referenced table
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "strings",
  *       "instruments": [
  *         {
  *           "name": "violin"
  *         },
  *         {
  *           "name": "harp"
  *         }
  *       ]
  *     },
  *     {
  *       "name": "woodwinds",
  *       "instruments": []
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Order parent table by a referenced table
  * Ordering with `referenced_table(col)` affects the ordering of the
  * parent table.
  *
  * @example Order parent table by a referenced table
  * ```ts
  *   const { data, error } = await supabase
  *     .from('instruments')
  *     .select(`
  *       name,
  *       section:orchestral_sections (
  *         name
  *       )
  *     `)
  *     .order('section(name)', { ascending: true })
  *
  * ```
  *
  * @exampleSql Order parent table by a referenced table
  * ```sql
  * create table
  *   orchestral_sections (id int8 primary key, name text);
  * create table
  *   instruments (
  *     id int8 primary key,
  *     section_id int8 not null references orchestral_sections,
  *     name text
  *   );
  *
  * insert into
  *   orchestral_sections (id, name)
  * values
  *   (1, 'strings'),
  *   (2, 'woodwinds');
  * insert into
  *   instruments (id, section_id, name)
  * values
  *   (1, 2, 'flute'),
  *   (2, 1, 'violin');
  * ```
  *
  * @exampleResponse Order parent table by a referenced table
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "violin",
  *       "orchestral_sections": {"name": "strings"}
  *     },
  *     {
  *       "name": "flute",
  *       "orchestral_sections": {"name": "woodwinds"}
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  order(t, { ascending: e = !0, nullsFirst: r, foreignTable: n, referencedTable: s = n } = {}) {
    const i = s ? `${s}.order` : "order", o = this.url.searchParams.get(i);
    return this.url.searchParams.set(i, `${o ? `${o},` : ""}${t}.${e ? "asc" : "desc"}${r === void 0 ? "" : r ? ".nullsfirst" : ".nullslast"}`), this;
  }
  /**
  * Limit the query result by `rows`.
  *
  * @param rows - The maximum number of rows to return
  * @param options - Named parameters
  * @param options.referencedTable - Set this to limit rows of referenced
  * tables instead of the parent table
  * @param options.foreignTable - Deprecated, use `options.referencedTable`
  * instead
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @example With `select()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select('name')
  *   .limit(1)
  * ```
  *
  * @exampleSql With `select()`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse With `select()`
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "Luke"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @example On a referenced table
  * ```ts
  * const { data, error } = await supabase
  *   .from('orchestral_sections')
  *   .select(`
  *     name,
  *     instruments (
  *       name
  *     )
  *   `)
  *   .limit(1, { referencedTable: 'instruments' })
  * ```
  *
  * @exampleSql On a referenced table
  * ```sql
  * create table
  *   orchestral_sections (id int8 primary key, name text);
  * create table
  *   instruments (
  *     id int8 primary key,
  *     section_id int8 not null references orchestral_sections,
  *     name text
  *   );
  *
  * insert into
  *   orchestral_sections (id, name)
  * values
  *   (1, 'strings');
  * insert into
  *   instruments (id, section_id, name)
  * values
  *   (1, 1, 'harp'),
  *   (2, 1, 'violin');
  * ```
  *
  * @exampleResponse On a referenced table
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "strings",
  *       "instruments": [
  *         {
  *           "name": "violin"
  *         }
  *       ]
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  limit(t, { foreignTable: e, referencedTable: r = e } = {}) {
    const n = typeof r > "u" ? "limit" : `${r}.limit`;
    return this.url.searchParams.set(n, `${t}`), this;
  }
  /**
  * Limit the query result by starting at an offset `from` and ending at the offset `to`.
  * Only records within this range are returned.
  * This respects the query order and if there is no order clause the range could behave unexpectedly.
  * The `from` and `to` values are 0-based and inclusive: `range(1, 3)` will include the second, third
  * and fourth rows of the query.
  *
  * @param from - The starting index from which to limit the result
  * @param to - The last index to which to limit the result
  * @param options - Named parameters
  * @param options.referencedTable - Set this to limit rows of referenced
  * tables instead of the parent table
  * @param options.foreignTable - Deprecated, use `options.referencedTable`
  * instead
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @example With `select()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select('name')
  *   .range(0, 1)
  * ```
  *
  * @exampleSql With `select()`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse With `select()`
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "Luke"
  *     },
  *     {
  *       "name": "Leia"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  range(t, e, { foreignTable: r, referencedTable: n = r } = {}) {
    const s = typeof n > "u" ? "offset" : `${n}.offset`, i = typeof n > "u" ? "limit" : `${n}.limit`;
    return this.url.searchParams.set(s, `${t}`), this.url.searchParams.set(i, `${e - t + 1}`), this;
  }
  /**
  * Set the AbortSignal for the fetch request.
  *
  * @param signal - The AbortSignal to use for the fetch request
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @remarks
  * You can use this to set a timeout for the request.
  *
  * @exampleDescription Aborting requests in-flight
  * You can use an [`AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) to abort requests.
  * Note that `status` and `statusText` don't mean anything for aborted requests as the request wasn't fulfilled.
  *
  * @example Aborting requests in-flight
  * ```ts
  * const ac = new AbortController()
  *
  * const { data, error } = await supabase
  *   .from('very_big_table')
  *   .select()
  *   .abortSignal(ac.signal)
  *
  * // Abort the request after 100 ms
  * setTimeout(() => ac.abort(), 100)
  * ```
  *
  * @exampleResponse Aborting requests in-flight
  * ```json
  *   {
  *     "error": {
  *       "message": "AbortError: The user aborted a request.",
  *       "details": "",
  *       "hint": "The request was aborted locally via the provided AbortSignal.",
  *       "code": ""
  *     },
  *     "status": 0,
  *     "statusText": ""
  *   }
  *
  * ```
  *
  * @example Set a timeout
  * ```ts
  * const { data, error } = await supabase
  *   .from('very_big_table')
  *   .select()
  *   .abortSignal(AbortSignal.timeout(1000 /* ms *\/))
  * ```
  *
  * @exampleResponse Set a timeout
  * ```json
  *   {
  *     "error": {
  *       "message": "FetchError: The user aborted a request.",
  *       "details": "",
  *       "hint": "",
  *       "code": ""
  *     },
  *     "status": 0,
  *     "statusText": ""
  *   }
  *
  * ```
  */
  abortSignal(t) {
    return this.signal = t, this;
  }
  /**
  * Return `data` as a single object instead of an array of objects.
  *
  * Query result must be one row (e.g. using `.limit(1)`), otherwise this
  * returns an error.
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @example With `select()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select('name')
  *   .limit(1)
  *   .single()
  * ```
  *
  * @exampleSql With `select()`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse With `select()`
  * ```json
  * {
  *   "data": {
  *     "name": "Luke"
  *   },
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  single() {
    return this.headers.set("Accept", "application/vnd.pgrst.object+json"), this;
  }
  /**
  * Return `data` as a single object instead of an array of objects.
  *
  * Query result must be zero or one row (e.g. using `.limit(1)`), otherwise
  * this returns an error.
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @example With `select()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select()
  *   .eq('name', 'Katniss')
  *   .maybeSingle()
  * ```
  *
  * @exampleSql With `select()`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse With `select()`
  * ```json
  * {
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  maybeSingle() {
    return this.isMaybeSingle = !0, this;
  }
  /**
  * Return `data` as a string in CSV format.
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @exampleDescription Return data as CSV
  * By default, the data is returned in JSON format, but can also be returned as Comma Separated Values.
  *
  * @example Return data as CSV
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select()
  *   .csv()
  * ```
  *
  * @exampleSql Return data as CSV
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse Return data as CSV
  * ```json
  * {
  *   "data": "id,name\n1,Luke\n2,Leia\n3,Han",
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  csv() {
    return this.headers.set("Accept", "text/csv"), this;
  }
  /**
  * Return `data` as an object in [GeoJSON](https://geojson.org) format.
  *
  * @category Database
  * @subcategory Using modifiers
  */
  geojson() {
    return this.headers.set("Accept", "application/geo+json"), this;
  }
  /**
  * Return `data` as the EXPLAIN plan for the query.
  *
  * You need to enable the
  * [db_plan_enabled](https://supabase.com/docs/guides/database/debugging-performance#enabling-explain)
  * setting before using this method.
  *
  * @param options - Named parameters
  *
  * @param options.analyze - If `true`, the query will be executed and the
  * actual run time will be returned
  *
  * @param options.verbose - If `true`, the query identifier will be returned
  * and `data` will include the output columns of the query
  *
  * @param options.settings - If `true`, include information on configuration
  * parameters that affect query planning
  *
  * @param options.buffers - If `true`, include information on buffer usage
  *
  * @param options.wal - If `true`, include information on WAL record generation
  *
  * @param options.format - The format of the output, can be `"text"` (default)
  * or `"json"`
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @exampleDescription Get the execution plan
  * By default, the data is returned in TEXT format, but can also be returned as JSON by using the `format` parameter.
  *
  * @example Get the execution plan
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select()
  *   .explain()
  * ```
  *
  * @exampleSql Get the execution plan
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse Get the execution plan
  * ```js
  * Aggregate  (cost=33.34..33.36 rows=1 width=112)
  *   ->  Limit  (cost=0.00..18.33 rows=1000 width=40)
  *         ->  Seq Scan on characters  (cost=0.00..22.00 rows=1200 width=40)
  * ```
  *
  * @exampleDescription Get the execution plan with analyze and verbose
  * By default, the data is returned in TEXT format, but can also be returned as JSON by using the `format` parameter.
  *
  * @example Get the execution plan with analyze and verbose
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select()
  *   .explain({analyze:true,verbose:true})
  * ```
  *
  * @exampleSql Get the execution plan with analyze and verbose
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse Get the execution plan with analyze and verbose
  * ```js
  * Aggregate  (cost=33.34..33.36 rows=1 width=112) (actual time=0.041..0.041 rows=1 loops=1)
  *   Output: NULL::bigint, count(ROW(characters.id, characters.name)), COALESCE(json_agg(ROW(characters.id, characters.name)), '[]'::json), NULLIF(current_setting('response.headers'::text, true), ''::text), NULLIF(current_setting('response.status'::text, true), ''::text)
  *   ->  Limit  (cost=0.00..18.33 rows=1000 width=40) (actual time=0.005..0.006 rows=3 loops=1)
  *         Output: characters.id, characters.name
  *         ->  Seq Scan on public.characters  (cost=0.00..22.00 rows=1200 width=40) (actual time=0.004..0.005 rows=3 loops=1)
  *               Output: characters.id, characters.name
  * Query Identifier: -4730654291623321173
  * Planning Time: 0.407 ms
  * Execution Time: 0.119 ms
  * ```
  */
  explain({ analyze: t = !1, verbose: e = !1, settings: r = !1, buffers: n = !1, wal: s = !1, format: i = "text" } = {}) {
    var o;
    const a = [
      t ? "analyze" : null,
      e ? "verbose" : null,
      r ? "settings" : null,
      n ? "buffers" : null,
      s ? "wal" : null
    ].filter(Boolean).join("|"), l = (o = this.headers.get("Accept")) !== null && o !== void 0 ? o : "application/json";
    return this.headers.set("Accept", `application/vnd.pgrst.plan+${i}; for="${l}"; options=${a};`), i === "json" ? this : this;
  }
  /**
  * Dry-run this request: execute the query but discard the changes.
  *
  * Server-side, PostgREST runs the query inside a transaction and rolls it back
  * instead of committing. The response still contains the data that *would* have
  * been returned — `RETURNING` clauses execute and RLS, triggers, and constraints
  * are all evaluated — but no row is actually inserted, updated, or deleted.
  *
  * This affects only the single request it is chained to. The JS caller has no
  * handle on the transaction: supabase-js does not group multiple queries into
  * one transaction. For multi-statement transactional logic, use a database
  * function (`supabase.rpc(...)`).
  *
  * Sets the `Prefer: tx=rollback` header. See PostgREST's docs on transaction
  * preferences for the underlying mechanism.
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @example Validate an insert without persisting
  * ```ts
  * const { data, error } = await supabase
  *   .from('countries')
  *   .insert({ name: 'France' })
  *   .select()
  *   .rollback()
  * // `data` shows what would have been inserted; nothing is saved.
  * ```
  */
  rollback() {
    return this.headers.append("Prefer", "tx=rollback"), this;
  }
  /**
  * Override the type of the returned `data`.
  *
  * @typeParam NewResult - The new result type to override with
  * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
  *
  * @category Database
  * @subcategory Using modifiers
  *
  * @remarks
  * - Deprecated: use overrideTypes method instead
  *
  * @example Override type of successful response
  * ```ts
  * const { data } = await supabase
  *   .from('countries')
  *   .select()
  *   .returns<Array<MyType>>()
  * ```
  *
  * @exampleResponse Override type of successful response
  * ```js
  * let x: typeof data // MyType[]
  * ```
  *
  * @example Override type of object response
  * ```ts
  * const { data } = await supabase
  *   .from('countries')
  *   .select()
  *   .maybeSingle()
  *   .returns<MyType>()
  * ```
  *
  * @exampleResponse Override type of object response
  * ```js
  * let x: typeof data // MyType | null
  * ```
  */
  returns() {
    return this;
  }
  /**
  * Set the maximum number of rows that can be affected by the query.
  * Only available in PostgREST v13+ and only works with PATCH and DELETE methods.
  *
  * @param rows - The maximum number of rows that can be affected
  *
  * @category Database
  * @subcategory Using modifiers
  */
  maxAffected(t) {
    return this.headers.append("Prefer", "handling=strict"), this.headers.append("Prefer", `max-affected=${t}`), this;
  }
};
const Un = /* @__PURE__ */ new RegExp("[,()]");
var Je = class extends xo {
  throwOnError() {
    return super.throwOnError();
  }
  /**
  * Match only rows where `column` is equal to `value`.
  *
  * To check if the value of `column` is NULL, you should use `.is()` instead.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  *
  * @category Database
  * @subcategory Using filters
  *
  * @example With `select()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select()
  *   .eq('name', 'Leia')
  * ```
  *
  * @exampleSql With `select()`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse With `select()`
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 2,
  *       "name": "Leia"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  eq(t, e) {
    return this.url.searchParams.append(t, `eq.${e}`), this;
  }
  /**
  * Match only rows where `column` is not equal to `value`.
  *
  * This filter does not include rows where `column` is `NULL`. To match null
  * values, use `.is(column, null)` instead.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  *
  * @category Database
  * @subcategory Using filters
  *
  * @example With `select()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select()
  *   .neq('name', 'Leia')
  * ```
  *
  * @exampleSql With `select()`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse With `select()`
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Luke"
  *     },
  *     {
  *       "id": 3,
  *       "name": "Han"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  neq(t, e) {
    return this.url.searchParams.append(t, `neq.${e}`), this;
  }
  gt(t, e) {
    return this.url.searchParams.append(t, `gt.${e}`), this;
  }
  gte(t, e) {
    return this.url.searchParams.append(t, `gte.${e}`), this;
  }
  lt(t, e) {
    return this.url.searchParams.append(t, `lt.${e}`), this;
  }
  lte(t, e) {
    return this.url.searchParams.append(t, `lte.${e}`), this;
  }
  like(t, e) {
    return this.url.searchParams.append(t, `like.${e}`), this;
  }
  likeAllOf(t, e) {
    return this.url.searchParams.append(t, `like(all).{${e.join(",")}}`), this;
  }
  likeAnyOf(t, e) {
    return this.url.searchParams.append(t, `like(any).{${e.join(",")}}`), this;
  }
  ilike(t, e) {
    return this.url.searchParams.append(t, `ilike.${e}`), this;
  }
  ilikeAllOf(t, e) {
    return this.url.searchParams.append(t, `ilike(all).{${e.join(",")}}`), this;
  }
  ilikeAnyOf(t, e) {
    return this.url.searchParams.append(t, `ilike(any).{${e.join(",")}}`), this;
  }
  regexMatch(t, e) {
    return this.url.searchParams.append(t, `match.${e}`), this;
  }
  regexIMatch(t, e) {
    return this.url.searchParams.append(t, `imatch.${e}`), this;
  }
  is(t, e) {
    return this.url.searchParams.append(t, `is.${e}`), this;
  }
  /**
  * Match only rows where `column` IS DISTINCT FROM `value`.
  *
  * Unlike `.neq()`, this treats `NULL` as a comparable value. Two `NULL` values
  * are considered equal (not distinct), and comparing `NULL` with any non-NULL
  * value returns true (distinct).
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  isDistinct(t, e) {
    return this.url.searchParams.append(t, `isdistinct.${e}`), this;
  }
  /**
  * Match only rows where `column` is included in the `values` array.
  *
  * @param column - The column to filter on
  * @param values - The values array to filter with
  *
  * @category Database
  * @subcategory Using filters
  *
  * @example With `select()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select()
  *   .in('name', ['Leia', 'Han'])
  * ```
  *
  * @exampleSql With `select()`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse With `select()`
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 2,
  *       "name": "Leia"
  *     },
  *     {
  *       "id": 3,
  *       "name": "Han"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  in(t, e) {
    const r = Array.from(new Set(e)).map((n) => typeof n == "string" && Un.test(n) ? `"${n}"` : `${n}`).join(",");
    return this.url.searchParams.append(t, `in.(${r})`), this;
  }
  /**
  * Match only rows where `column` is NOT included in the `values` array.
  *
  * @param column - The column to filter on
  * @param values - The values array to filter with
  */
  notIn(t, e) {
    const r = Array.from(new Set(e)).map((n) => typeof n == "string" && Un.test(n) ? `"${n}"` : `${n}`).join(",");
    return this.url.searchParams.append(t, `not.in.(${r})`), this;
  }
  contains(t, e) {
    return typeof e == "string" ? this.url.searchParams.append(t, `cs.${e}`) : Array.isArray(e) ? this.url.searchParams.append(t, `cs.{${e.join(",")}}`) : this.url.searchParams.append(t, `cs.${JSON.stringify(e)}`), this;
  }
  containedBy(t, e) {
    return typeof e == "string" ? this.url.searchParams.append(t, `cd.${e}`) : Array.isArray(e) ? this.url.searchParams.append(t, `cd.{${e.join(",")}}`) : this.url.searchParams.append(t, `cd.${JSON.stringify(e)}`), this;
  }
  rangeGt(t, e) {
    return this.url.searchParams.append(t, `sr.${e}`), this;
  }
  rangeGte(t, e) {
    return this.url.searchParams.append(t, `nxl.${e}`), this;
  }
  rangeLt(t, e) {
    return this.url.searchParams.append(t, `sl.${e}`), this;
  }
  rangeLte(t, e) {
    return this.url.searchParams.append(t, `nxr.${e}`), this;
  }
  rangeAdjacent(t, e) {
    return this.url.searchParams.append(t, `adj.${e}`), this;
  }
  overlaps(t, e) {
    return typeof e == "string" ? this.url.searchParams.append(t, `ov.${e}`) : this.url.searchParams.append(t, `ov.{${e.join(",")}}`), this;
  }
  textSearch(t, e, { config: r, type: n } = {}) {
    let s = "";
    n === "plain" ? s = "pl" : n === "phrase" ? s = "ph" : n === "websearch" && (s = "w");
    const i = r === void 0 ? "" : `(${r})`;
    return this.url.searchParams.append(t, `${s}fts${i}.${e}`), this;
  }
  match(t) {
    return Object.entries(t).filter(([e, r]) => r !== void 0).forEach(([e, r]) => {
      this.url.searchParams.append(e, `eq.${r}`);
    }), this;
  }
  /**
  * Match only rows which doesn't satisfy the filter.
  *
  * Unlike most filters, `opearator` and `value` are used as-is and need to
  * follow [PostgREST
  * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
  * to make sure they are properly sanitized.
  *
  * @param column - The column to filter on
  * @param operator - The operator to be negated to filter with, following
  * PostgREST syntax
  * @param value - The value to filter with, following PostgREST syntax
  *
  * @category Database
  * @subcategory Using filters
  *
  * @remarks
  * not() expects you to use the raw PostgREST syntax for the filter values.
  *
  * ```ts
  * .not('id', 'in', '(5,6,7)')  // Use `()` for `in` filter
  * .not('arraycol', 'cs', '{"a","b"}')  // Use `cs` for `contains()`, `{}` for array values
  * ```
  *
  * @example With `select()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('countries')
  *   .select()
  *   .not('name', 'is', null)
  * ```
  *
  * @exampleSql With `select()`
  * ```sql
  * create table
  *   countries (id int8 primary key, name text);
  *
  * insert into
  *   countries (id, name)
  * values
  *   (1, 'null'),
  *   (2, null);
  * ```
  *
  * @exampleResponse With `select()`
  * ```json
  *   {
  *     "data": [
  *       {
  *         "id": 1,
  *         "name": "null"
  *       }
  *     ],
  *     "status": 200,
  *     "statusText": "OK"
  *   }
  *
  * ```
  */
  not(t, e, r) {
    return this.url.searchParams.append(t, `not.${e}.${r}`), this;
  }
  /**
  * Match only rows which satisfy at least one of the filters.
  *
  * Unlike most filters, `filters` is used as-is and needs to follow [PostgREST
  * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
  * to make sure it's properly sanitized.
  *
  * It's currently not possible to do an `.or()` filter across multiple tables.
  *
  * @param filters - The filters to use, following PostgREST syntax
  * @param options - Named parameters
  * @param options.referencedTable - Set this to filter on referenced tables
  * instead of the parent table
  * @param options.foreignTable - Deprecated, use `referencedTable` instead
  *
  * @category Database
  * @subcategory Using filters
  *
  * @remarks
  * or() expects you to use the raw PostgREST syntax for the filter names and values.
  *
  * ```ts
  * .or('id.in.(5,6,7), arraycol.cs.{"a","b"}')  // Use `()` for `in` filter, `{}` for array values and `cs` for `contains()`.
  * .or('id.in.(5,6,7), arraycol.cd.{"a","b"}')  // Use `cd` for `containedBy()`
  * ```
  *
  * @example With `select()`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select('name')
  *   .or('id.eq.2,name.eq.Han')
  * ```
  *
  * @exampleSql With `select()`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse With `select()`
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "Leia"
  *     },
  *     {
  *       "name": "Han"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @example Use `or` with `and`
  * ```ts
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select('name')
  *   .or('id.gt.3,and(id.eq.1,name.eq.Luke)')
  * ```
  *
  * @exampleSql Use `or` with `and`
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse Use `or` with `and`
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "Luke"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @example Use `or` on referenced tables
  * ```ts
  * const { data, error } = await supabase
  *   .from('orchestral_sections')
  *   .select(`
  *     name,
  *     instruments!inner (
  *       name
  *     )
  *   `)
  *   .or('section_id.eq.1,name.eq.guzheng', { referencedTable: 'instruments' })
  * ```
  *
  * @exampleSql Use `or` on referenced tables
  * ```sql
  * create table
  *   orchestral_sections (id int8 primary key, name text);
  * create table
  *   instruments (
  *     id int8 primary key,
  *     section_id int8 not null references orchestral_sections,
  *     name text
  *   );
  *
  * insert into
  *   orchestral_sections (id, name)
  * values
  *   (1, 'strings'),
  *   (2, 'woodwinds');
  * insert into
  *   instruments (id, section_id, name)
  * values
  *   (1, 2, 'flute'),
  *   (2, 1, 'violin');
  * ```
  *
  * @exampleResponse Use `or` on referenced tables
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "strings",
  *       "instruments": [
  *         {
  *           "name": "violin"
  *         }
  *       ]
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  or(t, { foreignTable: e, referencedTable: r = e } = {}) {
    const n = r ? `${r}.or` : "or";
    return this.url.searchParams.append(n, `(${t})`), this;
  }
  filter(t, e, r) {
    return this.url.searchParams.append(t, `${e}.${r}`), this;
  }
}, Ao = class {
  /**
  * Creates a query builder scoped to a Postgres table or view.
  *
  * @category Database
  *
  * @param url - The URL for the query
  * @param options - Named parameters
  * @param options.headers - Custom headers
  * @param options.schema - Postgres schema to use
  * @param options.fetch - Custom fetch implementation
  * @param options.urlLengthLimit - Maximum URL length before warning
  * @param options.retry - Enable automatic retries for transient errors (default: true)
  *
  * @example Using supabase-js (recommended)
  * ```ts
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
  * const { data, error } = await supabase.from('users').select('*')
  * ```
  *
  * @example Standalone import for bundle-sensitive environments
  * ```ts
  * import { PostgrestQueryBuilder } from '@supabase/postgrest-js'
  *
  * const query = new PostgrestQueryBuilder(
  *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
  *   { headers: { apikey: 'your-publishable-key' }, retry: true }
  * )
  * ```
  */
  constructor(t, { headers: e = {}, schema: r, fetch: n, urlLengthLimit: s = 8e3, retry: i }) {
    this.url = t, this.headers = new Headers(e), this.schema = r, this.fetch = n, this.urlLengthLimit = s, this.retry = i;
  }
  /**
  * Clone URL and headers to prevent shared state between operations.
  */
  cloneRequestState() {
    return {
      url: new URL(this.url.toString()),
      headers: new Headers(this.headers)
    };
  }
  /**
  * Perform a SELECT query on the table or view.
  *
  * @param columns - The columns to retrieve, separated by commas. Columns can be renamed when returned with `customName:columnName`
  *
  * @param options - Named parameters
  *
  * @param options.head - When set to `true`, `data` will not be returned.
  * Useful if you only need the count.
  *
  * @param options.count - Count algorithm to use to count rows in the table or view.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @remarks
  * When using `count` with `.range()` or `.limit()`, the returned `count` is the total number of rows
  * that match your filters, not the number of rows in the current page. Use this to build pagination UI.
  
  * - By default, Supabase projects return a maximum of 1,000 rows. This setting can be changed in your project's [API settings](/dashboard/project/_/settings/api). It's recommended that you keep it low to limit the payload size of accidental or malicious requests. You can use `range()` queries to paginate through your data.
  * - `select()` can be combined with [Filters](/docs/reference/javascript/using-filters)
  * - `select()` can be combined with [Modifiers](/docs/reference/javascript/using-modifiers)
  * - `apikey` is a reserved keyword if you're using the [Supabase Platform](/docs/guides/platform) and [should be avoided as a column name](https://github.com/supabase/supabase/issues/5465). *
  * @category Database
  *
  * @example Getting your data
  * ```js
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select()
  * ```
  *
  * @exampleSql Getting your data
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Harry'),
  *   (2, 'Frodo'),
  *   (3, 'Katniss');
  * ```
  *
  * @exampleResponse Getting your data
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Harry"
  *     },
  *     {
  *       "id": 2,
  *       "name": "Frodo"
  *     },
  *     {
  *       "id": 3,
  *       "name": "Katniss"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Handling errors
  * The most useful field on a Postgres error is usually `hint` — when the database knows the fix, it puts the literal SQL there. For example, a permission-denied error (`code: '42501'`) arrives with a `hint` like `"Grant the required privileges to the current role with: GRANT SELECT ON public.characters TO anon;"`. Log the full `error` object so the hint isn't hidden behind `error.message`.
  *
  * @example Handling errors
  * ```js
  * const { data, error } = await supabase.from('characters').select()
  * if (error) {
  *   // Logs the full error: message, code, details, and hint.
  *   console.error(error)
  *   return
  * }
  * ```
  *
  * @exampleResponse Handling errors
  * ```json
  * {
  *   "error": {
  *     "code": "42501",
  *     "details": null,
  *     "hint": "Grant the required privileges to the current role with: GRANT SELECT ON public.characters TO anon;",
  *     "message": "permission denied for table characters"
  *   },
  *   "status": 401,
  *   "statusText": ""
  * }
  * ```
  *
  * @example Selecting specific columns
  * ```js
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select('name')
  * ```
  *
  * @exampleSql Selecting specific columns
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Frodo'),
  *   (2, 'Harry'),
  *   (3, 'Katniss');
  * ```
  *
  * @exampleResponse Selecting specific columns
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "Frodo"
  *     },
  *     {
  *       "name": "Harry"
  *     },
  *     {
  *       "name": "Katniss"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Query referenced tables
  * If your database has foreign key relationships, you can query related tables too.
  *
  * @example Query referenced tables
  * ```js
  * const { data, error } = await supabase
  *   .from('orchestral_sections')
  *   .select(`
  *     name,
  *     instruments (
  *       name
  *     )
  *   `)
  * ```
  *
  * @exampleSql Query referenced tables
  * ```sql
  * create table
  *   orchestral_sections (id int8 primary key, name text);
  * create table
  *   instruments (
  *     id int8 primary key,
  *     section_id int8 not null references orchestral_sections,
  *     name text
  *   );
  *
  * insert into
  *   orchestral_sections (id, name)
  * values
  *   (1, 'strings'),
  *   (2, 'woodwinds');
  * insert into
  *   instruments (id, section_id, name)
  * values
  *   (1, 2, 'flute'),
  *   (2, 1, 'violin');
  * ```
  *
  * @exampleResponse Query referenced tables
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "strings",
  *       "instruments": [
  *         {
  *           "name": "violin"
  *         }
  *       ]
  *     },
  *     {
  *       "name": "woodwinds",
  *       "instruments": [
  *         {
  *           "name": "flute"
  *         }
  *       ]
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Query referenced tables with spaces in their names
  * If your table name contains spaces, you must use double quotes in the `select` statement to reference the table.
  *
  * @example Query referenced tables with spaces in their names
  * ```js
  * const { data, error } = await supabase
  *   .from('orchestral sections')
  *   .select(`
  *     name,
  *     "musical instruments" (
  *       name
  *     )
  *   `)
  * ```
  *
  * @exampleSql Query referenced tables with spaces in their names
  * ```sql
  * create table
  *   "orchestral sections" (id int8 primary key, name text);
  * create table
  *   "musical instruments" (
  *     id int8 primary key,
  *     section_id int8 not null references "orchestral sections",
  *     name text
  *   );
  *
  * insert into
  *   "orchestral sections" (id, name)
  * values
  *   (1, 'strings'),
  *   (2, 'woodwinds');
  * insert into
  *   "musical instruments" (id, section_id, name)
  * values
  *   (1, 2, 'flute'),
  *   (2, 1, 'violin');
  * ```
  *
  * @exampleResponse Query referenced tables with spaces in their names
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "strings",
  *       "musical instruments": [
  *         {
  *           "name": "violin"
  *         }
  *       ]
  *     },
  *     {
  *       "name": "woodwinds",
  *       "musical instruments": [
  *         {
  *           "name": "flute"
  *         }
  *       ]
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Query referenced tables through a join table
  * If you're in a situation where your tables are **NOT** directly
  * related, but instead are joined by a _join table_, you can still use
  * the `select()` method to query the related data. The join table needs
  * to have the foreign keys as part of its composite primary key.
  *
  * @example Query referenced tables through a join table
  * ```ts
  * const { data, error } = await supabase
  *   .from('users')
  *   .select(`
  *     name,
  *     teams (
  *       name
  *     )
  *   `)
  *   
  * ```
  *
  * @exampleSql Query referenced tables through a join table
  * ```sql
  * create table
  *   users (
  *     id int8 primary key,
  *     name text
  *   );
  * create table
  *   teams (
  *     id int8 primary key,
  *     name text
  *   );
  * -- join table
  * create table
  *   users_teams (
  *     user_id int8 not null references users,
  *     team_id int8 not null references teams,
  *     -- both foreign keys must be part of a composite primary key
  *     primary key (user_id, team_id)
  *   );
  *
  * insert into
  *   users (id, name)
  * values
  *   (1, 'Kiran'),
  *   (2, 'Evan');
  * insert into
  *   teams (id, name)
  * values
  *   (1, 'Green'),
  *   (2, 'Blue');
  * insert into
  *   users_teams (user_id, team_id)
  * values
  *   (1, 1),
  *   (1, 2),
  *   (2, 2);
  * ```
  *
  * @exampleResponse Query referenced tables through a join table
  * ```json
  *   {
  *     "data": [
  *       {
  *         "name": "Kiran",
  *         "teams": [
  *           {
  *             "name": "Green"
  *           },
  *           {
  *             "name": "Blue"
  *           }
  *         ]
  *       },
  *       {
  *         "name": "Evan",
  *         "teams": [
  *           {
  *             "name": "Blue"
  *           }
  *         ]
  *       }
  *     ],
  *     "status": 200,
  *     "statusText": "OK"
  *   }
  *   
  * ```
  *
  * @exampleDescription Query the same referenced table multiple times
  * If you need to query the same referenced table twice, use the name of the
  * joined column to identify which join to use. You can also give each
  * column an alias.
  *
  * @example Query the same referenced table multiple times
  * ```ts
  * const { data, error } = await supabase
  *   .from('messages')
  *   .select(`
  *     content,
  *     from:sender_id(name),
  *     to:receiver_id(name)
  *   `)
  *
  * // To infer types, use the name of the table (in this case `users`) and
  * // the name of the foreign key constraint.
  * const { data, error } = await supabase
  *   .from('messages')
  *   .select(`
  *     content,
  *     from:users!messages_sender_id_fkey(name),
  *     to:users!messages_receiver_id_fkey(name)
  *   `)
  * ```
  *
  * @exampleSql Query the same referenced table multiple times
  * ```sql
  *  create table
  *  users (id int8 primary key, name text);
  *
  *  create table
  *    messages (
  *      sender_id int8 not null references users,
  *      receiver_id int8 not null references users,
  *      content text
  *    );
  *
  *  insert into
  *    users (id, name)
  *  values
  *    (1, 'Kiran'),
  *    (2, 'Evan');
  *
  *  insert into
  *    messages (sender_id, receiver_id, content)
  *  values
  *    (1, 2, '👋');
  *  ```
  * ```
  *
  * @exampleResponse Query the same referenced table multiple times
  * ```json
  * {
  *   "data": [
  *     {
  *       "content": "👋",
  *       "from": {
  *         "name": "Kiran"
  *       },
  *       "to": {
  *         "name": "Evan"
  *       }
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Query nested foreign tables through a join table
  * You can use the result of a joined table to gather data in
  * another foreign table. With multiple references to the same foreign
  * table you must specify the column on which to conduct the join.
  *
  * @example Query nested foreign tables through a join table
  * ```ts
  *   const { data, error } = await supabase
  *     .from('games')
  *     .select(`
  *       game_id:id,
  *       away_team:teams!games_away_team_fkey (
  *         users (
  *           id,
  *           name
  *         )
  *       )
  *     `)
  *   
  * ```
  *
  * @exampleSql Query nested foreign tables through a join table
  * ```sql
  * ```sql
  * create table
  *   users (
  *     id int8 primary key,
  *     name text
  *   );
  * create table
  *   teams (
  *     id int8 primary key,
  *     name text
  *   );
  * -- join table
  * create table
  *   users_teams (
  *     user_id int8 not null references users,
  *     team_id int8 not null references teams,
  *
  *     primary key (user_id, team_id)
  *   );
  * create table
  *   games (
  *     id int8 primary key,
  *     home_team int8 not null references teams,
  *     away_team int8 not null references teams,
  *     name text
  *   );
  *
  * insert into users (id, name)
  * values
  *   (1, 'Kiran'),
  *   (2, 'Evan');
  * insert into
  *   teams (id, name)
  * values
  *   (1, 'Green'),
  *   (2, 'Blue');
  * insert into
  *   users_teams (user_id, team_id)
  * values
  *   (1, 1),
  *   (1, 2),
  *   (2, 2);
  * insert into
  *   games (id, home_team, away_team, name)
  * values
  *   (1, 1, 2, 'Green vs Blue'),
  *   (2, 2, 1, 'Blue vs Green');
  * ```
  *
  * @exampleResponse Query nested foreign tables through a join table
  * ```json
  *   {
  *     "data": [
  *       {
  *         "game_id": 1,
  *         "away_team": {
  *           "users": [
  *             {
  *               "id": 1,
  *               "name": "Kiran"
  *             },
  *             {
  *               "id": 2,
  *               "name": "Evan"
  *             }
  *           ]
  *         }
  *       },
  *       {
  *         "game_id": 2,
  *         "away_team": {
  *           "users": [
  *             {
  *               "id": 1,
  *               "name": "Kiran"
  *             }
  *           ]
  *         }
  *       }
  *     ],
  *     "status": 200,
  *     "statusText": "OK"
  *   }
  *   
  * ```
  *
  * @exampleDescription Filtering through referenced tables
  * If the filter on a referenced table's column is not satisfied, the referenced
  * table returns `[]` or `null` but the parent table is not filtered out.
  * If you want to filter out the parent table rows, use the `!inner` hint
  *
  * @example Filtering through referenced tables
  * ```ts
  * const { data, error } = await supabase
  *   .from('instruments')
  *   .select('name, orchestral_sections(*)')
  *   .eq('orchestral_sections.name', 'percussion')
  * ```
  *
  * @exampleSql Filtering through referenced tables
  * ```sql
  * create table
  *   orchestral_sections (id int8 primary key, name text);
  * create table
  *   instruments (
  *     id int8 primary key,
  *     section_id int8 not null references orchestral_sections,
  *     name text
  *   );
  *
  * insert into
  *   orchestral_sections (id, name)
  * values
  *   (1, 'strings'),
  *   (2, 'woodwinds');
  * insert into
  *   instruments (id, section_id, name)
  * values
  *   (1, 2, 'flute'),
  *   (2, 1, 'violin');
  * ```
  *
  * @exampleResponse Filtering through referenced tables
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "flute",
  *       "orchestral_sections": null
  *     },
  *     {
  *       "name": "violin",
  *       "orchestral_sections": null
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Querying referenced table with count
  * You can get the number of rows in a related table by using the
  * **count** property.
  *
  * @example Querying referenced table with count
  * ```ts
  * const { data, error } = await supabase
  *   .from('orchestral_sections')
  *   .select(`*, instruments(count)`)
  * ```
  *
  * @exampleSql Querying referenced table with count
  * ```sql
  * create table orchestral_sections (
  *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
  *   "name" text
  * );
  *
  * create table characters (
  *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
  *   "name" text,
  *   "section_id" "uuid" references public.orchestral_sections on delete cascade
  * );
  *
  * with section as (
  *   insert into orchestral_sections (name)
  *   values ('strings') returning id
  * )
  * insert into instruments (name, section_id) values
  * ('violin', (select id from section)),
  * ('viola', (select id from section)),
  * ('cello', (select id from section)),
  * ('double bass', (select id from section));
  * ```
  *
  * @exampleResponse Querying referenced table with count
  * ```json
  * [
  *   {
  *     "id": "693694e7-d993-4360-a6d7-6294e325d9b6",
  *     "name": "strings",
  *     "instruments": [
  *       {
  *         "count": 4
  *       }
  *     ]
  *   }
  * ]
  * ```
  *
  * @exampleDescription Querying with count option
  * You can get the number of rows by using the
  * [count](/docs/reference/javascript/select#parameters) option.
  *
  * @example Querying with count option
  * ```ts
  * const { count, error } = await supabase
  *   .from('characters')
  *   .select('*', { count: 'exact', head: true })
  * ```
  *
  * @exampleSql Querying with count option
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse Querying with count option
  * ```json
  * {
  *   "count": 3,
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Querying JSON data
  * You can select and filter data inside of
  * [JSON](/docs/guides/database/json) columns. Postgres offers some
  * [operators](/docs/guides/database/json#query-the-jsonb-data) for
  * querying JSON data.
  *
  * @example Querying JSON data
  * ```ts
  * const { data, error } = await supabase
  *   .from('users')
  *   .select(`
  *     id, name,
  *     address->city
  *   `)
  * ```
  *
  * @exampleSql Querying JSON data
  * ```sql
  * create table
  *   users (
  *     id int8 primary key,
  *     name text,
  *     address jsonb
  *   );
  *
  * insert into
  *   users (id, name, address)
  * values
  *   (1, 'Frodo', '{"city":"Hobbiton"}');
  * ```
  *
  * @exampleResponse Querying JSON data
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Frodo",
  *       "city": "Hobbiton"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Querying referenced table with inner join
  * If you don't want to return the referenced table contents, you can leave the parenthesis empty.
  * Like `.select('name, orchestral_sections!inner()')`.
  *
  * @example Querying referenced table with inner join
  * ```ts
  * const { data, error } = await supabase
  *   .from('instruments')
  *   .select('name, orchestral_sections!inner(name)')
  *   .eq('orchestral_sections.name', 'woodwinds')
  *   .limit(1)
  * ```
  *
  * @exampleSql Querying referenced table with inner join
  * ```sql
  * create table orchestral_sections (
  *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
  *   "name" text
  * );
  *
  * create table instruments (
  *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
  *   "name" text,
  *   "section_id" "uuid" references public.orchestral_sections on delete cascade
  * );
  *
  * with section as (
  *   insert into orchestral_sections (name)
  *   values ('woodwinds') returning id
  * )
  * insert into instruments (name, section_id) values
  * ('flute', (select id from section)),
  * ('clarinet', (select id from section)),
  * ('bassoon', (select id from section)),
  * ('piccolo', (select id from section));
  * ```
  *
  * @exampleResponse Querying referenced table with inner join
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "flute",
  *       "orchestral_sections": {"name": "woodwinds"}
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Switching schemas per query
  * In addition to setting the schema during initialization, you can also switch schemas on a per-query basis.
  * Make sure you've set up your [database privileges and API settings](/docs/guides/api/using-custom-schemas).
  *
  * @example Switching schemas per query
  * ```ts
  * const { data, error } = await supabase
  *   .schema('myschema')
  *   .from('mytable')
  *   .select()
  * ```
  *
  * @exampleSql Switching schemas per query
  * ```sql
  * create schema myschema;
  *
  * create table myschema.mytable (
  *   id uuid primary key default gen_random_uuid(),
  *   data text
  * );
  *
  * insert into myschema.mytable (data) values ('mydata');
  * ```
  *
  * @exampleResponse Switching schemas per query
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": "4162e008-27b0-4c0f-82dc-ccaeee9a624d",
  *       "data": "mydata"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  select(t, e) {
    const { head: r = !1, count: n } = e ?? {}, s = r ? "HEAD" : "GET";
    let i = !1;
    const o = (t ?? "*").split("").map((c) => /\s/.test(c) && !i ? "" : (c === '"' && (i = !i), c)).join(""), { url: a, headers: l } = this.cloneRequestState();
    return a.searchParams.set("select", o), n && l.append("Prefer", `count=${n}`), new Je({
      method: s,
      url: a,
      headers: l,
      schema: this.schema,
      fetch: this.fetch,
      urlLengthLimit: this.urlLengthLimit,
      retry: this.retry
    });
  }
  /**
  * Perform an INSERT into the table or view.
  *
  * By default, inserted rows are not returned. To return it, chain the call
  * with `.select()`.
  *
  * @param values - The values to insert. Pass an object to insert a single row
  * or an array to insert multiple rows.
  *
  * @param options - Named parameters
  *
  * @param options.count - Count algorithm to use to count inserted rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @param options.defaultToNull - Make missing fields default to `null`.
  * Otherwise, use the default value for the column. Only applies for bulk
  * inserts.
  *
  * @category Database
  *
  * @example Create a record
  * ```ts
  * const { error } = await supabase
  *   .from('countries')
  *   .insert({ id: 1, name: 'Mordor' })
  * ```
  *
  * @exampleSql Create a record
  * ```sql
  * create table
  *   countries (id int8 primary key, name text);
  * ```
  *
  * @exampleResponse Create a record
  * ```json
  * {
  *   "status": 201,
  *   "statusText": ""
  * }
  * ```
  *
  * @exampleDescription Handling errors
  * `error.hint` from Postgres often contains the actionable fix (e.g. `"Grant the required privileges to the current role with: GRANT INSERT ON public.countries TO anon;"` for a `42501` permission-denied error). Log the full `error` object so it isn't hidden behind `error.message`.
  *
  * @example Handling errors
  * ```js
  * const { error } = await supabase.from('countries').insert({ id: 1, name: 'Mordor' })
  * if (error) console.error(error)
  * ```
  *
  * @example Create a record and return it
  * ```ts
  * const { data, error } = await supabase
  *   .from('countries')
  *   .insert({ id: 1, name: 'Mordor' })
  *   .select()
  * ```
  *
  * @exampleSql Create a record and return it
  * ```sql
  * create table
  *   countries (id int8 primary key, name text);
  * ```
  *
  * @exampleResponse Create a record and return it
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Mordor"
  *     }
  *   ],
  *   "status": 201,
  *   "statusText": ""
  * }
  * ```
  *
  * @exampleDescription Bulk create
  * A bulk create operation is handled in a single transaction.
  * If any of the inserts fail, none of the rows are inserted.
  *
  * @example Bulk create
  * ```ts
  * const { error } = await supabase
  *   .from('countries')
  *   .insert([
  *     { id: 1, name: 'Mordor' },
  *     { id: 1, name: 'The Shire' },
  *   ])
  * ```
  *
  * @exampleSql Bulk create
  * ```sql
  * create table
  *   countries (id int8 primary key, name text);
  * ```
  *
  * @exampleResponse Bulk create
  * ```json
  * {
  *   "error": {
  *     "code": "23505",
  *     "details": "Key (id)=(1) already exists.",
  *     "hint": null,
  *     "message": "duplicate key value violates unique constraint \"countries_pkey\""
  *   },
  *   "status": 409,
  *   "statusText": ""
  * }
  * ```
  */
  insert(t, { count: e, defaultToNull: r = !0 } = {}) {
    var n;
    const s = "POST", { url: i, headers: o } = this.cloneRequestState();
    if (e && o.append("Prefer", `count=${e}`), r || o.append("Prefer", "missing=default"), Array.isArray(t)) {
      const a = t.reduce((l, c) => l.concat(Object.keys(c)), []);
      if (a.length > 0) {
        const l = [...new Set(a)].map((c) => `"${c}"`);
        i.searchParams.set("columns", l.join(","));
      }
    }
    return new Je({
      method: s,
      url: i,
      headers: o,
      schema: this.schema,
      body: t,
      fetch: (n = this.fetch) !== null && n !== void 0 ? n : fetch,
      urlLengthLimit: this.urlLengthLimit,
      retry: this.retry
    });
  }
  /**
  * Perform an UPSERT on the table or view. Depending on the column(s) passed
  * to `onConflict`, `.upsert()` allows you to perform the equivalent of
  * `.insert()` if a row with the corresponding `onConflict` columns doesn't
  * exist, or if it does exist, perform an alternative action depending on
  * `ignoreDuplicates`.
  *
  * By default, upserted rows are not returned. To return it, chain the call
  * with `.select()`.
  *
  * @param values - The values to upsert with. Pass an object to upsert a
  * single row or an array to upsert multiple rows.
  *
  * @param options - Named parameters
  *
  * @param options.onConflict - Comma-separated UNIQUE column(s) to specify how
  * duplicate rows are determined. Two rows are duplicates if all the
  * `onConflict` columns are equal.
  *
  * @param options.ignoreDuplicates - If `true`, duplicate rows are ignored. If
  * `false`, duplicate rows are merged with existing rows.
  *
  * @param options.count - Count algorithm to use to count upserted rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @param options.defaultToNull - Make missing fields default to `null`.
  * Otherwise, use the default value for the column. This only applies when
  * inserting new rows, not when merging with existing rows under
  * `ignoreDuplicates: false`. This also only applies when doing bulk upserts.
  *
  * @example Upsert a single row using a unique key
  * ```ts
  * // Upserting a single row, overwriting based on the 'username' unique column
  * const { data, error } = await supabase
  *   .from('users')
  *   .upsert({ username: 'supabot' }, { onConflict: 'username' })
  *
  * // Example response:
  * // {
  * //   data: [
  * //     { id: 4, message: 'bar', username: 'supabot' }
  * //   ],
  * //   error: null
  * // }
  * ```
  *
  * @example Upsert with conflict resolution and exact row counting
  * ```ts
  * // Upserting and returning exact count
  * const { data, error, count } = await supabase
  *   .from('users')
  *   .upsert(
  *     {
  *       id: 3,
  *       message: 'foo',
  *       username: 'supabot'
  *     },
  *     {
  *       onConflict: 'username',
  *       count: 'exact'
  *     }
  *   )
  *
  * // Example response:
  * // {
  * //   data: [
  * //     {
  * //       id: 42,
  * //       handle: "saoirse",
  * //       display_name: "Saoirse"
  * //     }
  * //   ],
  * //   count: 1,
  * //   error: null
  * // }
  * ```
  *
  * @category Database
  *
  * @remarks
  * - Primary keys must be included in `values` to use upsert.
  *
  * @example Upsert your data
  * ```ts
  * const { data, error } = await supabase
  *   .from('instruments')
  *   .upsert({ id: 1, name: 'piano' })
  *   .select()
  * ```
  *
  * @exampleSql Upsert your data
  * ```sql
  * create table
  *   instruments (id int8 primary key, name text);
  *
  * insert into
  *   instruments (id, name)
  * values
  *   (1, 'harpsichord');
  * ```
  *
  * @exampleResponse Upsert your data
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "piano"
  *     }
  *   ],
  *   "status": 201,
  *   "statusText": ""
  * }
  * ```
  *
  * @exampleDescription Handling errors
  * `error.hint` from Postgres often contains the actionable fix (e.g. `"Grant the required privileges to the current role with: GRANT INSERT, UPDATE ON public.instruments TO anon;"` for a `42501` permission-denied error). Log the full `error` object so it isn't hidden behind `error.message`.
  *
  * @example Handling errors
  * ```js
  * const { data, error } = await supabase.from('instruments').upsert({ id: 1, name: 'piano' }).select()
  * if (error) console.error(error)
  * ```
  *
  * @example Bulk Upsert your data
  * ```ts
  * const { data, error } = await supabase
  *   .from('instruments')
  *   .upsert([
  *     { id: 1, name: 'piano' },
  *     { id: 2, name: 'harp' },
  *   ])
  *   .select()
  * ```
  *
  * @exampleSql Bulk Upsert your data
  * ```sql
  * create table
  *   instruments (id int8 primary key, name text);
  *
  * insert into
  *   instruments (id, name)
  * values
  *   (1, 'harpsichord');
  * ```
  *
  * @exampleResponse Bulk Upsert your data
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "piano"
  *     },
  *     {
  *       "id": 2,
  *       "name": "harp"
  *     }
  *   ],
  *   "status": 201,
  *   "statusText": ""
  * }
  * ```
  *
  * @exampleDescription Upserting into tables with constraints
  * In the following query, `upsert()` implicitly uses the `id`
  * (primary key) column to determine conflicts. If there is no existing
  * row with the same `id`, `upsert()` inserts a new row, which
  * will fail in this case as there is already a row with `handle` `"saoirse"`.
  * Using the `onConflict` option, you can instruct `upsert()` to use
  * another column with a unique constraint to determine conflicts.
  *
  * @example Upserting into tables with constraints
  * ```ts
  * const { data, error } = await supabase
  *   .from('users')
  *   .upsert({ id: 42, handle: 'saoirse', display_name: 'Saoirse' })
  *   .select()
  * ```
  *
  * @exampleSql Upserting into tables with constraints
  * ```sql
  * create table
  *   users (
  *     id int8 generated by default as identity primary key,
  *     handle text not null unique,
  *     display_name text
  *   );
  *
  * insert into
  *   users (id, handle, display_name)
  * values
  *   (1, 'saoirse', null);
  * ```
  *
  * @exampleResponse Upserting into tables with constraints
  * ```json
  * {
  *   "error": {
  *     "code": "23505",
  *     "details": "Key (handle)=(saoirse) already exists.",
  *     "hint": null,
  *     "message": "duplicate key value violates unique constraint \"users_handle_key\""
  *   },
  *   "status": 409,
  *   "statusText": ""
  * }
  * ```
  */
  upsert(t, { onConflict: e, ignoreDuplicates: r = !1, count: n, defaultToNull: s = !0 } = {}) {
    var i;
    const o = "POST", { url: a, headers: l } = this.cloneRequestState();
    if (l.append("Prefer", `resolution=${r ? "ignore" : "merge"}-duplicates`), e !== void 0 && a.searchParams.set("on_conflict", e), n && l.append("Prefer", `count=${n}`), s || l.append("Prefer", "missing=default"), Array.isArray(t)) {
      const c = t.reduce((u, d) => u.concat(Object.keys(d)), []);
      if (c.length > 0) {
        const u = [...new Set(c)].map((d) => `"${d}"`);
        a.searchParams.set("columns", u.join(","));
      }
    }
    return new Je({
      method: o,
      url: a,
      headers: l,
      schema: this.schema,
      body: t,
      fetch: (i = this.fetch) !== null && i !== void 0 ? i : fetch,
      urlLengthLimit: this.urlLengthLimit,
      retry: this.retry
    });
  }
  /**
  * Perform an UPDATE on the table or view.
  *
  * By default, updated rows are not returned. To return it, chain the call
  * with `.select()` after filters.
  *
  * @param values - The values to update with
  *
  * @param options - Named parameters
  *
  * @param options.count - Count algorithm to use to count updated rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @category Database
  *
  * @remarks
  * - `update()` should always be combined with [Filters](/docs/reference/javascript/using-filters) to target the item(s) you wish to update.
  *
  * @example Updating your data
  * ```ts
  * const { error } = await supabase
  *   .from('instruments')
  *   .update({ name: 'piano' })
  *   .eq('id', 1)
  * ```
  *
  * @exampleSql Updating your data
  * ```sql
  * create table
  *   instruments (id int8 primary key, name text);
  *
  * insert into
  *   instruments (id, name)
  * values
  *   (1, 'harpsichord');
  * ```
  *
  * @exampleResponse Updating your data
  * ```json
  * {
  *   "status": 204,
  *   "statusText": ""
  * }
  * ```
  *
  * @exampleDescription Handling errors
  * `error.hint` from Postgres often contains the actionable fix (e.g. `"Grant the required privileges to the current role with: GRANT UPDATE ON public.instruments TO anon;"` for a `42501` permission-denied error). Log the full `error` object so it isn't hidden behind `error.message`.
  *
  * @example Handling errors
  * ```js
  * const { error } = await supabase.from('instruments').update({ name: 'piano' }).eq('id', 1)
  * if (error) console.error(error)
  * ```
  *
  * @example Update a record and return it
  * ```ts
  * const { data, error } = await supabase
  *   .from('instruments')
  *   .update({ name: 'piano' })
  *   .eq('id', 1)
  *   .select()
  * ```
  *
  * @exampleSql Update a record and return it
  * ```sql
  * create table
  *   instruments (id int8 primary key, name text);
  *
  * insert into
  *   instruments (id, name)
  * values
  *   (1, 'harpsichord');
  * ```
  *
  * @exampleResponse Update a record and return it
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "piano"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Updating JSON data
  * Postgres offers some
  * [operators](/docs/guides/database/json#query-the-jsonb-data) for
  * working with JSON data. Currently, it is only possible to update the entire JSON document.
  *
  * @example Updating JSON data
  * ```ts
  * const { data, error } = await supabase
  *   .from('users')
  *   .update({
  *     address: {
  *       street: 'Melrose Place',
  *       postcode: 90210
  *     }
  *   })
  *   .eq('address->postcode', 90210)
  *   .select()
  * ```
  *
  * @exampleSql Updating JSON data
  * ```sql
  * create table
  *   users (
  *     id int8 primary key,
  *     name text,
  *     address jsonb
  *   );
  *
  * insert into
  *   users (id, name, address)
  * values
  *   (1, 'Michael', '{ "postcode": 90210 }');
  * ```
  *
  * @exampleResponse Updating JSON data
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Michael",
  *       "address": {
  *         "street": "Melrose Place",
  *         "postcode": 90210
  *       }
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  update(t, { count: e } = {}) {
    var r;
    const n = "PATCH", { url: s, headers: i } = this.cloneRequestState();
    return e && i.append("Prefer", `count=${e}`), new Je({
      method: n,
      url: s,
      headers: i,
      schema: this.schema,
      body: t,
      fetch: (r = this.fetch) !== null && r !== void 0 ? r : fetch,
      urlLengthLimit: this.urlLengthLimit,
      retry: this.retry
    });
  }
  /**
  * Perform a DELETE on the table or view.
  *
  * By default, deleted rows are not returned. To return it, chain the call
  * with `.select()` after filters.
  *
  * @param options - Named parameters
  *
  * @param options.count - Count algorithm to use to count deleted rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @category Database
  *
  * @remarks
  * - `delete()` should always be combined with [filters](/docs/reference/javascript/using-filters) to target the item(s) you wish to delete.
  * - If you use `delete()` with filters and you have
  *   [RLS](/docs/learn/auth-deep-dive/auth-row-level-security) enabled, only
  *   rows visible through `SELECT` policies are deleted. Note that by default
  *   no rows are visible, so you need at least one `SELECT`/`ALL` policy that
  *   makes the rows visible.
  * - When using `delete().in()`, specify an array of values to target multiple rows with a single query. This is particularly useful for batch deleting entries that share common criteria, such as deleting users by their IDs. Ensure that the array you provide accurately represents all records you intend to delete to avoid unintended data removal.
  *
  * @example Delete a single record
  * ```ts
  * const response = await supabase
  *   .from('countries')
  *   .delete()
  *   .eq('id', 1)
  * ```
  *
  * @exampleSql Delete a single record
  * ```sql
  * create table
  *   countries (id int8 primary key, name text);
  *
  * insert into
  *   countries (id, name)
  * values
  *   (1, 'Mordor');
  * ```
  *
  * @exampleResponse Delete a single record
  * ```json
  * {
  *   "status": 204,
  *   "statusText": ""
  * }
  * ```
  *
  * @exampleDescription Handling errors
  * `error.hint` from Postgres often contains the actionable fix (e.g. `"Grant the required privileges to the current role with: GRANT DELETE ON public.countries TO anon;"` for a `42501` permission-denied error). Log the full `error` object so it isn't hidden behind `error.message`.
  *
  * @example Handling errors
  * ```js
  * const { error } = await supabase.from('countries').delete().eq('id', 1)
  * if (error) console.error(error)
  * ```
  *
  * @example Delete a record and return it
  * ```ts
  * const { data, error } = await supabase
  *   .from('countries')
  *   .delete()
  *   .eq('id', 1)
  *   .select()
  * ```
  *
  * @exampleSql Delete a record and return it
  * ```sql
  * create table
  *   countries (id int8 primary key, name text);
  *
  * insert into
  *   countries (id, name)
  * values
  *   (1, 'Mordor');
  * ```
  *
  * @exampleResponse Delete a record and return it
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Mordor"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @example Delete multiple records
  * ```ts
  * const response = await supabase
  *   .from('countries')
  *   .delete()
  *   .in('id', [1, 2, 3])
  * ```
  *
  * @exampleSql Delete multiple records
  * ```sql
  * create table
  *   countries (id int8 primary key, name text);
  *
  * insert into
  *   countries (id, name)
  * values
  *   (1, 'Rohan'), (2, 'The Shire'), (3, 'Mordor');
  * ```
  *
  * @exampleResponse Delete multiple records
  * ```json
  * {
  *   "status": 204,
  *   "statusText": ""
  * }
  * ```
  */
  delete({ count: t } = {}) {
    var e;
    const r = "DELETE", { url: n, headers: s } = this.cloneRequestState();
    return t && s.append("Prefer", `count=${t}`), new Je({
      method: r,
      url: n,
      headers: s,
      schema: this.schema,
      fetch: (e = this.fetch) !== null && e !== void 0 ? e : fetch,
      urlLengthLimit: this.urlLengthLimit,
      retry: this.retry
    });
  }
};
function To(t, e) {
  try {
    const o = JSON.parse(t);
    if (o && typeof o == "object" && !Array.isArray(o)) {
      var r, n, s, i;
      return new Xe({
        message: String((r = o.message) !== null && r !== void 0 ? r : t),
        details: (n = o.details) !== null && n !== void 0 ? n : "",
        hint: (s = o.hint) !== null && s !== void 0 ? s : "",
        code: (i = o.code) !== null && i !== void 0 ? i : ""
      });
    }
  } catch {
  }
  return new Xe({
    message: t || e,
    details: "",
    hint: "",
    code: ""
  });
}
function Bn(t, e, r) {
  var n;
  const s = t;
  return {
    success: !1,
    error: new Xe({
      message: `${(n = s == null ? void 0 : s.name) !== null && n !== void 0 ? n : "FetchError"}: ${s == null ? void 0 : s.message}`,
      details: "",
      hint: "",
      code: ""
    }),
    data: null,
    count: null,
    status: e,
    statusText: r
  };
}
var Ro = class di {
  /**
  * Creates a PostgREST client.
  *
  * @param url - URL of the PostgREST endpoint
  * @param options - Named parameters
  * @param options.headers - Custom headers
  * @param options.schema - Postgres schema to switch to
  * @param options.fetch - Custom fetch
  * @param options.timeout - Optional timeout in milliseconds for all requests. When set, requests will automatically abort after this duration to prevent indefinite hangs.
  * @param options.urlLengthLimit - Maximum URL length in characters before warnings/errors are triggered. Defaults to 8000.
  * @param options.retry - Enable or disable automatic retries for transient errors.
  *   When enabled, idempotent requests (GET, HEAD, OPTIONS) that fail with network
  *   errors or HTTP 503/520 responses will be automatically retried up to 3 times
  *   with exponential backoff (1s, 2s, 4s). Defaults to `true`.
  * @example Using supabase-js (recommended)
  * ```ts
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
  * const { data, error } = await supabase.from('profiles').select('*')
  * ```
  *
  * @category Database
  *
  * @remarks
  * - A `timeout` option (in milliseconds) can be set to automatically abort requests that take too long.
  * - A `urlLengthLimit` option (default: 8000) can be set to control when URL length warnings are included in error messages for aborted requests.
  *
  * @example Standalone import for bundle-sensitive environments
  * ```ts
  * import { PostgrestClient } from '@supabase/postgrest-js'
  *
  * const postgrest = new PostgrestClient('https://xyzcompany.supabase.co/rest/v1', {
  *   headers: { apikey: 'your-publishable-key' },
  *   schema: 'public',
  *   timeout: 30000, // 30 second timeout
  * })
  * ```
  */
  constructor(e, { headers: r = {}, schema: n, fetch: s, timeout: i, urlLengthLimit: o = 8e3, retry: a } = {}) {
    this.url = e, this.headers = new Headers(r), this.schemaName = n, this.urlLengthLimit = o;
    const l = s ?? globalThis.fetch;
    i !== void 0 && i > 0 ? this.fetch = (c, u) => {
      const d = new AbortController(), p = setTimeout(() => d.abort(), i), h = u == null ? void 0 : u.signal;
      if (h) {
        if (h.aborted)
          return clearTimeout(p), l(c, u);
        const f = () => {
          clearTimeout(p), d.abort();
        };
        return h.addEventListener("abort", f, { once: !0 }), l(c, $e($e({}, u), {}, { signal: d.signal })).finally(() => {
          clearTimeout(p), h.removeEventListener("abort", f);
        });
      }
      return l(c, $e($e({}, u), {}, { signal: d.signal })).finally(() => clearTimeout(p));
    } : this.fetch = l, this.retry = a;
  }
  from(e) {
    if (!e || typeof e != "string" || e.trim() === "") throw new Error("Invalid relation name: relation must be a non-empty string.");
    return new Ao(new URL(`${this.url}/${e}`), {
      headers: new Headers(this.headers),
      schema: this.schemaName,
      fetch: this.fetch,
      urlLengthLimit: this.urlLengthLimit,
      retry: this.retry
    });
  }
  /**
  * Select a schema to query or perform an function (rpc) call.
  *
  * The schema needs to be on the list of exposed schemas inside Supabase.
  *
  * @param schema - The schema to query
  *
  * @category Database
  */
  schema(e) {
    return new di(this.url, {
      headers: this.headers,
      schema: e,
      fetch: this.fetch,
      urlLengthLimit: this.urlLengthLimit,
      retry: this.retry
    });
  }
  /**
  * Fetch the OpenAPI description PostgREST publishes for this client's schema.
  *
  * The document lists only the tables, views and functions the caller's role
  * holds privileges on; PostgREST applies that filtering server-side. The
  * schema is the one this client was created with, so call `.schema()` first
  * to describe a different one. Transient failures are retried according to
  * the client's `retry` option, like any other idempotent request.
  *
  * @example
  * ```ts
  * const { data, error } = await supabase.getOpenApiSpec()
  * ```
  *
  * @example Describe a schema other than the client default
  * ```ts
  * const { data, error } = await supabase.schema('billing').getOpenApiSpec()
  * ```
  *
  * @category Database
  */
  async getOpenApiSpec() {
    var e = this, r;
    const n = new Headers(e.headers);
    n.set("Accept", "application/openapi+json"), e.schemaName && n.set("Accept-Profile", e.schemaName);
    const s = {};
    n.forEach((c, u) => {
      s[u] = c;
    });
    const i = (r = e.fetch) !== null && r !== void 0 ? r : globalThis.fetch;
    let o;
    try {
      var a;
      o = await ui(i, `${e.url}/`, {
        method: "GET",
        headers: s
      }, (a = e.retry) !== null && a !== void 0 ? a : !0);
    } catch (c) {
      return Bn(c, 0, "");
    }
    let l;
    try {
      l = await o.text();
    } catch (c) {
      return Bn(c, o.status, o.statusText);
    }
    if (o.ok) try {
      return {
        success: !0,
        error: null,
        data: JSON.parse(l),
        count: null,
        status: o.status,
        statusText: o.statusText
      };
    } catch {
    }
    return {
      success: !1,
      error: To(l, o.statusText),
      data: null,
      count: null,
      status: o.status,
      statusText: o.statusText
    };
  }
  /**
  * Perform a function call.
  *
  * @param fn - The function name to call
  * @param args - The arguments to pass to the function call
  * @param options - Named parameters
  * @param options.head - When set to `true`, `data` will not be returned.
  * Useful if you only need the count.
  * @param options.get - When set to `true`, the function will be called with
  * read-only access mode.
  * @param options.count - Count algorithm to use to count rows returned by the
  * function. Only applicable for [set-returning
  * functions](https://www.postgresql.org/docs/current/functions-srf.html).
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @example
  * ```ts
  * // For cross-schema functions where type inference fails, use overrideTypes:
  * const { data } = await supabase
  *   .schema('schema_b')
  *   .rpc('function_a', {})
  *   .overrideTypes<{ id: string; user_id: string }[]>()
  * ```
  *
  * @category Database
  *
  * @example Call a Postgres function without arguments
  * ```ts
  * const { data, error } = await supabase.rpc('hello_world')
  * ```
  *
  * @exampleSql Call a Postgres function without arguments
  * ```sql
  * create function hello_world() returns text as $$
  *   select 'Hello world';
  * $$ language sql;
  * ```
  *
  * @exampleResponse Call a Postgres function without arguments
  * ```json
  * {
  *   "data": "Hello world",
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @example Call a Postgres function with arguments
  * ```ts
  * const { data, error } = await supabase.rpc('echo', { say: '👋' })
  * ```
  *
  * @exampleSql Call a Postgres function with arguments
  * ```sql
  * create function echo(say text) returns text as $$
  *   select say;
  * $$ language sql;
  * ```
  *
  * @exampleResponse Call a Postgres function with arguments
  * ```json
  *   {
  *     "data": "👋",
  *     "status": 200,
  *     "statusText": "OK"
  *   }
  *
  * ```
  *
  * @exampleDescription Bulk processing
  * You can process large payloads by passing in an array as an argument.
  *
  * @example Bulk processing
  * ```ts
  * const { data, error } = await supabase.rpc('add_one_each', { arr: [1, 2, 3] })
  * ```
  *
  * @exampleSql Bulk processing
  * ```sql
  * create function add_one_each(arr int[]) returns int[] as $$
  *   select array_agg(n + 1) from unnest(arr) as n;
  * $$ language sql;
  * ```
  *
  * @exampleResponse Bulk processing
  * ```json
  * {
  *   "data": [
  *     2,
  *     3,
  *     4
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Call a Postgres function with filters
  * Postgres functions that return tables can also be combined with [Filters](/docs/reference/javascript/using-filters) and [Modifiers](/docs/reference/javascript/using-modifiers).
  *
  * @example Call a Postgres function with filters
  * ```ts
  * const { data, error } = await supabase
  *   .rpc('list_stored_countries')
  *   .eq('id', 1)
  *   .single()
  * ```
  *
  * @exampleSql Call a Postgres function with filters
  * ```sql
  * create table
  *   countries (id int8 primary key, name text);
  *
  * insert into
  *   countries (id, name)
  * values
  *   (1, 'Rohan'),
  *   (2, 'The Shire');
  *
  * create function list_stored_countries() returns setof countries as $$
  *   select * from countries;
  * $$ language sql;
  * ```
  *
  * @exampleResponse Call a Postgres function with filters
  * ```json
  * {
  *   "data": {
  *     "id": 1,
  *     "name": "Rohan"
  *   },
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @example Call a read-only Postgres function
  * ```ts
  * const { data, error } = await supabase.rpc('hello_world', undefined, { get: true })
  * ```
  *
  * @exampleSql Call a read-only Postgres function
  * ```sql
  * create function hello_world() returns text as $$
  *   select 'Hello world';
  * $$ language sql;
  * ```
  *
  * @exampleResponse Call a read-only Postgres function
  * ```json
  * {
  *   "data": "Hello world",
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  rpc(e, r = {}, { head: n = !1, get: s = !1, count: i } = {}) {
    var o;
    let a;
    const l = new URL(`${this.url}/rpc/${e}`);
    let c;
    const u = (h) => h !== null && typeof h == "object" && (!Array.isArray(h) || h.some(u)), d = n && Object.values(r).some(u);
    d ? (a = "POST", c = r) : n || s ? (a = n ? "HEAD" : "GET", Object.entries(r).filter(([h, f]) => f !== void 0).map(([h, f]) => [h, Array.isArray(f) ? `{${f.join(",")}}` : `${f}`]).forEach(([h, f]) => {
      l.searchParams.append(h, f);
    })) : (a = "POST", c = r);
    const p = new Headers(this.headers);
    return d ? p.set("Prefer", i ? `count=${i},return=minimal` : "return=minimal") : i && p.set("Prefer", `count=${i}`), new Je({
      method: a,
      url: l,
      headers: p,
      schema: this.schemaName,
      body: c,
      fetch: (o = this.fetch) !== null && o !== void 0 ? o : fetch,
      urlLengthLimit: this.urlLengthLimit,
      retry: this.retry
    });
  }
};
class Oo {
  /**
   * Static-only utility – prevent instantiation.
   */
  constructor() {
  }
  static detectEnvironment() {
    var e;
    if (typeof WebSocket < "u")
      return { type: "native", wsConstructor: WebSocket };
    const r = globalThis;
    if (typeof globalThis < "u" && typeof r.WebSocket < "u")
      return { type: "native", wsConstructor: r.WebSocket };
    const n = typeof global < "u" ? global : void 0;
    if (n && typeof n.WebSocket < "u")
      return { type: "native", wsConstructor: n.WebSocket };
    if (typeof globalThis < "u" && typeof r.WebSocketPair < "u" && typeof globalThis.WebSocket > "u")
      return {
        type: "cloudflare",
        error: "Cloudflare Workers detected. WebSocket clients are not supported in Cloudflare Workers.",
        workaround: "Use Cloudflare Workers WebSocket API for server-side WebSocket handling, or deploy to a different runtime."
      };
    if (typeof globalThis < "u" && r.EdgeRuntime || typeof navigator < "u" && (!((e = navigator.userAgent) === null || e === void 0) && e.includes("Vercel-Edge")))
      return {
        type: "unsupported",
        error: "Edge runtime detected (Vercel Edge/Netlify Edge). WebSockets are not supported in edge functions.",
        workaround: "Use serverless functions or a different deployment target for WebSocket functionality."
      };
    const s = globalThis.process;
    if (s) {
      const i = s.versions;
      if (i && i.node)
        return {
          type: "unsupported",
          error: "Node.js detected but native WebSocket not found.",
          workaround: "Ensure you are running Node.js 22+ or provide a WebSocket implementation via the transport option."
        };
    }
    return {
      type: "unsupported",
      error: "Unknown JavaScript runtime without WebSocket support.",
      workaround: "Ensure you're running in a supported environment (browser, Node.js, Deno) or provide a custom WebSocket implementation."
    };
  }
  /**
   * Returns the best available WebSocket constructor for the current runtime.
   *
   * @category Realtime
   *
   * @example Example with error handling
   * ```ts
   * try {
   *   const WS = WebSocketFactory.getWebSocketConstructor()
   *   const socket = new WS('wss://example.com/socket')
   * } catch (error) {
   *   console.error('WebSocket not available in this environment.', error)
   * }
   * ```
   */
  static getWebSocketConstructor() {
    const e = this.detectEnvironment();
    if (e.wsConstructor)
      return e.wsConstructor;
    let r = e.error || "WebSocket not supported in this environment.";
    throw e.workaround && (r += `

Suggested solution: ${e.workaround}`), new Error(r);
  }
  /**
   * Detects whether the runtime can establish WebSocket connections.
   *
   * @category Realtime
   *
   * @example Example in a Node.js script
   * ```ts
   * if (!WebSocketFactory.isWebSocketSupported()) {
   *   console.error('WebSockets are required for this script.')
   *   process.exitCode = 1
   * }
   * ```
   */
  static isWebSocketSupported() {
    try {
      return this.detectEnvironment().type === "native";
    } catch {
      return !1;
    }
  }
}
const Co = "2.118.0", Io = `realtime-js/${Co}`, jo = "1.0.0", hi = "2.0.0", Po = hi, No = 1e4, $o = 15e3, Lo = 1e4, Do = 100, Ee = {
  closed: "closed",
  errored: "errored",
  joined: "joined",
  joining: "joining",
  leaving: "leaving"
}, fi = {
  close: "phx_close",
  error: "phx_error",
  join: "phx_join",
  leave: "phx_leave",
  access_token: "access_token"
}, Mr = {
  connecting: "connecting",
  closing: "closing",
  closed: "closed"
};
class Uo {
  constructor(e) {
    this.HEADER_LENGTH = 1, this.USER_BROADCAST_PUSH_META_LENGTH = 6, this.KINDS = { userBroadcastPush: 3, userBroadcast: 4 }, this.BINARY_ENCODING = 0, this.JSON_ENCODING = 1, this.BROADCAST_EVENT = "broadcast", this.allowedMetadataKeys = [], this.allowedMetadataKeys = e ?? [];
  }
  encode(e, r) {
    if (e.event === this.BROADCAST_EVENT && !(e.payload instanceof ArrayBuffer) && typeof e.payload.event == "string")
      return r(this._binaryEncodeUserBroadcastPush(e));
    let n = [e.join_ref, e.ref, e.topic, e.event, e.payload];
    return r(JSON.stringify(n));
  }
  _binaryEncodeUserBroadcastPush(e) {
    var r;
    return this._isArrayBuffer((r = e.payload) === null || r === void 0 ? void 0 : r.payload) ? this._encodeBinaryUserBroadcastPush(e) : this._encodeJsonUserBroadcastPush(e);
  }
  _encodeBinaryUserBroadcastPush(e) {
    var r, n;
    const s = (n = (r = e.payload) === null || r === void 0 ? void 0 : r.payload) !== null && n !== void 0 ? n : new ArrayBuffer(0);
    return this._encodeUserBroadcastPush(e, this.BINARY_ENCODING, s);
  }
  _encodeJsonUserBroadcastPush(e) {
    var r, n;
    const s = (n = (r = e.payload) === null || r === void 0 ? void 0 : r.payload) !== null && n !== void 0 ? n : {}, o = new TextEncoder().encode(JSON.stringify(s)).buffer;
    return this._encodeUserBroadcastPush(e, this.JSON_ENCODING, o);
  }
  _encodeUserBroadcastPush(e, r, n) {
    var s, i;
    const o = new TextEncoder(), a = o.encode(e.topic), l = o.encode((s = e.ref) !== null && s !== void 0 ? s : ""), c = o.encode((i = e.join_ref) !== null && i !== void 0 ? i : ""), u = o.encode(e.payload.event), d = this.allowedMetadataKeys ? this._pick(e.payload, this.allowedMetadataKeys) : {}, p = o.encode(Object.keys(d).length === 0 ? "" : JSON.stringify(d));
    if (c.length > 255)
      throw new Error(`joinRef length ${c.length} exceeds maximum of 255`);
    if (l.length > 255)
      throw new Error(`ref length ${l.length} exceeds maximum of 255`);
    if (a.length > 255)
      throw new Error(`topic length ${a.length} exceeds maximum of 255`);
    if (u.length > 255)
      throw new Error(`userEvent length ${u.length} exceeds maximum of 255`);
    if (p.length > 255)
      throw new Error(`metadata length ${p.length} exceeds maximum of 255`);
    const h = this.USER_BROADCAST_PUSH_META_LENGTH + c.length + l.length + a.length + u.length + p.length, f = new ArrayBuffer(this.HEADER_LENGTH + h), g = new DataView(f), m = new Uint8Array(f);
    let y = 0;
    g.setUint8(y++, this.KINDS.userBroadcastPush), g.setUint8(y++, c.length), g.setUint8(y++, l.length), g.setUint8(y++, a.length), g.setUint8(y++, u.length), g.setUint8(y++, p.length), g.setUint8(y++, r), m.set(c, y), y += c.length, m.set(l, y), y += l.length, m.set(a, y), y += a.length, m.set(u, y), y += u.length, m.set(p, y), y += p.length;
    var _ = new Uint8Array(f.byteLength + n.byteLength);
    return _.set(new Uint8Array(f), 0), _.set(new Uint8Array(n), f.byteLength), _.buffer;
  }
  decode(e, r) {
    if (this._isArrayBuffer(e)) {
      let n = this._binaryDecode(e);
      return r(n);
    }
    if (typeof e == "string") {
      const n = JSON.parse(e), [s, i, o, a, l] = n;
      return r({ join_ref: s, ref: i, topic: o, event: a, payload: l });
    }
    return r({});
  }
  _binaryDecode(e) {
    const r = new DataView(e), n = r.getUint8(0), s = new TextDecoder();
    switch (n) {
      case this.KINDS.userBroadcast:
        return this._decodeUserBroadcast(e, r, s);
    }
  }
  _decodeUserBroadcast(e, r, n) {
    const s = r.getUint8(1), i = r.getUint8(2), o = r.getUint8(3), a = r.getUint8(4);
    let l = this.HEADER_LENGTH + 4;
    const c = n.decode(e.slice(l, l + s));
    l = l + s;
    const u = n.decode(e.slice(l, l + i));
    l = l + i;
    const d = n.decode(e.slice(l, l + o));
    l = l + o;
    const p = e.slice(l, e.byteLength), h = a === this.JSON_ENCODING ? JSON.parse(n.decode(p)) : p, f = {
      type: this.BROADCAST_EVENT,
      event: u,
      payload: h
    };
    return o > 0 && (f.meta = JSON.parse(d)), { join_ref: null, ref: null, topic: c, event: this.BROADCAST_EVENT, payload: f };
  }
  _isArrayBuffer(e) {
    var r;
    return e instanceof ArrayBuffer || ((r = e == null ? void 0 : e.constructor) === null || r === void 0 ? void 0 : r.name) === "ArrayBuffer";
  }
  _pick(e, r) {
    return !e || typeof e != "object" ? {} : Object.fromEntries(Object.entries(e).filter(([n]) => r.includes(n)));
  }
}
var N;
(function(t) {
  t.abstime = "abstime", t.bool = "bool", t.date = "date", t.daterange = "daterange", t.float4 = "float4", t.float8 = "float8", t.int2 = "int2", t.int4 = "int4", t.int4range = "int4range", t.int8 = "int8", t.int8range = "int8range", t.json = "json", t.jsonb = "jsonb", t.money = "money", t.numeric = "numeric", t.oid = "oid", t.reltime = "reltime", t.text = "text", t.time = "time", t.timestamp = "timestamp", t.timestamptz = "timestamptz", t.timetz = "timetz", t.tsrange = "tsrange", t.tstzrange = "tstzrange";
})(N || (N = {}));
const qn = (t, e, r = {}) => {
  var n;
  const s = (n = r.skipTypes) !== null && n !== void 0 ? n : [];
  return e ? Object.keys(e).reduce((i, o) => (i[o] = Bo(o, t, e, s), i), {}) : {};
}, Bo = (t, e, r, n) => {
  const s = e.find((a) => a.name === t), i = s == null ? void 0 : s.type, o = r[t];
  return i && !n.includes(i) ? pi(i, o) : Fr(o);
}, pi = (t, e) => {
  if (t.charAt(0) === "_") {
    const r = t.slice(1, t.length);
    return Ho(e, r);
  }
  switch (t) {
    case N.bool:
      return qo(e);
    case N.float4:
    case N.float8:
    case N.int2:
    case N.int4:
    case N.int8:
    case N.numeric:
    case N.oid:
      return Mo(e);
    case N.json:
    case N.jsonb:
      return Fo(e);
    case N.timestamp:
      return zo(e);
    // Format to be consistent with PostgREST
    case N.abstime:
    // To allow users to cast it based on Timezone
    case N.date:
    // To allow users to cast it based on Timezone
    case N.daterange:
    case N.int4range:
    case N.int8range:
    case N.money:
    case N.reltime:
    // To allow users to cast it based on Timezone
    case N.text:
    case N.time:
    // To allow users to cast it based on Timezone
    case N.timestamptz:
    // To allow users to cast it based on Timezone
    case N.timetz:
    // To allow users to cast it based on Timezone
    case N.tsrange:
    case N.tstzrange:
      return Fr(e);
    default:
      return Fr(e);
  }
}, Fr = (t) => t, qo = (t) => {
  switch (t) {
    case "t":
      return !0;
    case "f":
      return !1;
    default:
      return t;
  }
}, Mo = (t) => {
  if (typeof t == "string") {
    const e = parseFloat(t);
    if (!Number.isNaN(e))
      return e;
  }
  return t;
}, Fo = (t) => {
  if (typeof t == "string")
    try {
      return JSON.parse(t);
    } catch {
      return t;
    }
  return t;
}, Ho = (t, e) => {
  if (typeof t != "string")
    return t;
  const r = t.length - 1, n = t[r];
  if (t[0] === "{" && n === "}") {
    let i;
    const o = t.slice(1, r);
    try {
      i = JSON.parse("[" + o + "]");
    } catch {
      i = o ? o.split(",") : [];
    }
    return i.map((a) => pi(e, a));
  }
  return t;
}, zo = (t) => typeof t == "string" ? t.replace(" ", "T") : t, gi = (t) => {
  const e = new URL(t);
  return e.protocol = e.protocol.replace(/^ws/i, "http"), e.pathname = e.pathname.replace(/\/+$/, "").replace(/\/socket\/websocket$/i, "").replace(/\/socket$/i, "").replace(/\/websocket$/i, ""), e.pathname === "" || e.pathname === "/" ? e.pathname = "/api/broadcast" : e.pathname = e.pathname + "/api/broadcast", e.href;
};
var Qe = (t) => typeof t == "function" ? (
  /** @type {() => T} */
  t
) : function() {
  return t;
}, Wo = typeof self < "u" ? self : null, Ge = typeof window < "u" ? window : null, oe = Wo || Ge || globalThis, Ko = "2.0.0", Vo = 1e4, Jo = 1e3, Go = 100, ae = (
  /** @type {const} */
  { connecting: 0, open: 1, closing: 2, closed: 3 }
), W = (
  /** @type {const} */
  {
    closed: "closed",
    errored: "errored",
    joined: "joined",
    joining: "joining",
    leaving: "leaving"
  }
), pe = (
  /** @type {const} */
  {
    close: "phx_close",
    error: "phx_error",
    join: "phx_join",
    reply: "phx_reply",
    leave: "phx_leave"
  }
), Hr = (
  /** @type {const} */
  {
    longpoll: "longpoll",
    websocket: "websocket"
  }
), Yo = (
  /** @type {const} */
  {
    complete: 4
  }
), zr = "base64url.bearer.phx.", Rt = class {
  /**
   * Initializes the Push
   * @param {Channel} channel - The Channel
   * @param {ChannelEvent} event - The event, for example `"phx_join"`
   * @param {() => Record<string, unknown>} payload - The payload, for example `{user_id: 123}`
   * @param {number} timeout - The push timeout in milliseconds
   */
  constructor(t, e, r, n) {
    this.channel = t, this.event = e, this.payload = r || function() {
      return {};
    }, this.receivedResp = null, this.timeout = n, this.timeoutTimer = null, this.recHooks = [], this.sent = !1, this.ref = void 0;
  }
  /**
   *
   * @param {number} timeout
   */
  resend(t) {
    this.timeout = t, this.reset(), this.send();
  }
  /**
   *
   */
  send() {
    this.hasReceived("timeout") || (this.startTimeout(), this.sent = !0, this.channel.socket.push({
      topic: this.channel.topic,
      event: this.event,
      payload: this.payload(),
      ref: this.ref,
      join_ref: this.channel.joinRef()
    }));
  }
  /**
   *
   * @param {string} status
   * @param {(response: any) => void} callback
   */
  receive(t, e) {
    return this.hasReceived(t) && e(this.receivedResp.response), this.recHooks.push({ status: t, callback: e }), this;
  }
  reset() {
    this.cancelRefEvent(), this.ref = null, this.refEvent = null, this.receivedResp = null, this.sent = !1;
  }
  destroy() {
    this.cancelRefEvent(), this.cancelTimeout();
  }
  /**
   * @private
   */
  matchReceive({ status: t, response: e, _ref: r }) {
    this.recHooks.filter((n) => n.status === t).forEach((n) => n.callback(e));
  }
  /**
   * @private
   */
  cancelRefEvent() {
    this.refEvent && this.channel.off(this.refEvent);
  }
  cancelTimeout() {
    clearTimeout(this.timeoutTimer), this.timeoutTimer = null;
  }
  startTimeout() {
    this.timeoutTimer && this.cancelTimeout(), this.ref = this.channel.socket.makeRef(), this.refEvent = this.channel.replyEventName(this.ref), this.channel.on(this.refEvent, (t) => {
      this.cancelRefEvent(), this.cancelTimeout(), this.receivedResp = t, this.matchReceive(t);
    }), this.timeoutTimer = setTimeout(() => {
      this.trigger("timeout", {});
    }, this.timeout);
  }
  /**
   * @private
   */
  hasReceived(t) {
    return this.receivedResp && this.receivedResp.status === t;
  }
  trigger(t, e) {
    this.channel.trigger(this.refEvent, { status: t, response: e });
  }
}, mi = class {
  /**
  * @param {() => void} callback
  * @param {(tries: number) => number} timerCalc
  */
  constructor(t, e) {
    this.callback = t, this.timerCalc = e, this.timer = void 0, this.tries = 0;
  }
  reset() {
    this.tries = 0, clearTimeout(this.timer);
  }
  /**
   * Cancels any previous scheduleTimeout and schedules callback
   */
  scheduleTimeout() {
    clearTimeout(this.timer), this.timer = setTimeout(() => {
      this.tries = this.tries + 1, this.callback();
    }, this.timerCalc(this.tries + 1));
  }
}, Xo = class {
  /**
   * @param {string} topic
   * @param {Params | (() => Params)} params
   * @param {Socket} socket
   */
  constructor(t, e, r) {
    this.state = W.closed, this.topic = t, this.params = Qe(e || {}), this.socket = r, this.bindings = [], this.bindingRef = 0, this.timeout = this.socket.timeout, this.joinedOnce = !1, this.joinPush = new Rt(this, pe.join, this.params, this.timeout), this.pushBuffer = [], this.stateChangeRefs = [], this.rejoinTimer = new mi(() => {
      this.socket.isConnected() && this.rejoin();
    }, this.socket.rejoinAfterMs), this.stateChangeRefs.push(this.socket.onError(() => this.rejoinTimer.reset())), this.stateChangeRefs.push(
      this.socket.onOpen(() => {
        this.rejoinTimer.reset(), this.isErrored() && this.rejoin();
      })
    ), this.joinPush.receive("ok", () => {
      this.state = W.joined, this.rejoinTimer.reset(), this.pushBuffer.forEach((n) => n.send()), this.pushBuffer = [];
    }), this.joinPush.receive("error", (n) => {
      this.state = W.errored, this.socket.hasLogger() && this.socket.log("channel", `error ${this.topic}`, n), this.socket.isConnected() && this.rejoinTimer.scheduleTimeout();
    }), this.onClose(() => {
      this.rejoinTimer.reset(), this.socket.hasLogger() && this.socket.log("channel", `close ${this.topic}`), this.state = W.closed, this.socket.remove(this);
    }), this.onError((n) => {
      this.socket.hasLogger() && this.socket.log("channel", `error ${this.topic}`, n), this.isJoining() && this.joinPush.reset(), this.state = W.errored, this.socket.isConnected() && this.rejoinTimer.scheduleTimeout();
    }), this.joinPush.receive("timeout", () => {
      this.socket.hasLogger() && this.socket.log("channel", `timeout ${this.topic}`, this.joinPush.timeout), new Rt(this, pe.leave, Qe({}), this.timeout).send(), this.state = W.errored, this.joinPush.reset(), this.socket.isConnected() && this.rejoinTimer.scheduleTimeout();
    }), this.on(pe.reply, (n, s) => {
      this.trigger(this.replyEventName(s), n);
    });
  }
  /**
   * Join the channel
   * @param {number} timeout
   * @returns {Push}
   */
  join(t = this.timeout) {
    if (this.joinedOnce)
      throw new Error("tried to join multiple times. 'join' can only be called a single time per channel instance");
    return this.timeout = t, this.joinedOnce = !0, this.rejoin(), this.joinPush;
  }
  /**
   * Teardown the channel.
   *
   * Destroys and stops related timers.
   */
  teardown() {
    this.pushBuffer.forEach((t) => t.destroy()), this.pushBuffer = [], this.rejoinTimer.reset(), this.joinPush.destroy(), this.state = W.closed, this.bindings = [];
  }
  /**
   * Hook into channel close
   * @param {ChannelBindingCallback} callback
   */
  onClose(t) {
    this.on(pe.close, t);
  }
  /**
   * Hook into channel errors
   * @param {ChannelOnErrorCallback} callback
   * @return {number}
   */
  onError(t) {
    return this.on(pe.error, (e) => t(e));
  }
  /**
   * Subscribes on channel events
   *
   * Subscription returns a ref counter, which can be used later to
   * unsubscribe the exact event listener
   *
   * @example
   * const ref1 = channel.on("event", do_stuff)
   * const ref2 = channel.on("event", do_other_stuff)
   * channel.off("event", ref1)
   * // Since unsubscription, do_stuff won't fire,
   * // while do_other_stuff will keep firing on the "event"
   *
   * @param {string} event
   * @param {ChannelBindingCallback} callback
   * @returns {number} ref
   */
  on(t, e) {
    let r = this.bindingRef++;
    return this.bindings.push({ event: t, ref: r, callback: e }), r;
  }
  /**
   * Unsubscribes off of channel events
   *
   * Use the ref returned from a channel.on() to unsubscribe one
   * handler, or pass nothing for the ref to unsubscribe all
   * handlers for the given event.
   *
   * @example
   * // Unsubscribe the do_stuff handler
   * const ref1 = channel.on("event", do_stuff)
   * channel.off("event", ref1)
   *
   * // Unsubscribe all handlers from event
   * channel.off("event")
   *
   * @param {string} event
   * @param {number} [ref]
   */
  off(t, e) {
    this.bindings = this.bindings.filter((r) => !(r.event === t && (typeof e > "u" || e === r.ref)));
  }
  /**
   * @private
   */
  canPush() {
    return this.socket.isConnected() && this.isJoined();
  }
  /**
   * Sends a message `event` to phoenix with the payload `payload`.
   * Phoenix receives this in the `handle_in(event, payload, socket)`
   * function. if phoenix replies or it times out (default 10000ms),
   * then optionally the reply can be received.
   *
   * @example
   * channel.push("event")
   *   .receive("ok", payload => console.log("phoenix replied:", payload))
   *   .receive("error", err => console.log("phoenix errored", err))
   *   .receive("timeout", () => console.log("timed out pushing"))
   * @param {string} event
   * @param {Object} payload
   * @param {number} [timeout]
   * @returns {Push}
   */
  push(t, e, r = this.timeout) {
    if (e = e || {}, !this.joinedOnce)
      throw new Error(`tried to push '${t}' to '${this.topic}' before joining. Use channel.join() before pushing events`);
    let n = new Rt(this, t, function() {
      return e;
    }, r);
    return this.canPush() ? n.send() : (n.startTimeout(), this.pushBuffer.push(n)), n;
  }
  /** Leaves the channel
   *
   * Unsubscribes from server events, and
   * instructs channel to terminate on server
   *
   * Triggers onClose() hooks
   *
   * To receive leave acknowledgements, use the `receive`
   * hook to bind to the server ack, ie:
   *
   * @example
   * channel.leave().receive("ok", () => alert("left!") )
   *
   * @param {number} timeout
   * @returns {Push}
   */
  leave(t = this.timeout) {
    this.rejoinTimer.reset(), this.joinPush.cancelTimeout(), this.state = W.leaving;
    let e = () => {
      this.socket.hasLogger() && this.socket.log("channel", `leave ${this.topic}`), this.trigger(pe.close, "leave");
    }, r = new Rt(this, pe.leave, Qe({}), t);
    return r.receive("ok", () => e()).receive("timeout", () => e()), r.send(), this.canPush() || r.trigger("ok", {}), r;
  }
  /**
   * Overridable message hook
   *
   * Receives all events for specialized message handling
   * before dispatching to the channel callbacks.
   *
   * Must return the payload, modified or unmodified
   * @type{ChannelOnMessage}
   */
  onMessage(t, e, r) {
    return e;
  }
  /**
   * Overridable filter hook
   *
   * If this function returns `true`, `binding`'s callback will be called.
   *
   * @type{ChannelFilterBindings}
   */
  filterBindings(t, e, r) {
    return !0;
  }
  isMember(t, e, r, n) {
    return this.topic !== t ? !1 : n && n !== this.joinRef() ? (this.socket.hasLogger() && this.socket.log("channel", "dropping outdated message", { topic: t, event: e, payload: r, joinRef: n }), !1) : !0;
  }
  joinRef() {
    return this.joinPush.ref;
  }
  /**
   * @private
   */
  rejoin(t = this.timeout) {
    this.isLeaving() || (this.socket.leaveOpenTopic(this.topic), this.state = W.joining, this.joinPush.resend(t));
  }
  /**
   * @param {string} event
   * @param {unknown} [payload]
   * @param {?string} [ref]
   * @param {?string} [joinRef]
   */
  trigger(t, e, r, n) {
    let s = this.onMessage(t, e, r, n);
    if (e && !s)
      throw new Error("channel onMessage callbacks must return the payload, modified or unmodified");
    let i = this.bindings.filter((o) => o.event === t && this.filterBindings(o, e, r));
    for (let o = 0; o < i.length; o++)
      i[o].callback(s, r, n || this.joinRef());
  }
  /**
  * @param {string} ref
  */
  replyEventName(t) {
    return `chan_reply_${t}`;
  }
  isClosed() {
    return this.state === W.closed;
  }
  isErrored() {
    return this.state === W.errored;
  }
  isJoined() {
    return this.state === W.joined;
  }
  isJoining() {
    return this.state === W.joining;
  }
  isLeaving() {
    return this.state === W.leaving;
  }
}, Wt = class {
  static request(t, e, r, n, s, i, o) {
    if (oe.XDomainRequest) {
      let a = new oe.XDomainRequest();
      return this.xdomainRequest(a, t, e, n, s, i, o);
    } else if (oe.XMLHttpRequest) {
      let a = new oe.XMLHttpRequest();
      return this.xhrRequest(a, t, e, r, n, s, i, o);
    } else {
      if (oe.fetch && oe.AbortController)
        return this.fetchRequest(t, e, r, n, s, i, o);
      throw new Error("No suitable XMLHttpRequest implementation found");
    }
  }
  static fetchRequest(t, e, r, n, s, i, o) {
    let a = {
      method: t,
      headers: r,
      body: n
    }, l = null;
    return s && (l = new AbortController(), setTimeout(() => l.abort(), s), a.signal = l.signal), oe.fetch(e, a).then((c) => c.text()).then((c) => this.parseJSON(c)).then((c) => o && o(c)).catch((c) => {
      c.name === "AbortError" && i ? i() : o && o(null);
    }), l;
  }
  static xdomainRequest(t, e, r, n, s, i, o) {
    return t.timeout = s, t.open(e, r), t.onload = () => {
      let a = this.parseJSON(t.responseText);
      o && o(a);
    }, i && (t.ontimeout = i), t.onprogress = () => {
    }, t.send(n), t;
  }
  static xhrRequest(t, e, r, n, s, i, o, a) {
    t.open(e, r, !0), t.timeout = i;
    for (let [l, c] of Object.entries(n))
      t.setRequestHeader(l, c);
    return t.onerror = () => a && a(null), t.onreadystatechange = () => {
      if (t.readyState === Yo.complete && a) {
        let l = this.parseJSON(t.responseText);
        a(l);
      }
    }, o && (t.ontimeout = o), t.send(s), t;
  }
  static parseJSON(t) {
    if (!t || t === "")
      return null;
    try {
      return JSON.parse(t);
    } catch {
      return console && console.log("failed to parse JSON response", t), null;
    }
  }
  static serialize(t, e) {
    let r = [];
    for (var n in t) {
      if (!Object.prototype.hasOwnProperty.call(t, n))
        continue;
      let s = e ? `${e}[${n}]` : n, i = t[n];
      typeof i == "object" ? r.push(this.serialize(i, s)) : r.push(encodeURIComponent(s) + "=" + encodeURIComponent(i));
    }
    return r.join("&");
  }
  static appendParams(t, e) {
    if (Object.keys(e).length === 0)
      return t;
    let r = t.match(/\?/) ? "&" : "?";
    return `${t}${r}${this.serialize(e)}`;
  }
}, Qo = (t) => {
  let e = "", r = new Uint8Array(t), n = r.byteLength;
  for (let s = 0; s < n; s++)
    e += String.fromCharCode(r[s]);
  return btoa(e);
}, He = class {
  constructor(t, e) {
    e && e.length === 2 && e[1].startsWith(zr) && (this.authToken = atob(e[1].slice(zr.length))), this.endPoint = null, this.token = null, this.skipHeartbeat = !0, this.reqs = /* @__PURE__ */ new Set(), this.awaitingBatchAck = !1, this.currentBatch = null, this.currentBatchTimer = null, this.batchBuffer = [], this.onopen = function() {
    }, this.onerror = function() {
    }, this.onmessage = function() {
    }, this.onclose = function() {
    }, this.pollEndpoint = this.normalizeEndpoint(t), this.readyState = ae.connecting, setTimeout(() => this.poll(), 0);
  }
  normalizeEndpoint(t) {
    return t.replace("ws://", "http://").replace("wss://", "https://").replace(new RegExp("(.*)/" + Hr.websocket), "$1/" + Hr.longpoll);
  }
  endpointURL() {
    return Wt.appendParams(this.pollEndpoint, { token: this.token });
  }
  closeAndRetry(t, e, r) {
    this.close(t, e, r), this.readyState = ae.connecting;
  }
  ontimeout() {
    this.onerror("timeout"), this.closeAndRetry(1005, "timeout", !1);
  }
  isActive() {
    return this.readyState === ae.open || this.readyState === ae.connecting;
  }
  poll() {
    const t = { Accept: "application/json" };
    this.authToken && (t["X-Phoenix-AuthToken"] = this.authToken), this.ajax("GET", t, null, () => this.ontimeout(), (e) => {
      if (e) {
        var { status: r, token: n, messages: s } = e;
        if (r === 410 && this.token !== null) {
          this.onerror(410), this.closeAndRetry(3410, "session_gone", !1);
          return;
        }
        this.token = n;
      } else
        r = 0;
      switch (r) {
        case 200:
          s.forEach((i) => {
            setTimeout(() => this.onmessage({ data: i }), 0);
          }), this.poll();
          break;
        case 204:
          this.poll();
          break;
        case 410:
          this.readyState = ae.open, this.onopen({}), this.poll();
          break;
        case 403:
          this.onerror(403), this.close(1008, "forbidden", !1);
          break;
        case 0:
        case 500:
          this.onerror(500), this.closeAndRetry(1011, "internal server error", 500);
          break;
        default:
          throw new Error(`unhandled poll status ${r}`);
      }
    });
  }
  // we collect all pushes within the current event loop by
  // setTimeout 0, which optimizes back-to-back procedural
  // pushes against an empty buffer
  send(t) {
    typeof t != "string" && (t = Qo(t)), this.currentBatch ? this.currentBatch.push(t) : this.awaitingBatchAck ? this.batchBuffer.push(t) : (this.currentBatch = [t], this.currentBatchTimer = setTimeout(() => {
      this.batchSend(this.currentBatch), this.currentBatch = null;
    }, 0));
  }
  batchSend(t, e = 0) {
    this.awaitingBatchAck = !0;
    const r = e + Go, n = t.slice(e, r);
    this.ajax("POST", { "Content-Type": "application/x-ndjson" }, n.join(`
`), () => this.onerror("timeout"), (s) => {
      !s || s.status !== 200 ? (this.awaitingBatchAck = !1, this.onerror(s && s.status), this.closeAndRetry(1011, "internal server error", !1)) : r < t.length ? this.batchSend(t, r) : this.batchBuffer.length > 0 ? (this.batchSend(this.batchBuffer), this.batchBuffer = []) : this.awaitingBatchAck = !1;
    });
  }
  close(t, e, r) {
    for (let s of this.reqs)
      s.abort();
    this.readyState = ae.closed;
    let n = Object.assign({ code: 1e3, reason: void 0, wasClean: !0 }, { code: t, reason: e, wasClean: r });
    this.batchBuffer = [], clearTimeout(this.currentBatchTimer), this.currentBatchTimer = null, typeof CloseEvent < "u" ? this.onclose(new CloseEvent("close", n)) : this.onclose(n);
  }
  ajax(t, e, r, n, s) {
    let i, o = () => {
      this.reqs.delete(i), n();
    };
    i = Wt.request(t, this.endpointURL(), e, r, this.timeout, o, (a) => {
      this.reqs.delete(i), this.isActive() && s(a);
    }), this.reqs.add(i);
  }
}, Zo = class dt {
  /**
   * Initializes the Presence
   * @param {Channel} channel - The Channel
   * @param {PresenceOptions} [opts] - The options, for example `{events: {state: "state", diff: "diff"}}`
   */
  constructor(e, r = {}) {
    let n = r.events || /** @type {PresenceEvents} */
    { state: "presence_state", diff: "presence_diff" };
    this.state = /* @__PURE__ */ Object.create(null), this.pendingDiffs = [], this.channel = e, this.joinRef = null, this.caller = {
      onJoin: function() {
      },
      onLeave: function() {
      },
      onSync: function() {
      }
    }, this.channel.on(n.state, (s) => {
      let { onJoin: i, onLeave: o, onSync: a } = this.caller;
      this.joinRef = this.channel.joinRef(), this.state = dt.syncState(this.state, s, i, o), this.pendingDiffs.forEach((l) => {
        this.state = dt.syncDiff(this.state, l, i, o);
      }), this.pendingDiffs = [], a();
    }), this.channel.on(n.diff, (s) => {
      let { onJoin: i, onLeave: o, onSync: a } = this.caller;
      this.inPendingSyncState() ? this.pendingDiffs.push(s) : (this.state = dt.syncDiff(this.state, s, i, o), a());
    });
  }
  /**
   * @param {PresenceOnJoin} callback
   */
  onJoin(e) {
    this.caller.onJoin = e;
  }
  /**
   * @param {PresenceOnLeave} callback
   */
  onLeave(e) {
    this.caller.onLeave = e;
  }
  /**
   * @param {PresenceOnSync} callback
   */
  onSync(e) {
    this.caller.onSync = e;
  }
  /**
   * Returns the array of presences, with selected metadata.
   *
   * @template [T=PresenceState]
   * @param {((key: string, obj: PresenceState) => T)} [by]
   *
   * @returns {T[]}
   */
  list(e) {
    return dt.list(this.state, e);
  }
  inPendingSyncState() {
    return !this.joinRef || this.joinRef !== this.channel.joinRef();
  }
  // lower-level public static API
  /**
   * Used to sync the list of presences on the server
   * with the client's state. An optional `onJoin` and `onLeave` callback can
   * be provided to react to changes in the client's local presences across
   * disconnects and reconnects with the server.
   *
   * @param {Record<string, PresenceState>} currentState
   * @param {Record<string, PresenceState>} newState
   * @param {PresenceOnJoin} onJoin
   * @param {PresenceOnLeave} onLeave
   *
   * @returns {Record<string, PresenceState>}
   */
  static syncState(e, r, n, s) {
    let i = this.toNullProtoObj(this.clone(e));
    r = this.toNullProtoObj(r);
    let o = /* @__PURE__ */ Object.create(null), a = /* @__PURE__ */ Object.create(null);
    return this.map(i, (l, c) => {
      r[l] || (a[l] = c);
    }), this.map(r, (l, c) => {
      let u = i[l];
      if (u) {
        let d = c.metas.map((g) => g.phx_ref), p = u.metas.map((g) => g.phx_ref), h = c.metas.filter((g) => p.indexOf(g.phx_ref) < 0), f = u.metas.filter((g) => d.indexOf(g.phx_ref) < 0);
        h.length > 0 && (o[l] = c, o[l].metas = h), f.length > 0 && (a[l] = this.clone(u), a[l].metas = f);
      } else
        o[l] = c;
    }), this.syncDiff(i, { joins: o, leaves: a }, n, s);
  }
  /**
   *
   * Used to sync a diff of presence join and leave
   * events from the server, as they happen. Like `syncState`, `syncDiff`
   * accepts optional `onJoin` and `onLeave` callbacks to react to a user
   * joining or leaving from a device.
   *
   * @param {Record<string, PresenceState>} state
   * @param {PresenceDiff} diff
   * @param {PresenceOnJoin} onJoin
   * @param {PresenceOnLeave} onLeave
   *
   * @returns {Record<string, PresenceState>}
   */
  static syncDiff(e, r, n, s) {
    e = this.toNullProtoObj(e);
    let { joins: i, leaves: o } = this.clone(r);
    return n || (n = function() {
    }), s || (s = function() {
    }), this.map(i, (a, l) => {
      let c = e[a];
      if (e[a] = this.clone(l), c) {
        let u = e[a].metas.map((p) => p.phx_ref), d = c.metas.filter((p) => u.indexOf(p.phx_ref) < 0);
        e[a].metas.unshift(...d);
      }
      n(a, c, l);
    }), this.map(o, (a, l) => {
      let c = e[a];
      if (!c)
        return;
      let u = l.metas.map((d) => d.phx_ref);
      c.metas = c.metas.filter((d) => u.indexOf(d.phx_ref) < 0), s(a, c, l), c.metas.length === 0 && delete e[a];
    }), e;
  }
  /**
   * Returns the array of presences, with selected metadata.
   *
   * @template [T=PresenceState]
   * @param {Record<string, PresenceState>} presences
   * @param {((key: string, obj: PresenceState) => T)} [chooser]
   *
   * @returns {T[]}
   */
  static list(e, r) {
    return r || (r = function(n, s) {
      return s;
    }), this.map(e, (n, s) => r(n, s));
  }
  // private
  /**
  * @template T
  * @param {Record<string, PresenceState>} obj
  * @param {(key: string, obj: PresenceState) => T} func
  */
  static map(e, r) {
    return Object.getOwnPropertyNames(e).map((n) => r(n, e[n]));
  }
  // Presence keys are chosen on the server and may collide with
  // Object.prototype properties ("__proto__", "constructor", ...), so any
  // object indexed by presence key must not have a prototype chain
  //
  // TODO: replace the null-prototype objects with Maps in Phoenix 2.0
  // (breaking change for the lower-level static API)
  static toNullProtoObj(e) {
    if (Object.getPrototypeOf(e) === null)
      return e;
    let r = /* @__PURE__ */ Object.create(null);
    return Object.getOwnPropertyNames(e).forEach((n) => {
      r[n] = e[n];
    }), r;
  }
  /**
  * @template T
  * @param {T} obj
  * @returns {T}
  */
  static clone(e) {
    return JSON.parse(JSON.stringify(e));
  }
}, Ot = {
  HEADER_LENGTH: 1,
  META_LENGTH: 4,
  KINDS: { push: 0, reply: 1, broadcast: 2 },
  /**
  * @template T
  * @param {Message<Record<string, any>>} msg
  * @param {(msg: ArrayBuffer | string) => T} callback
  * @returns {T}
  */
  encode(t, e) {
    if (t.payload.constructor === ArrayBuffer)
      return e(this.binaryEncode(t));
    {
      let r = [t.join_ref, t.ref, t.topic, t.event, t.payload];
      return e(JSON.stringify(r));
    }
  },
  /**
  * @template T
  * @param {ArrayBuffer | string} rawPayload
  * @param {(msg: Message<unknown>) => T} callback
  * @returns {T}
  */
  decode(t, e) {
    if (t.constructor === ArrayBuffer)
      return e(this.binaryDecode(t));
    {
      let [r, n, s, i, o] = JSON.parse(t);
      return e({ join_ref: r, ref: n, topic: s, event: i, payload: o });
    }
  },
  /** @private */
  binaryEncode(t) {
    let { join_ref: e, ref: r, event: n, topic: s, payload: i } = t, o = new TextEncoder(), a = o.encode(e), l = o.encode(r), c = o.encode(s), u = o.encode(n);
    this.assertFieldSize(a.byteLength, "join_ref"), this.assertFieldSize(l.byteLength, "ref"), this.assertFieldSize(c.byteLength, "topic"), this.assertFieldSize(u.byteLength, "event");
    let d = this.META_LENGTH + a.byteLength + l.byteLength + c.byteLength + u.byteLength, p = new ArrayBuffer(this.HEADER_LENGTH + d), h = new Uint8Array(p), f = new DataView(p), g = 0;
    f.setUint8(g++, this.KINDS.push), f.setUint8(g++, a.byteLength), f.setUint8(g++, l.byteLength), f.setUint8(g++, c.byteLength), f.setUint8(g++, u.byteLength), h.set(a, g), g += a.byteLength, h.set(l, g), g += l.byteLength, h.set(c, g), g += c.byteLength, h.set(u, g), g += u.byteLength;
    var m = new Uint8Array(p.byteLength + i.byteLength);
    return m.set(h, 0), m.set(new Uint8Array(i), p.byteLength), m.buffer;
  },
  assertFieldSize(t, e) {
    if (t > 255)
      throw new Error(`unable to convert ${e} to binary: must be less than or equal to 255 bytes, but is ${t} bytes`);
  },
  /**
  * @private
  */
  binaryDecode(t) {
    let e = new DataView(t), r = e.getUint8(0), n = new TextDecoder();
    switch (r) {
      case this.KINDS.push:
        return this.decodePush(t, e, n);
      case this.KINDS.reply:
        return this.decodeReply(t, e, n);
      case this.KINDS.broadcast:
        return this.decodeBroadcast(t, e, n);
    }
  },
  /** @private */
  decodePush(t, e, r) {
    let n = e.getUint8(1), s = e.getUint8(2), i = e.getUint8(3), o = this.HEADER_LENGTH + this.META_LENGTH - 1, a = r.decode(t.slice(o, o + n));
    o = o + n;
    let l = r.decode(t.slice(o, o + s));
    o = o + s;
    let c = r.decode(t.slice(o, o + i));
    o = o + i;
    let u = t.slice(o, t.byteLength);
    return { join_ref: a, ref: null, topic: l, event: c, payload: u };
  },
  /** @private */
  decodeReply(t, e, r) {
    let n = e.getUint8(1), s = e.getUint8(2), i = e.getUint8(3), o = e.getUint8(4), a = this.HEADER_LENGTH + this.META_LENGTH, l = r.decode(t.slice(a, a + n));
    a = a + n;
    let c = r.decode(t.slice(a, a + s));
    a = a + s;
    let u = r.decode(t.slice(a, a + i));
    a = a + i;
    let d = r.decode(t.slice(a, a + o));
    a = a + o;
    let p = t.slice(a, t.byteLength), h = { status: d, response: p };
    return { join_ref: l, ref: c, topic: u, event: pe.reply, payload: h };
  },
  /** @private */
  decodeBroadcast(t, e, r) {
    let n = e.getUint8(1), s = e.getUint8(2), i = this.HEADER_LENGTH + 2, o = r.decode(t.slice(i, i + n));
    i = i + n;
    let a = r.decode(t.slice(i, i + s));
    i = i + s;
    let l = t.slice(i, t.byteLength);
    return { join_ref: null, ref: null, topic: o, event: a, payload: l };
  }
}, ea = class {
  /** Initializes the Socket *
   *
   * For IE8 support use an ES5-shim (https://github.com/es-shims/es5-shim)
   *
   * @constructor
   * @param {string} endPoint - The string WebSocket endpoint, ie, `"ws://example.com/socket"`,
   *                                               `"wss://example.com"`
   *                                               `"/socket"` (inherited host & protocol)
   * @param {SocketOptions} [opts] - Optional configuration
   */
  constructor(t, e = {}) {
    this.stateChangeCallbacks = { open: [], close: [], error: [], message: [] }, this.channels = [], this.sendBuffer = [], this.ref = 0, this.fallbackRef = null, this.timeout = e.timeout || Vo, this.transport = e.transport || oe.WebSocket || He, this.conn = void 0, this.primaryPassedHealthCheck = !1, this.longPollFallbackMs = e.longPollFallbackMs, this.fallbackTimer = null;
    let r = null;
    try {
      r = oe && oe.sessionStorage;
    } catch {
    }
    this.sessionStore = e.sessionStorage || r, this.establishedConnections = 0, this.defaultEncoder = Ot.encode.bind(Ot), this.defaultDecoder = Ot.decode.bind(Ot), this.closeWasClean = !0, this.disconnecting = !1, this.binaryType = e.binaryType || "arraybuffer", this.connectClock = 1, this.pageHidden = !1, this.encode = void 0, this.decode = void 0, this.transport !== He ? (this.encode = e.encode || this.defaultEncoder, this.decode = e.decode || this.defaultDecoder) : (this.encode = this.defaultEncoder, this.decode = this.defaultDecoder);
    let n = null;
    Ge && Ge.addEventListener && (Ge.addEventListener("pagehide", (s) => {
      this.conn && (this.disconnect(), n = this.connectClock);
    }), Ge.addEventListener("pageshow", (s) => {
      n === this.connectClock && (n = null, this.connect());
    }), Ge.addEventListener("visibilitychange", () => {
      document.visibilityState === "hidden" ? this.pageHidden = !0 : (this.pageHidden = !1, !this.isConnected() && !this.closeWasClean && this.teardown(() => this.connect()));
    })), this.heartbeatIntervalMs = e.heartbeatIntervalMs || 3e4, this.autoSendHeartbeat = e.autoSendHeartbeat ?? !0, this.heartbeatCallback = e.heartbeatCallback ?? (() => {
    }), this.rejoinAfterMs = (s) => e.rejoinAfterMs ? e.rejoinAfterMs(s) : [1e3, 2e3, 5e3][s - 1] || 1e4, this.reconnectAfterMs = (s) => e.reconnectAfterMs ? e.reconnectAfterMs(s) : [10, 50, 100, 150, 200, 250, 500, 1e3, 2e3][s - 1] || 5e3, this.logger = e.logger || null, !this.logger && e.debug && (this.logger = (s, i, o) => {
      console.log(`${s}: ${i}`, o);
    }), this.longpollerTimeout = e.longpollerTimeout || 2e4, this.params = Qe(e.params || {}), this.endPoint = `${t}/${Hr.websocket}`, this.vsn = e.vsn || Ko, this.heartbeatTimeoutTimer = null, this.heartbeatTimer = null, this.heartbeatSentAt = null, this.pendingHeartbeatRef = null, this.reconnectTimer = new mi(() => {
      if (this.pageHidden) {
        this.log("Not reconnecting as page is hidden!"), this.teardown();
        return;
      }
      this.teardown(async () => {
        e.beforeReconnect && await e.beforeReconnect(), this.connect();
      });
    }, this.reconnectAfterMs), this.authToken = e.authToken && Qe(e.authToken);
  }
  /**
   * Returns the LongPoll transport reference
   */
  getLongPollTransport() {
    return He;
  }
  /**
   * Disconnects and replaces the active transport
   *
   * @param {SocketTransport} newTransport - The new transport class to instantiate
   *
   */
  replaceTransport(t) {
    this.connectClock++, this.closeWasClean = !0, clearTimeout(this.fallbackTimer), this.reconnectTimer.reset(), this.conn && (this.conn.close(), this.conn = null), this.transport = t;
  }
  /**
   * Returns the socket protocol
   *
   * @returns {"wss" | "ws"}
   */
  protocol() {
    return location.protocol.match(/^https/) ? "wss" : "ws";
  }
  /**
   * The fully qualified socket url
   *
   * @returns {string}
   */
  endPointURL() {
    let t = Wt.appendParams(
      Wt.appendParams(this.endPoint, this.params()),
      { vsn: this.vsn }
    );
    return t.charAt(0) !== "/" ? t : t.charAt(1) === "/" ? `${this.protocol()}:${t}` : `${this.protocol()}://${location.host}${t}`;
  }
  /**
   * Disconnects the socket
   *
   * See https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent#Status_codes for valid status codes.
   *
   * @param {() => void} [callback] - Optional callback which is called after socket is disconnected.
   * @param {number} [code] - A status code for disconnection (Optional).
   * @param {string} [reason] - A textual description of the reason to disconnect. (Optional)
   */
  disconnect(t, e, r) {
    this.connectClock++, this.disconnecting = !0, this.closeWasClean = !0, clearTimeout(this.fallbackTimer), this.reconnectTimer.reset(), this.teardown(() => {
      this.disconnecting = !1, t && t();
    }, e, r);
  }
  /**
   * @param {Params} [params] - [DEPRECATED] The params to send when connecting, for example `{user_id: userToken}`
   *
   * Passing params to connect is deprecated; pass them in the Socket constructor instead:
   * `new Socket("/socket", {params: {user_id: userToken}})`.
   */
  connect(t) {
    t && (console && console.log("passing params to connect is deprecated. Instead pass :params to the Socket constructor"), this.params = Qe(t)), !(this.conn && !this.disconnecting) && (this.longPollFallbackMs && this.transport !== He ? this.connectWithFallback(He, this.longPollFallbackMs) : this.transportConnect());
  }
  /**
   * Logs the message. Override `this.logger` for specialized logging. noops by default
   * @param {string} kind
   * @param {string} msg
   * @param {Object} data
   */
  log(t, e, r) {
    this.logger && this.logger(t, e, r);
  }
  /**
   * Returns true if a logger has been set on this socket.
   */
  hasLogger() {
    return this.logger !== null;
  }
  /**
   * Registers callbacks for connection open events
   *
   * @example socket.onOpen(function(){ console.info("the socket was opened") })
   *
   * @param {SocketOnOpen} callback
   */
  onOpen(t) {
    let e = this.makeRef();
    return this.stateChangeCallbacks.open.push([e, t]), e;
  }
  /**
   * Registers callbacks for connection close events
   * @param {SocketOnClose} callback
   * @returns {string}
   */
  onClose(t) {
    let e = this.makeRef();
    return this.stateChangeCallbacks.close.push([e, t]), e;
  }
  /**
   * Registers callbacks for connection error events
   *
   * @example socket.onError(function(error){ alert("An error occurred") })
   *
   * @param {SocketOnError} callback
   * @returns {string}
   */
  onError(t) {
    let e = this.makeRef();
    return this.stateChangeCallbacks.error.push([e, t]), e;
  }
  /**
   * Registers callbacks for connection message events
   * @param {SocketOnMessage} callback
   * @returns {string}
   */
  onMessage(t) {
    let e = this.makeRef();
    return this.stateChangeCallbacks.message.push([e, t]), e;
  }
  /**
   * Sets a callback that receives lifecycle events for internal heartbeat messages.
   * Useful for instrumenting connection health (e.g. sent/ok/timeout/disconnected).
   * @param {HeartbeatCallback} callback
   */
  onHeartbeat(t) {
    this.heartbeatCallback = t;
  }
  /**
   * Pings the server and invokes the callback with the RTT in milliseconds
   * @param {(timeDelta: number) => void} callback
   *
   * Returns true if the ping was pushed or false if unable to be pushed.
   */
  ping(t) {
    if (!this.isConnected())
      return !1;
    let e = this.makeRef(), r = Date.now();
    this.push({ topic: "phoenix", event: "heartbeat", payload: {}, ref: e });
    let n = this.onMessage((s) => {
      s.ref === e && (this.off([n]), t(Date.now() - r));
    });
    return !0;
  }
  /**
   * @private
   *
   * @param {Function}
   */
  transportName(t) {
    switch (t) {
      case He:
        return "LongPoll";
      default:
        return t.name;
    }
  }
  /**
   * @private
   */
  transportConnect() {
    this.connectClock++, this.closeWasClean = !1;
    let t;
    this.authToken && (t = ["phoenix", `${zr}${btoa(this.authToken()).replace(/=/g, "")}`]), this.conn = new this.transport(this.endPointURL(), t), this.conn.binaryType = this.binaryType, this.conn.timeout = this.longpollerTimeout, this.conn.onopen = () => this.onConnOpen(), this.conn.onerror = (e) => this.onConnError(e), this.conn.onmessage = (e) => this.onConnMessage(e), this.conn.onclose = (e) => this.onConnClose(e);
  }
  getSession(t) {
    return this.sessionStore && this.sessionStore.getItem(t);
  }
  storeSession(t, e) {
    this.sessionStore && this.sessionStore.setItem(t, e);
  }
  connectWithFallback(t, e = 2500) {
    clearTimeout(this.fallbackTimer);
    let r = !1, n = !0, s, i, o = this.transportName(t), a = (l) => {
      this.log("transport", `falling back to ${o}...`, l), this.off([s, i]), n = !1, this.replaceTransport(t), this.transportConnect();
    };
    if (this.getSession(`phx:fallback:${o}`))
      return a("memorized");
    this.fallbackTimer = setTimeout(a, e), i = this.onError((l) => {
      this.log("transport", "error", l), n && !r && (clearTimeout(this.fallbackTimer), a(l));
    }), this.fallbackRef && this.off([this.fallbackRef]), this.fallbackRef = this.onOpen(() => {
      if (r = !0, !n) {
        let l = this.transportName(t);
        return this.primaryPassedHealthCheck || this.storeSession(`phx:fallback:${l}`, "true"), this.log("transport", `established ${l} fallback`);
      }
      clearTimeout(this.fallbackTimer), this.fallbackTimer = setTimeout(a, e), this.ping((l) => {
        this.log("transport", "connected to primary after", l), this.primaryPassedHealthCheck = !0, clearTimeout(this.fallbackTimer);
      });
    }), this.transportConnect();
  }
  clearHeartbeats() {
    clearTimeout(this.heartbeatTimer), clearTimeout(this.heartbeatTimeoutTimer);
  }
  onConnOpen() {
    this.hasLogger() && this.log("transport", `connected to ${this.endPointURL()}`), this.closeWasClean = !1, this.disconnecting = !1, this.establishedConnections++, this.flushSendBuffer(), this.reconnectTimer.reset(), this.autoSendHeartbeat && this.resetHeartbeat(), this.triggerStateCallbacks("open");
  }
  /**
   * @private
   */
  heartbeatTimeout() {
    if (this.pendingHeartbeatRef) {
      this.pendingHeartbeatRef = null, this.heartbeatSentAt = null, this.hasLogger() && this.log("transport", "heartbeat timeout. Attempting to re-establish connection");
      try {
        this.heartbeatCallback("timeout");
      } catch (t) {
        this.log("error", "error in heartbeat callback", t);
      }
      this.triggerChanError(new Error("heartbeat timeout")), this.closeWasClean = !1, this.teardown(() => this.reconnectTimer.scheduleTimeout(), Jo, "heartbeat timeout");
    }
  }
  resetHeartbeat() {
    this.conn && this.conn.skipHeartbeat || (this.pendingHeartbeatRef = null, this.clearHeartbeats(), this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatIntervalMs));
  }
  teardown(t, e, r) {
    if (!this.conn)
      return t && t();
    const n = this.conn;
    this.waitForBufferDone(n, () => {
      e ? n.close(e, r || "") : n.close(), this.waitForSocketClosed(n, () => {
        this.conn === n && (this.conn.onopen = function() {
        }, this.conn.onerror = function() {
        }, this.conn.onmessage = function() {
        }, this.conn.onclose = function() {
        }, this.conn = null), t && t();
      });
    });
  }
  waitForBufferDone(t, e, r = 1) {
    if (r === 5 || !t.bufferedAmount) {
      e();
      return;
    }
    setTimeout(() => {
      this.waitForBufferDone(t, e, r + 1);
    }, 150 * r);
  }
  waitForSocketClosed(t, e, r = 1) {
    if (r === 5 || t.readyState === ae.closed) {
      e();
      return;
    }
    setTimeout(() => {
      this.waitForSocketClosed(t, e, r + 1);
    }, 150 * r);
  }
  /**
  * @param {CloseEvent} event
  */
  onConnClose(t) {
    this.conn && (this.conn.onclose = () => {
    }), this.hasLogger() && this.log("transport", "close", t), this.triggerChanError(t), this.clearHeartbeats(), this.closeWasClean || this.reconnectTimer.scheduleTimeout(), this.triggerStateCallbacks("close", t);
  }
  /**
   * @private
   * @param {Event} error
   */
  onConnError(t) {
    this.hasLogger() && this.log("transport", "error", t);
    let e = this.transport, r = this.establishedConnections;
    this.triggerStateCallbacks("error", t, e, r), (e === this.transport || r > 0) && this.triggerChanError(t);
  }
  /**
   * @private
   * @param {unknown} [reason] underlying close/error event forwarded to channel error listeners
   */
  triggerChanError(t) {
    this.channels.forEach((e) => {
      e.isErrored() || e.isLeaving() || e.isClosed() || e.trigger(pe.error, t);
    });
  }
  /**
   * @returns {string}
   */
  connectionState() {
    switch (this.conn && this.conn.readyState) {
      case ae.connecting:
        return "connecting";
      case ae.open:
        return "open";
      case ae.closing:
        return "closing";
      default:
        return "closed";
    }
  }
  /**
   * @returns {boolean}
   */
  isConnected() {
    return this.connectionState() === "open";
  }
  /**
   *
   * @param {Channel} channel
   */
  remove(t) {
    this.off(t.stateChangeRefs), this.channels = this.channels.filter((e) => e !== t);
  }
  /**
   * Removes `onOpen`, `onClose`, `onError,` and `onMessage` registrations.
   *
   * @param {string[]} refs - list of refs returned by calls to
   *                 `onOpen`, `onClose`, `onError,` and `onMessage`
   */
  off(t) {
    for (let e in this.stateChangeCallbacks)
      this.stateChangeCallbacks[e] = this.stateChangeCallbacks[e].filter(([r]) => t.indexOf(r) === -1);
  }
  /**
   * Initiates a new channel for the given topic
   *
   * @param {string} topic
   * @param {Params | (() => Params)} [chanParams]- Parameters for the channel
   * @returns {Channel}
   */
  channel(t, e = {}) {
    let r = new Xo(t, e, this);
    return this.channels.push(r), r;
  }
  /**
   * @param {Message<Record<string, any>>} data
   */
  push(t) {
    if (this.hasLogger()) {
      let { topic: e, event: r, payload: n, ref: s, join_ref: i } = t;
      this.log("push", `${e} ${r} (${i}, ${s})`, n);
    }
    this.isConnected() ? this.encode(t, (e) => this.conn.send(e)) : this.sendBuffer.push(() => this.encode(t, (e) => this.conn.send(e)));
  }
  /**
   * Return the next message ref, accounting for overflows
   * @returns {string}
   */
  makeRef() {
    let t = this.ref + 1;
    return t === this.ref ? this.ref = 0 : this.ref = t, this.ref.toString();
  }
  sendHeartbeat() {
    if (!this.isConnected()) {
      try {
        this.heartbeatCallback("disconnected");
      } catch (t) {
        this.log("error", "error in heartbeat callback", t);
      }
      return;
    }
    if (this.pendingHeartbeatRef) {
      this.heartbeatTimeout();
      return;
    }
    this.pendingHeartbeatRef = this.makeRef(), this.heartbeatSentAt = Date.now(), this.push({ topic: "phoenix", event: "heartbeat", payload: {}, ref: this.pendingHeartbeatRef });
    try {
      this.heartbeatCallback("sent");
    } catch (t) {
      this.log("error", "error in heartbeat callback", t);
    }
    this.heartbeatTimeoutTimer = setTimeout(() => this.heartbeatTimeout(), this.heartbeatIntervalMs);
  }
  flushSendBuffer() {
    this.isConnected() && this.sendBuffer.length > 0 && (this.sendBuffer.forEach((t) => t()), this.sendBuffer = []);
  }
  /**
  * @param {MessageEvent<any>} rawMessage
  */
  onConnMessage(t) {
    this.decode(t.data, (e) => {
      let { topic: r, event: n, payload: s, ref: i, join_ref: o } = e;
      if (i && i === this.pendingHeartbeatRef) {
        const a = this.heartbeatSentAt ? Date.now() - this.heartbeatSentAt : void 0;
        this.clearHeartbeats();
        try {
          this.heartbeatCallback(s.status === "ok" ? "ok" : "error", a);
        } catch (l) {
          this.log("error", "error in heartbeat callback", l);
        }
        this.pendingHeartbeatRef = null, this.heartbeatSentAt = null, this.autoSendHeartbeat && (this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatIntervalMs));
      }
      this.hasLogger() && this.log("receive", `${s.status || ""} ${r} ${n} ${i && "(" + i + ")" || ""}`.trim(), s);
      for (let a = 0; a < this.channels.length; a++) {
        const l = this.channels[a];
        l.isMember(r, n, s, o) && l.trigger(n, s, i, o);
      }
      this.triggerStateCallbacks("message", e);
    });
  }
  /**
   * @private
   * @template {keyof SocketStateChangeCallbacks} K
   * @param {K} event
   * @param {...Parameters<SocketStateChangeCallbacks[K][number][1]>} args
   * @returns {void}
   */
  triggerStateCallbacks(t, ...e) {
    try {
      this.stateChangeCallbacks[t].forEach(([r, n]) => {
        try {
          n(...e);
        } catch (s) {
          this.log("error", `error in ${t} callback`, s);
        }
      });
    } catch (r) {
      this.log("error", `error triggering ${t} callbacks`, r);
    }
  }
  leaveOpenTopic(t) {
    let e = this.channels.find((r) => r.topic === t && (r.isJoined() || r.isJoining()));
    e && (this.hasLogger() && this.log("transport", `leaving duplicate topic "${t}"`), e.leave());
  }
};
class pt {
  constructor(e, r) {
    const n = ra(r);
    this.presence = new Zo(e.getChannel(), n), this.presence.onJoin((s, i, o) => {
      const a = pt.onJoinPayload(s, i, o);
      e.getChannel().trigger("presence", a);
    }), this.presence.onLeave((s, i, o) => {
      const a = pt.onLeavePayload(s, i, o);
      e.getChannel().trigger("presence", a);
    }), this.presence.onSync(() => {
      e.getChannel().trigger("presence", { event: "sync" });
    });
  }
  get state() {
    return pt.transformState(this.presence.state);
  }
  /**
   * @private
   * Remove 'metas' key
   * Change 'phx_ref' to 'presence_ref'
   * Remove 'phx_ref' and 'phx_ref_prev'
   *
   * @example Transform state
   * // returns {
   *  abc123: [
   *    { presence_ref: '2', user_id: 1 },
   *    { presence_ref: '3', user_id: 2 }
   *  ]
   * }
   * RealtimePresence.transformState({
   *  abc123: {
   *    metas: [
   *      { phx_ref: '2', phx_ref_prev: '1' user_id: 1 },
   *      { phx_ref: '3', user_id: 2 }
   *    ]
   *  }
   * })
   *
   */
  static transformState(e) {
    return e = ta(e), Object.getOwnPropertyNames(e).reduce((r, n) => {
      const s = e[n];
      return r[n] = qt(s), r;
    }, {});
  }
  static onJoinPayload(e, r, n) {
    const s = Mn(r), i = qt(n);
    return {
      event: "join",
      key: e,
      currentPresences: s,
      newPresences: i
    };
  }
  static onLeavePayload(e, r, n) {
    const s = Mn(r), i = qt(n);
    return {
      event: "leave",
      key: e,
      currentPresences: s,
      leftPresences: i
    };
  }
}
function qt(t) {
  return t.metas.map((e) => {
    const r = Object.getOwnPropertyDescriptors(e), n = Object.defineProperties({}, r);
    return n.presence_ref = n.phx_ref, delete n.phx_ref, delete n.phx_ref_prev, n;
  });
}
function ta(t) {
  return JSON.parse(JSON.stringify(t));
}
function ra(t) {
  return (t == null ? void 0 : t.events) && { events: t.events };
}
function Mn(t) {
  return t != null && t.metas ? qt(t) : [];
}
var Fn;
(function(t) {
  t.SYNC = "sync", t.JOIN = "join", t.LEAVE = "leave";
})(Fn || (Fn = {}));
class na {
  get state() {
    return this.presenceAdapter.state;
  }
  /**
   * Creates a Presence helper that keeps the local presence state in sync with the server.
   *
   * @param channel - The realtime channel to bind to.
   * @param opts - Optional custom event names, e.g. `{ events: { state: 'state', diff: 'diff' } }`.
   *
   * @category Realtime
   *
   * @example Example for a presence channel
   * ```ts
   * const presence = new RealtimePresence(channel)
   *
   * channel.on('presence', ({ event, key }) => {
   *   console.log(`Presence ${event} on ${key}`)
   * })
   * ```
   */
  constructor(e, r) {
    this.channel = e, this.presenceAdapter = new pt(this.channel.channelAdapter, r);
  }
}
function sa(t) {
  if (t instanceof Error)
    return t;
  if (typeof t == "string")
    return new Error(t);
  if (t && typeof t == "object") {
    const e = t;
    if (typeof e.code == "number") {
      const r = typeof e.reason == "string" && e.reason ? ` (${e.reason})` : "";
      return new Error(`socket closed: ${e.code}${r}`, { cause: t });
    }
    return new Error("channel error: transport failure", { cause: t });
  }
  return new Error("channel error: connection lost");
}
class ia {
  constructor(e, r, n) {
    const s = oa(n);
    this.channel = e.getSocket().channel(r, s), this.socket = e;
  }
  get state() {
    return this.channel.state;
  }
  set state(e) {
    this.channel.state = e;
  }
  get joinedOnce() {
    return this.channel.joinedOnce;
  }
  get joinPush() {
    return this.channel.joinPush;
  }
  get rejoinTimer() {
    return this.channel.rejoinTimer;
  }
  on(e, r) {
    return this.channel.on(e, r);
  }
  off(e, r) {
    this.channel.off(e, r);
  }
  subscribe(e) {
    return this.channel.join(e);
  }
  unsubscribe(e) {
    return this.channel.leave(e);
  }
  teardown() {
    this.channel.teardown();
  }
  onClose(e) {
    this.channel.onClose(e);
  }
  onError(e) {
    return this.channel.onError(e);
  }
  push(e, r, n) {
    let s;
    try {
      s = this.channel.push(e, r, n);
    } catch {
      throw new Error(`tried to push '${e}' to '${this.channel.topic}' before joining. Use channel.subscribe() before pushing events`);
    }
    if (this.channel.pushBuffer.length > Do) {
      const i = this.channel.pushBuffer.shift();
      i.cancelTimeout(), this.socket.log("channel", `discarded push due to buffer overflow: ${i.event}`, i.payload());
    }
    return s;
  }
  updateJoinPayload(e) {
    const r = this.channel.joinPush.payload();
    this.channel.joinPush.payload = () => Object.assign(Object.assign({}, r), e);
  }
  canPush() {
    return this.socket.isConnected() && this.state === Ee.joined;
  }
  isJoined() {
    return this.state === Ee.joined;
  }
  isJoining() {
    return this.state === Ee.joining;
  }
  isClosed() {
    return this.state === Ee.closed;
  }
  isLeaving() {
    return this.state === Ee.leaving;
  }
  updateFilterBindings(e) {
    this.channel.filterBindings = e;
  }
  updatePayloadTransform(e) {
    this.channel.onMessage = e;
  }
  /**
   * @internal
   */
  getChannel() {
    return this.channel;
  }
}
function oa(t) {
  return {
    config: Object.assign({
      broadcast: { ack: !1, self: !1 },
      presence: { key: "", enabled: !1 },
      private: !1
    }, t.config)
  };
}
const aa = /[,()"\\]/, la = (t) => aa.test(t) || t !== t.trim(), ca = (t) => `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`, Hn = (t) => {
  const e = t === null ? "null" : String(t);
  return la(e) ? ca(e) : e;
}, ua = (t) => t === null ? "null" : String(t), da = (t, e) => {
  if (t === "in") {
    const r = Array.isArray(e) ? e : [e];
    if (r.length === 0)
      throw new Error("Realtime `in` filter requires at least one value.");
    return `in.(${Array.from(new Set(r)).map((s) => Hn(s)).join(",")})`;
  }
  return t === "is" ? `is.${ua(e)}` : `${t}.${Hn(e)}`;
};
class ha {
  constructor() {
    this.filters = [];
  }
  add(e, r, n, s = !1) {
    const i = s ? "not." : "";
    return this.filters.push(`${e}=${i}${da(r, n)}`), this;
  }
  /** Match rows where `column` equals `value` (`column=eq.value`). */
  eq(e, r) {
    return this.add(e, "eq", r);
  }
  /** Match rows where `column` does not equal `value` (`column=neq.value`). */
  neq(e, r) {
    return this.add(e, "neq", r);
  }
  /** Match rows where `column` is greater than `value` (`column=gt.value`). */
  gt(e, r) {
    return this.add(e, "gt", r);
  }
  /** Match rows where `column` is greater than or equal to `value` (`column=gte.value`). */
  gte(e, r) {
    return this.add(e, "gte", r);
  }
  /** Match rows where `column` is less than `value` (`column=lt.value`). */
  lt(e, r) {
    return this.add(e, "lt", r);
  }
  /** Match rows where `column` is less than or equal to `value` (`column=lte.value`). */
  lte(e, r) {
    return this.add(e, "lte", r);
  }
  /**
   * Match rows where `column` is one of `values` (`column=in.(a,b,c)`).
   * Requires at least one value; duplicates are removed. An element containing a
   * reserved character is double-quoted (`in.("a,b",c)`), so commas inside an
   * element are preserved. `null` is intentionally not accepted (`IN (null)`
   * never matches in SQL) — use `is`/`not('col','is',null)` for null checks.
   */
  in(e, r) {
    return this.add(e, "in", r);
  }
  /** Match rows where `column` matches the case-sensitive `pattern` (`column=like.pattern`). */
  like(e, r) {
    return this.add(e, "like", r);
  }
  /** Match rows where `column` matches the case-insensitive `pattern` (`column=ilike.pattern`). */
  ilike(e, r) {
    return this.add(e, "ilike", r);
  }
  /** Match rows where `column` matches the POSIX regex `pattern` (`column=match.pattern`). */
  match(e, r) {
    return this.add(e, "match", r);
  }
  /** Match rows where `column` matches the case-insensitive POSIX regex `pattern` (`column=imatch.pattern`). */
  imatch(e, r) {
    return this.add(e, "imatch", r);
  }
  /**
   * Match rows where `column` `IS` the given value (`column=is.null`).
   * Accepts `null`, a boolean, or the keywords `'null' | 'true' | 'false' | 'unknown'`.
   */
  is(e, r) {
    return this.add(e, "is", r);
  }
  /** Match rows where `column` is distinct from `value` (`column=isdistinct.value`). NULL-safe inequality. */
  isDistinct(e, r) {
    return this.add(e, "isdistinct", r);
  }
  not(e, r, n) {
    return this.add(e, r, n, !0);
  }
  /**
   * Serialize all conditions into the comma-separated (AND) filter string.
   *
   * Conditions are joined by commas, which the server applies as `AND`. A scalar
   * value (or single `in` element) that contains a reserved character — `,`,
   * `(`, `)`, `"`, `\` — or surrounding whitespace is double-quoted and escaped
   * the way PostgREST does, so commas inside a value are preserved rather than
   * read as a condition boundary.
   */
  build() {
    return this.filters.join(",");
  }
  /** Alias for {@link build}; lets the builder be used wherever a string is expected. */
  toString() {
    return this.build();
  }
}
var zn;
(function(t) {
  t.ALL = "*", t.INSERT = "INSERT", t.UPDATE = "UPDATE", t.DELETE = "DELETE";
})(zn || (zn = {}));
var Ne;
(function(t) {
  t.BROADCAST = "broadcast", t.PRESENCE = "presence", t.POSTGRES_CHANGES = "postgres_changes", t.SYSTEM = "system";
})(Ne || (Ne = {}));
var ge;
(function(t) {
  t.SUBSCRIBED = "SUBSCRIBED", t.TIMED_OUT = "TIMED_OUT", t.CLOSED = "CLOSED", t.CHANNEL_ERROR = "CHANNEL_ERROR";
})(ge || (ge = {}));
class me {
  get state() {
    return this.channelAdapter.state;
  }
  set state(e) {
    this.channelAdapter.state = e;
  }
  get joinedOnce() {
    return this.channelAdapter.joinedOnce;
  }
  get timeout() {
    return this.socket.timeout;
  }
  get joinPush() {
    return this.channelAdapter.joinPush;
  }
  get rejoinTimer() {
    return this.channelAdapter.rejoinTimer;
  }
  /**
   * Creates a channel that can broadcast messages, sync presence, and listen to Postgres changes.
   *
   * The topic determines which realtime stream you are subscribing to. Config options let you
   * enable acknowledgement for broadcasts, presence tracking, or private channels.
   *
   * @category Realtime
   *
   * @example Using supabase-js (recommended)
   * ```ts
   * import { createClient } from '@supabase/supabase-js'
   *
   * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
   * const channel = supabase.channel('room1')
   * channel
   *   .on('broadcast', { event: 'cursor-pos' }, (payload) => console.log(payload))
   *   .subscribe()
   * ```
   *
   * @example Standalone import for bundle-sensitive environments
   * ```ts
   * import RealtimeClient from '@supabase/realtime-js'
   *
   * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
   *   params: { apikey: 'your-publishable-key' },
   * })
   * const channel = new RealtimeChannel('realtime:public:messages', { config: {} }, client)
   * ```
   */
  constructor(e, r = { config: {} }, n) {
    var s, i;
    if (this.topic = e, this.params = r, this.socket = n, this.bindings = {}, this.subTopic = e.replace(/^realtime:/i, ""), this.params.config = Object.assign({
      broadcast: { ack: !1, self: !1 },
      presence: { key: "", enabled: !1 },
      private: !1
    }, r.config), this.channelAdapter = new ia(this.socket.socketAdapter, e, this.params), this.presence = new na(this), this._onClose(() => {
      this.socket._remove(this);
    }), this._updateFilterTransform(), this.broadcastEndpointURL = gi(this.socket.socketAdapter.endPointURL()), this.private = this.params.config.private || !1, !this.private && (!((i = (s = this.params.config) === null || s === void 0 ? void 0 : s.broadcast) === null || i === void 0) && i.replay))
      throw new Error(`tried to use replay on public channel '${this.topic}'. It must be a private channel.`);
  }
  /**
   * Subscribe registers your client with the server.
   *
   * The optional `callback` receives a `status` and, on failure, an `err` argument.
   * Log the full `err` so its `cause`, `name`, and any structured fields aren't hidden
   * behind `err.message`.
   *
   * @category Realtime
   *
   * @example Handling errors
   * ```js
   * supabase.channel('room1').subscribe((status, err) => {
   *   if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
   *     // Log the full error: its `cause` often holds the underlying reason.
   *     console.error(status, err)
   *   }
   * })
   * ```
   */
  subscribe(e, r = this.timeout) {
    var n, s, i, o;
    if (this.socket.isConnected() || this.socket.connect(), this.channelAdapter.isClosed()) {
      const { config: { broadcast: a, presence: l, private: c, postgres_changes_options: u } } = this.params, d = (s = (n = this.bindings.postgres_changes) === null || n === void 0 ? void 0 : n.map((m) => m.filter)) !== null && s !== void 0 ? s : [], p = !!this.bindings[Ne.PRESENCE] && this.bindings[Ne.PRESENCE].length > 0 || ((i = this.params.config.presence) === null || i === void 0 ? void 0 : i.enabled) === !0, h = {}, f = Object.assign({ broadcast: a, presence: Object.assign(Object.assign({}, l), { enabled: p }), postgres_changes: d, private: c }, u ? { postgres_changes_options: u } : {});
      this.socket.accessTokenValue && (h.access_token = this.socket.accessTokenValue), this._onError((m) => {
        e == null || e(ge.CHANNEL_ERROR, sa(m));
      }), this._onClose(() => e == null ? void 0 : e(ge.CLOSED)), this.updateJoinPayload(Object.assign({ config: f }, h)), this._updateFilterMessage();
      const g = u != null && u.wait && d.length > 0 ? Math.max(r, ((o = u.timeout) !== null && o !== void 0 ? o : $o) + Lo) : r;
      this.channelAdapter.subscribe(g).receive("ok", async ({ postgres_changes: m }) => {
        if (this.socket._isManualToken() || this.socket.setAuth(), m === void 0) {
          e == null || e(ge.SUBSCRIBED);
          return;
        }
        this._updatePostgresBindings(m, e);
      }).receive("error", (m) => {
        this.state = Ee.errored;
        const y = Object.values(m).join(", ") || "error";
        e == null || e(ge.CHANNEL_ERROR, new Error(y, { cause: m }));
      }).receive("timeout", () => {
        e == null || e(ge.TIMED_OUT);
      });
    }
    return this;
  }
  _updatePostgresBindings(e, r) {
    var n;
    const s = this.bindings.postgres_changes, i = (n = s == null ? void 0 : s.length) !== null && n !== void 0 ? n : 0, o = [];
    for (let a = 0; a < i; a++) {
      const l = s[a], { filter: { event: c, schema: u, table: d, filter: p } } = l, h = e && e[a];
      if (h && h.event === c && me.isFilterValueEqual(h.schema, u) && me.isFilterValueEqual(h.table, d) && me.isFilterValueEqual(h.filter, p))
        o.push(Object.assign(Object.assign({}, l), { id: h.id }));
      else {
        this.unsubscribe(), this.state = Ee.errored, r == null || r(ge.CHANNEL_ERROR, new Error("mismatch between server and client bindings for postgres changes"));
        return;
      }
    }
    this.bindings.postgres_changes = o, this.state != Ee.errored && r && r(ge.SUBSCRIBED);
  }
  /**
   * Returns the current presence state for this channel.
   *
   * The shape is a map keyed by presence key (for example a user id) where each entry contains the
   * tracked metadata for that user.
   *
   * @category Realtime
   */
  presenceState() {
    return this.presence.state;
  }
  /**
   * Sends the supplied payload to the presence tracker so other subscribers can see that this
   * client is online. Use `untrack` to stop broadcasting presence for the same key.
   *
   * Tracking makes this client visible to other subscribers immediately, regardless of this
   * channel's `config.presence.enabled` setting or whether it has a `presence` listener — that
   * flag only affects whether *this* client receives presence updates from others (and, on
   * RLS-protected channels, whether it's authorized to do so).
   *
   * @category Realtime
   */
  async track(e, r = {}) {
    return await this.send({
      type: "presence",
      event: "track",
      payload: e
    }, r);
  }
  /**
   * Removes the current presence state for this client.
   *
   * @category Realtime
   */
  async untrack(e = {}) {
    return await this.send({
      type: "presence",
      event: "untrack"
    }, e);
  }
  /**
   * Listen to realtime events on this channel.
   * @category Realtime
   *
   * @remarks
   * - By default, Broadcast and Presence are enabled for all projects.
   * - By default, listening to database changes is disabled for new projects due to database performance and security concerns. You can turn it on by managing Realtime's [replication](/docs/guides/api#realtime-api-overview).
   * - You can receive the "previous" data for updates and deletes by setting the table's `REPLICA IDENTITY` to `FULL` (e.g., `ALTER TABLE your_table REPLICA IDENTITY FULL;`).
   * - Row level security is not applied to delete statements. When RLS is enabled and replica identity is set to full, only the primary key is sent to clients.
   *
   * @example Listen to broadcast messages
   * ```js
   * const channel = supabase.channel("room1")
   *
   * channel.on("broadcast", { event: "cursor-pos" }, (payload) => {
   *   console.log("Cursor position received!", payload);
   * }).subscribe((status) => {
   *   if (status === "SUBSCRIBED") {
   *     channel.send({
   *       type: "broadcast",
   *       event: "cursor-pos",
   *       payload: { x: Math.random(), y: Math.random() },
   *     });
   *   }
   * });
   * ```
   *
   * @example Listen to presence sync
   * ```js
   * const channel = supabase.channel('room1')
   * channel
   *   .on('presence', { event: 'sync' }, () => {
   *     console.log('Synced presence state: ', channel.presenceState())
   *   })
   *   .subscribe(async (status) => {
   *     if (status === 'SUBSCRIBED') {
   *       await channel.track({ online_at: new Date().toISOString() })
   *     }
   *   })
   * ```
   *
   * @example Listen to presence join
   * ```js
   * const channel = supabase.channel('room1')
   * channel
   *   .on('presence', { event: 'join' }, ({ newPresences }) => {
   *     console.log('Newly joined presences: ', newPresences)
   *   })
   *   .subscribe(async (status) => {
   *     if (status === 'SUBSCRIBED') {
   *       await channel.track({ online_at: new Date().toISOString() })
   *     }
   *   })
   * ```
   *
   * @example Listen to presence leave
   * ```js
   * const channel = supabase.channel('room1')
   * channel
   *   .on('presence', { event: 'leave' }, ({ leftPresences }) => {
   *     console.log('Newly left presences: ', leftPresences)
   *   })
   *   .subscribe(async (status) => {
   *     if (status === 'SUBSCRIBED') {
   *       await channel.track({ online_at: new Date().toISOString() })
   *       await channel.untrack()
   *     }
   *   })
   * ```
   *
   * Registering the same `postgres_changes` filter more than once on a channel is a no-op: the
   * duplicate is ignored and an error is logged, since the server only ever creates one
   * subscription per distinct filter.
   *
   * @example Listen to all database changes
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: '*', schema: '*' }, payload => {
   *     console.log('Change received!', payload)
   *   })
   *   .subscribe()
   * ```
   *
   * @example Listen to a specific table
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: '*', schema: 'public', table: 'countries' }, payload => {
   *     console.log('Change received!', payload)
   *   })
   *   .subscribe()
   * ```
   *
   * @example Listen to inserts
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'countries' }, payload => {
   *     console.log('Change received!', payload)
   *   })
   *   .subscribe()
   * ```
   *
   * @exampleDescription Listen to updates
   * By default, Supabase will send only the updated record. If you want to receive the previous values as well you can
   * enable full replication for the table you are listening to:
   *
   * ```sql
   * alter table "your_table" replica identity full;
   * ```
   *
   * @example Listen to updates
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'countries' }, payload => {
   *     console.log('Change received!', payload)
   *   })
   *   .subscribe()
   * ```
   *
   * @exampleDescription Listen to deletes
   * By default, Supabase does not send deleted records. If you want to receive the deleted record you can
   * enable full replication for the table you are listening to:
   *
   * ```sql
   * alter table "your_table" replica identity full;
   * ```
   *
   * @example Listen to deletes
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'countries' }, payload => {
   *     console.log('Change received!', payload)
   *   })
   *   .subscribe()
   * ```
   *
   * @exampleDescription Listen to multiple events
   * You can chain listeners if you want to listen to multiple events for each table.
   *
   * @example Listen to multiple events
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'countries' }, handleRecordInserted)
   *   .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'countries' }, handleRecordDeleted)
   *   .subscribe()
   * ```
   *
   * @exampleDescription Listen to row level changes
   * You can listen to individual rows using the format `{table}:{col}=eq.{val}` - where `{col}` is the column name, and `{val}` is the value which you want to match.
   *
   * @example Listen to row level changes
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'countries', filter: 'id=eq.200' }, handleRecordUpdated)
   *   .subscribe()
   * ```
   */
  on(e, r, n) {
    const s = this.channelAdapter.isJoined() || this.channelAdapter.isJoining(), i = e === Ne.PRESENCE || e === Ne.POSTGRES_CHANGES;
    if (s && i)
      throw this.socket.log("channel", `cannot add \`${e}\` callbacks for ${this.topic} after \`subscribe()\`.`), new Error(`cannot add \`${e}\` callbacks for ${this.topic} after \`subscribe()\`.`);
    return this._on(e, r, n);
  }
  /**
   * Sends a broadcast message explicitly via REST API.
   *
   * This method always uses the REST API endpoint regardless of WebSocket connection state.
   * Useful when you want to guarantee REST delivery or when gradually migrating from implicit REST fallback.
   *
   * Payloads that are `ArrayBuffer` or `ArrayBufferView` (e.g. `Uint8Array`) are sent as
   * `application/octet-stream`; all other payloads are JSON-encoded.
   *
   * @param event The name of the broadcast event
   * @param payload Payload to be sent (required)
   * @param opts Options including timeout
   * @returns Promise resolving to object with success status, and error details if failed
   *
   * @category Realtime
   */
  async httpSend(e, r, n = {}) {
    var s;
    if (r == null)
      return Promise.reject(new Error("Payload is required for httpSend()"));
    const i = r instanceof ArrayBuffer || ArrayBuffer.isView(r), o = {
      apikey: this.socket.apiKey ? this.socket.apiKey : "",
      "Content-Type": i ? "application/octet-stream" : "application/json"
    };
    this.socket.accessTokenValue && (o.Authorization = `Bearer ${this.socket.accessTokenValue}`);
    const a = new URL(this.broadcastEndpointURL);
    a.pathname += `/${encodeURIComponent(this.subTopic)}/events/${encodeURIComponent(e)}`, this.private && a.searchParams.set("private", "true");
    const l = {
      method: "POST",
      headers: o,
      body: i ? r : JSON.stringify(r)
    }, c = await this._fetchWithTimeout(a.toString(), l, (s = n.timeout) !== null && s !== void 0 ? s : this.timeout);
    if (c.status === 202)
      return { success: !0 };
    if (c.status === 404)
      return Promise.reject(new Error("httpSend() requires Realtime server v2.97.0 or newer; the endpoint returned 404. Update your Supabase CLI to a recent version, or upgrade the Realtime server in your self-hosted setup. See https://github.com/supabase/supabase-js/blob/master/packages/core/realtime-js/migrations/httpsend-server-version.md"));
    let u = c.statusText;
    try {
      const d = await c.json();
      u = d.error || d.message || u;
    } catch {
    }
    return Promise.reject(new Error(u));
  }
  /**
   * Sends a message into the channel.
   *
   * @param args Arguments to send to channel
   * @param args.type The type of event to send
   * @param args.event The name of the event being sent
   * @param args.payload Payload to be sent
   * @param opts Options to be used during the send process
   *
   * @category Realtime
   *
   * @remarks
   * - When using REST you don't need to subscribe to the channel
   * - REST calls are only available from 2.37.0 onwards
   * - If you create a channel only to send a REST broadcast, remove it from
   *   the client when the send completes
   *
   * @example Send a message via websocket
   * ```js
   * const channel = supabase.channel('room1')
   *
   * channel.subscribe((status) => {
   *   if (status === 'SUBSCRIBED') {
   *     channel.send({
   *       type: 'broadcast',
   *       event: 'cursor-pos',
   *       payload: { x: Math.random(), y: Math.random() },
   *     })
   *   }
   * })
   * ```
   *
   * @exampleResponse Send a message via websocket
   * ```js
   * ok | timed out | error
   * ```
   *
   * @example Send a message via REST
   * ```js
   * const channel = supabase.channel('room1')
   *
   * try {
   *   await channel.httpSend('cursor-pos', { x: Math.random(), y: Math.random() })
   * } finally {
   *   await supabase.removeChannel(channel)
   * }
   * ```
   */
  async send(e, r = {}) {
    var n, s;
    if (!this.channelAdapter.canPush() && e.type === "broadcast") {
      const i = "Realtime send() is automatically falling back to REST API. This behavior will be deprecated in the future. Please use httpSend() explicitly for REST delivery.";
      this.socket.hasLogger() ? this.socket.log("channel", i) : console.warn(i);
      const { event: o, payload: a } = e, l = {
        apikey: this.socket.apiKey ? this.socket.apiKey : "",
        "Content-Type": "application/json"
      };
      this.socket.accessTokenValue && (l.Authorization = `Bearer ${this.socket.accessTokenValue}`);
      const c = {
        method: "POST",
        headers: l,
        body: JSON.stringify({
          messages: [
            {
              topic: this.subTopic,
              event: o,
              payload: a,
              private: this.private
            }
          ]
        })
      };
      try {
        const u = await this._fetchWithTimeout(this.broadcastEndpointURL, c, (n = r.timeout) !== null && n !== void 0 ? n : this.timeout);
        return await ((s = u.body) === null || s === void 0 ? void 0 : s.cancel()), u.ok ? "ok" : "error";
      } catch (u) {
        return u instanceof Error && u.name === "AbortError" ? "timed out" : "error";
      }
    } else
      return new Promise((i) => {
        var o, a, l;
        const c = this.channelAdapter.push(e.type, e, r.timeout || this.timeout);
        e.type === "broadcast" && !(!((l = (a = (o = this.params) === null || o === void 0 ? void 0 : o.config) === null || a === void 0 ? void 0 : a.broadcast) === null || l === void 0) && l.ack) && i("ok"), c.receive("ok", () => i("ok")), c.receive("error", () => i("error")), c.receive("timeout", () => i("timed out"));
      });
  }
  /**
   * Updates the payload that will be sent the next time the channel joins (reconnects).
   * Useful for rotating access tokens or updating config without re-creating the channel.
   *
   * @category Realtime
   */
  updateJoinPayload(e) {
    this.channelAdapter.updateJoinPayload(e);
  }
  /**
   * Leaves the channel.
   *
   * Unsubscribes from server events, and instructs channel to terminate on server.
   * Triggers onClose() hooks.
   *
   * To receive leave acknowledgements, use the a `receive` hook to bind to the server ack, ie:
   * channel.unsubscribe().receive("ok", () => alert("left!") )
   *
   * @category Realtime
   */
  async unsubscribe(e = this.timeout) {
    return new Promise((r) => {
      this.channelAdapter.unsubscribe(e).receive("ok", () => r("ok")).receive("timeout", () => r("timed out")).receive("error", () => r("error"));
    });
  }
  /**
   * Destroys and stops related timers.
   *
   * @category Realtime
   */
  teardown() {
    this.channelAdapter.teardown();
  }
  /** @internal */
  async _fetchWithTimeout(e, r, n) {
    const s = new AbortController(), i = setTimeout(() => s.abort(), n), o = await this.socket.fetch(e, Object.assign(Object.assign({}, r), { signal: s.signal }));
    return clearTimeout(i), o;
  }
  /** @internal */
  _on(e, r, n) {
    var s;
    const i = e.toLocaleLowerCase(), o = r == null ? void 0 : r.filter;
    if ((o instanceof ha || typeof o == "object" && o !== null && typeof o.build == "function") && (r = Object.assign(Object.assign({}, r), { filter: o.build() })), i === Ne.POSTGRES_CHANGES && ((s = this.bindings[i]) === null || s === void 0 ? void 0 : s.find((u) => me.isSamePostgresFilter(u.filter, r))))
      return this.socket.log("error", `duplicate \`postgres_changes\` binding for ${this.topic} ignored`, r), this;
    const a = this.channelAdapter.on(e, n), l = {
      type: i,
      filter: r,
      callback: n,
      ref: a
    };
    return this.bindings[i] ? this.bindings[i].push(l) : this.bindings[i] = [l], this._updateFilterMessage(), this;
  }
  /**
   * Registers a callback that will be executed when the channel closes.
   *
   * @internal
   */
  _onClose(e) {
    this.channelAdapter.onClose(e);
  }
  /**
   * Registers a callback that will be executed when the channel encounteres an error.
   *
   * @internal
   */
  _onError(e) {
    this.channelAdapter.onError(e);
  }
  /** @internal */
  _updateFilterMessage() {
    this.channelAdapter.updateFilterBindings((e, r, n) => {
      var s, i, o, a, l, c, u;
      const d = e.event.toLocaleLowerCase();
      if (this._notThisChannelEvent(d, n))
        return !1;
      const p = (s = this.bindings[d]) === null || s === void 0 ? void 0 : s.find((h) => h.ref === e.ref);
      if (!p)
        return !0;
      if (["broadcast", "presence", "postgres_changes"].includes(d))
        if ("id" in p) {
          const h = p.id, f = (i = p.filter) === null || i === void 0 ? void 0 : i.event;
          return h && ((o = r.ids) === null || o === void 0 ? void 0 : o.includes(h)) && (f === "*" || (f == null ? void 0 : f.toLocaleLowerCase()) === ((a = r.data) === null || a === void 0 ? void 0 : a.type.toLocaleLowerCase()));
        } else {
          const h = (c = (l = p == null ? void 0 : p.filter) === null || l === void 0 ? void 0 : l.event) === null || c === void 0 ? void 0 : c.toLocaleLowerCase();
          return h === "*" || h === ((u = r == null ? void 0 : r.event) === null || u === void 0 ? void 0 : u.toLocaleLowerCase());
        }
      else
        return p.type.toLocaleLowerCase() === d;
    });
  }
  /** @internal */
  _notThisChannelEvent(e, r) {
    const { close: n, error: s, leave: i, join: o } = fi;
    return r && [n, s, i, o].includes(e) && r !== this.joinPush.ref;
  }
  /** @internal */
  _updateFilterTransform() {
    this.channelAdapter.updatePayloadTransform((e, r, n) => {
      if (typeof r == "object" && "ids" in r) {
        const s = r.data, { schema: i, table: o, commit_timestamp: a, type: l, errors: c } = s;
        return Object.assign(Object.assign({}, {
          schema: i,
          table: o,
          commit_timestamp: a,
          eventType: l,
          new: {},
          old: {},
          errors: c
        }), this._getPayloadRecords(s));
      }
      return r;
    });
  }
  copyBindings(e) {
    if (this.joinedOnce)
      throw new Error("cannot copy bindings into joined channel");
    for (const r in e.bindings)
      for (const n of e.bindings[r])
        this._on(n.type, n.filter, n.callback);
  }
  /**
   * Compares two optional filter values for equality.
   * Treats undefined, null, and empty string as equivalent empty values.
   * @internal
   */
  static isFilterValueEqual(e, r) {
    return (e ?? void 0) === (r ?? void 0);
  }
  /**
   * Two `postgres_changes` filters are the same when the server would collapse them into a single
   * subscription.
   * @internal
   */
  static isSamePostgresFilter(e, r) {
    var n, s, i, o;
    const a = (s = (n = e == null ? void 0 : e.select) === null || n === void 0 ? void 0 : n.join()) !== null && s !== void 0 ? s : void 0, l = (o = (i = r == null ? void 0 : r.select) === null || i === void 0 ? void 0 : i.join()) !== null && o !== void 0 ? o : void 0;
    return (e == null ? void 0 : e.event) === (r == null ? void 0 : r.event) && me.isFilterValueEqual(e == null ? void 0 : e.schema, r == null ? void 0 : r.schema) && me.isFilterValueEqual(e == null ? void 0 : e.table, r == null ? void 0 : r.table) && me.isFilterValueEqual(e == null ? void 0 : e.filter, r == null ? void 0 : r.filter) && a === l;
  }
  /** @internal */
  _getPayloadRecords(e) {
    const r = {
      new: {},
      old: {}
    };
    return (e.type === "INSERT" || e.type === "UPDATE") && (r.new = qn(e.columns, e.record)), (e.type === "UPDATE" || e.type === "DELETE") && (r.old = qn(e.columns, e.old_record)), r;
  }
}
class fa {
  constructor(e, r) {
    this.socket = new ea(e, r);
  }
  get timeout() {
    return this.socket.timeout;
  }
  get endPoint() {
    return this.socket.endPoint;
  }
  get transport() {
    return this.socket.transport;
  }
  get heartbeatIntervalMs() {
    return this.socket.heartbeatIntervalMs;
  }
  get heartbeatCallback() {
    return this.socket.heartbeatCallback;
  }
  set heartbeatCallback(e) {
    this.socket.heartbeatCallback = e;
  }
  get heartbeatTimer() {
    return this.socket.heartbeatTimer;
  }
  get pendingHeartbeatRef() {
    return this.socket.pendingHeartbeatRef;
  }
  get reconnectTimer() {
    return this.socket.reconnectTimer;
  }
  get vsn() {
    return this.socket.vsn;
  }
  get encode() {
    return this.socket.encode;
  }
  get decode() {
    return this.socket.decode;
  }
  get reconnectAfterMs() {
    return this.socket.reconnectAfterMs;
  }
  get sendBuffer() {
    return this.socket.sendBuffer;
  }
  get stateChangeCallbacks() {
    return this.socket.stateChangeCallbacks;
  }
  connect() {
    this.socket.connect();
  }
  disconnect(e, r, n, s = 1e4) {
    return new Promise((i) => {
      setTimeout(() => i("timeout"), s), this.socket.disconnect(() => {
        e(), i("ok");
      }, r, n);
    });
  }
  push(e) {
    this.socket.push(e);
  }
  log(e, r, n) {
    this.socket.log(e, r, n);
  }
  hasLogger() {
    return this.socket.hasLogger();
  }
  makeRef() {
    return this.socket.makeRef();
  }
  onOpen(e) {
    this.socket.onOpen(e);
  }
  onClose(e) {
    this.socket.onClose(e);
  }
  onError(e) {
    this.socket.onError(e);
  }
  onMessage(e) {
    this.socket.onMessage(e);
  }
  isConnected() {
    return this.socket.isConnected();
  }
  isConnecting() {
    return this.socket.connectionState() == Mr.connecting;
  }
  isDisconnecting() {
    return this.socket.connectionState() == Mr.closing;
  }
  connectionState() {
    return this.socket.connectionState();
  }
  endPointURL() {
    return this.socket.endPointURL();
  }
  sendHeartbeat() {
    this.socket.sendHeartbeat();
  }
  /**
   * @internal
   */
  getSocket() {
    return this.socket;
  }
}
const Wn = {
  HEARTBEAT_INTERVAL: 25e3
}, pa = [1e3, 2e3, 5e3, 1e4], ga = 1e4;
function ma() {
  const t = /* @__PURE__ */ new Map();
  return {
    get length() {
      return t.size;
    },
    clear() {
      t.clear();
    },
    getItem(e) {
      return t.has(e) ? t.get(e) : null;
    },
    key(e) {
      var r;
      return (r = Array.from(t.keys())[e]) !== null && r !== void 0 ? r : null;
    },
    removeItem(e) {
      t.delete(e);
    },
    setItem(e, r) {
      t.set(e, String(r));
    }
  };
}
function ya() {
  try {
    if (typeof globalThis < "u" && globalThis.sessionStorage)
      return globalThis.sessionStorage;
  } catch {
  }
  return ma();
}
const _a = `
  addEventListener("message", (e) => {
    if (e.data.event === "start") {
      setInterval(() => postMessage({ event: "keepAlive" }), e.data.interval);
    }
  });`;
class wa {
  get endPoint() {
    return this.socketAdapter.endPoint;
  }
  get timeout() {
    return this.socketAdapter.timeout;
  }
  get transport() {
    return this.socketAdapter.transport;
  }
  get heartbeatCallback() {
    return this.socketAdapter.heartbeatCallback;
  }
  get heartbeatIntervalMs() {
    return this.socketAdapter.heartbeatIntervalMs;
  }
  get heartbeatTimer() {
    return this.worker ? this._workerHeartbeatTimer : this.socketAdapter.heartbeatTimer;
  }
  get pendingHeartbeatRef() {
    return this.worker ? this._pendingWorkerHeartbeatRef : this.socketAdapter.pendingHeartbeatRef;
  }
  get reconnectTimer() {
    return this.socketAdapter.reconnectTimer;
  }
  get vsn() {
    return this.socketAdapter.vsn;
  }
  get encode() {
    return this.socketAdapter.encode;
  }
  get decode() {
    return this.socketAdapter.decode;
  }
  get reconnectAfterMs() {
    return this.socketAdapter.reconnectAfterMs;
  }
  get sendBuffer() {
    return this.socketAdapter.sendBuffer;
  }
  get stateChangeCallbacks() {
    return this.socketAdapter.stateChangeCallbacks;
  }
  /**
   * Initializes the Socket.
   *
   * @param endPoint The string WebSocket endpoint, ie, "ws://example.com/socket", "wss://example.com", "/socket" (inherited host & protocol)
   * @param options.transport The Websocket Transport, for example WebSocket. This can be a custom implementation
   * @param options.timeout The default timeout in milliseconds to trigger push timeouts.
   * @param options.params The optional params to pass when connecting.
   * @param options.headers Deprecated: headers cannot be set on websocket connections and this option will be removed in the future.
   * @param options.heartbeatIntervalMs The millisec interval to send a heartbeat message.
   * @param options.heartbeatCallback The optional function to handle heartbeat status and latency.
   * @param options.logger The optional function for specialized logging, ie: logger: (kind, msg, data) => { console.log(`${kind}: ${msg}`, data) }
   * @param options.logLevel Sets the log level for Realtime
   * @param options.encode The function to encode outgoing messages. Defaults to JSON: (payload, callback) => callback(JSON.stringify(payload))
   * @param options.decode The function to decode incoming messages. Defaults to Serializer's decode.
   * @param options.reconnectAfterMs he optional function that returns the millsec reconnect interval. Defaults to stepped backoff off.
   * @param options.worker Use Web Worker to set a side flow. Defaults to false.
   * @param options.workerUrl The URL of the worker script. Defaults to https://realtime.supabase.com/worker.js that includes a heartbeat event call to keep the connection alive.
   * @param options.vsn The protocol version to use when connecting. Supported versions are "1.0.0" and "2.0.0". Defaults to "2.0.0".
   *
   * @category Realtime
   *
   * @example Using supabase-js (recommended)
   * ```ts
   * import { createClient } from '@supabase/supabase-js'
   *
   * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
   * const channel = supabase.channel('room1')
   * channel
   *   .on('broadcast', { event: 'cursor-pos' }, (payload) => console.log(payload))
   *   .subscribe()
   * ```
   *
   * @example Standalone import for bundle-sensitive environments
   * ```ts
   * import RealtimeClient from '@supabase/realtime-js'
   *
   * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
   *   params: { apikey: 'your-publishable-key' },
   * })
   * client.connect()
   * ```
   */
  constructor(e, r) {
    var n;
    if (this.channels = new Array(), this.accessTokenValue = null, this.accessToken = null, this.apiKey = null, this.httpEndpoint = "", this.headers = {}, this.params = {}, this.ref = 0, this.serializer = new Uo(), this._manuallySetToken = !1, this._authPromise = null, this._authGeneration = 0, this._workerHeartbeatTimer = void 0, this._pendingWorkerHeartbeatRef = null, this._pendingDisconnectTimer = null, this._disconnectOnEmptyChannelsAfterMs = 0, this._resolveFetch = (i) => i ? (...o) => i(...o) : (...o) => fetch(...o), !(!((n = r == null ? void 0 : r.params) === null || n === void 0) && n.apikey))
      throw new Error("API key is required to connect to Realtime");
    this.apiKey = r.params.apikey;
    const s = this._initializeOptions(r);
    this.socketAdapter = new fa(e, s), this.httpEndpoint = gi(e), this.fetch = this._resolveFetch(r == null ? void 0 : r.fetch);
  }
  /**
   * Connects the socket, unless already connected.
   *
   * @category Realtime
   */
  connect() {
    if (!(this.isConnecting() || this.isDisconnecting() || this.isConnected())) {
      this.accessToken && !this._authPromise && this._setAuthSafely("connect"), this._setupConnectionHandlers();
      try {
        this.socketAdapter.connect();
      } catch (e) {
        const r = e.message;
        throw new Error(`WebSocket not available: ${r}`);
      }
      this._handleNodeJsRaceCondition();
    }
  }
  /**
   * Returns the URL of the websocket.
   * @returns string The URL of the websocket.
   *
   * @category Realtime
   */
  endpointURL() {
    return this.socketAdapter.endPointURL();
  }
  /**
   * Disconnects the socket.
   *
   * @param code A numeric status code to send on disconnect.
   * @param reason A custom reason for the disconnect.
   *
   * @category Realtime
   */
  async disconnect(e, r) {
    return this._cancelPendingDisconnect(), this.isDisconnecting() ? "ok" : await this.socketAdapter.disconnect(() => {
      clearInterval(this._workerHeartbeatTimer), this._terminateWorker();
    }, e, r);
  }
  /**
   * Returns all created channels
   *
   * @category Realtime
   */
  getChannels() {
    return this.channels;
  }
  /**
   * Unsubscribes, removes and tears down a single channel
   * @param channel A RealtimeChannel instance
   *
   * @category Realtime
   */
  async removeChannel(e) {
    const r = await e.unsubscribe();
    return r === "ok" && e.teardown(), r;
  }
  /**
   * Unsubscribes, removes and tears down all channels
   *
   * @category Realtime
   */
  async removeAllChannels() {
    const e = this.channels.map(async (n) => {
      const s = await n.unsubscribe();
      return n.teardown(), s;
    }), r = await Promise.all(e);
    return await this.disconnect(), r;
  }
  /**
   * Logs the message.
   *
   * For customized logging, `this.logger` can be overridden in Client constructor.
   *
   * @category Realtime
   */
  log(e, r, n) {
    this.socketAdapter.log(e, r, n);
  }
  /**
   * Returns true if a custom `logger` has been configured on this client.
   *
   * @category Realtime
   */
  hasLogger() {
    return this.socketAdapter.hasLogger();
  }
  /**
   * Returns the current state of the socket.
   *
   * @category Realtime
   */
  connectionState() {
    return this.socketAdapter.connectionState() || Mr.closed;
  }
  /**
   * Returns `true` is the connection is open.
   *
   * @category Realtime
   */
  isConnected() {
    return this.socketAdapter.isConnected();
  }
  /**
   * Returns `true` if the connection is currently connecting.
   *
   * @category Realtime
   */
  isConnecting() {
    return this.socketAdapter.isConnecting();
  }
  /**
   * Returns `true` if the connection is currently disconnecting.
   *
   * @category Realtime
   */
  isDisconnecting() {
    return this.socketAdapter.isDisconnecting();
  }
  /**
   * Creates (or reuses) a {@link RealtimeChannel} for the provided topic.
   *
   * Topics are automatically prefixed with `realtime:` to match the Realtime service.
   * If a channel with the same topic already exists it will be returned instead of creating
   * a duplicate connection.
   *
   * @category Realtime
   */
  channel(e, r = { config: {} }) {
    const n = `realtime:${e}`, s = this.getChannels().find((i) => i.topic === n);
    if (s)
      return s;
    {
      const i = new me(`realtime:${e}`, r, this);
      return this._cancelPendingDisconnect(), this.channels.push(i), i;
    }
  }
  /**
   * Push out a message if the socket is connected.
   *
   * If the socket is not connected, the message gets enqueued within a local buffer, and sent out when a connection is next established.
   *
   * @category Realtime
   */
  push(e) {
    this.socketAdapter.push(e);
  }
  /**
   * Sets the JWT access token used for channel subscription authorization and Realtime RLS.
   *
   * If param is null it will use the `accessToken` callback function or the token set on the client.
   *
   * On callback used, it will set the value of the token internal to the client.
   *
   * When a token is explicitly provided AND no `accessToken` callback is configured,
   * it will be preserved across channel operations (including removeChannel and
   * resubscribe) and the client stays in manual-token mode.
   *
   * When an `accessToken` callback IS configured, the callback is the source of truth:
   * the client remains in callback mode and continues to refresh from it on heartbeat,
   * even after a bootstrap/override `setAuth(token)` call.
   *
   * The callback is called on connect and on every heartbeat (`heartbeatIntervalMs`,
   * default 25000ms). Its token must stay valid past the next call, or the server closes
   * the channel at expiry with no automatic resubscribe.
   *
   * @param token A JWT string to override the token set on the client.
   *
   * @example Setting the authorization header
   * // Use a manual token (preserved across resubscribes when no accessToken callback is set)
   * client.realtime.setAuth('my-custom-jwt')
   *
   * // Switch back to using the accessToken callback
   * client.realtime.setAuth()
   *
   * @category Realtime
   */
  async setAuth(e = null) {
    const r = ++this._authGeneration, n = this._performAuth(e, r);
    r === this._authGeneration && (this._authPromise = n);
    try {
      await n;
    } finally {
      this._authPromise === n && (this._authPromise = null);
    }
  }
  /**
   * Returns true if the current access token was explicitly set via setAuth(token),
   * false if it was obtained via the accessToken callback.
   * @internal
   */
  _isManualToken() {
    return this._manuallySetToken;
  }
  /**
   * Sends a heartbeat message if the socket is connected.
   *
   * @category Realtime
   */
  async sendHeartbeat() {
    this.socketAdapter.sendHeartbeat();
  }
  /**
   * Sets a callback that receives lifecycle events for internal heartbeat messages.
   * Useful for instrumenting connection health (e.g. sent/ok/timeout).
   *
   * @category Realtime
   */
  onHeartbeat(e) {
    this.socketAdapter.heartbeatCallback = this._wrapHeartbeatCallback(e);
  }
  /**
   * Return the next message ref, accounting for overflows
   *
   * @internal
   */
  _makeRef() {
    return this.socketAdapter.makeRef();
  }
  /**
   * Removes a channel from RealtimeClient
   *
   * @param channel An open subscription.
   *
   * @internal
   */
  _remove(e) {
    this.channels = this.channels.filter((r) => r.topic !== e.topic), this.channels.length === 0 && (this.log("transport", "no channels remaining, scheduling disconnect"), this._schedulePendingDisconnect());
  }
  /** @internal */
  _schedulePendingDisconnect() {
    if (this._cancelPendingDisconnect(), this._disconnectOnEmptyChannelsAfterMs === 0) {
      this.log("transport", "disconnecting immediately - no channels"), this.disconnect();
      return;
    }
    this._pendingDisconnectTimer = setTimeout(() => {
      this._pendingDisconnectTimer = null, this.channels.length === 0 && (this.log("transport", "deferred disconnect fired - no channels, disconnecting"), this.disconnect());
    }, this._disconnectOnEmptyChannelsAfterMs), this.log("transport", `deferred disconnect scheduled in ${this._disconnectOnEmptyChannelsAfterMs}ms`);
  }
  /** @internal */
  _cancelPendingDisconnect() {
    this._pendingDisconnectTimer !== null && (this.log("transport", "pending disconnect cancelled - channel activity detected"), clearTimeout(this._pendingDisconnectTimer), this._pendingDisconnectTimer = null);
  }
  /**
   * Perform the actual auth operation
   * @internal
   */
  async _performAuth(e, r) {
    let n, s = !1;
    if (e)
      n = e, s = !0;
    else if (this.accessToken)
      try {
        n = await this.accessToken();
      } catch (i) {
        this.log("error", "Error fetching access token from callback", i), n = this.accessTokenValue;
      }
    else
      n = this.accessTokenValue;
    r === this._authGeneration && (this.accessToken ? this._manuallySetToken = !1 : s && (this._manuallySetToken = !0), this.accessTokenValue != n && (this.accessTokenValue = n, this.channels.forEach((i) => {
      const o = {
        access_token: n,
        version: Io
      };
      i.updateJoinPayload(o), i.joinedOnce && i.channelAdapter.isJoined() && i.channelAdapter.push(fi.access_token, {
        access_token: n
      });
    })));
  }
  /**
   * Wait for any in-flight auth operations to complete
   * @internal
   */
  async _waitForAuthIfNeeded() {
    this._authPromise && await this._authPromise;
  }
  /**
   * Safely call setAuth with standardized error handling
   * @internal
   */
  _setAuthSafely(e = "general") {
    this._isManualToken() || this.setAuth().catch((r) => {
      this.log("error", `Error setting auth in ${e}`, r);
    });
  }
  /** @internal */
  _setupConnectionHandlers() {
    this.socketAdapter.onOpen(() => {
      (this._authPromise || (this.accessToken && !this.accessTokenValue ? this.setAuth() : Promise.resolve())).catch((r) => {
        this.log("error", "error waiting for auth on connect", r);
      }), this.worker && !this.workerRef && this._startWorkerHeartbeat();
    }), this.socketAdapter.onClose(() => {
      this.worker && this.workerRef && this._terminateWorker();
    }), this.socketAdapter.onMessage((e) => {
      e.ref && e.ref === this._pendingWorkerHeartbeatRef && (this._pendingWorkerHeartbeatRef = null);
    });
  }
  /** @internal */
  _handleNodeJsRaceCondition() {
    this.socketAdapter.isConnected() && this.socketAdapter.getSocket().onConnOpen();
  }
  /** @internal */
  _wrapHeartbeatCallback(e) {
    return (r, n) => {
      r !== "disconnected" && (r == "sent" && this._setAuthSafely(), e && e(r, n));
    };
  }
  /** @internal */
  _startWorkerHeartbeat() {
    this.workerUrl ? this.log("worker", `starting worker for from ${this.workerUrl}`) : this.log("worker", "starting default worker");
    const e = this._workerObjectUrl(this.workerUrl);
    this.workerRef = new Worker(e), this.workerRef.onerror = (r) => {
      this.log("worker", "worker error", r.message), this._terminateWorker(), this.disconnect();
    }, this.workerRef.onmessage = (r) => {
      r.data.event === "keepAlive" && this.sendHeartbeat();
    }, this.workerRef.postMessage({
      event: "start",
      interval: this.heartbeatIntervalMs
    });
  }
  /**
   * Terminate the Web Worker and clear the reference
   * @internal
   */
  _terminateWorker() {
    this.workerRef && (this.log("worker", "terminating worker"), this.workerRef.terminate(), this.workerRef = void 0);
  }
  /** @internal */
  _workerObjectUrl(e) {
    let r;
    if (e)
      r = e;
    else {
      const n = new Blob([_a], { type: "application/javascript" });
      r = URL.createObjectURL(n);
    }
    return r;
  }
  /**
   * Initialize socket options with defaults
   * @internal
   */
  _initializeOptions(e) {
    var r, n, s, i, o, a, l, c, u, d, p, h;
    this.worker = (r = e == null ? void 0 : e.worker) !== null && r !== void 0 ? r : !1, this.accessToken = (n = e == null ? void 0 : e.accessToken) !== null && n !== void 0 ? n : null;
    const f = {};
    f.timeout = (s = e == null ? void 0 : e.timeout) !== null && s !== void 0 ? s : No, f.heartbeatIntervalMs = (i = e == null ? void 0 : e.heartbeatIntervalMs) !== null && i !== void 0 ? i : Wn.HEARTBEAT_INTERVAL, this._disconnectOnEmptyChannelsAfterMs = (o = e == null ? void 0 : e.disconnectOnEmptyChannelsAfterMs) !== null && o !== void 0 ? o : 2 * ((a = e == null ? void 0 : e.heartbeatIntervalMs) !== null && a !== void 0 ? a : Wn.HEARTBEAT_INTERVAL), f.transport = (l = e == null ? void 0 : e.transport) !== null && l !== void 0 ? l : Oo.getWebSocketConstructor(), f.params = e == null ? void 0 : e.params, f.logger = e == null ? void 0 : e.logger, f.heartbeatCallback = this._wrapHeartbeatCallback(e == null ? void 0 : e.heartbeatCallback), f.sessionStorage = (c = e == null ? void 0 : e.sessionStorage) !== null && c !== void 0 ? c : ya(), f.reconnectAfterMs = (u = e == null ? void 0 : e.reconnectAfterMs) !== null && u !== void 0 ? u : ((_) => pa[_ - 1] || ga);
    let g, m;
    const y = (d = e == null ? void 0 : e.vsn) !== null && d !== void 0 ? d : Po;
    switch (y) {
      case jo:
        g = (_, w) => w(JSON.stringify(_)), m = (_, w) => w(JSON.parse(_));
        break;
      case hi:
        g = this.serializer.encode.bind(this.serializer), m = this.serializer.decode.bind(this.serializer);
        break;
      default:
        throw new Error(`Unsupported serializer version: ${f.vsn}`);
    }
    if (f.vsn = y, f.encode = (p = e == null ? void 0 : e.encode) !== null && p !== void 0 ? p : g, f.decode = (h = e == null ? void 0 : e.decode) !== null && h !== void 0 ? h : m, f.beforeReconnect = this._reconnectAuth.bind(this), (e != null && e.logLevel || e != null && e.log_level) && (this.logLevel = e.logLevel || e.log_level, f.params = Object.assign(Object.assign({}, f.params), { log_level: this.logLevel })), this.worker) {
      if (typeof window < "u" && !window.Worker)
        throw new Error("Web Worker is not supported");
      this.workerUrl = e == null ? void 0 : e.workerUrl, f.autoSendHeartbeat = !this.worker;
    }
    return f;
  }
  /** @internal */
  async _reconnectAuth() {
    await this._waitForAuthIfNeeded(), this.isConnected() || this.connect();
  }
}
var _t = class extends Error {
  constructor(t, e) {
    var r;
    super(t), this.name = "IcebergError", this.status = e.status, this.icebergType = e.icebergType, this.icebergCode = e.icebergCode, this.details = e.details, this.isCommitStateUnknown = e.icebergType === "CommitStateUnknownException" || [500, 502, 504].includes(e.status) && ((r = e.icebergType) == null ? void 0 : r.includes("CommitState")) === !0;
  }
  /**
   * Returns true if the error is a 404 Not Found error.
   */
  isNotFound() {
    return this.status === 404;
  }
  /**
   * Returns true if the error is a 409 Conflict error.
   */
  isConflict() {
    return this.status === 409;
  }
  /**
   * Returns true if the error is a 419 Authentication Timeout error.
   */
  isAuthenticationTimeout() {
    return this.status === 419;
  }
};
function va(t, e, r) {
  const n = new URL(e, t);
  if (r)
    for (const [s, i] of Object.entries(r))
      i !== void 0 && n.searchParams.set(s, i);
  return n.toString();
}
async function ba(t) {
  return !t || t.type === "none" ? {} : t.type === "bearer" ? { Authorization: `Bearer ${t.token}` } : t.type === "header" ? { [t.name]: t.value } : t.type === "custom" ? await t.getHeaders() : {};
}
function ka(t) {
  const e = t.fetchImpl ?? globalThis.fetch;
  return {
    async request({
      method: r,
      path: n,
      query: s,
      body: i,
      headers: o
    }) {
      const a = va(t.baseUrl, n, s), l = await ba(t.auth), c = await e(a, {
        method: r,
        headers: {
          ...i ? { "Content-Type": "application/json" } : {},
          ...l,
          ...o
        },
        body: i ? JSON.stringify(i) : void 0
      }), u = await c.text(), d = (c.headers.get("content-type") || "").includes("application/json"), p = d && u ? JSON.parse(u) : u;
      if (!c.ok) {
        const h = d ? p : void 0, f = h == null ? void 0 : h.error;
        throw new _t(
          (f == null ? void 0 : f.message) ?? `Request failed with status ${c.status}`,
          {
            status: c.status,
            icebergType: f == null ? void 0 : f.type,
            icebergCode: f == null ? void 0 : f.code,
            details: h
          }
        );
      }
      return { status: c.status, headers: c.headers, data: p };
    }
  };
}
function Ct(t) {
  return t.join("");
}
var Sa = class {
  constructor(t, e = "") {
    this.client = t, this.prefix = e;
  }
  async listNamespaces(t) {
    const e = t ? { parent: Ct(t.namespace) } : void 0;
    return (await this.client.request({
      method: "GET",
      path: `${this.prefix}/namespaces`,
      query: e
    })).data.namespaces.map((n) => ({ namespace: n }));
  }
  async createNamespace(t, e) {
    const r = {
      namespace: t.namespace,
      properties: e == null ? void 0 : e.properties
    };
    return (await this.client.request({
      method: "POST",
      path: `${this.prefix}/namespaces`,
      body: r
    })).data;
  }
  async dropNamespace(t) {
    await this.client.request({
      method: "DELETE",
      path: `${this.prefix}/namespaces/${Ct(t.namespace)}`
    });
  }
  async loadNamespaceMetadata(t) {
    return {
      properties: (await this.client.request({
        method: "GET",
        path: `${this.prefix}/namespaces/${Ct(t.namespace)}`
      })).data.properties
    };
  }
  async namespaceExists(t) {
    try {
      return await this.client.request({
        method: "HEAD",
        path: `${this.prefix}/namespaces/${Ct(t.namespace)}`
      }), !0;
    } catch (e) {
      if (e instanceof _t && e.status === 404)
        return !1;
      throw e;
    }
  }
  async createNamespaceIfNotExists(t, e) {
    try {
      return await this.createNamespace(t, e);
    } catch (r) {
      if (r instanceof _t && r.status === 409)
        return;
      throw r;
    }
  }
};
function ze(t) {
  return t.join("");
}
var Ea = class {
  constructor(t, e = "", r) {
    this.client = t, this.prefix = e, this.accessDelegation = r;
  }
  async listTables(t) {
    return (await this.client.request({
      method: "GET",
      path: `${this.prefix}/namespaces/${ze(t.namespace)}/tables`
    })).data.identifiers;
  }
  async createTable(t, e) {
    const r = {};
    return this.accessDelegation && (r["X-Iceberg-Access-Delegation"] = this.accessDelegation), (await this.client.request({
      method: "POST",
      path: `${this.prefix}/namespaces/${ze(t.namespace)}/tables`,
      body: e,
      headers: r
    })).data.metadata;
  }
  async updateTable(t, e) {
    const r = await this.client.request({
      method: "POST",
      path: `${this.prefix}/namespaces/${ze(t.namespace)}/tables/${t.name}`,
      body: e
    });
    return {
      "metadata-location": r.data["metadata-location"],
      metadata: r.data.metadata
    };
  }
  async dropTable(t, e) {
    await this.client.request({
      method: "DELETE",
      path: `${this.prefix}/namespaces/${ze(t.namespace)}/tables/${t.name}`,
      query: { purgeRequested: String((e == null ? void 0 : e.purge) ?? !1) }
    });
  }
  async loadTable(t) {
    const e = {};
    return this.accessDelegation && (e["X-Iceberg-Access-Delegation"] = this.accessDelegation), (await this.client.request({
      method: "GET",
      path: `${this.prefix}/namespaces/${ze(t.namespace)}/tables/${t.name}`,
      headers: e
    })).data.metadata;
  }
  async tableExists(t) {
    const e = {};
    this.accessDelegation && (e["X-Iceberg-Access-Delegation"] = this.accessDelegation);
    try {
      return await this.client.request({
        method: "HEAD",
        path: `${this.prefix}/namespaces/${ze(t.namespace)}/tables/${t.name}`,
        headers: e
      }), !0;
    } catch (r) {
      if (r instanceof _t && r.status === 404)
        return !1;
      throw r;
    }
  }
  async createTableIfNotExists(t, e) {
    try {
      return await this.createTable(t, e);
    } catch (r) {
      if (r instanceof _t && r.status === 409)
        return await this.loadTable({ namespace: t.namespace, name: e.name });
      throw r;
    }
  }
}, xa = class {
  /**
   * Creates a new Iceberg REST Catalog client.
   *
   * @param options - Configuration options for the catalog client
   */
  constructor(t) {
    var n;
    let e = "v1";
    t.catalogName && (e += `/${t.catalogName}`);
    const r = t.baseUrl.endsWith("/") ? t.baseUrl : `${t.baseUrl}/`;
    this.client = ka({
      baseUrl: r,
      auth: t.auth,
      fetchImpl: t.fetch
    }), this.accessDelegation = (n = t.accessDelegation) == null ? void 0 : n.join(","), this.namespaceOps = new Sa(this.client, e), this.tableOps = new Ea(this.client, e, this.accessDelegation);
  }
  /**
   * Lists all namespaces in the catalog.
   *
   * @param parent - Optional parent namespace to list children under
   * @returns Array of namespace identifiers
   *
   * @example
   * ```typescript
   * // List all top-level namespaces
   * const namespaces = await catalog.listNamespaces();
   *
   * // List namespaces under a parent
   * const children = await catalog.listNamespaces({ namespace: ['analytics'] });
   * ```
   */
  async listNamespaces(t) {
    return this.namespaceOps.listNamespaces(t);
  }
  /**
   * Creates a new namespace in the catalog.
   *
   * @param id - Namespace identifier to create
   * @param metadata - Optional metadata properties for the namespace
   * @returns Response containing the created namespace and its properties
   *
   * @example
   * ```typescript
   * const response = await catalog.createNamespace(
   *   { namespace: ['analytics'] },
   *   { properties: { owner: 'data-team' } }
   * );
   * console.log(response.namespace); // ['analytics']
   * console.log(response.properties); // { owner: 'data-team', ... }
   * ```
   */
  async createNamespace(t, e) {
    return this.namespaceOps.createNamespace(t, e);
  }
  /**
   * Drops a namespace from the catalog.
   *
   * The namespace must be empty (contain no tables) before it can be dropped.
   *
   * @param id - Namespace identifier to drop
   *
   * @example
   * ```typescript
   * await catalog.dropNamespace({ namespace: ['analytics'] });
   * ```
   */
  async dropNamespace(t) {
    await this.namespaceOps.dropNamespace(t);
  }
  /**
   * Loads metadata for a namespace.
   *
   * @param id - Namespace identifier to load
   * @returns Namespace metadata including properties
   *
   * @example
   * ```typescript
   * const metadata = await catalog.loadNamespaceMetadata({ namespace: ['analytics'] });
   * console.log(metadata.properties);
   * ```
   */
  async loadNamespaceMetadata(t) {
    return this.namespaceOps.loadNamespaceMetadata(t);
  }
  /**
   * Lists all tables in a namespace.
   *
   * @param namespace - Namespace identifier to list tables from
   * @returns Array of table identifiers
   *
   * @example
   * ```typescript
   * const tables = await catalog.listTables({ namespace: ['analytics'] });
   * console.log(tables); // [{ namespace: ['analytics'], name: 'events' }, ...]
   * ```
   */
  async listTables(t) {
    return this.tableOps.listTables(t);
  }
  /**
   * Creates a new table in the catalog.
   *
   * @param namespace - Namespace to create the table in
   * @param request - Table creation request including name, schema, partition spec, etc.
   * @returns Table metadata for the created table
   *
   * @example
   * ```typescript
   * const metadata = await catalog.createTable(
   *   { namespace: ['analytics'] },
   *   {
   *     name: 'events',
   *     schema: {
   *       type: 'struct',
   *       fields: [
   *         { id: 1, name: 'id', type: 'long', required: true },
   *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
   *       ],
   *       'schema-id': 0
   *     },
   *     'partition-spec': {
   *       'spec-id': 0,
   *       fields: [
   *         { source_id: 2, field_id: 1000, name: 'ts_day', transform: 'day' }
   *       ]
   *     }
   *   }
   * );
   * ```
   */
  async createTable(t, e) {
    return this.tableOps.createTable(t, e);
  }
  /**
   * Updates an existing table's metadata.
   *
   * Can update the schema, partition spec, or properties of a table.
   *
   * @param id - Table identifier to update
   * @param request - Update request with fields to modify
   * @returns Response containing the metadata location and updated table metadata
   *
   * @example
   * ```typescript
   * const response = await catalog.updateTable(
   *   { namespace: ['analytics'], name: 'events' },
   *   {
   *     properties: { 'read.split.target-size': '134217728' }
   *   }
   * );
   * console.log(response['metadata-location']); // s3://...
   * console.log(response.metadata); // TableMetadata object
   * ```
   */
  async updateTable(t, e) {
    return this.tableOps.updateTable(t, e);
  }
  /**
   * Drops a table from the catalog.
   *
   * @param id - Table identifier to drop
   *
   * @example
   * ```typescript
   * await catalog.dropTable({ namespace: ['analytics'], name: 'events' });
   * ```
   */
  async dropTable(t, e) {
    await this.tableOps.dropTable(t, e);
  }
  /**
   * Loads metadata for a table.
   *
   * @param id - Table identifier to load
   * @returns Table metadata including schema, partition spec, location, etc.
   *
   * @example
   * ```typescript
   * const metadata = await catalog.loadTable({ namespace: ['analytics'], name: 'events' });
   * console.log(metadata.schema);
   * console.log(metadata.location);
   * ```
   */
  async loadTable(t) {
    return this.tableOps.loadTable(t);
  }
  /**
   * Checks if a namespace exists in the catalog.
   *
   * @param id - Namespace identifier to check
   * @returns True if the namespace exists, false otherwise
   *
   * @example
   * ```typescript
   * const exists = await catalog.namespaceExists({ namespace: ['analytics'] });
   * console.log(exists); // true or false
   * ```
   */
  async namespaceExists(t) {
    return this.namespaceOps.namespaceExists(t);
  }
  /**
   * Checks if a table exists in the catalog.
   *
   * @param id - Table identifier to check
   * @returns True if the table exists, false otherwise
   *
   * @example
   * ```typescript
   * const exists = await catalog.tableExists({ namespace: ['analytics'], name: 'events' });
   * console.log(exists); // true or false
   * ```
   */
  async tableExists(t) {
    return this.tableOps.tableExists(t);
  }
  /**
   * Creates a namespace if it does not exist.
   *
   * If the namespace already exists, returns void. If created, returns the response.
   *
   * @param id - Namespace identifier to create
   * @param metadata - Optional metadata properties for the namespace
   * @returns Response containing the created namespace and its properties, or void if it already exists
   *
   * @example
   * ```typescript
   * const response = await catalog.createNamespaceIfNotExists(
   *   { namespace: ['analytics'] },
   *   { properties: { owner: 'data-team' } }
   * );
   * if (response) {
   *   console.log('Created:', response.namespace);
   * } else {
   *   console.log('Already exists');
   * }
   * ```
   */
  async createNamespaceIfNotExists(t, e) {
    return this.namespaceOps.createNamespaceIfNotExists(t, e);
  }
  /**
   * Creates a table if it does not exist.
   *
   * If the table already exists, returns its metadata instead.
   *
   * @param namespace - Namespace to create the table in
   * @param request - Table creation request including name, schema, partition spec, etc.
   * @returns Table metadata for the created or existing table
   *
   * @example
   * ```typescript
   * const metadata = await catalog.createTableIfNotExists(
   *   { namespace: ['analytics'] },
   *   {
   *     name: 'events',
   *     schema: {
   *       type: 'struct',
   *       fields: [
   *         { id: 1, name: 'id', type: 'long', required: true },
   *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
   *       ],
   *       'schema-id': 0
   *     }
   *   }
   * );
   * ```
   */
  async createTableIfNotExists(t, e) {
    return this.tableOps.createTableIfNotExists(t, e);
  }
};
function wt(t) {
  "@babel/helpers - typeof";
  return wt = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
    return typeof e;
  } : function(e) {
    return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
  }, wt(t);
}
function Aa(t, e) {
  if (wt(t) != "object" || !t) return t;
  var r = t[Symbol.toPrimitive];
  if (r !== void 0) {
    var n = r.call(t, e);
    if (wt(n) != "object") return n;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (e === "string" ? String : Number)(t);
}
function Ta(t) {
  var e = Aa(t, "string");
  return wt(e) == "symbol" ? e : e + "";
}
function Ra(t, e, r) {
  return (e = Ta(e)) in t ? Object.defineProperty(t, e, {
    value: r,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : t[e] = r, t;
}
function Kn(t, e) {
  var r = Object.keys(t);
  if (Object.getOwnPropertySymbols) {
    var n = Object.getOwnPropertySymbols(t);
    e && (n = n.filter(function(s) {
      return Object.getOwnPropertyDescriptor(t, s).enumerable;
    })), r.push.apply(r, n);
  }
  return r;
}
function x(t) {
  for (var e = 1; e < arguments.length; e++) {
    var r = arguments[e] != null ? arguments[e] : {};
    e % 2 ? Kn(Object(r), !0).forEach(function(n) {
      Ra(t, n, r[n]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(r)) : Kn(Object(r)).forEach(function(n) {
      Object.defineProperty(t, n, Object.getOwnPropertyDescriptor(r, n));
    });
  }
  return t;
}
var ur = class extends Error {
  constructor(t, e = "storage", r, n) {
    super(t), this.__isStorageError = !0, this.namespace = e, this.name = e === "vectors" ? "StorageVectorsError" : "StorageError", this.status = r, this.statusCode = n;
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusCode: this.statusCode
    };
  }
};
function dr(t) {
  return typeof t == "object" && t !== null && "__isStorageError" in t;
}
var Wr = class extends ur {
  constructor(t, e, r, n = "storage", s) {
    super(t, n, e, r), this.name = n === "vectors" ? "StorageVectorsApiError" : "StorageApiError", this.status = e, this.statusCode = r, this.code = s;
  }
  toJSON() {
    return x(x({}, super.toJSON()), {}, { code: this.code });
  }
}, yi = class extends ur {
  constructor(t, e, r = "storage") {
    super(t, r), this.name = r === "vectors" ? "StorageVectorsUnknownError" : "StorageUnknownError", this.originalError = e;
  }
};
function Kt(t, e, r) {
  const n = x({}, t), s = e.toLowerCase();
  for (const i of Object.keys(n)) i.toLowerCase() === s && delete n[i];
  return n[s] = r, n;
}
function Oa(t) {
  const e = {};
  for (const [r, n] of Object.entries(t)) e[r.toLowerCase()] = n;
  return e;
}
const Ca = (t) => t ? (...e) => t(...e) : (...e) => fetch(...e), Ia = (t) => {
  if (typeof t != "object" || t === null) return !1;
  const e = Object.getPrototypeOf(t);
  return (e === null || e === Object.prototype || Object.getPrototypeOf(e) === null) && !(Symbol.toStringTag in t) && !(Symbol.iterator in t);
}, Kr = (t) => {
  if (Array.isArray(t)) return t.map((r) => Kr(r));
  if (typeof t == "function" || t !== Object(t)) return t;
  const e = {};
  return Object.entries(t).forEach(([r, n]) => {
    const s = r.replace(/([-_][a-z])/gi, (i) => i.toUpperCase().replace(/[-_]/g, ""));
    e[s] = Kr(n);
  }), e;
}, ja = (t) => !t || typeof t != "string" || t.length === 0 || t.length > 100 || t.trim() !== t || t.includes("/") || t.includes("\\") ? !1 : /^[\w!.\*'() &$@=;:+,?-]+$/.test(t), Vr = (t) => t.split("/").map(encodeURIComponent).join("/"), Vn = (t) => {
  if (typeof t == "object" && t !== null) {
    const e = t;
    if (typeof e.msg == "string") return e.msg;
    if (typeof e.message == "string") return e.message;
    if (typeof e.error_description == "string") return e.error_description;
    if (typeof e.error == "string") return e.error;
    if (typeof e.error == "object" && e.error !== null) {
      const r = e.error;
      if (typeof r.message == "string") return r.message;
    }
  }
  return JSON.stringify(t);
}, Pa = async (t, e, r, n) => {
  if (t !== null && typeof t == "object" && "json" in t && typeof t.json == "function") {
    const s = t;
    let i = parseInt(String(s.status), 10);
    Number.isFinite(i) || (i = 500), s.json().then((o) => {
      const a = (o == null ? void 0 : o.statusCode) || (o == null ? void 0 : o.code) || i + "";
      e(new Wr(Vn(o), i, a, n, o == null ? void 0 : o.code));
    }).catch(() => {
      const o = i + "";
      e(new Wr(s.statusText || `HTTP ${i} error`, i, o, n));
    });
  } else e(new yi(Vn(t), t, n));
}, Na = (t, e, r, n) => {
  const s = {
    method: t,
    headers: (e == null ? void 0 : e.headers) || {}
  };
  if (t === "GET" || t === "HEAD" || !n) return x(x({}, s), r);
  if (Ia(n)) {
    var i;
    const o = (e == null ? void 0 : e.headers) || {};
    let a;
    for (const [l, c] of Object.entries(o)) l.toLowerCase() === "content-type" && (a = c);
    s.headers = Kt(o, "Content-Type", (i = a) !== null && i !== void 0 ? i : "application/json"), s.body = JSON.stringify(n);
  } else s.body = n;
  return e != null && e.duplex && (s.duplex = e.duplex), x(x({}, s), r);
};
async function lt(t, e, r, n, s, i, o) {
  return new Promise((a, l) => {
    t(r, Na(e, n, s, i)).then((c) => {
      if (!c.ok) throw c;
      if (n != null && n.noResolveJson) return c;
      if (o === "vectors") {
        const u = c.headers.get("content-type");
        if (c.headers.get("content-length") === "0" || c.status === 204) return {};
        if (!u || !u.includes("application/json")) return {};
      }
      return c.json();
    }).then((c) => a(c)).catch((c) => Pa(c, l, n, o));
  });
}
function _i(t = "storage") {
  return {
    get: async (e, r, n, s) => lt(e, "GET", r, n, s, void 0, t),
    post: async (e, r, n, s, i) => lt(e, "POST", r, s, i, n, t),
    put: async (e, r, n, s, i) => lt(e, "PUT", r, s, i, n, t),
    head: async (e, r, n, s) => lt(e, "HEAD", r, x(x({}, n), {}, { noResolveJson: !0 }), s, void 0, t),
    remove: async (e, r, n, s, i) => lt(e, "DELETE", r, s, i, n, t)
  };
}
const $a = _i("storage"), { get: Ze, post: te, put: Vt, head: La, remove: et } = $a, G = _i("vectors");
var nt = class {
  /**
  * Creates a new BaseApiClient instance
  * @param url - Base URL for API requests
  * @param headers - Default headers for API requests
  * @param fetch - Optional custom fetch implementation
  * @param namespace - Error namespace ('storage' or 'vectors')
  */
  constructor(t, e = {}, r, n = "storage") {
    this.shouldThrowOnError = !1, this.url = t, this.headers = Oa(e), this.fetch = Ca(r), this.namespace = n;
  }
  /**
  * Enable throwing errors instead of returning them.
  * When enabled, errors are thrown instead of returned in { data, error } format.
  *
  * @returns this - For method chaining
  */
  throwOnError() {
    return this.shouldThrowOnError = !0, this;
  }
  /**
  * Set an HTTP header for the request.
  * Creates a shallow copy of headers to avoid mutating shared state.
  *
  * @param name - Header name
  * @param value - Header value
  * @returns this - For method chaining
  */
  setHeader(t, e) {
    return this.headers = Kt(this.headers, t, e), this;
  }
  /**
  * Handles API operation with standardized error handling
  * Eliminates repetitive try-catch blocks across all API methods
  *
  * This wrapper:
  * 1. Executes the operation
  * 2. Returns { data, error: null } on success
  * 3. Returns { data: null, error } on failure (if shouldThrowOnError is false)
  * 4. Throws error on failure (if shouldThrowOnError is true)
  *
  * @typeParam T - The expected data type from the operation
  * @param operation - Async function that performs the API call
  * @returns Promise with { data, error } tuple
  *
  * @example Handling an operation
  * ```typescript
  * async listBuckets() {
  *   return this.handleOperation(async () => {
  *     return await get(this.fetch, `${this.url}/bucket`, {
  *       headers: this.headers,
  *     })
  *   })
  * }
  * ```
  */
  async handleOperation(t) {
    var e = this;
    try {
      return {
        data: await t(),
        error: null
      };
    } catch (r) {
      if (e.shouldThrowOnError) throw r;
      if (dr(r)) return {
        data: null,
        error: r
      };
      throw r;
    }
  }
};
let wi;
wi = Symbol.toStringTag;
var Da = class {
  constructor(t, e) {
    this.downloadFn = t, this.shouldThrowOnError = e, this[wi] = "StreamDownloadBuilder", this.promise = null;
  }
  then(t, e) {
    return this.getPromise().then(t, e);
  }
  catch(t) {
    return this.getPromise().catch(t);
  }
  finally(t) {
    return this.getPromise().finally(t);
  }
  getPromise() {
    return this.promise || (this.promise = this.execute()), this.promise;
  }
  async execute() {
    var t = this;
    try {
      return {
        data: (await t.downloadFn()).body,
        error: null
      };
    } catch (e) {
      if (t.shouldThrowOnError) throw e;
      if (dr(e)) return {
        data: null,
        error: e
      };
      throw e;
    }
  }
};
let vi;
vi = Symbol.toStringTag;
var Ua = class {
  constructor(t, e) {
    this.downloadFn = t, this.shouldThrowOnError = e, this[vi] = "BlobDownloadBuilder", this.promise = null;
  }
  asStream() {
    return new Da(this.downloadFn, this.shouldThrowOnError);
  }
  then(t, e) {
    return this.getPromise().then(t, e);
  }
  catch(t) {
    return this.getPromise().catch(t);
  }
  finally(t) {
    return this.getPromise().finally(t);
  }
  getPromise() {
    return this.promise || (this.promise = this.execute()), this.promise;
  }
  async execute() {
    var t = this;
    try {
      return {
        data: await (await t.downloadFn()).blob(),
        error: null
      };
    } catch (e) {
      if (t.shouldThrowOnError) throw e;
      if (dr(e)) return {
        data: null,
        error: e
      };
      throw e;
    }
  }
};
const _r = {
  limit: 100,
  offset: 0,
  sortBy: {
    column: "name",
    order: "asc"
  }
}, Jn = {
  cacheControl: "3600",
  contentType: "text/plain;charset=UTF-8",
  upsert: !1
};
var Ba = class extends nt {
  constructor(t, e = {}, r, n) {
    super(t, e, n, "storage"), this.bucketId = r;
  }
  /**
  * Uploads a file to an existing bucket or replaces an existing file at the specified path with a new one.
  *
  * @param method HTTP method.
  * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
  * @param fileBody The body of the file to be stored in the bucket.
  */
  async uploadOrUpdate(t, e, r, n) {
    var s = this;
    return s.handleOperation(async () => {
      let i;
      const o = x(x({}, Jn), n);
      let a = x(x({}, s.headers), t === "POST" && { "x-upsert": String(o.upsert) });
      const l = o.metadata;
      if (typeof Blob < "u" && r instanceof Blob || typeof FormData < "u" && r instanceof FormData ? i = s.prepareUploadFormData(r, o) : (i = r, a["cache-control"] = `max-age=${o.cacheControl}`, a["content-type"] = o.contentType, o.contentEncoding && (a["content-encoding"] = o.contentEncoding), l && (a["x-metadata"] = s.toBase64(s.encodeMetadata(l))), (typeof ReadableStream < "u" && i instanceof ReadableStream || i && typeof i == "object" && "pipe" in i && typeof i.pipe == "function") && !o.duplex && (o.duplex = "half")), n != null && n.headers) for (const [p, h] of Object.entries(n.headers)) a = Kt(a, p, h);
      const c = s._removeEmptyFolders(e), u = s._getFinalPath(c), d = await (t == "PUT" ? Vt : te)(s.fetch, `${s.url}/object/${u}`, i, x({ headers: a }, o != null && o.duplex ? { duplex: o.duplex } : {}));
      return {
        path: c,
        id: d.Id,
        fullPath: d.Key
      };
    });
  }
  /**
  * Uploads a file to an existing bucket.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
  * @param fileBody The body of the file to be stored in the bucket.
  * @param fileOptions Optional file upload options including cacheControl, contentType, contentEncoding, upsert, and metadata.
  * @returns Promise with response containing file path, id, and fullPath or error
  *
  * @example Upload file
  * ```js
  * const avatarFile = event.target.files[0]
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .upload('public/avatar1.png', avatarFile, {
  *     cacheControl: '3600',
  *     upsert: false
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "public/avatar1.png",
  *     "fullPath": "avatars/public/avatar1.png"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @example Upload file using `ArrayBuffer` from base64 file data
  * ```js
  * import { decode } from 'base64-arraybuffer'
  *
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .upload('public/avatar1.png', decode('base64FileData'), {
  *     contentType: 'image/png'
  *   })
  * ```
  *
  * @example Handling errors
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .upload('public/avatar1.png', avatarFile)
  *
  * if (error) {
  *   // Log the full error so fields like `statusCode` and `error` (the
  *   // Storage error name, e.g. "Duplicate") aren't hidden behind `error.message`.
  *   console.error(error)
  *   return
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: only `insert` when you are uploading new files and `select`, `insert` and `update` when you are upserting files
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  * - For React Native, using either `Blob`, `File` or `FormData` does not work as intended. Upload file using `ArrayBuffer` from base64 file data instead, see example below.
  */
  async upload(t, e, r) {
    return this.uploadOrUpdate("POST", t, e, r);
  }
  /**
  * Upload a file with a token generated from `createSignedUploadUrl`.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
  * @param token The token generated from `createSignedUploadUrl`
  * @param fileBody The body of the file to be stored in the bucket.
  * @param fileOptions HTTP headers (cacheControl, contentType, contentEncoding, etc.).
  * **Note:** The `upsert` option has no effect here. To enable upsert behavior,
  * pass `{ upsert: true }` when calling `createSignedUploadUrl()` instead.
  * @returns Promise with response containing file path and fullPath or error
  *
  * @example Upload to a signed URL
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .uploadToSignedUrl('folder/cat.jpg', 'token-from-createSignedUploadUrl', file)
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "folder/cat.jpg",
  *     "fullPath": "avatars/folder/cat.jpg"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: none
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async uploadToSignedUrl(t, e, r, n) {
    var s = this;
    const i = s._removeEmptyFolders(t), o = s._getFinalPath(i), a = new URL(s.url + `/object/upload/sign/${o}`);
    return a.searchParams.set("token", e), s.handleOperation(async () => {
      let l;
      const c = x(x({}, Jn), n);
      let u = x(x({}, s.headers), { "x-upsert": String(c.upsert) });
      const d = c.metadata;
      if (typeof Blob < "u" && r instanceof Blob || typeof FormData < "u" && r instanceof FormData ? l = s.prepareUploadFormData(r, c) : (l = r, u["cache-control"] = `max-age=${c.cacheControl}`, u["content-type"] = c.contentType, c.contentEncoding && (u["content-encoding"] = c.contentEncoding), d && (u["x-metadata"] = s.toBase64(s.encodeMetadata(d))), (typeof ReadableStream < "u" && l instanceof ReadableStream || l && typeof l == "object" && "pipe" in l && typeof l.pipe == "function") && !c.duplex && (c.duplex = "half")), n != null && n.headers) for (const [p, h] of Object.entries(n.headers)) u = Kt(u, p, h);
      return {
        path: i,
        fullPath: (await Vt(s.fetch, a.toString(), l, x({ headers: u }, c != null && c.duplex ? { duplex: c.duplex } : {}))).Key
      };
    });
  }
  /**
  * Creates a signed upload URL.
  * Signed upload URLs can be used to upload files to the bucket without further authentication.
  * They are valid for 2 hours.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param path The file path, including the current file name. For example `folder/image.png`.
  * @param options.upsert If set to true, allows the file to be overwritten if it already exists.
  * @returns Promise with response containing signed upload URL, token, and path or error
  *
  * @example Create Signed Upload URL
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUploadUrl('folder/cat.jpg')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "signedUrl": "https://example.supabase.co/storage/v1/object/upload/sign/avatars/folder/cat.jpg?token=<TOKEN>",
  *     "path": "folder/cat.jpg",
  *     "token": "<TOKEN>"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: `insert`
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async createSignedUploadUrl(t, e) {
    var r = this;
    return r.handleOperation(async () => {
      let n = r._getFinalPath(t);
      const s = x({}, r.headers);
      e != null && e.upsert && (s["x-upsert"] = "true");
      const i = await te(r.fetch, `${r.url}/object/upload/sign/${n}`, {}, { headers: s }), o = new URL(r.url + i.url), a = o.searchParams.get("token");
      if (!a) throw new ur("No token returned by API");
      return {
        signedUrl: o.toString(),
        path: t,
        token: a
      };
    });
  }
  /**
  * Replaces an existing file at the specified path with a new one.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to update.
  * @param fileBody The body of the file to be stored in the bucket.
  * @param fileOptions Optional file upload options including cacheControl, contentType, contentEncoding, and metadata.
  * **Note:** The `upsert` option has no effect here. `update()` always replaces the
  * file at the given path, so the `x-upsert` header is not sent. To control upsert
  * behavior, use `upload()` instead.
  * @returns Promise with response containing file path, id, and fullPath or error
  *
  * @example Update file
  * ```js
  * const avatarFile = event.target.files[0]
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .update('public/avatar1.png', avatarFile, {
  *     cacheControl: '3600'
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "public/avatar1.png",
  *     "fullPath": "avatars/public/avatar1.png"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @example Update file using `ArrayBuffer` from base64 file data
  * ```js
  * import {decode} from 'base64-arraybuffer'
  *
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .update('public/avatar1.png', decode('base64FileData'), {
  *     contentType: 'image/png'
  *   })
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: `update` and `select`
  * - `update()` always replaces the file at the given path regardless of the `upsert` option.
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  * - For React Native, using either `Blob`, `File` or `FormData` does not work as intended. Update file using `ArrayBuffer` from base64 file data instead, see example below.
  */
  async update(t, e, r) {
    return this.uploadOrUpdate("PUT", t, e, r);
  }
  /**
  * Moves an existing file to a new path in the same bucket.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
  * @param toPath The new file path, including the new file name. For example `folder/image-new.png`.
  * @param options The destination options.
  * @param options.sourceVersionId The version id of the source object to move.
  * @returns Promise with response containing success message or error
  *
  * @example Move file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .move('public/avatar1.png', 'private/avatar2.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully moved"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: `update` and `select`
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async move(t, e, r) {
    var n = this;
    return n.handleOperation(async () => await te(n.fetch, `${n.url}/object/move`, {
      bucketId: n.bucketId,
      sourceKey: t,
      destinationKey: e,
      destinationBucket: r == null ? void 0 : r.destinationBucket,
      sourceVersionId: r == null ? void 0 : r.sourceVersionId
    }, { headers: n.headers }));
  }
  /**
  * Copies an existing file to a new path in the same bucket.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
  * @param toPath The new file path, including the new file name. For example `folder/image-copy.png`.
  * @param options The destination and metadata options.
  * @param options.sourceVersionId The version id of the source object to copy.
  * @param options.copyMetadata Whether to copy the source metadata. Defaults to true. Set to false to apply metadata overrides; custom user metadata is not copied when false.
  * @param options.metadata File metadata overrides, applied only when copyMetadata is false. Unspecified fields retain their source values.
  * @returns Promise with response containing copied file path or error
  *
  * @example Copy file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .copy('public/avatar1.png', 'private/avatar2.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "avatars/private/avatar2.png"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @example Copy file with content encoding
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('documents')
  *   .copy('source.txt.gz', 'copy.txt.gz', {
  *     copyMetadata: false,
  *     metadata: { contentEncoding: 'gzip' },
  *   })
  * ```
  * The source must already contain gzip-encoded bytes. Copying changes metadata only.
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: `insert` and `select`
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async copy(t, e, r) {
    var n = this;
    return n.handleOperation(async () => {
      const s = r;
      return { path: (await te(n.fetch, `${n.url}/object/copy`, {
        bucketId: n.bucketId,
        sourceKey: t,
        destinationKey: e,
        destinationBucket: r == null ? void 0 : r.destinationBucket,
        sourceVersionId: r == null ? void 0 : r.sourceVersionId,
        copyMetadata: typeof (s == null ? void 0 : s.copyMetadata) == "boolean" ? s.copyMetadata : void 0,
        metadata: (s == null ? void 0 : s.copyMetadata) === !1 ? s.metadata : void 0
      }, { headers: n.headers })).Key };
    });
  }
  /**
  * Creates a signed URL. Use a signed URL to share a file for a fixed amount of time.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param path The file path, including the current file name. For example `folder/image.png`.
  * @param expiresIn The number of seconds until the signed URL expires. For example, `60` for a URL which is valid for one minute.
  * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
  * @param options.transform Transform the asset before serving it to the client.
  * @param options.cacheNonce Append a cache nonce parameter to the URL to invalidate the cache.
  * @param options.versionId Create a signed URL for a specific object version rather than the current one.
  * @returns Promise with response containing signed URL or error
  *
  * @example Create Signed URL
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrl('folder/avatar1.png', 60)
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @example Create a signed URL for an asset with transformations
  * ```js
  * const { data } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrl('folder/avatar1.png', 60, {
  *     transform: {
  *       width: 100,
  *       height: 100,
  *     }
  *   })
  * ```
  *
  * @example Create a signed URL which triggers the download of the asset
  * ```js
  * const { data } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrl('folder/avatar1.png', 60, {
  *     download: true,
  *   })
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: `select`
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async createSignedUrl(t, e, r) {
    var n = this;
    return n.handleOperation(async () => {
      let s = n._getFinalPath(t);
      const i = typeof (r == null ? void 0 : r.transform) == "object" && r.transform !== null && Object.keys(r.transform).length > 0;
      let o = await te(n.fetch, `${n.url}/object/sign/${s}`, x(x({ expiresIn: e }, i ? { transform: r.transform } : {}), (r == null ? void 0 : r.versionId) != null ? { versionId: r.versionId } : {}), { headers: n.headers });
      const a = new URLSearchParams();
      r != null && r.download && a.set("download", r.download === !0 ? "" : r.download), (r == null ? void 0 : r.cacheNonce) != null && a.set("cacheNonce", String(r.cacheNonce));
      const l = a.toString();
      return { signedUrl: encodeURI(`${n.url}${o.signedURL}${l ? `&${l}` : ""}`) };
    });
  }
  /**
  * Creates multiple signed URLs. Use a signed URL to share a file for a fixed amount of time.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param paths The file paths to be downloaded, including the current file names. For example `['folder/image.png', 'folder2/image2.png']`.
  * @param expiresIn The number of seconds until the signed URLs expire. For example, `60` for URLs which are valid for one minute.
  * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
  * @param options.cacheNonce Append a cache nonce parameter to the URL to invalidate the cache.
  * @returns Promise with response containing array of objects with signedUrl, path, and error or error
  *
  * @example Create Signed URLs
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrls(['folder/avatar1.png', 'folder/avatar2.png'], 60)
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": [
  *     {
  *       "error": null,
  *       "path": "folder/avatar1.png",
  *       "signedURL": "/object/sign/avatars/folder/avatar1.png?token=<TOKEN>",
  *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
  *     },
  *     {
  *       "error": null,
  *       "path": "folder/avatar2.png",
  *       "signedURL": "/object/sign/avatars/folder/avatar2.png?token=<TOKEN>",
  *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar2.png?token=<TOKEN>"
  *     }
  *   ],
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: `select`
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async createSignedUrls(t, e, r) {
    var n = this;
    return n.handleOperation(async () => {
      const s = await te(n.fetch, `${n.url}/object/sign/${n.bucketId}`, {
        expiresIn: e,
        paths: t
      }, { headers: n.headers }), i = new URLSearchParams();
      r != null && r.download && i.set("download", r.download === !0 ? "" : r.download), (r == null ? void 0 : r.cacheNonce) != null && i.set("cacheNonce", String(r.cacheNonce));
      const o = i.toString();
      return s.map((a) => x(x({}, a), {}, { signedUrl: a.signedURL ? encodeURI(`${n.url}${a.signedURL}${o ? `&${o}` : ""}`) : null }));
    });
  }
  /**
  * Downloads a file from a private bucket. For public buckets, make a request to the URL returned from `getPublicUrl` instead.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param path The full path and file name of the file to be downloaded. For example `folder/image.png`.
  * @param options Optional settings: `transform` to transform the asset before serving it to the client, `cacheNonce` to append a cache nonce parameter to the URL to invalidate the cache, and `versionId` to download a specific object version.
  * @param parameters Additional fetch parameters like signal for cancellation. Supports standard fetch options including cache control.
  * @returns BlobDownloadBuilder instance for downloading the file
  *
  * @example Download file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": <BLOB>,
  *   "error": null
  * }
  * ```
  *
  * @example Download file with transformations
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png', {
  *     transform: {
  *       width: 100,
  *       height: 100,
  *       quality: 80
  *     }
  *   })
  * ```
  *
  * @example Download with cache control (useful in Edge Functions)
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png', {}, { cache: 'no-store' })
  * ```
  *
  * @example Download with abort signal
  * ```js
  * const controller = new AbortController()
  * setTimeout(() => controller.abort(), 5000)
  *
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png', {}, { signal: controller.signal })
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: `select`
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  download(t, e, r) {
    const n = typeof (e == null ? void 0 : e.transform) == "object" && e.transform !== null && Object.keys(e.transform).length > 0 ? "render/image/authenticated" : "object", s = new URLSearchParams();
    e != null && e.transform && this.applyTransformOptsToQuery(s, e.transform), (e == null ? void 0 : e.cacheNonce) != null && s.set("cacheNonce", String(e.cacheNonce)), (e == null ? void 0 : e.versionId) != null && s.set("versionId", String(e.versionId));
    const i = s.toString(), o = this._getFinalPath(t), a = () => Ze(this.fetch, `${this.url}/${n}/${o}${i ? `?${i}` : ""}`, {
      headers: this.headers,
      noResolveJson: !0
    }, r);
    return new Ua(a, this.shouldThrowOnError);
  }
  /**
  * Retrieves the details of an existing file.
  *
  * Returns detailed file metadata including size, content type, and timestamps.
  * Note: The API returns `last_modified` field, not `updated_at`.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param path The file path, including the file name. For example `folder/image.png`.
  * @param options Optional settings, including `versionId` to retrieve a specific object version.
  * @returns Promise with response containing file metadata or error
  *
  * @example Get file info
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .info('folder/avatar1.png')
  *
  * if (data) {
  *   console.log('Last modified:', data.lastModified)
  *   console.log('Size:', data.size)
  * }
  * ```
  */
  async info(t, e) {
    var r = this;
    const n = r._getFinalPath(t), s = new URLSearchParams();
    (e == null ? void 0 : e.versionId) != null && s.set("versionId", String(e.versionId));
    const i = s.toString();
    return r.handleOperation(async () => Kr(await Ze(r.fetch, `${r.url}/object/info/${n}${i ? `?${i}` : ""}`, { headers: r.headers })));
  }
  /**
  * Checks the existence of a file.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param path The file path, including the file name. For example `folder/image.png`.
  * @returns Promise with response containing boolean indicating file existence or error
  *
  * @example Check file existence
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .exists('folder/avatar1.png')
  * ```
  */
  async exists(t) {
    var e = this;
    const r = e._getFinalPath(t);
    try {
      return await La(e.fetch, `${e.url}/object/${r}`, { headers: e.headers }), {
        data: !0,
        error: null
      };
    } catch (s) {
      if (e.shouldThrowOnError) throw s;
      if (dr(s)) {
        var n;
        const i = s instanceof Wr ? s.status : s instanceof yi ? (n = s.originalError) === null || n === void 0 ? void 0 : n.status : void 0;
        if (i !== void 0 && [400, 404].includes(i)) return {
          data: !1,
          error: s
        };
      }
      throw s;
    }
  }
  /**
  * A simple convenience function to get the URL for an asset in a public bucket. If you do not want to use this function, you can construct the public URL by concatenating the bucket URL with the path to the asset.
  * This function does not verify if the bucket is public. If a public URL is created for a bucket which is not public, you will not be able to download the asset.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param path The path and name of the file to generate the public URL for. For example `folder/image.png`.
  * @param options.download Triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
  * @param options.transform Transform the asset before serving it to the client.
  * @param options.cacheNonce Append a cache nonce parameter to the URL to invalidate the cache.
  * @param options.versionId Return the URL for a specific object version rather than the current one.
  * @returns Object with public URL
  *
  * @example Returns the URL for an asset in a public bucket
  * ```js
  * const { data } = supabase
  *   .storage
  *   .from('public-bucket')
  *   .getPublicUrl('folder/avatar1.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "publicUrl": "https://example.supabase.co/storage/v1/object/public/public-bucket/folder/avatar1.png"
  *   }
  * }
  * ```
  *
  * @example Returns the URL for an asset in a public bucket with transformations
  * ```js
  * const { data } = supabase
  *   .storage
  *   .from('public-bucket')
  *   .getPublicUrl('folder/avatar1.png', {
  *     transform: {
  *       width: 100,
  *       height: 100,
  *     }
  *   })
  * ```
  *
  * @example Returns the URL which triggers the download of an asset in a public bucket
  * ```js
  * const { data } = supabase
  *   .storage
  *   .from('public-bucket')
  *   .getPublicUrl('folder/avatar1.png', {
  *     download: true,
  *   })
  * ```
  *
  * @remarks
  * - The bucket needs to be set to public, either via [updateBucket()](/docs/reference/javascript/storage-updatebucket) or by going to Storage on [supabase.com/dashboard](https://supabase.com/dashboard), clicking the overflow menu on a bucket and choosing "Make public"
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: none
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  getPublicUrl(t, e) {
    const r = this._getFinalPath(t), n = new URLSearchParams();
    e != null && e.download && n.set("download", e.download === !0 ? "" : e.download), e != null && e.transform && this.applyTransformOptsToQuery(n, e.transform), (e == null ? void 0 : e.cacheNonce) != null && n.set("cacheNonce", String(e.cacheNonce)), (e == null ? void 0 : e.versionId) != null && n.set("versionId", String(e.versionId));
    const s = n.toString(), i = typeof (e == null ? void 0 : e.transform) == "object" && e.transform !== null && Object.keys(e.transform).length > 0 ? "render/image" : "object";
    return { data: { publicUrl: encodeURI(`${this.url}/${i}/public/${r}`) + (s ? `?${s}` : "") } };
  }
  /**
  * Deletes files within the same bucket
  *
  * Returns an array of FileObject entries for the deleted files. Note that deprecated
  * fields like `bucket_id` may or may not be present in the response - do not rely on them.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param paths An array of files to delete. Each entry is either a path (deletes whichever
  * version is currently at that path, e.g. `'folder/image.png'`), or `{ path, versionId }` to
  * delete an exact version current or archived (e.g. `{ path: 'folder/image.png', versionId: '...' }`).
  * @returns Promise with response containing array of deleted file objects or error
  *
  * @example Delete file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .remove(['folder/avatar1.png'])
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": [],
  *   "error": null
  * }
  * ```
  *
  * @example Delete a specific object version
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .remove([{ path: 'folder/avatar1.png', versionId: 'noncurrent-version-id' }])
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: `delete` and `select`
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async remove(t) {
    var e = this;
    return e.handleOperation(async () => await et(e.fetch, `${e.url}/object/${e.bucketId}`, { prefixes: t }, { headers: e.headers }));
  }
  /**
  * Purges the CDN cache for a single object in this bucket.
  *
  * Maps to `DELETE /cdn/{bucket}/{path}` on the Storage API. The server
  * issues a CDN invalidation for the object and returns `{ message: 'success' }`.
  *
  * **Requires the `service_role` key.** The underlying endpoint enforces
  * `service_role` JWT — calls made with the anon key or a user JWT will be
  * rejected by the server.
  *
  * **Hosted CDN feature.** On self-hosted Supabase, the Storage service must
  * have `CDN_PURGE_ENDPOINT_URL` configured and the `purgeCache` tenant
  * feature enabled, otherwise the server returns an error.
  *
  * Operates on a single object path. There is no wildcard or recursion: pass
  * the exact path of the object you want invalidated.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param path The path (relative to the bucket) of the object to purge, e.g. `folder/avatar.png`.
  * @param options Optional purge cache options.
  * @param options.transformations If true, purges only transformations (resized/formatted variants), leaving the original cached file intact.
  * @param parameters Optional fetch parameters such as an `AbortController` signal.
  * @returns Promise with `{ data: { message }, error: null }` on success or `{ data: null, error }` on failure.
  *
  * @example Purge a single cached object
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .purgeCache('folder/avatar1.png')
  * ```
  *
  * @example Purge only transformations for a single object
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .purgeCache('folder/avatar1.png', { transformations: true })
  * ```
  */
  async purgeCache(t, e, r) {
    var n = this;
    return n.handleOperation(async () => {
      const s = Vr(n._getFinalPath(t)), i = new URLSearchParams();
      e != null && e.transformations && i.set("transformations", "true");
      const o = i.toString();
      return await et(n.fetch, `${n.url}/cdn/${s}${o ? `?${o}` : ""}`, {}, { headers: n.headers }, r);
    });
  }
  /**
  * Get file metadata
  * @param id the file id to retrieve metadata
  */
  /**
  * Update file metadata
  * @param id the file id to update metadata
  * @param meta the new file metadata
  */
  /**
  * Lists all the files and folders within a path of the bucket.
  *
  * **Important:** For folder entries, fields like `id`, `updated_at`, `created_at`,
  * `last_accessed_at`, and `metadata` will be `null`. Only files have these fields populated.
  * Additionally, deprecated fields like `bucket_id`, `owner`, and `buckets` are NOT returned
  * by this method.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param path The folder path.
  * @param options Search options including limit (defaults to 100), offset, sortBy, and search
  * @param parameters Optional fetch parameters including signal for cancellation
  * @returns Promise with response containing array of files/folders or error
  *
  * @example List files in a bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .list('folder', {
  *     limit: 100,
  *     offset: 0,
  *     sortBy: { column: 'name', order: 'asc' },
  *   })
  *
  * // Handle files vs folders
  * data?.forEach(item => {
  *   if (item.id !== null) {
  *     // It's a file
  *     console.log('File:', item.name, 'Size:', item.metadata?.size)
  *   } else {
  *     // It's a folder
  *     console.log('Folder:', item.name)
  *   }
  * })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "avatar1.png",
  *       "id": "e668cf7f-821b-4a2f-9dce-7dfa5dd1cfd2",
  *       "updated_at": "2024-05-22T23:06:05.580Z",
  *       "created_at": "2024-05-22T23:04:34.443Z",
  *       "last_accessed_at": "2024-05-22T23:04:34.443Z",
  *       "metadata": {
  *         "eTag": "\"c5e8c553235d9af30ef4f6e280790b92\"",
  *         "size": 32175,
  *         "mimetype": "image/png",
  *         "cacheControl": "max-age=3600",
  *         "lastModified": "2024-05-22T23:06:05.574Z",
  *         "contentLength": 32175,
  *         "httpStatusCode": 200
  *       }
  *     }
  *   ],
  *   "error": null
  * }
  * ```
  *
  * @example Search files in a bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .list('folder', {
  *     limit: 100,
  *     offset: 0,
  *     sortBy: { column: 'name', order: 'asc' },
  *     search: 'jon'
  *   })
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: none
  *   - `objects` table permissions: `select`
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async list(t, e, r) {
    var n = this;
    return n.handleOperation(async () => {
      const s = e != null && e.sortBy ? x(x({}, _r.sortBy), e.sortBy) : _r.sortBy, i = x(x(x({}, _r), e), {}, {
        sortBy: s,
        prefix: t || ""
      });
      return await te(n.fetch, `${n.url}/object/list/${n.bucketId}`, i, { headers: n.headers }, r);
    });
  }
  /**
  * Lists all the files and folders within a bucket using the V2 API with pagination support.
  *
  * **Important:** Folder entries in the `folders` array only contain `name` and optionally `key` —
  * they have no `id`, timestamps, or `metadata` fields. Full file metadata is only available
  * on entries in the `objects` array.
  *
  * @experimental this method signature might change in the future
  *
  * @category Storage
  * @subcategory File Buckets
  * @param options Search options including prefix, cursor for pagination, limit, with_delimiter
  * @param parameters Optional fetch parameters including signal for cancellation
  * @returns Promise with response containing folders/objects arrays with pagination info or error
  *
  * @example List files with pagination
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .listV2({
  *     prefix: 'folder/',
  *     limit: 100,
  *   })
  *
  * // Handle pagination
  * if (data?.hasNext) {
  *   const nextPage = await supabase
  *     .storage
  *     .from('avatars')
  *     .listV2({
  *       prefix: 'folder/',
  *       cursor: data.nextCursor,
  *     })
  * }
  *
  * // Handle files vs folders
  * data?.objects.forEach(file => {
  *   if (file.id !== null) {
  *     console.log('File:', file.name, 'Size:', file.metadata?.size)
  *   }
  * })
  * data?.folders.forEach(folder => {
  *   console.log('Folder:', folder.name)
  * })
  * ```
  */
  async listV2(t, e) {
    var r = this;
    return r.handleOperation(async () => {
      const n = x({}, t);
      return await te(r.fetch, `${r.url}/object/list-v2/${r.bucketId}`, n, { headers: r.headers }, e);
    });
  }
  prepareUploadFormData(t, e) {
    const r = new FormData(), n = [];
    t instanceof FormData ? t.forEach((s, i) => {
      typeof s == "string" ? r.append(i, s) : n.push([i, s]);
    }) : n.push(["", t]), r.has("cacheControl") || r.append("cacheControl", e.cacheControl), e.metadata && !r.has("metadata") && r.append("metadata", this.encodeMetadata(e.metadata)), e.contentEncoding && !r.has("contentEncoding") && r.append("contentEncoding", e.contentEncoding);
    for (const [s, i] of n) r.append(s, i);
    return r;
  }
  encodeMetadata(t) {
    return JSON.stringify(t);
  }
  toBase64(t) {
    return typeof Buffer < "u" ? Buffer.from(t).toString("base64") : btoa(t);
  }
  _getFinalPath(t) {
    return `${this.bucketId}/${t.replace(/^\/+/, "")}`;
  }
  _removeEmptyFolders(t) {
    return t.replace(/^\/|\/$/g, "").replace(/\/+/g, "/");
  }
  /** Modifies the `query`, appending values the from `transform` */
  applyTransformOptsToQuery(t, e) {
    return e.width && t.set("width", e.width.toString()), e.height && t.set("height", e.height.toString()), e.resize && t.set("resize", e.resize), e.format && t.set("format", e.format), e.quality && t.set("quality", e.quality.toString()), t;
  }
};
const qa = "2.118.0", Tt = { "X-Client-Info": `storage-js/${qa}` };
var Ma = class extends nt {
  constructor(t, e = {}, r, n) {
    const s = new URL(t);
    n != null && n.useNewHostname && /supabase\.(co|in|red)$/.test(s.hostname) && !s.hostname.includes("storage.supabase.") && (s.hostname = s.hostname.replace("supabase.", "storage.supabase."));
    const i = s.href.replace(/\/$/, ""), o = x(x({}, Tt), e);
    super(i, o, r, "storage");
  }
  /**
  * Retrieves the details of all Storage buckets within an existing project.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param options Query parameters for listing buckets
  * @param options.limit Maximum number of buckets to return
  * @param options.offset Number of buckets to skip
  * @param options.sortColumn Column to sort by ('id', 'name', 'created_at', 'updated_at')
  * @param options.sortOrder Sort order ('asc' or 'desc')
  * @param options.search Search term to filter bucket names
  * @returns Promise with response containing array of buckets or error
  *
  * @example List buckets
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .listBuckets()
  * ```
  *
  * @example List buckets with options
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .listBuckets({
  *     limit: 10,
  *     offset: 0,
  *     sortColumn: 'created_at',
  *     sortOrder: 'desc',
  *     search: 'prod'
  *   })
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: `select`
  *   - `objects` table permissions: none
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async listBuckets(t) {
    var e = this;
    return e.handleOperation(async () => {
      const r = e.listBucketOptionsToQueryString(t);
      return await Ze(e.fetch, `${e.url}/bucket${r}`, { headers: e.headers });
    });
  }
  /**
  * Retrieves the details of an existing Storage bucket.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param id The unique identifier of the bucket you would like to retrieve.
  * @returns Promise with response containing bucket details or error
  *
  * @example Get bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .getBucket('avatars')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "id": "avatars",
  *     "name": "avatars",
  *     "owner": "",
  *     "public": false,
  *     "file_size_limit": 1024,
  *     "allowed_mime_types": [
  *       "image/png"
  *     ],
  *     "created_at": "2024-05-22T22:26:05.100Z",
  *     "updated_at": "2024-05-22T22:26:05.100Z"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: `select`
  *   - `objects` table permissions: none
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async getBucket(t) {
    var e = this;
    return e.handleOperation(async () => await Ze(e.fetch, `${e.url}/bucket/${t}`, { headers: e.headers }));
  }
  /**
  * Creates a new Storage bucket
  *
  * @category Storage
  * @subcategory File Buckets
  * @param id A unique identifier for the bucket you are creating.
  * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations. By default, buckets are private.
  * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
  * The global file size limit takes precedence over this value.
  * The default value is null, which doesn't set a per bucket file size limit.
  * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
  * The default value is null, which allows files with all mime types to be uploaded.
  * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
  * @param options.type (private-beta) specifies the bucket type. see `BucketType` for more details.
  *   - default bucket type is `STANDARD`
  * @param options.versioningStatus the bucket's initial object versioning status.
  * The default value is `DISABLED`
  * @returns Promise with response containing newly created bucket name or error
  *
  * @example Create bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .createBucket('avatars', {
  *     public: false,
  *     allowedMimeTypes: ['image/png'],
  *     fileSizeLimit: 1024
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "name": "avatars"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: `insert`
  *   - `objects` table permissions: none
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async createBucket(t, e = { public: !1 }) {
    var r = this;
    return r.handleOperation(async () => await te(r.fetch, `${r.url}/bucket`, {
      id: t,
      name: t,
      type: e.type,
      public: e.public,
      file_size_limit: e.fileSizeLimit,
      allowed_mime_types: e.allowedMimeTypes,
      versioning_status: e.versioningStatus
    }, { headers: r.headers }));
  }
  /**
  * Updates a Storage bucket
  *
  * @category Storage
  * @subcategory File Buckets
  * @param id A unique identifier for the bucket you are updating.
  * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations.
  * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
  * The global file size limit takes precedence over this value.
  * The default value is null, which doesn't set a per bucket file size limit.
  * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
  * The default value is null, which allows files with all mime types to be uploaded.
  * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
  * @param options.versioningStatus the bucket's new object versioning status. `DISABLED` is not
  * valid here, there's no transition back to it once versioning has been touched.
  * @returns Promise with response containing success message or error
  *
  * @example Update bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .updateBucket('avatars', {
  *     public: false,
  *     allowedMimeTypes: ['image/png'],
  *     fileSizeLimit: 1024
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully updated"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: `select` and `update`
  *   - `objects` table permissions: none
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async updateBucket(t, e) {
    var r = this;
    return r.handleOperation(async () => await Vt(r.fetch, `${r.url}/bucket/${t}`, {
      id: t,
      name: t,
      public: e.public,
      file_size_limit: e.fileSizeLimit,
      allowed_mime_types: e.allowedMimeTypes,
      versioning_status: e.versioningStatus
    }, { headers: r.headers }));
  }
  /**
  * Removes all objects inside a single bucket.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param id The unique identifier of the bucket you would like to empty.
  * @returns Promise with success message or error
  *
  * @example Empty bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .emptyBucket('avatars')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully emptied"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: `select`
  *   - `objects` table permissions: `select` and `delete`
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async emptyBucket(t) {
    var e = this;
    return e.handleOperation(async () => await te(e.fetch, `${e.url}/bucket/${t}/empty`, {}, { headers: e.headers }));
  }
  /**
  * Deletes an existing bucket. A bucket can't be deleted with existing objects inside it.
  * You must first `empty()` the bucket.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param id The unique identifier of the bucket you would like to delete.
  * @returns Promise with success message or error
  *
  * @example Delete bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .deleteBucket('avatars')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully deleted"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: `select` and `delete`
  *   - `objects` table permissions: none
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async deleteBucket(t) {
    var e = this;
    return e.handleOperation(async () => await et(e.fetch, `${e.url}/bucket/${t}`, {}, { headers: e.headers }));
  }
  /**
  * Returns the lifecycle policy stored on a bucket.
  *
  * Fails with `NoSuchLifecycleConfiguration` when the bucket has no policy.
  *
  * These rules expire previous versions of objects, not the current one.
  * Turn versioning on or there is nothing for the policy to act on.
  * Standard buckets only. Returns `FeatureNotEnabled` if lifecycle is off
  * for the project.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param id The unique identifier of the bucket.
  * @returns Promise with the lifecycle configuration or error
  *
  * @example Get lifecycle configuration
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .getBucketLifecycle('avatars')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "rules": [
  *       {
  *         "id": "expire-history",
  *         "status": "Enabled",
  *         "filter": {},
  *         "noncurrentVersionExpiration": {
  *           "noncurrentDays": 30,
  *           "newerNoncurrentVersions": 2
  *         }
  *       }
  *     ]
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: `select`
  *   - `objects` table permissions: none
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async getBucketLifecycle(t) {
    var e = this;
    return e.handleOperation(async () => await Ze(e.fetch, e.bucketLifecycleUrl(t), { headers: e.headers }));
  }
  /**
  * Replaces the lifecycle policy on a bucket.
  *
  * The `rules` array you send is the whole policy. Anything previously stored
  * is overwritten. Send at least one rule. Call {@link deleteBucketLifecycle}
  * to remove the policy.
  *
  * Each rule currently supports only `noncurrentVersionExpiration`. `filter`
  * is required and must be `{}`. Prefix filters, tag filters, and current-object
  * expiration are rejected. Rule IDs must be unique. Omit `id` and the
  * server generates one.
  *
  * Standard buckets only. Returns `FeatureNotEnabled` if lifecycle is off
  * for the project.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param id The unique identifier of the bucket.
  * @param configuration The full lifecycle configuration to store.
  * @returns Promise with the stored configuration or error
  *
  * @example Replace lifecycle configuration
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .updateBucketLifecycle('avatars', {
  *     rules: [
  *       {
  *         id: 'expire-history',
  *         status: 'Enabled',
  *         filter: {},
  *         noncurrentVersionExpiration: {
  *           noncurrentDays: 30,
  *           newerNoncurrentVersions: 2,
  *         },
  *       },
  *     ],
  *   })
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: `select` and `update`
  *   - `objects` table permissions: none
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async updateBucketLifecycle(t, e) {
    var r = this;
    return r.handleOperation(async () => await Vt(r.fetch, r.bucketLifecycleUrl(t), e, { headers: r.headers }));
  }
  /**
  * Removes the lifecycle policy from a bucket.
  *
  * Safe to call when no policy is stored. The response is still success.
  * Standard buckets only. Returns `FeatureNotEnabled` if lifecycle is off
  * for the project.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param id The unique identifier of the bucket.
  * @returns Promise with success message or error
  *
  * @example Delete lifecycle configuration
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .deleteBucketLifecycle('avatars')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully deleted"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - RLS policy permissions required:
  *   - `buckets` table permissions: `select` and `update`
  *   - `objects` table permissions: none
  * - Refer to the [Storage guide](/docs/guides/storage/security/access-control) on how access control works
  */
  async deleteBucketLifecycle(t) {
    var e = this;
    return e.handleOperation(async () => await et(e.fetch, e.bucketLifecycleUrl(t), {}, { headers: e.headers }));
  }
  /**
  * Purges the CDN cache for an entire bucket.
  *
  * Maps to `DELETE /cdn/{bucket}` on the Storage API. The server
  * issues a CDN invalidation for the bucket and returns `{ message: 'success' }`.
  *
  * **Requires the `service_role` key.** The underlying endpoint enforces
  * `service_role` JWT — calls made with the anon key or a user JWT will be
  * rejected by the server.
  *
  * **Hosted CDN feature.** On self-hosted Supabase, the Storage service must
  * have `CDN_PURGE_ENDPOINT_URL` configured and the `purgeCache` tenant
  * feature enabled, otherwise the server returns an error.
  *
  * @category Storage
  * @subcategory File Buckets
  * @param id The unique identifier of the bucket you would like to purge from cache.
  * @param options Optional purge cache options.
  * @param options.transformations If true, purges only transformations (resized/formatted variants), leaving original cached files intact.
  * @param parameters Optional fetch parameters such as an `AbortController` signal.
  * @returns Promise with `{ data: { message }, error: null }` on success or `{ data: null, error }` on failure.
  *
  * @example Purge cache for an entire bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .purgeBucketCache('avatars')
  * ```
  *
  * @example Purge only transformations for an entire bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .purgeBucketCache('avatars', { transformations: true })
  * ```
  */
  async purgeBucketCache(t, e, r) {
    var n = this;
    return n.handleOperation(async () => {
      const s = new URLSearchParams();
      e != null && e.transformations && s.set("transformations", "true");
      const i = s.toString();
      return await et(n.fetch, `${n.url}/cdn/${Vr(t)}${i ? `?${i}` : ""}`, {}, { headers: n.headers }, r);
    });
  }
  bucketLifecycleUrl(t) {
    return `${this.url}/bucket/${Vr(t)}/lifecycle`;
  }
  listBucketOptionsToQueryString(t) {
    const e = {};
    return t && ("limit" in t && (e.limit = String(t.limit)), "offset" in t && (e.offset = String(t.offset)), t.search && (e.search = t.search), t.sortColumn && (e.sortColumn = t.sortColumn), t.sortOrder && (e.sortOrder = t.sortOrder)), Object.keys(e).length > 0 ? "?" + new URLSearchParams(e).toString() : "";
  }
}, Fa = class extends nt {
  /**
  * @alpha
  *
  * Creates a new StorageAnalyticsClient instance
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Analytics Buckets
  * @param url - The base URL for the storage API
  * @param headers - HTTP headers to include in requests
  * @param fetch - Optional custom fetch implementation
  *
  * @example Using supabase-js (recommended)
  * ```typescript
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
  * const { data, error } = await supabase.storage.analytics.listBuckets()
  * ```
  *
  * @example Standalone import for bundle-sensitive environments
  * ```typescript
  * import { StorageAnalyticsClient } from '@supabase/storage-js'
  *
  * const client = new StorageAnalyticsClient(url, headers)
  * ```
  */
  constructor(t, e = {}, r) {
    const n = t.replace(/\/$/, ""), s = x(x({}, Tt), e);
    super(n, s, r, "storage");
  }
  /**
  * @alpha
  *
  * Creates a new analytics bucket using Iceberg tables
  * Analytics buckets are optimized for analytical queries and data processing
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Analytics Buckets
  * @param name A unique name for the bucket you are creating
  * @returns Promise with response containing newly created analytics bucket or error
  *
  * @example Create analytics bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .analytics
  *   .createBucket('analytics-data')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "name": "analytics-data",
  *     "type": "ANALYTICS",
  *     "format": "iceberg",
  *     "created_at": "2024-05-22T22:26:05.100Z",
  *     "updated_at": "2024-05-22T22:26:05.100Z"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - Creates a new analytics bucket using Iceberg tables
  * - Analytics buckets are optimized for analytical queries and data processing
  */
  async createBucket(t) {
    var e = this;
    return e.handleOperation(async () => await te(e.fetch, `${e.url}/bucket`, { name: t }, { headers: e.headers }));
  }
  /**
  * @alpha
  *
  * Retrieves the details of all Analytics Storage buckets within an existing project
  * Only returns buckets of type 'ANALYTICS'
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Analytics Buckets
  * @param options Query parameters for listing buckets
  * @param options.limit Maximum number of buckets to return
  * @param options.offset Number of buckets to skip
  * @param options.sortColumn Column to sort by ('name', 'created_at', 'updated_at')
  * @param options.sortOrder Sort order ('asc' or 'desc')
  * @param options.search Search term to filter bucket names
  * @returns Promise with response containing array of analytics buckets or error
  *
  * @example List analytics buckets
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .analytics
  *   .listBuckets({
  *     limit: 10,
  *     offset: 0,
  *     sortColumn: 'created_at',
  *     sortOrder: 'desc'
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "analytics-data",
  *       "type": "ANALYTICS",
  *       "format": "iceberg",
  *       "created_at": "2024-05-22T22:26:05.100Z",
  *       "updated_at": "2024-05-22T22:26:05.100Z"
  *     }
  *   ],
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - Retrieves the details of all Analytics Storage buckets within an existing project
  * - Only returns buckets of type 'ANALYTICS'
  */
  async listBuckets(t) {
    var e = this;
    return e.handleOperation(async () => {
      const r = new URLSearchParams();
      (t == null ? void 0 : t.limit) !== void 0 && r.set("limit", t.limit.toString()), (t == null ? void 0 : t.offset) !== void 0 && r.set("offset", t.offset.toString()), t != null && t.sortColumn && r.set("sortColumn", t.sortColumn), t != null && t.sortOrder && r.set("sortOrder", t.sortOrder), t != null && t.search && r.set("search", t.search);
      const n = r.toString(), s = n ? `${e.url}/bucket?${n}` : `${e.url}/bucket`;
      return await Ze(e.fetch, s, { headers: e.headers });
    });
  }
  /**
  * @alpha
  *
  * Deletes an existing analytics bucket
  * A bucket can't be deleted with existing objects inside it
  * You must first empty the bucket before deletion
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Analytics Buckets
  * @param bucketName The unique identifier of the bucket you would like to delete
  * @returns Promise with response containing success message or error
  *
  * @example Delete analytics bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .analytics
  *   .deleteBucket('analytics-data')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully deleted"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @remarks
  * - Deletes an analytics bucket
  */
  async deleteBucket(t) {
    var e = this;
    return e.handleOperation(async () => await et(e.fetch, `${e.url}/bucket/${t}`, {}, { headers: e.headers }));
  }
  /**
  * @alpha
  *
  * Get an Iceberg REST Catalog client configured for a specific analytics bucket
  * Use this to perform advanced table and namespace operations within the bucket
  * The returned client provides full access to the Apache Iceberg REST Catalog API
  * with the Supabase `{ data, error }` pattern for consistent error handling on all operations.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Analytics Buckets
  * @param bucketName - The name of the analytics bucket (warehouse) to connect to
  * @returns The wrapped Iceberg catalog client
  * @throws {StorageError} If the bucket name is invalid
  *
  * @example Get catalog and create table
  * ```js
  * // First, create an analytics bucket
  * const { data: bucket, error: bucketError } = await supabase
  *   .storage
  *   .analytics
  *   .createBucket('analytics-data')
  *
  * // Get the Iceberg catalog for that bucket
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // Create a namespace
  * const { error: nsError } = await catalog.createNamespace({ namespace: ['default'] })
  *
  * // Create a table with schema
  * const { data: tableMetadata, error: tableError } = await catalog.createTable(
  *   { namespace: ['default'] },
  *   {
  *     name: 'events',
  *     schema: {
  *       type: 'struct',
  *       fields: [
  *         { id: 1, name: 'id', type: 'long', required: true },
  *         { id: 2, name: 'timestamp', type: 'timestamp', required: true },
  *         { id: 3, name: 'user_id', type: 'string', required: false }
  *       ],
  *       'schema-id': 0,
  *       'identifier-field-ids': [1]
  *     },
  *     'partition-spec': {
  *       'spec-id': 0,
  *       fields: []
  *     },
  *     'write-order': {
  *       'order-id': 0,
  *       fields: []
  *     },
  *     properties: {
  *       'write.format.default': 'parquet'
  *     }
  *   }
  * )
  * ```
  *
  * @example List tables in namespace
  * ```js
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // List all tables in the default namespace
  * const { data: tables, error: listError } = await catalog.listTables({ namespace: ['default'] })
  * if (listError) {
  *   if (listError.isNotFound()) {
  *     console.log('Namespace not found')
  *   }
  *   return
  * }
  * console.log(tables) // [{ namespace: ['default'], name: 'events' }]
  * ```
  *
  * @example Working with namespaces
  * ```js
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // List all namespaces
  * const { data: namespaces } = await catalog.listNamespaces()
  *
  * // Create namespace with properties
  * await catalog.createNamespace(
  *   { namespace: ['production'] },
  *   { properties: { owner: 'data-team', env: 'prod' } }
  * )
  * ```
  *
  * @example Cleanup operations
  * ```js
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // Drop table with purge option (removes all data)
  * const { error: dropError } = await catalog.dropTable(
  *   { namespace: ['default'], name: 'events' },
  *   { purge: true }
  * )
  *
  * if (dropError?.isNotFound()) {
  *   console.log('Table does not exist')
  * }
  *
  * // Drop namespace (must be empty)
  * await catalog.dropNamespace({ namespace: ['default'] })
  * ```
  *
  * @remarks
  * This method provides a bridge between Supabase's bucket management and the standard
  * Apache Iceberg REST Catalog API. The bucket name maps to the Iceberg warehouse parameter.
  * All authentication and configuration is handled automatically using your Supabase credentials.
  *
  * **Error Handling**: Invalid bucket names throw immediately. All catalog
  * operations return `{ data, error }` where errors are `IcebergError` instances from iceberg-js.
  * Use helper methods like `error.isNotFound()` or check `error.status` for specific error handling.
  * Use `.throwOnError()` on the analytics client if you prefer exceptions for catalog operations.
  *
  * **Cleanup Operations**: When using `dropTable`, the `purge: true` option permanently
  * deletes all table data. Without it, the table is marked as deleted but data remains.
  *
  * **Library Dependency**: The returned catalog wraps `IcebergRestCatalog` from iceberg-js.
  * For complete API documentation and advanced usage, refer to the
  * [iceberg-js documentation](https://supabase.github.io/iceberg-js/).
  */
  from(t) {
    var e = this;
    if (!ja(t)) throw new ur("Invalid bucket name: File, folder, and bucket names must follow AWS object key naming guidelines and should avoid the use of any other characters.");
    const r = new xa({
      baseUrl: this.url,
      catalogName: t,
      auth: {
        type: "custom",
        getHeaders: async () => e.headers
      },
      fetch: this.fetch
    }), n = this.shouldThrowOnError;
    return new Proxy(r, { get(s, i) {
      const o = s[i];
      return typeof o != "function" ? o : async (...a) => {
        try {
          return {
            data: await o.apply(s, a),
            error: null
          };
        } catch (l) {
          if (n) throw l;
          return {
            data: null,
            error: l
          };
        }
      };
    } });
  }
}, Ha = class extends nt {
  /** Creates a new VectorIndexApi instance */
  constructor(t, e = {}, r) {
    const n = t.replace(/\/$/, ""), s = x(x({}, Tt), {}, { "Content-Type": "application/json" }, e);
    super(n, s, r, "vectors");
  }
  /** Creates a new vector index within a bucket */
  async createIndex(t) {
    var e = this;
    return e.handleOperation(async () => await G.post(e.fetch, `${e.url}/CreateIndex`, t, { headers: e.headers }) || {});
  }
  /** Retrieves metadata for a specific vector index */
  async getIndex(t, e) {
    var r = this;
    return r.handleOperation(async () => await G.post(r.fetch, `${r.url}/GetIndex`, {
      vectorBucketName: t,
      indexName: e
    }, { headers: r.headers }));
  }
  /** Lists vector indexes within a bucket with optional filtering and pagination */
  async listIndexes(t) {
    var e = this;
    return e.handleOperation(async () => await G.post(e.fetch, `${e.url}/ListIndexes`, t, { headers: e.headers }));
  }
  /** Deletes a vector index and all its data */
  async deleteIndex(t, e) {
    var r = this;
    return r.handleOperation(async () => await G.post(r.fetch, `${r.url}/DeleteIndex`, {
      vectorBucketName: t,
      indexName: e
    }, { headers: r.headers }) || {});
  }
}, za = class extends nt {
  /** Creates a new VectorDataApi instance */
  constructor(t, e = {}, r) {
    const n = t.replace(/\/$/, ""), s = x(x({}, Tt), {}, { "Content-Type": "application/json" }, e);
    super(n, s, r, "vectors");
  }
  /** Inserts or updates vectors in batch (1-500 per request) */
  async putVectors(t) {
    var e = this;
    if (t.vectors.length < 1 || t.vectors.length > 500) throw new Error("Vector batch size must be between 1 and 500 items");
    return e.handleOperation(async () => await G.post(e.fetch, `${e.url}/PutVectors`, t, { headers: e.headers }) || {});
  }
  /** Retrieves vectors by their keys in batch */
  async getVectors(t) {
    var e = this;
    return e.handleOperation(async () => await G.post(e.fetch, `${e.url}/GetVectors`, t, { headers: e.headers }));
  }
  /** Lists vectors in an index with pagination */
  async listVectors(t) {
    var e = this;
    if (t.segmentCount !== void 0) {
      if (t.segmentCount < 1 || t.segmentCount > 16) throw new Error("segmentCount must be between 1 and 16");
      if (t.segmentIndex !== void 0 && (t.segmentIndex < 0 || t.segmentIndex >= t.segmentCount))
        throw new Error(`segmentIndex must be between 0 and ${t.segmentCount - 1}`);
    }
    return e.handleOperation(async () => await G.post(e.fetch, `${e.url}/ListVectors`, t, { headers: e.headers }));
  }
  /** Queries for similar vectors using approximate nearest neighbor search */
  async queryVectors(t) {
    var e = this;
    return e.handleOperation(async () => await G.post(e.fetch, `${e.url}/QueryVectors`, t, { headers: e.headers }));
  }
  /** Deletes vectors by their keys in batch (1-500 per request) */
  async deleteVectors(t) {
    var e = this;
    if (t.keys.length < 1 || t.keys.length > 500) throw new Error("Keys batch size must be between 1 and 500 items");
    return e.handleOperation(async () => await G.post(e.fetch, `${e.url}/DeleteVectors`, t, { headers: e.headers }) || {});
  }
}, Wa = class extends nt {
  /** Creates a new VectorBucketApi instance */
  constructor(t, e = {}, r) {
    const n = t.replace(/\/$/, ""), s = x(x({}, Tt), {}, { "Content-Type": "application/json" }, e);
    super(n, s, r, "vectors");
  }
  /** Creates a new vector bucket */
  async createBucket(t) {
    var e = this;
    return e.handleOperation(async () => await G.post(e.fetch, `${e.url}/CreateVectorBucket`, { vectorBucketName: t }, { headers: e.headers }) || {});
  }
  /** Retrieves metadata for a specific vector bucket */
  async getBucket(t) {
    var e = this;
    return e.handleOperation(async () => await G.post(e.fetch, `${e.url}/GetVectorBucket`, { vectorBucketName: t }, { headers: e.headers }));
  }
  /** Lists vector buckets with optional filtering and pagination */
  async listBuckets(t = {}) {
    var e = this;
    return e.handleOperation(async () => await G.post(e.fetch, `${e.url}/ListVectorBuckets`, t, { headers: e.headers }));
  }
  /** Deletes a vector bucket (must be empty first) */
  async deleteBucket(t) {
    var e = this;
    return e.handleOperation(async () => await G.post(e.fetch, `${e.url}/DeleteVectorBucket`, { vectorBucketName: t }, { headers: e.headers }) || {});
  }
}, Ka = class extends Wa {
  /**
  * @alpha
  *
  * Creates a StorageVectorsClient that can manage buckets, indexes, and vectors.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param url - Base URL of the Storage Vectors REST API.
  * @param options.headers - Optional headers (for example `Authorization`) applied to every request.
  * @param options.fetch - Optional custom `fetch` implementation for non-browser runtimes.
  *
  * @example Using supabase-js (recommended)
  * ```typescript
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * ```
  *
  * @example Standalone import for bundle-sensitive environments
  * ```typescript
  * import { StorageVectorsClient } from '@supabase/storage-js'
  *
  * const client = new StorageVectorsClient(url, options)
  * ```
  */
  constructor(t, e = {}) {
    super(t, e.headers || {}, e.fetch);
  }
  /**
  *
  * @alpha
  *
  * Access operations for a specific vector bucket
  * Returns a scoped client for index and vector operations within the bucket
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param vectorBucketName - Name of the vector bucket
  * @returns Bucket-scoped client with index and vector operations
  *
  * @example Accessing a vector bucket
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * ```
  */
  from(t) {
    return new Va(this.url, this.headers, t, this.fetch);
  }
  /**
  *
  * @alpha
  *
  * Creates a new vector bucket
  * Vector buckets are containers for vector indexes and their data
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param vectorBucketName - Unique name for the vector bucket
  * @returns Promise with empty response on success or error
  *
  * @example Creating a vector bucket
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .createBucket('embeddings-prod')
  * ```
  */
  async createBucket(t) {
    var e = () => super.createBucket, r = this;
    return e().call(r, t);
  }
  /**
  *
  * @alpha
  *
  * Retrieves metadata for a specific vector bucket
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param vectorBucketName - Name of the vector bucket
  * @returns Promise with bucket metadata or error
  *
  * @example Get bucket metadata
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .getBucket('embeddings-prod')
  *
  * console.log('Bucket created:', data?.vectorBucket.creationTime)
  * ```
  */
  async getBucket(t) {
    var e = () => super.getBucket, r = this;
    return e().call(r, t);
  }
  /**
  *
  * @alpha
  *
  * Lists all vector buckets with optional filtering and pagination
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param options - Optional filters (prefix, maxResults, nextToken)
  * @returns Promise with list of buckets or error
  *
  * @example List vector buckets
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .listBuckets({ prefix: 'embeddings-' })
  *
  * data?.vectorBuckets.forEach(bucket => {
  *   console.log(bucket.vectorBucketName)
  * })
  * ```
  */
  async listBuckets(t = {}) {
    var e = () => super.listBuckets, r = this;
    return e().call(r, t);
  }
  /**
  *
  * @alpha
  *
  * Deletes a vector bucket (bucket must be empty)
  * All indexes must be deleted before deleting the bucket
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param vectorBucketName - Name of the vector bucket to delete
  * @returns Promise with empty response on success or error
  *
  * @example Delete a vector bucket
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .deleteBucket('embeddings-old')
  * ```
  */
  async deleteBucket(t) {
    var e = () => super.deleteBucket, r = this;
    return e().call(r, t);
  }
}, Va = class extends Ha {
  /**
  * @alpha
  *
  * Creates a helper that automatically scopes all index operations to the provided bucket.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @example Creating a vector bucket scope
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * ```
  */
  constructor(t, e, r, n) {
    super(t, e, n), this.vectorBucketName = r;
  }
  /**
  *
  * @alpha
  *
  * Creates a new vector index in this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param options - Index configuration (vectorBucketName is automatically set)
  * @returns Promise with empty response on success or error
  *
  * @example Creating a vector index
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * await bucket.createIndex({
  *   indexName: 'documents-openai',
  *   dataType: 'float32',
  *   dimension: 1536,
  *   distanceMetric: 'cosine',
  *   metadataConfiguration: {
  *     nonFilterableMetadataKeys: ['raw_text']
  *   }
  * })
  * ```
  */
  async createIndex(t) {
    var e = () => super.createIndex, r = this;
    return e().call(r, x(x({}, t), {}, { vectorBucketName: r.vectorBucketName }));
  }
  /**
  *
  * @alpha
  *
  * Lists indexes in this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param options - Listing options (vectorBucketName is automatically set)
  * @returns Promise with response containing indexes array and pagination token or error
  *
  * @example List indexes
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * const { data } = await bucket.listIndexes({ prefix: 'documents-' })
  * ```
  */
  async listIndexes(t = {}) {
    var e = () => super.listIndexes, r = this;
    return e().call(r, x(x({}, t), {}, { vectorBucketName: r.vectorBucketName }));
  }
  /**
  *
  * @alpha
  *
  * Retrieves metadata for a specific index in this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param indexName - Name of the index to retrieve
  * @returns Promise with index metadata or error
  *
  * @example Get index metadata
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * const { data } = await bucket.getIndex('documents-openai')
  * console.log('Dimension:', data?.index.dimension)
  * ```
  */
  async getIndex(t) {
    var e = () => super.getIndex, r = this;
    return e().call(r, r.vectorBucketName, t);
  }
  /**
  *
  * @alpha
  *
  * Deletes an index from this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param indexName - Name of the index to delete
  * @returns Promise with empty response on success or error
  *
  * @example Delete an index
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * await bucket.deleteIndex('old-index')
  * ```
  */
  async deleteIndex(t) {
    var e = () => super.deleteIndex, r = this;
    return e().call(r, r.vectorBucketName, t);
  }
  /**
  *
  * @alpha
  *
  * Access operations for a specific index within this bucket
  * Returns a scoped client for vector data operations
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param indexName - Name of the index
  * @returns Index-scoped client with vector data operations
  *
  * @example Accessing an index
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  *
  * // Insert vectors
  * await index.putVectors({
  *   vectors: [
  *     { key: 'doc-1', data: { float32: [...] }, metadata: { title: 'Intro' } }
  *   ]
  * })
  *
  * // Query similar vectors
  * const { data } = await index.queryVectors({
  *   queryVector: { float32: [...] },
  *   topK: 5
  * })
  * ```
  */
  index(t) {
    return new Ja(this.url, this.headers, this.vectorBucketName, t, this.fetch);
  }
}, Ja = class extends za {
  /**
  *
  * @alpha
  *
  * Creates a helper that automatically scopes all vector operations to the provided bucket/index names.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @example Creating a vector index scope
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * ```
  */
  constructor(t, e, r, n, s) {
    super(t, e, s), this.vectorBucketName = r, this.indexName = n;
  }
  /**
  *
  * @alpha
  *
  * Inserts or updates vectors in this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param options - Vector insertion options (bucket and index names automatically set)
  * @returns Promise with empty response on success or error
  *
  * @example Insert vectors into an index
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * await index.putVectors({
  *   vectors: [
  *     {
  *       key: 'doc-1',
  *       data: { float32: [0.1, 0.2, ...] },
  *       metadata: { title: 'Introduction', page: 1 }
  *     }
  *   ]
  * })
  * ```
  */
  async putVectors(t) {
    var e = () => super.putVectors, r = this;
    return e().call(r, x(x({}, t), {}, {
      vectorBucketName: r.vectorBucketName,
      indexName: r.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Retrieves vectors by keys from this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param options - Vector retrieval options (bucket and index names automatically set)
  * @returns Promise with response containing vectors array or error
  *
  * @example Get vectors by keys
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * const { data } = await index.getVectors({
  *   keys: ['doc-1', 'doc-2'],
  *   returnMetadata: true
  * })
  * ```
  */
  async getVectors(t) {
    var e = () => super.getVectors, r = this;
    return e().call(r, x(x({}, t), {}, {
      vectorBucketName: r.vectorBucketName,
      indexName: r.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Lists vectors in this index with pagination
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param options - Listing options (bucket and index names automatically set)
  * @returns Promise with response containing vectors array and pagination token or error
  *
  * @example List vectors with pagination
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * const { data } = await index.listVectors({
  *   maxResults: 500,
  *   returnMetadata: true
  * })
  * ```
  */
  async listVectors(t = {}) {
    var e = () => super.listVectors, r = this;
    return e().call(r, x(x({}, t), {}, {
      vectorBucketName: r.vectorBucketName,
      indexName: r.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Queries for similar vectors in this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param options - Query options (bucket and index names automatically set)
  * @returns Promise with response containing vectors ordered by distance, an optional pagination token, or an error
  *
  * @example Query similar vectors
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * const { data } = await index.queryVectors({
  *   queryVector: { float32: [0.1, 0.2, ...] },
  *   topK: 5,
  *   filter: { category: 'technical' },
  *   returnDistance: true,
  *   returnMetadata: true
  * })
  * ```
  */
  async queryVectors(t) {
    var e = () => super.queryVectors, r = this;
    return e().call(r, x(x({}, t), {}, {
      vectorBucketName: r.vectorBucketName,
      indexName: r.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Deletes vectors by keys from this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  * @param options - Deletion options (bucket and index names automatically set)
  * @returns Promise with empty response on success or error
  *
  * @example Delete vectors by keys
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * await index.deleteVectors({
  *   keys: ['doc-1', 'doc-2', 'doc-3']
  * })
  * ```
  */
  async deleteVectors(t) {
    var e = () => super.deleteVectors, r = this;
    return e().call(r, x(x({}, t), {}, {
      vectorBucketName: r.vectorBucketName,
      indexName: r.indexName
    }));
  }
}, Ga = class extends Ma {
  /**
  * Creates a client for Storage buckets, files, analytics, and vectors.
  *
  * @category Storage
  * @subcategory File Buckets
  *
  * @example Using supabase-js (recommended)
  * ```ts
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
  * const avatars = supabase.storage.from('avatars')
  * ```
  *
  * @example Standalone import for bundle-sensitive environments
  * ```ts
  * import { StorageClient } from '@supabase/storage-js'
  *
  * const storage = new StorageClient('https://xyzcompany.supabase.co/storage/v1', {
  *   apikey: 'your-publishable-key',
  * })
  * const avatars = storage.from('avatars')
  * ```
  */
  constructor(t, e = {}, r, n) {
    super(t, e, r, n);
  }
  /**
  * Perform file operation in a bucket.
  *
  * @category Storage
  * @subcategory File Buckets
  *
  * @param id The bucket id to operate on.
  *
  * @example Accessing a bucket
  * ```typescript
  * const avatars = supabase.storage.from('avatars')
  * ```
  */
  from(t) {
    return new Ba(this.url, this.headers, t, this.fetch);
  }
  /**
  *
  * @alpha
  *
  * Access vector storage operations.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Vector Buckets
  *
  * @returns A StorageVectorsClient instance configured with the current storage settings.
  */
  get vectors() {
    return new Ka(this.url + "/vector", {
      headers: this.headers,
      fetch: this.fetch
    });
  }
  /**
  *
  * @alpha
  *
  * Access analytics storage operations using Iceberg tables.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Storage
  * @subcategory Analytics Buckets
  *
  * @returns A StorageAnalyticsClient instance configured with the current storage settings.
  */
  get analytics() {
    return new Fa(this.url + "/iceberg", this.headers, this.fetch);
  }
};
const bi = "2.118.0", ye = 30 * 1e3, ht = 3, wr = ht * ye, Ya = 2 * ye, Xa = "http://localhost:9999", Qa = "supabase.auth.token", Za = { "X-Client-Info": `gotrue-js/${bi}` }, Jr = "X-Supabase-Api-Version", ki = {
  "2024-01-01": {
    timestamp: Date.parse("2024-01-01T00:00:00.0Z"),
    name: "2024-01-01"
  }
}, el = /^([a-z0-9_-]{4})*($|[a-z0-9_-]{3}$|[a-z0-9_-]{2}$)$/i, Le = "sb_flow_id", tl = 5, rl = 600 * 1e3;
class vt extends Error {
  constructor(e, r, n) {
    super(e), this.__isAuthError = !0, this.name = "AuthError", this.status = r, this.code = n;
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code
    };
  }
}
function b(t) {
  return typeof t == "object" && t !== null && "__isAuthError" in t;
}
class nl extends vt {
  constructor(e, r, n) {
    super(e, r, n), this.name = "AuthApiError", this.status = r, this.code = n;
  }
}
function Gn(t) {
  return b(t) && t.name === "AuthApiError";
}
class ne extends vt {
  constructor(e, r) {
    super(e), this.name = "AuthUnknownError", this.originalError = r;
  }
}
class ue extends vt {
  constructor(e, r, n, s) {
    super(e, n, s), this.name = r, this.status = n;
  }
}
class F extends ue {
  constructor() {
    super("Auth session missing!", "AuthSessionMissingError", 400, void 0);
  }
}
function It(t) {
  return b(t) && t.name === "AuthSessionMissingError";
}
class We extends ue {
  constructor() {
    super("Auth session or user missing", "AuthInvalidTokenResponseError", 500, void 0);
  }
}
class jt extends ue {
  constructor(e) {
    super(e, "AuthInvalidCredentialsError", 400, void 0);
  }
}
class Pt extends ue {
  constructor(e, r = null) {
    super(e, "AuthImplicitGrantRedirectError", 500, void 0), this.details = null, this.details = r;
  }
  toJSON() {
    return Object.assign(Object.assign({}, super.toJSON()), { details: this.details });
  }
}
function sl(t) {
  return b(t) && t.name === "AuthImplicitGrantRedirectError";
}
class Yn extends ue {
  constructor(e, r = null) {
    super(e, "AuthPKCEGrantCodeExchangeError", 500, void 0), this.details = null, this.details = r;
  }
  toJSON() {
    return Object.assign(Object.assign({}, super.toJSON()), { details: this.details });
  }
}
class il extends ue {
  constructor() {
    super("PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.", "AuthPKCECodeVerifierMissingError", 400, "pkce_code_verifier_not_found");
  }
}
class Mt extends ue {
  constructor(e, r) {
    super(e, "AuthRetryableFetchError", r, void 0);
  }
}
function Nt(t) {
  return b(t) && t.name === "AuthRetryableFetchError";
}
class Xn extends ue {
  constructor(e = "Refresh result discarded: session state changed mid-flight (e.g., concurrent signOut)") {
    super(e, "AuthRefreshDiscardedError", 409, void 0);
  }
}
function Qn(t) {
  return b(t) && t.name === "AuthRefreshDiscardedError";
}
class Zn extends ue {
  constructor(e, r, n) {
    super(e, "AuthWeakPasswordError", r, "weak_password"), this.reasons = n;
  }
  toJSON() {
    return Object.assign(Object.assign({}, super.toJSON()), { reasons: this.reasons });
  }
}
class Jt extends ue {
  constructor(e) {
    super(e, "AuthInvalidJwtError", 400, "invalid_jwt");
  }
}
const Gt = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split(""), es = ` 	
\r=`.split(""), ol = (() => {
  const t = new Array(128);
  for (let e = 0; e < t.length; e += 1)
    t[e] = -1;
  for (let e = 0; e < es.length; e += 1)
    t[es[e].charCodeAt(0)] = -2;
  for (let e = 0; e < Gt.length; e += 1)
    t[Gt[e].charCodeAt(0)] = e;
  return t;
})();
function ts(t, e, r) {
  if (t !== null)
    for (e.queue = e.queue << 8 | t, e.queuedBits += 8; e.queuedBits >= 6; ) {
      const n = e.queue >> e.queuedBits - 6 & 63;
      r(Gt[n]), e.queuedBits -= 6;
    }
  else if (e.queuedBits > 0)
    for (e.queue = e.queue << 6 - e.queuedBits, e.queuedBits = 6; e.queuedBits >= 6; ) {
      const n = e.queue >> e.queuedBits - 6 & 63;
      r(Gt[n]), e.queuedBits -= 6;
    }
}
function Si(t, e, r) {
  const n = ol[t];
  if (n > -1)
    for (e.queue = e.queue << 6 | n, e.queuedBits += 6; e.queuedBits >= 8; )
      r(e.queue >> e.queuedBits - 8 & 255), e.queuedBits -= 8;
  else {
    if (n === -2)
      return;
    throw new Error(`Invalid Base64-URL character "${String.fromCharCode(t)}"`);
  }
}
function rs(t) {
  const e = [], r = (o) => {
    e.push(String.fromCodePoint(o));
  }, n = {
    utf8seq: 0,
    codepoint: 0
  }, s = { queue: 0, queuedBits: 0 }, i = (o) => {
    cl(o, n, r);
  };
  for (let o = 0; o < t.length; o += 1)
    Si(t.charCodeAt(o), s, i);
  return e.join("");
}
function al(t, e) {
  if (t <= 127) {
    e(t);
    return;
  } else if (t <= 2047) {
    e(192 | t >> 6), e(128 | t & 63);
    return;
  } else if (t <= 65535) {
    e(224 | t >> 12), e(128 | t >> 6 & 63), e(128 | t & 63);
    return;
  } else if (t <= 1114111) {
    e(240 | t >> 18), e(128 | t >> 12 & 63), e(128 | t >> 6 & 63), e(128 | t & 63);
    return;
  }
  throw new Error(`Unrecognized Unicode codepoint: ${t.toString(16)}`);
}
function ll(t, e) {
  for (let r = 0; r < t.length; r += 1) {
    let n = t.charCodeAt(r);
    if (n > 55295 && n <= 56319) {
      const s = (n - 55296) * 1024 & 65535;
      n = (t.charCodeAt(r + 1) - 56320 & 65535 | s) + 65536, r += 1;
    }
    al(n, e);
  }
}
function cl(t, e, r) {
  if (e.utf8seq === 0) {
    if (t <= 127) {
      r(t);
      return;
    }
    for (let n = 1; n < 6; n += 1)
      if ((t >> 7 - n & 1) === 0) {
        e.utf8seq = n;
        break;
      }
    if (e.utf8seq === 2)
      e.codepoint = t & 31;
    else if (e.utf8seq === 3)
      e.codepoint = t & 15;
    else if (e.utf8seq === 4)
      e.codepoint = t & 7;
    else
      throw new Error("Invalid UTF-8 sequence");
    e.utf8seq -= 1;
  } else if (e.utf8seq > 0) {
    if (t <= 127)
      throw new Error("Invalid UTF-8 sequence");
    e.codepoint = e.codepoint << 6 | t & 63, e.utf8seq -= 1, e.utf8seq === 0 && r(e.codepoint);
  }
}
function tt(t) {
  const e = [], r = { queue: 0, queuedBits: 0 }, n = (s) => {
    e.push(s);
  };
  for (let s = 0; s < t.length; s += 1)
    Si(t.charCodeAt(s), r, n);
  return new Uint8Array(e);
}
function ul(t) {
  const e = [];
  return ll(t, (r) => e.push(r)), new Uint8Array(e);
}
function De(t) {
  const e = [], r = { queue: 0, queuedBits: 0 }, n = (s) => {
    e.push(s);
  };
  return t.forEach((s) => ts(s, r, n)), ts(null, r, n), e.join("");
}
function Ei(t) {
  return Math.round(Date.now() / 1e3) + t;
}
function dl() {
  return Symbol("auth-callback");
}
const H = () => typeof window < "u" && typeof document < "u", Ce = {
  tested: !1,
  writable: !1
}, xi = () => {
  if (!H())
    return !1;
  try {
    if (typeof globalThis.localStorage != "object")
      return !1;
  } catch {
    return !1;
  }
  if (Ce.tested)
    return Ce.writable;
  const t = `lswt-${Math.random()}${Math.random()}`;
  try {
    globalThis.localStorage.setItem(t, t), globalThis.localStorage.removeItem(t), Ce.tested = !0, Ce.writable = !0;
  } catch {
    Ce.tested = !0, Ce.writable = !1;
  }
  return Ce.writable;
};
function ns(t) {
  const e = {}, r = new URL(t);
  if (r.hash && r.hash[0] === "#")
    try {
      new URLSearchParams(r.hash.substring(1)).forEach((s, i) => {
        e[i] = s;
      });
    } catch {
    }
  return r.searchParams.forEach((n, s) => {
    e[s] = n;
  }), e;
}
const Ai = (t) => t ? (...e) => t(...e) : (...e) => fetch(...e), hl = (t) => typeof t == "object" && t !== null && "status" in t && "ok" in t && "json" in t && typeof t.json == "function", _e = async (t, e, r) => {
  await t.setItem(e, JSON.stringify(r));
}, z = async (t, e) => {
  const r = await t.getItem(e);
  if (!r)
    return null;
  try {
    return JSON.parse(r);
  } catch {
    return null;
  }
}, K = async (t, e) => {
  await t.removeItem(e);
};
class hr {
  constructor() {
    this.promise = new hr.promiseConstructor((e, r) => {
      this.resolve = e, this.reject = r;
    });
  }
}
hr.promiseConstructor = Promise;
function $t(t) {
  const e = t.split(".");
  if (e.length !== 3)
    throw new Jt("Invalid JWT structure");
  for (let n = 0; n < e.length; n++)
    if (!el.test(e[n]))
      throw new Jt("JWT not in base64url format");
  return {
    // using base64url lib
    header: JSON.parse(rs(e[0])),
    payload: JSON.parse(rs(e[1])),
    signature: tt(e[2]),
    raw: {
      header: e[0],
      payload: e[1]
    }
  };
}
async function fl(t) {
  return await new Promise((e) => {
    setTimeout(() => e(null), t);
  });
}
function pl(t, e) {
  return new Promise((n, s) => {
    (async () => {
      for (let i = 0; i < 1 / 0; i++)
        try {
          const o = await t(i);
          if (!e(i, null, o)) {
            n(o);
            return;
          }
        } catch (o) {
          if (!e(i, o)) {
            s(o);
            return;
          }
        }
    })();
  });
}
function Ti(t) {
  return ("0" + t.toString(16)).substr(-2);
}
function gl() {
  const e = new Uint32Array(56);
  if (typeof crypto > "u") {
    const r = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~", n = r.length;
    let s = "";
    for (let i = 0; i < 56; i++)
      s += r.charAt(Math.floor(Math.random() * n));
    return s;
  }
  return crypto.getRandomValues(e), Array.from(e, Ti).join("");
}
async function ml(t) {
  const r = new TextEncoder().encode(t), n = await crypto.subtle.digest("SHA-256", r), s = new Uint8Array(n);
  return Array.from(s).map((i) => String.fromCharCode(i)).join("");
}
async function yl(t) {
  if (!(typeof crypto < "u" && typeof crypto.subtle < "u" && typeof TextEncoder < "u"))
    return console.warn("WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256."), t;
  const r = await ml(t);
  return btoa(r).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const _l = /^[a-zA-Z0-9_-]{8,64}$/;
function Ft(t) {
  return typeof t == "string" && _l.test(t) ? t : null;
}
function wl() {
  if (typeof crypto < "u" && typeof crypto.getRandomValues == "function") {
    const e = new Uint8Array(16);
    return crypto.getRandomValues(e), Array.from(e, Ti).join("");
  }
  let t = "";
  for (let e = 0; e < 32; e++)
    t += Math.floor(Math.random() * 16).toString(16);
  return t;
}
const rt = (t, e) => `${t}-flow-${e}-code-verifier`, bt = (t) => `${t}-flows-code-verifier`;
async function _n(t, e) {
  const r = await z(t, bt(e));
  return Array.isArray(r) ? r.filter((n) => Ft(n) !== null) : [];
}
async function vl(t, e, r, n, s) {
  await _e(t, rt(e, r), n);
  const i = (await _n(t, e)).filter((o) => o !== r);
  for (i.push(r); i.length > tl; ) {
    const o = i.shift();
    await K(t, rt(e, o)), s == null || s(o);
  }
  await _e(t, bt(e), i), await _e(t, `${e}-code-verifier`, n);
}
async function bl(t, e, r) {
  if (r) {
    const s = await z(t, rt(e, r));
    return { verifier: typeof s == "string" ? s : null, flowId: r };
  }
  const n = await z(t, `${e}-code-verifier`);
  return { verifier: typeof n == "string" ? n : null, flowId: null };
}
async function ee(t, e, r) {
  const n = `${e}-code-verifier`;
  if (!r) {
    await K(t, n);
    return;
  }
  const s = rt(e, r), i = await z(t, s);
  await K(t, s);
  const o = await _n(t, e), a = o.filter((l) => l !== r);
  a.length !== o.length && (a.length > 0 ? await _e(t, bt(e), a) : await K(t, bt(e))), i != null && i === await z(t, n) && await K(t, n);
}
async function kl(t, e) {
  const r = await _n(t, e);
  for (const n of r)
    await K(t, rt(e, n));
  await K(t, bt(e)), await K(t, `${e}-code-verifier`);
}
function Sl(t, e) {
  const r = t.indexOf("#");
  let n = r === -1 ? t : t.slice(0, r);
  const s = r === -1 ? "" : t.slice(r), i = n.indexOf("?");
  if (i !== -1) {
    const a = n.slice(0, i), l = n.slice(i + 1).split("&").filter((c) => c !== "" && c !== Le && !c.startsWith(`${Le}=`));
    n = l.length > 0 ? `${a}?${l.join("&")}` : a;
  }
  const o = n.includes("?") ? "&" : "?";
  return `${n}${o}${Le}=${encodeURIComponent(e)}${s}`;
}
async function El(t, e, r = !1, n) {
  const s = gl();
  let i = s;
  r && (i += "/recovery");
  const o = wl();
  await vl(t, e, o, i, n);
  const a = await yl(s);
  return [a, s === a ? "plain" : "s256", o];
}
const xl = /^2[0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-9]|3[0-1])$/i;
function Al(t) {
  const e = t.headers.get(Jr);
  if (!e || !e.match(xl))
    return null;
  try {
    return /* @__PURE__ */ new Date(`${e}T00:00:00.0Z`);
  } catch {
    return null;
  }
}
function Tl(t) {
  if (!t)
    throw new Error("Missing exp claim");
  const e = Math.floor(Date.now() / 1e3);
  if (t <= e)
    throw new Error("JWT has expired");
}
function Rl(t) {
  switch (t) {
    case "RS256":
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" }
      };
    case "ES256":
      return {
        name: "ECDSA",
        namedCurve: "P-256",
        hash: { name: "SHA-256" }
      };
    default:
      throw new Error("Invalid alg claim");
  }
}
const Ol = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fe(t) {
  if (!Ol.test(t))
    throw new Error("@supabase/auth-js: Expected parameter to be UUID but is not");
}
function ct(t) {
  if (!t.recoveryCodes)
    throw new Error("@supabase/auth-js: the MFA recovery codes API is experimental and disabled by default. Enable it by passing `auth: { experimental: { recoveryCodes: true } }` to createClient (or to the GoTrueClient constructor).");
}
function vr() {
  const t = {};
  return new Proxy(t, {
    get: (e, r) => {
      if (r === "__isUserNotAvailableProxy")
        return !0;
      if (typeof r == "symbol") {
        const n = r.toString();
        if (n === "Symbol(Symbol.toPrimitive)" || n === "Symbol(Symbol.toStringTag)" || n === "Symbol(util.inspect.custom)")
          return;
      }
      throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Accessing the "${r}" property of the session object is not supported. Please use getUser() instead.`);
    },
    set: (e, r) => {
      throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Setting the "${r}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
    },
    deleteProperty: (e, r) => {
      throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Deleting the "${r}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
    }
  });
}
function Cl(t, e) {
  return new Proxy(t, {
    get: (r, n, s) => {
      if (n === "__isInsecureUserWarningProxy")
        return !0;
      if (typeof n == "symbol") {
        const i = n.toString();
        if (i === "Symbol(Symbol.toPrimitive)" || i === "Symbol(Symbol.toStringTag)" || i === "Symbol(util.inspect.custom)" || i === "Symbol(nodejs.util.inspect.custom)")
          return Reflect.get(r, n, s);
      }
      return !e.value && typeof n == "string" && (console.warn("Using the user object as returned from supabase.auth.getSession() or from some supabase.auth.onAuthStateChange() events could be insecure! This value comes directly from the storage medium (usually cookies on the server) and may not be authentic. Use supabase.auth.getUser() instead which authenticates the data by contacting the Supabase Auth server."), e.value = !0), Reflect.get(r, n, s);
    }
  });
}
function ss(t) {
  return JSON.parse(JSON.stringify(t));
}
const je = (t) => {
  if (typeof t == "object" && t !== null) {
    const e = t;
    if (typeof e.msg == "string")
      return e.msg;
    if (typeof e.message == "string")
      return e.message;
    if (typeof e.error_description == "string")
      return e.error_description;
    if (typeof e.error == "string")
      return e.error;
  }
  return JSON.stringify(t);
}, is = [
  500,
  501,
  502,
  503,
  504,
  520,
  521,
  522,
  523,
  524,
  525,
  526,
  527,
  528,
  529,
  530
];
async function os(t) {
  var e;
  if (!hl(t))
    throw new Mt(je(t), 0);
  let r;
  try {
    r = await t.json();
  } catch (i) {
    throw is.includes(t.status) ? new Mt(t.statusText || `HTTP ${t.status}`, t.status) : new ne(je(i), i);
  }
  if (is.includes(t.status))
    throw new Mt(je(r), t.status);
  let n;
  const s = Al(t);
  if (s && s.getTime() >= ki["2024-01-01"].timestamp && typeof r == "object" && r && typeof r.code == "string" ? n = r.code : typeof r == "object" && r && typeof r.error_code == "string" && (n = r.error_code), n) {
    if (n === "weak_password")
      throw new Zn(je(r), t.status, ((e = r.weak_password) === null || e === void 0 ? void 0 : e.reasons) || []);
    if (n === "session_not_found")
      throw new F();
  } else if (typeof r == "object" && r && typeof r.weak_password == "object" && r.weak_password && Array.isArray(r.weak_password.reasons) && r.weak_password.reasons.length && r.weak_password.reasons.reduce((i, o) => i && typeof o == "string", !0))
    throw new Zn(je(r), t.status, r.weak_password.reasons);
  throw new nl(je(r), t.status || 500, n);
}
const Il = (t, e, r, n) => {
  const s = { method: t, headers: (e == null ? void 0 : e.headers) || {} };
  return t === "GET" ? s : (s.headers = Object.assign({ "Content-Type": "application/json;charset=UTF-8" }, e == null ? void 0 : e.headers), s.body = JSON.stringify(n), Object.assign(Object.assign({}, s), r));
};
async function k(t, e, r, n) {
  var s;
  const i = Object.assign({}, n == null ? void 0 : n.headers);
  i[Jr] || (i[Jr] = ki["2024-01-01"].name), n != null && n.jwt && (i.Authorization = `Bearer ${n.jwt}`);
  const o = (s = n == null ? void 0 : n.query) !== null && s !== void 0 ? s : {};
  n != null && n.redirectTo && (o.redirect_to = n.redirectTo);
  const a = Object.keys(o).length ? "?" + new URLSearchParams(o).toString() : "", l = await jl(t, e, r + a, {
    headers: i,
    noResolveJson: n == null ? void 0 : n.noResolveJson
  }, {}, n == null ? void 0 : n.body);
  return n != null && n.xform ? n == null ? void 0 : n.xform(l) : { data: Object.assign({}, l), error: null };
}
async function jl(t, e, r, n, s, i) {
  const o = Il(e, n, s, i);
  let a;
  try {
    a = await t(r, Object.assign({}, o));
  } catch (l) {
    throw new Mt(je(l), 0);
  }
  if (a.ok || await os(a), n != null && n.noResolveJson)
    return a;
  try {
    return await a.json();
  } catch (l) {
    await os(l);
  }
}
function Q(t) {
  var e;
  let r = null;
  $l(t) && (r = Object.assign({}, t), t.expires_at || (r.expires_at = Ei(t.expires_in)));
  const n = (e = t.user) !== null && e !== void 0 ? e : typeof (t == null ? void 0 : t.id) == "string" ? t : null;
  return { data: { session: r, user: n }, error: null };
}
function as(t) {
  const e = Q(t);
  return !e.error && t.weak_password && typeof t.weak_password == "object" && Array.isArray(t.weak_password.reasons) && t.weak_password.reasons.length && t.weak_password.message && typeof t.weak_password.message == "string" && t.weak_password.reasons.reduce((r, n) => r && typeof n == "string", !0) && (e.data.weak_password = t.weak_password), e;
}
function xe(t) {
  var e;
  return { data: { user: (e = t.user) !== null && e !== void 0 ? e : t }, error: null };
}
function Pl(t) {
  return { data: t, error: null };
}
function Nl(t) {
  const { action_link: e, email_otp: r, hashed_token: n, redirect_to: s, verification_type: i } = t, o = cr(t, ["action_link", "email_otp", "hashed_token", "redirect_to", "verification_type"]), a = {
    action_link: e,
    email_otp: r,
    hashed_token: n,
    redirect_to: s,
    verification_type: i
  }, l = Object.assign({}, o);
  return {
    data: {
      properties: a,
      user: l
    },
    error: null
  };
}
function ls(t) {
  return t;
}
function $l(t) {
  return !!t.access_token && !!t.refresh_token && !!t.expires_in;
}
const br = ["global", "local", "others"];
class Ll {
  /**
   * Creates an admin API client that can be used to manage users and OAuth clients.
   *
   * @example Using supabase-js (recommended)
   * ```ts
   * import { createClient } from '@supabase/supabase-js'
   *
   * const supabase = createClient('https://xyzcompany.supabase.co', 'your-secret-key')
   * const { data, error } = await supabase.auth.admin.listUsers()
   * ```
   *
   * @example Standalone import for bundle-sensitive environments
   * ```ts
   * import { GoTrueAdminApi } from '@supabase/auth-js'
   *
   * const admin = new GoTrueAdminApi({
   *   url: 'https://xyzcompany.supabase.co/auth/v1',
   *   headers: { Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` },
   * })
   * ```
   */
  constructor({ url: e = "", headers: r = {}, fetch: n, experimental: s }) {
    this.url = e, this.headers = r, this.fetch = Ai(n), this.experimental = s ?? {}, this.mfa = {
      listFactors: this._listFactors.bind(this),
      deleteFactor: this._deleteFactor.bind(this)
    }, this.oauth = {
      listClients: this._listOAuthClients.bind(this),
      createClient: this._createOAuthClient.bind(this),
      getClient: this._getOAuthClient.bind(this),
      updateClient: this._updateOAuthClient.bind(this),
      deleteClient: this._deleteOAuthClient.bind(this),
      regenerateClientSecret: this._regenerateOAuthClientSecret.bind(this)
    }, this.customProviders = {
      listProviders: this._listCustomProviders.bind(this),
      createProvider: this._createCustomProvider.bind(this),
      getProvider: this._getCustomProvider.bind(this),
      updateProvider: this._updateCustomProvider.bind(this),
      deleteProvider: this._deleteCustomProvider.bind(this)
    }, this.passkey = {
      listPasskeys: this._adminListPasskeys.bind(this),
      deletePasskey: this._adminDeletePasskey.bind(this)
    };
  }
  /**
   * Removes a logged-in session.
   * @param jwt A valid, logged-in JWT.
   * @param scope The logout sope.
   *
   * @category Auth
   * @subcategory Auth Admin
   */
  async signOut(e, r = br[0]) {
    if (br.indexOf(r) < 0)
      throw new Error(`@supabase/auth-js: Parameter scope must be one of ${br.join(", ")}`);
    try {
      return await k(this.fetch, "POST", `${this.url}/logout?scope=${r}`, {
        headers: this.headers,
        jwt: e,
        noResolveJson: !0
      }), { data: null, error: null };
    } catch (n) {
      if (b(n))
        return { data: null, error: n };
      throw n;
    }
  }
  /**
   * Sends an invite link to an email address.
   * @param email The email address of the user.
   * @param options Additional options to be included when inviting.
   *
   * @category Auth
   * @subcategory Auth Admin
   *
   * @remarks
   * - Sends an invite link to the user's email address.
   * - The `inviteUserByEmail()` method is typically used by administrators to invite users to join the application.
   * - Note that PKCE is not supported when using `inviteUserByEmail`. This is because the browser initiating the invite is often different from the browser accepting the invite which makes it difficult to provide the security guarantees required of the PKCE flow.
   *
   * @example Invite a user
   * ```js
   * const { data, error } = await supabase.auth.admin.inviteUserByEmail('email@example.com')
   * ```
   *
   * @exampleResponse Invite a user
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "invited_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "confirmation_sent_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {},
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": false
   *     }
   *   },
   *   "error": null
   * }
   * ```
   */
  async inviteUserByEmail(e, r = {}) {
    try {
      return await k(this.fetch, "POST", `${this.url}/invite`, {
        body: { email: e, data: r.data },
        headers: this.headers,
        redirectTo: r.redirectTo,
        xform: xe
      });
    } catch (n) {
      if (b(n))
        return { data: { user: null }, error: n };
      throw n;
    }
  }
  /**
   * Generates email links and OTPs to be sent via a custom email provider.
   * @param params The parameters for generating the link, including the link `type`, the user's `email`, and type-specific options such as `password`, `data`, and `redirectTo`.
   *
   * @category Auth
   * @subcategory Auth Admin
   *
   * @remarks
   * - The following types can be passed into `generateLink()`: `signup`, `magiclink`, `invite`, `recovery`, `email_change_current`, `email_change_new`, `phone_change`.
   * - `generateLink()` only generates the email link for `email_change_email` if the **Secure email change** is enabled in your project's [email auth provider settings](/dashboard/project/_/auth/providers).
   * - `generateLink()` handles the creation of the user for `signup`, `invite` and `magiclink`.
   *
   * @example Generate a signup link
   * ```js
   * const { data, error } = await supabase.auth.admin.generateLink({
   *   type: 'signup',
   *   email: 'email@example.com',
   *   password: 'secret'
   * })
   * ```
   *
   * @exampleResponse Generate a signup link
   * ```json
   * {
   *   "data": {
   *     "properties": {
   *       "action_link": "<LINK_TO_SEND_TO_USER>",
   *       "email_otp": "999999",
   *       "hashed_token": "<HASHED_TOKEN",
   *       "redirect_to": "<REDIRECT_URL>",
   *       "verification_type": "signup"
   *     },
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "email@example.com",
   *       "phone": "",
   *       "confirmation_sent_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {},
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "email@example.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "email@example.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": false
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Generate an invite link
   * ```js
   * const { data, error } = await supabase.auth.admin.generateLink({
   *   type: 'invite',
   *   email: 'email@example.com'
   * })
   * ```
   *
   * @example Generate a magic link
   * ```js
   * const { data, error } = await supabase.auth.admin.generateLink({
   *   type: 'magiclink',
   *   email: 'email@example.com'
   * })
   * ```
   *
   * @example Generate a recovery link
   * ```js
   * const { data, error } = await supabase.auth.admin.generateLink({
   *   type: 'recovery',
   *   email: 'email@example.com'
   * })
   * ```
   *
   * @example Generate links to change current email address
   * ```js
   * // generate an email change link to be sent to the current email address
   * const { data, error } = await supabase.auth.admin.generateLink({
   *   type: 'email_change_current',
   *   email: 'current.email@example.com',
   *   newEmail: 'new.email@example.com'
   * })
   *
   * // generate an email change link to be sent to the new email address
   * const { data, error } = await supabase.auth.admin.generateLink({
   *   type: 'email_change_new',
   *   email: 'current.email@example.com',
   *   newEmail: 'new.email@example.com'
   * })
   * ```
   */
  async generateLink(e) {
    try {
      const { options: r } = e, n = cr(e, ["options"]), s = Object.assign(Object.assign({}, n), r);
      return "newEmail" in n && (s.new_email = n == null ? void 0 : n.newEmail, delete s.newEmail), await k(this.fetch, "POST", `${this.url}/admin/generate_link`, {
        body: s,
        headers: this.headers,
        xform: Nl,
        redirectTo: r == null ? void 0 : r.redirectTo
      });
    } catch (r) {
      if (b(r))
        return {
          data: {
            properties: null,
            user: null
          },
          error: r
        };
      throw r;
    }
  }
  // User Admin API
  /**
   * Creates a new user.
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   *
   * @category Auth
   * @subcategory Auth Admin
   *
   * @remarks
   * - To confirm the user's email address or phone number, set `email_confirm` or `phone_confirm` to true. Both arguments default to false.
   * - `createUser()` will not send a confirmation email to the user. You can use [`inviteUserByEmail()`](/docs/reference/javascript/auth-admin-inviteuserbyemail) if you want to send them an email invite instead.
   * - If you are sure that the created user's email or phone number is legitimate and verified, you can set the `email_confirm` or `phone_confirm` param to `true`.
   *
   * @example With custom user metadata
   * ```js
   * const { data, error } = await supabase.auth.admin.createUser({
   *   email: 'user@email.com',
   *   password: 'password',
   *   user_metadata: { name: 'Yoda' }
   * })
   * ```
   *
   * @exampleResponse With custom user metadata
   * ```json
   * {
   *   data: {
   *     user: {
   *       id: '1',
   *       aud: 'authenticated',
   *       role: 'authenticated',
   *       email: 'example@email.com',
   *       email_confirmed_at: '2024-01-01T00:00:00Z',
   *       phone: '',
   *       confirmation_sent_at: '2024-01-01T00:00:00Z',
   *       confirmed_at: '2024-01-01T00:00:00Z',
   *       last_sign_in_at: '2024-01-01T00:00:00Z',
   *       app_metadata: {},
   *       user_metadata: {},
   *       identities: [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "1",
   *           "user_id": "1",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": true,
   *             "phone_verified": false,
   *             "sub": "1"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "email@example.com"
   *         },
   *       ],
   *       created_at: '2024-01-01T00:00:00Z',
   *       updated_at: '2024-01-01T00:00:00Z',
   *       is_anonymous: false,
   *     }
   *   }
   *   error: null
   * }
   * ```
   *
   * @example Auto-confirm the user's email
   * ```js
   * const { data, error } = await supabase.auth.admin.createUser({
   *   email: 'user@email.com',
   *   email_confirm: true
   * })
   * ```
   *
   * @example Auto-confirm the user's phone number
   * ```js
   * const { data, error } = await supabase.auth.admin.createUser({
   *   phone: '1234567890',
   *   phone_confirm: true
   * })
   * ```
   */
  async createUser(e) {
    try {
      return await k(this.fetch, "POST", `${this.url}/admin/users`, {
        body: e,
        headers: this.headers,
        xform: xe
      });
    } catch (r) {
      if (b(r))
        return { data: { user: null }, error: r };
      throw r;
    }
  }
  /**
   * Get a list of users.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   * @param params An object which supports `page` and `perPage` as numbers, to alter the paginated results.
   *
   * @category Auth
   * @subcategory Auth Admin
   *
   * @remarks
   * - Defaults to return 50 users per page.
   *
   * @example Get a page of users
   * ```js
   * const { data: { users }, error } = await supabase.auth.admin.listUsers()
   * ```
   *
   * @example Paginated list of users
   * ```js
   * const { data: { users }, error } = await supabase.auth.admin.listUsers({
   *   page: 1,
   *   perPage: 1000
   * })
   * ```
   */
  async listUsers(e) {
    var r, n, s, i, o, a, l;
    try {
      const c = { nextPage: null, lastPage: 0, total: 0 }, u = await k(this.fetch, "GET", `${this.url}/admin/users`, {
        headers: this.headers,
        noResolveJson: !0,
        query: {
          page: (n = (r = e == null ? void 0 : e.page) === null || r === void 0 ? void 0 : r.toString()) !== null && n !== void 0 ? n : "",
          per_page: (i = (s = e == null ? void 0 : e.perPage) === null || s === void 0 ? void 0 : s.toString()) !== null && i !== void 0 ? i : ""
        },
        xform: ls
      });
      if (u.error)
        throw u.error;
      const d = await u.json(), p = (o = u.headers.get("x-total-count")) !== null && o !== void 0 ? o : 0, h = (l = (a = u.headers.get("link")) === null || a === void 0 ? void 0 : a.split(",")) !== null && l !== void 0 ? l : [];
      return h.length > 0 && (h.forEach((f) => {
        const g = parseInt(f.split(";")[0].split("=")[1].substring(0, 1)), m = JSON.parse(f.split(";")[1].split("=")[1]);
        c[`${m}Page`] = g;
      }), c.total = parseInt(p)), { data: Object.assign(Object.assign({}, d), c), error: null };
    } catch (c) {
      if (b(c))
        return { data: { users: [] }, error: c };
      throw c;
    }
  }
  /**
   * Get user by id.
   *
   * @param uid The user's unique identifier
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   *
   * @category Auth
   * @subcategory Auth Admin
   *
   * @remarks
   * - Fetches the user object from the database based on the user's id.
   * - The `getUserById()` method requires the user's id which maps to the `auth.users.id` column.
   *
   * @example Fetch the user object using the access_token jwt
   * ```js
   * const { data, error } = await supabase.auth.admin.getUserById(1)
   * ```
   *
   * @exampleResponse Fetch the user object using the access_token jwt
   * ```json
   * {
   *   data: {
   *     user: {
   *       id: '1',
   *       aud: 'authenticated',
   *       role: 'authenticated',
   *       email: 'example@email.com',
   *       email_confirmed_at: '2024-01-01T00:00:00Z',
   *       phone: '',
   *       confirmation_sent_at: '2024-01-01T00:00:00Z',
   *       confirmed_at: '2024-01-01T00:00:00Z',
   *       last_sign_in_at: '2024-01-01T00:00:00Z',
   *       app_metadata: {},
   *       user_metadata: {},
   *       identities: [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "1",
   *           "user_id": "1",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": true,
   *             "phone_verified": false,
   *             "sub": "1"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "email@example.com"
   *         },
   *       ],
   *       created_at: '2024-01-01T00:00:00Z',
   *       updated_at: '2024-01-01T00:00:00Z',
   *       is_anonymous: false,
   *     }
   *   }
   *   error: null
   * }
   * ```
   */
  async getUserById(e) {
    fe(e);
    try {
      return await k(this.fetch, "GET", `${this.url}/admin/users/${e}`, {
        headers: this.headers,
        xform: xe
      });
    } catch (r) {
      if (b(r))
        return { data: { user: null }, error: r };
      throw r;
    }
  }
  /**
   * Updates the user data. Changes are applied directly without confirmation flows.
   *
   * @param uid The user's unique identifier
   * @param attributes The data you want to update.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   *
   * @remarks
   * **Important:** This is a server-side operation and does **not** trigger client-side
   * `onAuthStateChange` listeners. The admin API has no connection to client state.
   *
   * To sync changes to the client after calling this method:
   * 1. On the client, call `supabase.auth.refreshSession()` to fetch the updated user data
   * 2. This will trigger the `TOKEN_REFRESHED` event and notify all listeners
   *
   * @example
   * ```typescript
   * // Server-side (Edge Function)
   * const { data, error } = await supabase.auth.admin.updateUserById(
   *   userId,
   *   { user_metadata: { preferences: { theme: 'dark' } } }
   * )
   *
   * // Client-side (to sync the changes)
   * const { data, error } = await supabase.auth.refreshSession()
   * // onAuthStateChange listeners will now be notified with updated user
   * ```
   *
   * @see {@link GoTrueClient.refreshSession} for syncing admin changes to the client
   * @see {@link GoTrueClient.updateUser} for client-side user updates (triggers listeners automatically)
   *
   * @category Auth
   * @subcategory Auth Admin
   *
   * @example Updates a user's email
   * ```js
   * const { data: user, error } = await supabase.auth.admin.updateUserById(
   *   '11111111-1111-1111-1111-111111111111',
   *   { email: 'new@email.com' }
   * )
   * ```
   *
   * @exampleResponse Updates a user's email
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "new@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "confirmed_at": "2024-01-01T00:00:00Z",
   *       "recovery_sent_at": "2024-01-01T00:00:00Z",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {
   *         "email": "example@email.com",
   *         "email_verified": false,
   *         "phone_verified": false,
   *         "sub": "11111111-1111-1111-1111-111111111111"
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": false
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Updates a user's password
   * ```js
   * const { data: user, error } = await supabase.auth.admin.updateUserById(
   *   '6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4',
   *   { password: 'new_password' }
   * )
   * ```
   *
   * @example Updates a user's metadata
   * ```js
   * const { data: user, error } = await supabase.auth.admin.updateUserById(
   *   '6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4',
   *   { user_metadata: { hello: 'world' } }
   * )
   * ```
   *
   * @example Updates a user's app_metadata
   * ```js
   * const { data: user, error } = await supabase.auth.admin.updateUserById(
   *   '6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4',
   *   { app_metadata: { plan: 'trial' } }
   * )
   * ```
   *
   * @example Confirms a user's email address
   * ```js
   * const { data: user, error } = await supabase.auth.admin.updateUserById(
   *   '6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4',
   *   { email_confirm: true }
   * )
   * ```
   *
   * @example Confirms a user's phone number
   * ```js
   * const { data: user, error } = await supabase.auth.admin.updateUserById(
   *   '6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4',
   *   { phone_confirm: true }
   * )
   * ```
   *
   * @example Ban a user for 100 years
   * ```js
   * const { data: user, error } = await supabase.auth.admin.updateUserById(
   *   '6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4',
   *   { ban_duration: '876000h' }
   * )
   * ```
   */
  async updateUserById(e, r) {
    fe(e);
    try {
      return await k(this.fetch, "PUT", `${this.url}/admin/users/${e}`, {
        body: r,
        headers: this.headers,
        xform: xe
      });
    } catch (n) {
      if (b(n))
        return { data: { user: null }, error: n };
      throw n;
    }
  }
  /**
   * Delete a user. Requires a `service_role` key.
   *
   * @param id The user id you want to remove.
   * @param shouldSoftDelete If true, then the user will be soft-deleted from the auth schema. Soft deletion allows user identification from the hashed user ID but is not reversible.
   * Defaults to false for backward compatibility.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   *
   * @category Auth
   * @subcategory Auth Admin
   *
   * @remarks
   * - The `deleteUser()` method requires the user's ID, which maps to the `auth.users.id` column.
   *
   * @example Removes a user
   * ```js
   * const { data, error } = await supabase.auth.admin.deleteUser(
   *   '715ed5db-f090-4b8c-a067-640ecee36aa0'
   * )
   * ```
   *
   * @exampleResponse Removes a user
   * ```json
   * {
   *   "data": {
   *     "user": {}
   *   },
   *   "error": null
   * }
   * ```
   */
  async deleteUser(e, r = !1) {
    fe(e);
    try {
      return await k(this.fetch, "DELETE", `${this.url}/admin/users/${e}`, {
        headers: this.headers,
        body: {
          should_soft_delete: r
        },
        xform: xe
      });
    } catch (n) {
      if (b(n))
        return { data: { user: null }, error: n };
      throw n;
    }
  }
  async _listFactors(e) {
    fe(e.userId);
    try {
      const { data: r, error: n } = await k(this.fetch, "GET", `${this.url}/admin/users/${e.userId}/factors`, {
        headers: this.headers,
        xform: (s) => ({ data: { factors: s }, error: null })
      });
      return { data: r, error: n };
    } catch (r) {
      if (b(r))
        return { data: null, error: r };
      throw r;
    }
  }
  async _deleteFactor(e) {
    fe(e.userId), fe(e.id);
    try {
      return { data: await k(this.fetch, "DELETE", `${this.url}/admin/users/${e.userId}/factors/${e.id}`, {
        headers: this.headers
      }), error: null };
    } catch (r) {
      if (b(r))
        return { data: null, error: r };
      throw r;
    }
  }
  /**
   * Lists all OAuth clients with optional pagination.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _listOAuthClients(e) {
    var r, n, s, i, o, a, l;
    try {
      const c = { nextPage: null, lastPage: 0, total: 0 }, u = await k(this.fetch, "GET", `${this.url}/admin/oauth/clients`, {
        headers: this.headers,
        noResolveJson: !0,
        query: {
          page: (n = (r = e == null ? void 0 : e.page) === null || r === void 0 ? void 0 : r.toString()) !== null && n !== void 0 ? n : "",
          per_page: (i = (s = e == null ? void 0 : e.perPage) === null || s === void 0 ? void 0 : s.toString()) !== null && i !== void 0 ? i : ""
        },
        xform: ls
      });
      if (u.error)
        throw u.error;
      const d = await u.json(), p = (o = u.headers.get("x-total-count")) !== null && o !== void 0 ? o : 0, h = (l = (a = u.headers.get("link")) === null || a === void 0 ? void 0 : a.split(",")) !== null && l !== void 0 ? l : [];
      return h.length > 0 && (h.forEach((f) => {
        const g = parseInt(f.split(";")[0].split("=")[1].substring(0, 1)), m = JSON.parse(f.split(";")[1].split("=")[1]);
        c[`${m}Page`] = g;
      }), c.total = parseInt(p)), { data: Object.assign(Object.assign({}, d), c), error: null };
    } catch (c) {
      if (b(c))
        return { data: { clients: [] }, error: c };
      throw c;
    }
  }
  /**
   * Creates a new OAuth client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _createOAuthClient(e) {
    try {
      return await k(this.fetch, "POST", `${this.url}/admin/oauth/clients`, {
        body: e,
        headers: this.headers,
        xform: (r) => ({ data: r, error: null })
      });
    } catch (r) {
      if (b(r))
        return { data: null, error: r };
      throw r;
    }
  }
  /**
   * Gets details of a specific OAuth client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _getOAuthClient(e) {
    try {
      return await k(this.fetch, "GET", `${this.url}/admin/oauth/clients/${e}`, {
        headers: this.headers,
        xform: (r) => ({ data: r, error: null })
      });
    } catch (r) {
      if (b(r))
        return { data: null, error: r };
      throw r;
    }
  }
  /**
   * Updates an existing OAuth client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _updateOAuthClient(e, r) {
    try {
      return await k(this.fetch, "PUT", `${this.url}/admin/oauth/clients/${e}`, {
        body: r,
        headers: this.headers,
        xform: (n) => ({ data: n, error: null })
      });
    } catch (n) {
      if (b(n))
        return { data: null, error: n };
      throw n;
    }
  }
  /**
   * Deletes an OAuth client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _deleteOAuthClient(e) {
    try {
      return await k(this.fetch, "DELETE", `${this.url}/admin/oauth/clients/${e}`, {
        headers: this.headers,
        noResolveJson: !0
      }), { data: null, error: null };
    } catch (r) {
      if (b(r))
        return { data: null, error: r };
      throw r;
    }
  }
  /**
   * Regenerates the secret for an OAuth client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _regenerateOAuthClientSecret(e) {
    try {
      return await k(this.fetch, "POST", `${this.url}/admin/oauth/clients/${e}/regenerate_secret`, {
        headers: this.headers,
        xform: (r) => ({ data: r, error: null })
      });
    } catch (r) {
      if (b(r))
        return { data: null, error: r };
      throw r;
    }
  }
  /**
   * Lists all custom providers with optional type filter.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _listCustomProviders(e) {
    try {
      const r = {};
      return e != null && e.type && (r.type = e.type), await k(this.fetch, "GET", `${this.url}/admin/custom-providers`, {
        headers: this.headers,
        query: r,
        xform: (n) => {
          var s;
          return { data: { providers: (s = n == null ? void 0 : n.providers) !== null && s !== void 0 ? s : [] }, error: null };
        }
      });
    } catch (r) {
      if (b(r))
        return { data: { providers: [] }, error: r };
      throw r;
    }
  }
  /**
   * Creates a new custom OIDC/OAuth provider.
   *
   * For OIDC providers, the server fetches and validates the OpenID Connect discovery document
   * from the issuer's well-known endpoint (or the provided `discovery_url`) at creation time.
   * This may return a validation error (`error_code: "validation_failed"`) if the discovery
   * document is unreachable, not valid JSON, missing required fields, or if the issuer
   * in the document does not match the expected issuer.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _createCustomProvider(e) {
    try {
      return await k(this.fetch, "POST", `${this.url}/admin/custom-providers`, {
        body: e,
        headers: this.headers,
        xform: (r) => ({ data: r, error: null })
      });
    } catch (r) {
      if (b(r))
        return { data: null, error: r };
      throw r;
    }
  }
  /**
   * Gets details of a specific custom provider by identifier.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _getCustomProvider(e) {
    try {
      return await k(this.fetch, "GET", `${this.url}/admin/custom-providers/${e}`, {
        headers: this.headers,
        xform: (r) => ({ data: r, error: null })
      });
    } catch (r) {
      if (b(r))
        return { data: null, error: r };
      throw r;
    }
  }
  /**
   * Updates an existing custom provider.
   *
   * When `issuer` or `discovery_url` is changed on an OIDC provider, the server re-fetches and
   * validates the discovery document before persisting. This may return a validation error
   * (`error_code: "validation_failed"`) if the discovery document is unreachable, invalid, or
   * the issuer does not match.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _updateCustomProvider(e, r) {
    try {
      return await k(this.fetch, "PUT", `${this.url}/admin/custom-providers/${e}`, {
        body: r,
        headers: this.headers,
        xform: (n) => ({ data: n, error: null })
      });
    } catch (n) {
      if (b(n))
        return { data: null, error: n };
      throw n;
    }
  }
  /**
   * Deletes a custom provider.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _deleteCustomProvider(e) {
    try {
      return await k(this.fetch, "DELETE", `${this.url}/admin/custom-providers/${e}`, {
        headers: this.headers,
        noResolveJson: !0
      }), { data: null, error: null };
    } catch (r) {
      if (b(r))
        return { data: null, error: r };
      throw r;
    }
  }
  /**
   * Lists all passkeys for a user.
   *
   * This function should only be called on a server. Never expose your secret key in the browser.
   */
  async _adminListPasskeys(e) {
    fe(e.userId);
    try {
      return await k(this.fetch, "GET", `${this.url}/admin/users/${e.userId}/passkeys`, { headers: this.headers, xform: (r) => ({ data: r, error: null }) });
    } catch (r) {
      if (b(r))
        return { data: null, error: r };
      throw r;
    }
  }
  /**
   * Deletes a user's passkey.
   *
   * This function should only be called on a server. Never expose your secret key in the browser.
   */
  async _adminDeletePasskey(e) {
    fe(e.userId), fe(e.passkeyId);
    try {
      return await k(this.fetch, "DELETE", `${this.url}/admin/users/${e.userId}/passkeys/${e.passkeyId}`, { headers: this.headers, noResolveJson: !0 }), { data: null, error: null };
    } catch (r) {
      if (b(r))
        return { data: null, error: r };
      throw r;
    }
  }
}
function cs(t = {}) {
  return {
    getItem: (e) => t[e] || null,
    setItem: (e, r) => {
      t[e] = r;
    },
    removeItem: (e) => {
      delete t[e];
    }
  };
}
globalThis && xi() && globalThis.localStorage && globalThis.localStorage.getItem("supabase.gotrue-js.locks.debug");
class Dl extends Error {
  constructor(e) {
    super(e), this.isAcquireTimeout = !0;
  }
}
function Ul() {
  if (typeof globalThis != "object")
    try {
      Object.defineProperty(Object.prototype, "__magic__", {
        get: function() {
          return this;
        },
        configurable: !0
      }), __magic__.globalThis = __magic__, delete Object.prototype.__magic__;
    } catch {
      typeof self < "u" && (self.globalThis = self);
    }
}
function Ri(t) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(t))
    throw new Error(`@supabase/auth-js: Address "${t}" is invalid.`);
  return t.toLowerCase();
}
function Bl(t) {
  return parseInt(t, 16);
}
function ql(t) {
  const e = new TextEncoder().encode(t);
  return "0x" + Array.from(e, (n) => n.toString(16).padStart(2, "0")).join("");
}
function Ml(t) {
  var e;
  const { chainId: r, domain: n, expirationTime: s, issuedAt: i = /* @__PURE__ */ new Date(), nonce: o, notBefore: a, requestId: l, resources: c, scheme: u, uri: d, version: p } = t;
  {
    if (!Number.isInteger(r))
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "chainId". Chain ID must be a EIP-155 chain ID. Provided value: ${r}`);
    if (!n)
      throw new Error('@supabase/auth-js: Invalid SIWE message field "domain". Domain must be provided.');
    if (o && o.length < 8)
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "nonce". Nonce must be at least 8 characters. Provided value: ${o}`);
    if (!d)
      throw new Error('@supabase/auth-js: Invalid SIWE message field "uri". URI must be provided.');
    if (p !== "1")
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "version". Version must be '1'. Provided value: ${p}`);
    if (!((e = t.statement) === null || e === void 0) && e.includes(`
`))
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "statement". Statement must not include '\\n'. Provided value: ${t.statement}`);
  }
  const h = Ri(t.address), f = u ? `${u}://${n}` : n, g = t.statement ? `${t.statement}
` : "", m = `${f} wants you to sign in with your Ethereum account:
${h}

${g}`;
  let y = `URI: ${d}
Version: ${p}
Chain ID: ${r}${o ? `
Nonce: ${o}` : ""}
Issued At: ${i.toISOString()}`;
  if (s && (y += `
Expiration Time: ${s.toISOString()}`), a && (y += `
Not Before: ${a.toISOString()}`), l && (y += `
Request ID: ${l}`), c) {
    let _ = `
Resources:`;
    for (const w of c) {
      if (!w || typeof w != "string")
        throw new Error(`@supabase/auth-js: Invalid SIWE message field "resources". Every resource must be a valid string. Provided value: ${w}`);
      _ += `
- ${w}`;
    }
    y += _;
  }
  return `${m}
${y}`;
}
class q extends Error {
  constructor({ message: e, code: r, cause: n, name: s }) {
    var i;
    super(e, { cause: n }), this.__isWebAuthnError = !0, this.name = (i = s ?? (n instanceof Error ? n.name : void 0)) !== null && i !== void 0 ? i : "Unknown Error", this.code = r;
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code
    };
  }
}
class Yt extends q {
  constructor(e, r) {
    super({
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: r,
      message: e
    }), this.name = "WebAuthnUnknownError", this.originalError = r;
  }
}
function Fl({ error: t, options: e }) {
  var r, n, s;
  const { publicKey: i } = e;
  if (!i)
    throw Error("options was missing required publicKey property");
  if (t.name === "AbortError") {
    if (e.signal instanceof AbortSignal)
      return new q({
        message: "Registration ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: t
      });
  } else if (t.name === "ConstraintError") {
    if (((r = i.authenticatorSelection) === null || r === void 0 ? void 0 : r.requireResidentKey) === !0)
      return new q({
        message: "Discoverable credentials were required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
        cause: t
      });
    if (
      // @ts-ignore: `mediation` doesn't yet exist on CredentialCreationOptions but it's possible as of Sept 2024
      e.mediation === "conditional" && ((n = i.authenticatorSelection) === null || n === void 0 ? void 0 : n.userVerification) === "required"
    )
      return new q({
        message: "User verification was required during automatic registration but it could not be performed",
        code: "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE",
        cause: t
      });
    if (((s = i.authenticatorSelection) === null || s === void 0 ? void 0 : s.userVerification) === "required")
      return new q({
        message: "User verification was required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
        cause: t
      });
  } else {
    if (t.name === "InvalidStateError")
      return new q({
        message: "The authenticator was previously registered",
        code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
        cause: t
      });
    if (t.name === "NotAllowedError")
      return new q({
        message: t.message,
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        cause: t
      });
    if (t.name === "NotSupportedError")
      return i.pubKeyCredParams.filter((a) => a.type === "public-key").length === 0 ? new q({
        message: 'No entry in pubKeyCredParams was of type "public-key"',
        code: "ERROR_MALFORMED_PUBKEYCREDPARAMS",
        cause: t
      }) : new q({
        message: "No available authenticator supported any of the specified pubKeyCredParams algorithms",
        code: "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG",
        cause: t
      });
    if (t.name === "SecurityError") {
      const o = window.location.hostname;
      if (Oi(o)) {
        if (i.rp.id !== o)
          return new q({
            message: `The RP ID "${i.rp.id}" is invalid for this domain`,
            code: "ERROR_INVALID_RP_ID",
            cause: t
          });
      } else return new q({
        message: `${window.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: t
      });
    } else if (t.name === "TypeError") {
      if (i.user.id.byteLength < 1 || i.user.id.byteLength > 64)
        return new q({
          message: "User ID was not between 1 and 64 characters",
          code: "ERROR_INVALID_USER_ID_LENGTH",
          cause: t
        });
    } else if (t.name === "UnknownError")
      return new q({
        message: "The authenticator was unable to process the specified options, or could not create a new credential",
        code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
        cause: t
      });
  }
  return new q({
    message: "a Non-Webauthn related error has occurred",
    code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
    cause: t
  });
}
function Hl({ error: t, options: e }) {
  const { publicKey: r } = e;
  if (!r)
    throw Error("options was missing required publicKey property");
  if (t.name === "AbortError") {
    if (e.signal instanceof AbortSignal)
      return new q({
        message: "Authentication ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: t
      });
  } else {
    if (t.name === "NotAllowedError")
      return new q({
        message: t.message,
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        cause: t
      });
    if (t.name === "SecurityError") {
      const n = window.location.hostname;
      if (Oi(n)) {
        if (r.rpId !== n)
          return new q({
            message: `The RP ID "${r.rpId}" is invalid for this domain`,
            code: "ERROR_INVALID_RP_ID",
            cause: t
          });
      } else return new q({
        message: `${window.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: t
      });
    } else if (t.name === "UnknownError")
      return new q({
        message: "The authenticator was unable to process the specified options, or could not create a new assertion signature",
        code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
        cause: t
      });
  }
  return new q({
    message: "a Non-Webauthn related error has occurred",
    code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
    cause: t
  });
}
class zl {
  /**
   * Create an abort signal for a new WebAuthn operation.
   * Automatically cancels any existing operation.
   *
   * @returns {AbortSignal} Signal to pass to navigator.credentials.create() or .get()
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal MDN - AbortSignal}
   */
  createNewAbortSignal() {
    if (this.controller) {
      const r = new Error("Cancelling existing WebAuthn API call for new one");
      r.name = "AbortError", this.controller.abort(r);
    }
    const e = new AbortController();
    return this.controller = e, e.signal;
  }
  /**
   * Manually cancel the current WebAuthn operation.
   * Useful for cleaning up when user cancels or navigates away.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort MDN - AbortController.abort}
   */
  cancelCeremony() {
    if (this.controller) {
      const e = new Error("Manually cancelling existing WebAuthn API call");
      e.name = "AbortError", this.controller.abort(e), this.controller = void 0;
    }
  }
}
const Gr = new zl();
function us(t) {
  if (!t)
    throw new Error("Credential creation options are required");
  if (typeof PublicKeyCredential < "u" && "parseCreationOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseCreationOptionsFromJSON == "function")
    return PublicKeyCredential.parseCreationOptionsFromJSON(
      /** we assert the options here as typescript still doesn't know about future webauthn types */
      t
    );
  const { challenge: e, user: r, excludeCredentials: n } = t, s = cr(
    t,
    ["challenge", "user", "excludeCredentials"]
  ), i = tt(e).buffer, o = Object.assign(Object.assign({}, r), { id: tt(r.id).buffer }), a = Object.assign(Object.assign({}, s), {
    challenge: i,
    user: o
  });
  if (n && n.length > 0) {
    a.excludeCredentials = new Array(n.length);
    for (let l = 0; l < n.length; l++) {
      const c = n[l];
      a.excludeCredentials[l] = Object.assign(Object.assign({}, c), {
        id: tt(c.id).buffer,
        type: c.type || "public-key",
        // Cast transports to handle future transport types like "cable"
        transports: c.transports
      });
    }
  }
  return a;
}
function ds(t) {
  if (!t)
    throw new Error("Credential request options are required");
  if (typeof PublicKeyCredential < "u" && "parseRequestOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseRequestOptionsFromJSON == "function")
    return PublicKeyCredential.parseRequestOptionsFromJSON(t);
  const { challenge: e, allowCredentials: r } = t, n = cr(
    t,
    ["challenge", "allowCredentials"]
  ), s = tt(e).buffer, i = Object.assign(Object.assign({}, n), { challenge: s });
  if (r && r.length > 0) {
    i.allowCredentials = new Array(r.length);
    for (let o = 0; o < r.length; o++) {
      const a = r[o];
      i.allowCredentials[o] = Object.assign(Object.assign({}, a), {
        id: tt(a.id).buffer,
        type: a.type || "public-key",
        // Cast transports to handle future transport types like "cable"
        transports: a.transports
      });
    }
  }
  return i;
}
function hs(t) {
  var e;
  if ("toJSON" in t && typeof t.toJSON == "function")
    return t.toJSON();
  const r = t;
  return {
    id: t.id,
    rawId: t.id,
    response: {
      attestationObject: De(new Uint8Array(t.response.attestationObject)),
      clientDataJSON: De(new Uint8Array(t.response.clientDataJSON))
    },
    type: "public-key",
    clientExtensionResults: t.getClientExtensionResults(),
    // Convert null to undefined and cast to AuthenticatorAttachment type
    authenticatorAttachment: (e = r.authenticatorAttachment) !== null && e !== void 0 ? e : void 0
  };
}
function fs(t) {
  var e;
  if ("toJSON" in t && typeof t.toJSON == "function")
    return t.toJSON();
  const r = t, n = t.getClientExtensionResults(), s = t.response;
  return {
    id: t.id,
    rawId: t.id,
    // W3C spec expects rawId to match id for JSON format
    response: {
      authenticatorData: De(new Uint8Array(s.authenticatorData)),
      clientDataJSON: De(new Uint8Array(s.clientDataJSON)),
      signature: De(new Uint8Array(s.signature)),
      userHandle: s.userHandle ? De(new Uint8Array(s.userHandle)) : void 0
    },
    type: "public-key",
    clientExtensionResults: n,
    // Convert null to undefined and cast to AuthenticatorAttachment type
    authenticatorAttachment: (e = r.authenticatorAttachment) !== null && e !== void 0 ? e : void 0
  };
}
function Oi(t) {
  return (
    // Consider localhost valid as well since it's okay wrt Secure Contexts
    t === "localhost" || /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(t)
  );
}
function Xt() {
  var t, e;
  return !!(H() && "PublicKeyCredential" in window && window.PublicKeyCredential && "credentials" in navigator && typeof ((t = navigator == null ? void 0 : navigator.credentials) === null || t === void 0 ? void 0 : t.create) == "function" && typeof ((e = navigator == null ? void 0 : navigator.credentials) === null || e === void 0 ? void 0 : e.get) == "function");
}
async function Ci(t) {
  try {
    const e = await navigator.credentials.create(
      /** we assert the type here until typescript types are updated */
      t
    );
    return e ? e instanceof PublicKeyCredential ? { data: e, error: null } : {
      data: null,
      error: new Yt("Browser returned unexpected credential type", e)
    } : {
      data: null,
      error: new Yt("Empty credential response", e)
    };
  } catch (e) {
    return {
      data: null,
      error: Fl({
        error: e,
        options: t
      })
    };
  }
}
async function Ii(t) {
  try {
    const e = await navigator.credentials.get(
      /** we assert the type here until typescript types are updated */
      t
    );
    return e ? e instanceof PublicKeyCredential ? { data: e, error: null } : {
      data: null,
      error: new Yt("Browser returned unexpected credential type", e)
    } : {
      data: null,
      error: new Yt("Empty credential response", e)
    };
  } catch (e) {
    return {
      data: null,
      error: Hl({
        error: e,
        options: t
      })
    };
  }
}
const Wl = {
  hints: ["security-key"],
  authenticatorSelection: {
    authenticatorAttachment: "cross-platform",
    requireResidentKey: !1,
    /** set to preferred because older yubikeys don't have PIN/Biometric */
    userVerification: "preferred",
    residentKey: "discouraged"
  },
  attestation: "direct"
}, Kl = {
  /** set to preferred because older yubikeys don't have PIN/Biometric */
  userVerification: "preferred",
  hints: ["security-key"],
  attestation: "direct"
};
function Qt(...t) {
  const e = (s) => s !== null && typeof s == "object" && !Array.isArray(s), r = (s) => s instanceof ArrayBuffer || ArrayBuffer.isView(s), n = {};
  for (const s of t)
    if (s)
      for (const i in s) {
        const o = s[i];
        if (o !== void 0)
          if (Array.isArray(o))
            n[i] = o;
          else if (r(o))
            n[i] = o;
          else if (e(o)) {
            const a = n[i];
            e(a) ? n[i] = Qt(a, o) : n[i] = Qt(o);
          } else
            n[i] = o;
      }
  return n;
}
function Vl(t, e) {
  return Qt(Wl, t, e || {});
}
function Jl(t, e) {
  return Qt(Kl, t, e || {});
}
class Gl {
  constructor(e) {
    this.client = e, this.enroll = this._enroll.bind(this), this.challenge = this._challenge.bind(this), this.verify = this._verify.bind(this), this.authenticate = this._authenticate.bind(this), this.register = this._register.bind(this);
  }
  /**
   * Enroll a new WebAuthn factor.
   * Creates an unverified WebAuthn factor that must be verified with a credential.
   *
   * @experimental This method is experimental and may change in future releases
   * @param {Omit<MFAEnrollWebauthnParams, 'factorType'>} params - Enrollment parameters (friendlyName required)
   * @returns {Promise<AuthMFAEnrollWebauthnResponse>} Enrolled factor details or error
   * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registering a New Credential}
   */
  async _enroll(e) {
    return this.client.mfa.enroll(Object.assign(Object.assign({}, e), { factorType: "webauthn" }));
  }
  /**
   * Challenge for WebAuthn credential creation or authentication.
   * Combines server challenge with browser credential operations.
   * Handles both registration (create) and authentication (request) flows.
   *
   * @experimental This method is experimental and may change in future releases
   * @param {MFAChallengeWebauthnParams & { friendlyName?: string; signal?: AbortSignal }} params - Challenge parameters including factorId
   * @param {Object} overrides - Allows you to override the parameters passed to navigator.credentials
   * @param {PublicKeyCredentialCreationOptionsFuture} overrides.create - Override options for credential creation
   * @param {PublicKeyCredentialRequestOptionsFuture} overrides.request - Override options for credential request
   * @returns {Promise<RequestResult>} Challenge response with credential or error
   * @see {@link https://w3c.github.io/webauthn/#sctn-credential-creation W3C WebAuthn Spec - Credential Creation}
   * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying Assertion}
   */
  async _challenge({ factorId: e, webauthn: r, friendlyName: n, signal: s }, i) {
    var o;
    try {
      const { data: a, error: l } = await this.client.mfa.challenge({
        factorId: e,
        webauthn: r
      });
      if (!a)
        return { data: null, error: l };
      const c = s ?? Gr.createNewAbortSignal();
      if (a.webauthn.type === "create") {
        const { user: u } = a.webauthn.credential_options.publicKey;
        if (!u.name) {
          const d = n;
          if (d)
            u.name = `${u.id}:${d}`;
          else {
            const h = (await this.client.getUser()).data.user, f = ((o = h == null ? void 0 : h.user_metadata) === null || o === void 0 ? void 0 : o.name) || (h == null ? void 0 : h.email) || (h == null ? void 0 : h.id) || "User";
            u.name = `${u.id}:${f}`;
          }
        }
        u.displayName || (u.displayName = u.name);
      }
      switch (a.webauthn.type) {
        case "create": {
          const u = Vl(a.webauthn.credential_options.publicKey, i == null ? void 0 : i.create), { data: d, error: p } = await Ci({
            publicKey: u,
            signal: c
          });
          return d ? {
            data: {
              factorId: e,
              challengeId: a.id,
              webauthn: {
                type: a.webauthn.type,
                credential_response: d
              }
            },
            error: null
          } : { data: null, error: p };
        }
        case "request": {
          const u = Jl(a.webauthn.credential_options.publicKey, i == null ? void 0 : i.request), { data: d, error: p } = await Ii(Object.assign(Object.assign({}, a.webauthn.credential_options), { publicKey: u, signal: c }));
          return d ? {
            data: {
              factorId: e,
              challengeId: a.id,
              webauthn: {
                type: a.webauthn.type,
                credential_response: d
              }
            },
            error: null
          } : { data: null, error: p };
        }
      }
    } catch (a) {
      return b(a) ? { data: null, error: a } : {
        data: null,
        error: new ne("Unexpected error in challenge", a)
      };
    }
  }
  /**
   * Verify a WebAuthn credential with the server.
   * Completes the WebAuthn ceremony by sending the credential to the server for verification.
   *
   * @experimental This method is experimental and may change in future releases
   * @param {Object} params - Verification parameters
   * @param {string} params.challengeId - ID of the challenge being verified
   * @param {string} params.factorId - ID of the WebAuthn factor
   * @param {MFAVerifyWebauthnParams<T>['webauthn']} params.webauthn - WebAuthn credential response
   * @returns {Promise<AuthMFAVerifyResponse>} Verification result with session or error
   * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying an Authentication Assertion}
   * */
  async _verify({ challengeId: e, factorId: r, webauthn: n }) {
    return this.client.mfa.verify({
      factorId: r,
      challengeId: e,
      webauthn: n
    });
  }
  /**
   * Complete WebAuthn authentication flow.
   * Performs challenge and verification in a single operation for existing credentials.
   *
   * @experimental This method is experimental and may change in future releases
   * @param {Object} params - Authentication parameters
   * @param {string} params.factorId - ID of the WebAuthn factor to authenticate with
   * @param {Object} params.webauthn - WebAuthn configuration
   * @param {string} params.webauthn.rpId - Relying Party ID (defaults to current hostname)
   * @param {string[]} params.webauthn.rpOrigins - Allowed origins (defaults to current origin)
   * @param {AbortSignal} params.webauthn.signal - Optional abort signal
   * @param {PublicKeyCredentialRequestOptionsFuture} overrides - Override options for navigator.credentials.get
   * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Authentication result
   * @see {@link https://w3c.github.io/webauthn/#sctn-authentication W3C WebAuthn Spec - Authentication Ceremony}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialRequestOptions MDN - PublicKeyCredentialRequestOptions}
   */
  async _authenticate({ factorId: e, webauthn: { rpId: r = typeof window < "u" ? window.location.hostname : void 0, rpOrigins: n = typeof window < "u" ? [window.location.origin] : void 0, signal: s } = {} }, i) {
    if (!r)
      return {
        data: null,
        error: new vt("rpId is required for WebAuthn authentication")
      };
    try {
      if (!Xt())
        return {
          data: null,
          error: new ne("Browser does not support WebAuthn", null)
        };
      const { data: o, error: a } = await this.challenge({
        factorId: e,
        webauthn: { rpId: r, rpOrigins: n },
        signal: s
      }, { request: i });
      if (!o)
        return { data: null, error: a };
      const { webauthn: l } = o;
      return this._verify({
        factorId: e,
        challengeId: o.challengeId,
        webauthn: {
          type: l.type,
          rpId: r,
          rpOrigins: n,
          credential_response: l.credential_response
        }
      });
    } catch (o) {
      return b(o) ? { data: null, error: o } : {
        data: null,
        error: new ne("Unexpected error in authenticate", o)
      };
    }
  }
  /**
   * Complete WebAuthn registration flow.
   * Performs enrollment, challenge, and verification in a single operation for new credentials.
   *
   * @experimental This method is experimental and may change in future releases
   * @param {Object} params - Registration parameters
   * @param {string} params.friendlyName - User-friendly name for the credential
   * @param {string} params.rpId - Relying Party ID (defaults to current hostname)
   * @param {string[]} params.rpOrigins - Allowed origins (defaults to current origin)
   * @param {AbortSignal} params.signal - Optional abort signal
   * @param {PublicKeyCredentialCreationOptionsFuture} overrides - Override options for navigator.credentials.create
   * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Registration result
   * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registration Ceremony}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialCreationOptions MDN - PublicKeyCredentialCreationOptions}
   */
  async _register({ friendlyName: e, webauthn: { rpId: r = typeof window < "u" ? window.location.hostname : void 0, rpOrigins: n = typeof window < "u" ? [window.location.origin] : void 0, signal: s } = {} }, i) {
    if (!r)
      return {
        data: null,
        error: new vt("rpId is required for WebAuthn registration")
      };
    try {
      if (!Xt())
        return {
          data: null,
          error: new ne("Browser does not support WebAuthn", null)
        };
      const { data: o, error: a } = await this._enroll({
        friendlyName: e
      });
      if (!o)
        return await this.client.mfa.listFactors().then((u) => {
          var d;
          return (d = u.data) === null || d === void 0 ? void 0 : d.all.find((p) => p.factor_type === "webauthn" && p.friendly_name === e && p.status === "unverified");
        }).then((u) => u ? this.client.mfa.unenroll({ factorId: u == null ? void 0 : u.id }) : void 0), { data: null, error: a };
      const { data: l, error: c } = await this._challenge({
        factorId: o.id,
        friendlyName: o.friendly_name,
        webauthn: { rpId: r, rpOrigins: n },
        signal: s
      }, {
        create: i
      });
      return l ? this._verify({
        factorId: o.id,
        challengeId: l.challengeId,
        webauthn: {
          rpId: r,
          rpOrigins: n,
          type: l.webauthn.type,
          credential_response: l.webauthn.credential_response
        }
      }) : { data: null, error: c };
    } catch (o) {
      return b(o) ? { data: null, error: o } : {
        data: null,
        error: new ne("Unexpected error in register", o)
      };
    }
  }
}
Ul();
const Yl = {
  url: Xa,
  storageKey: Qa,
  autoRefreshToken: !0,
  persistSession: !0,
  detectSessionInUrl: !0,
  headers: Za,
  flowType: "implicit",
  debug: !1,
  hasCustomAuthorizationHeader: !1,
  throwOnError: !1,
  lockAcquireTimeout: 5e3,
  // 5 seconds. Only used when a custom `lock` is supplied. TODO(v3): remove.
  skipAutoInitialize: !1,
  experimental: {}
}, Ke = {};
let ps = !1;
class kt {
  /**
   * The JWKS used for verifying asymmetric JWTs
   */
  get jwks() {
    var e, r;
    return (r = (e = Ke[this.storageKey]) === null || e === void 0 ? void 0 : e.jwks) !== null && r !== void 0 ? r : { keys: [] };
  }
  set jwks(e) {
    Ke[this.storageKey] = Object.assign(Object.assign({}, Ke[this.storageKey]), { jwks: e });
  }
  get jwks_cached_at() {
    var e, r;
    return (r = (e = Ke[this.storageKey]) === null || e === void 0 ? void 0 : e.cachedAt) !== null && r !== void 0 ? r : Number.MIN_SAFE_INTEGER;
  }
  set jwks_cached_at(e) {
    Ke[this.storageKey] = Object.assign(Object.assign({}, Ke[this.storageKey]), { cachedAt: e });
  }
  /**
   * Create a new client for use in the browser.
   *
   * @example Using supabase-js (recommended)
   * ```ts
   * import { createClient } from '@supabase/supabase-js'
   *
   * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
   * const { data, error } = await supabase.auth.getUser()
   * ```
   *
   * @example Standalone import for bundle-sensitive environments
   * ```ts
   * import { GoTrueClient } from '@supabase/auth-js'
   *
   * const auth = new GoTrueClient({
   *   url: 'https://xyzcompany.supabase.co/auth/v1',
   *   headers: { apikey: 'your-publishable-key' },
   *   storageKey: 'supabase-auth',
   * })
   * ```
   */
  constructor(e) {
    var r, n, s;
    this.userStorage = null, this.memoryStorage = null, this.stateChangeEmitters = /* @__PURE__ */ new Map(), this.autoRefreshTicker = null, this.autoRefreshTickTimeout = null, this.visibilityChangedCallback = null, this.refreshingDeferred = null, this.lastRefreshFailure = null, this._sessionRemovalEpoch = 0, this.initializePromise = null, this._pendingInitNotifications = null, this.detectSessionInUrl = !0, this.hasCustomAuthorizationHeader = !1, this.suppressGetSessionWarning = !1, this.lock = null, this.lockAcquired = !1, this.pendingInLock = [], this.broadcastChannel = null, this.logger = console.log;
    const i = Object.assign(Object.assign({}, Yl), e);
    if (this.storageKey = i.storageKey, this.instanceID = (r = kt.nextInstanceID[this.storageKey]) !== null && r !== void 0 ? r : 0, kt.nextInstanceID[this.storageKey] = this.instanceID + 1, this.logDebugMessages = !!i.debug, typeof i.debug == "function" && (this.logger = i.debug), this.instanceID > 0 && H()) {
      const o = `${this._logPrefix()} Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.`;
      console.warn(o), this.logDebugMessages && console.trace(o);
    }
    if (this.persistSession = i.persistSession, this.autoRefreshToken = i.autoRefreshToken, this.experimental = (n = i.experimental) !== null && n !== void 0 ? n : {}, this.admin = new Ll({
      url: i.url,
      headers: i.headers,
      fetch: i.fetch,
      experimental: this.experimental
    }), this.url = i.url, this.headers = i.headers, this.fetch = Ai(i.fetch), this.detectSessionInUrl = i.detectSessionInUrl, this.flowType = i.flowType, this.hasCustomAuthorizationHeader = i.hasCustomAuthorizationHeader, this.throwOnError = i.throwOnError, this.lockAcquireTimeout = i.lockAcquireTimeout, i.lock != null && (this.lock = i.lock, ps || (ps = !0, console.warn(`${this._logPrefix()} The "lock" option is deprecated and will be removed in v3. The client now coordinates session refreshes without a lock, so most apps can drop the option. See https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/migrations/lockless-coordination.md`))), this.jwks || (this.jwks = { keys: [] }, this.jwks_cached_at = Number.MIN_SAFE_INTEGER), this.mfa = {
      verify: this._verify.bind(this),
      enroll: this._enroll.bind(this),
      unenroll: this._unenroll.bind(this),
      challenge: this._challenge.bind(this),
      listFactors: this._listFactors.bind(this),
      challengeAndVerify: this._challengeAndVerify.bind(this),
      getAuthenticatorAssuranceLevel: this._getAuthenticatorAssuranceLevel.bind(this),
      webauthn: new Gl(this),
      recoveryCodes: {
        getStatus: this._getRecoveryCodesStatus.bind(this),
        generate: this._generateRecoveryCodes.bind(this),
        verify: this._verifyRecoveryCode.bind(this),
        regenerate: this._regenerateRecoveryCodes.bind(this),
        unenroll: this._unenrollRecoveryCodes.bind(this)
      }
    }, this.oauth = {
      getAuthorizationDetails: this._getAuthorizationDetails.bind(this),
      approveAuthorization: this._approveAuthorization.bind(this),
      denyAuthorization: this._denyAuthorization.bind(this),
      listGrants: this._listOAuthGrants.bind(this),
      revokeGrant: this._revokeOAuthGrant.bind(this)
    }, this.passkey = {
      startRegistration: this._startPasskeyRegistration.bind(this),
      verifyRegistration: this._verifyPasskeyRegistration.bind(this),
      startAuthentication: this._startPasskeyAuthentication.bind(this),
      verifyAuthentication: this._verifyPasskeyAuthentication.bind(this),
      list: this._listPasskeys.bind(this),
      update: this._updatePasskey.bind(this),
      delete: this._deletePasskey.bind(this)
    }, this.persistSession ? (i.storage ? this.storage = i.storage : xi() ? this.storage = globalThis.localStorage : (this.memoryStorage = {}, this.storage = cs(this.memoryStorage)), i.userStorage && (this.userStorage = i.userStorage)) : (this.memoryStorage = {}, this.storage = cs(this.memoryStorage)), H() && globalThis.BroadcastChannel && this.persistSession && this.storageKey) {
      try {
        this.broadcastChannel = new globalThis.BroadcastChannel(this.storageKey);
      } catch (o) {
        console.error("Failed to create a new BroadcastChannel, multi-tab state changes will not be available", o);
      }
      (s = this.broadcastChannel) === null || s === void 0 || s.addEventListener("message", async (o) => {
        this._debug("received broadcast notification from other tab or client", o), (o.data.event === "TOKEN_REFRESHED" || o.data.event === "SIGNED_IN") && (this.lastRefreshFailure = null);
        try {
          await this._notifyAllSubscribers(o.data.event, o.data.session, !1);
        } catch (a) {
          this._debug("#broadcastChannel", "error", a);
        }
      });
    }
    i.skipAutoInitialize || this.initialize().catch((o) => {
      this._debug("#initialize()", "error", o);
    });
  }
  /**
   * Returns whether error throwing mode is enabled for this client.
   */
  isThrowOnErrorEnabled() {
    return this.throwOnError;
  }
  /**
   * Centralizes return handling with optional error throwing. When `throwOnError` is enabled
   * and the provided result contains a non-nullish error, the error is thrown instead of
   * being returned. This ensures consistent behavior across all public API methods.
   */
  _returnResult(e) {
    if (this.throwOnError && e && e.error)
      throw e.error;
    return e;
  }
  _logPrefix() {
    return `GoTrueClient@${this.storageKey}:${this.instanceID} (${bi}) ${(/* @__PURE__ */ new Date()).toISOString()}`;
  }
  _debug(...e) {
    return this.logDebugMessages && this.logger(this._logPrefix(), ...e), this;
  }
  /**
   * Initialize the auth client by loading the session from storage or
   * detecting it from the URL after an OAuth, magic-link, or password-recovery
   * redirect.
   *
   * **Most callers do not need to invoke this directly.** The client calls it
   * automatically during construction, and to react to sign-in events (including
   * post-redirect events) you should subscribe to `onAuthStateChange` rather
   * than awaiting `initialize()`.
   *
   * You only need to call it manually when you have opted out of the automatic
   * call by passing `skipAutoInitialize: true` — for example, in an SSR context
   * where you need to control initialization timing. In that case, awaiting
   * `initialize()` returns the resolved session result (or any error encountered
   * while detecting it from the URL).
   *
   * @category Auth
   */
  async initialize() {
    var e;
    if (this.initializePromise)
      return await this.initializePromise;
    this._pendingInitNotifications = [], this.initializePromise = (async () => this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._initialize()) : await this._initialize())();
    const r = await this.initializePromise, n = (e = this._pendingInitNotifications) !== null && e !== void 0 ? e : [];
    this._pendingInitNotifications = null;
    for (const s of n)
      await this._notifyAllSubscribers(s.event, s.session, s.broadcast);
    return r;
  }
  /**
   * IMPORTANT:
   * 1. Never throw in this method, as it is called from the constructor
   * 2. Never return a session from this method as it would be cached over
   *    the whole lifetime of the client
   */
  async _initialize() {
    var e;
    try {
      let r = {}, n = "none";
      if (H() && (r = ns(window.location.href), this._isImplicitGrantCallback(r) ? n = "implicit" : await this._isPKCECallback(r) && (n = "pkce")), H() && this.detectSessionInUrl && n !== "none") {
        const { data: s, error: i } = await this._getSessionFromURL(r, n);
        if (i) {
          if (this._debug("#_initialize()", "error detecting session from URL", i), sl(i)) {
            const l = (e = i.details) === null || e === void 0 ? void 0 : e.code;
            if (l === "identity_already_exists" || l === "identity_not_found" || l === "single_identity_not_deletable")
              return { error: i };
          }
          return { error: i };
        }
        const { session: o, redirectType: a } = s;
        return this._debug("#_initialize()", "detected session in URL", o, "redirect type", a), await this._saveSession(o), setTimeout(async () => {
          a === "recovery" ? await this._notifyAllSubscribers("PASSWORD_RECOVERY", o) : await this._notifyAllSubscribers("SIGNED_IN", o);
        }, 0), { error: null };
      }
      return await this._recoverAndRefresh(), { error: null };
    } catch (r) {
      return b(r) ? this._returnResult({ error: r }) : this._returnResult({
        error: new ne("Unexpected error during initialization", r)
      });
    } finally {
      await this._handleVisibilityChange(), this._debug("#_initialize()", "end");
    }
  }
  /**
   * Creates a new anonymous user.
   *
   * @returns A session where the is_anonymous claim in the access token JWT set to true
   *
   * @category Auth
   *
   * @remarks
   * - Returns an anonymous user
   * - It is recommended to set up captcha for anonymous sign-ins to prevent abuse. You can pass in the captcha token in the `options` param.
   *
   * @example Create an anonymous user
   * ```js
   * const { data, error } = await supabase.auth.signInAnonymously({
   *   options: {
   *     captchaToken
   *   }
   * });
   * ```
   *
   * @exampleResponse Create an anonymous user
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "",
   *       "phone": "",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {},
   *       "user_metadata": {},
   *       "identities": [],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": true
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "",
   *         "phone": "",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {},
   *         "user_metadata": {},
   *         "identities": [],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z",
   *         "is_anonymous": true
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Create an anonymous user with custom user metadata
   * ```js
   * const { data, error } = await supabase.auth.signInAnonymously({
   *   options: {
   *     data
   *   }
   * })
   * ```
   */
  async signInAnonymously(e) {
    var r, n, s;
    try {
      const i = await k(this.fetch, "POST", `${this.url}/signup`, {
        headers: this.headers,
        body: {
          data: (n = (r = e == null ? void 0 : e.options) === null || r === void 0 ? void 0 : r.data) !== null && n !== void 0 ? n : {},
          gotrue_meta_security: { captcha_token: (s = e == null ? void 0 : e.options) === null || s === void 0 ? void 0 : s.captchaToken }
        },
        xform: Q
      }), { data: o, error: a } = i;
      if (a || !o)
        return this._returnResult({ data: { user: null, session: null }, error: a });
      const l = o.session, c = o.user;
      return o.session && (await this._saveSession(o.session), await this._notifyAllSubscribers("SIGNED_IN", l)), this._returnResult({ data: { user: c, session: l }, error: null });
    } catch (i) {
      if (b(i))
        return this._returnResult({ data: { user: null, session: null }, error: i });
      throw i;
    }
  }
  /**
   * Creates a new user.
   *
   * Be aware that if a user account exists in the system you may get back an
   * error message that attempts to hide this information from the user.
   * This method has support for PKCE via email signups. The PKCE flow cannot be used when autoconfirm is enabled.
   *
   * @returns A logged-in session if the server has "autoconfirm" ON
   * @returns A user if the server has "autoconfirm" OFF
   *
   * @category Auth
   *
   * @remarks
   * - By default, the user needs to verify their email address before logging in. To turn this off, disable **Confirm email** in [your project](/dashboard/project/_/auth/providers).
   * - **Confirm email** determines if users need to confirm their email address after signing up.
   *   - If **Confirm email** is enabled, a `user` is returned but `session` is null.
   *   - If **Confirm email** is disabled, both a `user` and a `session` are returned.
   * - When the user confirms their email address, they are redirected to the [`SITE_URL`](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) by default. You can modify your `SITE_URL` or add additional redirect URLs in [your project](/dashboard/project/_/auth/url-configuration).
   * - If signUp() is called for an existing confirmed user:
   *   - When both **Confirm email** and **Confirm phone** (even when phone provider is disabled) are enabled in [your project](/dashboard/project/_/auth/providers), an obfuscated/fake user object is returned.
   *   - When either **Confirm email** or **Confirm phone** (even when phone provider is disabled) is disabled, the error message, `User already registered` is returned.
   * - To fetch the currently logged-in user, refer to [`getUser()`](/docs/reference/javascript/auth-getuser).
   *
   * @example Sign up with an email and password
   * ```js
   * const { data, error } = await supabase.auth.signUp({
   *   email: 'example@email.com',
   *   password: 'example-password',
   * })
   * ```
   *
   * @exampleResponse Sign up with an email and password
   * ```json
   * // Some fields may be null if "confirm email" is enabled.
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {},
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z"
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "example@email.com",
   *         "email_confirmed_at": "2024-01-01T00:00:00Z",
   *         "phone": "",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           "provider": "email",
   *           "providers": [
   *             "email"
   *           ]
   *         },
   *         "user_metadata": {},
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z"
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Sign up with a phone number and password (SMS)
   * ```js
   * const { data, error } = await supabase.auth.signUp({
   *   phone: '123456789',
   *   password: 'example-password',
   *   options: {
   *     channel: 'sms'
   *   }
   * })
   * ```
   *
   * @exampleDescription Sign up with a phone number and password (whatsapp)
   * The user will be sent a WhatsApp message which contains a OTP. By default, a given user can only request a OTP once every 60 seconds. Note that a user will need to have a valid WhatsApp account that is linked to Twilio in order to use this feature.
   *
   * @example Sign up with a phone number and password (whatsapp)
   * ```js
   * const { data, error } = await supabase.auth.signUp({
   *   phone: '123456789',
   *   password: 'example-password',
   *   options: {
   *     channel: 'whatsapp'
   *   }
   * })
   * ```
   *
   * @example Sign up with additional user metadata
   * ```js
   * const { data, error } = await supabase.auth.signUp(
   *   {
   *     email: 'example@email.com',
   *     password: 'example-password',
   *     options: {
   *       data: {
   *         first_name: 'John',
   *         age: 27,
   *       }
   *     }
   *   }
   * )
   * ```
   *
   * @exampleDescription Sign up with a redirect URL
   * - See [redirect URLs and wildcards](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) to add additional redirect URLs to your project.
   *
   * @example Sign up with a redirect URL
   * ```js
   * const { data, error } = await supabase.auth.signUp(
   *   {
   *     email: 'example@email.com',
   *     password: 'example-password',
   *     options: {
   *       emailRedirectTo: 'https://example.com/welcome'
   *     }
   *   }
   * )
   * ```
   */
  async signUp(e) {
    var r, n, s;
    let i = null;
    try {
      let o;
      if ("email" in e) {
        const { email: d, password: p, options: h } = e;
        let f = null, g = null;
        this.flowType === "pkce" && ([f, g, i] = await this._getCodeChallengeAndMethod()), o = await k(this.fetch, "POST", `${this.url}/signup`, {
          headers: this.headers,
          redirectTo: this._maybeAppendFlowIdToRedirect(h == null ? void 0 : h.emailRedirectTo, i),
          body: {
            email: d,
            password: p,
            data: (r = h == null ? void 0 : h.data) !== null && r !== void 0 ? r : {},
            gotrue_meta_security: { captcha_token: h == null ? void 0 : h.captchaToken },
            code_challenge: f,
            code_challenge_method: g
          },
          xform: Q
        });
      } else if ("phone" in e) {
        const { phone: d, password: p, options: h } = e;
        o = await k(this.fetch, "POST", `${this.url}/signup`, {
          headers: this.headers,
          body: {
            phone: d,
            password: p,
            data: (n = h == null ? void 0 : h.data) !== null && n !== void 0 ? n : {},
            channel: (s = h == null ? void 0 : h.channel) !== null && s !== void 0 ? s : "sms",
            gotrue_meta_security: { captcha_token: h == null ? void 0 : h.captchaToken }
          },
          xform: Q
        });
      } else
        throw new jt("You must provide either an email or phone number and a password");
      const { data: a, error: l } = o;
      if (l || !a)
        return await ee(this.storage, this.storageKey, i), this._returnResult({ data: { user: null, session: null }, error: l });
      const c = a.session, u = a.user;
      return a.session && (await this._saveSession(a.session), await this._notifyAllSubscribers("SIGNED_IN", c)), this._returnResult({ data: { user: u, session: c }, error: null });
    } catch (o) {
      if (await ee(this.storage, this.storageKey, i), b(o))
        return this._returnResult({ data: { user: null, session: null }, error: o });
      throw o;
    }
  }
  /**
   * Log in an existing user with an email and password or phone and password.
   *
   * Be aware that you may get back an error message that will not distinguish
   * between the cases where the account does not exist or that the
   * email/phone and password combination is wrong or that the account can only
   * be accessed via social login.
   *
   * @category Auth
   *
   * @remarks
   * - Requires either an email and password or a phone number and password.
   *
   * @example Sign in with email and password
   * ```js
   * const { data, error } = await supabase.auth.signInWithPassword({
   *   email: 'example@email.com',
   *   password: 'example-password',
   * })
   * ```
   *
   * @exampleResponse Sign in with email and password
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {},
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z"
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "example@email.com",
   *         "email_confirmed_at": "2024-01-01T00:00:00Z",
   *         "phone": "",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           "provider": "email",
   *           "providers": [
   *             "email"
   *           ]
   *         },
   *         "user_metadata": {},
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z"
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Sign in with phone and password
   * ```js
   * const { data, error } = await supabase.auth.signInWithPassword({
   *   phone: '+13334445555',
   *   password: 'some-password',
   * })
   * ```
   *
   * @exampleDescription Handling errors
   * Log the full `error` object so fields like `code`, `status`, and `name` aren't hidden. The `error.code` (e.g. `'invalid_credentials'`, `'email_not_confirmed'`) is often more useful for branching than `error.message`, and the full object surfaces both.
   *
   * @example Handling errors
   * ```js
   * const { data, error } = await supabase.auth.signInWithPassword({
   *   email: 'example@email.com',
   *   password: 'example-password',
   * })
   * if (error) {
   *   console.error(error)
   *   return
   * }
   * ```
   */
  async signInWithPassword(e) {
    try {
      let r;
      if ("email" in e) {
        const { email: i, password: o, options: a } = e;
        r = await k(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
          headers: this.headers,
          body: {
            email: i,
            password: o,
            gotrue_meta_security: { captcha_token: a == null ? void 0 : a.captchaToken }
          },
          xform: as
        });
      } else if ("phone" in e) {
        const { phone: i, password: o, options: a } = e;
        r = await k(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
          headers: this.headers,
          body: {
            phone: i,
            password: o,
            gotrue_meta_security: { captcha_token: a == null ? void 0 : a.captchaToken }
          },
          xform: as
        });
      } else
        throw new jt("You must provide either an email or phone number and a password");
      const { data: n, error: s } = r;
      if (s)
        return this._returnResult({ data: { user: null, session: null }, error: s });
      if (!n || !n.session || !n.user) {
        const i = new We();
        return this._returnResult({ data: { user: null, session: null }, error: i });
      }
      return n.session && (await this._saveSession(n.session), await this._notifyAllSubscribers("SIGNED_IN", n.session)), this._returnResult({
        data: Object.assign({ user: n.user, session: n.session }, n.weak_password ? { weakPassword: n.weak_password } : null),
        error: s
      });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: { user: null, session: null }, error: r });
      throw r;
    }
  }
  /**
   * Log in an existing user via a third-party provider.
   * This method supports the PKCE flow.
   *
   * @category Auth
   *
   * @remarks
   * - This method is used for signing in using [Social Login (OAuth) providers](/docs/guides/auth#configure-third-party-providers).
   * - It works by redirecting your application to the provider's authorization screen, before bringing back the user to your app.
   *
   * @example Sign in using a third-party provider
   * ```js
   * const { data, error } = await supabase.auth.signInWithOAuth({
   *   provider: 'github'
   * })
   * ```
   *
   * @exampleResponse Sign in using a third-party provider
   * ```json
   * {
   *   data: {
   *     provider: 'github',
   *     url: <PROVIDER_URL_TO_REDIRECT_TO>,
   *     flowId: <PKCE_FLOW_ID_OR_NULL>
   *   },
   *   error: null
   * }
   * ```
   *
   * @exampleDescription Sign in using a third-party provider with redirect
   * - When the OAuth provider successfully authenticates the user, they are redirected to the URL specified in the `redirectTo` parameter. This parameter defaults to the [`SITE_URL`](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls). It does not redirect the user immediately after invoking this method.
   * - See [redirect URLs and wildcards](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) to add additional redirect URLs to your project.
   *
   * @example Sign in using a third-party provider with redirect
   * ```js
   * const { data, error } = await supabase.auth.signInWithOAuth({
   *   provider: 'github',
   *   options: {
   *     redirectTo: 'https://example.com/welcome'
   *   }
   * })
   * ```
   *
   * @exampleDescription Sign in with scopes and access provider tokens
   * If you need additional access from an OAuth provider, in order to access provider specific APIs in the name of the user, you can do this by passing in the scopes the user should authorize for your application. Note that the `scopes` option takes in **a space-separated list** of scopes.
   *
   * Because OAuth sign-in often includes redirects, you should register an `onAuthStateChange` callback immediately after you create the Supabase client. This callback will listen for the presence of `provider_token` and `provider_refresh_token` properties on the `session` object and store them in local storage. The client library will emit these values **only once** immediately after the user signs in. You can then access them by looking them up in local storage, or send them to your backend servers for further processing.
   *
   * Finally, make sure you remove them from local storage on the `SIGNED_OUT` event. If the OAuth provider supports token revocation, make sure you call those APIs either from the frontend or schedule them to be called on the backend.
   *
   * @example Sign in with scopes and access provider tokens
   * ```js
   * // Register this immediately after calling createClient!
   * // Because signInWithOAuth causes a redirect, you need to fetch the
   * // provider tokens from the callback.
   * supabase.auth.onAuthStateChange((event, session) => {
   *   if (session && session.provider_token) {
   *     window.localStorage.setItem('oauth_provider_token', session.provider_token)
   *   }
   *
   *   if (session && session.provider_refresh_token) {
   *     window.localStorage.setItem('oauth_provider_refresh_token', session.provider_refresh_token)
   *   }
   *
   *   if (event === 'SIGNED_OUT') {
   *     window.localStorage.removeItem('oauth_provider_token')
   *     window.localStorage.removeItem('oauth_provider_refresh_token')
   *   }
   * })
   *
   * // Call this on your Sign in with GitHub button to initiate OAuth
   * // with GitHub with the requested elevated scopes.
   * await supabase.auth.signInWithOAuth({
   *   provider: 'github',
   *   options: {
   *     scopes: 'repo gist notifications'
   *   }
   * })
   * ```
   */
  async signInWithOAuth(e) {
    var r, n, s, i;
    return await this._handleProviderSignIn(e.provider, {
      redirectTo: (r = e.options) === null || r === void 0 ? void 0 : r.redirectTo,
      scopes: (n = e.options) === null || n === void 0 ? void 0 : n.scopes,
      queryParams: (s = e.options) === null || s === void 0 ? void 0 : s.queryParams,
      skipBrowserRedirect: (i = e.options) === null || i === void 0 ? void 0 : i.skipBrowserRedirect
    });
  }
  /**
   * Log in an existing user by exchanging an Auth Code issued during the PKCE flow.
   *
   * @category Auth
   *
   * @remarks
   * - Used when `flowType` is set to `pkce` in client options.
   * - When several PKCE flows are in flight at once, pass `options.flowId` so
   *   the code is exchanged with the verifier created by that specific flow.
   *   The flow id is returned by `signInWithOAuth`, and with
   *   `experimental.appendPkceFlowIdToRedirects` enabled it also arrives on
   *   your callback URL as the reserved `sb_flow_id` query parameter (read
   *   automatically in a browser).
   * - When a flow id is present but its stored verifier is gone (evicted,
   *   already used, or from another device), the call fails with a verifier
   *   missing error instead of trying another flow's verifier — a mismatched
   *   verifier would consume the single-use code. Without any flow id the
   *   most recently stored verifier is used, as before.
   *
   * @example Exchange Auth Code
   * ```js
   * supabase.auth.exchangeCodeForSession('34e770dd-9ff9-416c-87fa-43b31d7ef225')
   * ```
   *
   * @example Exchange Auth Code for a specific flow (e.g. in a server-side callback handler)
   * ```js
   * const flowId = requestUrl.searchParams.get('sb_flow_id')
   * supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
   * ```
   *
   * @exampleResponse Exchange Auth Code
   * ```json
   * {
   *   "data": {
   *     session: {
   *       access_token: '<ACCESS_TOKEN>',
   *       token_type: 'bearer',
   *       expires_in: 3600,
   *       expires_at: 1700000000,
   *       refresh_token: '<REFRESH_TOKEN>',
   *       user: {
   *         id: '11111111-1111-1111-1111-111111111111',
   *         aud: 'authenticated',
   *         role: 'authenticated',
   *         email: 'example@email.com'
   *         email_confirmed_at: '2024-01-01T00:00:00Z',
   *         phone: '',
   *         confirmation_sent_at: '2024-01-01T00:00:00Z',
   *         confirmed_at: '2024-01-01T00:00:00Z',
   *         last_sign_in_at: '2024-01-01T00:00:00Z',
   *         app_metadata: {
   *           "provider": "email",
   *           "providers": [
   *             "email",
   *             "<OTHER_PROVIDER>"
   *           ]
   *         },
   *         user_metadata: {
   *           email: 'email@email.com',
   *           email_verified: true,
   *           full_name: 'User Name',
   *           iss: '<ISS>',
   *           name: 'User Name',
   *           phone_verified: false,
   *           provider_id: '<PROVIDER_ID>',
   *           sub: '<SUB>'
   *         },
   *         identities: [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "email@example.com"
   *           },
   *           {
   *             "identity_id": "33333333-3333-3333-3333-333333333333",
   *             "id": "<ID>",
   *             "user_id": "<USER_ID>",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": true,
   *               "full_name": "User Name",
   *               "iss": "<ISS>",
   *               "name": "User Name",
   *               "phone_verified": false,
   *               "provider_id": "<PROVIDER_ID>",
   *               "sub": "<SUB>"
   *             },
   *             "provider": "<PROVIDER>",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         created_at: '2024-01-01T00:00:00Z',
   *         updated_at: '2024-01-01T00:00:00Z',
   *         is_anonymous: false
   *       },
   *       provider_token: '<PROVIDER_TOKEN>',
   *       provider_refresh_token: '<PROVIDER_REFRESH_TOKEN>'
   *     },
   *     user: {
   *       id: '11111111-1111-1111-1111-111111111111',
   *       aud: 'authenticated',
   *       role: 'authenticated',
   *       email: 'example@email.com',
   *       email_confirmed_at: '2024-01-01T00:00:00Z',
   *       phone: '',
   *       confirmation_sent_at: '2024-01-01T00:00:00Z',
   *       confirmed_at: '2024-01-01T00:00:00Z',
   *       last_sign_in_at: '2024-01-01T00:00:00Z',
   *       app_metadata: {
   *         provider: 'email',
   *         providers: [
   *           "email",
   *           "<OTHER_PROVIDER>"
   *         ]
   *       },
   *       user_metadata: {
   *         email: 'email@email.com',
   *         email_verified: true,
   *         full_name: 'User Name',
   *         iss: '<ISS>',
   *         name: 'User Name',
   *         phone_verified: false,
   *         provider_id: '<PROVIDER_ID>',
   *         sub: '<SUB>'
   *       },
   *       identities: [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "email@example.com"
   *         },
   *         {
   *           "identity_id": "33333333-3333-3333-3333-333333333333",
   *           "id": "<ID>",
   *           "user_id": "<USER_ID>",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": true,
   *             "full_name": "User Name",
   *             "iss": "<ISS>",
   *             "name": "User Name",
   *             "phone_verified": false,
   *             "provider_id": "<PROVIDER_ID>",
   *             "sub": "<SUB>"
   *           },
   *           "provider": "<PROVIDER>",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       created_at: '2024-01-01T00:00:00Z',
   *       updated_at: '2024-01-01T00:00:00Z',
   *       is_anonymous: false
   *     },
   *     redirectType: null
   *   },
   *   "error": null
   * }
   * ```
   */
  async exchangeCodeForSession(e, r) {
    return await this.initializePromise, this.lock != null ? this._acquireLock(this.lockAcquireTimeout, async () => this._exchangeCodeForSession(e, r)) : this._exchangeCodeForSession(e, r);
  }
  /**
   * Signs in a user by verifying a message signed by the user's private key.
   * Supports Ethereum (via Sign-In-With-Ethereum) & Solana (Sign-In-With-Solana) standards,
   * both of which derive from the EIP-4361 standard
   * With slight variation on Solana's side.
   * @reference https://eips.ethereum.org/EIPS/eip-4361
   *
   * @category Auth
   *
   * @remarks
   * - Uses a Web3 (Ethereum, Solana) wallet to sign a user in.
   * - Read up on the [potential for abuse](/docs/guides/auth/auth-web3#potential-for-abuse) before using it.
   *
   * @example Sign in with Solana or Ethereum (Window API)
   * ```js
   *   // uses window.ethereum for the wallet
   *   const { data, error } = await supabase.auth.signInWithWeb3({
   *     chain: 'ethereum',
   *     statement: 'I accept the Terms of Service at https://example.com/tos'
   *   })
   *
   *   // uses window.solana for the wallet
   *   const { data, error } = await supabase.auth.signInWithWeb3({
   *     chain: 'solana',
   *     statement: 'I accept the Terms of Service at https://example.com/tos'
   *   })
   * ```
   *
   * @example Sign in with Ethereum (Message and Signature)
   * ```js
   *   const { data, error } = await supabase.auth.signInWithWeb3({
   *     chain: 'ethereum',
   *     message: '<sign in with ethereum message>',
   *     signature: '<hex of the ethereum signature over the message>',
   *   })
   * ```
   *
   * @example Sign in with Solana (Brave)
   * ```js
   *   const { data, error } = await supabase.auth.signInWithWeb3({
   *     chain: 'solana',
   *     statement: 'I accept the Terms of Service at https://example.com/tos',
   *     wallet: window.braveSolana
   *   })
   * ```
   *
   * @example Sign in with Solana (Wallet Adapter)
   * ```jsx
   *   function SignInButton() {
   *   const wallet = useWallet()
   *
   *   return (
   *     <>
   *       {wallet.connected ? (
   *         <button
   *           onClick={() => {
   *             supabase.auth.signInWithWeb3({
   *               chain: 'solana',
   *               statement: 'I accept the Terms of Service at https://example.com/tos',
   *               wallet,
   *             })
   *           }}
   *         >
   *           Sign in with Solana
   *         </button>
   *       ) : (
   *         <WalletMultiButton />
   *       )}
   *     </>
   *   )
   * }
   *
   * function App() {
   *   const endpoint = clusterApiUrl('devnet')
   *   const wallets = useMemo(() => [], [])
   *
   *   return (
   *     <ConnectionProvider endpoint={endpoint}>
   *       <WalletProvider wallets={wallets}>
   *         <WalletModalProvider>
   *           <SignInButton />
   *         </WalletModalProvider>
   *       </WalletProvider>
   *     </ConnectionProvider>
   *   )
   * }
   * ```
   */
  async signInWithWeb3(e) {
    const { chain: r } = e;
    switch (r) {
      case "ethereum":
        return await this.signInWithEthereum(e);
      case "solana":
        return await this.signInWithSolana(e);
      default:
        throw new Error(`@supabase/auth-js: Unsupported chain "${r}"`);
    }
  }
  async signInWithEthereum(e) {
    var r, n, s, i, o, a, l, c, u, d, p;
    let h, f;
    if ("message" in e)
      h = e.message, f = e.signature;
    else {
      const { chain: g, wallet: m, statement: y, options: _ } = e;
      let w;
      if (H())
        if (typeof m == "object")
          w = m;
        else {
          const M = window;
          if ("ethereum" in M && typeof M.ethereum == "object" && "request" in M.ethereum && typeof M.ethereum.request == "function")
            w = M.ethereum;
          else
            throw new Error("@supabase/auth-js: No compatible Ethereum wallet interface on the window object (window.ethereum) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'ethereum', wallet: resolvedUserWallet }) instead.");
        }
      else {
        if (typeof m != "object" || !(_ != null && _.url))
          throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
        w = m;
      }
      const E = new URL((r = _ == null ? void 0 : _.url) !== null && r !== void 0 ? r : window.location.href), R = await w.request({
        method: "eth_requestAccounts"
      }).then((M) => M).catch(() => {
        throw new Error("@supabase/auth-js: Wallet method eth_requestAccounts is missing or invalid");
      });
      if (!R || R.length === 0)
        throw new Error("@supabase/auth-js: No accounts available. Please ensure the wallet is connected.");
      const A = Ri(R[0]);
      let I = (n = _ == null ? void 0 : _.signInWithEthereum) === null || n === void 0 ? void 0 : n.chainId;
      if (!I) {
        const M = await w.request({
          method: "eth_chainId"
        });
        I = Bl(M);
      }
      const j = {
        domain: E.host,
        address: A,
        statement: y,
        uri: E.href,
        version: "1",
        chainId: I,
        nonce: (s = _ == null ? void 0 : _.signInWithEthereum) === null || s === void 0 ? void 0 : s.nonce,
        issuedAt: (o = (i = _ == null ? void 0 : _.signInWithEthereum) === null || i === void 0 ? void 0 : i.issuedAt) !== null && o !== void 0 ? o : /* @__PURE__ */ new Date(),
        expirationTime: (a = _ == null ? void 0 : _.signInWithEthereum) === null || a === void 0 ? void 0 : a.expirationTime,
        notBefore: (l = _ == null ? void 0 : _.signInWithEthereum) === null || l === void 0 ? void 0 : l.notBefore,
        requestId: (c = _ == null ? void 0 : _.signInWithEthereum) === null || c === void 0 ? void 0 : c.requestId,
        resources: (u = _ == null ? void 0 : _.signInWithEthereum) === null || u === void 0 ? void 0 : u.resources
      };
      h = Ml(j), f = await w.request({
        method: "personal_sign",
        params: [ql(h), A]
      });
    }
    try {
      const { data: g, error: m } = await k(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
        headers: this.headers,
        body: Object.assign({
          chain: "ethereum",
          message: h,
          signature: f
        }, !((d = e.options) === null || d === void 0) && d.captchaToken ? { gotrue_meta_security: { captcha_token: (p = e.options) === null || p === void 0 ? void 0 : p.captchaToken } } : null),
        xform: Q
      });
      if (m)
        throw m;
      if (!g || !g.session || !g.user) {
        const y = new We();
        return this._returnResult({ data: { user: null, session: null }, error: y });
      }
      return g.session && (await this._saveSession(g.session), await this._notifyAllSubscribers("SIGNED_IN", g.session)), this._returnResult({ data: Object.assign({}, g), error: m });
    } catch (g) {
      if (b(g))
        return this._returnResult({ data: { user: null, session: null }, error: g });
      throw g;
    }
  }
  async signInWithSolana(e) {
    var r, n, s, i, o, a, l, c, u, d, p, h;
    let f, g;
    if ("message" in e)
      f = e.message, g = e.signature;
    else {
      const { chain: m, wallet: y, statement: _, options: w } = e;
      let E;
      if (H())
        if (typeof y == "object")
          E = y;
        else {
          const A = window;
          if ("solana" in A && typeof A.solana == "object" && ("signIn" in A.solana && typeof A.solana.signIn == "function" || "signMessage" in A.solana && typeof A.solana.signMessage == "function"))
            E = A.solana;
          else
            throw new Error("@supabase/auth-js: No compatible Solana wallet interface on the window object (window.solana) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'solana', wallet: resolvedUserWallet }) instead.");
        }
      else {
        if (typeof y != "object" || !(w != null && w.url))
          throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
        E = y;
      }
      const R = new URL((r = w == null ? void 0 : w.url) !== null && r !== void 0 ? r : window.location.href);
      if ("signIn" in E && E.signIn) {
        const A = await E.signIn(Object.assign(Object.assign(Object.assign({ issuedAt: (/* @__PURE__ */ new Date()).toISOString() }, w == null ? void 0 : w.signInWithSolana), {
          // non-overridable properties
          version: "1",
          domain: R.host,
          uri: R.href
        }), _ ? { statement: _ } : null));
        let I;
        if (Array.isArray(A) && A[0] && typeof A[0] == "object")
          I = A[0];
        else if (A && typeof A == "object" && "signedMessage" in A && "signature" in A)
          I = A;
        else
          throw new Error("@supabase/auth-js: Wallet method signIn() returned unrecognized value");
        if ("signedMessage" in I && "signature" in I && (typeof I.signedMessage == "string" || I.signedMessage instanceof Uint8Array) && I.signature instanceof Uint8Array)
          f = typeof I.signedMessage == "string" ? I.signedMessage : new TextDecoder().decode(I.signedMessage), g = I.signature;
        else
          throw new Error("@supabase/auth-js: Wallet method signIn() API returned object without signedMessage and signature fields");
      } else {
        if (!("signMessage" in E) || typeof E.signMessage != "function" || !("publicKey" in E) || typeof E != "object" || !E.publicKey || !("toBase58" in E.publicKey) || typeof E.publicKey.toBase58 != "function")
          throw new Error("@supabase/auth-js: Wallet does not have a compatible signMessage() and publicKey.toBase58() API");
        f = [
          `${R.host} wants you to sign in with your Solana account:`,
          E.publicKey.toBase58(),
          ..._ ? ["", _, ""] : [""],
          "Version: 1",
          `URI: ${R.href}`,
          `Issued At: ${(s = (n = w == null ? void 0 : w.signInWithSolana) === null || n === void 0 ? void 0 : n.issuedAt) !== null && s !== void 0 ? s : (/* @__PURE__ */ new Date()).toISOString()}`,
          ...!((i = w == null ? void 0 : w.signInWithSolana) === null || i === void 0) && i.notBefore ? [`Not Before: ${w.signInWithSolana.notBefore}`] : [],
          ...!((o = w == null ? void 0 : w.signInWithSolana) === null || o === void 0) && o.expirationTime ? [`Expiration Time: ${w.signInWithSolana.expirationTime}`] : [],
          ...!((a = w == null ? void 0 : w.signInWithSolana) === null || a === void 0) && a.chainId ? [`Chain ID: ${w.signInWithSolana.chainId}`] : [],
          ...!((l = w == null ? void 0 : w.signInWithSolana) === null || l === void 0) && l.nonce ? [`Nonce: ${w.signInWithSolana.nonce}`] : [],
          ...!((c = w == null ? void 0 : w.signInWithSolana) === null || c === void 0) && c.requestId ? [`Request ID: ${w.signInWithSolana.requestId}`] : [],
          ...!((d = (u = w == null ? void 0 : w.signInWithSolana) === null || u === void 0 ? void 0 : u.resources) === null || d === void 0) && d.length ? [
            "Resources",
            ...w.signInWithSolana.resources.map((I) => `- ${I}`)
          ] : []
        ].join(`
`);
        const A = await E.signMessage(new TextEncoder().encode(f), "utf8");
        if (!A || !(A instanceof Uint8Array))
          throw new Error("@supabase/auth-js: Wallet signMessage() API returned an recognized value");
        g = A;
      }
    }
    try {
      const { data: m, error: y } = await k(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
        headers: this.headers,
        body: Object.assign({ chain: "solana", message: f, signature: De(g) }, !((p = e.options) === null || p === void 0) && p.captchaToken ? { gotrue_meta_security: { captcha_token: (h = e.options) === null || h === void 0 ? void 0 : h.captchaToken } } : null),
        xform: Q
      });
      if (y)
        throw y;
      if (!m || !m.session || !m.user) {
        const _ = new We();
        return this._returnResult({ data: { user: null, session: null }, error: _ });
      }
      return m.session && (await this._saveSession(m.session), await this._notifyAllSubscribers("SIGNED_IN", m.session)), this._returnResult({ data: Object.assign({}, m), error: y });
    } catch (m) {
      if (b(m))
        return this._returnResult({ data: { user: null, session: null }, error: m });
      throw m;
    }
  }
  async _exchangeCodeForSession(e, r) {
    const n = (r == null ? void 0 : r.flowId) != null, s = n ? Ft(r == null ? void 0 : r.flowId) : H() ? Ft(ns(window.location.href)[Le]) : null;
    n && !s && this._debug("#_exchangeCodeForSession()", "provided flowId is not a valid flow id", r == null ? void 0 : r.flowId);
    const { verifier: i, flowId: o } = n && !s ? { verifier: null, flowId: null } : await bl(this.storage, this.storageKey, s), [a, l] = (i ?? "").split("/");
    try {
      if (!a && this.flowType === "pkce")
        throw new il();
      const { data: c, error: u } = await k(this.fetch, "POST", `${this.url}/token?grant_type=pkce`, {
        headers: this.headers,
        body: {
          auth_code: e,
          code_verifier: a
        },
        xform: Q
      });
      if (await ee(this.storage, this.storageKey, o), u)
        throw u;
      if (!c || !c.session || !c.user) {
        const d = new We();
        return this._returnResult({
          data: { user: null, session: null, redirectType: null },
          error: d
        });
      }
      return c.session && (await this._saveSession(c.session), await this._notifyAllSubscribers(l === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", c.session)), this._returnResult({ data: Object.assign(Object.assign({}, c), { redirectType: l ?? null }), error: u });
    } catch (c) {
      if (await ee(this.storage, this.storageKey, o), b(c))
        return this._returnResult({
          data: { user: null, session: null, redirectType: null },
          error: c
        });
      throw c;
    }
  }
  /**
   * Allows signing in with an OIDC ID token. The authentication provider used
   * should be enabled and configured.
   *
   * @category Auth
   *
   * @remarks
   * - Use an ID token to sign in.
   * - Especially useful when implementing sign in using native platform dialogs in mobile or desktop apps using Sign in with Apple or Sign in with Google on iOS and Android.
   * - You can also use Google's [One Tap](https://developers.google.com/identity/gsi/web/guides/display-google-one-tap) and [Automatic sign-in](https://developers.google.com/identity/gsi/web/guides/automatic-sign-in-sign-out) via this API.
   *
   * @example Sign In using ID Token
   * ```js
   * const { data, error } = await supabase.auth.signInWithIdToken({
   *   provider: 'google',
   *   token: 'your-id-token'
   * })
   * ```
   *
   * @exampleResponse Sign In using ID Token
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         ...
   *       },
   *       "user_metadata": {
   *         ...
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "provider": "google",
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           ...
   *         },
   *         "user_metadata": {
   *           ...
   *         },
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "provider": "google",
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z",
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   */
  async signInWithIdToken(e) {
    try {
      const { options: r, provider: n, token: s, access_token: i, nonce: o } = e, a = await k(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
        headers: this.headers,
        body: {
          provider: n,
          id_token: s,
          access_token: i,
          nonce: o,
          gotrue_meta_security: { captcha_token: r == null ? void 0 : r.captchaToken }
        },
        xform: Q
      }), { data: l, error: c } = a;
      if (c)
        return this._returnResult({ data: { user: null, session: null }, error: c });
      if (!l || !l.session || !l.user) {
        const u = new We();
        return this._returnResult({ data: { user: null, session: null }, error: u });
      }
      return l.session && (await this._saveSession(l.session), await this._notifyAllSubscribers("SIGNED_IN", l.session)), this._returnResult({ data: l, error: c });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: { user: null, session: null }, error: r });
      throw r;
    }
  }
  /**
   * Log in a user using magiclink or a one-time password (OTP).
   *
   * If the `{{ .ConfirmationURL }}` variable is specified in the email template, a magiclink will be sent.
   * If the `{{ .Token }}` variable is specified in the email template, an OTP will be sent.
   * If you're using phone sign-ins, only an OTP will be sent. You won't be able to send a magiclink for phone sign-ins.
   *
   * Be aware that you may get back an error message that will not distinguish
   * between the cases where the account does not exist or, that the account
   * can only be accessed via social login.
   *
   * Do note that you will need to configure a Whatsapp sender on Twilio
   * if you are using phone sign in with the 'whatsapp' channel. The whatsapp
   * channel is not supported on other providers
   * at this time.
   * This method supports PKCE when an email is passed.
   *
   * @category Auth
   *
   * @remarks
   * - Requires either an email or phone number.
   * - This method is used for passwordless sign-ins where a OTP is sent to the user's email or phone number.
   * - If the user doesn't exist, `signInWithOtp()` will signup the user instead. To restrict this behavior, you can set `shouldCreateUser` in `SignInWithPasswordlessCredentials.options` to `false`.
   * - If you're using an email, you can configure whether you want the user to receive a magiclink or a OTP.
   * - If you're using phone, you can configure whether you want the user to receive a OTP.
   * - The magic link's destination URL is determined by the [`SITE_URL`](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls).
   * - See [redirect URLs and wildcards](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) to add additional redirect URLs to your project.
   * - Magic links and OTPs share the same implementation. To send users a one-time code instead of a magic link, [modify the magic link email template](/dashboard/project/_/auth/templates) to include `{{ .Token }}` instead of `{{ .ConfirmationURL }}`.
   * - See our [Twilio Phone Auth Guide](/docs/guides/auth/phone-login?showSMSProvider=Twilio) for details about configuring WhatsApp sign in.
   *
   * @exampleDescription Sign in with email
   * The user will be sent an email which contains either a magiclink or a OTP or both. By default, a given user can only request a OTP once every 60 seconds.
   *
   * @example Sign in with email
   * ```js
   * const { data, error } = await supabase.auth.signInWithOtp({
   *   email: 'example@email.com',
   *   options: {
   *     emailRedirectTo: 'https://example.com/welcome'
   *   }
   * })
   * ```
   *
   * @exampleResponse Sign in with email
   * ```json
   * {
   *   "data": {
   *     "user": null,
   *     "session": null
   *   },
   *   "error": null
   * }
   * ```
   *
   * @exampleDescription Sign in with SMS OTP
   * The user will be sent a SMS which contains a OTP. By default, a given user can only request a OTP once every 60 seconds.
   *
   * @example Sign in with SMS OTP
   * ```js
   * const { data, error } = await supabase.auth.signInWithOtp({
   *   phone: '+13334445555',
   * })
   * ```
   *
   * @exampleDescription Sign in with WhatsApp OTP
   * The user will be sent a WhatsApp message which contains a OTP. By default, a given user can only request a OTP once every 60 seconds. Note that a user will need to have a valid WhatsApp account that is linked to Twilio in order to use this feature.
   *
   * @example Sign in with WhatsApp OTP
   * ```js
   * const { data, error } = await supabase.auth.signInWithOtp({
   *   phone: '+13334445555',
   *   options: {
   *     channel:'whatsapp',
   *   }
   * })
   * ```
   */
  async signInWithOtp(e) {
    var r, n, s, i, o;
    let a = null;
    try {
      if ("email" in e) {
        const { email: l, options: c } = e;
        let u = null, d = null;
        this.flowType === "pkce" && ([u, d, a] = await this._getCodeChallengeAndMethod());
        const { error: p } = await k(this.fetch, "POST", `${this.url}/otp`, {
          headers: this.headers,
          body: {
            email: l,
            data: (r = c == null ? void 0 : c.data) !== null && r !== void 0 ? r : {},
            create_user: (n = c == null ? void 0 : c.shouldCreateUser) !== null && n !== void 0 ? n : !0,
            gotrue_meta_security: { captcha_token: c == null ? void 0 : c.captchaToken },
            code_challenge: u,
            code_challenge_method: d
          },
          redirectTo: this._maybeAppendFlowIdToRedirect(c == null ? void 0 : c.emailRedirectTo, a)
        });
        return this._returnResult({ data: { user: null, session: null }, error: p });
      }
      if ("phone" in e) {
        const { phone: l, options: c } = e, { data: u, error: d } = await k(this.fetch, "POST", `${this.url}/otp`, {
          headers: this.headers,
          body: {
            phone: l,
            data: (s = c == null ? void 0 : c.data) !== null && s !== void 0 ? s : {},
            create_user: (i = c == null ? void 0 : c.shouldCreateUser) !== null && i !== void 0 ? i : !0,
            gotrue_meta_security: { captcha_token: c == null ? void 0 : c.captchaToken },
            channel: (o = c == null ? void 0 : c.channel) !== null && o !== void 0 ? o : "sms"
          }
        });
        return this._returnResult({
          data: { user: null, session: null, messageId: u == null ? void 0 : u.message_id },
          error: d
        });
      }
      throw new jt("You must provide either an email or phone number.");
    } catch (l) {
      if (await ee(this.storage, this.storageKey, a), b(l))
        return this._returnResult({ data: { user: null, session: null }, error: l });
      throw l;
    }
  }
  /**
   * Log in a user given a User supplied OTP or TokenHash received through mobile or email.
   *
   * @category Auth
   *
   * @remarks
   * - The `verifyOtp` method takes in different verification types.
   * - If a phone number is used, the type can either be:
   *   1. `sms` – Used when verifying a one-time password (OTP) sent via SMS during sign-up or sign-in.
   *   2. `phone_change` – Used when verifying an OTP sent to a new phone number during a phone number update process.
   * - If an email address is used, the type can be one of the following (note: `signup` and `magiclink` types are deprecated):
   *   1. `email` – Used when verifying an OTP sent to the user's email during sign-up or sign-in.
   *   2. `recovery` – Used when verifying an OTP sent for account recovery, typically after a password reset request.
   *   3. `invite` – Used when verifying an OTP sent as part of an invitation to join a project or organization.
   *   4. `email_change` – Used when verifying an OTP sent to a new email address during an email update process.
   * - The verification type used should be determined based on the corresponding auth method called before `verifyOtp` to sign up / sign-in a user.
   * - The `TokenHash` is contained in the [email templates](/docs/guides/auth/auth-email-templates) and can be used to sign in.  You may wish to use the hash for the PKCE flow for Server Side Auth. Read [the Password-based Auth guide](/docs/guides/auth/passwords) for more details.
   *
   * @example Verify Signup One-Time Password (OTP)
   * ```js
   * const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email'})
   * ```
   *
   * @exampleResponse Verify Signup One-Time Password (OTP)
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "confirmed_at": "2024-01-01T00:00:00Z",
   *       "recovery_sent_at": "2024-01-01T00:00:00Z",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {
   *         "email": "example@email.com",
   *         "email_verified": false,
   *         "phone_verified": false,
   *         "sub": "11111111-1111-1111-1111-111111111111"
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": false
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "example@email.com",
   *         "email_confirmed_at": "2024-01-01T00:00:00Z",
   *         "phone": "",
   *         "confirmed_at": "2024-01-01T00:00:00Z",
   *         "recovery_sent_at": "2024-01-01T00:00:00Z",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           "provider": "email",
   *           "providers": [
   *             "email"
   *           ]
   *         },
   *         "user_metadata": {
   *           "email": "example@email.com",
   *           "email_verified": false,
   *           "phone_verified": false,
   *           "sub": "11111111-1111-1111-1111-111111111111"
   *         },
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z",
   *         "is_anonymous": false
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Verify SMS One-Time Password (OTP)
   * ```js
   * const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms'})
   * ```
   *
   * @example Verify Email Auth (Token Hash)
   * ```js
   * const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email'})
   * ```
   */
  async verifyOtp(e) {
    var r, n;
    try {
      let s, i;
      "options" in e && (s = (r = e.options) === null || r === void 0 ? void 0 : r.redirectTo, i = (n = e.options) === null || n === void 0 ? void 0 : n.captchaToken);
      const { data: o, error: a } = await k(this.fetch, "POST", `${this.url}/verify`, {
        headers: this.headers,
        body: Object.assign(Object.assign({}, e), { gotrue_meta_security: { captcha_token: i } }),
        redirectTo: s,
        xform: Q
      });
      if (a)
        throw a;
      if (!o)
        throw new Error("An error occurred on token verification.");
      const l = o.session, c = o.user;
      return l != null && l.access_token && (await this._saveSession(l), await this._notifyAllSubscribers(e.type == "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", l)), this._returnResult({ data: { user: c, session: l }, error: null });
    } catch (s) {
      if (b(s))
        return this._returnResult({ data: { user: null, session: null }, error: s });
      throw s;
    }
  }
  /**
   * Attempts a single-sign on using an enterprise Identity Provider. A
   * successful SSO attempt will redirect the current page to the identity
   * provider authorization page. The redirect URL is implementation and SSO
   * protocol specific.
   *
   * You can use it by providing a SSO domain. Typically you can extract this
   * domain by asking users for their email address. If this domain is
   * registered on the Auth instance the redirect will use that organization's
   * currently active SSO Identity Provider for the login.
   *
   * If you have built an organization-specific login page, you can use the
   * organization's SSO Identity Provider UUID directly instead.
   *
   * @category Auth
   *
   * @remarks
   * - Before you can call this method you need to [establish a connection](/docs/guides/auth/sso/auth-sso-saml#managing-saml-20-connections) to an identity provider. Use the [CLI commands](/docs/reference/cli/supabase-sso) to do this.
   * - If you've associated an email domain to the identity provider, you can use the `domain` property to start a sign-in flow.
   * - In case you need to use a different way to start the authentication flow with an identity provider, you can use the `providerId` property. For example:
   *     - Mapping specific user email addresses with an identity provider.
   *     - Using different hints to identity the identity provider to be used by the user, like a company-specific page, IP address or other tracking information.
   *
   * @example Sign in with email domain
   * ```js
   *   // You can extract the user's email domain and use it to trigger the
   *   // authentication flow with the correct identity provider.
   *
   *   const { data, error } = await supabase.auth.signInWithSSO({
   *     domain: 'company.com'
   *   })
   *
   *   if (data?.url) {
   *     // redirect the user to the identity provider's authentication flow
   *     window.location.href = data.url
   *   }
   * ```
   *
   * @example Sign in with provider UUID
   * ```js
   *   // Useful when you need to map a user's sign in request according
   *   // to different rules that can't use email domains.
   *
   *   const { data, error } = await supabase.auth.signInWithSSO({
   *     providerId: '21648a9d-8d5a-4555-a9d1-d6375dc14e92'
   *   })
   *
   *   if (data?.url) {
   *     // redirect the user to the identity provider's authentication flow
   *     window.location.href = data.url
   *   }
   * ```
   */
  async signInWithSSO(e) {
    var r, n, s, i;
    let o = null;
    try {
      let a = null, l = null;
      this.flowType === "pkce" && ([a, l, o] = await this._getCodeChallengeAndMethod());
      const c = await k(this.fetch, "POST", `${this.url}/sso`, {
        body: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, "providerId" in e ? { provider_id: e.providerId } : null), "domain" in e ? { domain: e.domain } : null), { redirect_to: this._maybeAppendFlowIdToRedirect((r = e.options) === null || r === void 0 ? void 0 : r.redirectTo, o) }), !((n = e == null ? void 0 : e.options) === null || n === void 0) && n.captchaToken ? { gotrue_meta_security: { captcha_token: e.options.captchaToken } } : null), { skip_http_redirect: !0, code_challenge: a, code_challenge_method: l }),
        headers: this.headers,
        xform: Pl
      });
      return !((s = c.data) === null || s === void 0) && s.url && H() && !(!((i = e.options) === null || i === void 0) && i.skipBrowserRedirect) && window.location.assign(c.data.url), this._returnResult(c);
    } catch (a) {
      if (await ee(this.storage, this.storageKey, o), b(a))
        return this._returnResult({ data: null, error: a });
      throw a;
    }
  }
  /**
   * Sends a reauthentication OTP to the user's email or phone number.
   * Requires the user to be signed-in.
   *
   * @category Auth
   *
   * @remarks
   * - This method is used together with `updateUser()` when a user's password needs to be updated.
   * - If you require your user to reauthenticate before updating their password, you need to enable the **Secure password change** option in your [project's email provider settings](/dashboard/project/_/auth/providers).
   * - A user is only require to reauthenticate before updating their password if **Secure password change** is enabled and the user **hasn't recently signed in**. A user is deemed recently signed in if the session was created in the last 24 hours.
   * - This method will send a nonce to the user's email. If the user doesn't have a confirmed email address, the method will send the nonce to the user's confirmed phone number instead.
   * - After receiving the OTP, include it as the `nonce` in your `updateUser()` call to finalize the password change.
   *
   * @exampleDescription Send reauthentication nonce
   * Sends a reauthentication nonce to the user's email or phone number.
   *
   * @example Send reauthentication nonce
   * ```js
   * const { error } = await supabase.auth.reauthenticate()
   * ```
   */
  async reauthenticate() {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._reauthenticate()) : await this._reauthenticate();
  }
  async _reauthenticate() {
    try {
      return await this._useSession(async (e) => {
        const { data: { session: r }, error: n } = e;
        if (n)
          throw n;
        if (!r)
          throw new F();
        const { error: s } = await k(this.fetch, "GET", `${this.url}/reauthenticate`, {
          headers: this.headers,
          jwt: r.access_token
        });
        return this._returnResult({ data: { user: null, session: null }, error: s });
      });
    } catch (e) {
      if (b(e))
        return this._returnResult({ data: { user: null, session: null }, error: e });
      throw e;
    }
  }
  /**
   * Resends an existing signup confirmation email, email change email, SMS OTP or phone change OTP.
   *
   * @category Auth
   *
   * @remarks
   * - Resends a signup confirmation, email change or phone change email to the user.
   * - Passwordless sign-ins can be resent by calling the `signInWithOtp()` method again.
   * - Password recovery emails can be resent by calling the `resetPasswordForEmail()` method again.
   * - This method will only resend an email or phone OTP to the user if there was an initial signup, email change or phone change request being made(note: For existing users signing in with OTP, you should use `signInWithOtp()` again to resend the OTP).
   * - You can specify a redirect url when you resend an email link using the `emailRedirectTo` option.
   *
   * @exampleDescription Resend an email signup confirmation
   * Resends the email signup confirmation to the user
   *
   * @example Resend an email signup confirmation
   * ```js
   * const { error } = await supabase.auth.resend({
   *   type: 'signup',
   *   email: 'email@example.com',
   *   options: {
   *     emailRedirectTo: 'https://example.com/welcome'
   *   }
   * })
   * ```
   *
   * @exampleDescription Resend a phone signup confirmation
   * Resends the phone signup confirmation email to the user
   *
   * @example Resend a phone signup confirmation
   * ```js
   * const { error } = await supabase.auth.resend({
   *   type: 'sms',
   *   phone: '1234567890'
   * })
   * ```
   *
   * @exampleDescription Resend email change email
   * Resends the email change email to the user
   *
   * @example Resend email change email
   * ```js
   * const { error } = await supabase.auth.resend({
   *   type: 'email_change',
   *   email: 'email@example.com'
   * })
   * ```
   *
   * @exampleDescription Resend phone change OTP
   * Resends the phone change OTP to the user
   *
   * @example Resend phone change OTP
   * ```js
   * const { error } = await supabase.auth.resend({
   *   type: 'phone_change',
   *   phone: '1234567890'
   * })
   * ```
   */
  async resend(e) {
    let r = null;
    try {
      const n = `${this.url}/resend`;
      if ("email" in e) {
        const { email: s, type: i, options: o } = e;
        let a = null, l = null;
        this.flowType === "pkce" && ([a, l, r] = await this._getCodeChallengeAndMethod());
        const { error: c } = await k(this.fetch, "POST", n, {
          headers: this.headers,
          body: {
            email: s,
            type: i,
            gotrue_meta_security: { captcha_token: o == null ? void 0 : o.captchaToken },
            code_challenge: a,
            code_challenge_method: l
          },
          redirectTo: this._maybeAppendFlowIdToRedirect(o == null ? void 0 : o.emailRedirectTo, r)
        });
        return c && await ee(this.storage, this.storageKey, r), this._returnResult({ data: { user: null, session: null }, error: c });
      } else if ("phone" in e) {
        const { phone: s, type: i, options: o } = e, { data: a, error: l } = await k(this.fetch, "POST", n, {
          headers: this.headers,
          body: {
            phone: s,
            type: i,
            gotrue_meta_security: { captcha_token: o == null ? void 0 : o.captchaToken }
          }
        });
        return this._returnResult({
          data: { user: null, session: null, messageId: a == null ? void 0 : a.message_id },
          error: l
        });
      }
      throw new jt("You must provide either an email or phone number and a type");
    } catch (n) {
      if (await ee(this.storage, this.storageKey, r), b(n))
        return this._returnResult({ data: { user: null, session: null }, error: n });
      throw n;
    }
  }
  /**
   * Returns the session, refreshing it if necessary.
   *
   * The session returned can be null if the session is not detected which can happen in the event a user is not signed-in or has logged out.
   *
   * **IMPORTANT:** This method loads values directly from the storage attached
   * to the client. If that storage is based on request cookies for example,
   * the values in it may not be authentic and therefore it's strongly advised
   * against using this method and its results in such circumstances. A warning
   * will be emitted if this is detected. Use {@link GoTrueClient.getUser} instead.
   *
   * @category Auth
   *
   * @remarks
   * - Since the introduction of [asymmetric JWT signing keys](/docs/guides/auth/signing-keys), this method is considered low-level and we encourage you to use `getClaims()` or `getUser()` instead.
   * - Retrieves the current [user session](/docs/guides/auth/sessions) from the storage medium (local storage, cookies).
   * - The session contains an access token (signed JWT), a refresh token and the user object.
   * - If the session's access token is expired or is about to expire, this method will use the refresh token to refresh the session.
   * - When using in a browser, or you've called `startAutoRefresh()` in your environment (React Native, etc.) this function always returns a valid access token without refreshing the session itself, as this is done in the background. This function returns very fast.
   * - **IMPORTANT SECURITY NOTICE:** If using an insecure storage medium, such as cookies or request headers, the user object returned by this function **must not be trusted**. Always verify the JWT using `getClaims()` or your own JWT verification library to securely establish the user's identity and access. You can also use `getUser()` to fetch the user object directly from the Auth server for this purpose.
   * - Cross-tab refresh races are handled by the GoTrue server (the rotated token from the first tab is returned to subsequent tabs via the parent-of-active mechanism), so no client-side serialization is needed.
   *
   * @example Get the session data
   * ```js
   * const { data, error } = await supabase.auth.getSession()
   * ```
   *
   * @exampleResponse Get the session data
   * ```json
   * {
   *   "data": {
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "example@email.com",
   *         "email_confirmed_at": "2024-01-01T00:00:00Z",
   *         "phone": "",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           "provider": "email",
   *           "providers": [
   *             "email"
   *           ]
   *         },
   *         "user_metadata": {
   *           "email": "example@email.com",
   *           "email_verified": false,
   *           "phone_verified": false,
   *           "sub": "11111111-1111-1111-1111-111111111111"
   *         },
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z",
   *         "is_anonymous": false
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   */
  async getSession() {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => this._useSession(async (e) => e)) : await this._useSession(async (e) => e);
  }
  /**
   * Acquires a global lock based on the storage key.
   *
   * TODO(v3): remove along with the legacy lock path. Only called when
   * `this.lock` is non-null (custom lock supplied via constructor). The
   * default lockless path bypasses this entirely.
   */
  async _acquireLock(e, r) {
    this._debug("#_acquireLock", "begin", e);
    try {
      if (this.lockAcquired) {
        const n = this.pendingInLock.length ? this.pendingInLock[this.pendingInLock.length - 1] : Promise.resolve(), s = (async () => (await n, await r()))();
        return this.pendingInLock.push((async () => {
          try {
            await s;
          } catch {
          }
        })()), s;
      }
      return await this.lock(`lock:${this.storageKey}`, e, async () => {
        this._debug("#_acquireLock", "lock acquired for storage key", this.storageKey);
        try {
          this.lockAcquired = !0;
          const n = r();
          for (this.pendingInLock.push((async () => {
            try {
              await n;
            } catch {
            }
          })()), await n; this.pendingInLock.length; ) {
            const s = [...this.pendingInLock];
            await Promise.all(s), this.pendingInLock.splice(0, s.length);
          }
          return await n;
        } finally {
          this._debug("#_acquireLock", "lock released for storage key", this.storageKey), this.lockAcquired = !1;
        }
      });
    } finally {
      this._debug("#_acquireLock", "end");
    }
  }
  /**
   * Use instead of {@link GoTrueClient.getSession} inside the library. Loads the session
   * via `__loadSession` (which may trigger a refresh if the access token is
   * within the expiry margin) and runs `fn` with the result.
   */
  async _useSession(e) {
    this._debug("#_useSession", "begin");
    try {
      const r = await this.__loadSession();
      return await e(r);
    } finally {
      this._debug("#_useSession", "end");
    }
  }
  /**
   * NEVER USE DIRECTLY!
   *
   * Always use `_useSession`.
   */
  async __loadSession() {
    this._debug("#__loadSession()", "begin"), this.lock != null && !this.lockAcquired && this._debug("#__loadSession()", "used outside of an acquired lock!", new Error().stack);
    try {
      let e = null;
      const r = await z(this.storage, this.storageKey);
      if (this._debug("#getSession()", "session from storage", r), r !== null && (this._isValidSession(r) ? e = r : (this._debug("#getSession()", "session from storage is not valid"), await this._removeSession())), !e)
        return { data: { session: null }, error: null };
      const n = e.expires_at ? e.expires_at * 1e3 - Date.now() < wr : !1;
      if (this._debug("#__loadSession()", `session has${n ? "" : " not"} expired`, "expires_at", e.expires_at), !n)
        return { data: { session: await this._hydrateSessionUser(e) }, error: null };
      const { data: s, error: i } = await this._callRefreshToken(e.refresh_token);
      if (i) {
        const o = await z(this.storage, this.storageKey);
        return o && this._isValidSession(o) && o.expires_at && o.expires_at * 1e3 > Date.now() ? this._returnResult({
          data: { session: await this._hydrateSessionUser(o) },
          error: null
        }) : this._returnResult({ data: { session: null }, error: i });
      }
      return this._returnResult({ data: { session: s }, error: null });
    } finally {
      this._debug("#__loadSession()", "end");
    }
  }
  /**
   * Completes a session read back from storage so it matches what callers of
   * `getSession()` expect: fills in `session.user` from `userStorage` when the
   * client keeps the user in split storage, and wraps the user in the
   * insecure-access warning proxy on the server.
   */
  async _hydrateSessionUser(e) {
    if (this.userStorage) {
      const r = await z(this.userStorage, this.storageKey + "-user");
      e.user = r != null && r.user ? r.user : vr();
    }
    if (this.storage.isServer && e.user && !e.user.__isUserNotAvailableProxy) {
      const r = { value: this.suppressGetSessionWarning };
      e.user = Cl(e.user, r), r.value && (this.suppressGetSessionWarning = !0);
    }
    return e;
  }
  /**
   * Gets the current user details if there is an existing session. This method
   * performs a network request to the Supabase Auth server, so the returned
   * value is authentic and can be used to base authorization rules on.
   *
   * @param jwt Takes in an optional access token JWT. If no JWT is provided, the JWT from the current session is used.
   *
   * @category Auth
   *
   * @remarks
   * - This method fetches the user object from the database instead of local session.
   * - This method is useful for checking if the user is authorized because it validates the user's access token JWT on the server.
   * - Should always be used when checking for user authorization on the server. On the client, you can instead use `getSession().session.user` for faster results. `getSession` is insecure on the server.
   *
   * @example Get the logged in user with the current existing session
   * ```js
   * const { data: { user } } = await supabase.auth.getUser()
   * ```
   *
   * @exampleResponse Get the logged in user with the current existing session
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "confirmed_at": "2024-01-01T00:00:00Z",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {
   *         "email": "example@email.com",
   *         "email_verified": false,
   *         "phone_verified": false,
   *         "sub": "11111111-1111-1111-1111-111111111111"
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": false
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Get the logged in user with a custom access token jwt
   * ```js
   * const { data: { user } } = await supabase.auth.getUser(jwt)
   * ```
   */
  async getUser(e) {
    if (e)
      return await this._getUser(e);
    await this.initializePromise;
    let r;
    return this.lock != null ? r = await this._acquireLock(this.lockAcquireTimeout, async () => await this._getUser()) : r = await this._getUser(), r.data.user && (this.suppressGetSessionWarning = !0), r;
  }
  async _getUser(e) {
    try {
      return e ? await k(this.fetch, "GET", `${this.url}/user`, {
        headers: this.headers,
        jwt: e,
        xform: xe
      }) : await this._useSession(async (r) => {
        var n, s, i;
        const { data: o, error: a } = r;
        if (a)
          throw a;
        return !(!((n = o.session) === null || n === void 0) && n.access_token) && !this.hasCustomAuthorizationHeader ? { data: { user: null }, error: new F() } : await k(this.fetch, "GET", `${this.url}/user`, {
          headers: this.headers,
          jwt: (i = (s = o.session) === null || s === void 0 ? void 0 : s.access_token) !== null && i !== void 0 ? i : void 0,
          xform: xe
        });
      });
    } catch (r) {
      if (b(r))
        return It(r) && await this._removeSession(), this._returnResult({ data: { user: null }, error: r });
      throw r;
    }
  }
  /**
   * Updates user data for a logged in user.
   *
   * @category Auth
   *
   * @remarks
   * - In order to use the `updateUser()` method, the user needs to be signed in first.
   * - By default, email updates sends a confirmation link to both the user's current and new email.
   * To only send a confirmation link to the user's new email, disable **Secure email change** in your project's [email auth provider settings](/dashboard/project/_/auth/providers).
   *
   * @exampleDescription Update the email for an authenticated user
   * Sends a "Confirm Email Change" email to the new address. If **Secure Email Change** is enabled (default), confirmation is also required from the **old email** before the change is applied. To skip dual confirmation and apply the change after only the new email is verified, disable **Secure Email Change** in the [Email Auth Provider settings](/dashboard/project/_/auth/providers?provider=Email).
   *
   * @example Update the email for an authenticated user
   * ```js
   * const { data, error } = await supabase.auth.updateUser({
   *   email: 'new@email.com'
   * })
   * ```
   *
   * @exampleResponse Update the email for an authenticated user
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "confirmed_at": "2024-01-01T00:00:00Z",
   *       "new_email": "new@email.com",
   *       "email_change_sent_at": "2024-01-01T00:00:00Z",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {
   *         "email": "example@email.com",
   *         "email_verified": false,
   *         "phone_verified": false,
   *         "sub": "11111111-1111-1111-1111-111111111111"
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": false
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @exampleDescription Update the phone number for an authenticated user
   * Sends a one-time password (OTP) to the new phone number.
   *
   * @example Update the phone number for an authenticated user
   * ```js
   * const { data, error } = await supabase.auth.updateUser({
   *   phone: '123456789'
   * })
   * ```
   *
   * @example Update the password for an authenticated user
   * ```js
   * const { data, error } = await supabase.auth.updateUser({
   *   password: 'new password'
   * })
   * ```
   *
   * @exampleDescription Update the user's metadata
   * Updates the user's custom metadata.
   *
   * **Note**: The `data` field maps to the `auth.users.raw_user_meta_data` column in your Supabase database. When calling `getUser()`, the data will be available as `user.user_metadata`.
   *
   * @example Update the user's metadata
   * ```js
   * const { data, error } = await supabase.auth.updateUser({
   *   data: { hello: 'world' }
   * })
   * ```
   *
   * @exampleDescription Update the user's password with a nonce
   * If **Secure password change** is enabled in your [project's email provider settings](/dashboard/project/_/auth/providers), updating the user's password would require a nonce if the user **hasn't recently signed in**. The nonce is sent to the user's email or phone number. A user is deemed recently signed in if the session was created in the last 24 hours.
   *
   * @example Update the user's password with a nonce
   * ```js
   * const { data, error } = await supabase.auth.updateUser({
   *   password: 'new password',
   *   nonce: '123456'
   * })
   * ```
   */
  async updateUser(e, r = {}) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._updateUser(e, r)) : await this._updateUser(e, r);
  }
  async _updateUser(e, r = {}) {
    let n = null;
    try {
      return await this._useSession(async (s) => {
        const { data: i, error: o } = s;
        if (o)
          throw o;
        if (!i.session)
          throw new F();
        const a = i.session;
        let l = null, c = null;
        this.flowType === "pkce" && e.email != null && ([l, c, n] = await this._getCodeChallengeAndMethod());
        const { data: u, error: d } = await k(this.fetch, "PUT", `${this.url}/user`, {
          headers: this.headers,
          redirectTo: this._maybeAppendFlowIdToRedirect(r == null ? void 0 : r.emailRedirectTo, n),
          body: Object.assign(Object.assign({}, e), { code_challenge: l, code_challenge_method: c }),
          jwt: a.access_token,
          xform: xe
        });
        if (d)
          throw d;
        return a.user = u.user, await this._saveSession(a), await this._notifyAllSubscribers("USER_UPDATED", a), this._returnResult({ data: { user: a.user }, error: null });
      });
    } catch (s) {
      if (await ee(this.storage, this.storageKey, n), b(s))
        return this._returnResult({ data: { user: null }, error: s });
      throw s;
    }
  }
  /**
   * Sets the session data from the current session. If the current session is expired, setSession will take care of refreshing it to obtain a new session.
   * If the refresh token or access token in the current session is invalid, an error will be thrown.
   * @param currentSession The current session that minimally contains an access token and refresh token.
   *
   * @category Auth
   *
   * @remarks
   * - This method sets the session using an `access_token` and `refresh_token`.
   * - If successful, a `SIGNED_IN` event is emitted.
   *
   * @exampleDescription Set the session
   * Sets the session data from an access_token and refresh_token, then returns an auth response or error.
   *
   * @example Set the session
   * ```js
   *   const { data, error } = await supabase.auth.setSession({
   *     access_token,
   *     refresh_token
   *   })
   * ```
   *
   * @exampleResponse Set the session
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "confirmed_at": "2024-01-01T00:00:00Z",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {
   *         "email": "example@email.com",
   *         "email_verified": false,
   *         "phone_verified": false,
   *         "sub": "11111111-1111-1111-1111-111111111111"
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": false
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "example@email.com",
   *         "email_confirmed_at": "2024-01-01T00:00:00Z",
   *         "phone": "",
   *         "confirmed_at": "2024-01-01T00:00:00Z",
   *         "last_sign_in_at": "11111111-1111-1111-1111-111111111111",
   *         "app_metadata": {
   *           "provider": "email",
   *           "providers": [
   *             "email"
   *           ]
   *         },
   *         "user_metadata": {
   *           "email": "example@email.com",
   *           "email_verified": false,
   *           "phone_verified": false,
   *           "sub": "11111111-1111-1111-1111-111111111111"
   *         },
   *         "identities": [
   *           {
   *             "identity_id": "2024-01-01T00:00:00Z",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z",
   *         "is_anonymous": false
   *       },
   *       "token_type": "bearer",
   *       "expires_in": 3500,
   *       "expires_at": 1700000000
   *     }
   *   },
   *   "error": null
   * }
   * ```
   */
  async setSession(e) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._setSession(e)) : await this._setSession(e);
  }
  async _setSession(e) {
    try {
      if (!e.access_token || !e.refresh_token)
        throw new F();
      const r = Date.now() / 1e3;
      let n = r, s = !0, i = null;
      const { payload: o } = $t(e.access_token);
      if (o.exp && (n = o.exp, s = n <= r), s) {
        const { data: a, error: l } = await this._callRefreshToken(e.refresh_token);
        if (l)
          return this._returnResult({ data: { user: null, session: null }, error: l });
        if (!a)
          return { data: { user: null, session: null }, error: null };
        i = a;
      } else {
        const { data: a, error: l } = await this._getUser(e.access_token);
        if (l)
          return this._returnResult({ data: { user: null, session: null }, error: l });
        i = {
          access_token: e.access_token,
          refresh_token: e.refresh_token,
          user: a.user,
          token_type: "bearer",
          expires_in: n - r,
          expires_at: n
        }, await this._saveSession(i), await this._notifyAllSubscribers("SIGNED_IN", i);
      }
      return this._returnResult({ data: { user: i.user, session: i }, error: null });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: { session: null, user: null }, error: r });
      throw r;
    }
  }
  /**
   * Returns a new session, regardless of expiry status.
   * Takes in an optional current session. If not passed in, then refreshSession() will attempt to retrieve it from getSession().
   * If the current session's refresh token is invalid, an error will be thrown.
   * @param currentSession The current session. If passed in, it must contain a refresh token.
   *
   * @category Auth
   *
   * @remarks
   * - This method will refresh and return a new session whether the current one is expired or not.
   *
   * @example Refresh session using the current session
   * ```js
   * const { data, error } = await supabase.auth.refreshSession()
   * const { session, user } = data
   * ```
   *
   * @exampleResponse Refresh session using the current session
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "confirmed_at": "2024-01-01T00:00:00Z",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {
   *         "email": "example@email.com",
   *         "email_verified": false,
   *         "phone_verified": false,
   *         "sub": "11111111-1111-1111-1111-111111111111"
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": false
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "example@email.com",
   *         "email_confirmed_at": "2024-01-01T00:00:00Z",
   *         "phone": "",
   *         "confirmed_at": "2024-01-01T00:00:00Z",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           "provider": "email",
   *           "providers": [
   *             "email"
   *           ]
   *         },
   *         "user_metadata": {
   *           "email": "example@email.com",
   *           "email_verified": false,
   *           "phone_verified": false,
   *           "sub": "11111111-1111-1111-1111-111111111111"
   *         },
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z",
   *         "is_anonymous": false
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Refresh session using a refresh token
   * ```js
   * const { data, error } = await supabase.auth.refreshSession({ refresh_token })
   * const { session, user } = data
   * ```
   */
  async refreshSession(e) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._refreshSession(e)) : await this._refreshSession(e);
  }
  async _refreshSession(e) {
    try {
      return await this._useSession(async (r) => {
        var n;
        if (!e) {
          const { data: o, error: a } = r;
          if (a)
            throw a;
          e = (n = o.session) !== null && n !== void 0 ? n : void 0;
        }
        if (!(e != null && e.refresh_token))
          throw new F();
        const { data: s, error: i } = await this._callRefreshToken(e.refresh_token);
        return i ? this._returnResult({ data: { user: null, session: null }, error: i }) : s ? this._returnResult({ data: { user: s.user, session: s }, error: null }) : this._returnResult({ data: { user: null, session: null }, error: null });
      });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: { user: null, session: null }, error: r });
      throw r;
    }
  }
  /**
   * Gets the session data from a URL string
   */
  async _getSessionFromURL(e, r) {
    var n;
    try {
      if (!H())
        throw new Pt("No browser detected.");
      if (e.error || e.error_description || e.error_code)
        throw new Pt(e.error_description || "Error in URL with unspecified error_description", {
          error: e.error || "unspecified_error",
          code: e.error_code || "unspecified_code"
        });
      switch (r) {
        case "implicit":
          if (this.flowType === "pkce")
            throw new Yn("Not a valid PKCE flow url.");
          break;
        case "pkce":
          if (this.flowType === "implicit")
            throw new Pt("Not a valid implicit grant flow url.");
          break;
        default:
      }
      if (r === "pkce") {
        if (this._debug("#_initialize()", "begin", "is PKCE flow", !0), !e.code)
          throw new Yn("No code detected.");
        const { data: w, error: E } = await this._exchangeCodeForSession(e.code, {
          flowId: e[Le]
        });
        if (E)
          throw E;
        const R = new URL(window.location.href);
        return R.searchParams.delete("code"), R.searchParams.delete(Le), window.history.replaceState(window.history.state, "", R.toString()), {
          data: { session: w.session, redirectType: (n = w.redirectType) !== null && n !== void 0 ? n : null },
          error: null
        };
      }
      const { provider_token: s, provider_refresh_token: i, access_token: o, refresh_token: a, expires_in: l, expires_at: c, token_type: u } = e;
      if (!o || !l || !a || !u)
        throw new Pt("No session defined in URL");
      const d = Math.round(Date.now() / 1e3), p = parseInt(l);
      let h = d + p;
      c && (h = parseInt(c));
      const f = h - d;
      f * 1e3 <= ye && console.warn(`@supabase/gotrue-js: Session as retrieved from URL expires in ${f}s, should have been closer to ${p}s`);
      const g = h - p;
      d - g >= 120 ? console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued over 120s ago, URL could be stale", g, h, d) : d - g < 0 && console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew", g, h, d);
      const { data: m, error: y } = await this._getUser(o);
      if (y)
        throw y;
      const _ = {
        provider_token: s,
        provider_refresh_token: i,
        access_token: o,
        expires_in: p,
        expires_at: h,
        refresh_token: a,
        token_type: u,
        user: m.user
      };
      return window.location.hash = "", this._debug("#_getSessionFromURL()", "clearing window.location.hash"), this._returnResult({ data: { session: _, redirectType: e.type }, error: null });
    } catch (s) {
      if (b(s))
        return this._returnResult({ data: { session: null, redirectType: null }, error: s });
      throw s;
    }
  }
  /**
   * Checks if the current URL contains parameters given by an implicit oauth grant flow (https://www.rfc-editor.org/rfc/rfc6749.html#section-4.2)
   *
   * If `detectSessionInUrl` is a function, it will be called with the URL and params to determine
   * if the URL should be processed as a Supabase auth callback. This allows users to exclude
   * URLs from other OAuth providers (e.g., Facebook Login) that also return access_token in the fragment.
   */
  _isImplicitGrantCallback(e) {
    return typeof this.detectSessionInUrl == "function" ? this.detectSessionInUrl(new URL(window.location.href), e) : !!(e.access_token || e.error || e.error_description || e.error_code);
  }
  /**
   * Checks if the current URL and backing storage contain parameters given by a PKCE flow
   */
  async _isPKCECallback(e) {
    if (!e.code)
      return !1;
    const r = Ft(e[Le]);
    return r && await z(this.storage, rt(this.storageKey, r)) ? !0 : !!await z(this.storage, `${this.storageKey}-code-verifier`);
  }
  /**
   * Inside a browser context, `signOut()` will remove the logged in user from the browser session and log them out - removing all items from localstorage and then trigger a `"SIGNED_OUT"` event.
   *
   * For server-side management, you can revoke all refresh tokens for a user by passing a user's JWT through to `auth.api.signOut(JWT: string)`.
   * There is no way to revoke a user's access token jwt until it expires. It is recommended to set a shorter expiry on the jwt for this reason.
   *
   * If using `others` scope, no `SIGNED_OUT` event is fired!
   *
   * **Warning:** the default `scope` is `'global'`. This signs the user out of
   * **every device they are currently signed in on**, not just the current
   * tab/session. If you only want to sign the user out of the current session
   * (the behavior most other auth libraries default to), pass
   * `{ scope: 'local' }` explicitly.
   *
   * @category Auth
   *
   * @remarks
   * - In order to use the `signOut()` method, the user needs to be signed in first.
   * - By default, `signOut()` uses the **global** scope, which signs out the user
   *   on every device they are signed in on (not just the current one). Pass
   *   `{ scope: 'local' }` to only sign out the current session. This is
   *   usually what apps want on a "Sign out" button, especially when users
   *   sign in from multiple devices and do not expect signing out of one to
   *   terminate the others.
   * - Since Supabase Auth uses JWTs for authentication, the access token JWT will be valid until it's expired. When the user signs out, Supabase revokes the refresh token and deletes the JWT from the client-side. This does not revoke the JWT and it will still be valid until it expires.
   *
   * @example Sign out of every device (global – default)
   * ```js
   * const { error } = await supabase.auth.signOut()
   * ```
   *
   * @example Sign out only the current session (recommended for most apps)
   * ```js
   * const { error } = await supabase.auth.signOut({ scope: 'local' })
   * ```
   *
   * @example Sign out of all other sessions, keep the current one
   * ```js
   * const { error } = await supabase.auth.signOut({ scope: 'others' })
   * ```
   */
  async signOut(e = { scope: "global" }) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._signOut(e)) : await this._signOut(e);
  }
  async _signOut({ scope: e } = { scope: "global" }) {
    return await this._useSession(async (r) => {
      var n;
      const s = async () => {
        await this._removeSession();
      }, { data: i, error: o } = r;
      if (o && !It(o))
        return this._returnResult({ error: o });
      const a = (n = i.session) === null || n === void 0 ? void 0 : n.access_token;
      if (a) {
        const { error: l } = await this.admin.signOut(a, e);
        if (l && !(Gn(l) && (l.status === 404 || l.status === 401 || l.status === 403) || It(l)))
          return e !== "others" && await s(), this._returnResult({ error: l });
      }
      return e !== "others" && await s(), this._returnResult({ error: null });
    });
  }
  /**  *
   * @category Auth
   *
   * @remarks
   * - Subscribes to important events occurring on the user's session.
   * - Use on the frontend/client. It is less useful on the server.
   * - Events are emitted across tabs to keep your application's UI up-to-date. Some events can fire very frequently, based on the number of tabs open. Use a quick and efficient callback function, and defer or debounce as many operations as you can to be performed outside of the callback.
   * - Callbacks can be `async` and can safely call other Supabase auth methods (`getUser`, `setSession`, etc.) from inside the callback.
   * - Keep callbacks quick. Events are awaited in order, so a slow callback delays subsequent events to subscribers in this tab.
   * - Emitted events:
   *   - `INITIAL_SESSION`
   *     - Emitted right after the Supabase client is constructed and the initial session from storage is loaded.
   *   - `SIGNED_IN`
   *     - Emitted each time a user session is confirmed or re-established, including on user sign in and when refocusing a tab.
   *     - Avoid making assumptions as to when this event is fired, this may occur even when the user is already signed in. Instead, check the user object attached to the event to see if a new user has signed in and update your application's UI.
   *     - This event can fire very frequently depending on the number of tabs open in your application.
   *   - `SIGNED_OUT`
   *     - Emitted when the user signs out. This can be after:
   *       - A call to `supabase.auth.signOut()`.
   *       - After the user's session has expired for any reason:
   *         - User has signed out on another device.
   *         - The session has reached its timebox limit or inactivity timeout.
   *         - User has signed in on another device with single session per user enabled.
   *         - Check the [User Sessions](/docs/guides/auth/sessions) docs for more information.
   *     - Use this to clean up any local storage your application has associated with the user.
   *   - `TOKEN_REFRESHED`
   *     - Emitted each time a new access and refresh token are fetched for the signed in user.
   *     - It's best practice and highly recommended to extract the access token (JWT) and store it in memory for further use in your application.
   *       - Avoid frequent calls to `supabase.auth.getSession()` for the same purpose.
   *     - There is a background process that keeps track of when the session should be refreshed so you will always receive valid tokens by listening to this event.
   *     - The frequency of this event is related to the JWT expiry limit configured on your project.
   *   - `USER_UPDATED`
   *     - Emitted each time the `supabase.auth.updateUser()` method finishes successfully. Listen to it to update your application's UI based on new profile information.
   *   - `PASSWORD_RECOVERY`
   *     - Emitted instead of the `SIGNED_IN` event when the user lands on a page that includes a password recovery link in the URL.
   *     - Use it to show a UI to the user where they can [reset their password](/docs/guides/auth/passwords#resetting-a-users-password-forgot-password).
   *
   * @example Listen to auth changes
   * ```js
   * const { data } = supabase.auth.onAuthStateChange((event, session) => {
   *   console.log(event, session)
   *
   *   if (event === 'INITIAL_SESSION') {
   *     // handle initial session
   *   } else if (event === 'SIGNED_IN') {
   *     // handle sign in event
   *   } else if (event === 'SIGNED_OUT') {
   *     // handle sign out event
   *   } else if (event === 'PASSWORD_RECOVERY') {
   *     // handle password recovery event
   *   } else if (event === 'TOKEN_REFRESHED') {
   *     // handle token refreshed event
   *   } else if (event === 'USER_UPDATED') {
   *     // handle user updated event
   *   }
   * })
   *
   * // call unsubscribe to remove the callback
   * data.subscription.unsubscribe()
   * ```
   *
   * @exampleDescription Listen to sign out
   * Make sure you clear out any local data, such as local and session storage, after the client library has detected the user's sign out.
   *
   * @example Listen to sign out
   * ```js
   * supabase.auth.onAuthStateChange((event, session) => {
   *   if (event === 'SIGNED_OUT') {
   *     console.log('SIGNED_OUT', session)
   *
   *     // clear local and session storage
   *     [
   *       window.localStorage,
   *       window.sessionStorage,
   *     ].forEach((storage) => {
   *       Object.entries(storage)
   *         .forEach(([key]) => {
   *           storage.removeItem(key)
   *         })
   *     })
   *   }
   * })
   * ```
   *
   * @exampleDescription Store OAuth provider tokens on sign in
   * When using [OAuth (Social Login)](/docs/guides/auth/social-login) you sometimes wish to get access to the provider's access token and refresh token, in order to call provider APIs in the name of the user.
   *
   * For example, if you are using [Sign in with Google](/docs/guides/auth/social-login/auth-google) you may want to use the provider token to call Google APIs on behalf of the user. Supabase Auth does not keep track of the provider access and refresh token, but does return them for you once, immediately after sign in. You can use the `onAuthStateChange` method to listen for the presence of the provider tokens and store them in local storage. You can further send them to your server's APIs for use on the backend.
   *
   * Finally, make sure you remove them from local storage on the `SIGNED_OUT` event. If the OAuth provider supports token revocation, make sure you call those APIs either from the frontend or schedule them to be called on the backend.
   *
   * @example Store OAuth provider tokens on sign in
   * ```js
   * // Register this immediately after calling createClient!
   * // Because signInWithOAuth causes a redirect, you need to fetch the
   * // provider tokens from the callback.
   * supabase.auth.onAuthStateChange((event, session) => {
   *   if (session && session.provider_token) {
   *     window.localStorage.setItem('oauth_provider_token', session.provider_token)
   *   }
   *
   *   if (session && session.provider_refresh_token) {
   *     window.localStorage.setItem('oauth_provider_refresh_token', session.provider_refresh_token)
   *   }
   *
   *   if (event === 'SIGNED_OUT') {
   *     window.localStorage.removeItem('oauth_provider_token')
   *     window.localStorage.removeItem('oauth_provider_refresh_token')
   *   }
   * })
   * ```
   *
   * @exampleDescription Use React Context for the User's session
   * Instead of relying on `supabase.auth.getSession()` within your React components, you can use a [React Context](https://react.dev/reference/react/createContext) to store the latest session information from the `onAuthStateChange` callback and access it that way.
   *
   * @example Use React Context for the User's session
   * ```js
   * const SessionContext = React.createContext(null)
   *
   * function main() {
   *   const [session, setSession] = React.useState(null)
   *
   *   React.useEffect(() => {
   *     const {data: { subscription }} = supabase.auth.onAuthStateChange(
   *       (event, session) => {
   *         if (event === 'SIGNED_OUT') {
   *           setSession(null)
   *         } else if (session) {
   *           setSession(session)
   *         }
   *       })
   *
   *     return () => {
   *       subscription.unsubscribe()
   *     }
   *   }, [])
   *
   *   return (
   *     <SessionContext.Provider value={session}>
   *       <App />
   *     </SessionContext.Provider>
   *   )
   * }
   * ```
   *
   * @example Listen to password recovery events
   * ```js
   * supabase.auth.onAuthStateChange((event, session) => {
   *   if (event === 'PASSWORD_RECOVERY') {
   *     console.log('PASSWORD_RECOVERY', session)
   *     // show screen to update user's password
   *     showPasswordResetScreen(true)
   *   }
   * })
   * ```
   *
   * @example Listen to sign in
   * ```js
   * supabase.auth.onAuthStateChange((event, session) => {
   *   if (event === 'SIGNED_IN') console.log('SIGNED_IN', session)
   * })
   * ```
   *
   * @example Listen to token refresh
   * ```js
   * supabase.auth.onAuthStateChange((event, session) => {
   *   if (event === 'TOKEN_REFRESHED') console.log('TOKEN_REFRESHED', session)
   * })
   * ```
   *
   * @example Listen to user updates
   * ```js
   * supabase.auth.onAuthStateChange((event, session) => {
   *   if (event === 'USER_UPDATED') console.log('USER_UPDATED', session)
   * })
   * ```
   */
  onAuthStateChange(e) {
    const r = dl(), n = {
      id: r,
      callback: e,
      unsubscribe: () => {
        this._debug("#unsubscribe()", "state change callback with id removed", r), this.stateChangeEmitters.delete(r);
      }
    };
    return this._debug("#onAuthStateChange()", "registered callback with id", r), this.stateChangeEmitters.set(r, n), (async () => (await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => {
      this._emitInitialSession(r);
    }) : await this._emitInitialSession(r)))(), { data: { subscription: n } };
  }
  async _emitInitialSession(e) {
    return await this._useSession(async (r) => {
      var n, s;
      try {
        const { data: { session: i }, error: o } = r;
        if (o)
          throw o;
        await ((n = this.stateChangeEmitters.get(e)) === null || n === void 0 ? void 0 : n.callback("INITIAL_SESSION", i)), this._debug("INITIAL_SESSION", "callback id", e, "session", i);
      } catch (i) {
        if (await ((s = this.stateChangeEmitters.get(e)) === null || s === void 0 ? void 0 : s.callback("INITIAL_SESSION", null)), this._debug("INITIAL_SESSION", "callback id", e, "error", i), Qn(i))
          return;
        It(i) || Nt(i) || Gn(i) && (i.code === "refresh_token_not_found" || i.code === "refresh_token_already_used" || i.code === "session_expired") ? console.warn(i) : console.error(i);
      }
    });
  }
  /**
   * Sends a password reset request to an email address. This method supports the PKCE flow.
   *
   * @param email The email address of the user.
   * @param options.redirectTo The URL to send the user to after they click the password reset link.
   * @param options.captchaToken Verification token received when the user completes the captcha on the site.
   *
   * @category Auth
   *
   * @remarks
   * - The password reset flow consist of 2 broad steps: (i) Allow the user to login via the password reset link; (ii) Update the user's password.
   * - The `resetPasswordForEmail()` only sends a password reset link to the user's email.
   * To update the user's password, see [`updateUser()`](/docs/reference/javascript/auth-updateuser).
   * - A `PASSWORD_RECOVERY` event will be emitted when the password recovery link is clicked.
   * You can use [`onAuthStateChange()`](/docs/reference/javascript/auth-onauthstatechange) to listen and invoke a callback function on these events.
   * - When the user clicks the reset link in the email they are redirected back to your application.
   * You can configure the URL that the user is redirected to with the `redirectTo` parameter.
   * See [redirect URLs and wildcards](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) to add additional redirect URLs to your project.
   * - After the user has been redirected successfully, prompt them for a new password and call `updateUser()`:
   * ```js
   * const { data, error } = await supabase.auth.updateUser({
   *   password: new_password
   * })
   * ```
   *
   * @example Reset password
   * ```js
   * const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
   *   redirectTo: 'https://example.com/update-password',
   * })
   * ```
   *
   * @exampleResponse Reset password
   * ```json
   * {
   *   data: {}
   *   error: null
   * }
   * ```
   *
   * @example Reset password (React)
   * ```js
   * /**
   *  * Step 1: Send the user an email to get a password reset token.
   *  * This email contains a link which sends the user back to your application.
   *  *\/
   * const { data, error } = await supabase.auth
   *   .resetPasswordForEmail('user@email.com')
   *
   * /**
   *  * Step 2: Once the user is redirected back to your application,
   *  * ask the user to reset their password.
   *  *\/
   *  useEffect(() => {
   *    supabase.auth.onAuthStateChange(async (event, session) => {
   *      if (event == "PASSWORD_RECOVERY") {
   *        const newPassword = prompt("What would you like your new password to be?");
   *        const { data, error } = await supabase.auth
   *          .updateUser({ password: newPassword })
   *
   *        if (data) alert("Password updated successfully!")
   *        if (error) alert("There was an error updating your password.")
   *      }
   *    })
   *  }, [])
   * ```
   */
  async resetPasswordForEmail(e, r = {}) {
    let n = null, s = null, i = null;
    this.flowType === "pkce" && ([n, s, i] = await this._getCodeChallengeAndMethod(
      !0
      // isPasswordRecovery
    ));
    try {
      return await k(this.fetch, "POST", `${this.url}/recover`, {
        body: {
          email: e,
          code_challenge: n,
          code_challenge_method: s,
          gotrue_meta_security: { captcha_token: r.captchaToken }
        },
        headers: this.headers,
        redirectTo: this._maybeAppendFlowIdToRedirect(r.redirectTo, i)
      });
    } catch (o) {
      if (await ee(this.storage, this.storageKey, i), b(o))
        return this._returnResult({ data: null, error: o });
      throw o;
    }
  }
  /**
   * Gets all the identities linked to a user.
   *
   * @category Auth
   *
   * @remarks
   * - The user needs to be signed in to call `getUserIdentities()`.
   *
   * @example Returns a list of identities linked to the user
   * ```js
   * const { data, error } = await supabase.auth.getUserIdentities()
   * ```
   *
   * @exampleResponse Returns a list of identities linked to the user
   * ```json
   * {
   *   "data": {
   *     "identities": [
   *       {
   *         "identity_id": "22222222-2222-2222-2222-222222222222",
   *         "id": "2024-01-01T00:00:00Z",
   *         "user_id": "2024-01-01T00:00:00Z",
   *         "identity_data": {
   *           "email": "example@email.com",
   *           "email_verified": false,
   *           "phone_verified": false,
   *           "sub": "11111111-1111-1111-1111-111111111111"
   *         },
   *         "provider": "email",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z",
   *         "email": "example@email.com"
   *       }
   *     ]
   *   },
   *   "error": null
   * }
   * ```
   */
  async getUserIdentities() {
    var e;
    try {
      const { data: r, error: n } = await this.getUser();
      if (n)
        throw n;
      return this._returnResult({ data: { identities: (e = r.user.identities) !== null && e !== void 0 ? e : [] }, error: null });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  /**  *
   * @category Auth
   *
   * @remarks
   * - The **Enable Manual Linking** option must be enabled from your [project's authentication settings](/dashboard/project/_/auth/providers).
   * - The user needs to be signed in to call `linkIdentity()`.
   * - If the candidate identity is already linked to the existing user or another user, `linkIdentity()` will fail.
   * - If `linkIdentity` is run in the browser, the user is automatically redirected to the returned URL. On the server, you should handle the redirect.
   *
   * @example Link an identity to a user
   * ```js
   * const { data, error } = await supabase.auth.linkIdentity({
   *   provider: 'github'
   * })
   * ```
   *
   * @exampleResponse Link an identity to a user
   * ```json
   * {
   *   data: {
   *     provider: 'github',
   *     url: <PROVIDER_URL_TO_REDIRECT_TO>,
   *     flowId: <PKCE_FLOW_ID_OR_NULL>
   *   },
   *   error: null
   * }
   * ```
   */
  async linkIdentity(e) {
    return "token" in e ? this.linkIdentityIdToken(e) : this.linkIdentityOAuth(e);
  }
  async linkIdentityOAuth(e) {
    var r;
    let n = null;
    try {
      const { data: s, error: i } = await this._useSession(async (o) => {
        var a, l, c, u, d;
        const { data: p, error: h } = o;
        if (h)
          throw h;
        const { url: f, flowId: g } = await this._getUrlForProvider(`${this.url}/user/identities/authorize`, e.provider, {
          redirectTo: (a = e.options) === null || a === void 0 ? void 0 : a.redirectTo,
          scopes: (l = e.options) === null || l === void 0 ? void 0 : l.scopes,
          queryParams: (c = e.options) === null || c === void 0 ? void 0 : c.queryParams,
          skipBrowserRedirect: !0
        });
        return n = g, await k(this.fetch, "GET", f, {
          headers: this.headers,
          jwt: (d = (u = p.session) === null || u === void 0 ? void 0 : u.access_token) !== null && d !== void 0 ? d : void 0
        });
      });
      if (i)
        throw i;
      return H() && !(!((r = e.options) === null || r === void 0) && r.skipBrowserRedirect) && window.location.assign(s == null ? void 0 : s.url), this._returnResult({
        data: { provider: e.provider, url: s == null ? void 0 : s.url, flowId: n },
        error: null
      });
    } catch (s) {
      if (b(s))
        return this._returnResult({
          data: { provider: e.provider, url: null, flowId: n },
          error: s
        });
      throw s;
    }
  }
  async linkIdentityIdToken(e) {
    return await this._useSession(async (r) => {
      var n;
      try {
        const { error: s, data: { session: i } } = r;
        if (s)
          throw s;
        const { options: o, provider: a, token: l, access_token: c, nonce: u } = e, d = await k(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
          headers: this.headers,
          jwt: (n = i == null ? void 0 : i.access_token) !== null && n !== void 0 ? n : void 0,
          body: {
            provider: a,
            id_token: l,
            access_token: c,
            nonce: u,
            link_identity: !0,
            gotrue_meta_security: { captcha_token: o == null ? void 0 : o.captchaToken }
          },
          xform: Q
        }), { data: p, error: h } = d;
        return h ? this._returnResult({ data: { user: null, session: null }, error: h }) : !p || !p.session || !p.user ? this._returnResult({
          data: { user: null, session: null },
          error: new We()
        }) : (p.session && (await this._saveSession(p.session), await this._notifyAllSubscribers("USER_UPDATED", p.session)), this._returnResult({ data: p, error: h }));
      } catch (s) {
        if (await ee(this.storage, this.storageKey, null), b(s))
          return this._returnResult({ data: { user: null, session: null }, error: s });
        throw s;
      }
    });
  }
  /**
   * Unlinks an identity from a user by deleting it. The user will no longer be able to sign in with that identity once it's unlinked.
   *
   * @category Auth
   *
   * @remarks
   * - The **Enable Manual Linking** option must be enabled from your [project's authentication settings](/dashboard/project/_/auth/providers).
   * - The user needs to be signed in to call `unlinkIdentity()`.
   * - The user must have at least 2 identities in order to unlink an identity.
   * - The identity to be unlinked must belong to the user.
   *
   * @example Unlink an identity
   * ```js
   * // retrieve all identities linked to a user
   * const identities = await supabase.auth.getUserIdentities()
   *
   * // find the google identity
   * const googleIdentity = identities.find(
   *   identity => identity.provider === 'google'
   * )
   *
   * // unlink the google identity
   * const { error } = await supabase.auth.unlinkIdentity(googleIdentity)
   * ```
   */
  async unlinkIdentity(e) {
    try {
      return await this._useSession(async (r) => {
        var n, s;
        const { data: i, error: o } = r;
        if (o)
          throw o;
        return await k(this.fetch, "DELETE", `${this.url}/user/identities/${e.identity_id}`, {
          headers: this.headers,
          jwt: (s = (n = i.session) === null || n === void 0 ? void 0 : n.access_token) !== null && s !== void 0 ? s : void 0
        });
      });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  /**
   * Generates a new JWT.
   * @param refreshToken A valid refresh token that was returned on login.
   */
  async _refreshAccessToken(e) {
    const r = "#_refreshAccessToken()";
    this._debug(r, "begin");
    try {
      const n = Date.now();
      return await pl(async (s) => (s > 0 && await fl(200 * Math.pow(2, s - 1)), this._debug(r, "refreshing attempt", s), await k(this.fetch, "POST", `${this.url}/token?grant_type=refresh_token`, {
        body: { refresh_token: e },
        headers: this.headers,
        xform: Q
      })), (s, i) => {
        const o = 200 * Math.pow(2, s);
        return i && Nt(i) && // retryable only if the request can be sent before the backoff overflows the tick duration
        Date.now() + o - n < ye;
      });
    } catch (n) {
      if (this._debug(r, "error", n), b(n))
        return this._returnResult({ data: { session: null, user: null }, error: n });
      throw n;
    } finally {
      this._debug(r, "end");
    }
  }
  _isValidSession(e) {
    return typeof e == "object" && e !== null && "access_token" in e && "refresh_token" in e && "expires_at" in e;
  }
  async _handleProviderSignIn(e, r) {
    const { url: n, flowId: s } = await this._getUrlForProvider(`${this.url}/authorize`, e, {
      redirectTo: r.redirectTo,
      scopes: r.scopes,
      queryParams: r.queryParams
    });
    return this._debug("#_handleProviderSignIn()", "provider", e, "options", r, "url", n), H() && !r.skipBrowserRedirect && window.location.assign(n), { data: { provider: e, url: n, flowId: s }, error: null };
  }
  /**
   * Recovers the session from LocalStorage and refreshes the token
   * Note: this method is async to accommodate for AsyncStorage e.g. in React native.
   */
  async _recoverAndRefresh() {
    var e, r;
    const n = "#_recoverAndRefresh()";
    this._debug(n, "begin");
    try {
      const s = await z(this.storage, this.storageKey);
      if (s && this.userStorage) {
        let o = await z(this.userStorage, this.storageKey + "-user");
        !this.storage.isServer && Object.is(this.storage, this.userStorage) && !o && (o = { user: s.user }, await _e(this.userStorage, this.storageKey + "-user", o)), s.user = (e = o == null ? void 0 : o.user) !== null && e !== void 0 ? e : vr();
      } else if (s && !s.user && !s.user) {
        const o = await z(this.storage, this.storageKey + "-user");
        o && (o != null && o.user) ? (s.user = o.user, await K(this.storage, this.storageKey + "-user"), await _e(this.storage, this.storageKey, s)) : s.user = vr();
      }
      if (this._debug(n, "session from storage", s), !this._isValidSession(s)) {
        this._debug(n, "session is not valid"), s !== null && await this._removeSession();
        return;
      }
      const i = ((r = s.expires_at) !== null && r !== void 0 ? r : 1 / 0) * 1e3 - Date.now() < wr;
      if (this._debug(n, `session has${i ? "" : " not"} expired with margin of ${wr}s`), i) {
        if (this.autoRefreshToken && s.refresh_token) {
          const { error: o } = await this._callRefreshToken(s.refresh_token);
          o && (Qn(o) ? this._debug(n, "refresh discarded by commit guard", o) : this._debug(n, "refresh failed", o));
        }
      } else if (s.user && s.user.__isUserNotAvailableProxy === !0)
        try {
          const { data: o, error: a } = await this._getUser(s.access_token);
          !a && (o != null && o.user) ? (s.user = o.user, await this._saveSession(s), await this._notifyAllSubscribers("SIGNED_IN", s)) : this._debug(n, "could not get user data, skipping SIGNED_IN notification");
        } catch (o) {
          console.error("Error getting user data:", o), this._debug(n, "error getting user data, skipping SIGNED_IN notification", o);
        }
      else
        await this._notifyAllSubscribers("SIGNED_IN", s);
    } catch (s) {
      this._debug(n, "error", s), Nt(s) ? console.warn(s) : console.error(s);
      return;
    } finally {
      this._debug(n, "end");
    }
  }
  async _callRefreshToken(e) {
    var r, n;
    if (!e)
      throw new F();
    if (this.refreshingDeferred)
      return this.refreshingDeferred.promise;
    if (this.lastRefreshFailure && this.lastRefreshFailure.refreshToken === e && Date.now() < this.lastRefreshFailure.expiresAt)
      return this._debug("#_callRefreshToken()", "returning cached failure (cooldown active)"), this.lastRefreshFailure.result;
    const s = "#_callRefreshToken()";
    this._debug(s, "begin");
    try {
      this.refreshingDeferred = new hr(), this.refreshingDeferred.promise.then(void 0, () => {
      });
      const i = await z(this.storage, this.storageKey), { data: o, error: a } = await this._refreshAccessToken(e);
      if (a)
        throw a;
      if (!o.session)
        throw new F();
      const l = await z(this.storage, this.storageKey);
      if (i !== null && (l === null || l.refresh_token !== i.refresh_token)) {
        this._debug(s, "commit guard: storage changed since refresh started, discarding rotated tokens", {
          // Presence indicators only — never log refresh token fragments,
          // even partial. Logs may be forwarded to third-party services.
          startedWith: "present",
          nowHolds: l ? "replaced" : "cleared"
        });
        const p = {
          data: null,
          error: new Xn()
        };
        return this.refreshingDeferred.resolve(p), p;
      }
      const u = this._sessionRemovalEpoch;
      if (await this._saveSession(o.session), this._sessionRemovalEpoch !== u) {
        this._debug(s, "commit guard (post-save): _removeSession ran during _saveSession, undoing write"), await K(this.storage, this.storageKey), this.userStorage && await K(this.userStorage, this.storageKey + "-user");
        const p = {
          data: null,
          error: new Xn()
        };
        return this.refreshingDeferred.resolve(p), p;
      }
      await this._notifyAllSubscribers("TOKEN_REFRESHED", o.session);
      const d = { data: o.session, error: null };
      return this.lastRefreshFailure = null, this.refreshingDeferred.resolve(d), d;
    } catch (i) {
      if (this._debug(s, "error", i), b(i)) {
        const o = { data: null, error: i };
        if (!Nt(i)) {
          const a = await z(this.storage, this.storageKey);
          !!(a != null && a.expires_at && a.expires_at * 1e3 > Date.now()) ? this._debug(s, "proactive refresh failed, access token still valid — preserving session") : await this._removeSession();
        }
        return this.lastRefreshFailure = {
          refreshToken: e,
          result: o,
          expiresAt: Date.now() + Ya
        }, (r = this.refreshingDeferred) === null || r === void 0 || r.resolve(o), o;
      }
      throw (n = this.refreshingDeferred) === null || n === void 0 || n.reject(i), i;
    } finally {
      this.refreshingDeferred = null, this._debug(s, "end");
    }
  }
  async _notifyAllSubscribers(e, r, n = !0) {
    if (this._pendingInitNotifications !== null && n) {
      this._pendingInitNotifications.push({ event: e, session: r, broadcast: n });
      return;
    }
    const s = `#_notifyAllSubscribers(${e})`;
    this._debug(s, "begin", r, `broadcast = ${n}`);
    try {
      this.broadcastChannel && n && this.broadcastChannel.postMessage({ event: e, session: r });
      const i = [], o = Array.from(this.stateChangeEmitters.values()).map(async (a) => {
        try {
          await a.callback(e, r);
        } catch (l) {
          i.push(l);
        }
      });
      if (await Promise.all(o), i.length > 0) {
        for (let a = 0; a < i.length; a += 1)
          console.error(i[a]);
        throw i[0];
      }
    } finally {
      this._debug(s, "end");
    }
  }
  /**
   * set currentSession and currentUser
   * process to _startAutoRefreshToken if possible
   */
  async _saveSession(e) {
    this._debug("#_saveSession()", e), this.suppressGetSessionWarning = !0;
    const r = Object.assign({}, e), n = r.user && r.user.__isUserNotAvailableProxy === !0;
    if (this.userStorage) {
      !n && r.user && await _e(this.userStorage, this.storageKey + "-user", {
        user: r.user
      });
      const s = Object.assign({}, r);
      delete s.user;
      const i = ss(s);
      await _e(this.storage, this.storageKey, i);
    } else {
      const s = ss(r);
      await _e(this.storage, this.storageKey, s);
    }
  }
  async _removeSession() {
    this._sessionRemovalEpoch += 1, this._debug("#_removeSession()"), this.lastRefreshFailure = null, this.suppressGetSessionWarning = !1, await K(this.storage, this.storageKey), await kl(this.storage, this.storageKey), await K(this.storage, this.storageKey + "-user"), this.userStorage && await K(this.userStorage, this.storageKey + "-user"), await this._notifyAllSubscribers("SIGNED_OUT", null);
  }
  /**
   * Removes any registered visibilitychange callback.
   *
   * {@link GoTrueClient.startAutoRefresh}
   * {@link GoTrueClient.stopAutoRefresh}
   */
  _removeVisibilityChangedCallback() {
    this._debug("#_removeVisibilityChangedCallback()");
    const e = this.visibilityChangedCallback;
    this.visibilityChangedCallback = null;
    try {
      e && H() && (window != null && window.removeEventListener) && window.removeEventListener("visibilitychange", e);
    } catch (r) {
      console.error("removing visibilitychange callback failed", r);
    }
  }
  /**
   * This is the private implementation of {@link GoTrueClient.startAutoRefresh}. Use this
   * within the library.
   */
  async _startAutoRefresh() {
    await this._stopAutoRefresh(), this._debug("#_startAutoRefresh()");
    const e = setInterval(() => this._autoRefreshTokenTick(), ye);
    this.autoRefreshTicker = e, e && typeof e == "object" && typeof e.unref == "function" ? e.unref() : typeof Deno < "u" && typeof Deno.unrefTimer == "function" && Deno.unrefTimer(e);
    const r = setTimeout(async () => {
      await this.initializePromise, await this._autoRefreshTokenTick();
    }, 0);
    this.autoRefreshTickTimeout = r, r && typeof r == "object" && typeof r.unref == "function" ? r.unref() : typeof Deno < "u" && typeof Deno.unrefTimer == "function" && Deno.unrefTimer(r);
  }
  /**
   * This is the private implementation of {@link GoTrueClient.stopAutoRefresh}. Use this
   * within the library.
   */
  async _stopAutoRefresh() {
    this._debug("#_stopAutoRefresh()");
    const e = this.autoRefreshTicker;
    this.autoRefreshTicker = null, e && clearInterval(e);
    const r = this.autoRefreshTickTimeout;
    this.autoRefreshTickTimeout = null, r && clearTimeout(r);
  }
  /**
   * Starts an auto-refresh process in the background. The session is checked
   * every few seconds. Close to the time of expiration a process is started to
   * refresh the session. If refreshing fails it will be retried for as long as
   * necessary.
   *
   * If you set the {@link GoTrueClientOptions#autoRefreshToken} you don't need
   * to call this function, it will be called for you.
   *
   * On browsers the refresh process works only when the tab/window is in the
   * foreground to conserve resources as well as prevent race conditions and
   * flooding auth with requests. If you call this method any managed
   * visibility change callback will be removed and you must manage visibility
   * changes on your own.
   *
   * On non-browser platforms the refresh process works *continuously* in the
   * background, which may not be desirable. You should hook into your
   * platform's foreground indication mechanism and call these methods
   * appropriately to conserve resources.
   *
   * {@link GoTrueClient.stopAutoRefresh}
   *
   * @category Auth
   *
   * @remarks
   * - Only useful in non-browser environments such as React Native or Electron.
   * - The Supabase Auth library automatically starts and stops proactively refreshing the session when a tab is focused or not.
   * - On non-browser platforms, such as mobile or desktop apps built with web technologies, the library is not able to effectively determine whether the application is _focused_ or not.
   * - To give this hint to the application, you should be calling this method when the app is in focus and calling `supabase.auth.stopAutoRefresh()` when it's out of focus.
   *
   * @example Start and stop auto refresh in React Native
   * ```js
   * import { AppState } from 'react-native'
   *
   * // make sure you register this only once!
   * AppState.addEventListener('change', (state) => {
   *   if (state === 'active') {
   *     supabase.auth.startAutoRefresh()
   *   } else {
   *     supabase.auth.stopAutoRefresh()
   *   }
   * })
   * ```
   */
  async startAutoRefresh() {
    this._removeVisibilityChangedCallback(), await this._startAutoRefresh();
  }
  /**
   * Stops an active auto refresh process running in the background (if any).
   *
   * If you call this method any managed visibility change callback will be
   * removed and you must manage visibility changes on your own.
   *
   * See {@link GoTrueClient.startAutoRefresh} for more details.
   *
   * @category Auth
   *
   * @remarks
   * - Only useful in non-browser environments such as React Native or Electron.
   * - The Supabase Auth library automatically starts and stops proactively refreshing the session when a tab is focused or not.
   * - On non-browser platforms, such as mobile or desktop apps built with web technologies, the library is not able to effectively determine whether the application is _focused_ or not.
   * - When your application goes in the background or out of focus, call this method to stop the proactive refreshing of the session.
   *
   * @example Start and stop auto refresh in React Native
   * ```js
   * import { AppState } from 'react-native'
   *
   * // make sure you register this only once!
   * AppState.addEventListener('change', (state) => {
   *   if (state === 'active') {
   *     supabase.auth.startAutoRefresh()
   *   } else {
   *     supabase.auth.stopAutoRefresh()
   *   }
   * })
   * ```
   */
  async stopAutoRefresh() {
    this._removeVisibilityChangedCallback(), await this._stopAutoRefresh();
  }
  /**
   * Tears down the client's background work: stops the auto-refresh interval,
   * removes the `visibilitychange` listener, closes the cross-tab
   * `BroadcastChannel`, and clears registered `onAuthStateChange` subscribers.
   *
   * Call this from cleanup hooks when the client is being replaced before
   * its JS realm is destroyed. React Strict Mode and HMR are the common
   * cases. Any in-flight `fetch` calls continue to completion and may still
   * write to storage; dispose doesn't abort them or erase storage.
   *
   * Lifecycle caveat: because in-flight refreshes are not aborted, a
   * disposed instance can still persist a rotated session to storage after
   * `dispose()` returns. A subsequent `createClient` against the same
   * `storageKey` will pick up that session on its next read. If you need
   * strict isolation between client lifecycles, await any pending auth
   * operation before calling `dispose()` (or change the `storageKey` for
   * the replacement client).
   *
   * Safe to call repeatedly.
   *
   * @category Auth
   *
   * @example Cleanup on React unmount
   * ```ts
   * useEffect(() => {
   *   const client = createClient(...)
   *   return () => { client.auth.dispose() }
   * }, [])
   * ```
   */
  async dispose() {
    var e;
    this._removeVisibilityChangedCallback(), await this._stopAutoRefresh(), (e = this.broadcastChannel) === null || e === void 0 || e.close(), this.broadcastChannel = null, this.stateChangeEmitters.clear();
  }
  /**
   * Runs the auto refresh token tick.
   */
  async _autoRefreshTokenTick() {
    if (this._debug("#_autoRefreshTokenTick()", "begin"), this.lock != null) {
      try {
        await this._acquireLock(0, async () => {
          try {
            const e = Date.now();
            try {
              return await this._useSession(async (r) => {
                const { data: { session: n } } = r;
                if (!n || !n.refresh_token || !n.expires_at) {
                  this._debug("#_autoRefreshTokenTick()", "no session");
                  return;
                }
                const s = Math.floor((n.expires_at * 1e3 - e) / ye);
                this._debug("#_autoRefreshTokenTick()", `access token expires in ${s} ticks, a tick lasts ${ye}ms, refresh threshold is ${ht} ticks`), s <= ht && await this._callRefreshToken(n.refresh_token);
              });
            } catch (r) {
              console.error("Auto refresh tick failed with error. This is likely a transient error.", r);
            }
          } finally {
            this._debug("#_autoRefreshTokenTick()", "end");
          }
        });
      } catch (e) {
        if (e instanceof Dl)
          this._debug("auto refresh token tick lock not available");
        else
          throw e;
      }
      return;
    }
    if (this.refreshingDeferred !== null) {
      this._debug("#_autoRefreshTokenTick()", "refresh already in flight, skipping");
      return;
    }
    try {
      const e = Date.now();
      try {
        await this._useSession(async (r) => {
          const { data: { session: n } } = r;
          if (!n || !n.refresh_token || !n.expires_at) {
            this._debug("#_autoRefreshTokenTick()", "no session");
            return;
          }
          const s = Math.floor((n.expires_at * 1e3 - e) / ye);
          this._debug("#_autoRefreshTokenTick()", `access token expires in ${s} ticks, a tick lasts ${ye}ms, refresh threshold is ${ht} ticks`), s <= ht && await this._callRefreshToken(n.refresh_token);
        });
      } catch (r) {
        console.error("Auto refresh tick failed with error. This is likely a transient error.", r);
      }
    } finally {
      this._debug("#_autoRefreshTokenTick()", "end");
    }
  }
  /**
   * Registers callbacks on the browser / platform, which in-turn run
   * algorithms when the browser window/tab are in foreground. On non-browser
   * platforms it assumes always foreground.
   */
  async _handleVisibilityChange() {
    if (this._debug("#_handleVisibilityChange()"), !H() || !(window != null && window.addEventListener))
      return this.autoRefreshToken && this.startAutoRefresh(), !1;
    try {
      this.visibilityChangedCallback = async () => {
        try {
          await this._onVisibilityChanged(!1);
        } catch (e) {
          this._debug("#visibilityChangedCallback", "error", e);
        }
      }, window == null || window.addEventListener("visibilitychange", this.visibilityChangedCallback), await this._onVisibilityChanged(!0);
    } catch (e) {
      console.error("_handleVisibilityChange", e);
    }
  }
  /**
   * Callback registered with `window.addEventListener('visibilitychange')`.
   */
  async _onVisibilityChanged(e) {
    const r = `#_onVisibilityChanged(${e})`;
    if (this._debug(r, "visibilityState", document.visibilityState), document.visibilityState === "visible") {
      if (this.autoRefreshToken && this._startAutoRefresh(), !e)
        if (await this.initializePromise, this.lock != null)
          await this._acquireLock(this.lockAcquireTimeout, async () => {
            if (document.visibilityState !== "visible") {
              this._debug(r, "acquired the lock to recover the session, but the browser visibilityState is no longer visible, aborting");
              return;
            }
            await this._recoverAndRefresh();
          });
        else {
          if (document.visibilityState !== "visible") {
            this._debug(r, "visibilityState is no longer visible, skipping recovery");
            return;
          }
          await this._recoverAndRefresh();
        }
    } else document.visibilityState === "hidden" && this.autoRefreshToken && this._stopAutoRefresh();
  }
  /**
   * Generates the relevant login URL for a third-party provider.
   * @param options.redirectTo A URL or mobile address to send the user to after they are confirmed.
   * @param options.scopes A space-separated list of scopes granted to the OAuth application.
   * @param options.queryParams An object of key-value pairs containing query parameters granted to the OAuth application.
   */
  async _getUrlForProvider(e, r, n) {
    let s = n == null ? void 0 : n.redirectTo, i = null, o = null, a = null;
    this.flowType === "pkce" && ([i, o, a] = await this._getCodeChallengeAndMethod(), s = this._maybeAppendFlowIdToRedirect(s, a));
    const l = [`provider=${encodeURIComponent(r)}`];
    if (s && l.push(`redirect_to=${encodeURIComponent(s)}`), n != null && n.scopes && l.push(`scopes=${encodeURIComponent(n.scopes)}`), i != null && o != null) {
      const c = new URLSearchParams({
        code_challenge: `${encodeURIComponent(i)}`,
        code_challenge_method: `${encodeURIComponent(o)}`
      });
      l.push(c.toString());
    }
    if (n != null && n.queryParams) {
      const c = new URLSearchParams(n.queryParams);
      l.push(c.toString());
    }
    return n != null && n.skipBrowserRedirect && l.push(`skip_http_redirect=${n.skipBrowserRedirect}`), { url: `${e}?${l.join("&")}`, flowId: a };
  }
  /**
   * Appends the reserved flow id parameter to a redirect URL so the callback
   * can be matched to the verifier stored for its flow. Opt-in via
   * `experimental.appendPkceFlowIdToRedirects`: redirect URLs are validated
   * against the project's allow list including the query string, so an extra
   * parameter can stop exact (non-wildcard) entries from matching.
   */
  _maybeAppendFlowIdToRedirect(e, r) {
    return !e || !r || !this.experimental.appendPkceFlowIdToRedirects ? e ?? void 0 : Sl(e, r);
  }
  /**
   * Generates and stores a PKCE challenge/verifier pair for a new flow,
   * logging any pending verifier the bounded slot ring evicts.
   */
  async _getCodeChallengeAndMethod(e = !1) {
    return El(this.storage, this.storageKey, e, (r) => this._debug("#_getCodeChallengeAndMethod()", "evicted oldest pending PKCE verifier slot", r));
  }
  async _unenroll(e) {
    try {
      return await this._useSession(async (r) => {
        var n;
        const { data: s, error: i } = r;
        return i ? this._returnResult({ data: null, error: i }) : await k(this.fetch, "DELETE", `${this.url}/factors/${e.factorId}`, {
          headers: this.headers,
          jwt: (n = s == null ? void 0 : s.session) === null || n === void 0 ? void 0 : n.access_token
        });
      });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  async _enroll(e) {
    try {
      return await this._useSession(async (r) => {
        var n, s;
        const { data: i, error: o } = r;
        if (o)
          return this._returnResult({ data: null, error: o });
        const a = Object.assign({ friendly_name: e.friendlyName, factor_type: e.factorType }, e.factorType === "phone" ? { phone: e.phone } : e.factorType === "totp" ? { issuer: e.issuer } : {}), { data: l, error: c } = await k(this.fetch, "POST", `${this.url}/factors`, {
          body: a,
          headers: this.headers,
          jwt: (n = i == null ? void 0 : i.session) === null || n === void 0 ? void 0 : n.access_token
        });
        return c ? this._returnResult({ data: null, error: c }) : (e.factorType === "totp" && l.type === "totp" && (!((s = l == null ? void 0 : l.totp) === null || s === void 0) && s.qr_code) && (l.totp.qr_code = `data:image/svg+xml;utf-8,${l.totp.qr_code}`), this._returnResult({ data: l, error: null }));
      });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  async _verify(e) {
    const r = async () => {
      try {
        return await this._useSession(async (n) => {
          var s;
          const { data: i, error: o } = n;
          if (o)
            return this._returnResult({ data: null, error: o });
          const a = Object.assign({ challenge_id: e.challengeId }, "webauthn" in e ? {
            webauthn: Object.assign(Object.assign({}, e.webauthn), { credential_response: e.webauthn.type === "create" ? hs(e.webauthn.credential_response) : fs(e.webauthn.credential_response) })
          } : { code: e.code }), { data: l, error: c } = await k(this.fetch, "POST", `${this.url}/factors/${e.factorId}/verify`, {
            body: a,
            headers: this.headers,
            jwt: (s = i == null ? void 0 : i.session) === null || s === void 0 ? void 0 : s.access_token
          });
          return c ? this._returnResult({ data: null, error: c }) : (await this._saveSession(Object.assign({ expires_at: Math.round(Date.now() / 1e3) + l.expires_in }, l)), await this._notifyAllSubscribers("MFA_CHALLENGE_VERIFIED", l), this._returnResult({ data: l, error: c }));
        });
      } catch (n) {
        if (b(n))
          return this._returnResult({ data: null, error: n });
        throw n;
      }
    };
    return this.lock != null ? this._acquireLock(this.lockAcquireTimeout, r) : r();
  }
  async _challenge(e) {
    const r = async () => {
      try {
        return await this._useSession(async (n) => {
          var s;
          const { data: i, error: o } = n;
          if (o)
            return this._returnResult({ data: null, error: o });
          const a = await k(this.fetch, "POST", `${this.url}/factors/${e.factorId}/challenge`, {
            body: e,
            headers: this.headers,
            jwt: (s = i == null ? void 0 : i.session) === null || s === void 0 ? void 0 : s.access_token
          });
          if (a.error)
            return a;
          const { data: l } = a;
          if (l.type !== "webauthn")
            return { data: l, error: null };
          switch (l.webauthn.type) {
            case "create":
              return {
                data: Object.assign(Object.assign({}, l), { webauthn: Object.assign(Object.assign({}, l.webauthn), { credential_options: Object.assign(Object.assign({}, l.webauthn.credential_options), { publicKey: us(l.webauthn.credential_options.publicKey) }) }) }),
                error: null
              };
            case "request":
              return {
                data: Object.assign(Object.assign({}, l), { webauthn: Object.assign(Object.assign({}, l.webauthn), { credential_options: Object.assign(Object.assign({}, l.webauthn.credential_options), { publicKey: ds(l.webauthn.credential_options.publicKey) }) }) }),
                error: null
              };
          }
        });
      } catch (n) {
        if (b(n))
          return this._returnResult({ data: null, error: n });
        throw n;
      }
    };
    return this.lock != null ? this._acquireLock(this.lockAcquireTimeout, r) : r();
  }
  /**
   * {@link GoTrueMFAApi#challengeAndVerify}
   */
  async _challengeAndVerify(e) {
    const { data: r, error: n } = await this._challenge({
      factorId: e.factorId
    });
    return n ? this._returnResult({ data: null, error: n }) : await this._verify({
      factorId: e.factorId,
      challengeId: r.id,
      code: e.code
    });
  }
  /**
   * {@link GoTrueMFAApi#listFactors}
   */
  async _listFactors() {
    var e;
    const { data: { user: r }, error: n } = await this.getUser();
    if (n)
      return { data: null, error: n };
    const s = {
      all: [],
      phone: [],
      totp: [],
      webauthn: [],
      recovery_code: []
    };
    for (const i of (e = r == null ? void 0 : r.factors) !== null && e !== void 0 ? e : [])
      s.all.push(i), i.status === "verified" && i.factor_type in s && Array.isArray(s[i.factor_type]) && s[i.factor_type].push(i);
    return {
      data: s,
      error: null
    };
  }
  /**
   * {@link GoTrueMFAApi#getAuthenticatorAssuranceLevel}
   */
  async _getAuthenticatorAssuranceLevel(e) {
    var r, n, s, i;
    if (e)
      try {
        const { payload: h } = $t(e);
        let f = null;
        h.aal && (f = h.aal);
        let g = f;
        const { data: { user: m }, error: y } = await this.getUser(e);
        if (y)
          return this._returnResult({ data: null, error: y });
        ((n = (r = m == null ? void 0 : m.factors) === null || r === void 0 ? void 0 : r.filter((E) => E.status === "verified")) !== null && n !== void 0 ? n : []).length > 0 && (g = "aal2");
        const w = h.amr || [];
        return { data: { currentLevel: f, nextLevel: g, currentAuthenticationMethods: w }, error: null };
      } catch (h) {
        if (b(h))
          return this._returnResult({ data: null, error: h });
        throw h;
      }
    const { data: { session: o }, error: a } = await this.getSession();
    if (a)
      return this._returnResult({ data: null, error: a });
    if (!o)
      return {
        data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] },
        error: null
      };
    const { payload: l } = $t(o.access_token);
    let c = null;
    l.aal && (c = l.aal);
    let u = c;
    ((i = (s = o.user.factors) === null || s === void 0 ? void 0 : s.filter((h) => h.status === "verified")) !== null && i !== void 0 ? i : []).length > 0 && (u = "aal2");
    const p = l.amr || [];
    return { data: { currentLevel: c, nextLevel: u, currentAuthenticationMethods: p }, error: null };
  }
  /**
   * {@link AuthMFARecoveryCodesApi#getStatus}
   */
  async _getRecoveryCodesStatus() {
    ct(this.experimental);
    try {
      return await this._useSession(async (e) => {
        var r;
        const { data: n, error: s } = e;
        if (s)
          return this._returnResult({ data: null, error: s });
        const { data: i, error: o } = await k(this.fetch, "GET", `${this.url}/factors/recovery-codes`, {
          headers: this.headers,
          jwt: (r = n == null ? void 0 : n.session) === null || r === void 0 ? void 0 : r.access_token
        });
        return o ? this._returnResult({ data: null, error: o }) : this._returnResult({ data: i, error: null });
      });
    } catch (e) {
      if (b(e))
        return this._returnResult({ data: null, error: e });
      throw e;
    }
  }
  /**
   * {@link AuthMFARecoveryCodesApi#generate}
   */
  async _generateRecoveryCodes(e) {
    ct(this.experimental);
    try {
      return await this._useSession(async (r) => {
        var n;
        const { data: s, error: i } = r;
        if (i)
          return this._returnResult({ data: null, error: i });
        const { data: o, error: a } = await k(this.fetch, "POST", `${this.url}/factors/recovery-codes`, {
          // The body is optional server-side; only send one when a name was given.
          body: e != null && e.friendlyName ? { friendly_name: e.friendlyName } : void 0,
          headers: this.headers,
          jwt: (n = s == null ? void 0 : s.session) === null || n === void 0 ? void 0 : n.access_token
        });
        return a ? this._returnResult({ data: null, error: a }) : this._returnResult({ data: o, error: null });
      });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  /**
   * {@link AuthMFARecoveryCodesApi#verify}
   */
  async _verifyRecoveryCode(e) {
    ct(this.experimental);
    const r = async () => {
      try {
        return await this._useSession(async (n) => {
          var s;
          const { data: i, error: o } = n;
          if (o)
            return this._returnResult({ data: null, error: o });
          const { data: a, error: l } = await k(this.fetch, "POST", `${this.url}/factors/recovery-codes/verify`, {
            body: { code: e.code },
            headers: this.headers,
            jwt: (s = i == null ? void 0 : i.session) === null || s === void 0 ? void 0 : s.access_token
          });
          if (l)
            return this._returnResult({ data: null, error: l });
          const c = Object.assign({ expires_at: Ei(a.expires_in) }, a);
          return await this._saveSession(c), await this._notifyAllSubscribers("MFA_CHALLENGE_VERIFIED", c), this._returnResult({ data: a, error: null });
        });
      } catch (n) {
        if (b(n))
          return this._returnResult({ data: null, error: n });
        throw n;
      }
    };
    return this.lock != null ? this._acquireLock(this.lockAcquireTimeout, r) : r();
  }
  /**
   * {@link AuthMFARecoveryCodesApi#regenerate}
   */
  async _regenerateRecoveryCodes() {
    ct(this.experimental);
    try {
      return await this._useSession(async (e) => {
        var r;
        const { data: n, error: s } = e;
        if (s)
          return this._returnResult({ data: null, error: s });
        const { data: i, error: o } = await k(this.fetch, "POST", `${this.url}/factors/recovery-codes/regenerate`, {
          headers: this.headers,
          jwt: (r = n == null ? void 0 : n.session) === null || r === void 0 ? void 0 : r.access_token
        });
        return o ? this._returnResult({ data: null, error: o }) : this._returnResult({ data: i, error: null });
      });
    } catch (e) {
      if (b(e))
        return this._returnResult({ data: null, error: e });
      throw e;
    }
  }
  /**
   * {@link AuthMFARecoveryCodesApi#unenroll}
   */
  async _unenrollRecoveryCodes() {
    ct(this.experimental);
    try {
      return await this._useSession(async (e) => {
        var r;
        const { data: n, error: s } = e;
        if (s)
          return this._returnResult({ data: null, error: s });
        const { data: i, error: o } = await k(this.fetch, "DELETE", `${this.url}/factors/recovery-codes`, {
          headers: this.headers,
          jwt: (r = n == null ? void 0 : n.session) === null || r === void 0 ? void 0 : r.access_token
        });
        return o ? this._returnResult({ data: null, error: o }) : this._returnResult({ data: i, error: null });
      });
    } catch (e) {
      if (b(e))
        return this._returnResult({ data: null, error: e });
      throw e;
    }
  }
  /**
   * Retrieves details about an OAuth authorization request.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * Returns authorization details including client info, scopes, and user information.
   * If the response includes only a redirect_url field, it means consent was already given - the caller
   * should handle the redirect manually if needed.
   */
  async _getAuthorizationDetails(e) {
    try {
      return await this._useSession(async (r) => {
        const { data: { session: n }, error: s } = r;
        return s ? this._returnResult({ data: null, error: s }) : n ? await k(this.fetch, "GET", `${this.url}/oauth/authorizations/${e}`, {
          headers: this.headers,
          jwt: n.access_token,
          xform: (i) => ({ data: i, error: null })
        }) : this._returnResult({ data: null, error: new F() });
      });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  /**
   * Approves an OAuth authorization request.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   */
  async _approveAuthorization(e, r) {
    try {
      return await this._useSession(async (n) => {
        const { data: { session: s }, error: i } = n;
        if (i)
          return this._returnResult({ data: null, error: i });
        if (!s)
          return this._returnResult({ data: null, error: new F() });
        const o = await k(this.fetch, "POST", `${this.url}/oauth/authorizations/${e}/consent`, {
          headers: this.headers,
          jwt: s.access_token,
          body: { action: "approve" },
          xform: (a) => ({ data: a, error: null })
        });
        return o.data && o.data.redirect_url && H() && !(r != null && r.skipBrowserRedirect) && window.location.assign(o.data.redirect_url), o;
      });
    } catch (n) {
      if (b(n))
        return this._returnResult({ data: null, error: n });
      throw n;
    }
  }
  /**
   * Denies an OAuth authorization request.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   */
  async _denyAuthorization(e, r) {
    try {
      return await this._useSession(async (n) => {
        const { data: { session: s }, error: i } = n;
        if (i)
          return this._returnResult({ data: null, error: i });
        if (!s)
          return this._returnResult({ data: null, error: new F() });
        const o = await k(this.fetch, "POST", `${this.url}/oauth/authorizations/${e}/consent`, {
          headers: this.headers,
          jwt: s.access_token,
          body: { action: "deny" },
          xform: (a) => ({ data: a, error: null })
        });
        return o.data && o.data.redirect_url && H() && !(r != null && r.skipBrowserRedirect) && window.location.assign(o.data.redirect_url), o;
      });
    } catch (n) {
      if (b(n))
        return this._returnResult({ data: null, error: n });
      throw n;
    }
  }
  /**
   * Lists all OAuth grants that the authenticated user has authorized.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   */
  async _listOAuthGrants() {
    try {
      return await this._useSession(async (e) => {
        const { data: { session: r }, error: n } = e;
        return n ? this._returnResult({ data: null, error: n }) : r ? await k(this.fetch, "GET", `${this.url}/user/oauth/grants`, {
          headers: this.headers,
          jwt: r.access_token,
          xform: (s) => ({ data: s, error: null })
        }) : this._returnResult({ data: null, error: new F() });
      });
    } catch (e) {
      if (b(e))
        return this._returnResult({ data: null, error: e });
      throw e;
    }
  }
  /**
   * Revokes a user's OAuth grant for a specific client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   */
  async _revokeOAuthGrant(e) {
    try {
      return await this._useSession(async (r) => {
        const { data: { session: n }, error: s } = r;
        return s ? this._returnResult({ data: null, error: s }) : n ? (await k(this.fetch, "DELETE", `${this.url}/user/oauth/grants`, {
          headers: this.headers,
          jwt: n.access_token,
          query: { client_id: e.clientId },
          noResolveJson: !0
        }), { data: {}, error: null }) : this._returnResult({ data: null, error: new F() });
      });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  async fetchJwk(e, r = { keys: [] }) {
    let n = r.keys.find((a) => a.kid === e);
    if (n)
      return n;
    const s = Date.now();
    if (n = this.jwks.keys.find((a) => a.kid === e), n && this.jwks_cached_at + rl > s)
      return n;
    const { data: i, error: o } = await k(this.fetch, "GET", `${this.url}/.well-known/jwks.json`, {
      headers: this.headers
    });
    if (o)
      throw o;
    return !i.keys || i.keys.length === 0 || (this.jwks = i, this.jwks_cached_at = s, n = i.keys.find((a) => a.kid === e), !n) ? null : n;
  }
  /**
   * Extracts the JWT claims present in the access token by first verifying the
   * JWT against the server's JSON Web Key Set endpoint
   * `/.well-known/jwks.json` which is often cached, resulting in significantly
   * faster responses. Prefer this method over {@link GoTrueClient.getUser} which always
   * sends a request to the Auth server for each JWT.
   *
   * If the project is not using an asymmetric JWT signing key (like ECC or
   * RSA) it always sends a request to the Auth server (similar to
   * {@link GoTrueClient.getUser}) to verify the JWT.
   *
   * @param jwt An optional specific JWT you wish to verify, not the one you
   *            can obtain from {@link GoTrueClient.getSession}.
   * @param options Various additional options that allow you to customize the
   *                behavior of this method.
   *
   * @category Auth
   *
   * @remarks
   * - Parses the user's [access token](/docs/guides/auth/sessions#access-token-jwt-claims) as a [JSON Web Token (JWT)](/docs/guides/auth/jwts) and returns its components if valid and not expired.
   * - If your project is using asymmetric JWT signing keys, then the verification is done locally usually without a network request using the [WebCrypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API).
   * - A network request is sent to your project's JWT signing key discovery endpoint `https://project-id.supabase.co/auth/v1/.well-known/jwks.json`, which is cached locally. If your environment is ephemeral, such as a Lambda function that is destroyed after every request, a network request will be sent for each new invocation. Supabase provides a network-edge cache providing fast responses for these situations.
   * - If the user's access token is about to expire when calling this function, the user's session will first be refreshed before validating the JWT.
   * - If your project is using a symmetric secret to sign the JWT, it always sends a request similar to `getUser()` to validate the JWT at the server before returning the decoded token. This is also used if the WebCrypto API is not available in the environment. Make sure you polyfill it in such situations.
   * - The returned claims can be customized per project using the [Custom Access Token Hook](/docs/guides/auth/auth-hooks/custom-access-token-hook).
   *
   * @example Get JWT claims, header and signature
   * ```js
   * const { data, error } = await supabase.auth.getClaims()
   * ```
   *
   * @exampleResponse Get JWT claims, header and signature
   * ```json
   * {
   *   "data": {
   *     "claims": {
   *       "aal": "aal1",
   *       "amr": [{
   *         "method": "email",
   *         "timestamp": 1715766000
   *       }],
   *       "app_metadata": {},
   *       "aud": "authenticated",
   *       "email": "example@email.com",
   *       "exp": 1715769600,
   *       "iat": 1715766000,
   *       "is_anonymous": false,
   *       "iss": "https://project-id.supabase.co/auth/v1",
   *       "phone": "+13334445555",
   *       "role": "authenticated",
   *       "session_id": "11111111-1111-1111-1111-111111111111",
   *       "sub": "11111111-1111-1111-1111-111111111111",
   *       "user_metadata": {}
   *     },
   *     "header": {
   *       "alg": "RS256",
   *       "typ": "JWT",
   *       "kid": "11111111-1111-1111-1111-111111111111"
   *     },
   *     "signature": [/** Uint8Array *\/],
   *   },
   *   "error": null
   * }
   * ```
   */
  async getClaims(e, r = {}) {
    try {
      let n = e;
      if (!n) {
        const { data: h, error: f } = await this.getSession();
        if (f || !h.session)
          return this._returnResult({ data: null, error: f });
        n = h.session.access_token;
      }
      const { header: s, payload: i, signature: o, raw: { header: a, payload: l } } = $t(n);
      if (!(r != null && r.allowExpired))
        try {
          Tl(i.exp);
        } catch (h) {
          throw new Jt(h instanceof Error ? h.message : "JWT validation failed");
        }
      const c = !s.alg || s.alg.startsWith("HS") || !s.kid || !("crypto" in globalThis && "subtle" in globalThis.crypto) ? null : await this.fetchJwk(s.kid, r != null && r.keys ? { keys: r.keys } : r == null ? void 0 : r.jwks);
      if (!c) {
        const { error: h } = await this.getUser(n);
        if (h)
          throw h;
        return {
          data: {
            claims: i,
            header: s,
            signature: o
          },
          error: null
        };
      }
      const u = Rl(s.alg), d = await crypto.subtle.importKey("jwk", c, u, !0, [
        "verify"
      ]);
      if (!await crypto.subtle.verify(u, d, o, ul(`${a}.${l}`)))
        throw new Jt("Invalid JWT signature");
      return {
        data: {
          claims: i,
          header: s,
          signature: o
        },
        error: null
      };
    } catch (n) {
      if (b(n))
        return this._returnResult({ data: null, error: n });
      throw n;
    }
  }
  // --- Passkey Methods ---
  /**
   * Sign in with a passkey. Handles the full WebAuthn ceremony:
   * 1. Fetches authentication challenge from server
   * 2. Prompts user via navigator.credentials.get()
   * 3. Verifies credential with server and creates session
   *
   * Pass `options.mediation: 'conditional'` to use WebAuthn Conditional UI
   * (passkey autofill) instead of the modal picker; the value is forwarded to
   * `navigator.credentials.get()` unchanged.
   *
   * The challenge fetched in step 1 expires after the server's
   * GOTRUE_WEBAUTHN_CHALLENGE_EXPIRY_DURATION (5 minutes by default). With
   * `mediation: 'conditional'` the autofill prompt can stay pending for longer
   * than that: the browser ceremony then still succeeds, but verification fails
   * with `error_code: "webauthn_challenge_expired"`. Recover by calling
   * `signInWithPasskey()` again. It fetches a fresh challenge and, unless you
   * passed your own `options.signal`, cancels the pending ceremony first, so
   * the browser never sees two concurrent WebAuthn requests; the earlier call
   * resolves with a `WebAuthnError` whose code is `ERROR_CEREMONY_ABORTED`. If
   * you pass your own `signal`, abort it before retrying.
   *
   * @category Auth
   *
   * @example Sign in with Conditional UI (passkey autofill)
   * ```js
   * // <input autocomplete="username webauthn" /> somewhere on the page
   * const { data, error } = await supabase.auth.signInWithPasskey({
   *   options: {
   *     mediation: 'conditional'
   *   }
   * });
   * ```
   */
  async signInWithPasskey(e) {
    var r, n, s, i;
    try {
      if (!Xt())
        return this._returnResult({
          data: null,
          error: new ne("Browser does not support WebAuthn", null)
        });
      const { data: o, error: a } = await this._startPasskeyAuthentication({
        options: { captchaToken: (r = e == null ? void 0 : e.options) === null || r === void 0 ? void 0 : r.captchaToken }
      });
      if (a || !o)
        return this._returnResult({ data: null, error: a });
      const l = ds(o.options), c = (s = (n = e == null ? void 0 : e.options) === null || n === void 0 ? void 0 : n.signal) !== null && s !== void 0 ? s : Gr.createNewAbortSignal(), { data: u, error: d } = await Ii({
        publicKey: l,
        signal: c,
        mediation: (i = e == null ? void 0 : e.options) === null || i === void 0 ? void 0 : i.mediation
      });
      if (d || !u)
        return this._returnResult({
          data: null,
          error: d ?? new ne("WebAuthn ceremony failed", null)
        });
      const p = fs(u);
      return this._verifyPasskeyAuthentication({
        challengeId: o.challenge_id,
        credential: p
      });
    } catch (o) {
      if (b(o))
        return this._returnResult({ data: null, error: o });
      throw o;
    }
  }
  /**
   * Register a passkey for the current authenticated user. Handles the full WebAuthn ceremony:
   * 1. Fetches registration challenge from server
   * 2. Prompts user via navigator.credentials.create()
   * 3. Verifies credential with server
   *
   * Requires an active session.
   *
   * @category Auth
   */
  async registerPasskey(e) {
    var r, n;
    try {
      if (!Xt())
        return this._returnResult({
          data: null,
          error: new ne("Browser does not support WebAuthn", null)
        });
      const { data: s, error: i } = await this._startPasskeyRegistration();
      if (i || !s)
        return this._returnResult({ data: null, error: i });
      const o = us(s.options), a = (n = (r = e == null ? void 0 : e.options) === null || r === void 0 ? void 0 : r.signal) !== null && n !== void 0 ? n : Gr.createNewAbortSignal(), { data: l, error: c } = await Ci({
        publicKey: o,
        signal: a
      });
      if (c || !l)
        return this._returnResult({
          data: null,
          error: c ?? new ne("WebAuthn ceremony failed", null)
        });
      const u = hs(l);
      return this._verifyPasskeyRegistration({
        challengeId: s.challenge_id,
        credential: u
      });
    } catch (s) {
      if (b(s))
        return this._returnResult({ data: null, error: s });
      throw s;
    }
  }
  /**
   * Start passkey registration for the current authenticated user.
   * Returns WebAuthn credential creation options to pass to navigator.credentials.create().
   */
  async _startPasskeyRegistration() {
    try {
      return await this._useSession(async (e) => {
        const { data: { session: r }, error: n } = e;
        if (n)
          return this._returnResult({ data: null, error: n });
        if (!r)
          return this._returnResult({ data: null, error: new F() });
        const { data: s, error: i } = await k(this.fetch, "POST", `${this.url}/passkeys/registration/options`, {
          headers: this.headers,
          jwt: r.access_token,
          body: {}
        });
        return i ? this._returnResult({ data: null, error: i }) : this._returnResult({ data: s, error: null });
      });
    } catch (e) {
      if (b(e))
        return this._returnResult({ data: null, error: e });
      throw e;
    }
  }
  /**
   * Verify passkey registration with the credential response.
   * The credentialResponse should be the serialized output of navigator.credentials.create().
   */
  async _verifyPasskeyRegistration(e) {
    try {
      return await this._useSession(async (r) => {
        const { data: { session: n }, error: s } = r;
        if (s)
          return this._returnResult({ data: null, error: s });
        if (!n)
          return this._returnResult({ data: null, error: new F() });
        const { data: i, error: o } = await k(this.fetch, "POST", `${this.url}/passkeys/registration/verify`, {
          headers: this.headers,
          jwt: n.access_token,
          body: {
            challenge_id: e.challengeId,
            credential: e.credential
          }
        });
        return o ? this._returnResult({ data: null, error: o }) : this._returnResult({ data: i, error: null });
      });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  /**
   * Start passkey authentication.
   * Returns WebAuthn credential request options to pass to navigator.credentials.get().
   */
  async _startPasskeyAuthentication(e) {
    var r;
    try {
      const { data: n, error: s } = await k(this.fetch, "POST", `${this.url}/passkeys/authentication/options`, {
        headers: this.headers,
        body: {
          gotrue_meta_security: { captcha_token: (r = e == null ? void 0 : e.options) === null || r === void 0 ? void 0 : r.captchaToken }
        }
      });
      return s ? this._returnResult({ data: null, error: s }) : this._returnResult({ data: n, error: null });
    } catch (n) {
      if (b(n))
        return this._returnResult({ data: null, error: n });
      throw n;
    }
  }
  /**
   * Verify passkey authentication and create a session.
   * The credential should be the serialized output of navigator.credentials.get().
   */
  async _verifyPasskeyAuthentication(e) {
    try {
      const { data: r, error: n } = await k(this.fetch, "POST", `${this.url}/passkeys/authentication/verify`, {
        headers: this.headers,
        body: {
          challenge_id: e.challengeId,
          credential: e.credential
        },
        xform: Q
      });
      return n ? this._returnResult({ data: null, error: n }) : (r.session && (await this._saveSession(r.session), await this._notifyAllSubscribers("SIGNED_IN", r.session)), this._returnResult({ data: r, error: null }));
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  /**
   * List all passkeys for the current user.
   */
  async _listPasskeys() {
    try {
      return await this._useSession(async (e) => {
        const { data: { session: r }, error: n } = e;
        if (n)
          return this._returnResult({ data: null, error: n });
        if (!r)
          return this._returnResult({ data: null, error: new F() });
        const { data: s, error: i } = await k(this.fetch, "GET", `${this.url}/passkeys`, {
          headers: this.headers,
          jwt: r.access_token,
          xform: (o) => ({ data: o, error: null })
        });
        return i ? this._returnResult({ data: null, error: i }) : this._returnResult({ data: s, error: null });
      });
    } catch (e) {
      if (b(e))
        return this._returnResult({ data: null, error: e });
      throw e;
    }
  }
  /**
   * Update a passkey.
   */
  async _updatePasskey(e) {
    try {
      return await this._useSession(async (r) => {
        const { data: { session: n }, error: s } = r;
        if (s)
          return this._returnResult({ data: null, error: s });
        if (!n)
          return this._returnResult({ data: null, error: new F() });
        const { data: i, error: o } = await k(this.fetch, "PATCH", `${this.url}/passkeys/${e.passkeyId}`, {
          headers: this.headers,
          jwt: n.access_token,
          body: { friendly_name: e.friendlyName }
        });
        return o ? this._returnResult({ data: null, error: o }) : this._returnResult({ data: i, error: null });
      });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  /**
   * Delete a passkey.
   */
  async _deletePasskey(e) {
    try {
      return await this._useSession(async (r) => {
        const { data: { session: n }, error: s } = r;
        if (s)
          return this._returnResult({ data: null, error: s });
        if (!n)
          return this._returnResult({ data: null, error: new F() });
        const { error: i } = await k(this.fetch, "DELETE", `${this.url}/passkeys/${e.passkeyId}`, {
          headers: this.headers,
          jwt: n.access_token,
          noResolveJson: !0
        });
        return i ? this._returnResult({ data: null, error: i }) : this._returnResult({ data: null, error: null });
      });
    } catch (r) {
      if (b(r))
        return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
}
kt.nextInstanceID = {};
const Xl = kt, Ql = "2.118.0";
let ft = "", Zt;
if (typeof Deno < "u") {
  var kr;
  ft = "deno", Zt = (kr = Deno.version) === null || kr === void 0 ? void 0 : kr.deno;
} else if (typeof document < "u") ft = "web";
else if (typeof navigator < "u" && navigator.product === "ReactNative") ft = "react-native";
else {
  var Sr;
  ft = "node";
  const t = globalThis.process;
  Zt = t == null || (Sr = t.version) === null || Sr === void 0 ? void 0 : Sr.replace(/^v/, "");
}
const ji = [`runtime=${ft}`];
Zt && ji.push(`runtime-version=${Zt}`);
const Zl = { "X-Client-Info": `supabase-js/${Ql}; ${ji.join("; ")}` }, ec = { headers: Zl }, tc = { schema: "public" }, rc = {
  autoRefreshToken: !0,
  persistSession: !0,
  detectSessionInUrl: !0,
  flowType: "implicit"
}, nc = {}, sc = {
  enabled: !1,
  respectSamplingDecision: !0
};
function ic(t) {
  if (!t || typeof t != "string") return null;
  const e = t.split("-");
  if (e.length !== 4) return null;
  const [r, n, s, i] = e;
  if (r.length !== 2 || n.length !== 32 || s.length !== 16 || i.length !== 2) return null;
  const o = /^[0-9a-f]+$/i;
  return !o.test(r) || !o.test(n) || !o.test(s) || !o.test(i) || n === "00000000000000000000000000000000" || s === "0000000000000000" ? null : {
    version: r,
    traceId: n,
    parentId: s,
    traceFlags: i,
    isSampled: (parseInt(i, 16) & 1) === 1
  };
}
function oc(t, e) {
  if (!t || !e || e.length === 0) return !1;
  let r;
  if (t instanceof URL) r = t;
  else try {
    r = new URL(t);
  } catch {
    return !1;
  }
  for (const n of e) try {
    if (typeof n == "string") {
      if (ac(r.hostname, n)) return !0;
    } else if (n instanceof RegExp) {
      if (n.test(r.hostname)) return !0;
    } else if (typeof n == "function" && n(r))
      return !0;
  } catch {
    continue;
  }
  return !1;
}
function ac(t, e) {
  if (e === t) return !0;
  if (e.startsWith("*.")) {
    const r = e.slice(2);
    if (t.endsWith(r) && (t === r || t.endsWith("." + r)))
      return !0;
  }
  return !1;
}
function lc(t) {
  const e = [];
  try {
    const r = new URL(t);
    e.push(r.hostname);
  } catch {
  }
  return e.push("*.supabase.co", "*.supabase.in"), e.push("localhost", "127.0.0.1", "[::1]"), e;
}
function St(t) {
  "@babel/helpers - typeof";
  return St = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
    return typeof e;
  } : function(e) {
    return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
  }, St(t);
}
function cc(t, e) {
  if (St(t) != "object" || !t) return t;
  var r = t[Symbol.toPrimitive];
  if (r !== void 0) {
    var n = r.call(t, e);
    if (St(n) != "object") return n;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (e === "string" ? String : Number)(t);
}
function uc(t) {
  var e = cc(t, "string");
  return St(e) == "symbol" ? e : e + "";
}
function dc(t, e, r) {
  return (e = uc(e)) in t ? Object.defineProperty(t, e, {
    value: r,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : t[e] = r, t;
}
function gs(t, e) {
  var r = Object.keys(t);
  if (Object.getOwnPropertySymbols) {
    var n = Object.getOwnPropertySymbols(t);
    e && (n = n.filter(function(s) {
      return Object.getOwnPropertyDescriptor(t, s).enumerable;
    })), r.push.apply(r, n);
  }
  return r;
}
function D(t) {
  for (var e = 1; e < arguments.length; e++) {
    var r = arguments[e] != null ? arguments[e] : {};
    e % 2 ? gs(Object(r), !0).forEach(function(n) {
      dc(t, n, r[n]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(r)) : gs(Object(r)).forEach(function(n) {
      Object.defineProperty(t, n, Object.getOwnPropertyDescriptor(r, n));
    });
  }
  return t;
}
const hc = (t) => t ? (...e) => t(...e) : (...e) => fetch(...e), fc = () => Headers, Pi = (t) => t.startsWith("sb_publishable_") || t.startsWith("sb_secret_"), pc = "sb_temp_", ms = /* @__PURE__ */ new Set(), gc = (t) => {
  var e, r;
  if (!t.startsWith("sb_") || Pi(t) || t.startsWith(pc)) return;
  const n = (e = (r = t.match(/^sb_[a-zA-Z0-9]+_/)) === null || r === void 0 ? void 0 : r[0]) !== null && e !== void 0 ? e : "unknown";
  ms.has(n) || (ms.add(n), console.warn("@supabase/supabase-js: Unrecognized Supabase API key format. The client will proceed and send this key as-is; if you see authentication errors you may need to upgrade @supabase/supabase-js to a version that recognizes this key type."));
}, ys = (t, e, r, n, s, i) => {
  const o = hc(n), a = fc(), l = (s == null ? void 0 : s.enabled) === !0, c = (s == null ? void 0 : s.respectSamplingDecision) !== !1, u = l ? lc(e) : null, d = !(i != null && i.omitApiKeyAsBearer && Pi(t));
  return async (p, h) => {
    const f = await r();
    let g = new a(h == null ? void 0 : h.headers);
    if (g.has("apikey") || g.set("apikey", t), !g.has("Authorization")) {
      const m = f ?? (d ? t : null);
      m && g.set("Authorization", `Bearer ${m}`);
    }
    if (u) {
      const m = mc(p, u, c);
      m && (m.traceparent && !g.has("traceparent") && g.set("traceparent", m.traceparent), m.tracestate && !g.has("tracestate") && g.set("tracestate", m.tracestate), m.baggage && !g.has("baggage") && g.set("baggage", m.baggage));
    }
    return o(p, D(D({}, h), {}, { headers: g }));
  };
};
let _s = !1, ws = !1;
function mc(t, e, r) {
  const n = po();
  if (!n)
    return _s || (_s = !0, console.warn("@supabase/supabase-js: tracePropagation is enabled but the tracing runtime is not loaded, so trace headers will not be attached. Add `import '@supabase/supabase-js/tracing'` at your application entry point (requires the OpenTelemetry API package to be installed). The CDN/UMD build does not support trace propagation.")), null;
  if (!oc(typeof t == "string" || t instanceof URL ? t : t.url, e)) return null;
  const s = n();
  if (!s || !s.traceparent) {
    var i;
    if (!(s == null || (i = s.carrierKeys) === null || i === void 0) && i.length && !ws) {
      ws = !0;
      const o = s.carrierKeys.includes("sentry-trace") ? " Sentry detected: set `propagateTraceparent: true` in Sentry.init() to emit it." : " Configure your tracing SDK to emit W3C trace context on outgoing requests.";
      console.warn(`@supabase/supabase-js: tracePropagation is enabled and a tracing SDK is active, but its propagator wrote [${s.carrierKeys.join(", ")}] and no W3C traceparent header, so trace headers will not be attached.` + o);
    }
    return null;
  }
  if (r) {
    const o = ic(s.traceparent);
    if (o && !o.isSampled) return { traceparent: s.traceparent };
  }
  return s;
}
function vs(t) {
  return typeof t == "boolean" ? { enabled: t } : t;
}
function yc(t) {
  return t.endsWith("/") ? t : t + "/";
}
let bs = !1;
function _c(t) {
  bs || typeof t != "object" || t === null || !("schema" in t) || t.schema === void 0 || (bs = !0, console.warn(`@supabase/supabase-js: The "schema" option must be nested under "db", e.g. createClient(url, key, { db: { schema: 'myschema' } }). A top-level "schema" is ignored and queries go to the default schema.`));
}
function wc(t, e) {
  var r, n, s, i, o, a;
  const { db: l, auth: c, realtime: u, global: d } = t, { db: p, auth: h, realtime: f, global: g } = e, m = vs(t.tracePropagation), y = vs(e.tracePropagation), _ = {
    db: D(D({}, p), l),
    auth: D(D({}, h), c),
    realtime: D(D({}, f), u),
    storage: {},
    global: D(D(D({}, g), d), {}, { headers: D(D({}, (r = g == null ? void 0 : g.headers) !== null && r !== void 0 ? r : {}), (n = d == null ? void 0 : d.headers) !== null && n !== void 0 ? n : {}) }),
    tracePropagation: {
      enabled: (s = (i = m == null ? void 0 : m.enabled) !== null && i !== void 0 ? i : y == null ? void 0 : y.enabled) !== null && s !== void 0 ? s : !1,
      respectSamplingDecision: (o = (a = m == null ? void 0 : m.respectSamplingDecision) !== null && a !== void 0 ? a : y == null ? void 0 : y.respectSamplingDecision) !== null && o !== void 0 ? o : !0
    },
    accessToken: async () => ""
  };
  return t.accessToken ? _.accessToken = t.accessToken : delete _.accessToken, _;
}
function vc(t) {
  const e = t == null ? void 0 : t.trim();
  if (!e) throw new Error("supabaseUrl is required.");
  if (!e.match(/^https?:\/\//i)) throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
  try {
    return new URL(yc(e));
  } catch {
    throw Error("Invalid supabaseUrl: Provided URL is malformed.");
  }
}
var bc = class extends Xl {
  constructor(t) {
    super(t);
  }
}, kc = class {
  /**
  * Create a new client for use in the browser.
  *
  * @category Initializing
  *
  * @param supabaseUrl The unique Supabase URL which is supplied when you create a new project in your project dashboard.
  * @param supabaseKey The unique Supabase Key which is supplied when you create a new project in your project dashboard.
  * @param options Optional configuration for the client:
  * - `db.schema` — You can switch in between schemas. The schema needs to be on the list of exposed schemas inside Supabase.
  * - `auth.autoRefreshToken` — Set to `true` if you want to automatically refresh the token before expiring.
  * - `auth.persistSession` — Set to `true` if you want to automatically save the user session into local storage.
  * - `auth.detectSessionInUrl` — Set to `true` if you want to automatically detect OAuth grants in the URL and sign in the user.
  * - `realtime` — Options passed along to the realtime-js constructor.
  * - `storage` — Options passed along to the storage-js constructor.
  * - `global.fetch` — A custom fetch implementation.
  * - `global.headers` — Any additional headers to send with each network request.
  *
  * @example Creating a client
  * ```js
  * import { createClient } from '@supabase/supabase-js'
  *
  * // Create a single supabase client for interacting with your database
  * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
  * ```
  *
  * @example With a custom domain
  * ```js
  * import { createClient } from '@supabase/supabase-js'
  *
  * // Use a custom domain as the supabase URL
  * const supabase = createClient('https://my-custom-domain.com', 'your-publishable-key')
  * ```
  *
  * @example With additional parameters
  * ```js
  * import { createClient } from '@supabase/supabase-js'
  *
  * const options = {
  *   db: {
  *     schema: 'public',
  *   },
  *   auth: {
  *     autoRefreshToken: true,
  *     persistSession: true,
  *     detectSessionInUrl: true
  *   },
  *   global: {
  *     headers: { 'x-my-custom-header': 'my-app-name' },
  *   },
  * }
  * const supabase = createClient("https://xyzcompany.supabase.co", "your-publishable-key", options)
  * ```
  *
  * @exampleDescription With custom schemas
  * By default the API server points to the `public` schema. You can enable other database schemas within the Dashboard.
  * Go to [Settings > API > Exposed schemas](/dashboard/project/_/settings/api) and add the schema which you want to expose to the API.
  *
  * Note: each client connection can only access a single schema, so the code above can access the `other_schema` schema but cannot access the `public` schema.
  *
  * @example With custom schemas
  * ```js
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key', {
  *   // Provide a custom schema. Defaults to "public".
  *   db: { schema: 'other_schema' }
  * })
  * ```
  *
  * @exampleDescription Custom fetch implementation
  * `supabase-js` uses the runtime's global `fetch` to make HTTP requests,
  * but an alternative `fetch` implementation can be provided as an option.
  * This is useful in environments where the global `fetch` is unavailable or where you want to customize request behavior.
  *
  * @example Custom fetch implementation
  * ```js
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key', {
  *   global: { fetch: fetch.bind(globalThis) }
  * })
  * ```
  *
  * @exampleDescription React Native options with AsyncStorage
  * For React Native we recommend using `AsyncStorage` as the storage implementation for Supabase Auth.
  *
  * @example React Native options with AsyncStorage
  * ```js
  * import 'react-native-url-polyfill/auto'
  * import { createClient } from '@supabase/supabase-js'
  * import AsyncStorage from "@react-native-async-storage/async-storage";
  *
  * const supabase = createClient("https://xyzcompany.supabase.co", "your-publishable-key", {
  *   auth: {
  *     storage: AsyncStorage,
  *     autoRefreshToken: true,
  *     persistSession: true,
  *     detectSessionInUrl: false,
  *   },
  * });
  * ```
  *
  * @exampleDescription React Native options with Expo SecureStore
  * If you wish to encrypt the user's session information, you can use `aes-js` and store the encryption key in Expo SecureStore.
  * The `aes-js` library, a reputable JavaScript-only implementation of the AES encryption algorithm in CTR mode.
  * A new 256-bit encryption key is generated using the `react-native-get-random-values` library.
  * This key is stored inside Expo's SecureStore, while the value is encrypted and placed inside AsyncStorage.
  *
  * Please make sure that:
  * - You keep the `expo-secure-store`, `aes-js` and `react-native-get-random-values` libraries up-to-date.
  * - Choose the correct [`SecureStoreOptions`](https://docs.expo.dev/versions/latest/sdk/securestore/#securestoreoptions) for your app's needs.
  *   E.g. [`SecureStore.WHEN_UNLOCKED`](https://docs.expo.dev/versions/latest/sdk/securestore/#securestorewhen_unlocked) regulates when the data can be accessed.
  * - Carefully consider optimizations or other modifications to the above example, as those can lead to introducing subtle security vulnerabilities.
  *
  * @example React Native options with Expo SecureStore
  * ```ts
  * import 'react-native-url-polyfill/auto'
  * import { createClient } from '@supabase/supabase-js'
  * import AsyncStorage from '@react-native-async-storage/async-storage';
  * import * as SecureStore from 'expo-secure-store';
  * import * as aesjs from 'aes-js';
  * import 'react-native-get-random-values';
  *
  * // As Expo's SecureStore does not support values larger than 2048
  * // bytes, an AES-256 key is generated and stored in SecureStore, while
  * // it is used to encrypt/decrypt values stored in AsyncStorage.
  * class LargeSecureStore {
  *   private async _encrypt(key: string, value: string) {
  *     const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
  *
  *     const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
  *     const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  *
  *     await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
  *
  *     return aesjs.utils.hex.fromBytes(encryptedBytes);
  *   }
  *
  *   private async _decrypt(key: string, value: string) {
  *     const encryptionKeyHex = await SecureStore.getItemAsync(key);
  *     if (!encryptionKeyHex) {
  *       return encryptionKeyHex;
  *     }
  *
  *     const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
  *     const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
  *
  *     return aesjs.utils.utf8.fromBytes(decryptedBytes);
  *   }
  *
  *   async getItem(key: string) {
  *     const encrypted = await AsyncStorage.getItem(key);
  *     if (!encrypted) { return encrypted; }
  *
  *     return await this._decrypt(key, encrypted);
  *   }
  *
  *   async removeItem(key: string) {
  *     await AsyncStorage.removeItem(key);
  *     await SecureStore.deleteItemAsync(key);
  *   }
  *
  *   async setItem(key: string, value: string) {
  *     const encrypted = await this._encrypt(key, value);
  *
  *     await AsyncStorage.setItem(key, encrypted);
  *   }
  * }
  *
  * const supabase = createClient("https://xyzcompany.supabase.co", "your-publishable-key", {
  *   auth: {
  *     storage: new LargeSecureStore(),
  *     autoRefreshToken: true,
  *     persistSession: true,
  *     detectSessionInUrl: false,
  *   },
  * });
  * ```
  *
  * @example With a database query
  * ```ts
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
  *
  * const { data } = await supabase.from('profiles').select('*')
  * ```
  *
  * @exampleDescription With OpenTelemetry tracing
  * Opt in to W3C trace context propagation so the `trace_id` from your
  * client-side spans is attached to Supabase requests and appears in API
  * Gateway and Edge Function logs. Requires `@opentelemetry/api` to be
  * installed in your application and the tracing runtime to be loaded via
  * `import '@supabase/supabase-js/tracing'`. See [Tracing with the JS SDK](https://supabase.com/docs/guides/telemetry/client-side-tracing).
  *
  * @example With OpenTelemetry tracing
  * ```ts
  * import '@supabase/supabase-js/tracing'
  * import { createClient } from '@supabase/supabase-js'
  * import { trace } from '@opentelemetry/api'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key', {
  *   tracePropagation: true,
  * })
  *
  * const tracer = trace.getTracer('my-app')
  *
  * await tracer.startActiveSpan('fetch-users', async (span) => {
  *   // Outgoing request carries the active trace context.
  *   const { data, error } = await supabase.from('users').select('*')
  *   span.end()
  * })
  * ```
  */
  constructor(t, e, r) {
    var n, s;
    this.supabaseUrl = t, this.supabaseKey = e;
    const i = vc(t);
    if (!e) throw new Error("supabaseKey is required.");
    gc(e), _c(r), this.realtimeUrl = new URL("realtime/v1", i), this.realtimeUrl.protocol = this.realtimeUrl.protocol.replace("http", "ws"), this.authUrl = new URL("auth/v1", i), this.storageUrl = new URL("storage/v1", i), this.functionsUrl = new URL("functions/v1", i);
    const o = `sb-${i.hostname.split(".")[0]}-auth-token`, a = {
      db: tc,
      realtime: nc,
      auth: D(D({}, rc), {}, { storageKey: o }),
      global: ec,
      tracePropagation: sc
    }, l = wc(r ?? {}, a);
    if (this.settings = l, this.storageKey = (n = l.auth.storageKey) !== null && n !== void 0 ? n : "", this.headers = (s = l.global.headers) !== null && s !== void 0 ? s : {}, l.accessToken)
      this.accessToken = l.accessToken, this.auth = new Proxy({}, { get: (u, d) => {
        throw new Error(`@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.${String(d)} is not possible`);
      } });
    else {
      var c;
      this.auth = this._initSupabaseAuthClient((c = l.auth) !== null && c !== void 0 ? c : {}, this.headers, l.global.fetch);
    }
    this.fetch = ys(e, t, this._getSessionToken.bind(this), l.global.fetch, l.tracePropagation), this.functionsFetch = ys(e, t, this._getSessionToken.bind(this), l.global.fetch, l.tracePropagation, { omitApiKeyAsBearer: !0 }), this.realtime = this._initRealtimeClient(D({
      headers: this.headers,
      accessToken: this._getAccessToken.bind(this),
      fetch: this.fetch
    }, l.realtime)), this.accessToken && Promise.resolve(this.accessToken()).then((u) => this.realtime.setAuth(u)).catch((u) => console.warn("Failed to set initial Realtime auth token:", u)), this.rest = new Ro(new URL("rest/v1", i).href, {
      headers: this.headers,
      schema: l.db.schema,
      fetch: this.fetch,
      timeout: l.db.timeout,
      urlLengthLimit: l.db.urlLengthLimit,
      retry: l.db.retry
    }), this.storage = new Ga(this.storageUrl.href, this.headers, this.fetch, r == null ? void 0 : r.storage), l.accessToken || this._listenForAuthEvents();
  }
  /**
  * Supabase Functions allows you to deploy and invoke edge functions.
  */
  get functions() {
    return new _o(this.functionsUrl.href, {
      headers: this.headers,
      customFetch: this.functionsFetch
    });
  }
  /**
  * Perform a query on a table or a view.
  *
  * @param relation - The table or view name to query
  */
  from(t) {
    return this.rest.from(t);
  }
  /**
  * Select a schema to query or perform an function (rpc) call.
  *
  * The schema needs to be on the list of exposed schemas inside Supabase.
  *
  * @param schema - The schema to query
  */
  schema(t) {
    return this.rest.schema(t);
  }
  /**
  * Fetch the OpenAPI description PostgREST publishes for this client's schema.
  *
  * The document lists only the tables, views and functions the caller's role
  * holds privileges on. The request carries the same `apikey` and
  * `Authorization` headers as every other query, so the description is scoped
  * to the signed-in user. Call `.schema()` first to describe a schema other
  * than the client default.
  *
  * @example
  * ```ts
  * const { data, error } = await supabase.getOpenApiSpec()
  * ```
  */
  getOpenApiSpec() {
    return this.rest.getOpenApiSpec();
  }
  /**
  * Perform a function call.
  *
  * @param fn - The function name to call
  * @param args - The arguments to pass to the function call
  * @param options - Named parameters
  * @param options.head - When set to `true`, `data` will not be returned.
  * Useful if you only need the count.
  * @param options.get - When set to `true`, the function will be called with
  * read-only access mode.
  * @param options.count - Count algorithm to use to count rows returned by the
  * function. Only applicable for [set-returning
  * functions](https://www.postgresql.org/docs/current/functions-srf.html).
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  */
  rpc(t, e = {}, r = {
    head: !1,
    get: !1,
    count: void 0
  }) {
    return this.rest.rpc(t, e, r);
  }
  /**
  * Creates a Realtime channel with Broadcast, Presence, and Postgres Changes.
  *
  * @param {string} name - The name of the Realtime channel.
  * @param {Object} opts - The options to pass to the Realtime channel.
  *
  * @category Realtime
  */
  channel(t, e = { config: {} }) {
    return this.realtime.channel(t, e);
  }
  /**
  * Returns all Realtime channels.
  *
  * @category Realtime
  *
  * @example Get all channels
  * ```js
  * const channels = supabase.getChannels()
  * ```
  */
  getChannels() {
    return this.realtime.getChannels();
  }
  /**
  * Unsubscribes and removes Realtime channel from Realtime client.
  *
  * @param {RealtimeChannel} channel - The name of the Realtime channel.
  *
  *
  * @category Realtime
  *
  * @remarks
  * - Removing a channel is a great way to maintain the performance of your project's Realtime service as well as your database if you're listening to Postgres changes. Supabase will automatically handle cleanup 30 seconds after a client is disconnected, but unused channels may cause degradation as more clients are simultaneously subscribed.
  *
  * @example Removes a channel
  * ```js
  * supabase.removeChannel(myChannel)
  * ```
  */
  removeChannel(t) {
    return this.realtime.removeChannel(t);
  }
  /**
  * Unsubscribes and removes all Realtime channels from Realtime client.
  *
  * @category Realtime
  *
  * @remarks
  * - Removing channels is a great way to maintain the performance of your project's Realtime service as well as your database if you're listening to Postgres changes. Supabase will automatically handle cleanup 30 seconds after a client is disconnected, but unused channels may cause degradation as more clients are simultaneously subscribed.
  *
  * @example Remove all channels
  * ```js
  * supabase.removeAllChannels()
  * ```
  */
  removeAllChannels() {
    return this.realtime.removeAllChannels();
  }
  /**
  * The raw session token — the custom `accessToken` result or the signed-in user's JWT —
  * or `null` when there is no session. Unlike {@link _getAccessToken} it does not fall back
  * to `supabaseKey`, so callers can distinguish "no session" from "has session".
  */
  async _getSessionToken() {
    var t = this, e, r;
    if (t.accessToken) return await t.accessToken();
    const { data: n } = await t.auth.getSession();
    return (e = (r = n.session) === null || r === void 0 ? void 0 : r.access_token) !== null && e !== void 0 ? e : null;
  }
  async _getAccessToken() {
    var t = this, e;
    return (e = await t._getSessionToken()) !== null && e !== void 0 ? e : t.supabaseKey;
  }
  _initSupabaseAuthClient({ autoRefreshToken: t, persistSession: e, detectSessionInUrl: r, storage: n, userStorage: s, storageKey: i, flowType: o, lock: a, debug: l, throwOnError: c, experimental: u, lockAcquireTimeout: d, skipAutoInitialize: p }, h, f) {
    const g = {
      Authorization: `Bearer ${this.supabaseKey}`,
      apikey: `${this.supabaseKey}`
    };
    return new bc({
      url: this.authUrl.href,
      headers: D(D({}, g), h),
      storageKey: i,
      autoRefreshToken: t,
      persistSession: e,
      detectSessionInUrl: r,
      storage: n,
      userStorage: s,
      flowType: o,
      lock: a,
      debug: l,
      throwOnError: c,
      experimental: u,
      fetch: f,
      lockAcquireTimeout: d,
      skipAutoInitialize: p,
      hasCustomAuthorizationHeader: Object.keys(this.headers).some((m) => m.toLowerCase() === "authorization")
    });
  }
  _initRealtimeClient(t) {
    return new wa(this.realtimeUrl.href, D(D({}, t), {}, { params: D(D({}, { apikey: this.supabaseKey }), t == null ? void 0 : t.params) }));
  }
  _listenForAuthEvents() {
    return this.auth.onAuthStateChange((t, e) => {
      this._handleTokenChanged(t, "CLIENT", e == null ? void 0 : e.access_token);
    });
  }
  _handleTokenChanged(t, e, r) {
    (t === "TOKEN_REFRESHED" || t === "SIGNED_IN" || t === "INITIAL_SESSION") && this.changedAccessToken !== r ? (this.changedAccessToken = r, this.realtime.setAuth(r)) : t === "SIGNED_OUT" && (this.realtime.setAuth(), e == "STORAGE" && this.auth.signOut(), this.changedAccessToken = void 0);
  }
};
const Ni = (t, e, r) => new kc(t, e, r);
function Sc() {
  if (typeof window < "u" || globalThis.Deno !== void 0) return !1;
  const t = globalThis.process;
  if (!t) return !1;
  const e = t.version;
  if (e == null) return !1;
  const r = e.match(/^v(\d+)\./);
  return r ? parseInt(r[1], 10) <= 20 : !1;
}
Sc() && console.warn("⚠️  Node.js 20 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 22 or later. For more information, visit: https://github.com/orgs/supabase/discussions/45715");
function $i() {
  const t = globalThis.APP_CONFIG || (typeof window < "u" ? window.APP_CONFIG : void 0), e = t && t.P2_SUPABASE_URL, r = t && t.P2_SUPABASE_ANON_KEY;
  return e && r ? { url: e, anonKey: r } : null;
}
function ks(t) {
  return /invalid login credentials/i.test(t) ? "Неверная почта или пароль" : /email not confirmed/i.test(t) ? "Почта не подтверждена" : /banned/i.test(t) ? "Доступ отключён администратором компании" : /failed to fetch|network|load failed/i.test(t) ? "Нет связи с сервером. Попробуйте позже" : "Не удалось войти. Попробуйте ещё раз";
}
function Ss(t) {
  return /same_password|should be different/i.test(t) ? "Новый пароль должен отличаться от прежнего" : /weak|at least|too short|characters/i.test(t) ? "Пароль слишком короткий или простой" : /failed to fetch|network|load failed/i.test(t) ? "Нет связи с сервером. Попробуйте позже" : "Не удалось сменить пароль. Попробуйте ещё раз";
}
function Ec(t, e) {
  return t.length < 8 ? "Пароль — не короче 8 знаков" : t !== e ? "Пароли не совпадают" : null;
}
const Li = "platform2-auth", xc = 8e3;
function er(t) {
  try {
    const e = JSON.parse(t && t.getItem(Li) || "null");
    return !e || typeof e.expires_at != "number" ? null : { email: e.user && typeof e.user.email == "string" ? e.user.email : null, expiresAt: e.expires_at, issuedAt: typeof e.expires_in == "number" ? e.expires_at - e.expires_in : null };
  } catch {
    return null;
  }
}
async function Ac(t) {
  const e = t.stored;
  if (!e) return { email: await t.getSession(), offline: !1, issuedAt: null };
  const r = e.issuedAt;
  if (e.expiresAt > t.nowSec + 10) return { email: await t.getSession(), offline: !1, issuedAt: r };
  if (!t.online) return { email: e.email, offline: !0, issuedAt: r };
  const n = Symbol("timeout");
  let s;
  const i = new Promise((a) => {
    s = setTimeout(() => a(n), t.waitMs ?? xc);
  }), o = await Promise.race([t.getSession().catch(() => null), i]);
  return clearTimeout(s), typeof o == "string" ? { email: o, offline: !1, issuedAt: r } : t.stillStored() ? { email: e.email, offline: !0, issuedAt: r } : { email: null, offline: !1, issuedAt: null };
}
const Yr = "__platform2SupabaseClient", Xr = globalThis;
function Tc(t) {
  const e = Xr[Yr] || (Xr[Yr] = Ni(t.url, t.anonKey, {
    auth: { storageKey: Li, persistSession: !0, autoRefreshToken: !0, detectSessionInUrl: !1 }
  }));
  return {
    async signIn(r, n) {
      try {
        const { error: s } = await e.auth.signInWithPassword({ email: r.trim(), password: n });
        return s ? { ok: !1, message: ks(s.message) } : { ok: !0 };
      } catch (s) {
        return { ok: !1, message: ks(s instanceof Error ? s.message : "") };
      }
    },
    async signOut() {
      await e.auth.signOut();
    },
    async changePassword(r) {
      try {
        const { error: n } = await e.auth.updateUser({ password: r });
        return n ? { ok: !1, message: Ss(n.message) } : { ok: !0 };
      } catch (n) {
        return { ok: !1, message: Ss(n instanceof Error ? n.message : "") };
      }
    },
    async getEmail() {
      const { data: r } = await e.auth.getSession();
      return r.session && r.session.user.email || null;
    },
    async getSessionState() {
      let r = null;
      try {
        r = window.localStorage;
      } catch {
        r = null;
      }
      return Ac({
        stored: er(r),
        online: typeof navigator > "u" || navigator.onLine !== !1,
        nowSec: Math.floor(Date.now() / 1e3),
        getSession: async () => {
          const { data: n } = await e.auth.getSession();
          return n.session && n.session.user.email || null;
        },
        stillStored: () => er(r) !== null
      });
    },
    async getAccess() {
      const { data: r, error: n } = await e.rpc("pf_my_context");
      return n || !Array.isArray(r) ? [] : r.map((s) => ({
        company: s.company_name,
        role: s.role_name,
        projectId: s.project_id
      }));
    },
    onAuthChange(r) {
      const { data: n } = e.auth.onAuthStateChange((s) => {
        (s === "SIGNED_IN" || s === "SIGNED_OUT" || s === "INITIAL_SESSION") && setTimeout(r, 0);
      });
      return () => n.subscription.unsubscribe();
    }
  };
}
function st() {
  return Xr[Yr] || null;
}
const Te = "platform2_quality_company", Lt = "platform2_quality_state_", Es = "platform2_quality_project_", Di = "platform2_quality_access_", Ht = "platform2_quality_names_";
function Rc(t, e) {
  try {
    const r = JSON.parse(t.getItem(Ht + e) || "[]");
    return Array.isArray(r) ? r.map(String).filter(Boolean).slice(-10) : [];
  } catch {
    return [];
  }
}
function xs(t, e, r) {
  const n = Rc(t, e), s = (r || "").trim(), i = (t.getItem(Ht + e + ":now") || "").trim();
  i && i !== s && !n.includes(i) && n.push(i);
  const o = n.filter((a) => a !== s).slice(-10);
  try {
    t.setItem(Ht + e, JSON.stringify(o)), s && t.setItem(Ht + e + ":now", s);
  } catch {
  }
  return o;
}
const Qr = [
  "rbi_sync_config",
  "rbi_cloud_dirty",
  "rbi_force_full_pull",
  "rbi_force_remote_poll",
  "rbi_sync_last_pull_at",
  "rbi_sync_last_push_at",
  "rbi_sync_last_remote_check_at",
  "rbi_last_approved_pull_done",
  "rbi_first_full_offline_cache_done",
  "rbi_first_full_offline_cache_started_at",
  "rbi_need_full_offline_cache",
  "rbi_last_bg_cache_at",
  "rbi_settings_backup"
];
function Oc(t) {
  if (t.mode !== "email" || !t.companyId) return null;
  const e = t.companies.find((r) => r.id === t.companyId);
  return e && (e.modules.includes("quality") || e.modules.includes("construction")) ? e.id : null;
}
const gt = "platform2_quality_user", tr = "platform2_quality_drop_db", rr = "platform2_quality_legacy_owner";
function Re(t) {
  const e = t.trim().toLowerCase(), r = (n) => {
    let s = n >>> 0;
    for (let i = 0; i < e.length; i++)
      s ^= e.charCodeAt(i), s = Math.imul(s, 16777619) >>> 0;
    return s.toString(16).padStart(8, "0");
  };
  return r(2166136261) + r(791551244);
}
function Cc(t, e, r = "") {
  const n = t.getItem(Te) || "", s = n && t.getItem(gt) || "", i = e || "", o = i ? r : "";
  if (n === i && s === o) return !1;
  const a = !!n && !s && n === i && !!o;
  if (a) {
    const d = t.getItem(rr);
    if (t.getItem("rbi_cloud_dirty") === "1" && (!d || d === o))
      return t.setItem(rr, o), !1;
    (t.getItem("rbi_cloud_dirty") !== "1" || d === null) && t.setItem(tr, n);
  }
  const l = (d, p) => p ? d + ":" + p : d, c = {};
  for (const d of Qr) {
    const p = t.getItem(d);
    p !== null && (c[d] = p), t.removeItem(d);
  }
  a && t.getItem(tr) === n ? t.removeItem(Lt + n) : t.setItem(Lt + l(n, s), JSON.stringify(c));
  let u = {};
  try {
    u = JSON.parse(t.getItem(Lt + l(i, o)) || "{}");
  } catch {
    u = {};
  }
  for (const d of Qr) typeof u[d] == "string" && t.setItem(d, u[d]);
  return t.removeItem(Lt + l(i, o)), i ? t.setItem(Te, i) : t.removeItem(Te), o ? t.setItem(gt, o) : t.removeItem(gt), !0;
}
function Ic(t) {
  const e = (r) => t.includes(r);
  return e("quality.manage") || e("construction.manage") ? "manager" : e("quality.scope.contractor") ? "contractor" : e("quality.edit") ? "engineer" : e("quality.view") || e("construction.view") || e("construction.edit") ? "director" : "guest";
}
function Er(t) {
  const e = t && typeof t == "object" ? t : {}, r = e.contractor && typeof e.contractor == "object" ? e.contractor : {};
  return {
    actions: Array.isArray(e.actions) ? e.actions.map(String) : [],
    templates: Array.isArray(e.templates) ? e.templates.map(String) : [],
    projects: Array.isArray(e.projects) ? e.projects.map(String) : null,
    contractor: typeof r.name == "string" ? r.name : "",
    // P2-0044: номер фирмы (контрагент ядра) — по нему Стройконтроль отбирает записи подрядчика
    contractorId: typeof r.id == "string" ? r.id : "",
    // P2-0061 (Б1/Б2): ключи карточек справочника подрядчиков фирмы — «своя фирма» у записей без id контрагента
    contractorKeys: Array.isArray(r.keys) ? r.keys.map(String).filter(Boolean) : [],
    objects: Array.isArray(e.objects) ? e.objects.map((n) => n && typeof n == "object" ? String(n.key ?? "") : "").filter(Boolean) : null,
    // P2-0035 (039b): служебный объект-контейнер компании (как «Объекты RBI») — Качество работает в нём
    container: typeof e.container == "string" && e.container ? e.container : null,
    construction: Ui(e.construction),
    quality: jc(e.quality)
  };
}
function jc(t) {
  const e = Ui(t);
  if (!e) return null;
  const r = t, n = {};
  if (r.unplaced && typeof r.unplaced == "object")
    for (const [i, o] of Object.entries(r.unplaced)) (o === "all" || o === "own") && (n[i] = o);
  const s = (i) => typeof i == "string" ? i : "";
  return {
    admin: e.admin,
    enabled: e.enabled,
    grants: e.grants,
    unplaced: n,
    container: s(r.container) || null,
    objects: Array.isArray(r.objects) ? r.objects.filter((i) => i && typeof i == "object").map((i) => {
      const o = i;
      return { id: s(o.id), key: s(o.key), name: s(o.name), synonyms: Array.isArray(o.synonyms) ? o.synonyms.map(String) : [], project: s(o.project) };
    }).filter((i) => i.project) : []
  };
}
function Ui(t) {
  if (!t || typeof t != "object") return null;
  const e = t;
  if (!Array.isArray(e.grants)) return null;
  const r = (s) => typeof s == "string" && s ? s : null, n = {};
  if (e.object_nodes && typeof e.object_nodes == "object")
    for (const [s, i] of Object.entries(e.object_nodes)) typeof i == "string" && (n[s] = i);
  return {
    admin: e.admin === !0,
    enabled: e.enabled !== !1,
    object_nodes: n,
    grants: e.grants.filter((s) => s && typeof s == "object").map((s) => {
      const i = s;
      return {
        project: r(i.project),
        place: r(i.place),
        places: Array.isArray(i.places) ? i.places.map(String) : null,
        actions: Array.isArray(i.actions) ? i.actions.map(String) : [],
        counterparty: r(i.counterparty)
      };
    })
  };
}
function As(t, e) {
  for (const [r, n] of Object.entries(e))
    Object.defineProperty(t, r, { configurable: !0, enumerable: !0, get: () => n, set: () => {
    } });
}
const Pc = 15e3, Nc = (t, e) => {
  var n;
  const r = (n = globalThis.RbiSyncNet) == null ? void 0 : n.fetch;
  return r ? r(t, e) : fetch(t, e);
};
function $c(t, e, r, n) {
  const s = t(e.url, e.anonKey, {
    // P2-0059 доработка (З2): пропуск — не дольше 15 с (обновление входа на слабой сети), иначе запрос — «нет ответа», а не «без входа»
    accessToken: async () => {
      var l;
      let o;
      const a = new Promise((c, u) => {
        o = setTimeout(() => u(Object.assign(new Error("Нет ответа сервера (вход) за 15 с"), { code: "RBI_REQUEST_TIMEOUT" })), Pc);
      });
      try {
        return ((l = (await Promise.race([n.auth.getSession(), a])).data.session) == null ? void 0 : l.access_token) ?? null;
      } finally {
        clearTimeout(o);
      }
    },
    db: { schema: "quality" },
    global: { headers: { "x-company-id": r }, fetch: Nc }
  }), i = qc(s.storage, r);
  return new Proxy(s, {
    get(o, a, l) {
      return a === "auth" ? n.auth : a === "storage" ? i : a === "from" ? (c) => Dc(o.from(c)) : Reflect.get(o, a, l);
    }
  });
}
function Lc(t) {
  if (!t) return t;
  const e = t.split(",").map((r) => r.trim()).filter(Boolean);
  return (e.includes("core_company_id") ? e : ["core_company_id", ...e]).join(",");
}
const Ts = [
  "core_id",
  "core_inspection_id",
  "core_report_id",
  "core_parent_id",
  "core_construction_object_id",
  "core_building_id",
  "core_floor_id",
  "core_location_node_id",
  "core_contractor_id"
];
function Zr(t) {
  if (Array.isArray(t)) return t.map(Zr);
  if (!t || typeof t != "object") return t;
  const e = t;
  if (!Ts.some((n) => n in e)) return t;
  const r = { ...e };
  for (const n of Ts) delete r[n];
  return r;
}
function Dc(t) {
  return new Proxy(t, {
    get(e, r, n) {
      const s = Reflect.get(e, r, n);
      return typeof s != "function" ? s : r === "upsert" ? (i, o) => s.call(e, Zr(i), o != null && o.onConflict ? { ...o, onConflict: Lc(o.onConflict) } : o) : r === "insert" || r === "update" ? (i, ...o) => s.call(e, Zr(i), ...o) : s;
    }
  });
}
function Uc(t) {
  return t.startsWith("quality-") ? t : "quality-" + t;
}
function xr(t, e) {
  const r = String(e || "").replace(/^\/+/, "");
  return r === t || r.startsWith(t + "/") ? r : t + "/" + r;
}
const Bc = {
  upload: "first",
  update: "first",
  download: "first",
  getPublicUrl: "first",
  createSignedUrl: "first",
  createSignedUploadUrl: "first",
  uploadToSignedUrl: "first",
  info: "first",
  exists: "first",
  list: "first",
  move: "two",
  copy: "two",
  remove: "list",
  createSignedUrls: "list"
};
function qc(t, e) {
  return {
    from(r) {
      const n = t.from(Uc(r));
      return new Proxy(n, {
        get(s, i, o) {
          const a = Reflect.get(s, i, o), l = typeof i == "string" ? Bc[i] : void 0;
          return typeof a != "function" || !l ? typeof a == "function" ? a.bind(s) : a : (...c) => {
            const u = c.slice();
            return l === "list" ? u[0] = Array.isArray(u[0]) ? u[0].map((d) => xr(e, d)) : u[0] : (u[0] = xr(e, u[0] ?? ""), l === "two" && (u[1] = xr(e, u[1]))), a.apply(s, u);
          };
        }
      });
    }
  };
}
const Mc = "rbi:quality-access";
let Rs = !1;
function Fc(t) {
  const e = t.serviceWorker, r = t.platformClient;
  if (!e || !r || Rs) return;
  Rs = !0;
  const n = async () => {
    var i;
    const s = ((i = (await r.auth.getSession()).data.session) == null ? void 0 : i.access_token) ?? null;
    e.controller && e.controller.postMessage({ type: "P2_STORAGE_TOKEN", token: s });
  };
  e.addEventListener("message", (s) => {
    const i = s.data;
    i && i.type === "P2_STORAGE_TOKEN_REQUEST" && n();
  }), r.auth.onAuthStateChange(() => {
    n();
  }), n();
}
const Ar = /* @__PURE__ */ new WeakMap();
async function Hc(t, e) {
  var T;
  if (t.mode === "none" && !e.store.getItem(Te)) return null;
  const r = Oc(t), n = r && t.email ? Re(t.email) : "", s = !!t.offline || !!t.checking;
  if (s && (r || "") + ":" + n != (e.store.getItem(Te) || "") + ":" + (e.store.getItem(gt) || ""))
    return (e.win.RBI || {}).qualitySync || null;
  if (Cc(e.store, r, n))
    return e.reload(), null;
  const i = e.store.getItem(tr);
  if (i && e.dropDatabase) {
    const v = ((T = e.win.APP_CONFIG) == null ? void 0 : T.LOCAL_DB_NAME) || "PLATFORM2_DB";
    e.dropDatabase(v + "_" + i), e.store.removeItem(tr), e.store.getItem(rr) !== null && e.store.getItem(Te) === i && e.store.removeItem(rr);
  }
  const o = e.win.RBI = e.win.RBI || {};
  if (!r || !e.platformClient || !e.cfg || !t.email)
    return o.qualitySync = null, null;
  const a = o.qualitySync;
  if (a && a.companyId === r) {
    const v = s ? void 0 : Ar.get(a);
    v && (Ar.delete(a), v());
    const S = (t.fullName || "").trim() || t.email;
    if (a.engineerName !== S) {
      a.names = xs(e.store, r + ":" + n, S), a.engineerName = S;
      const O = e.win.syncConfig;
      O && (O.engineerName = S, O.previousNames = a.names, e.store.setItem("rbi_sync_config", JSON.stringify(O))), e.win.appSettings && As(e.win.appSettings, { engineerName: S });
    }
    return a;
  }
  Fc(e);
  const l = $c(e.createClient, e.cfg, r, e.platformClient);
  e.win.supabaseClient = l;
  const c = Di + r + ":" + n;
  let u = { access: {}, projects: null };
  try {
    u = { ...u, ...JSON.parse(e.store.getItem(c) || "{}") };
  } catch {
  }
  const d = () => {
    try {
      e.store.setItem(c, JSON.stringify(u));
    } catch {
    }
  };
  let p = null;
  const h = async (v) => {
    const S = v || "*", O = Promise.resolve(l.rpc("my_access", { p_project: v })).catch((B) => ({ data: null, error: B || "network" })).then((B) => (B.error || (u.access[S] = B.data, d()), B));
    if (s && S in u.access) {
      const B = JSON.stringify(u.access[S]);
      return O.then((V) => {
        !V.error && JSON.stringify(V.data) !== B && p && p.projectId === v && M(Er(V.data));
      }), Er(u.access[S]);
    }
    const { data: $, error: C } = await O;
    return Er(C ? S in u.access ? u.access[S] : null : $);
  }, f = await h(null), g = f.projects, m = t.companies.find((v) => v.id === r), y = () => e.listProjects(r).then((v) => (u.projects = v, d(), v), () => u.projects || []), _ = !f.container && !!t.checking && !!u.projects, w = f.container ? null : t.offline || _ ? u.projects || [] : await y(), E = f.container ? [{ id: f.container, name: m ? m.name : "" }] : (w || []).filter((v) => g === null || g.includes(v.id)), R = e.store.getItem(Es + r), A = f.container ? f.container : E.some((v) => v.id === R) ? R : E.length === 1 ? E[0].id : null, I = t.email, j = (t.fullName || "").trim() || I, M = (v) => {
    P.actions = v.actions, P.objects = v.objects, P.contractorKeys = v.contractorKeys, P.construction = v.construction, P.quality = v.quality, P.role = Ic(v.actions);
    const S = v.objects || [];
    e.win.appSettings && As(e.win.appSettings, {
      userRole: P.role,
      cloudStatus: "approved",
      engineerName: j,
      contractorName: v.contractor,
      assignedContractor: v.contractor,
      assignedCounterpartyId: v.contractorId,
      assignedProjects: S,
      assigned_projects: S
    });
    const O = e.win.syncConfig;
    O && (P.role === "manager" || P.role === "director") && O.syncMode !== "full" && (O.syncMode = "full", e.store.setItem("rbi_sync_config", JSON.stringify(O)));
    const $ = e.win.dispatchEvent;
    typeof $ == "function" && $.call(e.win, new Event(Mc));
  }, ve = (v) => {
    const S = e.win.syncConfig = e.win.syncConfig || {};
    S.enabled = !!v, S.engineerName = j, S.authUserId = t.userId || null, S.previousNames = P.names || [], S.projectCode = v || "", S.pinHash = null, S.syncMode || (S.syncMode = "personal"), e.store.setItem("rbi_sync_config", JSON.stringify(S));
  }, P = {
    active: !0,
    companyId: r,
    companyName: m ? m.name : "",
    email: I,
    engineerName: j,
    userId: t.userId || "",
    names: xs(e.store, r + ":" + n, j),
    objects: null,
    projects: E,
    projectId: A,
    role: "guest",
    actions: [],
    async selectProject(v) {
      !E.some((S) => S.id === v) || v === P.projectId || (e.store.setItem(Es + r, v), P.projectId = v, M(await h(v)), e.win.applySyncConnect ? await e.win.applySyncConnect(j, v, null) : ve(v), e.win.initSync && await e.win.initSync());
    }
  };
  return o.qualitySync = P, p = P, _ && Ar.set(P, () => y().then((v) => {
    P.projects = v.filter((S) => g === null || g.includes(S.id));
  })), ve(A), M(await h(A)), e.win.initSync && await e.win.initSync(), e.win.renderSyncUI && e.win.renderSyncUI(), P;
}
const en = (t) => ({ id: t.id, module: t.module, project: t.project, bytes: t.bytes || 0 }), zc = (t, e, r) => t + "|" + e + "|" + r;
function Wc() {
  const t = /* @__PURE__ */ new Map();
  return {
    size: () => t.size,
    async get(e) {
      return t.get(e) || null;
    },
    async put(e) {
      t.set(e.id, e);
    },
    async delete(e) {
      t.delete(e);
    },
    async list(e, r) {
      return [...t.values()].filter((n) => n.slot === e && (!r || n.module === r));
    },
    async meta(e, r) {
      return [...t.values()].filter((n) => n.slot === e && (!r || n.module === r)).map(en);
    }
  };
}
const Kc = "platform2_offline_copy", Vc = 30 * 6e4, Tr = "reads";
function Jc(t) {
  let e = null;
  const r = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map(), s = (c, u, d) => {
    const p = r.get(c);
    p && p.then((h) => {
      d ? h.set(u, d) : h.delete(u);
    });
  }, i = (c) => c.slice(0, c.indexOf("|")), o = () => e || (e = new Promise((c, u) => {
    const d = t.open(Kc, 1);
    d.onupgradeneeded = () => {
      d.result.createObjectStore(Tr, { keyPath: "id" }).createIndex("slot", "slot", { unique: !1 });
    }, d.onsuccess = () => c(d.result), d.onerror = () => {
      e = null, u(d.error);
    };
  })), a = async (c, u) => {
    const d = await o();
    return new Promise((p, h) => {
      const f = u(d.transaction(Tr, c).objectStore(Tr));
      f.onsuccess = () => p(f.result), f.onerror = () => h(f.error);
    });
  }, l = async (c, u) => {
    try {
      const d = await a("readonly", (p) => p.index("slot").getAll(c));
      return u ? d.filter((p) => p.module === u) : d;
    } catch {
      return [];
    }
  };
  return {
    async get(c) {
      try {
        return await a("readonly", (u) => u.get(c)) || null;
      } catch {
        return null;
      }
    },
    async put(c) {
      try {
        await a("readwrite", (u) => u.put(c)), s(c.slot, c.id, en(c));
      } catch {
      }
    },
    async delete(c) {
      try {
        await a("readwrite", (u) => u.delete(c)), s(i(c), c, null);
      } catch {
      }
    },
    list: l,
    async meta(c, u) {
      let d = r.get(c);
      if (d) {
        const [h, f] = await Promise.all([d, a("readonly", (g) => g.index("slot").count(c)).catch(() => -1)]);
        (f >= 0 && f !== h.size || Date.now() - (n.get(c) || 0) > Vc) && (d = void 0);
      }
      d || (d = l(c).then((h) => new Map(h.map((f) => [f.id, en(f)]))), r.set(c, d), n.set(c, Date.now()));
      const p = [...(await d).values()];
      return u ? p.filter((h) => h.module === u) : p;
    }
  };
}
const Os = "Нужен интернет для этого экрана", Cs = "Нет связи с сервером. Попробуйте позже", Gc = "Нужен интернет", Yc = 14, Xc = 8e3, Qc = 6e4, Zc = 24 * 3600 * 1e3;
function Bi(t) {
  const e = t && t.offline;
  return !e || typeof e != "object" ? null : { view: e.view === !0, input: Array.isArray(e.input) ? e.input.map(String) : [], files: e.files === !0 };
}
function eu(t, e, r) {
  return r && !(t && (t.input.includes("*") || t.input.includes(e)));
}
const Is = (t, e) => e - Date.parse(t) > Yc * Zc, Rr = Symbol("timeout"), tu = /нет права|нет доступа/i;
function ru(t) {
  const e = () => t.now ? t.now() : Date.now();
  let r = 0;
  const n = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), i = (u, d, p) => {
    let h = s.get(u);
    if (!h) {
      if (!p) return;
      h = /* @__PURE__ */ new Set(), s.set(u, h);
    }
    const f = h.has(d);
    p ? h.add(d) : h.delete(d), f !== p && a();
  }, o = /* @__PURE__ */ new Set(), a = () => {
    for (const u of o) u();
  }, l = (u, d, p) => {
    let h = n.get(u);
    if (!h) {
      if (p === null) return;
      h = /* @__PURE__ */ new Map(), n.set(u, h);
    }
    const f = h.get(d) ?? null;
    p === null ? h.delete(d) : h.set(d, p), f !== p && a();
  };
  async function c(u, d, p, h = !1) {
    const f = await t.store.get(p);
    return f ? (h || (l(u, d, f.at), i(u, d, !1)), { ok: !0, value: f.data, meta: { from: "copy", at: f.at, stale: Is(f.at, e()) } }) : (h || i(u, d, !0), { ok: !1, message: Os, offline: !0 });
  }
  return {
    async read(u, d, p, h = {}) {
      const f = t.slot();
      if (!f) {
        const R = await p();
        return R.ok ? { ok: !0, value: R.value, meta: null } : R;
      }
      const g = zc(f, u, d);
      if (h.allowed === !1) {
        if (await t.store.delete(g), t.offline()) return { ok: !1, message: Os, offline: !0 };
        const R = await p();
        return R.ok ? { ok: !0, value: R.value, meta: null } : R;
      }
      if (t.offline() || e() < r) return c(u, d, g, h.quiet);
      let m;
      const y = await Promise.race([
        p().catch(() => ({ ok: !1, message: Cs })),
        new Promise((R) => {
          m = setTimeout(() => R(Rr), t.waitMs ?? Xc);
        })
      ]);
      if (clearTimeout(m), y === Rr && (r = e() + Qc), y === Rr || !y.ok && y.message === Cs) return c(u, d, g, h.quiet);
      if (r = 0, !y.ok)
        return tu.test(y.message) && (await t.store.delete(g), l(u, d, null)), y;
      const _ = new Date(e()).toISOString();
      let w = 0;
      try {
        w = JSON.stringify(y.value ?? null).length;
      } catch {
      }
      const E = Array.isArray(y.value) && y.value.length === 0;
      return w && !(E && h.keepEmpty === !1) && await t.store.put({ id: g, slot: f, module: u, key: d, project: h.project ?? null, at: _, bytes: w, data: y.value }), l(u, d, null), i(u, d, !1), { ok: !0, value: y.value, meta: { from: "server", at: _, stale: !1 } };
    },
    async pruneProjects(u, d) {
      const p = t.slot();
      if (!p) return 0;
      const h = (await t.store.meta(p, u)).filter((f) => f.project !== null && !d.includes(f.project));
      for (const f of h) await t.store.delete(f.id);
      return h.length;
    },
    status(u) {
      var f;
      const d = n.get(u), p = ((f = s.get(u)) == null ? void 0 : f.size) || 0;
      if ((!d || !d.size) && !p) return null;
      const h = d && d.size ? [...d.values()].sort()[0] : null;
      return { at: h, stale: h !== null && Is(h, e()), missed: p };
    },
    resetMissed(u) {
      var d;
      (d = s.get(u)) != null && d.size && (s.delete(u), a());
    },
    resolveMiss(u, d) {
      i(u, d, !1);
    },
    missedKeys(u) {
      return [...s.get(u) || []];
    },
    subscribe(u) {
      return o.add(u), () => {
        o.delete(u);
      };
    },
    serverSilent: () => e() < r,
    async size(u, d) {
      const p = t.slot();
      return p ? (await t.store.meta(p, u)).filter((h) => d === void 0 || h.project === d).reduce((h, f) => h + (f.bytes || 0), 0) : 0;
    },
    async clear(u) {
      const d = t.slot();
      if (!d) return 0;
      const p = await t.store.meta(d, u);
      for (const h of p) await t.store.delete(h.id);
      return n.clear(), s.clear(), a(), p.length;
    }
  };
}
const wn = ["mine30", "all30", "all", "none"], qi = {
  mine30: "Мои объекты за 30 дней",
  all30: "Все за 30 дней",
  all: "Все",
  none: "Не скачивать заранее"
}, Mi = /* @__PURE__ */ new Set(["engineer", "contractor"]), nu = 30, su = 24 * 3600 * 1e3;
function tn(t) {
  return Mi.has(t) ? "mine30" : "none";
}
function rn(t) {
  return Mi.has(t) ? "all" : "none";
}
function iu(t, e) {
  return wn.includes(t) ? t : tn(e);
}
const Or = (t) => {
  const e = Date.parse(String(t.date || ""));
  return Number.isFinite(e) ? e : 0;
}, ou = (t) => String(t.project_canonical_key || t.project || t.object || t.projectCode || "");
function au(t, e, r, n = nu) {
  const s = /* @__PURE__ */ new Map(), i = r - n * su, o = t.filter((l) => l && e(l));
  for (const l of o) Or(l) >= i && s.set(l.id, "all");
  const a = /* @__PURE__ */ new Map();
  for (const l of o) {
    const c = ou(l) + "|" + String(l.template || "");
    a.has(c) || a.set(c, []), a.get(c).push(l);
  }
  for (const l of a.values()) {
    l.sort((u, d) => Or(u) - Or(d));
    const c = /* @__PURE__ */ new Map();
    for (const u of l) for (const [d, p] of Object.entries(u.state || {})) c.set(d, { st: p, r: u });
    for (const [u, { st: d, r: p }] of c) {
      if (d !== "fail" || s.get(p.id) === "all") continue;
      const h = s.get(p.id);
      s.set(p.id, [...Array.isArray(h) ? h : [], u]);
    }
  }
  return s;
}
const vn = () => typeof window > "u" ? void 0 : window.RBI;
function de() {
  var e, r, n;
  const t = (n = (r = (e = vn()) == null ? void 0 : e.platform2) == null ? void 0 : r.getState) == null ? void 0 : n.call(r);
  return t && t.mode === "email" && t.email && t.companyId ? t.companyId + ":" + Re(t.email) : null;
}
function bn() {
  var e, r, n;
  const t = (n = (r = (e = vn()) == null ? void 0 : e.platform2) == null ? void 0 : r.getState) == null ? void 0 : n.call(r);
  return !!t && t.mode === "email" && (!!t.offline || typeof navigator < "u" && navigator.onLine === !1);
}
const Dt = "__platform2OfflineReader";
function lu(t) {
  if (typeof window > "u") return;
  const e = window;
  (e.RBI = e.RBI || {}).offlineCopy = t;
}
function fr() {
  const t = globalThis;
  if (!t[Dt]) {
    const e = typeof indexedDB < "u" ? Jc(indexedDB) : Wc();
    t[Dt] = ru({ store: e, slot: de, offline: bn }), lu(t[Dt]);
  }
  return t[Dt];
}
function cu(t, e, r, n) {
  return fr().read(t, e, r, n);
}
function uu(t) {
  var r;
  const e = (r = vn()) == null ? void 0 : r.moduleLoader;
  return Bi(e && typeof e.getById == "function" ? e.getById(t) : null);
}
const du = /* @__PURE__ */ new Set(["pf_my_permissions", "pf_my_area", "pf_my_admin_companies", "pf_permission_catalog", "pf_my_context"]), nn = /* @__PURE__ */ new Map(), hu = /* @__PURE__ */ new Map(), sn = /* @__PURE__ */ new Set(), fu = ["p_import", "p_position", "p_location", "p_act", "p_revision", "p_estimate", "p_object", "p_parent"], pu = ["id", "import_id", "position_id", "location_id", "act_id", "estimate_id", "revision_id"];
function gu(t) {
  const e = t || {};
  if (typeof e.p_project == "string") return e.p_project;
  for (const r of fu) {
    const n = e[r];
    if (typeof n == "string" && nn.has(n)) return nn.get(n);
  }
  return null;
}
function mu(t, e) {
  for (const r of Array.isArray(e) ? e : [e]) {
    if (!r || typeof r != "object") continue;
    const n = r;
    if (typeof n.id == "string" && typeof n.path == "string" && typeof n.node_type == "string" && (hu.set(n.id, n.path), Number(n.child_count) === 0 ? sn.add(n.id) : sn.delete(n.id)), t) for (const s of pu) {
      const i = n[s];
      typeof i == "string" && nn.set(i, t);
    }
  }
}
const yu = (t) => JSON.stringify(t, (e, r) => r && typeof r == "object" && !Array.isArray(r) ? Object.fromEntries(Object.keys(r).sort().map((n) => [n, r[n]])) : r);
async function js(t, e, r, n, s, i, o) {
  if (!e.has(r)) return bn() ? { ok: !1, message: Gc } : s();
  const a = gu(n), l = du.has(r) || !!(i && i.has(r)), c = r + ":" + yu(n || {}), u = await cu(t, c, s, { project: a, quiet: l });
  if (u.ok)
    return mu(a, u.value), u;
  if (u.offline && o) {
    const d = await o();
    if (d && d.ok)
      return fr().resolveMiss(t, c), d;
  }
  return u;
}
function _u(t) {
  return sn.has(t);
}
const on = "platform2_offline_keep:", wu = "platform2_offline_prefetch:", Fi = () => {
  try {
    return typeof localStorage > "u" ? null : localStorage;
  } catch {
    return null;
  }
}, it = (t, e) => {
  var r;
  try {
    return JSON.parse(((r = Fi()) == null ? void 0 : r.getItem(t)) || "null") ?? e;
  } catch {
    return e;
  }
}, Hi = (t, e) => {
  var r;
  try {
    (r = Fi()) == null || r.setItem(t, JSON.stringify(e));
  } catch {
  }
};
function kn(t) {
  var n;
  const e = de();
  if (!e) return !1;
  const r = it(on + e, {})[t];
  return typeof r == "boolean" ? r : !!((n = uu(t)) != null && n.view);
}
function Ps(t, e) {
  const r = de();
  r && Hi(on + r, { ...it(on + r, {}), [t]: e });
}
function vu(t) {
  const e = de();
  return e && it(wu + e, {})[t] || null;
}
const nr = "platform2_offline_files:";
function an(t = "quality") {
  const e = de(), r = e ? it(nr + e, {})[t] : void 0;
  return wn.includes(r) ? r : null;
}
function bu(t, e) {
  const r = de();
  if (!r) return;
  const n = it(nr + r, {});
  e ? n[t] = e : delete n[t], Hi(nr + r, n);
}
function Sn() {
  const t = typeof window > "u" ? void 0 : window.RBI;
  return t && t.qualitySync && t.qualitySync.role || "guest";
}
function ln() {
  return kn("quality") ? iu(an("quality"), Sn()) : "none";
}
function zi() {
  if (!kn("knowledge")) return "none";
  const t = de(), e = t ? it(nr + t, {}).knowledge : void 0;
  return e === "all" || e === "none" ? e : rn(Sn());
}
function ku(t) {
  var n, s;
  const e = typeof window > "u" || (s = (n = window.RBI) == null ? void 0 : n.services) == null ? void 0 : s.permissions, r = e && typeof e.getAssignedProjects == "function" ? e.getAssignedProjects() || [] : [];
  return !r.length || !!(e && typeof e.isRecordInAssignedProjects == "function" && e.isRecordInAssignedProjects(t, r));
}
function Su() {
  if (typeof window > "u") return;
  const t = window;
  (t.RBI = t.RBI || {}).offlineFiles = { scope: ln, docs: zi, select: (e) => au(e, ku, Date.now()) };
}
Su();
function Ns(t) {
  const e = t && t.message || "";
  return /[А-Яа-яЁё]/.test(e) ? e : /cannot assign a role to yourself/i.test(e) ? "Нельзя назначить роль самому себе" : /failed to fetch|network|load failed/i.test(e) ? "Нет связи с сервером. Попробуйте позже" : t && t.code === "42501" || /forbidden|permission denied/i.test(e) ? "Нет права на это действие" : "Не удалось выполнить. Попробуйте ещё раз";
}
const Eu = "core-place-plans", xu = 50 * 1024 * 1024;
function Au(t) {
  const e = String(t.name || "");
  return t.type === "application/pdf" || /\.pdf$/i.test(e) ? t.size ? t.size > xu ? { ok: !1, message: `«${e}» больше 50 МБ — уменьшите PDF.` } : { ok: !0 } : { ok: !1, message: `«${e}» — пустой файл.` } : { ok: !1, message: `«${e || "файл"}» — не PDF. План загружается файлом PDF.` };
}
function Tu(t, e, r, n) {
  return `${t}/${e}/${r}/${n}.pdf`;
}
async function Ru(t, e, r) {
  var s;
  const n = st();
  if (!n) return { ok: !1, message: "Нет входа" };
  if (typeof navigator < "u" && navigator.onLine === !1) return { ok: !1, message: "Нужен интернет" };
  try {
    const { error: i } = await n.storage.from(t).upload(e, r, { upsert: !1, contentType: "application/pdf" });
    if (i && !/exists|duplicate/i.test(i.message || ""))
      return { ok: !1, message: /row-level|403|unauthor|policy/i.test(i.message || "") ? "Нет права загружать планы этого проекта" : i.message || "Файл не загружен" };
    const o = ((s = n.storage.from(t).getPublicUrl(e).data) == null ? void 0 : s.publicUrl) || "";
    return o ? { ok: !0, url: o } : { ok: !1, message: "Не получена ссылка на файл" };
  } catch (i) {
    return { ok: !1, message: i instanceof Error ? i.message : "Файл не загружен" };
  }
}
const $s = /* @__PURE__ */ new Set(["pf_my_company_access", "pf_company_projects", "pf_list_locations", "pf_list_units", "pf_project_catalog", "pf_company_divisions", "pf_project_dicts", "pf_project_places", "pf_location_path"]), Ls = /* @__PURE__ */ new Set(["pf_my_company_access"]);
function Cr(t) {
  const e = t || {}, r = (n) => typeof e[n] == "string" && e[n] ? String(e[n]) : null;
  return { id: r("id"), versionNo: typeof e.version_no == "number" ? e.version_no : null, previousId: r("previous") };
}
function Ou() {
  const t = globalThis.crypto;
  return t && t.randomUUID ? t.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (e) => {
    const r = Math.random() * 16 | 0;
    return (e === "x" ? r : r & 3 | 8).toString(16);
  });
}
function Cu(t) {
  const e = t.created || {}, r = (s) => typeof s == "number" ? s : Number(s) || 0, n = (s) => Array.isArray(s) ? s : [];
  return {
    ok: t.ok === !0,
    dryRun: t.dry_run === !0,
    repeat: t.repeat === !0,
    created: { objects: r(e.objects), sections: r(e.sections), floors: r(e.floors), apartments: r(e.apartments) },
    existingRows: n(t.existing_rows),
    differs: n(t.differs),
    errors: n(t.errors),
    roots: n(t.roots)
  };
}
function Iu() {
  const t = st();
  if (!t) return null;
  async function e(s, i) {
    const o = await r(s, i || {});
    return o.ok && Array.isArray(o.value) ? o.value : [];
  }
  const r = (s, i) => js("company", $s, s, i, () => n(s, i), Ls);
  async function n(s, i) {
    try {
      const { data: o, error: a } = await t.rpc(s, i);
      return a ? { ok: !1, message: Ns(a) } : { ok: !0, value: o ?? null };
    } catch (o) {
      return { ok: !1, message: Ns({ message: o instanceof Error ? o.message : "" }) };
    }
  }
  return {
    myAccess: () => e("pf_my_company_access"),
    listProjects: (s) => e("pf_company_projects", { p_company: s }),
    createProject: (s, i, o) => r("pf_create_project", { p_company: s, p_name: i, p_code: o || null }),
    updateProject: (s, i, o, a) => r("pf_update_project", { p_project: s, p_name: i, p_code: o || null, p_archived: a }),
    // P2-0060: без сети у места без вложенных (по дереву в копии) вложенных нет — пусто, без «Нужен интернет»
    listLocations: async (s, i) => {
      const o = await js(
        "company",
        $s,
        "pf_list_locations",
        { p_project: s, p_parent: i },
        () => n("pf_list_locations", { p_project: s, p_parent: i }),
        Ls,
        i ? async () => _u(i) ? { ok: !0, value: [] } : null : void 0
      );
      return o.ok && Array.isArray(o.value) ? o.value : [];
    },
    addLocation: (s, i, o, a) => r("pf_add_location", { p_project: s, p_parent: i, p_type: o, p_name: a }),
    renameLocation: (s, i) => r("pf_rename_location", { p_location: s, p_name: i }),
    deleteLocation: (s, i) => r("pf_delete_location", { p_location: s, p_cascade: i }),
    locationsFromQuality: async (s) => {
      const i = await r("pf_locations_from_quality", { p_project: s });
      return i.ok && i.value === !0;
    },
    generateBuilding: (s) => r("pf_generate_building", {
      p_project: s.projectId,
      p_parent: s.parentId,
      p_name: s.name,
      p_sections: s.sections,
      p_floors: s.floors,
      p_apartments_per_floor: s.apartmentsPerFloor,
      p_first_floor: s.firstFloor
    }),
    listUnits: (s) => e("pf_list_units", { p_company: s }),
    projectCatalog: (s) => e("pf_project_catalog", { p_company: s }),
    saveProject: (s, i, o) => r("pf_save_project", { p_company: s, p_id: i, p_card: o }),
    listDivisions: (s) => e("pf_company_divisions", { p_company: s }),
    saveDivision: (s, i, o, a, l) => r("pf_save_division", { p_company: s, p_id: i, p_name: o, p_head_user: a, p_archived: l }),
    dicts: async () => {
      const s = await r("pf_project_dicts", {}), i = s.ok && s.value ? s.value : {};
      return { stages: i.stages || [], objectKinds: i.object_kinds || [], roles: i.roles || [] };
    },
    projectPlaces: (s, i) => e("pf_project_places", { p_project: s, p_parent: i }),
    savePlace: (s, i, o, a, l, c, u, d) => r("pf_save_place", {
      p_project: s,
      p_id: i,
      p_parent: o,
      p_type: a,
      p_name: l,
      p_object_kind: c ?? null,
      p_build_no: u ?? null,
      p_bti_no: d ?? null
    }),
    removePlace: (s) => r("pf_remove_place", { p_location: s }),
    fillObject: (s) => r("pf_fill_object", {
      p_object: s.objectId,
      p_sections: s.sections,
      p_floors: s.floors,
      p_apartments_per_floor: s.apartmentsPerFloor,
      p_first_floor: s.firstFloor,
      p_numbering: s.numbering,
      p_start_no: s.startNo,
      p_basement: s.basement,
      p_roof: s.roof
    }),
    addFloors: (s, i, o, a) => r("pf_add_floors", { p_sections: s, p_from: i, p_to: o, p_apartments_per_floor: a }),
    copyPlace: (s, i, o, a) => r("pf_copy_place", a ? { p_source: s, p_new_id: i, p_name: o, p_target_parent: a } : { p_source: s, p_new_id: i, p_name: o }),
    movePlace: async (s, i, o) => {
      const a = await r(
        "pf_move_place",
        { p_location: s, p_new_parent: i, p_before: o }
      );
      if (!a.ok) return a;
      const l = a.value || {};
      return { ok: !0, value: { changed: l.changed === !0, oldParentId: l.old_parent ?? null, oldBeforeId: l.old_before ?? null } };
    },
    restorePlace: (s) => r("pf_restore_place", { p_location: s }),
    nextBuildNo: (s) => r("pf_next_build_no", { p_location: s }),
    importPlaces: async (s, i, o, a) => {
      const l = await r("pf_import_places", { p_project: s, p_batch: i, p_rows: o, p_dry_run: a });
      return l.ok ? { ok: !0, value: Cu(l.value || {}) } : l;
    },
    importUndo: (s) => r("pf_import_undo", { p_batch: s }),
    savePlaceInfo: (s, i, o) => r("pf_save_place_info", { p_location: s, p_area: i, p_rooms: o }),
    placePlans: async (s) => {
      const i = await r("pf_place_plans", { p_project: s });
      return i.ok ? { ok: !0, value: Array.isArray(i.value) ? i.value : [] } : i;
    },
    uploadPlacePlan: async (s, i, o) => {
      const a = Au(i);
      if (!a.ok) return a;
      const l = o || Ou(), c = await Ru(Eu, Tu(s.companyId, s.projectId, s.id, l), i);
      if (!c.ok) return c;
      const u = await r(
        "pf_add_place_plan",
        { p_location: s.id, p_id: l, p_url: c.url, p_name: i.name || "План.pdf", p_size: i.size }
      );
      return u.ok ? { ok: !0, value: Cr(u.value) } : u;
    },
    setPlacePlan: async (s) => {
      const i = await r("pf_set_place_plan", { p_id: s });
      return i.ok ? { ok: !0, value: Cr(i.value) } : i;
    },
    removePlacePlan: async (s) => {
      const i = await r("pf_remove_place_plan", { p_location: s });
      return i.ok ? { ok: !0, value: Cr(i.value) } : i;
    },
    placePins: async (s) => {
      const i = await r("pf_place_pins", { p_location: s });
      return i.ok && typeof i.value == "number" ? i.value : 0;
    },
    addUnit: (s, i, o) => r("pf_add_unit", { p_company: s, p_code: i, p_name: o }),
    deleteUnit: (s) => r("pf_delete_unit", { p_unit: s })
  };
}
const Ut = "platform2_entry", Ir = "platform2_company", cn = "platform2_device_access_", ju = 14, Pu = 24 * 3600 * 1e3, Nu = 5e3, $u = 45e3;
function zt(t, e) {
  try {
    const r = JSON.parse(Et(t, cn + Re(e)) || "null");
    return r && typeof r.at == "string" ? r : null;
  } catch {
    return null;
  }
}
function Wi(t, e) {
  const r = t ? Date.parse(t.at) : NaN, n = e ? e * 1e3 : NaN, s = Math.max(Number.isNaN(r) ? -1 / 0 : r, Number.isNaN(n) ? -1 / 0 : n);
  return Number.isFinite(s) ? s : null;
}
function Ds(t) {
  return !!t.error && (!t.status || t.status >= 500);
}
function Ki(t, e) {
  return t === null || e - t > ju * Pu;
}
function Lu(t, e, r) {
  return !!t && !Ki(Wi(t, e), r);
}
const Ie = { mode: "none", email: null, isPlatformAdmin: !1, companies: [], companyId: null };
function Et(t, e) {
  try {
    return t ? t.getItem(e) : null;
  } catch {
    return null;
  }
}
function ke(t, e, r) {
  try {
    if (!t) return;
    r === null ? t.removeItem(e) : t.setItem(e, r);
  } catch {
  }
}
function jr(t) {
  const e = t && typeof t == "object" ? t : {}, r = Array.isArray(e.companies) ? e.companies : [];
  return {
    isPlatformAdmin: e.is_platform_admin === !0,
    companies: r.map((n) => ({
      id: String(n.id),
      name: String(n.name || ""),
      is_test: n.is_test === !0,
      roles: Array.isArray(n.roles) ? n.roles.map(String) : [],
      modules: Array.isArray(n.modules) ? n.modules.map(String) : [],
      can_manage_company: n.can_manage_company === !0
    }))
  };
}
function Pr(t) {
  const e = t && typeof t == "object" ? t : {};
  return {
    fullName: typeof e.full_name == "string" && e.full_name ? e.full_name : null,
    mustChangePassword: e.must_change_password === !0,
    userId: typeof e.user_id == "string" ? e.user_id : null
  };
}
function Du(t) {
  const e = t.companies.find((n) => n.id === t.companyId) || null, r = {
    company: t.mode === "email" && t.companies.some((n) => n.can_manage_company),
    platformAdmin: t.mode === "email" && t.isPlatformAdmin
  };
  if (t.mode === "email" && e) for (const n of e.modules) r[n] = !0;
  return r;
}
const Uu = "rbi_last_module_hash";
function Bu(t, e) {
  const r = (n) => JSON.stringify([
    n.mode,
    n.email,
    n.isPlatformAdmin,
    n.companyId,
    n.companies,
    n.fullName || null,
    !!n.mustChangePassword,
    n.userId || null,
    n.loginReason || null
  ]);
  return r(t) !== r(e);
}
function qu(t, e) {
  return !t || Bu(t, e) || !!t.offline && !e.offline;
}
function un(t) {
  const e = String(t || "");
  return /^#\/planfact(\/|$)/.test(e) ? "planfact" : /^#\/quality\/settings(\/|$)/.test(e) ? null : /^#\/quality(\/|$)/.test(e) ? "quality" : /^#\/construction(-v2)?(\/|$)/.test(e) ? "construction" : null;
}
function Mu(t, e, r) {
  const n = un(r);
  return !!t && !!n && t[n] === !0 && e[n] !== !0;
}
const ce = "#/welcome", Vi = "platform2_welcome_seen_", Ye = { quality: "#/quality/audit", construction: "#/construction/defects", planfact: "#/planfact" }, Fu = ["quality", "construction", "planfact"];
function Hu(t) {
  const e = String(t.lastHash || "");
  if (t.mode === "none") return null;
  if (t.mode !== "email") return (un(e) ? e : "") || Ye.quality;
  if (!t.welcomeSeen) return ce;
  const r = t.access, n = un(e);
  if (n && r[n] === !0) return e;
  const s = Fu.filter((o) => r[o] === !0);
  if (!s.length) return "#/settings";
  if (s.length === 1) return Ye[s[0]];
  if (r.company || r.platformAdmin) return ce;
  const i = t.actions || {};
  return r.quality && (i.quality || []).includes("quality.inspections.create") ? Ye.quality : r.construction && (i.construction || []).some((o) => !/\.view$/.test(o)) ? Ye.construction : r.planfact ? Ye.planfact : ce;
}
function zu(t, e, r) {
  var s;
  const n = { quality: /* @__PURE__ */ new Set(), construction: /* @__PURE__ */ new Set() };
  if (e && r)
    try {
      const i = JSON.parse(Et(t, Di + e + ":" + Re(r)) || "{}");
      for (const o of Object.values(i.access || {}))
        for (const a of ["quality", "construction"]) {
          const l = (s = o == null ? void 0 : o[a]) == null ? void 0 : s.grants;
          if (Array.isArray(l)) for (const c of l) for (const u of c && Array.isArray(c.actions) ? c.actions : []) n[a].add(String(u));
        }
    } catch {
    }
  return { quality: [...n.quality], construction: [...n.construction] };
}
function Ji(t, e) {
  return !!e && Et(t, Vi + Re(e)) === "1";
}
function dn(t, e) {
  e && ke(t, Vi + Re(e), "1");
}
function Wu(t) {
  let e = { ...Ie };
  const r = /* @__PURE__ */ new Set(), n = () => {
    for (const f of r) f(e);
  }, s = () => t.now ? t.now() : Date.now();
  function i(f, g, m) {
    var w;
    const y = Et(t.storage, Ir), _ = g.companies.some((E) => E.id === y) ? y : ((w = g.companies.find((E) => E.modules.length > 0) || g.companies[0] || null) == null ? void 0 : w.id) || null;
    return { mode: "email", email: f, isPlatformAdmin: g.isPlatformAdmin, companies: g.companies, companyId: _, ...m };
  }
  function o(f, g) {
    const m = zt(t.storage, f), y = Wi(m, g);
    return { ...m ? i(f, jr(m.platform), Pr(m.profile)) : i(f, { isPlatformAdmin: !1, companies: [] }, { fullName: null, mustChangePassword: !1, userId: null }), offline: !0, confirmedAt: y === null ? null : new Date(y).toISOString() };
  }
  let a = null, l = 0;
  function c() {
    a && (a.stop(), a = null);
  }
  async function u(f, g) {
    if (!t.rpc) return i(f, { isPlatformAdmin: !1, companies: [] }, { fullName: null, mustChangePassword: !1, userId: null });
    const m = t.rpc, y = l;
    if (a && (a.email !== f || a.epoch !== y) && c(), !a) {
      const j = typeof AbortController == "function" ? new AbortController() : null;
      let M;
      const ve = { data: null, error: "timeout", status: 0 }, P = new Promise((S) => {
        M = setTimeout(() => {
          j == null || j.abort(), S([ve, ve]);
        }, t.askLimitMs ?? $u);
      }), T = Promise.all([m("pf_my_platform", void 0, j == null ? void 0 : j.signal), m("pf_my_profile", void 0, j == null ? void 0 : j.signal)].map((S) => S.catch((O) => ({ data: null, error: O || "network", status: 0 })))), v = { email: f, epoch: y, p: Promise.race([T, P]), stop: () => {
        clearTimeout(M), j == null || j.abort();
      } };
      v.p.finally(() => {
        clearTimeout(M), a === v && (a = null);
      }), a = v;
    }
    const _ = a.p;
    let w;
    const E = { data: null, error: "timeout", status: 0 }, [R, A] = zt(t.storage, f) ? await Promise.race([_, new Promise((j) => {
      w = setTimeout(() => j([E, E]), t.serverWaitMs ?? Nu);
    })]) : await _;
    if (clearTimeout(w), y !== l) return null;
    if (Ds(R) || Ds(A)) return o(f, g);
    if (R.error || A.error)
      return i(
        f,
        R.error ? { isPlatformAdmin: !1, companies: [] } : jr(R.data),
        A.error ? { fullName: null, mustChangePassword: !1, userId: null } : Pr(A.data)
      );
    const I = new Date(s()).toISOString();
    return ke(t.storage, cn + Re(f), JSON.stringify({ at: I, platform: R.data, profile: A.data })), { ...i(f, jr(R.data), Pr(A.data)), confirmedAt: I };
  }
  async function d() {
    return t.auth ? t.auth.getSessionState ? t.auth.getSessionState() : { email: await t.auth.getEmail(), offline: !1, issuedAt: null } : { email: null, offline: !1, issuedAt: null };
  }
  let p = !1;
  async function h() {
    if (!p) {
      p = !0;
      const m = t.storedSession ? t.storedSession() : null, y = m && m.email ? zt(t.storage, m.email) : null;
      m && m.email && Lu(y, m.issuedAt, s()) && (e = { ...o(m.email, m.issuedAt), offline: !1, checking: !0 }, n());
    }
    const f = l, g = await d();
    if (f !== l) return e;
    if (g.email) {
      const m = g.offline ? o(g.email, g.issuedAt) : await u(g.email, g.issuedAt);
      if (!m || f !== l) return e;
      e = m, g.offline && Ki(e.confirmedAt ? Date.parse(e.confirmedAt) : null, s()) && (e = { ...Ie, offline: !0, loginReason: "stale" }), ke(t.storage, Ut, null);
    } else t.pinActive() ? e = { ...Ie, mode: "pin" } : Et(t.storage, Ut) === "demo" ? e = { ...Ie, mode: "demo" } : e = { ...Ie };
    return n(), e;
  }
  return {
    boot: h,
    refresh: h,
    async signIn(f, g) {
      if (!t.auth) return { ok: !1, message: "Сервер не настроен — вход недоступен" };
      if (!f.trim() || !g) return { ok: !1, message: "Введите почту и пароль" };
      const m = await t.auth.signIn(f, g);
      return m.ok && (l++, c(), await h()), m;
    },
    async signOut() {
      l++, c(), e.email && ke(t.storage, cn + Re(e.email), null), t.auth && await t.auth.signOut(), ke(t.storage, Ut, null), ke(t.storage, Ir, null), e = { ...Ie }, n();
    },
    async changePassword(f) {
      if (!t.auth || !t.auth.changePassword || !t.rpc) return { ok: !1, message: "Сервер не настроен" };
      const g = await t.auth.changePassword(f);
      if (!g.ok) return g;
      const { error: m } = await t.rpc("pf_password_changed");
      return m ? { ok: !1, message: "Пароль сменён, но сервер не принял отметку — войдите заново новым паролем" } : (await h(), { ok: !0 });
    },
    async setFullName(f) {
      if (!t.rpc || e.mode !== "email" || !e.userId) return { ok: !1, message: "Сервер не настроен" };
      const { error: g } = await t.rpc("pf_set_full_name", { p_user: e.userId, p_full_name: f });
      if (g) {
        const m = String(g.message || "");
        return { ok: !1, message: /[А-Яа-яЁё]/.test(m) ? m : "Не удалось сохранить ФИО. Попробуйте ещё раз" };
      }
      return await h(), { ok: !0 };
    },
    chooseDemo() {
      ke(t.storage, Ut, "demo"), e = { ...Ie, mode: "demo" }, n();
    },
    setCompany(f) {
      e.mode !== "email" || !e.companies.some((g) => g.id === f) || e.companyId === f || (ke(t.storage, Ir, f), e = { ...e, companyId: f }, n());
    },
    getState: () => e,
    access: () => Du(e),
    subscribe(f) {
      return r.add(f), () => {
        r.delete(f);
      };
    }
  };
}
const Ku = "#/settings/company", Vu = "#/settings/my/help", se = "p2-welcome-on", Ju = ["quality", "construction", "planfact", "company"];
function Gu(t, e) {
  const r = [];
  for (const n of Ju) {
    if (t[n] !== !0) continue;
    const s = e.find((i) => i.id === n);
    !s || typeof s.title != "string" || typeof s.summary != "string" || !s.summary || r.push({ id: n, title: s.title, summary: s.summary, path: n === "company" ? Ku : Ye[n] });
  }
  return r;
}
const Yu = {
  quality: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>',
  construction: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>',
  planfact: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  company: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5"/><path d="M9 10h.01M12 10h.01M15 10h.01"/>'
}, pr = (t, e) => `<svg viewBox="0 0 24 24" width="${e}" height="${e}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t}</svg>`, Xu = pr('<path d="M9 6l6 6-6 6"/>', 20), Qu = pr('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>', 18), Zu = pr('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 18), ed = `
body.${se} #main-bottom-nav,body.${se} #header-dashboard,body.${se} #header-data-block,
body.${se} #header-checklist-container,body.${se} #construction-warning-banner{display:none!important}
body.${se} .app-sidebar-item.active:not(:hover){color:var(--text-muted);background:transparent}
@media (min-width:1280px){body.${se}{--desk-nav2:0px;--desk-chrome:var(--desk-rail)}body.${se} #app-nav2{visibility:hidden;overflow:hidden}}
.p2w{box-sizing:border-box;width:100%;max-width:880px;margin:0 auto;padding:20px 16px 40px;color:var(--text-main)}
.p2w *{box-sizing:border-box}
.p2w-eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-text);display:flex;align-items:center;gap:10px;min-width:0}
.p2w-eyebrow::before{content:'';flex:none;width:28px;height:2px;border-radius:2px;background:var(--accent);transform-origin:left}
.p2w-h{font-size:26px;line-height:1.15;font-weight:700;margin:12px 0 8px;letter-spacing:-.01em;text-wrap:balance;overflow-wrap:anywhere}
.p2w-p{font-size:15px;line-height:1.5;color:var(--text-muted);margin:0 0 20px;max-width:60ch}
.p2w-grid{display:grid;gap:10px;grid-template-columns:minmax(0,1fr)}
.p2w-tile{display:flex;align-items:center;gap:14px;text-align:left;width:100%;min-height:76px;padding:14px;border-radius:16px;border:1px solid var(--card-border);
  background:var(--card-bg);box-shadow:var(--shadow-1);color:inherit;cursor:pointer;font:inherit;transition:border-color .15s,transform .15s,box-shadow .15s}
.p2w-tile:hover{border-color:var(--accent);transform:translateY(-1px);box-shadow:var(--shadow-2)}
.p2w-tile:focus-visible,.p2w-link:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.p2w-ico{flex:none;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--sel-bg);color:var(--accent-text)}
.p2w-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.p2w-t{font-size:16px;font-weight:700}
.p2w-d{font-size:14px;line-height:1.4;color:var(--text-muted)}
.p2w-go{flex:none;color:var(--text-muted);display:flex}
.p2w-foot{margin-top:22px;padding-top:16px;border-top:1px solid var(--card-border);display:flex;flex-wrap:wrap;gap:0 24px}
.p2w-link{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-size:15px;font-weight:600;color:var(--accent-text);text-decoration:none;background:none;border:0;padding:0;cursor:pointer;font-family:inherit}
@media (min-width:768px){.p2w{padding:64px 32px}.p2w-h{font-size:34px}.p2w-p{font-size:16px;margin-bottom:32px}
  .p2w-grid{gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}.p2w-grid.p2w-one{grid-template-columns:minmax(0,420px)}
  .p2w-tile{min-height:96px;padding:20px}.p2w-ico{width:52px;height:52px}.p2w-ico svg{width:26px;height:26px}.p2w-t{font-size:17px}
  .p2w-foot{margin-top:32px;padding-top:20px;gap:10px 24px}}
.p2w-anim .p2w-eyebrow,.p2w-anim .p2w-h,.p2w-anim .p2w-p,.p2w-anim .p2w-tile,.p2w-anim .p2w-foot{opacity:0;animation:p2w-in .5s cubic-bezier(.2,.7,.2,1) forwards}
.p2w-anim .p2w-eyebrow::before{transform:scaleX(0);animation:p2w-line .5s .1s ease-out forwards}
.p2w-anim .p2w-h{animation-delay:.08s}.p2w-anim .p2w-p{animation-delay:.18s}.p2w-anim .p2w-foot{animation-delay:.75s}
@keyframes p2w-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes p2w-line{to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.p2w-anim *,.p2w-anim .p2w-eyebrow::before{animation:none!important;opacity:1!important;transform:none!important}}`, Ve = (t) => t.replace(/[&<>"']/g, (e) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[e]);
function td(t, e) {
  const r = [e.company, e.role].filter(Boolean).join(" · "), n = e.tiles.map((s, i) => `<button type="button" class="p2w-tile" data-testid="p2-welcome-tile" data-module="${Ve(s.id)}" data-path="${Ve(s.path)}"` + (e.animate ? ` style="animation-delay:${(0.28 + i * 0.09).toFixed(2)}s"` : "") + `><span class="p2w-ico">${pr(Yu[s.id] || "", 22)}</span><span class="p2w-txt"><span class="p2w-t">${Ve(s.title)}</span><span class="p2w-d">${Ve(s.summary)}</span></span><span class="p2w-go">${Xu}</span></button>`).join("");
  t.innerHTML = `<section class="p2w${e.animate ? " p2w-anim" : ""}" data-testid="p2-welcome" data-animate="${e.animate ? "1" : "0"}">` + (r ? `<div class="p2w-eyebrow">${Ve(r)}</div>` : "") + `<h1 class="p2w-h">Добро пожаловать, ${Ve(e.name)}</h1><p class="p2w-p">Здесь ваши разделы. Откройте нужный — в следующий раз приложение сразу откроет тот, где вы были.</p><div class="p2w-grid${e.tiles.length === 1 ? " p2w-one" : ""}">${n}</div><div class="p2w-foot"><button type="button" class="p2w-link" data-testid="p2-welcome-help" data-path="${Vu}">${Qu}Как тут всё устроено — обучение</button><button type="button" class="p2w-link" data-testid="p2-welcome-settings" data-path="#/settings">${Zu}Настройки</button></div></section>`, t.querySelectorAll("[data-path]").forEach((s) => s.addEventListener("click", (i) => {
    i.preventDefault(), i.stopPropagation(), e.open(s.dataset.path || "");
  }));
}
const rd = {
  id: "quality",
  role: "module",
  title: "Качество",
  // P2-0074: строка «что тут делают» на плитке приветствия (src/platform/auth/welcome-screen.ts)
  summary: "Осмотры на объекте по чек-листам, замечания инженеру, аналитика",
  icon: "check-circle",
  version: "1.0.0",
  status: "active",
  entry: "./index.js",
  menu: { section: "quality" },
  company: { enabledByDefault: !0 },
  // P2-0060: что модуль умеет без сети (сервис «Офлайн и синхронизация», MODULES.md): view — смотреть, input — вводы ('*' — свой движок), files — фото и PDF заранее
  offline: { view: !0, input: ["*"], files: !0 },
  // P2-0061: виды записей для общего правила синхронизации (standards/SYNC_AND_ACCESS.md, js/services/sync/sync-access.policy.js):
  // store — хранилище на устройстве, table — таблица сервера, objectType / memory — общая отправка «объектов» (pushCloudObject) и массив в памяти, author — поле id автора и подписи, object — ключ объекта,
  // counterparty — id фирмы, mode — как в серверной политике (author / owner / contractor; P2-0071 — area: единый механизм прав, quality.rec_ok),
  // view / edit — действия (видеть все / любое действие правки), own — действия над своей записью (автор / исполнитель), editAny —
  // «Редактирование чужих», noObject — запись на уровне объекта (без места; без объекта — назначенные на всю компанию и автор), ownFirst — «своё первым» (уходит до скачивания чужого: осмотры, задачи, замечания Стройконтроля 2.0)
  // P2-0072: coreId — номер записи по стандарту (uuid, ставит сервер 054): телефон хранит его у загруженных записей, не отправляет
  sync: [
    {
      kind: "inspection",
      store: "app_history",
      table: "rbi_inspections",
      coreId: "core_id",
      title: "Осмотр",
      author: { id: "authorId", name: ["inspectorName", "inspector_name"] },
      object: ["project_canonical_key", "projectName", "projectId"],
      counterparty: ["core_counterparty_id"],
      contractorCard: "contractorId",
      mode: "area",
      noObject: !0,
      view: ["quality.inspections.view"],
      edit: ["quality.inspections.create", "quality.inspections.edit_any", "quality.inspections.delete"],
      editAny: ["quality.inspections.edit_any"],
      own: {
        view: ["quality.inspections.view", "quality.inspections.create"],
        edit: ["quality.inspections.create", "quality.inspections.edit_any", "quality.inspections.delete"],
        change: ["quality.inspections.create"],
        remove: ["quality.inspections.delete"],
        acts: ["quality.inspections.view", "quality.inspections.create", "quality.inspections.delete"]
      },
      ownFirst: !0
    },
    {
      kind: "task",
      store: "rbi_tasks",
      table: "rbi_tasks",
      coreId: "core_id",
      title: "Задача",
      assignee: "assignedToId",
      author: { id: "authorId", name: ["engineerName", "inspectorName", "engineer_name", "inspector_name"] },
      object: ["project_canonical_key", "projectName", "projectId", "project"],
      counterparty: ["core_counterparty_id"],
      contractorCard: "contractorId",
      mode: "area",
      noObject: !0,
      view: ["quality.tasks.view"],
      edit: ["quality.tasks.create", "quality.tasks.work", "quality.tasks.edit_any", "quality.tasks.delete"],
      editAny: ["quality.tasks.edit_any"],
      own: {
        view: ["quality.tasks.view", "quality.tasks.create", "quality.tasks.work"],
        edit: ["quality.tasks.create", "quality.tasks.work", "quality.tasks.edit_any", "quality.tasks.delete"],
        change: ["quality.tasks.create", "quality.tasks.work"],
        remove: ["quality.tasks.delete"],
        acts: ["quality.tasks.view", "quality.tasks.create", "quality.tasks.work", "quality.tasks.delete"]
      },
      ownFirst: !0
    },
    // команда объекта по действиям своей группы, подрядчик — своя фирма (quality.rec_ok на сервере, P2-0071)
    {
      kind: "meeting",
      objectType: "meeting",
      memory: "rbi_meetingsData",
      store: "rbi_meetings",
      table: "project_meetings",
      coreId: "core_id",
      title: "Совещание",
      author: { id: "authorId", name: ["owner", "author", "inspectorName", "engineerName"] },
      object: ["project_canonical_key", "projectName", "projectId", "project"],
      counterparty: ["core_counterparty_id"],
      contractorCard: "contractorId",
      mode: "area",
      noObject: !0,
      view: ["quality.meetings.view"],
      edit: ["quality.meetings.edit"],
      editAny: ["quality.meetings.edit"],
      own: { view: ["quality.meetings.view", "quality.meetings.edit"], edit: ["quality.meetings.edit"], change: ["quality.meetings.edit"], acts: ["quality.meetings.view", "quality.meetings.edit"] }
    },
    {
      kind: "intervention",
      objectType: "intervention",
      memory: "rbi_interventionsData",
      store: "rbi_interventions",
      table: "project_interventions",
      coreId: "core_id",
      title: "Вмешательство",
      author: { id: "authorId", name: ["owner", "author", "inspectorName", "engineerName"] },
      object: ["project_canonical_key", "projectName", "projectId", "project"],
      counterparty: ["core_counterparty_id"],
      contractorCard: "contractorId",
      mode: "area",
      noObject: !0,
      view: ["quality.meetings.view"],
      edit: ["quality.meetings.edit"],
      editAny: ["quality.meetings.edit"],
      own: { view: ["quality.meetings.view", "quality.meetings.edit"], edit: ["quality.meetings.edit"], change: ["quality.meetings.edit"], acts: ["quality.meetings.view", "quality.meetings.edit"] }
    },
    {
      kind: "fmea",
      objectType: "fmea",
      memory: "rbi_fmeaRecords",
      store: "rbi_fmea",
      table: "project_fmea",
      coreId: "core_id",
      title: "FMEA",
      author: { id: "authorId", name: ["owner", "author", "inspectorName", "engineerName"] },
      object: ["project_canonical_key", "projectName", "projectId", "project"],
      counterparty: ["core_counterparty_id"],
      contractorCard: "contractorId",
      mode: "area",
      noObject: !0,
      view: ["quality.method.view"],
      edit: ["quality.method.edit"],
      editAny: ["quality.method.edit"],
      own: { view: ["quality.method.view", "quality.method.edit"], edit: ["quality.method.edit"], change: ["quality.method.edit"], acts: ["quality.method.view", "quality.method.edit"] }
    },
    {
      kind: "schedule",
      objectType: "schedule",
      memory: "rbi_scheduleData",
      store: "rbi_schedule_stages",
      table: "project_schedule_stages",
      coreId: "core_id",
      title: "Этап графика",
      author: { id: "authorId", name: ["owner", "author", "inspectorName", "engineerName"] },
      object: ["project_canonical_key", "projectName", "projectId", "project"],
      counterparty: ["core_counterparty_id"],
      contractorCard: "contractorId",
      mode: "area",
      noObject: !0,
      view: ["quality.method.view"],
      edit: ["quality.method.edit"],
      editAny: ["quality.method.edit"],
      own: { view: ["quality.method.view", "quality.method.edit"], edit: ["quality.method.edit"], change: ["quality.method.edit"], acts: ["quality.method.view", "quality.method.edit"] }
    },
    {
      kind: "report",
      store: "app_reports",
      table: "shared_reports",
      coreId: "core_id",
      title: "Отчёт",
      author: { id: "authorId", name: ["created_by", "owner", "author"] },
      object: ["project_canonical_key", "projectName", "projectId", "project"],
      counterparty: ["core_counterparty_id"],
      contractorCard: "contractorId",
      mode: "area",
      noObject: !0,
      view: ["quality.reports.view"],
      edit: ["quality.reports.edit"],
      editAny: ["quality.reports.edit"],
      own: { view: ["quality.reports.view", "quality.reports.edit"], edit: ["quality.reports.edit"], change: ["quality.reports.edit"], acts: ["quality.reports.view", "quality.reports.edit"] }
    },
    // библиотека компании — все, у кого есть право (quality.can на сервере)
    {
      kind: "etalon",
      objectType: "etalon",
      memory: "etalonActsArray",
      store: "rbi_etalon_acts",
      table: "shared_etalons",
      coreId: "core_id",
      title: "Акт эталона",
      author: { id: "authorId", name: ["owner", "author", "inspectorName", "engineerName"] },
      mode: "shared",
      view: ["quality.view"],
      edit: ["quality.edit"]
    },
    {
      kind: "document",
      objectType: "custom_doc",
      memory: "customDocs",
      store: "custom_docs",
      table: "shared_docs",
      coreId: "core_id",
      title: "Документ",
      author: { id: "authorId", name: ["owner", "author"] },
      mode: "shared",
      view: ["quality.view"],
      edit: ["quality.edit"]
    }
  ],
  routes: [
    "/history",
    "/history/:id",
    "/audit",
    "/audit/:id",
    "/analytics",
    "/analytics/:subTab",
    "/tasks",
    "/tasks/calendar",
    "/tasks/schedule",
    "/etalon",
    "/etalon/:id",
    "/reports",
    "/reports/:type",
    "/engineer",
    "/engineer/:subTab",
    "/schedule",
    "/meetings"
  ],
  defaultRoute: "/audit"
}, nd = {
  id: "sk",
  role: "feature-of",
  parentModule: "quality",
  title: "Стройконтроль (ПК СК)",
  icon: "clipboard-check",
  version: "1.0.0",
  status: "active",
  entry: "./index.js",
  menu: { section: "quality", label: "ПК СК", order: 5 },
  company: { enabledByDefault: !0 },
  // P2-0061: виды записей для общего правила синхронизации (standards/SYNC_AND_ACCESS.md); P2-0071 — режим area, действия «Внешний СК»
  sync: [
    {
      kind: "sk_record",
      store: "sk_records",
      table: "sk_records",
      title: "Запись СК",
      author: { id: "authorId", name: ["uploaded_by", "sk_uploaded_by", "imported_by", "owner", "author"] },
      object: ["project_canonical_key", "projectName", "projectId", "project"],
      counterparty: ["core_counterparty_id"],
      contractorCard: "contractorId",
      mode: "area",
      noObject: !0,
      view: ["quality.sk.view"],
      edit: ["quality.sk.import"],
      editAny: ["quality.sk.import"],
      own: { view: ["quality.sk.view", "quality.sk.import"], edit: ["quality.sk.import"], change: ["quality.sk.import"], acts: ["quality.sk.view", "quality.sk.import"] }
    }
  ],
  routes: ["/sk", "/sk/:subTab"],
  defaultRoute: "/sk"
}, sd = {
  id: "settings",
  role: "service",
  title: "Настройки",
  icon: "settings",
  version: "1.0.0",
  status: "active",
  entry: "./index.js",
  menu: { section: "main", label: "Настройки", order: 8 },
  company: { enabledByDefault: !0 },
  routes: ["/settings"],
  defaultRoute: "/settings"
}, id = {
  id: "knowledge",
  role: "module",
  title: "База знаний",
  icon: "book-open",
  version: "1.0.0",
  status: "active",
  entry: "./index.js",
  menu: { section: "main", label: "БЗ", order: 9 },
  company: { enabledByDefault: !0 },
  // P2-0060: что модуль умеет без сети (сервис «Офлайн и синхронизация», MODULES.md): view — смотреть, input — вводы ('*' — свой движок), files — фото и PDF заранее
  offline: { view: !0, input: [], files: !0 },
  // P2-0061: виды записей для общего правила синхронизации (библиотека компании — quality.can на сервере)
  sync: [
    { kind: "practice", objectType: "practice", memory: "rbi_practicesData", store: "rbi_practices", table: "shared_practices", coreId: "core_id", title: "Практика", author: { id: "authorId", name: ["owner", "author"] }, mode: "shared", view: ["quality.view"], edit: ["quality.edit"] },
    { kind: "twi", objectType: "custom_twi_card", memory: "customTwiCards", store: "twi_cards", table: "shared_twi_cards", coreId: "core_id", title: "Карта TWI", author: { id: "authorId", name: ["owner", "author"] }, mode: "shared", view: ["quality.view"], edit: ["quality.edit"] }
  ],
  routes: ["/knowledge", "/knowledge/twi", "/knowledge/docs", "/knowledge/nodes", "/knowledge/etalons"],
  defaultRoute: "/knowledge"
}, od = {
  id: "construction",
  role: "module",
  title: "Стройконтроль",
  // P2-0074: строка «что тут делают» на плитке приветствия (src/platform/auth/welcome-screen.ts)
  summary: "Замечания подрядчикам на плане, приёмка работ, передача квартир",
  icon: "hard-hat",
  version: "1.0.0",
  status: "active",
  entry: "./index.js",
  menu: { section: "construction", label: "Стройконтроль", order: 10 },
  company: { enabledByDefault: !0 },
  // P2-0060: что модуль умеет без сети (сервис «Офлайн и синхронизация», MODULES.md): view — смотреть, input — вводы ('*' — свой движок), files — фото и PDF заранее
  offline: { view: !0, input: ["*"], files: !0 },
  routes: ["/construction", "/construction/:subTab"],
  defaultRoute: "/construction"
}, ad = {
  id: "construction-v2",
  role: "module",
  title: "Стройконтроль (новый)",
  icon: "hard-hat",
  version: "0.1.0",
  status: "active",
  entry: "./index.js",
  menu: { section: "construction", label: "СК (новый)", order: 11 },
  company: { enabledByDefault: !0 },
  // P2-0061: виды записей для общего правила синхронизации (standards/SYNC_AND_ACCESS.md). P2-0070: замечания и приёмки —
  // режим `area` единого механизма прав (на сервере — core.row_allowed и сторож действий, 052): действия роли в области
  // участия в проекте (место записи — по id ядра), подрядчик — своя фирма по id контрагента; помещения — quality.can (без изменений)
  sync: [
    {
      kind: "defect_v2",
      store: "construction_defects_v2",
      table: "construction_defects_v2",
      coreId: "core_id",
      title: "Замечание",
      author: { id: "authorId", name: ["owner", "created_by", "author"] },
      counterparty: ["core_counterparty_id"],
      contractorCard: "contractorId",
      place: { project: "core_project_id", location: "core_location_id" },
      mode: "area",
      view: ["construction.defects.view"],
      edit: [
        "construction.defects.create",
        "construction.defects.assign",
        "construction.defects.start",
        "construction.defects.fix",
        "construction.defects.close",
        "construction.defects.reject",
        "construction.defects.delete"
      ],
      ownFirst: !0
    },
    {
      kind: "acceptance_v2",
      store: "construction_acceptance_v2",
      table: "construction_acceptance_v2",
      coreId: "core_id",
      title: "Приёмка",
      author: { id: "authorId", name: ["owner", "created_by", "author"] },
      counterparty: ["core_counterparty_id"],
      contractorCard: "contractorId",
      place: { project: "core_project_id", location: "core_location_id" },
      mode: "area",
      view: ["construction.acceptance.view"],
      edit: ["construction.acceptance.book", "construction.acceptance.schedule", "construction.acceptance.conduct"]
    },
    {
      kind: "unit_v2",
      store: "construction_units_v2",
      table: "construction_units_v2",
      coreId: "core_id",
      title: "Помещение",
      author: { id: "authorId", name: ["owner", "created_by", "author"] },
      mode: "shared",
      view: ["construction.view"],
      edit: ["construction.edit"]
    }
  ],
  routes: ["/construction-v2", "/construction-v2/:subTab"],
  defaultRoute: "/construction-v2"
}, ld = {
  id: "game",
  role: "feature-of",
  parentModule: "quality",
  title: "Геймификация",
  icon: "trophy",
  version: "1.0.0",
  status: "active",
  entry: "./index.js",
  menu: { section: "engineer", label: "Достижения", order: 11 },
  company: { enabledByDefault: !0 },
  routes: ["/game", "/game/:subTab", "/fmea", "/fmea/:id"],
  defaultRoute: "/game"
}, cd = {
  id: "ai",
  role: "service",
  title: "ИИ-помощник",
  icon: "sparkles",
  version: "1.0.0",
  status: "active",
  entry: "./index.js",
  menu: { section: "main", label: "ИИ", order: 13 },
  company: { enabledByDefault: !0 },
  routes: [],
  defaultRoute: null
}, ud = {
  id: "planfact",
  role: "module",
  title: "План/Факт",
  // P2-0074: строка «что тут делают» на плитке приветствия (src/platform/auth/welcome-screen.ts)
  summary: "ВОР, смета и выполнение работ по дням",
  icon: "table",
  version: "0.1.0",
  status: "active",
  enabled: !0,
  entry: "./index.js",
  menu: { section: "platform", label: "План/Факт", order: 50, path: "#/planfact", demo: !0 },
  // demo — виден в «Посмотреть без входа» (разбор ВОР без сервера), P2-0013
  // P2-0060: что модуль умеет без сети (сервис «Офлайн и синхронизация», MODULES.md): view — смотреть, input — вводы ('*' — свой движок), files — фото и PDF заранее
  // P2-0064: без сети вносится факт — одной строкой (fact) и пачкой (fact_batch); исправление, решение РП, бригады, КС-2 — только с сетью
  offline: { view: !0, input: ["fact", "fact_batch"], files: !1 },
  // P2-0064: вид записи для общей отправки сервиса платформы (standards/SYNC_AND_ACCESS.md, «Вид, который уходит функцией сервера»):
  // запись лежит на устройстве (база записей устройства, src/platform/services/offline/device-records.ts) и уходит функцией rpc
  // с id с телефона — повтор без дубля. Права и область (место, «за кого», перебор → «на проверку») проверяет сервер.
  // P2-0070: единый механизм прав — то же описание, что у Стройконтроля: действия каталога и место записи (объект — project,
  // место — location_id: место позиции ВОР). Отправку факта решает сервер (pf_fact_submit: область, «за кого», перебор);
  // правило устройства по этому описанию сверяет зеркальный тест (телефон = сервер), участие — pf_my_area → grants.
  sync: [
    {
      kind: "pf_fact",
      store: "device_records",
      rpc: "pf_fact_submit",
      title: "Факт",
      mode: "area",
      place: { project: "project", location: "location_id" },
      view: ["planfact.fact.view"],
      edit: ["planfact.fact.create"]
    }
  ],
  /** Подвкладки модуля: нижний таббар (телефон/планшет) и nav2 (≥1280) — как у Quality. Новые разделы добавляются сюда.
   *  requiresAccess — пункт виден, когда сервер подтвердил доступ: true — к компании, 'estimate' — право на цены и сметы, 'ks2' — право на КС-2.
   *  P2-0009: первым — «Сводка» на адресе #/planfact (#/planfact/summary — тоже она); старая демо-таблица «Работы» из меню убрана (код не удалён). */
  nav: [
    {
      id: "summary",
      label: "Сводка",
      path: "#/planfact",
      requiresAccess: !0,
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    },
    // P2-0021: «Требует моего участия» по всем объектам; красная точка с числом — сумма дел (обёртка index.js)
    {
      id: "inbox",
      label: "Входящие",
      path: "#/planfact/inbox",
      requiresAccess: !0,
      icon: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
    },
    {
      id: "vor",
      label: "ВОР",
      path: "#/planfact/vor",
      requiresAccess: !0,
      icon: "M9 17v-2m3 2v-4m3 4v-6M5 21h14a2 2 0 002-2V7.414a1 1 0 00-.293-.707l-4.414-4.414A1 1 0 0015.586 2H5a2 2 0 00-2 2v15a2 2 0 002 2z"
    },
    {
      id: "fact",
      label: "Факт",
      path: "#/planfact/fact",
      requiresAccess: !0,
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    },
    {
      id: "estimate",
      label: "Смета",
      path: "#/planfact/estimate",
      requiresAccess: "estimate",
      icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
    },
    {
      id: "ks2",
      label: "КС-2",
      path: "#/planfact/ks2",
      requiresAccess: "ks2",
      icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    },
    {
      id: "directories",
      label: "Справочники",
      path: "#/planfact/directories",
      requiresAccess: !0,
      icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
    }
  ],
  routes: ["/planfact"],
  defaultRoute: "/planfact"
}, dd = {
  id: "company",
  role: "module",
  title: "Компания",
  // P2-0074: строка «что тут делают» на плитке приветствия (src/platform/auth/welcome-screen.ts)
  summary: "Сотрудники и роли, объекты и места, справочники",
  icon: "users",
  version: "0.1.0",
  status: "active",
  enabled: !0,
  entry: "./index.js",
  // Пункта в боковом меню нет: «Компания» — подраздел Настроек (#/settings/company), виден при праве security.roles.assign.
  // P2-0060: ядро платформы без сети — смотреть (копия для просмотра); вводы — с сетью (сервис «Офлайн и синхронизация», MODULES.md)
  offline: { view: !0, input: [], files: !1 },
  routes: ["/company"],
  defaultRoute: "/company"
}, En = [
  rd,
  nd,
  sd,
  id,
  od,
  ad,
  ld,
  cd,
  ud,
  dd
], hd = `
.p2-login{width:100%;max-width:380px;background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:24px;padding:22px 20px;box-shadow:0 20px 50px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:14px;max-height:calc(100dvh - 32px);overflow-y:auto}
.p2-login h2{margin:0;text-align:center;font-size:15px;font-weight:900;text-transform:uppercase;letter-spacing:-.01em}
.p2-login-sub{margin:-8px 0 0;text-align:center;font-size:12px;color:var(--text-muted)}
.p2-login form{display:flex;flex-direction:column;gap:12px}
.p2-login [hidden]{display:none!important}
.p2-login label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.p2-login input{font-size:16px;min-height:44px;padding:9px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main)}
.p2-login-btn{min-height:46px;font-size:13px;font-weight:800;text-transform:uppercase;border-radius:12px;border:0;background:var(--accent,var(--primary));color:#fff;cursor:pointer}
.p2-login-btn:disabled{opacity:.6;cursor:default}
.p2-login-notice{margin:0;font-size:13px;line-height:1.4;padding:10px 12px;border-radius:12px;border:1px solid var(--card-border);color:var(--text-main);overflow-wrap:anywhere}
.p2-login-error{font-size:13px;color:var(--color-red,#dc2626)}
.p2-login-demo{align-self:center;min-height:40px;font-size:12px;border:0;background:transparent;color:var(--text-muted);text-decoration:underline;cursor:pointer}
`;
function ie(t, e, r = {}, n) {
  const s = t.createElement(e);
  for (const [i, o] of Object.entries(r)) s.setAttribute(i, o);
  return n !== void 0 && (s.textContent = n), s;
}
function Us(t, e, r) {
  const n = ie(t, "label", {}, e);
  return n.appendChild(ie(t, "input", r)), n;
}
function fd(t, e) {
  const r = t.ownerDocument;
  t.replaceChildren();
  const n = ie(r, "div", { class: "p2-login", "data-testid": "p2-login", role: "dialog", "aria-label": "Вход" });
  n.append(ie(r, "h2", {}, "Вход"), ie(r, "p", { class: "p2-login-sub" }, "RBI Platform")), e.notice && n.append(ie(r, "p", { class: "p2-login-notice", role: "status", "data-testid": "p2-login-notice" }, e.notice));
  const s = ie(r, "form", { "data-testid": "p2-login-email", novalidate: "" });
  s.append(
    Us(r, "Почта", { type: "email", name: "email", autocomplete: "username", inputmode: "email" }),
    Us(r, "Пароль", { type: "password", name: "password", autocomplete: "current-password" })
  );
  const i = ie(r, "div", { class: "p2-login-error", role: "alert", hidden: "" }), o = ie(r, "button", { type: "submit", class: "p2-login-btn" }, "Войти");
  s.append(i, o), s.addEventListener("submit", (l) => {
    if (l.preventDefault(), o.disabled) return;
    const c = s.elements.namedItem("email").value, u = s.elements.namedItem("password").value;
    if (!c.trim() || !u) {
      i.textContent = "Введите почту и пароль", i.hidden = !1;
      return;
    }
    o.disabled = !0, o.textContent = "Входим…", i.hidden = !0, e.signIn(c, u).then((d) => {
      if (o.disabled = !1, o.textContent = "Войти", !d.ok) {
        i.textContent = d.message, i.hidden = !1;
        return;
      }
      s.reset();
    });
  });
  const a = ie(r, "button", { type: "button", class: "p2-login-demo", "data-testid": "p2-login-demo" }, "Посмотреть без входа (демо)");
  return a.addEventListener("click", () => e.onDemo()), n.append(s, a), t.appendChild(n), () => t.replaceChildren();
}
const pd = `
.p2-profile{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px}
.p2-profile [hidden]{display:none!important}
.p2-profile-title{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)}
.p2-profile-name{font-size:15px;font-weight:800;color:var(--text-main);overflow-wrap:anywhere}
.p2-profile-mail{font-size:13px;color:var(--text-muted);overflow-wrap:anywhere}
.p2-profile form{display:flex;flex-direction:column;gap:10px;max-width:420px}
.p2-profile label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted)}
.p2-profile input{font-size:16px;min-height:44px;padding:9px 12px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main);text-transform:none;font-weight:400}
.p2-profile-row{display:flex;flex-wrap:wrap;gap:8px}
.p2-profile-btn{min-height:40px;padding:0 16px;border-radius:12px;border:1px solid var(--card-border);background:transparent;color:var(--text-main);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;cursor:pointer}
.p2-profile-btn--main{background:var(--accent,var(--primary));border-color:transparent;color:#fff}
.p2-profile-btn:disabled{opacity:.6;cursor:default}
.p2-profile-error{font-size:13px;color:var(--color-red,#dc2626)}
.p2-profile-ok{font-size:13px;color:var(--color-green,#16a34a)}
`;
function L(t, e, r = {}, n) {
  const s = t.createElement(e);
  for (const [i, o] of Object.entries(r)) s.setAttribute(i, o);
  return n !== void 0 && (s.textContent = n), s;
}
function Bs(t, e, r, n) {
  const s = L(t, "label", {}, e);
  return s.appendChild(L(t, "input", { type: "password", name: r, autocomplete: n, minlength: "8" })), s;
}
function Gi(t, e) {
  const r = L(t, "form", { "data-testid": e.testid, novalidate: "" });
  r.append(Bs(t, "Новый пароль (не короче 8 знаков)", "password", "new-password"), Bs(t, "Ещё раз", "repeat", "new-password"));
  const n = L(t, "div", { class: e.errClass, role: "alert", hidden: "" }), s = L(t, "button", { type: "submit", class: e.btnClass }, e.submitText);
  return r.append(n, s), r.addEventListener("submit", (i) => {
    if (i.preventDefault(), s.disabled) return;
    const o = r.elements.namedItem("password").value, a = r.elements.namedItem("repeat").value, l = Ec(o, a);
    if (l) {
      n.textContent = l, n.hidden = !1;
      return;
    }
    s.disabled = !0, n.hidden = !0, e.change(o).then((c) => {
      if (s.disabled = !1, !c.ok) {
        n.textContent = c.message, n.hidden = !1;
        return;
      }
      r.reset(), e.onDone();
    });
  }), r;
}
function gd(t, e) {
  const r = t.ownerDocument;
  t.replaceChildren();
  const n = L(r, "div", { class: "p2-login", "data-testid": "p2-new-password", role: "dialog", "aria-label": "Придумайте пароль" });
  n.append(
    L(r, "h2", {}, "Придумайте пароль"),
    L(r, "p", { class: "p2-login-sub" }, `${e.email} — вы вошли временным паролем. Придумайте свой: дальше входите им.`)
  );
  const s = Gi(r, {
    change: e.change,
    submitText: "Сохранить пароль",
    btnClass: "p2-login-btn",
    errClass: "p2-login-error",
    onDone: () => {
    },
    testid: "p2-new-password-form"
  }), i = L(r, "button", { type: "button", class: "p2-login-demo", "data-testid": "p2-new-password-signout" }, "Выйти");
  return i.addEventListener("click", () => e.signOut()), n.append(s, i), t.appendChild(n), () => t.replaceChildren();
}
function md(t, e) {
  const r = t.ownerDocument;
  t.replaceChildren();
  const n = L(r, "div", { class: "p2-profile", "data-testid": "p2-profile" });
  n.append(
    L(r, "div", { class: "p2-profile-title" }, "Мой профиль"),
    L(r, "div", { class: "p2-profile-name", "data-testid": "p2-profile-name" }, e.fullName || "ФИО не указано"),
    L(r, "div", { class: "p2-profile-mail" }, `Почта для входа: ${e.email} (меняет администратор компании)`)
  );
  const s = L(r, "div", { class: "p2-profile-ok", role: "status", hidden: "" }, "Пароль сменён"), i = L(r, "button", { type: "button", class: "p2-profile-btn", "data-testid": "p2-profile-password" }, "Сменить пароль"), o = Gi(r, {
    change: e.change,
    submitText: "Сохранить пароль",
    btnClass: "p2-profile-btn p2-profile-btn--main",
    errClass: "p2-profile-error",
    testid: "p2-profile-password-form",
    onDone: () => {
      o.hidden = !0, i.hidden = !1, s.hidden = !1;
    }
  });
  o.hidden = !0;
  const a = L(r, "button", { type: "button", class: "p2-profile-btn" }, "Отмена");
  a.addEventListener("click", () => {
    o.reset(), o.hidden = !0, i.hidden = !1;
  }), o.appendChild(a), i.addEventListener("click", () => {
    o.hidden = !1, i.hidden = !0, s.hidden = !0;
  });
  const l = L(r, "div", { class: "p2-profile-row" });
  if (l.append(i), n.append(l, o, s), e.saveName) {
    const c = e.saveName, u = L(r, "button", { type: "button", class: "p2-profile-btn", "data-testid": "p2-profile-name-edit" }, "Изменить ФИО"), d = L(r, "form", { "data-testid": "p2-profile-name-form", novalidate: "" }), p = L(r, "label", {}, "ФИО");
    p.appendChild(L(r, "input", { name: "full_name", maxlength: "120", autocomplete: "name", value: e.fullName || "" }));
    const h = L(r, "div", { class: "p2-profile-error", role: "alert", hidden: "" }), f = L(r, "button", { type: "submit", class: "p2-profile-btn p2-profile-btn--main" }, "Сохранить ФИО"), g = L(r, "button", { type: "button", class: "p2-profile-btn" }, "Отмена");
    d.append(p, h, f, g), d.hidden = !0, u.addEventListener("click", () => {
      d.hidden = !1, u.hidden = !0, s.hidden = !0;
    }), g.addEventListener("click", () => {
      d.hidden = !0, u.hidden = !1, h.hidden = !0;
    }), d.addEventListener("submit", (m) => {
      if (m.preventDefault(), f.disabled) return;
      const y = d.elements.namedItem("full_name").value.trim();
      if (y.length < 2) {
        h.textContent = "Укажите ФИО", h.hidden = !1;
        return;
      }
      f.disabled = !0, h.hidden = !0, c(y).then((_) => {
        if (f.disabled = !1, !_.ok) {
          h.textContent = _.message, h.hidden = !1;
          return;
        }
        d.hidden = !0, u.hidden = !1;
      });
    }), l.prepend(u), n.insertBefore(d, o);
  }
  return t.appendChild(n), () => t.replaceChildren();
}
const Yi = ["desk-user-name", "desk-user-avatar", "header-user-block"];
let Ue = null;
function yd(t, e) {
  var n, s;
  if (typeof document > "u") return;
  const r = (s = (n = window.RBI) == null ? void 0 : n.services) == null ? void 0 : s.shell;
  if (!(!r || typeof r.renderUserBlock != "function")) {
    if (!Ue) {
      Ue = {};
      for (const i of Yi) {
        const o = document.getElementById(i);
        o && (Ue[i] = o.textContent || "");
      }
    }
    r.renderUserBlock({ name: t, role: e || "нет роли" });
  }
}
function _d() {
  if (!(!Ue || typeof document > "u")) {
    for (const t of Yi) {
      const e = document.getElementById(t);
      e && t in Ue && (e.textContent = Ue[t]);
    }
    Ue = null;
  }
}
const wd = "rbi:platform-net", qs = "platform2_legacy_cleanup_v1", vd = "RBI_QUALITY_DB", bd = "platform2_quality_state_";
async function kd(t) {
  const e = t.store;
  if (!e) return "retry";
  try {
    if (e.getItem(qs)) return "skipped";
  } catch {
    return "retry";
  }
  try {
    if (!e.getItem(Te)) {
      for (const r of Qr) e.removeItem(r);
      e.removeItem(bd);
    }
  } catch {
    return "retry";
  }
  try {
    t.deleteDatabase && await t.deleteDatabase(vd);
  } catch {
    return "retry";
  }
  try {
    e.setItem(qs, t.now ? t.now() : (/* @__PURE__ */ new Date()).toISOString());
  } catch {
    return "retry";
  }
  return "done";
}
function Sd(t, e, r = 5e3) {
  return new Promise((n, s) => {
    let i;
    try {
      i = t.deleteDatabase(e);
    } catch (a) {
      s(a);
      return;
    }
    const o = setTimeout(() => s(new Error("blocked")), r);
    i.onsuccess = () => {
      clearTimeout(o), n();
    }, i.onerror = () => {
      clearTimeout(o), s(i.error || new Error("error"));
    };
  });
}
const xn = "p2_moved_to", Ed = "p2_moved_at", Ms = "platform2_quality_state_";
function xd(t) {
  const e = {};
  for (const r of t) for (const n of r.sync || []) n && n.store && !n.rpc && !(n.store in e) && (e[n.store] = n.title);
  return e;
}
const Fe = {
  ...xd(En),
  // старый Стройконтроль (v1): описания `sync` нет — на сервере фирма по названию (row_visible 020), ТД; записи не теряются
  construction_defects: "Замечание",
  construction_acceptance: "Приёмка",
  construction_units: "Помещение"
}, Ad = ["app_photos", "checklist_snapshots"];
function Td(t) {
  return /^demo[_-]/i.test(String(t.id ?? "")) || t.isDemo === !0 || t.is_demo === !0 || t.demo === !0;
}
function Rd(t) {
  return t.type === "auto" || t.source === "ai" || t.source === "system" || t.contractor === "Системная";
}
function hn(t, e, r) {
  return t in Fe ? e.filter((n) => n && n.id != null && !n[xn] && !String(n.id).startsWith("sys_") && !Td(n) && !Rd(n) && r(n)) : [];
}
const Be = (t) => typeof t == "string" ? t.trim() : typeof t == "number" ? String(t) : "";
function An(t, e) {
  const r = e.data && typeof e.data == "object" ? e.data : {}, n = (...s) => {
    for (const i of s) {
      const o = Be(e[i]) || Be(r[i]);
      if (o) return o;
    }
    return "";
  };
  return {
    store: t,
    id: String(e.id),
    type: Fe[t] || t,
    date: n("date", "createdAt", "created_at", "updatedAt", "updated_at"),
    object: n("object", "objectName", "projectName", "project_display_name", "project", "title", "name")
  };
}
function Od(t, e, r) {
  if (t[xn]) return !1;
  const n = String(t.id ?? ""), s = Be(t.entityId) || Be(t.entity_id);
  return !!s && e.has(s) || n.length > 3 && r.includes(n);
}
const Cd = "Инженер", Id = ["inspectorName", "engineerName", "engineer_name", "owner", "created_by"];
function jd(t, e, r = "") {
  const n = { ...t }, s = Be(n.project_code);
  if ((!s || s === "LOCAL") && (n.project_code = e), r)
    for (const i of Id) i in n && (!Be(n[i]) || Be(n[i]) === Cd) && (n[i] = r);
  return n;
}
function Pd(t, e, r) {
  return { ...t, [xn]: e, [Ed]: r };
}
function sr(t) {
  return new Promise((e, r) => {
    t.onsuccess = () => e(t.result), t.onerror = () => r(t.error);
  });
}
function xt(t, e) {
  return new Promise((r) => {
    let n = !1;
    const s = t.open(e);
    s.onupgradeneeded = () => {
      var i;
      n = !0, (i = s.transaction) == null || i.abort();
    }, s.onsuccess = () => {
      n ? (s.result.close(), r(null)) : r(s.result);
    }, s.onerror = () => r(null), s.onblocked = () => r(null);
  });
}
async function Nd(t, e, r) {
  const n = { orphans: [], rows: /* @__PURE__ */ new Map(), attachments: /* @__PURE__ */ new Map() }, s = await xt(t, e);
  if (!s) return n;
  try {
    const i = Array.from(s.objectStoreNames);
    for (const o of i) {
      if (!(o in Fe)) continue;
      const a = hn(o, await sr(s.transaction(o, "readonly").objectStore(o).getAll()), r);
      if (a.length) {
        n.rows.set(o, a);
        for (const l of a) n.orphans.push(An(o, l));
      }
    }
    if (n.orphans.length) {
      const o = new Set(n.orphans.map((l) => l.id)), a = JSON.stringify([...n.rows.values()]);
      for (const l of Ad) {
        if (!i.includes(l)) continue;
        const u = (await sr(s.transaction(l, "readonly").objectStore(l).getAll())).filter((d) => Od(d, o, a));
        u.length && n.attachments.set(l, u);
      }
    }
  } finally {
    s.close();
  }
  return n.orphans.sort((i, o) => i.date < o.date ? -1 : i.date > o.date ? 1 : 0), n;
}
function fn(t) {
  return String(t.syncStatus ?? t.sync_status ?? "") === "blocked";
}
async function $d(t, e) {
  const r = await xt(t, e);
  if (!r) return 0;
  let n = 0;
  try {
    for (const s of Array.from(r.objectStoreNames))
      s in Fe && await new Promise((i, o) => {
        const a = r.transaction(s, "readwrite"), l = a.objectStore(s).openCursor();
        l.onsuccess = () => {
          const c = l.result;
          if (!c) return;
          const u = c.value;
          fn(u) && (n++, c.update({ ...u, syncAccessStamp: "", syncServerRejected: !1 })), c.continue();
        }, a.oncomplete = () => i(), a.onerror = () => o(a.error);
      });
  } finally {
    r.close();
  }
  return n;
}
const Fs = 200;
async function Ld(t, e, r, n = 200) {
  const s = { unsent: 0, rows: [] }, i = await xt(t, e);
  if (!i) return s;
  const o = (l) => r(l) || fn(l), a = (l, c) => {
    hn(l, [c], r).length && s.unsent++, s.rows.length < n && hn(l, [c], o).length && s.rows.push({ store: l, rec: c, rejected: !r(c) && fn(c) });
  };
  try {
    for (const l of Array.from(i.objectStoreNames)) {
      if (!(l in Fe)) continue;
      const c = i.transaction(l, "readonly").objectStore(l).keyPath;
      if (typeof c != "string" || typeof IDBKeyRange > "u") {
        await new Promise((d, p) => {
          const h = i.transaction(l, "readonly").objectStore(l).openCursor();
          h.onsuccess = () => {
            const f = h.result;
            if (!f) return d();
            a(l, f.value), f.continue();
          }, h.onerror = () => p(h.error);
        });
        continue;
      }
      let u = null;
      for (; ; ) {
        const d = u === null ? null : IDBKeyRange.lowerBound(u, !0), p = await sr(i.transaction(l, "readonly").objectStore(l).getAll(d, Fs));
        for (const h of p) a(l, h);
        if (p.length < Fs) break;
        u = p[p.length - 1][c];
      }
    }
  } finally {
    i.close();
  }
  return s;
}
async function Dd(t, e, r, n, s) {
  const i = s.now || (/* @__PURE__ */ new Date()).toISOString(), o = await xt(t, r), a = await xt(t, e);
  if (!o || !a)
    throw o == null || o.close(), a == null || a.close(), new Error("База устройства недоступна");
  let l = 0;
  try {
    const c = [
      ...[...n.rows].map(([u, d]) => [u, d, !0]),
      ...[...n.attachments].map(([u, d]) => [u, d, !1])
    ];
    for (const [u, d, p] of c) {
      if (!o.objectStoreNames.contains(u)) continue;
      const h = o.transaction(u, "readwrite"), f = h.objectStore(u), g = f.keyPath, m = [];
      for (const _ of d)
        await sr(f.getKey(_[g])) === void 0 && f.put(u in Fe ? jd(_, s.projectCode, s.author) : _), m.push(_), p && l++;
      await new Promise((_, w) => {
        h.oncomplete = () => _(), h.onerror = () => w(h.error), h.onabort = () => w(h.error);
      });
      const y = a.transaction(u, "readwrite");
      for (const _ of m) y.objectStore(u).put(Pd(_, s.slot, i));
      await new Promise((_, w) => {
        y.oncomplete = () => _(), y.onerror = () => w(y.error), y.onabort = () => w(y.error);
      });
    }
  } finally {
    o.close(), a.close();
  }
  return l;
}
const Ud = `
.p2-rescue-wrap{position:fixed;inset:0;z-index:1300}
.p2-rescue-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.35)}
.p2-rescue{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:14px;max-height:88vh;overflow-y:auto;
  padding:18px 16px calc(16px + env(safe-area-inset-bottom,0px));background:var(--card-bg);color:var(--text-main);border-radius:20px 20px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.25)}
.p2-rescue__grip{width:40px;height:4px;border-radius:4px;background:var(--card-border);align-self:center;margin-top:-6px}
.p2-rescue__head{display:flex;gap:12px;align-items:flex-start}
.p2-rescue__ico{width:44px;height:44px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent)}
.p2-rescue__head b{display:block;font-size:17px;font-weight:700;line-height:1.3;overflow-wrap:anywhere}
.p2-rescue__head span{display:block;margin-top:4px;font-size:13.5px;line-height:1.4;color:var(--text-muted);overflow-wrap:anywhere}
.p2-rescue ul{margin:0;padding:0;list-style:none;border:1px solid var(--card-border);border-radius:14px;overflow:hidden}
.p2-rescue li{display:grid;grid-template-columns:92px minmax(0,1fr);gap:2px 10px;padding:10px 12px;font-size:13.5px;border-top:1px solid var(--card-border)}
.p2-rescue li:first-child{border-top:0}
.p2-rescue li i{font-style:normal;color:var(--text-muted);grid-row:span 2;font-size:12.5px;line-height:1.35}
.p2-rescue li strong{font-weight:700}
.p2-rescue li em{font-style:normal;color:var(--text-muted);font-size:12.5px;overflow-wrap:anywhere}
.p2-rescue p{margin:0;font-size:12.5px;color:var(--text-muted)}
.p2-rescue__foot{display:flex;gap:8px;justify-content:flex-end}
.p2-rescue__foot button{flex:1 1 0;min-height:44px;padding:0 18px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main)}
.p2-rescue__foot button[data-primary]{border:0;background:var(--accent,var(--primary));color:#fff}
.p2-rescue__foot button:disabled{opacity:.6;cursor:default}
@media (min-width:768px){.p2-rescue{left:50%;right:auto;bottom:auto;top:50%;transform:translate(-50%,-50%);width:540px;border-radius:20px}
  .p2-rescue__grip{display:none}.p2-rescue__foot button{flex:0 0 auto}}`, Nr = 50, Bd = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 2l20 20"/><path d="M5.8 10.1A5 5 0 0 0 7 18h10.5"/><path d="M20.9 16.6A4 4 0 0 0 19 10a5 5 0 0 0-7.6-4.3"/></svg>';
function qd(t) {
  const e = new Date(t);
  if (!t || Number.isNaN(e.getTime())) return [t || "без даты", ""];
  const r = (n) => String(n).padStart(2, "0");
  return [r(e.getDate()) + "." + r(e.getMonth() + 1) + "." + e.getFullYear(), r(e.getHours()) + ":" + r(e.getMinutes())];
}
function Md(t, e) {
  const r = (m, y = {}, _) => {
    const w = t.createElement(m);
    for (const [E, R] of Object.entries(y)) w.setAttribute(E, R);
    return _ !== void 0 && (w.textContent = _), w;
  }, n = r("div", { class: "p2-rescue-wrap", "data-testid": "p2-rescue" }), s = r("div", { class: "p2-rescue-backdrop", "aria-hidden": "true" }), i = r("div", { class: "p2-rescue", role: "dialog", "aria-modal": "true", "aria-label": "Записи, сделанные без связи" }), o = e.orphans.length, a = r("div", { class: "p2-rescue__ico" });
  a.innerHTML = Bd;
  const l = r("div");
  l.append(
    r("b", {}, "Найдено " + o + " " + Fd(o, "запись", "записи", "записей") + ", " + (o % 10 === 1 && o % 100 !== 11 ? "сделанная" : "сделанные") + " без связи"),
    r("span", {}, (o === 1 ? "Она осталась" : "Они остались") + " на этом телефоне и не отправлены. Перенести в «" + e.companyName + "» и отправить?")
  );
  const c = r("div", { class: "p2-rescue__head" });
  c.append(a, l);
  const u = r("ul", { "data-testid": "p2-rescue-list" });
  for (const m of e.orphans.slice(0, Nr)) {
    const [y, _] = qd(m.date), w = r("li"), E = r("i", {}, y);
    _ && (E.append(r("br")), E.append(t.createTextNode(_))), w.append(E, r("strong", {}, m.type), r("em", {}, m.object || "без объекта")), u.append(w);
  }
  o > Nr && u.append(r("li", {}, "и ещё " + (o - Nr)));
  const d = r("p", { "data-testid": "p2-rescue-msg", role: "status" }, "Фото переносятся вместе с записями. Демо-данные и задачи, созданные системой, не переносятся."), p = r("button", { type: "button", "data-testid": "p2-rescue-later" }, "Позже"), h = r("button", { type: "button", "data-primary": "", "data-testid": "p2-rescue-move" }, "Перенести и отправить"), f = r("div", { class: "p2-rescue__foot" });
  f.append(p, h), i.append(r("div", { class: "p2-rescue__grip", "aria-hidden": "true" }), c, u, d, f), n.append(s, i);
  const g = () => {
    n.remove();
  };
  return p.addEventListener("click", () => {
    g(), e.onLater();
  }), s.addEventListener("click", () => {
    g(), e.onLater();
  }), h.addEventListener("click", () => {
    h.disabled = !0, p.disabled = !0, d.textContent = "Переносим…", e.onMove().then((m) => {
      m ? (d.textContent = m, h.disabled = !1, p.disabled = !1) : g();
    });
  }), n;
}
function Fd(t, e, r, n) {
  const s = t % 10, i = t % 100;
  return s === 1 && i !== 11 ? e : s >= 2 && s <= 4 && (i < 12 || i > 14) ? r : n;
}
const Hs = "p2-sync-status-css", Hd = `
.p2s{background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:16px;overflow:hidden}
.p2s__head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 16px}
.p2s__head>div:nth-child(2){flex:1 1 200px;min-width:0}
.p2s__ico{width:44px;height:44px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center}
.p2s__ico--warn{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent)}
.p2s__ico--wait{color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 14%,transparent)}
.p2s__ico--ok{color:var(--success,#3f8f5e);background:color-mix(in srgb,var(--success,#3f8f5e) 14%,transparent)}
.p2s__title{display:block;font-size:16px;font-weight:800;line-height:1.25}
.p2s__sub{display:block;font-size:13px;color:var(--text-muted);margin-top:2px}
.p2s__btn{flex:1 1 100%;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);font-weight:700;font-size:13px;cursor:pointer}
.p2s__list{list-style:none;margin:0;padding:0;border-top:1px solid var(--card-border)}
.p2s__row{display:grid;grid-template-columns:1fr;gap:4px 12px;padding:12px 16px;border-bottom:1px solid var(--card-border)}
.p2s__row:last-child{border-bottom:0}
.p2s__name{font-size:14px;font-weight:700;min-width:0;overflow-wrap:anywhere}
.p2s__when{font-size:12px;color:var(--text-muted)}
.p2s__why{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px}
.p2s__chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-weight:700;font-size:12px}
.p2s__chip--net,.p2s__chip--photo{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 13%,transparent)}
.p2s__chip--bad{color:var(--danger,#b24a43);background:color-mix(in srgb,var(--danger,#b24a43) 12%,transparent)}
.p2s__chip--wait,.p2s__chip--queue{color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 14%,transparent)}
.p2s__hint{color:var(--text-muted);font-size:12.5px}
.p2s__act{min-height:36px;padding:0 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--warning,#b8844a) 45%,transparent);background:transparent;color:var(--text-main);font-weight:700;font-size:12.5px;cursor:pointer}
.p2s__group{padding:8px 16px;font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 6%,transparent);border-top:1px solid var(--card-border)}
.p2s__group--act{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.p2s__foot{display:flex;flex-wrap:wrap;gap:6px 16px;padding:10px 16px;border-top:1px solid var(--card-border);font-size:12.5px;color:var(--text-muted)}
.p2j summary{list-style:none}.p2j summary::-webkit-details-marker{display:none}
.p2j__sum{display:flex;align-items:center;gap:10px;padding:14px 16px;min-height:48px;cursor:pointer;font-weight:800;font-size:14px}
.p2j__sum small{font-weight:600;color:var(--text-muted);font-size:12.5px}
.p2j__chev{margin-left:auto;color:var(--text-muted);transition:transform .2s}.p2j[open] .p2j__chev{transform:rotate(180deg)}
.p2j__tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid var(--card-border)}
.p2j__copy{min-height:44px;padding:0 14px;border-radius:12px;border:0;background:var(--accent,var(--primary,#c49a5f));color:#fff;font-weight:800;font-size:13px;cursor:pointer}
.p2j__ev{list-style:none;margin:0;padding:0;border-top:1px solid var(--card-border);font-size:12.5px}
.p2j__ev li{display:grid;grid-template-columns:minmax(48px,auto) 1fr;gap:10px;padding:8px 16px;border-bottom:1px solid var(--card-border)}
.p2j__ev li:last-child{border-bottom:0}
.p2j__t{color:var(--text-muted);font-variant-numeric:tabular-nums}
.p2j__k{font-weight:700;overflow-wrap:anywhere}.p2j__k--bad{color:var(--danger,#b24a43)}.p2j__k--warn{color:var(--warning,#b8844a)}.p2j__k--ok{color:var(--success,#3f8f5e)}
.p2j__more{padding:10px 16px;font-size:12.5px;color:var(--text-muted);border-top:1px solid var(--card-border)}
.p2s button:focus-visible,.p2j summary:focus-visible{outline:2px solid var(--warning,#b8844a);outline-offset:2px}
@media (min-width:768px){.p2s__btn{flex:none;margin-left:auto}}
@media (min-width:1024px){.p2s__row{grid-template-columns:minmax(0,1fr) 150px minmax(0,1.1fr);align-items:center}}`, zd = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 2l20 20"/><path d="M5.8 10.1A5 5 0 0 0 7 18h10.5"/><path d="M20.9 16.6A4 4 0 0 0 19 10a5 5 0 0 0-7.6-4.3"/></svg>', $r = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>', Wd = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>', X = (t) => String(t ?? "").replace(/[&<>"]/g, (e) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[e]), ir = (t) => String(t).padStart(2, "0");
function qe(t) {
  const e = new Date(t);
  return ir(e.getHours()) + ":" + ir(e.getMinutes());
}
function Xi(t, e) {
  const r = Date.parse(t || "");
  if (!Number.isFinite(r)) return "";
  const n = new Date(r), s = new Date(e), i = (a) => new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime(), o = Math.round((i(s) - i(n)) / 864e5);
  return o === 0 ? "сегодня " + qe(r) : o === 1 ? "вчера " + qe(r) : ir(n.getDate()) + "." + ir(n.getMonth() + 1) + " " + qe(r);
}
const Kd = [
  [/RLS|прав доступа|permission/i, "нет прав"],
  [/не назначен/i, "объект не назначен"],
  [/другим инженером/i, "запись другого инженера"],
  [/Роль не подтверждена/i, "роль не подтверждена"],
  [/роль не может/i, "у роли нет права отправки"]
];
function Vd(t, e, r) {
  const n = String(t.syncStatus ?? t.sync_status ?? ""), s = String(t.syncBlockReason ?? t.sync_block_reason ?? "");
  if (e) {
    const i = String(t.syncBlockHint ?? "");
    if (/^(Не отправлено|Сервер отклонил):/.test(s))
      return { chip: "bad", why: s, hint: i || "запись осталась на телефоне; нажмите «Отправить снова», когда дадут права" };
    const o = Kd.find(([a]) => a.test(s));
    return {
      chip: "bad",
      why: "Сервер отклонил: " + (o ? o[1] : s ? s.charAt(0).toLowerCase() + s.slice(1) : "нет прав"),
      hint: "запись осталась на телефоне; обратитесь к руководителю"
    };
  }
  if (n === "needs_attention") {
    const i = s.replace(/^Не отправлено:\s*/i, "").replace(/^Нужно внимание:\s*/i, "");
    return { chip: "photo", why: i ? i.charAt(0).toUpperCase() + i.slice(1) : "Нет фото на телефоне", hint: "фото нет на телефоне", act: "drop_photos" };
  }
  return r.offline ? { chip: "net", why: "Нет связи", hint: "отправим сами, как появится" } : r.retryAfter > r.now ? r.retryKind === "server" ? { chip: "wait", why: "Сервер не ответил", hint: "повтор в " + qe(r.retryAfter) } : { chip: "wait", why: "Нет ответа сервера", hint: "проверяем связь каждую минуту — отправим сразу" } : { chip: "queue", why: "Ждёт отправки", hint: "уйдёт в ближайшую минуту" };
}
function Jd(t, e) {
  if (typeof e.p2Title == "string" && e.p2Title) return e.p2Title;
  const r = An(t, e), n = typeof e.templateTitle == "string" ? e.templateTitle : typeof e.template == "string" ? e.template : "", s = [e.section, e.floor].map((i) => typeof i == "string" ? i.trim() : "").filter(Boolean).join(", ");
  return [Fe[t] || r.type, n, r.object, s].filter((i, o, a) => i && a.indexOf(i) === o).join(" · ");
}
function Gd(t, e) {
  return t.map(({ store: r, rec: n, rejected: s }) => ({
    store: r,
    id: String(n.id),
    rejected: s,
    title: Jd(r, n),
    when: Xi(An(r, n).date, e.now),
    reason: Vd(n, s, e)
  })).sort((r, n) => Number(r.rejected) - Number(n.rejected));
}
const Yd = { online: "есть", offline: "нет ответа", server: "сервер не отвечает" };
function Xd(t, e) {
  const r = t.items.filter((f) => !f.rejected), n = t.items.filter((f) => f.rejected), s = t.lastOkAt ? Xi(t.lastOkAt, t.now) : "";
  let i;
  if (t.counting === "first")
    i = '<div class="p2s__head"><div class="p2s__ico p2s__ico--wait">' + $r + '</div><div><b class="p2s__title">Отправка</b><span class="p2s__sub" data-testid="p2-sync-counting">Считаем, что не отправлено…</span></div></div>';
  else if (!r.length && n.length)
    i = '<div class="p2s__head"><div class="p2s__ico p2s__ico--warn">' + $r + '</div><div><b class="p2s__title">Не ушло: ' + n.length + '</b><span class="p2s__sub">Само не уйдёт — у каждой записи ниже причина и что делать</span></div></div>';
  else if (!r.length)
    i = '<div class="p2s__head"><div class="p2s__ico p2s__ico--ok">' + Wd + '</div><div><b class="p2s__title">Всё отправлено</b><span class="p2s__sub">' + (s ? "Последняя успешная отправка: " + X(s) : "На этом телефоне нет неотправленных записей") + "</span></div></div>";
  else {
    const f = !t.offline && t.retryAfter > t.now && t.retryKind === "server", g = t.offline ? "Всё сохранено на телефоне и уйдёт само, когда появится связь." : f ? "Связь есть, сервер не ответил — отправим сами в " + qe(t.retryAfter) + "." : "Всё сохранено на телефоне и уйдёт само.";
    i = '<div class="p2s__head"><div class="p2s__ico p2s__ico--warn">' + (t.offline ? zd : $r) + '</div><div><b class="p2s__title">' + (t.offline ? "Нет связи · " : "") + "не отправлено: " + r.length + '</b><span class="p2s__sub">' + X(g) + '</span></div><button class="p2s__btn" type="button" data-act="sync" data-testid="p2-sync-now">Отправить сейчас</button></div>';
  }
  const o = (f) => '<li class="p2s__row" data-testid="p2-sync-item" data-id="' + X(f.id) + '" data-chip="' + f.reason.chip + '"><div class="p2s__name">' + X(f.title) + '</div><div class="p2s__when">' + (f.when ? "записано " + X(f.when) : "") + '</div><div class="p2s__why"><span class="p2s__chip p2s__chip--' + f.reason.chip + '">' + X(f.reason.why) + '</span><span class="p2s__hint">' + X(f.reason.hint) + "</span>" + (f.reason.act === "drop_photos" && f.store === "app_history" ? '<button class="p2s__act" type="button" data-act="drop" data-id="' + X(f.id) + '">Отправить без этого фото</button>' : "") + "</div></li>", a = r.length ? '<ul class="p2s__list">' + r.map(o).join("") + "</ul>" : "", l = n.length ? '<div class="p2s__group p2s__group--act">Не ушло, нужно действие: ' + n.length + '<button class="p2s__act" type="button" data-act="retry" data-testid="p2-sync-retry">Отправить снова</button></div><ul class="p2s__list">' + n.map(o).join("") + "</ul>" : "", c = [];
  (r.length || n.length) && c.push("Последняя успешная отправка: " + (s ? X(s) : "ещё не было")), t.counting === "refresh" && t.countedAt && c.push('<span data-testid="p2-sync-counting">Обновляем · список на ' + qe(t.countedAt) + "</span>"), t.probe && t.probeAt && c.push("Проверка связи: " + X(Yd[t.probe] || t.probe) + ", " + qe(t.probeAt));
  const u = c.length ? '<div class="p2s__foot">' + c.map((f) => f.startsWith("<span") ? f : "<span>" + f + "</span>").join("") + "</div>" : "", d = '<section class="p2s" role="status" data-testid="p2-net-device">' + i + a + l + u + "</section>", p = t.journal.length ? '<ul class="p2j__ev" data-testid="p2-sync-journal-list">' + t.journal.map((f) => '<li><span class="p2j__t">' + X(f.t) + '</span><span class="p2j__k' + (f.tone ? " p2j__k--" + f.tone : "") + '">' + X(f.text) + "</span></li>").join("") + '</ul><div class="p2j__more">Показаны последние ' + t.journal.length + " · хранится до 500 событий на этом телефоне</div>" : '<div class="p2j__more">Событий пока нет</div>', h = '<details class="p2s p2j" data-testid="p2-sync-journal"' + (e ? " open" : "") + '><summary class="p2j__sum">Журнал синхронизации <small>· ' + t.journalTotal + " " + Qd(t.journalTotal, "событие", "события", "событий") + '</small><span class="p2j__chev" aria-hidden="true">▼</span></summary><div class="p2j__tools"><button class="p2j__copy" type="button" data-act="copy" data-testid="p2-sync-copy">Скопировать отчёт для разработчика</button><span class="p2s__hint">В отчёте нет содержимого записей и имён — только время, счётчики и ошибки.</span></div>' + p + "</details>";
  return '<div class="space-y-3">' + d + h + "</div>";
}
function Qd(t, e, r, n) {
  const s = Math.abs(t) % 100, i = s % 10;
  return s > 10 && s < 20 ? n : i > 1 && i < 5 ? r : i === 1 ? e : n;
}
const Zd = [
  { id: "quality", name: "Качество и Стройконтроль", what: "Осмотры, замечания, планы СК — одна база на телефоне", offline: null, files: "quality", code: ["quality", "construction", "construction-v2"] },
  { id: "planfact", name: "План/Факт", what: "Сводка, ВОР, Факт, шахматка, журнал, КС-2 и сметы — по моим проектам", offline: null, files: null, code: ["planfact"] },
  { id: "company", name: "Компания", what: "Проекты и объекты, места, сотрудники и роли, контрагенты", offline: null, files: null, code: ["company"] },
  { id: "knowledge", name: "База знаний", what: "Документы, TWI, тех. узлы, эталоны", offline: null, files: "knowledge", code: [] },
  { id: "ai", name: "ИИ-помощник", what: "Вопросы к базе знаний", offline: null, files: null, code: [] }
], eh = ["twi_photo", "twi_pdf", "node_file", "custom_doc_pdf", "assistant_kb_file", "etalon_file"];
function th(t, e) {
  return Zd.filter((r) => r.id === "quality" ? t("quality") || t("construction") : t(r.id)).map((r) => ({ ...r, offline: e(r.id === "quality" ? "quality" : r.id) }));
}
function rh(t) {
  return !t || !t.view ? { text: "Только онлайн", kind: "on" } : eu(t, "*", !0) ? { text: "Без сети: смотреть", kind: "ro" } : { text: "Без сети: смотреть и вносить", kind: "rw" };
}
function nh(t) {
  const e = {};
  for (const r of t.matchAll(/^\s*"[^"]+": \["[0-9a-f]+",(\d+),"([^"]*)"\]/gm)) e[r[2]] = (e[r[2]] || 0) + Number(r[1]);
  return e;
}
function sh(t) {
  const e = { quality: 0, knowledge: 0 };
  for (const r of t) {
    const n = String(r.cache_status || r.cacheStatus || "");
    if (n !== "cached_cloud" && n !== "cached_local") continue;
    const s = Number(r.size_bytes || r.sizeBytes || 0) || 0;
    eh.includes(String(r.entity_type || r.entityType || "")) ? e.knowledge += s : e.quality += s;
  }
  return e;
}
const mt = (t) => {
  if (!t) return "0 КБ";
  const e = (r, n) => (r < 10 ? r.toFixed(1) : Math.round(r).toString()).replace(".", ",") + " " + n;
  return t < 1048576 ? e(t / 1024, "КБ") : t < 1073741824 ? e(t / 1048576, "МБ") : e(t / 1073741824, "ГБ");
}, Ae = (t) => t.replace(/[&<>"]/g, (e) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[e]), ih = (t) => {
  const e = new Date(t), r = /* @__PURE__ */ new Date(), n = String(e.getHours()).padStart(2, "0") + ":" + String(e.getMinutes()).padStart(2, "0"), s = e.toDateString() === r.toDateString(), i = new Date(r);
  return i.setDate(r.getDate() - 1), (s ? "сегодня " : e.toDateString() === i.toDateString() ? "вчера " : String(e.getDate()).padStart(2, "0") + "." + String(e.getMonth() + 1).padStart(2, "0") + " ") + n;
}, oh = `
.p2o{background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:16px;overflow:hidden;margin:12px 0}
.p2o__head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 16px}
.p2o__ico{width:44px;height:44px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--accent,var(--primary,#c49a5f));background:color-mix(in srgb,var(--accent,var(--primary,#c49a5f)) 14%,transparent)}
.p2o__title{display:block;font-size:16px;font-weight:800;line-height:1.25}
.p2o__sub{display:block;font-size:13px;color:var(--text-muted);margin-top:2px}
.p2o__total{margin-left:auto;font-size:12.5px;color:var(--text-muted);text-align:right}.p2o__total b{color:var(--text-main);font-size:14px}
.p2o__bar{height:6px;border-radius:999px;background:color-mix(in srgb,var(--text-muted) 16%,transparent);overflow:hidden;margin-top:6px;min-width:160px}
.p2o__bar i{display:block;height:100%;background:var(--accent,var(--primary,#c49a5f))}
.p2o__mod{border-top:1px solid var(--card-border);padding:14px 16px;display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:start}
.p2o__name{font-size:15px;font-weight:800}.p2o__what{display:block;font-size:12.5px;color:var(--text-muted);margin-top:2px}
.p2o__chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-weight:700;font-size:12px;margin-top:6px}
.p2o__chip--rw{color:var(--success,#3f8f5e);background:color-mix(in srgb,var(--success,#3f8f5e) 13%,transparent)}
.p2o__chip--ro{color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 13%,transparent)}
.p2o__chip--on{color:var(--text-muted);background:color-mix(in srgb,var(--text-muted) 14%,transparent)}
.p2o__sw{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;white-space:nowrap;cursor:pointer;min-height:44px}
.p2o__sw input{position:absolute;opacity:0;width:1px;height:1px}
.p2o__sw span{width:44px;height:26px;border-radius:999px;background:color-mix(in srgb,var(--text-muted) 35%,transparent);position:relative;display:inline-block;flex:none}
.p2o__sw span::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}
.p2o__sw input:checked+span{background:var(--accent,var(--primary,#c49a5f))}.p2o__sw input:checked+span::after{left:21px}
.p2o__sw input:focus-visible+span{outline:2px solid var(--warning,#b8844a);outline-offset:2px}
.p2o__body{grid-column:1/-1;display:flex;flex-direction:column;gap:10px;min-width:0}
.p2o__size{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--text-muted)}.p2o__size b{color:var(--text-main)}
.p2o__field{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:700;color:var(--text-muted)}
.p2o__sel{min-height:44px;border-radius:12px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);font-size:14px;font-weight:600;padding:0 12px;max-width:420px}
.p2o__last{font-size:12.5px;color:var(--text-muted)}
.p2o__btns{display:flex;flex-wrap:wrap;gap:8px}
.p2o__btn{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);font-weight:700;font-size:13px;cursor:pointer}
.p2o__btn--main{background:var(--accent,var(--primary,#c49a5f));border-color:transparent;color:#fff}
.p2o__btn--danger{color:var(--danger,#b24a43);border-color:color-mix(in srgb,var(--danger,#b24a43) 40%,transparent)}
.p2o__btn:disabled{opacity:.55;cursor:default}
.p2o__btn:focus-visible,.p2o__sel:focus-visible{outline:2px solid var(--warning,#b8844a);outline-offset:2px}
.p2o__mod--online .p2o__name{color:var(--text-muted)}
.p2o__foot{border-top:1px solid var(--card-border);padding:12px 16px;font-size:12.5px;color:var(--text-muted);display:flex;gap:8px;align-items:flex-start}
.p2o-dlg{position:fixed;inset:0;z-index:12000;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.45);padding:16px}
.p2o-dlg__box{width:100%;max-width:440px;background:var(--card-bg);color:var(--text-main);border-radius:18px;border:1px solid var(--card-border);padding:18px;display:flex;flex-direction:column;gap:10px}
.p2o-dlg__t{font-size:17px;font-weight:800}.p2o-dlg__p{font-size:14px;color:var(--text-muted);line-height:1.45}
@media (min-width:768px){.p2o-dlg{align-items:center}.p2o__body{grid-column:1/2}}
@media (max-width:599px){.p2o__total{margin-left:0;text-align:left;flex:1 1 100%}.p2o__sel{max-width:none}}`, Qi = "считаем…", or = (t) => t === null ? Qi : mt(t), ah = (t) => {
  const e = new Date(t);
  return String(e.getHours()).padStart(2, "0") + ":" + String(e.getMinutes()).padStart(2, "0");
}, lh = {
  quality: wn.map((t) => [t, qi[t]]),
  knowledge: [["all", "Все"], ["none", "Не скачивать заранее"]]
};
function Zi(t) {
  return [
    t.codeBytes ? `<span>Код <b>${mt(t.codeBytes)}</b></span>` : t.codeBytes === null && t.row.code.length ? `<span>Код <b>${Qi}</b></span>` : "",
    t.copyBytes || t.row.id === "planfact" || t.row.id === "company" ? `<span>Данные <b>${or(t.copyBytes)}</b></span>` : "",
    t.row.files ? `<span>${t.row.files === "knowledge" ? "Документы и TWI" : "Фото и PDF"} <b>${or(t.fileBytes)}</b></span>` : ""
  ].filter(Boolean).join("");
}
function eo(t, e = 0) {
  const { used: r, free: n } = t, s = r !== null && n !== null && r + n > 0 ? Math.max(1, Math.round(r * 100 / (r + n))) : 0;
  return `На телефоне <b>${or(r)}</b> · свободно ${or(n)}${e ? " · на " + ah(e) : ""}<div class="p2o__bar"><i style="width:${s}%"></i></div>`;
}
function zs(t, e, r, n = 0) {
  const s = (i) => {
    const o = rh(i.row.offline), a = o.kind === "on", l = i.row.files ? `<label class="p2o__field">${i.row.files === "knowledge" ? "Документы заранее" : "Фото и PDF заранее"}<select class="p2o__sel" data-act="scope" data-mod="${i.row.files}" id="p2o-scope-${i.row.id}"${i.keep ? "" : " disabled"}>` + lh[i.row.files].map(([c, u]) => `<option value="${c}"${c === i.scope ? " selected" : ""}>${Ae(u)}${c === i.roleScope ? " · по роли" : ""}</option>`).join("") + "</select></label>" : "";
    return `<div class="p2o__mod${a ? " p2o__mod--online" : ""}" data-mod="${i.row.id}" data-testid="p2o-mod-${i.row.id}"><div><span class="p2o__name">${Ae(i.row.name)}</span><span class="p2o__what">${Ae(i.row.what)}</span><span class="p2o__chip p2o__chip--${o.kind}">${o.text}</span></div>` + (a ? "" : `<label class="p2o__sw"><input type="checkbox" data-act="keep" data-mod="${i.row.id}" id="p2o-keep-${i.row.id}"${i.keep ? " checked" : ""}><span aria-hidden="true"></span>Держать без сети</label><div class="p2o__body"><div class="p2o__size" data-testid="p2o-size-${i.row.id}">${Zi(i)}</div>${l}<div class="p2o__last">${Ae(i.last)}</div><div class="p2o__btns"><button type="button" class="p2o__btn p2o__btn--main" data-act="download" data-mod="${i.row.id}"${i.keep ? "" : " disabled"}>Скачать сейчас</button>` + (i.row.id === "quality" ? '<button type="button" class="p2o__btn" data-act="reports" data-mod="quality">Отчёты на телефон</button>' : "") + `<button type="button" class="p2o__btn p2o__btn--danger" data-act="clear" data-mod="${i.row.id}" data-testid="p2o-clear-${i.row.id}">Очистить скачанное</button></div></div>`) + "</div>";
  };
  return `<section class="p2o" data-testid="p2-offline-modules"><div class="p2o__head"><div class="p2o__ico" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/></svg></div><div style="flex:1 1 220px;min-width:0"><span class="p2o__title">Офлайн по модулям</span><span class="p2o__sub">Что телефон держит без сети. По умолчанию — по вашей роли: ${Ae(r)}. Можно поменять у каждого модуля.</span></div><div class="p2o__total" data-testid="p2o-total">${eo(e, n)}</div></div>` + t.map(s).join("") + '<div class="p2o__foot"><span>Неотправленное («не отправлено: N») не удаляется никогда — ни очисткой, ни правилом по роли. Без сети раздел покажет то, что скачано заранее или открывалось.</span></div></section>';
}
const Ws = { engineer: "инженер качества", contractor: "подрядчик", manager: "руководитель", director: "руководство", guest: "просмотр" }, pn = { code: null, copy: null, files: null, used: null, free: null, at: 0 }, ch = 10 * 6e4, to = "platform2_offline_figures:";
function uh(t) {
  try {
    const e = JSON.parse(localStorage.getItem(to + t) || "null");
    if (e && typeof e == "object") return { ...pn, ...e };
  } catch {
  }
  return { ...pn };
}
function dh(t, e) {
  try {
    localStorage.setItem(to + t, JSON.stringify(e));
  } catch {
  }
}
function hh(t, e) {
  var c;
  const r = t.RBI || {}, n = (c = r.services) == null ? void 0 : c.shell, s = r.platformMenuAccess || {}, i = (u) => {
    var d, p;
    return u === "planfact" ? !!((d = n == null ? void 0 : n.isPlatformModuleAllowed) != null && d.call(n, "planfact")) : u === "company" ? s.company === !0 : !!((p = n == null ? void 0 : n.legacyModuleAllowed) != null && p.call(n, u));
  }, o = (u) => {
    var d, p;
    return Bi(((p = (d = r.moduleLoader) == null ? void 0 : d.getById) == null ? void 0 : p.call(d, u)) || null);
  }, a = Sn();
  return { rows: th(i, o).map((u) => {
    const d = kn(u.id === "quality" ? "quality" : u.id), p = u.files === "quality" ? an("quality") || tn(a) : u.files === "knowledge" ? an("knowledge") || rn(a) : null, h = u.files === "quality" ? tn(a) : u.files === "knowledge" ? rn(a) : null, f = vu(u.id), g = d ? u.files === "quality" ? ln() === "none" ? "Фото заранее не скачиваются — открытые остаются на телефоне" : "Фото и PDF заранее: " + qi[ln()].toLowerCase() : u.files === "knowledge" ? zi() === "none" ? "Открытые документы остаются на телефоне" : "Документы заранее: все" : f ? "Скачано заранее: " + ih(f.at) : "Заранее ещё не скачивалось — скачается, когда будет связь" : "Заранее не скачивается — без сети раздел покажет то, что вы открывали", m = e.code;
    return {
      row: u,
      keep: d,
      scope: p,
      roleScope: h,
      last: g,
      codeBytes: m ? u.code.reduce((y, _) => y + (m[_] || 0), 0) : u.code.length ? null : 0,
      copyBytes: u.id === "planfact" || u.id === "company" ? e.copy ? e.copy[u.id] || 0 : null : 0,
      fileBytes: u.files ? e.files ? e.files[u.files] : null : 0
    };
  }), total: { used: e.used, free: e.free }, role: a };
}
let Lr = null;
const Dr = {};
async function fh(t, e, r = pn, n = !1) {
  const s = (i, o) => Dr[i] || (Dr[i] = o().then((a) => {
    a && e(i, a);
  }, () => {
  }).finally(() => {
    delete Dr[i];
  }));
  await Promise.all([
    s("code", async () => {
      if (!Lr)
        try {
          Lr = nh(await (await fetch("./sw.js")).text());
        } catch {
          return { code: {} };
        }
      return { code: Lr };
    }),
    s("files", async () => {
      var a;
      const i = (a = t.STORES) == null ? void 0 : a.FILE_REGISTRY;
      if (!t.dbGetAll || !i) return null;
      const o = t.dbCount ? await t.dbCount(i).catch(() => -1) : -1;
      return !n && r.files && o >= 0 && o === r.filesN && Date.now() - (r.filesAt || 0) < ch ? { files: r.files } : { files: sh(await t.dbGetAll(i)), filesN: o, filesAt: Date.now() };
    }),
    s("memory", async () => {
      const i = await navigator.storage.estimate(), o = i.usage || 0;
      return { used: o, free: Math.max(0, (i.quota || 0) - o) };
    }),
    s("copy", async () => {
      const i = fr(), [o, a] = await Promise.all([i.size("planfact"), i.size("company")]);
      return { copy: { planfact: o, company: a } };
    })
  ]);
}
function ph(t) {
  if (t.getElementById("p2o-css")) return;
  const e = t.createElement("style");
  e.id = "p2o-css", e.textContent = oh, t.head.appendChild(e);
}
function Ks(t, e, r, n, s) {
  return new Promise((i) => {
    const o = t.createElement("div");
    o.className = "p2o-dlg", o.setAttribute("role", "dialog"), o.setAttribute("aria-modal", "true"), o.setAttribute("data-testid", "p2o-confirm"), o.innerHTML = `<div class="p2o-dlg__box"><div class="p2o-dlg__t">${Ae(e)}</div><div class="p2o-dlg__p">${Ae(r)}</div><div class="p2o__btns"><button type="button" class="p2o__btn ${s ? "p2o__btn--danger" : "p2o__btn--main"}" data-yes style="flex:1">${Ae(n)}</button><button type="button" class="p2o__btn" data-no style="flex:1">${s ? "Отмена" : "Оставить"}</button></div></div>`;
    const a = (l) => {
      o.remove(), i(l);
    };
    o.addEventListener("click", (l) => {
      const c = l.target;
      c.closest("[data-yes]") ? a(!0) : (c.closest("[data-no]") || c === o) && a(!1);
    }), t.body.appendChild(o), o.querySelector("[data-yes]").focus();
  });
}
let Vs = null, Js = 0, Se = null;
const gh = 1e4;
function Gs(t, e) {
  if (!Se) return;
  const { f: r, fresh: n } = Se, s = hh(e, r), i = n.has("memory") ? 0 : r.at, o = zs(s.rows, s.total, Ws[s.role] || "просмотр", i), a = zs(s.rows.map((c) => ({ ...c, codeBytes: 0, copyBytes: 0, fileBytes: 0 })), { used: 0, free: 0 }, Ws[s.role] || "просмотр"), l = t;
  if (l.__p2oShape === a && t.firstChild) {
    for (const d of s.rows) {
      const p = t.querySelector(`[data-testid=p2o-size-${d.row.id}]`), h = Zi(d);
      p && p.innerHTML !== h && (p.innerHTML = h);
    }
    const c = t.querySelector("[data-testid=p2o-total]"), u = eo(s.total, i);
    c && c.innerHTML !== u && (c.innerHTML = u);
  } else t.dataset.p2o !== o && (t.innerHTML = o);
  t.dataset.p2o = o, l.__p2oShape = a, l.__p2oRows = s.rows, Vs !== t && (Vs = t, mh(t, e));
}
async function ro(t, e = !1) {
  if (!t) return;
  const r = t.ownerDocument, n = de();
  if (!n) {
    t.replaceChildren();
    return;
  }
  ph(r);
  const s = r.defaultView;
  if ((!Se || Se.slot !== n) && (Se = { slot: n, f: uh(n), fresh: /* @__PURE__ */ new Set() }), Gs(t, s), !e && Date.now() - Js < gh) return;
  Js = Date.now();
  const i = Se;
  i.fresh.clear(), await fh(s, (o, a) => {
    Se === i && (i.f = { ...i.f, ...a }, i.fresh.add(o), Gs(t, s));
  }, i.f, e), Se === i && (i.f = { ...i.f, at: Date.now() }, dh(n, i.f));
}
function mh(t, e) {
  const r = t.ownerDocument, n = () => t.__p2oRows || [], s = () => {
    ro(t, !0);
  }, i = (o) => {
    typeof e.showToast == "function" && e.showToast(o);
  };
  t.addEventListener("change", (o) => {
    var p, h, f, g;
    const a = o.target, l = a.dataset.mod || "";
    if (a.dataset.act === "scope") {
      bu(l, a.value), s();
      return;
    }
    if (a.dataset.act !== "keep") return;
    const c = a;
    if (c.checked) {
      Ps(l, !0), s(), (l === "planfact" || l === "company") && ((f = (h = (p = e.RBI) == null ? void 0 : p.offlinePrefetch) == null ? void 0 : h[l]) == null || f.call(h, !0));
      return;
    }
    c.checked = !0;
    const u = ((g = n().find((m) => m.row.id === l)) == null ? void 0 : g.row.name) || "", d = l === "quality" ? "Записи останутся на телефоне — без них Качество не работает. Фото и PDF заранее скачиваться не будут, открытые останутся." : "Заранее ничего не будет скачиваться. Без сети раздел покажет только то, что вы открывали с интернетом.";
    Ks(r, `Не держать ${u} без сети?`, d, "Выключить", !1).then((m) => {
      m && (Ps(l, !1), s());
    });
  }), t.addEventListener("click", (o) => {
    var u, d, p, h, f, g;
    const a = o.target.closest("button[data-act]");
    if (!a || a.disabled) return;
    const l = a.dataset.mod || "", c = a.dataset.act;
    if (c === "download") {
      a.disabled = !0;
      const m = l === "quality" ? (u = e.downloadMissingCloudFiles) == null ? void 0 : u.call(e, !1, "auto") : l === "knowledge" ? (d = e.downloadMissingCloudFiles) == null ? void 0 : d.call(e, !1, "knowledge") : (f = (h = (p = e.RBI) == null ? void 0 : p.offlinePrefetch) == null ? void 0 : h[l]) == null ? void 0 : f.call(h, !0);
      (l === "planfact" || l === "company") && i("⏳ Скачиваем " + (l === "planfact" ? "План/Факт" : "«Компанию»") + " для работы без сети…"), Promise.resolve(m).catch(() => {
      }).then(() => {
        (l === "planfact" || l === "company") && i("✅ Скачано для работы без сети"), s();
      });
      return;
    }
    if (c === "reports") {
      Promise.resolve((g = e.downloadMissingCloudFiles) == null ? void 0 : g.call(e, !1, "reports")).then(s);
      return;
    }
    if (c === "clear") {
      const m = n().find((_) => _.row.id === l), y = m ? (m.copyBytes || 0) + (m.fileBytes || 0) : 0;
      Ks(
        r,
        `Очистить скачанное: ${m ? m.row.name : ""}?`,
        `Освободится до ${mt(y)}. Неотправленные записи и фото останутся на телефоне и уйдут, когда будет связь. Открытое снова скачается, когда понадобится.`,
        "Очистить " + mt(y),
        !0
      ).then(async (_) => {
        var E;
        if (!_) return;
        let w = 0;
        if (l === "planfact" || l === "company")
          w = m && m.copyBytes || 0, await fr().clear(l);
        else if ((E = e.RbiStorageManager) != null && E.runManualRecoverableCacheCleanup) {
          const R = await e.RbiStorageManager.runManualRecoverableCacheCleanup({ only: l === "knowledge" ? "knowledge" : "quality", noRefill: !0, silent: !0 });
          w = R && R.freedBytes || 0;
        }
        i(`✅ Освобождено ${mt(w)}. Неотправленное на месте`), s();
      });
    }
  });
}
const no = (t, e) => t.createdAt < e.createdAt ? -1 : t.createdAt > e.createdAt ? 1 : t.id < e.id ? -1 : 1;
function yh() {
  const t = /* @__PURE__ */ new Map();
  return {
    size: () => t.size,
    async get(e) {
      return t.get(e) ? { ...t.get(e) } : null;
    },
    async put(e) {
      t.set(e.id, { ...e });
    },
    async delete(e) {
      t.delete(e);
    },
    async list(e, r) {
      return [...t.values()].filter((n) => n.slot === e && (!r || n.module === r)).map((n) => ({ ...n })).sort(no);
    }
  };
}
const _h = "platform2_device_records", Ur = "records";
function wh(t) {
  let e = null;
  const r = () => e || (e = new Promise((s, i) => {
    const o = t.open(_h, 1);
    o.onupgradeneeded = () => {
      o.result.createObjectStore(Ur, { keyPath: "id" }).createIndex("slot", "slot", { unique: !1 });
    }, o.onsuccess = () => {
      const a = o.result;
      a.onversionchange = () => {
        a.close(), e = null;
      }, s(a);
    }, o.onerror = () => {
      e = null, i(o.error);
    };
  })), n = async (s, i) => {
    const o = await r();
    return new Promise((a, l) => {
      const c = o.transaction(Ur, s), u = i(c.objectStore(Ur));
      s === "readwrite" ? (c.oncomplete = () => a(u.result), c.onerror = () => l(c.error)) : (u.onsuccess = () => a(u.result), u.onerror = () => l(u.error));
    });
  };
  return {
    async get(s) {
      try {
        return await n("readonly", (i) => i.get(s)) || null;
      } catch {
        return null;
      }
    },
    // ошибку записи не глотаем: экран должен узнать, что факт на телефоне не сохранился
    async put(s) {
      await n("readwrite", (i) => i.put(s));
    },
    async delete(s) {
      try {
        await n("readwrite", (i) => i.delete(s));
      } catch {
      }
    },
    async list(s, i) {
      try {
        const o = await n("readonly", (a) => a.index("slot").getAll(s));
        return (i ? o.filter((a) => a.module === i) : o).sort(no);
      } catch {
        return [];
      }
    }
  };
}
const vh = (t) => t.syncStatus !== "synced" && !t.syncServerRejected;
function bh(t) {
  const e = {};
  for (const r of t || []) for (const n of r.sync || [])
    n && n.kind && n.rpc && !e[n.kind] && (e[n.kind] = { kind: n.kind, module: r.id, rpc: n.rpc, title: n.title || n.kind, store: n.store });
  return e;
}
const kh = /failed to fetch|networkerror|network|load failed|aborted|timeout|fetch/i;
function Sh(t, e) {
  if (e !== void 0 || !t) return { kind: "net" };
  if (!t.error) return { kind: "ok", value: t.data ?? null };
  const r = Number(t.status || 0), n = String(t.error.message || "");
  return !r || r >= 500 || r === 401 || r === 408 || r === 429 || kh.test(n) && !/[А-Яа-яЁё]/.test(n) ? { kind: "net" } : { kind: "rejected", message: /[А-Яа-яЁё]/.test(n) ? n.replace(/^\s*ERROR:\s*/i, "").slice(0, 300) : "отказ сервера" + (t.error.code ? " (" + t.error.code + ")" : "") };
}
const Eh = { planfact: "План/Факт", quality: "Качество", construction: "Стройконтроль" }, xh = "Исправьте условие (бригада, позиция, права) и нажмите «Отправить снова»";
function Ys(t) {
  return [3e4, 6e4, 12e4, 3e5][Math.min(Math.max(t, 1), 4) - 1];
}
const Ah = 72 * 3600 * 1e3;
function Th(t, e) {
  return new Promise((r, n) => {
    const s = setTimeout(() => n(new Error("timeout")), e);
    t.then((i) => {
      clearTimeout(s), r(i);
    }, (i) => {
      clearTimeout(s), n(i);
    });
  });
}
function Rh(t) {
  const e = t.callMs ?? 2e4, r = t.passMs ?? 45e3;
  async function n(i, o) {
    let a = null, l;
    try {
      a = await Th(t.call(o.rpc, { p_client_id: i.id, p_entry: i.payload }), e);
    } catch (c) {
      l = c ?? "error";
    }
    return Sh(a, l);
  }
  async function s(i, o) {
    var p, h, f, g;
    const a = t.slot();
    if (!a) return;
    const l = t.now(), c = await t.store.list(a), u = t.modules();
    let d = !1;
    for (const m of c) {
      if (m.syncStatus === "synced") {
        l - Date.parse(m.sentAt || m.createdAt) > Ah && await t.store.delete(m.id);
        continue;
      }
      if (!vh(m)) {
        o.rejected++;
        continue;
      }
      const y = t.kinds[m.kind];
      if (!y) {
        o.left++;
        continue;
      }
      if (u && !u.includes(y.module)) {
        const E = "Не отправлено: модуль «" + (Eh[y.module] || y.module) + "» выключен у компании";
        (m.syncStatus !== "blocked" || m.syncBlockReason !== E) && (await t.store.put({ ...m, syncStatus: "blocked", syncBlockReason: E, syncBlockHint: "Запись сохранена на телефоне; уйдёт, когда администратор компании включит модуль" }), (p = t.changed) == null || p.call(t)), o.blocked++;
        continue;
      }
      if (o.net || t.now() - l > r) {
        o.left++;
        continue;
      }
      d || (d = !0, (h = t.journal) == null || h.call(t, { k: "start", mode: i, why: "device_records" }));
      const _ = await n(m, y), w = await t.store.get(m.id) || m;
      _.kind === "ok" ? (await t.store.put({ ...w, syncStatus: "synced", result: _.value, sentAt: new Date(t.now()).toISOString(), syncBlockReason: "", syncBlockHint: "", syncServerRejected: !1, tries: (w.tries || 0) + 1 }), o.sent++) : _.kind === "rejected" ? (await t.store.put({ ...w, syncStatus: "blocked", syncServerRejected: !0, syncBlockReason: "Сервер отклонил: " + _.message, syncBlockHint: xh, tries: (w.tries || 0) + 1 }), o.rejected++) : (await t.store.put({ ...w, syncStatus: "not_synced", syncBlockReason: "", tries: (w.tries || 0) + 1 }), o.net = !0, o.left++), (f = t.changed) == null || f.call(t);
    }
    d && ((g = t.journal) == null || g.call(t, { k: "end", mode: i, why: "device_records", ok: !o.net, pushed: o.sent, rejected: o.rejected, unsent: o.left, ms: t.now() - l, ...o.net ? { err: "нет связи" } : {} }));
  }
  return {
    /** Один проход: всё, что ждёт отправки у вошедшего. */
    async run(i = "silent") {
      const o = { sent: 0, rejected: 0, blocked: 0, left: 0, net: !1, busy: !1 }, a = () => s(i, o);
      return t.lock ? await t.lock(a) || (o.busy = !0) : await a(), o;
    },
    /** «Отправить снова»: отклонённые сервером и «Не отправлено» — снова в отправку (id тот же — дубля нет). Возвращает число. */
    async resetRejected() {
      var a;
      const i = t.slot();
      if (!i) return 0;
      let o = 0;
      for (const l of await t.store.list(i))
        l.syncStatus === "blocked" && (await t.store.put({ ...l, syncStatus: "not_synced", syncServerRejected: !1, syncBlockReason: "", syncBlockHint: "" }), o++);
      return o && ((a = t.changed) == null || a.call(t)), o;
    },
    /** Не ушедшие записи вошедшего (ждут и отклонённые) — для счётчика, «Отправка» и пометок модуля. */
    async pending(i) {
      const o = t.slot();
      return o ? (await t.store.list(o, i)).filter((a) => a.syncStatus !== "synced") : [];
    }
  };
}
const so = "rbi:device-records", Oh = "p2-device-records", Tn = () => typeof window > "u" ? void 0 : window, Ch = () => {
  var t, e, r, n;
  return (n = (r = (e = (t = Tn()) == null ? void 0 : t.RBI) == null ? void 0 : e.platform2) == null ? void 0 : r.getState) == null ? void 0 : n.call(r);
}, Bt = "__platform2DeviceSend";
function ot() {
  const t = globalThis;
  if (t[Bt]) return t[Bt];
  const e = typeof indexedDB < "u" ? wh(indexedDB) : yh(), r = bh(En), n = Rh({
    store: e,
    kinds: r,
    slot: de,
    modules: () => {
      var o;
      const s = Ch(), i = (o = s == null ? void 0 : s.companies) == null ? void 0 : o.find((a) => a.id === s.companyId);
      return i && Array.isArray(i.modules) ? i.modules : null;
    },
    async call(s, i) {
      const o = st();
      if (!o) throw new Error("network");
      const { data: a, error: l, status: c } = await o.rpc(s, i);
      return { data: a, error: l ? { message: l.message, code: l.code } : null, status: c };
    },
    now: () => Date.now(),
    lock: async (s) => {
      const i = typeof navigator < "u" ? navigator.locks : void 0;
      return !i || typeof i.request != "function" ? (await s(), !0) : i.request(Oh, { ifAvailable: !0 }, async (o) => o ? (await s(), !0) : !1);
    },
    journal: (s) => {
      var i, o;
      try {
        (o = (i = Tn()) == null ? void 0 : i.RbiSyncJournal) == null || o.add(s);
      } catch {
      }
    },
    changed: () => {
      typeof window < "u" && window.dispatchEvent(new Event(so));
    }
  });
  return t[Bt] = { store: e, kinds: r, sender: n, fails: 0, timer: null, running: null, again: !1, wired: !1 }, t[Bt];
}
function Br(t) {
  const e = ot();
  e.timer && clearTimeout(e.timer), e.timer = setTimeout(() => {
    e.timer = null, le("silent");
  }, t);
}
async function le(t = "silent") {
  const e = ot();
  if (bn() || !de()) return null;
  if (e.running)
    return e.again = !0, e.running;
  e.running = e.sender.run(t);
  try {
    const r = await e.running;
    return r.net ? (e.fails++, Br(Ys(e.fails))) : (e.fails = 0, (r.busy || r.left) && Br(3e4)), r;
  } catch {
    return e.fails++, Br(Ys(e.fails)), null;
  } finally {
    e.running = null, e.again && (e.again = !1, le(t));
  }
}
const ar = (t) => ot().sender.pending(t), io = () => ot().sender.resetRejected();
async function Ih() {
  const t = ot().kinds;
  return (await ar().catch(() => [])).map((e) => {
    var r;
    return {
      store: "device_records",
      rejected: e.syncStatus === "blocked",
      rec: { ...e, date: e.createdAt, p2Title: [((r = t[e.kind]) == null ? void 0 : r.title) || e.kind, String(e.view.title || "")].filter(Boolean).join(" · ") }
    };
  });
}
function jh() {
  const t = ot();
  if (t.wired || typeof window > "u") return;
  t.wired = !0, window.addEventListener("online", () => {
    t.fails = 0, le();
  }), window.addEventListener("rbi:platform-net", () => {
    le();
  }), window.addEventListener("rbi:platform-access", () => {
    le();
  });
  const e = Tn();
  e && ((e.RBI = e.RBI || {}).deviceSend = { run: le, pending: ar, reset: io }), setInterval(() => {
    ar().then((r) => {
      r.some((n) => !n.syncServerRejected) && !t.timer && le();
    });
  }, 6e4), le();
}
const Ph = "rbi:net-status", Xs = "#/settings/my/device", Qs = "p2-net-style", Nh = 6e3, $h = `
.p2-offline #desk-sync-status,.p2-offline #header-sync-status{display:none!important}
.p2-net{display:inline-flex;align-items:center;gap:6px;margin-left:6px;height:26px;padding:0 10px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;cursor:pointer;
  color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent);border:1px solid color-mix(in srgb,var(--warning,#b8844a) 35%,transparent)}
.p2-net:focus-visible{outline:2px solid var(--warning,#b8844a);outline-offset:2px}
.p2-net svg{flex:none}.p2-net b{font-weight:800}.p2-net__sep{opacity:.5}
.p2-net--row{margin-left:auto;height:32px;padding:0 12px}
.p2-net--rail{margin:8px auto;height:32px;padding:0 10px;justify-content:center}
.p2-banner{position:fixed;left:50%;transform:translateX(-50%);z-index:900;display:flex;align-items:center;gap:10px;max-width:min(560px,calc(100vw - 32px));width:max-content;
  padding:10px 12px 10px 14px;border-radius:14px;font-size:13.5px;font-weight:600;color:var(--text-main);background:var(--card-bg);
  border:1px solid color-mix(in srgb,var(--warning,#b8844a) 45%,transparent);box-shadow:0 8px 24px rgba(0,0,0,.14)}
.p2-banner svg{color:var(--warning,#b8844a);flex:none}
.p2-banner button{border:0;background:none;color:var(--text-muted);font-size:18px;line-height:1;width:36px;height:36px;cursor:pointer;flex:none}
.p2-need__ico{width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;flex:none;color:var(--warning,#b8844a);background:color-mix(in srgb,var(--warning,#b8844a) 14%,transparent)}
.p2-need{max-width:520px;margin:24px auto;padding:28px 24px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;background:var(--card-bg);color:var(--text-main);border:1px solid var(--card-border);border-radius:20px}
.p2-need h2{margin:0;font-size:19px;font-weight:700}.p2-need p{margin:0;font-size:14px;line-height:1.45;color:var(--text-muted);max-width:420px}
.p2-need__btns{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:6px;width:100%}
.p2-nbtn{min-height:44px;padding:0 18px;border-radius:12px;font-size:14px;font-weight:600;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-main);cursor:pointer}
.p2-nbtn--primary{border:0;background:var(--accent,var(--primary));color:#fff}
@media (max-width:767px){.p2-need{margin:16px;padding:24px 16px}.p2-need__btns .p2-nbtn{flex:1 1 100%}}
.p2-dev-unsent{display:flex;gap:12px;align-items:center;padding:14px 16px;border-radius:16px;background:var(--card-bg);color:var(--text-main);border:1px solid color-mix(in srgb,var(--warning,#b8844a) 45%,transparent)}
.p2-dev-unsent .p2-need__ico{width:44px;height:44px;border-radius:12px}
.p2-dev-unsent b{display:block;font-size:15px}.p2-dev-unsent span{font-size:13px;color:var(--text-muted)}`, Rn = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 2l20 20"/><path d="M5.8 10.1A5 5 0 0 0 7 18h10.5"/><path d="M20.9 16.6A4 4 0 0 0 19 10a5 5 0 0 0-7.6-4.3"/></svg>', Lh = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 13v8"/><path d="M8 17l4-4 4 4"/><path d="M20 16.6A4 4 0 0 0 18 9h-1.3A7 7 0 1 0 4 15.3"/></svg>';
function oo(t) {
  if (t.getElementById(Qs)) return;
  const e = t.createElement("style");
  e.id = Qs, e.textContent = $h, t.head.appendChild(e);
}
function Zs(t, e) {
  const r = (t.offline ? "Нет связи, " : "") + "не отправлено: " + t.unsent;
  if (!t.offline && t.unsent <= 0) return { show: !1, label: r, html: "" };
  const n = t.offline ? Rn : Lh;
  return e ? { show: !0, label: r, html: n + "<b>" + t.unsent + "</b>" } : { show: !0, label: r, html: n + (t.offline ? '<span>Нет связи</span><span class="p2-net__sep">·</span>' : "") + "<span>не отправлено: <b>" + t.unsent + "</b></span>" };
}
function Dh(t, e, r) {
  const n = t.ownerDocument;
  oo(n);
  const s = n.createElement("div");
  s.className = "p2-need", s.setAttribute("role", "status"), s.setAttribute("data-testid", "p2-need-internet"), s.innerHTML = '<div class="p2-need__ico">' + Rn.replace(/15/g, "26") + '</div><h2>Нужен интернет</h2><p></p><div class="p2-need__btns"></div>', s.querySelector("p").textContent = "Раздел " + e + " работает только онлайн. Данные Качества и Стройконтроля доступны без связи — осмотры сохраняются на телефоне и отправятся сами.";
  const i = s.querySelector(".p2-need__btns"), o = (a, l, c) => {
    const u = n.createElement("button");
    u.type = "button", u.className = "p2-nbtn" + (l ? " p2-nbtn--primary" : ""), u.textContent = a, u.addEventListener("click", c), i.appendChild(u);
  };
  r.quality && o("Открыть Качество", !0, () => r.go("#/quality")), o("Повторить", !r.quality, () => window.dispatchEvent(new Event("platform2:refresh"))), t.replaceChildren(s);
}
function Uh(t, e) {
  const r = Date.parse(t || "");
  if (!Number.isFinite(r)) return "";
  const n = new Date(r), s = (o) => String(o).padStart(2, "0");
  return (new Date(e).toDateString() === n.toDateString() ? "" : s(n.getDate()) + "." + s(n.getMonth() + 1) + " ") + s(n.getHours()) + ":" + s(n.getMinutes());
}
let ei = !1;
function Bh(t) {
  if (ei || typeof window > "u") return;
  ei = !0;
  const e = window, r = document;
  oo(r);
  let n = { offline: !1, unsent: 0 }, s = 0, i = 0, o = !1;
  const a = () => {
    const T = t.platform();
    return T.mode === "email" && (!!T.offline || navigator.onLine === !1);
  }, l = () => t.navigate(Xs);
  function c() {
    const T = Zs(n, window.innerWidth < 768);
    r.body.classList.toggle("p2-offline", n.offline);
    let v = r.querySelector(".p2-net");
    if (!T.show) {
      v && v.remove();
      return;
    }
    const S = (Z) => !!Z && Z.getClientRects().length > 0, $ = [r.getElementById("desk-sync-status"), r.getElementById("header-sync-status")].find((Z) => Z && S(Z.parentElement)) || null, C = r.querySelector(".mobile-module-menu-wrap"), B = !$ && C && S(C) ? C.parentElement : null, V = !$ && !B ? r.getElementById("app-sidebar") : null, J = B || (V && S(V) ? V : null), he = (window.innerWidth < 768 || !!V) !== window.innerWidth < 768 ? Zs(n, !0) : T;
    v || (v = r.createElement("span"), v.className = "p2-net", v.setAttribute("role", "button"), v.tabIndex = 0, v.dataset.testid = "p2-net", v.setAttribute("data-testid", "p2-net"), v.addEventListener("click", l), v.addEventListener("keydown", (Z) => {
      (Z.key === "Enter" || Z.key === " ") && (Z.preventDefault(), l());
    })), J && v.parentElement !== J ? (v.classList.toggle("p2-net--row", J === B), v.classList.toggle("p2-net--rail", J !== B), J.appendChild(v)) : !J && $ && v.previousElementSibling !== $ && (v.classList.remove("p2-net--row", "p2-net--rail"), $.insertAdjacentElement("afterend", v)), v.innerHTML !== he.html && (v.innerHTML = he.html), v.setAttribute("aria-label", T.label), v.title = T.label;
  }
  const u = 5e3;
  let d = null, p = null;
  async function h(T, v = !1) {
    var C;
    if (d && v && await d.catch(() => null), d) return d;
    if (p && Date.now() - p.at < T) return p.r;
    const S = (C = e.RbiSyncMergePolicy) == null ? void 0 : C.isUnsentLocal, O = e.RBI_DB_NAME || "";
    if (!S || !O || typeof indexedDB > "u") return { unsent: 0, rows: [] };
    const $ = Ld(indexedDB, O, S).then((B) => (p = { r: B, at: Date.now() }, B));
    d = $;
    try {
      return await $;
    } finally {
      d === $ && (d = null);
    }
  }
  let f = !1, g = !1, m = !1, y = null, _ = 0;
  const w = () => {
    const T = String(location.hash || "").startsWith(Xs), v = r.getElementById("p2-net-status-slot");
    if (T && !v && !_) {
      let S = 0;
      _ = window.setInterval(() => {
        (++S > 50 || r.getElementById("p2-net-status-slot")) && (clearInterval(_), _ = 0, A());
      }, 200);
    }
    return !v || !T ? null : t.platform().mode !== "email" ? (v.replaceChildren(), null) : v;
  };
  function E(T, v, S) {
    if (!r.getElementById(Hs)) {
      const Y = r.createElement("style");
      Y.id = Hs, Y.textContent = Hd, r.head.appendChild(Y);
    }
    const O = Date.now(), $ = (Y) => {
      try {
        return window.localStorage.getItem(Y) || "";
      } catch {
        return "";
      }
    }, C = e.RbiSyncNet, B = !!C && !!C.lastProbeAt && O - C.lastProbeAt < 12e4, V = { offline: n.offline || B && C.lastProbe === "offline", now: O, retryAfter: Number($("rbi_sync_retry_after")) || 0, retryKind: $("rbi_sync_retry_kind") }, J = e.RbiSyncJournal, Oe = e.RbiSyncJournalPolicy, he = J ? J.list() : [], Z = Oe ? he.slice(-20).reverse().map((Y) => ({ t: Uh(Y.t, O), text: Oe.eventLine(Y), tone: Oe.eventTone(Y) })) : [], jn = Gd(v || [], V);
    if (!S) {
      const Y = jn.filter((ho) => !ho.rejected).length;
      Y !== n.unsent && (n = { ...n, unsent: Y }, c());
    }
    const yr = Xd(
      {
        ...V,
        items: jn,
        lastOkAt: J ? J.lastOkAt() : "",
        probe: (C == null ? void 0 : C.lastProbe) ?? null,
        probeAt: (C == null ? void 0 : C.lastProbeAt) || 0,
        journal: Z,
        journalTotal: he.length,
        counting: S ? v ? "refresh" : "first" : void 0,
        countedAt: y ? y.at : 0
      },
      !!T.querySelector("details[open]")
    );
    T.dataset.p2 !== yr && (T.dataset.p2 = yr, T.innerHTML = yr), m || (m = !0, T.addEventListener("click", I));
  }
  async function R(T) {
    const v = await h(0, T).catch(() => null), S = v ? [...v.rows] : [];
    return S.push(...await Ih()), S;
  }
  async function A(T = !1) {
    const v = w();
    if (v) {
      if (f) {
        T && (g = !0);
        return;
      }
      f = !0;
      try {
        E(v, y ? y.rows : null, !0), ro(r.getElementById("p2-offline-modules-slot"));
        const S = await R(T);
        y = { rows: S, at: Date.now() };
        const O = w();
        O && E(O, S, !1);
      } finally {
        f = !1, g && (g = !1, A(!0));
      }
    }
  }
  function I(T) {
    var O;
    const v = T.target.closest("[data-act]");
    if (!v) return;
    const S = v.dataset.act;
    if (S === "sync" && (le("manual"), typeof e.triggerSync == "function" && e.triggerSync("manual")), S === "drop" && v.dataset.id && ((O = e.HistoryActions) != null && O.resolveSyncAttention) && Promise.resolve(e.HistoryActions.resolveSyncAttention(v.dataset.id)).then(() => A(!0)), S === "copy" && j(v), S === "retry") {
      const $ = e.RBI_DB_NAME || "";
      Promise.all([$ && typeof indexedDB < "u" ? $d(indexedDB, $) : Promise.resolve(0), io().catch(() => 0)]).then(() => Promise.all([le("manual"), typeof e.triggerSync == "function" ? e.triggerSync("manual") : null])).then(() => A(!0), () => A(!0));
    }
  }
  async function j(T) {
    const v = e.RbiSyncJournal;
    if (!v) return;
    const S = v.report({
      now: (/* @__PURE__ */ new Date()).toISOString(),
      version: e.APP_VERSION || e.SW_VERSION || "",
      ua: navigator.userAgent,
      onLine: navigator.onLine,
      unsent: n.unsent,
      lastOk: v.lastOkAt() || ""
    });
    let O = !1;
    try {
      await navigator.clipboard.writeText(S), O = !0;
    } catch {
      O = !1;
    }
    if (!O) {
      const C = r.createElement("textarea");
      C.value = S, C.setAttribute("readonly", ""), C.style.position = "fixed", C.style.opacity = "0", r.body.appendChild(C), C.select();
      try {
        O = r.execCommand("copy");
      } catch {
        O = !1;
      }
      C.remove();
    }
    const $ = T.textContent;
    T.textContent = O ? "Отчёт скопирован" : "Не удалось скопировать", setTimeout(() => {
      T.textContent = $;
    }, 2500);
  }
  function M() {
    if (o || !n.offline) return;
    o = !0;
    const T = r.createElement("div");
    T.className = "p2-banner", T.setAttribute("role", "status"), T.setAttribute("data-testid", "p2-net-banner");
    const v = r.getElementById("app-desk-topbar") || r.getElementById("main-header"), S = v && v.getClientRects().length ? v.getBoundingClientRect().bottom : 0;
    T.style.top = "calc(" + Math.max(Math.round(S), 56) + "px + 8px)", T.innerHTML = Rn + '<span>Нет связи — данные сохраняются на телефоне</span><button type="button" aria-label="Закрыть">×</button>';
    const O = () => {
      T.remove();
    };
    T.querySelector("button").addEventListener("click", O), r.body.appendChild(T), setTimeout(O, Nh);
  }
  function ve() {
    c(), A(), M(), (e.RBI = e.RBI || {}).netStatus = {
      get: () => ({ ...n }),
      isOffline: a,
      needInternet: (T, v) => {
        const S = (e.RBI || {}).platformMenuAccess || {};
        Dh(T, v, { quality: S.quality === !0 || S.construction === !0, go: t.navigate });
      }
    }, window.dispatchEvent(new Event(Ph));
  }
  async function P(T = !1) {
    var Oe;
    A();
    const v = a(), S = t.platform(), O = (Oe = e.RbiSyncMergePolicy) == null ? void 0 : Oe.isUnsentLocal, $ = e.RBI_DB_NAME || "";
    let C = i, B = !1;
    try {
      B = window.localStorage.getItem("rbi_cloud_dirty") === "1";
    } catch {
      B = !1;
    }
    const V = T || v || C > 0 || B || Date.now() - s > 6e4;
    S.mode !== "email" || !O || !$ || typeof indexedDB > "u" ? C = 0 : V && (s = Date.now(), C = await h(T ? 0 : u).then((he) => he.unsent, () => C)), i = C;
    const J = S.mode === "email" ? (await ar().catch(() => [])).filter((he) => he.syncStatus === "not_synced").length : 0;
    n = { offline: v, unsent: C + J }, ve();
  }
  window.addEventListener("online", () => {
    P(!0);
  }), window.addEventListener("offline", () => {
    P(!0);
  }), window.addEventListener("rbi:platform-access", () => {
    P();
  }), window.addEventListener("rbi:platform-net", () => {
    P();
  }), window.addEventListener("hashchange", () => {
    requestAnimationFrame(() => {
      A();
    }), setTimeout(ve, 300);
  }), window.addEventListener("rbi:sync-journal", () => {
    A(!0);
  }), window.addEventListener(so, () => {
    P(!0);
  }), setInterval(() => {
    P();
  }, 15e3), setInterval(c, 1500), P(!0);
}
const qh = "auth-gate-overlay", ti = "p2-login-style";
let be = null, Pe = null;
function Me() {
  return window;
}
function gr() {
  const t = Me();
  return t.RBI = t.RBI || {}, t.RBI;
}
function at() {
  if (document.getElementById(ti)) return;
  const t = document.createElement("style");
  t.id = ti, t.textContent = hd + pd + ed + `
.p2-company-switch{max-width:100%;font-size:12px;font-weight:700;min-height:40px;padding:4px 8px;border:1px solid var(--card-border);border-radius:10px;background:var(--card-bg);color:var(--text-main)}`, document.head.appendChild(t);
}
function we() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function U() {
  if (be) return be;
  const t = $i(), e = t ? Tc(t) : null, r = e ? st() : null;
  return be = Wu({
    auth: e,
    rpc: r ? async (n, s, i) => {
      const o = r.rpc(n, s || {}), a = await (i ? o.abortSignal(i) : o);
      return { data: a.data, error: a.error, status: a.status };
    } : null,
    storage: we(),
    // P2-0016: в Платформе 2.0 вход только почтой (+ демо); PIN — в старом приложении РБИ.
    pinActive: () => !1,
    // P2-0060: меню при запуске — по копии прав сохранённого входа, сервер в фоне
    storedSession: () => {
      const n = er(we());
      return n ? { email: n.email, issuedAt: n.issuedAt } : null;
    }
  }), be.subscribe(Kh), e && e.onAuthChange && e.onAuthChange(() => {
    be.refresh();
  }), window.addEventListener("platform2:refresh", () => {
    be.refresh();
  }), window.addEventListener("online", () => {
    be.refresh();
  }), be;
}
function mr() {
  return document.getElementById(qh);
}
const Mh = "Нет связи больше 14 дней — войдите, когда будет интернет. Данные на телефоне сохранены";
function On() {
  const t = mr();
  if (!t) return;
  at();
  const e = t.querySelector("[data-p2-login-host]") || t, r = U();
  fd(e, {
    notice: r.getState().loginReason === "stale" ? Mh : void 0,
    signIn: async (n, s) => {
      const i = await r.signIn(n, s);
      return i.ok && In(), i;
    },
    onDemo: () => {
      r.chooseDemo(), At("#/planfact/vor");
    }
  }), t.classList.remove("hidden");
}
let lr = !1;
function Fh(t) {
  const e = mr();
  if (!e) return;
  at();
  const r = e.querySelector("[data-p2-login-host]") || e, n = U();
  lr || (gd(r, {
    email: t,
    change: async (s) => {
      const i = await n.changePassword(s);
      return i.ok && In(), i;
    },
    signOut: () => {
      n.signOut();
    }
  }), lr = !0), e.classList.remove("hidden");
}
function Hh() {
  lr = !1;
  const t = mr();
  t && t.classList.add("hidden");
}
function Cn() {
  const t = U().getState(), e = we();
  let r = null;
  try {
    r = window.localStorage.getItem(Uu);
  } catch {
  }
  return Hu({
    mode: t.mode,
    access: U().access(),
    lastHash: r,
    welcomeSeen: Ji(e, t.email),
    actions: zu(e, t.companyId, t.email)
  });
}
function In() {
  const t = Cn();
  t && At(t);
}
function At(t, e = !0) {
  const r = Me().AppRouter;
  r && typeof r.navigate == "function" ? r.navigate(t, e) : window.location.hash = t;
}
function zh(t) {
  if (!t) return;
  const e = U().getState();
  at();
  let r = t.querySelector("select");
  if (e.mode !== "email" || e.companies.length < 2) {
    r && r.remove();
    return;
  }
  r || (r = document.createElement("select"), r.className = "p2-company-switch", r.setAttribute("aria-label", "Компания"), r.setAttribute("data-testid", "p2-company-switch"), r.addEventListener("change", () => U().setCompany(r.value)), t.appendChild(r)), r.replaceChildren(...e.companies.map((n) => {
    const s = document.createElement("option");
    return s.value = n.id, s.textContent = "Компания: " + n.name, s;
  })), r.value = e.companyId || "";
}
const Wh = "Доступ к разделу изменился";
let ri = null, ni = null;
function Kh(t) {
  var a;
  const e = gr(), r = U().access(), n = Mu(ri, r, window.location.hash);
  ri = r;
  const s = qu(ni, t);
  ni = t, e.platformMenuAccess = r, e.platform2 = ef, s && window.dispatchEvent(new Event("rbi:platform-access")), window.dispatchEvent(new Event(wd));
  const i = (a = e.services) == null ? void 0 : a.shell;
  i && typeof i.renderSidebar == "function" && i.renderSidebar(), i && typeof i.renderMobileModuleMenu == "function" && i.renderMobileModuleMenu();
  const o = Me().AppModeManager;
  if (o && typeof o.renderBottomNav == "function" && o.renderBottomNav(), t.mode === "email" && t.email) {
    const l = t.companies.find((c) => c.id === t.companyId);
    yd(t.fullName || t.email, l ? l.name + (l.roles[0] ? " · " + l.roles[0] : "") : t.isPlatformAdmin ? "администратор платформы" : "");
  } else
    _d();
  if (t.mode === "email" && t.mustChangePassword && t.email) {
    Fh(t.email);
    return;
  }
  if (t.mode === "none" ? (lr = !1, On()) : Hh(), n && t.mode === "email") {
    In();
    const l = Me().showToast;
    typeof l == "function" && l(Wh);
  }
  (!t.offline || t.companies.length > 0) && Yh(), Vh(t), Jh(t), co(), t.mode === "email" && window.location.hash === ce && ao();
}
let ut = null;
function Vh(t) {
  ut && (clearTimeout(ut), ut = null), t.offline && t.mode === "email" && (ut = setTimeout(() => {
    ut = null, U().refresh();
  }, 6e4));
}
let si = !1;
function gn() {
  const t = window.localStorage, e = t.getItem(Te) || "";
  return e ? e + ":" + (t.getItem(gt) || "") : "";
}
async function Jh(t) {
  var e;
  try {
    const r = $i(), n = st();
    await Hc(t, {
      win: window,
      store: window.localStorage,
      reload: () => window.location.reload(),
      platformClient: n,
      cfg: r,
      createClient: Ni,
      serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : null,
      dropDatabase: (o) => {
        try {
          indexedDB.deleteDatabase(o);
        } catch {
        }
      },
      listProjects: async (o) => {
        const a = Iu();
        return (a ? await a.listProjects(o) : []).filter((c) => !c.archived_at).map((c) => ({ id: c.id, name: c.name }));
      }
    });
    const s = gn();
    if ("serviceWorker" in navigator) {
      const o = navigator.serviceWorker;
      o.controller && o.controller.postMessage({ type: "P2_STORAGE_SLOT", slot: s }), si || (si = !0, o.addEventListener("controllerchange", () => {
        var a;
        (a = o.controller) == null || a.postMessage({ type: "P2_STORAGE_SLOT", slot: gn() });
      }));
    }
    const i = (e = gr().services) == null ? void 0 : e.shell;
    i && typeof i.renderSidebar == "function" && i.renderSidebar(), i && typeof i.renderMobileModuleMenu == "function" && i.renderMobileModuleMenu(), !t.offline && !t.checking && t.mode === "email" && Gh();
  } catch (r) {
    console.warn("[Platform2] Качество: подключение к хранилищу компании не удалось", r);
  }
}
let ii = !1;
async function Gh() {
  var i, o;
  const t = Me(), e = gr().qualitySync, r = (i = t.RbiSyncMergePolicy) == null ? void 0 : i.isUnsentLocal, n = ((o = t.APP_CONFIG) == null ? void 0 : o.LOCAL_DB_NAME) || "PLATFORM2_DB", s = t.RBI_DB_NAME || "";
  if (!(ii || !e || !e.projectId || !r || !s || s === n || typeof indexedDB > "u")) {
    ii = !0;
    try {
      const a = await Nd(indexedDB, n, r), l = window.localStorage;
      if (!a.orphans.length) {
        l.removeItem(Ms);
        return;
      }
      if (at(), !document.getElementById("p2-rescue-style")) {
        const u = document.createElement("style");
        u.id = "p2-rescue-style", u.textContent = Ud, document.head.appendChild(u);
      }
      const c = e.projectId;
      document.body.appendChild(Md(document, {
        companyName: e.companyName || "компанию",
        orphans: a.orphans,
        onLater: () => {
        },
        onMove: async () => {
          try {
            await Dd(indexedDB, n, s, a, { slot: gn(), projectCode: c, author: e.engineerName || "" });
          } catch {
            return "Не удалось перенести. Попробуйте ещё раз";
          }
          return typeof t.rbiMarkCloudDirty == "function" ? t.rbiMarkCloudDirty() : l.setItem("rbi_cloud_dirty", "1"), l.removeItem(Ms), window.location.reload(), null;
        }
      }));
    } catch (a) {
      console.warn("[Platform2] записи без связи: проверка не удалась", a);
    }
  }
}
function Yh() {
  var n;
  const t = (n = gr().services) == null ? void 0 : n.shell, e = U().access(), r = [];
  t && typeof t.isPlatformModuleAllowed == "function" && t.isPlatformModuleAllowed("planfact") && r.push("planfact"), e.company && r.push("company"), e.platformAdmin && r.push("platform-admin");
  try {
    const s = navigator.serviceWorker && navigator.serviceWorker.controller;
    s && s.postMessage({ type: "P2_SW_ALLOWLIST", modules: r });
  } catch {
  }
}
const mn = "tab-welcome";
let oi = !1, re = null;
const ai = 1300;
function Xh() {
  let t = document.getElementById(mn);
  if (t) return t;
  t = document.createElement("div"), t.id = mn, t.className = "view-section";
  const e = document.getElementById("tab-mode-placeholder");
  return e && e.parentNode ? e.parentNode.insertBefore(t, e.nextSibling) : (document.getElementById("app-content") || document.body).appendChild(t), t;
}
function ao() {
  if (window.location.hash !== ce) return;
  const t = U().getState();
  if (t.mode !== "email" || !t.email) {
    const l = Cn();
    l && l !== ce && At(l);
    return;
  }
  at();
  const e = Xh();
  document.querySelectorAll(".view-section").forEach((l) => l.classList.remove("active")), e.classList.add("active"), e.classList.remove("hidden");
  const r = document.getElementById("main-header");
  if (r && (r.style.display = "block"), document.body.classList.add(se), !re) {
    const l = t.email;
    re = { key: "", animate: !Ji(we(), l), at: Date.now(), email: l }, re.animate ? setTimeout(() => dn(we(), l), ai) : dn(we(), l);
  }
  const n = t.companies.find((l) => l.id === t.companyId) || null, s = Gu(U().access(), En), i = JSON.stringify([t.email, t.fullName, n && n.id, s.map((l) => l.id)]);
  if (re.key === i && e.querySelector("[data-testid=p2-welcome]")) return;
  const o = re.animate && (!re.key || Date.now() - re.at < ai);
  re.key = i, td(e, {
    name: t.fullName || t.email,
    company: n ? n.name : null,
    role: n && n.roles[0] ? n.roles[0] : null,
    tiles: s,
    animate: o,
    open: (l) => At(l, !1)
  });
  const a = Me().updateBodyPadding;
  typeof a == "function" && a(), lo();
}
function lo() {
  const t = document.getElementById(mn);
  if (!t || window.location.hash !== ce) return;
  const e = document.getElementById("main-header"), r = !!e && getComputedStyle(e).display !== "none" && getComputedStyle(e).position === "fixed";
  t.style.paddingTop = r ? Math.max(0, Math.round(e.getBoundingClientRect().bottom)) + "px" : "";
}
function co() {
  if (oi) return;
  const t = Me().AppRouter;
  !t || typeof t.addRoute != "function" || (oi = !0, t.addRoute(ce, () => {
    (Pe || uo()).then(ao);
  }), window.addEventListener("rbi:route", (e) => {
    var n;
    ((n = e.detail) == null ? void 0 : n.path) !== ce && (document.body.classList.remove(se), re && dn(we(), re.email), re = null);
  }), window.addEventListener("resize", lo), window.location.hash === ce && typeof t.renderRoute == "function" && t.renderRoute());
}
function Qh() {
  let t = null;
  try {
    t = window.localStorage;
  } catch {
    t = null;
  }
  kd({
    store: t,
    deleteDatabase: typeof indexedDB < "u" ? (e) => Sd(indexedDB, e) : null
  }).catch(() => {
  });
}
function Zh() {
  const t = er(we());
  if (!t || !t.email || zt(we(), t.email)) return;
  const e = mr();
  e && !e.querySelector("[data-testid=p2-login]") && e.classList.remove("hidden");
}
function uo() {
  return Pe ? Pe.then((t) => {
    t.mode === "none" && On();
  }) : (co(), Qh(), Zh(), Pe = U().boot(), Pe.then(() => Bh({ platform: () => U().getState(), navigate: (t) => At(t) })), Pe.then(() => jh())), Pe;
}
const ef = {
  start: uo,
  /** P2-0074: роутер оболочки (js/core/router.js) при открытии без адреса — после start(). */
  homePath: Cn,
  getState: () => U().getState(),
  access: () => U().access(),
  setCompany: (t) => U().setCompany(t),
  refresh: () => U().refresh(),
  /** «Выйти» (Настройки → Платформа, полоса раздела): сессия завершается, экран «Вход». */
  signOut: async () => {
    await U().signOut();
  },
  showLogin: On,
  renderCompanySwitch: zh,
  /** P2-0028: «Настройки → Платформа → Мой профиль» (вызывают Настройки при показе). Не вошёл почтой — пусто. */
  renderMyProfile: (t) => {
    if (!t) return;
    const e = U().getState();
    if (e.mode !== "email" || !e.email) {
      t.replaceChildren(), delete t.dataset.p2Profile;
      return;
    }
    const r = e.email + "|" + (e.fullName || "");
    t.dataset.p2Profile === r && t.firstChild || (t.dataset.p2Profile = r, at(), md(t, {
      email: e.email,
      fullName: e.fullName || null,
      change: (n) => U().changePassword(n),
      saveName: e.userId ? (n) => U().setFullName(n) : void 0
    }));
  },
  /** Вызов функции сервера от имени вошедшего (одно соединение платформы; раздел администрирования своего клиента не создаёт). */
  rpc: async (t, e) => {
    U();
    const r = st();
    if (!r) return { data: null, error: { message: "Сервер не настроен" } };
    const n = await r.rpc(t, e || {});
    return { data: n.data, error: n.error ? { message: n.error.message, code: n.error.code } : null };
  }
};
export {
  Wh as ACCESS_CHANGED_TEXT,
  Mh as STALE_LOGIN_TEXT,
  ef as api,
  uo as start
};
//# sourceMappingURL=platform.js.map
