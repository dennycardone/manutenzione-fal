import React, { useMemo, useState } from 'react';
import { LuArrowLeft, LuBookOpen, LuExternalLink, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { Card, displayManual, Empty, fmtDate, Kv, Modal, StatusBadge } from '../components/ui';
import { organReport } from '../lib/importer';
import { Link, navigate, useRoute, viewerHref } from '../lib/router';
import { useStore } from '../lib/store';
import type { Heading } from '../lib/types';
import { cmpChapter } from '../lib/text';
import { Onboarding } from './Dashboard';

export function ManualDetail() {
  const { parts } = useRoute();
  const st = useStore();
  const doc = st.imported.find((d) => d.id === parts[1]);
  const [editKeys, setEditKeys] = useState(false);
  const [edit, setEdit] = useState<{ h: Heading; idx: number } | null>(null);
  const [filter, setFilter] = useState('');
  const rep = useMemo(() => (doc && st.model ? organReport(doc, doc.manualKeys, st.model) : null), [doc, st.model]);
  if (!st.model) return <Onboarding />;
  if (!doc) return <Empty title="Manuale non trovato" action={<Link to="/manuali" className="btn btn-primary">Torna ai manuali</Link>} />;
  const acts = st.model.links.filter((l) => l.organRefs.some((o) => o.importedDocId === doc.id));
  const names = st.model.expectedManuals.filter((e) => doc.manualKeys.includes(e.key));
  const heads = doc.headings
    .map((h, idx) => ({ h, idx }))
    .filter(({ h }) => !filter || `${h.num} ${h.title}`.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.h.page - b.h.page || cmpChapter(a.h.num, b.h.num));

  const saveHeading = async (h: Heading, idx: number) => {
    const hs = [...doc.headings];
    if (idx >= 0) hs[idx] = h;
    else hs.push(h);
    await st.updateImported({ ...doc, headings: hs });
    setEdit(null);
  };

  return (
    <div>
      <button onClick={() => history.back()} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <LuArrowLeft /> Indietro
      </button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="label">{doc.kind === 'organ' ? 'Manuale organo' : 'Documento'}</div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <LuBookOpen className="text-brand-600" /> {doc.title}
          </h1>
          <div className="mt-1 text-sm text-muted">
            {doc.fileName} · {doc.pageCount} pagine · importato {fmtDate(doc.importedAt)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={viewerHref(doc.id, 1)} className="btn btn-primary">
            <LuExternalLink /> Apri
          </Link>
          <button
            className="btn btn-ghost"
            onClick={async () => {
              if (confirm(`Eliminare “${doc.title}” da questo dispositivo? I collegamenti torneranno “parziali”.`)) {
                await st.removeImported(doc.id);
                navigate('/manuali');
              }
            }}
          >
            <LuTrash2 /> Elimina
          </button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Collocazione nella catena" actions={<button className="text-sm font-semibold text-brand-600" onClick={() => setEditKeys(true)}>Modifica</button>}>
            <div className="space-y-4">
              <Kv k="Organo" v={doc.organName} />
              <Kv k="Sistema" v={doc.system} />
              <div>
                <div className="label">Corrisponde ai manuali del PdM</div>
                {names.length ? (
                  <ul className="mt-1 space-y-1">
                    {names.map((n) => (
                      <li key={n.key} className="code break-all text-[13px]">
                        {displayManual(n.names[0])}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 text-sm text-muted">Nessuno: il documento è consultabile ma non entra nella catena.</div>
                )}
              </div>
              {rep && names.length > 0 && (
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-canvas p-3 text-center">
                  <div>
                    <div className="text-xl font-bold text-ok">{rep.exact}</div>
                    <div className="text-[11px] text-muted">riconosciuti</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-part">{rep.parent}</div>
                    <div className="text-[11px] text-muted">parziali</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-warn">{rep.notFound.reduce((a, n) => a + n.codes.length, 0)}</div>
                    <div className="text-[11px] text-muted">da verificare</div>
                  </div>
                </div>
              )}
              {doc.textless && <div className="rounded-xl bg-warn-bg p-3 text-sm">PDF senza testo (scansione): indica a mano la pagina dei capitoli usati dal PdM.</div>}
            </div>
          </Card>
          {rep && rep.notFound.length > 0 && (
            <Card title="Capitoli indicati nel PdM ma non trovati">
              <ul className="space-y-2 text-sm">
                {rep.notFound.map((n, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      Cap. <b>{n.chapter ?? '—'}</b> · {n.organ}
                      <span className="block text-xs text-muted">{n.codes.join(', ')}</span>
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ h: { num: n.chapter || '', title: n.organ, page: 1, source: 'manual' }, idx: -1 })}>
                      <LuPlus /> Indica pagina
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title={`Attività PRC collegate · ${acts.length}`} pad={false}>
            <ul className="max-h-96 divide-y divide-line overflow-auto">
              {acts.map((l) => (
                <li key={l.prc.id}>
                  <Link to={`/attivita/${l.prc.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-canvas">
                    <span className="code w-16 shrink-0 font-semibold text-brand-700">{l.code}</span>
                    <span className="min-w-0 flex-1 truncate">{l.prc.activity}</span>
                    <StatusBadge status={l.status} short />
                  </Link>
                </li>
              ))}
              {!acts.length && <li className="px-5 py-4 text-sm text-muted">Nessuna attività collegata.</li>}
            </ul>
          </Card>
        </div>
        <Card
          className="lg:col-span-3"
          title={`Capitoli e paragrafi · ${doc.headings.length}`}
          actions={
            <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ h: { num: '', title: '', page: 1, source: 'manual' }, idx: -1 })}>
              <LuPlus /> Aggiungi
            </button>
          }
          pad={false}
        >
          <div className="border-b border-line p-3">
            <input className="input" placeholder="Filtra capitoli…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <ul className="scroll-thin max-h-[70vh] divide-y divide-line overflow-auto">
            {heads.map(({ h, idx }) => (
              <li key={idx} className="flex items-center gap-3 px-5 py-2 text-sm hover:bg-canvas">
                <Link to={viewerHref(doc.id, h.page, h.num)} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="code w-16 shrink-0 font-semibold">{h.num}</span>
                  <span className="min-w-0 flex-1 truncate">{h.title}</span>
                  <span className="shrink-0 text-xs text-muted">
                    p. {h.page}
                    {h.source === 'manual' ? ' · manuale' : ''}
                  </span>
                </Link>
                <button className="rounded p-1 text-muted hover:text-ink" onClick={() => setEdit({ h, idx })} aria-label="Modifica">
                  <LuPencil />
                </button>
              </li>
            ))}
            {!heads.length && <li className="px-5 py-6 text-sm text-muted">Nessun capitolo individuato.</li>}
          </ul>
        </Card>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit && edit.idx >= 0 ? 'Modifica capitolo' : 'Indica capitolo e pagina'}>
        {edit && <HeadingForm h={edit.h} onSave={(h) => saveHeading({ ...h, source: 'manual' }, edit.idx)} onDelete={edit.idx >= 0 ? async () => (await st.updateImported({ ...doc, headings: doc.headings.filter((_, i) => i !== edit.idx) }), setEdit(null)) : undefined} max={doc.pageCount} />}
      </Modal>
      <Modal open={editKeys} onClose={() => setEditKeys(false)} title="Corrispondenza con i manuali del PdM" wide>
        <KeysForm
          selected={doc.manualKeys}
          onSave={async (keys, organ, system) => {
            await st.updateImported({ ...doc, manualKeys: keys, organName: organ, system, kind: keys.length ? 'organ' : doc.kind });
            setEditKeys(false);
          }}
          organ={doc.organName || ''}
          system={doc.system || ''}
        />
      </Modal>
    </div>
  );
}

function HeadingForm({ h, onSave, onDelete, max }: { h: Heading; onSave: (h: Heading) => void; onDelete?: () => void; max: number }) {
  const [num, setNum] = useState(h.num);
  const [title, setTitle] = useState(h.title);
  const [page, setPage] = useState(h.page);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <label>
          <span className="label">Capitolo</span>
          <input className="input mt-1" value={num} onChange={(e) => setNum(e.target.value)} placeholder="es. 8.3" />
        </label>
        <label className="col-span-2">
          <span className="label">Pagina del PDF (1–{max})</span>
          <input className="input mt-1" type="number" min={1} max={max} value={page} onChange={(e) => setPage(Number(e.target.value))} />
        </label>
      </div>
      <label className="block">
        <span className="label">Titolo</span>
        <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <p className="text-xs text-muted">Il dato viene marcato come inserito dall’operatore.</p>
      <div className="flex justify-between gap-2">
        {onDelete ? (
          <button className="btn btn-ghost" onClick={onDelete}>
            <LuTrash2 /> Elimina
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={!num || !page} onClick={() => onSave({ num: num.trim(), title: title.trim(), page, source: 'manual' })}>
          Salva
        </button>
      </div>
    </div>
  );
}

function KeysForm({ selected, onSave, organ, system }: { selected: string[]; onSave: (k: string[], organ: string, system: string) => void; organ: string; system: string }) {
  const { model } = useStore();
  const [keys, setKeys] = useState(selected);
  const [o, setO] = useState(organ);
  const [s, setS] = useState(system);
  const expected = model!.expectedManuals.filter((e) => !e.inGeneral);
  return (
    <div>
      <ul className="scroll-thin max-h-[50vh] space-y-2 overflow-auto">
        {expected.map((e) => {
          const on = keys.includes(e.key);
          return (
            <li key={e.key}>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${on ? 'border-brand-500 bg-brand-50' : 'border-line'}`}>
                <input type="checkbox" className="mt-1" checked={on} onChange={() => setKeys(on ? keys.filter((k) => k !== e.key) : [...keys, e.key])} />
                <span>
                  <span className="code block break-all text-[13px] font-semibold">{displayManual(e.names[0])}</span>
                  <span className="text-xs text-muted">{e.organs.slice(0, 4).join(', ')}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label>
          <span className="label">Organo</span>
          <input className="input mt-1" value={o} onChange={(e) => setO(e.target.value)} />
        </label>
        <label>
          <span className="label">Sistema</span>
          <input className="input mt-1" value={s} onChange={(e) => setS(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button className="btn btn-primary" onClick={() => onSave(keys, o, s)}>
          Salva
        </button>
      </div>
    </div>
  );
}
