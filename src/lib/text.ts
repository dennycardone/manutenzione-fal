// Normalizzazione testo italiano/tecnico per confronti e ricerca.

export function stripAccents(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function norm(s: string): string {
  return stripAccents((s || '').toLowerCase())
    .replace(/[’'`´]/g, ' ')
    .replace(/[^a-z0-9./\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(
  (
    'il lo la i gli le un uno una di a da in con su per tra fra e ed o od del dello della dei degli delle al allo alla ai agli alle ' +
    'dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle col coi che se non ne ci si ' +
    'sia siano sono deve devono poter puo eventuale eventuali eventualmente necessario necessari caso cui come anche piu ' +
    'gen ecc etc tutti tutte tutto tutta ogni'
  ).split(' ')
);

// Stemming leggero: riduce singolare/plurale e desinenze comuni
export function stem(t: string): string {
  if (/^\d/.test(t)) return t;
  if (t.length <= 4) return t;
  let s = t;
  for (const suf of ['amento', 'amenti', 'azione', 'azioni', 'atura', 'ature', 'mente']) {
    if (s.length > suf.length + 3 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      return s;
    }
  }
  s = s.replace(/(he|hi)$/, 'h');
  s = s.replace(/[aeio]$/, '');
  return s;
}

export function tokens(s: string): string[] {
  return norm(s)
    .split(/[\s./\-]+/)
    .filter((t) => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
}

export function stems(s: string): string[] {
  return tokens(s).map(stem);
}

function prefixEq(a: string, b: string): boolean {
  if (a === b) return true;
  const [x, y] = a.length < b.length ? [a, b] : [b, a];
  return x.length >= 4 && y.startsWith(x);
}

// Similarità testuale 0..1 (Dice su radici, con corrispondenza per prefisso per le abbreviazioni)
export function similarity(a: string, b: string): number {
  const A = [...new Set(stems(a).filter((t) => t.length > 2))];
  const B = [...new Set(stems(b).filter((t) => t.length > 2))];
  if (!A.length || !B.length) return 0;
  let hit = 0;
  const used = new Set<number>();
  for (const x of A) {
    const j = B.findIndex((y, k) => !used.has(k) && prefixEq(x, y));
    if (j >= 0) {
      used.add(j);
      hit++;
    }
  }
  const dice = (2 * hit) / (A.length + B.length);
  const contain = hit / Math.min(A.length, B.length);
  return Math.max(dice, contain * 0.85);
}

// Similarità pesata (IDF sul corpus): le parole generiche ("controllo", "viti", "visivo") pesano poco,
// quelle distintive ("stabilizzatore", "sabbiera", "antigelo") pesano molto.
export class WeightedSim {
  private df = new Map<string, number>();
  private n = 0;
  constructor(corpus: string[]) {
    for (const doc of corpus) {
      this.n++;
      for (const t of new Set(stems(doc).filter((x) => x.length > 2))) this.df.set(t, (this.df.get(t) || 0) + 1);
    }
  }
  w(t: string): number {
    let df = this.df.get(t);
    if (df === undefined) {
      // abbreviazioni: usa la parola del corpus con lo stesso prefisso
      for (const [k, v] of this.df) if (prefixEq(k, t)) { df = v; break; }
    }
    return Math.log(1 + this.n / (df || 1));
  }
  // quanto del testo `a` (riga PRC) è coperto da `b` (voce manuale), 0..1
  score(a: string, b: string): number {
    const A = [...new Set(stems(a).filter((t) => t.length > 2))];
    const B = [...new Set(stems(b).filter((t) => t.length > 2))];
    if (!A.length || !B.length) return 0;
    let tot = 0, hit = 0, totB = 0, hitB = 0;
    for (const x of A) {
      const w = this.w(x);
      tot += w;
      if (B.some((y) => prefixEq(x, y))) hit += w;
    }
    for (const y of B) {
      const w = this.w(y);
      totB += w;
      if (A.some((x) => prefixEq(x, y))) hitB += w;
    }
    const cov = hit / tot;
    const prec = hitB / totB;
    return 0.7 * cov + 0.3 * prec;
  }
}

// Chiave confrontabile per i nomi dei manuali (rimuove spazi spezzati dall'impaginazione)
export function manualKey(s: string): string {
  return stripAccents((s || '').toLowerCase()).replace(/\.pdf$/, '').replace(/[^a-z0-9]+/g, '');
}

export function levenshtein(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
      rowMin = Math.min(rowMin, dp[j]);
    }
    if (rowMin > max) return max + 1;
  }
  return dp[b.length];
}

export const INTERVALS: Record<string, string> = {
  C2: 'Settimanale',
  P2: '2 volte/anno (pulizia)',
  C3: '8.333 km – mensile',
  C4: '25.000 km – trimestrale',
  C5: '50.000 km – semestrale',
  C6: '100.000 km – annuale',
  C7: '200.000 km – biennale',
  M0: '250 h – 6 mesi (motore)',
  M4: '25.000 km / 1.500 h (motore)',
  M6: '100.000 km / 6.000 h (motore)',
  M7: '200.000 km / 10.000 h (motore)',
  R1: '400.000 km – quadriennale',
  R2: '800.000 km – 8 anni',
  R3: '1.600.000 km – 16 anni',
  EST: 'Revisione estintori',
  Cx: 'Non indicato',
};

export const OS_LABEL: Record<string, string> = { R: 'Reliability', S: 'Safety', C: 'Comfort' };

export function intervalRank(iv: string | null | undefined): number {
  const order = ['C2', 'P2', 'C3', 'C4', 'C5', 'C6', 'C7', 'R1', 'R2', 'R3'];
  const i = order.indexOf(iv || '');
  return i < 0 ? 99 : i;
}

export function cmpChapter(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

export function cleanChapter(c?: string | null): string | null {
  if (!c) return null;
  const s = c.trim().replace(/\.$/, '');
  return s || null;
}
