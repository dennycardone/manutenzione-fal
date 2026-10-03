// Ricerca globale tollerante: maiuscole/minuscole, accenti, singolare/plurale (radici),
// abbreviazioni (prefissi + elenco abbreviazioni del Manuale Generale), refusi lievi, codici.

import type { Dataset, ImportedDoc } from './types';
import type { Model } from './engine';
import { levenshtein, norm, stem, stems, stripAccents, tokens } from './text';

export type HitKind = 'prc' | 'item' | 'section' | 'pdm' | 'page' | 'heading';

export interface SearchDoc {
  kind: HitKind;
  id: string; // prcId, itemId, ...
  docId: string;
  page?: number;
  title: string;
  subtitle?: string;
  body: string;
  code?: string;
  num?: string;
  head: string[]; // radici dei campi principali
  all: string[]; // tutte le radici
}

export interface Hit {
  doc: SearchDoc;
  score: number;
  snippet: string;
}

const CODE_RE = /^([cmr][0-9x])[-\s]?(\d{3})(?:-(\d{3}))?$/i;

export class SearchIndex {
  docs: SearchDoc[] = [];
  vocab = new Map<string, number[]>();
  synonyms = new Map<string, string[][]>(); // radice abbreviazione -> elenchi di radici

  constructor(ds: Dataset, model: Model, imported: ImportedDoc[]) {
    for (const a of ds.general.abbreviations) {
      const k = stem(norm(a.abbr).replace(/[^a-z0-9]/g, ''));
      const meaning = stems(a.meaning.replace(/\(.*?\)/g, ''));
      if (!this.synonyms.has(k)) this.synonyms.set(k, []);
      this.synonyms.get(k)!.push(meaning);
    }
    for (const l of model.links) {
      const p = l.prc;
      this.add({
        kind: 'prc',
        id: p.id,
        docId: 'prc-c7',
        page: p.page,
        title: p.activity,
        subtitle: `${p.codeRaw} · ${p.component}`,
        body: [p.report, p.tools, l.organ, l.system, l.stadlerItem?.text, l.generalRef?.title, ...l.organRefs.map((o) => `${o.organName} ${o.manualName}`)].filter(Boolean).join(' · '),
        code: p.codeRaw,
        num: p.num || undefined,
        head: [...stems(p.activity), ...stems(p.component), ...stems(l.organ), ...stems(l.system)],
        all: [],
      });
    }
    for (const it of ds.general.items) {
      this.add({
        kind: 'item',
        id: it.id,
        docId: 'stadler',
        page: it.page,
        title: it.text,
        subtitle: `Manuale Generale · N. ${it.num} · ${it.interval} · cap. ${it.chapters.join(', ')}`,
        body: '',
        code: `${it.interval}-${it.num}`,
        num: it.num,
        head: stems(it.text),
        all: [],
      });
    }
    for (const s of ds.general.sections) {
      this.add({
        kind: 'section',
        id: `sec-${s.num}`,
        docId: 'stadler',
        page: s.page,
        title: `${s.num} ${s.title}`,
        subtitle: `Manuale Generale · pag. ${s.page}`,
        body: '',
        head: stems(s.title),
        all: [],
      });
    }
    for (const r of ds.pdm) {
      if (!r.desc && !r.componente) continue;
      this.add({
        kind: 'pdm',
        id: r.id,
        docId: 'pdm',
        page: r.page,
        title: r.desc || r.componente || '',
        subtitle: `PdM · ${r.codeRaw ?? 'senza codice'} · ${r.section === 'GENERALE' ? 'tabella generale' : r.section}`,
        body: [r.impianto, r.gruppo, r.componente, r.manual || r.manualInherited, r.chapter ? 'cap. ' + r.chapter : ''].filter(Boolean).join(' · '),
        code: r.codeRaw || undefined,
        num: r.num || undefined,
        head: [...stems(r.desc || ''), ...stems(r.componente || ''), ...stems(r.gruppo || '')],
        all: [],
      });
    }
    for (const d of imported) {
      for (const h of d.headings) {
        this.add({
          kind: 'heading',
          id: `${d.id}-h-${h.num}-${h.page}`,
          docId: d.id,
          page: h.page,
          title: `${h.num} ${h.title}`,
          subtitle: `${d.title} · pag. ${h.page}`,
          body: '',
          head: stems(h.title),
          all: [],
        });
      }
    }
    const pageSources: [string, string, Record<string, string>][] = [
      ['stadler', 'Manuale Generale', ds.pageTexts.stadler || {}],
      ...imported.map((d) => [d.id, d.title, d.pageTexts] as [string, string, Record<string, string>]),
    ];
    for (const [docId, title, pages] of pageSources) {
      for (const [pg, text] of Object.entries(pages)) {
        if (!text || text.length < 20) continue;
        this.add({
          kind: 'page',
          id: `${docId}-p${pg}`,
          docId,
          page: Number(pg) || undefined,
          title: `${title} – pagina ${pg}`,
          body: text,
          head: [],
          all: [],
        });
      }
    }
  }

