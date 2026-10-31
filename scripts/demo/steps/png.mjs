// P2-0053. Фото-заглушка для «ЖК Демо» (PNG ≤ 5 КБ): фон, «стена» и знак — галочка (принято) или крест (замечание).
import { deflateSync } from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** kind: 'ok' | 'bad'; seed — вариант оттенка (разные снимки отличаются). */
export function stubPhoto(kind = 'bad', seed = 0, w = 320, h = 240) {
  const bg = kind === 'ok' ? [236, 248, 240] : [252, 240, 238];
  const wall = [200 - (seed % 5) * 8, 196 - (seed % 3) * 6, 188];
  const mark = kind === 'ok' ? [34, 160, 90] : [214, 54, 54];
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      let c = bg;
      if (y > 30 && y < h - 30 && x > 30 && x < w - 30) c = wall;
      if ((x + y + seed * 7) % 41 === 0 && c === wall) c = [170, 166, 160];            // швы
      const cx = x - w / 2, cy = y - h / 2;
      const onMark = kind === 'ok'
        ? (Math.abs(cy - (-cx * 0.9 + 10)) < 7 && cx > -5 && cx < 60) || (Math.abs(cy - (cx * 0.9 + 10 + 36)) < 7 && cx > -45 && cx <= 0)
        : (Math.abs(cy - cx) < 7 || Math.abs(cy + cx) < 7) && Math.abs(cx) < 55;
      if (onMark) c = mark;
      raw.set(c, y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
