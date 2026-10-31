// P2-0053. Выдуманный PDF-план этажа для «ЖК Демо» (≤ 10 КБ): контур секции, коридор, лестница с лифтом, квартиры с номерами.
// Надписи — латиницей и цифрами (стандартный шрифт PDF без вложения кириллицы не показывает).

/** PDF 1.4 из одного листа A4 альбомной ориентации; потоки без сжатия. */
export function floorPlanPdf({ title, apartments = 4, firstNo = 1 }) {
  const W = 842, H = 595, x0 = 60, y0 = 70, w = 722, h = 430;
  const ops = [];
  ops.push('0.15 0.2 0.3 RG 3 w', `${x0} ${y0} ${w} ${h} re S`);                       // наружные стены
  const cy = y0 + h / 2 - 30;
  ops.push('1.5 w', `${x0} ${cy} m ${x0 + w} ${cy} l S`, `${x0} ${cy + 60} m ${x0 + w} ${cy + 60} l S`);   // коридор
  const sx = x0 + w / 2 - 50;
  ops.push('0.9 0.92 0.95 rg', `${sx} ${cy} 100 60 re f`, '0.15 0.2 0.3 RG 1 w', `${sx} ${cy} 100 60 re S`);   // лестница и лифт
  for (let i = 0; i < 6; i++) ops.push(`${sx + 8 + i * 9} ${cy + 6} m ${sx + 8 + i * 9} ${cy + 54} l S`);
  const half = Math.ceil(apartments / 2);
  const cell = w / half;
  const text = [];
  for (let i = 0; i < apartments; i++) {
    const top = i < half;
    const col = top ? i : i - half;
    const ax = x0 + col * cell, ay = top ? cy + 60 : y0, ah = top ? y0 + h - (cy + 60) : cy - y0;
    ops.push('1.2 w', `${ax} ${ay} ${cell} ${ah} re S`);
    ops.push('0.2 w', `${ax + 12} ${ay + 12} ${cell * 0.45} ${ah * 0.4} re S`);          // комната
    text.push(`BT /F1 26 Tf ${ax + cell / 2 - 22} ${ay + ah / 2 + 10} Td (No ${firstNo + i}) Tj ET`);
  }
  text.push(`BT /F1 14 Tf ${x0} ${y0 + h + 30} Td (${title.replace(/[()\\]/g, '')}) Tj ET`);
  text.push(`BT /F1 9 Tf ${x0} ${y0 - 30} Td (Demo plan, not a real project. Platform 2.0) Tj ET`);
  const content = ops.join('\n') + '\n0 0 0 rg\n' + text.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
