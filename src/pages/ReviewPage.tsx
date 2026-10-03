import React, { useState } from 'react';
import { LuShieldCheck } from 'react-icons/lu';
import { DecisionPanel } from '../components/DecisionPanel';
import { Card, Confidence, Empty, PageHeader, StatusBadge } from '../components/ui';
import { Link, useRoute, navigate, viewerHref } from '../lib/router';
import { useStore } from '../lib/store';
import type { ActivityLink } from '../lib/types';
import { AnomalyCard } from './ActivityPage';
import { Onboarding } from './Dashboard';

const TYPE_LABEL: Record<string, string> = {
  code_text_mismatch: 'Codice e testo non corrispondono',
  duplicate_code: 'Codice duplicato nel PRC',
  no_code: 'Riga senza codice',
  num_not_found: 'Numero non presente nel Manuale Generale',
  pdm_missing: 'Codice assente nel PdM',
  organ_chapter_not_found: 'Capitolo non trovato nel manuale organo',
};

export function ReviewPage() {
  const st = useStore();
  const { query } = useRoute();
  const tab = query.get('tab') || 'open';
  const type = query.get('tipo') || '';
  const [limit, setLimit] = useState(30);
  if (!st.model) return <Onboarding />;
  const links = st.model.links;
  const withErr = links.filter((l) => l.anomalies.some((a) => a.severity === 'error'));
  const lists: Record<string, ActivityLink[]> = {
    open: links.filter((l) => l.reviewOpen),
    ignored: withErr.filter((l) => l.decision?.action === 'ignore'),
    resolved: withErr.filter((l) => l.decision && l.decision.action !== 'ignore'),
  };
  const counts: Record<string, number> = {};
  for (const l of lists[tab] || []) for (const a of l.anomalies) if (a.severity === 'error') counts[a.type] = (counts[a.type] || 0) + 1;
  const list = (lists[tab] || []).filter((l) => !type || l.anomalies.some((a) => a.type === type && a.severity === 'error'));
  const setQ = (k: string, v: string) => {
    const p = new URLSearchParams(query);
    if (v) p.set(k, v);
    else p.delete(k);
    navigate(`/verifica?${p.toString()}`, true);
  };
  return (
    <div>
      <PageHeader
        icon={<LuShieldCheck />}
        title="Controllo collegamenti"
        subtitle="Riferimenti che l’app non può collegare con certezza. Per ognuno: documento e pagina d’origine, testo trovato, possibile destinazione e affidabilità. Le tue decisioni restano su questo dispositivo e si possono annullare."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ['open', 'Da verificare'],
          ['resolved', 'Confermati / modificati'],
          ['ignored', 'Ignorati'],
        ].map(([k, t]) => (
          <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setQ('tab', k === 'open' ? '' : k)}>
            {t} · {lists[k].length}
          </button>
        ))}
      </div>
      {Object.keys(counts).length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <button className={`chip ${!type ? 'border-brand-500 bg-brand-50 text-brand-700' : ''}`} onClick={() => setQ('tipo', '')}>
            Tutti
          </button>
          {Object.entries(counts).map(([k, n]) => (
            <button key={k} className={`chip ${type === k ? 'border-brand-500 bg-brand-50 text-brand-700' : ''}`} onClick={() => setQ('tipo', k)}>
              {TYPE_LABEL[k] || k} · {n}
            </button>
          ))}
        </div>
      )}
      {!list.length && (
        <Card>
          <Empty icon={<LuShieldCheck />} title={tab === 'open' ? 'Nessun collegamento da verificare' : 'Nessun elemento'}>
            {tab === 'open' ? 'Tutti i collegamenti rilevati sono coerenti o già decisi.' : ''}
          </Empty>
        </Card>
      )}
      <div className="space-y-4">
        {list.slice(0, limit).map((l) => {
          const sug = l.anomalies.find((a) => a.suggestion)?.suggestion;
          return (
            <Card key={l.prc.id}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Link to={`/attivita/${l.prc.id}`} className="code rounded-md bg-ink px-1.5 py-0.5 text-[12px] font-semibold text-white">
                      {l.code}
                    </Link>
                    <Link to={viewerHref('prc-c7', l.prc.page, l.code)} className="hover:text-brand-700">
                      Origine: PRC C7 · pagina {l.prc.page} · riga {l.prc.row}
                    </Link>
                  </div>
                  <div className="mt-1 font-semibold">{l.prc.activity}</div>
                  <div className="text-xs text-muted">{l.prc.component}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={l.status} short />
                  <Confidence value={l.confidence} />
                </div>
              </div>
              <div className="mb-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-line p-3 text-sm">
                  <div className="label">Collegamento per codice</div>
                  {l.stadlerItem ? (
                    <>
                      <div className="mt-0.5">
                        N. <b>{l.stadlerItem.num}</b> ({l.stadlerItem.interval}) – {l.stadlerItem.text}
                      </div>
                      <div className="text-xs text-muted">Manuale Generale cap. 23 · pag. {l.stadlerItem.page}</div>
                    </>
                  ) : (
                    <div className="mt-0.5 text-muted">Nessuna voce per il numero {l.prc.num ?? '—'}</div>
                  )}
                </div>
                <div className={`rounded-xl border p-3 text-sm ${sug ? 'border-brand-200 bg-brand-50/60' : 'border-line'}`}>
                  <div className="label">Possibile destinazione (per testo)</div>
                  {sug ? (
                    <>
                      <div className="mt-0.5">
                        N. <b>{sug.num}</b> – {sug.text}
                      </div>
                      <div className="mt-1">
                        <Confidence value={sug.score} />
                      </div>
                    </>
                  ) : (
                    <div className="mt-0.5 text-muted">Nessuna corrispondenza abbastanza sicura</div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {l.anomalies
                  .filter((a) => a.severity === 'error')
                  .map((a, i) => (
                    <AnomalyCard key={i} a={a} />
                  ))}
                {l.anomalies.some((a) => a.type === 'organ_chapter_not_found') ? (
                  <div className="text-sm">
                    Per indicare la pagina corretta apri il manuale:{' '}
                    {[...new Set(l.organRefs.filter((o) => o.importedDocId && !o.procedurePage).map((o) => o.importedDocId!))].map((id) => (
                      <Link key={id} to={`/manuale/${id}`} className="font-semibold text-brand-600">
                        {st.docTitle(id)}
                      </Link>
                    ))}
                  </div>
                ) : null}
                <DecisionPanel link={l} />
              </div>
            </Card>
          );
        })}
      </div>
      {list.length > limit && (
        <div className="mt-4 text-center">
          <button className="btn btn-ghost" onClick={() => setLimit(limit + 30)}>
            Mostra altri ({list.length - limit})
          </button>
        </div>
      )}
    </div>
  );
}
