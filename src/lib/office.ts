// Lettura di DOCX / XLSX / CSV senza librerie esterne (zip + DecompressionStream del browser).

import type { Heading } from './types';

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('File non valido (zip)');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    const lnlen = dv.getUint16(off + 26, true);
    const lelen = dv.getUint16(off + 28, true);
    const start = off + 30 + lnlen + lelen;
    const raw = u8.subarray(start, start + csize);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
  }
  return out;
}

const xml = (b?: Uint8Array) => (b ? new DOMParser().parseFromString(new TextDecoder().decode(b), 'application/xml') : null);

export interface OfficeText {
  pageTexts: Record<string, string>;
  headings: Heading[];
  pageCount: number;
  firstPagesText: string;
}

// DOCX: ogni titolo apre una "sezione" (usata come pagina logica per la tracciabilità)
export async function extractDocx(buf: ArrayBuffer): Promise<OfficeText> {
  const files = await unzip(buf);
  const doc = xml(files.get('word/document.xml'));
  if (!doc) throw new Error('Documento Word non leggibile');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paras = [...doc.getElementsByTagNameNS(W, 'p')];
  const pageTexts: Record<string, string> = {};
  const headings: Heading[] = [];
  let sec = 1;
  let buf2: string[] = [];
  const flush = () => {
    if (buf2.length) pageTexts[String(sec)] = (pageTexts[String(sec)] ? pageTexts[String(sec)] + '\n' : '') + buf2.join('\n');
    buf2 = [];
  };
  for (const p of paras) {
    const text = [...p.getElementsByTagNameNS(W, 't')].map((t) => t.textContent).join('').trim();
    if (!text) continue;
    const style = p.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') || p.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttribute('w:val') || '';
    const isHead = /heading|titolo|berschrift/i.test(style);
    const m = text.match(/^(\d{1,2}(?:\.\d{1,2}){0,4})\.?\s+(.+)$/);
    if (isHead || (m && text.length < 100)) {
      flush();
      sec++;
      headings.push({ num: m ? m[1] : `§${sec}`, title: m ? m[2] : text, page: sec, source: 'body' });
    }
    buf2.push(text);
  }
  flush();
  return { pageTexts, headings, pageCount: sec, firstPagesText: Object.values(pageTexts).slice(0, 3).join('\n') };
}

// XLSX: una "pagina" per riga, chiave "Foglio!riga" in testo e cella
export async function extractXlsx(buf: ArrayBuffer): Promise<OfficeText> {
  const files = await unzip(buf);
  const ss = xml(files.get('xl/sharedStrings.xml'));
  const shared = ss ? [...ss.getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join('')) : [];
  const wb = xml(files.get('xl/workbook.xml'));
  const sheets = wb ? [...wb.getElementsByTagName('sheet')].map((s) => s.getAttribute('name') || 'Foglio') : [];
  const pageTexts: Record<string, string> = {};
  let idx = 0;
  for (let si = 0; si < Math.max(sheets.length, 1); si++) {
    const sh = xml(files.get(`xl/worksheets/sheet${si + 1}.xml`));
    if (!sh) continue;
    for (const row of [...sh.getElementsByTagName('row')]) {
      const r = row.getAttribute('r');
      const cells = [...row.getElementsByTagName('c')].map((c) => {
        const t = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent ?? c.getElementsByTagName('t')[0]?.textContent ?? '';
        const val = t === 's' ? shared[Number(v)] ?? '' : v;
        return val ? `${c.getAttribute('r')}: ${val}` : '';
      });
      const text = cells.filter(Boolean).join(' | ');
      if (!text) continue;
      idx++;
      pageTexts[String(idx)] = `[${sheets[si] || 'Foglio'} riga ${r}] ${text}`;
    }
  }
  return { pageTexts, headings: [], pageCount: idx, firstPagesText: Object.values(pageTexts).slice(0, 20).join('\n') };
}

export function extractCsv(text: string): OfficeText {
  const pageTexts: Record<string, string> = {};
  const sep = (text.split('\n')[0].match(/;/g)?.length || 0) > (text.split('\n')[0].match(/,/g)?.length || 0) ? ';' : ',';
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0]?.split(sep) || [];
  lines.forEach((l, i) => {
    const cells = l.split(sep);
    pageTexts[String(i + 1)] = `[riga ${i + 1}] ` + cells.map((c, k) => (i > 0 && header[k] ? `${header[k].trim()}: ${c.trim()}` : c.trim())).join(' | ');
  });
  return { pageTexts, headings: [], pageCount: lines.length, firstPagesText: lines.slice(0, 20).join('\n') };
}
