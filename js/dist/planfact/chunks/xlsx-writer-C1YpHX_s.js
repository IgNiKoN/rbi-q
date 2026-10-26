import { sha256Hex as K } from "./xlsx-reader-CPcF3VtK.js";
const _ = new TextDecoder(), I = new TextEncoder(), E = (e, t) => e[t] | e[t + 1] << 8, k = (e, t) => (e[t] | e[t + 1] << 8 | e[t + 2] << 16 | e[t + 3] << 24) >>> 0;
function C(e, t, n) {
  e[t] = n & 255, e[t + 1] = n >>> 8 & 255;
}
function O(e, t, n) {
  C(e, t, n & 65535), C(e, t + 2, n >>> 16);
}
const A = "Файл повреждён или это не .xlsx — записать цены не удалось.";
function q(e) {
  let t = -1;
  for (let c = e.length - 22; c >= Math.max(0, e.length - 65557); c--) if (k(e, c) === 101010256) {
    t = c;
    break;
  }
  if (t < 0) throw new Error(A);
  const n = E(e, t + 10), s = k(e, t + 16);
  if (n === 65535 || s === 4294967295) throw new Error("Файл слишком большой (zip64) — такая форма пока не поддерживается.");
  const r = [];
  let a = s;
  for (let c = 0; c < n; c++) {
    if (k(e, a) !== 33639248) throw new Error(A);
    const l = E(e, a + 28), h = E(e, a + 30), d = E(e, a + 32), w = E(e, a + 8);
    if (w & 1) throw new Error("Файл защищён паролем — снимите защиту и выберите файл снова.");
    r.push({
      name: _.decode(e.subarray(a + 46, a + 46 + l)),
      flags: w,
      method: E(e, a + 10),
      crc: k(e, a + 16),
      compSize: k(e, a + 20),
      size: k(e, a + 24),
      localOffset: k(e, a + 42),
      cdStart: a,
      cdEnd: a + 46 + l + h + d
    }), a += 46 + l + h + d;
  }
  return { buf: e, entries: r, cdOffset: s, eocdStart: t };
}
function Q(e, t) {
  const n = t.localOffset;
  if (k(e.buf, n) !== 67324752) throw new Error(A);
  return n + 30 + E(e.buf, n + 26) + E(e.buf, n + 28);
}
async function H(e, t) {
  const n = new Response(new Blob([e]).stream().pipeThrough(t));
  return new Uint8Array(await n.arrayBuffer());
}
async function G(e, t) {
  const n = Q(e, t), s = e.buf.subarray(n, n + t.compSize);
  if (t.method === 0) return s;
  if (t.method === 8) return H(s, new DecompressionStream("deflate-raw"));
  throw new Error(A);
}
let M = null;
function Y(e) {
  if (!M) {
    M = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let s = n;
      for (let r = 0; r < 8; r++) s = s & 1 ? 3988292384 ^ s >>> 1 : s >>> 1;
      M[n] = s >>> 0;
    }
  }
  let t = 4294967295;
  for (let n = 0; n < e.length; n++) t = M[(t ^ e[n]) & 255] ^ t >>> 8;
  return (t ^ 4294967295) >>> 0;
}
async function z(e, t) {
  const n = [...e.entries].sort((i, f) => i.localOffset - f.localOffset), s = /* @__PURE__ */ new Map();
  n.forEach((i, f) => s.set(i, f + 1 < n.length ? n[f + 1].localOffset : e.cdOffset));
  const r = [], a = [];
  let c = 0;
  for (const i of e.entries) {
    const f = e.buf.slice(i.cdStart, i.cdEnd);
    O(f, 42, c);
    const y = t.get(i.name);
    if (y) {
      const p = await H(y, new CompressionStream("deflate-raw")), u = Y(y), g = e.buf.subarray(i.localOffset + 30, i.localOffset + 30 + E(e.buf, i.localOffset + 26)), o = new Uint8Array(30 + g.length);
      o.set(e.buf.subarray(i.localOffset, i.localOffset + 30));
      const b = i.flags & -9;
      C(o, 6, b), C(o, 8, 8), O(o, 14, u), O(o, 18, p.length), O(o, 22, y.length), C(o, 28, 0), o.set(g, 30), C(f, 8, b), C(f, 10, 8), O(f, 16, u), O(f, 20, p.length), O(f, 24, y.length), r.push(o, p), c += o.length + p.length;
    } else {
      const p = e.buf.subarray(i.localOffset, s.get(i));
      r.push(p), c += p.length;
    }
    a.push(f);
  }
  const l = c, h = a.reduce((i, f) => i + f.length, 0), d = e.buf.slice(e.eocdStart);
  O(d, 12, h), O(d, 16, l);
  const w = new Uint8Array(l + h + d.length);
  let $ = 0;
  for (const i of [...r, ...a, d])
    w.set(i, $), $ += i.length;
  return w;
}
const X = (e) => e.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function m(e, t) {
  const n = new RegExp(`\\s${t.replace(":", "\\:")}="([^"]*)"`).exec(e);
  return n ? X(n[1]) : null;
}
function ee(e) {
  const t = e.lastIndexOf("/");
  return `${e.slice(0, t + 1)}_rels/${e.slice(t + 1)}.rels`;
}
function te(e, t) {
  if (t.startsWith("/")) return t.slice(1);
  const n = e.split("/").slice(0, -1);
  for (const s of t.split("/"))
    s === ".." ? n.pop() : s !== "." && n.push(s);
  return n.join("/");
}
function B(e, t) {
  for (const n of e.matchAll(/<Relationship\b[^>]*>/g)) if (t(n[0])) return m(n[0], "Target");
  return null;
}
function ne(e) {
  let t = e + 1, n = "";
  for (; t > 0; ) {
    const s = (t - 1) % 26;
    n = String.fromCharCode(65 + s) + n, t = Math.floor((t - 1) / 26);
  }
  return n;
}
function se(e) {
  var s;
  const t = ((s = /^[A-Z]+/.exec(e)) == null ? void 0 : s[0]) ?? "";
  let n = 0;
  for (const r of t) n = n * 26 + (r.charCodeAt(0) - 64);
  return n - 1;
}
function Z(e) {
  if (!Number.isFinite(e)) throw new Error("Цена должна быть числом.");
  const t = Math.round(e * 100) / 100;
  return String(Object.is(t, -0) ? 0 : t);
}
function oe(e) {
  const t = [];
  for (const n of e.matchAll(/<col\b[^>]*>/g)) {
    const s = m(n[0], "style");
    s && t.push({ min: Number(m(n[0], "min")) - 1, max: Number(m(n[0], "max")) - 1, style: s });
  }
  return (n) => {
    var s;
    return ((s = t.find((r) => n >= r.min && n <= r.max)) == null ? void 0 : s.style) ?? null;
  };
}
function re(e, t) {
  if (!/<sheetData\b/.test(e)) throw new Error("Лист в файле устроен необычно (нет таблицы ячеек) — записать цены нельзя.");
  const n = [], s = [], r = /* @__PURE__ */ new Map();
  for (const o of t) {
    if (!Number.isInteger(o.rowNo) || o.rowNo < 1 || !Number.isInteger(o.col) || o.col < 0) throw new Error("Неверный адрес ячейки.");
    Z(o.value);
    const b = r.get(o.rowNo) ?? [];
    b.push(o), r.set(o.rowNo, b);
  }
  const a = oe(e), c = /<sheetData\s*\/>/.exec(e);
  c && (e = e.slice(0, c.index) + "<sheetData></sheetData>" + e.slice(c.index + c[0].length));
  const l = /<sheetData\b[^>]*>/.exec(e), h = l.index + l[0].length, d = e.indexOf("</sheetData>", h);
  if (d < 0) throw new Error(A);
  const w = e.slice(h, d), $ = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, i = [];
  for (const o of w.matchAll($)) {
    const b = /^<row\b[^>]*?\/?>/.exec(o[0])[0], x = Number(m(b, "r"));
    if (!x) throw new Error("В листе есть строки без номера — такой файл пока не поддерживается.");
    i.push({ r: x, start: o.index, end: o.index + o[0].length, text: o[0] });
  }
  const f = (o, b, x) => `<c r="${o}"${b}><v>${Z(x)}</v></c>`, y = (o, b, x) => {
    const P = /^<row\b[^>]*?\/>$/.test(o), T = /^<row\b[^>]*?\/?>/.exec(o)[0];
    let S = P ? "" : o.slice(T.length, o.length - 6);
    const J = m(T, "customFormat") === "1" ? m(T, "s") : null;
    for (const V of [...x].sort((v, N) => v.col - N.col)) {
      const v = ne(V.col) + b, N = [...S.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)], D = N.find((L) => m(/^<c\b[^>]*?\/?>/.exec(L[0])[0], "r") === v);
      if (D) {
        const L = /^<c\b[^>]*?\/?>/.exec(D[0])[0];
        if (/<f[\s>/]/.test(D[0])) {
          s.push(v);
          continue;
        }
        const F = L.replace(/^<c\b/, "").replace(/\/?>$/, "").replace(/\s(r|t|vm|cm)="[^"]*"/g, "");
        S = S.slice(0, D.index) + f(v, F, V.value) + S.slice(D.index + D[0].length);
      } else {
        if (N.some((U) => !m(/^<c\b[^>]*?\/?>/.exec(U[0])[0], "r"))) throw new Error("В листе есть ячейки без адреса — такой файл пока не поддерживается.");
        const L = J ?? a(V.col), F = f(v, L ? ` s="${L}"` : "", V.value), R = N.find((U) => se(m(/^<c\b[^>]*?\/?>/.exec(U[0])[0], "r")) > V.col), j = R ? R.index : S.length;
        S = S.slice(0, j) + F + S.slice(j);
      }
      n.push(v);
    }
    return `${P ? T.replace(/\s*\/>$/, ">") : T}${S}</row>`;
  };
  let p = "", u = 0;
  const g = new Map(r);
  for (const o of i) {
    for (const x of [...g.keys()].sort((P, T) => P - T)) {
      if (x >= o.r) break;
      i.some((P) => P.r === x) || (p += w.slice(u, o.start), u = o.start, p += y(`<row r="${x}"/>`, x, g.get(x)), g.delete(x));
    }
    const b = g.get(o.r);
    b && (p += w.slice(u, o.start) + y(o.text, o.r, b), u = o.end, g.delete(o.r));
  }
  p += w.slice(u);
  for (const o of [...g.keys()].sort((b, x) => b - x)) p += y(`<row r="${o}"/>`, o, g.get(o));
  return { xml: e.slice(0, h) + p + e.slice(d), written: n, skippedFormula: s };
}
function ce(e) {
  const t = /<calcPr\b[^>]*?\/?>/.exec(e);
  if (t) {
    const s = /\sfullCalcOnLoad="[^"]*"/.test(t[0]) ? t[0].replace(/\sfullCalcOnLoad="[^"]*"/, ' fullCalcOnLoad="1"') : t[0].replace(/\s*(\/?>)$/, ' fullCalcOnLoad="1"$1');
    return e.slice(0, t.index) + s + e.slice(t.index + t[0].length);
  }
  const n = /<(oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b|<\/workbook>/.exec(e);
  if (!n) throw new Error(A);
  return e.slice(0, n.index) + '<calcPr fullCalcOnLoad="1"/>' + e.slice(n.index);
}
function ae(e, t) {
  const n = [...e.matchAll(/<sheet\b[^>]*>/g)], s = n.findIndex((h) => m(h[0], "name") === t);
  if (s < 0) throw new Error(A);
  const r = n[s], a = r[0].replace(/\sstate="[^"]*"/, "");
  let c = e.slice(0, r.index) + a + e.slice(r.index + r[0].length);
  const l = /<workbookView\b[^>]*?\/?>/.exec(c);
  if (l) {
    let h = /\sactiveTab="[^"]*"/.test(l[0]) ? l[0].replace(/\sactiveTab="[^"]*"/, ` activeTab="${s}"`) : l[0].replace(/\s*(\/?>)$/, ` activeTab="${s}"$1`);
    Number(m(h, "firstSheet") ?? 0) > s && (h = h.replace(/\sfirstSheet="[^"]*"/, ` firstSheet="${s}"`)), c = c.slice(0, l.index) + h + c.slice(l.index + l[0].length);
  }
  return c;
}
function W(e, t) {
  const n = /<sheetView\b[^>]*?\/?>/.exec(e);
  if (!n) {
    if (!t || /<sheetViews\b/.test(e)) return e;
    const r = /<(sheetFormatPr|cols|sheetData)\b/.exec(e);
    return r ? e.slice(0, r.index) + '<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>' + e.slice(r.index) : e;
  }
  let s = n[0].replace(/\stabSelected="[^"]*"/, "");
  return t && (s = s.replace(/^<sheetView\b/, '<sheetView tabSelected="1"')), e.slice(0, n.index) + s + e.slice(n.index + n[0].length);
}
async function ie(e) {
  var c;
  const t = await e("_rels/.rels"), n = ((c = t && B(t, (l) => /\/officeDocument"/.test(l))) == null ? void 0 : c.replace(/^\//, "")) ?? "xl/workbook.xml", s = await e(n), r = await e(ee(n));
  if (!s || !r) throw new Error(A);
  const a = [...s.matchAll(/<sheet\b[^>]*>/g)].map((l) => {
    var w;
    const h = (w = /\s[\w.-]+:id="([^"]*)"/.exec(l[0])) == null ? void 0 : w[1], d = h ? B(r, ($) => m($, "Id") === h) : null;
    return { name: m(l[0], "name") ?? "", path: d ? te(n, d) : null };
  });
  return { wbPath: n, wb: s, sheets: a };
}
async function he(e, t, n) {
  var p;
  const s = e instanceof Uint8Array ? e : new Uint8Array(e), r = q(s), a = new Map(r.entries.map((u) => [u.name, u])), c = async (u) => {
    const g = a.get(u);
    return g ? _.decode(await G(r, g)) : null;
  }, { wbPath: l, wb: h, sheets: d } = await ie(c), w = ((p = d.find((u) => u.name === t)) == null ? void 0 : p.path) ?? null;
  if (!w || !a.has(w)) throw new Error(`В файле нет листа «${t}» — выберите исходный файл заказчика.`);
  const $ = await c(w), i = re($, n), f = /* @__PURE__ */ new Map();
  if (i.written.length) {
    f.set(w, I.encode(W(i.xml, !0))), f.set(l, I.encode(ae(ce(h), t)));
    for (const u of d) {
      if (!u.path || u.path === w || !a.has(u.path)) continue;
      const g = await c(u.path);
      g && /<sheetView\b[^>]*\stabSelected="1"/.test(g) && f.set(u.path, I.encode(W(g, !1)));
    }
  }
  return { bytes: f.size ? await z(r, f) : s.slice(), written: i.written, skippedFormula: i.skippedFormula };
}
async function ue(e, t) {
  if (await K(e) !== t.toLowerCase())
    throw new Error("Это другой файл: он не совпадает с загруженным ВОР. Выберите тот же файл заказчика, по которому загружен ВОР.");
}
async function we(e) {
  const t = e instanceof Uint8Array ? e : new Uint8Array(e), n = q(t), s = /* @__PURE__ */ new Map();
  for (const r of n.entries) s.set(r.name, await G(n, r));
  return s;
}
export {
  ue as assertSameFile,
  ne as colLetters,
  Y as crc32,
  we as listParts,
  re as patchSheetXml,
  he as patchXlsx,
  ce as setFullCalcOnLoad,
  W as setTabSelected,
  ae as showAndActivate
};
//# sourceMappingURL=xlsx-writer-C1YpHX_s.js.map
