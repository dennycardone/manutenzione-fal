import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { db, sha256 } from './db';
import { buildModel, type Model } from './engine';
import { SearchIndex } from './search';
import type { Dataset, Decision, FileAttachment, ImportedDoc, ImportLog } from './types';

interface Store {
  ready: boolean;
  dataset: Dataset | null;
  imported: ImportedDoc[];
  decisions: Record<string, Decision>;
  attachments: Record<string, FileAttachment>;
  importLog: ImportLog[];
  notes: Record<string, string>;
  favorites: string[];
  recent: string[];
  model: Model | null;
  index: SearchIndex | null;
  setDataset: (ds: Dataset, fileName: string) => Promise<void>;
  attach: (docId: string, file: Blob, fileName: string, pageOffset: number) => Promise<void>;
  detach: (docId: string) => Promise<void>;
  getFile: (docId: string) => Promise<Blob | null>;
  addImported: (doc: ImportedDoc, file: Blob) => Promise<void>;
  updateImported: (doc: ImportedDoc) => Promise<void>;
  removeImported: (id: string) => Promise<void>;
  setDecision: (d: Decision) => Promise<void>;
  clearDecision: (key: string) => Promise<void>;
  setNote: (id: string, text: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  pushRecent: (id: string) => void;
  log: (entry: Omit<ImportLog, 'id' | 'at'>) => Promise<void>;
  exportBackup: (includeDataset: boolean) => Promise<Blob>;
  importBackup: (json: any) => Promise<string>;
  resetAll: () => Promise<void>;
  docTitle: (docId: string) => string;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [dataset, setDs] = useState<Dataset | null>(null);
  const [imported, setImported] = useState<ImportedDoc[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [attachments, setAttachments] = useState<Record<string, FileAttachment>>({});
  const [importLog, setLog] = useState<ImportLog[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [favorites, setFav] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [ds, imp, dec, att, lg, nt, fv, rc] = await Promise.all([
          db.get<Dataset>('kv', 'dataset'),
          db.get<ImportedDoc[]>('kv', 'imported'),
          db.get<Record<string, Decision>>('kv', 'decisions'),
          db.get<Record<string, FileAttachment>>('kv', 'attachments'),
          db.get<ImportLog[]>('kv', 'importLog'),
          db.get<Record<string, string>>('kv', 'notes'),
          db.get<string[]>('kv', 'favorites'),
          db.get<string[]>('kv', 'recent'),
        ]);
        setDs(ds || null);
        setImported(imp || []);
        setDecisions(dec || {});
        setAttachments(att || {});
        setLog(lg || []);
        setNotes(nt || {});
        setFav(fv || []);
        setRecent(rc || []);
      } catch (e) {
        console.error(e);
      }
      setReady(true);
    })();
  }, []);

  // valori sempre aggiornati per le azioni asincrone in sequenza
  const cur = useRef({ imported, decisions, attachments, notes, favorites });
  cur.current = { imported, decisions, attachments, notes, favorites };

  const model = useMemo(() => (dataset ? buildModel(dataset, imported, decisions) : null), [dataset, imported, decisions]);
  const index = useMemo(() => (dataset && model ? new SearchIndex(dataset, model, imported) : null), [dataset, model, imported]);

  const log = useCallback(async (entry: Omit<ImportLog, 'id' | 'at'>) => {
    const e: ImportLog = { ...entry, id: crypto.randomUUID(), at: new Date().toISOString() };
    setLog((prev) => {
      const next = [e, ...prev].slice(0, 50);
      db.set('kv', 'importLog', next);
      return next;
    });
  }, []);

  const store: Store = {
    ready,
    dataset,
    imported,
    decisions,
    attachments,
    importLog,
    notes,
    favorites,
    recent,
    model,
    index,
    async setDataset(ds, fileName) {
      await db.set('kv', 'dataset', ds);
      setDs(ds);
      await log({
        fileName,
        kind: 'Pacchetto dati',
        summary: [`${ds.prc.length} attività PRC`, `${ds.pdm.length} righe PdM`, `${ds.general.items.length} voci Manuale Generale (cap. 23)`, `${ds.general.sections.length} capitoli`],
      });
    },
    async attach(docId, file, fileName, pageOffset) {
      const buf = await file.arrayBuffer();
      const meta: FileAttachment = { docId, fileName, size: file.size, sha256: await sha256(buf), pageOffset, attachedAt: new Date().toISOString() };
      await db.set('files', docId, file);
      const next = { ...cur.current.attachments, [docId]: meta };
      cur.current.attachments = next;
      await db.set('kv', 'attachments', next);
      setAttachments(next);
    },
    async detach(docId) {
      await db.del('files', docId);
      const next = { ...cur.current.attachments };
      delete next[docId];
      cur.current.attachments = next;
      await db.set('kv', 'attachments', next);
      setAttachments(next);
    },
    async getFile(docId) {
      return ((await db.get<Blob>('files', docId)) as Blob) || null;
    },
    async addImported(doc, file) {
      await db.set('files', doc.id, file);
      const next = [...cur.current.imported.filter((d) => d.id !== doc.id), doc];
      cur.current.imported = next;
      await db.set('kv', 'imported', next);
      setImported(next);
    },
    async updateImported(doc) {
      const next = cur.current.imported.map((d) => (d.id === doc.id ? doc : d));
      cur.current.imported = next;
      await db.set('kv', 'imported', next);
      setImported(next);
    },
    async removeImported(id) {
      await db.del('files', id);
      const next = cur.current.imported.filter((d) => d.id !== id);
      cur.current.imported = next;
      await db.set('kv', 'imported', next);
      setImported(next);
    },
    async setDecision(d) {
      const next = { ...cur.current.decisions, [d.key]: d };
      cur.current.decisions = next;
      await db.set('kv', 'decisions', next);
      setDecisions(next);
    },
    async clearDecision(key) {
      const next = { ...cur.current.decisions };
      delete next[key];
      cur.current.decisions = next;
      await db.set('kv', 'decisions', next);
      setDecisions(next);
    },
    async setNote(id, text) {
      const next = { ...cur.current.notes, [id]: text };
      if (!text.trim()) delete next[id];
      await db.set('kv', 'notes', next);
      setNotes(next);
    },
    async toggleFavorite(id) {
      const f = cur.current.favorites;
      const next = f.includes(id) ? f.filter((x) => x !== id) : [id, ...f];
      await db.set('kv', 'favorites', next);
      setFav(next);
    },
    pushRecent(id) {
      setRecent((prev) => {
        const next = [id, ...prev.filter((x) => x !== id)].slice(0, 12);
        db.set('kv', 'recent', next);
        return next;
      });
    },
    log,
    async exportBackup(includeDataset) {
      const data = {
        type: 'manutenzione-fal-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        decisions,
        notes,
        favorites,
        imported,
        importLog,
        dataset: includeDataset ? dataset : undefined,
      };
      return new Blob([JSON.stringify(data)], { type: 'application/json' });
    },
    async importBackup(json) {
      if (json?.type !== 'manutenzione-fal-backup') throw new Error('Il file non è un backup di questa app.');
      if (json.dataset) {
        await db.set('kv', 'dataset', json.dataset);
        setDs(json.dataset);
      }
      const dec = { ...decisions, ...(json.decisions || {}) };
      const nt = { ...notes, ...(json.notes || {}) };
      const fv = [...new Set([...(json.favorites || []), ...favorites])];
      const imp = [...imported.filter((d) => !(json.imported || []).some((x: ImportedDoc) => x.id === d.id)), ...(json.imported || [])];
      await Promise.all([db.set('kv', 'decisions', dec), db.set('kv', 'notes', nt), db.set('kv', 'favorites', fv), db.set('kv', 'imported', imp)]);
      setDecisions(dec);
      setNotes(nt);
      setFav(fv);
      setImported(imp);
      return `Ripristinate ${Object.keys(json.decisions || {}).length} decisioni, ${Object.keys(json.notes || {}).length} note, ${(json.imported || []).length} manuali (i file PDF dei manuali vanno ricollegati).`;
    },
    async resetAll() {
      await db.clear('kv');
      await db.clear('files');
      setDs(null);
      setImported([]);
      setDecisions({});
      setAttachments({});
      setLog([]);
      setNotes({});
      setFav([]);
      setRecent([]);
    },
    docTitle(docId) {
      const d = dataset?.documents.find((x) => x.id === docId);
      if (d) return d.title;
      return imported.find((x) => x.id === docId)?.title || docId;
    },
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
