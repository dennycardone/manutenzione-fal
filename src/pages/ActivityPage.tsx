import React, { useEffect, useState } from 'react';
import { LuArrowLeft, LuCircleAlert, LuFileText, LuInfo, LuStar, LuTriangleAlert, LuWrench } from 'react-icons/lu';
import { DecisionPanel } from '../components/DecisionPanel';
import { bestTarget, PathTimeline } from '../components/PathTimeline';
import { Card, Confidence, Empty, Kv, StatusBadge } from '../components/ui';
import { STATUS_META } from '../lib/engine';
import { INTERVALS, OS_LABEL } from '../lib/text';
import { Link, useRoute, viewerHref } from '../lib/router';
import { useStore } from '../lib/store';
import type { Anomaly } from '../lib/types';
import { Onboarding } from './Dashboard';

const SEV = {
  error: { icon: <LuCircleAlert />, cls: 'border-warn/30 bg-warn-bg text-warn', label: 'Da verificare' },
  warning: { icon: <LuTriangleAlert />, cls: 'border-[#f1dc9b] bg-part-bg text-part', label: 'Attenzione' },
  info: { icon: <LuInfo />, cls: 'border-brand-100 bg-brand-50 text-brand-700', label: 'Nota' },
};

export function AnomalyCard({ a }: { a: Anomaly }) {
  const { docTitle } = useStore();
  const s = SEV[a.severity];
  return (
    <div className={`rounded-xl border p-4 ${s.cls}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5">{s.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider">{s.label}</div>
          <div className="mt-0.5 text-sm text-ink">{a.message}</div>
          {a.evidence.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {a.evidence.map((e, i) => (
                <li key={i}>
                  <Link to={viewerHref(e.docId, e.page, undefined, e.label)} className="block rounded-lg bg-white/80 px-3 py-2 text-xs text-ink hover:bg-white">
                    <span className="font-semibold text-brand-700">
                      {e.label} · {docTitle(e.docId).split('(')[0].trim()} · pag. {e.page}
                    </span>
                    <span className="mt-0.5 block text-muted">“{e.text}”</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActivityPage() {
  const { parts } = useRoute();
  const st = useStore();
  const { model } = st;
  const id = parts[1];
  const l = model?.byId.get(id);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (l) {
      st.pushRecent(l.prc.id);
      setNote(st.notes[l.prc.id] || '');
    }
  }, [id, !!l]);
  if (!model) return <Onboarding />;
  if (!l) return <Empty title="Attività non trovata" action={<Link to="/prc" className="btn btn-primary">Torna al PRC C7</Link>} />;
  const p = l.prc;
  const t = bestTarget(l);
  const fav = st.favorites.includes(p.id);
  const errors = l.anomalies.filter((a) => a.severity === 'error');
  const others = l.anomalies.filter((a) => a.severity !== 'error');
  return (
    <div>
      <button onClick={() => history.back()} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <LuArrowLeft /> Indietro
      </button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="code rounded-lg bg-ink px-2 py-1 text-sm font-bold text-white">{l.code}</span>
            <StatusBadge status={l.status} />
            {p.highlight && <span className="chip bg-[#fff59d]">Riga evidenziata nel PRC</span>}
          </div>
          <h1 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">{p.activity}</h1>
          <div className="mt-1 text-sm text-muted">
            {l.system} · {p.component}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => st.toggleFavorite(p.id)} title={fav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}>
            <LuStar className={fav ? 'fill-[#e0a800] text-[#e0a800]' : ''} />
          </button>
          <Link to={viewerHref('prc-c7', p.page, l.code, l.code)} className="btn btn-ghost">
            <LuFileText /> Vedi nel PRC
          </Link>
          {t && (
            <Link to={t.to} className="btn btn-primary">
              <LuWrench /> {t.label}
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          <Card title="Percorso documentale" actions={<Confidence value={l.confidence} />}>
            <PathTimeline link={l} />
            <p className="mt-2 text-xs text-muted">{STATUS_META[l.status].desc}</p>
          </Card>
          {(errors.length > 0 || l.decision) && (
            <Card title="Collegamento da verificare">
              <div className="space-y-3">
                {errors.map((a, i) => (
                  <AnomalyCard key={i} a={a} />
                ))}
                <DecisionPanel link={l} />
              </div>
            </Card>
          )}
          {others.length > 0 && (
            <Card title="Note sui documenti">
              <div className="space-y-3">
                {others.map((a, i) => (
                  <AnomalyCard key={i} a={a} />
                ))}
              </div>
            </Card>
          )}
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Informazioni attività">
            <div className="grid grid-cols-2 gap-4">
              <Kv k="Codice PRC" v={l.code} mono />
              <Kv k="N. attività" v={p.num} mono />
              <Kv k="Frequenza" v={INTERVALS[p.interval || ''] || p.interval} />
              <Kv k="Livello manutentivo" v={p.interval} />
              <Kv k="Categoria (OS)" v={p.os ? `${p.os} – ${OS_LABEL[p.os] || ''}` : null} />
              <Kv k="Competenza" v={p.compet} />
              <div className="col-span-2">
                <Kv k="Organo interessato" v={l.organ} />
              </div>
              <div className="col-span-2">
                <Kv k="Componente (PRC)" v={p.component} />
              </div>
              {(p.report || p.tools) && (
                <>
                  <div className="col-span-2">
                    <Kv k="Report / disegno" v={p.report} />
                  </div>
                  <div className="col-span-2">
                    <Kv k="Strumenti di misura" v={p.tools} />
                  </div>
                </>
              )}
            </div>
          </Card>
          <Card title="Testi a confronto">
            <div className="space-y-3 text-sm">
              <div>
                <div className="label">PRC C7 · pag. {p.page}</div>
                <div className="mt-0.5">{p.activity}</div>
              </div>
              {l.pdmGeneral[0] && (
                <div>
                  <div className="label">PdM {l.pdmGeneral[0].codeRaw} · pag. {l.pdmGeneral[0].page}</div>
                  <div className="mt-0.5">{l.pdmGeneral[0].desc}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {[l.pdmGeneral[0].category, l.pdmGeneral[0].mestiere, l.pdmGeneral[0].compet, l.pdmGeneral[0].time, l.pdmGeneral[0].km && `${l.pdmGeneral[0].km} km`].filter(Boolean).join(' · ')}
                  </div>
                </div>
              )}
              {l.stadlerItem && (
                <div>
                  <div className="label">
                    Manuale Generale N. {l.stadlerItem.num} ({l.stadlerItem.interval}) · cap. 23 pag. {l.stadlerItem.page}
                  </div>
                  <div className="mt-0.5">{l.stadlerItem.text}</div>
                </div>
              )}
              {l.stadlerTableItems.slice(0, 2).map((ti) => (
                <div key={ti.id}>
                  <div className="label">
                    Manuale Generale cap. {ti.section} · pag. {ti.page}
                  </div>
                  <div className="mt-0.5">{ti.text}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Note dell’operatore">
            <textarea className="input min-h-[90px]" placeholder="Annotazioni personali su questa attività (restano su questo dispositivo)" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => st.setNote(p.id, note)} />
          </Card>
        </div>
      </div>
    </div>
  );
}
