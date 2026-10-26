async function x() {
  const t = await import("./exceljs.min-Cd0WKM3n.js").then((n) => n.e);
  return t.default && t.default.Workbook ? t.default : t;
}
function u(t) {
  if (t == null) return null;
  if (typeof t == "number") return Number.isFinite(t) ? t : null;
  if (typeof t == "string") return t;
  if (typeof t == "boolean") return t ? "да" : "нет";
  if (t instanceof Date) return t.toISOString().slice(0, 10);
  if (typeof t == "object") {
    const n = t;
    if ("result" in n) return u(n.result);
    if ("formula" in n || "sharedFormula" in n) return null;
    if (Array.isArray(n.richText)) return n.richText.map((r) => r.text).join("");
    if ("text" in n) return u(n.text);
    if ("error" in n) return null;
  }
  return null;
}
function h(t) {
  const n = t instanceof Uint8Array ? t : new Uint8Array(t);
  return n.length > 4 && n[0] === 80 && n[1] === 75;
}
async function y(t) {
  if (!h(t)) throw new Error("Это не файл Excel .xlsx (старый .xls сохраните как .xlsx).");
  const n = await x(), r = new n.Workbook();
  try {
    await r.xlsx.load(t);
  } catch {
    throw new Error("Файл повреждён или это не .xlsx — открыть не удалось.");
  }
  const s = [];
  for (const l of r.worksheets) {
    const e = [], c = l.rowCount || 0;
    for (let o = 1; o <= c; o++) {
      const f = l.getRow(o), a = [];
      f.eachCell({ includeEmpty: !1 }, (i, w) => {
        a[w - 1] = u(i.value);
      });
      for (let i = 0; i < a.length; i++) a[i] === void 0 && (a[i] = null);
      e.push(a);
    }
    for (; e.length && e[e.length - 1].every((o) => o === null || o === ""); ) e.pop();
    s.push({ name: String(l.name), rows: e, hidden: !!l.state && l.state !== "visible" });
  }
  return { sheets: s };
}
async function d(t) {
  const n = t instanceof Uint8Array ? t : new Uint8Array(t), r = await crypto.subtle.digest("SHA-256", n);
  return Array.from(new Uint8Array(r)).map((s) => s.toString(16).padStart(2, "0")).join("");
}
export {
  u as cellValue,
  h as looksLikeXlsx,
  y as readWorkbook,
  d as sha256Hex
};
//# sourceMappingURL=xlsx-reader-CPcF3VtK.js.map
