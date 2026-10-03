import React, { useMemo, useState } from 'react';
import { LuChevronDown, LuChevronRight, LuClipboardList, LuDownload, LuFilter, LuX } from 'react-icons/lu';
import { displayManual, PageHeader, STATUS_STYLE, StatusBadge } from '../components/ui';
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

const FILTERS = ['q', 'sistema', 'organo', 'tipo', 'os', 'compet', 'stato', 'manuale'] as const;
const LEVELS = ['C3', 'C4', 'C5', 'C6', 'C7'] as const;
const ORDER = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
// livello cumulativo: C5 = C2 + C3 + C4 + C5 (le righe senza codice compaiono sempre)
export function inLevel(iv: string | null, level: string) {
  const i = ORDER.indexOf(iv || '');
  return i < 0 || i <= ORDER.indexOf(level);
}

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
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const saved = (() => {
    try {
      return localStorage.getItem('prc-level') || 'C7';
    } catch {
      return 'C7';
    }
  })();
  const level = query.get('livello') && (LEVELS as readonly string[]).includes(query.get('livello')!) ? query.get('livello')! : saved;
  const f = Object.fromEntries(FILTERS.map((k) => [k, query.get(k) || ''])) as Record<(typeof FILTERS)[number], string>;
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(query);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k === 'livello')
      try {
        localStorage.setItem('prc-level', v);
      } catch {}
    navigate(`/prc?${p.toString()}`, true);
  };

  const opts = useMemo(() => {
    if (!model) return null;
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'it'));
    return {
      sistema: uniq(model.links.map((l) => l.system)),
      organo: uniq(model.links.map((l) => l.organ)),
      tipo: uniq(model.links.map((l) => activityType(l.prc.activity))),
      compet: uniq(model.links.map((l) => l.prc.compet)),
    };
  }, [model]);

  const rows = useMemo(() => {
    if (!model) return [];
    const nq = norm(f.q);
    return model.links.filter((l) => {
      if (!inLevel(l.prc.interval, level)) return false;
      if (nq && !norm(`${l.code} ${l.prc.activity} ${l.prc.component} ${l.organ} ${l.system}`).includes(nq)) return false;
      if (f.sistema && l.system !== f.sistema) return false;
      if (f.organo && l.organ !== f.organo) return false;
      if (f.tipo && activityType(l.prc.activity) !== f.tipo) return false;
      if (f.os && l.prc.os !== f.os) return false;
      if (f.compet && l.prc.compet !== f.compet) return false;
      if (f.stato && l.status !== f.stato) return false;
      if (f.manuale && manualState(l) !== f.manuale) return false;
      return true;
    });
  }, [model, query.toString(), level]);

  if (!model || !opts) return <Onboarding />;
  const active = FILTERS.filter((k) => f[k] && k !== 'q');
  const countFor = (lv: string) => model.links.filter((l) => inLevel(l.prc.interval, lv)).length;
  const groups = [...ORDER, 'altro']
    .map((iv) => ({ iv, items: rows.filter((l) => (ORDER.includes(l.prc.interval || '') ? l.prc.interval === iv : iv === 'altro')) }))
    .filter((g) => g.items.length);
  const included = ORDER.slice(0, ORDER.indexOf(level) + 1);

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

  return (
    <div>
      <PageHeader
        icon={<LuClipboardList />}
        title="Piano di manutenzione"
        subtitle="Scegli il livello: ogni livello comprende anche tutti quelli inferiori (C4 = C3 + C4, C5 = C3 + C4 + C5, …)."
        actions={
          <button className="btn btn-ghost" onClick={() => exportCsv(rows)}>
            <LuDownload /> Esporta CSV
          </button>
        }
      />

      {/* livello di manutenzione */}
      <div className="card mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <label className="block md:w-72">
            <span className="label">Livello di manutenzione</span>
            <div className="relative mt-1">
              <select
                className="input appearance-none !py-3 !pr-10 text-[17px] font-bold text-brand-700"
                value={level}
                onChange={(e) => set('livello', e.target.value)}
              >
                {LEVELS.map((lv) => (
                  <option key={lv} value={lv}>
                    {lv} – {INTERVALS[lv]} ({countFor(lv)})
                  </option>
                ))}
              </select>
              <LuChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-lg text-muted" />
            </div>
          </label>
          <div className="hidden flex-1 gap-1.5 rounded-xl bg-canvas p-1 md:flex">
            {LEVELS.map((lv) => (
              <button
                key={lv}
                onClick={() => set('livello', lv)}
                className={`flex-1 rounded-lg px-3 py-2 text-center transition ${lv === level ? 'bg-brand-600 text-white shadow-sm' : included.includes(lv) ? 'bg-brand-100 text-brand-700' : 'text-muted hover:bg-white'}`}
              >
                <span className="code block text-base font-bold">{lv}</span>
                <span className="block text-[11px] opacity-80">{countFor(lv)} attività</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted">Incluse:</span>
          {included.map((iv) => (
            <span key={iv} className="chip code bg-brand-50 text-brand-700">
              {iv}
            </span>
          ))}
          <span className="ml-1 font-semibold">= {rows.length} attività</span>
        </div>
      </div>

      {/* ricerca e altri filtri */}
      <div className="mb-5 flex flex-wrap gap-2">
        <input className="input min-w-[200px] flex-1" placeholder="Cerca codice, attività, componente…" value={f.q} onChange={(e) => set('q', e.target.value)} />
        <button className={`btn ${showF || active.length ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowF(!showF)}>
          <LuFilter /> Altri filtri{active.length ? ` (${active.length})` : ''}
        </button>
        {(active.length > 0 || f.q) && (
          <button className="btn btn-ghost" onClick={() => navigate(`/prc?livello=${level}`, true)}>
            <LuX /> Azzera
          </button>
        )}
      </div>
      {showF && (
        <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Sel k="sistema" label="Sistema" options={opts.sistema} />
          <Sel k="organo" label="Organo" options={opts.organo} />
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
      )}

      {/* elenco diviso per livello */}
      <div className="space-y-4">
        {groups.map((g) => {
          const isClosed = closed[g.iv];
          return (
            <section key={g.iv} className="card overflow-hidden">
              <button
                className="flex w-full items-center gap-3 border-b border-line bg-canvas/60 px-4 py-3 text-left sm:px-5"
                onClick={() => setClosed({ ...closed, [g.iv]: !isClosed })}
              >
                <span className="code rounded-lg bg-ink px-2 py-0.5 text-sm font-bold text-white">{g.iv === 'altro' ? '—' : g.iv}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{g.iv === 'altro' ? 'Senza codice di livello' : INTERVALS[g.iv]}</span>
                </span>
                <span className="text-sm text-muted">{g.items.length}</span>
                <LuChevronDown className={`text-muted transition ${isClosed ? '-rotate-90' : ''}`} />
              </button>
              {!isClosed && (
                <ul className="divide-y divide-line">
                  {g.items.map((l) => {
                    const o = l.organRefs.find((x) => !x.inGeneralManual) || l.organRefs[0];
                    return (
                      <li key={l.prc.id}>
                        <Link to={`/attivita/${l.prc.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-brand-50/40 sm:px-5">
                          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_STYLE[l.status].dot}`} title={STATUS_META[l.status].label} />
                          <span className="code mt-0.5 w-[68px] shrink-0 text-sm font-semibold text-brand-700">{l.code}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-medium leading-snug">{l.prc.activity}</span>
                            <span className="mt-0.5 block text-xs text-muted">
                              {l.organ}
                              {l.prc.compet ? ` · ${l.prc.compet}` : ''}
                              {l.generalRef ? ` · Man. Gen. ${l.generalRef.chapter} p. ${l.generalRef.itemPage || l.generalRef.page}` : ''}
                              {o && !o.inGeneralManual ? ` · ${displayManual(o.manualName).slice(0, 40)}${o.chapter ? ' cap. ' + o.chapter : ''}` : ''}
                            </span>
                          </span>
                          <span className="hidden sm:block">
                            <StatusBadge status={l.status} short />
                          </span>
                          <LuChevronRight className="mt-1 shrink-0 text-muted" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {!groups.length && <div className="card p-8 text-center text-sm text-muted">Nessuna attività con questi filtri.</div>}
      </div>
    </div>
  );
}
