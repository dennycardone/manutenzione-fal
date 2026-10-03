import React from 'react';
import { LuBookOpen, LuCircleCheck, LuExternalLink, LuFilePlus, LuPaperclip, LuTrash2, LuUpload } from 'react-icons/lu';
import { Card, displayManual, fmtDate, PageHeader } from '../components/ui';
import { identify } from '../lib/importer';
import { Link, viewerHref } from '../lib/router';
import { useStore } from '../lib/store';
import { Onboarding } from './Dashboard';

export function ManualsPage() {
  const st = useStore();
  const { dataset, model, imported, attachments } = st;
  if (!dataset || !model) return <Onboarding />;
  const expected = model.expectedManuals.filter((e) => !e.inGeneral);
  const linkedIds = new Set(expected.map((e) => e.importedDocId).filter(Boolean));
  const others = imported.filter((d) => !linkedIds.has(d.id));
  const kindLabel: Record<string, string> = { prc: 'PRC C7', link: 'Documento di collegamento', general: 'Manuale Generale' };

  async function attach(docId: string, f: File) {
    const r = await identify(f, dataset);
    if (r.type === 'known' && r.docId !== docId) {
      alert(`Il file è stato riconosciuto come “${st.docTitle(r.docId)}”: lo collego a quel documento.`);
      await st.attach(r.docId, f, f.name, r.pageOffset);
      return;
    }
    if (r.type !== 'known' && !confirm('Il file non è stato riconosciuto con certezza (impronta o intestazione diverse). Collegarlo comunque a questo documento?')) return;
    await st.attach(docId, f, f.name, r.type === 'known' ? r.pageOffset : 0);
    await st.log({ fileName: f.name, kind: 'PDF collegato', summary: [st.docTitle(docId)] });
  }

  return (
    <div>
      <PageHeader
        icon={<LuBookOpen />}
        title="Manuali e documenti"
        subtitle="I documenti della catena: PRC C7 → documento di collegamento → Manuale Generale → manuali degli organi."
        actions={
          <Link to="/documenti/nuovo" className="btn btn-primary">
            <LuFilePlus /> Aggiungi documento
          </Link>
        }
      />
      <Card title="Documenti di base" pad={false} className="mb-6">
        <ul className="divide-y divide-line">
          {dataset.documents.map((d) => {
            const a = attachments[d.id];
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <LuBookOpen />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="label">{kindLabel[d.kind] || d.kind}</div>
                  <div className="font-semibold">{d.title}</div>
                  <div className="text-xs text-muted">
                    {d.docCode} · rev. {d.revision} · {d.pageCount} pagine
                    {a ? (
                      <span className="text-ok">
                        {' '}
                        · PDF collegato: {a.fileName}
                        {a.pageOffset ? ` (scostamento pagine ${a.pageOffset})` : ''}
                      </span>
                    ) : (
                      <span className="text-part"> · PDF non collegato su questo dispositivo</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to={viewerHref(d.id, 1)} className="btn btn-ghost btn-sm">
                    <LuExternalLink /> Apri
                  </Link>
                  <label className="btn btn-ghost btn-sm cursor-pointer">
                    <LuPaperclip /> {a ? 'Sostituisci PDF' : 'Collega PDF'}
                    <input type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && attach(d.id, e.target.files[0])} />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card
        title={`Manuali organo indicati nel documento di collegamento · caricati ${expected.filter((e) => e.importedDocId).length} di ${expected.length}`}
        pad={false}
        className="mb-6"
      >
        <ul className="divide-y divide-line">
          {expected.map((e) => {
            const doc = imported.find((d) => d.id === e.importedDocId);
            return (
              <li key={e.key} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <span className={`text-xl ${doc ? 'text-ok' : 'text-line'}`}>{doc ? <LuCircleCheck /> : <LuBookOpen />}</span>
                <div className="min-w-0 flex-1">
                  <div className="code break-all text-[13px] font-semibold">{displayManual(e.names[0])}</div>
                  <div className="text-xs text-muted">
                    {e.organs.slice(0, 4).join(', ')}
                    {e.organs.length > 4 ? '…' : ''} · {e.systems.map((s) => s.toLowerCase()).join(', ')} · {e.prcActivities} attività PRC · {e.pdmRows} righe PdM
                  </div>
                </div>
                {doc ? (
                  <Link to={`/manuale/${doc.id}`} className="btn btn-ghost btn-sm">
                    {doc.fileName.slice(0, 28)}
                  </Link>
                ) : (
                  <Link to={`/documenti/nuovo?manual=${encodeURIComponent(e.key)}`} className="btn btn-ghost btn-sm">
                    <LuUpload /> Carica
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {others.length > 0 && (
        <Card title="Altri documenti importati" pad={false}>
          <ul className="divide-y divide-line">
            {others.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{d.title}</div>
                  <div className="text-xs text-muted">
                    {d.fileName} · {d.kind === 'organ' ? 'manuale organo (non associato al PdM)' : 'altro documento'} · importato {fmtDate(d.importedAt)}
                  </div>
                </div>
                <Link to={`/manuale/${d.id}`} className="btn btn-ghost btn-sm">
                  Dettagli
                </Link>
                <button className="btn btn-ghost btn-sm" onClick={() => confirm(`Eliminare “${d.title}” da questo dispositivo?`) && st.removeImported(d.id)}>
                  <LuTrash2 />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
