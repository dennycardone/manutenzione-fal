// pdf.js: lettura testo per pagina, individuazione dei capitoli, rendering con evidenziazione.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'; // build "legacy": include i polyfill per Safari/Chrome meno recenti
import type { Heading } from './types';

let workerSet = false;
function ensureWorker() {
  if (workerSet) return;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./assets/pdf.worker.min.mjs', document.baseURI).toString();
  workerSet = true;
}

export type PDFDoc = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;

export async function openPdf(data: ArrayBuffer): Promise<PDFDoc> {
  ensureWorker();
  return pdfjs.getDocument({
    data: new Uint8Array(data.slice(0)),
    cMapUrl: new URL('./assets/cmaps/', document.baseURI).toString(),
    cMapPacked: true,
    standardFontDataUrl: new URL('./assets/standard_fonts/', document.baseURI).toString(),
  }).promise;
}

export interface Line {
  text: string;
  size: number;
  y: number;
  bold: boolean;
}

export async function pageLines(pdf: PDFDoc, n: number): Promise<Line[]> {
  const page = await pdf.getPage(n);
  const tc = await page.getTextContent();
  const rows = new Map<number, { x: number; s: string; h: number; bold: boolean }[]>();
  for (const it of tc.items as any[]) {
    if (!('str' in it) || !it.str) continue;
    const y = Math.round(it.transform[5]);
    const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
    if (!rows.has(key)) rows.set(key, []);
    const style = (tc.styles as any)[it.fontName];
    const bold = /bold|black|heavy|semibold/i.test(`${it.fontName} ${style?.fontFamily ?? ''}`);
    rows.get(key)!.push({ x: it.transform[4], s: it.str, h: Math.abs(it.transform[3]) || it.height, bold });
  }
  const lines: Line[] = [];
  for (const [y, parts] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
    parts.sort((a, b) => a.x - b.x);
    let text = '';
    let lastX = -1e9;
    for (const p of parts) {
      text += (text && p.x - lastX > 1 && !text.endsWith(' ') ? ' ' : '') + p.s;
      lastX = p.x + p.s.length * p.h * 0.45;
    }
    const size = Math.max(...parts.map((p) => p.h));
    lines.push({ text: text.replace(/\s+/g, ' ').trim(), size, y, bold: parts.every((p) => p.bold) });
  }
  return lines.filter((l) => l.text);
}

export interface Extracted {
  pageTexts: Record<string, string>;
  headings: Heading[];
  pageCount: number;
  textless: boolean;
  firstPagesText: string;
}

const NUM_HEAD = /^((?:\d{1,2})(?:\.\d{1,2}){0,4})\.?\s+(\S.{1,110})$/;
const WORD_HEAD = /^(section|sezione|capitolo|chapter|kapitel|cap\.)\s+(\d{1,2}(?:\.\d{1,2}){0,3})\b\s*[:.\-–]?\s*(.*)$/i;
const TOC_LINE = /(\.{4,}|…{2,}|\s\.\s\.\s\.)\s*\d{1,4}\s*$/;

export async function extractPdf(data: ArrayBuffer, onProgress?: (p: number, total: number) => void): Promise<Extracted> {
  const pdf = await openPdf(data);
  const n = pdf.numPages;
  const all: Line[][] = [];
  const pageTexts: Record<string, string> = {};
  for (let i = 1; i <= n; i++) {
    const lines = await pageLines(pdf, i);
    all.push(lines);
    pageTexts[String(i)] = lines.map((l) => l.text).join('\n');
    onProgress?.(i, n);
  }
  const sizes = all.flat().map((l) => l.size).sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 10;
  const totalChars = Object.values(pageTexts).reduce((a, t) => a + t.length, 0);

  const headings: Heading[] = [];
  const seen = new Map<string, Heading & { size: number }>();
  for (let i = 0; i < all.length; i++) {
    const lines = all[i];
    const tocLines = lines.filter((l) => TOC_LINE.test(l.text)).length;
    const isToc = tocLines >= 4;
    for (let j = 0; j < lines.length; j++) {
      const l = lines[j];
      let text = l.text;
      // numero da solo su una riga, titolo sulla riga seguente
      if (/^\d{1,2}(\.\d{1,2}){0,4}\.?$/.test(text) && lines[j + 1] && Math.abs(lines[j + 1].y - l.y) < l.size * 2.2) text = `${text} ${lines[j + 1].text}`;
      let num: string | null = null;
      let title = '';
      const w = text.match(WORD_HEAD);
      const m = text.match(NUM_HEAD);
      if (w) {
        num = w[2];
        title = (w[3] || `${w[1]} ${w[2]}`).trim();
      } else if (m) {
        num = m[1];
        title = m[2].trim();
      }
      if (!num) continue;
      if (TOC_LINE.test(text)) {
        if (isToc) continue;
        continue;
      }
      const first = parseInt(num.split('.')[0], 10);
      if (first === 0 || first > 40) continue;
      if (!/^[A-Za-zÀ-ÿ]/.test(title)) continue; // "1.5 bar" ecc.
      if (/^(bar|mm|kg|nm|v|a|kw|h|min|°c|x)\b/i.test(title)) continue;
      const emphasised = l.size >= median * 1.08 || l.bold;
      const plausible = title.length <= 90 && !/[,;:]$/.test(title) && /^[A-ZÀ-Ü]/.test(title);
      if (!emphasised && !(plausible && !isToc && title.split(' ').length <= 12)) continue;
      if (isToc) continue;
      const h = { num, title: title.replace(/\s+\d{1,4}$/, ''), page: i + 1, source: 'body' as const, size: l.size + (l.bold ? 0.5 : 0) };
      const prev = seen.get(num);
      if (!prev || (h.size > prev.size + 0.5 && h.page >= prev.page)) seen.set(num, h);
    }
  }
  for (const h of seen.values()) headings.push({ num: h.num, title: h.title, page: h.page, source: h.source });
  headings.sort((a, b) => a.page - b.page);
  const firstPagesText = [1, 2, 3].map((p) => pageTexts[String(p)] || '').join('\n');
  void ((pdf as any).loadingTask?.destroy?.() ?? (pdf as any).destroy?.());
  return { pageTexts, headings, pageCount: n, textless: totalChars < n * 30, firstPagesText };
}

// --- rendering con evidenziazione dei termini cercati
export async function renderPage(
  pdf: PDFDoc,
  n: number,
  canvas: HTMLCanvasElement,
  width: number,
  highlight: string[],
): Promise<{ rects: { x: number; y: number; w: number; h: number }[]; scale: number }> {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = width / base.width;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vp = page.getViewport({ scale: scale * dpr });
  canvas.width = vp.width;
  canvas.height = vp.height;
  canvas.style.width = `${vp.width / dpr}px`;
  canvas.style.height = `${vp.height / dpr}px`;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const terms = highlight.map((t) => t.toLowerCase()).filter((t) => t.length >= 3);
  if (terms.length) {
    const tc = await page.getTextContent();
    const vp1 = page.getViewport({ scale });
    for (const it of tc.items as any[]) {
      if (!it.str) continue;
      const s = it.str.toLowerCase();
      if (!terms.some((t) => s.includes(t))) continue;
      const [a, b, , , e, f] = pdfjs.Util.transform(vp1.transform, it.transform);
      const h = Math.hypot(a, b) || 10;
      rects.push({ x: e, y: f - h, w: it.width * scale, h: h * 1.15 });
    }
  }
  return { rects, scale };
}
