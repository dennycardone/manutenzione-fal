import React, { useEffect, useState } from 'react';
import { LuDatabase, LuDownload, LuSettings, LuShieldCheck, LuTrash2, LuUpload } from 'react-icons/lu';
import { QuickImport } from '../components/QuickImport';
import { Card, fmtDate, Kv, PageHeader } from '../components/ui';
import { requestPersist, storageEstimate } from '../lib/db';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';

declare const __APP_VERSION__: string;

export function SettingsPage() {
  const st = useStore();
  const [est, setEst] = useState('');
  const [persist, setPersist] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    storageEstimate().then(setEst);
    navigator.storage?.persisted?.().then(setPersist).catch(() => {});
  }, [st.imported.length, Object.keys(st.attachments).length]);
  const ds = st.dataset;

  async function download(includeDataset: boolean) {
    const blob = await st.exportBackup(includeDataset);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `manutenzione-fal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  return (
    <div className="max-w-4xl">
      <PageHeader icon={<LuSettings />} title="Impostazioni" />
      <div className="space-y-6">
        <Card title="Pacchetto dati">
          {ds ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Kv k="Generato il" v={fmtDate(ds.generatedAt)} />
              <Kv k="Estrattore" v={ds.generator} />
              <Kv k="Schema" v={String(ds.schema)} />
              <Kv k="Attività PRC" v={ds.prc.length} />
              <Kv k="Righe PdM" v={ds.pdm.length} />
              <Kv k="Voci Manuale Generale" v={`${ds.general.items.length} (cap. 23) + ${ds.general.tableItems.length} (tabelle)`} />
            </div>
          ) : (
            <div className="text-sm text-muted">Nessun pacchetto caricato.</div>
          )}
          <div className="mt-5">
            <div className="label mb-2">Carica o aggiorna (pacchetto dati, PDF, backup)</div>
            <QuickImport compact />
          </div>
        </Card>

        <Card title="Backup delle decisioni e dei manuali">
          <p className="mb-4 text-sm text-muted">
            Il backup contiene le decisioni del “Controllo collegamenti”, le note, i preferiti e i dati estratti dai manuali organo (non i file PDF, che vanno ricollegati). Serve per
            passare su un altro dispositivo o per non perdere il lavoro.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => download(false)}>
              <LuDownload /> Esporta backup
            </button>
            <button className="btn btn-ghost" onClick={() => download(true)}>
              <LuDownload /> Backup + pacchetto dati
            </button>
            <label className="btn btn-ghost cursor-pointer">
              <LuUpload /> Ripristina backup
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setMsg(await st.importBackup(JSON.parse(await f.text())));
                  } catch (err: any) {
                    setMsg(err.message);
                  }
                }}
              />
            </label>
          </div>
          {msg && <div className="mt-3 rounded-lg bg-canvas p-3 text-sm">{msg}</div>}
        </Card>

        <Card title="Archivio su questo dispositivo">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <LuDatabase className="text-xl text-brand-600" />
            <span className="flex-1">{est || 'Spazio non disponibile'}</span>
            {persist === false && (
              <button className="btn btn-ghost btn-sm" onClick={async () => setPersist(await requestPersist())}>
                Rendi persistente
              </button>
            )}
            {persist && <span className="text-xs text-ok">Archivio persistente</span>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn btn-ghost"
              onClick={async () => {
                if (confirm('Cancellare TUTTI i dati dell’app da questo dispositivo (pacchetto, PDF, manuali, decisioni, note)?')) {
                  await st.resetAll();
                  navigate('/');
                }
              }}
            >
              <LuTrash2 /> Cancella tutti i dati locali
            </button>
          </div>
        </Card>

        <Card title="Riservatezza e funzionamento">
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
              <LuShieldCheck className="mt-0.5 shrink-0 text-ok" />
              L’app pubblicata contiene solo il programma. Documenti, dati estratti e decisioni sono salvati nel browser di questo dispositivo (IndexedDB) e non vengono inviati a nessun server.
            </li>
            <li className="flex gap-2">
              <LuShieldCheck className="mt-0.5 shrink-0 text-ok" />
              Ogni dato mostrato riporta il documento e la pagina di origine. I collegamenti incerti sono marcati “Da verificare” e non vengono mai completati in automatico.
            </li>
            <li className="flex gap-2">
              <LuShieldCheck className="mt-0.5 shrink-0 text-ok" />
              Nuova revisione di PRC, PdM o Manuale Generale: va rigenerato il pacchetto dati con lo script di estrazione (cartella <span className="code">extract/</span> del progetto). I
              manuali organo invece si aggiungono direttamente dall’app.
            </li>
          </ul>
          <div className="mt-4 text-xs text-muted">Versione {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}</div>
        </Card>
      </div>
    </div>
  );
}
