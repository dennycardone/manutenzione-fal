import React, { useRef, useState } from 'react';
import { LuCircleAlert, LuCircleCheck, LuFilePlus, LuLoader } from 'react-icons/lu';
import { identify } from '../lib/importer';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import type { Dataset } from '../lib/types';

// file in attesa di classificazione (passati alla procedura guidata)
export const pending: { files: File[] } = { files: [] };

interface Row {
  name: string;
  state: 'work' | 'ok' | 'err' | 'ask';
  msg: string;
}

export function QuickImport({ compact }: { compact?: boolean }) {
  const st = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [drag, setDrag] = useState(false);

  async function handle(files: File[]) {
    // prima il pacchetto dati, poi i PDF (servono le firme dei documenti)
    const sorted = [...files].sort((a, b) => Number(!a.name.endsWith('.json')) - Number(!b.name.endsWith('.json')));
    let ds: Dataset | null = st.dataset;
    const ask: File[] = [];
    const out: Row[] = sorted.map((f) => ({ name: f.name, state: 'work', msg: 'Analisi…' }));
    setRows([...out]);
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      try {
        const r = await identify(f, ds);
        if (r.type === 'package') {
          await st.setDataset(r.data, f.name);
          ds = r.data;
          out[i] = { name: f.name, state: 'ok', msg: `Pacchetto dati caricato: ${r.data.prc.length} attività PRC, ${r.data.pdm.length} righe PdM, ${r.data.general.items.length} voci Manuale Generale.` };
        } else if (r.type === 'backup') {
          const msg = await st.importBackup(r.data);
          if (r.data.dataset) ds = r.data.dataset;
          out[i] = { name: f.name, state: 'ok', msg };
        } else if (r.type === 'known') {
          await st.attach(r.docId, f, f.name, r.pageOffset);
          const t = ds?.documents.find((d) => d.id === r.docId)?.title || r.docId;
          out[i] = { name: f.name, state: 'ok', msg: `Collegato a “${t}” (${r.how})${r.pageOffset ? `, scostamento pagine ${r.pageOffset > 0 ? '+' : ''}${r.pageOffset}` : ''}.` };
          await st.log({ fileName: f.name, kind: 'PDF collegato', summary: [`Documento: ${t}`, `Riconosciuto: ${r.how}`] });
        } else {
          ask.push(f);
          out[i] = { name: f.name, state: 'ask', msg: ds ? 'Nuovo documento: scegli la tipologia nella procedura guidata.' : 'Carica prima il pacchetto dati (.json).' };
        }
      } catch (e: any) {
        out[i] = { name: f.name, state: 'err', msg: e?.message || String(e) };
      }
      setRows([...out]);
    }
    if (ask.length && ds) {
      pending.files = ask;
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle([...e.dataTransfer.files]);
        }}
        onClick={() => ref.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${
          compact ? 'py-6' : 'py-10'
        } ${drag ? 'border-brand-500 bg-brand-50' : 'border-brand-200 bg-white hover:border-brand-500 hover:bg-brand-50/50'}`}
      >
        <LuFilePlus className="mb-2 text-3xl text-brand-500" />
        <div className="font-semibold text-ink">Trascina qui i file oppure tocca per sceglierli</div>
        <div className="mt-1 text-sm text-muted">Pacchetto dati (.json), PRC C7, Trasmissione PdM, Manuale Generale, manuali organo (PDF, DOCX, XLSX, CSV)</div>
        <input ref={ref} type="file" multiple className="hidden" accept=".json,.pdf,.docx,.xlsx,.xlsm,.csv,.txt" onChange={(e) => e.target.files && handle([...e.target.files])} />
      </div>
      {rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm">
              <span className="mt-0.5 text-lg">
                {r.state === 'work' && <LuLoader className="animate-spin text-brand-500" />}
                {r.state === 'ok' && <LuCircleCheck className="text-ok" />}
                {r.state === 'err' && <LuCircleAlert className="text-miss" />}
                {r.state === 'ask' && <LuCircleAlert className="text-part" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-muted">{r.msg}</div>
              </div>
              {r.state === 'ask' && st.dataset && (
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/documenti/nuovo?pending=1')}>
                  Classifica
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
