// Riconoscimento dei file importati e analisi dei manuali organo.

import { sha256 } from './db';
import { findHeading, type ExpectedManual, type Model } from './engine';
import { extractCsv, extractDocx, extractXlsx } from './office';
import { extractPdf, openPdf, type Extracted } from './pdf';
import { manualKey, norm } from './text';
import type { Dataset, ImportedDoc } from './types';

export type Identified =
  | { type: 'package'; data: Dataset }
  | { type: 'backup'; data: any }
  | { type: 'known'; docId: string; pageOffset: number; how: string }
  | { type: 'unknown'; ext: string };

export function extOf(name: string) {
  return (name.split('.').pop() || '').toLowerCase();
}

export async function identify(file: File, ds: Dataset | null): Promise<Identified> {
  const ext = extOf(file.name);
  if (ext === 'json') {
    const data = JSON.parse(await file.text());
    if (data?.type === 'manutenzione-fal-backup') return { type: 'backup', data };
    if (data?.schema && Array.isArray(data.prc) && Array.isArray(data.pdm) && data.general) return { type: 'package', data };
    throw new Error('File JSON non riconosciuto: serve il pacchetto dati o un backup dell’app.');
  }
  if (ext === 'pdf' && ds) {
    const buf = await file.arrayBuffer();
    const h = await sha256(buf);
    const bySha = ds.documents.find((d) => d.sha256 && d.sha256 === h);
    if (bySha) return { type: 'known', docId: bySha.id, pageOffset: 0, how: 'impronta digitale identica al documento analizzato' };
    // firma testuale nelle prime pagine (spazi rimossi: pdf.js può spezzare le parole), poi nome file + numero pagine
    const pdf = await openPdf(buf);
    let text = '';
    for (let i = 1; i <= Math.min(6, pdf.numPages); i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      text += (tc.items as any[]).map((x) => x.str).join('') + '\n';
    }
    const flat = text.replace(/\s+/g, '');
    const fk = manualKey(file.name);
    for (const d of ds.documents) {
      const sig = (d.signature || []).map((x) => x.replace(/\s+/g, ''));
      const bySig = sig.length > 0 && (sig.every((x) => flat.includes(x)) || (d.pageCount === pdf.numPages && sig.some((x) => flat.includes(x))));
      const dk = manualKey(d.fileName || '');
      const byName = !!dk && fk === dk && (!d.pageCount || d.pageCount === pdf.numPages);
      if (bySig || byName) {
        let offset = 0;
        if (d.id === 'stadler') offset = await detectStadlerOffset(pdf);
        void ((pdf as any).loadingTask?.destroy?.() ?? (pdf as any).destroy?.());
        return { type: 'known', docId: d.id, pageOffset: offset, how: bySig ? `contiene "${d.signature![0]}"` : `nome file e numero di pagine (${pdf.numPages}) corrispondenti` };
      }
    }
    void ((pdf as any).loadingTask?.destroy?.() ?? (pdf as any).destroy?.());
  }
  return { type: 'unknown', ext };
}

// Il Manuale Generale numera le pagine "Pagina X / 174": verifica che coincidano con le pagine del PDF
async function detectStadlerOffset(pdf: Awaited<ReturnType<typeof openPdf>>): Promise<number> {
  for (const probe of [36, 75, 141]) {
    for (let delta = -3; delta <= 3; delta++) {
      const n = probe + delta;
      if (n < 1 || n > pdf.numPages) continue;
      const tc = await (await pdf.getPage(n)).getTextContent();
      const t = (tc.items as any[]).map((x) => x.str).join(' ');
      const m = t.match(/Pagina\s*(\d+)\s*\/\s*174/);
      if (m) return n - Number(m[1]);
    }
  }
  return 0;
}

