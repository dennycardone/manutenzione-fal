import React, { useMemo, useState } from 'react';
import { LuChevronRight, LuClipboardList, LuDownload, LuFilter, LuX } from 'react-icons/lu';
import { displayManual, PageHeader, StatusBadge } from '../components/ui';
import { STATUS_META } from '../lib/engine';
import { INTERVALS, intervalRank, norm, OS_LABEL } from '../lib/text';
import { Link, navigate, useRoute } from '../lib/router';
import { useStore } from '../lib/store';
import type { ActivityLink, Status } from '../lib/types';
import { Onboarding } from './Dashboard';

export function activityType(a: string): string {
  const w = norm(a).split(' ')[0] || '';
  if (/^controll/.test(w) || w === 'ispezione' || w === 'esame') return 'Controllo';
  if (/^verific/.test(w)) return 'Verifica';
  if (/^pul/.test(w)) return 'Pulizia';
  if (/^sostitu|^cambi/.test(w)) return 'Sostituzione';
  if (/^lubrific|^ingrass/.test(w)) return 'Lubrificazione';
  if (/^misur/.test(w)) return 'Misurazione';
  if (/^scaric|^svuot|^drenag/.test(w)) return 'Scarico / svuotamento';
  return 'Altro';
}

const manualState = (l: ActivityLink) =>
  !l.organRefs.length ? 'nessuno' : l.organRefs.every((o) => o.inGeneralManual) ? 'generale' : l.organRefs.some((o) => !o.inGeneralManual && o.importedDocId) ? 'caricato' : 'mancante';

const FILTERS = ['q', 'sistema', 'organo', 'livello', 'tipo', 'os', 'compet', 'stato', 'manuale'] as const;

