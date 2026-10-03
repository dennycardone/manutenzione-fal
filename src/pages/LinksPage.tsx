import React, { useMemo, useState } from 'react';
import { LuArrowRight, LuLink2 } from 'react-icons/lu';
import { Confidence, PageHeader, StatusBadge } from '../components/ui';
import { STATUS_META } from '../lib/engine';
import { Link, viewerHref } from '../lib/router';
import { useStore } from '../lib/store';
import { norm } from '../lib/text';
import type { Status } from '../lib/types';
import { Onboarding } from './Dashboard';

export function LinksPage() {
  const { model } = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [limit, setLimit] = useState(150);
  const recs = model?.linkRecords || [];
  const methods = useMemo(() => [...new Set(recs.map((r) => r.method))].sort(), [recs]);
  const rows = useMemo(() => {
    const nq = norm(q);
    return recs.filter((r) => (!status || r.status === status) && (!method || r.method === method) && (!nq || norm(`${r.from.label} ${r.to.label}`).includes(nq)));
  }, [recs, q, status, method]);
  if (!model) return <Onboarding />;
  const byStatus = (s: Status) => recs.filter((r) => r.status === s).length;
  return (
    <div>
      <PageHeader
        icon={<LuLink2 />}
        title="Rete dei collegamenti"
        subtitle="Ogni collegamento tra documenti, con il metodo con cui è stato stabilito (codice, testo, PdM, decisione dell’operatore) e il livello di affidabilità."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['complete', 'partial', 'verify', 'missing'] as Status[]).map((s) => (
          <button key={s} onClick={() => setStatus(status === s ? '' : s)} className={`card p-3 text-left ${status === s ? 'ring-2 ring-brand-200' : ''}`}>
            <div className="label">
              {STATUS_META[s].emoji} {s === 'complete' ? 'Certi' : STATUS_META[s].short}
            </div>
            <div className="text-2xl font-bold">{byStatus(s)}</div>
          </button>
        ))}
      </div>
      <div className="card mb-4 flex flex-wrap gap-3 p-4">
        <input className="input min-w-[200px] flex-1" placeholder="Cerca codice, capitolo, manuale…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-auto" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Tutti i metodi</option>
          {methods.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="card overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas/70 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Origine</th>
                <th className="px-2 py-3" />
                <th className="px-4 py-3">Destinazione</th>
                <th className="px-4 py-3">Metodo</th>
                <th className="px-4 py-3">Affidabilità</th>
                <th className="px-4 py-3">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.slice(0, limit).map((r) => (
                <tr key={r.id} className="hover:bg-canvas/60">
                  <td className="px-4 py-2.5">
                    <Link to={`/attivita/${r.prcId}`} className="font-medium text-brand-700 hover:underline">
                      {r.from.label}
                    </Link>
                  </td>
                  <td className="px-2 text-muted">
                    <LuArrowRight />
                  </td>
                  <td className="max-w-[420px] px-4 py-2.5">
                    {r.to.docId && r.to.page ? (
                      <Link to={viewerHref(r.to.docId, r.to.page)} className="hover:text-brand-700">
                        {r.to.label} <span className="text-xs text-muted">· pag. {r.to.page}</span>
                      </Link>
                    ) : (
                      <span>{r.to.label}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">{r.method}</td>
                  <td className="px-4 py-2.5">
                    <Confidence value={r.confidence} />
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.status} short />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > limit && (
          <div className="border-t border-line p-3 text-center">
            <button className="btn btn-ghost btn-sm" onClick={() => setLimit(limit + 300)}>
              Mostra altri ({rows.length - limit})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