export async function extractAny(file: File, onProgress?: (p: number, t: number) => void): Promise<Extracted & { fileType: ImportedDoc['fileType'] }> {
  const ext = extOf(file.name);
  const buf = await file.arrayBuffer();
  if (ext === 'pdf') return { ...(await extractPdf(buf, onProgress)), fileType: 'pdf' };
  if (ext === 'docx') return { ...(await extractDocx(buf)), textless: false, fileType: 'docx' };
  if (ext === 'xlsx' || ext === 'xlsm') return { ...(await extractXlsx(buf)), textless: false, fileType: 'xlsx' };
  if (ext === 'csv') return { ...extractCsv(await file.text()), textless: false, fileType: 'csv' };
  if (ext === 'txt' || ext === 'md') {
    const t = await file.text();
    return { pageTexts: { '1': t }, headings: [], pageCount: 1, textless: false, firstPagesText: t.slice(0, 4000), fileType: 'txt' };
  }
  throw new Error(`Formato .${ext} non supportato. Formati accettati: PDF, DOCX, XLSX, CSV, TXT.`);
}

// codici distintivi (numeri documento) per confrontare il file con i manuali attesi dal PdM
function chunks(s: string): Set<string> {
  const out = new Set<string>();
  const n = norm(s).replace(/[^a-z0-9]+/g, ' ');
  for (const t of n.split(' ')) if (t.length >= 4 && /\d/.test(t)) out.add(t);
  const k = manualKey(s);
  for (const m of k.match(/\d{4,}/g) || []) out.add(m);
  for (const w of n.split(' ')) if (w.length >= 6 && !/\d/.test(w)) out.add(w);
  return out;
}

export interface ManualSuggestion {
  manual: ExpectedManual;
  score: number;
  reasons: string[];
}

export function suggestManuals(fileName: string, firstText: string, expected: ExpectedManual[]): ManualSuggestion[] {
  const fk = manualKey(fileName);
  const fileChunks = chunks(fileName + ' ' + firstText.slice(0, 3000));
  const out: ManualSuggestion[] = [];
  for (const e of expected) {
    if (e.inGeneral) continue;
    const reasons: string[] = [];
    let score = 0;
    if (e.key && (fk === e.key || (fk.length > 6 && (fk.includes(e.key) || e.key.includes(fk))))) {
      score = 1;
      reasons.push('nome file uguale al nome indicato nel PdM');
    } else {
      const ec = new Set<string>();
      for (const n of e.names) chunks(n).forEach((c) => ec.add(c));
      const common = [...ec].filter((c) => fileChunks.has(c) || fk.includes(c));
      const digitCommon = common.filter((c) => /\d{4,}/.test(c));
      if (common.length) {
        score = Math.min(0.95, (digitCommon.length ? 0.6 : 0.25) + 0.12 * common.length);
        reasons.push(`elementi in comune: ${common.slice(0, 4).join(', ')}`);
      }
    }
    if (score > 0) out.push({ manual: e, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}

export interface OrganReport {
  refs: number;
  exact: number;
  parent: number;
  notFound: { chapter: string | null; organ: string; codes: string[] }[];
  activities: number;
}

export function organReport(doc: Pick<ImportedDoc, 'headings'> & Partial<ImportedDoc>, keys: string[], model: Model): OrganReport {
  const rep: OrganReport = { refs: 0, exact: 0, parent: 0, notFound: [], activities: 0 };
  const byChapter = new Map<string, { chapter: string | null; organ: string; codes: Set<string>; res: 'exact' | 'parent' | 'none' }>();
  for (const l of model.links) {
    const refs = l.organRefs.filter((o) => keys.includes(o.manualKey));
    if (refs.length) rep.activities++;
    for (const o of refs) {
      rep.refs++;
      const k = `${o.chapter}`;
      if (!byChapter.has(k)) {
        const f = findHeading(doc as ImportedDoc, o.chapter);
        byChapter.set(k, { chapter: o.chapter, organ: o.organName, codes: new Set(), res: f ? (f.exact ? 'exact' : 'parent') : 'none' });
      }
      const e = byChapter.get(k)!;
      e.codes.add(l.code);
      if (e.res === 'exact') rep.exact++;
      else if (e.res === 'parent') rep.parent++;
    }
  }
  for (const e of byChapter.values()) if (e.res === 'none') rep.notFound.push({ chapter: e.chapter, organ: e.organ, codes: [...e.codes] });
  return rep;
}