export function exportCsv(rows: ActivityLink[]) {
  const head = ['Codice', 'Attività', 'Componente', 'Sistema', 'Livello', 'Frequenza', 'OS', 'Competenza', 'Stato', 'N. Manuale Generale', 'Capitolo Manuale Generale', 'Pagina', 'Manuale organo', 'Capitolo organo', 'Pagina procedura', 'Anomalie', 'Pagina PRC'];
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((l) => {
    const o = l.organRefs[0];
    return [
      l.code,
      l.prc.activity,
      l.prc.component,
      l.system,
      l.prc.interval,
      INTERVALS[l.prc.interval || ''] || '',
      l.prc.os,
      l.prc.compet,
      STATUS_META[l.status].label,
      l.stadlerItem?.num,
      l.generalRef?.chapter,
      l.generalRef?.itemPage || l.generalRef?.page,
      o ? displayManual(o.manualName) : '',
      o?.chapter,
      o?.procedurePage,
      l.anomalies.map((a) => a.message).join(' | '),
      l.prc.page,
    ]
      .map(esc)
      .join(';');
  });
  const blob = new Blob(['﻿' + [head.map(esc).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'PRC_C7_collegamenti.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function PrcPage() {
  const { model } = useStore();
  const { query } = useRoute();
  const [showF, setShowF] = useState(false);
  const f = Object.fromEntries(FILTERS.map((k) => [k, query.get(k) || ''])) as Record<(typeof FILTERS)[number], string>;
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(query);
    if (v) p.set(k, v);
    else p.delete(k);
    navigate(`/prc?${p.toString()}`, true);
  };

  const opts = useMemo(() => {
    if (!model) return null;
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'it'));
    return {
      sistema: uniq(model.links.map((l) => l.system)),
      organo: uniq(model.links.map((l) => l.organ)),
      livello: uniq(model.links.map((l) => l.prc.interval)).sort((a, b) => intervalRank(a) - intervalRank(b)),
      tipo: uniq(model.links.map((l) => activityType(l.prc.activity))),
      compet: uniq(model.links.map((l) => l.prc.compet)),
    };
  }, [model]);

  const rows = useMemo(() => {
    if (!model) return [];
    const nq = norm(f.q);
    return model.links.filter((l) => {
      if (nq && !norm(`${l.code} ${l.prc.activity} ${l.prc.component} ${l.organ} ${l.system}`).includes(nq)) return false;
      if (f.sistema && l.system !== f.sistema) return false;
      if (f.organo && l.organ !== f.organo) return false;
      if (f.livello && l.prc.interval !== f.livello) return false;
      if (f.tipo && activityType(l.prc.activity) !== f.tipo) return false;
      if (f.os && l.prc.os !== f.os) return false;
      if (f.compet && l.prc.compet !== f.compet) return false;
      if (f.stato && l.status !== f.stato) return false;
      if (f.manuale && manualState(l) !== f.manuale) return false;
      return true;
    });
  }, [model, query.toString()]);

  if (!model || !opts) return <Onboarding />;
  const active = FILTERS.filter((k) => f[k]);
  const Sel = ({ k, label, options, render }: { k: string; label: string; options: string[]; render?: (v: string) => string }) => (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <select className="input mt-1" value={(f as any)[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">Tutti</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {render ? render(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
  const filters = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      <Sel k="sistema" label="Sistema" options={opts.sistema} />
      <Sel k="organo" label="Organo" options={opts.organo} />
      <Sel k="livello" label="Livello / frequenza" options={opts.livello} render={(v) => `${v} – ${INTERVALS[v] || ''}`} />
      <Sel k="tipo" label="Tipo attività" options={opts.tipo} />
      <Sel k="os" label="Categoria (OS)" options={['R', 'S', 'C']} render={(v) => `${v} – ${OS_LABEL[v]}`} />
      <Sel k="compet" label="Competenza" options={opts.compet} />
      <Sel k="stato" label="Stato documentazione" options={['complete', 'partial', 'verify', 'missing']} render={(v) => STATUS_META[v as Status].label} />
      <Sel
        k="manuale"
        label="Manuale organo"
        options={['caricato', 'mancante', 'generale', 'nessuno']}
        render={(v) => ({ caricato: 'Collegato e caricato', mancante: 'Indicato ma non caricato', generale: 'Procedura nel Manuale Generale', nessuno: 'Nessuno indicato' })[v] || v}
      />
    </div>
  );
  return (
    <div>
      <PageHeader
        icon={<LuClipboardList />}
        title="PRC C7 – Piano di manutenzione"
        subtitle="23.4.5/C7-000/MP rev. 01 · manutenzione biennale (200.000 km). Il C7 comprende anche le attività dei livelli inferiori (C2–C6): il prefisso del codice indica la periodicità propria."
        actions={
          <button className="btn btn-ghost" onClick={() => exportCsv(rows)}>
            <LuDownload /> Esporta CSV
          </button>
        }
      />
      <div className="card mb-4 p-4">
        <div className="flex flex-wrap gap-3">
          <input className="input min-w-[220px] flex-1" placeholder="Filtra per codice, attività, componente…" value={f.q} onChange={(e) => set('q', e.target.value)} />
          <button className="btn btn-ghost lg:hidden" onClick={() => setShowF(!showF)}>
            <LuFilter /> Filtri {active.filter((k) => k !== 'q').length ? `(${active.filter((k) => k !== 'q').length})` : ''}
          </button>
        </div>
        <div className={`mt-4 ${showF ? '' : 'hidden'} lg:block`}>{filters}</div>
        {active.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{rows.length} attività su {model.links.length}</span>
            <button className="chip hover:bg-canvas" onClick={() => navigate('/prc')}>
              <LuX /> Azzera filtri
            </button>
          </div>
        )}
      </div>

      {/* tabella (desktop) */}
      <div className="card hidden overflow-hidden md:block">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas/70 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Codice</th>
                <th className="px-4 py-3 font-semibold">Attività</th>
                <th className="px-4 py-3 font-semibold">Organo</th>
                <th className="px-4 py-3 font-semibold">Frequenza</th>
                <th className="px-4 py-3 font-semibold">Livello</th>
                <th className="px-4 py-3 font-semibold">Riferimento</th>
                <th className="px-4 py-3 font-semibold">Stato</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((l) => {
                const o = l.organRefs.find((x) => !x.inGeneralManual) || l.organRefs[0];
                return (
                  <tr key={l.prc.id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => navigate(`/attivita/${l.prc.id}`)}>
                    <td className="code whitespace-nowrap px-4 py-3 font-semibold text-brand-700">
                      {l.code}
                      {l.prc.highlight && <span className="ml-1 rounded bg-[#fff59d] px-1 text-[10px] text-ink">evid.</span>}
                    </td>
                    <td className="max-w-[420px] px-4 py-3">
                      <div className="line-clamp-2">{l.prc.activity}</div>
                      <div className="mt-0.5 truncate text-xs text-muted">{l.prc.component}</div>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <div className="line-clamp-2">{l.organ}</div>
                      <div className="text-xs text-muted">{l.system}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">{INTERVALS[l.prc.interval || ''] || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="chip code">{l.prc.interval}</span>
                      {l.prc.os && <span className="ml-1 text-xs text-muted" title={OS_LABEL[l.prc.os]}>{l.prc.os}</span>}
                    </td>
                    <td className="max-w-[230px] px-4 py-3 text-xs">
                      {l.generalRef ? (
                        <div>
                          Man. Gen. <b>{l.generalRef.chapter}</b> · p. {l.generalRef.itemPage || l.generalRef.page}
                        </div>
                      ) : (
                        <div className="text-miss">Man. Gen. non trovato</div>
                      )}
                      {o && !o.inGeneralManual && (
                        <div className={`truncate ${o.importedDocId ? 'text-ok' : 'text-muted'}`} title={displayManual(o.manualName)}>
                          {displayManual(o.manualName)}
                          {o.chapter ? ` · ${o.chapter}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={l.status} short />
                    </td>
                    <td className="px-3 py-3 text-muted">
                      <LuChevronRight />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && <div className="p-8 text-center text-sm text-muted">Nessuna attività con questi filtri.</div>}
      </div>

      {/* schede (smartphone) */}
      <ul className="space-y-2 md:hidden">
        {rows.map((l) => (
          <li key={l.prc.id}>
            <Link to={`/attivita/${l.prc.id}`} className="card block p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="code font-semibold text-brand-700">{l.code}</span>
                <StatusBadge status={l.status} short />
              </div>
              <div className="mt-1 text-sm font-medium">{l.prc.activity}</div>
              <div className="mt-1 text-xs text-muted">
                {l.organ} · {INTERVALS[l.prc.interval || '']}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
