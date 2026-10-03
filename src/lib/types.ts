// Tipi dati della piattaforma. Ogni record conserva documento + pagina + testo originale.

export type DocKind = 'prc' | 'link' | 'general' | 'organ' | 'other';

export interface DocMeta {
  id: string;
  kind: DocKind;
  title: string;
  docCode?: string;
  revision?: string;
  fileName?: string;
  pageCount?: number;
  sha256?: string | null;
  signature?: string[];
  pageNote?: string;
}

export interface PrcRow {
  id: string;
  row: number;
  codeRaw: string;
  interval: string | null; // C2..C7, Cx
  num: string | null; // numero attività a 3 cifre
  component: string;
  activity: string;
  os: string | null; // R / S / C
  report: string | null;
  tools: string | null;
  compet: string | null;
  page: number;
  highlight: boolean;
}

export type PdmRole = 'general' | 'parent' | 'child' | 'header' | 'uncoded';

export interface PdmRow {
  id: string;
  row: number;
  page: number;
  section: string;
  role: PdmRole;
  codeRaw: string | null;
  interval: string | null;
  num: string | null;
  childNum: string | null;
  parentCode?: string;
  codeInferredFrom?: string;
  impianto?: string;
  idRef?: string;
  gruppo?: string;
  componente?: string;
  desc?: string;
  manual?: string;
  manualInherited?: string;
  chapter?: string;
  stadlerChapter?: string;
  organChapter?: string;
  time?: string;
  km?: string;
  rotabile?: string;
  category?: string;
  mestiere?: string;
  compet?: string;
  competDesc?: string;
}

export interface GeneralSection {
  num: string;
  title: string;
  page: number;
  level: number;
}

export interface GeneralItem {
  id: string;
  num: string;
  interval: string; // M0, C2, C3 ... R3
  summarySection: string; // 23.x.y
  chapters: string[]; // es. "4.5.1" oppure "DGHB 8.3"
  text: string;
  raw: string;
  page: number;
}

export interface GeneralTableItem {
  id: string;
  num: string;
  section: string | null;
  page: number;
  text: string;
  header: string;
}

export interface Dataset {
  schema: number;
  generatedAt: string;
  generator: string;
  documents: DocMeta[];
  prc: PrcRow[];
  pdm: PdmRow[];
  general: {
    docId: string;
    sections: GeneralSection[];
    items: GeneralItem[];
    tableItems: GeneralTableItem[];
    abbreviations: { abbr: string; meaning: string; page: number }[];
  };
  pageTexts: Record<string, Record<string, string>>;
}

// ---- Documenti importati dall'utente (manuali organo, altro)

export interface Heading {
  num: string; // "8.3", "Section 4", "Capitolo 5"
  title: string;
  page: number; // pagina fisica del PDF (1-based)
  source: 'body' | 'toc' | 'manual';
}

export interface ImportedDoc {
  id: string;
  kind: 'organ' | 'other' | 'general';
  title: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt';
  sha256: string;
  pageCount: number;
  importedAt: string;
  organName?: string;
  system?: string;
  manualKeys: string[]; // chiavi normalizzate dei nomi manuale del PdM che questo file rappresenta (confermate dall'utente)
  headings: Heading[];
  pageTexts: Record<string, string>; // pagina -> testo (o "Foglio!riga" per xlsx)
  textless?: boolean; // PDF senza testo (scansione)
  notes?: string;
}

export interface ImportLog {
  id: string;
  at: string;
  fileName: string;
  kind: string;
  summary: string[];
}

// ---- Decisioni dell'operatore

export type DecisionAction = 'confirm' | 'override' | 'ignore';

export interface Decision {
  key: string; // `${prcId}` per collegamento attività, `${prcId}|organ|${i}` per pagina procedura
  action: DecisionAction;
  overrideNum?: string; // numero Stadler scelto manualmente
  overridePage?: number; // pagina procedura scelta manualmente
  note?: string;
  at: string;
}

export interface FileAttachment {
  docId: string;
  fileName: string;
  size: number;
  sha256: string;
  pageOffset: number; // pagina fisica = pagina riferimento + offset
  attachedAt: string;
}

// ---- Risultato motore collegamenti

export type Status = 'complete' | 'partial' | 'missing' | 'verify';
export type Severity = 'error' | 'warning' | 'info';

export interface Evidence {
  docId: string;
  page: number;
  text: string;
  label: string;
}

export interface Anomaly {
  type: string;
  severity: Severity;
  message: string;
  evidence: Evidence[];
  suggestion?: { num: string; itemId: string; score: number; text: string };
}

export interface OrganRef {
  pdmRowId: string;
  organName: string;
  manualName: string; // come scritto nel PdM
  manualKey: string; // normalizzato
  chapter: string | null; // capitolo nel manuale organo
  inherited: boolean; // manuale ereditato dalla riga padre
  inGeneralManual: boolean; // la procedura è nel Manuale Generale stesso
  importedDocId?: string;
  procedurePage?: number;
  procedureTitle?: string;
  procedureMatch?: 'exact' | 'parent' | 'manual' | 'none';
  desc?: string;
}

export interface GeneralRef {
  chapter: string; // capitolo Manuale Generale
  title?: string;
  page?: number; // pagina inizio capitolo (riferimento "Pagina X / 174")
  itemPage?: number; // pagina precisa della riga attività nel capitolo
  dghbChapter?: string; // se il cap. 23 rimanda al Manuale Carrelli
  sources: string[];
}

export interface ActivityLink {
  prc: PrcRow;
  code: string;
  system: string;
  organ: string;
  stadlerItem?: GeneralItem;
  stadlerCandidates: GeneralItem[];
  stadlerTableItems: GeneralTableItem[];
  textScore: number;
  method: 'codice+testo' | 'codice' | 'testo' | 'manuale' | 'nessuno';
  confidence: number; // 0..1
  pdmGeneral: PdmRow[];
  pdmParent?: PdmRow;
  pdmChildren: PdmRow[];
  generalRef?: GeneralRef;
  organRefs: OrganRef[];
  anomalies: Anomaly[];
  status: Status;
  decision?: Decision;
  reviewOpen: boolean; // compare in "Da verificare"
}

export interface LinkRecord {
  id: string;
  from: { label: string; docId: string; page?: number };
  to: { label: string; docId?: string; page?: number };
  method: string;
  confidence: number;
  status: Status;
  prcId: string;
}