  private add(d: SearchDoc) {
    const all = new Set([...d.head, ...stems(d.body), ...stems(d.subtitle || '')]);
    d.head = [...new Set(d.head)];
    d.all = [...all];
    const idx = this.docs.length;
    this.docs.push(d);
    for (const t of all) {
      if (!this.vocab.has(t)) this.vocab.set(t, []);
      this.vocab.get(t)!.push(idx);
    }
  }

  // alternative per ogni termine della query
  private expand(q: string): { term: string; alts: string[][] }[] {
    return tokens(q).map((t) => {
      const s = stem(t);
      const alts: string[][] = [[s]];
      const syn = this.synonyms.get(s.replace(/[^a-z0-9]/g, ''));
      if (syn) alts.push(...syn);
      return { term: t, alts };
    });
  }

  private matchTerm(term: string): Map<number, number> {
    // restituisce docIdx -> forza (3 esatto, 2 prefisso, 1 refuso)
    const out = new Map<number, number>();
    const put = (list: number[] | undefined, w: number) => {
      if (!list) return;
      for (const i of list) if ((out.get(i) || 0) < w) out.set(i, w);
    };
    put(this.vocab.get(term), 3);
    if (term.length >= 3) {
      for (const [v, list] of this.vocab) {
        if (v === term) continue;
        if (v.startsWith(term) || (v.length >= 4 && term.startsWith(v))) put(list, 2);
        else if (term.length >= 5 && Math.abs(v.length - term.length) <= 1 && v[0] === term[0] && levenshtein(v, term, 1) <= 1) put(list, 1);
      }
    }
    return out;
  }

  search(q: string, limit = 60): Hit[] {
    const query = q.trim();
    if (!query) return [];
    const m = query.replace(/\s+/g, '').match(CODE_RE);
    if (m) {
      const code = `${m[1].toUpperCase().replace('CX', 'Cx')}-${m[2]}`;
      const hits = this.docs
        .filter((d) => d.code && d.code.toUpperCase().startsWith(code.toUpperCase()))
        .map((d) => ({ doc: d, score: d.kind === 'prc' ? 100 : d.kind === 'item' ? 80 : 60, snippet: d.body.slice(0, 160) }));
      return hits.sort((a, b) => b.score - a.score).slice(0, limit);
    }
    if (/^\d{3}$/.test(query)) {
      return this.docs
        .filter((d) => d.num === query)
        .map((d) => ({ doc: d, score: d.kind === 'prc' ? 100 : d.kind === 'item' ? 80 : 60, snippet: d.body.slice(0, 160) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }
    const groups = this.expand(query);
    if (!groups.length) return [];
    const scores = new Map<number, number>();
    const matched = new Map<number, number>();
    for (const g of groups) {
      const best = new Map<number, number>();
      for (const alt of g.alts) {
        // alternativa multi-parola (es. "accoppiatore automatico"): tutte le parole devono esserci
        let acc: Map<number, number> | null = null;
        for (const w of alt) {
          const mt = this.matchTerm(w);
          if (!acc) acc = mt;
          else {
            const nx: Map<number, number> = new Map();
            for (const [i, v] of acc) if (mt.has(i)) nx.set(i, Math.min(v, mt.get(i)!));
            acc = nx;
          }
        }
        for (const [i, v] of acc || []) if ((best.get(i) || 0) < v) best.set(i, v);
      }
      for (const [i, v] of best) {
        const d = this.docs[i];
        const inHead = d.head.some((h) => g.alts.some((a) => a.some((w) => h === w || h.startsWith(w))));
        scores.set(i, (scores.get(i) || 0) + v * (inHead ? 3 : 1));
        matched.set(i, (matched.get(i) || 0) + 1);
      }
    }
    const need = groups.length;
    const kindBoost: Record<HitKind, number> = { prc: 1.6, item: 1.2, section: 1.3, heading: 1.3, pdm: 1, page: 0.6 };
    const hits: Hit[] = [];
    for (const [i, s] of scores) {
      const mc = matched.get(i)!;
      if (mc < need && !(need >= 3 && mc >= need - 1)) continue;
      const d = this.docs[i];
      const phrase = norm(d.title + ' ' + d.body).includes(norm(query)) ? 1.5 : 1;
      hits.push({ doc: d, score: s * kindBoost[d.kind] * phrase * (mc / need), snippet: snippet(d.body || d.title, groups.map((g) => g.term)) });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

export function snippet(text: string, terms: string[], len = 180): string {
  if (!text) return '';
  const n = stripAccents(text.toLowerCase());
  let pos = -1;
  for (const t of terms) {
    const st = stem(t);
    pos = n.indexOf(st.length >= 3 ? st : t);
    if (pos >= 0) break;
  }
  if (pos < 0) return text.slice(0, len).replace(/\s+/g, ' ');
  const start = Math.max(0, pos - 60);
  return (start > 0 ? '…' : '') + text.slice(start, start + len).replace(/\s+/g, ' ') + (start + len < text.length ? '…' : '');
}
